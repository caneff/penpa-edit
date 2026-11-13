// Recordings (GLOSSARY.md) and the two drivers that replay them: the engine driver, through `pu`'s own calls, and the
// UI driver, through Playwright's mouse and keyboard. Not a check itself, so `live/**/*.live.mjs` skips
// it.
//
// A recording is `live/recordings/<family>/<name>.steps.json`, its id `<family>/<name>`, `<family>` a mode family. As
// `docs/js/recorder.js` writes it, it holds a header (`source`: the link's query and `#` part; `gridtype`; `genre`: the
// page's genre tags; `recorder`: the recorder's version), `final` (the recording page's engine state once the steps
// were made, as `readEngineState` reads it) and its steps, one per line:
//   { kind: 'pointer', action: 'down' | 'move' | 'up' | 'out' | 'double', button: 'left' | 'right' | null, ctrl, x, y, num }
//     with `x, y` in board units and `num` an index of `pu.point`;
//   { kind: 'key', call, args }, `call` one of `pu`'s `key_*` methods;
//   { kind: 'mode', mode, submode, style }, the engine's own names and values for a mode change;
//   { kind: 'undo' } and { kind: 'redo' };
//   { kind: 'unsupported', what }, an input the format cannot replay (an Alt-drag rectangle selection), refused here.
// Whoever checks a recording in adds the header's `commit`, the short sha it was recorded at, which the page cannot know.
// Beside it, `<name>.expected.json` holds the canonical state at each checkpoint, written by `live/write-expected.mjs`
// and never by hand.
import { readdir, readFile, writeFile } from 'node:fs/promises'
import { canonicalState, readEngineState } from './canonical-state.mjs'
import { openPenpa } from './page.mjs'
import { settle } from './settle.mjs'

const RECORDINGS = new URL('./recordings/', import.meta.url)
const STEPS_SUFFIX = '.steps.json'
const EXPECTED_SUFFIX = '.expected.json'
// The replay page's clock is installed and paused at this instant before the page opens, so the timer and every
// replay timestamp read 0 (`research/replay-determinism-2026-11.md` § Recommended setup).
const CLOCK_START = new Date('2026-01-01T00:00:00Z')
const CONTEXT_OPTIONS = { viewport: { width: 1280, height: 720 }, deviceScaleFactor: 1 }

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

// Runs in the page: the edit mode, and the sub-mode and style `mode` is set to.
function modeInPage (mode) {
  const [submode, style] = pu.mode[pu.mode.qa][mode]
  return { edit: pu.mode[pu.mode.qa].edit_mode, submode, style }
}

// Switches to a mode step's mode, sub-mode and style, each only when it differs, so a step that repeats the current
// choice makes no input. `choose` makes the input that chooses each, given the id of its radio button in the mode
// panel, which `submode_check` and `stylemode_check` take too.
async function switchMode (page, step, choose) {
  // Multicolor keeps its styles under Surface's ids, as `mode_set` reads them.
  const styleIds = step.mode === 'multicolor' ? 'surface' : step.mode
  const now = () => page.evaluate(modeInPage, step.mode)
  if ((await now()).edit !== step.mode) await choose.mode('mo_' + step.mode)
  if ((await now()).submode !== step.submode) await choose.submode('sub_' + step.mode + step.submode)
  if ((await now()).style !== step.style) await choose.style('st_' + styleIds + step.style)
  const { submode, style } = await now()
  if (submode !== step.submode || style !== step.style) {
    throw new Error(`mode ${step.mode} has no sub-mode ${step.submode} and style ${step.style} to switch to`)
  }
}

// A driver's `start(page)` returns the function that makes a step's input on that page, and `checkpointAfter(step,
// next)` says whether a checkpoint follows `step`, `next` being the step after it.
// The engine driver: each step as the engine call its input made.
const engineDriver = { start: startEngineDriver, checkpointAfter: endsGroup }

function startEngineDriver (page) {
  const choose = {
    mode: (id) => page.evaluate((mode) => pu.mode_set(mode), id.slice('mo_'.length)),
    submode: (id) => page.evaluate((id) => pu.submode_check(id), id),
    style: (id) => page.evaluate((id) => pu.stylemode_check(id), id)
  }
  return (step) => step.kind === 'mode' ? switchMode(page, step, choose) : page.evaluate(applyStepInPage, step)
}

// Runs in the page: the viewport pixel of the board point at `x, y` through the canvas's place in the current layout,
// read from the layout itself rather than from `coord_point`'s own arithmetic, which is what the UI driver checks.
function boardPixelInPage ({ x, y }) {
  const box = document.getElementById('canvas').getBoundingClientRect()
  return { x: box.left + x, y: box.top + y }
}

// Runs in the page: a viewport pixel just outside the canvas, above its top-left corner.
function outsideCanvasInPage () {
  const box = document.getElementById('canvas').getBoundingClientRect()
  return { x: box.left, y: box.top - 1 }
}

// The key, as Playwright's `keyboard.press` names it, that makes `main.js` make a key step's call outside Sudoku and
// Multicolor, whose keys `main.js` remaps before the call.
function keyOf ({ call, args }) {
  switch (call) {
    case 'key_number':
      // Shift+Space is the one key `main.js` turns into a space.
      if (args.length === 1 && args[0] === ' ') return 'Shift+Space'
      if (args.length === 1 && typeof args[0] === 'string' && args[0].length === 1) return args[0]
      break
    case 'key_arrow':
      return (args[1] ? 'Control+' : '') + args[0]
    case 'key_space': {
      // `main.js` passes the key code of Space or Delete, then whether Shift and Ctrl were held.
      const [keycode, shift, ctrl] = args
      const key = { 32: 'Space', 46: 'Delete' }[keycode]
      if (key) return (ctrl ? 'Control+' : '') + (shift ? 'Shift+' : '') + key
      break
    }
    case 'key_shiftspace':
      return 'Control+Space'
    case 'key_backspace':
      return 'Backspace'
  }
  throw new Error(`no key makes ${call}(${args.map((a) => JSON.stringify(a)).join(', ')})`)
}

// The UI driver: each step as the mouse or keyboard input a solver makes, a pointer step at the page pixel its board
// units map to through the current layout. A key that also changes the style (a digit in Surface picks a colour) is
// recorded as a key step and then a mode step, both made by the one key press, so a key step followed by a mode step
// is checked once, after the mode step.
const uiDriver = {
  start: startUiDriver,
  checkpointAfter: (step, next) => endsGroup(step) && !(step.kind === 'key' && next?.kind === 'mode')
}

function startUiDriver (page) {
  const choose = { mode: click, submode: click, style: click }
  // The mouse's place and the button it holds down, since a step names only where it ends.
  let at = null
  let held = null

  function click (id) {
    return page.click(`#${id}_lb`)
  }

  async function moveTo ({ x, y }) {
    await page.mouse.move(x, y)
    at = { x, y }
  }

  // A press or release where the mouse already is, as after the move a real gesture starts with.
  async function moveIfAway (pixel) {
    if (!at || at.x !== pixel.x || at.y !== pixel.y) await moveTo(pixel)
  }

  async function pointer (step) {
    switch (step.action) {
      case 'move':
        return moveTo(await page.evaluate(boardPixelInPage, step))
      case 'down':
        await moveIfAway(await page.evaluate(boardPixelInPage, step))
        if (step.ctrl) await page.keyboard.down('Control')
        await page.mouse.down({ button: step.button })
        held = { button: step.button, ctrl: step.ctrl }
        return
      case 'up':
        await moveIfAway(await page.evaluate(boardPixelInPage, step))
        await page.mouse.up({ button: held?.button ?? 'left' })
        if (held?.ctrl) await page.keyboard.up('Control')
        held = null
        return
      case 'out':
        return moveTo(await page.evaluate(outsideCanvasInPage))
    }
    throw new Error(`no mouse input for a pointer step of action ${step.action}`)
  }

  return async (step) => {
    switch (step.kind) {
      case 'pointer':
        return pointer(step)
      case 'key':
        return page.keyboard.press(keyOf(step))
      case 'mode':
        return switchMode(page, step, choose)
      case 'undo':
        return page.keyboard.press('Control+z')
      case 'redo':
        return page.keyboard.press('Control+y')
    }
    throw new Error(`no mouse or keyboard input for a step of kind ${step.kind}${step.what ? ` (${step.what})` : ''}`)
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
      return `mode ${step.mode}, sub-mode ${JSON.stringify(step.submode)}, style ${step.style}`
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

// What a replay's checkpoints are compared with, as a report names it: the expected file, or the engine driver's
// replay when the UI driver's is compared with it.
const AGAINST_EXPECTED = { source: 'the recording', wantName: 'expected', gotName: 'replayed' }
const AGAINST_ENGINE = { source: 'the engine driver', wantName: 'engine driver', gotName: 'UI driver' }

function failureReport ({ id, step, steps, since, want, got, errors, against }) {
  return [
    `${id}: step ${step} (${stepWords(steps[step - 1])}) differs from ${against.source}`,
    `  since the last checkpoint: ${since.map((n) => `step ${n} ${stepWords(steps[n - 1])}`).join('; ')}`,
    ...stateDiff({ want, got, wantName: against.wantName, gotName: against.gotName, errors })
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

// Replays `recording` through `driver` (the engine driver unless given) in a fresh page and returns its checkpoints.
// With `expected` (as `readExpected` returns it, or another replay's checkpoints, named by `against`) it stops at the
// first checkpoint that differs and returns the report of it. A replay that does not end on the recording's final
// board is reported too; otherwise `report` is null. `served` and `setup` go to `openPenpa`.
export async function replay (browser, recording, {
  id = 'recording', expected, served = false, setup, driver = engineDriver, against = AGAINST_EXPECTED
} = {}) {
  // The solved message opens from a 20 ms `setTimeout` in `check_solution`, so under the paused clock it never opens.
  const { context, page, errors } = await openPenpa(browser, recording.header.source, {
    served,
    contextOptions: CONTEXT_OPTIONS,
    setup: async (c) => {
      await c.clock.install({ time: CLOCK_START })
      await c.clock.pauseAt(CLOCK_START)
      await setup?.(c)
    }
  })
  const read = () => page.evaluate(readEngineState).then(canonicalState)
  const { steps } = recording
  const apply = driver.start(page)
  const checkpoints = []
  try {
    // The board loads after `pu` exists; every later change is a synchronous engine call made below.
    await settle(read)
    let since = []
    for (const [index, step] of steps.entries()) {
      const n = index + 1
      since.push(n)
      try {
        await apply(step)
      } catch (e) {
        // A page error's message comes behind Playwright's prefix and before the page's stack.
        const message = e.message.split('\n')[0].replace(/^page\.evaluate: (Error: )?/, '')
        throw new Error(`${id}: step ${n} (${stepWords(step)}) could not be replayed: ${message}`)
      }
      if (!driver.checkpointAfter(step, steps[n]) && n < steps.length) continue
      const want = expected?.[checkpoints.length]
      if (expected && want?.step !== n) {
        return { checkpoints, report: `${id}: step ${n} is a checkpoint, where the expected file has ${want ? `step ${want.step}` : 'none'}` }
      }
      // Under the paused clock no page timer runs, so the state after the call is final; `settle` only waits out a
      // mismatch before it is reported.
      const state = want ? await settle(read, want.state) : await read()
      checkpoints.push({ step: n, state })
      if (want && state !== want.state) {
        return { checkpoints, report: failureReport({ id, step: n, steps, since, want: want.state, got: state, errors, against }) }
      }
      since = []
    }
    if (expected && expected.length > checkpoints.length) {
      return { checkpoints, report: `${id}: the replay ended after ${checkpoints.length} checkpoints, where the expected file has ${expected.length}` }
    }
    return { checkpoints, report: finalReport({ id, recording, state: checkpoints.at(-1).state, errors }) }
  } finally {
    await context.close()
  }
}

// Replays `recording` through the engine driver, then through the UI driver compared with it at each checkpoint, and
// returns null when they agree, else the report of the first difference: a UI bug, whatever the expected file says.
// `served` and `setup` go to `openPenpa` for both, so both replay the same page.
export async function compareDrivers (browser, recording, { id = 'recording', served = false, setup } = {}) {
  const engine = await replay(browser, recording, { id, served, setup })
  if (engine.report) return engine.report
  const { steps } = recording
  const expected = engine.checkpoints.filter(({ step }) => step === steps.length || uiDriver.checkpointAfter(steps[step - 1], steps[step]))
  const ui = await replay(browser, recording, { id, served, setup, driver: uiDriver, expected, against: AGAINST_ENGINE })
  return ui.report
}
