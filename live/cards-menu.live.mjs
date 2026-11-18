// Every card but the Board closes by its header × and reopens from the top bar's Cards menu (#334): a closed card leaves its
// column refitted with no overlap and nothing outside the window, stays closed through a reload, and comes back to its
// automatic place. A column the solver resized keeps its sizes, an emptied column gives the fitted Board its width, and the
// pins and the shortcut sheet keep working with cards closed. Read through the cards' bounding boxes; the clicks are real.
import assert from 'node:assert/strict'
import { afterEach, describe, it } from 'node:test'
import {
  cardsMenuItem, CLOSEABLE_CARDS, closeCardsMenu, DESK_SIZE, newBoardSolveLink, openCardsMenu, openSolvePage, setTool,
  toggleInCardsMenu, useBrowser, waitForDesk, waitForTool
} from './page.mjs'
import { steady } from './desk-layout.mjs'
import { settle } from './settle.mjs'

const browser = useBrowser()

const FULL_HD = { viewport: { width: 1920, height: 1080 } }
// The link carries rules, so the Rules card is more than its one-line note, and pins, so Z, X, C and V and Tab have tools.
const SOME_RULES = 'Put a digit from 1 to 9 in every cell.'
const PINS = ['Sudoku Normal', 'Line Normal', 'Wall']
const CARDS = ['Board', ...CLOSEABLE_CARDS]
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
const open = (contextOptions = FULL_HD) => newBoardSolveLink(browser(), PINS, SOME_RULES)
  .then((link) => openSolvePage(browser(), link, { served: true, contextOptions }))

const near = (a, b) => Math.abs(a - b) <= ROUNDING_PX
const sameBox = (a, b) => ['x', 'y', 'w', 'h'].every((edge) => near(a[edge], b[edge]))
const boxesMeet = (b, c) => b.x + ROUNDING_PX < c.x + c.w && c.x + ROUNDING_PX < b.x + b.w && b.y + ROUNDING_PX < c.y + c.h && c.y + ROUNDING_PX < b.y + b.h

// No two shown cards overlap, every shown card is inside the desk, and each column is laid out as the fitted desk lays it:
// a left column of one card takes the whole column; the right column's first card at its top, Recent on its bottom, the
// cards in Pinned, Mode, Recent order, one width.
function assertTidy ({ desk, cards }, what) {
  const shown = Object.entries(cards).filter(([, box]) => box)
  const say = `${what}: ${JSON.stringify(cards)} in ${JSON.stringify(desk)}`
  shown.forEach(([name, b], i) => {
    assert.equal(b.x >= desk.x - ROUNDING_PX && b.y >= desk.y - ROUNDING_PX && b.x + b.w <= desk.x + desk.w + ROUNDING_PX &&
      b.y + b.h <= desk.y + desk.h + ROUNDING_PX, true, `${name} is inside the desk; ${say}`)
    shown.slice(i + 1).forEach(([other, c]) => assert.equal(boxesMeet(b, c), false, `${name} and ${other} do not overlap; ${say}`))
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

function assertSamePlaces (now, was, what, names = CARDS) {
  names.forEach((name) => {
    assert.equal(sameBox(now.cards[name], was.cards[name]), true,
      `${what}: ${name} keeps its place: ${JSON.stringify(now.cards)} against ${JSON.stringify(was.cards)}`)
  })
}

const closeByX = (page, name) => page.getByRole('region', { name }).getByRole('button', { name: `Close ${name} card` }).click()

// Drags a card by its title bar, which ends the fitted layout.
async function dragHeader (page, name, dx, dy) {
  const head = await page.locator(`section[aria-label="${name}"] .ui-head h2`).boundingBox()
  await page.mouse.move(head.x + 5, head.y + 5)
  await page.mouse.down()
  await page.mouse.move(head.x + 5 + dx, head.y + 5 + dy, { steps: 4 })
  await page.mouse.up()
}

// Drags a card's resize handle `edge` by `dx`, `dy`.
async function dragHandle (page, name, edge, dx, dy) {
  const box = await page.locator(`section[aria-label="${name}"] [data-testid="resize-${edge}"]`).boundingBox()
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2)
  await page.mouse.down()
  await page.mouse.move(box.x + box.width / 2 + dx, box.y + box.height / 2 + dy, { steps: 4 })
  await page.mouse.up()
}

describe('The Cards menu', () => {
  let opened
  afterEach(async () => { await opened?.context.close() })

  it('lists one checked box per closeable card and Reset layout last; Settings shows no Mouse switch', async () => {
    opened = await open()
    const { page } = opened
    await openCardsMenu(page)
    const items = await page.locator('wa-dropdown[open] wa-dropdown-item').evaluateAll((nodes) =>
      nodes.map((node) => [node.textContent.trim(), node.type, node.checked]))
    assert.deepEqual(items, [...CLOSEABLE_CARDS.map((name) => [name, 'checkbox', true]), ['Reset layout', 'normal', false]])
    await closeCardsMenu(page)
    await page.getByRole('button', { name: 'Settings', exact: true }).click()
    await page.getByRole('dialog', { name: 'Settings' }).waitFor()
    assert.equal(await page.getByRole('switch', { name: 'Show Mouse card' }).count(), 0, 'Settings no longer shows or hides Mouse')
  })

  it('resets the layout from its last item and leaves a closed card closed', async () => {
    opened = await open()
    const { page } = opened
    const fitted = await read(page)
    await closeByX(page, 'Recent')
    await dragHeader(page, 'Board', 40, 30)
    await openCardsMenu(page)
    await page.getByRole('menuitem', { name: 'Reset layout' }).click()
    const reset = await settle(async () => (await read(page)).cards.Board.x, fitted.cards.Board.x)
    assert.equal(near(reset, fitted.cards.Board.x), true, 'the Board is back in place')
    assert.equal((await read(page)).cards.Recent, null, 'Recent stays closed')
  })
})

describe('Each closeable card closes by its x and reopens from the Cards menu', () => {
  let opened
  afterEach(async () => { await opened?.context.close() })

  for (const name of CLOSEABLE_CARDS) {
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

      await openCardsMenu(page)
      assert.equal(await cardsMenuItem(page, name).evaluate((node) => node.checked), false, `the menu shows ${name} closed`)
      await cardsMenuItem(page, name).click()
      await closeCardsMenu(page)
      assertSamePlaces(await read(page), fitted, `${name} reopened`)
    })
  }

  it('puts Mode at the right column\'s top with Pinned closed, and back where it was with Pinned open again', async () => {
    opened = await open()
    const { page } = opened
    const fitted = await read(page)
    assert.equal(fitted.cards.Mode.y > fitted.cards.Pinned.y + fitted.cards.Pinned.h + ROUNDING_PX, true, 'Mode starts below Pinned')
    await closeByX(page, 'Pinned')
    const closed = await read(page)
    assert.equal(near(closed.cards.Mode.y, closed.desk.y + TOP_MARGIN_PX), true, `Mode is at the column's top: ${JSON.stringify(closed.cards.Mode)}`)
    await toggleInCardsMenu(page, 'Pinned')
    assertSamePlaces(await read(page), fitted, 'Pinned reopened', ['Pinned', 'Mode', 'Recent'])
  })

  it('lays out a desk with Rules and Recent closed, and one with every card but the Board closed', async () => {
    opened = await open()
    const { page } = opened
    await closeByX(page, 'Rules')
    await closeByX(page, 'Recent')
    assertTidy(await read(page), 'Rules and Recent closed')
    for (const name of ['Mouse', 'Pinned', 'Mode']) await closeByX(page, name)
    const bare = await read(page)
    assert.deepEqual(CLOSEABLE_CARDS.filter((name) => bare.cards[name]), [], 'only the Board is left')
    assertTidy(bare, 'only the Board')
  })

  it('gives the fitted Board the width of a column whose cards are all closed', async () => {
    // At this size the 6x6 board is as wide as the columns leave it, so the freed width shows.
    opened = await open({ viewport: DESK_SIZE.viewport })
    const { page } = opened
    const fitted = await read(page)
    await closeByX(page, 'Rules')
    await closeByX(page, 'Mouse')
    const freed = await read(page)
    assert.equal(freed.cards.Board.w > fitted.cards.Board.w + ROUNDING_PX, true,
      `the Board widens from ${fitted.cards.Board.w}px, got ${freed.cards.Board.w}px`)
    assertTidy(freed, 'Rules and Mouse closed')
  })

  it('closes a card in a column the solver resized by hand, and the other cards keep their sizes', async () => {
    opened = await open()
    const { page } = opened
    await dragHandle(page, 'Mode', 'bottom', 0, -40)
    const resized = await read(page)
    await closeByX(page, 'Pinned')
    assertSamePlaces(await read(page), resized, 'Pinned closed', ['Mode', 'Recent'])
  })

  it('closes Mouse under a Rules card the solver resized by hand, and Rules keeps its size', async () => {
    opened = await open()
    const { page } = opened
    await dragHandle(page, 'Rules', 'bottom', 0, -60)
    const resized = await read(page)
    await closeByX(page, 'Mouse')
    assertSamePlaces(await read(page), resized, 'Mouse closed', ['Rules'])
  })

  it('reopens a card into an emptied column of a changed layout without covering the Board', async () => {
    opened = await open()
    const { page } = opened
    await closeByX(page, 'Rules')
    await closeByX(page, 'Mouse')
    await dragHeader(page, 'Board', 20, 10)
    await toggleInCardsMenu(page, 'Rules')
    const { cards } = await read(page)
    assert.notEqual(cards.Rules, null, 'Rules is shown')
    assert.equal(boxesMeet(cards.Board, cards.Rules), false, `Rules does not cover the Board: ${JSON.stringify(cards)}`)
  })

  it('reopens a card into its column where the column sits now, after the window changed size while it was closed', async () => {
    opened = await open()
    const { page } = opened
    // Pinned is the column's first card, so its own place from before the resize must not be read as the column's.
    await closeByX(page, 'Pinned')
    await dragHeader(page, 'Board', 20, 10)
    await page.setViewportSize({ width: 1700, height: 1000 })
    const resized = await read(page)
    await toggleInCardsMenu(page, 'Pinned')
    const { cards } = await read(page)
    assert.equal(near(cards.Pinned.x, resized.cards.Mode.x) && near(cards.Pinned.w, resized.cards.Mode.w), true,
      `Pinned is back in the right column: ${JSON.stringify(cards)}`)
  })
})

describe('With cards closed the keys still work', () => {
  let opened
  afterEach(async () => { await opened?.context.close() })

  it('jumps by Z, X, C and V and steps by Tab with Pinned and Mode closed, and pins from a Recent chip', async () => {
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
    await page.keyboard.press('c')
    await waitForTool(page, { mode: 'wall', submode: null }, 'C jumps to pin 3')
    await page.getByRole('region', { name: 'Recent' }).getByRole('button', { name: 'Pin Surface' }).click()
    await page.keyboard.press('v')
    await waitForTool(page, { mode: 'surface', submode: null }, 'V jumps to the pin a Recent chip added')
  })

  it('pins and unpins from the Mode card with Pinned closed', async () => {
    opened = await open()
    const { page } = opened
    await closeByX(page, 'Pinned')
    await setTool(page, { mode: 'surface', submode: null })
    const mode = page.getByRole('region', { name: 'Mode' })
    await mode.getByRole('button', { name: 'Pin Surface' }).click()
    await setTool(page, { mode: 'wall', submode: null })
    await page.keyboard.press('v')
    await waitForTool(page, { mode: 'surface', submode: null }, 'V jumps to the pin the Mode card added')
    await mode.getByRole('button', { name: 'Unpin Surface' }).click()
    await setTool(page, { mode: 'wall', submode: null })
    await page.keyboard.press('Tab')
    await waitForTool(page, { mode: 'sudoku', submode: '1' }, 'Tab wraps past the unpinned tool to pin 1')
  })

  it('opens the shortcut sheet on ? with every card but the Board closed', async () => {
    opened = await open()
    const { page } = opened
    for (const name of CLOSEABLE_CARDS) await closeByX(page, name)
    await page.keyboard.press('?')
    await page.getByRole('dialog', { name: 'Keyboard shortcuts' }).waitFor()
  })
})
