// A left click with a Shape tool on `solve.html` places the shape's first variant, and again clears it, whatever Penpa's
// hidden input-panel setting is, and picking the tool leaves that setting as it was (#130).
import assert from 'node:assert/strict'
import { after, before, describe, it } from 'node:test'
import { linkFromNewBoard, openPenpa, useBrowser } from './page.mjs'

const browser = useBrowser()
const CELL = 12

// Runs in the page. A 6x6 board with no tab set, so its solve link offers every mode.
function newBoardSolveLinkInPage () {
  document.getElementById('nb_size1').value = 6
  document.getElementById('nb_size2').value = 6
  create_newboard()
  const url = pu.maketext_solve()
  return url.slice(url.indexOf('#'))
}

async function openSolve (panelShown) {
  const link = await linkFromNewBoard(browser(), newBoardSolveLinkInPage)
  const opened = await openPenpa(browser(), link, { solve: true, contextOptions: { viewport: { width: 1400, height: 900 } } })
  await opened.page.getByRole('region', { name: 'Board' }).waitFor()
  await opened.page.evaluate(() => engine.ready)
  if (panelShown !== undefined) await opened.page.evaluate((on) => { UserSettings.panel_shown = on }, panelShown)
  return opened
}

async function clickCell (page, button = 'left') {
  const { x, y } = await page.evaluate((index) => {
    const canvas = [...document.querySelectorAll('canvas')].find((c) => c.getBoundingClientRect().width > 0)
    const rect = canvas.getBoundingClientRect()
    const point = pu.point[pu.centerlist[index]]
    return { x: rect.left + point.x, y: rect.top + point.y }
  }, CELL)
  await page.mouse.click(x, y, { button })
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
      await clickCell(opened.page)
      assert.deepEqual((await shapeAtCell(opened.page))?.slice(0, 2), [1, 'circle_L'])
      await clickCell(opened.page)
      assert.equal(await shapeAtCell(opened.page), null)
      await clickCell(opened.page)
      assert.deepEqual((await shapeAtCell(opened.page))?.slice(0, 2), [1, 'circle_L'])
      assert.equal(await panelSetting(opened.page), setting, 'clicking leaves the panel setting alone')
    })
  })
}
