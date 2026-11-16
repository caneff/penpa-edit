// Edit mode: Number's 1/4 sub-mode, pressed on a cell's own index as the engine driver does, leaves a selection that is
// not a point; Sudoku mode's selection drawing must never see it (#118).
import assert from 'node:assert/strict'
import { after, before, describe, it } from 'node:test'
import { openPenpa, useBrowser } from './page.mjs'
import { IMPORTS } from './tier-c-puzzles.mjs'

const browser = useBrowser()
const SUDOKU = IMPORTS['sudoku-9x9']

describe('stale 1/4 selection', () => {
  let opened
  before(async () => { opened = await openPenpa(browser()) })
  after(async () => { await opened?.context.close() })

  // Presses a cell's own index in Number 1/4, then runs `leave` in the page; returns the selection's non-point indices
  // before and after it. A `draw_selection` TypeError fails the test through `useBrowser`.
  async function staleAfter (leave) {
    const { page } = opened
    await page.evaluate((u) => import_url(u), SUDOKU)
    const before = await page.evaluate(() => {
      pu.mode_qa('pu_q')
      pu.mode_set('number')
      pu.submode_check('sub_number3')
      pu.mouse_mode = 'down_left'
      pu.mouse_numberS(0, 0, pu.centerlist[0], '3')
      return pu.selection.filter((k) => !pu.point[k])
    })
    assert.notDeepEqual(before, [], 'the 1/4 press left a selection that is not a point, so the repro is live')
    return page.evaluate(leave).then(() => page.evaluate(() => pu.selection.filter((k) => !pu.point[k])))
  }

  it('leaves no non-point selection index when the answer layer opens', async () => {
    assert.deepEqual(await staleAfter(() => pu.mode_qa('pu_a')), [])
  })

  it('leaves no non-point selection index when Number changes sub-mode', async () => {
    assert.deepEqual(await staleAfter(() => pu.submode_check('sub_number1')), [])
  })
})
