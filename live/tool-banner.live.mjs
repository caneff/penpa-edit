// The tool-change banner (`.ui-flash`) never covers the board's drawn grid (#191): it sits in the Board card's header,
// above the canvas, whichever tool it names and whatever the window's size.
import assert from 'node:assert/strict'
import { after, before, describe, it } from 'node:test'
import { boardCanvasInPage, newBoardSolveLink, openSolvePage, setTool, useBrowser } from './page.mjs'
import { settle } from './settle.mjs'

const browser = useBrowser()

// The banner's box and the board canvas's box, in CSS px, read while the banner is showing.
const boxes = (page) => page.evaluate((canvasSource) => {
  const rect = (node) => { const r = node.getBoundingClientRect(); return { left: r.left, right: r.right, top: r.top, bottom: r.bottom, width: r.width } }
  const canvas = new Function(`return (${canvasSource})()`)()
  return { banner: rect(document.querySelector('.ui-flash')), canvas: rect(canvas), text: document.querySelector('.ui-flash').textContent }
}, boardCanvasInPage.toString())

const intersect = (a, b) => a.left < b.right && b.left < a.right && a.top < b.bottom && b.top < a.bottom

describe('the tool-change banner', () => {
  let opened
  before(async () => { opened = await openSolvePage(browser(), await newBoardSolveLink(browser())) })
  after(async () => { await opened?.context.close() })

  it('stays off the board canvas for each tool change', async () => {
    const { page } = opened
    for (const tool of [{ mode: 'line', submode: '1' }, { mode: 'sudoku', submode: '2' }, { mode: 'surface', style: 2 }, { mode: 'combi', submode: 'linedir' }]) {
      await setTool(page, tool)
      await settle(async () => (await boxes(page)).text.length > 0, true)
      const seen = await boxes(page)
      assert.ok(seen.banner.width > 0, 'the banner has a box')
      assert.equal(intersect(seen.banner, seen.canvas), false, `banner ${JSON.stringify(seen.banner)} over canvas ${JSON.stringify(seen.canvas)}`)
    }
  })
})
