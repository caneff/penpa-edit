// The solve page credits Penpa+ (#244): a muted link in the top bar, always visible and clear of the buttons and the title at
// 1366x768 in both themes, and an About group at the bottom of Settings with Penpa+'s MIT lines and this fork's repository.
import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { AKARI_SOLVE, openSolvePage, useBrowser } from './page.mjs'
import { settle } from './settle.mjs'

const browser = useBrowser()

const LAPTOP = { width: 1366, height: 768 }
const PENPA_URL = 'https://github.com/swaroopg92/penpa-edit'
const FORK_URL = 'https://github.com/caneff/penpa-edit'
// The least the credit's text may differ from the bar's ground, for a muted line that still reads (WCAG AA for small text).
const WCAG_AA_TEXT = 4.5

async function open (theme) {
  const opened = await openSolvePage(browser(), AKARI_SOLVE, { served: true, contextOptions: { viewport: LAPTOP } })
  await opened.page.evaluate((t) => engine.setTheme(t), theme)
  await settle(() => opened.page.evaluate(() => document.documentElement.classList.contains('wa-dark')), theme === 'dark')
  return opened
}

// Runs in the page: the credit link's box, the title's, every other visible bar control's, and the credit's text and bar colours.
function barBoxes () {
  const bar = document.querySelector('.ui-bar')
  const credit = bar.querySelector('a[href="https://github.com/swaroopg92/penpa-edit"]')
  const rect = (node) => { const r = node.getBoundingClientRect(); return { left: r.left, right: r.right, top: r.top, bottom: r.bottom } }
  const heading = bar.querySelector('.ui-heading')
  const controls = [...bar.children].filter((n) => n !== heading && !n.matches('.ui-spacer') && n.offsetWidth > 0)
  return {
    credit: credit && rect(credit),
    creditText: credit && credit.textContent,
    creditColour: credit && getComputedStyle(credit).color,
    barColour: getComputedStyle(bar).backgroundColor,
    bar: rect(bar),
    title: rect(heading.querySelector('.ui-title')),
    controls: controls.map(rect)
  }
}

const channels = (css) => css.match(/[\d.]+/g).slice(0, 3).map(Number)
const luminance = (css) => {
  const [r, g, b] = channels(css).map((v) => { const s = v / 255; return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4 })
  return 0.2126 * r + 0.7152 * g + 0.0722 * b
}
const contrast = (a, b) => { const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x); return (hi + 0.05) / (lo + 0.05) }

describe('the credit in the top bar', () => {
  for (const theme of ['light', 'dark']) {
    it(`reads "Solving UI for Penpa+", opens the original in a new tab, and clears the title and the buttons at 1366x768 in the ${theme} theme`, async () => {
      const { context, page } = await open(theme)
      try {
        const link = page.locator('.ui-bar').getByRole('link', { name: 'Solving UI for Penpa+' })
        assert.equal(await link.getAttribute('href'), PENPA_URL)
        assert.equal(await link.getAttribute('target'), '_blank')
        const boxes = await page.evaluate(barBoxes)
        assert.equal(boxes.creditText, 'Solving UI for Penpa+')
        assert.ok(boxes.credit.top >= boxes.bar.top && boxes.credit.bottom <= boxes.bar.bottom, 'the credit is inside the bar')
        assert.ok(boxes.credit.bottom <= boxes.title.top + 1 || boxes.credit.top >= boxes.title.bottom - 1 || boxes.credit.left >= boxes.title.right || boxes.credit.right <= boxes.title.left, 'the credit does not cover the title')
        for (const control of boxes.controls) {
          assert.ok(boxes.credit.right <= control.left || boxes.credit.left >= control.right, 'the credit does not reach a bar button')
        }
        assert.ok(contrast(boxes.creditColour, boxes.barColour) >= WCAG_AA_TEXT, 'the credit reads against the bar')
      } finally {
        await context.close()
      }
    })
  }
})

describe('the About group in Settings', () => {
  it('is the last group, and names Penpa+ and its author, the engine, the MIT lines, and both repositories', async () => {
    const { context, page } = await open('light')
    try {
      await page.getByRole('button', { name: 'Settings' }).click()
      await page.getByRole('dialog', { name: 'Settings' }).waitFor()
      const dialog = page.locator('wa-dialog[open]')
      const about = dialog.getByRole('group', { name: 'About' })
      assert.equal(await dialog.locator('fieldset > legend').last().textContent(), 'About', 'About is the last group')
      const text = await about.textContent()
      assert.match(text, /solving-focused UI fork of Penpa\+ by swaroopg92/)
      assert.match(text, /puzzle engine is Penpa\+'s/)
      assert.match(text, /MIT/)
      assert.match(text, /Copyright \(c\) 2019 Opt-Pan/)
      assert.match(text, /Copyright \(c\) 2020 Swaroop Guggilam/)
      const links = await about.getByRole('link').evaluateAll((nodes) => nodes.map((n) => [n.href, n.target]))
      assert.deepEqual(links, [[PENPA_URL, '_blank'], [FORK_URL, '_blank']])
    } finally {
      await context.close()
    }
  })
})
