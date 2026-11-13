// Share links made from a local page (file://) with link shortening on name the fork, not upstream.
import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { openPenpa, useBrowser } from './page.mjs'

const browser = useBrowser()

describe('the base address of a share link', () => {
  it('names the fork on a local page with shortening on', async () => {
    const { context, page } = await openPenpa(browser())
    const base = await page.evaluate(() => {
      UserSettings.shorten_links = true
      return pu.maketext_baseurl()
    })
    assert.equal(base, 'https://caneff.github.io/penpa-edit/')
    await context.close()
  })
})
