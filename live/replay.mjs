// Recordings (GLOSSARY.md) and the engine driver that replays them. Not a check itself, so `live/**/*.live.mjs` skips
// it.
//
// A recording is `live/recordings/<family>/<name>.steps.json`, its id `<family>/<name>`, `<family>` a mode family, or
// `genre` and `grid` for the recordings of one genre's or one grid class's board (`live/generate-recordings.mjs`). As
// `docs/js/recorder.js` writes it, it holds a header (`source`: the link's query and `#` part; `gridtype`; `genre`: the
// page's genre tags; `recorder`: the recorder's version), `final` (the recording page's engine state once the steps
// were made, as `readEngineState` reads it) and its steps, one per line:
//   { kind: 'pointer', action: 'down' | 'move' | 'up' | 'out' | 'double', button: 'left' | 'right' | null, ctrl, x, y, num }
//     with `x, y` in board units and `num` an index of `pu.point`;
//   { kind: 'key', call, args }, `call` one of `pu`'s `key_*` methods;
//   { kind: 'mode', mode, submode, style }, the engine's own names and values for a mode change, `submode` being
//     the tool in Shape and Composite, and Number's step adding its `orientation`;
//   { kind: 'select', cells: 'none' | 'all' }, Escape and Ctrl+A, which `main.js` handles with no engine call;
//   { kind: 'undo' } and { kind: 'redo' };
//   { kind: 'unsupported', what }, an input the format cannot replay (an Alt-drag rectangle selection, a key that
//     changed the selection to neither none nor all), refused here.
// Whoever checks a recording in adds the header's `commit`, the short sha it was recorded at, which the page cannot know;
// the generator also adds `import`, the name of the puzz.link import a genre's recording was made on.
// Beside it, `<name>.expected.json` holds the canonical state at each checkpoint, written by `live/write-expected.mjs`
// and never by hand.
import { readdir, readFile, writeFile } from 'node:fs/promises'
import { canonicalState, readEngineState } from './canonical-state.mjs'
import { openPenpa } from './page.mjs'
import { settle } from './settle.mjs'

export const RECORDINGS = new URL('./recordings/', import.meta.url)
const STEPS_SUFFIX = '.steps.json'
const EXPECTED_SUFFIX = '.expected.json'
// The replay page's clock is installed and paused at this instant before the page opens, so the timer and every
// replay timestamp read 0 (`research/replay-determinism-2026-11.md` § Recommended setup).
const CLOCK_START = new Date('2026-01-01T00:00:00Z')
const CONTEXT_OPTIONS = { viewport: { width: 1280, height: 720 }, deviceScaleFactor: 1 }
// Duplicate-link pages one replay has open at once.
const ROUND_TRIPS_AT_ONCE = 4

// Indices in `pu.centerlist` of the cells the answer of `makeSurfaceSolveLink`'s puzzle shades.
export const ANSWER_CELLS = [5, 9]

// Runs in the page. Builds a 4x4 grid whose author's answer shades `answerCells`, checked as shading, and returns its
// solve link's `#` part.
function surfaceSolveLinkInPage (answerCells) {
  document.getElementById('nb_size1').value = 4
  document.getElementById('nb_size2').value = 4
  create_newboard()
  for (const box of [...document.getElementsByClassName('solcheck'), ...document.getElementsByClassName('solcheck_or')]) box.checked = false
  document.getElementById('sol_surface').checked = true
  for (const index of answerCells) pu.pu_a.surface[pu.centerlist[index]] = 1
  const url = pu.maketext_solve_solution()
  return url.slice(url.indexOf('#'))
}

// Runs in the page: the page pixel of the centre of the cell at `index` of the center list, as `coord_point` in
// `main.js` maps it back.
export function cellPixelInPage (index) {
  const canvas = document.getElementById('canvas')
  const point = pu.point[pu.centerlist[index]]
  return { x: canvas.offsetLeft + point.x - window.scrollX, y: canvas.offsetTop + point.y - window.scrollY }
}

// The `#` part of a solve link to a 4x4 puzzle whose answer shades ANSWER_CELLS.
export async function makeSurfaceSolveLink (browser) {
  const { context, page } = await openPenpa(browser)
  try {
    return await page.evaluate(surfaceSolveLinkInPage, ANSWER_CELLS)
  } finally {
    await context.close()
  }
}

// Opens `query`, a solve link's `#` part, with the recorder on, once its answer has loaded.
export async function openRecordingPage (browser, query) {
  const opened = await openPenpa(browser, '?record=1' + query)
  await settle(() => opened.page.evaluate(() => Boolean(pu.solution)), true)
  return opened
}

// A real click at the centre of the cell at `index` of the center list.
export async function clickCell (page, index, options) {
  const { x, y } = await page.evaluate(cellPixelInPage, index)
  await page.mouse.click(x, y, options)
}

// Clicks the recorder's download button on a `?record=1` page and returns the file's name and its recording.
export async function downloadRecording (page) {
  const [file] = await Promise.all([page.waitForEvent('download'), page.click('#recorder_download')])
  return { name: file.suggestedFilename(), recording: JSON.parse(await readFile(await file.path(), 'utf8')) }
}

// The id of every recording under `live/recordings/`, sorted.
export async function listRecordings () {
  const files = await readdir(RECORDINGS, { recursive: true })
  return files.filter((f) => f.endsWith(STEPS_SUFFIX)).map((f) => f.slice(0, -STEPS_SUFFIX.length)).sort()
}

// A recording's file text, laid out as `docs/js/recorder.js` downloads it: one step per line, so a reviewer reads a
// recording's diff step by step.
export function recordingText ({ header, final, steps }) {
  return '{"header": ' + JSON.stringify(header) + ',\n"final": ' + JSON.stringify(final) +
    ',\n"steps": [\n' + steps.map((s) => JSON.stringify(s)).join(',\n') + '\n]}\n'
}

export async function readRecording (id) {
  return JSON.parse(await readFile(new URL(id + STEPS_SUFFIX, RECORDINGS), 'utf8'))
}

// The expected checkpoints, each state back as the string `canonicalState` writes.
export async function readExpected (id) {
  const { checkpoints } = JSON.parse(await readFile(new URL(id + EXPECTED_SUFFIX, RECORDINGS), 'utf8'))
  return checkpoints.map(({ step, state }) => ({ step, state: state.join('\n') + '\n' }))
}

// Each state written one line per array entry, so a changed line reads as one line of the file's diff.
export async function writeExpected (id, checkpoints) {
  const file = { checkpoints: checkpoints.map(({ step, state }) => ({ step, state: state.trimEnd().split('\n') })) }
  await writeFile(new URL(id + EXPECTED_SUFFIX, RECORDINGS), JSON.stringify(file, null, 1) + '\n')
}

// Runs in the page: makes the engine call the step's input made, with the pointer fields `main.js` sets before it.
function applyStepInPage (step) {
  switch (step.kind) {
    case 'pointer': {
      const { action, button, ctrl, x, y, num } = step
      // `window_click` in main.js copies the device's press event onto `pu` at the first mousedown on the page, and
      // some Composite tools act differently for a mouse than for touch once it has.
      if (action === 'down' && !pu.ondown_key) pu.ondown_key = 'mousedown'
      if (action === 'down' || action === 'double') pu.select_remove = ctrl && pu.selection.indexOf(num) !== -1
      if (action === 'double') {
        pu.mouse_mode = 'down_left'
        pu.mouse_click = 0
        pu.dblmouseevent(x, y, num, ctrl)
        return
      }
      pu.mouse_mode = action === 'down' ? 'down_' + button : action
      pu.mouse_click = button === 'right' ? 2 : 0
      if (action === 'down') pu.mouse_click_last = button === 'right' ? 2 : 1
      // A down passes its event, which the engine reads only for Alt; the recorder writes no step for an Alt-drag.
      pu.mouseevent(x, y, num, ctrl, action === 'down' ? { altKey: false } : null, null)
      return
    }
    case 'key':
      if (!/^key_/.test(step.call) || typeof pu[step.call] !== 'function') throw new Error(`no key call ${step.call}`)
      pu[step.call](...step.args)
      return
    case 'mode': {
      // Multicolor keeps its styles under Surface's ids, as `mode_set` reads them.
      const styleIds = step.mode === 'multicolor' ? 'surface' : step.mode
      if (pu.mode[pu.mode.qa].edit_mode !== step.mode) pu.mode_set(step.mode)
      const now = () => pu.mode[pu.mode.qa][step.mode]
      if (now()[0] !== step.submode) {
        if (step.mode === 'symbol') pu.subsymbolmode(step.submode)
        else if (step.mode === 'combi') pu.subcombimode(step.submode)
        else pu.submode_check('sub_' + step.mode + step.submode)
      }
      if (now()[1] !== step.style) pu.stylemode_check('st_' + styleIds + step.style)
      if (step.orientation && now()[2] !== step.orientation) pu.set_orientation(step.orientation)
      if (now()[0] !== step.submode || now()[1] !== step.style || (step.orientation && now()[2] !== step.orientation)) {
        throw new Error(`mode ${step.mode} has no sub-mode ${step.submode}, style ${step.style}${step.orientation ? ` and orientation ${step.orientation}` : ''} to switch to`)
      }
      return
    }
    case 'select':
      // What `main.js` does on Escape and Ctrl+A.
      if (step.cells === 'none') pu.selection = []
      else if (step.cells === 'all') pu.selection = pu.centerlist.slice()
      else throw new Error(`no selection ${step.cells}`)
      pu.redraw()
      return
    case 'undo':
      pu.undo()
      return
    case 'redo':
      pu.redo()
      return
    default:
      throw new Error(`no engine call for a step of kind ${step.kind}${step.what ? ` (${step.what})` : ''}`)
  }
}

// A step in words, for a failure report.
function stepWords (step) {
  switch (step.kind) {
    case 'pointer':
      return `${step.button ? step.button + ' ' : ''}${step.action}${step.ctrl ? ' with Ctrl' : ''} at point ${step.num}`
    case 'key':
      return `${step.call}(${step.args.map((a) => JSON.stringify(a)).join(', ')})`
    case 'mode':
      return `mode ${step.mode}, sub-mode ${JSON.stringify(step.submode)}, style ${step.style}${step.orientation ? `, orientation ${step.orientation}` : ''}`
    case 'select':
      return `select ${step.cells}`
    default:
      return step.kind
  }
}

// A checkpoint follows every step but the down and the moves of a gesture, so a gesture is compared once it has ended,
// and every key, mode change, undo and redo on its own.
function endsGroup (step) {
  return !(step.kind === 'pointer' && (step.action === 'down' || step.action === 'move'))
}

// A canonical state as its lines' keys and values.
function entries (state) {
  return new Map(state.split('\n').filter(Boolean).map((line) => {
    const at = line.indexOf(' = ')
    return [line.slice(0, at), line.slice(at + 3)]
  }))
}

const isReplayWrite = (key) => /\.command_replay\.\d+$/.test(key)

// Every key whose value differs between two states, in the expected state's order, then the replay's new keys.
function changedKeys (want, got) {
  return [...new Set([...want.keys(), ...got.keys()])].filter((k) => want.get(k) !== got.get(k))
}

// The lines of a report that say how two states differ and how the page went.
function stateDiff ({ want, got, wantName, gotName = 'replayed', errors }) {
  const w = entries(want)
  const g = entries(got)
  const changed = changedKeys(w, g)
  const firstWrite = changed.find(isReplayWrite)
  const value = (map, key) => map.get(key) ?? 'absent'
  return [
    `State, ${wantName} → ${gotName}:`,
    ...changed.filter((k) => !isReplayWrite(k)).map((k) => `  ${k}: ${value(w, k)} → ${value(g, k)}`),
    firstWrite
      ? `First differing command_replay write: ${firstWrite.replace(/\.command_replay\.(\d+)$/, ' #$1')}: expected ${value(w, firstWrite)} got ${value(g, firstWrite)}`
      : 'First differing command_replay write: none',
    `Page errors: ${errors.length ? '\n  ' + errors.join('\n  ') : 'none'}`
  ]
}

// Step 0 is no input: its checkpoint is the board the link loads.
function checkpointWords (steps, n) {
  return n === 0 ? 'the board the link loads' : stepWords(steps[n - 1])
}

function failureReport ({ id, step, steps, since, want, got, errors }) {
  return [
    `${id}: step ${step} (${checkpointWords(steps, step)}) differs from the recording`,
    ...since.length ? [`  since the last checkpoint: ${since.map((n) => `step ${n} ${stepWords(steps[n - 1])}`).join('; ')}`] : [],
    ...stateDiff({ want, got, wantName: 'expected', errors })
  ].join('\n')
}

// Null when `state`, the replay's last, is the board the recording page reached, else the report of how they differ.
function finalReport ({ id, recording, state, errors }) {
  if (!recording.final) return `${id}: the recording has no final board to check the replay against`
  const want = canonicalState(recording.final)
  if (want === state) return null
  return [
    `${id}: the replay ends on a board the recording page did not reach: an input the recorder did not see, or a board`,
    '  that did not start from the recording\'s link',
    ...stateDiff({ want, got: state, wantName: 'recording page', errors })
  ].join('\n')
}

// Runs in the page: the `#` part of the link Penpa+'s Duplicate button opens for this solve (`duplicate()` in
// general.js).
function duplicateLinkInPage () {
  const link = pu.maketext_duplicate() + '&l=solvedup'
  return link.slice(link.indexOf('#'))
}

// Lines a duplicate link drops by design, left out of the round trip's comparison: `maketext_duplicate` empties the
// redo stacks (class_p.js), and no link holds the selection.
const DUPLICATE_DROPS = /^(pu_a(_col)?\.command_redo\.length|selection) = .*$/

function withoutDuplicateDrops (state) {
  return state.split('\n').filter((line) => !DUPLICATE_DROPS.test(line)).join('\n')
}

// Replays `recording` through the engine in a fresh page and returns its checkpoints, the first being step 0. With
// `expected` (as `readExpected` returns it) it stops at the first checkpoint that differs and returns the report of
// it. At every checkpoint the duplicate link of the board, loaded in another fresh page, must give the same board,
// less what the link drops by design. A replay that does not end on the recording's final board is reported too;
// otherwise `report` is null. `served` and `setup` go to `openPenpa`, for the duplicate's page as well.
export async function replay (browser, recording, { id = 'recording', expected, served = false, setup } = {}) {
  // The solved message opens from a 20 ms `setTimeout` in `check_solution`, so under the paused clock it never opens.
  const open = (query) => openPenpa(browser, query, {
    served,
    contextOptions: CONTEXT_OPTIONS,
    setup: async (c) => {
      await c.clock.install({ time: CLOCK_START })
      await c.clock.pauseAt(CLOCK_START)
      await setup?.(c)
    }
  })
  const readPage = (p) => p.evaluate(readEngineState).then(canonicalState)
  const { context, page, errors } = await open(recording.header.source)
  const read = () => readPage(page)
  // Each duplicate link checked so far: a step that changed nothing gives the same link, and loads the same board.
  const duplicates = new Set()
  // The round trips under way, in step order, each resolving to its report or null. They run beside the replay, at
  // most ROUND_TRIPS_AT_ONCE pages at a time, since each waits on a page load.
  const roundTrips = []
  let running = 0
  const waiting = []
  const slot = async () => {
    if (running >= ROUND_TRIPS_AT_ONCE) await new Promise((resolve) => waiting.push(resolve))
    running++
  }
  const free = () => { running--; waiting.shift()?.() }
  // Starts the check that a fresh page loads the duplicate link of `state`, the board at checkpoint `n`, as `state`.
  const startRoundTrip = async (n, state) => {
    const link = await page.evaluate(duplicateLinkInPage)
    if (duplicates.has(link)) return
    duplicates.add(link)
    const want = withoutDuplicateDrops(state)
    roundTrips.push((async () => {
      await slot()
      const fresh = await open(link)
      try {
        const got = await settle(() => readPage(fresh.page).then(withoutDuplicateDrops), want)
        if (got === want) return null
        return [
          `${id}: step ${n} (${checkpointWords(steps, n)}): its duplicate link loads a different board`,
          ...stateDiff({ want, got, wantName: 'replay', gotName: 'duplicate', errors: [...errors, ...fresh.errors] })
        ].join('\n')
      } finally {
        await fresh.context.close()
        free()
      }
    })())
  }
  // The report of the earliest round trip that failed, else `report`.
  const withRoundTrips = async (report) => (await Promise.all(roundTrips)).find(Boolean) ?? report
  const { steps } = recording
  const checkpoints = []
  // The report of the first way checkpoint `n` differs from the expected file, else null.
  const checkpoint = async (n, since) => {
    const want = expected?.[checkpoints.length]
    if (expected && want?.step !== n) {
      return `${id}: step ${n} is a checkpoint, where the expected file has ${want ? `step ${want.step}` : 'none'}`
    }
    // The board loads after `pu` exists, so step 0's read waits for it. Under the paused clock no page timer runs,
    // so after a step the state is final, and `settle` only waits out a mismatch before it is reported.
    const state = want ? await settle(read, want.state) : n === 0 ? await settle(read) : await read()
    checkpoints.push({ step: n, state })
    if (want && state !== want.state) return failureReport({ id, step: n, steps, since, want: want.state, got: state, errors })
    await startRoundTrip(n, state)
    return null
  }
  try {
    let report = await checkpoint(0, [])
    if (report) return { checkpoints, report: await withRoundTrips(report) }
    let since = []
    for (const [index, step] of steps.entries()) {
      const n = index + 1
      since.push(n)
      try {
        await page.evaluate(applyStepInPage, step)
      } catch (e) {
        // Playwright's message is the page's error's, behind its own prefix and before the page's stack.
        const message = e.message.split('\n')[0].replace(/^page\.evaluate: (Error: )?/, '')
        throw new Error(`${id}: step ${n} (${stepWords(step)}) could not be replayed: ${message}`)
      }
      if (!endsGroup(step) && n < steps.length) continue
      report = await checkpoint(n, since)
      if (report) return { checkpoints, report: await withRoundTrips(report) }
      since = []
    }
    if (expected && expected.length > checkpoints.length) {
      return { checkpoints, report: await withRoundTrips(`${id}: the replay ended after ${checkpoints.length} checkpoints, where the expected file has ${expected.length}`) }
    }
    return { checkpoints, report: await withRoundTrips(finalReport({ id, recording, state: checkpoints.at(-1).state, errors })) }
  } finally {
    // A step that could not be replayed leaves round trips under way; none outlives the replay.
    await Promise.allSettled(roundTrips)
    await context.close()
  }
}
