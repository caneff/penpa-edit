// The stored answer (`pu.solution`) after resizing the board: it must equal what `pu.make_solution()` gives for the
// same marks, or a correct solve is never accepted (#14).
import assert from 'node:assert/strict'
import { after, before, describe, it } from 'node:test'
import { openPenpa, useBrowser } from './page.mjs'

const browser = useBrowser()

const RESIZES = [['resize_top', 1], ['resize_top', -1], ['resize_bottom', 1], ['resize_bottom', -1],
  ['resize_left', 1], ['resize_left', -1], ['resize_right', 1], ['resize_right', -1]]

// Every OR option, each with the marks it reads. `marks` runs in the page, with `cell(x, y)` and `edge(x, y)`, the edge on the right of cell (x, y).
const MARKS = {
  surface: (a, cell) => { a.surface[cell(3, 3)] = 3 },
  surface_exact: (a, cell) => { a.surface[cell(3, 3)] = 3; a.surface[cell(4, 3)] = [3, 4] },
  number: (a, cell) => { a.number[cell(3, 4)] = ['7', 2, '1'] },
  loopline_exact: (a, cell) => { a.line[`${cell(3, 3)},${cell(4, 3)}`] = 3 },
  loopline: (a, cell) => { a.line[`${cell(3, 3)},${cell(4, 3)}`] = 3 },
  loopedge_exact: (a, cell, edge) => { a.lineE[edge(3, 4)] = 3; a.surface[cell(3, 3)] = 1; a.surface[cell(4, 3)] = 3 },
  loopedge: (a, cell, edge) => { a.lineE[edge(3, 4)] = 3; a.surface[cell(3, 3)] = 1; a.surface[cell(4, 3)] = 3 },
  wall: (a, cell) => { a.wall[`${cell(3, 3)},${cell(4, 3)}`] = 3 },
  square: (a, cell) => { a.symbol[cell(3, 3)] = [2, 'square_LL', 2] },
  circle: (a, cell) => { a.symbol[cell(3, 3)] = [1, 'circle_M', 2] },
  tri: (a, cell) => { a.symbol[cell(3, 3)] = [1, 'tri', 2] },
  arrow: (a, cell) => { a.symbol[cell(3, 3)] = [1, 'arrow_S', 2] },
  math: (a, cell) => { a.symbol[cell(3, 3)] = [2, 'math', 2] },
  battleship: (a, cell) => { a.symbol[cell(3, 3)] = [1, 'battleship_B', 2] },
  tent: (a, cell) => { a.symbol[cell(3, 3)] = [2, 'tents', 2] },
  star: (a, cell) => { a.symbol[cell(3, 3)] = [2, 'star', 2] },
  akari: (a, cell) => { a.symbol[cell(3, 3)] = [3, 'sun_moon', 2] },
  mine: (a, cell) => { a.symbol[cell(3, 3)] = [4, 'sun_moon', 2] }
}

// Runs in the page. Builds an 8x8 grid tagged `tag`, marks the answer with `names` (MARKS keys, as source text since
// functions do not cross), ticks each in `boxes`, stores the answer, resizes, and returns the stored and the fresh answer.
function resizeInPage ({ tag, names, marksSource, boxes, resize: [method, sign] }) {
  document.getElementById('nb_size1').value = 8
  document.getElementById('nb_size2').value = 8
  create_newboard()
  pu.user_tags = [tag]
  $('#genre_tags_opt').val([tag]).trigger('change')
  const cell = (x, y) => pu.conflicts.xy_to_index(x, y)
  const edge = (x, y) => `${pu.point[cell(x, y)].surround[1]},${pu.point[cell(x, y)].surround[2]}`
  const marks = new Function('return ' + marksSource)()
  for (const name of names) marks[name](pu.pu_a, cell, edge)
  for (const box of document.getElementsByClassName('solcheck')) box.checked = false
  for (const box of document.getElementsByClassName('solcheck_or')) box.checked = false
  for (const id of boxes) document.getElementById(id).checked = true
  const first = pu.make_solution()
  pu.solution = pu.multisolution ? first : JSON.stringify(first)
  pu[method](sign)
  const made = pu.make_solution()
  return { stored: pu.solution, made: pu.multisolution ? made : JSON.stringify(made) }
}

// Runs in the page. Reads the edge answer on an 8x8 pentominous grid, resizes by one, shades the last two cells of the
// last row and the last two of the last column in different colors, and returns the edge answer. It holds two edges.
function edgesAfterResizeInPage ([method, sign]) {
  document.getElementById('nb_size1').value = 8
  document.getElementById('nb_size2').value = 8
  create_newboard()
  $('#genre_tags_opt').val(['pentominous']).trigger('change')
  for (const box of document.getElementsByClassName('solcheck')) box.checked = false
  for (const box of document.getElementsByClassName('solcheck_or')) box.checked = false
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

describe('the edge answer after a resize', () => {
  let opened
  before(async () => { opened = await openPenpa(browser()) })
  after(async () => { await opened?.context.close() })
  for (const method of ['resize_top', 'resize_bottom', 'resize_left', 'resize_right']) {
    it(`${method}(1) counts the edges in the added row or column`, async () => {
      const edges = await opened.page.evaluate(edgesAfterResizeInPage, [method, 1])
      assert.equal(edges.length, 2)
    })
  }
})

describe('the stored answer after a resize', () => {
  let opened
  before(async () => { opened = await openPenpa(browser()) })
  after(async () => { await opened?.context.close() })
  const run = (args) => opened.page.evaluate(resizeInPage, {
    ...args,
    marksSource: '{' + Object.entries(MARKS).map(([k, f]) => `${JSON.stringify(k)}: ${f}`).join(',') + '}'
  })

  for (const [method, sign] of RESIZES) {
    describe(`${method}(${sign})`, () => {
      it('keeps a single answer valid', async () => {
        const names = ['surface', 'number', 'loopline', 'loopedge', 'wall', 'square', 'circle', 'tri', 'arrow', 'math', 'battleship', 'tent', 'star', 'akari', 'mine']
        const r = await run({ tag: 'pentominous', names, boxes: names.map((n) => `sol_${n}`), resize: [method, sign] })
        assert.deepEqual(r.made, r.stored)
      })
      for (const name of Object.keys(MARKS)) {
        it(`keeps the OR option ${name} valid`, async () => {
          const r = await run({ tag: 'pentominous', names: [name], boxes: [`sol_or_${name}`], resize: [method, sign] })
          assert.deepEqual(r.made, r.stored)
        })
      }
    })
  }
})
