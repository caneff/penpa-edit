// The Mode card's colour swatches (#236): every swatch's digit reads against its fill at 1366x768 in both themes, and the swatches
// grow with the desk-wide text scale (#199) from 1366x768 to 2560x1440. Colours are read from the page's computed styles.
// A page that opens in a saved dark theme draws swatches even when the theme's stylesheet arrives after the tools are read (#247).
import assert from 'node:assert/strict'
import { before, after, describe, it } from 'node:test'
import { afterChange, contrastHelpersInPage, newBoardSolveLink, openSolvePage, setTool, THEME_KEY, useBrowser } from './page.mjs'
import { settle } from './settle.mjs'

const browser = useBrowser()

const WCAG_AA_TEXT = 4.5
const LAPTOP = { width: 1366, height: 768 }
const HUGE = { width: 2560, height: 1440 }
// The least a swatch must grow from 1366x768 to 2560x1440: well past rounding, short of the desk's full text scale.
const MIN_GROWTH = 1.3
// The colour styles of Surface and of Number, by name, as `engine.listTools()` gives them.
const COLOURS = {
  surface: ['dark grey', 'grey', 'light grey', 'black', 'green', 'blue', 'red', 'yellow', 'pink', 'orange', 'purple', 'brown'],
  number: ['black', 'green', 'blue', 'grey', 'dark blue', 'red']
}

// Runs in the page: each swatch's digit contrast against its fill, and whether the digit has an outline.
function swatchContrastsInPage () {
  const { parse, ratio } = window.__helpers()
  return [...document.querySelectorAll('.ui-stylebtn')].filter((b) => b.querySelector('.ui-swatch') && b.querySelector('text')).map((b) => {
    const digit = b.querySelector('text')
    const fill = getComputedStyle(b.querySelector('.ui-swatch')).fill
    return { name: b.getAttribute('aria-label'), ratio: ratio(parse(getComputedStyle(digit).fill), parse(fill)), outlined: getComputedStyle(digit).stroke !== 'none' }
  })
}

// The drawn swatch, not its button: the button can grow while the swatch inside it stays small.
const swatchWidth = (page) => page.evaluate(() => document.querySelector('.ui-swatch').getBoundingClientRect().width)

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
      await page.addScriptTag({ content: `window.__helpers = ${contrastHelpersInPage}; window.__swatches = ${swatchContrastsInPage}` })
      const swatches = await page.evaluate(() => window.__swatches())
      assert.ok(swatches.length >= 12, `${swatches.length} swatches with a digit`)
      assert.deepEqual(swatches.filter((s) => s.ratio < WCAG_AA_TEXT).map((s) => [s.name, s.ratio.toFixed(2)]), [])
      assert.deepEqual(swatches.filter((s) => s.outlined).map((s) => s.name), [], 'a digit with an outline reads garbled on a dark fill')
    })
  }

  it('grows from 1366x768 to 2560x1440 with the desk', async () => {
    const { page } = opened
    await page.setViewportSize(LAPTOP)
    await afterChange(page)
    const small = await swatchWidth(page)
    await page.setViewportSize(HUGE)
    // Pass once the desk's scale has applied; a swatch that never grows settles at its small size and fails the assert.
    const big = await settle(async () => (await swatchWidth(page)) / small >= MIN_GROWTH, true)
    assert.equal(big, true, `the swatch stayed ${small}px at 2560x1440`)
  })
})

describe('a saved dark theme whose stylesheet is slow to arrive (#247)', () => {
  it('still draws every colour style of Surface and Number as a swatch, never as its name', async () => {
    const link = await newBoardSolveLink(browser(), ['Surface', 'Number'])
    // The dark stylesheet is held until the page has read its tools, as a slow network holds it on the live site; until it
    // arrives Penpa+'s colour variables are undefined, so its legacy style labels have no background.
    const opened = await openSolvePage(browser(), link, {
      served: true,
      setup: async (context) => {
        await context.addInitScript(([key]) => localStorage.setItem(key, 'dark'), [THEME_KEY])
        await context.route(/\/css\/dark_theme\.css/, async (route) => {
          const page = context.pages()[0]
          await page.waitForFunction(() => typeof engine !== 'undefined')
          await page.evaluate(async () => { await engine.ready; engine.listTools() })
          await route.fallback()
        })
      }
    })
    try {
      const { page } = opened
      // Each colour style of `mode` as [name, the type of its swatch], in the order the tool lists them.
      const colourStyles = (mode) => page.evaluate(([mode, names]) => engine.listTools().find((t) => t.mode === mode).styles
        .filter((s) => names.includes(s.name)).map((s) => [s.name, typeof s.swatch]), [mode, COLOURS[mode]])
      for (const [mode, names] of Object.entries(COLOURS)) {
        assert.deepEqual(await colourStyles(mode), names.map((name) => [name, 'string']), `${mode}: every colour style has a swatch`)
      }
      await setTool(page, { mode: 'surface' })
      const buttons = await settle(() => page.evaluate(() => [...document.querySelectorAll('.ui-stylebtn')].map((b) => b.querySelector('.ui-swatch') ? 'swatch' : b.textContent.trim())), null)
      assert.deepEqual(buttons, COLOURS.surface.map(() => 'swatch'), 'every Surface button is a swatch')
    } finally {
      await opened.context.close()
    }
  })
})
