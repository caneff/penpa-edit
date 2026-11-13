// Making a link must leave the live answer replay alone, and an edit link keeps it out of the link (#22).
import assert from 'node:assert/strict'
import { after, before, describe, it } from 'node:test'
import { openPenpa, useBrowser } from './page.mjs'

const browser = useBrowser()

const LINK_MAKERS = ['maketext', 'maketext_duplicate', 'maketext_solve', 'maketext_compsolve', 'maketext_solve_solution', 'maketext_replay']

// Runs in the page. Records two replay entries on each answer stack, calls `maker`, and returns the entries of both
// stacks before and after.
function makeLinkInPage (maker) {
  const stacks = [pu.pu_a.command_replay, pu.pu_a_col.command_replay]
  for (const stack of stacks) {
    stack.push(['surface', 1, 1, 'pu_a', 0, 0])
    stack.push(['surface', 2, 1, 'pu_a', 0, 0])
  }
  const before = JSON.stringify(stacks.map((s) => s.__a))
  pu[maker]()
  return { before, after: JSON.stringify(stacks.map((s) => s.__a)) }
}

// Runs in the page. Returns whether the edit link made with replay entries on both stacks equals the one made with both empty.
function replayLeftOutOfLinkInPage () {
  const stacks = [pu.pu_a.command_replay, pu.pu_a_col.command_replay]
  const linkWithoutReplay = pu.maketext()
  for (const stack of stacks) stack.push(['surface', 1, 1, 'pu_a', 0, 0])
  const link = pu.maketext()
  for (const stack of stacks) stack.__a = []
  return link === linkWithoutReplay
}

describe('making a link', () => {
  let opened
  before(async () => { opened = await openPenpa(browser()) })
  after(async () => { await opened?.context.close() })

  for (const maker of LINK_MAKERS) {
    it(`${maker} leaves both answer replay stacks as they were`, async () => {
      const r = await opened.page.evaluate(makeLinkInPage, maker)
      assert.equal(r.after, r.before)
    })
  }

  it('an edit link keeps the answer replay out of the link', async () => {
    assert.equal(await opened.page.evaluate(replayLeftOutOfLinkInPage), true)
  })
})
