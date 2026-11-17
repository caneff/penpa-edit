// The tool-change banner (`.ui-flash`) sits on the board's grid, centred near its top, never at its centre (#254). It takes no
// click, takes the tool's pin colour, and stays on the visible part of a zoomed, scrolled board.
import assert from 'node:assert/strict'
import { after, before, describe, it } from 'node:test'
import { boardCanvasInPage, ICEBREAKER, linkFromNewBoard, openSolvePage, puzzleSolveLinkInPage, setTool, solveLinkOfImport, useBrowser } from './page.mjs'
import { IMPORTS } from './tier-c-puzzles.mjs'

const browser = useBrowser()

const LAPTOP = { width: 1366, height: 768 }
const TOOLS = [{ mode: 'line', submode: '1' }, { mode: 'sudoku', submode: '2' }, { mode: 'surface', style: 2 }, { mode: 'combi', submode: 'linedir' }]
const PUZZLES = {
  'sudoku-9x9': (b) => solveLinkOfImport(b, IMPORTS['sudoku-9x9']),
  Icebreaker: (b) => linkFromNewBoard(b, puzzleSolveLinkInPage, ICEBREAKER)
}
// Box edges may differ by rounding.
const SLACK_PX = 1
const ZOOM_STEPS = 10

// Runs in the page: the banner's box, the board canvas's, the Board card body's visible part, the banner's colour and the
// card's current tool colour, and what the pointer would hit at the banner's centre (null off the page).
function readBannerInPage (canvasNode) {
  const box = (node) => { const r = node.getBoundingClientRect(); return { left: r.left, right: r.right, top: r.top, bottom: r.bottom } }
  const banner = document.querySelector('.ui-flash')
  const b = box(banner)
  const hit = document.elementFromPoint((b.left + b.right) / 2, (b.top + b.bottom) / 2)
  const body = document.querySelector('section[aria-label="Board"] .ui-body')
  const view = body.getBoundingClientRect()
  return {
    banner: b,
    canvas: box(canvasNode),
    hit: hit === null ? null : hit === banner ? 'banner' : hit.tagName.toLowerCase(),
    view: { left: view.left + body.clientLeft, right: view.left + body.clientLeft + body.clientWidth, top: view.top + body.clientTop, bottom: view.top + body.clientTop + body.clientHeight },
    colour: banner.style.getPropertyValue('--ui-flash-colour'),
    toolColour: document.querySelector('section[aria-label="Board"]').style.getPropertyValue('--ui-tool-colour'),
    inHead: Boolean(document.querySelector('section[aria-label="Board"] .ui-head .ui-flash'))
  }
}
async function readBanner (page) {
  const canvas = await page.evaluateHandle(boardCanvasInPage)
  try {
    return await page.evaluate(readBannerInPage, canvas)
  } finally {
    await canvas.dispose()
  }
}

const within = (inner, outer) => inner.left >= outer.left - SLACK_PX && inner.right <= outer.right + SLACK_PX && inner.top >= outer.top - SLACK_PX && inner.bottom <= outer.bottom + SLACK_PX
const centreX = (r) => (r.left + r.right) / 2

async function changeTool (page, tool) {
  const before = await page.locator('.ui-flash').textContent()
  await setTool(page, tool)
  // The banner writes the new tool's name as the change lands; it keeps the last name once it has faded.
  await page.waitForFunction((was) => document.querySelector('.ui-flash').textContent !== was, before)
}

function assertTopOfBoard (read) {
  const label = JSON.stringify(read)
  const { banner, canvas } = read
  assert.equal(within(banner, canvas), true, `banner inside the board: ${label}`)
  assert.equal((banner.top + banner.bottom) / 2 <= canvas.top + (canvas.bottom - canvas.top) / 4, true, `banner centre in the board's top quarter: ${label}`)
  assert.equal(Math.abs(centreX(banner) - centreX(canvas)) <= SLACK_PX, true, `banner centred across the board: ${label}`)
  assert.equal(read.inHead, false, `banner in the Board header: ${label}`)
}

for (const [name, linkOf] of Object.entries(PUZZLES)) {
  describe(`the tool-change banner on ${name} at ${LAPTOP.width}x${LAPTOP.height}`, () => {
    let opened
    before(async () => { opened = await openSolvePage(browser(), await linkOf(browser()), { contextOptions: { viewport: LAPTOP } }) })
    after(async () => { await opened?.context.close() })

    it('shows inside the board, centred in its top quarter, and out of the Board header, for each tool change', async () => {
      for (const tool of TOOLS) {
        await changeTool(opened.page, tool)
        assertTopOfBoard(await readBanner(opened.page))
      }
    })

    it('has the board, not the banner, under the pointer at its centre', async () => {
      await changeTool(opened.page, TOOLS[1])
      const read = await readBanner(opened.page)
      assert.equal(read.hit, 'canvas', JSON.stringify(read))
    })

    it('takes the pin colour of a pinned tool and the neutral colour of an unpinned one', async () => {
      const { page } = opened
      await page.evaluate(() => window.pinBoard.replace([{ mode: 'line', submode: '1', style: null }]))
      await changeTool(page, TOOLS[2])
      const unpinned = await readBanner(page)
      await changeTool(page, TOOLS[0])
      const pinned = await readBanner(page)
      assert.equal(pinned.colour, pinned.toolColour, JSON.stringify(pinned))
      assert.equal(unpinned.colour, unpinned.toolColour, JSON.stringify(unpinned))
      assert.notEqual(pinned.colour, unpinned.colour, 'a pinned tool and an unpinned one differ in colour')
    })

    it('stays on the visible part of a zoomed board, scrolled to each far corner', async () => {
      const { page } = opened
      const zoomIn = page.getByRole('button', { name: 'Zoom in' })
      // The button disables at the zoom limit.
      for (let step = 0; step < ZOOM_STEPS && await zoomIn.isEnabled(); step++) await zoomIn.click()
      for (const { corner, tool } of [{ corner: { x: 1, y: 1 }, tool: TOOLS[3] }, { corner: { x: 0, y: 0 }, tool: TOOLS[1] }]) {
        await page.evaluate(({ x, y }) => {
          const body = document.querySelector('section[aria-label="Board"] .ui-body')
          body.scrollLeft = x * body.scrollWidth
          body.scrollTop = y * body.scrollHeight
        }, corner)
        await changeTool(page, tool)
        const read = await readBanner(page)
        const label = JSON.stringify(read)
        assert.equal(within(read.banner, read.view), true, `banner inside the card body's visible part: ${label}`)
        assert.equal(within(read.banner, read.canvas), true, `banner on the board: ${label}`)
        assert.equal(read.canvas.left < read.view.left - SLACK_PX || read.canvas.right > read.view.right + SLACK_PX, true, `the board overflows the view: ${label}`)
        const shown = { left: Math.max(read.view.left, read.canvas.left), right: Math.min(read.view.right, read.canvas.right) }
        assert.equal(Math.abs(centreX(read.banner) - centreX(shown)) <= SLACK_PX, true, `banner centred across the board's visible part: ${label}`)
      }
    })
  })
}

describe('the tool-change banner with board coordinates on', () => {
  it('sits on the grid, centred, not over the coordinate bands', async () => {
    const { context, page } = await openSolvePage(browser(), await solveLinkOfImport(browser(), IMPORTS['sudoku-9x9']), { contextOptions: { viewport: LAPTOP } })
    await page.getByRole('button', { name: 'Settings' }).click()
    await page.getByRole('dialog', { name: 'Settings' }).waitFor()
    await page.locator('wa-switch').filter({ has: page.getByRole('switch', { name: 'Show board coordinates' }) }).click()
    await page.keyboard.press('Escape')
    await page.getByRole('dialog', { name: 'Settings' }).waitFor({ state: 'hidden' })
    await changeTool(page, TOOLS[1])
    assertTopOfBoard(await readBanner(page))
    await context.close()
  })
})
