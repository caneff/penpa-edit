// The answer check (`pu.check_solution`) on a live page, for an answer the author set as OR categories.
import assert from 'node:assert/strict'
import { after, before, describe, it } from 'node:test'
import { openPenpa, useBrowser } from './page.mjs'
import { settle } from './settle.mjs'

const browser = useBrowser()

// Runs in the page. Shades one cell as the author's answer, ticks the OR boxes for shading and black squares (the
// second category stays empty), and returns the solve link's `#` part with the cell's index.
function authorOrAnswerInPage () {
  const cell = pu.centerlist[5]
  pu.pu_a.surface[cell] = 1
  document.getElementById('sol_or_surface').checked = true
  document.getElementById('sol_or_square').checked = true
  const url = pu.maketext_solve_solution()
  return { query: url.slice(url.indexOf('#')), cell, answer: pu.make_solution() }
}

describe('an OR answer check with an empty category', () => {
  let solveLink
  before(async () => {
    const author = await openPenpa(browser())
    try {
      solveLink = await author.page.evaluate(authorOrAnswerInPage)
    } finally {
      await author.context.close()
    }
  })

  it('is made with one empty category (the premise of the other tests)', () => {
    assert.deepEqual(solveLink.answer, [[String(solveLink.cell)], []])
  })

  it('leaves the empty grid unsolved', async () => {
    const { page } = await openPenpa(browser(), solveLink.query)
    // Waits for 1 (solved); a fixed page stays 0 until `settle` gives up on it.
    const solved = await settle(() => page.evaluate(() => pu.sol_flag), 1)
    assert.equal(solved, 0)
    assert.equal(await page.locator('.swal2-popup').count(), 0, 'no Congratulations popup')
    assert.equal(await page.evaluate(() => sw_timer.isPaused()), false, 'timer still running')
  })

  it('solves once the cell is shaded', async () => {
    const { page } = await openPenpa(browser(), solveLink.query)
    await page.evaluate((cell) => { pu.pu_a.surface[cell] = 1; pu.redraw() }, solveLink.cell)
    assert.equal(await settle(() => page.evaluate(() => pu.sol_flag), 1), 1)
  })
})
