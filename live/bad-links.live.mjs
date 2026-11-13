// Links that broke boot (audit C3, C4): each loads the puzzle, or opens the editor, or shows an error dialog.
import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { openPenpa, useBrowser } from './page.mjs'
import { settle } from './settle.mjs'

const browser = useBrowser()

// The `#m=edit&p=...` part of the link `maketext()` builds for a puzzle whose Source field holds `source`.
async function linkWithSource (source) {
  const { context, page } = await openPenpa(browser(), '')
  const hash = await page.evaluate((s) => {
    document.getElementById('saveinfosource').value = s
    return pu.maketext().split('#')[1]
  }, source)
  await context.close()
  return `#${hash}`
}

const sourceOf = (page) => page.evaluate(() => document.getElementById('saveinfosource').value)

describe('a bad link', () => {
  it('loads the puzzle when a tracking parameter precedes the hash', async () => {
    const source = 'https://example.com/puzzle'
    const link = await linkWithSource(source)
    const { context, page } = await openPenpa(browser(), `?fbclid=x${link}`)
    assert.deepEqual(await settle(() => sourceOf(page), source), source)
    await context.close()
  })

  it('opens the editor when the link is only a tracking parameter', async () => {
    const { context, page } = await openPenpa(browser(), '?utm_source=x')
    const state = () => page.evaluate(() => ({ dialog: Boolean(document.querySelector('.swal2-container')), mode: pu.mmode }))
    assert.deepEqual(await settle(state, { dialog: false, mode: '' }), { dialog: false, mode: '' })
    await context.close()
  })

  it('round-trips a Source field holding a comma', async () => {
    const source = 'https://example.com/a,b'
    const link = await linkWithSource(source)
    const { context, page } = await openPenpa(browser(), link)
    assert.deepEqual(await settle(() => sourceOf(page), source), source)
    await context.close()
  })

  it('shows an error dialog for a truncated link', async () => {
    const link = await linkWithSource('')
    const { context, page } = await openPenpa(browser(), link.slice(0, link.length - 40))
    const shown = () => page.evaluate(() => Boolean(document.querySelector('.swal2-icon-error')))
    assert.deepEqual(await settle(shown, true), true)
    await context.close()
  })
})
