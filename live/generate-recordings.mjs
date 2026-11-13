// Generates the corpus of recordings (GLOSSARY.md) with the recorder, by real mouse and keyboard on a `?record=1` page,
// and writes each one's expected file from a replay: `node live/generate-recordings.mjs [<id prefix> ...]`, every
// recording whose id starts with a prefix given, or all of them. A recording whose replay is refused is written with
// no expected file and named at the end, so it fails the seam until it is ruled on. Not a check itself, so
// `live/**/*.live.mjs` skips it. The design is `research/agentic-legacy-migration.md` § Corpus:
// - tier A, every solve mode's sub-modes, Composite tools and Shape's two key paths on one small square puzzle;
// - tier B, the smallest of upstream's puzz.link imports per genre in the mode the import opens in, and a Penpa+ board
//   of each grid class no import builds. A genre whose smallest import does not record (its solve link does not boot)
//   takes its next smallest, and the header's `import` names the one taken.
import { execFileSync } from 'node:child_process'
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { chromium } from 'playwright'
import { canonicalState, readEngineState } from './canonical-state.mjs'
import { openPenpa } from './page.mjs'
import { cases, readSnapshot } from './puzzlink-cases.mjs'
import { RECORDINGS, makeSurfaceSolveLink, recordingText, replay, writeExpected } from './replay.mjs'
import { settle } from './settle.mjs'

// The engine the goldens come from: master's, which this branch has not changed.
const COMMIT = execFileSync('git', ['merge-base', 'HEAD', 'origin/master'], { encoding: 'utf8' }).trim().slice(0, 7)

// Indices in `pu.centerlist`, taken modulo its length, of the cells each gesture starts at. Tier A's 4x4 puzzle has its
// answer at 5 and 9, which no gesture shades both of.
const CELLS = { click: 0, drag: 4, corners: 8, right: 2, ctrl: 13 }
// `pu.point` types: a cell's centre, and a cell's corner.
const CENTRE = 0
const CORNER = 1

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
// The only modes the solve link of a new hex, tri, pyramid or uniform board shows.
const GRID_MODES = ['surface', 'line']

const slug = (text) => text.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')

// Runs in the page: page pixels of a run of up to `length` points of `type` on the board, from the one nearest the
// centre of the cell at `cell` of the center list, each next point the nearest one to the right of the last.
function runInPage ({ cell, type, length }) {
  const canvas = document.getElementById('canvas')
  const pixel = (p) => ({ x: canvas.offsetLeft + p.x - window.scrollX, y: canvas.offsetTop + p.y - window.scrollY })
  const board = canvas.getBoundingClientRect()
  const onBoard = ({ x, y }) => x > board.left && x < board.right && y > board.top && y < board.bottom
  const points = pu.point.filter((p) => p && p.type === type && onBoard(pixel(p)))
  const centre = pu.point[pu.centerlist[cell % pu.centerlist.length]]
  const distance = (a, b) => Math.hypot(a.x - b.x, a.y - b.y)
  const nearest = (from, among) => among.reduce((best, p) => (!best || distance(from, p) < distance(from, best) ? p : best), null)
  const run = [nearest(centre, points)]
  while (run.length < length) {
    const last = run.at(-1)
    const next = nearest(last, points.filter((p) => p.x > last.x + 1))
    if (!next) break
    run.push(next)
  }
  // The key panel Shape mode opens floats over the board, and a click on it never reaches the board; a solver drags
  // it aside. Still open, so `UserSettings.panel_shown` stays as the engine set it.
  document.getElementById('float-key').style.left = '-10000px'
  const pixels = run.filter(Boolean).map(pixel)
  for (const { x, y } of pixels) {
    const hit = document.elementFromPoint(x, y)
    if (hit !== canvas) throw new Error(`the gesture's point ${x},${y} is on ${hit?.id || hit?.tagName}, not the board`)
  }
  return pixels
}

async function drag (page, run) {
  if (run.length < 2) return
  await page.mouse.move(run[0].x, run[0].y)
  await page.mouse.down()
  for (const p of run.slice(1)) await page.mouse.move(p.x, p.y, { steps: 2 })
  await page.mouse.up()
}

// The gesture set every recording makes in its mode: click, click again, drag across centres, drag along corners,
// right-click, Ctrl-click, a digit after each kind of selection, Ctrl+A, Escape, two undos and a redo. `beforeCtrl`
// runs just before the Ctrl-click.
async function gestures (page, { beforeCtrl } = {}) {
  const run = (cell, type, length = 1) => page.evaluate(runInPage, { cell, type, length })
  const [click] = await run(CELLS.click, CENTRE)
  await page.mouse.click(click.x, click.y)
  await page.keyboard.press('1')
  await page.mouse.click(click.x, click.y)
  await drag(page, await run(CELLS.drag, CENTRE, 3))
  await page.keyboard.press('2')
  await drag(page, await run(CELLS.corners, CORNER, 3))
  const [right] = await run(CELLS.right, CENTRE)
  await page.mouse.click(right.x, right.y, { button: 'right' })
  await beforeCtrl?.()
  const [ctrl] = await run(CELLS.ctrl, CENTRE)
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

// Runs in the page: the `#` part of a solve link to the board on the page, with whatever answer it has.
function solveLinkInPage () {
  const url = pu.maketext_solve()
  return url.slice(url.indexOf('#'))
}

// Runs in the page: a board of `gridtype` at `size`, as the New Grid dialog builds it.
function newBoardInPage ({ gridtype, size }) {
  UserSettings.gridtype = gridtype
  document.getElementById('nb_size1').value = size
  document.getElementById('nb_size2').value = size
  document.getElementById('nb_size3').value = size
  create_newboard()
}

// Records `act(page)` on `query` with the recorder on and returns the recording, its commit added.
async function record (browser, query, act) {
  const { context, page } = await openPenpa(browser, '?record=1' + query)
  try {
    // The board loads after `pu` exists.
    await settle(() => page.evaluate(readEngineState).then(canonicalState))
    // The recorder wraps `pu` on the first input event, so the first mode change must come after one.
    await page.mouse.move(1, 1)
    await act(page)
    const [file] = await Promise.all([page.waitForEvent('download'), page.click('#recorder_download')])
    const recording = JSON.parse(await readFile(await file.path(), 'utf8'))
    recording.header.commit = COMMIT
    return recording
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
      for (const e of subs) pairs.push({ mode, sub: e.value, name: document.getElementById(e.id + '_lb').textContent })
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
    act: async (page) => {
      if (pair.mode === 'move') {
        // Something of the solver's to move: a digit where the drag starts.
        await chooseMode(page, { mode: 'number' })
        const [start] = await page.evaluate(runInPage, { cell: CELLS.drag, type: CENTRE, length: 1 })
        await page.mouse.click(start.x, start.y)
        await page.keyboard.press('5')
      }
      await chooseMode(page, pair)
      await gestures(page, { beforeCtrl: pair.mode === 'number' ? () => page.click('#rot_D_lb') : undefined })
    }
  }))
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

// Each recording to make: its id, the boards it may be made on in order of preference (each a function returning a
// link's `#` part and the name of what it is), and what it does on the board.
async function tierB (page) {
  const recordings = []
  for (const { genre, imports } of importsPerGenre()) {
    recordings.push({
      id: `genre/${slug(genre)}`,
      boards: imports.map(({ name, url }) => async () => {
        await page.evaluate((u) => import_url(u), url)
        return { query: await page.evaluate(solveLinkInPage), name }
      }),
      act: (p) => gestures(p)
    })
  }
  for (const [grid, size] of Object.entries(GRID_BOARDS)) {
    const board = async () => {
      await page.evaluate(newBoardInPage, { gridtype: grid === 'uniform' ? UNIFORM_TILING : grid, size })
      return { query: await page.evaluate(solveLinkInPage) }
    }
    for (const mode of GRID_MODES) {
      recordings.push({ id: `grid/${grid}-${mode}`, boards: [board], act: async (p) => { await chooseMode(p, { mode }); await gestures(p) } })
    }
  }
  return recordings
}

// Records on the first of `boards` that records, naming each one that failed.
async function recordOnFirst (browser, { id, boards, act }) {
  for (const board of boards) {
    const { query, name } = await board()
    try {
      const recording = await record(browser, query, act)
      if (name) recording.header.import = name
      return recording
    } catch (e) {
      console.log(`${id}: could not record on ${name ?? 'its board'}: ${e.message.split('\n')[0]}`)
    }
  }
  return null
}

const prefixes = process.argv.slice(2)
const browser = await chromium.launch()
const refused = []
const importPage = await openPenpa(browser)
try {
  const plan = [...await tierA(browser), ...await tierB(importPage.page)]
    .filter(({ id }) => !prefixes.length || prefixes.some((p) => id.startsWith(p)))
  for (const item of plan) {
    const { id } = item
    const started = Date.now()
    const recording = await recordOnFirst(browser, item)
    if (!recording) {
      refused.push(`${id}: no board it could be recorded on`)
      continue
    }
    await mkdir(new URL(id.slice(0, id.lastIndexOf('/') + 1), RECORDINGS), { recursive: true })
    await writeFile(new URL(id + '.steps.json', RECORDINGS), recordingText(recording))
    const { checkpoints, report } = await replay(browser, recording, { id })
    if (report) {
      refused.push(report)
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
