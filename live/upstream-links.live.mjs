// Every kind of link the fork writes opens on upstream's own code (ruled by Chris, 2026-11-14: links stay upstream's
// in both directions; fork-only state never goes in a link). The reading direction is the import snapshots' job.
import assert from 'node:assert/strict'
import { after, before, describe, it } from 'node:test'
import { fileURLToPath } from 'node:url'
import { canonicalState, readEngineState } from './canonical-state.mjs'
import { ANSWER_CELL, GIVEN_CELL, openPenpa, shadeInPage, useBrowser } from './page.mjs'
import { settle } from './settle.mjs'
import { unpackUpstreamDocs } from './upstream-docs.mjs'

const browser = useBrowser()

// `readEngineState` is defined in `docs/js/recorder.js`, which upstream's page lacks.
const RECORDER = fileURLToPath(new URL('../docs/js/recorder.js', import.meta.url))
// Cells of the 4x4 board that the author's answer leaves empty.
const OTHER_CELL = 2
const SHADED_CELL = 3
const TYPED_DIGIT = '3'

// Runs in the page. A 4x4 Number puzzle: a given 1, an author's answer of 2, and a shaded cell in the puzzle.
function buildBoardInPage ({ given, answer, shaded }) {
  document.getElementById('nb_size1').value = 4
  document.getElementById('nb_size2').value = 4
  create_newboard()
  pu.pu_q.number[pu.centerlist[given]] = [1, 1, '1']
  pu.pu_q.surface[pu.centerlist[shaded]] = 1
  pu.pu_a.number[pu.centerlist[answer]] = [2, 2, '1']
}

// Runs in the page, on the board `buildBoardInPage` made: every link an author can write from the edit page.
function authorLinksInPage () {
  const hash = (url) => url.slice(url.indexOf('#'))
  return {
    edit: hash(pu.maketext()),
    duplicate: hash(pu.maketext_duplicate()),
    solve: hash(pu.maketext_solve()),
    comp: hash(pu.maketext_compsolve()),
    solution: hash(pu.maketext_solve_solution())
  }
}

// Runs in the page, on a page that opened a solve link: a digit typed and a cell shaded, then every link a solver can write.
function solverLinksInPage ({ index, digit, shaded }) {
  pu.mode_set('number')
  pu.cursol = pu.centerlist[index]
  pu.selection = [pu.cursol]
  pu.key_number(digit)
  pu.redraw()
  pu.mode_set('surface')
  pu.undoredo_counter++
  pu.set_surface(pu.centerlist[shaded], 1)
  pu.redraw()
  const hash = (url) => url.slice(url.indexOf('#'))
  return {
    progress: hash(pu.maketext_duplicate()) + '&l=solvedup',
    solverSolve: hash(pu.maketext_solve()),
    replay: hash(pu.maketext_replay()),
    editWithSolution: hash(pu.maketext())
  }
}

// Runs in the page: what the link made of the board, besides the canonical state.
function readBoardInPage () {
  return JSON.parse(JSON.stringify({
    given: pu.pu_q.number,
    shaded: pu.pu_q.surface,
    solution: pu.solution,
    mode: pu.mmode
  }))
}

// Opens `hash` on a page at `pageUrl` and returns its canonical state and board once the given has loaded.
async function openAndRead (pageUrl, hash, { upstream }) {
  const opened = await openPenpa(browser(), hash, { url: pageUrl })
  try {
    if (upstream) await opened.page.addScriptTag({ path: RECORDER })
    const givens = await settle(() => opened.page.evaluate(() => Object.keys(pu.pu_q.number).length), 1)
    assert.equal(givens, 1, 'the given has loaded')
    const board = await opened.page.evaluate(readBoardInPage)
    const state = canonicalState(await opened.page.evaluate(readEngineState))
    return { board, state }
  } finally {
    await opened.context.close()
  }
}

describe('links the fork writes, opened on upstream/master', () => {
  let upstream
  const links = {}
  before(async () => {
    upstream = unpackUpstreamDocs()
    const author = await openPenpa(browser())
    try {
      await author.page.evaluate(buildBoardInPage, { given: GIVEN_CELL, answer: ANSWER_CELL, shaded: SHADED_CELL })
      Object.assign(links, await author.page.evaluate(authorLinksInPage))
    } finally {
      await author.context.close()
    }
    const solver = await openPenpa(browser(), links.solution)
    try {
      await settle(() => solver.page.evaluate(() => Object.keys(pu.pu_q.number).length), 1)
      Object.assign(links, await solver.page.evaluate(solverLinksInPage, { index: OTHER_CELL, digit: TYPED_DIGIT, shaded: SHADED_CELL }))
    } finally {
      await solver.context.close()
    }
  })
  after(() => upstream?.remove())

  // Per link: the mode it opens in, whether it carries the author's solution, and the canonical-state lines that show its
  // answer board came through. Cell numbers are those of `pu.centerlist[0..3]` on a 4x4 board: 18 (the given), 19 (the
  // author's answer), 20 (the solver's digit) and 21 (the shaded cell).
  const AUTHOR_ANSWER = 'pu_a.number.19 = [2,2,"1"]'
  const SOLVER_ANSWER = ['pu_a.number.20 = ["3",2,"1"]', 'pu_a.surface.21 = 1']
  const KINDS = {
    edit: { mode: '', solution: false, lines: [AUTHOR_ANSWER] },
    duplicate: { mode: '', solution: false, lines: [AUTHOR_ANSWER] },
    solve: { mode: 'solve', solution: false, lines: ['pu_a.number = {}'] },
    comp: { mode: 'solve', solution: false, lines: ['pu_a.number = {}'] },
    solution: { mode: 'solve', solution: true, lines: ['pu_a.number = {}'] },
    progress: { mode: 'solve', solution: true, lines: [...SOLVER_ANSWER, 'pu_a.command_undo.length = 2'] },
    solverSolve: { mode: 'solve', solution: false, lines: ['pu_a.number = {}'] },
    replay: { mode: 'solve', solution: false, lines: ['pu_a.command_redo.length = 2'] },
    editWithSolution: { mode: '', solution: false, lines: SOLVER_ANSWER }
  }
  for (const [kind, expected] of Object.entries(KINDS)) {
    it(`opens the ${kind} link to the board the fork opens, with its content`, async () => {
      const onFork = await openAndRead(undefined, links[kind], { upstream: false })
      const onUpstream = await openAndRead(upstream.pageUrl, links[kind], { upstream: true })
      assert.deepEqual(onUpstream.board, onFork.board)
      assert.equal(onUpstream.state, onFork.state)
      assert.deepEqual(onUpstream.board.given, { 18: [1, 1, '1'] })
      assert.deepEqual(onUpstream.board.shaded, { 21: 1 })
      assert.equal(onUpstream.board.mode, expected.mode)
      assert.equal(onUpstream.board.solution !== '', expected.solution)
      const lines = onUpstream.state.split('\n')
      for (const line of expected.lines) assert.ok(lines.includes(line), `the state has "${line}"`)
    })
  }
})
