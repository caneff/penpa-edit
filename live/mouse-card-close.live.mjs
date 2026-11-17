// The Mouse card can be closed (#183): its × hides it, the Settings dialog's "Show Mouse card" switch shows and hides it, the closed
// state survives a reload, and with Mouse closed the fitted layout gives Rules the left column's whole height.
// Read through the cards' bounding boxes; the clicks are real.
import assert from 'node:assert/strict'
import { afterEach, describe, it } from 'node:test'
import { AKARI_SOLVE, openSolvePage, useBrowser, waitForDesk } from './page.mjs'
import { settle } from './settle.mjs'

const browser = useBrowser()

const FULL_HD = { viewport: { width: 1920, height: 1080 } }
// The desk's top margin, and how far a card's height may miss the column's, for rounding.
const TOP_MARGIN_PX = 12
const ROUNDING_PX = 2

// Runs in the page. Each named card's box, or null for a card that is not shown, and the desk's.
function readCardsInPage (names) {
  const rect = (node) => { const r = node.getBoundingClientRect(); return { x: r.x, y: r.y, w: r.width, h: r.height } }
  return {
    desk: rect(document.querySelector('.ui-desk')),
    cards: Object.fromEntries(names.map((name) => {
      const node = document.querySelector(`section[aria-label="${name}"]`)
      return [name, node.offsetParent === null ? null : rect(node)]
    }))
  }
}

describe('The Mouse card closes and reopens', () => {
  let opened
  afterEach(async () => { await opened?.context.close() })

  const read = (page) => page.evaluate(readCardsInPage, ['Mouse', 'Rules'])
  const fillsColumn = async (page) => {
    const { desk, cards } = await read(page)
    return cards.Rules !== null && Math.abs(cards.Rules.h - (desk.h - 2 * TOP_MARGIN_PX)) <= ROUNDING_PX
  }
  const settingsSwitch = (page) => page.locator('wa-switch').filter({ has: page.getByRole('switch', { name: 'Show Mouse card' }) })

  async function openDialog (page) {
    await page.getByRole('button', { name: 'Settings' }).click()
    await page.getByRole('dialog', { name: 'Settings' }).waitFor()
  }

  it('closes with its x, stays closed after a reload with Rules filling the column, and reopens from Settings', async () => {
    opened = await openSolvePage(browser(), AKARI_SOLVE, { served: true, contextOptions: FULL_HD })
    const { page } = opened
    const before = await read(page)
    assert.notEqual(before.cards.Mouse, null, 'Mouse starts open')

    await page.getByRole('region', { name: 'Mouse' }).getByRole('button', { name: 'Close Mouse card' }).click()
    assert.equal((await read(page)).cards.Mouse, null, 'the x hides Mouse')
    assert.equal(await settle(() => fillsColumn(page), true), true, 'Rules fills the column')

    await page.reload()
    await waitForDesk(page)
    assert.equal((await read(page)).cards.Mouse, null, 'Mouse is still closed after the reload')
    assert.equal(await settle(() => fillsColumn(page), true), true, 'Rules still fills the column after the reload')

    await openDialog(page)
    assert.equal(await page.getByRole('switch', { name: 'Show Mouse card' }).isChecked(), false, 'the switch shows Mouse closed')
    await settingsSwitch(page).click()
    const reopened = await settle(async () => (await read(page)).cards.Mouse !== null, true)
    assert.equal(reopened, true, 'the switch shows Mouse')
    const after = await read(page)
    assert.equal(after.cards.Mouse.h > 0 && after.cards.Rules.h < after.desk.h - 2 * TOP_MARGIN_PX - ROUNDING_PX, true,
      `Rules gives Mouse its room back: ${JSON.stringify(after.cards)}`)

    await settingsSwitch(page).click()
    assert.equal(await settle(async () => (await read(page)).cards.Mouse === null, true), true, 'the switch hides Mouse again')
  })

  it('keeps Mouse closed through Reset layout', async () => {
    opened = await openSolvePage(browser(), AKARI_SOLVE, { served: true, contextOptions: FULL_HD })
    const { page } = opened
    await page.getByRole('button', { name: 'Close Mouse card' }).click()
    await page.getByRole('button', { name: 'Reset layout' }).click()
    assert.equal((await read(page)).cards.Mouse, null)
  })
})
