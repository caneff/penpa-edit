// A Penpa+ link, once the redirect userscript has run, lands on the fork with the same puzzle loaded.
// Tampermonkey cannot run headless, so the script is injected at document start, which is where `@run-at` puts it.
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { after, before, describe, it } from 'node:test'
import { AKARI_SOLVE, openPenpa, serveDocs, useBrowser } from './page.mjs'
import { settle } from './settle.mjs'

// The script as the repo ships it.
const USERSCRIPT = new URL('../userscript/penpa-redirect.user.js', import.meta.url)
const UPSTREAM_URL = 'https://swaroopg92.github.io/penpa-edit/'
const FORK_URL = 'https://caneff.github.io/penpa-edit/'

const browser = useBrowser()

describe('an upstream solve link with the redirect userscript', () => {
  let opened
  before(async () => {
    opened = await openPenpa(browser(), '', {
      url: UPSTREAM_URL + AKARI_SOLVE,
      setup: async (context) => {
        await serveDocs(context, FORK_URL)
        await context.addInitScript(readFileSync(USERSCRIPT, 'utf8'))
      }
    })
  })
  after(async () => { await opened?.context.close() })

  it('lands on the fork with the same puzzle loaded', async () => {
    const { page } = opened
    const expected = { url: FORK_URL + AKARI_SOLVE, mode: 'solve', clues: 13 }
    const read = () => page.evaluate(() => ({ url: location.href, mode: pu.mmode, clues: Object.keys(pu.pu_q.number).length }))
    assert.deepEqual(await settle(read, expected), expected)
  })
})
