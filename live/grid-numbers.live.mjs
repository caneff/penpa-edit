// The board coordinates of solve.html's Settings (#249, #250): off by default, kept across a reload, outside the canvas (so never over an
// outside clue), following zoom and Fit. A square-cell grid gets row and column numbers 1..N aligned to the cell centres (#249); every other
// shape gets reference bands, letters A, B, C... across the top and numbers 1, 2, 3... down the left, equal bands over the grid's bounding
// box (#250). Label positions are read against the cells Penpa+ draws.
import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { boardCanvasInPage, linkFromNewBoard, solveLinkOfImport, openSolvePage, useBrowser, waitForDesk } from './page.mjs'
import { IMPORTS } from './tier-c-puzzles.mjs'
import { settle } from './settle.mjs'

const browser = useBrowser()
const SWITCH = 'Show board coordinates'
// Cell centres and labels may differ by rounding.
const SLACK_PX = 1.5

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
  return [...document.querySelectorAll('.ui-grid-number')].map((node) => {
    const r = node.getBoundingClientRect()
    return { text: node.textContent, axis: node.dataset.axis, cx: (r.left + r.right) / 2, cy: (r.top + r.bottom) / 2, left: r.left, right: r.right, top: r.top, bottom: r.bottom }
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
  const top = labels.filter((l) => l.axis === 'column')
  const left = labels.filter((l) => l.axis === 'row')
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

// Runs in the page, given the board canvas: the bounding box (viewport px) of every cell's corners as drawn, one cell's width, and the canvas.
function gridAreaInPage (canvas) {
  const origin = canvas.getBoundingClientRect()
  const corners = pu.centerlist.flatMap((id) => pu.point[id].surround.map((s) => pu.point[s]))
  const xs = corners.map((p) => p.x)
  const ys = corners.map((p) => p.y)
  return {
    area: { left: origin.left + Math.min(...xs), right: origin.left + Math.max(...xs), top: origin.top + Math.min(...ys), bottom: origin.top + Math.max(...ys) },
    cell: pu.size,
    canvas: { left: origin.left, top: origin.top }
  }
}

// Checks the bands of `page`: letters A, B, C... across the top and numbers 1, 2, 3... down the left, each label at the middle of an equal
// band, the bands together exactly the grid's bounding box, each band one to two cells wide, and every label outside the canvas.
async function assertBands (page) {
  const handle = await page.evaluateHandle(boardCanvasInPage)
  let read
  try { read = await page.evaluate(gridAreaInPage, handle) } finally { await handle.dispose() }
  const { area, cell, canvas } = read
  const labels = await page.evaluate(labelsInPage)
  const check = (axis, texts, centre, from, to, outside) => {
    const own = labels.filter((l) => l.axis === axis)
    assert.deepEqual(own.map((l) => l.text), texts(own.length), `${axis} bands are named in order`)
    const centres = own.map(centre)
    const width = (to - from) / own.length
    centres.forEach((c, i) => assert.ok(Math.abs(c - (from + width * (i + 0.5))) <= SLACK_PX, `${axis} band ${i + 1} is centred at ${from + width * (i + 0.5)}, was ${c}`))
    assert.ok(width >= cell - SLACK_PX && width <= 2 * cell + SLACK_PX, `a ${axis} band is one to two cells wide: ${width} vs a cell of ${cell}`)
    own.forEach((l) => assert.ok(outside(l) <= SLACK_PX, `${axis} label ${l.text} is outside the canvas`))
  }
  const letters = (n) => Array.from({ length: n }, (_, i) => String.fromCharCode(65 + i))
  const numbers = (n) => Array.from({ length: n }, (_, i) => String(i + 1))
  check('column', letters, (l) => l.cx, area.left, area.right, (l) => l.bottom - canvas.top)
  check('row', numbers, (l) => l.cy, area.top, area.bottom, (l) => l.right - canvas.left)
}

const switchChecked = async (page) => {
  await page.getByRole('button', { name: 'Settings' }).click()
  await page.getByRole('dialog', { name: 'Settings' }).waitFor()
  const checked = await page.getByRole('switch', { name: SWITCH }).isChecked()
  await page.keyboard.press('Escape')
  await page.getByRole('dialog', { name: 'Settings' }).waitFor({ state: 'hidden' })
  return checked
}

describe('row and column numbers', () => {
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
    assert.equal(await settle(async () => (await page.evaluate(labelsInPage)).length, 18), 18, 'the labels are back after a reload')
    await assertAligned(page, 9, 9)
    assert.equal(await switchChecked(page), true, 'the switch is on after a reload')
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

  it('turn a square puzzle opened with the setting on into bands when the next puzzle is a hexagon grid', async () => {
    const square = await boardLink({ columns: 6, rows: 6 })
    const hex = await boardLink({ columns: 6, rows: 6, gridtype: 'hex' })
    const { context, page } = await openSolvePage(browser(), square, { served: true })
    await turnOn(page)
    assert.equal((await page.evaluate(labelsInPage)).length, 12)
    const here = page.url().split('#')[0]
    await page.goto('about:blank')
    await page.goto(here + hex)
    await waitForDesk(page)
    await assertBands(page)
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

describe('board coordinates on a grid that is not square', () => {
  for (const gridtype of ['hex', 'tri', 'pyramid']) {
    it(`show letters and numbers over the whole ${gridtype} grid at Fit and after zooming`, async () => {
      const { context, page } = await openSolvePage(browser(), await boardLink({ columns: 6, rows: 6, gridtype }), { served: true })
      assert.deepEqual(await page.evaluate(labelsInPage), [], 'off by default')
      await turnOn(page)
      await assertBands(page)
      const columnsAtFit = (await page.evaluate(labelsInPage)).filter((l) => l.axis === 'column').length
      await page.getByRole('button', { name: 'Zoom in' }).click()
      await page.getByRole('button', { name: 'Zoom in' }).click()
      await assertBands(page)
      assert.equal((await page.evaluate(labelsInPage)).filter((l) => l.axis === 'column').length, columnsAtFit, 'zoom keeps the band count')
      await page.getByRole('button', { name: 'Fit', exact: true }).click()
      await assertBands(page)
      await context.close()
    })
  }
})
