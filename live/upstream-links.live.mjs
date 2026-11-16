// The links the fork writes open on upstream's own code (ruled by Chris, 2026-11-14: links stay upstream's in both
// directions; fork-only state never goes in a link). Covers the Penpa links the save dialog and the progress store write;
// the .pp and .gmp file texts are for other tools and are not opened. The reading direction is the import snapshots' job.
import assert from 'node:assert/strict'
import { after, before, describe, it } from 'node:test'
import { fileURLToPath } from 'node:url'
import { canonicalState, readEngineState } from './canonical-state.mjs'
import { buildNumberBoardInPage, ANSWER_CELL, GIVEN_CELL, linkOfButtonInPage, openPenpa, shadeInPage, typeDigitInPage, useBrowser } from './page.mjs'
import { settle } from './settle.mjs'
import { unpackUpstreamDocs } from './upstream-docs.mjs'

const browser = useBrowser()

// `readEngineState` is defined in `docs/js/recorder.js`, which upstream's page lacks.
const RECORDER = fileURLToPath(new URL('../docs/js/recorder.js', import.meta.url))
// Indices in `pu.centerlist` of the cells the solver fills and the author shades.
const OTHER_CELL = 2
const SHADED_CELL = 3
const TYPED_DIGIT = '3'
// The header fields (#21), with the characters the header escapes in a link (comma, `&`, `=`, a line break) but no HTML,
// which only the fork reads back as typed (`header_text.js`): upstream's reader would turn it into elements.
const HEADER = { saveinfotitle: 'Title, 1 = 2', saveinfoauthor: 'Setter, A=B 5%', saveinfosource: 'https://example.test/?a=1&b=2', saveinforules: 'Rule 1\nline2, x=y' }
// A global only the fork's page defines (`docs/js/header_text.js`).
const FORK_ONLY_GLOBAL = 'header_text_to_html'

// Runs in the page, on the board `buildNumberBoardInPage` made: adds a shaded cell and the header fields. Returns the
// cell numbers and entries of the board.
function decorateBoardInPage ({ cells, header }) {
  pu.pu_q.surface[pu.centerlist[cells.shaded]] = 1
  for (const [id, value] of Object.entries(header)) document.getElementById(id).value = value
  return { centers: pu.centerlist.slice(0, cells.shaded + 1), given: pu.pu_q.number, answer: pu.pu_a.number }
}

// Runs in the page: the links the progress store keeps (`progress.js`), which the save dialog does not write.
async function storedProgressInPage () {
  UserSettings.save_current_puzzle = true
  await PenpaProgress.save()
  const stored = await localforage.getItem(PenpaProgress.getHash(pu.url))
  return stored.slice(stored.indexOf('#'))
}

// Runs in the page: what the opened link made of the board, besides the canonical state.
function readBoardInPage ({ headerIds, forkOnlyGlobal }) {
  return {
    given: pu.pu_q.number,
    shaded: pu.pu_q.surface,
    solution: pu.solution,
    mode: pu.mmode,
    comp: pu.comp,
    header: Object.fromEntries(headerIds.map((id) => [id, document.getElementById(id).value])),
    forkOnlyGlobalDefined: typeof globalThis[forkOnlyGlobal] !== 'undefined'
  }
}

// Opens `hash` on the page at `pageUrl` (the fork's own when undefined), waits for the given, and returns the board
// and canonical state.
async function openAndRead (pageUrl, hash) {
  const opened = await openPenpa(browser(), hash, { url: pageUrl })
  try {
    if (pageUrl) await opened.page.addScriptTag({ path: RECORDER })
    const givens = await settle(() => opened.page.evaluate(() => Object.keys(pu.pu_q.number).length), 1)
    assert.equal(givens, 1, 'the given has loaded')
    const board = await opened.page.evaluate(readBoardInPage, { headerIds: Object.keys(HEADER), forkOnlyGlobal: FORK_ONLY_GLOBAL })
    const state = canonicalState(await opened.page.evaluate(readEngineState))
    return { board, state }
  } finally {
    await opened.context.close()
  }
}

describe('links the fork writes, opened on upstream/master', () => {
  let upstream
  let board
  const links = {}
  before(async () => {
    upstream = unpackUpstreamDocs()
    const author = await openPenpa(browser())
    try {
      const cells = { given: GIVEN_CELL, answer: ANSWER_CELL, shaded: SHADED_CELL }
      await author.page.evaluate(buildNumberBoardInPage, cells)
      board = await author.page.evaluate(decorateBoardInPage, { cells, header: HEADER })
      for (const [kind, handler] of [['edit', 'savetext_edit'], ['duplicate', 'savetext_clone'], ['solve', 'savetext_solve'],
        ['comp', 'savetext_comp'], ['solution', 'savetext_withsolution']]) {
        links[kind] = await author.page.evaluate(linkOfButtonInPage, handler)
      }
    } finally {
      await author.context.close()
    }
    const solver = await openPenpa(browser(), links.solution)
    try {
      const givens = await settle(() => solver.page.evaluate(() => Object.keys(pu.pu_q.number).length), 1)
      assert.equal(givens, 1, 'the solver\'s page has loaded the solution link')
      await solver.page.evaluate(typeDigitInPage, { index: OTHER_CELL, digit: TYPED_DIGIT })
      await solver.page.evaluate(shadeInPage, SHADED_CELL)
      for (const [kind, handler] of [['progress', 'savetext_clone'], ['solverSolve', 'savetext_solve'], ['solverComp', 'savetext_comp'],
        ['replay', 'savetext_withreplay'], ['editWithSolution', 'savetext_edit']]) {
        links[kind] = await solver.page.evaluate(linkOfButtonInPage, handler)
      }
      links.storedProgress = await solver.page.evaluate(storedProgressInPage)
    } finally {
      await solver.context.close()
    }
  })
  after(() => upstream?.remove())

  // Per link: the mode it opens in, whether it is a contest link, whether it carries the author's solution, and the
  // canonical-state lines that show its answer board came through.
  const cell = (i) => board.centers[i]
  const AUTHOR_ANSWER = () => `pu_a.number.${cell(ANSWER_CELL)} = ${JSON.stringify(board.answer[cell(ANSWER_CELL)])}`
  const SOLVER_ANSWER = () => [`pu_a.number.${cell(OTHER_CELL)} = ["${TYPED_DIGIT}",2,"1"]`, `pu_a.surface.${cell(SHADED_CELL)} = 1`]
  const NO_ANSWER = () => ['pu_a.number = {}']
  const KINDS = {
    edit: { mode: '', comp: false, solution: false, lines: () => [AUTHOR_ANSWER()] },
    duplicate: { mode: '', comp: false, solution: false, lines: () => [AUTHOR_ANSWER()] },
    solve: { mode: 'solve', comp: false, solution: false, lines: NO_ANSWER },
    comp: { mode: 'solve', comp: true, solution: false, lines: NO_ANSWER },
    solution: { mode: 'solve', comp: false, solution: true, lines: NO_ANSWER },
    progress: { mode: 'solve', comp: false, solution: true, lines: () => [...SOLVER_ANSWER(), 'pu_a.command_undo.length = 2'] },
    storedProgress: { mode: 'solve', comp: false, solution: true, lines: () => [...SOLVER_ANSWER(), 'pu_a.command_undo.length = 2'] },
    solverSolve: { mode: 'solve', comp: false, solution: false, lines: NO_ANSWER },
    solverComp: { mode: 'solve', comp: true, solution: false, lines: NO_ANSWER },
    replay: { mode: 'solve', comp: false, solution: false, lines: () => ['pu_a.command_redo.length = 2'] },
    editWithSolution: { mode: '', comp: false, solution: false, lines: () => SOLVER_ANSWER() }
  }
  for (const [kind, expected] of Object.entries(KINDS)) {
    it(`opens the ${kind} link to the board the fork opens, with its content`, async () => {
      const onFork = await openAndRead(undefined, links[kind])
      const onUpstream = await openAndRead(upstream.pageUrl, links[kind])
      assert.equal(onFork.board.forkOnlyGlobalDefined, true, 'the fork\'s page is the fork\'s')
      assert.equal(onUpstream.board.forkOnlyGlobalDefined, false, 'the page opened for upstream runs upstream\'s files')
      assert.deepEqual({ ...onUpstream.board, forkOnlyGlobalDefined: null }, { ...onFork.board, forkOnlyGlobalDefined: null })
      assert.equal(onUpstream.state, onFork.state)
      assert.deepEqual(onUpstream.board.given, { [cell(GIVEN_CELL)]: board.given[cell(GIVEN_CELL)] })
      assert.deepEqual(onUpstream.board.shaded, { [cell(SHADED_CELL)]: 1 })
      assert.equal(onUpstream.board.mode, expected.mode)
      assert.equal(onUpstream.board.comp, expected.comp)
      assert.equal(onUpstream.board.solution !== '', expected.solution)
      assert.deepEqual(onUpstream.board.header, HEADER)
      const lines = onUpstream.state.split('\n')
      for (const line of expected.lines()) assert.ok(lines.includes(line), `the state has "${line}"`)
    })
  }
})
