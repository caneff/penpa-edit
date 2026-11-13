// Title, Author, Source and Rules come back from a saved link exactly as typed, and the page shows them as text.
import assert from 'node:assert/strict'
import { after, before, describe, it } from 'node:test'
import { openPenpa, useBrowser } from './page.mjs'

const browser = useBrowser()

// Every character the header escapes, plus a `%2C` already in the text and HTML that must stay text.
const TITLE = 'a<b & c = d, e %2C f 50% %25'
const AUTHOR = 'Chris <i>N</i>, "x" & y = z %2D'
const SOURCE = 'https://example.test/?ids=a%2Cb,c&q=1%2F2'
const RULES = 'Shade a<b cells & more\nline2 50%2C off, x=y\n%2D'

describe('a link\'s Title, Author, Source and Rules', () => {
  let first
  let second
  before(async () => {
    first = await openPenpa(browser())
    await first.page.evaluate(({ title, author, source, rules }) => {
      document.getElementById('saveinfotitle').value = title
      document.getElementById('saveinfoauthor').value = author
      document.getElementById('saveinfosource').value = source
      document.getElementById('saveinforules').value = rules
    }, { title: TITLE, author: AUTHOR, source: SOURCE, rules: RULES })
    const link = await first.page.evaluate(() => pu.maketext_duplicate())
    second = await openPenpa(browser(), link.slice(link.indexOf('#')))
  })
  after(async () => {
    await first?.context.close()
    await second?.context.close()
  })

  it('come back from a round trip unchanged', async () => {
    const fields = await second.page.evaluate(() => ({
      title: document.getElementById('saveinfotitle').value,
      author: document.getElementById('saveinfoauthor').value,
      source: document.getElementById('saveinfosource').value,
      rules: document.getElementById('saveinforules').value
    }))
    assert.deepEqual(fields, { title: TITLE, author: AUTHOR, source: SOURCE, rules: RULES })
  })

  it('show as text, with no element made from the HTML in them', async () => {
    const shown = await second.page.evaluate(() => ({
      title: document.getElementById('puzzletitle').textContent,
      author: document.getElementById('puzzleauthor').textContent,
      rulesText: document.getElementById('ruletext').textContent,
      elements: document.querySelectorAll('#puzzletitle *, #puzzleauthor *, #ruletext *:not(br)').length
    }))
    assert.deepEqual(shown, {
      title: TITLE,
      author: AUTHOR,
      rulesText: RULES.replace(/\n/g, ''),
      elements: 0
    })
  })
})
