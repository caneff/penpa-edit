// Tier C (`research/agentic-legacy-migration.md` § Corpus, #34): full solves on solve links with an answer check, on
// the puzzles of `live/tier-c-puzzles.mjs`. Not a check itself, so `live/**/*.live.mjs` skips it.
// - The generator: a puzzle's answer entered in a seeded random order through the recording's steps
//   (`live/replay.mjs`), with pencil marks, helper marks, wrong entries later corrected, undo and redo, and mode changes
//   mixed in where the genre has them.
// - The answer run: a generated solve made through the engine driver, checked as the answer-aimed fuzz checks it.
// - The converter: a solver's Share > Replay link turned into a recording.
import { readEngineState } from './canonical-state.mjs'
import { random } from './fuzz.mjs'
import { openPenpa } from './page.mjs'
import { dragSteps, endsGroup, engineDriver, linkHash, pauseClock, pressSteps, stepWords, typedSteps } from './replay.mjs'
import {
  answerLinkInPage, boardLoaded, historyPuzzle, openingModeInPage, pointsInPage, withPage
} from './tier-c-puzzles.mjs'

// The directory of `live/recordings/` tier C's recordings go in, as the first part of their ids.
export const TIER_C_FAMILY = 'solve'
// The seeds the seam's answer-aimed fuzz solves every puzzle with: three, each run a few seconds, so the six puzzles'
// fuzz stays near a minute of the seam. `TIER_C_FUZZ_SEEDS=<k>` runs seeds 1 to k instead, for a wider run by hand.
export const TIER_C_SEEDS = [...Array(Number(process.env.TIER_C_FUZZ_SEEDS) || 3).keys()].map((i) => i + 1)
// The seed a kept recording is made with.
export const RECORDING_SEED = 1

// Chance, out of 1, that another piece of noise comes before the next correct entry.
const NOISE = 0.4

// ---- The generator ----

const sameMode = (a, b) => a.mode === b.mode && a.submode === b.submode && a.style === b.style

// What each kind of puzzle's solve is made of, given the run's `run` (below): `enter(item)` the steps of one correct
// entry, and `noise` each kind of noise with its weight, a function returning its steps or null when it cannot be made
// now.
const KITS = {
  digits: {
    enter (run, { num, digit }) {
      return [...run.inMode(SUDOKU_MODE('1')), ...pressSteps(run.puzzle, num), ...typedSteps(String(digit))]
    },
    noise: [
      // A wrong digit in a cell still to be entered, which its correct entry later overwrites.
      [3, (run) => {
        const { num, digit } = run.pick(run.pending)
        const wrong = 1 + run.below(run.puzzle.digits - 1)
        return [...run.inMode(SUDOKU_MODE('1')), ...pressSteps(run.puzzle, num), ...typedSteps(String(wrong >= digit ? wrong + 1 : wrong))]
      }],
      // Corner or centre pencil marks in one cell still to be entered, or in it and the next one along its row.
      [4, (run) => {
        const cell = run.pick(run.pending)
        const next = run.pending.find((c) => c.row === cell.row && c.col === cell.col + 1)
        const cells = next && run.rand() < 0.5 ? [cell.num, next.num] : [cell.num]
        const marks = run.shuffle([...Array(run.puzzle.digits).keys()].map((d) => String(d + 1))).slice(0, 1 + run.below(3))
        return [...run.inMode(SUDOKU_MODE(run.rand() < 0.5 ? '2' : '3')), ...(cells.length > 1 ? dragSteps(run.puzzle, cells) : pressSteps(run.puzzle, cells[0])), ...typedSteps(marks.join(''))]
      }]
    ]
  },
  stars: {
    outside: cellsOutside,
    enter: (run, { num }) => [...run.inMode(run.puzzle.mode), ...pressSteps(run.puzzle, num)],
    noise: [
      // A star on a cell outside the answer, taken away later.
      [2, (run) => run.mistake((num) => [...run.inMode(run.puzzle.mode), ...pressSteps(run.puzzle, num)])],
      // A dot on a cell outside the answer.
      [3, (run) => run.mark((num) => [...run.inMode(run.puzzle.mode), ...pressSteps(run.puzzle, num, 'right')])],
      // Shading on a cell outside the answer, in Surface mode.
      [1, (run) => run.mark((num) => [...run.inMode(SURFACE_MODE), ...pressSteps(run.puzzle, num)])]
    ]
  },
  edges: {
    outside: (puzzle) => puzzle.edges.filter((e) => !puzzle.answer.includes(e)),
    enter: (run, { a, b }) => [...run.inMode(run.puzzle.mode), ...dragSteps(run.puzzle, [a, b])],
    noise: [
      // A line on an edge outside the answer, drawn over again later to take it away.
      [2, (run) => run.mistake(({ a, b }) => [...run.inMode(run.puzzle.mode), ...dragSteps(run.puzzle, [a, b])])],
      // An X on an edge outside the answer.
      [3, (run) => run.mark(({ mid }) => [...run.inMode(run.puzzle.mode), ...pressSteps(run.puzzle, mid, 'right')])]
    ]
  },
  shading: {
    // The run's own: the category its solver answers in, by the seed's parity so that any two seeds in a row cover
    // both (shading, or black squares), and how many entries of the other category it may still make.
    start: (run, seed) => ({ surface: seed % 2 === 1, others: run.puzzle.answer.length - 2 }),
    outside: cellsOutside,
    enter: (run, { num }) => (run.own.surface ? shade : square)(run, num),
    noise: [
      // An entry of the run's category on a cell outside the answer, taken away later: a shading by shading it again,
      // a black square by Delete.
      [2, (run) => run.own.surface
        ? run.mistake((num) => shade(run, num))
        : run.mistake((num) => square(run, num), (num) => [...run.inMode(SQUARE_MODE), ...pressSteps(run.puzzle, num), DELETE])],
      // A dot (Surface's right button) on a cell outside the answer.
      [2, (run) => run.mark((num) => [...run.inMode(SURFACE_MODE), ...pressSteps(run.puzzle, num, 'right')])],
      // An entry of the other category on a cell still to be entered, never on all of them, so the other category is
      // never complete.
      [1, (run) => {
        if (!run.own.others) return null
        run.own.others--
        return (run.own.surface ? square : shade)(run, run.pick(run.pending).num)
      }]
    ]
  }
}

// Shading in Surface mode; a second shading of the same cell takes it away.
function shade (run, num) {
  return [...run.inMode(SURFACE_MODE), ...pressSteps(run.puzzle, num)]
}

// A black square, Shape's `square_LL` variant 2, which the answer check counts: a click places the first variant and
// a 2 turns it into the black one.
function square (run, num) {
  return [...run.inMode(SQUARE_MODE), ...pressSteps(run.puzzle, num), ...typedSteps('2')]
}

// The Delete key, as `main.js` passes it.
const DELETE = { kind: 'key', call: 'key_space', args: [46, false, false] }

// The cells of a puzzle with a `cells` list that are outside its answer.
function cellsOutside (puzzle) {
  return puzzle.cells.filter((num) => !puzzle.answer.some((a) => a.num === num))
}

const SQUARE_MODE = { mode: 'symbol', submode: 'square_LL', style: 1 }

const SURFACE_MODE = { mode: 'surface', submode: '', style: 1 }

// Sudoku mode's sub-mode `submode`: 1 the digit, 2 corner marks, 3 centre marks.
const SUDOKU_MODE = (submode) => ({ mode: 'sudoku', submode, style: 9 })

// Undo then redo as many groups, which leaves the board as it was; any kind of puzzle has it.
const UNDO_REDO = [2, (run) => {
  const k = 1 + run.below(2)
  return [...Array(k).fill({ kind: 'undo' }), ...Array(k).fill({ kind: 'redo' })]
}]

// The steps of a solve of `puzzle` with `seed`: its answer in a seeded random order with noise between the entries,
// all of it resolved before the last correct entry, which is the solve's last step.
export function generateSolve (puzzle, seed) {
  const kit = KITS[puzzle.kind]
  const rand = random(seed)
  const steps = []
  const run = {
    puzzle,
    rand,
    below: (k) => Math.floor(rand() * k),
    pick: (list) => list[Math.floor(rand() * list.length)],
    shuffle: (list) => {
      const out = [...list]
      for (let i = out.length - 1; i > 0; i--) {
        const j = Math.floor(rand() * (i + 1));
        [out[i], out[j]] = [out[j], out[i]]
      }
      return out
    },
    mode: puzzle.mode,
    // The mode step that switches to `mode`, or none when it is the current one.
    inMode (mode) {
      if (sameMode(run.mode, mode)) return []
      run.mode = mode
      return [{ kind: 'mode', ...mode }]
    },
    pending: [],
    // What is outside the answer and holds nothing of the run's yet (cells, or edges), and the wrong entries still to
    // be taken away.
    free: kit.outside?.(puzzle) ?? [],
    fixes: [],
    // The steps of `make(place)` on a free place, which is then no longer free, or null when none is.
    mark (make) {
      if (!run.free.length) return null
      return make(run.free.splice(run.below(run.free.length), 1)[0])
    },
    // A mark that is wrong, taken away later by `unmake`, by default the same input made again.
    mistake (make, unmake = make) {
      return run.mark((place) => {
        run.fixes.push(() => unmake(place))
        return make(place)
      })
    }
  }
  // Takes away the oldest wrong entry still on the board.
  const fix = [3, (run) => run.fixes.length ? run.fixes.shift()() : null]
  run.own = kit.start?.(run, seed)
  const noise = [...kit.noise, UNDO_REDO, fix]
  const total = noise.reduce((sum, [w]) => sum + w, 0)
  const order = run.shuffle(puzzle.answer)
  for (const [i, item] of order.entries()) {
    run.pending = order.slice(i + 1)
    while (run.pending.length && rand() < NOISE) {
      let roll = rand() * total
      const [, make] = noise.find(([w]) => (roll -= w) < 0) ?? noise.at(-1)
      steps.push(...make(run) ?? [])
    }
    if (!run.pending.length) while (run.fixes.length) steps.push(...run.fixes.shift()())
    steps.push(...kit.enter(run, item))
  }
  return steps
}

// ---- The answer run ----

// Makes `steps` on the solve link `source` through the engine driver, under the replay's paused clock so that the
// engine state it ends on is the same on every run, calling `check(n, page)` at every checkpoint and at the last step;
// `name` goes into a failure's words. Returns the first failure in words or null (a
// step that threw, a page error, or what `check` returned), and from the end of the run its engine state, its Replay
// link's `#` part, and the page's grid type and genre tags.
async function runSteps (browser, { name, source, steps, check = async () => null }) {
  const { context, page, errors } = await openPenpa(browser, source, { setup: pauseClock })
  try {
    await boardLoaded(page)
    const apply = engineDriver.start(page)
    let failure = null
    for (const [index, step] of steps.entries()) {
      const n = index + 1
      const at = `${name}: step ${n} (${stepWords(step)})`
      try {
        await apply(step)
      } catch (e) {
        failure = `${at} threw: ${e.message.split('\n')[0]}`
        break
      }
      if (!endsGroup(step) && n !== steps.length) continue
      const broken = errors.length ? `page error: ${errors[0]}` : await check(n, page)
      if (broken) {
        failure = `${at}: ${broken}`
        break
      }
    }
    const end = await page.evaluate(() => ({ replayLink: pu.maketext_replay(), gridtype: pu.gridtype, genre: pu.user_tags }))
    return { failure, final: await page.evaluate(readEngineState), ...end, replayLink: linkHash(end.replayLink) }
  } finally {
    await context.close()
  }
}

// Makes a generated solve (`generateSolve`) on `puzzle`'s solve link through the engine driver and checks, at every
// checkpoint, that no page error was raised and that the answer check reads unsolved before the last step, the last
// correct entry, and solved after it. Returns what `runSteps` does.
export function answerRun (browser, puzzle, steps) {
  return runSteps(browser, {
    name: puzzle.name,
    source: puzzle.source,
    steps,
    check: async (n, page) => {
      const last = n === steps.length
      const solved = await page.evaluate(() => pu.sol_flag)
      if (solved === (last ? 1 : 0)) return null
      return `the answer check reads ${solved ? 'solved' : 'unsolved'}, ${last ? 'after the last correct entry' : `before the last correct entry (step ${steps.length})`}`
    }
  })
}

// ---- The Replay-link converter ----

// The mode each kind of change in a solve history is made in: the natural one of the genre that changes it.
const NATURAL = {
  symbol: { mode: 'combi', submode: 'star', style: 3 },
  lineE: { mode: 'combi', submode: 'edgex', style: 3 },
  surface: SURFACE_MODE
}

// The inputs to try, in order, for a change to `pu_a[prop][key]`: a press of either button, or of one then the other,
// on the point the key names; or, for a `lineE` key of two corners, a drag from one to the other.
function changeInputs (prop, key, board) {
  if (prop === 'lineE' && String(key).includes(',')) return [dragSteps(board, String(key).split(',').map(Number))]
  const num = Number(key)
  const left = pressSteps(board, num)
  const right = pressSteps(board, num, 'right')
  return [left, right, [...left, ...left], [...right, ...left], [...left, ...right], [...right, ...right]]
}

// Runs in the page: the Replay link's changes, oldest first. `maketext_replay` writes them newest first.
function replayChangesInPage (r) {
  return JSON.parse(decrypt_data(r)).reverse()
}

// Runs in the page: `pu_a[prop][key]` as JSON, or null when it is absent.
function answerValueInPage ([prop, key]) {
  const value = pu.pu_a[prop]?.[key]
  return value === undefined ? null : JSON.stringify(value)
}

// Runs in the page: undoes groups until the answer's undo stack is back to `depth`.
function undoToInPage (depth) {
  while (pu.pu_a.command_undo.__a.length > depth) pu.undo()
}

const asJson = (value) => (value === null ? null : JSON.stringify(value))

// The first input of `changeInputs` that makes `pu_a[prop][key]` `value` on the page, made there, or null when none
// does; each input that does not is undone.
async function makeChange (page, apply, [prop, key, value]) {
  const board = { points: await page.evaluate(pointsInPage, String(key).split(',').map(Number)) }
  for (const input of changeInputs(prop, key, board)) {
    const depth = await page.evaluate(() => pu.pu_a.command_undo.__a.length)
    for (const step of input) await apply(step)
    if (await page.evaluate(answerValueInPage, [prop, key]) === asJson(value)) return input
    await page.evaluate(undoToInPage, depth)
  }
  return null
}

// A Share > Replay link's puzzle (its `m` and `p` parts) and its solve history (`r`), from the link or its query: the
// part after its `#`, or after its `?` in the older form Penpa+ still opens.
function splitReplayLink (link) {
  const at = link.search(/[#?]/)
  const parts = link.slice(at + 1).split('&')
  const r = parts.find((p) => p.startsWith('r='))?.slice(2)
  if (at === -1 || !r || r.includes('penpaerror')) throw new Error('the link holds no replay')
  return { base: '#' + parts.filter((p) => !/^[qr]=/.test(p)).join('&'), r }
}

// The steps that make the changes of a solve history on `page` (its puzzle, with nothing entered), and the history's
// last board as `[prop, key, value]` entries.
async function historySteps (page, r) {
  const changes = await page.evaluate(replayChangesInPage, r)
  const apply = engineDriver.start(page)
  const steps = []
  const last = new Map()
  let mode = await page.evaluate(openingModeInPage)
  for (const [i, [prop, key, value, layer, , at]] of changes.entries()) {
    const words = `change ${i + 1} of the replay (${prop} ${key} → ${JSON.stringify(value)})`
    if (layer !== 'pu_a') throw new Error(`${words} is to the ${layer} layer, not the solver's`)
    if (!NATURAL[prop]) throw new Error(`${words}: no natural mode is known for ${prop}`)
    last.set(`${prop} ${key}`, [prop, key, value])
    if (await page.evaluate(answerValueInPage, [prop, key]) === asJson(value)) continue
    const switchTo = sameMode(mode, NATURAL[prop]) ? [] : [{ kind: 'mode', ...NATURAL[prop] }]
    for (const step of switchTo) await apply(step)
    const made = await makeChange(page, apply, [prop, key, value])
    if (!made) throw new Error(`${words}: no input in ${JSON.stringify(NATURAL[prop])} makes it`)
    mode = NATURAL[prop]
    const [first, ...rest] = [...switchTo, ...made]
    steps.push({ ...first, at }, ...rest)
  }
  return { steps, last: [...last.values()].filter(([, , value]) => value !== null) }
}

// Converts a Share > Replay link (`maketext_replay` in `class_p.js`) into a recording: each change of the solve history
// becomes the input that makes it, in the genre's natural mode (NATURAL), found by trying the inputs `changeInputs`
// lists until one makes the change; a change already on the board is skipped. The order and the mistakes are the
// solver's; an undo becomes the input that makes its change. The first step of each change carries `at`, the solver's
// timer reading when it was made. A Replay link carries no answer, so the recording's link is its puzzle with the
// solve's last board as the answer, once `historyPuzzle` has checked that board is a valid solution; the recording
// must then read solved at its last step, which also refuses steps whose inputs took away an earlier change of the
// answer. A change the converter has no input for is refused.
export async function convertReplayLink (browser, link) {
  const { base, r } = splitReplayLink(link)
  const { steps, writes, box } = await withPage(browser, base, async (page) => {
    await boardLoaded(page)
    const { steps, last } = await historySteps(page, r)
    return { steps, ...await historyPuzzle(page, last) }
  })
  const source = await withPage(browser, base, (page) => page.evaluate(answerLinkInPage, { writes, boxes: [box] }))
  const { failure, final, gridtype, genre } = await runSteps(browser, {
    name: 'the converted recording',
    source,
    steps,
    check: async (n, page) => n === steps.length && await page.evaluate(() => pu.sol_flag) !== 1 ? 'the answer check reads unsolved at the end' : null
  })
  if (failure) throw new Error(failure)
  return { header: { source, gridtype, genre, tier: 'C' }, final, steps }
}
