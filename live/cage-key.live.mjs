// A killer cage's solve-history keys do not depend on the board's cell size (#137). The keys are point pairs; on a
// triangular or uniform grid their order came from a sort of pixel distances in `fix_points` (class_p.js), whose
// rounding differs at each cell size.
import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { openPenpa, useBrowser } from './page.mjs'
import { REPLAY_TIMESTAMP } from './canonical-state.mjs'
import { engineDriver, pointAtSize, readRecording, RECORDED_CELL_PX } from './replay.mjs'

const browser = useBrowser()

// Penpa+'s default cell size, which every recording was made at, and the largest its size setter takes.
const SIZES = [RECORDED_CELL_PX, 90]

// The cage recordings on a triangular and a uniform grid, and a square grid's. A square grid never calls `fix_points`,
// so its leg checks only that the comparison passes where the order never moved; that square keys are unchanged is
// shown by its engine replay against its expected file.
const RECORDINGS = ['grid/tri-cage', 'grid/uniform-cage', 'stamp/cage-killer']

// Runs in the page: sets the cell size as Penpa+'s size setting does, and returns the size the board is drawn at.
function setSizeInPage (px) {
  UserSettings.displaysize = px
  return pu.size
}

// `step` with its pixel moved to where the same board point lies at `px` a cell: a uniform tiling picks the cell from
// the pixel (`recalculate_num`).
function atSize (step, px) {
  return step.kind === 'pointer' ? { ...step, ...pointAtSize(step, px) } : step
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
    return await page.evaluate((stamp) => pu.pu_a.command_replay.__a.filter((c) => c[0] === 'cage').map((c) => c.slice(0, stamp)), REPLAY_TIMESTAMP)
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
