// Tier C (`research/agentic-legacy-migration.md` § Corpus, #34): full solves on solve links with an answer check. Not a
// check itself, so `live/**/*.live.mjs` skips it.
// - The puzzles: each built on a fresh page, its answer found in Node, checked valid, written as the author's answer,
//   and its solve link made with the answer check on.
// - The generator: a puzzle's answer entered in a seeded random order through the recording's steps
//   (`live/replay.mjs`), with pencil marks, helper marks, wrong entries later corrected, undo and redo, and mode changes
//   mixed in where the genre has them.
// - The answer run: a generated solve made through the engine driver, checked as the answer-aimed fuzz checks it.
import { canonicalState, readEngineState } from './canonical-state.mjs'
import { random } from './fuzz.mjs'
import { openPenpa } from './page.mjs'
import { endsGroup, engineDriver, stepWords } from './replay.mjs'
import { settle } from './settle.mjs'

// The puzzles, by the names their recordings and tests carry.
export const TIER_C_PUZZLES = ['sudoku-9x9', 'sudoku-6x6', 'killer', 'starbattle', 'slitherlink', 'or-shading']
// The seeds the seam's answer-aimed fuzz solves every puzzle with, and the one a kept recording is made with.
export const TIER_C_SEEDS = [1, 2, 3]
export const RECORDING_SEED = 1

// Upstream's puzz.link imports (`test/public/puzz_link_parser.js`) the puzzles start from.
const IMPORTS = {
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
export function isSudokuSolution (grid, givens, n) {
  if (grid.length !== n * n || givens.some((g, i) => g && g !== grid[i])) return false
  const all = [...Array(n).keys()].map((d) => d + 1).join()
  return sudokuUnits(n).every((unit) => unit.map((i) => grid[i]).sort((a, b) => a - b).join() === all)
}

// The first completion of `givens` a depth-first search finds, checked valid.
export function solveSudoku (givens, n) {
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
export function killerCages (grid, n, rand) {
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
export function isStarbattleSolution (stars, regions, n, k) {
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
export function solveStarbattle (regions, n, k) {
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
export function isSlitherlinkSolution (on, clues, rows, cols) {
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
export function solveSlitherlink (clues, rows, cols) {
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

// ---- Building a puzzle ----

// Runs in the page: the board's cells row by row, each as its index in `pu.point`, and the given digit in it or 0.
function cellsInPage () {
  const cells = pu.centerlist.map((num) => ({ num, x: pu.point[num].x, y: pu.point[num].y }))
  cells.sort((a, b) => a.y - b.y || a.x - b.x)
  return cells.map(({ num }) => ({ num, given: Number(pu.pu_q.number[num]?.[0]) || 0 }))
}

// Runs in the page: writes each `[prop, key, value]` of `writes` into the author's answer, ticks only the answer-check
// boxes named, and returns the solve link's `#` part.
function answerLinkInPage ({ writes, boxes }) {
  for (const box of [...document.getElementsByClassName('solcheck'), ...document.getElementsByClassName('solcheck_or')]) box.checked = false
  for (const id of boxes) document.getElementById(id).checked = true
  for (const [prop, key, value] of writes) pu.pu_a[prop][key] = value
  const url = pu.maketext_solve_solution()
  return url.slice(url.indexOf('#'))
}

// Runs in the page: the opening mode, and the board units of each of `nums` in `pu.point`.
function solvePageInPage (nums) {
  const edit = pu.mode[pu.mode.qa].edit_mode
  const [submode, style] = pu.mode[pu.mode.qa][edit]
  return { mode: { mode: edit, submode, style }, points: Object.fromEntries(nums.map((n) => [n, { x: pu.point[n].x, y: pu.point[n].y }])) }
}

// Each puzzle's builder: given a page with nothing loaded, it builds the board and returns the solve link's `#` part,
// the answer as the generator enters it, and what else the generator needs.
const BUILDERS = {
  'sudoku-9x9': (page) => buildSudoku(page, IMPORTS['sudoku-9x9']),
  'sudoku-6x6': (page) => buildSudoku(page, IMPORTS['sudoku-6x6']),
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
  const { rows, cols, clues, cornerNums, mids } = await page.evaluate(slitherlinkInPage)
  const corners = await page.evaluate((nums) => nums.map((n) => ({ x: pu.point[n].x, y: pu.point[n].y })), cornerNums)
  // Each edge as its two corners' indices in `pu.point`, smaller first as `lineE` keys them, and its midpoint.
  const edges = slitherlinkEdges(rows, cols).map(({ ends: [a, b] }) => {
    const mid = mids[`${(corners[a].x + corners[b].x) / 2},${(corners[a].y + corners[b].y) / 2}`]
    if (mid === undefined) throw new Error(`no edge point between corners ${cornerNums[a]} and ${cornerNums[b]}`)
    const [lo, hi] = [cornerNums[a], cornerNums[b]].sort((x, y) => x - y)
    return { a: lo, b: hi, mid }
  })
  const answer = solveSlitherlink(clues, rows, cols).map((i) => edges[i])
  const writes = answer.map(({ a, b }) => ['lineE', `${a},${b}`, 3])
  const source = await page.evaluate(answerLinkInPage, { writes, boxes: ['sol_loopedge'] })
  return { source, kind: 'edges', answer, edges, nums: [...cornerNums, ...edges.map((e) => e.mid)] }
}

// The killer's cages are drawn from this seed, so the puzzle is the same on every build.
const KILLER_SEED = 1

// A killer on the 9x9 sudoku's solution: its givens taken away, a dashed cage drawn around each cage's cells in Cage
// mode and the cage's sum written in its first cell's corner in Number mode's 1/4, both through the engine's own calls
// in the question layer.
async function buildKiller (page) {
  await page.evaluate((u) => import_url(u), IMPORTS['sudoku-9x9'])
  const cells = await page.evaluate(cellsInPage)
  const n = Math.sqrt(cells.length)
  const grid = solveSudoku(cells.map((c) => c.given), n)
  const nums = cells.map((c) => c.num)
  const points = await page.evaluate((nums) => Object.fromEntries(nums.map((n) => [n, { x: pu.point[n].x, y: pu.point[n].y }])), nums)
  const board = { points }
  const steps = [{ kind: 'mode', mode: 'cage', submode: '1', style: 10 }]
  const cages = killerCages(grid, n, random(KILLER_SEED))
  for (const cage of cages) steps.push(...(cage.length > 1 ? drag(board, cage.map((i) => nums[i])) : press(board, nums[cage[0]])))
  steps.push({ kind: 'mode', mode: 'number', submode: '3', style: 1 })
  for (const cage of cages) {
    const first = Math.min(...cage)
    steps.push(...press(board, nums[first]), ...typed(String(cage.reduce((sum, i) => sum + grid[i], 0))))
  }
  await page.evaluate(() => {
    pu.pu_q.number = {}
    pu.mode_qa('pu_q')
  })
  const apply = engineDriver.start(page)
  for (const step of steps) await apply(step)
  // Number's 1/4 leaves a selection that is not a cell, which Sudoku mode's selection drawing throws on (a follow-up
  // of #34's), so it goes before the switch back to the answer layer.
  await page.evaluate(() => {
    pu.selection = []
    pu.mode_qa('pu_a')
  })
  const answer = cells.map((c, i) => ({ num: c.num, digit: grid[i], row: Math.floor(i / n), col: i % n }))
  const writes = answer.map(({ num, digit }) => ['number', num, [String(digit), 2, '1']])
  const source = await page.evaluate(answerLinkInPage, { writes, boxes: ['sol_number'] })
  return { source, kind: 'digits', digits: n, answer, nums, cages: cages.length }
}

async function buildStarbattle (page) {
  await page.evaluate((u) => import_url(u), IMPORTS.starbattle)
  const nums = (await page.evaluate(cellsInPage)).map((c) => c.num)
  const n = Math.sqrt(nums.length)
  const stars = solveStarbattle(await page.evaluate(regionsInPage, nums), n, STARS)
  const answer = stars.map((i) => ({ num: nums[i] }))
  const writes = answer.map(({ num }) => ['symbol', num, [2, 'star', 2]])
  const source = await page.evaluate(answerLinkInPage, { writes, boxes: ['sol_star'] })
  return { source, kind: 'stars', answer, cells: nums, nums }
}

async function buildSudoku (page, url) {
  await page.evaluate((u) => import_url(u), url)
  const cells = await page.evaluate(cellsInPage)
  const n = Math.sqrt(cells.length)
  const givens = cells.map((c) => c.given)
  const grid = solveSudoku(givens, n)
  const open = cells.flatMap((c, i) => c.given ? [] : [{ num: c.num, digit: grid[i], row: Math.floor(i / n), col: i % n }])
  const writes = open.map(({ num, digit }) => ['number', num, [String(digit), 2, '1']])
  const source = await page.evaluate(answerLinkInPage, { writes, boxes: ['sol_number'] })
  return { source, kind: 'digits', digits: n, answer: open, nums: open.map((c) => c.num) }
}

// Builds the puzzle named `name` (one of TIER_C_PUZZLES) and returns it: `name`, `source` (its solve link's `#` part),
// `kind` (how its answer is entered), `mode` (the mode the link opens in), `answer` (the entries the generator makes),
// `points` (the board units of every point the generator presses), and the kind's own fields.
export async function buildPuzzle (browser, name) {
  const built = await withPage(browser, '', (page) => BUILDERS[name](page))
  const { nums, ...puzzle } = built
  const opened = await withPage(browser, puzzle.source, async (page) => {
    await settle(() => page.evaluate(readEngineState).then(canonicalState))
    return page.evaluate(solvePageInPage, nums)
  })
  return { name, ...puzzle, ...opened }
}

async function withPage (browser, query, act) {
  const { context, page } = await openPenpa(browser, query)
  try {
    return await act(page)
  } finally {
    await context.close()
  }
}

// ---- The generator ----

function pointer (puzzle, action, num, button) {
  const { x, y } = puzzle.points[num]
  return { kind: 'pointer', action, button: action === 'down' ? button : null, ctrl: false, x, y, num }
}

function press (puzzle, num, button = 'left') {
  return [pointer(puzzle, 'down', num, button), pointer(puzzle, 'up', num)]
}

// A left drag through `nums`, in order.
function drag (puzzle, nums) {
  return [pointer(puzzle, 'down', nums[0], 'left'), ...nums.slice(1).map((n) => pointer(puzzle, 'move', n)), pointer(puzzle, 'up', nums.at(-1))]
}

const typed = (text) => [...text].map((ch) => ({ kind: 'key', call: 'key_number', args: [ch] }))

const sameMode = (a, b) => a.mode === b.mode && a.submode === b.submode && a.style === b.style

// What each kind of puzzle's solve is made of, given the run's `run` (below): `enter(item)` the steps of one correct
// entry, and `noise` each kind of noise with its weight, a function returning its steps or null when it cannot be made
// now.
const KITS = {
  digits: {
    enter (run, { num, digit }) {
      return [...run.inMode(SUDOKU_MODE('1')), ...press(run.puzzle, num), ...typed(String(digit))]
    },
    noise: [
      // A wrong digit in a cell still to be entered, which its correct entry later overwrites.
      [3, (run) => {
        const { num, digit } = run.pick(run.pending)
        const wrong = 1 + run.below(run.puzzle.digits - 1)
        return [...run.inMode(SUDOKU_MODE('1')), ...press(run.puzzle, num), ...typed(String(wrong >= digit ? wrong + 1 : wrong))]
      }],
      // Corner or centre pencil marks in one cell still to be entered, or in it and the next one along its row.
      [4, (run) => {
        const cell = run.pick(run.pending)
        const next = run.pending.find((c) => c.row === cell.row && c.col === cell.col + 1)
        const cells = next && run.rand() < 0.5 ? [cell.num, next.num] : [cell.num]
        const marks = run.shuffle([...Array(run.puzzle.digits).keys()].map((d) => String(d + 1))).slice(0, 1 + run.below(3))
        return [...run.inMode(SUDOKU_MODE(run.rand() < 0.5 ? '2' : '3')), ...(cells.length > 1 ? drag(run.puzzle, cells) : press(run.puzzle, cells[0])), ...typed(marks.join(''))]
      }]
    ]
  },
  stars: {
    outside: cellsOutside,
    enter: (run, { num }) => [...run.inMode(run.puzzle.mode), ...press(run.puzzle, num)],
    noise: [
      // A star on a cell outside the answer, taken away later.
      [2, (run) => run.mistake((num) => [...run.inMode(run.puzzle.mode), ...press(run.puzzle, num)])],
      // A dot on a cell outside the answer.
      [3, (run) => run.mark((num) => [...run.inMode(run.puzzle.mode), ...press(run.puzzle, num, 'right')])],
      // Shading on a cell outside the answer, in Surface mode.
      [1, (run) => run.mark((num) => [...run.inMode(SURFACE_MODE), ...press(run.puzzle, num)])]
    ]
  },
  edges: {
    outside: (puzzle) => puzzle.edges.filter((e) => !puzzle.answer.includes(e)),
    enter: (run, { a, b }) => [...run.inMode(run.puzzle.mode), ...drag(run.puzzle, [a, b])],
    noise: [
      // A line on an edge outside the answer, drawn over again later to take it away.
      [2, (run) => run.mistake(({ a, b }) => [...run.inMode(run.puzzle.mode), ...drag(run.puzzle, [a, b])])],
      // An X on an edge outside the answer.
      [3, (run) => run.mark(({ mid }) => [...run.inMode(run.puzzle.mode), ...press(run.puzzle, mid, 'right')])]
    ]
  },
  shading: {
    // The category the run's solver answers in, by the seed's parity so that any two seeds in a row cover both:
    // shading, or black squares.
    start (run, seed) {
      run.category = seed % 2 ? 'surface' : 'square'
      run.others = run.puzzle.answer.length - 2
    },
    outside: cellsOutside,
    enter: (run, { num }) => (run.category === 'surface' ? shade : square)(run, num),
    noise: [
      // An entry of the run's category on a cell outside the answer, taken away later: a shading by shading it again,
      // a black square by Delete.
      [2, (run) => run.category === 'surface'
        ? run.mistake((num) => shade(run, num))
        : run.mistake((num) => square(run, num), (num) => [...run.inMode(SQUARE_MODE), ...press(run.puzzle, num), DELETE])],
      // A dot (Surface's right button) on a cell outside the answer.
      [2, (run) => run.mark((num) => [...run.inMode(SURFACE_MODE), ...press(run.puzzle, num, 'right')])],
      // An entry of the other category on a cell still to be entered, never on all of them, so the other category is
      // never complete.
      [1, (run) => {
        if (!run.others) return null
        run.others--
        return (run.category === 'surface' ? square : shade)(run, run.pick(run.pending).num)
      }]
    ]
  }
}

// Shading in Surface mode; a second shading of the same cell takes it away.
function shade (run, num) {
  return [...run.inMode(SURFACE_MODE), ...press(run.puzzle, num)]
}

// A black square, Shape's `square_LL` variant 2, which the answer check counts: a click places the first variant and
// a 2 turns it into the black one.
function square (run, num) {
  return [...run.inMode(SQUARE_MODE), ...press(run.puzzle, num), ...typed('2')]
}

// The Delete key, as `main.js` passes it.
const DELETE = { kind: 'key', call: 'key_space', args: [46, false, false] }

// The cells of a puzzle with a `cells` list that are outside its answer.
function cellsOutside (puzzle) {
  return puzzle.cells.filter((num) => !puzzle.answer.some((a) => a.num === num))
}

const SQUARE_MODE = { mode: 'symbol', submode: 'square_LL', style: 1 }

const SURFACE_MODE = { mode: 'surface', submode: '', style: 1 }

// Sudoku mode's sub-mode `submode`: 1 the digit, 2 corner marks, 3 centre marks.
const SUDOKU_MODE = (submode) => ({ mode: 'sudoku', submode, style: 9 })

// Undo then redo as many groups, which leaves the board as it was; any kind of puzzle has it.
const UNDO_REDO = [2, (run) => {
  const k = 1 + run.below(2)
  return [...Array(k).fill({ kind: 'undo' }), ...Array(k).fill({ kind: 'redo' })]
}]

// The steps of a solve of `puzzle` with `seed`: its answer in a seeded random order with noise between the entries,
// all of it resolved before the last correct entry. `lastEntry` is the count of steps up to and including that entry's
// last step, which is the solve's last step.
export function generateSolve (puzzle, seed) {
  const kit = KITS[puzzle.kind]
  const rand = random(seed)
  const steps = []
  const run = {
    puzzle,
    rand,
    below: (k) => Math.floor(rand() * k),
    pick: (list) => list[Math.floor(rand() * list.length)],
    shuffle: (list) => {
      const out = [...list]
      for (let i = out.length - 1; i > 0; i--) {
        const j = Math.floor(rand() * (i + 1));
        [out[i], out[j]] = [out[j], out[i]]
      }
      return out
    },
    mode: puzzle.mode,
    // The mode step that switches to `mode`, or none when it is the current one.
    inMode (mode) {
      if (sameMode(run.mode, mode)) return []
      run.mode = mode
      return [{ kind: 'mode', ...mode }]
    },
    pending: [],
    // What is outside the answer and holds nothing of the run's yet (cells, or edges), and the wrong entries still to
    // be taken away.
    free: kit.outside?.(puzzle) ?? [],
    fixes: [],
    // The steps of `make(place)` on a free place, which is then no longer free, or null when none is.
    mark (make) {
      if (!run.free.length) return null
      return make(run.free.splice(run.below(run.free.length), 1)[0])
    },
    // A mark that is wrong, taken away later by `unmake`, by default the same input made again.
    mistake (make, unmake = make) {
      return run.mark((place) => {
        run.fixes.push(() => unmake(place))
        return make(place)
      })
    }
  }
  // Takes away the oldest wrong entry still on the board.
  const fix = [3, (run) => run.fixes.length ? run.fixes.shift()() : null]
  kit.start?.(run, seed)
  const noise = [...kit.noise, UNDO_REDO, fix]
  const total = noise.reduce((sum, [w]) => sum + w, 0)
  const order = run.shuffle(puzzle.answer)
  for (const [i, item] of order.entries()) {
    run.pending = order.slice(i + 1)
    while (run.pending.length && rand() < NOISE) {
      let roll = rand() * total
      const [, make] = noise.find(([w]) => (roll -= w) < 0) ?? noise.at(-1)
      steps.push(...make(run) ?? [])
    }
    if (!run.pending.length) while (run.fixes.length) steps.push(...run.fixes.shift()())
    steps.push(...kit.enter(run, item))
  }
  return { steps, lastEntry: steps.length }
}

// ---- The answer run ----

// Makes `steps` on `puzzle`'s solve link through the engine driver and checks, at every checkpoint, that no page error
// was raised and that the answer check reads unsolved before step `lastEntry` and solved from it on. Returns the first
// failure in words or null, and the page's engine state at the end.
export async function answerRun (browser, puzzle, { steps, lastEntry }) {
  const { context, page, errors } = await openPenpa(browser, puzzle.source)
  try {
    await settle(() => page.evaluate(readEngineState).then(canonicalState))
    const apply = engineDriver.start(page)
    let failure = null
    for (const [index, step] of steps.entries()) {
      const n = index + 1
      const at = `${puzzle.name}: step ${n} (${stepWords(step)})`
      try {
        await apply(step)
      } catch (e) {
        failure = `${at} threw: ${e.message.split('\n')[0]}`
        break
      }
      if (!endsGroup(step) && n !== steps.length) continue
      if (errors.length) {
        failure = `${at}: page error: ${errors[0]}`
        break
      }
      const solved = await page.evaluate(() => pu.sol_flag)
      const want = n >= lastEntry ? 1 : 0
      if (solved !== want) {
        failure = `${at}: the answer check reads ${solved ? 'solved' : 'unsolved'}, ${n >= lastEntry ? 'after the last correct entry' : `before the last correct entry (step ${lastEntry})`}`
        break
      }
    }
    return { failure, final: await page.evaluate(readEngineState) }
  } finally {
    await context.close()
  }
}

