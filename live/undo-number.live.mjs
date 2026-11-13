// Undo after typing a number in a single cell: one undo removes one group of edits (#55).
import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { openPenpa, useBrowser } from './page.mjs'

const browser = useBrowser()

// Index in `pu.centerlist` of the cells the test shades and types into.
const FIRST_SHADED = 20
const SECOND_SHADED = 22
const TYPED = 12

// Runs in the page: shades the cell at `index` of the center list as its own undo group, through the call a click makes.
function shadeInPage (index) {
  pu.mode_set('surface')
  pu.undoredo_counter++
  pu.set_surface(pu.centerlist[index], 1)
  pu.redraw()
}

// Runs in the page: types a digit into the single empty cell at `index` of the center list, as a key press does.
function typeDigitInPage (index) {
  pu.mode_set('number')
  pu.selection = [pu.centerlist[index]]
  pu.cursol = pu.centerlist[index]
  pu.key_number('5')
}

describe('undo after typing a number in a single cell', () => {
  it('removes one shaded cell, not two, when an undo of the number lay between them', async () => {
    const { context, page } = await openPenpa(browser())
    await page.evaluate(() => { pu.mode.qa = 'pu_a' })
    await page.evaluate(shadeInPage, FIRST_SHADED)
    await page.evaluate(typeDigitInPage, TYPED)
    await page.evaluate(() => pu.undo())
    await page.evaluate(shadeInPage, SECOND_SHADED)
    await page.evaluate(() => pu.undo())
    const shaded = await page.evaluate(() => Object.keys(pu.pu_a.surface))
    const first = String(await page.evaluate((i) => pu.centerlist[i], FIRST_SHADED))
    assert.deepEqual(shaded, [first], 'the first shaded cell survives the undo of the second')
    await context.close()
  })
})
