// The UI fuzz's engine (#195), modelled on `sudokupad-scripts/live/fuzz/engine.mjs`: fast-check generates action lists
// (`actions.mjs`), each list runs on a page of its own, the crash signals and the rules (`rules.mjs`) are read after every
// action and once more after the last, and a failing list is shrunk and reported with the puzzle and path that replay it.
// It knows no browser: the page comes from `openTarget(puzzle)` (`target.mjs`). Not a check itself.
import { setTimeout as sleep } from 'node:timers/promises'
import fc from 'fast-check'
import { actionList, REPLAY_PATH } from './actions.mjs'
import { ruleViolations } from './rules.mjs'

const MINUTE_MS = 60000

// After the last action the run reads the page once more after this long: a "nothing happened in N ms" check for an error
// that lands late (a timer). fast-check never drops a list's last action in a shrink, so a late error read only there
// would keep one stray step.
const ERRORS_LAND_MS = 200
const DEFAULT_MINUTES = 2
const DEFAULT_SHRINK_MINUTES = 10
const UNBOUNDED = 1000000

// The steps a printed list holds, in order. fast-check prints them joined by commas, so no step's label holds one.
const stepsOf = (shown) => shown.replace(REPLAY_PATH, '').split(',').map((step) => step.trim()).filter((step) => step !== '')

// A failure names `step`, the count of steps run when it was read.
function failure (message, step) {
  return Object.assign(new Error(message), { step })
}

// Fails on a crash signal first (each uncaught page error and `console.error` line in the snapshot, `page-state.mjs`),
// then on a broken rule; `rules` is the rules' context (`rules.mjs`) less `now`.
function assertClean (snapshot, rules, when, step) {
  const signals = snapshot.errors.map((e) => `page error: ${e}`)
  if (signals.length) throw failure(`${signals.length === 1 ? 'crash signal' : 'crash signals'} ${when}: ${signals.join('; ')}`, step)
  const broken = ruleViolations({ now: snapshot, ...rules })
  if (broken.length) throw failure(`${broken.length === 1 ? 'rule broken' : 'rules broken'} ${when}: ${broken.join('; ')}`, step)
}

// Runs `actions` (a hunted list's commands, or a hand-written `scriptedList`) on a page of `puzzle` of its own, and
// rejects on the first crash signal or broken rule. A page is never reused between lists, so a list's run depends on no
// other's and replays alone.
export async function runScript ({ openTarget, puzzle, actions }) {
  const target = await openTarget(puzzle)
  try {
    // What the rules read besides the page now: the snapshot before the first step (the undo-to-start rule's, until a
    // reload), the one before the step just run, and the kinds of the steps run so far.
    let opened = await target.snapshot()
    let before = opened
    const history = []
    let step = 0
    for (const action of actions) {
      step++
      try {
        // A hunted list's step is fast-check's wrapper, which marks it run so the printed list shows it.
        await action.run({}, { page: target.page })
      } catch (e) {
        throw failure(`step ${step} (${action}) threw: ${e.message.split('\n')[0]}`, step)
      }
      await target.drawn()
      const now = await target.snapshot()
      // A hunted list's step holds the action as `cmd`; a scripted list's is the action.
      const { kind, arg } = action.cmd ?? action
      if (kind === 'reload') opened = null
      history.push(kind)
      assertClean(now, { before, action: { kind, arg }, opened, history: [...history] }, `after step ${step} (${action})`, step)
      before = now
    }
    await sleep(ERRORS_LAND_MS)
    assertClean(await target.snapshot(), { before, action: null, opened, history }, 'after the last step', step)
  } finally {
    await target.close()
  }
}

// The generator of `{ puzzle, commands }`. The puzzle is drawn as a number apart from the commands, which are drawn the same
// for any puzzle, and is never shrunk; so a path replays the same steps on `named` (a puzzle's name) whatever the
// puzzle list holds then, and on `puzzles` picks by index.
function listsOn (puzzles, named, options) {
  const fixed = named == null ? null : puzzles.find((p) => p.name === named)
  if (named != null && !fixed) throw new Error(`no puzzle named "${named}": the puzzles are ${puzzles.map((p) => p.name).join(', ')}`)
  return fc.noShrink(fc.nat()).chain((n) => actionList([fixed ?? puzzles[n % puzzles.length]], options))
}

// Fuzzes with `seed` over `puzzles` (each list picks one, or `puzzle`, a name, for every list) until `minutes` pass or
// `runs` lists have run, then shrinks a failure for at most `shrinkMinutes`. `path`, as a failure prints it, replays that
// one list with no hunt and no shrink; `maxCommands` and `focus` (the areas whose actions are drawn more often) shape the
// lists, so a replay needs the ones it was found with. Returns `{ failed: false, seed, runs }` or the failure: `error`,
// `step` (the count of steps run when it was read), `puzzle` (its name), `sequence` (the steps, in words), `huntSteps`
// (the steps the list had run when the hunt found it, before the shrink), `seed`, `path`, `maxCommands`, `focus` and
// `runs`. Rejects when no list ran (the time limit fired before the first): a run that checked nothing is no pass.
export async function runFuzz ({ openTarget, puzzles, puzzle, seed, runs, minutes = DEFAULT_MINUTES, shrinkMinutes = DEFAULT_SHRINK_MINUTES, path, maxCommands, focus = [] }) {
  const [fcPath, replayPath] = path == null ? [] : path.split('@')
  const lists = listsOn(puzzles, puzzle, { maxCommands, replayPath, focus })
  const property = fc.asyncProperty(lists, (list) => runScript({ openTarget, puzzle: list.puzzle, actions: list.commands }))
  const replaying = fcPath != null
  // A path names its list by index, so a run limit one past it runs that list alone.
  const upTo = (p) => Number(p.split(':')[0]) + 1
  // The hunt stops at the first failure, so the time limit never cuts a shrink short. A time limit that fires before the
  // first list has run is reported by fast-check as a failure with no counterexample.
  const hunt = await fc.check(property, {
    seed, numRuns: replaying ? upTo(fcPath) : runs ?? UNBOUNDED, path: fcPath, endOnFailure: true, interruptAfterTimeLimit: replaying ? undefined : minutes * MINUTE_MS, verbose: 0
  })
  if (hunt.counterexample === null) {
    if (hunt.numRuns === 0) throw new Error(`no action list ran: the time limit (${minutes} minutes) passed before the first one ended`)
    if (hunt.failed) throw new Error(`the run failed with no list to show: ${hunt.errorInstance?.message ?? hunt.error}`)
    return { failed: false, seed: hunt.seed, runs: hunt.numRuns }
  }
  const huntSteps = stepsOf(String(hunt.counterexample[0])).length
  let found = hunt
  if (!replaying) {
    // The same list again, from its index alone, this time shrinking; a failure that does not repeat leaves the hunt's own.
    const shrunk = await fc.check(property, {
      seed, numRuns: upTo(hunt.counterexamplePath), path: hunt.counterexamplePath.split(':')[0], interruptAfterTimeLimit: shrinkMinutes * MINUTE_MS, verbose: 0
    })
    if (shrunk.failed && shrunk.counterexample !== null) found = shrunk
  }
  const list = found.counterexample[0]
  const shown = String(list)
  return {
    failed: true,
    error: String(found.errorInstance?.message ?? found.error),
    step: found.errorInstance?.step,
    puzzle: list.puzzle.name,
    sequence: stepsOf(shown),
    huntSteps,
    seed: found.seed,
    path: `${found.counterexamplePath}@${REPLAY_PATH.exec(shown)[1]}`,
    maxCommands,
    focus,
    runs: hunt.numRuns
  }
}
