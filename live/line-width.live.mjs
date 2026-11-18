// Line widths on solve.html grow with the cell size past Penpa+'s normal 38 px a cell (#330): read as the run of line pixels
// across a solver's line on the board's canvas, and as the width Penpa+'s line setter leaves on a context.
import assert from 'node:assert/strict'
import { before, describe, it } from 'node:test'
import { linkFromNewBoard, openPenpa, openSolvePage, puzzleSolveLinkInPage, useBrowser } from './page.mjs'

const browser = useBrowser()

// Penpa+'s line style 3 is the solver's green line, 3 px wide; styles 13 (bold dash) and 17 (a wall's bold dash) are already
// `(pu.size * 0.1) | 0` wide, which is 7 px at ZOOMED px a cell.
const SOLVER_LINE = 3
const SOLVER_LINE_PX = 3
const CELL_SIZED_STYLES = [13, 17]
const CELL_SIZED_PX_AT_ZOOMED = 7
// The cell sizes the widths are read at: under Penpa+'s normal, its normal, and twice its normal.
const SMALL = 24
const NORMAL = 38
const ZOOMED = 76
// The middle cell of a 9x9 and its right-hand neighbour, as indexes of the center list.
const LINE_FROM = 40
const LINE_TO = 41

// Runs in the page: draws a solver's line from the cell at `from` to the cell at `to` of the center list at `px` a cell, and
// returns how wide it is across, in CSS px. The width is the count of pixels, down a column a quarter cell right of the first
// cell's centre, at least half as far from white as the line's own colour, over the canvas's resolution.
function lineWidthAtInPage ({ px, from, to, style }) {
  engine.setCellSize(px)
  const [a, b] = [pu.centerlist[from], pu.centerlist[to]].sort((x, y) => x - y)
  pu.pu_a.line = { [`${a},${b}`]: style }
  pu.redraw()
  const { x, y } = pu.point[pu.centerlist[from]]
  const column = Math.round((x + pu.size * 0.25) * pu.resol)
  const top = Math.round((y - pu.size * 0.4) * pu.resol)
  const { data } = pu.ctx.getImageData(column, top, 1, Math.round(pu.size * 0.8 * pu.resol))
  const fromWhite = (i) => (255 * 3 - data[i] - data[i + 1] - data[i + 2])
  let deepest = 0
  for (let i = 0; i < data.length; i += 4) deepest = Math.max(deepest, fromWhite(i))
  let run = 0
  for (let i = 0; i < data.length; i += 4) if (fromWhite(i) >= deepest / 2) run++
  return { cellSize: engine.getState().cellSize, width: run / pu.resol }
}

// Runs in the page: the cell size, and the line width Penpa+'s setter leaves for `style` at `px` a cell, on the board's
// context and on a context of its own.
function setterWidthsInPage ({ px, style }) {
  if (typeof engine !== 'undefined') engine.setCellSize(px)
  else UserSettings.displaysize = px
  const scratch = document.createElement('canvas').getContext('2d')
  set_line_style(pu.ctx, style)
  set_line_style(scratch, style)
  return { cellSize: pu.size, board: pu.ctx.lineWidth, scratch: scratch.lineWidth }
}

describe('a solver line on solve.html', () => {
  let link
  before(async () => {
    link = await linkFromNewBoard(browser(), puzzleSolveLinkInPage, { title: '', author: '', rules: '', size: 9 })
  })

  it(`draws at its own width up to ${NORMAL} px a cell and twice as wide at ${ZOOMED} px`, async () => {
    const { context, page } = await openSolvePage(browser(), link, { served: true })
    try {
      const widthAt = async (px) => {
        const { cellSize, width } = await page.evaluate(lineWidthAtInPage, { px, from: LINE_FROM, to: LINE_TO, style: SOLVER_LINE })
        assert.equal(cellSize, px)
        return width
      }
      const small = await widthAt(SMALL)
      const normal = await widthAt(NORMAL)
      const zoomed = await widthAt(ZOOMED)
      assert.ok(Math.abs(small - SOLVER_LINE_PX) <= 0.5, `${small} px at ${SMALL} px a cell, want about ${SOLVER_LINE_PX}`)
      assert.ok(Math.abs(normal - SOLVER_LINE_PX) <= 0.5, `${normal} px at ${NORMAL} px a cell, want about ${SOLVER_LINE_PX}`)
      assert.ok(Math.abs(zoomed / normal - 2) <= 0.25, `${zoomed} px at ${ZOOMED} px a cell against ${normal} px at ${NORMAL}: want about twice`)
    } finally {
      await context.close()
    }
  })

  it('scales only the board, and a width Penpa+ already sizes by the cell only once', async () => {
    const { context, page } = await openSolvePage(browser(), link, { served: true })
    try {
      assert.deepEqual(await page.evaluate(setterWidthsInPage, { px: ZOOMED, style: SOLVER_LINE }),
        { cellSize: ZOOMED, board: SOLVER_LINE_PX * ZOOMED / NORMAL, scratch: SOLVER_LINE_PX })
      for (const style of CELL_SIZED_STYLES) {
        assert.deepEqual(await page.evaluate(setterWidthsInPage, { px: ZOOMED, style }),
          { cellSize: ZOOMED, board: CELL_SIZED_PX_AT_ZOOMED, scratch: CELL_SIZED_PX_AT_ZOOMED }, `style ${style}`)
      }
    } finally {
      await context.close()
    }
  })
})

describe("Penpa+'s own page", () => {
  it(`keeps the solver line at its own width at ${ZOOMED} px a cell`, async () => {
    const { context, page } = await openPenpa(browser())
    try {
      assert.deepEqual(await page.evaluate(setterWidthsInPage, { px: ZOOMED, style: SOLVER_LINE }),
        { cellSize: ZOOMED, board: SOLVER_LINE_PX, scratch: SOLVER_LINE_PX })
    } finally {
      await context.close()
    }
  })
})
