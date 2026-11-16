// Edit mode: Number's 1/4 sub-mode, pressed on a cell's own index as the engine driver does (`buildKiller` in
// `tier-c-puzzles.mjs`), leaves a selection that is not a point; switching to the answer layer (Sudoku mode) must not
// draw it (#118).
import assert from 'node:assert/strict'
import { after, before, describe, it } from 'node:test'
import { openPenpa, useBrowser } from './page.mjs'

const browser = useBrowser()
const SUDOKU = 'https://puzz.link/p?sudoku/9/9/15i96l17i7g65i42k1g5368h2i7g2p3h5g48g2g9k3h7i6'

describe('stale 1/4 selection', () => {
  let opened
  before(async () => { opened = await openPenpa(browser()) })
  after(async () => { await opened?.context.close() })

  it('is not drawn when the answer layer opens', async () => {
    const { page } = opened
    await page.evaluate((u) => import_url(u), SUDOKU)
    const stale = await page.evaluate(() => {
      pu.mode_qa('pu_q')
      pu.mode_set('number')
      pu.submode_check('sub_number3')
      pu.mouse_mode = 'down_left'
      pu.mouse_numberS(0, 0, pu.centerlist[0], '3')
      return pu.selection.filter((k) => !pu.point[k])
    })
    assert.notDeepEqual(stale, [], 'the 1/4 press left a selection that is not a point, so the repro is live')
    await page.evaluate(() => pu.mode_qa('pu_a'))
    assert.deepEqual(await page.evaluate(() => pu.selection.filter((k) => !pu.point[k])), [], 'no stale index is left')
  })
})
