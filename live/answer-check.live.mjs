// The answer check (`pu.check_solution`) on a live page, for an answer the author set as OR categories.
import assert from 'node:assert/strict'
import { before, describe, it } from 'node:test'
import { ANSWER_CELL, makeNumberSolveLink, openPenpa, typeDigitInPage, useBrowser } from './page.mjs'
import { duplicateLinkInPage } from './replay.mjs'
import { settle } from './settle.mjs'

const browser = useBrowser()

// Index in `pu.centerlist` of a cell in the row of the given of `makeNumberSolveLink`'s puzzle, one the answer leaves empty.
const SAME_ROW_CELL = 2

// Runs in the page. Shades one cell as the author's answer, ticks the OR boxes for shading and black squares (the
// second category stays empty), and returns the solve link's `#` part, the shaded cell's index and the answer made.
function authorOrAnswerInPage () {
  const cell = pu.centerlist[5]
  pu.pu_a.surface[cell] = 1
  document.getElementById('sol_or_surface').checked = true
  document.getElementById('sol_or_square').checked = true
  const url = pu.maketext_solve_solution()
  return { query: url.slice(url.indexOf('#')), cell, answer: pu.make_solution() }
}

describe('an OR answer check with an empty category', () => {
  let author
  before(async () => {
    const opened = await openPenpa(browser())
    try {
      author = await opened.page.evaluate(authorOrAnswerInPage)
    } finally {
      await opened.context.close()
    }
  })

  it('is made with one empty category (the premise of the other tests)', () => {
    assert.deepEqual(author.answer, [[String(author.cell)], []])
  })

  it('leaves the empty grid unsolved', async () => {
    const { context, page } = await openPenpa(browser(), author.query)
    try {
      // Waits for 1 (solved); a fixed page stays 0 until `settle` gives up on it.
      const solved = await settle(() => page.evaluate(() => pu.sol_flag), 1)
      assert.equal(solved, 0)
      assert.equal(await page.locator('.swal2-popup').count(), 0, 'no Congratulations popup')
      assert.equal(await page.evaluate(() => sw_timer.isPaused()), false, 'timer still running')
    } finally {
      await context.close()
    }
  })

  it('solves once the cell is shaded', async () => {
    const { context, page } = await openPenpa(browser(), author.query)
    try {
      await page.evaluate((cell) => { pu.pu_a.surface[cell] = 1; pu.redraw() }, author.cell)
      assert.equal(await settle(() => page.evaluate(() => pu.sol_flag), 1), 1)
    } finally {
      await context.close()
    }
  })
})

describe('the solved flag of a number answer check', () => {
  let query
  before(async () => { query = await makeNumberSolveLink(browser()) })

  // A solve link carries no genre tags, so the page is tagged here for its conflict check to run.
  it('clears when a move puts a conflict on a solved board', async () => {
    const { context, page } = await openPenpa(browser(), query)
    try {
      await page.evaluate(() => { pu.user_tags = ['classic'] })
      await page.evaluate(typeDigitInPage, { index: ANSWER_CELL, digit: '2' })
      assert.equal(await settle(() => page.evaluate(() => pu.sol_flag), 1), 1, 'the board is solved (the premise)')
      // The given 1 shares row 0 with this cell.
      await page.evaluate(typeDigitInPage, { index: SAME_ROW_CELL, digit: '1' })
      assert.notEqual(await page.evaluate(() => pu.conflict_cells.length), 0, 'the move makes a conflict (the premise)')
      assert.equal(await page.evaluate(() => pu.sol_flag), 0)
    } finally {
      await context.close()
    }
  })

  it('is set when a solved board is loaded, with no input', async () => {
    const source = await openPenpa(browser(), query)
    let copy
    try {
      await source.page.evaluate(typeDigitInPage, { index: ANSWER_CELL, digit: '2' })
      assert.equal(await settle(() => source.page.evaluate(() => pu.sol_flag), 1), 1, 'the board is solved (the premise)')
      const link = await source.page.evaluate(duplicateLinkInPage)
      copy = await openPenpa(browser(), link.slice(link.indexOf('#')))
      assert.equal(await settle(() => copy.page.evaluate(() => pu.sol_flag), 1), 1)
    } finally {
      await source.context.close()
      await copy?.context.close()
    }
  })
})
