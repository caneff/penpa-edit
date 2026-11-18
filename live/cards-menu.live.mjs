// Every card but the Board closes by its header × and reopens from the top bar's Cards menu (#334): a closed card leaves its
// column refitted with no overlap and nothing outside the window, stays closed through a reload, and comes back to its
// automatic place. The pins keep working with Pinned and Mode closed. Read through the cards' bounding boxes; the clicks are real.
import assert from 'node:assert/strict'
import { afterEach, describe, it } from 'node:test'
import { currentTool, newBoardSolveLink, openSolvePage, resetLayoutInSettings, setTool, useBrowser, waitForDesk, waitForTool } from './page.mjs'
import { steady } from './desk-layout.mjs'
import { settle } from './settle.mjs'

const browser = useBrowser()

const FULL_HD = { viewport: { width: 1920, height: 1080 } }
// The link carries rules, so the Rules card is more than its one-line note, and pins, so Z, X, C and V and Tab have tools.
const SOME_RULES = 'Put a digit from 1 to 9 in every cell.'
const PINS = ['Sudoku Normal', 'Line Normal', 'Wall']
const CLOSEABLE = ['Rules', 'Mouse', 'Pinned', 'Mode', 'Recent']
const CARDS = ['Board', ...CLOSEABLE]
const LEFT = ['Rules', 'Mouse']
const RIGHT = ['Pinned', 'Mode', 'Recent']
// desk.js's margin above and below the columns, and how far two edges may differ by rounding.
const TOP_MARGIN_PX = 12
const ROUNDING_PX = 2

// Runs in the page. The desk's box and each card's, null for a card that is not shown.
function readDeskInPage (names) {
  const rect = (node) => { const r = node.getBoundingClientRect(); return { x: r.x, y: r.y, w: r.width, h: r.height } }
  return {
    desk: rect(document.querySelector('.ui-desk')),
    cards: Object.fromEntries(names.map((name) => {
      const node = document.querySelector(`section[aria-label="${name}"]`)
      return [name, node.offsetParent === null ? null : rect(node)]
    }))
  }
}

const read = (page) => steady(page, readDeskInPage, CARDS)
const open = () => newBoardSolveLink(browser(), PINS, SOME_RULES)
  .then((link) => openSolvePage(browser(), link, { served: true, contextOptions: FULL_HD }))

const near = (a, b) => Math.abs(a - b) <= ROUNDING_PX

// No two shown cards overlap, every shown card is inside the desk, and each column is laid out as the fitted desk lays it:
// a left column of one card takes the whole column; Pinned at the top of the right column, Recent on its bottom, the
// cards in that order, one width.
function assertTidy ({ desk, cards }, what) {
  const shown = Object.entries(cards).filter(([, box]) => box)
  const say = `${what}: ${JSON.stringify(cards)} in ${JSON.stringify(desk)}`
  shown.forEach(([name, b], i) => {
    assert.equal(b.x >= desk.x - ROUNDING_PX && b.y >= desk.y - ROUNDING_PX && b.x + b.w <= desk.x + desk.w + ROUNDING_PX &&
      b.y + b.h <= desk.y + desk.h + ROUNDING_PX, true, `${name} is inside the desk; ${say}`)
    shown.slice(i + 1).forEach(([other, c]) => {
      const meet = b.x + ROUNDING_PX < c.x + c.w && c.x + ROUNDING_PX < b.x + b.w && b.y + ROUNDING_PX < c.y + c.h && c.y + ROUNDING_PX < b.y + b.h
      assert.equal(meet, false, `${name} and ${other} do not overlap; ${say}`)
    })
  })
  const columnTop = desk.y + TOP_MARGIN_PX
  const columnBottom = desk.y + desk.h - TOP_MARGIN_PX
  const left = LEFT.filter((name) => cards[name])
  if (left.length === 1) {
    const only = cards[left[0]]
    assert.equal(near(only.y, columnTop) && near(only.y + only.h, columnBottom), true, `${left[0]} alone takes the left column; ${say}`)
  }
  const right = RIGHT.filter((name) => cards[name]).map((name) => [name, cards[name]])
  right.forEach(([name, b], i) => {
    assert.equal(near(b.x, right[0][1].x) && near(b.w, right[0][1].w), true, `${name} keeps the right column's place; ${say}`)
    if (i > 0) assert.equal(b.y >= right[i - 1][1].y + right[i - 1][1].h, true, `${name} is under ${right[i - 1][0]}; ${say}`)
  })
  if (cards.Pinned) assert.equal(near(cards.Pinned.y, columnTop), true, `Pinned is at the column's top; ${say}`)
  if (cards.Recent) assert.equal(near(cards.Recent.y + cards.Recent.h, columnBottom), true, `Recent is on the column's bottom; ${say}`)
}

function assertSamePlaces (now, was, what) {
  CARDS.forEach((name) => {
    const [a, b] = [now.cards[name], was.cards[name]]
    assert.equal(['x', 'y', 'w', 'h'].every((edge) => near(a[edge], b[edge])), true,
      `${what}: ${name} is back in its automatic place: ${JSON.stringify(now.cards)} against ${JSON.stringify(was.cards)}`)
  })
}

const cardsButton = (page) => page.getByRole('button', { name: 'Cards', exact: true })
const menuItem = (page, name) => page.getByRole('menuitemcheckbox', { name, exact: true })

async function openMenu (page) {
  await cardsButton(page).click()
  await menuItem(page, 'Rules').waitFor()
}

// Toggles `name` in the Cards menu and closes the menu again.
async function toggleInMenu (page, name) {
  await openMenu(page)
  await menuItem(page, name).click()
  await page.keyboard.press('Escape')
  await menuItem(page, 'Rules').waitFor({ state: 'hidden' })
}

const closeByX = (page, name) => page.getByRole('region', { name }).getByRole('button', { name: `Close ${name} card` }).click()

describe('The Cards menu', () => {
  let opened
  afterEach(async () => { await opened?.context.close() })

  it('lists one checked box per closeable card and Reset layout last; Settings shows no Mouse switch', async () => {
    opened = await open()
    const { page } = opened
    await openMenu(page)
    const items = await page.locator('wa-dropdown[open] wa-dropdown-item').evaluateAll((nodes) =>
      nodes.map((node) => [node.textContent.trim(), node.type, node.checked]))
    assert.deepEqual(items, [...CLOSEABLE.map((name) => [name, 'checkbox', true]), ['Reset layout', 'normal', false]])
    await page.keyboard.press('Escape')
    await page.getByRole('button', { name: 'Settings', exact: true }).click()
    await page.getByRole('dialog', { name: 'Settings' }).waitFor()
    assert.equal(await page.getByRole('switch', { name: 'Show Mouse card' }).count(), 0, 'Settings no longer shows or hides Mouse')
  })

  it('resets the layout from its last item and leaves a closed card closed', async () => {
    opened = await open()
    const { page } = opened
    const fitted = await read(page)
    await closeByX(page, 'Recent')
    const head = await page.locator('section[aria-label="Board"] .ui-head h2').boundingBox()
    await page.mouse.move(head.x + 5, head.y + 5)
    await page.mouse.down()
    await page.mouse.move(head.x + 45, head.y + 35, { steps: 4 })
    await page.mouse.up()
    await openMenu(page)
    await page.getByRole('menuitem', { name: 'Reset layout' }).click()
    const reset = await settle(async () => (await read(page)).cards.Board.x, fitted.cards.Board.x)
    assert.equal(near(reset, fitted.cards.Board.x), true, 'the Board is back in place')
    assert.equal((await read(page)).cards.Recent, null, 'Recent stays closed')
  })
})

describe('Each closeable card closes by its x and reopens from the Cards menu', () => {
  let opened
  afterEach(async () => { await opened?.context.close() })

  for (const name of ['Rules', 'Mode', 'Recent', 'Pinned', 'Mouse']) {
    it(`${name}: gone, its column refitted, still closed after a reload, back in its automatic place from the menu`, async () => {
      opened = await open()
      const { page } = opened
      const fitted = await read(page)
      assertTidy(fitted, 'the fitted desk')

      await closeByX(page, name)
      const closed = await read(page)
      assert.equal(closed.cards[name], null, `the x closes ${name}`)
      assertTidy(closed, `${name} closed`)

      await page.reload()
      await waitForDesk(page)
      const reloaded = await read(page)
      assert.equal(reloaded.cards[name], null, `${name} is still closed after a reload`)
      assertTidy(reloaded, `${name} closed, reloaded`)

      await openMenu(page)
      assert.equal(await menuItem(page, name).evaluate((node) => node.checked), false, `the menu shows ${name} closed`)
      await page.keyboard.press('Escape')
      await menuItem(page, 'Rules').waitFor({ state: 'hidden' })
      await toggleInMenu(page, name)
      assertSamePlaces(await read(page), fitted, `${name} reopened`)
    })
  }

  it('lays out a desk with Rules and Recent closed, and one with every card but the Board closed', async () => {
    opened = await open()
    const { page } = opened
    await closeByX(page, 'Rules')
    await closeByX(page, 'Recent')
    assertTidy(await read(page), 'Rules and Recent closed')
    for (const name of ['Mouse', 'Pinned', 'Mode']) await closeByX(page, name)
    const bare = await read(page)
    assert.deepEqual(CLOSEABLE.filter((name) => bare.cards[name]), [], 'only the Board is left')
    assertTidy(bare, 'only the Board')
  })

  it('closes a card in a column the solver resized by hand, and the other cards keep their sizes', async () => {
    opened = await open()
    const { page } = opened
    const handle = page.locator('section[aria-label="Mode"] [data-testid="resize-bottom"]')
    const box = await handle.boundingBox()
    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2)
    await page.mouse.down()
    await page.mouse.move(box.x + box.width / 2, box.y - 40, { steps: 4 })
    await page.mouse.up()
    const resized = await read(page)
    await closeByX(page, 'Pinned')
    const after = await read(page)
    for (const name of ['Mode', 'Recent']) {
      assert.equal(['x', 'y', 'w', 'h'].every((edge) => near(after.cards[name][edge], resized.cards[name][edge])), true,
        `${name} keeps its place and size: ${JSON.stringify(after.cards)} against ${JSON.stringify(resized.cards)}`)
    }
  })
})

describe('With Pinned and Mode closed the pins still work', () => {
  let opened
  afterEach(async () => { await opened?.context.close() })

  it('jumps by Z, X and C, steps by Tab, and pins from a Recent chip', async () => {
    opened = await open()
    const { page } = opened
    await closeByX(page, 'Pinned')
    await closeByX(page, 'Mode')
    await setTool(page, { mode: 'surface', submode: null })
    await page.keyboard.press('x')
    await waitForTool(page, { mode: 'line', submode: '1' }, 'X jumps to pin 2')
    await page.keyboard.press('Tab')
    await waitForTool(page, { mode: 'wall', submode: null }, 'Tab steps to pin 3')
    await page.keyboard.press('z')
    await waitForTool(page, { mode: 'sudoku', submode: '1' }, 'Z jumps to pin 1')
    const pinSurface = page.getByRole('region', { name: 'Recent' }).getByRole('button', { name: 'Pin Surface' })
    await pinSurface.click()
    await setTool(page, { mode: 'wall', submode: null })
    await page.keyboard.press('v')
    await waitForTool(page, { mode: 'surface', submode: null }, 'V jumps to the pin a Recent chip added')
    assert.equal((await currentTool(page)).mode, 'surface')
  })
})
