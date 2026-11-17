// The Mode card's tool tree and the Pinned card's preset list of `solve.html` (#187) open as a floating layer: inside the window
// and below the top bar, over the other cards, scrolling to their last row, and the card they live in keeps its size. Driven by
// role and accessible name, in laptop-sized windows.
import assert from 'node:assert/strict'
import { after, before, describe, it } from 'node:test'
import { openPenpa, openSolvePage, useBrowser, newBoardSolveLink } from './page.mjs'
import { settle } from './settle.mjs'

const browser = useBrowser()

const WIDTH = 1366
// A laptop's height, and a window short enough that no list fits below its field.
const HEIGHTS = [768, 500]
// A point on the desk that is on no card.
const EMPTY_DESK = { x: 5, y: 400 }

// Every tab, so the Mode tree has every tool to list.
const allTabs = async () => {
  const { page, context } = await openPenpa(browser(), '')
  try {
    return await page.evaluate(() => PenpaText.modes.EN.slice())
  } finally {
    await context.close()
  }
}

const rectOf = (locator) => locator.evaluate((node) => {
  const { x, y, width, height } = node.getBoundingClientRect()
  return { x, y, width, height }
})

const CASES = [
  { card: 'Mode', field: 'Tool', list: (card) => card.getByRole('tree', { name: 'Tools' }) },
  { card: 'Pinned', field: 'Pin presets', list: (card) => card.getByRole('listbox', { name: 'Presets' }) }
]

for (const height of HEIGHTS) {
  describe(`the pickers of solve.html in a ${WIDTH}x${height} window`, () => {
    let opened
    before(async () => {
      const link = await newBoardSolveLink(browser(), await allTabs())
      opened = await openSolvePage(browser(), link, { contextOptions: { viewport: { width: WIDTH, height } } })
    })
    after(async () => { await opened?.context.close() })

    const page = () => opened.page
    const barBottom = () => rectOf(page().locator('.ui-bar')).then(({ y, height: barHeight }) => y + barHeight)

    for (const { card: cardName, field: fieldName, list: listOf } of CASES) {
      describe(`the ${cardName} card's list`, () => {
        const card = () => page().getByRole('region', { name: cardName })
        // The default layout stacks the Recent card over the lower half of the Pinned card, where its preset field is, so it is
        // focused rather than clicked: the keyboard opens the same list. Focus does not scroll, because a short window leaves the
        // Pinned card taller than the desk, and the browser would scroll the desk (#181's layout) and move the card.
        const focusField = () => card().getByRole('combobox', { name: fieldName }).evaluate((node) => node.focus({ preventScroll: true }))
        const list = () => listOf(card()).locator('xpath=ancestor-or-self::*[contains(@class,"ui-list")][1]')

        it('opens inside the window and below the top bar, over the card, and leaves the card its size', async () => {
          await page().keyboard.press('Escape')
          await page().mouse.click(EMPTY_DESK.x, EMPTY_DESK.y)
          const before = await rectOf(card())
          await focusField()
          await list().waitFor()
          const top = await barBottom()
          const fits = ({ y, height: listHeight }) => y >= top && y + listHeight <= height
          const open = await settle(async () => fits(await rectOf(list())), true)
          assert.equal(open, true, `the list's box ${JSON.stringify(await rectOf(list()))} is between y=${top} and y=${height}`)
          assert.deepEqual(await rectOf(card()), before, 'the card keeps its box')
          const onTop = await list().evaluate((node) => {
            const at = node.getBoundingClientRect()
            return node.contains(document.elementFromPoint(at.x + at.width / 2, at.y + at.height / 2))
          })
          assert.equal(onTop, true, 'the list is the top layer at its own centre')
        })

        it('scrolls to its last row', async () => {
          await list().evaluate((node) => { node.scrollTop = node.scrollHeight })
          const reached = await settle(() => list().evaluate((node) => node.scrollHeight - node.scrollTop - node.clientHeight < 1), true)
          assert.equal(reached, true, 'the list scrolls until its content ends')
        })

        it('closes on Escape and on a click outside', async () => {
          await page().keyboard.press('Escape')
          await list().waitFor({ state: 'hidden' })
          await focusField()
          await list().waitFor()
          await page().mouse.click(EMPTY_DESK.x, EMPTY_DESK.y)
          await list().waitFor({ state: 'hidden' })
        })
      })
    }
  })
}
