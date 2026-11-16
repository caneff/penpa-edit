// Sudoku corner mode in Solution mode (#140): the first mark of a cell lands top-left, whether or not the puzzle's
// given layer holds a small number (a killer's cage total). Real keys on Penpa+'s page; the board is read as the
// engine saves it (`pu.pu_a.numberS`).
import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { openPenpa, useBrowser } from './page.mjs'

const browser = useBrowser()

const SUDOKU = 'https://puzz.link/p?sudoku/9/9/15i96l17i7g65i42k1g5368h2i7g2p3h5g48g2g9k3h7i6'

// Index in `pu.centerlist` of a cell clear of the board's edges.
const CELL = 12

// Corner slots 0..3 are top-left, top-right, bottom-left, bottom-right; side slots 4..7 follow (class_square.js).
const SLOTS = 8

// Opens the 9x9 sudoku, gives it a small number in a cell's corner in the question layer when `killer` is set (as a
// killer's cage total is), and types `keys` into cell CELL in Solution mode's Sudoku corner submode. Returns the digit
// in each of the cell's 8 slots, '' where none.
async function typeCornerMarks (keys, { killer }) {
  const { context, page } = await openPenpa(browser(), '')
  try {
    await page.evaluate((u) => import_url(u), SUDOKU)
    if (killer) {
      await page.evaluate((i) => {
        pu.mode_qa('pu_q')
        pu.set_value('numberS', 4 * (pu.centerlist[i] + pu.nx0 * pu.ny0), ['12', 1])
        pu.mode_qa('pu_a')
      }, CELL)
    }
    await page.evaluate((i) => {
      pu.mode_set('sudoku')
      pu.mode.pu_a.sudoku[0] = '2'
      pu.selection = [pu.centerlist[i]]
      pu.cursol = pu.centerlist[i]
    }, CELL)
    for (const key of keys) await page.keyboard.press(key)
    return await page.evaluate((i) => {
      const k = pu.centerlist[i]
      const slots = []
      for (let j = 0; j < 4; j++) slots.push(pu.pu_a.numberS[4 * (k + pu.nx0 * pu.ny0) + j]?.[0] ?? '')
      for (let j = 0; j < 4; j++) slots.push(pu.pu_a.numberS[4 * (k + 2 * pu.nx0 * pu.ny0) + j]?.[0] ?? '')
      return slots
    }, CELL)
  } finally {
    await context.close()
  }
}

describe('Sudoku corner marks', () => {
  it('start top-left on a puzzle with a small given number, and a cell holds 8', async () => {
    const slots = await typeCornerMarks(['7', '2', '5', '1', '3', '4', '6', '8', '9'], { killer: true })
    assert.deepEqual(slots.slice(0, 4), ['7', '2', '5', '1'])
    assert.equal(slots.filter((s) => s !== '').length, 8)
  })

  it('start top-left on a puzzle with no small number', async () => {
    const slots = await typeCornerMarks(['7', '2', '5', '1'], { killer: false })
    assert.deepEqual(slots, ['7', '2', '5', '1', '', '', '', ''])
  })
})
