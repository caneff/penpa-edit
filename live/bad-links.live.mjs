// Links that broke boot (audit C3, C4; #78): each loads the puzzle, or opens the editor, or shows an error dialog.
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

// The `#m=edit&p=...` part of the link for a blank page whose header line (`gridtype,nx,ny,...`) `edit` has changed.
async function linkWithHeader (edit) {
  const { context, page } = await openPenpa(browser(), '')
  const hash = await page.evaluate((editSource) => {
    const lines = decrypt_data(pu.maketext().split('p=')[1].split('&')[0]).split('\n')
    const header = lines[0].split(',')
    new Function('header', editSource)(header)
    lines[0] = header.join(',')
    return '#m=edit&p=' + encrypt_data(lines.join('\n'))
  }, edit)
  await context.close()
  return hash
}

describe('the solve link of a one-row Firefly', () => {
  it('boots a page holding the one-row board, 11 columns by 2 rows with the Firefly padding', async () => {
    const { context: first, page: blank } = await openPenpa(browser(), '')
    const hash = await blank.evaluate(async () => {
      await import_url('https://puzz.link/p?firefly/10/1/4.h0./')
      return pu.maketext_solve().split('#')[1]
    })
    await first.close()
    const { context, page } = await openPenpa(browser(), `#${hash}`)
    assert.deepEqual(await settle(() => page.evaluate(() => [pu.nx, pu.ny]), [11, 2]), [11, 2])
    await context.close()
  })
})

describe('a link whose board cannot be built', () => {
  it('shows the size error and opens the editor', async () => {
    const link = await linkWithHeader("header[1] = '101'")
    const { context, page } = await openPenpa(browser(), link)
    const state = () => page.evaluate(() => ({ dialog: Boolean(document.querySelector('.swal2-icon-error')), size: [pu.nx, pu.ny] }))
    assert.deepEqual(await settle(state, { dialog: true, size: [10, 10] }), { dialog: true, size: [10, 10] })
    await context.close()
  })

  it('shows the size error when the spaces fill more than the board', async () => {
    const { context, page } = await openPenpa(browser(), '')
    const hash = await page.evaluate(() => {
      const lines = decrypt_data(pu.maketext().split('p=')[1].split('&')[0]).split('\n')
      lines[1] = '[6,6,0,0]'
      return '#m=edit&p=' + encrypt_data(lines.join('\n'))
    })
    await context.close()
    const { context: second, page: reopened } = await openPenpa(browser(), hash)
    const shown = () => reopened.evaluate(() => Boolean(document.querySelector('.swal2-icon-error')))
    assert.deepEqual(await settle(shown, true), true)
    await second.close()
  })
})
