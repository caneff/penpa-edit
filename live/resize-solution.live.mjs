// The stored answer (`pu.solution`) after resizing the board: it must equal what `pu.make_solution()` gives for the
// same marks, or a correct solve is never accepted (#14).
import assert from 'node:assert/strict'
import { after, before, describe, it } from 'node:test'
import { openPenpa, useBrowser } from './page.mjs'

const browser = useBrowser()

const GRID_SIZE = 8
// A genre that reads edges off shading (`surface_2_edge_types`), so the edge answer is derived from the surface.
const EDGE_GENRE = 'pentominous'

const RESIZES = [['resize_top', 1], ['resize_top', -1], ['resize_bottom', 1], ['resize_bottom', -1],
  ['resize_left', 1], ['resize_left', -1], ['resize_right', 1], ['resize_right', -1]]

// Symbol answers, each given its own cell so no mark overwrites another. Cells stay in columns and rows 1 to 6, so
// no resize by -1 removes one.
const SYMBOLS = {
  square: [2, 'square_LL', 2],
  circle: [1, 'circle_M', 2],
  tri: [1, 'tri', 2],
  arrow: [1, 'arrow_S', 2],
  math: [2, 'math', 2],
  battleship: [1, 'battleship_B', 2],
  tent: [2, 'tents', 2],
  star: [2, 'star', 2],
  akari: [3, 'sun_moon', 2],
  mine: [4, 'sun_moon', 2]
}

// Marks each answer option reads. Each runs in the page as `marks[name](pu.pu_a, cell, edge)`, with `edge(x, y)` the
// edge on the right of cell (x, y). Shipped to the page as source, since functions do not cross.
const MARKS_SOURCE = `{
  surface: (a, cell) => { a.surface[cell(1, 1)] = 3 },
  surface_exact: (a, cell) => { a.surface[cell(1, 1)] = 3; a.surface[cell(2, 1)] = [3, 4] },
  number: (a, cell) => { a.number[cell(1, 2)] = ['7', 2, '1'] },
  loopline_exact: (a, cell) => { a.line[cell(1, 3) + ',' + cell(2, 3)] = 3 },
  loopline: (a, cell) => { a.line[cell(1, 3) + ',' + cell(2, 3)] = 3 },
  loopedge_exact: (a, cell, edge) => { a.lineE[edge(5, 2)] = 3; a.surface[cell(5, 2)] = 1; a.surface[cell(6, 2)] = 3 },
  loopedge: (a, cell, edge) => { a.lineE[edge(5, 2)] = 3; a.surface[cell(5, 2)] = 1; a.surface[cell(6, 2)] = 3 },
  wall: (a, cell) => { a.wall[cell(1, 4) + ',' + cell(2, 4)] = 3 },
  ${Object.entries(SYMBOLS).map(([name, symbol], i) =>
    `${name}: (a, cell) => { a.symbol[cell(${1 + (i % 6)}, ${5 + Math.floor(i / 6)})] = ${JSON.stringify(symbol)} }`).join(',\n  ')}
}`
const OR_OPTIONS = ['surface', 'surface_exact', 'number', 'loopline_exact', 'loopline', 'loopedge_exact', 'loopedge', 'wall', ...Object.keys(SYMBOLS)]
const SINGLE_OPTIONS = ['surface', 'number', 'loopline', 'loopedge', 'wall', ...Object.keys(SYMBOLS)]

// Runs in the page, once: defines `newBoard(tag)`, a `GRID_SIZE`-square grid tagged `tag` with every answer option unticked.
function defineHelpers ({ gridSize }) {
  window.newBoard = (tag) => {
    document.getElementById('nb_size1').value = gridSize
    document.getElementById('nb_size2').value = gridSize
    create_newboard()
    $('#genre_tags_opt').val([tag]).trigger('change')
    for (const box of [...document.getElementsByClassName('solcheck'), ...document.getElementsByClassName('solcheck_or')]) box.checked = false
  }
}

// Runs in the page. Marks the answer with `names`, ticks each of `boxes`, stores the answer, resizes, and returns the
// stored and the fresh answer.
function resizeInPage ({ tag, names, marksSource, boxes, resize: [method, sign] }) {
  newBoard(tag)
  const cell = (x, y) => pu.conflicts.xy_to_index(x, y)
  const edge = (x, y) => `${pu.point[cell(x, y)].surround[1]},${pu.point[cell(x, y)].surround[2]}`
  const marks = new Function('return ' + marksSource)()
  for (const name of names) marks[name](pu.pu_a, cell, edge)
  for (const id of boxes) document.getElementById(id).checked = true
  const first = pu.make_solution()
  pu.solution = pu.multisolution ? first : JSON.stringify(first)
  pu[method](sign)
  const made = pu.make_solution()
  return { stored: pu.solution, made: pu.multisolution ? made : JSON.stringify(made) }
}

// Runs in the page. Reads the edge answer, resizes by +1, shades the last two cells of row 3 and the last two of
// column 3 in different colors, and returns the edge answer. It holds two edges.
function edgesAfterResizeInPage ({ tag, resize: [method, sign] }) {
  newBoard(tag)
  document.getElementById('sol_loopedge').checked = true
  pu.make_solution()
  pu[method](sign)
  const cell = (x, y) => pu.conflicts.xy_to_index(x, y)
  const lastX = pu.nx - 1
  const lastY = pu.ny - 1
  pu.pu_a.surface[cell(lastX - 1, 3)] = 1
  pu.pu_a.surface[cell(lastX, 3)] = 3
  pu.pu_a.surface[cell(3, lastY - 1)] = 1
  pu.pu_a.surface[cell(3, lastY)] = 3
  return pu.make_solution()[2]
}

describe('the answer after a resize', () => {
  let opened
  before(async () => {
    opened = await openPenpa(browser())
    await opened.page.evaluate(defineHelpers, { gridSize: GRID_SIZE })
  })
  after(async () => { await opened?.context.close() })
  const run = (args) => opened.page.evaluate(resizeInPage, { tag: EDGE_GENRE, marksSource: MARKS_SOURCE, ...args })

  for (const [method, sign] of RESIZES) {
    describe(`${method}(${sign})`, () => {
      it('keeps a single answer valid', async () => {
        const r = await run({ names: SINGLE_OPTIONS, boxes: SINGLE_OPTIONS.map((n) => `sol_${n}`), resize: [method, sign] })
        assert.deepEqual(r.made, r.stored)
      })
      it('keeps a single exact-surface answer valid', async () => {
        const r = await run({ names: ['surface_exact'], boxes: ['sol_surface_exact'], resize: [method, sign] })
        assert.deepEqual(r.made, r.stored)
      })
      for (const name of OR_OPTIONS) {
        it(`keeps the OR option ${name} valid`, async () => {
          const r = await run({ names: [name], boxes: [`sol_or_${name}`], resize: [method, sign] })
          assert.deepEqual(r.made, r.stored)
        })
      }
    })
  }

  // The edge answer once measured the board's bounds on its first read and kept them, so cells past the old
  // bounds were left out; shading the far end of the resized board needs the bounds measured again.
  for (const [method, sign] of RESIZES.filter(([, sign]) => sign === 1)) {
    it(`${method}(${sign}) counts the edges at the far end of the resized board`, async () => {
      const edges = await opened.page.evaluate(edgesAfterResizeInPage, { tag: EDGE_GENRE, resize: [method, sign] })
      assert.equal(edges.length, 2)
    })
  }
})
