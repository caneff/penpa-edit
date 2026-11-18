// The stream fit on solve.html (#314): the desk announces it, and a request with a board box and a side box puts the board's ink in
// the board box and the Mode, Pinned and Mouse cards in the side box. The test plays the stream userscript's part through the
// page-level contract only (STREAM-FIT.md): the announcement, a request and the reply. The reply rect is checked against
// the board's pixels in a screenshot, the cards against their boxes, and the kept layout against its text in localStorage.
import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { linkFromNewBoard, openSolvePage, resetLayoutInSettings, useBrowser } from './page.mjs'
import { settle } from './settle.mjs'
import { IMPORTS } from './tier-c-puzzles.mjs'

const browser = useBrowser()

// The contract's names (STREAM-FIT.md).
const READY = 'chinstrap:stream-fit-ready'
const REQUEST = 'chinstrap:stream-fit'
const REPLY = 'chinstrap:stream-fit-rect'
const LAYOUT_KEY = 'chinstrap-solve-layout-v1'

// The boxes of a 1400 x 900 window under the top bar: the board's, and the side's beside it.
const BOARD_BOX = { left: 40, top: 100, width: 760, height: 700 }
const SIDE_BOX = { left: 840, top: 100, width: 380, height: 700 }
// One cell step moves the ink by about this much, so the limiting side of a fit ends within it of the box.
const FIT_SLACK_PX = 16
// Where the screenshot's edges and the reply may differ: the antialiased edge of a line.
const PIXEL_SLACK_PX = 3

let sudokuLink
const openSudoku = async () => {
  sudokuLink ??= await linkFromNewBoard(browser(), (url) => {
    import_url(url)
    const link = pu.maketext_solve()
    return link.slice(link.indexOf('#'))
  }, IMPORTS['sudoku-9x9'])
  return openSolvePage(browser(), sudokuLink, {
    served: true,
    // The window messages the page sends, kept from before its scripts run.
    setup: (context) => context.addInitScript(() => {
      window.messagesSeen = []
      window.addEventListener('message', (event) => window.messagesSeen.push(event.data))
    })
  })
}

const messages = (page, type) => page.evaluate((t) => window.messagesSeen.filter((m) => m?.type === t), type)
const replies = (page) => messages(page, REPLY)

// Sends a request as the userscript would, and returns the reply that followed, once no further reply is coming.
async function request (page, board = BOARD_BOX, side = SIDE_BOX) {
  const before = (await replies(page)).length
  await page.evaluate(([type, b, s]) => window.postMessage({ type, board: b, side: s }, '*'), [REQUEST, board, side])
  return latestReply(page, before)
}

async function latestReply (page, before) {
  const count = await settle(async () => (await replies(page)).length > before, true)
  assert.equal(count, true, 'the desk replied')
  let last = null
  await settle(async () => {
    const all = await replies(page)
    const now = JSON.stringify(all[all.length - 1])
    const same = now === last
    last = now
    return same
  }, true)
  return JSON.parse(last).rect
}

// Runs in the page: the box of each shown card by its title.
function cardBoxesInPage () {
  const boxes = {}
  document.querySelectorAll('section.ui-card').forEach((node) => {
    const box = node.getBoundingClientRect()
    if (box.width > 0 && box.height > 0) {
      boxes[node.getAttribute('aria-label')] = { left: box.left, top: box.top, right: box.right, bottom: box.bottom }
    }
  })
  return boxes
}

const meets = (p, q) => p.left < q.right && q.left < p.right && p.top < q.bottom && q.top < p.bottom
const inside = (inner, outer) => inner.left >= outer.left - 1 && inner.top >= outer.top - 1 && inner.right <= outer.right + 1 && inner.bottom <= outer.bottom + 1
const asEdges = ({ left, top, width, height }) => ({ left, top, right: left + width, bottom: top + height })

// The dark pixels' bounding box in a screenshot of `box`, in the page's CSS px: read from the picture, not from the page's geometry.
async function inkInScreenshot (page, box) {
  const png = await page.screenshot({ clip: { x: box.left, y: box.top, width: box.width, height: box.height } })
  return page.evaluate(async ([base64, origin]) => {
    const bitmap = await createImageBitmap(await (await fetch(`data:image/png;base64,${base64}`)).blob())
    const canvas = new OffscreenCanvas(bitmap.width, bitmap.height)
    const context = canvas.getContext('2d')
    context.drawImage(bitmap, 0, 0)
    const { data, width, height } = context.getImageData(0, 0, bitmap.width, bitmap.height)
    let left = width
    let top = height
    let right = -1
    let bottom = -1
    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        const i = (y * width + x) * 4
        if (data[i] + data[i + 1] + data[i + 2] < 3 * 110) {
          left = Math.min(left, x)
          right = Math.max(right, x)
          top = Math.min(top, y)
          bottom = Math.max(bottom, y)
        }
      }
    }
    return { left: origin.left + left, top: origin.top + top, right: origin.left + right + 1, bottom: origin.top + bottom + 1 }
  }, [png.toString('base64'), box])
}

// Asserts the reply is the ink the screenshot of the board box shows.
async function assertRectIsDrawnInk (page, rect, box = BOARD_BOX) {
  const drawn = await inkInScreenshot(page, box)
  const want = asEdges(rect)
  for (const side of ['left', 'top', 'right', 'bottom']) {
    assert.ok(Math.abs(drawn[side] - want[side]) <= PIXEL_SLACK_PX, `the reply's ${side} (${want[side]}) is the drawn ink's (${drawn[side]})`)
  }
}

describe('the desk announces the stream fit', () => {
  it('sets a marker on the page and sends a ready message', async () => {
    const { context, page } = await openSudoku()
    try {
      assert.equal(await settle(() => page.evaluate(() => document.documentElement.dataset.streamFit), 'ready'), 'ready')
      assert.equal((await messages(page, READY)).length, 1)
    } finally {
      await context.close()
    }
  })
})

describe('a stream fit request', () => {
  it('fills the board box with the board\'s ink on its limiting side, and replies with the ink drawn', async () => {
    const { context, page } = await openSudoku()
    try {
      const rect = await request(page)
      const ink = asEdges(rect)
      assert.ok(inside(ink, asEdges(BOARD_BOX)), `the ink ${JSON.stringify(rect)} is inside the board box`)
      const limiting = Math.max(rect.width - BOARD_BOX.width, rect.height - BOARD_BOX.height)
      assert.ok(limiting <= 1 && limiting >= -FIT_SLACK_PX, `the ink fills a side of the box (${JSON.stringify(rect)})`)
      await assertRectIsDrawnInk(page, rect)
    } finally {
      await context.close()
    }
  })

  it('puts Mode, Pinned and Mouse in the side box, and no other card over the board box', async () => {
    const { context, page } = await openSudoku()
    try {
      await request(page)
      const cards = await page.evaluate(cardBoxesInPage)
      for (const title of ['Mode', 'Pinned', 'Mouse']) {
        assert.ok(cards[title], `${title} is shown`)
        assert.ok(inside(cards[title], asEdges(SIDE_BOX)), `${title} ${JSON.stringify(cards[title])} is in the side box`)
      }
      const board = asEdges(BOARD_BOX)
      const over = Object.entries(cards).filter(([title, box]) => title !== 'Board' && meets(box, board)).map(([title]) => title)
      assert.deepEqual(over, [], 'no card but the board is over the board box')
      assert.ok(!cards.Rules, 'the Rules card is not on the desk')
      assert.ok(inside(cards.Board, board) && inside(board, cards.Board), `the Board card is the board box (${JSON.stringify(cards.Board)})`)
    } finally {
      await context.close()
    }
  })

  it('shows nothing but the board in the board box', async () => {
    const { context, page } = await openSudoku()
    try {
      await request(page)
      const hit = await page.evaluate(({ left, top, width, height }) => {
        const found = new Set()
        for (let x = left + 2; x < left + width; x += 20) {
          for (let y = top + 2; y < top + height; y += 20) {
            found.add(document.elementFromPoint(x, y)?.closest('section.ui-card, header.ui-bar')?.getAttribute('aria-label') ?? 'none')
          }
        }
        return [...found]
      }, BOARD_BOX)
      assert.deepEqual(hit, ['Board'], 'only the Board card is at the box\'s points')
    } finally {
      await context.close()
    }
  })
})

describe('the reply after a change', () => {
  it('comes again when the window is resized, with the ink that is then drawn', async () => {
    const { context, page } = await openSudoku()
    try {
      const first = await request(page)
      const before = (await replies(page)).length
      // The window loses the bottom of the board box.
      await page.setViewportSize({ width: 1400, height: 700 })
      const second = await latestReply(page, before)
      assert.notDeepEqual(second, first, 'the board is smaller in the smaller window')
      const desk = await page.evaluate(() => document.querySelector('.ui-desk').getBoundingClientRect().toJSON())
      assert.ok(second.top + second.height <= desk.bottom + 1, 'the ink is inside the window')
      await assertRectIsDrawnInk(page, second, { ...BOARD_BOX, height: desk.bottom - BOARD_BOX.top })
    } finally {
      await context.close()
    }
  })

  it('comes again when the puzzle changes size, with the ink where the board now draws it', async () => {
    const { context, page } = await openSudoku()
    try {
      await request(page)
      const before = (await replies(page)).length
      // The Board card's header, with its Change size button, is not on the desk while the stream fit is on. A blank column on
      // the left moves the grid right by a cell, which only a new reply can follow.
      await page.evaluate(() => engine.changeSize('left', 1))
      const rect = await latestReply(page, before)
      await assertRectIsDrawnInk(page, rect)
      assert.ok(inside(asEdges(rect), asEdges(BOARD_BOX)), `the ink ${JSON.stringify(rect)} is still in the board box`)
    } finally {
      await context.close()
    }
  })

  it('comes again for a new request with other boxes', async () => {
    const { context, page } = await openSudoku()
    try {
      await request(page)
      const smaller = { left: 100, top: 120, width: 400, height: 400 }
      const rect = await request(page, smaller, { left: 540, top: 120, width: 360, height: 640 })
      assert.ok(inside(asEdges(rect), asEdges(smaller)))
      await assertRectIsDrawnInk(page, rect, smaller)
    } finally {
      await context.close()
    }
  })
})

describe('the kept layout', () => {
  it('is untouched by a stream fit, and a reload without the request opens the solver\'s own places', async () => {
    const { context, page } = await openSudoku()
    try {
      // The solver moves the Mode card, which keeps a layout.
      const head = await page.locator('section[aria-label="Mode"] .ui-head').boundingBox()
      await page.mouse.move(head.x + 20, head.y + head.height / 2)
      await page.mouse.down()
      await page.mouse.move(head.x - 60, head.y + 120, { steps: 5 })
      await page.mouse.up()
      const keptText = () => page.evaluate((key) => localStorage.getItem(key), LAYOUT_KEY)
      const kept = await settle(keptText, await keptText())
      assert.notEqual(kept, null, 'the move kept a layout')
      const own = (await page.evaluate(cardBoxesInPage)).Mode

      await request(page)
      await page.setViewportSize({ width: 1400, height: 700 })
      await request(page)
      assert.equal(await keptText(), kept, 'the kept layout is byte-identical after the stream fit')

      // The solver moving a card and pressing Reset layout during the stream fit reach neither the kept layout.
      const pins = await page.locator('section[aria-label="Pinned"] .ui-head').boundingBox()
      await page.mouse.move(pins.x + 20, pins.y + pins.height / 2)
      await page.mouse.down()
      await page.mouse.move(pins.x + 20, pins.y + 150, { steps: 5 })
      await page.mouse.up()
      await resetLayoutInSettings(page)
      assert.equal(await keptText(), kept, 'a move and Reset layout during the stream fit leave the kept layout as it was')

      await page.setViewportSize({ width: 1400, height: 900 })
      await page.reload()
      await page.getByRole('region', { name: 'Board' }).waitFor()
      await page.evaluate(() => engine.ready)
      assert.equal(await settle(async () => JSON.stringify((await page.evaluate(cardBoxesInPage)).Mode), JSON.stringify(own)), JSON.stringify(own), 'the Mode card is where the solver put it')
      assert.equal(await keptText(), kept)
    } finally {
      await context.close()
    }
  })
})
