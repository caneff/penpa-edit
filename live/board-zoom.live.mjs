// The Board card's zoom on solve.html (#200): the card follows the cursor while zoomed, - and + stop at the limits, a zoom the
// solver set survives a layout change until Fit, and a selected cell is filled. Read through the card's scroll position, the
// buttons' disabled states, the canvas size and the canvas's pixels.
import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { linkFromNewBoard, openSolvePage, useBrowser } from './page.mjs'
import { settle } from './settle.mjs'
import { IMPORTS } from './tier-c-puzzles.mjs'

const browser = useBrowser()

const SUDOKU = IMPORTS['sudoku-9x9']
const BOARD = 'section[aria-label="Board"]'

// Runs in the page: the solve link of a puzzle opened from a puzz.link address.
function solveLinkOf (url) {
  import_url(url)
  const link = pu.maketext_solve()
  return link.slice(link.indexOf('#'))
}

let sudokuLink
const openSudoku = async () => {
  sudokuLink ??= await linkFromNewBoard(browser(), solveLinkOf, SUDOKU)
  return openSolvePage(browser(), sudokuLink, { served: true })
}

const button = (page, name) => page.locator(BOARD).getByRole('button', { name })
const cellSize = (page) => page.evaluate(() => engine.getState().cellSize)

// Where the cursor cell lies against the card body's visible box, in CSS px (negative or over the box means hidden).
const cursorAgainstBody = (page) => page.evaluate((selector) => {
  const body = document.querySelector(`${selector} .ui-body`)
  const rect = engine.getFocusRect()
  const box = body.getBoundingClientRect()
  return {
    left: rect.left - box.left,
    top: rect.top - box.top,
    right: box.left + body.clientWidth - rect.right,
    bottom: box.top + body.clientHeight - rect.bottom
  }
}, BOARD)

const isVisible = (gaps) => Object.values(gaps).every((gap) => gap >= -1)

describe('the Board card follows the cursor while zoomed', () => {
  it('keeps the cursor cell in view after + six times and an arrow to the last cell', async () => {
    const { context, page } = await openSudoku()
    try {
      await page.evaluate(() => { engine.setTool({ mode: 'sudoku', submode: '1' }); pu.selection = [pu.centerlist[0]]; pu.cursol = pu.centerlist[0] })
      for (let i = 0; i < 6; i++) await button(page, 'Zoom in').click()
      for (let i = 0; i < 8; i++) { await page.keyboard.press('ArrowRight'); await page.keyboard.press('ArrowDown') }
      const gaps = () => cursorAgainstBody(page)
      assert.equal(await settle(async () => isVisible(await gaps()), true), true, JSON.stringify(await gaps()))
    } finally {
      await context.close()
    }
  })
})

describe('the zoom buttons', () => {
  it('disable at the cell-size limits and wake again off them', async () => {
    const { context, page } = await openSudoku()
    try {
      const { min, max } = await page.evaluate(() => engine.CELL_SIZE_RANGE)
      const out = button(page, 'Zoom out')
      const zoomIn = button(page, 'Zoom in')
      for (let i = 0; i < 80 && await out.isEnabled(); i++) await out.click()
      assert.equal(await cellSize(page), min)
      assert.equal(await out.isDisabled(), true, 'minus is disabled at the smallest cell')
      assert.equal(await zoomIn.isEnabled(), true)
      for (let i = 0; i < 80 && await zoomIn.isEnabled(); i++) await zoomIn.click()
      assert.equal(await cellSize(page), max)
      assert.equal(await zoomIn.isDisabled(), true, 'plus is disabled at the largest cell')
      assert.equal(await out.isEnabled(), true)
    } finally {
      await context.close()
    }
  })
})

describe('a zoom the solver set', () => {
  it('survives a 6 px window resize, and Fit refits', async () => {
    const { context, page } = await openSudoku()
    try {
      const fitted = await cellSize(page)
      await button(page, 'Zoom in').click()
      await button(page, 'Zoom in').click()
      const zoomed = await cellSize(page)
      assert.notEqual(zoomed, fitted)
      const { width, height } = page.viewportSize()
      await page.setViewportSize({ width: width - 6, height })
      await page.evaluate(() => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve))))
      assert.equal(await cellSize(page), zoomed, 'a smaller window keeps the zoom')
      await button(page, 'Fit').click()
      assert.equal(await settle(async () => (await cellSize(page)) !== zoomed, true), true, 'Fit refits')
    } finally {
      await context.close()
    }
  })
})

describe('a selected cell', () => {
  it('has a blue translucent fill, not the conflict pink', async () => {
    const { context, page } = await openSudoku()
    try {
      // The cell's top-left corner pixel, just inside its edge, before and after it is selected.
      const corner = () => page.evaluate(() => {
        const canvas = [...document.querySelectorAll('canvas')].find((c) => c.getBoundingClientRect().width > 0)
        const index = pu.centerlist[0]
        const point = pu.point[pu.point[index].surround[0]]
        const scale = canvas.width / canvas.getBoundingClientRect().width
        const cell = pu.point[index]
        const x = Math.round((point.x * 0.5 + cell.x * 0.5) * scale)
        const y = Math.round((point.y * 0.5 + cell.y * 0.5) * scale)
        return [...canvas.getContext('2d').getImageData(x, y, 1, 1).data]
      })
      await page.evaluate(() => { engine.setTool({ mode: 'sudoku', submode: '1' }); pu.selection = []; pu.redraw() })
      const [r0, g0, b0] = await corner()
      await page.evaluate(() => { pu.selection = [pu.centerlist[0]]; pu.cursol = pu.centerlist[0]; pu.redraw() })
      const [r, g, b] = await corner()
      assert.notDeepEqual([r, g, b], [r0, g0, b0], 'the selected cell is drawn differently')
      assert.ok(b > r + 10, `the fill is bluer than red (${r}, ${g}, ${b})`)
    } finally {
      await context.close()
    }
  })
})
