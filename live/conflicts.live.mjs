// The conflict checkers (`pu.check_conflict`) on a live page: small sudokus and consecutive-pairs bars.
import assert from 'node:assert/strict'
import { after, before, describe, it } from 'node:test'
import { openPenpa, useBrowser } from './page.mjs'

const browser = useBrowser()

// Runs in the page. Builds an empty `size`x`size` square grid tagged `tag`, fills `givens` ([x, y, value] with x, y
// counted from the grid's top left) as large black question numbers, adds each `symbols` entry ([x1, y1, x2, y2,
// symbol]) on the edge between those two cells, runs `pu.check_conflict` and returns the conflicting cells as [x, y].
function checkInPage ({ size, tag, givens, symbols = [] }) {
  document.getElementById('nb_size1').value = size
  document.getElementById('nb_size2').value = size
  create_newboard()
  pu.user_tags = [tag]
  const cell = (x, y) => pu.conflicts.xy_to_index(x, y)
  for (const [x, y, value] of givens) pu.pu_q.number[cell(x, y)] = [String(value), 1, '1']
  for (const [x1, y1, x2, y2, symbol] of symbols) {
    const pair = [cell(x1, y1), cell(x2, y2)].sort((a, b) => a - b).join(',')
    const edge = Object.keys(pu.point).find((k) => pu.point[k].neighbor.length === 2 && [...pu.point[k].neighbor].sort((a, b) => a - b).join(',') === pair)
    if (edge === undefined) throw new Error(`no edge between cells (${x1}, ${y1}) and (${x2}, ${y2})`)
    pu.pu_q.symbol[edge] = symbol
  }
  pu.conflicts.reset()
  pu.check_conflict('')
  return pu.conflict_cells.map((i) => pu.conflicts.index_to_xy(i)).sort((a, b) => a[1] - b[1] || a[0] - b[0])
}

describe('conflict checks', () => {
  let opened
  before(async () => { opened = await openPenpa(browser()) })
  after(async () => { await opened?.context.close() })
  const check = (args) => opened.page.evaluate(checkInPage, args)

  describe('a classic sudoku smaller than 9x9', () => {
    it('flags two 1s in a row of a 6x6', async () => {
      const cells = await check({ size: 6, tag: 'classic', givens: [[0, 0, 1], [4, 0, 1]] })
      assert.deepEqual(cells, [[0, 0], [4, 0]])
    })

    it('flags two 1s in one box of a 4x4 (2x2 boxes)', async () => {
      const cells = await check({ size: 4, tag: 'classic', givens: [[0, 0, 1], [1, 1, 1]] })
      assert.deepEqual(cells, [[0, 0], [1, 1]])
    })

    it('flags two 1s in one box of a 6x6 (2 rows by 3 columns)', async () => {
      const cells = await check({ size: 6, tag: 'classic', givens: [[0, 0, 1], [2, 1, 1]] })
      assert.deepEqual(cells, [[0, 0], [2, 1]])
    })

    it('does not flag two 1s in different boxes of a 6x6', async () => {
      // (2, 0) and (3, 1) touch diagonally across the 3-column box border, and share no row or column.
      const cells = await check({ size: 6, tag: 'classic', givens: [[2, 0, 1], [3, 1, 1]] })
      assert.deepEqual(cells, [])
    })

    it('flags two 1s in one box of an 8x8 (2 rows by 4 columns)', async () => {
      const cells = await check({ size: 8, tag: 'classic', givens: [[0, 0, 1], [3, 1, 1]] })
      assert.deepEqual(cells, [[0, 0], [3, 1]])
    })
  })

  describe('consecutive pairs', () => {
    // A valid 4x4 sudoku. Its cells (0, 0) and (0, 1) hold 1 and 3, which are not consecutive.
    const solved = [[1, 2, 3, 4], [3, 4, 1, 2], [2, 1, 4, 3], [4, 3, 2, 1]]
      .flatMap((row, y) => row.map((value, x) => [x, y, value]))

    it('does not read an inequality sign as a bar', async () => {
      const cells = await check({ size: 4, tag: 'consecutivepairs', givens: solved, symbols: [[0, 0, 0, 1, [5, 'inequality', 2]]] })
      assert.deepEqual(cells, [])
    })

    it('still flags a circle between two cells that are not consecutive', async () => {
      const cells = await check({ size: 4, tag: 'consecutivepairs', givens: solved, symbols: [[0, 0, 0, 1, [12, 'circle_SS', 2]]] })
      assert.deepEqual(cells, [[0, 0], [0, 1]])
    })
  })
})
