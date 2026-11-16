// The desk of `solve.html` (#101): every card moves and resizes, the layout is kept across reloads and puzzles' shared,
// every card stays inside the window, and the board refits its card or zooms inside it. The UI is found by role and
// accessible name or test id; the board's size is what its canvas draws.
import assert from 'node:assert/strict'
import { afterEach, beforeEach, describe, it } from 'node:test'
import { AKARI_SOLVE, boardAgainstCard, openSolvePage, useBrowser } from './page.mjs'
import { settle } from './settle.mjs'

const browser = useBrowser()

const CARDS = ['Board', 'Mouse', 'Rules', 'Pinned', 'Mode', 'Recent']

const card = (page, name) => page.getByRole('region', { name })

async function boxOf (page, name) {
  const box = await card(page, name).boundingBox()
  return { x: Math.round(box.x), y: Math.round(box.y), width: Math.round(box.width), height: Math.round(box.height) }
}

async function drag (page, from, dx, dy) {
  await page.mouse.move(from.x, from.y)
  await page.mouse.down()
  await page.mouse.move(from.x + dx, from.y + dy, { steps: 5 })
  await page.mouse.up()
}

async function headCentre (page, name) {
  const box = await card(page, name).getByRole('heading', { name }).boundingBox()
  return { x: box.x + box.width / 2, y: box.y + box.height / 2 }
}

async function handleCentre (page, name, handle = 'bottom-right') {
  const box = await card(page, name).getByTestId(`resize-${handle}`).boundingBox()
  return { x: box.x + box.width / 2, y: box.y + box.height / 2 }
}

// The cards that stick out of the window, by name.
async function cardsOutside (page) {
  const size = page.viewportSize()
  const outside = []
  for (const name of CARDS) {
    const box = await boxOf(page, name)
    if (box.x < 0 || box.y < 0 || box.x + box.width > size.width || box.y + box.height > size.height) outside.push(name)
  }
  return outside
}

describe('the desk', () => {
  let opened
  let page
  beforeEach(async () => {
    opened = await openSolvePage(browser(), AKARI_SOLVE)
    page = opened.page
    await settle(async () => (await boardAgainstCard(page)).inside, true)
  })
  afterEach(async () => { await opened?.context.close() })

  it('keeps a moved and resized card after a reload, and Reset layout puts it back', async () => {
    const start = await boxOf(page, 'Rules')
    await drag(page, await headCentre(page, 'Rules'), 120, 70)
    await drag(page, await handleCentre(page, 'Rules'), 40, 30)
    const changed = await boxOf(page, 'Rules')
    assert.notDeepEqual(changed, start)
    assert.equal(changed.x, start.x + 120)
    assert.equal(changed.y, start.y + 70)

    await page.reload()
    await card(page, 'Rules').waitFor()
    assert.deepEqual(await settle(() => boxOf(page, 'Rules'), changed), changed)

    await page.getByRole('button', { name: 'Reset layout' }).click()
    assert.deepEqual(await settle(() => boxOf(page, 'Rules'), start), start)
  })

  // Each handle with the drag (dx, dy) that makes the card bigger, and the card's edges that stay where they are.
  const HANDLE_DRAGS = [
    { handle: 'top', dx: 0, dy: -40, fixed: ['right', 'bottom', 'left'] },
    { handle: 'left', dx: -40, dy: 0, fixed: ['right', 'bottom', 'top'] },
    { handle: 'top-left', dx: -40, dy: -30, fixed: ['right', 'bottom'] },
    { handle: 'top-right', dx: 40, dy: -30, fixed: ['left', 'bottom'] },
    { handle: 'bottom-left', dx: -40, dy: 30, fixed: ['right', 'top'] }
  ]
  const edgeOf = (box, edge) => ({ left: box.x, top: box.y, right: box.x + box.width, bottom: box.y + box.height })[edge]

  for (const { handle, dx, dy, fixed } of HANDLE_DRAGS) {
    it(`resizes the Rules card from its ${handle} handle, keeps the size after a reload`, async () => {
      // Moved clear of the desk's edges first, so every handle has room to grow into.
      await drag(page, await headCentre(page, 'Rules'), 80, 60)
      const start = await boxOf(page, 'Rules')
      await drag(page, await handleCentre(page, 'Rules', handle), dx, dy)
      const grown = await boxOf(page, 'Rules')
      assert.equal(grown.width, start.width + Math.abs(dx))
      assert.equal(grown.height, start.height + Math.abs(dy))
      for (const edge of fixed) assert.equal(edgeOf(grown, edge), edgeOf(start, edge), `${edge} edge stays`)

      await page.reload()
      await card(page, 'Rules').waitFor()
      assert.deepEqual(await settle(() => boxOf(page, 'Rules'), grown), grown)
    })
  }

  it('keeps the place of a card resized from its top edge that was never moved', async () => {
    await drag(page, await handleCentre(page, 'Rules', 'top'), 0, -30)
    const grown = await boxOf(page, 'Rules')
    await page.reload()
    await card(page, 'Rules').waitFor()
    assert.deepEqual(await settle(() => boxOf(page, 'Rules'), grown), grown)
  })

  it('leaves the Board card\'s Fit button clickable at its right end, under the top-right handle', async () => {
    const fit = await card(page, 'Board').getByRole('button', { name: 'Fit' }).boundingBox()
    const handle = await card(page, 'Board').getByTestId('resize-top-right').boundingBox()
    assert.equal(handle.x >= fit.x + fit.width, true, `handle starts at ${handle.x}, the button ends at ${fit.x + fit.width}`)
  })

  it('stops the top and left handles at the minimum size and at the desk edge', async () => {
    const start = await boxOf(page, 'Rules')
    await drag(page, await handleCentre(page, 'Rules', 'top-left'), 2000, 2000)
    const shrunk = await boxOf(page, 'Rules')
    assert.equal(shrunk.width, 200, 'minimum width')
    assert.equal(shrunk.height, 80, 'minimum height')
    assert.equal(shrunk.x + shrunk.width, start.x + start.width)
    assert.equal(shrunk.y + shrunk.height, start.y + start.height)

    await drag(page, await handleCentre(page, 'Rules', 'top-left'), -3000, -3000)
    const widest = await boxOf(page, 'Rules')
    const desk = await page.locator('.ui-desk').boundingBox()
    assert.equal(widest.x, Math.round(desk.x), 'left edge stops at the desk')
    assert.equal(widest.y, Math.round(desk.y), 'top edge stops at the desk')
  })

  it('still moves the card by its title bar below the top strip', async () => {
    const start = await boxOf(page, 'Rules')
    await drag(page, await headCentre(page, 'Rules'), 50, 40)
    assert.deepEqual(await boxOf(page, 'Rules'), { ...start, x: start.x + 50, y: start.y + 40 })
  })

  // The key the desk keeps its layout under: the stored value with a card's entry in it.
  const layoutKey = () => page.evaluate(() => Object.keys(localStorage).find((key) => {
    try {
      return typeof JSON.parse(localStorage.getItem(key))?.rules === 'object'
    } catch (e) {
      return false
    }
  }))

  it('treats a kept layout it did not write as none', async () => {
    const start = await boxOf(page, 'Rules')
    await drag(page, await headCentre(page, 'Rules'), 120, 70)
    const key = await layoutKey()
    assert.equal(typeof key, 'string', 'the moved card is kept')

    // A width that would show, beside a height that is no number: the entry is another version's, so none of it is read.
    await page.evaluate(([k, w]) => localStorage.setItem(k, JSON.stringify({ rules: { w, h: null } })), [key, start.width + 200])
    await page.reload()
    await card(page, 'Rules').waitFor()
    assert.deepEqual(await settle(() => boxOf(page, 'Rules'), start), start, 'an entry with a value that is no number')

    const warnings = []
    page.on('console', (m) => { if (m.type() === 'warning') warnings.push(m.text()) })
    await page.evaluate((k) => localStorage.setItem(k, '{"rules":'), key)
    await page.reload()
    await card(page, 'Rules').waitFor()
    assert.deepEqual(await settle(() => boxOf(page, 'Rules'), start), start, 'a value that is no JSON')
    assert.equal(warnings.some((w) => w.includes(key) && w.includes('unreadable')), true, `the console says the layout was unreadable: ${warnings}`)
  })

  it('keeps every card inside the window after it shrinks', async () => {
    await drag(page, await headCentre(page, 'Rules'), 300, 400)
    for (const size of [{ width: 800, height: 520 }, { width: 640, height: 420 }]) {
      await page.setViewportSize(size)
      assert.deepEqual(await settle(() => cardsOutside(page), []), [], `in ${size.width}x${size.height}`)
    }
  })

  it('refits the board when its card resizes, and + then − zooms it with the card scrolling', async () => {
    await drag(page, await handleCentre(page, 'Board'), -200, -150)
    const fitted = await settle(async () => { const r = await boardAgainstCard(page); return r.inside }, true)
    assert.equal(fitted, true, 'the smaller card still holds the whole board')
    const small = await boardAgainstCard(page)
    assert.ok(small.cardW < 900)

    const scrolls = () => page.evaluate(() => {
      const body = document.querySelector('section[aria-label="Board"] .ui-body')
      return body.scrollWidth > body.clientWidth || body.scrollHeight > body.clientHeight
    })
    assert.equal(await scrolls(), false)
    const zoomIn = page.getByRole('button', { name: 'Zoom in' })
    await zoomIn.click()
    await zoomIn.click()
    const bigger = await settle(async () => (await boardAgainstCard(page)).w > small.w, true)
    assert.equal(bigger, true, 'the board grows')
    assert.equal(await scrolls(), true, 'the card scrolls')
    const grown = (await boardAgainstCard(page)).w

    await page.getByRole('button', { name: 'Zoom out' }).click()
    assert.equal(await settle(async () => { const w = (await boardAgainstCard(page)).w; return w < grown && w > small.w }, true), true)
  })
})
