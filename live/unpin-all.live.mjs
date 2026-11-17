// The Pinned card's Unpin all button (#271): one click removes every pin, the current tool stays current, Tab has nothing to
// cycle, the empty set is kept across a reload, and "Puzzle defaults" brings the defaults back. Found by role and accessible name.
import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { UNPIN_SELECTOR } from './ui-fuzz/actions.mjs'
import { currentTool, useBrowser, waitForDesk } from './page.mjs'
import { choosePreset, PIN_TAB_SET, pinChips, pinChipTexts, pinnedCard, toolKeyOf, withPinnedPage } from './pin-card.mjs'
import { settle } from './settle.mjs'

const browser = useBrowser()

const unpinAll = (page) => pinnedCard(page).getByRole('button', { name: 'Unpin all', exact: true })
const withPage = (body) => withPinnedPage(browser, body)

describe('Unpin all', () => {
  it('leaves the fuzz\'s unpin action one button per pin, and not this one (#295)', withPage(async (page) => {
    const pins = (await pinChipTexts(page)).length
    assert.ok(pins > 0, 'the page opens with pins')
    assert.equal(await pinnedCard(page).locator(UNPIN_SELECTOR).count(), pins)
  }))

  it('removes every pin, leaves the current tool alone, and leaves Tab nothing to cycle', withPage(async (page) => {
    await pinChips(page).first().locator('.ui-chip-main').click()
    const before = toolKeyOf(await currentTool(page))
    assert.equal((await pinChipTexts(page)).length, PIN_TAB_SET.length)
    await unpinAll(page).click()
    assert.deepEqual(await settle(() => pinChipTexts(page), []), [])
    assert.equal(toolKeyOf(await currentTool(page)), before, 'the current tool is unchanged')
    await page.keyboard.press('Tab')
    assert.equal(toolKeyOf(await currentTool(page)), before, 'Tab changes no tool')
  }))

  it('is disabled when nothing is pinned', withPage(async (page) => {
    assert.equal(await unpinAll(page).isDisabled(), false, 'enabled with pins')
    await unpinAll(page).click()
    await settle(() => unpinAll(page).isDisabled(), true)
    assert.equal(await unpinAll(page).isDisabled(), true)
  }))

  it('stays empty after a reload, and Puzzle defaults brings the defaults back', withPage(async (page) => {
    const defaults = (await pinChipTexts(page)).sort()
    await unpinAll(page).click()
    await settle(() => pinChipTexts(page), [])
    await page.reload()
    await waitForDesk(page)
    assert.deepEqual(await pinChipTexts(page), [], 'still empty after the reload')
    await choosePreset(page, 'Puzzle defaults')
    // The engine's Tab set lists the same tools in another order once the page has reloaded, so the set is compared, not the order (#281).
    const sortedChips = async () => (await pinChipTexts(page)).sort()
    assert.deepEqual(await settle(sortedChips, defaults), defaults)
    assert.equal(await unpinAll(page).isDisabled(), false, 'enabled again once the defaults are back')
  }))
})
