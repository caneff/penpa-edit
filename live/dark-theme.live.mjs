// The solve page in both themes (#192): the board's ground is dark in the dark theme, the Board label and every card's text
// meet WCAG AA (4.5:1), and the top-bar buttons keep a visible shape, disabled ones included. Colours are read from the
// page's computed styles and the board's pixels, so a CSS change that looks wrong fails here.
import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { boardCanvasInPage, contrastHelpersInPage, makeNumberSolveLink, openSolvePage, useBrowser, waitForDesk } from './page.mjs'
import { settle } from './settle.mjs'

const browser = useBrowser()

const WCAG_AA_TEXT = 4.5
// WCAG's bar for a graphic the user must find (an icon, a button's edge).
const WCAG_GRAPHIC = 3
// The least a resting button fill may differ from the bar's, and a hovered fill from the resting one (both about 1.3 as built).
const BUTTON_AGAINST_BAR = 1.25
const HOVER_AGAINST_REST = 1.15
// The lightest a Settings button's fill may be in the dark theme: a light slab is about 0.8.
const DARK_BUTTON_LUMINANCE = 0.15
// The share of the board's sampled pixels that must stand out from the ground, so a grid and clues, not one pixel, show.
const MIN_MARK_SHARE = 0.005
// The board's ground luminance in the dark theme, and the lightest a "dark" ground may be.
const DARK_GROUND_LUMINANCE = 0.1

// Three of the tools: two whose style buttons are colour swatches, and one whose are not.
const TOOLS = [{ mode: 'surface' }, { mode: 'multicolor' }, { mode: 'number', submode: '1' }]

let numberLink
async function openIn (theme) {
  numberLink ??= await makeNumberSolveLink(browser())
  const opened = await openSolvePage(browser(), numberLink)
  await opened.page.addScriptTag({ content: `window.__helpers = ${contrastHelpersInPage}; window.__groundOf = ${groundOfInPage}; window.__opacityOf = ${opacityOfInPage}; window.__boardCanvas = ${boardCanvasInPage}` })
  await opened.page.evaluate((t) => engine.setTheme(t), theme)
  await settle(() => opened.page.evaluate(() => document.documentElement.classList.contains('wa-dark')), theme === 'dark')
  // The colours ease to the new theme's; read them only once the easing is over.
  await opened.page.evaluate(() => Promise.all(document.getAnimations().map((a) => a.finished)))
  return opened
}

// Runs in the page: the product of the opacities of a node and its flat-tree ancestors, which dims what the node shows.
function opacityOfInPage (node) {
  let product = 1
  for (let n = node; n; n = n.assignedSlot ?? n.parentElement ?? n.getRootNode()?.host ?? null) {
    if (n.nodeType === 1) product *= Number(getComputedStyle(n).opacity)
  }
  return product
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
    const read = await page.evaluate((graphic) => {
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
      let sampled = 0
      let marks = 0
      for (let i = 0; i < data.length; i += 28) {
        sampled++
        if (ratio([data[i], data[i + 1], data[i + 2]], ground) >= graphic) marks++
      }
      return { ground: luminance(ground), markShare: marks / sampled }
    }, WCAG_GRAPHIC)
    assert.ok(read.ground < DARK_GROUND_LUMINANCE, `board ground luminance ${read.ground}`)
    assert.ok(read.markShare >= MIN_MARK_SHARE, `only ${read.markShare} of the board stands out from its ground at ${WCAG_GRAPHIC}:1`)
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

// Runs in the page: every visible text in the cards and the bar whose colour is under `minRatio`:1 against what it sits on.
function lowContrastTextInPage (minRatio) {
  const { parse, over, ratio } = window.__helpers()
  const texts = [...document.querySelectorAll('.ui-card *, .ui-bar *')].filter((n) =>
    n.checkVisibility({ opacityProperty: true }) && !n.closest('.ui-sr-only') && [...n.childNodes].some((c) => c.nodeType === 3 && c.textContent.trim()))
  return texts.flatMap((n) => {
    const ground = window.__groundOf(n, parse, over)
    const [red, green, blue, alpha] = parse(getComputedStyle(n).color)
    const r = ratio(over([red, green, blue, alpha * window.__opacityOf(n)], ground), ground)
    return r < minRatio ? [`${n.className || n.tagName} "${n.textContent.trim().slice(0, 30)}" ${r.toFixed(2)}`] : []
  })
}

for (const theme of ['light', 'dark']) {
  describe(`text contrast in the ${theme} theme`, () => {
    it('the Board label and every card text meet 4.5:1, for each style of three tools', async () => {
      const { context, page } = await openIn(theme)
      await page.addScriptTag({ content: `window.__lowContrast = ${lowContrastTextInPage}` })
      // Colours ease to their new value, so each read waits until the list settles.
      const lowContrast = async () => {
        // A tool change flashes its name in and out; the flash is not the card's text.
        await page.evaluate(() => Promise.all(document.getAnimations().map((a) => a.finished)))
        return settle(() => page.evaluate((min) => window.__lowContrast(min), WCAG_AA_TEXT), [])
      }
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
        // The opacity of the base and of the button (a disabled one is dimmed on the host) dims both its fill and its icon.
        const dim = (c) => [c[0], c[1], c[2], c[3] * window.__opacityOf(base)]
        const fill = over(dim(parse(getComputedStyle(base).backgroundColor)), barGround)
        const icon = over(dim(parse(getComputedStyle(base).color)), fill)
        return { name: node.textContent.trim(), disabled: node.hasAttribute('disabled'), shape: ratio(fill, barGround), icon: ratio(icon, fill) }
      })
      const icons = { disabled: [], enabled: [] }
      for (let i = 0; i < count; i++) {
        const b = await read(i)
        icons[b.disabled ? 'disabled' : 'enabled'].push(b.icon)
        if (b.name === 'Undo' || b.name === 'Redo') assert.ok(b.disabled, `${b.name} starts disabled`)
        assert.ok(b.shape >= BUTTON_AGAINST_BAR, `${b.name}: fill against the bar ${b.shape.toFixed(2)}:1 (${theme})`)
        assert.ok(b.icon >= WCAG_GRAPHIC, `${b.name}${b.disabled ? ' (disabled)' : ''}: icon against its fill ${b.icon.toFixed(2)}:1 (${theme})`)
      }
      assert.ok(icons.disabled.length > 0, 'a disabled button was measured')
      assert.ok(Math.max(...icons.disabled) < Math.min(...icons.enabled), `a disabled icon (${icons.disabled}) looks dimmer than every enabled one (${icons.enabled})`)

      const restart = page.locator('.ui-bar wa-button', { hasText: 'Restart' })
      const fillOf = () => restart.evaluate((node) => {
        const { parse } = window.__helpers()
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
  it('hold white text on a current chip and show on the dark Board label, at 4.5:1, for 24 pins', async () => {
    const { context, page } = await openIn('dark')
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
    const worst = await page.evaluate(() => {
      const { parse, ratio } = window.__helpers()
      // The label with no style colour set, as a pinned tool of no colour style shows it: `initial` leaves the CSS's own fallback pill.
      const label = document.querySelector('.ui-tool-name').cloneNode()
      label.style.setProperty('--ui-style-pill', 'initial')
      document.querySelector('.ui-card-board').append(label)
      const pill = parse(getComputedStyle(label).backgroundColor)
      label.remove()
      return [...document.querySelectorAll('.ui-chip')].map((chip) => {
        const value = getComputedStyle(chip).getPropertyValue('--ui-pin-colour').trim()
        if (!value) throw new Error('a chip has no --ui-pin-colour')
        const colour = parse(value)
        return Math.min(ratio([255, 255, 255, 255], colour), ratio(colour, pill))
      })
    })
    assert.equal(worst.length, 24, 'every pin has a chip')
    assert.deepEqual(worst.filter((r) => r < WCAG_AA_TEXT), [], 'white on each pin colour, and each pin colour on the label pill')
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

  // Runs in the page: each visible button of the open dialogs as its name, fill luminance and text against its fill.
  function dialogButtonsInPage () {
    const { parse, over, luminance, ratio } = window.__helpers()
    const buttons = [...document.querySelectorAll('wa-dialog[open] wa-button')].filter((b) => b.checkVisibility())
    return buttons.map((node) => {
      const base = node.shadowRoot.querySelector('[part~="base"]')
      const opacity = window.__opacityOf(base)
      const dim = (c) => [c[0], c[1], c[2], c[3] * opacity]
      const ground = window.__groundOf(node, parse, over)
      const fill = over(dim(parse(getComputedStyle(base).backgroundColor)), ground)
      const text = over(dim(parse(getComputedStyle(base).color)), fill)
      return { name: node.textContent.trim(), variant: node.getAttribute('variant'), disabled: node.hasAttribute('disabled'), fill: luminance(fill), text: ratio(text, fill) }
    })
  }

  it('the Settings dialog buttons, and the confirm dialog that Clear opens, are not light slabs and read at 4.5:1', async () => {
    const { context, page } = await openIn('dark')
    await page.addScriptTag({ content: `window.__dialogButtons = ${dialogButtonsInPage}` })
    await page.getByRole('button', { name: 'Settings', exact: true }).click()
    // A dialog fades in, so read once the buttons stop changing (settle returns the value once it holds still).
    const dialogButtons = () => settle(() => page.evaluate(() => window.__dialogButtons()), null)
    await page.locator('wa-dialog[open] wa-button', { hasText: 'Reset layout' }).waitFor()
    await page.evaluate(() => Promise.all(document.getAnimations().map((a) => a.finished)))
    const inSettings = await dialogButtons()
    const neutral = inSettings.filter((b) => !b.variant || b.variant === 'neutral')
    assert.ok(neutral.length >= 2, `the dialog has neutral buttons: ${JSON.stringify(inSettings)}`)
    assert.deepEqual(neutral.filter((b) => b.fill >= DARK_BUTTON_LUMINANCE).map((b) => b.name), [], 'no neutral button is a light slab')
    // A disabled button is dimmed on purpose, so it is held to the graphic bar, as in the top bar.
    assert.deepEqual(inSettings.filter((b) => b.text < (b.disabled ? WCAG_GRAPHIC : WCAG_AA_TEXT)).map((b) => `${b.name} ${b.text.toFixed(2)}`), [], 'settings button text at 4.5:1')

    // The danger-styled Clear opens its own confirm dialog, over the Settings dialog.
    await page.locator('wa-dialog[open] wa-button[variant="danger"]').first().click()
    await page.locator('wa-dialog[open][label*="Clear"] wa-button').first().waitFor()
    await page.evaluate(() => Promise.all(document.getAnimations().map((a) => a.finished)))
    const confirm = await page.evaluate(() => [...document.querySelectorAll('wa-dialog[label*="Clear"] wa-button')].length)
    assert.equal(confirm, 2, 'the confirm dialog has Cancel and Clear')
    const inConfirm = (await dialogButtons()).filter((b) => b.name === 'Clear progress' || b.name === 'Cancel' || /^Keep|^Cancel/.test(b.name))
    assert.equal(inConfirm.length, 2, 'the confirm dialog buttons were measured')
    assert.deepEqual(inConfirm.filter((b) => b.text < WCAG_AA_TEXT).map((b) => `${b.name} ${b.text.toFixed(2)}`), [], 'confirm button text at 4.5:1')
    await context.close()
  })
})
