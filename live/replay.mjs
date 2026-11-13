// Recordings (GLOSSARY.md) and the two drivers that replay them: the engine driver, through `pu`'s own calls, and the
// UI driver, through Playwright's mouse and keyboard. Not a check itself, so `live/**/*.live.mjs` skips
// it.
//
// A recording is `live/recordings/<family>/<name>.steps.json`, its id `<family>/<name>`, `<family>` a mode family,
// `genre` and `grid` for the recordings of one genre's or one grid class's board (`live/generate-recordings.mjs`), or
// `fuzz` for a failing run the fuzz (`live/fuzz.mjs`) saved. As `docs/js/recorder.js` writes it, it holds a header
// (`source`: the link's query and `#` part; `gridtype`; `genre`: the page's genre tags; `recorder`: the recorder's
// version), `final` (the recording page's engine state once the steps were made, as `readEngineState` reads it) and its
// steps, one per line:
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
// the generator also adds `import`, the name of the puzz.link import a genre's recording was made on. The fuzz writes
// `commit` itself, and `fuzz` (its puzzle and seed) in place of `recorder`.
// Beside it, `<name>.expected.json` holds the canonical state at each checkpoint, written from a replay by
// `live/write-expected.mjs` or `live/generate-recordings.mjs`, never by hand. A fuzz recording has none until its bug is fixed, and its replay test fails until then.
import { readdir, readFile, writeFile } from 'node:fs/promises'
import { canonicalState, readEngineState } from './canonical-state.mjs'
import { linkFromNewBoard, openPenpa } from './page.mjs'
import { settle } from './settle.mjs'

export const RECORDINGS = new URL('./recordings/', import.meta.url)
const STEPS_SUFFIX = '.steps.json'
const EXPECTED_SUFFIX = '.expected.json'
// The replay page's clock is installed and paused at this instant before the page opens, so the timer and every
// replay timestamp read 0 (`research/replay-determinism-2026-11.md` § Recommended setup).
const CLOCK_START = new Date('2026-01-01T00:00:00Z')
const CONTEXT_OPTIONS = { viewport: { width: 1280, height: 720 }, deviceScaleFactor: 1 }
// Duplicate-link pages one replay has open at once.
const ROUND_TRIP_LANES = 4

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
  return pu.maketext_solve_solution()
}

// A link's `#` part, which holds its puzzle.
export function linkHash (url) {
  return url.slice(url.indexOf('#'))
}

// The viewport pixel of point `num` of `pu.point`.
export async function pointPixel (page, num) {
  const board = await page.evaluate((num) => {
    const { x, y } = pu.point[num]
    return { x, y }
  }, num)
  return page.evaluate(boardPixelInPage, board)
}

// The viewport pixel of the centre of the cell at `index` of the center list.
export async function cellPixel (page, index) {
  return pointPixel(page, await page.evaluate((index) => pu.centerlist[index], index))
}

// The `#` part of a solve link to a 4x4 puzzle whose answer shades ANSWER_CELLS.
export async function makeSurfaceSolveLink (browser) {
  return linkHash(await linkFromNewBoard(browser, surfaceSolveLinkInPage, ANSWER_CELLS))
}

// Opens `query`, a solve link's `#` part, with the recorder on, once its answer has loaded.
export async function openRecordingPage (browser, query) {
  const opened = await openPenpa(browser, '?record=1' + query)
  await settle(() => opened.page.evaluate(() => Boolean(pu.solution)), true)
  return opened
}

// A real click at the centre of the cell at `index` of the center list.
export async function clickCell (page, index, options) {
  const { x, y } = await cellPixel(page, index)
  await page.mouse.click(x, y, options)
}

// Clicks the recorder's download button on a `?record=1` page and returns the file's name, its text and its recording.
export async function downloadRecording (page) {
  const [file] = await Promise.all([page.waitForEvent('download'), page.click('#recorder_download')])
  const text = await readFile(await file.path(), 'utf8')
  return { name: file.suggestedFilename(), text, recording: JSON.parse(text) }
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
  let text
  try {
    text = await readFile(new URL(id + EXPECTED_SUFFIX, RECORDINGS), 'utf8')
  } catch (e) {
    if (e.code !== 'ENOENT') throw e
    throw new Error(`${id} has no expected file: once the replay is right, run node live/write-expected.mjs ${id}`)
  }
  const { checkpoints } = JSON.parse(text)
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

// Runs in the page: the edit mode, and the sub-mode, style and orientation `mode` is set to.
function modeInPage (mode) {
  const [submode, style, orientation] = pu.mode[pu.mode.qa][mode]
  return { edit: pu.mode[pu.mode.qa].edit_mode, submode, style, orientation }
}

// Shape and Composite keep their tool where other modes keep their sub-mode, chosen from a list rather than a radio
// button: `subsymbolmode` and `subcombimode`.
const TOOL_MODES = ['symbol', 'combi']

// Switches to a mode step's mode, sub-mode (or tool), style and orientation, each only when it differs, so a step that
// repeats the current choice makes no input. `choose` makes the input that chooses each: `mode` given the mode's name,
// `submode` and `style` given the id `submode_check` and `stylemode_check` take, which is their radio button's in the
// mode panel, `tool` given the mode and the tool's name, and `orientation` given its direction.
async function switchMode (page, step, choose) {
  // Multicolor keeps its styles under Surface's ids, as `mode_set` reads them.
  const styleIds = step.mode === 'multicolor' ? 'surface' : step.mode
  const now = () => page.evaluate(modeInPage, step.mode)
  if ((await now()).edit !== step.mode) await choose.mode(step.mode)
  if ((await now()).submode !== step.submode) {
    if (TOOL_MODES.includes(step.mode)) await choose.tool(step.mode, step.submode)
    else await choose.submode('sub_' + step.mode + step.submode)
  }
  if ((await now()).style !== step.style) await choose.style('st_' + styleIds + step.style)
  if (step.orientation && (await now()).orientation !== step.orientation) await choose.orientation(step.orientation)
  const { submode, style, orientation } = await now()
  if (submode !== step.submode || style !== step.style || (step.orientation && orientation !== step.orientation)) {
    const choice = step.orientation ? `sub-mode ${step.submode}, style ${step.style} and orientation ${step.orientation}` : `sub-mode ${step.submode} and style ${step.style}`
    throw new Error(`mode ${step.mode} has no ${choice} to switch to`)
  }
}

// A driver's `start(page)` returns the function that makes a step's input on that page, and `checkpointAfter(step,
// next)` says whether a checkpoint follows `step`, `next` being the step after it.
// The engine driver: each step as the engine call its input made.
export const engineDriver = { start: startEngineDriver, checkpointAfter: endsGroup }

function startEngineDriver (page) {
  const choose = {
    mode: (mode) => page.evaluate((mode) => pu.mode_set(mode), mode),
    submode: (id) => page.evaluate((id) => pu.submode_check(id), id),
    tool: (mode, tool) => page.evaluate(([mode, tool]) => mode === 'symbol' ? pu.subsymbolmode(tool) : pu.subcombimode(tool), [mode, tool]),
    style: (id) => page.evaluate((id) => pu.stylemode_check(id), id),
    orientation: (direction) => page.evaluate((direction) => pu.set_orientation(direction), direction)
  }
  return (step) => step.kind === 'mode' ? switchMode(page, step, choose) : page.evaluate(applyStepInPage, step)
}

// Whether a checkpoint follows step `n` (counted from 1) of `steps` under `driver`: the last step always has one.
function isCheckpoint (driver, steps, n) {
  return n === steps.length || driver.checkpointAfter(steps[n - 1], steps[n])
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

// How far the UI driver moves the page's clock before each step. `main.js` reads `Date.now()` for its key windows (15
// ms after a Shift release in Sudoku, 300 ms after a 1 in Surface), which a clock paused at one instant always meets.
const STEP_GAP_MS = 1000

// The key, as Playwright's `keyboard.press` names it, that makes `main.js` make a key step's call. A call `main.js`
// makes only from a remapped key has no entry and is refused: Multicolor's colour digits (a number argument) and
// Sudoku's Backspace (`key_space` with code 8). Sudoku's Shift and Ctrl marks are recorded as a sub-mode step around
// a plain key, so they replay as a click in the mode panel and the plain key.
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
// units map to through the current layout. A digit in Surface picks a colour as well as making its key call, and is
// recorded as a key step and then a Surface mode step, both made by the one key press, so that pair is checked once,
// after the mode step.
export const uiDriver = {
  start: startUiDriver,
  checkpointAfter: (step, next) => endsGroup(step) &&
    !(step.kind === 'key' && step.call === 'key_number' && next?.kind === 'mode' && next.mode === 'surface')
}

function startUiDriver (page) {
  // Where the mouse is, or null once a click in the mode panel has moved it; and the button a down step holds.
  let mousePixel = null
  let pressed = null
  let stepsMade = 0

  async function clickInPanel (id) {
    // A missing button would hold the click for Playwright's whole timeout.
    if (!await page.locator(`#${id}_lb`).count()) throw new Error(`no button ${id}_lb in the mode panel`)
    await page.click(`#${id}_lb`)
    mousePixel = null
  }

  async function moveTo ({ x, y }) {
    await page.mouse.move(x, y)
    mousePixel = { x, y }
  }

  // A press or release where the mouse already is, as after the move a real gesture starts with.
  async function moveIfAway (pixel) {
    if (!mousePixel || mousePixel.x !== pixel.x || mousePixel.y !== pixel.y) await moveTo(pixel)
  }

  async function pointer (step) {
    switch (step.action) {
      case 'move':
        return moveTo(await page.evaluate(boardPixelInPage, step))
      case 'down':
        await moveIfAway(await page.evaluate(boardPixelInPage, step))
        if (step.ctrl) await page.keyboard.down('Control')
        await page.mouse.down({ button: step.button })
        pressed = { button: step.button, ctrl: step.ctrl }
        return
      case 'up':
        if (!pressed) throw new Error('no mouse button is down to release')
        await moveIfAway(await page.evaluate(boardPixelInPage, step))
        await page.mouse.up({ button: pressed.button })
        if (pressed.ctrl) await page.keyboard.up('Control')
        pressed = null
        return
      case 'out':
        return moveTo(await page.evaluate(outsideCanvasInPage))
    }
    throw new Error(`no mouse input for a pointer step of action ${step.action}`)
  }

  function mode (step) {
    return switchMode(page, step, {
      mode: (name) => clickInPanel('mo_' + name),
      submode: clickInPanel,
      // The tool lists are hidden until their dialog opens; `window_click` in `main.js` reads only the mousedown's
      // target.
      tool: async (mode, tool) => {
        const id = `#${mode === 'symbol' ? 'ms_' : 'combisub_'}${tool}`
        if (!await page.locator(id).count()) throw new Error(`no tool ${tool} in ${mode}`)
        await page.dispatchEvent(id, 'mousedown')
        mousePixel = null
      },
      orientation: (direction) => clickInPanel('rot_' + direction),
      style: (id) => {
        if (step.mode === 'multicolor') throw new Error('no input for a Multicolor style alone: its button makes a key call too')
        return clickInPanel(id)
      }
    })
  }

  return async (step) => {
    stepsMade++
    await page.clock.setSystemTime(CLOCK_START.getTime() + stepsMade * STEP_GAP_MS)
    switch (step.kind) {
      case 'pointer':
        return pointer(step)
      case 'key':
        return page.keyboard.press(keyOf(step))
      case 'mode':
        return mode(step)
      case 'select':
        if (step.cells === 'none') return page.keyboard.press('Escape')
        if (step.cells === 'all') return page.keyboard.press('Control+a')
        break
      case 'undo':
        return page.keyboard.press('Control+z')
      case 'redo':
        return page.keyboard.press('Control+y')
    }
    throw new Error(`no mouse or keyboard input for a step of kind ${step.kind}${step.what ? ` (${step.what})` : ''}`)
  }
}

// A step in words, for a failure report.
export function stepWords (step) {
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

// Step 0 is no input: its checkpoint is the board the link loads.
function checkpointWords (steps, n) {
  return n === 0 ? 'the board the link loads' : stepWords(steps[n - 1])
}

// A checkpoint follows every step but the down and the moves of a gesture, so a gesture is compared once it has ended,
// and every key, mode change, undo and redo on its own.
export function endsGroup (step) {
  return !(step.kind === 'pointer' && (step.action === 'down' || step.action === 'move'))
}

// A canonical state as its lines' keys and values.
export function entries (state) {
  return new Map(state.split('\n').filter(Boolean).map((line) => {
    const at = line.indexOf(' = ')
    return [line.slice(0, at), line.slice(at + 3)]
  }))
}

const isReplayWrite = (key) => /\.command_replay\.\d+$/.test(key)

// Every key whose value differs between two states, in the expected state's order, then the replay's new keys.
export function changedKeys (want, got) {
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
const AGAINST_EXPECTED = { source: 'the recording', list: 'the expected file', wantName: 'expected', gotName: 'replayed' }
const AGAINST_ENGINE = {
  source: 'the engine driver', list: "the engine driver's replay", wantName: 'engine driver', gotName: 'UI driver'
}

function failureReport ({ id, step, steps, since, want, got, errors, against }) {
  return [
    `${id}: step ${step} (${checkpointWords(steps, step)}) differs from ${against.source}`,
    ...since.length ? [`  since the last checkpoint: ${since.map((n) => `step ${n} ${stepWords(steps[n - 1])}`).join('; ')}`] : [],
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

// Runs in the page: the link Penpa+'s Duplicate button opens for this solve (`duplicate()` in general.js).
function duplicateLinkInPage () {
  return pu.maketext_duplicate() + '&l=solvedup'
}

// Lines a duplicate link drops by design, left out of the round trip's comparison: `maketext_duplicate` empties the
// redo stacks (class_p.js), no link holds the selection, and the answer check sets `sol_flag` after an input, never on
// load, so a duplicate of a solved board reads unsolved until its next input.
const DUPLICATE_DROPS = /^(pu_a(_col)?\.command_redo\.length|selection|sol_flag) = .*$/

function withoutDuplicateDrops (state) {
  return state.split('\n').filter((line) => !DUPLICATE_DROPS.test(line)).join('\n')
}

// Replays `recording` through `driver` (the engine driver unless given) in a fresh page and returns its checkpoints, the
// first being step 0. With `expected` (as `readExpected` returns it, or another replay's checkpoints, named by
// `against`) it stops at the first checkpoint that differs and returns the report of it. Under the engine driver, at
// every checkpoint the duplicate link of the board, loaded in another fresh page, must give the same board, less what
// the link drops by design. A replay that does not end on the recording's final board is reported too; otherwise
// `report` is null. `served` and `setup` go to `openPenpa`, for the duplicate's page as well.
export async function replay (browser, recording, {
  id = 'recording', expected, served = false, setup, driver = engineDriver, against = AGAINST_EXPECTED
} = {}) {
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
  const apply = driver.start(page)
  // Each duplicate link checked so far, with the board it must load: a step that changed nothing gives the same pair.
  const checked = new Set()
  // The round trips under way, in step order, each resolving to its report or null. They run beside the replay in
  // ROUND_TRIP_LANES lanes, each lane one after another, since each waits on a page load.
  const roundTrips = []
  const lanes = Array(ROUND_TRIP_LANES).fill(Promise.resolve())
  // The report of how a fresh page that loads `link` differs from `want`, else null.
  const loadDuplicate = async (n, link, want) => {
    const words = `${id}: step ${n} (${checkpointWords(steps, n)})`
    let fresh
    try {
      fresh = await open(linkHash(link))
    } catch (e) {
      return `${words}: its duplicate link did not load: ${e.message.split('\n')[0]}`
    }
    try {
      const got = await settle(() => readPage(fresh.page).then(withoutDuplicateDrops), want)
      if (got === want) return null
      return [
        `${words}: its duplicate link loads a different board`,
        ...stateDiff({ want, got, wantName: 'replay', gotName: 'duplicate', errors: [...errors, ...fresh.errors] })
      ].join('\n')
    } finally {
      await fresh.context.close()
    }
  }
  // Starts the check that a fresh page loads the duplicate link of `state`, the board at checkpoint `n`, as `state`.
  const startRoundTrip = async (n, state) => {
    const link = await page.evaluate(duplicateLinkInPage)
    const want = withoutDuplicateDrops(state)
    if (checked.has(link + '\n' + want)) return
    checked.add(link + '\n' + want)
    const lane = roundTrips.length % ROUND_TRIP_LANES
    const result = lanes[lane].then(() => loadDuplicate(n, link, want))
    roundTrips.push(result)
    // The next round trip in the lane waits for this one to end, whatever its result; `roundTrips` keeps the result.
    lanes[lane] = result.catch(() => {})
  }
  const { steps } = recording
  const checkpoints = []
  // The report of the first way checkpoint `n` differs from what it is compared with, else null.
  const checkpoint = async (n, since) => {
    const want = expected?.[checkpoints.length]
    if (expected && want?.step !== n) {
      return `${id}: step ${n} is a checkpoint, where ${against.list} has ${want ? `step ${want.step}` : 'none'}`
    }
    // The board loads after `pu` exists, so step 0's read waits for it. Under the paused clock no page timer runs,
    // so after a step the state is final, and `settle` only waits out a mismatch before it is reported.
    const state = want ? await settle(read, want.state) : n === 0 ? await settle(read) : await read()
    checkpoints.push({ step: n, state })
    if (want && state !== want.state) return failureReport({ id, step: n, steps, since, want: want.state, got: state, errors, against })
    // The duplicate link is the engine's, whichever input made the board, so the engine driver alone checks it.
    if (driver === engineDriver) await startRoundTrip(n, state)
    return null
  }
  // The report of the first way the replay differs from the expected file or the recording, else null.
  const run = async () => {
    const first = await checkpoint(0, [])
    if (first) return first
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
      if (!isCheckpoint(driver, steps, n)) continue
      const report = await checkpoint(n, since)
      if (report) return report
      since = []
    }
    if (expected && expected.length > checkpoints.length) {
      return `${id}: the replay ended after ${checkpoints.length} checkpoints, where ${against.list} has ${expected.length}`
    }
    return finalReport({ id, recording, state: checkpoints.at(-1).state, errors })
  }
  try {
    const report = await run()
    // A round trip names an earlier checkpoint than any report the replay itself can make.
    return { checkpoints, report: (await Promise.all(roundTrips)).find(Boolean) ?? report }
  } finally {
    // A step that could not be replayed leaves round trips under way; none outlives the replay.
    await Promise.allSettled(roundTrips)
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
  const expected = engine.checkpoints.filter(({ step }) => step === 0 || isCheckpoint(uiDriver, steps, step))
  const ui = await replay(browser, recording, { id, served, setup, driver: uiDriver, expected, against: AGAINST_ENGINE })
  return ui.report
}
