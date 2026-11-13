// The fuzz (`live/fuzz.mjs`): random steps on a few puzzles keep every solving invariant, and a bug planted against each
// invariant is caught at its checkpoint and saved as a recording that replays to the board it failed on.
import assert from 'node:assert/strict'
import { mkdtemp, readFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { after, before, describe, it } from 'node:test'
import { fileURLToPath } from 'node:url'
import { fuzz, FUZZ_SEEDS, FUZZ_STEPS } from './fuzz.mjs'
import { AKARI_SOLVE, makeNumberSolveLink, takePageErrors, useBrowser } from './page.mjs'
import { makeSurfaceSolveLink, replay } from './replay.mjs'

const browser = useBrowser()

const CLASS_P = fileURLToPath(new URL('../docs/js/class_p.js', import.meta.url))
// The puzzles fuzzed, each by the name its saved recordings carry and how its link is made.
const PUZZLES = [
  { name: 'surface-4x4', link: makeSurfaceSolveLink },
  { name: 'number-4x4', link: makeNumberSolveLink },
  { name: 'akari', link: async () => AKARI_SOLVE }
]
// The puzzle, seed and step count every planted bug is caught within.
const PLANT_PUZZLE = PUZZLES[0].name
const PLANT_SEED = 1
const PLANT_STEPS = 40
// The line of `redraw` the plants below go after.
const AFTER_DRAW = /(\r?\n {12}this\.draw\(\);\r?\n)/

// Each plant: a source change to `class_p.js` that breaks one invariant, the failure the fuzz must report, and what the
// saved recording's replay on the planted page must show: its report (null when it reaches the board the fuzz failed
// on) or the step it threw at. A plant that logs an error on purpose names it in `raises`, and the test takes it.
const PLANTS = [
  {
    invariant: 'no page error, from a step that throws',
    from: /(\r?\n {4}mouseevent\(x, y, num, ctrl_key = false, e = null, obj = null\) \{\r?\n)/,
    to: '$1        if (this.mouse_mode === "up") throw new Error("planted");\n',
    failure: /^step \d+ \(up at point \d+\) threw: planted$/,
    replays: ({ thrown }) => assert.match(thrown ?? 'no throw', /could not be replayed: planted$/)
  },
  {
    // `redraw`'s own catch logs the throw with `console.error`.
    invariant: 'no page error, from a console.error',
    from: AFTER_DRAW,
    to: '$1            if (this.pu_a.command_undo.__a.length > 1) throw new Error("planted draw");\n',
    failure: /^step \d+ \(.*\): page error: console\.error: .*planted draw/,
    raises: /planted draw/
  },
  {
    // Only the page a Clone link opens logs it.
    invariant: 'no page error on the reloaded page',
    from: AFTER_DRAW,
    to: '$1            if (location.hash.includes("l=solvedup")) console.error("planted reload");\n',
    failure: /^step \d+ \(.*\): the save\/load round trip's page raised: console\.error: planted reload$/,
    raises: /planted reload/
  },
  {
    // Only Penpa+'s replay redo logs it, which the fuzz's redo-all makes and no step does.
    invariant: 'no page error in undo-all then redo-all',
    from: /(\r?\n {4}redo\(replay = false\) \{\r?\n)/,
    to: '$1        if (replay) console.error("planted redo");\n',
    failure: /^step \d+ \(.*\), in undo-all then redo-all,: page error: console\.error: planted redo$/,
    raises: /planted redo/
  },
  {
    invariant: 'no page error in making the Clone link',
    from: /(\r?\n {4}maketext_duplicate\(\) \{\r?\n)/,
    to: '$1        console.error("planted clone");\n',
    failure: /^step \d+ \(.*\), in making the Clone link,: page error: console\.error: planted clone$/,
    raises: /planted clone/
  },
  {
    // C15's shape: the answer check redraws from inside `redraw`.
    invariant: 'one draw() per redraw()',
    from: /(\r?\n {20}this\.check_solution\(\);\r?\n)/,
    to: '$1                    if (check_sol && this.pu_a.command_undo.__a.length) this.redraw(false, false);\n',
    failure: /^step \d+ \(.*\) ran a redraw\(\) with 2 draw\(\) calls$/
  },
  {
    // The answer board's first redo with two entries pending drops the oldest, so redo-all leaves an edit undone.
    invariant: 'undo-all then redo-all',
    from: /(\r?\n {4}redo\(replay = false\) \{\r?\n)/,
    to: '$1        if (this.mode.qa === "pu_a" && this.pu_a.command_redo.__a.length > 1 && !this.planted) { this.planted = true; this.pu_a.command_redo.__a.shift(); this.pu_a_col.command_redo.__a.shift(); }\n',
    failure: /^step \d+ \(.*\): undo-all then redo-all changed the state:\n/
  },
  {
    // Making the Clone link drops the newest undo entry.
    invariant: 'save/load round trip',
    from: /(\r?\n {4}maketext_duplicate\(\) \{\r?\n)/,
    to: '$1        if (this.pu_a.command_undo.__a.length > 2) { this.pu_a.command_undo.__a.pop(); }\n',
    failure: /^step \d+ \(.*\): the save\/load round trip changed the state:\n/
  }
]

describe('the fuzz', () => {
  const sources = {}
  before(async () => {
    for (const { name, link } of PUZZLES) sources[name] = await link(browser())
  })

  for (const { name } of PUZZLES) {
    for (const seed of FUZZ_SEEDS) {
      it(`keeps every invariant on ${name} with seed ${seed}`, async () => {
        const { failure, saved, steps } = await fuzz(browser(), { name, source: sources[name] }, { seed, count: FUZZ_STEPS })
        assert.equal(failure, null, `the failing run is saved as ${saved}`)
        assert.equal(steps.length, FUZZ_STEPS)
      })
    }
  }

  describe('with a bug planted', () => {
    let source, saveDir
    before(async () => {
      source = await readFile(CLASS_P, 'utf8')
      saveDir = await mkdtemp(join(tmpdir(), 'penpa-fuzz-'))
    })
    after(async () => { if (saveDir) await rm(saveDir, { recursive: true, force: true }) })

    for (const plant of PLANTS) {
      it(`catches a broken ${plant.invariant} and saves a recording that replays to the board it failed on`, async () => {
        const planted = source.replace(plant.from, plant.to)
        assert.notEqual(planted, source, 'the line to plant at is in class_p.js')
        const setup = (context) => context.route(/\/js\/class_p\.js(\?|$)/, (route) => route.fulfill({
          contentType: 'text/javascript', body: planted
        }))
        const { failure, saved } = await fuzz(browser(), { name: PLANT_PUZZLE, source: sources[PLANT_PUZZLE] }, {
          seed: PLANT_SEED, count: PLANT_STEPS, saveDir, served: true, setup
        })
        if (plant.raises) {
          const raised = takePageErrors()
          assert.ok(raised.length && raised.every((e) => plant.raises.test(e)), `only the planted error was raised:\n${raised.join('\n')}`)
        }
        assert.match(failure ?? 'no failure', plant.failure)
        const recording = JSON.parse(await readFile(saved, 'utf8'))
        assert.deepEqual(recording.header.fuzz, { puzzle: PLANT_PUZZLE, seed: PLANT_SEED })
        assert.match(recording.header.commit, /^[0-9a-f]{7,40}$/)
        const replayed = await replay(browser(), recording, { id: 'planted', served: true, setup }).catch((e) => ({ thrown: e.message }))
        // The replay page may raise the planted error again; the fuzz's own pages' were taken above.
        if (plant.raises) takePageErrors()
        if (plant.replays) {
          plant.replays(replayed)
        } else {
          assert.equal(replayed.report, null)
        }
      })
    }
  })
})
