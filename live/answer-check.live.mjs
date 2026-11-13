// The answer check (`pu.check_solution`) on a live page, for an answer the author set as OR categories.
import assert from 'node:assert/strict'
import { before, describe, it } from 'node:test'
import { openPenpa, useBrowser } from './page.mjs'
import { settle } from './settle.mjs'

const browser = useBrowser()

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
