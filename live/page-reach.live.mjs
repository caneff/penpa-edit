// The engine side's page reach (`pageReach` in `live/run-live.mjs`, #315) is not stale: every file of `docs/` that
// `docs/index.html` asks for as it boots a puzzle and switches to the dark theme is one the derivation reaches. A file the
// page comes to load by a name the derivation cannot read fails here, on every PR, since this file is on the skip list.
import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { fileURLToPath } from 'node:url'
import { AKARI_SOLVE, openPenpa, useBrowser, waitForSettingsLoaded } from './page.mjs'
import { pageReach } from './run-live.mjs'

const ROOT = fileURLToPath(new URL('..', import.meta.url))
// `openPenpa`'s address for a page served with `served: true`.
const ORIGIN = 'https://penpa.test'

const browser = useBrowser()

describe('the page reach of docs/index.html', () => {
  it('holds every file the page loads as it boots a puzzle and switches theme', async () => {
    const asked = new Set()
    const { context, page } = await openPenpa(browser(), AKARI_SOLVE, {
      served: true,
      setup: (ctx) => ctx.on('request', (request) => {
        const url = new URL(request.url())
        if (url.origin === ORIGIN) asked.add('docs' + (url.pathname === '/' ? '/index.html' : decodeURIComponent(url.pathname)))
      })
    })
    try {
      await waitForSettingsLoaded(page)
      const dark = page.waitForResponse((response) => response.url().includes('/css/dark_theme.css'))
      await page.evaluate(() => { UserSettings.color_theme = 2 })
      await dark
      await page.waitForLoadState('networkidle')
    } finally {
      await context.close()
    }
    assert.ok(asked.has('docs/js/class_p.js') && asked.has('docs/css/dark_theme.css'), 'the page loaded its scripts and the dark theme (the premise)')
    const reach = pageReach(ROOT, 'docs/index.html')
    assert.deepEqual([...asked].filter((path) => !reach.has(path)).sort(), [], 'every file the page loaded is reached')
  })
})
