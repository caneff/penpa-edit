// The Board card's zoom on solve.html (#200): the card follows the cursor while zoomed, - and + stop at the limits, a zoom the
// solver set survives a layout change until Fit, and a selected cell is filled. Read through the card's scroll position, the
// buttons' disabled states, the canvas size and the canvas's pixels.
import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { afterChange, boardCanvasInPage, linkFromNewBoard, openSolvePage, useBrowser } from './page.mjs'
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

describe('+ and -', () => {
  it('centre the view on a cursor the solver moved', async () => {
    const { context, page } = await openSudoku()
    try {
      await page.evaluate(() => { engine.setTool({ mode: 'sudoku', submode: '1' }); pu.selection = [pu.centerlist[0]]; pu.cursol = pu.centerlist[0] })
      for (let i = 0; i < 4; i++) { await page.keyboard.press('ArrowRight'); await page.keyboard.press('ArrowDown') }
      for (let i = 0; i < 6; i++) await button(page, 'Zoom in').click()
      const offCentre = async () => {
        const { left, right, top, bottom } = await cursorAgainstBody(page)
        return Math.max(Math.abs(left - right), Math.abs(top - bottom))
      }
      assert.equal(await settle(async () => (await offCentre()) <= 3, true), true, `${await offCentre()} px off centre`)
    } finally {
      await context.close()
    }
  })

  it('keep the scroll of a board the solver has not touched the cursor of', async () => {
    const { context, page } = await openSudoku()
    try {
      for (let i = 0; i < 4; i++) await button(page, 'Zoom in').click()
      const scrolled = await page.evaluate((selector) => {
        const body = document.querySelector(`${selector} .ui-body`)
        body.scrollTo(body.scrollWidth, body.scrollHeight)
        return [body.scrollLeft, body.scrollTop]
      }, BOARD)
      assert.ok(scrolled[0] > 0 && scrolled[1] > 0, `the board overflows the card (${scrolled})`)
      await button(page, 'Zoom in').click()
      const after = await page.evaluate((selector) => { const body = document.querySelector(`${selector} .ui-body`); return [body.scrollLeft, body.scrollTop] }, BOARD)
      assert.ok(after[0] > 0 && after[1] > 0, `the scroll stays near the corner it was at (${scrolled} -> ${after})`)
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
      // A "nothing happened" check: the card's resize observer runs within a frame, so after two the zoom would be gone.
      await afterChange(page)
      assert.equal(await cellSize(page), zoomed, 'a smaller window keeps the zoom')
      await button(page, 'Fit').click()
      assert.equal(await settle(async () => (await cellSize(page)) !== zoomed, true), true, 'Fit refits')
      // Fit also hands the size back to the card: a much smaller window now shrinks it.
      const refitted = await cellSize(page)
      await page.setViewportSize({ width: width - 300, height: height - 250 })
      assert.equal(await settle(async () => (await cellSize(page)) < refitted, true), true, 'after Fit the board follows the card again')
    } finally {
      await context.close()
    }
  })
})

describe('a selected cell', () => {
  // A faint grey: the fill moves a channel of the cell's pixel by at least MIN and no channel by more than MAX.
  // The window brackets the fill's alpha in docs/js/engine_bridge.js (0.05 x (255 - 110) = about 7 on white): change one, change both.
  const FILL_MIN_SHIFT = 5
  const FILL_MAX_SHIFT = 10
  // The most the three channels of the filled pixel may differ from each other: grey has no hue.
  const FILL_MAX_HUE = 2
  // Where the sampled pixel lies on the line from the cell's first corner (0) to its centre (1): inside the outline and its glow.
  const SAMPLE_TOWARD_CENTRE = 0.6

  for (const theme of ['light', 'dark']) {
    it(`has an extremely light grey fill in the ${theme} theme`, async () => {
      const { context, page } = await openSudoku()
      try {
        // A pixel of the first cell inside its outline, read before and after the cell is selected.
        await page.addScriptTag({ content: `window.__boardCanvas = ${boardCanvasInPage}` })
        const corner = () => page.evaluate((toward) => {
          const canvas = window.__boardCanvas()
          const index = pu.centerlist[0]
          const point = pu.point[pu.point[index].surround[0]]
          const scale = canvas.width / canvas.getBoundingClientRect().width
          const cell = pu.point[index]
          const x = Math.round((point.x * (1 - toward) + cell.x * toward) * scale)
          const y = Math.round((point.y * (1 - toward) + cell.y * toward) * scale)
          return [...canvas.getContext('2d').getImageData(x, y, 1, 1).data]
        }, SAMPLE_TOWARD_CENTRE)
        await page.evaluate((name) => { engine.setTheme(name); engine.setTool({ mode: 'sudoku', submode: '1' }); pu.selection = []; pu.redraw() }, theme)
        assert.equal(await settle(() => page.evaluate(() => document.documentElement.classList.contains('wa-dark')), theme === 'dark'), theme === 'dark', `the page is in the ${theme} theme`)
        await page.evaluate(() => { pu.redraw() })
        const before = await corner()
        await page.evaluate(() => { pu.selection = [pu.centerlist[0]]; pu.cursol = pu.centerlist[0]; pu.redraw() })
        const after = await corner()
        // Penpa+ paints the board's paper white in both themes, so the fill only darkens it, a little and with no hue.
        const shift = after.slice(0, 3).map((c, i) => c - before[i])
        assert.ok(Math.min(...shift) <= -FILL_MIN_SHIFT, `the fill shows (shift ${shift})`)
        assert.ok(Math.max(...shift.map(Math.abs)) <= FILL_MAX_SHIFT, `the fill stays faint (shift ${shift})`)
        assert.ok(Math.max(...after.slice(0, 3)) - Math.min(...after.slice(0, 3)) <= FILL_MAX_HUE, `the fill is grey, not blue or pink (${after})`)
      } finally {
        await context.close()
      }
    })
  }
})
