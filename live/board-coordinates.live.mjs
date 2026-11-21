// The board coordinates of solve.html's Settings (#249, #250): off by default, kept across a reload, outside the canvas (so never over an
// outside clue), following zoom and Fit. A square-cell grid gets row and column numbers 1..N aligned to the cell centres (#249); a hex, tri,
// pyramid or truncated-square grid gets one number per row of cells (#350); every other shape gets reference bands, letters A, B, C... across the top and numbers 1, 2, 3... down the left, equal bands over the grid's bounding
// box (#250). Label positions are read against the cells Penpa+ draws.
import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { boardCanvasInPage, linkFromNewBoard, solveLinkOfImport, openSolvePage, useBrowser, waitForDesk } from './page.mjs'
import { IMPORTS } from './tier-c-puzzles.mjs'
import { settle } from './settle.mjs'
import { FRAMED_GRID_LINK } from './framed-grid-link.mjs'

const browser = useBrowser()
const SWITCH = 'Show board coordinates'
// Cell centres and labels may differ by rounding.
const SLACK_PX = 1.5
// The drawn box includes the grid's outer line, which is a few px thick.
const DRAWN_SLACK_PX = 4

// Runs in the page: a new board of `columns` x `rows` cells with `space` outside-clue rows or columns on the top and the left.
function newBoardInPage ({ columns, rows, space = 0, gridtype = 'square' }) {
  document.getElementById('gridtype').value = gridtype
  UserSettings.gridtype = gridtype
  document.getElementById('nb_size1').value = columns
  document.getElementById('nb_size2').value = rows
  document.getElementById('nb_space1').value = space
  document.getElementById('nb_space3').value = space
  create_newboard()
  const url = pu.maketext_solve()
  return url.slice(url.indexOf('#'))
}
const boardLink = (options) => linkFromNewBoard(browser(), newBoardInPage, options)

// Runs in the page, given the board canvas: each cell's rectangle as drawn (viewport px) by its row and column, whatever order Penpa+ keeps
// its cell list in, and the canvas's own.
function cellRectsInPage (canvas) {
  const origin = canvas.getBoundingClientRect()
  const cells = {}
  for (const id of pu.centerlist) {
    const corners = pu.point[id].surround.map((s) => pu.point[s])
    const xs = corners.map((p) => p.x)
    const ys = corners.map((p) => p.y)
    cells[`${Math.floor(id / pu.nx0)},${id % pu.nx0}`] = { left: origin.left + Math.min(...xs), right: origin.left + Math.max(...xs), top: origin.top + Math.min(...ys), bottom: origin.top + Math.max(...ys) }
  }
  return { canvas: { left: origin.left, top: origin.top, right: origin.right, bottom: origin.bottom }, cells }
}
const readCells = async (page) => {
  const canvas = await page.evaluateHandle(boardCanvasInPage)
  try { return await page.evaluate(cellRectsInPage, canvas) } finally { await canvas.dispose() }
}

// Runs in the page: every shown label's text, axis and box.
function labelsInPage () {
  return [...document.querySelectorAll('.ui-grid-coordinate')].map((node) => {
    const r = node.getBoundingClientRect()
    return { text: node.textContent, band: node.classList.contains('ui-grid-band'), axis: node.dataset.axis, side: node.dataset.side, cx: (r.left + r.right) / 2, cy: (r.top + r.bottom) / 2, left: r.left, right: r.right, top: r.top, bottom: r.bottom }
  })
}

const turnOn = async (page) => {
  await page.getByRole('button', { name: 'Settings' }).click()
  await page.getByRole('dialog', { name: 'Settings' }).waitFor()
  await page.locator('wa-switch').filter({ has: page.getByRole('switch', { name: SWITCH }) }).click()
  await page.keyboard.press('Escape')
  await page.getByRole('dialog', { name: 'Settings' }).waitFor({ state: 'hidden' })
}

// Checks the labels of `page` against the grid: 1..columns across the top, 1..rows down the left, each on its cell's centre line, and
// none inside the canvas.
async function assertAligned (page, columns, rows) {
  const { canvas, cells } = await readCells(page)
  const labels = await page.evaluate(labelsInPage)
  const top = labels.filter((l) => l.axis === 'column' && l.side === 'start')
  const left = labels.filter((l) => l.axis === 'row' && l.side === 'start')
  assert.deepEqual(top.map((l) => l.text), Array.from({ length: columns }, (_, i) => String(i + 1)), 'columns are numbered 1..N')
  assert.deepEqual(left.map((l) => l.text), Array.from({ length: rows }, (_, i) => String(i + 1)), 'rows are numbered 1..N')
  // Every cell of the grid, by position: the cells' own keys sort in row-major order.
  const keys = Object.keys(cells).sort((a, b) => { const [ar, ac] = a.split(',').map(Number); const [br, bc] = b.split(',').map(Number); return ar - br || ac - bc })
  const firstRow = Number(keys[0].split(',')[0])
  const firstColumn = Math.min(...keys.map((k) => Number(k.split(',')[1])))
  top.forEach((l, i) => {
    const cell = cells[`${firstRow},${firstColumn + i}`]
    assert.ok(Math.abs(l.cx - (cell.left + cell.right) / 2) <= SLACK_PX, `column ${i + 1} label is over its cell centre: ${l.cx} vs ${(cell.left + cell.right) / 2}`)
    assert.ok(l.bottom <= canvas.top + SLACK_PX, `column ${i + 1} label is above the canvas`)
  })
  left.forEach((l, j) => {
    const cell = cells[`${firstRow + j},${firstColumn}`]
    assert.ok(Math.abs(l.cy - (cell.top + cell.bottom) / 2) <= SLACK_PX, `row ${j + 1} label is beside its cell centre: ${l.cy} vs ${(cell.top + cell.bottom) / 2}`)
    assert.ok(l.right <= canvas.left + SLACK_PX, `row ${j + 1} label is left of the canvas`)
  })
}

// Runs in the page, given the board canvas: the box (viewport px) round everything drawn on it, read from its pixels (anything that is
// neither transparent nor near white), and where the canvas lies. Not Penpa+'s point list, which the engine's own reading uses.
function drawnBoxInPage (canvas) {
  const origin = canvas.getBoundingClientRect()
  const scale = canvas.width / origin.width
  const { data } = canvas.getContext('2d').getImageData(0, 0, canvas.width, canvas.height)
  let left = Infinity; let top = Infinity; let right = -Infinity; let bottom = -Infinity
  for (let i = 0; i < data.length; i += 4) {
    if (data[i + 3] > 0 && Math.min(data[i], data[i + 1], data[i + 2]) < 240) {
      const x = (i / 4) % canvas.width
      const y = Math.floor(i / 4 / canvas.width)
      left = Math.min(left, x); right = Math.max(right, x + 1); top = Math.min(top, y); bottom = Math.max(bottom, y + 1)
    }
  }
  return {
    area: { left: origin.left + left / scale, right: origin.left + right / scale, top: origin.top + top / scale, bottom: origin.top + bottom / scale },
    canvas: { left: origin.left, top: origin.top }
  }
}

// A, B, ... Z, AA, AB, ...: the names of the first `n` column bands.
const bandNames = (n) => {
  const names = []
  for (let i = 0; i < n; i++) {
    let name = ''
    for (let k = i; k >= 0; k = Math.floor(k / 26) - 1) name = String.fromCharCode(65 + (k % 26)) + name
    names.push(name)
  }
  return names
}

// Checks the bands of `page`: `columns` column bands named A, B, C... across the top and `rows` row bands numbered 1, 2, 3... down the left,
// each label at the middle of an equal band, the bands together the box the board is drawn in, and every label outside the canvas.
async function assertBands (page, columns, rows) {
  const handle = await page.evaluateHandle(boardCanvasInPage)
  let read
  try { read = await page.evaluate(drawnBoxInPage, handle) } finally { await handle.dispose() }
  const { area, canvas } = read
  const labels = await page.evaluate(labelsInPage)
  const check = (axis, texts, centre, from, to, outside) => {
    const own = labels.filter((l) => l.axis === axis && l.side === 'start')
    assert.deepEqual(own.map((l) => l.text), texts, `${axis} bands are named in order`)
    const width = (to - from) / own.length
    own.map(centre).forEach((c, i) => assert.ok(Math.abs(c - (from + width * (i + 0.5))) <= DRAWN_SLACK_PX, `${axis} band ${i + 1} is centred at ${from + width * (i + 0.5)}, was ${c}`))
    own.forEach((l) => assert.ok(outside(l) <= SLACK_PX, `${axis} label ${l.text} is outside the canvas`))
  }
  check('column', bandNames(columns), (l) => l.cx, area.left, area.right, (l) => l.bottom - canvas.top)
  check('row', Array.from({ length: rows }, (_, i) => String(i + 1)), (l) => l.cy, area.top, area.bottom, (l) => l.right - canvas.left)
}

const switchChecked = async (page) => {
  await page.getByRole('button', { name: 'Settings' }).click()
  await page.getByRole('dialog', { name: 'Settings' }).waitFor()
  const checked = await page.getByRole('switch', { name: SWITCH }).isChecked()
  await page.keyboard.press('Escape')
  await page.getByRole('dialog', { name: 'Settings' }).waitFor({ state: 'hidden' })
  return checked
}

describe('board coordinates on a square-cell grid', () => {
  it('are off by default', async () => {
    const { context, page } = await openSolvePage(browser(), await boardLink({ columns: 9, rows: 9 }), { served: true })
    assert.deepEqual(await page.evaluate(labelsInPage), [])
    assert.equal(await switchChecked(page), false, 'the switch is there, and off')
    await context.close()
  })

  it('show 1-9 on a sudoku at Fit and after zooming in twice, and the setting survives a reload', async () => {
    const { context, page } = await openSolvePage(browser(), await solveLinkOfImport(browser(), IMPORTS['sudoku-9x9']), { served: true })
    const cellWithout = await page.evaluate(() => engine.getState().cellSize)
    await turnOn(page)
    assert.ok(await page.evaluate(() => engine.getState().cellSize) < cellWithout, 'Fit gives the numbers their room, so the cells get smaller')
    const body = await page.evaluate(() => { const b = document.querySelector('section[aria-label="Board"] .ui-body'); return { w: b.scrollWidth - b.clientWidth, h: b.scrollHeight - b.clientHeight } })
    assert.deepEqual(body, { w: 0, h: 0 }, 'the Board card does not scroll at Fit')
    await assertAligned(page, 9, 9)
    // The fit leaves room for the numbers: at Fit every label is inside the Board card.
    const card = await page.evaluate(() => document.querySelector('section[aria-label="Board"]').getBoundingClientRect().toJSON())
    for (const l of await page.evaluate(labelsInPage)) {
      assert.ok(l.left >= card.left && l.right <= card.right && l.top >= card.top && l.bottom <= card.bottom, `label ${l.axis} ${l.text} is inside the Board card`)
    }
    await page.getByRole('button', { name: 'Zoom in' }).click()
    await page.getByRole('button', { name: 'Zoom in' }).click()
    await assertAligned(page, 9, 9)
    await page.getByRole('button', { name: 'Fit', exact: true }).click()
    await assertAligned(page, 9, 9)
    await page.reload()
    await waitForDesk(page)
    assert.equal(await settle(async () => (await page.evaluate(labelsInPage)).length, 36), 36, 'the labels are back after a reload')
    await assertAligned(page, 9, 9)
    assert.equal(await switchChecked(page), true, 'the switch is on after a reload')
    await context.close()
  })

  it('draw at 19 px and keep clear of the board by the gutter, not by Penpa+\'s canvas margin', async () => {
    const { context, page } = await openSolvePage(browser(), await boardLink({ columns: 9, rows: 9 }), { served: true })
    await turnOn(page)
    const sizes = await page.evaluate(() => [...document.querySelectorAll('.ui-grid-coordinate')].map((n) => getComputedStyle(n).fontSize))
    assert.deepEqual(sizes, Array(36).fill(`${LABEL_PX}px`), 'every label is 19 px at text scale 1')
    const { canvas } = await readCells(page)
    for (const l of (await page.evaluate(labelsInPage)).filter((n) => n.side === 'start')) {
      const clearance = l.axis === 'column' ? canvas.top - l.bottom : canvas.left - l.right
      assert.ok(clearance >= MIN_CLEARANCE_PX, `${l.axis} ${l.text} is ${clearance} px from the canvas edge, wanted at least ${MIN_CLEARANCE_PX}`)
    }
    await context.close()
  })

  it('number a rectangular grid by its own rows and columns', async () => {
    const { context, page } = await openSolvePage(browser(), await boardLink({ columns: 6, rows: 8 }), { served: true })
    await turnOn(page)
    await assertAligned(page, 6, 8)
    await context.close()
  })

  it('keep clear of an outside-clue band', async () => {
    const { context, page } = await openSolvePage(browser(), await boardLink({ columns: 7, rows: 7, space: 1 }), { served: true })
    await turnOn(page)
    // The band takes one column and one row of the grid's size.
    await assertAligned(page, 6, 6)
    await context.close()
  })

  it('stay on their own rows and columns when Penpa+ keeps its cell list in another order', async () => {
    const { context, page } = await openSolvePage(browser(), await boardLink({ columns: 6, rows: 6 }), { served: true })
    // Box mode takes a cell out with splice and puts it back at the end, and the link keeps that order.
    await page.evaluate(() => pu.centerlist.push(pu.centerlist.shift()))
    await turnOn(page)
    await assertAligned(page, 6, 6)
    await context.close()
  })

  it('keep a row and a column of the grid when Box mode took a cell out', async () => {
    const { context, page } = await openSolvePage(browser(), await boardLink({ columns: 6, rows: 6 }), { served: true })
    await page.evaluate(() => pu.centerlist.splice(14, 1))
    await turnOn(page)
    await assertAligned(page, 6, 6)
    await context.close()
  })
})

// Column band counts for a 6 x 6 board of each shape, and a 20-side hexagon grid wide enough to run past Z. A band is about 1.5 cells wide, so these
// are the grid's width over 1.5 cells, rounded. `rows` is the number of rows of cells for a grid type numbered by row (#350), else the number of
// row bands.
const SHAPES = [
  { gridtype: 'hex', size: 6, columns: 8, rows: 11, byRow: true },
  { gridtype: 'tri', size: 6, columns: 6, rows: 6, byRow: true },
  { gridtype: 'pyramid', size: 6, columns: 4, rows: 6, byRow: true },
  { gridtype: 'truncated_square', size: 6, columns: 9, rows: 12, byRow: true },
  { gridtype: 'hex', size: 20, columns: 28, rows: 39, byRow: true },
  { gridtype: 'snub_square', size: 6, columns: 12, rows: 12 },
  { gridtype: 'cairo_pentagonal', size: 6, columns: 10, rows: 10 },
  { gridtype: 'iso', size: 6, columns: 7, rows: 9 },
  { gridtype: 'tetrakis_square', size: 6, columns: 12, rows: 12 },
  { gridtype: 'rhombitrihexagonal', size: 6, columns: 10, rows: 11 },
  { gridtype: 'deltoidal_trihexagonal', size: 6, columns: 10, rows: 11 }
]

// Runs in the page: the y (viewport px) of the middle of every cell's drawn box, the distinct ones within `tolerance`, top to bottom.
function cellRowsInPage ({ canvas, tolerance }) {
  const origin = canvas.getBoundingClientRect()
  const ys = pu.centerlist.map((id) => {
    const corners = pu.point[id].surround.map((s) => pu.point[s].y)
    return origin.top + (Math.min(...corners) + Math.max(...corners)) / 2
  }).sort((a, b) => a - b)
  return ys.filter((y, i) => i === 0 || y - ys[i - 1] > tolerance)
}

// Checks the labels of a grid numbered by row: letters across as bands, and the numbers 1..N down the left, one on each row of cells' centre line, repeated on the far sides.
async function assertRowNumbers (page, columns, rows) {
  const handle = await page.evaluateHandle(boardCanvasInPage)
  let cellRows
  try { cellRows = await page.evaluate(cellRowsInPage, { canvas: handle, tolerance: SLACK_PX }) } finally { await handle.dispose() }
  assert.equal(cellRows.length, rows, 'the grid has this many rows of cells')
  const labels = await page.evaluate(labelsInPage)
  const left = labels.filter((l) => l.axis === 'row' && l.side === 'start')
  assert.deepEqual(left.map((l) => l.text), Array.from({ length: rows }, (_, i) => String(i + 1)), 'rows are numbered 1..N from the top')
  left.forEach((l, i) => assert.ok(Math.abs(l.cy - cellRows[i]) <= SLACK_PX, `row ${l.text} is at its row's y ${cellRows[i]}, was ${l.cy}`))
  assert.deepEqual(labels.filter((l) => l.axis === 'column' && l.side === 'start').map((l) => l.text), bandNames(columns), 'columns are lettered')
  assert.equal(left.some((l) => l.band), false, 'row numbers are exact, so not drawn as bands')
  assert.equal(labels.filter((l) => l.axis === 'column' && l.side === 'start').every((l) => l.band), true, 'column letters are bands')
  // "Number the grid only" is on, so both axes repeat on the right and the bottom.
  const far = (axis) => labels.filter((l) => l.axis === axis && l.side === 'end').map((l) => l.text)
  assert.deepEqual(far('row'), left.map((l) => l.text), 'the row numbers repeat on the right')
  assert.deepEqual(far('column'), bandNames(columns), 'the column letters repeat at the bottom')
}

describe('board coordinates on a grid that is not square', () => {
  for (const { gridtype, size, columns, rows, byRow } of SHAPES) {
    const what = byRow ? `${rows} numbers, one per row of cells, and ${columns} letters` : `${columns} letters and ${rows} numbers as equal bands in the`
    it(`show ${what} ${gridtype} grid of size ${size} at Fit and after zooming`, async () => {
      const { context, page } = await openSolvePage(browser(), await boardLink({ columns: size, rows: size, gridtype }), { served: true })
      assert.deepEqual(await page.evaluate(labelsInPage), [], 'off by default')
      const check = byRow ? () => assertRowNumbers(page, columns, rows) : () => assertBands(page, columns, rows)
      await turnOn(page)
      await check()
      await page.getByRole('button', { name: 'Zoom in' }).click()
      await page.getByRole('button', { name: 'Zoom in' }).click()
      await check()
      await page.getByRole('button', { name: 'Fit', exact: true }).click()
      await check()
      await context.close()
    })
  }

  it('turn a square puzzle opened with the setting on into row numbers and letters when the next puzzle is a hexagon grid', async () => {
    const square = await boardLink({ columns: 6, rows: 6 })
    const hex = await boardLink({ columns: 6, rows: 6, gridtype: 'hex' })
    const { context, page } = await openSolvePage(browser(), square, { served: true })
    await turnOn(page)
    assert.equal((await page.evaluate(labelsInPage)).length, 24)
    const here = page.url().split('#')[0]
    await page.goto('about:blank')
    await page.goto(here + hex)
    await waitForDesk(page)
    await assertRowNumbers(page, 8, 11)
    await context.close()
  })

  it('offer the switch on a grid that is not square', async () => {
    const { context, page } = await openSolvePage(browser(), await boardLink({ columns: 6, rows: 6, gridtype: 'hex' }), { served: true })
    await page.getByRole('button', { name: 'Settings' }).click()
    await page.getByRole('dialog', { name: 'Settings' }).waitFor()
    assert.equal(await page.evaluate(() => pu.gridtype), 'hex', 'the board is a hexagon grid')
    assert.equal(await page.getByRole('switch', { name: SWITCH }).count(), 1)
    await context.close()
  })
})

// Runs in the page: the Board card's visible area (its padding box, viewport px), and how far its body scrolls. Measured here from the
// DOM, apart from the desk's own reading of the same box, so the check does not agree with the code by construction.
function bodyViewInPage () {
  const body = document.querySelector('section[aria-label="Board"] .ui-body')
  const r = body.getBoundingClientRect()
  const left = r.left + body.clientLeft
  const top = r.top + body.clientTop
  return { left, top, right: left + body.clientWidth, bottom: top + body.clientHeight, scrollsX: body.scrollWidth - body.clientWidth, scrollsY: body.scrollHeight - body.clientHeight }
}

// The width of the gutter the labels sit in, at text scale 1 (desk.css `--ui-coordinates-gutter`). A label whose centre is nearer the card's edge
// than this lies under the other axis's labels, or is clipped by the card, so only the labels beyond it are checked against the card.
const GUTTER_PX = 30
// The label's font size at text scale 1 (desk.css `.ui-grid-coordinate`), and the least gap its box leaves to the canvas: a 19 px label centred
// in a 30 px gutter leaves 5.5 px above a column label's box, while a 24 px gutter would leave 2.5 px.
const LABEL_PX = 19
const MIN_CLEARANCE_PX = 5

// Zooms in (at most 8 steps) and checks the board then scrolls both ways.
async function zoomIn (page) {
  const button = page.getByRole('button', { name: 'Zoom in' })
  for (let i = 0; i < 8 && await button.isEnabled(); i++) await button.click()
  const view = await page.evaluate(bodyViewInPage)
  assert.ok(view.scrollsX > 100 && view.scrollsY > 100, `the zoomed board scrolls both ways (${view.scrollsX} x ${view.scrollsY})`)
}

// Runs in the page: how far the labels are slid to keep to the card's edges (desk.css reads these two variables).
const stickOffsetsInPage = () => {
  const style = document.querySelector('.ui-grid-coordinates').style
  return { x: style.getPropertyValue('--ui-stick-x'), y: style.getPropertyValue('--ui-stick-y') }
}

// Scrolls the Board card's body a third of the way along each axis and returns the slide the labels had when the scroll event ended. The
// handler is added after the desk's own, so it runs second, before the next frame can redraw the labels (they are redrawn every frame
// while the coordinates are on), which would hide a missing scroll listener.
const scrollThird = (page) => page.evaluate((read) => new Promise((resolve) => {
  const body = document.querySelector('section[aria-label="Board"] .ui-body')
  body.addEventListener('scroll', () => resolve(new Function(`return (${read})()`)()), { once: true })
  body.scrollLeft = (body.scrollWidth - body.clientWidth) / 3
  body.scrollTop = (body.scrollHeight - body.clientHeight) / 3
}), stickOffsetsInPage.toString())

// Each label's centre along its own axis, from the canvas's top left.
async function alongBoard (page) {
  const { canvas } = await readCells(page)
  const labels = (await page.evaluate(labelsInPage)).filter((l) => l.side === 'start')
  return labels.map((l) => (l.axis === 'column' ? l.cx - canvas.left : l.cy - canvas.top))
}

// After a scroll, the labels still follow their cells along the board (`before` is each label's offset from the canvas, read unscrolled), and
// every label beyond the gutter is inside the card's visible area, a column's at the card's top edge and a row's at its left edge.
async function assertSticky (page, before) {
  const view = await page.evaluate(bodyViewInPage)
  const labels = (await page.evaluate(labelsInPage)).filter((l) => l.side === 'start')
  const along = await alongBoard(page)
  assert.equal(labels.length, before.length, 'the same labels are drawn')
  let shown = 0
  labels.forEach((l, i) => {
    assert.ok(Math.abs(along[i] - before[i]) <= SLACK_PX, `${l.axis} ${l.text} keeps its place along the board: ${along[i]} vs ${before[i]}`)
    const isColumn = l.axis === 'column'
    const inView = isColumn ? l.cx >= view.left + GUTTER_PX && l.cx <= view.right : l.cy >= view.top + GUTTER_PX && l.cy <= view.bottom
    if (!inView) return
    shown++
    assert.ok(l.left >= view.left - SLACK_PX && l.right <= view.right + SLACK_PX && l.top >= view.top - SLACK_PX && l.bottom <= view.bottom + SLACK_PX, `${l.axis} ${l.text} is inside the card's visible area`)
    if (isColumn) assert.ok(l.top <= view.top + GUTTER_PX + SLACK_PX, `column ${l.text} sits at the card's top edge: ${l.top} vs ${view.top}`)
    else assert.ok(l.left <= view.left + GUTTER_PX + SLACK_PX, `row ${l.text} sits at the card's left edge: ${l.left} vs ${view.left}`)
  })
  assert.ok(shown >= 2, 'some labels are in view')
}

describe('board coordinates when the board is zoomed past its card and scrolled', () => {
  for (const { name, options, columns, rows } of [
    { name: 'a 9x9 square grid', options: { columns: 9, rows: 9 }, columns: 9, rows: 9 },
    { name: 'a hexagon grid', options: { columns: 6, rows: 6, gridtype: 'hex' }, columns: 8, rows: 11 }
  ]) {
    it(`stay in view at the card's top and left edges on ${name}`, async () => {
      const { context, page } = await openSolvePage(browser(), await boardLink(options), { served: true })
      await turnOn(page)
      await zoomIn(page)
      // Unscrolled, nothing slides: the labels sit where they do at Fit.
      assert.deepEqual(await page.evaluate(stickOffsetsInPage), { x: '0px', y: '0px' }, 'no slide before the board scrolls')
      if (!options.gridtype) await assertAligned(page, columns, rows)
      const home = await alongBoard(page)
      assert.equal(home.length, columns + rows)
      const slid = await scrollThird(page)
      assert.ok(parseFloat(slid.x) > 0 && parseFloat(slid.y) > 0, `the scroll itself slides the labels (${slid.x}, ${slid.y})`)
      await assertSticky(page, home)
      await context.close()
    })
  }
})

describe('"Number the grid only" on a grid inside a thick frame with outside clues around it (#348)', () => {
  const SIDES = ['start', 'end']
  const texts = (labels, axis, side) => labels.filter((l) => l.axis === axis && l.side === side).map((l) => l.text)
  const oneToNine = Array.from({ length: 9 }, (_, i) => String(i + 1))

  it('numbers the framed grid 1 to 9 on all four sides, with no number on the clue margin', async () => {
    const { context, page } = await openSolvePage(browser(), FRAMED_GRID_LINK, { served: true })
    await turnOn(page)
    const labels = await page.evaluate(() => [...document.querySelectorAll('.ui-grid-coordinate')].map((n) => ({ text: n.textContent, axis: n.dataset.axis, side: n.dataset.side })))
    for (const axis of ['column', 'row']) for (const side of SIDES) assert.deepEqual(texts(labels, axis, side), oneToNine, `${axis} labels on the ${side} side`)
    await context.close()
  })

  it('numbers the whole canvas on the top and left only when the option is off', async () => {
    const { context, page } = await openSolvePage(browser(), FRAMED_GRID_LINK, { served: true })
    await turnOn(page)
    await page.getByRole('button', { name: 'Settings' }).click()
    await page.getByRole('dialog', { name: 'Settings' }).waitFor()
    await page.locator('wa-switch').filter({ has: page.getByRole('switch', { name: 'Number the grid only' }) }).click()
    await page.keyboard.press('Escape')
    await page.getByRole('dialog', { name: 'Settings' }).waitFor({ state: 'hidden' })
    const labels = await page.evaluate(() => [...document.querySelectorAll('.ui-grid-coordinate')].map((n) => ({ text: n.textContent, axis: n.dataset.axis, side: n.dataset.side })))
    assert.equal(labels.length, 24, 'twelve columns and twelve rows, one side each')
    assert.ok(labels.every((l) => l.side === 'start'), 'top and left only')
    await context.close()
  })

  it('keeps the far labels at the card\'s right and bottom edges when the board is zoomed past its card and scrolled', async () => {
    const { context, page } = await openSolvePage(browser(), await boardLink({ columns: 9, rows: 9 }), { served: true })
    await turnOn(page)
    await zoomIn(page)
    await scrollThird(page)
    const view = await page.evaluate(bodyViewInPage)
    const far = (await page.evaluate(labelsInPage)).filter((l) => l.side === 'end')
    assert.equal(far.length, 18)
    for (const l of far) {
      if (l.axis === 'column') assert.ok(l.bottom <= view.bottom + SLACK_PX && l.bottom >= view.bottom - GUTTER_PX - SLACK_PX, `column ${l.text} sits at the card's bottom edge: ${l.bottom} vs ${view.bottom}`)
      else assert.ok(l.right <= view.right + SLACK_PX && l.right >= view.right - GUTTER_PX - SLACK_PX, `row ${l.text} sits at the card's right edge: ${l.right} vs ${view.right}`)
    }
    await context.close()
  })
})
