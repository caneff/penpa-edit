// Picking a constraint and then All gives Line, Multicolor, Number and Sudoku their own defaults, so Sudoku mode enters a digit.
import assert from 'node:assert/strict'
import { after, before, describe, it } from 'node:test'
import { openPenpa, useBrowser } from './page.mjs'
import { settle } from './settle.mjs'

const browser = useBrowser()

describe('the All constraint', () => {
  let opened
  before(async () => { opened = await openPenpa(browser()) })
  after(async () => { await opened?.context.close() })

  it('gives each mode its own defaults and keeps Sudoku mode entering a digit', async () => {
    const { page } = opened
    // Fires the same `onchange` a pick in the constraint list does.
    const pick = (value) => page.evaluate((v) => {
      const select = document.getElementById('constraints_settings_opt')
      select.value = v
      select.onchange()
    }, value)
    await pick('classic')
    await pick('all')
    const defaults = () => page.evaluate(() => {
      const modes = pu.mode[pu.mode.qa]
      return { line: modes.line, multicolor: modes.multicolor, number: modes.number, sudoku: modes.sudoku }
    })
    const expected = { line: ['1', 2], multicolor: ['', 1], number: ['1', 1], sudoku: ['1', 1] }
    assert.deepEqual(await defaults(), expected)
    await page.evaluate(() => {
      pu.mode_set('sudoku')
      pu.selection = [pu.centerlist[0]]
    })
    await page.keyboard.press('5')
    const digits = () => page.evaluate(() => Object.values(pu.pu_q.number).map((n) => n[0]))
    assert.deepEqual(await settle(digits, ['5']), ['5'])
  })
})
