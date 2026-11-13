// Undo after reopening saved progress: one undo removes one move (#19).
import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { openPenpa, useBrowser } from './page.mjs'
import { settle } from './settle.mjs'

const browser = useBrowser()

// Runs in the page: puts a given in the first cell, and returns the solve link that opens it.
function solveLinkInPage () {
  pu.pu_q.number[pu.centerlist[0]] = [5, 1, '1']
  return pu.maketext_solve()
}

// Runs in the page: shades the cell at `index` of the center list as one move, the way a click does.
function shadeInPage (index) {
  pu.mode_set('surface')
  pu.undoredo_counter++
  pu.record('surface', pu.centerlist[index], pu.undoredo_counter)
  pu.pu_a.surface[pu.centerlist[index]] = 1
  pu.redraw()
}

const shadedCells = () => Object.keys(pu.pu_a.surface)

describe('undo after reopening saved progress', () => {
  it('removes one move, not two', async () => {
    const { context, page } = await openPenpa(browser(), '', { served: true })
    const origin = new URL(page.url()).origin + '/'
    const link = await page.evaluate(solveLinkInPage)
    const query = link.slice(link.indexOf('#'))
    // Both sessions share one context, so the second reads the progress the first saved.
    const open = async () => {
      const p = await context.newPage()
      await p.goto(origin + query)
      await p.waitForFunction(() => typeof pu !== 'undefined')
      return p
    }

    const first = await open()
    await first.evaluate(shadeInPage, 12)
    await first.evaluate(() => PenpaProgress.save())
    await first.close()

    const second = await open()
    assert.equal((await settle(() => second.evaluate(shadedCells), [String(await second.evaluate(() => pu.centerlist[12]))])).length, 1, 'the saved move is restored')
    await second.evaluate(shadeInPage, 20)
    assert.equal((await second.evaluate(shadedCells)).length, 2)
    await second.evaluate(() => pu.undo())
    assert.equal((await second.evaluate(shadedCells)).length, 1, 'one undo removes one move')
    await context.close()
  })
})

// Runs in the page: records a delete of the question's line edge `key` in the answer, as group 7, and returns what
// the answer's stacks hold for each of `record` and `record_replay`.
function recordDeleteLineEInPage () {
  pu.mode.qa = 'pu_a'
  const key = '5,6'
  pu.pu_q.deletelineE[key] = 1
  pu.record('deletelineE', key, 7)
  pu.record_replay('deletelineE', key, 7)
  const last = (stack) => stack.__a[stack.__a.length - 1]
  return {
    undo: [last(pu.pu_a.command_undo), last(pu.pu_a_col.command_undo)],
    replay: [last(pu.pu_a.command_replay), last(pu.pu_a_col.command_replay)],
    lengths: [pu.pu_a.command_undo, pu.pu_a_col.command_undo, pu.pu_a.command_replay, pu.pu_a_col.command_replay].map((s) => s.__a.length)
  }
}

describe('recording the delete of a question line edge', () => {
  it('keeps the edge and the group id on both stacks of the answer', async () => {
    const { context, page } = await openPenpa(browser())
    const r = await page.evaluate(recordDeleteLineEInPage)
    for (const stacks of [r.undo, r.replay]) {
      assert.deepEqual(stacks.map((e) => e.slice(0, 5)), [['deletelineE', '5,6', '1', 'pu_q', 7], ['deletelineE', '5,6', '1', 'pu_q_col', 7]])
    }
    assert.deepEqual(r.lengths, [1, 1, 1, 1])
    await context.close()
  })
})
