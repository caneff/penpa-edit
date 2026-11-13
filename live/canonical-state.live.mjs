// Canonical state (`live/canonical-state.mjs`) read from a live page: two loads agree, a moved digit moves one line,
// and a duplicate link reopens to the same state.
import assert from 'node:assert/strict'
import { before, describe, it } from 'node:test'
import { canonicalState, readEngineState } from './canonical-state.mjs'
import { openPenpa, useBrowser } from './page.mjs'
import { settle } from './settle.mjs'

const browser = useBrowser()

// Index in `pu.centerlist` of the given's cell, of the cell the author's answer fills, and of a cell left empty.
const GIVEN_CELL = 0
const ANSWER_CELL = 1
const OTHER_CELL = 2
// A timer reading far from a fresh page's, in seconds.
const LATE_SECONDS = 30

// Runs in the page. Builds a 4x4 classic sudoku with one given and a one-digit author's answer, and returns its solve
// link's `#` part.
function solveLinkInPage ({ given, answer }) {
  document.getElementById('nb_size1').value = 4
  document.getElementById('nb_size2').value = 4
  create_newboard()
  pu.user_tags = ['classic']
  pu.pu_q.number[pu.centerlist[given]] = [1, 1, '1']
  pu.pu_a.number[pu.centerlist[answer]] = [2, 2, '1']
  const url = pu.maketext_solve_solution()
  return url.slice(url.indexOf('#'))
}

// Runs in the page: types `digit` into the cell at `index` of the center list, as a key press in Number mode does.
function typeDigitInPage ({ index, digit }) {
  pu.mode_set('number')
  pu.cursol = pu.centerlist[index]
  pu.selection = [pu.cursol]
  pu.key_number(digit)
  pu.redraw()
}

// Opens the solve link and returns its page once the given has loaded.
async function openSolve (query) {
  const opened = await openPenpa(browser(), query)
  const givens = await settle(() => opened.page.evaluate(() => Object.keys(pu.pu_q.number).length), 1)
  assert.equal(givens, 1, 'the given has loaded')
  return opened
}

const read = (page) => page.evaluate(readEngineState).then(canonicalState)

describe('canonical state on a live page', () => {
  let query
  before(async () => {
    const { context, page } = await openPenpa(browser())
    try {
      query = await page.evaluate(solveLinkInPage, { given: GIVEN_CELL, answer: ANSWER_CELL })
    } finally {
      await context.close()
    }
  })

  it('is byte-identical for two loads of one link with the same digit typed at different timer readings', async () => {
    const first = await openSolve(query)
    const second = await openSolve(query)
    try {
      assert.equal(await read(second.page), await read(first.page), 'the same right after loading')
      await second.page.evaluate((seconds) => {
        sw_timer.stop()
        sw_timer.start({ precision: 'secondTenths', startValues: { seconds } })
      }, LATE_SECONDS)
      const stamps = []
      for (const { page } of [first, second]) {
        await page.evaluate(typeDigitInPage, { index: OTHER_CELL, digit: '3' })
        stamps.push(await page.evaluate(() => pu.pu_a.command_replay.__a[0][5]))
      }
      assert.notEqual(stamps[0], stamps[1], 'the replay timestamps differ (the premise)')
      assert.equal(await read(second.page), await read(first.page))
    } finally {
      await first.context.close()
      await second.context.close()
    }
  })

  it('changes only the moved digit\'s line when a digit moves to another cell', async () => {
    const { context, page } = await openSolve(query)
    try {
      const cells = await page.evaluate(([from, to]) => [pu.centerlist[from], pu.centerlist[to]], [ANSWER_CELL, OTHER_CELL])
      await page.evaluate((from) => { pu.pu_a.number[from] = ['3', 2, '1'] }, cells[0])
      const was = (await read(page)).split('\n')
      await page.evaluate(([from, to]) => {
        pu.pu_a.number[to] = pu.pu_a.number[from]
        delete pu.pu_a.number[from]
      }, cells)
      const now = (await read(page)).split('\n')
      assert.deepEqual({
        gone: was.filter((l) => !now.includes(l)),
        added: now.filter((l) => !was.includes(l))
      }, {
        gone: [`pu_a.number.${cells[0]} = ["3",2,"1"]`],
        added: [`pu_a.number.${cells[1]} = ["3",2,"1"]`]
      })
    } finally {
      await context.close()
    }
  })

  // A duplicate link carries no selection, so the copy opens with none.
  it('reopens a solved board from its duplicate link to the same state but the selection', async () => {
    const source = await openSolve(query)
    let copy
    try {
      await source.page.evaluate(typeDigitInPage, { index: ANSWER_CELL, digit: '2' })
      assert.equal(await settle(() => source.page.evaluate(() => pu.sol_flag), 1), 1, 'the board is solved (the premise)')
      const state = await read(source.page)
      assert.match(state, /^selection = \[\d+\]$/m, 'a cell is selected (the premise)')
      const link = await source.page.evaluate(() => {
        savetext_clone()
        return document.getElementById('savetextarea').value
      })
      copy = await openPenpa(browser(), link.slice(link.indexOf('#')))
      const expected = state.replace(/^selection = .*$/m, 'selection = []')
      assert.equal(await settle(() => read(copy.page), expected), expected)
    } finally {
      await source.context.close()
      await copy?.context.close()
    }
  })
})
