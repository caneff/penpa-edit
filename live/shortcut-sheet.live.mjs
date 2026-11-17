// The keyboard shortcut sheet of `solve.html` (#259): `?` or Settings → Keys opens it, Escape closes it and hands the keyboard back,
// its Z X C V row says whether the setting is on, and each group's keys do what the sheet says. Real key presses; the sheet is
// read by role and accessible name, the board by what Penpa+ would save.
import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { board, currentTool, newBoardSolveLink, openPenpa, openSolvePage, typedDigits, useBrowser } from './page.mjs'
import { clickCell } from './replay.mjs'
import { settle } from './settle.mjs'

const browser = useBrowser()

const SHEET = 'Keyboard shortcuts'
const GROUPS = ['Board', 'Tools', 'Page']
const CELL = 12
const PINS = ['Line Normal', 'Sudoku Corner']

const openSolve = async () => openSolvePage(browser(), await newBoardSolveLink(browser(), PINS))
const sheetOf = (page) => page.getByRole('dialog', { name: SHEET })
const rowsOfGroup = (page, group) => sheetOf(page).getByRole('group', { name: group }).getByRole('listitem')
const openWithQuestionMark = async (page) => {
  await page.keyboard.press('?')
  await sheetOf(page).waitFor()
}

describe('the keyboard shortcut sheet', () => {
  it('? on the board opens it, with the Board, Tools and Page groups, and Penpa+ opens no sheet of its own', async () => {
    const { context, page } = await openSolve()
    try {
      await page.evaluate(() => pu.mode_set('line'))
      await openWithQuestionMark(page)
      for (const group of GROUPS) {
        assert.equal(await sheetOf(page).getByRole('group', { name: group }).count(), 1, `${group} group`)
      }
      assert.equal(await page.evaluate(() => engine.getState().penpaDialogOpen), false)
    } finally { await context.close() }
  })

  it('? in a text field types a ?', async () => {
    const { context, page } = await openSolve()
    try {
      await page.evaluate(() => {
        document.querySelector('.ui-root').insertAdjacentHTML('beforeend', '<wa-input label="Search here"></wa-input>')
      })
      const field = page.getByRole('textbox', { name: 'Search here' })
      await field.click()
      await page.keyboard.press('?')
      assert.equal(await field.inputValue(), '?')
      assert.equal(await sheetOf(page).count(), 0, 'no sheet')
    } finally { await context.close() }
  })

  it('? in the paste-a-link box types a ?', async () => {
    const { context, page } = await openPenpa(browser(), '', { solve: true })
    try {
      const box = page.getByRole('textbox', { name: 'Penpa+ link' })
      await box.click()
      await page.keyboard.press('?')
      assert.equal(await box.inputValue(), '?')
    } finally { await context.close() }
  })

  it('Settings → Keys has a button that opens it', async () => {
    const { context, page } = await openSolve()
    try {
      await page.getByRole('button', { name: 'Settings', exact: true }).click()
      await page.getByRole('dialog', { name: 'Settings' }).getByRole('button', { name: SHEET }).click()
      await sheetOf(page).waitFor()
    } finally { await context.close() }
  })

  it('Escape closes it and the keyboard is the board\'s again', async () => {
    const { context, page } = await openSolve()
    try {
      await page.evaluate(() => pu.mode_set('number'))
      await clickCell(page, CELL)
      await openWithQuestionMark(page)
      await page.keyboard.press('Escape')
      await sheetOf(page).waitFor({ state: 'hidden' })
      await page.keyboard.press('7')
      assert.deepEqual(await settle(() => typedDigits(page), ['7']), ['7'])
    } finally { await context.close() }
  })

  for (const [on, word] of [[true, 'On'], [false, 'Off']]) {
    it(`the Z X C V row says ${word} with the setting ${word.toLowerCase()}`, async () => {
      const { context, page } = await openSolve()
      try {
        await page.evaluate((value) => engine.setSetting('shortcuts_enabled', value), on)
        await openWithQuestionMark(page)
        const row = rowsOfGroup(page, 'Tools').filter({ hasText: 'Z X C V' })
        assert.equal(await row.count(), 1)
        assert.match(await row.innerText(), new RegExp(`\\b${word}\\b`))
      } finally { await context.close() }
    })
  }

  describe('every group\'s keys do what the sheet says', () => {
    it('Board: a digit goes into the selected cell', async () => {
      const { context, page } = await openSolve()
      try {
        await page.evaluate(() => pu.mode_set('number'))
        await clickCell(page, CELL)
        await openWithQuestionMark(page)
        assert.match(await rowsOfGroup(page, 'Board').filter({ hasText: 'Digits' }).innerText(), /digit/i)
        await page.keyboard.press('Escape')
        await sheetOf(page).waitFor({ state: 'hidden' })
        await page.keyboard.press('5')
        assert.deepEqual(await settle(() => typedDigits(page), ['5']), ['5'])
      } finally { await context.close() }
    })

    it('Tools: Tab steps to the next pin', async () => {
      const { context, page } = await openSolve()
      try {
        await clickCell(page, CELL)
        await openWithQuestionMark(page)
        assert.equal(await rowsOfGroup(page, 'Tools').filter({ hasText: 'Tab' }).count() > 0, true)
        await page.keyboard.press('Escape')
        await sheetOf(page).waitFor({ state: 'hidden' })
        const before = await currentTool(page)
        await page.keyboard.press('Tab')
        assert.equal(await settle(async () => JSON.stringify(await currentTool(page)) !== JSON.stringify(before), true), true, 'the tool changed')
      } finally { await context.close() }
    })

    it('Page: Ctrl+Z undoes the last entry', async () => {
      const { context, page } = await openSolve()
      try {
        await page.evaluate(() => pu.mode_set('number'))
        await clickCell(page, CELL)
        const blank = await board(page)
        await page.keyboard.press('3')
        assert.notDeepEqual(await settle(() => board(page), blank), blank, 'the digit is in')
        await openWithQuestionMark(page)
        assert.equal(await rowsOfGroup(page, 'Page').filter({ hasText: 'Ctrl+Z' }).count(), 1)
        await page.keyboard.press('Escape')
        await sheetOf(page).waitFor({ state: 'hidden' })
        await page.keyboard.press('Control+z')
        assert.deepEqual(await settle(() => board(page), blank), blank)
      } finally { await context.close() }
    })

    it('Page: F4 pauses', async () => {
      const { context, page } = await openSolve()
      try {
        await openWithQuestionMark(page)
        assert.equal(await rowsOfGroup(page, 'Page').filter({ hasText: 'F4' }).count(), 1)
        await page.keyboard.press('Escape')
        await sheetOf(page).waitFor({ state: 'hidden' })
        await page.keyboard.press('F4')
        assert.equal(await settle(() => page.evaluate(() => engine.getTimer().covered), true), true)
      } finally { await context.close() }
    })
  })
})
