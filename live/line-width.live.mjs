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
// The middle cell of a 9x9 and its right-hand neighbour, and the first cell of the middle row, as indexes of the center list.
const MIDDLE_CELL = 40
const RIGHT_OF_MIDDLE = 41
const ROW_START = 36
// Where each line is measured: across the solver's line a quarter cell right of the middle cell's centre, across the grid line
// between the middle cell and its neighbour, and across the outer frame at the row's left end; each a quarter cell off the
// lines that cross it.
const ACROSS_SOLVER_LINE = { cell: MIDDLE_CELL, dx: 0.25, dy: 0, scan: 'down' }
const ACROSS_GRID_LINE = { cell: MIDDLE_CELL, dx: 0.5, dy: 0.25, scan: 'right' }
const ACROSS_FRAME = { cell: ROW_START, dx: -0.5, dy: 0.25, scan: 'right' }
// How much wider the solver's line and the grid and frame draw at ZOOMED px a cell than at NORMAL (Chris, 2026-11-18): the
// grid and frame grow half as much.
const SOLVER_LINE_GROWTH = 2
const FRAME_GROWTH = 1.5
const GROWTH_TOLERANCE = 0.25

// Runs in the page: at `px` a cell, with the solver's line `solverLine` drawn (`{ from, to, style }`, cells as indexes of the
// center list) or none, how wide the line is that crosses the point `dx`, `dy` cell widths from the centre of the cell at
// `cell`, in CSS px. The width is the count of pixels, on a strip 0.8 cell long centred on that point (`down` a column or
// `right` along a row), at least half as far from white as the darkest of them, over the canvas's resolution. A pixel is read
// over white, since the canvas round the board may be transparent.
function lineWidthAtInPage ({ px, solverLine, cell, dx, dy, scan }) {
  engine.setCellSize(px)
  pu.pu_a.line = {}
  if (solverLine) {
    const [a, b] = [pu.centerlist[solverLine.from], pu.centerlist[solverLine.to]].sort((x, y) => x - y)
    pu.pu_a.line[`${a},${b}`] = solverLine.style
  }
  pu.redraw()
  const centre = pu.point[pu.centerlist[cell]]
  const x = (centre.x + pu.size * dx) * pu.resol
  const y = (centre.y + pu.size * dy) * pu.resol
  const reach = pu.size * 0.4 * pu.resol
  const length = Math.round(reach * 2)
  const { data } = scan === 'down'
    ? pu.ctx.getImageData(Math.round(x), Math.round(y - reach), 1, length)
    : pu.ctx.getImageData(Math.round(x - reach), Math.round(y), length, 1)
  const fromWhite = (i) => (255 * 3 - data[i] - data[i + 1] - data[i + 2]) * data[i + 3] / 255
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

// The width of the line `where` names on `page` at `px` a cell, with the solver's line `solverLine` drawn or none.
async function widthAt (page, px, where, solverLine = null) {
  const { cellSize, width } = await page.evaluate(lineWidthAtInPage, { px, solverLine, ...where })
  assert.equal(cellSize, px)
  return width
}

describe('line widths on solve.html', () => {
  let link
  before(async () => {
    link = await linkFromNewBoard(browser(), puzzleSolveLinkInPage, { title: '', author: '', rules: '', size: 9 })
  })

  it(`draw a solver's line at its own width up to ${NORMAL} px a cell and twice as wide at ${ZOOMED} px`, async () => {
    const { context, page } = await openSolvePage(browser(), link, { served: true })
    try {
      const solverLine = { from: MIDDLE_CELL, to: RIGHT_OF_MIDDLE, style: SOLVER_LINE }
      const small = await widthAt(page, SMALL, ACROSS_SOLVER_LINE, solverLine)
      const normal = await widthAt(page, NORMAL, ACROSS_SOLVER_LINE, solverLine)
      const zoomed = await widthAt(page, ZOOMED, ACROSS_SOLVER_LINE, solverLine)
      assert.ok(Math.abs(small - SOLVER_LINE_PX) <= 0.5, `${small} px at ${SMALL} px a cell, want about ${SOLVER_LINE_PX}`)
      assert.ok(Math.abs(normal - SOLVER_LINE_PX) <= 0.5, `${normal} px at ${NORMAL} px a cell, want about ${SOLVER_LINE_PX}`)
      assert.ok(Math.abs(zoomed / normal - SOLVER_LINE_GROWTH) <= GROWTH_TOLERANCE,
        `${zoomed} px at ${ZOOMED} px a cell against ${normal} px at ${NORMAL}: want about ${SOLVER_LINE_GROWTH} times`)
    } finally {
      await context.close()
    }
  })

  it(`draw the grid and the outer frame half as much wider at ${ZOOMED} px a cell, and as before at ${SMALL}`, async () => {
    const { context, page } = await openSolvePage(browser(), link, { served: true })
    try {
      for (const [name, where] of [['grid line', ACROSS_GRID_LINE], ['outer frame', ACROSS_FRAME]]) {
        const small = await widthAt(page, SMALL, where)
        const normal = await widthAt(page, NORMAL, where)
        const zoomed = await widthAt(page, ZOOMED, where)
        assert.equal(small, normal, `the ${name} at ${SMALL} px a cell against ${NORMAL}`)
        assert.ok(Math.abs(zoomed / normal - FRAME_GROWTH) <= GROWTH_TOLERANCE,
          `the ${name}: ${zoomed} px at ${ZOOMED} px a cell against ${normal} px at ${NORMAL}: want about ${FRAME_GROWTH} times`)
      }
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
