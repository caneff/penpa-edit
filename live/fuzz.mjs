// The fuzz (`research/fork-audit-2026-11.md` § Test plan item 4, modelled on `sudokupad-scripts/live/fuzz/`): random
// steps of the recording vocabulary (`live/replay.mjs`) on one puzzle, made through the replay's own engine calls, with
// the solving invariants checked at every checkpoint: no page error, one `draw()` per `redraw()`, undo-all then
// redo-all gives back the same canonical state, and a save/load round trip gives back the same canonical state. A
// failing run is saved as a recording. Not a check itself, so `live/**/*.live.mjs` skips it.
import { execFile } from 'node:child_process'
import { mkdir, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { promisify } from 'node:util'
import { canonicalState, readEngineState } from './canonical-state.mjs'
import { openPenpa } from './page.mjs'
import { applyStepInPage, changedKeys, endsGroup, entries, stepWords } from './replay.mjs'
import { settle } from './settle.mjs'

// Where a failing run's recording goes, as `fuzz/<puzzle>-seed-<seed>` among the recordings.
export const FUZZ_RECORDINGS = fileURLToPath(new URL('./recordings/fuzz/', import.meta.url))
// The seeds and the steps per run the seam fuzzes every puzzle with: fixed, so a CI run is repeatable.
export const FUZZ_SEEDS = [1, 2, 3]
export const FUZZ_STEPS = 60

// The mode changes a step may make, each as the engine names its mode, sub-mode and style; a puzzle offers those whose
// mode button its page shows. The page's own opening mode is offered too, for a genre tool such as Akari's.
const MODE_CHOICES = [
  ['surface', '', 1], ['surface', '', 2], ['surface', '', 3],
  ['line', '1', 3], ['line', '1', 5], ['lineE', '1', 3], ['wall', '', 3],
  ['number', '1', 2], ['number', '1', 1],
  ['sudoku', '1', 9], ['sudoku', '2', 9], ['sudoku', '3', 9]
]
// The content keys a step may press, as `pu`'s calls and their arguments.
const KEY_CHOICES = [
  ['key_number', ['1']], ['key_number', ['2']], ['key_number', ['3']], ['key_number', ['4']],
  ['key_space', []], ['key_backspace', []],
  ['key_arrow', ['ArrowLeft', false]], ['key_arrow', ['ArrowRight', false]],
  ['key_arrow', ['ArrowUp', false]], ['key_arrow', ['ArrowDown', false]]
]
// How often each kind of input is drawn, out of their sum.
const WEIGHTS = { gesture: 45, key: 25, mode: 10, undo: 10, redo: 7, double: 3 }
// A gesture moves through at most this many points between its down and its up.
const MAX_MOVES = 3
// A drag's next point is within this many cell sizes of its last, as a hand's drag goes.
const DRAG_REACH = 1.5
// Chances, out of 1, that a gesture is a right-button one and that it is Ctrl-held.
const RIGHT_BUTTON = 0.25
const CTRL_HELD = 0.1

// mulberry32: a small seeded generator, so a seed gives the same run every time.
function random (seed) {
  let a = seed >>> 0
  return () => {
    a = (a + 0x6d2b79f5) >>> 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

// Runs in the page: wraps `pu.redraw` and `pu.draw` so each outermost redraw's count of draws is kept in
// `window.fuzzDraws`.
function countDrawsInPage () {
  window.fuzzDraws = []
  const { redraw, draw } = pu
  let current = null
  pu.draw = function (...args) {
    if (current) current.draws++
    return draw.apply(this, args)
  }
  pu.redraw = function (...args) {
    const outer = current
    current = { draws: 0 }
    try {
      return redraw.apply(this, args)
    } finally {
      if (!outer) window.fuzzDraws.push(current.draws)
      current = outer
    }
  }
}

// Runs in the page: the draw counts since the last call.
function takeDrawsInPage () {
  return window.fuzzDraws.splice(0)
}

// Runs in the page: the mode choices whose mode button shows, and the page's opening mode.
function modeChoicesInPage (choices) {
  const shown = (mode) => document.getElementById(`mo_${mode}_lb`)?.offsetParent != null
  const mode = pu.mode[pu.mode.qa].edit_mode
  const [submode, style] = pu.mode[pu.mode.qa][mode]
  return [...choices.filter(([m]) => shown(m)), [mode, submode, style]]
}

// Runs in the page: every point a click can land on in the current mode (`coord_point` in `main.js` picks only points
// of a type in `pu.type`), on the canvas, as [num, x, y], and the cell size.
function pointsInPage () {
  const canvas = document.getElementById('canvas')
  const points = []
  for (const [num, p] of pu.point.entries()) {
    if (p && pu.type.includes(p.type) && p.x >= 0 && p.y >= 0 && p.x <= canvas.offsetWidth && p.y <= canvas.offsetHeight) {
      points.push([num, p.x, p.y])
    }
  }
  return { points, size: pu.size }
}

// Runs in the page: undoes every group, then redoes as many groups as it undid, so a redo pending before stays pending.
// Penpa+'s replay flag keeps the replay log as it was, so the run goes on from the board the steps made. Returns why it
// stopped early, or null.
function undoRedoAllInPage () {
  const depth = (stack) => pu.pu_a[stack].__a.length
  let groups = 0
  while (depth('command_undo')) {
    const was = depth('command_undo')
    pu.undo(true)
    if (depth('command_undo') >= was) return `undo left command_undo at ${was} entries`
    groups++
  }
  for (let i = 0; i < groups; i++) {
    const was = depth('command_redo')
    pu.redo(true)
    if (depth('command_redo') >= was) return `redo ${i + 1} of ${groups} left command_redo at ${was} entries`
  }
  return null
}

// Runs in the page: the `#` part of the Clone link solve mode saves, the text `PenpaProgress.save` keeps for reloads.
function cloneLinkInPage () {
  savetext_clone()
  const link = document.getElementById('savetextarea').value
  return link.slice(link.indexOf('#'))
}

// The canonical state a save/load round trip of `state` reopens to. `maketext_duplicate` writes no selection and empties
// the redo stacks of the answer, by design.
function afterRoundTrip (state) {
  return state
    .replace(/^selection = .*$/m, 'selection = []')
    .replace(/^(pu_a(?:_col)?\.command_redo\.length) = \d+$/gm, '$1 = 0')
}

// How `got` differs from `want`, one line per changed key.
function diffLines (want, got) {
  const w = entries(want)
  const g = entries(got)
  return changedKeys(w, g).map((k) => `  ${k}: ${w.get(k) ?? 'absent'} → ${g.get(k) ?? 'absent'}`).join('\n')
}

// The next input as its steps, drawn by `rand` from what the page offers now, and no more than `room` steps long.
async function nextInput (page, rand, modes, room) {
  const pick = (list) => list[Math.floor(rand() * list.length)]
  const kinds = Object.entries(WEIGHTS).filter(([kind]) => kind !== 'gesture' || room >= 2)
  let roll = rand() * kinds.reduce((sum, [, w]) => sum + w, 0)
  const [kind] = kinds.find(([, w]) => (roll -= w) < 0) ?? kinds.at(-1)
  const point = (num, x, y) => ({ x, y, num })
  switch (kind) {
    case 'gesture': {
      const { points, size } = await page.evaluate(pointsInPage)
      const button = rand() < RIGHT_BUTTON ? 'right' : 'left'
      const ctrl = rand() < CTRL_HELD
      let at = pick(points)
      const steps = [{ kind: 'pointer', action: 'down', button, ctrl, ...point(...at) }]
      const moves = Math.floor(rand() * (Math.min(MAX_MOVES, room - 2) + 1))
      for (let i = 0; i < moves; i++) {
        const near = points.filter(([n, x, y]) => n !== at[0] && Math.hypot(x - at[1], y - at[2]) <= DRAG_REACH * size)
        at = pick(near.length ? near : points)
        steps.push({ kind: 'pointer', action: 'move', button: button === 'right' ? 'right' : null, ctrl: false, ...point(...at) })
      }
      steps.push({ kind: 'pointer', action: 'up', button: null, ctrl: false, ...point(...at) })
      return steps
    }
    case 'double': {
      const { points } = await page.evaluate(pointsInPage)
      return [{ kind: 'pointer', action: 'double', button: 'left', ctrl: false, ...point(...pick(points)) }]
    }
    case 'key': {
      const [call, args] = pick(KEY_CHOICES)
      return [{ kind: 'key', call, args }]
    }
    case 'mode': {
      const [mode, submode, style] = pick(modes)
      return [{ kind: 'mode', mode, submode, style }]
    }
    default:
      return [{ kind }]
  }
}

let commit
// The checkout's short sha, which a saved recording names as the one it was recorded at.
async function headCommit () {
  commit ??= (await promisify(execFile)('git', ['rev-parse', '--short', 'HEAD'], { cwd: new URL('.', import.meta.url) })).stdout.trim()
  return commit
}

// Writes the recording of a failing run, laid out as `docs/js/recorder.js` writes one, and returns its path.
async function saveRecording (dir, { puzzle, seed, page, final, steps }) {
  const { gridtype, genre } = await page.evaluate(() => ({ gridtype: pu.gridtype, genre: pu.user_tags }))
  const header = { source: puzzle.source, gridtype, genre, commit: await headCommit(), fuzz: { puzzle: puzzle.name, seed } }
  const text = '{"header": ' + JSON.stringify(header) + ',\n"final": ' + JSON.stringify(final) +
    ',\n"steps": [\n' + steps.map((s) => JSON.stringify(s)).join(',\n') + '\n]}\n'
  await mkdir(dir, { recursive: true })
  const file = join(dir, `${puzzle.name}-seed-${seed}.steps.json`)
  await writeFile(file, text)
  return file
}

// Fuzzes `puzzle` ({ name, source }, `source` its link's query and `#` part) with `seed` for `count` steps. Returns the
// steps made, `failure` (null, or the first broken invariant in words), `saved` (the failing run's recording, under
// `saveDir`) and `errors` (the page errors, as `openPenpa` gives them). `served` and `setup` go to `openPenpa`, for both
// the fuzzed page and every round trip's page.
export async function fuzz (browser, puzzle, { seed, count, saveDir = FUZZ_RECORDINGS, served = false, setup }) {
  const { context, page, errors } = await openPenpa(browser, puzzle.source, { served, setup })
  const readRaw = () => page.evaluate(readEngineState)
  const steps = []
  const fail = async (failure, final) => ({
    steps, failure, errors, saved: await saveRecording(saveDir, { puzzle, seed, page, final: final ?? await readRaw(), steps })
  })
  try {
    // The board loads after `pu` exists.
    await settle(() => readRaw().then(canonicalState))
    await page.evaluate(countDrawsInPage)
    const modes = await page.evaluate(modeChoicesInPage, MODE_CHOICES)
    const rand = random(seed)
    while (steps.length < count) {
      for (const step of await nextInput(page, rand, modes, count - steps.length)) {
        steps.push(step)
        const at = `step ${steps.length} (${stepWords(step)})`
        try {
          await page.evaluate(applyStepInPage, step)
        } catch (e) {
          // Playwright's message is the page's error's, behind its own prefix and before the page's stack.
          return await fail(`${at} threw: ${e.message.split('\n')[0].replace(/^page\.evaluate: (Error: )?/, '')}`)
        }
        if (!endsGroup(step)) continue
        const final = await readRaw()
        const failure = await checkpoint({ browser, page, errors, at, state: canonicalState(final), served, setup })
        if (failure) return await fail(failure, final)
      }
    }
    return { steps, failure: null, saved: null, errors }
  } finally {
    await context.close()
  }
}

// The first invariant broken at a checkpoint whose canonical state is `state`, in words, or null.
async function checkpoint ({ browser, page, errors, at, state, served, setup }) {
  const pageClean = async (when) => {
    if (errors.length) return `${at}${when}: page error: ${errors[0]}`
    const bad = (await page.evaluate(takeDrawsInPage)).find((draws) => draws !== 1)
    return bad === undefined ? null : `${at}${when} ran a redraw() with ${bad} draw() calls`
  }
  const dirty = await pageClean('')
  if (dirty) return dirty
  const stopped = await page.evaluate(undoRedoAllInPage)
  const redone = canonicalState(await page.evaluate(readEngineState))
  if (stopped || redone !== state) {
    return `${at}: undo-all then redo-all changed the state:\n${stopped ? `  ${stopped}\n` : ''}${diffLines(state, redone)}`
  }
  const dirtyAfter = await pageClean(', in undo-all then redo-all,')
  if (dirtyAfter) return dirtyAfter
  const link = await page.evaluate(cloneLinkInPage)
  const loaded = await openPenpa(browser, link, { served, setup })
  try {
    const want = afterRoundTrip(state)
    const got = await settle(() => loaded.page.evaluate(readEngineState).then(canonicalState), want)
    if (loaded.errors.length) return `${at}: the save/load round trip's page raised: ${loaded.errors[0]}`
    if (got !== want) return `${at}: the save/load round trip changed the state:\n${diffLines(want, got)}`
    return null
  } finally {
    await loaded.context.close()
  }
}
