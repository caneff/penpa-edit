// Tier C (`live/tier-c.mjs`): full solves on solve links with an answer check. The answer-aimed fuzz solves every
// puzzle, the generated ones and those of solvers' converted histories, with several seeds of the generator and checks
// that no page error is raised and that the answer check reads unsolved until the last correct entry and solved after
// it. The converter turns a Share > Replay link into a recording that replays to the board the link's solve ended on,
// and refuses a history it cannot convert or whose last board is not solved.
import assert from 'node:assert/strict'
import { before, describe, it } from 'node:test'
import { openPenpa, useBrowser } from './page.mjs'
import { engineDriver, listRecordings, readRecording, replay } from './replay.mjs'
import { settle } from './settle.mjs'
import { answerRun, convertReplayLink, generateSolve, RECORDING_SEED, TIER_C_FAMILY, TIER_C_SEEDS } from './tier-c.mjs'
import { boardLoaded, buildPuzzle, puzzleFromRecording, TIER_C_PUZZLES, withPage } from './tier-c-puzzles.mjs'

const browser = useBrowser()

// The kept recordings of solvers' converted histories.
const historyIds = []
for (const id of await listRecordings()) {
  if (id.startsWith(TIER_C_FAMILY + '/') && (await readRecording(id)).header.history) historyIds.push(id)
}

// Opens `puzzle`'s solve link and makes `steps` on it through the engine driver; the caller closes the context.
async function solvedPage (puzzle, steps, options) {
  const opened = await openPenpa(browser(), puzzle.source, options)
  await boardLoaded(opened.page)
  const apply = engineDriver.start(opened.page)
  for (const step of steps) await apply(step)
  return opened
}

// Runs in the page: the solve history part (`r`) of the page's Replay link.
function replayHistoryInPage () {
  return pu.maketext_replay().split('&r=')[1]
}

// A Replay link to `puzzle`'s link holding `changes` as its solve history, oldest first, each as `command_replay` holds
// one: `[prop, key, value, layer, group, timer reading]`.
function replayLinkOf (puzzle, changes) {
  return withPage(browser(), puzzle.source, async (page) => {
    await boardLoaded(page)
    return puzzle.source + '&r=' + await page.evaluate((c) => encrypt_data(JSON.stringify(c)), [...changes].reverse())
  })
}

// Every seed of the answer-aimed fuzz solves `puzzle`.
async function fuzzSolves (puzzle) {
  for (const seed of TIER_C_SEEDS) {
    const { failure } = await answerRun(browser(), puzzle, generateSolve(puzzle, seed))
    assert.equal(failure, null, `seed ${seed}`)
  }
}

// The genres whose solve histories Chris sends as Replay links.
const HISTORY_GENRES = ['starbattle', 'slitherlink']
const STAR = [2, 'star', 2]

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

    for (const id of historyIds) {
      it(`solves the puzzle of ${id} with every seed`, async () => {
        await fuzzSolves(await puzzleFromRecording(browser(), id, await readRecording(id)))
      })
    }
  })

  describe('the Replay-link converter', () => {
    for (const name of HISTORY_GENRES) {
      it(`turns the Replay link of a ${name} solve into a recording that replays to the solved board, and fuzzes its puzzle`, async () => {
        const steps = generateSolve(puzzles[name], RECORDING_SEED)
        const { failure, replayLink } = await answerRun(browser(), puzzles[name], steps)
        assert.equal(failure, null, 'the solve the link is made from (the premise)')
        assert.ok(steps.some((s) => s.kind === 'undo'), 'the solve undoes (the premise)')
        const recording = await convertReplayLink(browser(), replayLink)
        assert.ok(!recording.steps.some((s) => s.kind === 'undo' || s.kind === 'redo'), 'an undo converts to the input that makes its change')
        const { checkpoints, report } = await replay(browser(), recording)
        assert.equal(report, null)
        assert.match(checkpoints.at(-1).state, /^sol_flag = 1$/m)
        await fuzzSolves(await puzzleFromRecording(browser(), `${name}-history`, recording))
      })
    }

    it('reads a Replay link in the older ? form', async () => {
      const { replayLink } = await answerRun(browser(), puzzles.starbattle, generateSolve(puzzles.starbattle, RECORDING_SEED))
      const hashed = await convertReplayLink(browser(), replayLink)
      const queried = await convertReplayLink(browser(), 'https://caneff.github.io/penpa-edit/?' + replayLink.slice(1))
      assert.deepEqual(queried.steps, hashed.steps)
    })

    describe('refuses', () => {
      it('a link with no solve history', async () => {
        await assert.rejects(convertReplayLink(browser(), puzzles.starbattle.source), /the link holds no replay/)
      })

      it('a change to the puzzle layer', async () => {
        const link = await replayLinkOf(puzzles.starbattle, [['symbol', puzzles.starbattle.cells[0], STAR, 'pu_q', 1, 0]])
        await assert.rejects(convertReplayLink(browser(), link), /is to the pu_q layer, not the solver's/)
      })

      it('a change it knows no natural mode for', async () => {
        const link = await replayLinkOf(puzzles.starbattle, [['number', puzzles.starbattle.cells[0], ['1', 9, '1'], 'pu_a', 1, 0]])
        await assert.rejects(convertReplayLink(browser(), link), /no natural mode is known for number/)
      })

      it('an unfinished solve', async () => {
        const link = await replayLinkOf(puzzles.starbattle, [['symbol', puzzles.starbattle.answer[0].num, STAR, 'pu_a', 1, 0]])
        await assert.rejects(convertReplayLink(browser(), link), /is not a solved star battle/)
      })
    })
  })

  // The ticket's open question: a solver's Replay link of a puzzle reopened from saved progress (`PenpaProgress.save`,
  // which stores the solve-mode duplicate link) still holds the whole solve history, not only the board.
  describe('saved progress of a solved puzzle, reloaded', () => {
    let saved, reloaded, solvedAfter
    before(async () => {
      const puzzle = puzzles.starbattle
      const { context, page } = await solvedPage(puzzle, generateSolve(puzzle, RECORDING_SEED), { served: true })
      try {
        saved = await page.evaluate(replayHistoryInPage)
        await page.evaluate(() => PenpaProgress.save())
        await page.reload()
        await page.waitForFunction(() => typeof pu !== 'undefined')
        reloaded = await settle(() => page.evaluate(replayHistoryInPage), saved)
        solvedAfter = await settle(() => page.evaluate(() => pu.sol_flag), 1)
      } finally {
        await context.close()
      }
    })

    it('keeps the solve history: its Replay link holds the same changes', () => {
      assert.ok(saved && !saved.includes('penpaerror'), 'the solve made a history (the premise)')
      assert.equal(reloaded, saved)
    })

    // #83 (the solved flag unset on load) was found on tier D's audit-c14 board; a solved board of tier C's reads
    // solved once loaded.
    it('reads solved', () => {
      assert.equal(solvedAfter, 1)
    })
  })

  it('reads unsolved once a solved sudoku has a conflict', { todo: '#64: the solved flag stays set after a conflict' }, async () => {
    const puzzle = puzzles['sudoku-9x9']
    // A digit of another cell of its row, typed into a solved cell.
    const [cell] = puzzle.answer
    const other = puzzle.answer.find((c) => c.row === cell.row && c.digit !== cell.digit)
    const { x, y } = puzzle.points[cell.num]
    const conflict = [
      { kind: 'pointer', action: 'down', button: 'left', ctrl: false, x, y, num: cell.num },
      { kind: 'pointer', action: 'up', button: null, ctrl: false, x, y, num: cell.num },
      { kind: 'key', call: 'key_number', args: [String(other.digit)] }
    ]
    const { context, page } = await solvedPage(puzzle, [...generateSolve(puzzle, RECORDING_SEED), ...conflict])
    try {
      assert.notDeepEqual(await page.evaluate(() => pu.conflict_cells), [], 'the digit makes a conflict (the premise)')
      assert.equal(await page.evaluate(() => pu.sol_flag), 0)
    } finally {
      await context.close()
    }
  })
})
