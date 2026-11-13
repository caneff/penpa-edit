// Copy and paste (`pu.copy_handler`, `pu.paste_handler`) on a live page, driven with the same clipboard events the browser sends.
import assert from 'node:assert/strict'
import { after, before, describe, it } from 'node:test'
import { openPenpa, useBrowser } from './page.mjs'

const browser = useBrowser()

// Runs in the page. Fills `source` cells ([dx, dy, value], offsets from a base cell of the grid) with question numbers,
// selects them in the order given by `dragOrder` (indices into `source`), copies, selects the one cell at (`target`
// offset from the same base cell; `base` is that cell's [x, y], else the grid's middle), pastes, and returns the numbers now at `source` offsets from that cell as [dx, dy, value].
function copyPasteInPage ({ gridtype, base, source, dragOrder, target }) {
  UserSettings.gridtype = gridtype
  pu = make_class(gridtype)
  pu.reset_frame()
  pu.mode_set('number')
  // A triangle grid has two cells per (x, y), told apart by the third index (0 or 1); use one orientation only.
  const upright = pu.centerlist.filter((k) => gridtype !== 'tri' || pu.point[k].index[2] === 0)
  const cellAt = {}
  for (const k of upright) cellAt[pu.point[k].index.slice(0, 2).join(',')] = k
  const [x0, y0] = base ?? pu.point[upright[Math.floor(upright.length / 2)]].index
  const find = (dx, dy) => {
    const k = cellAt[`${x0 + dx},${y0 + dy}`]
    if (k === undefined) throw new Error(`no cell at offset (${dx}, ${dy})`)
    return k
  }
  for (const [dx, dy, value] of source) pu.pu_q.number[find(dx, dy)] = [String(value), 1, '1']
  const store = {}
  pu.selection = dragOrder.map((i) => find(source[i][0], source[i][1]))
  pu.copy_handler({ target: { id: '', tagName: 'CANVAS' }, clipboardData: { setData: (t, v) => { store[t] = v } }, preventDefault () {} })
  for (const k of Object.keys(pu.pu_q.number)) delete pu.pu_q.number[k]
  pu.selection = [find(...target)]
  pu.paste_handler({ target: { id: '' }, clipboardData: { getData: (t) => store[t] || '' }, preventDefault () {} })
  return Object.keys(pu.pu_q.number)
    .map((k) => [pu.point[k].index[0] - x0 - target[0], pu.point[k].index[1] - y0 - target[1], Number(pu.pu_q.number[k][0])])
    .sort((a, b) => a[1] - b[1] || a[0] - b[0])
}

// A 2x2 block whose four corners hold 1 to 4 in reading order, at offsets from the base cell.
const BLOCK = [[0, 0, 1], [1, 0, 2], [0, 1, 3], [1, 1, 4]]

describe('copy and paste on a square grid', () => {
  let opened
  before(async () => { opened = await openPenpa(browser()) })
  after(async () => { await opened?.context.close() })
  const run = (args) => opened.page.evaluate(copyPasteInPage, { gridtype: 'square', source: BLOCK, target: [4, 3], ...args })

  const drags = { 'top left first': [0, 1, 2, 3], 'bottom right first': [3, 2, 1, 0], 'top right first': [1, 0, 3, 2], 'bottom left first': [2, 3, 0, 1] }
  for (const [name, dragOrder] of Object.entries(drags)) {
    it(`pastes a selection dragged from the ${name} where it was copied from`, async () => {
      assert.deepEqual(await run({ dragOrder }), BLOCK)
    })
  }
})

describe('copy and paste on a triangle grid', () => {
  let opened
  before(async () => { opened = await openPenpa(browser()) })
  after(async () => { await opened?.context.close() })

  it('copies and pastes a selection dragged from either end without an error', async () => {
    const source = [[0, 0, 1], [1, 0, 2], [2, 0, 3]]
    for (const dragOrder of [[0, 1, 2], [2, 1, 0]]) {
      const pasted = await opened.page.evaluate(copyPasteInPage, { gridtype: 'tri', base: [5, 8], source, dragOrder, target: [1, 2] })
      assert.deepEqual(pasted, source, `dragged in order ${dragOrder}`)
    }
  })
})
