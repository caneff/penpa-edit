// A card whose content makes it taller on a layout the solver changed stays clear of its neighbours (#288): the UI fuzz's
// shrunk repros, replayed as scripted lists on the solve page, every rule checked after each step, cards-do-not-overlap
// among them.
import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { useBrowser } from './page.mjs'
import { scriptedList } from './ui-fuzz/actions.mjs'
import { runScript } from './ui-fuzz/engine.mjs'
import { uiFuzzPuzzles } from './ui-fuzz/puzzles.mjs'
import { openTarget } from './ui-fuzz/target.mjs'

const browser = useBrowser()
const puzzles = await uiFuzzPuzzles()

// The indices the action kinds take (live/ui-fuzz/actions.mjs): cards, resize handles and moves.
const [RULES, PINNED, MODE] = [2, 3, 4]
const TOP = 0
const [MINUS_240, MINUS_80, NONE, PLUS_20] = [0, 1, 3, 4]

const puzzle = (name) => puzzles.find((p) => p.name === name)
const replays = (name, steps) => runScript({ openTarget: openTarget(browser()), puzzle: puzzle(name), actions: scriptedList(steps) })

// Rules dragged into the top corner, then a preset load, which sizes the cards the solver left alone again.
const RULES_DRAGGED = [
  ['card drag', [RULES, MINUS_240, MINUS_240]],
  ['preset load', 1]
]

describe('a card that grows on a layout the solver changed', () => {
  it('Pinned, taller with its preset undo line, stays clear of a Mode card resized by hand (the ticket\'s repro)', async () => {
    await replays('akari', [
      ['card drag', [PINNED, MINUS_240, MINUS_240]],
      ['preset load', 0],
      ['preset save', 0],
      ['card resize', [MODE, TOP, MINUS_240, MINUS_80]],
      ['preset load', 0]
    ])
  })

  // The ticket's repro no longer brings Mode near Pinned, since the fitted Mode now sits at the column's middle: here Mode
  // is dragged up under the moved Pinned card, a few pixels clear of it, so the undo line's row would reach it.
  it('Pinned, taller with its preset undo line, moves a Mode card placed by hand just under it down', async () => {
    await replays('akari', [
      ['card drag', [PINNED, MINUS_240, MINUS_240]],
      ['card drag', [MODE, NONE, MINUS_240]],
      ['card drag', [MODE, NONE, PLUS_20]],
      ['preset load', 0]
    ])
  })

  it('Rules, dragged by hand, stays clear of Mouse on a preset load', async () => {
    await replays('starbattle', RULES_DRAGGED)
  })

  it('Rules with no rules text keeps its one-line height on a preset load after a drag', async () => {
    const target = await openTarget(browser())(puzzle('starbattle'))
    try {
      const rulesHeight = async () => (await target.snapshot()).cards.find((c) => c.name === 'Rules').rect.height
      const oneLine = await rulesHeight()
      for (const action of scriptedList(RULES_DRAGGED)) {
        await action.run({}, { page: target.page })
        await target.drawn()
      }
      assert.equal(await rulesHeight(), oneLine)
    } finally {
      await target.close()
    }
  })
})
