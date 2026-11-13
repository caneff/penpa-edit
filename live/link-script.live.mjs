// A link's data never runs as script in the page (#11): no dialog fires and no `on*` attribute appears.
import assert from 'node:assert/strict'
import { after, before, describe, it } from 'node:test'
import { openPenpa, useBrowser } from './page.mjs'
import { settle } from './settle.mjs'

const browser = useBrowser()

// A payload that opens a dialog if the page parses it as HTML.
const IMG_ALERT = '<img src=x onerror=alert("link-script")>'

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

describe('a javascript: Source', () => {
  const SOURCE = 'javascript:alert("link-script")'

  it('is not linked from a solve link', async () => {
    const { context, page } = await openPenpa(browser(), await sourceLink('solve', SOURCE))
    assert.equal(await hrefOf(page, '#puzzlesourcelink'), null)
    await context.close()
  })

  it('is not linked from a contest note', async () => {
    const { context, page } = await openPenpa(browser(), await sourceLink('contest', SOURCE))
    assert.equal(await hrefOf(page, '#answer_key a'), null)
    await context.close()
  })
})

describe('an https Source', () => {
  const SOURCE = 'https://example.com/puzzle?id=1'

  it('is linked from a solve link', async () => {
    const { context, page } = await openPenpa(browser(), await sourceLink('solve', SOURCE))
    assert.equal(await hrefOf(page, '#puzzlesourcelink'), SOURCE)
    await context.close()
  })

  it('is linked from a contest note', async () => {
    const { context, page } = await openPenpa(browser(), await sourceLink('contest', SOURCE))
    assert.equal(await hrefOf(page, '#answer_key a'), SOURCE)
    await context.close()
  })
})
