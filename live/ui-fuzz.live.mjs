// The solve page's UI fuzz (`live/ui-fuzz/`): a scripted action list runs clean, rules included, on every puzzle of its set,
// and a seeded run on a page that throws on one action, or breaks a rule on one, finds it and prints a replay command that
// fails again on the same step.
import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { takePageErrors, useBrowser } from './page.mjs'
import { scriptedList, WINDOW_SIZES } from './ui-fuzz/actions.mjs'
import { parseFuzzArgs, replayCommand } from './ui-fuzz/command.mjs'
import { runFuzz, runScript } from './ui-fuzz/engine.mjs'
import { uiFuzzPuzzles } from './ui-fuzz/puzzles.mjs'
import { openTarget } from './ui-fuzz/target.mjs'

const browser = useBrowser()
const puzzles = await uiFuzzPuzzles()

// Every first action kind once or more, with the mouse left up between them.
const SCRIPT = [
  ['mode pick', 3],
  ['click', 5],
  ['digit', [7, '3']],
  ['drag', [1, 2, 3]],
  ['right drag', [6, 7]],
  ['undo', 'button'],
  ['redo', 'key'],
  ['resize', WINDOW_SIZES.length - 1],
  ['mode pick', 40],
  ['click', 11],
  ['undo', 'key'],
  ['redo', 'button'],
  ['resize', 0]
]

// The seed, list count and list length the planted run hunts with: a short list, so its shrink fits the test's time.
const PLANT_RUN = { seed: 1, runs: 20, maxCommands: 6 }

// Runs in the page, before its scripts: throws, uncaught, on every click on a tool in the Mode card's tree.
function throwOnToolPickInPage () {
  addEventListener('click', (e) => {
    if (e.target.closest?.('[role=treeitem]')) throw new Error('planted tool pick')
  })
}

// Runs in the page, before its scripts: on every click on a tool in the Mode card's tree, moves the Pinned card onto the
// Board card, which breaks the cards-do-not-overlap rule and throws nothing.
function overlapOnToolPickInPage () {
  addEventListener('click', (e) => {
    if (!e.target.closest?.('[role=treeitem]')) return
    const board = document.querySelector('section.ui-card-board').getBoundingClientRect()
    Object.assign(document.querySelector('section.ui-card-pins').style, { left: `${board.left + 20}px`, top: `${board.top + 20}px` })
  })
}

// Hunts on Akari with `setup` planted, checks the run shrinks to the one tool pick with an error matching `error`, and that
// its printed replay command fails again on the same step.
async function findsAndReplays (setup, error) {
  const planted = openTarget(browser(), { setup: (context) => context.addInitScript(setup) })
  const akari = puzzles.filter((p) => p.name === 'akari')
  const found = await runFuzz({ openTarget: planted, puzzles: akari, ...PLANT_RUN })
  assert.equal(found.failed, true, 'the run finds the plant')
  assert.match(found.error, error)
  assert.deepEqual(found.sequence.map((step) => step.replace(/ \(.*\)$/, '').replace(/\d+/, 'N')), ['pick tool N in the Mode card'], 'shrunk to the one tool pick')
  assert.equal(found.step, found.sequence.length, 'the failure is read after the last step of the shrunk list')

  const command = replayCommand(found)
  const [, args] = command.split(' -- ')
  const { seed, path } = parseFuzzArgs(args.split(' '))
  const replayed = await runFuzz({ openTarget: planted, puzzles: akari, seed, path, maxCommands: PLANT_RUN.maxCommands })
  assert.deepEqual(
    { failed: replayed.failed, step: replayed.step, sequence: replayed.sequence, error: replayed.error },
    { failed: true, step: found.step, sequence: found.sequence, error: found.error },
    `${command} fails again on the same step`
  )
}

describe('the solve page\'s UI fuzz', () => {
  for (const puzzle of puzzles) {
    it(`runs a scripted list clean on ${puzzle.name}`, async () => {
      await runScript({ openTarget: openTarget(browser()), puzzle, actions: scriptedList(SCRIPT) })
    })
  }

  it('finds a crash on a seeded run and prints a replay command that fails again on the same step', async () => {
    await findsAndReplays(throwOnToolPickInPage, /planted tool pick/)
    takePageErrors()
  })

  it('finds a broken rule on a seeded run and prints a replay command that fails again on the same step', async () => {
    await findsAndReplays(overlapOnToolPickInPage, /^rules? broken after step \d+ \(.*\): cards-do-not-overlap: Board and Pinned overlap/)
  })
})
