// The solve page credits Penpa+ (#244): the top bar's Penpa+ text button (the one mention there) and an About group at the
// bottom of Settings with Penpa+'s MIT lines and this fork's repository, both read at 1366x768 in both themes.
import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { AKARI_SOLVE, openSolvePage, useBrowser } from './page.mjs'
import { settle } from './settle.mjs'

const browser = useBrowser()

const LAPTOP = { width: 1366, height: 768 }
const PENPA_URL = 'https://github.com/swaroopg92/penpa-edit'
const PENPA_LICENCE_URL = `${PENPA_URL}/blob/master/LICENSE`
const FORK_URL = 'https://github.com/caneff/penpa-edit'
const FORK_LINK_TEXT = 'caneff/penpa-edit'
// Shift+Tab presses from a freshly opened dialog that are enough to leave it, whatever holds focus first.
const FIRST_TAB_STOPS_TO_LEAVE = 4

async function open (theme) {
  const opened = await openSolvePage(browser(), AKARI_SOLVE, { served: true, contextOptions: { viewport: LAPTOP } })
  await opened.page.evaluate((t) => engine.setTheme(t), theme)
  await settle(() => opened.page.evaluate(() => document.documentElement.classList.contains('wa-dark')), theme === 'dark')
  return opened
}

// Runs in the page: the bar's own box, the title's, every visible control's, and each control's width as laid out.
function barBoxes () {
  const bar = document.querySelector('.ui-bar')
  const heading = bar.querySelector('.ui-heading')
  const rect = (node) => { const r = node.getBoundingClientRect(); return { left: r.left, right: r.right, top: r.top, bottom: r.bottom } }
  const controls = [...bar.children].filter((n) => n !== heading && !n.matches('.ui-spacer') && n.offsetWidth > 0)
  return {
    title: rect(heading.querySelector('.ui-title')),
    controls: controls.map((node) => ({ ...rect(node), text: node.textContent.trim() })),
    compact: bar.classList.contains('is-compact'),
    headingLeft: bar.classList.contains('is-heading-left')
  }
}

describe('the top bar at 1366x768', () => {
  for (const theme of ['light', 'dark']) {
    it(`names Penpa+ once, in its text button, with the title centred and no control cut or crowded in the ${theme} theme`, async () => {
      const { context, page } = await open(theme)
      try {
        const bar = page.locator('.ui-bar')
        assert.equal(await bar.getByText('Penpa+', { exact: true }).count(), 1, 'one visible mention of Penpa+')
        assert.equal(await bar.getByRole('link').count(), 0, 'and no credit link')
        const boxes = await page.evaluate(barBoxes)
        assert.equal(boxes.headingLeft, false, 'the title stays centred')
        assert.equal(boxes.compact, false, 'no button shrinks')
        for (const control of boxes.controls) {
          assert.equal(boxes.title.right <= control.left || boxes.title.left >= control.right, true, `the title clears ${control.text || 'a button'}: ${JSON.stringify([boxes.title, control])}`)
        }
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
      assert.match(text, /Original Work\/Project Initiator - Copyright \(c\) 2019 Opt-Pan/)
      assert.match(text, /New Features\/Upgrades - Copyright \(c\) 2020 Swaroop Guggilam/)
      const links = await about.getByRole('link').evaluateAll((nodes) => nodes.map((n) => [n.href, n.target]))
      assert.deepEqual(links, [[PENPA_URL, '_blank'], [PENPA_LICENCE_URL, '_blank'], [FORK_URL, '_blank']])
    } finally {
      await context.close()
    }
  })

  it('says "desk" nowhere a solver reads it: not in Settings, not in a tooltip', async () => {
    const { context, page } = await open('light')
    try {
      await page.getByRole('button', { name: 'Settings' }).click()
      await page.getByRole('dialog', { name: 'Settings' }).waitFor()
      const dialog = page.locator('wa-dialog[open]')
      const legends = await dialog.locator('fieldset > legend').allTextContents()
      assert.deepEqual(legends.slice(-3), ['Page', 'Pins', 'About'])
      const shown = await page.evaluate(() => [...document.querySelectorAll('wa-dialog[open] *, wa-tooltip')]
        .map((node) => node.textContent).join('\n'))
      assert.doesNotMatch(shown, /\bdesk\b/i)
    } finally {
      await context.close()
    }
  })

  it('brings Shift+Tab that leaves the dialog back to its last control, an About link', async () => {
    const { context, page } = await open('light')
    try {
      await page.getByRole('button', { name: 'Settings' }).click()
      await page.getByRole('dialog', { name: 'Settings' }).waitFor()
      // A press that leaves the dialog is answered in a timeout, which the next macrotask of the page follows.
      const afterTimeouts = () => page.evaluate(() => new Promise((resolve) => setTimeout(resolve)))
      const reached = []
      for (let press = 0; press < FIRST_TAB_STOPS_TO_LEAVE && !reached.includes(FORK_LINK_TEXT); press++) {
        await page.keyboard.press('Shift+Tab')
        await afterTimeouts()
        reached.push(await page.evaluate(() => document.activeElement?.textContent.slice(0, 40)))
      }
      assert.equal(reached.includes(FORK_LINK_TEXT), true, `Shift+Tab reached ${JSON.stringify(reached)}`)
    } finally {
      await context.close()
    }
  })
})
