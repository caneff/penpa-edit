// Generates the corpus of recordings (GLOSSARY.md) with the recorder, by real mouse and keyboard on a `?record=1` page,
// and writes each one's expected file from a replay: `node live/generate-recordings.mjs [<id prefix> ...]`, every
// recording whose id starts with a prefix given, or all of them. A recording whose replay is refused is written with
// no expected file, any earlier one removed, and named at the end, so it fails the seam until it is ruled on. Not a check itself, so
// `live/**/*.live.mjs` skips it. The design is `research/agentic-legacy-migration.md` § Corpus:
// - tier A, every solve mode's sub-modes, Composite tools and Shape's two key paths on one small square puzzle;
// - tier B, the smallest of upstream's puzz.link imports per genre in the mode the import opens in, and a Penpa+ board
//   of each grid class no import builds. A genre whose smallest import does not record (its solve link does not boot)
//   takes its next smallest, and the header's `import` names the one taken.
import { execFileSync } from 'node:child_process'
import { mkdir, rm, writeFile } from 'node:fs/promises'
import { chromium } from 'playwright'
import { canonicalState, readEngineState } from './canonical-state.mjs'
import { openPenpa } from './page.mjs'
import { cases, readSnapshot } from './puzzlink-cases.mjs'
import {
  ANSWER_CELLS, RECORDINGS, downloadRecording, linkHash, makeSurfaceSolveLink, pointPixelInPage, replay, writeExpected
} from './replay.mjs'
import { settle } from './settle.mjs'

// The engine the goldens come from: master's, which this branch has not changed.
const COMMIT = execFileSync('git', ['merge-base', 'HEAD', 'origin/master'], { encoding: 'utf8' }).trim().slice(0, 7)

// Indices in `pu.centerlist`, taken modulo its length, of the cells each gesture starts at, none of them tier A's
// ANSWER_CELLS, so a gesture does not shade the answer whole.
const CELLS = { click: 0, drag: 4, corners: 8, edges: 12, right: 2, ctrl: 13 }
// `pu.point` types, each a list in order of preference: a cell's centre, a cell's corner, and the middle of a cell's
// edge, which Wall draws along (on a square board type 3, top and bottom edges; a uniform board has only type 2).
const CENTRE = [0]
const CORNER = [1]
const EDGE = [3, 2]

// Each mode's family, `research/penpa-mode-key-map.md` § Families, as the recording's directory.
const FAMILY = {
  sudoku: 'value', number: 'value', surface: 'paint', multicolor: 'paint', line: 'path', lineE: 'path', wall: 'path',
  symbol: 'stamp', special: 'stamp', cage: 'stamp', combi: 'genre-tool', move: 'move'
}
// One Shape tool on each of `key_number`'s two paths: a plain variant number, and one from `onoff_symbolmode_list`.
const SHAPE_TOOLS = ['circle_L', 'cross']
// Grid classes no puzz.link import builds, each with the size `create_newboard` reads for it.
const GRID_BOARDS = { hex: 2, tri: 3, pyramid: 3, uniform: 2 }
// The uniform tilings share one class (`class_uniform.js`); this one stands for them.
const UNIFORM_TILING = 'truncated_square'

const slug = (text) => text.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')

if (Object.values(CELLS).some((c) => ANSWER_CELLS.includes(c))) throw new Error('a gesture starts on one of ANSWER_CELLS')

// Runs in the page: the indices in `pu.point` of a run of up to `length` points of the first of `types` the board's
// canvas has, from the one nearest the centre of the cell at `cell` of the center list, each next point the nearest one
// to the right of the last, or where none is to the right the nearest one not yet in the run.
function runInPage ({ cell, types, length }) {
  const canvas = document.getElementById('canvas')
  const onCanvas = (p) => p.x > 0 && p.x < canvas.clientWidth && p.y > 0 && p.y < canvas.clientHeight
  const all = pu.point.map((p, num) => p && { ...p, num }).filter((p) => p && onCanvas(p))
  const type = types.find((t) => all.some((p) => p.type === t))
  const points = all.filter((p) => p.type === type)
  const centre = pu.point[pu.centerlist[cell % pu.centerlist.length]]
  const distance = (a, b) => Math.hypot(a.x - b.x, a.y - b.y)
  const nearest = (from, among) => among.reduce((best, p) => (!best || distance(from, p) < distance(from, best) ? p : best), null)
  const run = [nearest(centre, points)].filter(Boolean)
  while (run.length && run.length < length) {
    const last = run.at(-1)
    const unused = points.filter((p) => !run.includes(p))
    const next = nearest(last, unused.filter((p) => p.x > last.x + 1)) ?? nearest(last, unused)
    if (!next) break
    run.push(next)
  }
  // The key panel Shape mode opens floats over the board, and a click on it never reaches the board; a solver drags
  // it aside. Still open, so `UserSettings.panel_shown` stays as the engine set it.
  document.getElementById('float-key').style.left = '-10000px'
  return run.map((p) => p.num)
}

// Runs in the page: what the page shows at a page pixel, when it is not the board.
function notBoardInPage ({ x, y }) {
  const hit = document.elementFromPoint(x, y)
  return hit?.id === 'canvas' ? null : hit?.id || hit?.tagName || 'nothing'
}

// Page pixels of a run of points (`runInPage`), each one checked to be on the board.
async function pixelRun (page, cell, types, length = 1) {
  const pixels = []
  for (const num of await page.evaluate(runInPage, { cell, types, length })) {
    const pixel = await page.evaluate(pointPixelInPage, num)
    const other = await page.evaluate(notBoardInPage, pixel)
    if (other) throw new Error(`the gesture's point ${num} at ${pixel.x},${pixel.y} is on ${other}, not the board`)
    pixels.push(pixel)
  }
  if (pixels.length < length) throw new Error(`the board has a run of ${pixels.length} points of types ${types} from cell ${cell}, not ${length}`)
  return pixels
}

async function drag (page, run) {
  await page.mouse.move(run[0].x, run[0].y)
  await page.mouse.down()
  for (const p of run.slice(1)) await page.mouse.move(p.x, p.y, { steps: 2 })
  await page.mouse.up()
}

// The gesture set every recording makes in its mode: click, click again, drag across centres, drag along corners, drag
// along edges, right-click, Ctrl-click, a digit after each kind of selection, Ctrl+A, Escape, two undos and a redo.
// `beforeCtrl` runs just before the Ctrl-click.
async function gestures (page, { beforeCtrl } = {}) {
  const [click] = await pixelRun(page, CELLS.click, CENTRE)
  await page.mouse.click(click.x, click.y)
  await page.keyboard.press('1')
  await page.mouse.click(click.x, click.y)
  await drag(page, await pixelRun(page, CELLS.drag, CENTRE, 3))
  await page.keyboard.press('2')
  await drag(page, await pixelRun(page, CELLS.corners, CORNER, 3))
  await drag(page, await pixelRun(page, CELLS.edges, EDGE, 2))
  const [right] = await pixelRun(page, CELLS.right, CENTRE)
  await page.mouse.click(right.x, right.y, { button: 'right' })
  await beforeCtrl?.()
  const [ctrl] = await pixelRun(page, CELLS.ctrl, CENTRE)
  await page.keyboard.down('Control')
  await page.mouse.click(ctrl.x, ctrl.y)
  await page.keyboard.up('Control')
  await page.keyboard.press('3')
  await page.keyboard.press('Control+a')
  await page.keyboard.press('4')
  await page.keyboard.press('Escape')
  await page.keyboard.press('Control+z')
  await page.keyboard.press('Control+z')
  await page.keyboard.press('Control+y')
}

// Runs in the page: a solve link to the board on the page, with whatever answer it has.
function solveLinkInPage () {
  return pu.maketext_solve()
}

// Runs in the page: a board of `gridtype` at `size`, as the New Grid dialog builds it.
function newBoardInPage ({ gridtype, size }) {
  UserSettings.gridtype = gridtype
  document.getElementById('nb_size1').value = size
  document.getElementById('nb_size2').value = size
  document.getElementById('nb_size3').value = size
  create_newboard()
}

// A link whose page never makes `pu`: its board did not load.
class NoBoot extends Error {}

// Records `act(page)` on `query` with the recorder on and returns the recording's file text, the header's `commit`
// added and the rest as the recorder downloaded it.
async function record (browser, query, act, header) {
  const opened = await openPenpa(browser, '?record=1' + query).catch((e) => { throw new NoBoot(e.message) })
  const { context, page } = opened
  try {
    // The board loads after `pu` exists.
    await settle(() => page.evaluate(readEngineState).then(canonicalState))
    // The recorder wraps `pu` on the first input event, so the first mode change must come after one.
    await page.mouse.move(1, 1)
    await act(page)
    const { text, recording } = await downloadRecording(page)
    recording.header = { ...recording.header, commit: COMMIT, ...header }
    // The recorder writes the header alone on the first line.
    const lines = text.split('\n')
    lines[0] = '{"header": ' + JSON.stringify(recording.header) + ','
    return { text: lines.join('\n'), recording }
  } finally {
    await context.close()
  }
}

// Runs in the page: tier A's (mode, sub-mode or tool) pairs, each with a name for its id, in the mode bar's order.
function tierAInPage (shapeTools) {
  const pairs = []
  const visible = (id) => document.getElementById(id)?.offsetParent != null
  for (const label of document.querySelectorAll('[id^="mo_"][id$="_lb"]')) {
    if (!visible(label.id)) continue
    const mode = label.id.slice(3, -3)
    if (mode === 'symbol') {
      for (const tool of shapeTools) pairs.push({ mode, tool, name: tool })
    } else if (mode === 'combi') {
      for (const el of document.querySelectorAll('[id^="combisub_"]')) pairs.push({ mode, tool: el.id.slice(9), name: el.id.slice(9) })
    } else {
      pu.mode_set(mode)
      const subs = [...document.querySelectorAll(`input[name="mode_${mode}"]`)].filter((e) => visible(e.id + '_lb'))
      if (!subs.length) pairs.push({ mode, name: '' })
      // Number's 1/4 and Side labels are drawn by CSS and hold no text.
      for (const e of subs) pairs.push({ mode, sub: e.value, name: document.getElementById(e.id + '_lb').textContent || `sub ${e.value}` })
    }
  }
  return pairs
}

async function chooseMode (page, { mode, sub, tool }) {
  await page.click(`#mo_${mode}_lb`)
  if (sub) await page.click(`#sub_${mode}${sub}_lb`)
  if (tool) await page.dispatchEvent(`#${mode === 'symbol' ? 'ms_' : 'combisub_'}${tool}`, 'mousedown')
}

async function tierA (browser) {
  const query = await makeSurfaceSolveLink(browser)
  const { context, page } = await openPenpa(browser, query)
  const pairs = await page.evaluate(tierAInPage, SHAPE_TOOLS).finally(() => context.close())
  return pairs.map((pair) => ({
    id: `${FAMILY[pair.mode]}/${slug([pair.mode, pair.name].filter(Boolean).join(' '))}`,
    boards: [async () => ({ query })],
    act: (page) => inMode(page, pair)
  }))
}

// Chooses the mode and makes the gesture set in it, after putting on the board what the mode acts on.
async function inMode (page, pair) {
  if (pair.mode === 'move') {
    // Something of the solver's to move where the drag starts: a digit, and a shape beside it.
    const [start, next] = await pixelRun(page, CELLS.drag, CENTRE, 2)
    await chooseMode(page, { mode: 'number' })
    await page.mouse.click(start.x, start.y)
    await page.keyboard.press('5')
    await chooseMode(page, { mode: 'symbol', tool: SHAPE_TOOLS[0] })
    await page.mouse.click(next.x, next.y)
  }
  if (pair.mode === 'lineE' && pair.name === 'Erase') {
    // Edges to erase, along the corners the corner drag takes.
    await chooseMode(page, { mode: 'lineE' })
    await drag(page, await pixelRun(page, CELLS.corners, CORNER, 3))
  }
  await chooseMode(page, pair)
  // Number's orientation buttons show only on square grids.
  const turn = async () => { if (await page.isVisible('#rot_D_lb')) await page.click('#rot_D_lb') }
  await gestures(page, { beforeCtrl: pair.mode === 'number' ? turn : undefined })
}

// Each genre's imports, smallest first by cell count, the earlier one on a tie.
function importsPerGenre () {
  const byGenre = new Map()
  for (const c of cases) {
    const genre = c.name.replace(/ \d+$/, '')
    const [w, h] = readSnapshot(c.name).grid_size
    byGenre.set(genre, [...byGenre.get(genre) ?? [], { ...c, cells: w * h }])
  }
  return [...byGenre].map(([genre, imports]) => ({ genre, imports: imports.sort((a, b) => a.cells - b.cells) }))
}

// The `#` part of a solve link to the board `build(page)` makes on a page of its own, since a new board keeps the last
// one's modes (`create_newboard`).
async function solveLink (browser, build) {
  const { context, page } = await openPenpa(browser)
  try {
    await build(page)
    return linkHash(await page.evaluate(solveLinkInPage))
  } finally {
    await context.close()
  }
}

// Runs in the page: the modes whose buttons the mode bar shows.
function shownModesInPage () {
  return [...document.querySelectorAll('[id^="mo_"][id$="_lb"]')].filter((l) => l.offsetParent != null).map((l) => l.id.slice(3, -3))
}

// Each recording to make: its id, the boards it may be made on in order of preference (each a function returning a
// link's `#` part and the name of what it is, or null for a board not to record on), and what it does on the board. A
// grid class's board is recorded in each mode its solve page shows.
async function tierB (browser) {
  const recordings = []
  for (const { genre, imports } of importsPerGenre()) {
    recordings.push({
      id: `genre/${slug(genre)}`,
      boards: imports.map(({ name, url }) => async () => {
        let full = false
        const query = await solveLink(browser, async (p) => {
          await p.evaluate((u) => import_url(u), url)
          full = await p.evaluate(() => pu.centerlist.every((c) => pu.pu_q.number[c]))
        })
        // A board whose every cell is given has nothing to enter.
        return full ? null : { query, name }
      }),
      act: (p) => gestures(p)
    })
  }
  for (const [grid, size] of Object.entries(GRID_BOARDS)) {
    const query = await solveLink(browser, (p) => p.evaluate(newBoardInPage, { gridtype: grid === 'uniform' ? UNIFORM_TILING : grid, size }))
    const { context, page } = await openPenpa(browser, query)
    const modes = await settle(() => page.evaluate(shownModesInPage)).finally(() => context.close())
    for (const mode of modes) {
      recordings.push({ id: `grid/${grid}-${mode}`, boards: [async () => ({ query })], act: (p) => inMode(p, { mode }) })
    }
  }
  return recordings
}

// Records on the first of `boards` there is one of and whose link boots, naming each one that did not boot. Any other
// failure is the recording's own and is thrown.
async function recordOnFirst (browser, { id, boards, act }) {
  for (const board of boards) {
    const made = await board()
    if (!made) continue
    const { query, name } = made
    try {
      return await record(browser, query, act, name ? { import: name } : {})
    } catch (e) {
      if (!(e instanceof NoBoot)) throw e
      console.log(`${id}: its board${name ? ` ${name}` : ''} did not boot: ${e.message.split('\n')[0]}`)
    }
  }
  throw new Error(`${id}: no board it could be recorded on booted`)
}

const prefixes = process.argv.slice(2)
const browser = await chromium.launch()
const refused = []
try {
  const all = [...await tierA(browser), ...await tierB(browser)]
  const ids = all.map(({ id }) => id)
  const twice = ids.filter((id, i) => ids.indexOf(id) !== i)
  if (twice.length) throw new Error(`two recordings would share the id ${twice.join(', ')}`)
  const plan = all.filter(({ id }) => !prefixes.length || prefixes.some((p) => id.startsWith(p)))
  for (const item of plan) {
    const { id } = item
    const started = Date.now()
    let made
    try {
      made = await recordOnFirst(browser, item)
    } catch (e) {
      refused.push(`${id}: could not be recorded: ${e.message.split('\n')[0]}`)
      console.log(`${id}: NOT RECORDED`)
      continue
    }
    const { text, recording } = made
    await mkdir(new URL(id.slice(0, id.lastIndexOf('/') + 1), RECORDINGS), { recursive: true })
    await writeFile(new URL(id + '.steps.json', RECORDINGS), text)
    const { checkpoints, report } = await replay(browser, recording, { id })
    if (report) {
      refused.push(report)
      await rm(new URL(id + '.expected.json', RECORDINGS), { force: true })
    } else {
      await writeExpected(id, checkpoints)
    }
    console.log(`${id}: ${recording.steps.length} steps, ${report ? 'REFUSED' : `${checkpoints.length} checkpoints`}, ${((Date.now() - started) / 1000).toFixed(1)} s`)
  }
} finally {
  await browser.close()
}
if (refused.length) {
  console.log(`\n${refused.length} refused:\n\n${refused.join('\n\n')}`)
  process.exitCode = 1
}
