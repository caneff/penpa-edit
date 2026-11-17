// The tool-change banner (`.ui-flash`) sits on the board, centred near its top, never at its centre (#254, which moved it off
// the Board card's header, #191). It takes no click, and it stays on the visible part of a zoomed, scrolled board.
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


// The banner's box, the board canvas's, and what the pointer would hit at the banner's centre.
const readBanner = (page) => page.evaluate((canvasInPage) => {
  const box = (node) => { const r = node.getBoundingClientRect(); return { left: r.left, right: r.right, top: r.top, bottom: r.bottom } }
  const banner = document.querySelector('.ui-flash')
  const b = box(banner)
  const hit = document.elementFromPoint((b.left + b.right) / 2, (b.top + b.bottom) / 2)
  const body = document.querySelector('section[aria-label="Board"] .ui-body')
  const view = body.getBoundingClientRect()
  return { banner: b, canvas: box(new Function(`return (${canvasInPage})()`)()), hit: hit === banner ? 'banner' : hit.tagName.toLowerCase(), view: { left: view.left, right: view.right, top: view.top, bottom: view.bottom }, inHead: Boolean(document.querySelector('section[aria-label="Board"] .ui-head .ui-flash')) }
}, boardCanvasInPage.toString())

const within = (inner, outer) => inner.left >= outer.left - SLACK_PX && inner.right <= outer.right + SLACK_PX && inner.top >= outer.top - SLACK_PX && inner.bottom <= outer.bottom + SLACK_PX

async function changeTool (page, tool) {
  const before = await page.locator('.ui-flash').textContent()
  await setTool(page, tool)
  // The banner writes the new tool's name as the change lands; it keeps the last name once it has faded.
  await page.waitForFunction((was) => document.querySelector('.ui-flash').textContent !== was, before)
}

for (const [name, linkOf] of Object.entries(PUZZLES)) {
  describe(`the tool-change banner on ${name} at ${LAPTOP.width}x${LAPTOP.height}`, () => {
    let opened
    before(async () => { opened = await openSolvePage(browser(), await linkOf(browser()), { contextOptions: { viewport: LAPTOP } }) })
    after(async () => { await opened?.context.close() })

    it('shows inside the board, centred in its top quarter, and out of the Board header, for each tool change', async () => {
      const { page } = opened
      for (const tool of TOOLS) {
        await changeTool(page, tool)
        const read = await readBanner(page)
        const label = JSON.stringify(read)
        const { banner, canvas } = read
        assert.equal(within(banner, canvas), true, `banner inside the board: ${label}`)
        const centreY = (banner.top + banner.bottom) / 2
        assert.equal(centreY <= canvas.top + (canvas.bottom - canvas.top) / 4, true, `banner centre in the board's top quarter: ${label}`)
        assert.equal(Math.abs((banner.left + banner.right) / 2 - (canvas.left + canvas.right) / 2) <= SLACK_PX, true, `banner centred across the board: ${label}`)
        assert.equal(read.inHead, false, `banner in the Board header: ${label}`)
      }
    })

    it('lets a click through to the board', async () => {
      const { page } = opened
      await changeTool(page, TOOLS[1])
      const read = await readBanner(page)
      assert.equal(read.hit, 'canvas', JSON.stringify(read))
    })

    it('stays on the visible part of a zoomed, scrolled board', async () => {
      const { page } = opened
      const zoomIn = page.getByRole('button', { name: 'Zoom in' })
      for (let step = 0; step < 4; step++) await zoomIn.click()
      await page.evaluate(() => {
        const body = document.querySelector('section[aria-label="Board"] .ui-body')
        body.scrollLeft = body.scrollWidth
        body.scrollTop = body.scrollHeight
      })
      await changeTool(page, TOOLS[0])
      const read = await readBanner(page)
      assert.equal(within(read.banner, read.view), true, `banner inside the card body's visible part: ${JSON.stringify(read)}`)
      assert.equal(within(read.banner, read.canvas), true, `banner on the board: ${JSON.stringify(read)}`)
    })
  })
}
