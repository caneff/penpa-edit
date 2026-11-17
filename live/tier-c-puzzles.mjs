// Tier C's puzzles (`live/tier-c.mjs`): each built on a fresh page, its answer found in Node, checked valid, written as
// the author's answer, and its solve link made with the answer check on; and the puzzle of a solver's converted solve
// history, read back from its recording. Not a check itself, so `live/**/*.live.mjs` skips it.
import { canonicalState, readEngineState } from './canonical-state.mjs'
import { random } from './fuzz.mjs'
import { openPenpa } from './page.mjs'
import { dragSteps, engineDriver, pressSteps, typedSteps } from './replay.mjs'
import { settle } from './settle.mjs'

// The puzzles, by the names their recordings and tests carry.
export const TIER_C_PUZZLES = ['sudoku-9x9', 'sudoku-6x6', 'killer', 'starbattle', 'slitherlink', 'or-shading']

// Upstream's puzz.link imports (`test/public/puzz_link_parser.js`) the puzzles start from.
export const IMPORTS = {
  'sudoku-9x9': 'https://puzz.link/p?sudoku/9/9/15i96l17i7g65i42k1g5368h2i7g2p3h5g48g2g9k3h7i6',
  'sudoku-6x6': 'https://puzz.link/p?sudoku/6/6/g3h2g5j6h1l4h6j3g5g6h',
  // Two stars in each row, column and region.
  starbattle: 'https://puzz.link/p?starbattle/10/10/2/5g252c2qkgbakk98igse7g88cp3730so000u',
  slitherlink: 'https://puzz.link/p?slither/5/5/gch1222ch331bg222'
}
const STARS = 2

// Chance, out of 1, that another piece of noise comes before the next correct entry.
const NOISE = 0.4

// ---- Sudoku ----

// The rows and columns of a box of an n×n sudoku.
function boxShape (n) {
  if (n === 6) return [2, 3]
  const side = Math.sqrt(n)
  if (!Number.isInteger(side)) throw new Error(`no box shape for a ${n}x${n} sudoku`)
  return [side, side]
}

// The cells of the n×n sudoku, row by row, each unit (row, column, box) as a list of indices.
function sudokuUnits (n) {
  const [bh, bw] = boxShape(n)
  const units = []
  for (let i = 0; i < n; i++) {
    units.push([...Array(n).keys()].map((c) => i * n + c))
    units.push([...Array(n).keys()].map((r) => r * n + i))
    const r0 = Math.floor(i / (n / bw)) * bh
    const c0 = (i % (n / bw)) * bw
    units.push([...Array(n).keys()].map((k) => (r0 + Math.floor(k / bw)) * n + c0 + (k % bw)))
  }
  return units
}

// Whether `grid` (n×n digits, row by row) is a completed sudoku that keeps the givens of `givens` (0 for an empty cell).
function isSudokuSolution (grid, givens, n) {
  if (grid.length !== n * n || givens.some((g, i) => g && g !== grid[i])) return false
  const all = [...Array(n).keys()].map((d) => d + 1).join()
  return sudokuUnits(n).every((unit) => unit.map((i) => grid[i]).sort((a, b) => a - b).join() === all)
}

// The first completion of `givens` a depth-first search finds, checked valid.
function solveSudoku (givens, n) {
  const units = sudokuUnits(n)
  const unitsOf = givens.map((_, i) => units.filter((u) => u.includes(i)))
  const grid = [...givens]
  const fits = (i, d) => unitsOf[i].every((u) => u.every((j) => grid[j] !== d))
  const fill = (i) => {
    while (i < grid.length && grid[i]) i++
    if (i === grid.length) return true
    for (let d = 1; d <= n; d++) {
      if (!fits(i, d)) continue
      grid[i] = d
      if (fill(i + 1)) return true
    }
    grid[i] = 0
    return false
  }
  if (!fill(0) || !isSudokuSolution(grid, givens, n)) throw new Error(`the ${n}x${n} sudoku has no solution`)
  return grid
}

// The cages of a killer on the n×n sudoku `grid`, each a run of 2 to 4 cells (or 1, where no free cell is beside it), side by side in order and with no digit
// twice, drawn by `rand`: every cell is in one cage.
function killerCages (grid, n, rand) {
  const cage = Array(grid.length).fill(-1)
  const cages = []
  const order = [...grid.keys()].map((i) => [rand(), i]).sort((a, b) => a[0] - b[0]).map(([, i]) => i)
  for (const start of order) {
    if (cage[start] !== -1) continue
    const cells = [start]
    cage[start] = cages.length
    const length = 2 + Math.floor(rand() * 3)
    while (cells.length < length) {
      const last = cells.at(-1)
      const r = Math.floor(last / n)
      const c = last % n
      const next = [[r, c + 1], [r + 1, c], [r, c - 1], [r - 1, c]]
        .filter(([y, x]) => y >= 0 && y < n && x >= 0 && x < n)
        .map(([y, x]) => y * n + x)
        .filter((i) => cage[i] === -1 && !cells.some((j) => grid[j] === grid[i]))
      if (!next.length) break
      const i = next[Math.floor(rand() * next.length)]
      cage[i] = cages.length
      cells.push(i)
    }
    cages.push(cells)
  }
  return cages
}

// ---- Star battle ----

// Whether `stars` (cell indices of an n×n board, row by row) puts `k` stars in each row, column and region of
// `regions` (a region id per cell), none two touching, even at a corner.
function isStarbattleSolution (stars, regions, n, k) {
  const count = (key) => {
    const counts = new Map()
    for (const s of stars) counts.set(key(s), (counts.get(key(s)) ?? 0) + 1)
    return counts
  }
  const exactly = (counts, size) => counts.size === size && [...counts.values()].every((c) => c === k)
  const touching = stars.some((a) => stars.some((b) => a !== b &&
    Math.abs(Math.floor(a / n) - Math.floor(b / n)) <= 1 && Math.abs((a % n) - (b % n)) <= 1))
  return !touching && exactly(count((s) => Math.floor(s / n)), n) && exactly(count((s) => s % n), n) &&
    exactly(count((s) => regions[s]), new Set(regions).size)
}

// The first placement a row-by-row depth-first search finds, checked valid.
function solveStarbattle (regions, n, k) {
  const lastRow = new Map()
  regions.forEach((r, i) => lastRow.set(r, Math.floor(i / n)))
  const colCount = Array(n).fill(0)
  const regionCount = new Map()
  const stars = []
  // Every way to choose `k` columns of a row, no two side by side.
  const choices = []
  const choose = (from, picked) => {
    if (picked.length === k) return choices.push([...picked])
    for (let c = from; c < n; c++) choose(c + 2, [...picked, c])
  }
  choose(0, [])
  const place = (row) => {
    if (row === n) return true
    const above = new Set(stars.filter((s) => Math.floor(s / n) === row - 1).map((s) => s % n))
    for (const cols of choices) {
      if (cols.some((c) => above.has(c - 1) || above.has(c) || above.has(c + 1) || colCount[c] === k)) continue
      const cells = cols.map((c) => row * n + c)
      cells.forEach((i) => { colCount[i % n]++; regionCount.set(regions[i], (regionCount.get(regions[i]) ?? 0) + 1) })
      stars.push(...cells)
      // A region may not pass k stars, and one with no cell below this row must have k.
      const fits = [...regionCount].every(([r, c]) => c <= k) &&
        [...lastRow].every(([r, last]) => last > row || regionCount.get(r) === k)
      if (fits && place(row + 1)) return true
      stars.splice(-cells.length)
      cells.forEach((i) => { colCount[i % n]--; regionCount.set(regions[i], regionCount.get(regions[i]) - 1) })
    }
    return false
  }
  if (!place(0) || !isStarbattleSolution(stars, regions, n, k)) throw new Error(`the ${n}x${n} star battle has no solution`)
  return stars
}

// Runs in the page: each cell's region, numbered by a flood fill that crosses no border the puzzle draws between two
// cells (a `pu_q.lineE` on the edge between their shared corners), with the cells row by row as `cellsInPage` orders
// them.
function regionsInPage (nums) {
  const shared = (a, b) => pu.point[a].surround.filter((c) => pu.point[b].surround.includes(c)).sort((x, y) => x - y).join(',')
  const n = Math.sqrt(nums.length)
  const regions = Array(nums.length).fill(-1)
  let next = 0
  for (let start = 0; start < nums.length; start++) {
    if (regions[start] !== -1) continue
    const queue = [start]
    regions[start] = next
    while (queue.length) {
      const i = queue.pop()
      const r = Math.floor(i / n)
      const c = i % n
      for (const [dr, dc] of [[0, 1], [1, 0], [0, -1], [-1, 0]]) {
        if (r + dr < 0 || r + dr >= n || c + dc < 0 || c + dc >= n) continue
        const j = (r + dr) * n + c + dc
        if (regions[j] === -1 && !pu.pu_q.lineE[shared(nums[i], nums[j])]) {
          regions[j] = next
          queue.push(j)
        }
      }
    }
    next++
  }
  return regions
}

// ---- Slitherlink ----

// The edges of a board of `rows` by `cols` cells, each between two corners (numbered row by row over the corners'
// `rows + 1` by `cols + 1` grid), with the cells (row by row) it borders: the horizontal edges of each corner row, then
// the vertical edges below it.
function slitherlinkEdges (rows, cols) {
  const corner = (r, c) => r * (cols + 1) + c
  const cell = (r, c) => (r >= 0 && r < rows && c >= 0 && c < cols ? [r * cols + c] : [])
  const edges = []
  for (let r = 0; r <= rows; r++) {
    for (let c = 0; c < cols; c++) edges.push({ ends: [corner(r, c), corner(r, c + 1)], cells: [...cell(r - 1, c), ...cell(r, c)] })
    if (r === rows) break
    for (let c = 0; c <= cols; c++) edges.push({ ends: [corner(r, c), corner(r + 1, c)], cells: [...cell(r, c - 1), ...cell(r, c)] })
  }
  return edges
}

// Whether the edges of `on` (indices of `slitherlinkEdges(rows, cols)`) are one loop that has each clue of `clues` (a
// number or null per cell) as its count of edges around that cell.
function isSlitherlinkSolution (on, clues, rows, cols) {
  const edges = slitherlinkEdges(rows, cols)
  const degree = new Map()
  const around = Array(rows * cols).fill(0)
  for (const e of on) {
    for (const v of edges[e].ends) degree.set(v, (degree.get(v) ?? 0) + 1)
    for (const c of edges[e].cells) around[c]++
  }
  if (!on.length || [...degree.values()].some((d) => d !== 2)) return false
  if (clues.some((clue, c) => clue !== null && clue !== around[c])) return false
  // Every corner the loop passes is reached from the first one along the loop's edges.
  const seen = new Set([edges[on[0]].ends[0]])
  for (let grew = true; grew;) {
    grew = false
    for (const e of on) {
      const [a, b] = edges[e].ends
      if (seen.has(a) !== seen.has(b)) {
        seen.add(a).add(b)
        grew = true
      }
    }
  }
  return seen.size === degree.size
}

// The first loop a depth-first search over the edges finds, checked valid, as indices of `slitherlinkEdges`.
function solveSlitherlink (clues, rows, cols) {
  const edges = slitherlinkEdges(rows, cols)
  const state = Array(edges.length).fill(null)
  const edgesAt = new Map()
  const edgesOf = clues.map(() => [])
  edges.forEach((e, i) => {
    for (const v of e.ends) edgesAt.set(v, [...edgesAt.get(v) ?? [], i])
    for (const c of e.cells) edgesOf[c].push(i)
  })
  // Whether a loop can still pass every corner and clue edge `i` touches.
  const fits = (i) => edges[i].ends.every((v) => {
    const states = edgesAt.get(v).map((j) => state[j])
    const on = states.filter((x) => x === true).length
    return on <= 2 && (states.includes(null) || on === 0 || on === 2)
  }) && edges[i].cells.every((c) => {
    if (clues[c] === null) return true
    const states = edgesOf[c].map((j) => state[j])
    const on = states.filter((x) => x === true).length
    return on <= clues[c] && on + states.filter((x) => x === null).length >= clues[c]
  })
  const on = () => state.flatMap((x, i) => (x ? [i] : []))
  const assign = (i) => {
    if (i === edges.length) return isSlitherlinkSolution(on(), clues, rows, cols)
    for (const value of [true, false]) {
      state[i] = value
      if (fits(i) && assign(i + 1)) return true
    }
    state[i] = null
    return false
  }
  if (!assign(0)) throw new Error(`the ${rows}x${cols} slitherlink has no solution`)
  return on()
}

// Runs in the page: the board's rows and columns, each cell's clue (a number, or null) row by row, and each corner's
// index in `pu.point`, row by row, read from where the points are rather than from the order `surround` lists them in.
function slitherlinkInPage () {
  const cells = pu.centerlist.map((num) => pu.point[num])
  const sorted = (values) => [...new Set(values)].sort((a, b) => a - b)
  const xs = sorted(cells.map((p) => p.x))
  const ys = sorted(cells.map((p) => p.y))
  const corners = new Map()
  for (const p of cells) for (const v of p.surround) corners.set(v, pu.point[v])
  const cx = sorted([...corners.values()].map((p) => p.x))
  const cy = sorted([...corners.values()].map((p) => p.y))
  const cornerNums = Array(cx.length * cy.length)
  for (const [v, p] of corners) cornerNums[cy.indexOf(p.y) * cx.length + cx.indexOf(p.x)] = v
  // A clue that is not a whole number, as a `?`, constrains no count, so it is no clue.
  const clues = Array(xs.length * ys.length).fill(null)
  for (const num of pu.centerlist) {
    const clue = Number(pu.pu_q.number[num]?.[0])
    if (pu.pu_q.number[num] && Number.isInteger(clue)) clues[ys.indexOf(pu.point[num].y) * xs.length + xs.indexOf(pu.point[num].x)] = clue
  }
  // The midpoint of each edge, which a right-click marks with an X: the edge point halfway between its two corners.
  const mids = {}
  for (const [num, p] of pu.point.entries()) if (p && (p.type === 2 || p.type === 3)) mids[`${p.x},${p.y}`] = num
  return { rows: ys.length, cols: xs.length, clues, cornerNums, mids }
}

// ---- Reading a board ----

// Runs in the page: the board's cells row by row, each as its index in `pu.point` and the given digit in it, or 0 for
// none. A given that is not a digit is refused, since the sudoku solver would read it as an empty cell.
function cellsInPage () {
  const cells = pu.centerlist.map((num) => ({ num, x: pu.point[num].x, y: pu.point[num].y }))
  cells.sort((a, b) => a.y - b.y || a.x - b.x)
  return cells.map(({ num }) => {
    const text = pu.pu_q.number[num]?.[0]
    if (text !== undefined && !/^\d+$/.test(String(text))) throw new Error(`the given ${JSON.stringify(text)} in cell ${num} is not a digit`)
    return { num, given: Number(text ?? 0) }
  })
}

// Runs in the page: the mode the page is in, as a mode step names it.
export function openingModeInPage () {
  const edit = pu.mode[pu.mode.qa].edit_mode
  const [submode, style] = pu.mode[pu.mode.qa][edit]
  return { mode: edit, submode, style }
}

// Runs in the page: the board units of each of `nums` in `pu.point`, as a step builder's `board.points` reads them.
export function pointsInPage (nums) {
  return Object.fromEntries(nums.map((n) => [n, { x: pu.point[n].x, y: pu.point[n].y }]))
}

// Resolves once the page's board has loaded, which is after `pu` exists.
export function boardLoaded (page) {
  return settle(() => page.evaluate(readEngineState).then(canonicalState))
}

// A star battle's cells (indices in `pu.point`, row by row), its side and each cell's region.
async function starbattleBoard (page) {
  const cells = (await page.evaluate(cellsInPage)).map((c) => c.num)
  return { cells, n: Math.sqrt(cells.length), regions: await page.evaluate(regionsInPage, cells) }
}

// A slitherlink's rows, columns and clues (a number, or null, per cell row by row), and each edge of
// `slitherlinkEdges(rows, cols)`, in its order, as its two corners' indices in `pu.point` (smaller first, as `lineE`
// keys them) and its midpoint's.
async function slitherlinkBoard (page) {
  const { rows, cols, clues, cornerNums, mids } = await page.evaluate(slitherlinkInPage)
  const corners = await page.evaluate(pointsInPage, cornerNums)
  const edges = slitherlinkEdges(rows, cols).map(({ ends: [a, b] }) => {
    const [pa, pb] = [corners[cornerNums[a]], corners[cornerNums[b]]]
    const mid = mids[`${(pa.x + pb.x) / 2},${(pa.y + pb.y) / 2}`]
    if (mid === undefined) throw new Error(`no edge point between corners ${cornerNums[a]} and ${cornerNums[b]}`)
    const [lo, hi] = [cornerNums[a], cornerNums[b]].sort((x, y) => x - y)
    return { a: lo, b: hi, mid }
  })
  return { rows, cols, clues, edges, corners: cornerNums }
}

// ---- Building a puzzle ----

// Runs in the page: writes each `[prop, key, value]` of `writes` into the author's answer, ticks only the answer-check
// boxes named, and returns the solve link's `#` part.
export function answerLinkInPage ({ writes, boxes }) {
  for (const box of [...document.getElementsByClassName('solcheck'), ...document.getElementsByClassName('solcheck_or')]) box.checked = false
  for (const id of boxes) document.getElementById(id).checked = true
  for (const [prop, key, value] of writes) pu.pu_a[prop][key] = value
  const url = pu.maketext_solve_solution()
  return url.slice(url.indexOf('#'))
}

// The puzzles whose kept recording is a solve of only some of their cells, and how many it leaves open: the rest are
// given. The engine replay in full mode round-trips a duplicate link at every checkpoint, so a recording's cost grows faster than
// its length, and a full 9x9 or killer solve went past the seam's 60-second test limit on CI (#34, controller's
// ruling). The answer-aimed fuzz still solves these puzzles whole.
export const KEPT_OPEN_CELLS = { 'sudoku-9x9': 20, killer: 20 }
// The open cells are drawn from this seed, so the kept puzzle is the same on every build.
const OPEN_SEED = 1

// `answer` (a sudoku's entries still to make) with all but `open` of them, drawn by OPEN_SEED, written into the
// puzzle as givens on `page`; all of it when `open` is not given.
async function givenAllBut (page, answer, open) {
  if (!open) return answer
  const rand = random(OPEN_SEED)
  const kept = new Set(answer.map((c) => [rand(), c]).sort((a, b) => a[0] - b[0]).slice(0, open).map(([, c]) => c))
  await page.evaluate((given) => {
    for (const [num, digit] of given) pu.pu_q.number[num] = [String(digit), 1, '1']
  }, answer.filter((c) => !kept.has(c)).map((c) => [c.num, c.digit]))
  return answer.filter((c) => kept.has(c))
}

// The author's answer digit in a cell, as Penpa+'s edit mode writes it: the digit, colour 2, size 1.
const authorDigit = (digit) => [String(digit), 2, '1']

// What the author's answer and a solver's entries hold: a star, and a line on an edge.
const STAR = [2, 'star', 2]
const LINE = 3

// Each puzzle's builder: given a page with nothing loaded, and for a sudoku a count of open cells (KEPT_OPEN_CELLS), it
// builds the board and returns the solve link's `#` part, the answer as the generator enters it, and what else the
// generator needs.
const BUILDERS = {
  'sudoku-9x9': (page, open) => buildSudoku(page, IMPORTS['sudoku-9x9'], open),
  'sudoku-6x6': (page, open) => buildSudoku(page, IMPORTS['sudoku-6x6'], open),
  killer: buildKiller,
  starbattle: buildStarbattle,
  slitherlink: buildSlitherlink,
  'or-shading': buildOrShading
}

// The OR puzzle's board side and the cells of its answer, as indices of the board's cells row by row.
const OR_SIZE = 5
const OR_CELLS = [1, 2, 7, 10, 13, 14, 17, 21, 23]

// Runs in the page: a new square board of `size` by `size`.
function newBoardInPage (size) {
  document.getElementById('nb_size1').value = size
  document.getElementById('nb_size2').value = size
  create_newboard()
}

// An answer in two OR categories (C1's kind, #13), both filled: the author shades OR_CELLS and puts a black square in
// each, so a solver who does either solves.
async function buildOrShading (page) {
  await page.evaluate(newBoardInPage, OR_SIZE)
  const nums = (await page.evaluate(cellsInPage)).map((c) => c.num)
  const answer = OR_CELLS.map((i) => ({ num: nums[i] }))
  const writes = answer.flatMap(({ num }) => [['surface', num, 1], ['symbol', num, [2, 'square_LL', 1]]])
  const source = await page.evaluate(answerLinkInPage, { writes, boxes: ['sol_or_surface', 'sol_or_square'] })
  return { source, kind: 'shading', answer, cells: nums, nums }
}

async function buildSlitherlink (page) {
  await page.evaluate((u) => import_url(u), IMPORTS.slitherlink)
  const { rows, cols, clues, edges, corners } = await slitherlinkBoard(page)
  const answer = solveSlitherlink(clues, rows, cols).map((i) => edges[i])
  const writes = answer.map(({ a, b }) => ['lineE', `${a},${b}`, LINE])
  const source = await page.evaluate(answerLinkInPage, { writes, boxes: ['sol_loopedge'] })
  return { source, kind: 'edges', answer, edges, nums: [...corners, ...edges.map((e) => e.mid)] }
}

// The killer's cages are drawn from this seed, so the puzzle is the same on every build.
const KILLER_SEED = 1

// A killer on the 9x9 sudoku's solution: its givens taken away, a dashed cage drawn around each cage's cells in Cage
// mode and the cage's sum written in its first cell's corner in Number mode's 1/4, both through the engine's own calls
// in the question layer.
async function buildKiller (page, open) {
  await page.evaluate((u) => import_url(u), IMPORTS['sudoku-9x9'])
  const cells = await page.evaluate(cellsInPage)
  const n = Math.sqrt(cells.length)
  const grid = solveSudoku(cells.map((c) => c.given), n)
  const nums = cells.map((c) => c.num)
  const board = { points: await page.evaluate(pointsInPage, nums) }
  const steps = [{ kind: 'mode', mode: 'cage', submode: '1', style: 10 }]
  const cages = killerCages(grid, n, random(KILLER_SEED))
  for (const cage of cages) steps.push(...(cage.length > 1 ? dragSteps(board, cage.map((i) => nums[i])) : pressSteps(board, nums[cage[0]])))
  steps.push({ kind: 'mode', mode: 'number', submode: '3', style: 1 })
  for (const cage of cages) {
    const first = Math.min(...cage)
    steps.push(...pressSteps(board, nums[first]), ...typedSteps(String(cage.reduce((sum, i) => sum + grid[i], 0))))
  }
  await page.evaluate(() => {
    pu.pu_q.number = {}
    pu.mode_qa('pu_q')
  })
  const apply = engineDriver.start(page)
  for (const step of steps) await apply(step)
  await page.evaluate(() => pu.mode_qa('pu_a'))
  const answer = await givenAllBut(page, cells.map((c, i) => ({ num: c.num, digit: grid[i], row: Math.floor(i / n), col: i % n })), open)
  const writes = answer.map(({ num, digit }) => ['number', num, authorDigit(digit)])
  const source = await page.evaluate(answerLinkInPage, { writes, boxes: ['sol_number'] })
  return { source, kind: 'digits', digits: n, answer, nums }
}

async function buildStarbattle (page) {
  await page.evaluate((u) => import_url(u), IMPORTS.starbattle)
  const { cells, n, regions } = await starbattleBoard(page)
  const answer = solveStarbattle(regions, n, STARS).map((i) => ({ num: cells[i] }))
  const writes = answer.map(({ num }) => ['symbol', num, STAR])
  const source = await page.evaluate(answerLinkInPage, { writes, boxes: ['sol_star'] })
  return { source, kind: 'stars', answer, cells, nums: cells }
}

async function buildSudoku (page, url, open) {
  await page.evaluate((u) => import_url(u), url)
  const cells = await page.evaluate(cellsInPage)
  const n = Math.sqrt(cells.length)
  const givens = cells.map((c) => c.given)
  const grid = solveSudoku(givens, n)
  const answer = await givenAllBut(page, cells.flatMap((c, i) => c.given ? [] : [{ num: c.num, digit: grid[i], row: Math.floor(i / n), col: i % n }]), open)
  const writes = answer.map(({ num, digit }) => ['number', num, authorDigit(digit)])
  const source = await page.evaluate(answerLinkInPage, { writes, boxes: ['sol_number'] })
  return { source, kind: 'digits', digits: n, answer, nums: answer.map((c) => c.num) }
}

// The mode a link opens in and the board units of each of `nums`, read from a fresh page of the link.
async function solvePage (browser, source, nums) {
  return withPage(browser, source, async (page) => {
    await boardLoaded(page)
    return { mode: await page.evaluate(openingModeInPage), points: await page.evaluate(pointsInPage, nums) }
  })
}

// Builds the puzzle named `name` (one of TIER_C_PUZZLES) and returns it: `name`, `source` (its solve link's `#` part),
// `kind` (how its answer is entered), `mode` (the mode the link opens in), `answer` (the entries the generator makes),
// `points` (the board units of every point the generator presses), and the kind's own fields. `open`, for a sudoku,
// leaves only that many of its answer's cells open and gives the rest.
export async function buildPuzzle (browser, name, { open } = {}) {
  const { nums, ...puzzle } = await withPage(browser, '', (page) => BUILDERS[name](page, open))
  return { name, ...puzzle, ...await solvePage(browser, puzzle.source, nums) }
}

// ---- A solver's history ----

// The genres a solve history is checked in, each by the property its answer is in: the solve's last board, read as
// that genre's answer, must be a valid solution of the board before it becomes the recording's answer.
const HISTORY_GENRES = {
  symbol: { kind: 'stars', box: 'sol_star', isAnswer: (value) => value[1] === 'star' && value[0] >= 1 && value[0] <= 3 },
  lineE: { kind: 'edges', box: 'sol_loopedge', isAnswer: (value, key) => key.includes(',') && value === LINE }
}

// The puzzle of a solver's history on `page` (the history's puzzle, with nothing entered), from `last`, its final board
// as `[prop, key, value]` entries: its answer (each entry the genre counts), the writes and box that make it the
// author's answer, and what the generator needs to solve it again. Refused when the board holds no answer of a known
// genre, or when the answer is not a valid solution of the board: an unfinished or wrong solve.
export async function historyPuzzle (page, last) {
  const found = Object.keys(HISTORY_GENRES).filter((prop) => last.some(([p, key, value]) => p === prop && HISTORY_GENRES[prop].isAnswer(value, String(key))))
  if (found.length !== 1) throw new Error(`the history's last board holds ${found.length ? 'answers of two genres' : 'no star battle or slitherlink answer'}`)
  const [prop] = found
  const { kind, box, isAnswer } = HISTORY_GENRES[prop]
  const writes = last.filter(([p, key, value]) => p === prop && isAnswer(value, String(key)))
  if (kind === 'stars') {
    const { cells, n, regions } = await starbattleBoard(page)
    const stars = writes.map(([, key]) => cells.indexOf(Number(key)))
    const k = stars.length / n
    if (!isStarbattleSolution(stars, regions, n, k)) throw new Error(`the history's last board is not a solved star battle (${stars.length} stars on a ${n}x${n} board)`)
    return { kind, box, writes, answer: stars.map((i) => ({ num: cells[i] })), cells, nums: cells }
  }
  const { rows, cols, clues, edges, corners } = await slitherlinkBoard(page)
  const on = writes.map(([, key]) => edges.findIndex((e) => `${e.a},${e.b}` === key))
  if (on.includes(-1) || !isSlitherlinkSolution(on, clues, rows, cols)) throw new Error(`the history's last board is not a solved slitherlink (${on.length} edges)`)
  return { kind, box, writes, answer: on.map((i) => edges[i]), edges, nums: [...corners, ...edges.map((e) => e.mid)] }
}

// The puzzle of a converted history's recording, for the answer-aimed fuzz: its link, and its answer read from the
// recording's final board.
export async function puzzleFromRecording (browser, id, recording) {
  const { source } = recording.header
  const last = Object.entries(recording.final.pu_a).flatMap(([prop, values]) =>
    HISTORY_GENRES[prop] ? Object.entries(values).map(([key, value]) => [prop, key, value]) : [])
  const { nums, box, writes, ...puzzle } = await withPage(browser, source, async (page) => {
    await boardLoaded(page)
    return historyPuzzle(page, last)
  })
  return { name: id, source, ...puzzle, ...await solvePage(browser, source, nums) }
}

export async function withPage (browser, query, act) {
  const { context, page } = await openPenpa(browser, query)
  try {
    return await act(page)
  } finally {
    await context.close()
  }
}
