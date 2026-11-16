// index.html saves progress after each change (#162), so the last edit made there reaches the store solve.html reads without
// waiting for the page to unload. Served over one origin so the two pages share the progress store.
import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { board, DIGIT_CELL, makeNumberSolveLink, openPenpa, SHADED_CELL, shadeInPage, typeDigitInPage, useBrowser, waitForDesk } from './page.mjs'
import { duplicateLinkInPage } from './replay.mjs'
import { settle } from './settle.mjs'

const browser = useBrowser()

describe('index.html progress', () => {
  it('writes each edit, undo and redo to the progress store without the page being left', async () => {
    const link = await makeNumberSolveLink(browser())
    const { context, page } = await openPenpa(browser(), link, { served: true })
    const stored = () => page.evaluate(async () => (await localforage.getItem(PenpaProgress.getHash(pu.url))) ?? '')
    const expectStored = async (message) => {
      const want = await page.evaluate(duplicateLinkInPage)
      assert.equal(await settle(stored, want), want, message)
    }
    await page.evaluate(typeDigitInPage, { index: DIGIT_CELL, digit: '7' })
    await expectStored('the digit reached the store')
    await page.evaluate(shadeInPage, SHADED_CELL)
    await expectStored('the shading reached the store')
    await page.evaluate(() => pu.undo())
    await expectStored('the undo reached the store')
    await page.evaluate(() => pu.redo())
    await expectStored('the redo reached the store')
    await context.close()
  })

  it('shows an edit on solve.html when the page is left straight after it', async () => {
    const link = await makeNumberSolveLink(browser())
    const { context, page } = await openPenpa(browser(), link, { served: true })
    // Penpa+'s own save as the page unloads usually finishes first, so it is switched off: only the autosave can have stored the edit.
    await page.evaluate(() => { PenpaProgress.save = async () => {} })
    await page.evaluate(typeDigitInPage, { index: DIGIT_CELL, digit: '7' })
    await page.evaluate(shadeInPage, SHADED_CELL)
    const { number, surface } = (await board(page)).entered
    assert.equal(Object.keys(number).length, 1, 'a digit is on index.html')
    assert.equal(Object.keys(surface).length, 1, 'a cell is shaded on index.html')

    await page.goto(new URL(`/solve.html${link}`, page.url()).href)
    await waitForDesk(page)
    const shown = async () => {
      const { number: shownNumber, surface: shownSurface } = (await board(page)).entered
      return { number: shownNumber, surface: shownSurface }
    }
    assert.deepEqual(await settle(shown, { number, surface }), { number, surface }, 'solve.html shows what index.html had')
    await context.close()
  })
})
