// The white outline on board text (#144): on by default on `solve.html`, one switch in its Settings dialog, and `index.html` as before.
// The outline is read as white pixels around a black digit on a black cell, where nothing else on the board is white.
import assert from 'node:assert/strict'
import { after, before, describe, it } from 'node:test'
import { GIVEN_CELL, makeNumberSolveLink, openPenpa, openSolvePage, useBrowser, waitForDesk } from './page.mjs'
import { settle } from './settle.mjs'

const browser = useBrowser()

// Surface style 4 is black.
const BLACK_SURFACE = 4
// How much of the cell, from its centre, the pixel count covers, in cell widths: clear of the grid lines.
const CELL_REACH = 0.4
const NEAR_WHITE = 200

// Runs in the page: shades the cell at `index` of the center list black, as its own undo group, and redraws.
function shadeBlackInPage ({ index, style }) {
  pu.mode_set('surface')
  pu.undoredo_counter++
  pu.set_surface(pu.centerlist[index], style)
  pu.redraw()
}

// Runs in the page: how many near-white pixels the cell at `index` of the center list holds in its middle.
function whitePixelsInPage ({ index, cellReach, nearWhite }) {
  const { x, y } = pu.point[pu.centerlist[index]]
  const reach = pu.size * pu.resol * cellReach
  const left = Math.round(x * pu.resol - reach)
  const top = Math.round(y * pu.resol - reach)
  const side = Math.round(reach * 2)
  const { data } = pu.ctx.getImageData(left, top, side, side)
  let white = 0
  for (let i = 0; i < data.length; i += 4) if (data[i] > nearWhite && data[i + 1] > nearWhite && data[i + 2] > nearWhite) white++
  return white
}

const whitePixels = (page) => page.evaluate(whitePixelsInPage, { index: GIVEN_CELL, cellReach: CELL_REACH, nearWhite: NEAR_WHITE })

async function shadeGiven (page) {
  await page.evaluate(shadeBlackInPage, { index: GIVEN_CELL, style: BLACK_SURFACE })
}

const outlineSetting = (page) => page.evaluate(() => engine.getSettings().outline_text)

// Flips the dialog's Outline on text switch as a visitor does, and closes the dialog.
async function flipOutlineSwitch (page) {
  await page.getByRole('button', { name: 'Settings' }).click()
  await page.getByRole('dialog', { name: 'Settings' }).waitFor()
  await page.locator('wa-switch').filter({ has: page.getByRole('switch', { name: 'Outline on text' }) }).click()
  await page.keyboard.press('Escape')
  await page.getByRole('dialog', { name: 'Settings' }).waitFor({ state: 'hidden' })
}

describe('the outline on board text of solve.html', () => {
  let link
  before(async () => { link = await makeNumberSolveLink(browser()) })

  it('is on by default and draws white around a digit on a shaded cell', async () => {
    const { context, page } = await openSolvePage(browser(), link, { served: true })
    try {
      assert.equal(await outlineSetting(page), true)
      await shadeGiven(page)
      assert.notEqual(await whitePixels(page), 0, 'white pixels around the digit')
    } finally {
      await context.close()
    }
  })

  it('goes off and on from the Settings dialog at once, and stays as chosen after a reload', async () => {
    const { context, page } = await openSolvePage(browser(), link, { served: true })
    try {
      await shadeGiven(page)
      await flipOutlineSwitch(page)
      assert.equal(await outlineSetting(page), false)
      assert.equal(await whitePixels(page), 0, 'no white pixels with the switch off, and no reload')

      await page.reload()
      await waitForDesk(page)
      assert.equal(await outlineSetting(page), false, 'off survives a reload')

      await flipOutlineSwitch(page)
      await shadeGiven(page)
      assert.notEqual(await whitePixels(page), 0, 'white pixels with the switch back on')
      await page.reload()
      await waitForDesk(page)
      assert.equal(await outlineSetting(page), true, 'on survives a reload')
    } finally {
      await context.close()
    }
  })

  it('strokes a width that grows with the font size, and keeps the hollow style black', async () => {
    const { context, page } = await openSolvePage(browser(), link, { served: true })
    try {
      const widths = await page.evaluate(() => {
        const ctx = document.createElement('canvas').getContext('2d')
        const widthAt = (size, style) => { set_font_style(ctx, size, style); return ctx.lineWidth }
        return { small: widthAt(10, 1), large: widthAt(40, 1), hollow: widthAt(20, 0), hollowStroke: ctx.strokeStyle }
      })
      assert.ok(widths.small > 0, `a thin outline on small marks, got ${widths.small}`)
      assert.equal(widths.large, widths.small * 4, 'the width follows the font size')
      assert.equal(widths.hollow, 0.5, 'a hollow text keeps Penpa+\'s own stroke width')
      assert.equal(widths.hollowStroke, '#000000', 'a hollow text keeps its black stroke')
    } finally {
      await context.close()
    }
  })
})

describe('the outline on board text of index.html', () => {
  let opened
  before(async () => { opened = await openPenpa(browser(), await makeNumberSolveLink(browser()), { served: true }) })
  after(async () => { await opened?.context.close() })

  it('is off by default and draws no white around a digit on a shaded cell', async () => {
    const { page } = opened
    await settle(() => page.evaluate(() => Boolean(pu.pu_q.number[pu.centerlist[0]])), true)
    assert.equal(await page.evaluate(() => UserSettings.outline_text), false)
    await shadeGiven(page)
    assert.equal(await whitePixels(page), 0)
  })
})
