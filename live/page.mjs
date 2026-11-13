// Opening Penpa+ in headless Chromium for a test. Not a check itself, so `live/**/*.live.mjs` skips it.
import { after, before } from 'node:test'
import { chromium } from 'playwright'

// Penpa+ served straight from this checkout, as Pages serves `docs/`.
export const PENPA_URL = new URL('../docs/index.html', import.meta.url).href

// Launches one Chromium before a file's tests and closes it after them. Its hooks run with the file's other
// top-level hooks, so a test reads `browser()` in a `describe`'s hooks or tests, never in a top-level `before`.
export function useBrowser () {
  let browser
  before(async () => { browser = await chromium.launch() })
  after(async () => { await browser?.close() })
  return () => browser
}

// Collects into `errors` every uncaught page error (as its stack) and every `console.error` line, so a test that
// asserts `errors` is empty fails on either.
export const collectErrors = (page, errors) => {
  page.on('pageerror', (e) => errors.push(e?.stack || String(e)))
  page.on('console', (m) => { if (m.type() === 'error') errors.push(`console.error: ${m.text()}`) })
}

// Opens Penpa+ with `query` (such as `?m=solve&p=...`) in a context of its own and returns once `pu` exists.
export async function openPenpa (browser, query = '') {
  const context = await browser.newContext()
  const page = await context.newPage()
  const errors = []
  collectErrors(page, errors)
  await page.goto(PENPA_URL + query)
  await page.waitForFunction(() => typeof pu !== 'undefined')
  return { context, page, errors }
}
