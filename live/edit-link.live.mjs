// Making an edit link must leave the live answer replay alone and keep it out of the link (#22).
import assert from 'node:assert/strict'
import { after, before, describe, it } from 'node:test'
import { openPenpa, useBrowser } from './page.mjs'

const browser = useBrowser()

// Runs in the page. Records two replay entries on each answer stack, makes the edit link, and returns the stack
// lengths before and after, plus whether the link equals the one made with both replay stacks empty.
function makeLinkInPage () {
  const lengths = () => [pu.pu_a.command_replay.size(), pu.pu_a_col.command_replay.size()]
  for (const stack of [pu.pu_a.command_replay, pu.pu_a_col.command_replay]) {
    stack.push(['surface', 1, 1, 'pu_a', 0, 0])
    stack.push(['surface', 2, 1, 'pu_a', 0, 0])
  }
  const before = lengths()
  const link = pu.maketext()
  const after = lengths()
  const kept = [pu.pu_a.command_replay.__a, pu.pu_a_col.command_replay.__a]
  pu.pu_a.command_replay.__a = []
  pu.pu_a_col.command_replay.__a = []
  const linkWithoutReplay = pu.maketext()
  pu.pu_a.command_replay.__a = kept[0]
  pu.pu_a_col.command_replay.__a = kept[1]
  return { before, after, replayLeftOutOfLink: link === linkWithoutReplay }
}

describe('making an edit link', () => {
  let opened
  before(async () => { opened = await openPenpa(browser()) })
  after(async () => { await opened?.context.close() })

  it('leaves both answer replay stacks as they were', async () => {
    const r = await opened.page.evaluate(makeLinkInPage)
    assert.deepEqual(r.after, r.before)
  })

  it('keeps the answer replay out of the link', async () => {
    const r = await opened.page.evaluate(makeLinkInPage)
    assert.equal(r.replayLeftOutOfLink, true)
  })
})
