// Opening Penpa+ in headless Chromium for a test. Not a check itself, so `live/**/*.live.mjs` skips it.
import assert from 'node:assert/strict'
import { after, afterEach, before } from 'node:test'
import { chromium } from 'playwright'

// Penpa+ served straight from this checkout, as Pages serves `docs/`.
const PENPA_URL = new URL('../docs/index.html', import.meta.url).href

// The errors of every page `openPenpa` opened in this file, checked and emptied after each test.
const pageErrors = []

// Launches one Chromium before a file's tests and closes it after them, and fails any test during which a page
// it opened raised a page error or logged a `console.error`. Its hooks run with the file's other top-level hooks,
// so a test reads `browser()` in a `describe`'s hooks or tests, never in a top-level `before`.
export function useBrowser () {
  let browser
  before(async () => { browser = await chromium.launch() })
  afterEach(() => {
    const errors = pageErrors.flatMap((errs) => errs.splice(0))
    assert.deepEqual(errors, [], 'no page error or console.error')
  })
  after(async () => { await browser?.close() })
  return () => browser
}

// Opens Penpa+ with `query` (such as `#m=solve&p=...`) in a context of its own and returns once `pu` exists.
// `dialogs` holds the message of every native dialog the page opened, each dismissed.
export async function openPenpa (browser, query = '') {
  const context = await browser.newContext()
  // Penpa+'s only network loads are Google Tag Manager's: answered empty, so a run needs no network and counts as no visit.
  await context.route(/^https?:\/\//, (route) => route.fulfill({ status: 200, body: '' }))
  const page = await context.newPage()
  const errors = []
  pageErrors.push(errors)
  // A page error as its stack, so a failure says where it came from.
  page.on('pageerror', (e) => errors.push(e?.stack || String(e)))
  page.on('console', (m) => { if (m.type() === 'error') errors.push(`console.error: ${m.text()}`) })
  const dialogs = []
  page.on('dialog', async (d) => { dialogs.push(d.message()); await d.dismiss() })
  await page.goto(PENPA_URL + query)
  await page.waitForFunction(() => typeof pu !== 'undefined')
  return { context, page, dialogs }
}
