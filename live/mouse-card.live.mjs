// The Mouse card says true things (#186): for every tool `solve.html` offers, each gesture a row of the card names is
// performed for real (Playwright's mouse and keyboard) on a cleared board, and the board's change is checked against what
// the row says. A row that names no change (`—`) checks that none of what is read changed. What is read: the solver's
// entries as Penpa+ would save them (`readEngineState`, defined by recorder.js), the grid lines erased, the selection,
// the cursors and the tool's style, written one entry per line as `layer@kind=value`: `kind` names the board
// points the entry's key holds (a cell, a corner, an edge's middle), so a check says where a mark went without hard-coding
// Penpa+'s point numbers. A case's expected lines say what its row's words say; the values Penpa+ stores for each mark (a
// style number, a symbol) are named once below, read from Penpa+'s code and confirmed on the board.
import assert from 'node:assert/strict'
import { after, before, describe, it } from 'node:test'
import { newBoardSolveLink, openSolvePage, useBrowser } from './page.mjs'
import { cellPixel } from './replay.mjs'

const browser = useBrowser()

// Cells of the 6x6 board, as indices of `pu.centerlist`: A B C in a row clear of the edges, D under A, E under B.
const A = 14
const B = 15
const C = 16
const D = 20
const E = 21
// A knight's move from A, for a line at an angle.
const F = 22

// Where a gesture aims: a cell's centre, or a point `dx, dy` cell widths off it.
const at = (cell) => ({ cell, dx: 0, dy: 0 })
const rightEdge = (cell) => ({ cell, dx: 0.5, dy: 0 })
const cornerOf = (cell) => ({ cell, dx: 0.5, dy: 0.5 })
// Part of the way from a cell's centre toward one of the 8 directions, for a flick.
const FLICK = 0.35
const DIRECTIONS = { n: [0, -1], ne: [1, -1], e: [1, 0], se: [1, 1], s: [0, 1], sw: [-1, 1], w: [-1, 0], nw: [-1, -1] }
const toward = (cell, dir) => ({ cell, dx: DIRECTIONS[dir][0] * FLICK, dy: DIRECTIONS[dir][1] * FLICK })

// Gestures. `mods` are keys held through the gesture (`Alt`, `Control`, `Shift`).
const click = (where, mods = []) => ({ act: 'click', where, button: 'left', mods })
const rightClick = (where, mods = []) => ({ act: 'click', where, button: 'right', mods })
const doubleClick = (where) => ({ act: 'dblclick', where })
const drag = (cells, mods = []) => ({ act: 'drag', path: cells.map((c) => (typeof c === 'number' ? at(c) : c)), button: 'left', mods })
const rightDrag = (cells, mods = []) => ({ ...drag(cells, mods), button: 'right' })
// A right drag as a touchpad can send it: pointer events and the mouse events that follow them, dispatched on the board's
// canvas with button 2 held throughout, rather than Playwright's own mouse (Chris's report of #186 came from a laptop).
// Penpa+ listens for the mouse events only (main.js), so the pointer events are there to match the sequence, not to act.
const touchpadRightDrag = (cells) => ({ ...rightDrag(cells), act: 'touchpad' })
const key = (name, mods = []) => ({ act: 'key', name, mods })
// A left drag split in two: the press and the moves, then the release.
const press = (cells) => ({ ...drag(cells), act: 'press' })
const release = () => ({ act: 'release', button: 'left' })
// Setup only: switches to another tool for the steps after it, or puts a given into the question's layer.
const useTool = (tool) => ({ act: 'tool', tool })
const given = (layer, cell, value) => ({ act: 'given', layer, cell, value })

// A case's stages: each a list of steps and the change, since the case's setup ended, they leave.
const stage = (steps, change) => [Array.isArray(steps) ? steps : [steps], change]
// One step repeated: the change after each press, the last usually back to nothing.
const cycle = (step, ...changes) => changes.map((change) => stage(step, change))
const times = (n, line) => Array(n).fill(line)

// The values Penpa+ stores for marks, named once.
const LINE = 3
const CROSS = 98
const SHADE = 1
const SECOND = 2
// A mark in Penpa+'s `symbol` layer, `[variant, shape, layer]`, at a point of `kind`.
const sym = (value, kind = 'cell') => `symbol@${kind}=${JSON.stringify(value)}`
const WHITE = sym([1, 'circle_M', 2])
const BLACK = sym([2, 'circle_M', 2])
const BULB = sym([3, 'sun_moon', 2])
const TENT = sym([2, 'tents', 2])
const PLUS = sym([2, 'math_G', 2])
const MINUS = sym([3, 'math_G', 2])
const ship = (variant) => sym([variant, 'battleship_B', 2])
// The variant of `arrow_S` that points each way.
const ARROW_S = { w: 1, nw: 2, n: 3, ne: 4, e: 5, se: 6, s: 7, sw: 8 }
const GREY_DOT = sym([8, 'ox_B', 2])
const DOT = sym([8, 'ox_B', 1])
const EDGE_CROSS = `line@edge=${CROSS}`
const STAR_CROSS = sym([0, 'star', 2])
const GREEN_DOT = [12, 'circle_SS', 2]
const MINE = sym([4, 'sun_moon', 2])
const TWO_MINES = sym([5, 'sun_moon', 2])
const STAR = sym([2, 'star', 2])
const GREEN_O = sym([1, 'ox_E', 2])
const GREEN_X = sym([4, 'ox_E', 2])
const GREY_X = sym([4, 'ox_G', 2])
// Line + direction marks' arrowheads on a vertical edge, pointing left and right.
const ARROW_LEFT = sym([5, 'inequality', 2], 'edge')
const ARROW_RIGHT = sym([7, 'inequality', 2], 'edge')
// Penpa+'s surface style 7: Line + cell marks' shade and Edges + inside / outside's yellow.
const SURFACE_7 = 'surface@cell=7'
// A 5 typed into a cell with Number's normal sub-mode.
const NUMBER_5 = 'number@cell=["5",2,"1"]'

// ---- Case builders, for rows many tools share --------------------------------------------------------------------

// A row that names no change: the gesture leaves the board as it was.
const nothing = (step, setup = []) => [['changes nothing', setup, [stage(step, [])]]]
// The lines that say each of `lines` was taken off again.
const cleared = (lines) => lines.map((line) => line.replace(/=.*$/, '=-'))
// A drag draws; the same drag starting on what it drew erases it.
const drawAndErase = (path, lines) => [
  ['draws', [], [stage(drag(path), lines)]],
  ['starting on it erases', [drag(path)], [stage(drag(path), cleared(lines))]]
]
const lineTool = (path, lines) => ({ 'Left click': nothing(click(at(A))), 'Right click': nothing(rightClick(at(A))), Drag: drawAndErase(path, lines) })
// The free line tools draw on release: a held drag shows nothing yet.
const freeLineTool = (path, lines) => {
  const tool = lineTool(path, lines)
  return { ...tool, Drag: [...tool.Drag, ['draws only on release', [], [stage(press(path), []), stage(release(), lines)]]] }
}
// A gesture over A B C marks each cell; a gesture over A B starting on a mark clears those two.
const manyAndClear = (over3, over2, line) => [
  ['marks many cells', [], [stage(over3, times(3, line))]],
  ['starting on a mark clears many', [over3], [stage(over2, cleared(times(2, line)))]]
]
// The edges right of A, B and C, for a right drag that starts on an edge.
const EDGES_ABC = [rightEdge(A), rightEdge(B), rightEdge(C)]
// A right drag from an edge marks each edge it passes; one starting on a cell centre marks nothing (Penpa+ starts the
// marking only when the press lands on an edge).
const crossEdgeCases = (layerAndKind = 'line@edge') => [
  ['× on each edge it passes', [], [stage(rightDrag(EDGES_ABC), times(3, `${layerAndKind}=${CROSS}`))]],
  ['starting on a × clears them', [rightDrag(EDGES_ABC)], [stage(rightDrag(EDGES_ABC), times(3, `${layerAndKind}=-`))]],
  ['starting on a cell centre marks nothing', [], [stage(rightDrag([A, B, C]), [])]]
]
const MODIFIERS = ['Control', 'Shift']
// The Number, Sudoku and Multicolor rows: clicks and drags select, a digit fills the selection.
const sameValueSetup = [click(at(A)), key('1'), click(at(C)), key('1'), click(at(B))]
const selectingTool = ({ digit, removeDrag = false, double = [['selects every cell with the same value', sameValueSetup, [stage(doubleClick(at(A)), [`selection=${A},${C}`])]]] }) => ({
  'Left click': [['selects the cell and drops the rest', [click(at(B))], [stage(click(at(A)), [`selection=${A}`])]]],
  'Right click': nothing(rightClick(at(A)), [click(at(B))]),
  Drag: [['selects many cells', [], [stage(drag([A, B, C]), [`selection=${A},${B},${C}`])]]],
  ...(removeDrag
    ? { 'Ctrl/Shift + drag': MODIFIERS.map((m) => [`with ${m}: removes cells`, [drag([A, B, C])], [stage(drag([A, B], [m]), [`selection=${C}`])]]) }
    : {}),
  'Ctrl/Shift + click': MODIFIERS.map((m) => [`with ${m}: adds the cell, again removes it`, [click(at(A))], cycle(click(at(B), [m]), [`selection=${A},${B}`], [])]),
  'Alt + drag': [['selects a rectangle', [], [stage(drag([A, E], ['Alt']), [`selection=${A},${B},${D},${E}`])]]],
  'Double click': double,
  Digit: [digit]
})
// The quarter and side Number tools: clicks move their cursor to the nearest spot of `kind`, a digit writes there.
// The board keeps its cursors through a restart, so each case first puts it on C.
const cursorTool = (offset, kind, digitLine) => ({
  'Left click': [['moves the cursor to the nearest spot and selects the cell', [click({ cell: C, ...offset })],
    [stage(click({ cell: A, ...offset }), [`cursorS@${kind}`, 'cursor@cell', `selection=${A}`])]]],
  'Right click': [['moves the cursor to the nearest spot', [click({ cell: C, ...offset })], [stage(rightClick({ cell: A, ...offset }), [`cursorS@${kind}`])]]],
  Drag: [['acts as a click where it starts', [click({ cell: C, ...offset })], [stage(drag([{ cell: A, ...offset }, { cell: B, ...offset }]), [`cursorS@${kind}`, 'cursor@cell', `selection=${A}`])]]],
  Digit: [['writes a number at the cursor', [click({ cell: A, ...offset })], [stage(key('5'), [digitLine])]]]
})
// The flick tools: a click writes the centre value, a drag toward a direction that direction's value.
const flickTool = (lineOf, centre, layout) => ({
  'Left click': [['writes the centre value, then clears', [], cycle(click(at(A)), [lineOf(centre)], [])]],
  'Right click': nothing(rightClick(at(A))),
  Drag: Object.entries(layout).map(([dir, value]) => [`toward ${dir}: ${value}`, [], [stage(drag([at(A), toward(A, dir)]), [lineOf(value)])]])
})
// Right click of Stars and the mine tools: × in a cell, a green dot on a corner or an edge.
const CELL_CROSS_AND_CORNER_DOT = [
  ['on a cell: ×, then clears', [], cycle(rightClick(at(A)), [STAR_CROSS], [])],
  ['on a corner: green dot, then clears', [], cycle(rightClick(cornerOf(A)), [sym(GREEN_DOT, 'corner')], [])],
  ['on an edge: green dot, then clears', [], cycle(rightClick(rightEdge(A)), [sym(GREEN_DOT, 'edge')], [])]
]
const mineTool = (...marks) => ({
  'Left click': [
    ['cycles, then clears', [], cycle(click(at(A)), ...marks, [])],
    ['also clears a dot on its corner', [rightClick(cornerOf(A))], [stage(click(at(A)), [...marks[0], 'symbol@corner=-'])]],
    ['also clears a dot on its edge', [rightClick(rightEdge(A))], [stage(click(at(A)), [...marks[0], 'symbol@edge=-'])]]
  ],
  'Right click': CELL_CROSS_AND_CORNER_DOT,
  Drag: [['starting on a marked cell clears many', [click(at(A)), click(at(B))], [stage(drag([A, B, C]), times(2, 'symbol@cell=-'))]]],
  'Right drag': manyAndClear(rightDrag([A, B, C]), rightDrag([A, B]), STAR_CROSS)
})
// Thermometers, arrows and frames: a drag draws through cells, a click on the first cell erases it. Each is a list of
// points in the layer named for the tool, written `layer+n` for one of n points added.
const specialTool = (layer) => ({
  // Penpa+ empties an erased one's list of points, leaving it in place.
  'Left click': [['on its first cell erases it', [drag([A, B, C])], [stage(click(at(A)), [`${layer}+0`, `${layer}-3`])]]],
  'Right click': nothing(rightClick(at(A)), [drag([A, B, C])]),
  Drag: [
    ['draws through the cells', [], [stage(drag([A, B, C]), [`${layer}+3`])]],
    ['diagonals too', [], [stage(drag([A, E]), [`${layer}+2`])]],
    ['dragging back undoes a step', [], [stage(drag([A, B, C, B]), [`${layer}+2`])]]
  ]
})
const MOVE_CLICKS = { 'Left click': nothing(click(at(A))), 'Right click': nothing(rightClick(at(A))) }
const MOVE_NUMBER = ['moves a number to an empty cell',
  [useTool({ mode: 'number', submode: '1' }), click(at(A)), key('5')], [stage(drag([A, C]), ['number@cell=-', NUMBER_5])]]
const MOVE_SHAPE = ['moves a shape to an empty cell',
  [useTool({ mode: 'symbol', submode: 'circle_L' }), click(at(A))], [stage(drag([A, C]), ['symbol@cell=-', sym([1, 'circle_L', 1])])]]

// Cage lines join points a quarter cell in from the corners (point type 4). `CAGE_STYLE` is the cage tools' first
// style, `OTHER_CAGE_STYLE` another of theirs.
const cageLine = (value) => `cage@type4-type4=${value}`
const CAGE = { mode: 'cage', submode: '1' }
const CAGE_STYLE = 10
const OTHER_CAGE_STYLE = 7

// From A's left edge to C's right edge.
const WALL_PATH = [{ cell: A, dx: -0.5, dy: 0 }, { cell: C, dx: 0.5, dy: 0 }]

// Cases by tool key and card row: [title, setup steps, stages].
const CASES = {
  'surface/': {
    'Left click': [['paints the cell, then clears it', [], cycle(click(at(A)), [`surface@cell=${SHADE}`], [])]],
    'Right click': [['paints the 2nd colour, then clears it', [], cycle(rightClick(at(A)), [`surface@cell=${SECOND}`], [])]],
    Drag: [
      ['paints many cells', [], [stage(drag([A, B, C]), times(3, `surface@cell=${SHADE}`))]],
      ['starting on a painted cell clears many', [drag([A, B, C])], [stage(drag([A, B]), times(2, 'surface@cell=-'))]]
    ],
    'Right drag': [
      ['puts the 2nd colour on many cells', [], [stage(rightDrag([A, B, C]), times(3, `surface@cell=${SECOND}`))]],
      ['starting on it clears many', [rightDrag([A, B, C])], [stage(rightDrag([A, B]), times(2, 'surface@cell=-'))]]
    ],
    'Alt + drag': [
      ['paints a rectangle', [], [stage(drag([A, E], ['Alt']), times(4, `surface@cell=${SHADE}`))]],
      ['starting on the colour clears it', [drag([A, E], ['Alt'])], [stage(drag([A, E], ['Alt']), times(4, 'surface@cell=-'))]]
    ],
    'Alt + right drag': [['paints a rectangle in the 2nd colour', [], [stage(rightDrag([A, E], ['Alt']), times(4, `surface@cell=${SECOND}`))]]],
    Digit: [['picks colour n', [], [stage(key('3'), ['style=3'])]]]
  },

  'multicolor/': selectingTool({ digit: ['adds colour n, then removes it', [click(at(A))], cycle(key('1'), [`surface@cell=${SHADE}`], [])],
    removeDrag: true }),
  'combi/blpo': {
    'Left click': [['shades, dots, then clears', [], cycle(click(at(A)), [`surface@cell=${SHADE}`], [GREY_DOT], [])]],
    'Right click': [['dots, shades, then clears', [], cycle(rightClick(at(A)), [GREY_DOT], [`surface@cell=${SHADE}`], [])]],
    Drag: [
      ['repeats a shade', [], [stage(drag([A, B, C]), times(3, `surface@cell=${SHADE}`))]],
      ['repeats a dot', [click(at(A))], [stage(drag([A, B, C]), ['surface@cell=-', ...times(3, GREY_DOT)])]],
      ['repeats a clear', [drag([B, C]), rightClick(at(A))], [stage(drag([A, B, C]), ['symbol@cell=-', ...times(2, 'surface@cell=-')])]]
    ]
  },
  'combi/shaka': {
    'Left click': [['dots, then clears', [], cycle(click(at(A)), [GREY_DOT], [])]],
    'Right click': nothing(rightClick(at(A))),
    Drag: [['toward a corner: a triangle, again the same way: clear', [], cycle(drag([at(A), toward(A, 'ne')]), [sym([4, 'tri', 1])], [])]]
  },

  'line/1': lineTool([A, B, C], times(2, `line@cell-cell=${LINE}`)),
  'line/2': lineTool([A, E], [`line@cell-cell=${LINE}`]),
  'line/3': freeLineTool([at(A), at(F)], [`line@cell-cell=${LINE}`]),
  'line/5': lineTool([at(A), rightEdge(A)], [`line@cell-edge=${LINE}`]),
  'line/4': {
    'Left click': [['× on the edge, then clears it', [], cycle(click(rightEdge(A)), [EDGE_CROSS], [])]],
    'Right click': nothing(rightClick(rightEdge(A))),
    Drag: [['acts as a click where it starts', [], [stage(drag([rightEdge(A), rightEdge(B)]), [EDGE_CROSS])]]]
  },
  'combi/linex': {
    'Left click': nothing(click(at(A))),
    'Right click': [['× on the edge, then clears it', [], cycle(rightClick(rightEdge(A)), [EDGE_CROSS], [])]],
    Drag: drawAndErase([A, B, C], times(2, `line@cell-cell=${LINE}`)),
    'Right drag': [
      ...crossEdgeCases(),
      ['sent as a touchpad does: × on each edge it passes', [], [stage(touchpadRightDrag(EDGES_ABC), times(3, EDGE_CROSS))]],
      ['sent as a touchpad does, starting on a cell centre: marks nothing', [], [stage(touchpadRightDrag([A, B, C]), [])]]
    ]
  },
  'combi/lineox': {
    'Left click': [['○, ×, then clears', [], cycle(click(at(A)), [GREEN_O], [GREEN_X], [])]],
    'Right click': [['×, ○, then clears', [], cycle(rightClick(at(A)), [GREEN_X], [GREEN_O], [])]],
    Drag: drawAndErase([A, B, C], times(2, `line@cell-cell=${LINE}`))
  },
  'combi/linedir': {
    'Left click': nothing(click(at(A))),
    'Right click': [['on an edge: ×, arrowhead, the other way, then clears', [],
      cycle(rightClick(rightEdge(A)), [EDGE_CROSS], [ARROW_LEFT], [ARROW_RIGHT], [])]],
    Drag: drawAndErase([A, B, C], times(2, `line@cell-cell=${LINE}`)),
    'Right drag': [
      ['from a cell toward an edge: an arrowhead, again the same way: clear', [],
        cycle(rightDrag([at(A), toward(A, 'e')]), [ARROW_RIGHT], [])],
      ['× on each edge it passes', [], [stage(rightDrag(EDGES_ABC), times(3, EDGE_CROSS))]],
      ['starting on a × steps only that one on', [rightDrag(EDGES_ABC)], [stage(rightDrag(EDGES_ABC), ['line@edge=-', ARROW_LEFT])]],
      ['starting on the last arrowhead clears them', [rightDrag(EDGES_ABC), rightClick(rightEdge(A)), rightClick(rightEdge(A))],
        [stage(rightDrag(EDGES_ABC), ['symbol@edge=-', ...times(2, 'line@edge=-')])]]
    ]
  },
  'combi/yajilin': {
    'Left click': [['shades, then clears', [], cycle(click(at(A)), [`surface@cell=${SHADE}`], [])]],
    'Right click': [
      ['on a cell: dot, then clears', [], cycle(rightClick(at(A)), [DOT], [])],
      ['on an edge: ×, then clears', [], cycle(rightClick(rightEdge(A)), [EDGE_CROSS], [])]
    ],
    Drag: drawAndErase([A, B, C], times(2, `line@cell-cell=${LINE}`)),
    'Right drag': manyAndClear(rightDrag([A, B, C]), rightDrag([A, B]), DOT)
  },
  'combi/hashi': {
    'Left click': [['× in the cell, then clears', [], cycle(click(at(A)), [GREY_X], [])]],
    'Right click': [['× in the cell, then clears', [], cycle(rightClick(at(A)), [GREY_X], [])]],
    Drag: [['bridge, double, then clears', [], cycle(drag([A, C]), times(2, `line@cell-cell=${LINE}`), times(2, 'line@cell-cell=30'), [])]]
  },
  'combi/rassisillai': {
    'Left click': [['○, then clears', [], cycle(click(at(A)), [sym([1, 'ox_G', 1])], [])]],
    'Right click': [['shades, then clears', [], cycle(rightClick(at(A)), [SURFACE_7], [])]],
    Drag: drawAndErase([A, B, C], times(2, `line@cell-cell=${LINE}`)),
    'Right drag': manyAndClear(rightDrag([A, B, C]), rightDrag([A, B]), SURFACE_7)
  },

  'lineE/1': lineTool([cornerOf(A), cornerOf(B), cornerOf(C)], times(2, `lineE@corner-corner=${LINE}`)),
  'lineE/2': lineTool([cornerOf(A), cornerOf(E)], [`lineE@corner-corner=${LINE}`]),
  'lineE/3': freeLineTool([cornerOf(A), cornerOf(F)], [`lineE@corner-corner=${LINE}`]),
  'lineE/6': lineTool([cornerOf(A), rightEdge(A)], [`lineE@corner-edge=${LINE}`]),
  'lineE/4': {
    'Left click': [['× on the grid line, then clears it', [], cycle(click(rightEdge(A)), [`lineE@edge=${CROSS}`], [])]],
    'Right click': nothing(rightClick(rightEdge(A))),
    Drag: [['acts as a click where it starts', [], [stage(drag([rightEdge(A), rightEdge(B)]), [`lineE@edge=${CROSS}`])]]]
  },
  'lineE/5': {
    'Left click': nothing(click(rightEdge(A))),
    'Right click': nothing(rightClick(rightEdge(A))),
    Drag: [
      ['erases the grid lines it runs along', [], [stage(drag([cornerOf(A), cornerOf(B), cornerOf(C)]), times(2, 'q.deletelineE@corner-corner=1'))]],
      ['starting on an erased one restores them', [drag([cornerOf(A), cornerOf(B), cornerOf(C)])],
        [stage(drag([cornerOf(A), cornerOf(B), cornerOf(C)]), times(2, 'q.deletelineE@corner-corner=-'))]]
    ]
  },
  'wall/': {
    ...lineTool(WALL_PATH, times(3, `wall@edge-edge=${LINE}`)),
    Drag: [
      ...drawAndErase(WALL_PATH, times(3, `wall@edge-edge=${LINE}`)),
      ['does not turn within a drag', [], [stage(drag([{ cell: A, dx: -0.5, dy: 0 }, at(B), { cell: E, dx: 0, dy: 0.5 }]), [`wall@edge-edge=${LINE}`])]]
    ]
  },
  'combi/edgex': {
    'Left click': nothing(click(rightEdge(A))),
    'Right click': [
      ['× on the edge, then clears it', [], cycle(rightClick(rightEdge(A)), [`lineE@edge=${CROSS}`], [])],
      ['nothing on an edge line', [drag([{ cell: A, dx: 0.5, dy: -0.5 }, cornerOf(A)])], [stage(rightClick(rightEdge(A)), [])]]
    ],
    Drag: drawAndErase([cornerOf(A), cornerOf(B), cornerOf(C)], times(2, `lineE@corner-corner=${LINE}`)),
    'Right drag': crossEdgeCases('lineE@edge')
  },
  'combi/edgexoi': {
    'Left click': [['on a cell: yellow, 2nd colour, then clears', [], cycle(click(at(A)), [SURFACE_7], [`surface@cell=${SECOND}`], [])]],
    'Right click': [
      ['on an edge: ×, then clears', [], cycle(rightClick(rightEdge(A)), [`lineE@edge=${CROSS}`], [])],
      ['on a cell: 2nd colour, yellow, then clears', [], cycle(rightClick(at(A)), [`surface@cell=${SECOND}`], [SURFACE_7], [])]
    ],
    Drag: drawAndErase([cornerOf(A), cornerOf(B), cornerOf(C)], times(2, `lineE@corner-corner=${LINE}`))
  },
  'combi/edgesub': {
    'Left click': nothing(click(at(A))),
    'Right click': nothing(rightClick(at(A))),
    Drag: [
      ...drawAndErase([cornerOf(A), cornerOf(B), cornerOf(C)], times(2, `lineE@corner-corner=${LINE}`)),
      ...drawAndErase([A, B, C], times(2, 'line@cell-cell=40'))
    ]
  },

  'number/1': selectingTool({ digit: ['writes it in the selected cells', [click(at(A))], [stage(key('5'), [NUMBER_5])]] }),
  'number/10': selectingTool({ digit: ['writes a large number', [click(at(A))], [stage(key('5'), ['number@cell=["5",2,"10"]'])]] }),
  'number/6': selectingTool({ digit: ['writes a medium number', [click(at(A))], [stage(key('5'), ['number@cell=["5",2,"6"]'])]] }),
  'number/5': selectingTool({ digit: ['writes a small number', [click(at(A))], [stage(key('5'), ['number@cell=["5",2,"5"]'])]] }),
  'number/7': selectingTool({ double: [
    ['on a number: selects every cell with it', [useTool({ mode: 'number', submode: '1' }), ...sameValueSetup], [stage(doubleClick(at(A)), [`selection=${A},${C}`])]],
    ['on candidates: selects just that cell', sameValueSetup, [stage(doubleClick(at(A)), [`selection=${A}`])]]
  ],
  digit: ['adds a candidate, then removes it', [click(at(A))], cycle(key('5'), ['number@cell=[[0,0,0,0,1,0,0,0,0],2,"7"]'], ['number@cell=[[0,0,0,0,0,0,0,0,0],2,"7"]'])] }),
  'number/8': selectingTool({ digit: ['adds to the long number', [click(at(A))], [stage(key('5'), ['number@cell=["5",2,"8"]']), stage(key('6'), ['number@cell=["56",2,"8"]'])]] }),
  'number/3': cursorTool({ dx: 0.3, dy: 0.3 }, 'type4', 'numberS@type4=["5",2]'),
  'number/9': cursorTool({ dx: 0.35, dy: 0 }, 'type5', 'numberS@type5=["5",2]'),
  'sudoku/1': {
    ...selectingTool({ digit: ['writes a digit in the selected cells', [click(at(A))], [stage(key('5'), ['number@cell=["5",9,"1"]'])]], removeDrag: true }),
    'Shift + digit': [['writes corner marks', [click(at(A))], [stage(key('5', ['Shift']), ['numberS@type4=["5",9]'])]]],
    'Ctrl + digit': [['writes a centre mark', [click(at(A))], [stage(key('5', ['Control']), ['number@cell=["5",9,"6"]'])]]]
  },
  'sudoku/2': selectingTool({ double: [
    ['on a digit: selects every cell with it', [useTool({ mode: 'sudoku', submode: '1' }), ...sameValueSetup], [stage(doubleClick(at(A)), [`selection=${A},${C}`])]],
    ['on corner marks only: clears the selection', sameValueSetup, [stage(doubleClick(at(A)), ['selection='])]]
  ],
  digit: ['writes a corner mark', [click(at(A))], [stage(key('5'), ['numberS@type4=["5",9]'])]], removeDrag: true }),
  'sudoku/3': selectingTool({ digit: ['writes a centre mark', [click(at(A))], [stage(key('5'), ['number@cell=["5",9,"6"]'])]], removeDrag: true }),
  'combi/numfl': flickTool((v) => `number@cell=${JSON.stringify([v, 2, '1'])}`, '5', { nw: '1', n: '2', ne: '3', w: '4', e: '6', sw: '7', s: '8', se: '9' }),
  'combi/alfl': flickTool((v) => `number@cell=${JSON.stringify([v, 2, '1'])}`, 'E', { nw: 'A', n: 'B', ne: 'C', w: 'D', e: 'F', sw: 'G', s: 'H', se: '-' }),

  'combi/blwh': {
    'Left click': [['white, black, then clears', [], cycle(click(at(A)), [WHITE], [BLACK], [])]],
    'Right click': [['black, white, then clears', [], cycle(rightClick(at(A)), [BLACK], [WHITE], [])]],
    Drag: [['repeats the first cell\'s change', [], [stage(drag([A, B, C]), times(3, WHITE))]]],
    'Given circles': [['are left alone', [given('symbol', A, [1, 'circle_L', 1])], [stage(click(at(A)), [])]]]
  },
  'combi/star': {
    'Left click': [
      ['star, then clears', [], cycle(click(at(A)), [STAR], [])],
      ['also clears a dot on its corner', [rightClick(cornerOf(A))], [stage(click(at(A)), [STAR, 'symbol@corner=-'])]],
      ['also clears a dot on its edge', [rightClick(rightEdge(A))], [stage(click(at(A)), [STAR, 'symbol@edge=-'])]],
      ['on a × clears it', [rightClick(at(A))], [stage(click(at(A)), ['symbol@cell=-'])]]
    ],
    'Right click': CELL_CROSS_AND_CORNER_DOT,
    Drag: [['starting on a marked cell clears many', [click(at(A)), click(at(B))], [stage(drag([A, B, C]), times(2, 'symbol@cell=-'))]]],
    'Right drag': manyAndClear(rightDrag([A, B, C]), rightDrag([A, B]), STAR_CROSS)
  },
  'combi/akari': {
    'Left click': [
      ['bulb, then clears', [], cycle(click(at(A)), [BULB], [])],
      ['on a dot: bulb', [rightClick(at(A))], [stage(click(at(A)), [BULB])]]
    ],
    'Right click': [
      ['on a cell: dot, then clears', [], cycle(rightClick(at(A)), [DOT], [])],
      ['on a bulb: dot', [click(at(A))], [stage(rightClick(at(A)), [DOT])]],
      ['on an edge: ×, then clears', [], cycle(rightClick(rightEdge(A)), [EDGE_CROSS], [])]
    ],
    Drag: drawAndErase([A, B, C], times(2, 'line@cell-cell=12')),
    'Right drag': manyAndClear(rightDrag([A, B, C]), rightDrag([A, B]), DOT)
  },
  'combi/battleship': {
    'Left click': [
      ['■, ●, ·, water, then clears', [], cycle(click(at(A)), [ship(2)], [ship(1)], [ship(8)], [ship(7)], [])],
      ['on a ship end clears it', [drag([A, B])], [stage(click(at(A)), ['symbol@cell=-'])]]
    ],
    'Right click': [['water, then clears', [], cycle(rightClick(at(A)), [ship(7)], [])]],
    Drag: [
      ['from an empty cell: a ship end', [], [stage(drag([A, B]), [ship(3)])]],
      ['starting on · puts · on each cell', [click(at(A)), click(at(A)), click(at(A))], [stage(drag([A, B, C]), times(2, ship(8)))]],
      ['starting on water puts water on each cell', [click(at(A)), click(at(A)), click(at(A)), click(at(A))], [stage(drag([A, B, C]), times(2, ship(7)))]]
    ],
    'Right drag': manyAndClear(rightDrag([A, B, C]), rightDrag([A, B]), ship(7)),
    'Given ship pieces': [['are left alone', [given('symbol', A, [2, 'battleship_B', 1])], [stage(click(at(A)), [])]]]
  },
  'combi/tents': {
    'Left click': [['tent, dot, then clears', [], cycle(click(at(A)), [TENT], [GREY_DOT], [])]],
    'Right click': [
      ['on a cell: dot, tent, then clears', [], cycle(rightClick(at(A)), [GREY_DOT], [TENT], [])],
      ['on an edge: ×, then clears', [], cycle(rightClick(rightEdge(A)), [EDGE_CROSS], [])]
    ],
    Drag: drawAndErase([A, B], [`line@cell-cell=${LINE}`])
  },
  'combi/mines': mineTool([MINE]),
  'combi/doublemines': {
    ...mineTool([MINE], [TWO_MINES]),
    Drag: [
      ['starting on two mines clears many', [click(at(A)), click(at(A)), click(at(B))], [stage(drag([A, B, C]), times(2, 'symbol@cell=-'))]],
      ['starting on a × clears many', [rightClick(at(A)), click(at(B))], [stage(drag([A, B, C]), times(2, 'symbol@cell=-'))]],
      ['starting on one mine makes it two, and nothing more', [click(at(A)), click(at(B))], [stage(drag([A, B, C]), [TWO_MINES])]]
    ]
  },
  'combi/magnets': {
    'Left click': [['+, −, shade, then clears', [], cycle(click(at(A)), [PLUS], [MINUS], [`surface@cell=${SHADE}`], [])]],
    'Right click': [['shade, −, +, then clears', [], cycle(rightClick(at(A)), [`surface@cell=${SHADE}`], [MINUS], [PLUS], [])]],
    Drag: [['acts as a click on its first cell', [], [stage(drag([A, B, C]), [PLUS])]]]
  },
  'combi/arrowS': {
    'Left click': [
      ['on an arrow clears it', [drag([at(A), toward(A, 'e')])], [stage(click(at(A)), ['symbol@cell=-'])]],
      ['on an empty cell does nothing', [], [stage(click(at(A)), [])]]
    ],
    'Right click': nothing(rightClick(at(A))),
    Drag: Object.keys(DIRECTIONS).map((dir) => [`toward ${dir}: an arrow that way`, [], [stage(drag([at(A), toward(A, dir)]), [sym([ARROW_S[dir], 'arrow_S', 2])])]])
  },

  'special/thermo': specialTool('thermo'),
  'special/nobulbthermo': specialTool('nobulbthermo'),
  'special/arrows': specialTool('arrows'),
  'special/direction': specialTool('direction'),
  'special/squareframe': specialTool('squareframe'),
  'special/polygon': {
    // While it is drawn, the list also holds the corner following the pointer. A polygon left unfinished breaks the next case's
    // pointer moves, so the first case finishes it.
    'Left click': [['corner by corner', [], [
      stage([click(cornerOf(A)), click(cornerOf(B)), click(cornerOf(E))], ['polygon+4']),
      stage(click(cornerOf(E)), ['polygon+3'])
    ]]],
    'Closing click': [['the first corner again finishes', [], [
      stage([click(cornerOf(A)), click(cornerOf(B)), click(cornerOf(E))], ['polygon+4']),
      stage(click(cornerOf(A)), ['polygon+3'])
    ]], ['the last corner again finishes', [], [
      stage([click(cornerOf(A)), click(cornerOf(B)), click(cornerOf(E)), click(cornerOf(E))], ['polygon+3'])
    ]]],
    'Right click': nothing(rightClick(cornerOf(A))),
    Drag: [['acts as a click where it starts', [], [stage(drag([cornerOf(A), cornerOf(B), cornerOf(E)]), ['polygon+2'])]]]
  },
  'cage/1': {
    'Left click': [
      ['a 1-cell cage on a free cell, then clears it', [], cycle(click(at(A)), times(4, cageLine(CAGE_STYLE)), [])],
      ['on a caged cell erases the whole cage', [drag([A, B, C])], [stage(click(at(A)), times(12, cageLine('-')))]],
      ['on a cage of another style restyles it, then erases it',
        [useTool({ ...CAGE, style: OTHER_CAGE_STYLE }), drag([A, B]), useTool({ ...CAGE, style: CAGE_STYLE })],
        cycle(click(at(A)), times(8, cageLine(CAGE_STYLE)), times(8, cageLine('-')))]
    ],
    'Right click': nothing(rightClick(at(A))),
    Drag: [
      ['a cage around the cells', [], [stage(drag([A, B, C]), times(12, cageLine(CAGE_STYLE)))]],
      ['nothing when a cell is caged', [click(at(B))], [stage(drag([A, B, C]), [])]]
    ]
  },
  'cage/2': lineTool([{ cell: A, dx: -0.25, dy: -0.25 }, { cell: A, dx: 0.25, dy: -0.25 }, { cell: B, dx: -0.25, dy: -0.25 }], times(2, cageLine(CAGE_STYLE))),
  'move/1': {
    ...MOVE_CLICKS,
    Drag: [MOVE_NUMBER, MOVE_SHAPE]
  },
  'move/2': { ...MOVE_CLICKS, Drag: [MOVE_NUMBER] },
  'move/3': { ...MOVE_CLICKS, Drag: [MOVE_SHAPE] }
}

// The Shape tools' cases, by the two ways Penpa+ handles a shape: one whose variants a digit picks, and one whose parts
// a digit switches on and off (Penpa+'s `onoff_symbolmode_list`). `shape` is the tool's sub-mode. The board keeps its
// cursor through a restart, so a cursor case first puts it on C. `parts` is how many parts Penpa+ gives an on/off shape.
const shapeMark = (shape, variant) => sym([variant, shape, 1])
const SHAPE_CASES = {
  variants: {
    'Left click': [
      ['the first variant, then clears', [], (shape) => cycle(click(at(A)), [shapeMark(shape, 1)], [])],
      ['on another variant: the first', [rightClick(at(A)), key('2')], (shape) => [stage(click(at(A)), [shapeMark(shape, 1)])]]
    ],
    'Right click': [['moves the cursor', [rightClick(at(C))], () => [stage(rightClick(at(A)), ['cursor@cell'])]]],
    Drag: [['acts as a click where it starts', [], (shape) => [stage(drag([A, B, C]), [shapeMark(shape, 1)])]]],
    Digit: [['variant n at the cursor, the same digit again clears it', [rightClick(at(A))], (shape) => cycle(key('2'), [shapeMark(shape, 2)], [])]]
  },
  onOff: {
    'Left click': [['moves the cursor', [rightClick(at(C))], () => [stage(click(at(A)), ['cursor@cell'])]]],
    'Right click': [['moves the cursor', [rightClick(at(C))], () => [stage(rightClick(at(A)), ['cursor@cell'])]]],
    Drag: [['acts as a click where it starts', [rightClick(at(C))], () => [stage(drag([A, B, C]), ['cursor@cell'])]]],
    // Penpa+ keeps a shape whose parts are all off, as a list of zeros.
    Digit: [['switches part n on, then off', [rightClick(at(A))],
      (shape, parts) => cycle(key('1'), [shapeMark(shape, [1, ...Array(parts - 1).fill(0)])], [shapeMark(shape, Array(parts).fill(0))])]]
  }
}

// ---- Running a case --------------------------------------------------------------------------------------------------


// Steps a dispatched drag takes between two of its points, as Playwright's `mouse.move` takes `steps`.
const DRAG_STEPS = 4

// Runs in the page: dispatches a right drag through `points` (viewport pixels) on the board's canvas, each point as a
// pointer event and the mouse event that follows it, with button 2 held from the press to the release.
function touchpadRightDragInPage (points) {
  const canvas = document.getElementById('canvas')
  const send = (type, { x, y }, buttons) => {
    const Event = type.startsWith('pointer') ? PointerEvent : MouseEvent
    canvas.dispatchEvent(new Event(type, {
      bubbles: true, cancelable: true, composed: true, view: window, clientX: x, clientY: y, button: 2, buttons, pointerId: 1, pointerType: 'mouse', isPrimary: true
    }))
  }
  const [first, ...rest] = points
  send('pointerdown', first, 2)
  send('mousedown', first, 2)
  for (const p of rest) {
    send('pointermove', p, 2)
    send('mousemove', p, 2)
  }
  const last = points.at(-1)
  send('pointerup', last, 0)
  send('mouseup', last, 0)
}

// Runs in the page: what a gesture can change, as plain data.
function snapshotInPage () {
  const s = readEngineState()
  // The undo and replay logs change with every entry and are not what the card describes.
  const { command_undo: undo, command_redo: redo, command_replay: replay, ...entered } = s.pu_a
  return {
    // Erasing grid lines writes to the question's layer.
    entered, erased: pu.pu_q.deletelineE, selection: s.selection,
    cursor: pu.cursol, cursorS: pu.cursolS, style: engine.getTool().style
  }
}

// Runs in the page: the change from `before` to `after` as sorted `layer@kind=value` lines.
function changeInPage ({ before, after }) {
  const KINDS = { 0: 'cell', 1: 'corner', 2: 'edge', 3: 'edge' }
  const kindOf = (key) => String(key).split(',').map((k) => KINDS[pu.point[k]?.type] ?? `type${pu.point[k]?.type}`).join('-')
  const cellsOf = (points) => points.map((p) => pu.centerlist.indexOf(p)).sort((a, b) => a - b).join(',')
  const lines = []
  const diffLayer = (name, was = {}, now = {}) => {
    if (Array.isArray(was) || Array.isArray(now)) {
      const wasItems = (was ?? []).map((item) => JSON.stringify(item))
      const nowItems = (now ?? []).map((item) => JSON.stringify(item))
      for (const item of nowItems.filter((i) => !wasItems.includes(i))) lines.push(`${name}+${JSON.parse(item)?.length ?? item}`)
      for (const item of wasItems.filter((i) => !nowItems.includes(i))) lines.push(`${name}-${JSON.parse(item)?.length ?? item}`)
      return
    }
    for (const k of new Set([...Object.keys(was ?? {}), ...Object.keys(now ?? {})])) {
      const a = JSON.stringify(was?.[k])
      const b = JSON.stringify(now?.[k])
      if (a !== b) lines.push(`${name}@${kindOf(k)}=${b === undefined ? '-' : b}`)
    }
  }
  for (const layer of new Set([...Object.keys(before.entered), ...Object.keys(after.entered)])) {
    diffLayer(layer, before.entered[layer], after.entered[layer])
  }
  diffLayer('q.deletelineE', before.erased, after.erased)
  if (JSON.stringify(before.selection) !== JSON.stringify(after.selection)) lines.push(`selection=${cellsOf(after.selection)}`)
  if (before.cursor !== after.cursor) lines.push(`cursor@${kindOf(after.cursor)}`)
  // The quarter and side Number tools, and corner marks, keep their own cursor.
  if (before.cursorS !== after.cursorS) lines.push(`cursorS@${kindOf(after.cursorS)}`)
  if (before.style !== after.style) lines.push(`style=${after.style}`)
  return lines.sort()
}

async function pixel (page, where) {
  const centre = await cellPixel(page, where.cell)
  const size = await page.evaluate(() => pu.size)
  return { x: centre.x + where.dx * size, y: centre.y + where.dy * size }
}

async function withKeys (page, mods, run) {
  for (const m of mods) await page.keyboard.down(m)
  try {
    await run()
  } finally {
    for (const m of [...mods].reverse()) await page.keyboard.up(m)
  }
}

// Performs one step with the real mouse and keyboard, or for setup in the page.
async function perform (page, step) {
  if (step.act === 'click') {
    const { x, y } = await pixel(page, step.where)
    await withKeys(page, step.mods, () => page.mouse.click(x, y, { button: step.button }))
  } else if (step.act === 'dblclick') {
    const { x, y } = await pixel(page, step.where)
    await page.mouse.dblclick(x, y)
  } else if (step.act === 'drag') {
    const points = []
    for (const where of step.path) points.push(await pixel(page, where))
    await withKeys(page, step.mods, async () => {
      await page.mouse.move(points[0].x, points[0].y)
      await page.mouse.down({ button: step.button })
      for (const p of points.slice(1)) await page.mouse.move(p.x, p.y, { steps: DRAG_STEPS })
      await page.mouse.up({ button: step.button })
    })
  } else if (step.act === 'press') {
    const [first, ...rest] = await Promise.all(step.path.map((where) => pixel(page, where)))
    await page.mouse.move(first.x, first.y)
    await page.mouse.down({ button: step.button })
    for (const p of rest) await page.mouse.move(p.x, p.y, { steps: DRAG_STEPS })
  } else if (step.act === 'release') {
    await page.mouse.up({ button: step.button })
  } else if (step.act === 'touchpad') {
    const corners = []
    for (const where of step.path) corners.push(await pixel(page, where))
    const points = [corners[0]]
    for (const [a, b] of corners.slice(1).map((p, i) => [corners[i], p])) {
      for (let n = 1; n <= DRAG_STEPS; n++) points.push({ x: a.x + (b.x - a.x) * n / DRAG_STEPS, y: a.y + (b.y - a.y) * n / DRAG_STEPS })
    }
    await page.evaluate(touchpadRightDragInPage, points)
  } else if (step.act === 'key') {
    await withKeys(page, step.mods, () => page.keyboard.press(step.name))
  } else if (step.act === 'tool') {
    await page.evaluate((t) => engine.setTool(t), step.tool)
  } else if (step.act === 'given') {
    await page.evaluate(({ layer, cell, value }) => {
      pu.pu_q[layer][pu.centerlist[cell]] = value
      pu.redraw()
    }, step)
  } else {
    throw new Error(`unknown step ${JSON.stringify(step)}`)
  }
}

// Clears the board and its givens, picks `tool`, runs `setup`, picks `tool` again (setup may have used another), then
// runs each stage and returns each stage's change. `tool` carries its style, since the engine keeps a tool's last one.
async function runCase (page, tool, setup, stages) {
  await page.evaluate((t) => {
    engine.releaseHolds()
    for (const layer of ['symbol', 'number', 'deletelineE']) pu.pu_q[layer] = {}
    engine.restart()
    engine.setTool(t)
  }, tool)
  for (const step of setup) await perform(page, step)
  await page.evaluate((t) => engine.setTool(t), tool)
  const start = await page.evaluate(snapshotInPage)
  const changes = []
  for (const [steps] of stages) {
    for (const step of steps) await perform(page, step)
    changes.push(await page.evaluate(changeInPage, { before: start, after: await page.evaluate(snapshotInPage) }))
  }
  return changes
}

// Runs a case and returns each stage's change beside the expected one. Most gestures also move Penpa+'s cursors, which
// the card names only for the tools it serves, so a case whose expected lines name no cursor is read without them.
async function checkedChanges (page, tool, setup, stages) {
  const expected = stages.map(([, change]) => [...change].sort())
  const seesCursor = expected.flat().some((line) => line.startsWith('cursor'))
  const all = await runCase(page, tool, setup, stages)
  const changes = seesCursor ? all : all.map((c) => c.filter((line) => !line.startsWith('cursor')))
  return { changes, expected, mismatch: JSON.stringify(changes) !== JSON.stringify(expected) }
}

// Whether any case of a row, given as each case's stages, expects the board to change.
const casesExpectChange = (stagesOfCases) => stagesOfCases.some((stages) => stages.some(([, change]) => change.length > 0))

// A tool's Mouse card rows, as `toolGuide.mouseRows` gives them, as gesture -> words.
const byGesture = ({ left, right, drag, digit, more }) => Object.fromEntries([['Left click', left], ['Right click', right], ['Drag', drag], ...(digit ? [['Digit', digit]] : []), ...more])

// The words of a Given row, the card's other way to name no change.
const LEFT_ALONE = 'left alone'

// The rows whose words and cases disagree on whether the board changes: a row reading `nothing` (the card's `—`) or
// LEFT_ALONE whose cases expect a change, or another whose cases expect none. `stagesOf(cases)` gives each case's stages.
function unlikeRows (label, rows, byRow, nothing, stagesOf) {
  const saysNoChange = (text) => text.startsWith(nothing) || text === LEFT_ALONE
  return Object.entries(rows).filter(([g]) => byRow[g])
    .filter(([g, text]) => saysNoChange(text) === casesExpectChange(stagesOf(byRow[g])))
    .map(([g, text]) => `${label} ${g}: "${text}"`)
}

// ---- The checks ------------------------------------------------------------------------------------------------------

const toolOfKey = (key) => {
  const [mode, submode] = key.split('/')
  return { mode, submode: submode === '' ? null : submode }
}

describe('the Mouse card against the board', () => {
  let opened
  before(async () => { opened = await openSolvePage(browser(), await newBoardSolveLink(browser())) })
  after(async () => { await opened?.context.close() })

  // Each tool's style as the page first offers it, before a case changes it.
  let firstStyles
  before(async () => {
    firstStyles = await opened.page.evaluate(() => Object.fromEntries(engine.listTools().map((t) => {
      engine.setTool(t)
      return [toolGuide.toolKey(t), engine.getTool().style]
    })))
  })

  it('has a case for every row of every tool the page offers, none for a row the card lacks, and none that expects a change for a row naming none', async () => {
    const { nothing, tools } = await opened.page.evaluate(() => ({
      nothing: toolGuide.NOTHING,
      tools: engine.listTools().filter((t) => t.mode !== 'symbol').map((t) => [toolGuide.toolKey(t), toolGuide.mouseRows(t)])
    }))
    const rows = tools.map(([k, r]) => [k, byGesture(r)])
    const missing = rows.flatMap(([k, words]) => Object.keys(words).filter((g) => !CASES[k]?.[g]).map((g) => `${k} ${g}`))
    const extra = Object.entries(CASES).flatMap(([k, byRow]) => Object.keys(byRow)
      .filter((g) => !(g in (rows.find(([rk]) => rk === k)?.[1] ?? {}))).map((g) => `${k} ${g}`))
    const unlike = rows.flatMap(([k, words]) => unlikeRows(k, words, CASES[k] ?? {}, nothing, (cases) => cases.map(([, , stages]) => stages)))
    assert.deepEqual({ missing, extra, unlike }, { missing: [], extra: [], unlike: [] })
  })

  // The Shape tools of each row set are split over this many tests, each well inside the seam's per-test timeout.
  const SHAPE_PARTS = 4
  for (const [rowSet, byRow] of Object.entries(SHAPE_CASES)) {
    for (let part = 0; part < SHAPE_PARTS; part++) {
      it(`every Shape tool Penpa+ handles as ${rowSet} has the card's rows for it, each true (part ${part + 1} of ${SHAPE_PARTS})`, async () => {
        const { nothing, shapes } = await opened.page.evaluate((onOff) => ({
          nothing: toolGuide.NOTHING,
          shapes: engine.listTools().filter((t) => t.mode === 'symbol' && Boolean(pu.onoff_symbolmode_list[t.submode]) === onOff)
            .map((t) => ({ submode: t.submode, parts: pu.onoff_symbolmode_list[t.submode], rows: toolGuide.mouseRows(t) }))
        }), rowSet === 'onOff')
        const ours = shapes.filter((_, i) => i % SHAPE_PARTS === part)
        assert.notEqual(ours.length, 0, `the page offers ${rowSet} shapes`)
        const wrong = []
        for (const { submode, parts, rows } of ours) {
          const words = byGesture(rows)
          if (JSON.stringify(Object.keys(words)) !== JSON.stringify(Object.keys(byRow))) wrong.push(`${submode}: rows ${Object.keys(words).join(', ')}`)
          wrong.push(...unlikeRows(submode, words, byRow, nothing, (cases) => cases.map(([, , stagesOf]) => stagesOf(submode, parts))))
          const tool = { mode: 'symbol', submode, style: firstStyles[`symbol/${submode}`] }
          for (const [row, cases] of Object.entries(byRow)) {
            for (const [title, setup, stagesOf] of cases) {
              const stages = stagesOf(submode, parts)
              const got = await checkedChanges(opened.page, tool, setup, stages)
              if (got.mismatch) wrong.push(`${submode} ${row}: ${title}: got ${JSON.stringify(got.changes)}`)
            }
          }
        }
        assert.deepEqual(wrong, [])
      })
    }
  }

  for (const [toolKey, byRow] of Object.entries(CASES)) {
    describe(toolKey, () => {
      for (const [row, cases] of Object.entries(byRow)) {
        for (const [title, setup, stages] of cases) {
          it(`${row}: ${title}`, async () => {
            const { changes, expected } = await checkedChanges(opened.page, { ...toolOfKey(toolKey), style: firstStyles[toolKey] }, setup, stages)
            assert.deepEqual(changes, expected)
          })
        }
      }
    })
  }
})
