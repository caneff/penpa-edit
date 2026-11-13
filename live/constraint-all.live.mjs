// Picking a constraint and then All leaves every mode on its own defaults, so Sudoku mode still enters a digit.
import assert from 'node:assert/strict'
import { after, before, describe, it } from 'node:test'
import { openPenpa, useBrowser } from './page.mjs'
import { settle } from './settle.mjs'

const browser = useBrowser()

describe('the All constraint', () => {
  let opened
  before(async () => { opened = await openPenpa(browser()) })
  after(async () => { await opened?.context.close() })

  it('keeps Sudoku mode entering a digit', async () => {
    const { page } = opened
    // Fires the same `onchange` a pick in the constraint list does.
    const pick = (value) => page.evaluate((v) => {
      const select = document.getElementById('constraints_settings_opt')
      select.value = v
      select.onchange()
    }, value)
    await pick('classic')
    await pick('all')
    await page.evaluate(() => {
      pu.mode_set('sudoku')
      pu.selection = [pu.centerlist[0]]
    })
    await page.keyboard.press('5')
    const digits = () => page.evaluate(() => Object.values(pu.pu_q.number).map((n) => n[0]))
    assert.deepEqual(await settle(digits, ['5']), ['5'])
  })
})
