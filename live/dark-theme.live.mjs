// The solve page in both themes (#192): the board's ground is dark in the dark theme, the Board label and every card's text
// meet WCAG AA (4.5:1), and the top-bar buttons keep a visible shape, disabled ones included. Colours are read from the
// page's computed styles and the board's pixels, so a CSS change that looks wrong fails here.
import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { boardCanvasInPage, makeNumberSolveLink, openSolvePage, useBrowser, waitForDesk } from './page.mjs'
import { settle } from './settle.mjs'

const browser = useBrowser()

const WCAG_AA_TEXT = 4.5
// WCAG's bar for a graphic the user must find (an icon, a button's edge).
const WCAG_GRAPHIC = 3
// A resting button fill against the bar: the ratio between #2b2f38 and #3a3f4b, the fills the ticket names.
const BUTTON_AGAINST_BAR = 1.25
// A hovered fill against the resting one: the ratio between #3a3f4b and #4a5060.
const HOVER_AGAINST_REST = 1.15
// The board's ground luminance in the dark theme, and the lightest a "dark" ground may be.
const DARK_GROUND_LUMINANCE = 0.1

// Tools whose style buttons are colour swatches, and one whose are not.
const TOOLS = [{ mode: 'surface' }, { mode: 'multicolor' }, { mode: 'number', submode: '1' }]

let numberLink
async function openIn (theme) {
  numberLink ??= await makeNumberSolveLink(browser())
  const opened = await openSolvePage(browser(), numberLink)
  await opened.page.addScriptTag({ content: `window.__helpers = ${contrastHelpersInPage}; window.__groundOf = ${groundOfInPage}; window.__boardCanvas = ${boardCanvasInPage}` })
  await opened.page.evaluate((t) => engine.setTheme(t), theme)
  await settle(() => opened.page.evaluate(() => document.documentElement.classList.contains('wa-dark')), theme === 'dark')
  // The colours ease to the new theme's; read them only once the easing is over.
  await opened.page.evaluate(() => Promise.all(document.getAnimations().map((a) => a.finished)))
  return opened
}

// Runs in the page: WCAG's contrast ratio of two [r, g, b, a] colours, the second under the first's own alpha.
function contrastHelpersInPage () {
  const channel = (c) => { const s = c / 255; return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4 }
  const luminance = ([r, g, b]) => 0.2126 * channel(r) + 0.7152 * channel(g) + 0.0722 * channel(b)
  const parse = (css) => {
    const c = document.createElement('canvas').getContext('2d')
    c.clearRect(0, 0, 1, 1)
    c.fillStyle = css
    c.fillRect(0, 0, 1, 1)
    return [...c.getImageData(0, 0, 1, 1).data]
  }
  const over = (top, under) => {
    const a = top[3] / 255
    return [0, 1, 2].map((i) => top[i] * a + under[i] * (1 - a)).concat(255)
  }
  const ratio = (a, b) => { const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x); return (hi + 0.05) / (lo + 0.05) }
  return { luminance, parse, over, ratio }
}

// Runs in the page: the colour a node's own box shows, composited over its ancestors in the flat tree (a slotted node sits in its slot).
function groundOfInPage (node, parse, over) {
  const layers = []
  for (let n = node; n; n = n.assignedSlot ?? n.parentElement ?? n.getRootNode()?.host ?? null) {
    if (n.nodeType !== 1) continue
    const bg = parse(getComputedStyle(n).backgroundColor)
    if (bg[3] > 0) layers.push(bg)
    if (bg[3] === 255) break
  }
  return layers.reduceRight((under, top) => over(top, under), [255, 255, 255, 255])
}

describe('the board in the dark theme', () => {
  it('has a dark ground, and its grid still stands out from it', async () => {
    const { context, page } = await openIn('dark')
    const read = await page.evaluate(() => {
      const { parse, over, luminance, ratio } = window.__helpers()
      const canvas = window.__boardCanvas()
      const ground = window.__groundOf(canvas, parse, over)
      // The canvas is transparent where nothing is drawn, so the picture is the canvas over its ground.
      const flat = document.createElement('canvas')
      flat.width = canvas.width
      flat.height = canvas.height
      const ctx = flat.getContext('2d')
      ctx.fillStyle = `rgb(${ground.slice(0, 3).join(',')})`
      ctx.fillRect(0, 0, flat.width, flat.height)
      ctx.drawImage(canvas, 0, 0)
      const data = ctx.getImageData(0, 0, flat.width, flat.height).data
      let best = 1
      for (let i = 0; i < data.length; i += 28) best = Math.max(best, ratio([data[i], data[i + 1], data[i + 2]], ground))
      return { ground: luminance(ground), contrast: best }
    })
    assert.ok(read.ground < DARK_GROUND_LUMINANCE, `board ground luminance ${read.ground}`)
    assert.ok(read.contrast >= WCAG_GRAPHIC, `the lightest mark against the ground is ${read.contrast}:1`)
    await context.close()
  })

  it('stays white in the light theme', async () => {
    const { context, page } = await openIn('light')
    const ground = await page.evaluate(() => {
      const { parse, over } = window.__helpers()
      return window.__groundOf(window.__boardCanvas(), parse, over)
    })
    assert.deepEqual(ground, [255, 255, 255, 255])
    await context.close()
  })
})

// Runs in the page: every visible text in the cards and the bar whose colour is under 4.5:1 against what it sits on.
function lowContrastTextInPage () {
  const { parse, over, ratio } = window.__helpers()
  const texts = [...document.querySelectorAll('.ui-card *, .ui-bar *')].filter((n) =>
    n.checkVisibility() && !n.closest('.ui-sr-only') && [...n.childNodes].some((c) => c.nodeType === 3 && c.textContent.trim()))
  return texts.flatMap((n) => {
    const ground = window.__groundOf(n, parse, over)
    const r = ratio(over(parse(getComputedStyle(n).color), ground), ground)
    return r < 4.5 ? [`${n.className || n.tagName} "${n.textContent.trim().slice(0, 30)}" ${r.toFixed(2)}`] : []
  })
}

for (const theme of ['light', 'dark']) {
  describe(`text contrast in the ${theme} theme`, () => {
    it('the Board label and every card text meet 4.5:1, for every tool and style', async () => {
      const { context, page } = await openIn(theme)
      await page.addScriptTag({ content: `window.__lowContrast = ${lowContrastTextInPage}` })
      // Colours ease to their new value, so each read waits until the list settles.
      const lowContrast = () => settle(() => page.evaluate(() => window.__lowContrast()), [])
      assert.deepEqual(await lowContrast(), [], 'on opening')
      for (const tool of TOOLS) {
        await page.evaluate((t) => engine.setTool(t), tool)
        const styles = page.locator('.ui-stylebtn')
        for (let i = 0, n = await styles.count(); i < n; i++) {
          await styles.nth(i).click()
          assert.deepEqual(await lowContrast(), [], `${JSON.stringify(tool)}, style button ${i}`)
        }
      }
      await context.close()
    })
  })
}

describe('top-bar buttons', () => {
  for (const theme of ['light', 'dark']) {
    it(`keep a visible shape, a findable disabled icon and a hover change in the ${theme} theme`, async () => {
      const { context, page } = await openIn(theme)
      const buttons = page.locator('.ui-bar wa-button')
      const count = await buttons.count()
      assert.ok(count >= 4, 'the bar has its buttons')
      const read = (i) => buttons.nth(i).evaluate((node) => {
        const { parse, over, ratio } = window.__helpers()
        const base = node.shadowRoot.querySelector('[part~="base"]')
        const bar = document.querySelector('.ui-bar')
        const barGround = window.__groundOf(bar, parse, over)
        // The base's opacity dims both its fill and its icon over what lies behind.
        const dim = (c) => [c[0], c[1], c[2], c[3] * Number(getComputedStyle(base).opacity)]
        const fill = over(dim(parse(getComputedStyle(base).backgroundColor)), barGround)
        const icon = over(dim(parse(getComputedStyle(base).color)), fill)
        return { name: node.textContent.trim(), disabled: node.hasAttribute('disabled'), shape: ratio(fill, barGround), icon: ratio(icon, fill) }
      })
      let sawDisabled = false
      for (let i = 0; i < count; i++) {
        const b = await read(i)
        sawDisabled ||= b.disabled
        if (b.name === 'Undo' || b.name === 'Redo') assert.ok(b.disabled, `${b.name} starts disabled`)
        assert.ok(b.shape >= BUTTON_AGAINST_BAR, `${b.name}: fill against the bar ${b.shape.toFixed(2)}:1 (${theme})`)
        assert.ok(b.icon >= WCAG_GRAPHIC, `${b.name}${b.disabled ? ' (disabled)' : ''}: icon against its fill ${b.icon.toFixed(2)}:1 (${theme})`)
      }
      assert.ok(sawDisabled, 'a disabled button was measured')

      const restart = page.locator('.ui-bar wa-button', { hasText: 'Restart' })
      const fillOf = () => restart.evaluate((node) => {
        const { parse, over, ratio } = window.__helpers()
        const fill = parse(getComputedStyle(node.shadowRoot.querySelector('[part~="base"]')).backgroundColor)
        return fill.slice(0, 3)
      })
      const rest = await fillOf()
      await restart.hover()
      const hoverRatio = () => fillOf().then((hovered) => page.evaluate(([a, b]) => window.__helpers().ratio(a, b), [rest, hovered]))
      // The fill eases to its hover colour, so wait for the ratio to arrive rather than for the first change.
      const reached = await settle(async () => (await hoverRatio()) >= HOVER_AGAINST_REST, true)
      assert.ok(reached, `hover fill against rest ${(await hoverRatio()).toFixed(2)}:1 (${theme})`)
      await context.close()
    })
  }
})

describe('pin colours', () => {
  it('hold white text at 4.5:1 for 24 pins, so a current chip reads', async () => {
    const { context, page } = await openIn('light')
    // The saved pin set the Pinned card reads on load: pin ids 0..23 run round the hue wheel on the golden angle.
    await page.evaluate(() => {
      const keys = Object.keys(localStorage).filter((key) => localStorage.getItem(key).includes('"pins"'))
      if (keys.length !== 1) throw new Error(`expected one saved pin set, found ${keys.length}`)
      const pins = Array.from({ length: 24 }, (_, id) => ({ id, mode: 'surface', submode: null, style: null }))
      localStorage.setItem(keys[0], JSON.stringify({ nextId: pins.length, pins }))
    })
    await page.reload()
    await waitForDesk(page)
    await page.addScriptTag({ content: `window.__helpers = ${contrastHelpersInPage}` })
    const ratios = await page.evaluate(() => {
      const { parse, ratio } = window.__helpers()
      return [...document.querySelectorAll('.ui-chip')].map((chip) =>
        ratio([255, 255, 255, 255], parse(getComputedStyle(chip).getPropertyValue('--ui-pin-colour'))))
    })
    assert.equal(ratios.length, 24, 'every pin has a chip')
    assert.deepEqual(ratios.filter((r) => r < WCAG_AA_TEXT), [], 'white against each pin colour')
    await context.close()
  })
})

describe('the dark theme elsewhere', () => {
  it('rings every colour swatch in light, so a dark one shows on its button', async () => {
    const { context, page } = await openIn('dark')
    await page.evaluate(() => engine.setTool({ mode: 'surface' }))
    const rings = await page.evaluate(() => {
      const { parse, over, ratio } = window.__helpers()
      return [...document.querySelectorAll('.ui-stylebtn .ui-swatch')].map((swatch) => {
        const button = swatch.closest('.ui-stylebtn')
        const ground = window.__groundOf(button, parse, over)
        return ratio(over(parse(getComputedStyle(swatch).stroke), ground), ground)
      })
    })
    assert.ok(rings.length > 0, 'the Surface tool has swatches')
    assert.deepEqual(rings.filter((r) => r < WCAG_GRAPHIC), [], 'every ring against its button')
    await context.close()
  })

  it('the Settings dialog buttons are not light slabs', async () => {
    const { context, page } = await openIn('dark')
    await page.getByRole('button', { name: 'Settings', exact: true }).click()
    const clear = page.locator('wa-button', { hasText: 'Clear saved progress' })
    await clear.waitFor()
    const luminance = await clear.evaluate((node) => {
      const { parse, over, luminance } = window.__helpers()
      const ground = window.__groundOf(node, parse, over)
      return luminance(over(parse(getComputedStyle(node.shadowRoot.querySelector('[part~="base"]')).backgroundColor), ground))
    })
    assert.ok(luminance < 0.15, `Clear saved progress fill luminance ${luminance}`)
    await context.close()
  })
})
