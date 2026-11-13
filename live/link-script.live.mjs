// A link's data never runs as script in the page (#11): no dialog fires and no `on*` attribute appears.
import assert from 'node:assert/strict'
import { after, before, describe, it } from 'node:test'
import { setTimeout as sleep } from 'node:timers/promises'
import { openPenpa, useBrowser } from './page.mjs'
import { settle } from './settle.mjs'

const browser = useBrowser()

// A payload that opens a dialog if the page parses it as HTML.
const IMG_ALERT = '<img src=x onerror=alert("link-script")>'
// How long a dialog from that payload's `onerror`, which fires after the image fails to load, is waited for.
const NO_DIALOG_MS = 500

// Opens Penpa+ blank, runs `build` in it to make a link, and returns that link's `#` part.
async function makeLink (build, arg) {
  const { context, page } = await openPenpa(browser())
  const url = await page.evaluate(build, arg)
  await context.close()
  return url.slice(url.indexOf('#'))
}

// The names of every `on*` attribute on the element with `id` and on everything inside it.
function onAttributes (page, id) {
  return page.evaluate((id) => {
    const root = document.getElementById(id)
    return [root, ...root.querySelectorAll('*')]
      .flatMap((el) => [...el.attributes].map((a) => a.name))
      .filter((name) => name.startsWith('on'))
  }, id)
}

// Both sub-mode labels: the edit mode a link saves, and the span that names its sub-mode.
const SUB_MODES = [
  { name: 'Shape', editMode: 'symbol', id: 'symmode_content' },
  { name: 'Composite', editMode: 'combi', id: 'combimode_content' }
]

for (const { name, editMode, id } of SUB_MODES) {
  describe(`a solve link whose saved ${name} sub-mode is HTML`, () => {
    let opened
    before(async () => {
      const link = await makeLink(({ editMode, payload }) => {
        pu.mode_qa('pu_a')
        pu.mode.pu_a.edit_mode = editMode
        pu.mode.pu_a[editMode][0] = payload
        return pu.maketext_solve()
      }, { editMode, payload: IMG_ALERT })
      opened = await openPenpa(browser(), link)
    })
    after(async () => { await opened?.context.close() })

    it('shows the sub-mode as text, with no dialog', async () => {
      const { page, dialogs } = opened
      const read = () => page.evaluate((id) => document.getElementById(id).textContent, id)
      assert.equal(await settle(read, IMG_ALERT), IMG_ALERT)
      assert.deepEqual(await onAttributes(page, id), [])
      // A "nothing happened in N ms" check (CODING_STANDARDS.md rule 4): no dialog can be awaited when none fires.
      await sleep(NO_DIALOG_MS)
      assert.deepEqual(dialogs, [])
    })
  })
}

// A Source that closes the `href` quote of the contest note's link and adds a mouseover handler.
const QUOTE_BREAKOUT = 'x" onmouseover="alert(\'link-script\')'

// Makes a link of `kind` ('solve' or 'contest') whose Source is `source`.
function sourceLink (kind, source) {
  return makeLink(({ kind, source }) => {
    document.getElementById('saveinfosource').value = source
    return kind === 'contest' ? pu.maketext_compsolve() : pu.maketext_solve()
  }, { kind, source })
}

// The `href` attribute of the element `selector` matches, or null when it has none.
function hrefOf (page, selector) {
  return page.evaluate((selector) => document.querySelector(selector).getAttribute('href'), selector)
}

describe('a contest link whose Source breaks out of the link quote', () => {
  let opened
  before(async () => { opened = await openPenpa(browser(), await sourceLink('contest', QUOTE_BREAKOUT)) })
  after(async () => { await opened?.context.close() })

  it('adds no handler to the contest note and fires no dialog on mouseover', async () => {
    const { page, dialogs } = opened
    const read = () => page.evaluate(() => document.querySelector('#answer_key a') !== null)
    assert.equal(await settle(read, true), true)
    assert.deepEqual(await onAttributes(page, 'answer_key'), [])
    await page.dispatchEvent('#answer_key a', 'mouseover')
    assert.deepEqual(dialogs, [])
  })
})

// Each Source and the `href` it gets in a solve link's Source link and in a contest note: only an http(s) address,
// or one that resolves to the page's own scheme, is linked.
const SOURCES = [
  { source: 'javascript:alert("link-script")', href: null },
  { source: 'https://example.com/puzzle?id=1', href: 'https://example.com/puzzle?id=1' },
  { source: ' https://example.com/p', href: 'https://example.com/p' },
  { source: '//example.com/p', href: '//example.com/p' }
]
// Where each kind of link shows its Source.
const SOURCE_ANCHORS = { solve: '#puzzlesourcelink', contest: '#answer_key a' }

for (const { source, href } of SOURCES) {
  for (const [kind, selector] of Object.entries(SOURCE_ANCHORS)) {
    describe(`a ${kind} link whose Source is ${JSON.stringify(source)}`, () => {
      let opened
      before(async () => { opened = await openPenpa(browser(), await sourceLink(kind, source)) })
      after(async () => { await opened?.context.close() })

      it(href === null ? 'is not linked' : `links to ${href}`, async () => {
        assert.equal(await hrefOf(opened.page, selector), href)
      })
    })
  }
}
