// Copy and paste (`pu.copy_handler`, `pu.paste_handler`) on a live page, with stub clipboard events.
import assert from 'node:assert/strict'
import { after, before, describe, it } from 'node:test'
import { openPenpa, useBrowser } from './page.mjs'

const browser = useBrowser()

// Runs in the page. Puts a question number in each `source` cell ([dx, dy, t, value], offsets from the `base` cell's
// [x, y]; `t` is a triangle grid's up or down orientation, 0 elsewhere), selects those cells in `selectionOrder` (indices
// into `source`), copies, selects the `target` cells (offsets from `base`; the first is the one that pasting must treat
// as the corner) in reverse order, pastes, and returns the numbers now on the grid as [dx, dy, t, value] from that first target cell.
function copyPasteInPage ({ gridtype, base, source, selectionOrder, target }) {
  UserSettings.gridtype = gridtype
  pu = make_class(gridtype)
  pu.reset_frame()
  pu.mode_set('number')
  const isTri = gridtype === 'tri'
  const keyOf = (x, y, t) => (isTri ? `${x},${y},${t}` : `${x},${y}`)
  const cellAt = {}
  for (const k of pu.centerlist) cellAt[keyOf(...pu.point[k].index.slice(0, isTri ? 3 : 2))] = k
  const [x0, y0] = base
  const find = (dx, dy, t) => {
    const k = cellAt[keyOf(x0 + dx, y0 + dy, t)]
    if (k === undefined) throw new Error(`no cell at offset (${dx}, ${dy}, ${t})`)
    return k
  }
  for (const [dx, dy, t, value] of source) pu.pu_q.number[find(dx, dy, t)] = [String(value), 1, '1']
  const store = {}
  pu.selection = selectionOrder.map((i) => find(...source[i].slice(0, 3)))
  pu.copy_handler({ target: { id: '', tagName: 'CANVAS' }, clipboardData: { setData: (t, v) => { store[t] = v } }, preventDefault () {} })
  for (const k of Object.keys(pu.pu_q.number)) delete pu.pu_q.number[k]
  pu.selection = target.map((cell) => find(...cell)).reverse()
  pu.paste_handler({ target: { id: '' }, clipboardData: { getData: (t) => store[t] || '' }, preventDefault () {} })
  const [tx, ty] = [x0 + target[0][0], y0 + target[0][1]]
  return Object.keys(pu.pu_q.number)
    .map((k) => [pu.point[k].index[0] - tx, pu.point[k].index[1] - ty, isTri ? pu.point[k].index[2] : 0, Number(pu.pu_q.number[k][0])])
    .sort((a, b) => a[1] - b[1] || a[0] - b[0] || a[2] - b[2])
}

// Every order a 2x2 block's four cells can be selected from a corner in; cell 0 is the top left, 1 the top right, 2 the bottom left, 3 the bottom right.
const SELECTION_ORDERS = { 'top left': [0, 1, 2, 3], 'bottom right': [3, 2, 1, 0], 'top right': [1, 0, 3, 2], 'bottom left': [2, 3, 0, 1] }

// A 2x2 block of cells numbered 1 to 4 in reading order, `rowGap` rows apart (2 on grids whose odd rows are offset).
const block = (rowGap) => [[0, 0, 0, 1], [1, 0, 0, 2], [0, rowGap, 0, 3], [1, rowGap, 0, 4]]

describe('copy and paste', () => {
  let opened
  before(async () => { opened = await openPenpa(browser()) })
  after(async () => { await opened?.context.close() })
  const run = (args) => opened.page.evaluate(copyPasteInPage, args)

  for (const [gridtype, base, rowGap, target] of [['square', [3, 3], 1, [[4, 3, 0]]], ['hex', [14, 8], 2, [[0, 6, 0]]]]) {
    describe(`on a ${gridtype} grid`, () => {
      for (const [corner, selectionOrder] of Object.entries(SELECTION_ORDERS)) {
        it(`pastes a selection started from the ${corner} where it was copied from`, async () => {
          const source = block(rowGap)
          assert.deepEqual(await run({ gridtype, base, source, selectionOrder, target }), source.map(([dx, dy, t, v]) => [dx, dy, t, v]))
        })
      }
    })
  }

  describe('on a triangle grid', () => {
    // Up and down triangles on two rows, base the first of them; pasted onto two cells whose corner is the up one, though the down one has the smaller id.
    const base = [5, 8]
    const source = [[0, 0, 0, 1], [0, 0, 1, 2], [1, 0, 0, 3], [0, 2, 0, 4]]
    const target = [[1, -2, 0], [2, -2, 1]]

    for (const [name, selectionOrder] of Object.entries({ forwards: [0, 1, 2, 3], backwards: [3, 2, 1, 0] })) {
      it(`copies a selection ordered ${name} without an error and pastes it where it was copied from`, async () => {
        assert.deepEqual(await run({ gridtype: 'tri', base, source, selectionOrder, target }), source)
      })
    }
  })
})
