// Measuring the safety net (#32): a replay counts the `mouse_*` and `key_*` handlers of `class_p.js` its steps call,
// a plant is refused unless it changes one line of its handler and leaves its file parsing, a hunt tells a catch from a
// miss and from a harness error, and every plant undoing an audit fix still applies and is caught by a recording made
// for that finding. The whole measurement, every recording against every plant, is `npm run measure`, run by hand.
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { describe, it } from 'node:test'
import { chromium } from 'playwright'
import { takePageErrors, useBrowser } from './page.mjs'
import { auditRecordings, hunt, plantIn, PLANTS } from './plants.mjs'
import { listRecordings, readRecording, replay } from './replay.mjs'

const browser = useBrowser()

// A Surface solve: left, right and Ctrl clicks, a drag, undo and redo, and one digit, every pointer step in Surface.
const SURFACE_ID = 'paint/surface-shade-undo-redo'
const ids = await listRecordings()
const source = (file) => readFile(new URL(`../docs/js/${file}`, import.meta.url), 'utf8')
const LINE_PLANT = PLANTS.find((p) => p.handler === 'mouse_line')
const SURFACE_PLANT = PLANTS.find((p) => p.handler === 'mouse_surface')

describe('a replay with coverage on', () => {
  it('counts the calls of each mouse_* and key_* handler its steps made', async () => {
    const recording = await readRecording(SURFACE_ID)
    const { report, handlerCalls } = await replay(browser(), recording, { id: SURFACE_ID, coverage: true })
    assert.equal(report, null)
    // Each pointer step is one `mouseevent`, which Surface hands to `mouse_surface`; each key step one `key_number`.
    const steps = (kind) => recording.steps.filter((s) => s.kind === kind).length
    assert.deepEqual(
      { mouse_surface: handlerCalls.mouse_surface, key_number: handlerCalls.key_number, mouse_line: handlerCalls.mouse_line },
      { mouse_surface: steps('pointer'), key_number: steps('key'), mouse_line: 0 })
  })
})

describe('a plant', () => {
  it('is refused when its line is outside its handler', () => {
    const plant = { ...LINE_PLANT, handler: 'mouse_lineE' }
    assert.throws(() => plantIn('', plant), /no method mouse_lineE/)
    assert.throws(() => plantIn(`    mouse_lineE(x) {\n    }\n    mouse_line(x) {\n        ${plant.find}\n    }\n`, plant), /its line is not in mouse_lineE/)
  })

  it('is refused when its line is in its handler more than once', () => {
    const body = `    mouse_line(x) {\n        ${LINE_PLANT.find}\n        ${LINE_PLANT.find}\n    }\n`
    assert.throws(() => plantIn(body, LINE_PLANT), /its line is in mouse_line more than once/)
  })

  it('is refused when it leaves its file unparsed', () => {
    const plant = { id: 'braceless-if', file: 'x.js', find: 'go();', replace: '' }
    assert.throws(() => plantIn('if (ready)\n    go();\n', plant), /^Error: braceless-if: x\.js does not parse with it in: /)
  })
})

describe('a hunt', () => {
  it('refuses a plant whose line is not in its file before replaying anything', async () => {
    await assert.rejects(hunt(browser(), { ...SURFACE_PLANT, find: 'no such line' }, [SURFACE_ID]), /its line is not in mouse_surface/)
  })

  it('refuses a recording it cannot read rather than counting it caught', async () => {
    await assert.rejects(hunt(browser(), SURFACE_PLANT, ['paint/no-such-recording']), /ENOENT/)
  })

  it('reports a plant no replayed recording reaches as missed', async () => {
    const { caught, error, replayed } = await hunt(browser(), LINE_PLANT, [SURFACE_ID])
    assert.deepEqual({ caught, error, replayed }, { caught: null, error: null, replayed: 1 })
  })

  it('catches a plant whose only sign is a console.error', async () => {
    const plant = { ...SURFACE_PLANT, id: 'surface-logs', replace: `${SURFACE_PLANT.find} console.error("planted log");` }
    const { caught, why } = await hunt(browser(), plant, [SURFACE_ID])
    takePageErrors()
    assert.deepEqual({ caught, why }, { caught: SURFACE_ID, why: 'console.error: planted log' })
  })

  it('reports a harness error as an error, not a catch', async () => {
    const closed = await chromium.launch()
    await closed.close()
    const { caught, error } = await hunt(closed, SURFACE_PLANT, [SURFACE_ID])
    assert.equal(caught, null)
    assert.match(error ?? 'no error', new RegExp(`^${SURFACE_ID}: .*closed`))
  })
})

describe('the audit plants', () => {
  for (const plant of PLANTS.filter((p) => p.audit)) {
    it(`${plant.id} (audit ${plant.audit}) changes one line of ${plant.file} and is caught by a recording made for ${plant.audit}`, async () => {
      const text = await source(plant.file)
      const [before, after] = [text, plantIn(text, plant)].map((t) => t.split('\n'))
      assert.equal(before.filter((line, i) => line !== after[i]).length, 1, 'one line differs')
      const own = auditRecordings(plant, ids)
      assert.notDeepEqual(own, [], `a recording is named for ${plant.audit}`)
      const { caught, why, error } = await hunt(browser(), plant, own)
      takePageErrors()
      assert.ok(own.includes(caught), `caught by one of ${own.join(', ')}; got ${caught}: ${why ?? error}`)
    })
  }
})
