// The fuzz (`live/fuzz.mjs`): random steps on a few puzzles keep every solving invariant, and a bug planted against each
// invariant is caught at its checkpoint and saved as a recording that replays to the board it failed on.
import assert from 'node:assert/strict'
import { mkdtemp, readFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { after, before, describe, it } from 'node:test'
import { fileURLToPath } from 'node:url'
import { fuzz, FUZZ_SEEDS, FUZZ_STEPS } from './fuzz.mjs'
import { AKARI_SOLVE, numberSolveLinkInPage, openPenpa, takePageErrors, useBrowser } from './page.mjs'
import { makeSurfaceSolveLink, replay } from './replay.mjs'

const browser = useBrowser()

const CLASS_P = fileURLToPath(new URL('../docs/js/class_p.js', import.meta.url))
// Indices in `pu.centerlist` of the Number puzzle's given and of the cell its answer fills.
const GIVEN_CELL = 0
const ANSWER_CELL = 1
// The seed and step count every planted bug is caught within.
const PLANT_SEED = 1
const PLANT_STEPS = 40

// Each plant: a source change to `class_p.js` that breaks one invariant, the failure the fuzz must report, and what the
// saved recording's replay on the planted page must show: its report (null when it reaches the board the fuzz failed
// on), the step it threw at, and the page errors of every page the test opened.
const PLANTS = [
  {
    invariant: 'no page error, from a step that throws',
    from: /(\r?\n {4}key_backspace\(\) \{\r?\n)/,
    to: '$1        throw new Error("planted");\n',
    failure: /^step \d+ \(key_backspace\(\)\) threw: planted$/,
    replays: ({ thrown }) => assert.match(thrown ?? 'no throw', /could not be replayed: planted$/)
  },
  {
    // `redraw`'s own catch logs the throw with `console.error`.
    invariant: 'no page error, from a console.error',
    from: /(\r?\n {12}this\.draw\(\);\r?\n)/,
    to: '$1            if (this.pu_a.command_undo.__a.length > 1) throw new Error("planted draw");\n',
    failure: /^step \d+ \(.*\): page error: console\.error: .*planted draw/,
    replays: ({ report }, raised) => {
      assert.equal(report, null)
      assert.ok(raised.some((e) => /planted draw/.test(e)), `the replay page logged the planted error:\n${raised.join('\n')}`)
    }
  },
  {
    invariant: 'one draw() per redraw()',
    from: /(\r?\n {12}this\.draw\(\);\r?\n)/,
    to: '$1            if (this.pu_a.command_undo.__a.length) this.draw();\n',
    failure: /^step \d+ \(.*\) ran a redraw\(\) with 2 draw\(\) calls$/,
    replays: ({ report }) => assert.equal(report, null)
  },
  {
    // The answer board's first redo with two entries pending drops the oldest, so redo-all leaves an edit undone.
    invariant: 'undo-all then redo-all',
    from: /(\r?\n {4}redo\(replay = false\) \{\r?\n)/,
    to: '$1        if (this.mode.qa === "pu_a" && this.pu_a.command_redo.__a.length > 1 && !this.planted) { this.planted = true; this.pu_a.command_redo.__a.shift(); this.pu_a_col.command_redo.__a.shift(); }\n',
    failure: /^step \d+ \(.*\): undo-all then redo-all changed the state:\n/,
    replays: ({ report }) => assert.equal(report, null)
  },
  {
    // Making the Clone link drops the newest undo entry.
    invariant: 'save/load round trip',
    from: /(\r?\n {4}maketext_duplicate\(\) \{\r?\n)/,
    to: '$1        if (this.pu_a.command_undo.__a.length > 2) { this.pu_a.command_undo.__a.pop(); }\n',
    failure: /^step \d+ \(.*\): the save\/load round trip changed the state:\n/,
    replays: ({ report }) => assert.equal(report, null)
  }
]

// The `#` part of a 4x4 Number solve link with one given and a one-digit author's answer.
async function makeNumberSolveLink () {
  const { context, page } = await openPenpa(browser())
  try {
    return await page.evaluate(numberSolveLinkInPage, { given: GIVEN_CELL, answer: ANSWER_CELL })
  } finally {
    await context.close()
  }
}

describe('the fuzz', () => {
  const puzzles = []
  let saveDir
  before(async () => {
    puzzles.push(
      { name: 'surface-4x4', source: await makeSurfaceSolveLink(browser()) },
      { name: 'number-4x4', source: await makeNumberSolveLink() },
      { name: 'akari', source: AKARI_SOLVE }
    )
    saveDir = await mkdtemp(join(tmpdir(), 'penpa-fuzz-'))
  })
  after(async () => { if (saveDir) await rm(saveDir, { recursive: true, force: true }) })

  for (const name of ['surface-4x4', 'number-4x4', 'akari']) {
    for (const seed of FUZZ_SEEDS) {
      it(`keeps every invariant on ${name} with seed ${seed}`, async () => {
        const puzzle = puzzles.find((p) => p.name === name)
        const { failure, steps } = await fuzz(browser(), puzzle, { seed, count: FUZZ_STEPS, saveDir })
        assert.equal(failure, null)
        assert.equal(steps.length, FUZZ_STEPS)
      })
    }
  }

  describe('with a bug planted', () => {
    let source
    before(async () => { source = await readFile(CLASS_P, 'utf8') })

    for (const plant of PLANTS) {
      it(`catches a broken ${plant.invariant} and saves a recording that replays to the board it failed on`, async () => {
        const planted = source.replace(plant.from, plant.to)
        assert.notEqual(planted, source, 'the line to plant at is in class_p.js')
        const setup = (context) => context.route(/\/js\/class_p\.js(\?|$)/, (route) => route.fulfill({
          contentType: 'text/javascript', body: planted
        }))
        const puzzle = puzzles.find((p) => p.name === 'surface-4x4')
        const { failure, saved } = await fuzz(browser(), puzzle, {
          seed: PLANT_SEED, count: PLANT_STEPS, saveDir, served: true, setup
        })
        assert.match(failure ?? 'no failure', plant.failure)
        const recording = JSON.parse(await readFile(saved, 'utf8'))
        assert.deepEqual(recording.header.fuzz, { puzzle: 'surface-4x4', seed: PLANT_SEED })
        assert.match(recording.header.commit, /^[0-9a-f]{7,40}$/)
        const replayed = await replay(browser(), recording, { id: 'planted', served: true, setup }).catch((e) => ({ thrown: e.message }))
        // A planted error is the pages' own by design, so it is taken here and `useBrowser` does not fail the test on it.
        plant.replays(replayed, takePageErrors())
      })
    }
  })
})
