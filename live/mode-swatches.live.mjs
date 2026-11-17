// The Mode card's colour swatches (#236): every swatch's digit reads against its fill at 1366x768 in both themes, and the swatches
// grow with the desk-wide text scale (#199) from 1366x768 to 2560x1440. Colours are read from the page's computed styles.
import assert from 'node:assert/strict'
import { before, after, describe, it } from 'node:test'
import { newBoardSolveLink, openSolvePage, setTool, useBrowser } from './page.mjs'
import { settle } from './settle.mjs'

const browser = useBrowser()

const WCAG_AA_TEXT = 4.5
const LAPTOP = { width: 1366, height: 768 }
const HUGE = { width: 2560, height: 1440 }
// A swatch that grows with the desk at least this far (the desk's scale is 1.5 at 2560x1440 as built).
const MIN_GROWTH = 1.3

// Runs in the page: each Surface swatch's digit and fill as [r, g, b] with its WCAG contrast ratio.
function swatchContrastsInPage () {
  const channel = (c) => { const s = c / 255; return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4 }
  const luminance = ([r, g, b]) => 0.2126 * channel(r) + 0.7152 * channel(g) + 0.0722 * channel(b)
  const parse = (css) => {
    const c = document.createElement('canvas').getContext('2d')
    c.fillStyle = css
    c.fillRect(0, 0, 1, 1)
    return [...c.getImageData(0, 0, 1, 1).data].slice(0, 3)
  }
  const ratio = (a, b) => { const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x); return (hi + 0.05) / (lo + 0.05) }
  return [...document.querySelectorAll('.ui-stylebtn')].filter((b) => b.querySelector('.ui-swatch') && b.querySelector('text')).map((b) => {
    const digit = b.querySelector('text')
    const fill = getComputedStyle(b.querySelector('.ui-swatch')).fill
    return { name: b.getAttribute('aria-label'), ratio: ratio(parse(getComputedStyle(digit).fill), parse(fill)), outlined: getComputedStyle(digit).stroke !== 'none' }
  })
}

const swatchWidth = (page) => page.evaluate(() => document.querySelector('.ui-stylebtn:has(.ui-swatch)').getBoundingClientRect().width)

describe('the Mode card swatches', () => {
  let opened
  before(async () => {
    opened = await openSolvePage(browser(), await newBoardSolveLink(browser(), ['Surface']))
    await setTool(opened.page, { mode: 'surface' })
  })
  after(async () => { await opened?.context.close() })

  for (const theme of ['light', 'dark']) {
    it(`prints every digit at ${WCAG_AA_TEXT}:1 or better against its swatch in the ${theme} theme at 1366x768, with no outline`, async () => {
      const { page } = opened
      await page.setViewportSize(LAPTOP)
      await page.evaluate((t) => engine.setTheme(t), theme)
      await settle(() => page.evaluate(() => document.documentElement.classList.contains('wa-dark')), theme === 'dark')
      await page.addScriptTag({ content: `window.__swatches = ${swatchContrastsInPage}` })
      const swatches = await page.evaluate(() => window.__swatches())
      assert.ok(swatches.length >= 12, `${swatches.length} swatches with a digit`)
      assert.deepEqual(swatches.filter((s) => s.ratio < WCAG_AA_TEXT).map((s) => [s.name, s.ratio.toFixed(2)]), [])
      assert.deepEqual(swatches.filter((s) => s.outlined).map((s) => s.name), [], 'a digit with an outline reads garbled on a dark fill')
    })
  }

  it('grows from 1366x768 to 2560x1440 with the desk', async () => {
    const { page } = opened
    await page.setViewportSize(LAPTOP)
    const small = await settle(() => swatchWidth(page), swatchWidth(page))
    await page.setViewportSize(HUGE)
    // Pass once the desk's scale has applied; a swatch that never grows settles at its small size and fails the assert.
    const big = await settle(async () => (await swatchWidth(page)) / small >= MIN_GROWTH, true)
    assert.equal(big, true, `the swatch stayed ${small}px at 2560x1440`)
  })
})
