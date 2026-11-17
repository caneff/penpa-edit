// The Rules card of `solve.html` (#204): one block per line, list items that hang, long strings and URLs that wrap, URLs
// as links that open in a new tab, rules text that stays text, and a card of one line when the link has no rules.
import assert from 'node:assert/strict'
import { afterEach, describe, it } from 'node:test'
import { linkFromNewBoard, newBoardRulesSolveLinkInPage, openSolvePage, useBrowser } from './page.mjs'
import { settle } from './settle.mjs'

const browser = useBrowser()

const URL = 'https://example.com/a/very/long/path/that/keeps/going/and/going/and/going/until/it/cannot/fit/in/the/card/at/all'
const LONG_ITEM = '- ' + 'a wrapped bullet whose text is long enough to need a second line inside the card '.repeat(3).trim()
const RULES = ['Plain line.', LONG_ITEM, '1. numbered item', `See ${URL}.`, '<b>x</b>', 'x'.repeat(200)].join('\n')

describe('the Rules card', () => {
  let opened
  afterEach(async () => { await opened?.context.close() })

  const open = async (rules) => {
    opened = await openSolvePage(browser(), await linkFromNewBoard(browser(), newBoardRulesSolveLinkInPage, rules))
    return opened.page
  }
  const body = (page) => page.locator('section[aria-label="Rules"] .ui-body')

  it('hangs a wrapped list item under its text, not under its marker', async () => {
    const page = await open(RULES)
    const item = body(page).locator('.ui-rules-item').first()
    const { markerRight, textLeft, lines } = await item.evaluate((node) => {
      const text = node.querySelector('.ui-rules-item-text')
      return {
        markerRight: node.querySelector('.ui-rules-marker').getBoundingClientRect().right,
        textLeft: text.getBoundingClientRect().left,
        lines: Math.round(text.getBoundingClientRect().height / parseFloat(getComputedStyle(text).lineHeight))
      }
    })
    assert.equal(lines > 1, true, `the item wraps: ${lines} lines`)
    assert.equal(Math.abs(textLeft - markerRight) < 1, true, `the text block starts where the marker ends, so every line of it does: ${textLeft} vs ${markerRight}`)
    assert.equal(await body(page).evaluate((b) => getComputedStyle(b).tabSize), '2')
  })

  it('wraps a long URL and a long unbroken string inside the card, and opens the URL in a new tab', async () => {
    const page = await open(RULES)
    const overflow = await body(page).evaluate((b) => b.scrollWidth - b.clientWidth)
    assert.equal(overflow <= 0, true, `nothing runs past the card's right edge: ${overflow}`)
    const link = body(page).getByRole('link', { name: URL })
    assert.equal(await link.getAttribute('href'), URL, 'the trailing full stop is not part of the link')
    assert.equal(await link.getAttribute('target'), '_blank')
    assert.equal(await link.getAttribute('rel'), 'noopener noreferrer')
  })

  it('shows rules text that looks like HTML as literal text', async () => {
    const page = await open(RULES)
    assert.equal(await body(page).locator('b').count(), 0, 'no element was made from the rules')
    assert.equal(await body(page).getByText('<b>x</b>', { exact: true }).count(), 1)
  })

  it('shows the rules at 14 px by default', async () => {
    const page = await open(RULES)
    assert.equal(await body(page).evaluate((b) => parseFloat(getComputedStyle(b).fontSize)), 14)
  })

  it('is one line tall, with − and + disabled, when the link has no rules', async () => {
    const page = await open('')
    const note = body(page)
    assert.equal(await note.textContent(), 'No rules in this link.')
    const card = page.getByRole('region', { name: 'Rules' })
    // The body is its padding plus one line of text, not the 48 px minimum other cards keep.
    const isOneLine = () => note.evaluate((b) => {
      const style = getComputedStyle(b)
      const padding = parseFloat(style.paddingTop) + parseFloat(style.paddingBottom)
      return b.getBoundingClientRect().height < padding + 1.5 * parseFloat(style.lineHeight)
    })
    assert.equal(await settle(isOneLine, true), true, `the card's body is one line: ${(await note.boundingBox()).height} px`)
    assert.equal((await card.boundingBox()).height < 70, true, `and the card is its title bar and that line: ${(await card.boundingBox()).height} px`)
    assert.equal(await page.getByRole('button', { name: 'Smaller rules text' }).isDisabled(), true)
    assert.equal(await page.getByRole('button', { name: 'Bigger rules text' }).isDisabled(), true)
  })
})
