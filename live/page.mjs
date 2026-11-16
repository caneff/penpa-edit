// Opening Penpa+ in headless Chromium for a test. Not a check itself, so `live/**/*.live.mjs` skips it.
import assert from 'node:assert/strict'
import { after, afterEach, before } from 'node:test'
import { fileURLToPath } from 'node:url'
import { chromium } from 'playwright'
import { settle } from './settle.mjs'

// Penpa+ served straight from this checkout, as Pages serves `docs/`.
const PENPA_URL = new URL('../docs/index.html', import.meta.url).href

// The ChinStrap solve page, served the same way.
const SOLVE_URL = new URL('../docs/solve.html', import.meta.url).href

// Where a test that needs cookies is served `docs/` from.
const PENPA_ORIGIN = 'https://penpa.test'

// `pu.maketext_solve()` after importing Akari 1 of `test/public/puzz_link_parser.js`, whose snapshot holds 13 numbers.
export const AKARI_SOLVE = '#m=solve&p=1VTtb7pIEP7uX9Hs124QBC2SNBff2qRpvXq1P68SY1BRUHQtL63BtH97Z3bxcNE2l7vchwvszOwzy+zMss9Er4kTulRT8dVNChoeQzP5qJg1PtTs6ftx4FoXtJHEHgvB8OJ4G1nl8jZJh+lQCfzNqrz9zVk5oV/WVHwVZaF4iq8slZUSKLGqGfoE124p/f3mhs6dIHLp3cuy2V413juNP8vVoa4/d+eXy3bveTkb/NJ6ql8O1W5gbh4e283g8jYdPniNN7fj1h4jNvUC15k56XBwtws2N+bCm2utO69lzp2NGr2a/fpbs3d9XbKzGkYlm2iEkgoMjYw+yZStJz75tAnPmlB9VNqnf1j7dGzZow+aPuemmZtP1p7oKrEMSnRNKF2oGleGIVSdq6pQNeEzxawuPq+Lz+sVoTAKxO9m8W1yQegVT1XsJAOwWgZgBwnAPGQANpcAzE0CMEsJwHzh+A5TzNvW8ikmZeRTqMPW8ylmeFgMdWnWHuQLl304SprqXLa5VLmscnnP13S4HHDZ4tLgssbXXOHPKJVsXVxb+an+/zC8nE9JOHemLlzPFltvWeTHLoErSSIWjCPhG7s7ZxoTS5Dn2CNhm2Q9cUMJChjbAknPRTi4JNBfbFjonnUh6M4W34VC15lQExbOCjm9O0Eg18J7kgRN/XAayFAMZD2eO2HI3iVk7cSeBEycGPpX5PlbOZK7KRxm7MgpitYgxc6P46NEdoQPuPcVamD/qFtpg6a3wKOjXkPTHjSQBytrOdhEbELgr1OyToLYn7KAwb4ZBgTgX1fA7OTmgPvRaglQU8HuZjaYL2CK4xrfC+TRstM+JZhAk3+NJlmzN6hAJIhzkRQAR6cEzRDKTWZslWRLNSRx4x+UAZEOZaApykDrTBlY3b8u4692XqigPvoQf0z9m31edOP/qHftMmaz8Ady584ifIbigP7A8iPvOfwbQh95i/gJezHZUwIDeobDgBZpDNApkwE8ITNg3/AZoxYpjVkVWY1bnRAbtzrm9uEijUoc+AI='

// The errors of every page `openPenpa` opened in this file, checked and emptied after each test.
const pageErrors = []

// Empties the errors of every page `openPenpa` opened so far and returns them, for a test whose pages raise one on
// purpose.
export function takePageErrors () {
  return pageErrors.flatMap((errs) => errs.splice(0))
}

// Launches one Chromium before a file's tests and closes it after them, and fails any test during which a page
// it opened raised a page error or logged a `console.error`. Its hooks run with the file's other top-level hooks,
// so a test reads `browser()` in a `describe`'s hooks or tests, never in a top-level `before`.
export function useBrowser () {
  let browser
  before(async () => { browser = await chromium.launch() })
  afterEach(() => {
    assert.deepEqual(takePageErrors(), [], 'no page error or console.error')
  })
  after(async () => { await browser?.close() })
  return () => browser
}

// Answers every request under `base` (an origin, or an origin and path such as Pages' `/penpa-edit`) with the
// matching file of this checkout's `docs/`.
export function serveDocs (context, base) {
  const prefix = new URL(base).pathname.replace(/\/$/, '')
  return context.route(`${base.replace(/\/$/, '')}/**`, (route) => {
    const path = decodeURIComponent(new URL(route.request().url()).pathname).slice(prefix.length)
    return route.fulfill({ path: fileURLToPath(new URL('../docs' + (path === '/' ? '/index.html' : path), import.meta.url)) })
  })
}

// The requests a page makes for `docs/js/<file>`, with or without a query, for a test that serves its own copy.
export function jsRequest (file) {
  return new RegExp(`/js/${file.replace(/\./g, '\\.')}(\\?|$)`)
}

// Opens Penpa+ with `query` (such as `#m=solve&p=...`) in a context of its own and returns once `pu` exists.
// `cookies` (as `context.cookies()` returns them) start in the context; Chromium keeps no cookie for `file://`, so a
// cookie test passes `served: true` to be served `docs/` from `https://penpa.test/`, answered from this checkout.
// `url` opens that address (plus `query`) instead of the checkout's page, `solve: true` opens `solve.html` in place of the
// default page, and `setup(context)` runs before the page opens.
// `contextOptions` go to `browser.newContext`. `dialogs` holds the message of every native dialog the page opened, each
// dismissed, and `errors` every page error and `console.error` so far.
export async function openPenpa (browser, query = '', { cookies = [], served = false, solve = false, url, setup, contextOptions } = {}) {
  const context = await penpaContext(browser, { served, setup, contextOptions })
  if (cookies.length) await context.addCookies(cookies)
  const page = await context.newPage()
  const errors = []
  pageErrors.push(errors)
  onErrors(page, (e) => errors.push(e))
  const dialogs = []
  page.on('dialog', async (d) => { dialogs.push(d.message()); await d.dismiss() })
  await page.goto((url ?? penpaAddress(served, solve)) + query)
  await page.waitForFunction(() => typeof pu !== 'undefined')
  return { context, page, dialogs, errors }
}

// Opens one page that boots Penpa+ afresh for every link it loads, cheaper than a page of its own context for each:
// each load is a navigation, so the page's globals start over, and its storage and cookies start empty, as a new
// context's do. `served`, `setup` and `contextOptions` are `openPenpa`'s, but `setup` runs once, on the context, and any
// cookie or storage it leaves is cleared before each load like the rest. `load(query)` returns the page once `pu`
// exists and the errors raised since that load began; `close()` closes the page's context.
export async function openReloader (browser, { served = false, setup, contextOptions } = {}) {
  const context = await penpaContext(browser, { served, setup, contextOptions })
  await context.addInitScript(wipeStorageInPage)
  const page = await context.newPage()
  let errors = []
  onErrors(page, (e) => errors.push(e))
  return {
    async load (query) {
      // Penpa+ saves progress as it unloads, so the cookies are cleared once it has.
      await page.goto('about:blank')
      await context.clearCookies()
      errors = []
      pageErrors.push(errors)
      await page.goto(penpaAddress(served) + query)
      await page.waitForFunction(() => typeof pu !== 'undefined')
      return { page, errors }
    },
    close: () => context.close()
  }
}

// Runs in the page, before any of its scripts: empties the storage Penpa+ keeps between visits. `PenpaProgress` keeps a
// puzzle's progress in localforage's IndexedDB database (named `localforage` by default) and reads it back at boot, so
// a progress saved by the page before would load in place of the link. The delete is queued ahead of the page's own
// open of the database, which IndexedDB runs in order.
function wipeStorageInPage () {
  // The blank page between loads has no origin to keep storage for.
  if (location.protocol === 'about:') return
  localStorage.clear()
  sessionStorage.clear()
  indexedDB.deleteDatabase('localforage')
}

// A context for Penpa+'s pages, answering its network loads, with `served` and `setup` as `openPenpa` takes them.
async function penpaContext (browser, { served, setup, contextOptions }) {
  const context = await browser.newContext(contextOptions)
  // Penpa+'s only network loads are Google Tag Manager's: answered empty, so a run needs no network and counts as no visit.
  await context.route(/^https?:\/\//, (route) => route.fulfill({ status: 200, body: '' }))
  if (served) {
    await serveDocs(context, PENPA_ORIGIN)
  }
  // Registered after the catch-all and `served`, so a test's own routes win.
  await setup?.(context)
  return context
}

// Where Penpa+'s page, or with `solve` the solve page, is opened from.
function penpaAddress (served, solve = false) {
  if (served) return PENPA_ORIGIN + (solve ? '/solve.html' : '/')
  return solve ? SOLVE_URL : PENPA_URL
}

// Passes `add` every page error and `console.error` of `page` from now on.
function onErrors (page, add) {
  // A page error as its stack, so a failure says where it came from.
  page.on('pageerror', (e) => add(e?.stack || String(e)))
  page.on('console', (m) => { if (m.type() === 'error') add(`console.error: ${m.text()}`) })
}

// Runs in the page: shades the cell at `cell` (an index of the center list, or `{ index, style }` for Penpa+'s surface style
// `style`; 1 by default) as its own undo group, through the call a click makes.
export function shadeInPage (cell) {
  const { index, style = 1 } = typeof cell === 'number' ? { index: cell } : cell
  pu.mode_set('surface')
  pu.undoredo_counter++
  pu.set_surface(pu.centerlist[index], style)
  pu.redraw()
}

// Indices in `pu.centerlist` of the given of `makeNumberSolveLink`'s puzzle, of the cell its answer fills and of an
// empty cell in the given's row.
export const GIVEN_CELL = 0
export const ANSWER_CELL = 1
export const SAME_ROW_CELL = 2

// Indices in the page's `pu.centerlist` of cells the tests fill, clear of the given and the author's answer.
export const DIGIT_CELL = 12
export const MARK_CELL = 13
export const SHADED_CELL = 14

// Runs `inPage(arg)` on a fresh page of its own and returns what it returns: a puzzle link built on a new board.
export async function linkFromNewBoard (browser, inPage, arg) {
  const { context, page } = await openPenpa(browser)
  try {
    return await page.evaluate(inPage, arg)
  } finally {
    await context.close()
  }
}

// Runs in the page. Builds a 4x4 grid whose given 1 is in the cell at `given` of the center list and whose author's
// answer is a 2 in the cell at `answer`.
export function buildNumberBoardInPage ({ given, answer }) {
  document.getElementById('nb_size1').value = 4
  document.getElementById('nb_size2').value = 4
  create_newboard()
  pu.pu_q.number[pu.centerlist[given]] = [1, 1, '1']
  pu.pu_a.number[pu.centerlist[answer]] = [2, 2, '1']
}

// Runs in the page, on a board with an author's answer: its solve link's `#` part.
function solveLinkInPage () {
  const url = pu.maketext_solve_solution()
  return url.slice(url.indexOf('#'))
}

// Runs in the page: types `digit` into the cell at `index` of the center list, as a key press in Number mode does.
export function typeDigitInPage ({ index, digit }) {
  pu.mode_set('number')
  pu.cursol = pu.centerlist[index]
  pu.selection = [pu.cursol]
  pu.key_number(digit)
  pu.redraw()
}

// Runs in the page: presses a save-dialog button's handler (`savetext_solve`, `savetext_clone`, ...) with link
// shortening off, which writes the link to the textarea at once, and returns the `#` part of what it wrote.
export function linkOfButtonInPage (handler) {
  UserSettings.shorten_links = false
  window[handler]()
  const url = document.getElementById('savetextarea').value
  return url.slice(url.indexOf('#'))
}

// The `#` part of a 4x4 Number solve link with a given 1 in GIVEN_CELL and an author's answer of 2 in ANSWER_CELL.
export async function makeNumberSolveLink (browser) {
  const { context, page } = await openPenpa(browser)
  try {
    await page.evaluate(buildNumberBoardInPage, { given: GIVEN_CELL, answer: ANSWER_CELL })
    return await page.evaluate(solveLinkInPage)
  } finally {
    await context.close()
  }
}

// Runs in the page. The board's canvas in the Board card: the drawn one, since Penpa+ keeps a hidden pause canvas beside it.
export function boardCanvasInPage () {
  const canvases = [...document.querySelectorAll('section[aria-label="Board"] canvas')]
  return canvases.find((c) => c.getBoundingClientRect().width > 0)
}

// Reads where the board's canvas lies against the Board card's body, in CSS px.
export async function boardAgainstCard (page) {
  const boardCanvas = await page.evaluateHandle(boardCanvasInPage)
  try {
    return await boardCanvas.evaluate((canvasNode) => {
      const card = document.querySelector('section[aria-label="Board"]').getBoundingClientRect()
      const canvas = canvasNode.getBoundingClientRect()
      return { cardW: card.width, cardH: card.height, w: canvas.width, h: canvas.height, inside: canvas.left >= card.left - 1 && canvas.right <= card.right + 1 && canvas.top >= card.top - 1 && canvas.bottom <= card.bottom + 1 }
    })
  } finally {
    await boardCanvas.dispose()
  }
}

// ---- solve.html ---------------------------------------------------------------------------------------------------

// The window the tests lay solve.html's desk out in.
export const DESK_SIZE = { viewport: { width: 1400, height: 900 } }

// Runs in the page. A 6x6 board's solve link `#` part: its Tab set is `names` (Penpa+'s own names for them), or with no
// names it has none.
export function newBoardSolveLinkInPage (names) {
  document.getElementById('nb_size1').value = 6
  document.getElementById('nb_size2').value = 6
  create_newboard()
  if (names) UserSettings.tab_settings = names
  const url = pu.maketext_solve()
  return url.slice(url.indexOf('#'))
}

// One link per Tab set for a test file, since each costs a page of its own to build.
const newBoardLinks = new Map()

// `newBoardSolveLinkInPage`'s link for `names`, built once per test file.
export function newBoardSolveLink (browser, names) {
  const key = JSON.stringify(names ?? null)
  if (!newBoardLinks.has(key)) newBoardLinks.set(key, linkFromNewBoard(browser, newBoardSolveLinkInPage, names))
  return newBoardLinks.get(key)
}

// Waits until solve.html has built its desk round the loaded puzzle.
export async function waitForDesk (page) {
  await page.getByRole('region', { name: 'Board' }).waitFor()
  await page.evaluate(() => engine.ready)
}

// Opens solve.html on `query` in a DESK_SIZE window and returns once the desk is built; `options` go to `openPenpa`.
export async function openSolvePage (browser, query, options = {}) {
  const opened = await openPenpa(browser, query, { solve: true, contextOptions: DESK_SIZE, ...options })
  await waitForDesk(opened.page)
  return opened
}

export const currentTool = (page) => page.evaluate(() => engine.getTool())
export const setTool = (page, tool) => page.evaluate((t) => engine.setTool(t), tool)

// Waits for the tool in use to be `want`, a `{ mode, submode }`, fails with `message` when it never is, and returns it.
export async function waitForTool (page, want, message = 'the tool settles') {
  const tool = await settle(async () => {
    const { mode, submode } = await currentTool(page)
    return { mode, submode }
  }, want)
  assert.deepEqual(tool, want, message)
  return tool
}

// Two animation frames: the bridge's `change` fires in the first, and the UI has drawn it by the second.
export const afterChange = (page) => page.evaluate(() => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve))))

// What the solver has entered, the selection and the mode, read as Penpa+ would save them (`readEngineState`, defined by
// recorder.js): what a key could change on the board.
export const board = (page) => page.evaluate(() => {
  const state = readEngineState()
  // The undo and replay logs carry the time between keys, which differs between runs.
  const { command_undo: undo, command_redo: redo, command_replay: replay, ...entered } = state.pu_a
  return { entered, selection: state.selection, mode: state.mode }
})

// What the page keeps in localStorage, whatever the UI calls its keys.
export const storedEntries = (page) => page.evaluate(() => JSON.stringify(Object.entries(localStorage).sort()))

// The text the solver has typed into Number mode cells, in cell order.
export const typedDigits = async (page) => Object.values((await board(page)).entered.number ?? {}).map(([digit]) => digit)
