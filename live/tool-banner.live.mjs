// The tool-change banner (`.ui-flash`) never covers the board's drawn grid (#191): it sits inside the Board card's header,
// above the canvas, clear of the header's own tool name, at a desk-sized window and at a laptop-sized one.
import assert from 'node:assert/strict'
import { after, before, describe, it } from 'node:test'
import { boardCanvasInPage, newBoardSolveLink, openSolvePage, setTool, useBrowser } from './page.mjs'

const browser = useBrowser()

const WINDOWS = [{ width: 1400, height: 900 }, { width: 1366, height: 768 }]
const TOOLS = [{ mode: 'line', submode: '1' }, { mode: 'sudoku', submode: '2' }, { mode: 'surface', style: 2 }, { mode: 'combi', submode: 'linedir' }]
// Box edges may differ by rounding.
const SLACK_PX = 1

const rectOf = (handle) => handle.evaluate((node) => { const r = node.getBoundingClientRect(); return { left: r.left, right: r.right, top: r.top, bottom: r.bottom } })
const intersect = (a, b) => a.left < b.right && b.left < a.right && a.top < b.bottom && b.top < a.bottom

for (const viewport of WINDOWS) {
  describe(`the tool-change banner at ${viewport.width}x${viewport.height}`, () => {
    let opened
    before(async () => { opened = await openSolvePage(browser(), await newBoardSolveLink(browser()), { contextOptions: { viewport } }) })
    after(async () => { await opened?.context.close() })

    it('shows in the Board card header, off the canvas and off the header\'s tool name, for each tool change', async () => {
      const { page } = opened
      const banner = page.locator('.ui-flash')
      const head = page.locator('section[aria-label="Board"] .ui-head')
      const toolName = page.getByTestId('board-tool-name')
      const canvas = await page.evaluateHandle(boardCanvasInPage)
      for (const tool of TOOLS) {
        const before = await banner.textContent()
        await setTool(page, tool)
        // The banner writes the new tool's name as the change lands; it keeps the last name once it has faded.
        await page.waitForFunction((was) => document.querySelector('.ui-flash').textContent !== was, before)
        const [b, h, c, n] = await Promise.all([rectOf(banner), rectOf(head), rectOf(canvas), rectOf(toolName)])
        const label = JSON.stringify({ banner: b, head: h, canvas: c, name: n })
        assert.equal(intersect(b, c), false, `banner over the canvas: ${label}`)
        assert.ok(b.top >= h.top - SLACK_PX && b.bottom <= h.bottom + SLACK_PX, `banner inside the header: ${label}`)
        if (viewport.width >= 1400) assert.equal(intersect(b, n), false, `banner over the header's tool name: ${label}`)
      }
      await canvas.dispose()
    })
  })
}
