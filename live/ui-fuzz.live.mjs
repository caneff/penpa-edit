// The solve page's UI fuzz (`live/ui-fuzz/`): a scripted action list holding every action kind runs clean, rules included,
// on every puzzle of its set, `--focus` raises its area's share of the actions, and a seeded run on a page that throws on
// one action, or breaks a rule on one, finds it and prints a replay command, focus and all, that fails again on the same step.
import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import fc from 'fast-check'
import { takePageErrors, useBrowser } from './page.mjs'
import { actionList, AREAS, KINDS, scriptedList, WINDOW_SIZES } from './ui-fuzz/actions.mjs'
import { parseFuzzArgs, replayCommand } from './ui-fuzz/command.mjs'
import { runFuzz, runScript } from './ui-fuzz/engine.mjs'
import { uiFuzzPuzzles } from './ui-fuzz/puzzles.mjs'
import { openTarget } from './ui-fuzz/target.mjs'

const browser = useBrowser()
const puzzles = await uiFuzzPuzzles()

// Every action kind once or more, with the mouse left up between them.
const SCRIPT = [
  ['mode pick', 3],
  ['click', 5],
  ['digit', [7, '3']],
  ['drag', [1, 2, 3]],
  ['right drag', [6, 7]],
  ['undo', 'button'],
  ['redo', 'key'],
  ['resize', WINDOW_SIZES.length - 1],
  ['mode search', [2, 1]],
  ['pin toggle', null],
  ['mode pick', 40],
  ['pin toggle', null],
  ['pin pick', 1],
  ['pin key', 'x'],
  ['pin drag', [2, 0]],
  ['mode pick', 7],
  ['mode pick', 9],
  ['recent pick', 0],
  ['recent pin', 0],
  ['unpin', 0],
  ['preset save', 1],
  ['preset load', 3],
  ['preset star', 0],
  ['preset delete', [0, true]],
  ['preset delete', [0, false]],
  ['close Mouse card', null],
  ['reopen Mouse card', null],
  ['click', 11],
  ['undo', 'key'],
  ['redo', 'button'],
  ['card drag', [2, 3, 1]],
  ['card resize', [0, 7, 2, 2]],
  ['card resize', [4, 0, 0, 0]],
  ['interrupted drag', [1, 'Escape']],
  ['interrupted drag', [3, 'resize']],
  ['interrupted drag', [5, 'blur']],
  ['reset layout', 'bar'],
  ['reset layout', 'Settings'],
  ['theme', 'dark'],
  ['restart', true],
  ['restart', false],
  ['pause and resume', ['button', 'cover']],
  ['pause and resume', ['F4', 'F4']],
  ['reload', null],
  ['theme', 'light'],
  ['resize', 0]
]

// The seed, list count and list length the planted run hunts with: a short list, so its shrink fits the test's time.
const PLANT_RUN = { seed: 1, runs: 20, maxCommands: 6, focus: ['mode'] }

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
  assert.match(command, / --focus mode$/, 'the replay command carries the focus')
  const { seed, path, focus } = parseFuzzArgs(args.split(' '))
  const replayed = await runFuzz({ openTarget: planted, puzzles: akari, seed, path, focus, maxCommands: PLANT_RUN.maxCommands })
  assert.deepEqual(
    { failed: replayed.failed, step: replayed.step, sequence: replayed.sequence, error: replayed.error },
    { failed: true, step: found.step, sequence: found.sequence, error: found.error },
    `${command} fails again on the same step`
  )
}

// The share of `area`'s actions among 50 lists drawn with `seed` and `focus`.
function areaShare (area, focus, seed) {
  // fast-check hands each command out in a wrapper that holds it as `cmd`.
  const steps = fc.sample(actionList(puzzles, { focus }), { seed, numRuns: 50 }).flatMap(({ commands }) => [...commands].map((wrapped) => wrapped.cmd))
  return steps.filter((step) => step.area === area).length / steps.length
}

describe('the solve page\'s UI fuzz', () => {
  it('scripts every action kind, and every kind names one of the areas', () => {
    assert.deepEqual([...new Set(SCRIPT.map(([kind]) => kind))].sort(), KINDS.map((k) => k.kind).sort())
    for (const k of KINDS) assert.ok(AREAS.includes(k.area), `${k.kind}'s area ${k.area} is one of ${AREAS.join(' ')}`)
    assert.deepEqual([...new Set(KINDS.map((k) => k.area))].sort(), [...AREAS].sort(), 'every area has an action')
  })

  it('--focus raises its area\'s share of the actions, and a replay command carries it', () => {
    for (const area of AREAS) {
      const plain = areaShare(area, [], 7)
      const focused = areaShare(area, [area], 7)
      assert.ok(focused > plain * 2, `--focus ${area} raises its share from ${plain.toFixed(2)}, got ${focused.toFixed(2)}`)
    }
    assert.deepEqual(parseFuzzArgs(['--focus', 'layout', '--focus', 'theme']).focus, ['layout', 'theme'])
    assert.deepEqual(parseFuzzArgs([]).focus, [])
    assert.throws(() => parseFuzzArgs(['--focus', 'nowhere']), /--focus needs one of/)
    assert.equal(replayCommand({ seed: 3, path: '0:1@a', focus: ['layout', 'theme'] }), 'npm run fuzz:ui -- --seed 3 --path 0:1@a --focus layout --focus theme')
    assert.equal(replayCommand({ seed: 3, path: '0:1@a', focus: [] }), 'npm run fuzz:ui -- --seed 3 --path 0:1@a')
  })

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
