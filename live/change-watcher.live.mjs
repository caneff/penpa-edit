// The bridge's change watcher (#322): the solve UI's own redraws on `change` (the coordinates' labels, the trial's depth, a
// tooltip outside the UI's root) are no page change for the engine, and Penpa+'s popups still are.
import assert from 'node:assert/strict'
import { afterEach, beforeEach, describe, it } from 'node:test'
import { assertQuiet, newBoardSolveLink, openSolvePage, useBrowser } from './page.mjs'

const browser = useBrowser()

describe('the engine while the solve UI redraws itself', () => {
  let opened
  beforeEach(async () => { opened = await openSolvePage(browser(), await newBoardSolveLink(browser(), ['Line Normal', 'Sudoku Corner'])) })
  afterEach(async () => { await opened?.context.close() })

  it('stays quiet with board coordinates on', async () => {
    const { page } = opened
    await page.evaluate(async () => (await window.deskReady).setCoordinatesWanted(true))
    assert.ok(await page.locator('.ui-grid-coordinate').count() > 0, 'the coordinates are drawn')
    await assertQuiet(page)
  })

  // The depth label is also written only when its text differs (#258), so this goes red only with that guard and the
  // watcher's filter both gone; the coordinates above are what reverting the filter alone breaks.
  it('stays quiet with a trial open', async () => {
    const { page } = opened
    await page.getByRole('button', { name: 'Try' }).click()
    await page.getByText('Trial 1').waitFor()
    await assertQuiet(page)
  })

  it('stays quiet while a tooltip, which lives outside the UI\'s root, is rewritten on every change', async () => {
    const { page } = opened
    await page.evaluate(() => {
      const tooltip = document.querySelector('wa-tooltip')
      engine.on('change', () => { tooltip.textContent = tooltip.textContent === 'a' ? 'b' : 'a' })
    })
    await assertQuiet(page)
  })

  it('still wakes when one of Penpa+\'s popups opens', async () => {
    const { page } = opened
    await assertQuiet(page)
    const woke = await page.evaluate(() => new Promise((resolve) => {
      engine.on('change', () => resolve(engine.getState().penpaDialogOpen))
      setTimeout(() => resolve('no change'), 1000)
      document.querySelector('.modal').style.display = 'block'
    }))
    assert.equal(woke, true, 'a change comes with the popup open')
  })
})
