// Measuring the safety net (#32): a replay counts the `mouse_*` and `key_*` handlers of `class_p.js` its steps call,
// every planted bug (`live/plants.mjs`) still applies to the source, and every plant undoing an audit fix is caught by
// a recording made for that finding. The whole measurement, every recording against every plant, is `npm run measure`.
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { describe, it } from 'node:test'
import { takePageErrors, useBrowser } from './page.mjs'
import { auditRecordings, hunt, plantIn, PLANTS } from './plants.mjs'
import { listRecordings, readRecording, replay } from './replay.mjs'

const browser = useBrowser()

// A Surface solve: left, right and Ctrl clicks, a drag, undo and redo.
const SURFACE_ID = 'paint/surface-shade-undo-redo'
const ids = await listRecordings()
const source = (file) => readFile(new URL(`../docs/js/${file}`, import.meta.url), 'utf8')

describe('a replay with coverage on', () => {
  it('counts the calls of each mouse_* and key_* handler its steps made', async () => {
    const { report, handlerCalls } = await replay(browser(), await readRecording(SURFACE_ID), { id: SURFACE_ID, coverage: true })
    assert.equal(report, null)
    assert.ok(handlerCalls.mouse_surface > 0, `mouse_surface ran: ${JSON.stringify(handlerCalls)}`)
    assert.equal(handlerCalls.mouse_line, 0)
    assert.equal(handlerCalls.key_space, 0)
  })
})

describe('the planted bugs', () => {
  for (const plant of PLANTS) {
    it(`${plant.id} changes one line of ${plant.handler ?? plant.file}`, async () => {
      const text = await source(plant.file)
      const planted = plantIn(text, plant)
      const [before, after] = [text, planted].map((t) => t.split('\n'))
      assert.equal(before.filter((line, i) => line !== after[i]).length, 1, 'one line differs')
    })
  }

  it('refuses a plant whose line is outside its handler', async () => {
    const plant = { ...PLANTS.find((p) => p.handler === 'mouse_line'), handler: 'mouse_lineE' }
    assert.throws(() => plantIn('', plant), /no method mouse_lineE/)
    assert.throws(() => plantIn(`    mouse_lineE(x) {\n    }\n    mouse_line(x) {\n        ${plant.find}\n    }\n`, plant), /its line is not in mouse_lineE/)
  })

  for (const plant of PLANTS.filter((p) => p.audit)) {
    it(`${plant.id} (audit ${plant.audit}) is caught by a recording made for ${plant.audit}`, async () => {
      const own = auditRecordings(plant, ids)
      assert.notDeepEqual(own, [], `a recording is named for ${plant.audit}`)
      const { caught, why } = await hunt(browser(), plant, own)
      takePageErrors()
      assert.ok(own.includes(caught), `caught by one of ${own.join(', ')}; got ${caught}: ${why}`)
    })
  }

  it('reports a plant no replayed recording reaches as missed', async () => {
    const { caught, replayed } = await hunt(browser(), PLANTS.find((p) => p.handler === 'mouse_line'), [SURFACE_ID])
    assert.deepEqual({ caught, replayed }, { caught: null, replayed: 1 })
  })
})
