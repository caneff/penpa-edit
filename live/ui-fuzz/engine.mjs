// The UI fuzz's engine (#195), modelled on `sudokupad-scripts/live/fuzz/engine.mjs`: fast-check generates action lists
// (`actions.mjs`), each list runs on a page of its own, the crash signals (`signals.mjs`) and the rules (`rules.mjs`) are
// read after every action and once more after the last, and a failing list is shrunk and reported with the path that replays it. It knows no browser:
// the page comes from `openTarget(puzzle)` (`target.mjs`). Not a check itself.
import { setTimeout as sleep } from 'node:timers/promises'
import fc from 'fast-check'
import { actionList, REPLAY_PATH } from './actions.mjs'
import { ruleViolations } from './rules.mjs'
import { crashSignals } from './signals.mjs'

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

// Fails on a crash signal first, then on a broken rule; `rules` is the rules' context (`rules.mjs`) less `now`.
function assertClean (snapshot, rules, when, step) {
  const signals = crashSignals(snapshot)
  if (signals.length) throw failure(`${signals.length === 1 ? 'crash signal' : 'crash signals'} ${when}: ${signals.join('; ')}`, step)
  const broken = ruleViolations({ now: snapshot, ...rules })
  if (broken.length) throw failure(`${broken.length === 1 ? 'rule broken' : 'rules broken'} ${when}: ${broken.join('; ')}`, step)
}

// Runs `actions` on a page of `puzzle` of its own: a page is never reused between lists, so a list's run depends on no
// other's and replays alone.
async function runList (openTarget, puzzle, actions) {
  const target = await openTarget(puzzle)
  try {
    let ran = 0
    // The snapshot before the first step, which the undo-to-start rule compares with until a reload; and the last one read.
    let opened = await target.snapshot()
    let before = opened
    const checked = actions.map((action) => ({
      check: () => true,
      toString: () => String(action),
      async run (model, real) {
        const step = ran + 1
        try {
          await action.run(model, real)
        } catch (e) {
          throw failure(`step ${step} (${action}) threw: ${e.message.split('\n')[0]}`, step)
        }
        ran = step
        await target.drawn()
        const now = await target.snapshot()
        if (action.kind === 'reload') opened = null
        assertClean(now, { before, action: { kind: action.kind, arg: action.arg }, opened }, `after step ${step} (${action})`, step)
        before = now
      }
    }))
    await fc.asyncModelRun(() => ({ model: {}, real: { page: target.page } }), checked)
    await sleep(ERRORS_LAND_MS)
    assertClean(await target.snapshot(), { before, action: null, opened }, 'after the last step', ran)
  } finally {
    await target.close()
  }
}

// Runs a hand-written list (`scriptedList`) on `puzzle`; rejects on its first crash signal.
export const runScript = ({ openTarget, puzzle, actions }) => runList(openTarget, puzzle, actions)

// Fuzzes with `seed` over `puzzles` (each list picks one) until `minutes` pass or `runs` lists have run, then shrinks a
// failure for at most `shrinkMinutes`. `path`, as a failure prints it, replays that one list with no hunt and no shrink;
// `maxCommands` shapes the lists, so a replay needs the one it was found with. Returns `{ failed: false, seed, runs }` or
// the failure: `error`, `step` (the count of steps run when it was read), `puzzle` (its name), `sequence` (the steps, in
// words), `seed`, `path` and `runs`.
export async function runFuzz ({ openTarget, puzzles, seed, runs, minutes = DEFAULT_MINUTES, shrinkMinutes = DEFAULT_SHRINK_MINUTES, path, maxCommands }) {
  const [fcPath, replayPath] = path == null ? [] : path.split('@')
  const property = fc.asyncProperty(actionList(puzzles, { maxCommands, replayPath }), ({ puzzle, commands }) => runList(openTarget, puzzle, [...commands]))
  const replaying = fcPath != null
  // A path names its list by index, so a run limit one past it runs that list alone.
  const upTo = (p) => Number(p.split(':')[0]) + 1
  // The hunt stops at the first failure, so the time limit never cuts a shrink short. A time limit that fires before the
  // first list has run is reported by fast-check as a failure with no counterexample: a run that did not get to run.
  const hunt = await fc.check(property, {
    seed, numRuns: replaying ? upTo(fcPath) : runs ?? UNBOUNDED, path: fcPath, endOnFailure: true, interruptAfterTimeLimit: replaying ? undefined : minutes * 60000, verbose: 0
  })
  if (!hunt.failed || hunt.counterexample === null) return { failed: false, seed: hunt.seed, runs: hunt.numRuns }
  let found = hunt
  if (!replaying) {
    // The same list again, from its index alone, this time shrinking; a failure that does not repeat leaves the hunt's own.
    const shrunk = await fc.check(property, {
      seed, numRuns: upTo(hunt.counterexamplePath), path: hunt.counterexamplePath.split(':')[0], interruptAfterTimeLimit: shrinkMinutes * 60000, verbose: 0
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
    seed: found.seed,
    path: `${found.counterexamplePath}@${REPLAY_PATH.exec(shown)[1]}`,
    runs: hunt.numRuns
  }
}
