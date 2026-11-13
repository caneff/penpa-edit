// Undo after reopening saved progress: one undo removes one group of edits, and the stacks stay paired (#19).
import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { openPenpa, shadeInPage, useBrowser } from './page.mjs'
import { settle } from './settle.mjs'

const browser = useBrowser()

// Index in `pu.centerlist` of the cell each session shades.
const SAVED_CELL = 12
const NEW_CELL = 20
// The group id of the recorded line-edge delete, and the line edge's key.
const GROUP = 7
const LINE_EDGE = '5,6'

// Runs in the page: puts a given in the first cell, and returns the solve link that opens it.
function solveLinkInPage () {
  pu.pu_q.number[pu.centerlist[0]] = [5, 1, '1']
  return pu.maketext_solve()
}

// Runs in the page: what each undo stack holds, and the counter.
function stateInPage () {
  const lengths = ['pu_q', 'pu_q_col', 'pu_a', 'pu_a_col'].map((p) => pu[p].command_undo.__a.length)
  return { shaded: Object.keys(pu.pu_a.surface), lengths, counter: pu.undoredo_counter }
}

describe('undo after reopening saved progress', () => {
  it('removes one group of edits, not two, and keeps the stacks paired', async () => {
    const { context, page } = await openPenpa(browser(), '', { served: true })
    const origin = new URL(page.url()).origin + '/'
    const link = await page.evaluate(solveLinkInPage)
    const hash = link.slice(link.indexOf('#'))
    // Both sessions share one context, so the second reads the progress the first saved.
    const open = async () => {
      const p = await context.newPage()
      await p.goto(origin + hash)
      await p.waitForFunction(() => typeof pu !== 'undefined')
      return p
    }

    const first = await open()
    await first.evaluate(shadeInPage, SAVED_CELL)
    const savedGroup = await first.evaluate(() => pu.pu_a.command_undo.__a.at(-1)[4])
    await first.evaluate(() => PenpaProgress.save())
    const savedCell = String(await first.evaluate((i) => pu.centerlist[i], SAVED_CELL))
    await first.close()

    const second = await open()
    const restored = await settle(() => second.evaluate(stateInPage).then((s) => s.shaded), [savedCell])
    assert.deepEqual(restored, [savedCell], 'the saved move is restored')
    assert.equal((await second.evaluate(stateInPage)).counter, savedGroup + 1, 'the counter starts past the restored group')
    await second.evaluate(shadeInPage, NEW_CELL)
    await second.evaluate(() => pu.undo())
    const after = await second.evaluate(stateInPage)
    assert.deepEqual(after.shaded, [savedCell], 'one undo removes the new move only')
    assert.equal(after.lengths[2], after.lengths[3], 'the answer and its colors have equal undo lengths')
    assert.equal(after.lengths[0], after.lengths[1], 'the question and its colors have equal undo lengths')
    await context.close()
  })
})

// Runs in the page: records a delete of the question's line edge in the answer, as group `group`, and returns what
// the answer's stacks hold for each of `record` and `record_replay`.
function recordDeleteLineEInPage ({ key, group }) {
  pu.mode.qa = 'pu_a'
  pu.pu_q.deletelineE[key] = 1
  pu.record('deletelineE', key, group)
  pu.record_replay('deletelineE', key, group)
  const last = (stack) => stack.__a[stack.__a.length - 1]
  return {
    undo: [last(pu.pu_a.command_undo), last(pu.pu_a_col.command_undo)],
    replay: [last(pu.pu_a.command_replay), last(pu.pu_a_col.command_replay)]
  }
}

describe('recording the delete of a question line edge', () => {
  it('keeps the edge and the group id on both stacks of the answer', async () => {
    const { context, page } = await openPenpa(browser())
    const r = await page.evaluate(recordDeleteLineEInPage, { key: LINE_EDGE, group: GROUP })
    for (const stacks of [r.undo, r.replay]) {
      assert.deepEqual(stacks.map((e) => e.slice(0, 5)), [
        ['deletelineE', LINE_EDGE, '1', 'pu_q', GROUP],
        ['deletelineE', LINE_EDGE, '1', 'pu_q_col', GROUP]
      ])
    }
    await context.close()
  })
})
