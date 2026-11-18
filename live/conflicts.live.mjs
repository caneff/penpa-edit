// The conflict checkers (`pu.check_conflict`) on a live page: small sudokus and consecutive-pairs bars.
import assert from 'node:assert/strict'
import { after, before, describe, it } from 'node:test'
import { openPenpa, useBrowser } from './page.mjs'

const browser = useBrowser()

// Runs in the page. Builds an empty `size`x`size` square grid tagged `tag`, fills `givens` ([x, y, value] with x, y
// counted from the grid's top left) as large black question numbers, adds each `symbols` entry ([x1, y1, x2, y2,
// symbol]) on the edge between those two cells, draws region lines around boxes of `boxes` = [rows, columns]
// cells (none when absent) or only the horizontal lines between `bands` rows (a partly drawn layout), runs `pu.check_conflict` and returns the conflicting cells as [x, y].
function checkInPage ({ size, tag, givens, symbols = [], boxes, bands, solve }) {
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
  if (boxes) {
    // A line is keyed by its two vertices; a vertex (vx, vy) counts from the grid's top left corner.
    const vertex = (vx, vy) => pu.nx0 * pu.ny0 + (vy + 1) * pu.nx0 + vx + 1
    const draw = (a, b) => { pu.pu_q.lineE[`${a},${b}`] = 2 }
    for (let y = 0; y < size; y++) {
      for (let x = 0; x < size; x++) {
        if (y > 0 && y % boxes[0] === 0) draw(vertex(x, y), vertex(x + 1, y))
        if (x > 0 && x % boxes[1] === 0) draw(vertex(x, y), vertex(x, y + 1))
      }
    }
  }
  if (bands) {
    const vertex = (vx, vy) => pu.nx0 * pu.ny0 + (vy + 1) * pu.nx0 + vx + 1
    for (let y = bands; y < size; y += bands) {
      for (let x = 0; x < size; x++) pu.pu_q.lineE[`${vertex(x, y)},${vertex(x + 1, y)}`] = 2
    }
  }
  if (solve) {
    // The givens become the answer, which is also the author's solution: `check_solution` then solves unless a conflict stops it.
    for (const [x, y, value] of givens) pu.pu_a.number[cell(x, y)] = [String(value), 2, '1']
    pu.pu_q.number = {}
    pu.solution = JSON.stringify(pu.make_solution())
    pu.sol_flag = 0
    pu.check_solution()
    return pu.sol_flag
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

  describe('a classic sudoku with its boxes drawn', () => {
    // A valid 6x6 whose boxes are 3 rows by 2 columns.
    const solved = [[1, 2, 3, 4, 5, 6], [3, 4, 5, 6, 1, 2], [5, 6, 1, 2, 3, 4], [2, 1, 4, 3, 6, 5], [4, 3, 6, 5, 2, 1], [6, 5, 2, 1, 4, 3]]
    const fill = solved.flatMap((row, y) => row.map((value, x) => [x, y, value]))

    it('reads the drawn 3x2 boxes of a correct 6x6, not the 2x3 default', async () => {
      assert.deepEqual(await check({ size: 6, tag: 'classic', givens: fill, boxes: [3, 2] }), [])
    })

    it('reaches solved on a correct 6x6 with drawn 3x2 boxes', async () => {
      assert.equal(await check({ size: 6, tag: 'classic', givens: fill, boxes: [3, 2], solve: true }), 1)
    })

    it('flags two equal digits in one drawn 3x2 box', async () => {
      const cells = await check({ size: 6, tag: 'classic', givens: [[0, 0, 1], [1, 2, 1]], boxes: [3, 2] })
      assert.deepEqual(cells, [[0, 0], [1, 2]])
    })

    it('does not flag two digits that share only a default 2x3 box', async () => {
      const cells = await check({ size: 6, tag: 'classic', givens: [[0, 0, 1], [2, 1, 1]], boxes: [3, 2] })
      assert.deepEqual(cells, [])
    })

    it('keeps the size default while the lines are partly drawn', async () => {
      // Horizontal lines every 3 rows cut the 9x9 into two bands of 27 cells: no box yet, so the 3x3 default applies.
      const cells = await check({ size: 9, tag: 'classic', givens: [[0, 0, 1], [2, 2, 1]], bands: 3 })
      assert.deepEqual(cells, [[0, 0], [2, 2]])
    })

    it('flags two equal digits in one drawn 2x3 box of a 6x6', async () => {
      const cells = await check({ size: 6, tag: 'classic', givens: [[0, 0, 1], [2, 1, 1]], boxes: [2, 3] })
      assert.deepEqual(cells, [[0, 0], [2, 1]])
    })

    it('flags two equal digits in one drawn 3x3 box of a 9x9', async () => {
      const cells = await check({ size: 9, tag: 'classic', givens: [[0, 0, 1], [2, 2, 1]], boxes: [3, 3] })
      assert.deepEqual(cells, [[0, 0], [2, 2]])
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
