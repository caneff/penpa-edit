// The desk of `solve.html` (#101): every card moves and resizes, the layout is kept across reloads and puzzles' shared,
// every card stays inside the window, and the board refits its card or zooms inside it. The UI is found by role and
// accessible name or test id; the board's size is what its canvas draws.
import assert from 'node:assert/strict'
import { afterEach, beforeEach, describe, it } from 'node:test'
import { AKARI_SOLVE, boardAgainstCard, openPenpa, useBrowser } from './page.mjs'
import { settle } from './settle.mjs'

const browser = useBrowser()

const VIEWPORT = { width: 1400, height: 900 }
const CARDS = ['Board', 'Mouse', 'Rules', 'Pinned', 'Mode', 'Recent']

const card = (page, name) => page.getByRole('region', { name })

async function boxOf (page, name) {
  const box = await card(page, name).boundingBox()
  return { x: Math.round(box.x), y: Math.round(box.y), width: Math.round(box.width), height: Math.round(box.height) }
}

async function drag (page, from, dx, dy) {
  await page.mouse.move(from.x, from.y)
  await page.mouse.down()
  await page.mouse.move(from.x + dx, from.y + dy, { steps: 5 })
  await page.mouse.up()
}

async function headCentre (page, name) {
  const box = await card(page, name).getByRole('heading', { name }).boundingBox()
  return { x: box.x + box.width / 2, y: box.y + box.height / 2 }
}

async function cornerCentre (page, name) {
  const box = await card(page, name).getByTestId('resize-corner').boundingBox()
  return { x: box.x + box.width / 2, y: box.y + box.height / 2 }
}

// The cards that stick out of the window, by name.
async function cardsOutside (page) {
  const size = page.viewportSize()
  const outside = []
  for (const name of CARDS) {
    const box = await boxOf(page, name)
    if (box.x < 0 || box.y < 0 || box.x + box.width > size.width || box.y + box.height > size.height) outside.push(name)
  }
  return outside
}

describe('the desk', () => {
  let opened
  let page
  beforeEach(async () => {
    opened = await openPenpa(browser(), AKARI_SOLVE, { solve: true, contextOptions: { viewport: VIEWPORT } })
    page = opened.page
    await card(page, 'Board').waitFor()
    await settle(async () => (await boardAgainstCard(page)).inside, true)
  })
  afterEach(async () => { await opened?.context.close() })

  it('keeps a moved and resized card after a reload, and Reset layout puts it back', async () => {
    const start = await boxOf(page, 'Rules')
    await drag(page, await headCentre(page, 'Rules'), 120, 70)
    await drag(page, await cornerCentre(page, 'Rules'), 40, 30)
    const changed = await boxOf(page, 'Rules')
    assert.notDeepEqual(changed, start)
    assert.equal(changed.x, start.x + 120)
    assert.equal(changed.y, start.y + 70)

    await page.reload()
    await card(page, 'Rules').waitFor()
    assert.deepEqual(await settle(() => boxOf(page, 'Rules'), changed), changed)

    await page.getByRole('button', { name: 'Reset layout' }).click()
    assert.deepEqual(await settle(() => boxOf(page, 'Rules'), start), start)
  })

  it('keeps every card inside the window after it shrinks', async () => {
    await drag(page, await headCentre(page, 'Rules'), 300, 400)
    for (const size of [{ width: 800, height: 520 }, { width: 640, height: 420 }]) {
      await page.setViewportSize(size)
      assert.deepEqual(await settle(() => cardsOutside(page), []), [], `in ${size.width}x${size.height}`)
    }
  })

  it('refits the board when its card resizes, and + then − zooms it with the card scrolling', async () => {
    await drag(page, await cornerCentre(page, 'Board'), -200, -150)
    const fitted = await settle(async () => { const r = await boardAgainstCard(page); return r.inside }, true)
    assert.equal(fitted, true, 'the smaller card still holds the whole board')
    const small = await boardAgainstCard(page)
    assert.ok(small.cardW < 900)

    const scrolls = () => page.evaluate(() => {
      const body = document.querySelector('section[aria-label="Board"] .ui-body')
      return body.scrollWidth > body.clientWidth || body.scrollHeight > body.clientHeight
    })
    assert.equal(await scrolls(), false)
    const zoomIn = page.getByRole('button', { name: 'Zoom in' })
    await zoomIn.click()
    await zoomIn.click()
    const bigger = await settle(async () => (await boardAgainstCard(page)).w > small.w, true)
    assert.equal(bigger, true, 'the board grows')
    assert.equal(await scrolls(), true, 'the card scrolls')
    const grown = (await boardAgainstCard(page)).w

    await page.getByRole('button', { name: 'Zoom out' }).click()
    assert.equal(await settle(async () => { const w = (await boardAgainstCard(page)).w; return w < grown && w > small.w }, true), true)
  })
})
