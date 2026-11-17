// The Mode card's tool tree and the Pinned card's preset list of `solve.html` (#187) open as a floating layer: inside the window,
// over the other cards, and the card they live in keeps its size. Driven by role and accessible name, in a laptop-sized window.
import assert from 'node:assert/strict'
import { after, before, describe, it } from 'node:test'
import { openPenpa, openSolvePage, useBrowser, newBoardSolveLink } from './page.mjs'
import { settle } from './settle.mjs'

const browser = useBrowser()

const LAPTOP = { viewport: { width: 1366, height: 768 } }

// Every tab, so the Mode tree has every tool to list.
const allTabs = async () => {
  const { page, context } = await openPenpa(browser(), '')
  try {
    return await page.evaluate(() => PenpaText.modes.EN.slice())
  } finally {
    await context.close()
  }
}

describe('the pickers of solve.html in a 1366x768 window', () => {
  let opened
  before(async () => {
    const link = await newBoardSolveLink(browser(), await allTabs())
    opened = await openSolvePage(browser(), link, { contextOptions: LAPTOP })
  })
  after(async () => { await opened?.context.close() })

  const page = () => opened.page
  const box = (locator) => locator.evaluate((node) => {
    const { x, y, width, height } = node.getBoundingClientRect()
    return { x, y, width, height }
  })
  const isInsideWindow = ({ x, y, width, height }) => x >= 0 && y >= 0 && x + width <= 1366 && y + height <= 768

  const cases = [
    { card: 'Mode', field: 'Tool', list: (card) => card.getByRole('tree', { name: 'Tools' }) },
    { card: 'Pinned', field: 'Pin presets', list: (card) => card.getByRole('listbox', { name: 'Presets' }) }
  ]
  for (const { card: cardName, field: fieldName, list: listOf } of cases) {
    describe(`the ${cardName} card's list`, () => {
      const card = () => page().getByRole('region', { name: cardName })
      const field = () => card().getByRole('combobox', { name: fieldName })
      // The default layout stacks the Recent card over the lower half of the Pinned card, where its preset field is, so it is
      // focused rather than clicked: the keyboard opens the same list.
      const focusField = () => field().focus()

      it('opens inside the window, over the card, and leaves the card its size', async () => {
        await page().keyboard.press('Escape')
        await page().mouse.click(5, 400)
        const before = await box(card())
        await focusField()
        const list = listOf(card()).locator('xpath=ancestor-or-self::*[contains(@class,"ui-list")][1]')
        await list.waitFor()
        const open = await settle(async () => {
          const at = await box(list)
          return isInsideWindow(at) && at.height > 40
        }, true)
        assert.equal(open, true, `the list's box ${JSON.stringify(await box(list))} is inside the 1366x768 window`)
        assert.deepEqual(await box(card()), before, 'the card keeps its box')
        const middle = await list.evaluate((node) => {
          const at = node.getBoundingClientRect()
          const hit = document.elementFromPoint(at.x + at.width / 2, at.y + at.height / 2)
          return node.contains(hit)
        })
        assert.equal(middle, true, 'the list is the top layer at its own centre')
      })

      it('closes on Escape and on a click outside', async () => {
        const list = listOf(card()).locator('xpath=ancestor-or-self::*[contains(@class,"ui-list")][1]')
        await page().keyboard.press('Escape')
        await list.waitFor({ state: 'hidden' })
        await focusField()
        await list.waitFor()
        await page().mouse.click(5, 400)
        await list.waitFor({ state: 'hidden' })
      })
    })
  }
})
