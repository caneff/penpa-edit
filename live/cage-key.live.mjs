// A killer cage's solve-history keys do not depend on the board's cell size (#137). The keys are point pairs; on a
// triangular or uniform grid their order came from a sort of pixel distances in `fix_points` (class_p.js), whose
// rounding differs at each cell size.
import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { openPenpa, useBrowser } from './page.mjs'
import { engineDriver, readRecording } from './replay.mjs'

const browser = useBrowser()

// Penpa+'s default cell size, and the largest its size setter takes.
const SIZES = [38, 90]

// The cage recordings on a triangular and a uniform grid, and a square grid's, whose keys never came from that sort.
const RECORDINGS = ['grid/tri-cage', 'grid/uniform-cage', 'stamp/cage-killer']

// Runs in the page: sets the cell size as Penpa+'s size setting does, and returns the size the board is drawn at.
function setSizeInPage (px) {
  UserSettings.displaysize = px
  return pu.size
}

// The cell size every recording was made at.
const RECORDED_PX = 38

// `step` with its pixel moved to where the same board point lies at `px` a cell. A uniform tiling picks the cell from
// the pixel (`recalculate_num`), and every point sits half a pixel off its cell grid at any size.
function atSize (step, px) {
  if (step.kind !== 'pointer') return step
  const scale = (v) => (v - 0.5) * px / RECORDED_PX + 0.5
  return { ...step, x: scale(step.x), y: scale(step.y) }
}

// The cage entries of the solve history after `id`'s steps are made through the engine at `px` a cell, without
// their time stamps.
async function cageHistory (id, px) {
  const recording = await readRecording(id)
  const { context, page } = await openPenpa(browser(), recording.header.source)
  try {
    assert.equal(await page.evaluate(setSizeInPage, px), px)
    const apply = engineDriver.start(page, recording.steps)
    for (const step of recording.steps) await apply(atSize(step, px))
    return await page.evaluate(() => pu.pu_a.command_replay.__a.filter((c) => c[0] === 'cage').map((c) => c.slice(0, 5)))
  } finally {
    await context.close()
  }
}

describe("a killer cage's solve-history keys", () => {
  for (const id of RECORDINGS) {
    it(`are the same at ${SIZES.join(' and ')} px a cell on ${id}`, async () => {
      const [small, large] = await Promise.all(SIZES.map((px) => cageHistory(id, px)))
      assert.ok(small.length > 0, `${id} draws a cage`)
      assert.deepEqual(large, small)
    })
  }
})
