// Where the keyboard goes on `solve.html` (#197): Tab steps pins only from the board, a dialog keeps Tab and every key to itself,
// a mouse click on a bar or card-head button hands focus back to the board, and Escape in the pin-name field clears it.
// Real key presses and clicks; focus is read with `document.activeElement` through shadow roots, the board by what Penpa+ would save.
import assert from 'node:assert/strict'
import { after, before, describe, it } from 'node:test'
import { board, currentTool, newBoardSolveLink, openSolvePage, useBrowser } from './page.mjs'
import { clickCell } from './replay.mjs'
import { settle } from './settle.mjs'

const browser = useBrowser()

const CELL = 12

// Runs in the page. A description of the deepest focused element, through shadow roots.
function focusInPage () {
  let focused = document.activeElement
  while (focused?.shadowRoot?.activeElement) focused = focused.shadowRoot.activeElement
  const host = document.activeElement
  return { tag: focused?.tagName, host: host?.tagName, label: host?.getAttribute?.('aria-label') ?? host?.textContent?.trim() ?? '' }
}
const focus = (page) => page.evaluate(focusInPage)
const boardHasFocus = async (page) => (await focus(page)).host === 'BODY'
const focusIsInDialog = (page) => page.evaluate(() => document.querySelector('wa-dialog[open]')?.contains(document.activeElement) === true)
const toolMode = async (page) => (await currentTool(page)).mode

describe('the keyboard on the solve page', () => {
  let opened
  before(async () => { opened = await openSolvePage(browser(), await newBoardSolveLink(browser(), ['Line Normal', 'Sudoku Corner'])) })
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
    assert.equal(await boardHasFocus(page), true)
    await page.keyboard.press('Tab')
    assert.notDeepEqual(await currentTool(page), before)
  })

  it('Pause by mouse hands focus to the board, so Enter does not click it again', async () => {
    const { page } = opened
    await page.getByRole('button', { name: 'Pause' }).click()
    await page.getByRole('button', { name: 'Resume' }).click()
    assert.equal(await settle(() => boardHasFocus(page), true), true)
    await page.keyboard.press('Enter')
    assert.equal(await page.evaluate(() => engine.getTimer().covered), false)
  })

  it('the theme button and Board zoom buttons hand focus back after a click', async () => {
    const { page } = opened
    for (const name of [/theme/i, 'Zoom out', 'Zoom in', 'Fit']) {
      await page.getByRole('button', { name }).click()
      assert.equal(await settle(() => boardHasFocus(page), true), true, `${name} hands focus back`)
    }
  })

  it('Escape in the pin-name field empties it and the board has focus', async () => {
    const { page } = opened
    const field = page.getByRole('textbox', { name: 'Save current pins as…' })
    await field.click()
    await page.keyboard.type('abc')
    await page.keyboard.press('Escape')
    assert.equal(await field.inputValue(), '')
    assert.equal(await settle(() => boardHasFocus(page), true), true)
  })
})

describe('with Settings open', () => {
  let opened
  before(async () => { opened = await openSolvePage(browser(), await newBoardSolveLink(browser(), ['Line Normal', 'Sudoku Corner'])) })
  after(async () => { await opened?.context.close() })

  it('Tab past the last control stays in the dialog, and a typed digit changes nothing on the board', async () => {
    const { page } = opened
    await clickCell(page, CELL)
    const before = JSON.stringify(await board(page))
    const toolBefore = await toolMode(page)
    await page.getByRole('button', { name: 'Settings' }).click()
    await page.getByRole('dialog', { name: 'Settings' }).waitFor()
    for (let i = 0; i < 60; i++) await page.keyboard.press('Tab')
    assert.equal(await settle(() => focusIsInDialog(page), true), true, 'focus is still in the dialog')
    await page.keyboard.press('5')
    await page.keyboard.press('x')
    assert.equal(JSON.stringify(await board(page)), before)
    assert.equal(await toolMode(page), toolBefore)
  })

  it('a key typed with focus on the page body still does not reach the board', async () => {
    const { page } = opened
    await page.evaluate(() => { let f = document.activeElement; while (f?.shadowRoot?.activeElement) f = f.shadowRoot.activeElement; f.blur() })
    assert.equal(await boardHasFocus(page), true, 'the body has focus')
    const before = JSON.stringify(await board(page))
    await page.keyboard.press('5')
    assert.equal(JSON.stringify(await board(page)), before)
  })

  it('Shift+Tab from the first control stays in the dialog too', async () => {
    const { page } = opened
    for (let i = 0; i < 60; i++) await page.keyboard.press('Shift+Tab')
    assert.equal(await settle(() => focusIsInDialog(page), true), true)
  })
})
