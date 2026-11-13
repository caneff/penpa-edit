// Share links made from a local page name the fork when link shortening is on, and keep the page's own address when it is off.
import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { FORK_URL } from '../test/redirect-urls.mjs'
import { openPenpa, serveDocs, useBrowser } from './page.mjs'

const browser = useBrowser()

const LOCALHOST = 'http://localhost'

const baseUrlWithShortening = (page, on) => page.evaluate((shorten) => {
  UserSettings.shorten_links = shorten
  return pu.maketext_baseurl()
}, on)

describe('the base address of a share link from a local page', () => {
  it('names the fork on a file:// page with shortening on', async () => {
    const { context, page } = await openPenpa(browser())
    assert.equal(await baseUrlWithShortening(page, true), FORK_URL)
    await context.close()
  })

  it('names the fork on a localhost page with shortening on', async () => {
    const { context, page } = await openPenpa(browser(), '', { url: LOCALHOST + '/', setup: (ctx) => serveDocs(ctx, LOCALHOST) })
    assert.equal(await baseUrlWithShortening(page, true), FORK_URL)
    await context.close()
  })

  it('keeps the localhost page\'s own address with shortening off', async () => {
    const { context, page } = await openPenpa(browser(), '', { url: LOCALHOST + '/', setup: (ctx) => serveDocs(ctx, LOCALHOST) })
    assert.equal(await baseUrlWithShortening(page, false), LOCALHOST + '/')
    await context.close()
  })
})
