// A left click with a Shape tool on `solve.html` places the shape's first variant, and again clears it, whatever Penpa+'s
// hidden input-panel setting is, and picking the tool leaves that setting as it was (#130).
import assert from 'node:assert/strict'
import { after, before, describe, it } from 'node:test'
import { newBoardSolveLink, openSolvePage, useBrowser } from './page.mjs'
import { clickCell } from './replay.mjs'

const browser = useBrowser()
const CELL = 12

// A new board's link offers every mode, Shape among them.
async function openSolve (panelShown) {
  const opened = await openSolvePage(browser(), await newBoardSolveLink(browser()))
  if (panelShown !== undefined) await opened.page.evaluate((on) => { UserSettings.panel_shown = on }, panelShown)
  return opened
}

const shapeAtCell = (page) => page.evaluate((index) => readEngineState().pu_a.symbol[pu.centerlist[index]] ?? null, CELL)
const panelSetting = (page) => page.evaluate(() => UserSettings.panel_shown)
const pickCircle = (page) => page.evaluate(() => engine.setTool({ mode: 'symbol', submode: 'circle_L' }))

for (const [title, before_] of [['a fresh profile', undefined], ['the panel setting set to false first', false]]) {
  describe(`a Shape click on ${title}`, () => {
    let opened
    before(async () => { opened = await openSolve(before_) })
    after(async () => { await opened?.context.close() })

    it('places the first variant, then clears it', async () => {
      const setting = await panelSetting(opened.page)
      await pickCircle(opened.page)
      assert.equal(await panelSetting(opened.page), setting, 'picking the tool leaves the panel setting alone')
      await clickCell(opened.page, CELL)
      assert.deepEqual((await shapeAtCell(opened.page))?.slice(0, 2), [1, 'circle_L'])
      await clickCell(opened.page, CELL)
      assert.equal(await shapeAtCell(opened.page), null)
      await clickCell(opened.page, CELL)
      assert.deepEqual((await shapeAtCell(opened.page))?.slice(0, 2), [1, 'circle_L'])
      assert.equal(await panelSetting(opened.page), setting, 'clicking leaves the panel setting alone')
    })
  })
}
