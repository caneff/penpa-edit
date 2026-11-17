// The Pinned card's Unpin all button (#271): one click removes every pin, the current tool stays current, Tab has nothing to
// cycle, the empty set is kept across a reload, and "Puzzle defaults" brings the defaults back. Found by role and accessible name.
import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { chipName, currentTool, newBoardSolveLink, openSolvePage, useBrowser, waitForDesk } from './page.mjs'
import { choosePreset, pinnedCard } from './pin-card.mjs'
import { settle } from './settle.mjs'

const browser = useBrowser()

const TAB_SET = ['Line Normal', 'Sudoku Corner', 'Surface']

const chips = (page) => pinnedCard(page).locator('.ui-chip')
const chipTexts = async (page) => (await chips(page).locator('.ui-chip-main').allInnerTexts()).map(chipName)
const unpinAll = (page) => pinnedCard(page).getByRole('button', { name: 'Unpin all', exact: true })
const toolKey = ({ mode, submode }) => `${mode}/${submode ?? ''}`

const withPage = (body) => async () => {
  const opened = await openSolvePage(browser(), await newBoardSolveLink(browser(), TAB_SET))
  try {
    await body(opened.page)
  } finally {
    await opened.context.close()
  }
}

describe('Unpin all', () => {
  it('removes every pin, leaves the current tool alone, and leaves Tab nothing to cycle', withPage(async (page) => {
    await chips(page).first().locator('.ui-chip-main').click()
    const before = toolKey(await currentTool(page))
    assert.equal((await chipTexts(page)).length, 3)
    await unpinAll(page).click()
    assert.deepEqual(await settle(() => chipTexts(page), []), [])
    assert.equal(toolKey(await currentTool(page)), before, 'the current tool is unchanged')
    await page.keyboard.press('Tab')
    assert.equal(toolKey(await currentTool(page)), before, 'Tab changes no tool')
  }))

  it('is disabled when nothing is pinned', withPage(async (page) => {
    assert.equal(await unpinAll(page).isDisabled(), false, 'enabled with pins')
    await unpinAll(page).click()
    await settle(() => unpinAll(page).isDisabled(), true)
    assert.equal(await unpinAll(page).isDisabled(), true)
  }))

  it('stays empty after a reload, and Puzzle defaults brings the defaults back', withPage(async (page) => {
    const defaults = (await chipTexts(page)).sort()
    await unpinAll(page).click()
    await settle(() => chipTexts(page), [])
    await page.reload()
    await waitForDesk(page)
    assert.deepEqual(await chipTexts(page), [], 'still empty after the reload')
    await choosePreset(page, 'Puzzle defaults')
    // The engine's Tab set lists the same tools in another order once the page has reloaded, so the set is compared, not the order.
    const sortedChips = async () => (await chipTexts(page)).sort()
    assert.deepEqual(await settle(sortedChips, defaults), defaults)
  }))
})
