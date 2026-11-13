// A Penpa+ link, once the Redirect script has run, lands on the fork with the same puzzle loaded.
// Tampermonkey cannot run headless, so the script is injected at document start; its `@match` and `@run-at` lines are checked in `test/userscript.test.mjs`.
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { after, before, describe, it } from 'node:test'
import { FORK_URL, REDIRECT_SCRIPT, UPSTREAM_URL } from '../test/redirect-urls.mjs'
import { AKARI_SOLVE, openPenpa, serveDocs, useBrowser } from './page.mjs'
import { settle } from './settle.mjs'


const browser = useBrowser()

describe('an upstream solve link with the Redirect script', () => {
  let opened
  before(async () => {
    opened = await openPenpa(browser(), '', {
      url: UPSTREAM_URL + AKARI_SOLVE,
      setup: async (context) => {
        await serveDocs(context, FORK_URL)
        await context.addInitScript(readFileSync(REDIRECT_SCRIPT, 'utf8'))
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
