// "Open in Penpa+" (#148): the top bar's escape hatch to `index.html` on the same puzzle, keeping the solver's progress both
// ways through the progress store the two pages share. Served over one origin so the store is shared; the buttons are found
// by role and accessible name and the board is read as Penpa+ would save it (`board`). The timer is not checked: it is a
// running clock, and nothing here reads it.
import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { board, DIGIT_CELL, makeNumberSolveLink, MARK_CELL, SHADED_CELL, openSolvePage, setTool, shadeInPage, typeDigitInPage, useBrowser, waitForDesk } from './page.mjs'
import { clickCell } from './replay.mjs'
import { settle } from './settle.mjs'

const browser = useBrowser()

// The cell the test fills on index.html, clear of the others.
const PENPA_CELL = 15

const entered = async (page) => (await board(page)).entered
const open = (page) => page.getByRole('button', { name: 'Open in Penpa+', exact: true })
const waitForPenpa = (page) => page.waitForFunction(() => typeof pu !== 'undefined' && !document.querySelector('section[aria-label="Board"]'))

async function openWithEntries () {
  const link = await makeNumberSolveLink(browser())
  const opened = await openSolvePage(browser(), link, { served: true })
  const { page } = opened
  await setTool(page, { mode: 'number', submode: '1' })
  await clickCell(page, DIGIT_CELL)
  await page.keyboard.press('7')
  await setTool(page, { mode: 'sudoku', submode: '2' })
  await clickCell(page, MARK_CELL)
  await page.keyboard.press('3')
  await page.evaluate(shadeInPage, SHADED_CELL)
  const made = await entered(page)
  assert.equal(Object.keys(made.number).length, 1, 'a digit is on the solve page')
  assert.equal(Object.keys(made.numberS).length, 1, 'a corner mark is on the solve page')
  assert.equal(Object.keys(made.surface).length, 1, 'a cell is shaded on the solve page')
  return { ...opened, made }
}

describe('Open in Penpa+', () => {
  it('opens index.html with every entry made on the solve page, and the way back keeps what was entered there', async () => {
    const { context, page, made } = await openWithEntries()
    await open(page).click()
    await waitForPenpa(page)
    assert.deepEqual(await settle(() => entered(page), made), made, 'index.html shows what the solve page had')

    await page.evaluate(typeDigitInPage, { index: PENPA_CELL, digit: '5' })
    await page.evaluate(shadeInPage, DIGIT_CELL)
    const madeThere = await entered(page)
    await page.goBack()
    await waitForDesk(page)
    assert.deepEqual(await settle(() => entered(page), madeThere), madeThere, 'the solve page shows what index.html had')
    await context.close()
  })

  it('asks first when the progress is not being saved, and opens index.html only on "Open anyway"', async () => {
    const { context, page } = await openWithEntries()
    await page.evaluate(() => engine.setSetting('local_storage', false))
    await open(page).click()
    const dialog = page.getByRole('dialog', { name: 'Progress is not being saved' })
    await dialog.waitFor()
    assert.equal(new URL(page.url()).pathname, '/solve.html', 'the page stays on the solve page')
    await page.getByRole('button', { name: 'Stay here', exact: true }).click()
    await dialog.waitFor({ state: 'hidden' })
    assert.equal(new URL(page.url()).pathname, '/solve.html', 'Stay here stays')

    await open(page).click()
    await page.getByRole('button', { name: 'Open anyway', exact: true }).click()
    await page.waitForURL(/\/index\.html/)
    await context.close()
  })
})
