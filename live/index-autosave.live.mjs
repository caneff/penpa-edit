// index.html saves progress after each change (#162), so the last edit made there reaches the store solve.html reads even when
// the page is left at once: Penpa+'s own save as it unloads is not awaited and can lose it. Served over one origin so the
// two pages share the progress store.
import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { board, makeNumberSolveLink, openPenpa, shadeInPage, typeDigitInPage, useBrowser, waitForDesk } from './page.mjs'
import { settle } from './settle.mjs'

const browser = useBrowser()

// Indices in the page's `pu.centerlist` of the cells the test fills, clear of the given and the author's answer.
const DIGIT_CELL = 12
const SHADED_CELL = 14

describe('index.html progress', () => {
  it('a page left for solve.html straight after an edit shows that edit there', async () => {
    const link = await makeNumberSolveLink(browser())
    const { context, page } = await openPenpa(browser(), link, { served: true })
    await page.evaluate(typeDigitInPage, { index: DIGIT_CELL, digit: '7' })
    const solveUrl = new URL(`/solve.html${link}`, page.url()).href
    // The last edit and the navigation start in one task: nothing but a save made before it can reach the store.
    const made = await page.evaluate(([shadeSource, cell, url]) => {
      (0, eval)(`(${shadeSource})`)(cell)
      const { number, surface } = readEngineState().pu_a
      location.href = url
      return { number, surface }
    }, [shadeInPage.toString(), SHADED_CELL, solveUrl])
    assert.equal(Object.keys(made.number).length, 1, 'a digit is on index.html')
    assert.equal(Object.keys(made.surface).length, 1, 'a cell is shaded on index.html')
    await waitForDesk(page)
    const shown = async () => { const { number, surface } = (await board(page)).entered; return { number, surface } }
    assert.deepEqual(await settle(shown, made), made, 'solve.html shows what index.html had')
    await context.close()
  })

  it('writes each edit to the progress store without the page being left', async () => {
    const link = await makeNumberSolveLink(browser())
    const { context, page } = await openPenpa(browser(), link, { served: true })
    const stored = () => page.evaluate(async () => (await localforage.getItem(PenpaProgress.getHash(pu.url))) ?? '')
    // The text Penpa+ saves as the page unloads: the duplicate link of the board as it stands.
    const boardText = () => page.evaluate(() => pu.maketext_duplicate() + '&l=solvedup')
    await page.evaluate(typeDigitInPage, { index: DIGIT_CELL, digit: '7' })
    const afterDigit = await boardText()
    assert.equal(await settle(stored, afterDigit), afterDigit, 'the digit reached the store')
    await page.evaluate(shadeInPage, SHADED_CELL)
    const afterShade = await boardText()
    assert.equal(await settle(stored, afterShade), afterShade, 'the shading reached the store')
    await context.close()
  })
})
