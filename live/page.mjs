// Opening Penpa+ in headless Chromium for a test. Not a check itself, so `live/**/*.live.mjs` skips it.
import assert from 'node:assert/strict'
import { after, afterEach, before } from 'node:test'
import { fileURLToPath } from 'node:url'
import { chromium } from 'playwright'

// Penpa+ served straight from this checkout, as Pages serves `docs/`.
const PENPA_URL = new URL('../docs/index.html', import.meta.url).href

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

// Opens Penpa+ with `query` (such as `#m=solve&p=...`) in a context of its own and returns once `pu` exists.
// `cookies` (as `context.cookies()` returns them) start in the context; Chromium keeps no cookie for `file://`, so a
// cookie test passes `served: true` to be served `docs/` from `https://penpa.test/`, answered from this checkout.
// `url` opens that address (plus `query`) instead of the checkout's page, and `setup(context)` runs before the page opens.
// `contextOptions` go to `browser.newContext`. `dialogs` holds the message of every native dialog the page opened, each
// dismissed, and `errors` every page error and `console.error` so far.
export async function openPenpa (browser, query = '', { cookies = [], served = false, url, setup, contextOptions } = {}) {
  const context = await browser.newContext(contextOptions)
  if (cookies.length) await context.addCookies(cookies)
  // Penpa+'s only network loads are Google Tag Manager's: answered empty, so a run needs no network and counts as no visit.
  await context.route(/^https?:\/\//, (route) => route.fulfill({ status: 200, body: '' }))
  if (served) {
    await serveDocs(context, PENPA_ORIGIN)
  }
  // Registered after the catch-all and `served`, so a test's own routes win.
  await setup?.(context)
  const page = await context.newPage()
  const errors = []
  pageErrors.push(errors)
  // A page error as its stack, so a failure says where it came from.
  page.on('pageerror', (e) => errors.push(e?.stack || String(e)))
  page.on('console', (m) => { if (m.type() === 'error') errors.push(`console.error: ${m.text()}`) })
  const dialogs = []
  page.on('dialog', async (d) => { dialogs.push(d.message()); await d.dismiss() })
  await page.goto((url ?? (served ? PENPA_ORIGIN + '/' : PENPA_URL)) + query)
  await page.waitForFunction(() => typeof pu !== 'undefined')
  return { context, page, dialogs, errors }
}

// Runs in the page: shades the cell at `index` of the center list as its own undo group, through the call a click makes.
export function shadeInPage (index) {
  pu.mode_set('surface')
  pu.undoredo_counter++
  pu.set_surface(pu.centerlist[index], 1)
  pu.redraw()
}

// Indices in `pu.centerlist` of the given of `makeNumberSolveLink`'s puzzle and of the cell its answer fills.
export const GIVEN_CELL = 0
export const ANSWER_CELL = 1

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
// answer is a 2 in the cell at `answer`, and returns its solve link's `#` part.
function numberSolveLinkInPage ({ given, answer }) {
  document.getElementById('nb_size1').value = 4
  document.getElementById('nb_size2').value = 4
  create_newboard()
  pu.pu_q.number[pu.centerlist[given]] = [1, 1, '1']
  pu.pu_a.number[pu.centerlist[answer]] = [2, 2, '1']
  const url = pu.maketext_solve_solution()
  return url.slice(url.indexOf('#'))
}

// The `#` part of a 4x4 Number solve link with a given 1 in GIVEN_CELL and an author's answer of 2 in ANSWER_CELL.
export function makeNumberSolveLink (browser) {
  return linkFromNewBoard(browser, numberSolveLinkInPage, { given: GIVEN_CELL, answer: ANSWER_CELL })
}
