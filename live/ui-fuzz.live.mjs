// The solve page's UI fuzz (`live/ui-fuzz/`): a scripted action list holding every action kind runs clean, rules included,
// on every puzzle of its set, `--focus` raises its area's share of the actions, a run whose time limit passes before its
// first list gives no verdict, and `npm run fuzz:ui` on a page that throws on one action, or breaks a rule on one, finds
// it, shrinks it and prints a replay command, puzzle and focus and all, that fails again on the same step, even on a
// reordered puzzle list. A planted solve-UI bug (`UI_PLANTS`, `live/plants.mjs`) is found the same way, and the same seed
// runs as many lists clean with no plant in (#233).
import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import fc from 'fast-check'
import { takePageErrors, useBrowser } from './page.mjs'
import { UI_PLANTS, uiPlantSetup } from './plants.mjs'
import { actionList, AREAS, KINDS, scriptedList, WINDOW_SIZES } from './ui-fuzz/actions.mjs'
import { parseFuzzArgs, replayCommand } from './ui-fuzz/command.mjs'
import { runFuzz, runScript } from './ui-fuzz/engine.mjs'
import { uiFuzzPuzzles } from './ui-fuzz/puzzles.mjs'
import { fuzzUi } from './ui-fuzz/run.mjs'
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

// The seed and puzzle the in-page plants are hunted with, as `npm run fuzz:ui` arguments, and the focus most of them are
// hunted with.
const PLANT_HUNT = ['--seed', '1', '--puzzle', 'akari']
// The same for a UI_PLANTS plant: a seed whose lists reach the plant before any other failure, on short lists, so the
// hunt, its shrink and the clean rerun of its lists take about a minute.
const UI_PLANT_HUNT = ['--seed', '3', '--puzzle', 'akari', '--max-steps', '6']
// A UI_PLANTS test's own time limit: over test:live's 60 s per test, which its three runs need on a loaded box.
const UI_PLANT_TIMEOUT_MS = 240000
const PLANT_FOCUS = ['mode']

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

// Runs in the page, before its scripts: swallows the pin keys Z X C V, so pressing one selects no pin, which breaks the
// pin-keys-select-their-pin rule (a rule that reads the step's action) and throws nothing.
function swallowPinKeysInPage () {
  addEventListener('keydown', (e) => {
    if (/^Key[ZXCV]$/.test(e.code)) e.stopImmediatePropagation()
  }, true)
}

// The most steps a planted bug's shrunk list may hold: a handful, which a person reads at a glance.
const HANDFUL = 5
// `openTarget`'s options that run `inPage` in the page before its scripts.
const initScript = (inPage) => ({ setup: (context) => context.addInitScript(inPage) })

// Runs `npm run fuzz:ui -- <args>` (`run.mjs`) in this process on pages opened with `target` (`openTarget`'s options, the
// planted bug, which no command names), and returns what it printed and its result.
async function fuzzCommand (args, target) {
  const lines = []
  const result = await fuzzUi(args, { browser: browser(), target, print: (line) => lines.push(line) })
  return { output: lines.join('\n'), result }
}

// Hunts with `hunt` (`npm run fuzz:ui` arguments) and `focus` on pages opened with `target`, checks the run fails with an
// error matching `error` after a list the shrink cut down to one whose last step matches `last` (`only`: the list is that
// one step; else at most HANDFUL), that the replay command it prints fails again on the same step, and that the replay
// opens the puzzle it names whatever order the puzzle list is in. Returns the failure.
async function findsAndReplays (target, error, { hunt = PLANT_HUNT, focus = PLANT_FOCUS, last = /^pick tool \d+ in the Mode card/, only = true } = {}) {
  const { output, result: found } = await fuzzCommand([...hunt, ...focus.flatMap((area) => ['--focus', area])], target)
  assert.equal(found.failed, true, `the run finds the plant, got ${output}`)
  assert.match(found.error, error)
  assert.match(found.sequence.at(-1), last, 'the shrunk list ends on the planted step')
  if (only) assert.equal(found.sequence.length, 1, `shrunk to the one step, got ${found.sequence.join('; ')}`)
  assert.ok(found.sequence.length <= HANDFUL, `shrunk to at most ${HANDFUL} steps, got ${found.sequence.join('; ')}`)
  assert.ok(found.huntSteps > found.sequence.length, `the shrink cut the ${found.huntSteps} steps the hunt found to fewer, got ${found.sequence.length}`)
  assert.equal(found.step, found.sequence.length, 'the failure is read after the last step of the shrunk list')

  const command = /^replay: (.*)$/m.exec(output)?.[1]
  assert.ok(command, `the run prints a replay command, got ${output}`)
  assert.match(command, new RegExp(` --puzzle akari .*${focus.map((area) => ` --focus ${area}`).join('')}$`), 'the replay command names the puzzle and carries the focus')
  const [, args] = command.split(' -- ')
  const replayed = await fuzzCommand(args.split(' '), target)
  const failedOn = (r) => ({ failed: r.failed, puzzle: r.puzzle, step: r.step, sequence: r.sequence, error: r.error })
  assert.deepEqual(failedOn(replayed.result), failedOn(found), `${command} fails again on the same step`)
  assert.equal(replayed.output.split('\n').slice(1).join('\n'), output.split('\n').slice(1).join('\n'), `${command} prints the same failure`)

  const reordered = await runFuzz({ openTarget: openTarget(browser(), target), puzzles: [...puzzles].reverse(), ...parseFuzzArgs(args.split(' ')) })
  assert.deepEqual(failedOn(reordered), failedOn(found), `${command} on a reordered puzzle list fails again on the same puzzle and step`)
  return found
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
    assert.equal(replayCommand({ seed: 3, puzzle: 'killer', path: '0:1@a', focus: ['layout', 'theme'] }), 'npm run fuzz:ui -- --seed 3 --puzzle killer --path 0:1@a --focus layout --focus theme')
    assert.equal(replayCommand({ seed: 3, puzzle: 'killer', path: '0:1@a', focus: [] }), 'npm run fuzz:ui -- --seed 3 --puzzle killer --path 0:1@a')
  })

  for (const puzzle of puzzles) {
    it(`runs a scripted list clean on ${puzzle.name}`, async () => {
      await runScript({ openTarget: openTarget(browser()), puzzle, actions: scriptedList(SCRIPT) })
    })
  }

  it('finds a crash on a seeded run and prints a replay command that fails again on the same step', async () => {
    await findsAndReplays(initScript(throwOnToolPickInPage), /planted tool pick/)
    takePageErrors()
  })

  it('finds a broken rule on a seeded run and prints a replay command that fails again on the same step', async () => {
    await findsAndReplays(initScript(overlapOnToolPickInPage), /^rules? broken after step \d+ \(.*\): cards-do-not-overlap: Board and Pinned overlap/)
  })

  it('finds a broken rule that reads the step\'s action on a seeded run, and its replay fails again on the same step', async () => {
    await findsAndReplays(initScript(swallowPinKeysInPage), /pin-keys-select-their-pin: pressing [ZXCV] left /, { focus: ['pinned'], last: /^press pin key [ZXCV]/, only: false })
  })

  it('gives no verdict when the time limit passes before the first list has run', async () => {
    // A page that never opens: the time limit fires while the first list waits for it.
    await assert.rejects(runFuzz({ openTarget: () => new Promise(() => {}), puzzles, seed: 1, minutes: 0.001 }), /no action list ran/)
  })

  for (const plant of UI_PLANTS) {
    it(`finds the planted ${plant.id}, shrinks it, replays it on the same step, and passes on the same seed without it`, { timeout: UI_PLANT_TIMEOUT_MS }, async () => {
      const found = await findsAndReplays({ served: true, setup: await uiPlantSetup(plant) }, plant.caughtBy, { hunt: UI_PLANT_HUNT, focus: plant.focus, last: plant.last, only: false })
      // The lists the hunt ran, the planted one last, run again with no plant in.
      const clean = await runFuzz({ openTarget: openTarget(browser(), { served: true }), puzzles, ...parseFuzzArgs(UI_PLANT_HUNT), focus: plant.focus, runs: found.runs })
      assert.equal(clean.failed, false, `with no plant the same seed passes, got ${clean.error}`)
      assert.equal(clean.runs, found.runs, 'with no plant the same seed runs every list up to the planted one')
    })
  }
})
