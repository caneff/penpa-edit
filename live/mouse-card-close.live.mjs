// The Mouse card can be closed (#183): its × hides it, the top bar's Cards menu shows and hides it (#334), the closed state
// survives a reload, and with Mouse closed the fitted layout gives Rules the left column's whole height.
// Read through the cards' bounding boxes; the clicks are real.
import assert from 'node:assert/strict'
import { afterEach, describe, it } from 'node:test'
import { newBoardSolveLink, openSolvePage, resetLayoutInSettings, useBrowser, waitForDesk } from './page.mjs'
import { settle } from './settle.mjs'

// The link carries rules: with none the Rules card is one line tall and keeps neither the column nor a control to focus.
const SOME_RULES = 'Put a digit from 1 to 9 in every cell.'

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
  const menuItem = (page) => page.getByRole('menuitemcheckbox', { name: 'Mouse', exact: true })
  // Toggles Mouse in the Cards menu, which stays open for another toggle until Escape closes it.
  const toggleInMenu = async (page) => {
    await openMenu(page)
    await menuItem(page).click()
    await page.keyboard.press('Escape')
    await menuItem(page).waitFor({ state: 'hidden' })
  }

  const assertSameSplit = (now, was) => {
    for (const name of ['Mouse', 'Rules']) {
      for (const edge of ['x', 'y', 'w', 'h']) {
        assert.equal(Math.abs(now.cards[name][edge] - was.cards[name][edge]) <= ROUNDING_PX, true,
          `${name} is back in the fitted split: ${JSON.stringify(now.cards)} against ${JSON.stringify(was.cards)}`)
      }
    }
  }

  const reopenFromMenu = async (page) => {
    await toggleInMenu(page)
    await settle(async () => (await read(page)).cards.Mouse !== null, true)
  }

  async function openMenu (page) {
    await page.getByRole('button', { name: 'Cards', exact: true }).click()
    await menuItem(page).waitFor()
  }

  it('closes with its x, stays closed after a reload with Rules filling the column, and reopens from the Cards menu', async () => {
    opened = await openSolvePage(browser(), await newBoardSolveLink(browser(), undefined, SOME_RULES), { served: true, contextOptions: FULL_HD })
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

    await openMenu(page)
    assert.equal(await menuItem(page).evaluate((node) => node.checked), false, 'the menu shows Mouse closed')
    await page.keyboard.press('Escape')
    await toggleInMenu(page)
    const reopened = await settle(async () => (await read(page)).cards.Mouse !== null, true)
    assert.equal(reopened, true, 'the menu shows Mouse')
    const after = await read(page)
    assertSameSplit(after, before)

    await toggleInMenu(page)
    assert.equal(await settle(async () => (await read(page)).cards.Mouse === null, true), true, 'the menu hides Mouse again')
  })

  it('keeps Mouse closed through Reset layout', async () => {
    opened = await openSolvePage(browser(), await newBoardSolveLink(browser(), undefined, SOME_RULES), { served: true, contextOptions: FULL_HD })
    const { page } = opened
    await page.getByRole('button', { name: 'Close Mouse card' }).click()
    await resetLayoutInSettings(page)
    assert.equal((await read(page)).cards.Mouse, null)
  })

  it('gives Mouse its place back under Rules after a card was moved while Mouse was closed', async () => {
    opened = await openSolvePage(browser(), await newBoardSolveLink(browser(), undefined, SOME_RULES), { served: true, contextOptions: FULL_HD })
    const { page } = opened
    const before = await read(page)
    await page.getByRole('button', { name: 'Close Mouse card' }).click()
    await settle(() => fillsColumn(page), true)
    const head = await page.locator('section[aria-label="Board"] .ui-head h2').boundingBox()
    await page.mouse.move(head.x + 5, head.y + 5)
    await page.mouse.down()
    await page.mouse.move(head.x + 35, head.y + 25, { steps: 4 })
    await page.mouse.up()
    await reopenFromMenu(page)
    assertSameSplit(await read(page), before)
  })

  it('sizes Mouse again for a window that was resized while it was closed', async () => {
    opened = await openSolvePage(browser(), await newBoardSolveLink(browser(), undefined, SOME_RULES), { served: true, contextOptions: FULL_HD })
    const { page } = opened
    await page.getByRole('button', { name: 'Close Mouse card' }).click()
    await page.setViewportSize({ width: 1500, height: 900 })
    await settle(() => fillsColumn(page), true)
    await reopenFromMenu(page)
    const { cards } = await read(page)
    const mouseBody = await page.locator('section[aria-label="Mouse"] .ui-body').evaluate((body) => ({ over: body.scrollHeight - body.clientHeight, h: body.clientHeight }))
    assert.equal(cards.Mouse.y >= cards.Rules.y + cards.Rules.h - 1 && mouseBody.h > 0 && mouseBody.over <= 0, true,
      `Mouse sits under Rules and shows its rows: ${JSON.stringify({ cards, mouseBody })}`)
  })

  it('leaves focus on the Cards menu button when the x is pressed from the keyboard', async () => {
    opened = await openSolvePage(browser(), await newBoardSolveLink(browser(), undefined, SOME_RULES), { served: true, contextOptions: FULL_HD })
    const { page } = opened
    await page.getByRole('button', { name: 'Close Mouse card' }).focus()
    await page.keyboard.press('Enter')
    assert.equal(await settle(() => page.evaluate(() => document.activeElement.closest('wa-dropdown')?.querySelector('[slot="trigger"]') === document.activeElement), true), true)
  })

  it('keeps a zoom the solver set when Mouse closes and opens', async () => {
    opened = await openSolvePage(browser(), await newBoardSolveLink(browser(), undefined, SOME_RULES), { served: true, contextOptions: FULL_HD })
    const { page } = opened
    const cellSize = () => page.evaluate(() => engine.getState().cellSize)
    const fitted = await cellSize()
    await page.getByRole('region', { name: 'Board' }).getByRole('button', { name: 'Zoom in' }).click()
    const zoomed = await cellSize()
    assert.notEqual(zoomed, fitted, 'Zoom in changes the cell size')
    await page.getByRole('button', { name: 'Close Mouse card' }).click()
    await settle(() => fillsColumn(page), true)
    assert.equal(await cellSize(), zoomed, 'closing Mouse keeps the zoom')
    await reopenFromMenu(page)
    assert.equal(await cellSize(), zoomed, 'opening Mouse keeps the zoom')
  })
})
