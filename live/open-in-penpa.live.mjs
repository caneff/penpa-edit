// "Open in Penpa+" (#148): the top bar's escape hatch to `index.html` on the same puzzle, keeping the solver's progress both
// ways through the progress store the two pages share. Served over one origin so the store is shared; the buttons are found
// by role and accessible name and the board is read as Penpa+ would save it (`board`).
import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { ANSWER_CELL, makeNumberSolveLink, openSolvePage, setTool, typeDigitInPage, typedDigits, useBrowser, waitForDesk } from './page.mjs'
import { clickCell } from './replay.mjs'
import { settle } from './settle.mjs'

const browser = useBrowser()

// Cells of the center list the test types into, apart from the given and the author's answer cell.
const SOLVER_CELL = 12
const PENPA_CELL = 13

const waitForPenpa = (page) => page.waitForFunction(() => typeof pu !== 'undefined' && !document.querySelector('section[aria-label="Board"]'))

describe('Open in Penpa+', () => {
  it('opens index.html on the same puzzle with the solver\'s entries, and the way back keeps what was entered there', async () => {
    const link = await makeNumberSolveLink(browser())
    const { context, page } = await openSolvePage(browser(), link, { served: true })
    await setTool(page, { mode: 'number', submode: '1' })
    await clickCell(page, SOLVER_CELL)
    await page.keyboard.press('7')
    assert.deepEqual(await settle(() => typedDigits(page), ['7']), ['7'], 'the digit is on the solve page')

    await page.getByRole('button', { name: 'Open in Penpa+', exact: true }).click()
    await page.waitForURL(/\/(index\.html)?(\?|#)/)
    await waitForPenpa(page)
    assert.deepEqual(await settle(() => typedDigits(page), ['7']), ['7'], 'index.html shows the solve page\'s entry')

    await page.evaluate(typeDigitInPage, { index: PENPA_CELL, digit: '5' })
    await page.goBack()
    await waitForDesk(page)
    const expected = ['7', '5']
    assert.deepEqual(await settle(() => typedDigits(page), expected), expected, 'the solve page shows the entry made on index.html')
    await context.close()
  })
})
