// Tier C (`live/tier-c.mjs`): full solves on solve links with an answer check. The answer-aimed fuzz solves every
// puzzle with several seeds of the generator and checks that no page error is raised and that the answer check reads
// unsolved until the last correct entry and solved after it. The converter turns a Share > Replay link into a
// recording that replays to the board the link's solve ended on.
import assert from 'node:assert/strict'
import { before, describe, it } from 'node:test'
import { openPenpa, useBrowser } from './page.mjs'
import { engineDriver, replay } from './replay.mjs'
import { settle } from './settle.mjs'
import {
  answerRun, buildPuzzle, convertReplayLink, generateSolve, RECORDING_SEED, TIER_C_PUZZLES, TIER_C_SEEDS
} from './tier-c.mjs'

const browser = useBrowser()

// Opens `puzzle`'s solve link and makes `steps` on it through the engine driver; the caller closes the context.
async function solvedPage (puzzle, steps, options) {
  const opened = await openPenpa(browser(), puzzle.source, options)
  await settle(() => opened.page.evaluate(() => pu.centerlist.length > 0), true)
  const apply = engineDriver.start(opened.page)
  for (const step of steps) await apply(step)
  return opened
}

// Runs in the page: the solve history part (`r`) of the page's Replay link.
function replayHistoryInPage () {
  return pu.maketext_replay().split('&r=')[1]
}

// The genres whose solve histories Chris sends as Replay links.
const HISTORY_GENRES = ['starbattle', 'slitherlink']

describe('tier C', () => {
  const puzzles = {}
  before(async () => {
    for (const name of TIER_C_PUZZLES) puzzles[name] = await buildPuzzle(browser(), name)
  })

  describe('the answer-aimed fuzz', () => {
    for (const name of TIER_C_PUZZLES) {
      for (const seed of TIER_C_SEEDS) {
        it(`solves ${name} with seed ${seed}, unsolved until the last correct entry and solved after it`, async () => {
          const { failure } = await answerRun(browser(), puzzles[name], generateSolve(puzzles[name], seed))
          assert.equal(failure, null)
        })
      }
    }
  })

  describe('the Replay-link converter', () => {
    for (const name of HISTORY_GENRES) {
      it(`turns the Replay link of a ${name} solve into a recording that replays to the solved board`, async () => {
        const solve = generateSolve(puzzles[name], RECORDING_SEED)
        const { failure, replayLink } = await answerRun(browser(), puzzles[name], solve)
        assert.equal(failure, null, 'the solve the link is made from (the premise)')
        assert.ok(solve.steps.some((s) => s.kind === 'undo'), 'the solve undoes (the premise)')
        const recording = await convertReplayLink(browser(), replayLink)
        assert.ok(!recording.steps.some((s) => s.kind === 'undo' || s.kind === 'redo'), 'an undo converts to the input that makes its change')
        const { checkpoints, report } = await replay(browser(), recording)
        assert.equal(report, null)
        assert.match(checkpoints.at(-1).state, /^sol_flag = 1$/m)
      })
    }
  })

  // The ticket's open question: a solver's Replay link of a puzzle reopened from saved progress (`PenpaProgress.save`,
  // which stores the solve-mode duplicate link) still holds the whole solve history, not only the board.
  describe('saved progress of a solved puzzle, reloaded', () => {
    let before0, after0, solvedAfter
    before(async () => {
      const puzzle = puzzles.starbattle
      const { context, page } = await solvedPage(puzzle, generateSolve(puzzle, RECORDING_SEED).steps, { served: true })
      try {
        before0 = await page.evaluate(replayHistoryInPage)
        await page.evaluate(() => PenpaProgress.save())
        await page.reload()
        await page.waitForFunction(() => typeof pu !== 'undefined')
        after0 = await settle(() => page.evaluate(replayHistoryInPage), before0)
        solvedAfter = await settle(() => page.evaluate(() => pu.sol_flag), 1)
      } finally {
        await context.close()
      }
    })

    it('keeps the solve history: its Replay link holds the same changes', () => {
      assert.ok(before0 && !before0.includes('penpaerror'), 'the solve made a history (the premise)')
      assert.equal(after0, before0)
    })

    // #83 (the solved flag unset on load) was found on tier D's audit-c14 board; a solved board of tier C's reads
    // solved once loaded.
    it('reads solved', () => {
      assert.equal(solvedAfter, 1)
    })
  })

  it('reads unsolved once a solved sudoku has a conflict', { todo: '#64: the solved flag stays set after a conflict' }, async () => {
    const puzzle = puzzles['sudoku-9x9']
    const { steps } = generateSolve(puzzle, RECORDING_SEED)
    // A digit of another cell of its row, typed into a solved cell.
    const [cell] = puzzle.answer
    const other = puzzle.answer.find((c) => c.row === cell.row && c.digit !== cell.digit)
    const { x, y } = puzzle.points[cell.num]
    const conflict = [
      { kind: 'pointer', action: 'down', button: 'left', ctrl: false, x, y, num: cell.num },
      { kind: 'pointer', action: 'up', button: null, ctrl: false, x, y, num: cell.num },
      { kind: 'key', call: 'key_number', args: [String(other.digit)] }
    ]
    const { context, page } = await solvedPage(puzzle, [...steps, ...conflict])
    try {
      assert.notDeepEqual(await page.evaluate(() => pu.conflict_cells), [], 'the digit makes a conflict (the premise)')
      assert.equal(await page.evaluate(() => pu.sol_flag), 0)
    } finally {
      await context.close()
    }
  })
})
