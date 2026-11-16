// Tier C (`live/tier-c.mjs`): full solves on solve links with an answer check. The answer-aimed fuzz solves every
// puzzle with several seeds of the generator and checks that no page error is raised and that the answer check reads
// unsolved until the last correct entry and solved after it.
import assert from 'node:assert/strict'
import { before, describe, it } from 'node:test'
import { useBrowser } from './page.mjs'
import { answerRun, buildPuzzle, generateSolve, TIER_C_PUZZLES, TIER_C_SEEDS } from './tier-c.mjs'

const browser = useBrowser()

describe('the answer-aimed fuzz', () => {
  const puzzles = {}
  before(async () => {
    for (const name of TIER_C_PUZZLES) puzzles[name] = await buildPuzzle(browser(), name)
  })

  for (const name of TIER_C_PUZZLES) {
    for (const seed of TIER_C_SEEDS) {
      it(`solves ${name} with seed ${seed}, unsolved until the last correct entry and solved after it`, async () => {
        const { failure } = await answerRun(browser(), puzzles[name], generateSolve(puzzles[name], seed))
        assert.equal(failure, null)
      })
    }
  }
})
