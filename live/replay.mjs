// Recordings (GLOSSARY.md) and the drivers that replay them: the engine driver, through `pu`'s own calls, and the UI
// driver, through Playwright's mouse and keyboard, on Penpa+'s page or (`solveUiDriver`) on `solve.html`. Not a check itself, so `live/**/*.live.mjs` skips
// it.
//
// A recording is `live/recordings/<family>/<name>.steps.json`, its id `<family>/<name>`, `<family>` a mode family,
// `genre` and `grid` for the recordings of one genre's or one grid class's board (`live/generate-recordings.mjs`),
// `solve` for tier C's full solves on links with an answer check (`live/generate-tier-c.mjs`), or `fuzz` for a failing
// run the fuzz (`live/fuzz.mjs`) saved. As `docs/js/recorder.js` writes it, it holds a header
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
// `commit` itself, and `fuzz` (its puzzle and seed) in place of `recorder`. Tier C's script writes `commit` too, and in
// place of `recorder` either `generated` (the puzzle and the seed of a generated solve) or `history` (the name of a
// solver's converted solve history); a converted step may carry `at`, the solver's timer reading in milliseconds when
// the change it starts was made, which no driver reads.
// Beside it, `<name>.expected.json` holds the canonical state at each checkpoint, written from a replay by
// `npm run recordings:approve`, `live/generate-recordings.mjs` or `live/generate-tier-c.mjs`, never by hand. A fuzz recording has none until its bug is fixed, and its replay test fails until then.
import { execFileSync } from 'node:child_process'
import { readdir, readFile, writeFile } from 'node:fs/promises'
import { inflateRawSync } from 'node:zlib'
import { canonicalState, readEngineState } from './canonical-state.mjs'
import { jsRequest, linkFromNewBoard, openPenpa, openReloader } from './page.mjs'
import { settle } from './settle.mjs'

export const RECORDINGS = new URL('./recordings/', import.meta.url)
export const STEPS_SUFFIX = '.steps.json'
export const EXPECTED_SUFFIX = '.expected.json'
// The replay page's clock is installed and paused at this instant before the page opens, so the timer and every
// replay timestamp read 0 (`research/replay-determinism-2026-11.md` § Recommended setup).
const CLOCK_START = new Date('2026-01-01T00:00:00Z')

// Installs `context`'s clock paused at CLOCK_START, before its page opens.
export async function pauseClock (context) {
  await context.clock.install({ time: CLOCK_START })
  await context.clock.pauseAt(CLOCK_START)
}
const CONTEXT_OPTIONS = { viewport: { width: 1280, height: 720 }, deviceScaleFactor: 1 }
// Pages one `roundTrips` loads links in at once.
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

// A recording's file text, laid out as `docs/js/recorder.js` writes one: the header and the final board on a line
// each, then one step per line.
export function recordingText ({ header, final, steps }) {
  return '{"header": ' + JSON.stringify(header) + ',\n"final": ' + JSON.stringify(final) +
    ',\n"steps": [\n' + steps.map((s) => JSON.stringify(s)).join(',\n') + '\n]}\n'
}

// The short sha of the engine a generated recording's goldens come from: master's, where this checkout branched from
// it, which a branch that adds recordings has not changed.
export function engineCommit () {
  return execFileSync('git', ['merge-base', 'HEAD', 'origin/master'], { encoding: 'utf8', cwd: new URL('.', import.meta.url) }).trim().slice(0, 7)
}

// The id of every recording under `live/recordings/`, sorted.
export async function listRecordings () {
  const files = await readdir(RECORDINGS, { recursive: true })
  return files.filter((f) => f.endsWith(STEPS_SUFFIX)).map((f) => f.slice(0, -STEPS_SUFFIX.length)).sort()
}

export async function readRecording (id) {
  return JSON.parse(await readFile(new URL(id + STEPS_SUFFIX, RECORDINGS), 'utf8'))
}

// The expected file as JSON reads it, or null when the recording has none.
export async function readExpectedFile (id) {
  try {
    return JSON.parse(await readFile(new URL(id + EXPECTED_SUFFIX, RECORDINGS), 'utf8'))
  } catch (e) {
    if (e.code !== 'ENOENT') throw e
    return null
  }
}

// The expected checkpoints, each state back as the string `canonicalState` writes.
export async function readExpected (id) {
  const file = await readExpectedFile(id)
  if (!file) throw new Error(`${id} has no expected file: once the replay is right, run npm run recordings:approve -- ${id}`)
  return file.checkpoints.map(({ step, state }) => ({ step, state: state.join('\n') + '\n' }))
}

// A replay's checkpoints as the expected file holds them: each state one line per array entry, so a changed line reads
// as one line of the file's diff.
export function expectedFile (checkpoints) {
  return { checkpoints: checkpoints.map(({ step, state }) => ({ step, state: state.trimEnd().split('\n') })) }
}

export async function writeExpected (id, checkpoints) {
  await writeFile(new URL(id + EXPECTED_SUFFIX, RECORDINGS), JSON.stringify(expectedFile(checkpoints), null, 1) + '\n')
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

// Runs in the page: the whole viewport pixel a pointer step aims at, for a recording made at `recordedSize` px a cell.
// `coord_point` subtracts the canvas's `offsetLeft` and `offsetTop` from a pointer's page position and takes the nearest
// point of `pu.type`, and a mouse event carries whole pixels. So the step's board point `x, y`, scaled to the page's cell
// size, is taken from that origin and rounded to the nearest whole pixel whose nearest point is still `num`, the one the
// recording page chose: a point recorded halfway between two others (a corner on the edge between two edge points)
// otherwise tips to either. Handlers read `x, y` as well, so the pixel stays the nearest such one.
function pagePixelInPage ({ x, y, num, recordedSize }) {
  const canvas = document.getElementById('canvas')
  const scale = pu.size / recordedSize
  const left = canvas.offsetLeft - window.scrollX
  const top = canvas.offsetTop - window.scrollY
  // Penpa+ draws every point half a pixel off its cell grid at any cell size, so that half pixel is not scaled.
  const at = { x: left + (x - 0.5) * scale + 0.5, y: top + (y - 0.5) * scale + 0.5 }
  // As `coord_point` searches: the first point of the least distance wins.
  const nearest = (px) => {
    let best = -1
    let min = Infinity
    for (const [i, p] of pu.point.entries()) {
      if (!p || !pu.type.includes(p.type)) continue
      const d = (px.x - left - p.x) ** 2 + (px.y - top - p.y) ** 2
      if (d < min) { min = d; best = i }
    }
    return best
  }
  const candidates = []
  for (const cx of new Set([Math.floor(at.x), Math.ceil(at.x)])) {
    for (const cy of new Set([Math.floor(at.y), Math.ceil(at.y)])) candidates.push({ x: cx, y: cy })
  }
  candidates.sort((a, b) => Math.hypot(a.x - at.x, a.y - at.y) - Math.hypot(b.x - at.x, b.y - at.y))
  return candidates.find((c) => nearest(c) === num) ?? candidates[0]
}

// Runs in the page: moves Shape mode's key panel off the board when it floats over `pixel`, as a solver drags it aside
// (and as the generator does, `live/generate-recordings.mjs`); a click on it never reaches the board. It stays open, so
// `UserSettings.panel_shown` stays as the engine set it.
function clearPanelInPage (pixel) {
  const panel = document.getElementById('float-key')
  if (panel.contains(document.elementFromPoint(pixel.x, pixel.y))) panel.style.left = '-10000px'
}

// Runs in the page: the whole viewport pixel of a point not in use nearest board point `near` (a recording's), where a
// press makes no engine call (`onDown` in main.js) and the move there makes none either (`onMove`). A left press in the
// Composite tools main.js improves (`coord_point`'s `flex`) picks among cells alone, so only an unused cell serves there.
function unusedPixelInPage ({ near, recordedSize }) {
  const canvas = document.getElementById('canvas')
  const scale = pu.size / recordedSize
  const left = canvas.offsetLeft - window.scrollX
  const top = canvas.offsetTop - window.scrollY
  const mode = pu.mode[pu.mode.qa]
  const cellsOnly = mode.edit_mode === 'combi' && ['star', 'yajilin', 'mines', 'doublemines', 'akari'].includes(mode.combi[0])
  const types = cellsOnly ? [0] : pu.type
  const at = { x: (near.x - 0.5) * scale + 0.5, y: (near.y - 0.5) * scale + 0.5 }
  const onCanvas = (p) => p.x > 1 && p.y > 1 && p.x < canvas.clientWidth - 1 && p.y < canvas.clientHeight - 1
  const candidates = pu.point.filter((p) => p && types.includes(p.type) && onCanvas(p))
  // No point in use within 2 px, so rounding to a whole pixel cannot tip the press onto one.
  const clear = (p) => !candidates.some((q) => q.use === 1 && Math.hypot(q.x - p.x, q.y - p.y) < 2)
  const unused = candidates.filter((p) => p.use !== 1 && clear(p))
  if (!unused.length) throw new Error('no point out of use to press on')
  const best = unused.reduce((a, b) => (Math.hypot(a.x - at.x, a.y - at.y) <= Math.hypot(b.x - at.x, b.y - at.y) ? a : b))
  return { x: Math.round(left + best.x), y: Math.round(top + best.y) }
}

// Runs in the page: a viewport pixel just outside the canvas, above its top-left corner.
function outsideCanvasInPage () {
  const box = document.getElementById('canvas').getBoundingClientRect()
  return { x: box.left, y: box.top - 1 }
}

// The cell size Penpa+'s page draws a board at, so the one every recording was made at.
const RECORDED_CELL_PX = 38

// How far the UI driver moves the page's clock before each step. `main.js` reads `Date.now()` for its key windows (15
// ms after a Shift release in Sudoku, 300 ms after a 1 in Surface), which a clock paused at one instant always meets.
const STEP_GAP_MS = 1000

// The key, as Playwright's `keyboard.press` names it, that makes `main.js` make a key step's call. A call `main.js`
// makes only from a remapped key has no entry and is refused: Sudoku's Backspace (`key_space` with code 8).
// Multicolor's colour digits (a number argument) are `startUiDriver`'s, which reads the page's remap, and so are
// Surface's two-digit colours (`1` then a digit). Sudoku's Shift and Ctrl marks are recorded as a sub-mode step around
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
  throw noKey({ call, args })
}

function noKey ({ call, args }) {
  return new Error(`no key makes ${call}(${args.map((a) => JSON.stringify(a)).join(', ')})`)
}

// Surface's two-digit colour, `1` and then a digit (`key_number("12")`), which `main.js` makes from the digit pressed
// within 300 ms of letting go of a `1`.
const isTwoDigitColour = (step) => step.kind === 'key' && step.call === 'key_number' && /^1\d$/.test(step.args[0])

// Multicolor's colour digit (`key_number(3)`), which `main.js` makes, with its style, from a remapped digit key.
const isMulticolorKey = (step) => step.kind === 'key' && step.call === 'key_number' && typeof step.args[0] === 'number'

// A Multicolor style step the next step's colour key made: the key sets the style first (`main.js`), so the pair is
// one key press.
const isKeyStyle = (step, next) => step.kind === 'mode' && step.mode === 'multicolor' && next !== undefined &&
  isMulticolorKey(next) && next.args[0] === step.style

// A step a key press makes, whose release ends `main.js`'s window after a `1`.
const isKeyPress = (step) => ['key', 'select', 'undo', 'redo'].includes(step.kind)

// The indices of `steps` made within a two-digit colour's window: those after its `1` up to the colour itself. Each
// two-digit colour's last key press before it must be that `1`, else no key makes it.
function twoDigitWindows (steps) {
  const quick = new Set()
  for (const [j, step] of steps.entries()) {
    if (!isTwoDigitColour(step)) continue
    const k = steps.findLastIndex((s, i) => i < j && isKeyPress(s))
    if (k === -1 || steps[k].call !== 'key_number' || steps[k].args[0] !== '1') continue
    for (let i = k + 1; i <= j; i++) quick.add(i)
  }
  return quick
}

// The UI driver: each step as the mouse or keyboard input a solver makes, a pointer step at the page pixel its board
// units map to through the current layout. A digit in Surface picks a colour as well as making its key call, and is
// recorded as a key step and then a Surface mode step, both made by the one key press, so that pair is checked once,
// after the mode step.
// A Multicolor colour key is recorded the other way round, its style step first, and is checked after the key.
const uiCheckpointAfter = (step, next) => endsGroup(step) &&
  !(step.kind === 'key' && step.call === 'key_number' && next?.kind === 'mode' && next.mode === 'surface') &&
  !isKeyStyle(step, next)

// Penpa+'s own page: a mode change is a click in its mode panel.
export const uiDriver = {
  start: (page, steps) => startUiDriver(page, steps, panelChoices),
  checkpointAfter: uiCheckpointAfter
}

// `solve.html`: a mode change is a pick in the Mode card.
export const solveUiDriver = {
  start: (page, steps) => startUiDriver(page, steps, modeCardChoices),
  checkpointAfter: uiCheckpointAfter
}

// The `choose` of `switchMode` for Penpa+'s mode panel; `clickInPanel` clicks a button there by id.
function panelChoices (page, step, clickInPanel, afterInput) {
  return {
    mode: (name) => clickInPanel('mo_' + name),
    submode: clickInPanel,
    // The tool lists are hidden until their dialog opens; `window_click` in `main.js` reads only the mousedown's
    // target.
    tool: async (mode, tool) => {
      const id = `#${mode === 'symbol' ? 'ms_' : 'combisub_'}${tool}`
      if (!await page.locator(id).count()) throw new Error(`no tool ${tool} in ${mode}`)
      await page.dispatchEvent(id, 'mousedown')
      afterInput()
    },
    orientation: (direction) => clickInPanel('rot_' + direction),
    style: (id) => {
      if (step.mode === 'multicolor') throw new Error('no input for a Multicolor style alone: its button makes a key call too')
      return clickInPanel(id)
    }
  }
}

// The `choose` of `switchMode` for the Mode card, which picks a whole tool (mode and sub-mode) from its list and then a
// style from its buttons. A mode is picked as the tool the step names, so the sub-mode that follows is already right.
function modeCardChoices (page, step, _clickInPanel, afterInput) {
  const card = page.getByRole('region', { name: 'Mode' })
  const toolOf = async () => {
    const tools = await page.evaluate(() => engine.listTools())
    const tool = tools.find((t) => t.mode === step.mode && (t.submode === null || t.submode === step.submode))
    if (!tool) throw new Error(`the Mode card lists no tool ${step.mode}/${step.submode}`)
    return tool
  }
  const pickTool = async () => {
    const tool = await toolOf()
    await card.getByRole('combobox', { name: 'Tool' }).click()
    await card.locator(`[role=option][data-mode="${tool.mode}"][data-submode="${tool.submode ?? ''}"]`).click()
    afterInput()
  }
  return {
    mode: pickTool,
    submode: pickTool,
    tool: pickTool,
    orientation: () => { throw new Error('the Mode card has no orientation to choose') },
    style: async () => {
      const tool = await toolOf()
      const at = tool.styles.findIndex((s) => s.style === step.style)
      if (at === -1) throw new Error(`the Mode card has no style ${step.style} for ${step.mode}/${step.submode}`)
      await card.getByRole('group', { name: 'Style' }).getByRole('button').nth(at).click()
      afterInput()
    }
  }
}

// The button to press at `steps[i]` when it starts a gesture whose press made no engine call, else null. `main.js`
// makes no call for a press on a point outside the frame (`restrict_mouse`) or one not in use, nor for a move onto one
// not in use, so such a gesture is recorded as its later moves and an `up` with no `down`, or as the `up` alone. Its
// press was made where the `out` its first move made leaves the mouse, or on a point out of use before its first
// recorded move or its `up`. The button is held for the moves and the release that follow.
function silentPress (steps, i) {
  const step = steps[i]
  if (step.kind !== 'pointer' || !['out', 'move', 'up'].includes(step.action)) return null
  const before = steps.slice(0, i).findLast((s) => s.kind === 'pointer')
  if (step.action !== 'out' && before && !['up', 'out'].includes(before.action)) return null
  const rest = steps.slice(i)
  const end = rest.findIndex((s, k) => s.kind === 'pointer' && s.action !== 'move' && (k > 0 || s.action === 'up'))
  if (end === -1 || rest[end].action !== 'up') return null
  return rest.slice(0, end).some((s) => s.kind === 'pointer' && s.button === 'right') ? 'right' : 'left'
}

function startUiDriver (page, steps, choices) {
  const pixelOf = async ({ x, y, num }) => {
    const pixel = await page.evaluate(pagePixelInPage, { x, y, num, recordedSize: RECORDED_CELL_PX })
    await page.evaluate(clearPanelInPage, pixel)
    return pixel
  }
  // Where the mouse is, or null once a click in the mode panel has moved it; and the button a down step holds.
  let mousePixel = null
  let pressed = null
  let stepsMade = 0
  let clock = CLOCK_START.getTime()
  const quick = twoDigitWindows(steps)

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

  // Presses for a gesture whose press made no call (`silentPress`): after its `out`, where the mouse is, off the canvas;
  // else on a point out of use near the step, moved to first.
  async function pressSilently (step) {
    const button = silentPress(steps, stepsMade - 1)
    if (!button || pressed) return false
    if (step.action !== 'out') await moveTo(await page.evaluate(unusedPixelInPage, { near: step, recordedSize: RECORDED_CELL_PX }))
    await page.mouse.down({ button })
    pressed = { button, ctrl: false }
    return true
  }

  async function pointer (step) {
    switch (step.action) {
      case 'move':
        await pressSilently(step)
        return moveTo(await pixelOf(step))
      case 'down':
        await moveIfAway(await pixelOf(step))
        if (step.ctrl) await page.keyboard.down('Control')
        await page.mouse.down({ button: step.button })
        pressed = { button: step.button, ctrl: step.ctrl }
        return
      case 'up':
        if (!pressed && !await pressSilently(step)) throw new Error('no mouse button is down to release')
        await moveIfAway(await pixelOf(step))
        await page.mouse.up({ button: pressed.button })
        if (pressed.ctrl) await page.keyboard.up('Control')
        pressed = null
        return
      case 'out':
        await moveTo(await page.evaluate(outsideCanvasInPage))
        return pressSilently(step)
    }
    throw new Error(`no mouse input for a pointer step of action ${step.action}`)
  }

  async function mode (step) {
    // The style a colour key sets is left to the key, so the mode step switches only the mode.
    const target = isKeyStyle(step, steps[stepsMade]) ? { ...step, style: (await page.evaluate(modeInPage, step.mode)).style } : step
    return switchMode(page, target, choices(page, target, clickInPanel, () => { mousePixel = null }))
  }

  // The key that makes a key step's call: a Multicolor colour is the digit, or Alt and the digit, `main.js` remaps to
  // it; a two-digit Surface colour is its second digit, pressed within the window after its `1`.
  async function keyFor (step) {
    if (isTwoDigitColour(step)) {
      if (!quick.has(stepsMade - 1)) throw noKey(step)
      return step.args[0][1]
    }
    if (!isMulticolorKey(step)) return keyOf(step)
    const { edit, remap } = await page.evaluate(() => ({ edit: pu.mode[pu.mode.qa].edit_mode, remap: MULTICOLOR_REMAP }))
    const digit = remap.indexOf(step.args[0])
    if (edit !== 'multicolor' || digit === -1) throw noKey(step)
    return digit < 10 ? String(digit) : 'Alt+' + (digit - 10)
  }

  return async (step) => {
    // `main.js` reads a two-digit colour only from a digit let go of within 300 ms of a `1`.
    clock += quick.has(stepsMade) ? 1 : STEP_GAP_MS
    // A solver scrolls a board taller than the window into view before solving: Chromium sends no event to a pointer
    // below the viewport, and the gesture leaves the canvas.
    if (stepsMade === 0) await page.evaluate(() => document.getElementById('canvas').scrollIntoView({ block: 'nearest', inline: 'nearest' }))
    stepsMade++
    await page.clock.setSystemTime(clock)
    switch (step.kind) {
      case 'pointer':
        return pointer(step)
      case 'key':
        return page.keyboard.press(await keyFor(step))
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

// Steps built from board points, for a generator: `board.points` maps each point's index in `pu.point` to its board
// units.
function pointerStep (board, action, num, button) {
  const { x, y } = board.points[num]
  return { kind: 'pointer', action, button: action === 'down' ? button : null, ctrl: false, x, y, num }
}

// A press and release of `button` on point `num`.
export function pressSteps (board, num, button = 'left') {
  return [pointerStep(board, 'down', num, button), pointerStep(board, 'up', num)]
}

// A left drag through the points `nums`, in order.
export function dragSteps (board, nums) {
  return [pointerStep(board, 'down', nums[0], 'left'), ...nums.slice(1).map((n) => pointerStep(board, 'move', n)), pointerStep(board, 'up', nums.at(-1))]
}

// Each character of `text` typed as a content key.
export function typedSteps (text) {
  return [...text].map((ch) => ({ kind: 'key', call: 'key_number', args: [ch] }))
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
export function checkpointWords (steps, n) {
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

// Loads links in pages that boot afresh for each (`openReloader`, given `options`), in ROUND_TRIP_LANES lanes, each
// lane one load after another, since each waits on a page load. `load(link, want, read)` resolves to `{ got, errors }`:
// the board `read(page)` gives once it equals `want` or stops changing, and the errors of that load; or to null when
// the same link, its timer reading aside, was loaded for the same `want` before, since that load checked the same. A
// page that does not load rejects it with an error marked `notLoaded`. `close()` waits for every load and closes the
// pages.
export function roundTrips (browser, options) {
  const lanes = Array.from({ length: ROUND_TRIP_LANES }, () => ({ done: Promise.resolve(), reloader: null }))
  const loaded = new Set()
  return {
    async load (link, want, read) {
      const key = withoutTimer(link) + '\n' + want
      if (loaded.has(key)) return null
      loaded.add(key)
      // The set's size counts the loads started, this one included.
      const lane = lanes[(loaded.size - 1) % ROUND_TRIP_LANES]
      const result = lane.done.then(async () => {
        lane.reloader ??= await openReloader(browser, options)
        const { page, errors } = await lane.reloader.load(link).catch((e) => { throw Object.assign(e, { notLoaded: true }) })
        return { got: await settle(() => read(page), want), errors }
      })
      // The lane's next load waits for this one to end, whatever its result; the caller keeps the result.
      lane.done = result.catch(() => {})
      return result
    },
    async close () {
      await Promise.all(lanes.map((lane) => lane.done))
      await Promise.all(lanes.map((lane) => lane.reloader?.close()))
    }
  }
}

// A line of a link's data that holds only the solve timer's reading, as `maketext_duplicate` writes it (days, hours,
// minutes, seconds, tenths). Loading it only starts the timer there, and canonical state leaves the timer out.
const TIMER_LINE = /^\d+(:\d+){3,4}$/

// `link` (a `#` part) with its puzzle data's timer line left out. The data is raw-deflated base64 (`decrypt_data` in
// general.js), whose lines `load` splits on newlines, which no `COMPRESS_SUB` substitution touches.
function withoutTimer (link) {
  return link.replace(/([#&]p=)([^&]*)/, (_, key, data) =>
    key + inflateRawSync(Buffer.from(data, 'base64')).toString().split('\n').filter((line) => !TIMER_LINE.test(line)).join('\n'))
}

// Runs in the page: the link Penpa+'s Duplicate button opens for this solve (`duplicate()` in general.js).
export function duplicateLinkInPage () {
  return pu.maketext_duplicate() + '&l=solvedup'
}

// Lines a duplicate link drops by design, left out of the round trip's comparison: `maketext_duplicate` empties the
// redo stacks (class_p.js) and no link holds the selection.
const DUPLICATE_DROPS = /^(pu_a(_col)?\.command_redo\.length|selection) = .*$/

function withoutDuplicateDrops (state) {
  return state.split('\n').filter((line) => !DUPLICATE_DROPS.test(line)).join('\n')
}

// The first line of each method of a `Puzzle` class whose name matches `name` (a regular expression's text), the name
// its first group: methods sit at a 4-space indent in `class_p.js`.
export function methodStart (name) {
  return new RegExp(`^ {4}(${name})\\(`, 'gm')
}

// The `mouse_*` and `key_*` methods of `class_p.js`: the handlers a click or key reaches through `mouseevent` and
// `main.js`'s key calls.
const HANDLER = methodStart('(?:mouse|key)_\\w+')
const CLASS_P_URL = jsRequest('class_p.js')

// Each handler of `class_p.js` with the times it was called, from the page's JS coverage (Playwright's `coverage`
// entries); a handler V8 reports no entry for was never called.
function handlerCallsOf (entries) {
  const classP = entries.find((e) => CLASS_P_URL.test(e.url))
  if (!classP) throw new Error('the JS coverage has no entry for class_p.js')
  const calls = Object.fromEntries([...classP.source.matchAll(HANDLER)].map(([, name]) => [name, 0]))
  // A function's first range spans the whole function and holds its call count.
  for (const f of classP.functions) if (Object.hasOwn(calls, f.functionName)) calls[f.functionName] += f.ranges[0].count
  return calls
}

// Replays `recording` through `driver` (the engine driver unless given) in a fresh page and returns its checkpoints, the
// first being step 0. With `expected` (as `readExpected` returns it, or another replay's checkpoints, named by
// `against`) it stops at the first checkpoint that differs and returns the report of it. Under the engine driver, at
// every checkpoint the duplicate link of the board, loaded in another page booted afresh for it (`roundTrips`), must
// give the same board, less what the link drops by design. A replay that does not end on the recording's final board
// is reported too; otherwise `report` is null. `served`, `solve` and `setup` go to `openPenpa`, and `served` and
// `setup` to `roundTrips` for the duplicate's page. With `coverage`, it also returns `handlerCalls`: each `mouse_*` and `key_*` handler of `class_p.js`
// with the times the steps called it. `errors` holds every page error and `console.error` of the replay's page.
export async function replay (browser, recording, {
  id = 'recording', expected, served = false, setup, driver = engineDriver, against = AGAINST_EXPECTED, coverage = false,
  solve = false
} = {}) {
  // The solved message opens from a 20 ms `setTimeout` in `check_solution`, so under the paused clock it never opens.
  const openOptions = {
    served,
    solve,
    contextOptions: CONTEXT_OPTIONS,
    setup: async (c) => {
      await pauseClock(c)
      await setup?.(c)
    }
  }
  const readPage = (p) => p.evaluate(readEngineState).then(canonicalState)
  const { context, page, errors } = await openPenpa(browser, recording.header.source, openOptions)
  // Started once the page has loaded, so it counts only what the steps call.
  if (coverage) await page.coverage.startJSCoverage({ resetOnNavigation: false })
  const read = () => readPage(page)
  const apply = driver.start(page, recording.steps)
  const trips = roundTrips(browser, openOptions)
  // The round trips under way, in step order, each resolving to its report or null.
  const reports = []
  // Starts the check that a page booted afresh loads the duplicate link of `state`, the board at checkpoint `n`, as `state`.
  const startRoundTrip = async (n, state) => {
    const link = await page.evaluate(duplicateLinkInPage)
    const want = withoutDuplicateDrops(state)
    const words = `${id}: step ${n} (${checkpointWords(steps, n)})`
    reports.push(trips.load(linkHash(link), want, (p) => readPage(p).then(withoutDuplicateDrops)).then((loaded) => {
      if (!loaded || loaded.got === want) return null
      return [
        `${words}: its duplicate link loads a different board`,
        ...stateDiff({ want, got: loaded.got, wantName: 'replay', gotName: 'duplicate', errors: [...errors, ...loaded.errors] })
      ].join('\n')
    }, (e) => {
      if (!e.notLoaded) throw e
      return `${words}: its duplicate link did not load: ${e.message.split('\n')[0]}`
    }))
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
    const handlerCalls = coverage ? handlerCallsOf(await page.coverage.stopJSCoverage()) : undefined
    // A round trip names an earlier checkpoint than any report the replay itself can make.
    return { checkpoints, report: (await Promise.all(reports)).find(Boolean) ?? report, handlerCalls, errors: [...errors] }
  } finally {
    // A step that could not be replayed leaves round trips under way; none outlives the replay.
    await trips.close()
    await context.close()
  }
}

// Replays `recording` through the engine driver on Penpa+'s page, then through the UI driver compared with it at each
// checkpoint, and returns null when they agree, else the report of the first difference: a UI bug, whatever the expected
// file says. With `solve` the UI driver is `solveUiDriver` on `solve.html`. `served` and `setup` go to `openPenpa` for both.
export async function compareDrivers (browser, recording, { id = 'recording', served = false, setup, solve = false } = {}) {
  const engine = await replay(browser, recording, { id, served, setup })
  if (engine.report) return engine.report
  const { steps } = recording
  const driver = solve ? solveUiDriver : uiDriver
  const expected = engine.checkpoints.filter(({ step }) => step === 0 || isCheckpoint(driver, steps, step))
  const ui = await replay(browser, recording, { id, served, setup, driver, solve, expected, against: AGAINST_ENGINE })
  return ui.report
}
