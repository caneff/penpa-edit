// The engine driver's per-recording tests (`live/replay.live.mjs` holds the rest), split into REPLAY_PARTS files that
// node's test workers run side by side: the recording at position `i` in the sorted ids belongs to part `i % REPLAY_PARTS`.
import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { useBrowser } from './page.mjs'
import { listRecordings, readExpected, readRecording, replay } from './replay.mjs'

export const REPLAY_PARTS = 3

// The ids of `ids` (sorted) that part `part` replays.
export function replayPartIds (ids, part) {
  return ids.filter((id, i) => i % REPLAY_PARTS === part)
}

// Registers the replay tests of part `part` of the recordings under `live/recordings/`.
export async function replayPart (part) {
  const browser = useBrowser()
  const ids = replayPartIds(await listRecordings(), part)
  describe(`the engine driver, recordings part ${part + 1} of ${REPLAY_PARTS}`, () => {
    for (const id of ids) {
      it(`replays ${id} to its expected states`, async () => {
        const { report } = await replay(browser(), await readRecording(id), { id, expected: await readExpected(id) })
        assert.equal(report, null)
      })

      it(`names the commit ${id} was recorded at`, async () => {
        assert.match((await readRecording(id)).header.commit ?? '', /^[0-9a-f]{7,40}$/)
      })
    }
  })
}
