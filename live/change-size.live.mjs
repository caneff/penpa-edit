// Change size on solve.html (#274): blank rows and columns added to or removed from each side of a square-cell board, through
// the bridge's `changeSize` and the Board card's dialog. A removal that would take a given or an entry with it is refused, as
// is any change on a grid that is not square; the new size survives a reload and the solve link, and undo does not take it
// back. Read through where Penpa+ draws the cells and the given.
import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import {
  boardAgainstCard, DIGIT_CELL, linkFromNewBoard, makeNumberSolveLink, openSolvePage, typeDigitInPage, useBrowser, waitForDesk
} from './page.mjs'
import { settle } from './settle.mjs'

const browser = useBrowser()

const BOARD = 'section[aria-label="Board"]'
const DIALOG = 'Change size'
// The 4x4 board of makeNumberSolveLink, its given in the top-left cell.
const START = { columns: 4, rows: 4, given: [0, 0] }

// Runs in the page: the board as drawn, in screen terms. `columns` and `rows` count the drawn cells, blank rows and columns
// included; `given` is the column and row of the board's first given, counted from the top-left; `givens` and `entries`
// count what Penpa+ keeps of each.
// Penpa+ draws the cells `i + j * nx0` with i and j from 2 to nx0 - 3 and ny0 - 3; the rest of `pu.point` is outside the board.
function layoutInPage () {
  const cells = []
  for (let j = 2; j < pu.ny0 - 2; j++) for (let i = 2; i < pu.nx0 - 2; i++) cells.push(pu.point[i + j * pu.nx0])
  // To the hundredth of a pixel: a turned board puts centres at half pixels, give or take a float's error.
  const at = (v) => Math.round(v * 100) / 100
  const xs = [...new Set(cells.map((p) => at(p.x)))].sort((a, b) => a - b)
  const ys = [...new Set(cells.map((p) => at(p.y)))].sort((a, b) => a - b)
  const givenAt = Object.keys(pu.pu_q.number)[0]
  const given = givenAt === undefined ? null : [xs.indexOf(at(pu.point[givenAt].x)), ys.indexOf(at(pu.point[givenAt].y))]
  return { columns: xs.length, rows: ys.length, given, givens: Object.keys(pu.pu_q.number).length, entries: Object.keys(pu.pu_a.number).length }
}
const layout = (page) => page.evaluate(layoutInPage)
const shape = async (page) => {
  const { columns, rows, given } = await layout(page)
  return { columns, rows, given }
}

// Runs in the page: what `engine.changeSize(side, change)` threw, or 'no throw'.
function refusalInPage ([side, change]) {
  try {
    engine.changeSize(side, change)
    return 'no throw'
  } catch (e) {
    return e.message
  }
}
const refusal = (page, side, change) => page.evaluate(refusalInPage, [side, change])

let numberLink
const openNumberBoard = async (options) => {
  numberLink ??= await makeNumberSolveLink(browser())
  return openSolvePage(browser(), numberLink, options)
}

// Runs in the page: a new board of `columns` x `rows` cells of `gridtype`, `space` of them blank on every side, the grid's
// first cell given a 1, the first `topClues` cells of the top blank row given 1, 2, ..., and with `topLine` a given
// thermometer and a given line through its second and third cells; turned by Penpa+'s `rotate_grid(turn)`, and flipped
// with `flip` 'UD' (top to bottom) or 'LR'. Returns its solve link's `#` part.
function boardLinkInPage ({ columns, rows, gridtype = 'square', space = 0, topClues = 0, topLine = null, turn = 0, flip = null }) {
  document.getElementById('gridtype').value = gridtype
  UserSettings.gridtype = gridtype
  document.getElementById('nb_size1').value = columns
  document.getElementById('nb_size2').value = rows
  for (const side of [1, 2, 3, 4]) document.getElementById(`nb_space${side}`).value = space
  create_newboard()
  pu.pu_q.number[pu.centerlist[0]] = [1, 1, '1']
  // Penpa+'s cells are `i + j * nx0`, the board's first row at j = 2 and its first column at i = 2.
  for (let k = 0; k < topClues; k++) pu.pu_q.number[2 + k + 2 * pu.nx0] = [String(k + 1), 1, '1']
  const [second, third] = [3 + 2 * pu.nx0, 4 + 2 * pu.nx0]
  if (topLine === 'thermo') pu.pu_q.thermo.push([second, third])
  if (topLine === 'line') pu.pu_q.line[`${second},${third}`] = 3
  if (turn) pu.rotate_grid(turn)
  if (flip) pu[`rotate_${flip}`]()
  const url = pu.maketext_solve()
  return url.slice(url.indexOf('#'))
}
const boardLink = (options) => linkFromNewBoard(browser(), boardLinkInPage, options)

describe('engine.changeSize on a square-cell board', () => {
  it('adds a blank row or column on the side it names, and removes it again', async () => {
    const { context, page, errors } = await openNumberBoard()
    try {
      assert.deepEqual(await shape(page), START)
      const steps = [
        ['top', 1, { columns: 4, rows: 5, given: [0, 1] }],
        ['left', 1, { columns: 5, rows: 5, given: [1, 1] }],
        ['bottom', 1, { columns: 5, rows: 6, given: [1, 1] }],
        ['right', 1, { columns: 6, rows: 6, given: [1, 1] }],
        ['top', -1, { columns: 6, rows: 5, given: [1, 0] }],
        ['left', -1, { columns: 5, rows: 5, given: [0, 0] }],
        ['bottom', -1, { columns: 5, rows: 4, given: [0, 0] }],
        ['right', -1, START]
      ]
      for (const [side, change, want] of steps) {
        await page.evaluate(([s, c]) => engine.changeSize(s, c), [side, change])
        assert.deepEqual(await shape(page), want, `after ${side} ${change}`)
        assert.equal((await layout(page)).givens, 1, `the given stays after ${side} ${change}`)
      }
      assert.deepEqual(errors, [])
    } finally {
      await context.close()
    }
  })

  it('throws on a side or change it does not know', async () => {
    const { context, page } = await openNumberBoard()
    try {
      assert.match(await refusal(page, 'up', 1), /no side "up"/)
      assert.match(await refusal(page, 'top', 2), /change must be 1 or -1, got 2/)
      assert.deepEqual(await shape(page), START)
    } finally {
      await context.close()
    }
  })

  it('reports the board\'s size, and what each side allows, in getSizeChanges', async () => {
    const { context, page } = await openNumberBoard()
    try {
      await page.evaluate(() => engine.changeSize('top', 1))
      const changes = await page.evaluate(() => engine.getSizeChanges())
      assert.equal(changes.unavailable, null)
      assert.deepEqual([changes.columns, changes.rows], [4, 5])
      assert.deepEqual(Object.keys(changes.sides).sort(), ['bottom', 'left', 'right', 'top'])
      for (const side of ['top', 'bottom', 'left', 'right']) assert.equal(changes.sides[side].add, null, `${side} can add`)
      assert.equal(changes.sides.top.remove, null, 'the blank top row can go')
      for (const side of ['bottom', 'left', 'right']) assert.match(changes.sides[side].remove, /part of the grid/, `${side} cannot remove`)
    } finally {
      await context.close()
    }
  })

  it('refuses to remove a row or column of the grid itself, and changes nothing', async () => {
    const { context, page } = await openNumberBoard()
    try {
      for (const side of ['top', 'bottom', 'left', 'right']) {
        assert.match(await refusal(page, side, -1), /part of the grid/, side)
        assert.deepEqual(await shape(page), START, `nothing changed on ${side}`)
      }
    } finally {
      await context.close()
    }
  })

  it('refuses to remove a blank row that holds a given, and removes one that holds nothing', async () => {
    // A 6x6 board, one blank cell all round, three clues in the top blank row from the left: the top row and the left
    // column hold a clue, the bottom row and the right column hold none.
    const { context, page } = await openSolvePage(browser(), await boardLink({ columns: 6, rows: 6, space: 1, topClues: 3 }))
    try {
      const before = await layout(page)
      const sides = (await page.evaluate(() => engine.getSizeChanges())).sides
      assert.match(sides.top.remove, /holds a given/)
      assert.match(sides.left.remove, /holds a given/)
      assert.match(await refusal(page, 'top', -1), /holds a given/)
      assert.match(await refusal(page, 'left', -1), /holds a given/)
      assert.deepEqual(await layout(page), before, 'nothing changed')
      await page.evaluate(() => { engine.changeSize('bottom', -1); engine.changeSize('right', -1) })
      const after = await layout(page)
      assert.deepEqual([after.columns, after.rows, after.givens], [before.columns - 1, before.rows - 1, before.givens])
    } finally {
      await context.close()
    }
  })

  it('refuses to remove a blank row that holds an entry Penpa+ keeps there', async () => {
    const { context, page } = await openNumberBoard()
    try {
      await page.evaluate(() => engine.changeSize('top', 1))
      // The new row's first cell: Penpa+'s board starts at column 2 and row 2 of its point ids.
      await page.evaluate(() => { pu.pu_a.number[2 + 2 * pu.nx0] = ['5', 2, '1'] })
      assert.match(await refusal(page, 'top', -1), /holds an entry/)
      const after = await layout(page)
      assert.deepEqual([after.rows, after.entries], [5, 1])
    } finally {
      await context.close()
    }
  })

  it('refuses to remove a blank row that holds a given thermometer or line', async () => {
    for (const topLine of ['thermo', 'line']) {
      const { context, page } = await openSolvePage(browser(), await boardLink({ columns: 6, rows: 6, space: 1, topLine }))
      try {
        assert.match(await refusal(page, 'top', -1), /holds a given/, topLine)
        assert.equal((await page.evaluate(() => engine.getSizeChanges())).sides.bottom.remove, null, `${topLine}: the bottom row can go`)
      } finally {
        await context.close()
      }
    }
  })

  it('refuses to add past Penpa+\'s largest board', async () => {
    const { context, page } = await openSolvePage(browser(), await boardLink({ columns: 100, rows: 2 }))
    try {
      const sides = (await page.evaluate(() => engine.getSizeChanges())).sides
      assert.match(sides.left.add, /100/)
      assert.match(sides.right.add, /100/)
      assert.equal(sides.top.add, null)
      assert.match(await refusal(page, 'left', 1), /100/)
      assert.deepEqual((await shape(page)).columns, 100)
    } finally {
      await context.close()
    }
  })

  it('adds and removes on the side named as the board is drawn, when the link turns or flips it', async () => {
    for (const options of [{ turn: 90 }, { turn: 180 }, { turn: 270 }, { flip: 'UD' }, { flip: 'LR' }]) {
      const { context, page } = await openSolvePage(browser(), await boardLink({ columns: 3, rows: 2, ...options }))
      try {
        const before = await shape(page)
        await page.evaluate(() => engine.changeSize('top', 1))
        const after = await shape(page)
        assert.deepEqual(after, { columns: before.columns, rows: before.rows + 1, given: [before.given[0], before.given[1] + 1] }, JSON.stringify(options))
        await page.evaluate(() => engine.changeSize('right', 1))
        assert.deepEqual(await shape(page), { ...after, columns: after.columns + 1 }, JSON.stringify(options))
        await page.evaluate(() => { engine.changeSize('top', -1); engine.changeSize('right', -1) })
        assert.deepEqual(await shape(page), before, `${JSON.stringify(options)}: removed again`)
      } finally {
        await context.close()
      }
    }
  })

  it('keeps the new size through a reload of saved progress and in the solve link', async () => {
    const { context, page } = await openNumberBoard({ served: true })
    try {
      await page.evaluate(() => { engine.changeSize('top', 1); engine.changeSize('left', 1) })
      const changed = await shape(page)
      assert.equal(await page.evaluate(() => engine.saveProgress()), true)
      const solveLink = await page.evaluate(() => { const url = pu.maketext_solve(); return url.slice(url.indexOf('#')) })
      await page.reload()
      await waitForDesk(page)
      assert.deepEqual(await shape(page), changed, 'the reload keeps it')
      const fresh = await openSolvePage(browser(), solveLink)
      try {
        assert.deepEqual(await shape(fresh.page), changed, 'the solve link keeps it')
      } finally {
        await fresh.context.close()
      }
    } finally {
      await context.close()
    }
  })

  it('is not taken back by undo, which takes back the entry before it', async () => {
    const { context, page } = await openNumberBoard()
    try {
      await page.evaluate(typeDigitInPage, { index: DIGIT_CELL, digit: '3' })
      await page.evaluate(() => engine.changeSize('top', 1))
      assert.equal(await page.evaluate(() => engine.undo()), true)
      const after = await layout(page)
      assert.deepEqual([after.rows, after.entries], [5, 0])
    } finally {
      await context.close()
    }
  })
})

describe('engine.changeSize on a grid that is not square', () => {
  it('is unavailable, saying why, and refuses every change', async () => {
    const { context, page } = await openSolvePage(browser(), await boardLink({ columns: 4, rows: 4, gridtype: 'hex' }))
    try {
      const changes = await page.evaluate(() => engine.getSizeChanges())
      assert.match(changes.unavailable, /square cells/)
      for (const side of ['top', 'bottom', 'left', 'right']) {
        assert.equal(changes.sides[side].add, changes.unavailable)
        assert.equal(changes.sides[side].remove, changes.unavailable)
      }
      assert.match(await refusal(page, 'top', 1), /square cells/)
    } finally {
      await context.close()
    }
  })
})

// ---- The Board card's dialog --------------------------------------------------------------------------------------

const openDialog = async (page) => {
  await page.locator(BOARD).getByRole('button', { name: 'Change size' }).click()
  await page.getByRole('dialog', { name: DIALOG }).waitFor()
  // The dialog's content is slotted into Web Awesome's shadow `dialog`, so it is found from the host.
  return page.locator('wa-dialog[open]')
}
const cellSize = (page) => page.evaluate(() => engine.getState().cellSize)
// The wa-button named `label`: the element its look is set on, where `getByRole` finds the button inside it.
const sideHost = (dialog, label) => dialog.locator('wa-button').filter({ hasText: label })

describe('the Change size dialog', () => {
  it('adds and removes a blank row with + and − on a side, shows the size, and refits the board', async () => {
    const { context, page, errors } = await openNumberBoard()
    try {
      for (let i = 0; i < 3; i++) await page.locator(BOARD).getByRole('button', { name: 'Zoom in' }).click()
      const zoomed = await cellSize(page)
      const dialog = await openDialog(page)
      await dialog.getByText('4 × 4').waitFor()
      await dialog.getByRole('button', { name: 'Add a row above' }).click()
      await dialog.getByText('4 × 5').waitFor()
      assert.deepEqual(await shape(page), { columns: 4, rows: 5, given: [0, 1] })
      const refitted = await settle(() => cellSize(page), (px) => px !== zoomed)
      assert.notEqual(refitted, zoomed, 'the zoom gave way to a fit')
      assert.equal((await boardAgainstCard(page)).inside, true, 'the board fits its card')
      await dialog.getByRole('button', { name: 'Remove the row above' }).click()
      await dialog.getByText('4 × 4').waitFor()
      assert.deepEqual(await shape(page), START)
      assert.deepEqual(errors, [])
    } finally {
      await context.close()
    }
  })

  it('says why a side cannot change when its button is pressed, and changes nothing', async () => {
    const { context, page } = await openNumberBoard()
    try {
      const dialog = await openDialog(page)
      const remove = dialog.getByRole('button', { name: 'Remove the row above' })
      assert.match(await sideHost(dialog, 'Remove the row above').textContent(), /Remove the row above: The top row is part of the grid\./, 'its name says why')
      assert.equal(await sideHost(dialog, 'Remove the row above').getAttribute('data-refused'), '', 'it is dimmed')
      assert.equal(await sideHost(dialog, 'Add a row above').getAttribute('data-refused'), null, 'add is not')
      await remove.click()
      await dialog.getByRole('status').getByText(/part of the grid/).waitFor()
      assert.deepEqual(await shape(page), START)
    } finally {
      await context.close()
    }
  })

  it('on a grid that is not square, dims its button, says why and refuses every side', async () => {
    const { context, page } = await openSolvePage(browser(), await boardLink({ columns: 4, rows: 4, gridtype: 'hex' }))
    try {
      const entry = page.locator(`${BOARD} wa-button.ui-change-size`)
      assert.equal(await entry.getAttribute('data-refused'), '', 'the button is dimmed')
      assert.equal(await page.locator(`wa-tooltip[for="${await entry.getAttribute('id')}"]`).textContent(), 'Change size: Only a grid of square cells can change size.')
      const dialog = await openDialog(page)
      await dialog.getByRole('status').getByText(/square cells/).waitFor()
      const sides = dialog.locator('wa-button').filter({ hasText: /^(\u2212|\+)(Add|Remove) / })
      assert.equal(await sides.count(), 8)
      for (const button of await sides.all()) {
        assert.equal(await button.getAttribute('data-refused'), '')
        assert.match(await button.textContent(), /: Only a grid of square cells can change size\.$/)
      }
    } finally {
      await context.close()
    }
  })
})
