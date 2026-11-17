// Where the keyboard goes on `solve.html` (#197): Tab steps pins only from the board, a dialog keeps Tab and every key to itself,
// a mouse click on a bar or card-head button hands focus back to the board, and Escape in the pin-name field clears it.
// Real key presses and clicks; focus is read as the page's `document.activeElement` (a Web Awesome control is its host element),
// the board by what Penpa+ would save.
import assert from 'node:assert/strict'
import { after, before, describe, it } from 'node:test'
import { board, currentTool, newBoardSolveLink, openSolvePage, setTool, useBrowser } from './page.mjs'
import { clickCell } from './replay.mjs'
import { settle } from './settle.mjs'

const browser = useBrowser()

const CELL = 12
const PINS = ['Line Normal', 'Sudoku Corner']
// More Tab presses than the Settings dialog has controls, so every press past the last one tries to leave it.
const TABS_PAST_THE_DIALOG = 60
// Longer than the zero-delay timeouts the key rules queue.
const AFTER_TIMEOUT_MS = 150
const MAX_SHIFT_TABS = 6
// The kinds of control the Settings dialog holds.
const DIALOG_CONTROL = 'wa-button, wa-select, wa-switch'
const FIRST_PIN_TOOL = { mode: 'line', submode: '1' }

const openSolve = async () => openSolvePage(browser(), await newBoardSolveLink(browser(), PINS))

// Runs in the page. The control with focus: its tag and its accessible text.
const focusInPage = () => ({ host: document.activeElement?.tagName, label: document.activeElement?.textContent?.trim() ?? '' })
const afterTimeouts = (page) => page.evaluate((ms) => new Promise((resolve) => setTimeout(resolve, ms)), AFTER_TIMEOUT_MS)
const focus = (page) => page.evaluate(focusInPage)
const pageBodyHasFocus = async (page) => (await focus(page)).host === 'BODY'
const focusIsInDialog = (page) => page.evaluate(() => document.querySelector('wa-dialog[open]')?.contains(document.activeElement) === true)
const blurFocus = (page) => page.evaluate(() => { let f = document.activeElement; while (f?.shadowRoot?.activeElement) f = f.shadowRoot.activeElement; f.blur() })
const boardAndTool = async (page) => JSON.stringify([await board(page), await currentTool(page)])

describe('the keyboard on the solve page', () => {
  let opened
  before(async () => { opened = await openSolve() })
  after(async () => { await opened?.context.close() })

  it('Tab from a top-bar button moves focus on and leaves the pins alone; Tab from the board steps pins', async () => {
    const { page } = opened
    await clickCell(page, CELL)
    await page.getByRole('button', { name: 'Undo' }).focus()
    const before = await currentTool(page)
    await page.keyboard.press('Tab')
    const next = await focus(page)
    assert.deepEqual([next.host, next.label === 'Undo'], ['WA-BUTTON', false])
    assert.deepEqual(await currentTool(page), before)
    await clickCell(page, CELL)
    assert.equal(await pageBodyHasFocus(page), true)
    await page.keyboard.press('Tab')
    assert.notDeepEqual(await currentTool(page), before)
  })

  it('a mouse click on Pause hands focus to the board, so Enter does not resume it', async () => {
    const { page } = opened
    await page.getByRole('button', { name: 'Pause' }).click()
    assert.equal(await page.evaluate(() => engine.getTimer().covered), true, 'paused')
    assert.equal(await settle(() => pageBodyHasFocus(page), true), true)
    await page.keyboard.press('Enter')
    assert.equal(await page.evaluate(() => engine.getTimer().covered), true, 'still paused')
    await page.getByRole('button', { name: 'Resume' }).first().click() // the top bar's; the cover has one too
    assert.equal(await settle(() => pageBodyHasFocus(page), true), true)
    await page.keyboard.press('Enter')
    assert.equal(await page.evaluate(() => engine.getTimer().covered), false, 'still running')
  })

  it('the Pause and Board zoom buttons hand focus back after a click', async () => {
    const { page } = opened
    // Pause is last: a paused board is covered, and the zoom buttons come before it.
    for (const name of ['Zoom out', 'Zoom in', 'Fit', 'Pause']) {
      await page.getByRole('button', { name }).click()
      assert.equal(await settle(() => pageBodyHasFocus(page), true), true, `${name} hands focus back`)
    }
    await page.getByRole('button', { name: 'Resume' }).first().click()
  })

  it('a key press that clicks a bar button leaves focus on it', async () => {
    const { page } = opened
    await page.getByRole('button', { name: 'Pause' }).focus()
    await page.keyboard.press('Enter')
    // The paused board shows the click has happened; a hand-back would run as a timeout after it.
    await settle(() => page.evaluate(() => engine.getTimer().covered), true)
    // A "nothing happened" check, so a wait: a hand-back would run as a timeout queued by the click.
    await afterTimeouts(page)
    assert.equal(await page.evaluate(() => document.activeElement.matches('.ui-bar wa-button') && document.activeElement.textContent.trim() === 'Resume'), true)
    await page.getByRole('button', { name: 'Resume' }).first().click()
  })

  it('Escape in the pin-name field closes the form, empties the field and gives the board the focus', async () => {
    const { page } = opened
    const open = () => page.getByRole('button', { name: 'Save pins as a preset' }).click()
    const field = page.getByRole('textbox', { name: 'Preset name' })
    await open()
    await page.keyboard.type('abc')
    await page.keyboard.press('Escape')
    assert.equal(await field.isVisible(), false)
    assert.equal(await settle(() => pageBodyHasFocus(page), true), true)
    await open()
    assert.equal(await field.inputValue(), '')
  })
})

describe('with Settings open', () => {
  let opened
  before(async () => {
    opened = await openSolve()
    await clickCell(opened.page, CELL)
    await opened.page.getByRole('button', { name: 'Settings' }).click()
    await opened.page.getByRole('dialog', { name: 'Settings' }).waitFor()
  })
  after(async () => { await opened?.context.close() })

  it('Tab past the last control stays in the dialog, and a typed digit and pin key change nothing on the board', async () => {
    const { page } = opened
    const before = await boardAndTool(page)
    for (let i = 0; i < TABS_PAST_THE_DIALOG; i++) await page.keyboard.press('Tab')
    assert.equal(await settle(() => focusIsInDialog(page), true), true, 'focus is still in the dialog')
    await page.keyboard.press('5')
    await page.keyboard.press('x')
    assert.equal(await boardAndTool(page), before)
  })

  it('a key typed with focus on the page body does not reach the board', async () => {
    const { page } = opened
    await setTool(page, FIRST_PIN_TOOL)
    await blurFocus(page)
    assert.equal(await pageBodyHasFocus(page), true, 'the body has focus')
    const before = await boardAndTool(page)
    // X picks the second pin: the tool changes if the key leaks.
    await page.keyboard.press('5')
    await page.keyboard.press('x')
    assert.equal(await boardAndTool(page), before)
  })

  it('Shift+Tab past the first control moves on to another control of the dialog, not back to its start', async () => {
    const { page } = opened
    const first = page.locator('wa-dialog[open] wa-select').first()
    const firstLabel = await first.getAttribute('label')
    await first.focus()
    // Shift+Tab until focus is on a control of the settings groups other than the first (the dialog's own close button may stop it first).
    const focusAfterWrap = () => page.evaluate(({ selector, first }) => {
      const dialog = document.querySelector('wa-dialog[open]')
      const controls = [...dialog.querySelectorAll(`.ui-settings-group :is(${selector})`)].filter((control) => !control.disabled)
      const at = document.activeElement
      return { onWrapTarget: controls.includes(at) && at.getAttribute('label') !== first, name: at.getAttribute('label') ?? at.tagName }
    }, { selector: DIALOG_CONTROL, first: firstLabel })
    let focus
    for (let i = 0; i < MAX_SHIFT_TABS && !focus?.onWrapTarget; i++) {
      await page.keyboard.press('Shift+Tab')
      await afterTimeouts(page)
      focus = await focusAfterWrap()
    }
    assert.equal(focus.onWrapTarget, true, `focus went to ${focus.name}, not on to a control of the dialog`)
    assert.equal(await focusIsInDialog(page), true)
  })
})
