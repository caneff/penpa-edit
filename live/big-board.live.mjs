// On `solve.html` the board grows past Penpa+'s 90 px per cell to fill a large Board card (#164), and no size over 90 reaches
// `index.html`, which clamps it and shows its max-size message. Penpa+'s own page keeps its cap and its message.
import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { boardAgainstCard, newBoardSolveLink, openPenpa, openSolvePage, useBrowser } from './page.mjs'
import { settle } from './settle.mjs'

const browser = useBrowser()

const BIG_DESK = { viewport: { width: 2560, height: 1360 } }
const PENPA_MAX = 90
const MAX_SIZE_MESSAGE = '12-90'
const openBig = async () => openSolvePage(browser(), await newBoardSolveLink(browser()), { served: true, contextOptions: BIG_DESK })
const cellSize = (page) => page.evaluate(() => engine.getState().cellSize)
const maxSizeMessages = (page) => page.locator('.swal2-popup', { hasText: MAX_SIZE_MESSAGE }).count()
const cardBodyHeight = (page) => page.evaluate(() => document.querySelector('section[aria-label="Board"] .ui-body').clientHeight)

describe('solve.html with a big Board card', () => {
  it('fits a 6x6 board to the card past 90 px per cell, and refits after a resize', async () => {
    const { context, page } = await openBig()
    try {
      const fits = async () => { const r = await boardAgainstCard(page); return r.inside && r.h > 6 * PENPA_MAX && r.h > (await cardBodyHeight(page)) * 0.8 }
      assert.equal(await settle(fits, true), true, 'the board fills the card')
      assert.ok(await cellSize(page) > PENPA_MAX, 'the cell size is past 90')
      const before = await boardAgainstCard(page)
      await page.setViewportSize({ width: 1700, height: 1000 })
      const smaller = async () => { const r = await boardAgainstCard(page); return r.inside && r.h < before.h }
      assert.equal(await settle(smaller, true), true, 'a smaller window, a smaller board')
      await page.setViewportSize(BIG_DESK.viewport)
      assert.equal(await settle(fits, true), true, 'the board fills the card again')
      assert.equal(await maxSizeMessages(page), 0, 'no max-size message')
    } finally {
      await context.close()
    }
  })

  it('zooms in past 90 up to CELL_SIZE_RANGE.max and no further, without a message', async () => {
    const { context, page } = await openBig()
    try {
      const sizes = await page.evaluate(() => {
        const { max } = engine.CELL_SIZE_RANGE
        engine.setCellSize(91)
        const past = engine.getState().cellSize
        engine.setCellSize(max)
        const top = engine.getState().cellSize
        let over = false
        try { engine.setCellSize(max + 1) } catch { over = true }
        return { max, past, top, over }
      })
      assert.deepEqual(sizes, { max: sizes.max, past: 91, top: sizes.max, over: true })
      assert.ok(sizes.max > PENPA_MAX)
      assert.equal(await maxSizeMessages(page), 0, 'no max-size message')
    } finally {
      await context.close()
    }
  })

  it('leaves index.html a cell size of 12-90 and no max-size message after a large fit', async () => {
    const { context, page } = await openBig()
    try {
      await settle(async () => (await cellSize(page)) > PENPA_MAX, true)
      const saved = await page.evaluate(() => {
        UserSettings.attemptSave()
        return { size: pu.size, cookie: document.cookie.split('; ').find((c) => c.startsWith('displaysize=')) ?? null }
      })
      assert.equal(saved.cookie !== null, true, 'solve.html saves the size, so the check below reads something')
      assert.ok(Number(saved.cookie.split('=')[1]) <= PENPA_MAX, `the cookie holds ${saved.cookie}`)
      assert.ok(saved.size > PENPA_MAX, 'the page itself still draws the large size')
      await page.getByRole('button', { name: 'Open in Penpa+', exact: true }).click()
      await page.waitForFunction(() => typeof pu !== 'undefined' && !document.querySelector('section[aria-label="Board"]'))
      const size = await settle(() => page.evaluate(() => UserSettings.displaysize), (v) => v >= 12 && v <= PENPA_MAX)
      assert.ok(size >= 12 && size <= PENPA_MAX, `index.html draws at ${size}`)
      assert.equal(await maxSizeMessages(page), 0, 'index.html shows no max-size message')
    } finally {
      await context.close()
    }
  })

  it('opens a link written at a large size on index.html with no max-size message', async () => {
    const { context, page } = await openBig()
    let link
    try {
      await settle(async () => (await cellSize(page)) > PENPA_MAX, true)
      link = await page.evaluate(() => { const url = pu.maketext_solve(); return url.slice(url.indexOf('#')) })
    } finally {
      await context.close()
    }
    const opened = await openPenpa(browser(), link, { served: true })
    try {
      assert.equal(await maxSizeMessages(opened.page), 0, 'no max-size message')
      const size = await opened.page.evaluate(() => UserSettings.displaysize)
      assert.ok(size >= 12 && size <= PENPA_MAX, `index.html draws at ${size}`)
    } finally {
      await opened.context.close()
    }
  })
})

describe('Penpa+\'s own page', () => {
  it('still caps the cell size at 90 and shows its message', async () => {
    const { context, page } = await openPenpa(browser(), '', { served: true })
    try {
      await page.evaluate(() => { UserSettings.displaysize = 200 })
      assert.equal(await page.evaluate(() => UserSettings.displaysize), PENPA_MAX)
      assert.equal(await maxSizeMessages(page), 1)
    } finally {
      await context.close()
    }
  })
})
