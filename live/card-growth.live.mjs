// A card whose content makes it taller on a layout the solver changed stays clear of its neighbours (#288): the UI fuzz's
// shrunk repros, and the rule's other cases, replayed as scripted lists on the solve page. `runScript` checks every UI
// fuzz rule after each step, cards-do-not-overlap among them; the other tests read the cards' boxes themselves.
import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { useBrowser } from './page.mjs'
import { CARD_GAP_PX } from './desk-layout.mjs'
import { CARDS, HANDLES, MOVES, scriptedList } from './ui-fuzz/actions.mjs'
import { runScript } from './ui-fuzz/engine.mjs'
import { uiFuzzPuzzles } from './ui-fuzz/puzzles.mjs'
import { openTarget } from './ui-fuzz/target.mjs'

const browser = useBrowser()
const puzzles = await uiFuzzPuzzles()

// An action's argument as its tables (live/ui-fuzz/actions.mjs) index it: a card by name, a handle, a move in pixels.
const card = (name) => CARDS.indexOf(name)
const handle = (name) => HANDLES.indexOf(name)
const by = (px) => MOVES.indexOf(px)
const drag = (name, dx, dy) => ['card drag', [card(name), by(dx), by(dy)]]
const resize = (name, edge, dx, dy) => ['card resize', [card(name), handle(edge), by(dx), by(dy)]]
// The preset list's first entry, Puzzle defaults: loading it shows Pinned's undo line, a row taller.
const LOAD_DEFAULTS = ['preset load', 0]

const puzzle = (name) => puzzles.find((p) => p.name === name)
const replays = (name, steps) => runScript({ openTarget: openTarget(browser()), puzzle: puzzle(name), actions: scriptedList(steps) })

// Runs `steps` on `name` and returns each shown card's box (`x`, `y`, `width`, `height`) by card name, before the last step
// and after it.
async function boxesAround (name, steps) {
  const target = await openTarget(browser())(puzzle(name))
  const boxes = async () => Object.fromEntries((await target.snapshot()).cards.filter((c) => c.shown).map((c) => [c.name, c.rect]))
  try {
    const actions = scriptedList(steps)
    for (const action of actions.slice(0, -1)) {
      await action.run({}, { page: target.page })
      await target.drawn()
    }
    const before = await boxes()
    await actions.at(-1).run({}, { page: target.page })
    await target.drawn()
    return { before, after: await boxes() }
  } finally {
    await target.close()
  }
}

const bottom = (box) => box.y + box.height
// The desk places cards in whole pixels and the boxes are read in fractional ones: this much apart is the same place.
const SLACK_PX = 1
const near = (actual, expected, what) => assert.ok(Math.abs(actual - expected) <= SLACK_PX, `${what}: ${actual}, expected ${expected}`)

// Pinned dragged up and left, over Mode's column, and Mode dragged up to 10 px under it: the undo line's row reaches Mode.
const MODE_UNDER_PINNED = [drag('Pinned', -240, -240), drag('Mode', 0, -240), drag('Mode', 0, 20)]
// Rules dragged into the top corner, then a preset load, which sizes the cards the solver left alone again.
const RULES_DRAGGED = [drag('Rules', -240, -240), ['preset load', 1]]

describe('a card that grows on a layout the solver changed', () => {
  // The ticket's own steps no longer bring Mode near Pinned, since the fitted Mode now sits at the column's middle; they
  // are kept as a guard, and the next test is the one that reaches the growth.
  it('the ticket\'s Pinned steps leave no two cards overlapping', async () => {
    await replays('akari', [
      drag('Pinned', -240, -240),
      LOAD_DEFAULTS,
      ['preset save', 0],
      resize('Mode', 'top', -240, -80),
      LOAD_DEFAULTS
    ])
  })

  it('Pinned, taller with its preset undo line, moves a Mode card placed by hand just under it down', async () => {
    await replays('akari', [...MODE_UNDER_PINNED, LOAD_DEFAULTS])
  })

  it('a card placed by hand moves down to the desk\'s gap under the growing card, its size kept', async () => {
    const { before, after } = await boxesAround('akari', [...MODE_UNDER_PINNED, LOAD_DEFAULTS])
    assert.ok(after.Pinned.height > before.Pinned.height, 'Pinned grew')
    near(after.Mode.y, bottom(after.Pinned) + CARD_GAP_PX, 'Mode\'s top')
    assert.equal(after.Mode.height, before.Mode.height)
  })

  it('a card the growth pushes moves on whatever it then covers', async () => {
    // Recent dragged up to 10 px under Mode, so Mode's move reaches it.
    await replays('akari', [...MODE_UNDER_PINNED, drag('Recent', 0, -240), drag('Recent', 0, 20), LOAD_DEFAULTS])
  })

  it('a card the solver put over the growing one stays where it is', async () => {
    const { before, after } = await boxesAround('akari', [drag('Pinned', -240, -240), drag('Mode', 0, -240), LOAD_DEFAULTS])
    assert.ok(after.Pinned.height > before.Pinned.height, 'Pinned grew')
    assert.ok(before.Mode.y < bottom(before.Pinned), 'Mode starts over Pinned')
    assert.deepEqual(after.Mode, before.Mode)
  })

  it('a card the solver resizes over another moves nothing', async () => {
    const { before, after } = await boxesAround('akari', [resize('Pinned', 'bottom', 0, 240)])
    assert.deepEqual(after.Mode, before.Mode)
    assert.ok(bottom(after.Pinned) > after.Mode.y, 'Pinned reaches over Mode')
  })

  it('a card that grows over one with no room left below it stops above it', async () => {
    // Mode at the desk's bottom, and Pinned dragged down to a few pixels above it.
    const { before, after } = await boxesAround('akari', [
      drag('Mode', 0, 240), drag('Mode', 0, 240),
      drag('Pinned', 0, 240), drag('Pinned', 0, 240), drag('Pinned', 0, 80), drag('Pinned', 0, -20),
      LOAD_DEFAULTS
    ])
    assert.deepEqual(after.Mode, before.Mode)
    assert.ok(bottom(after.Pinned) + CARD_GAP_PX <= after.Mode.y + SLACK_PX, `Pinned ends at ${bottom(after.Pinned)}, over Mode at ${after.Mode.y}`)
  })

  it('Rules, dragged by hand, stays clear of Mouse on a preset load', async () => {
    await replays('starbattle', RULES_DRAGGED)
  })

  it('Rules with no rules text keeps its one-line height on a preset load after a drag', async () => {
    const { before, after } = await boxesAround('starbattle', RULES_DRAGGED)
    assert.equal(after.Rules.height, before.Rules.height)
  })
})
