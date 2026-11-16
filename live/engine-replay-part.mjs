// The engine driver's per-recording tests (`live/replay.live.mjs` holds the rest), split into REPLAY_PARTS files that
// node's test workers run side by side: the recording at position `i` in the sorted ids belongs to part `i % REPLAY_PARTS`.
import assert from 'node:assert/strict'
import { readdir, readFile } from 'node:fs/promises'
import { describe, it } from 'node:test'
import { useBrowser } from './page.mjs'
import { listRecordings, readExpected, readRecording, replay } from './replay.mjs'

export const REPLAY_PARTS = 3

// `ids` must be sorted; `parts` is how many parts they are split into.
export function replayPartIds (ids, part, parts = REPLAY_PARTS) {
  return ids.filter((id, i) => i % parts === part)
}

// Asserts the part files `<stem>-<k>.live.mjs` of a split run: one for each of `parts`, each making `call`, and the ids
// `idsOf(k)` they replay together being `ids`, each once.
export async function assertPartFiles (stem, parts, call, idsOf, ids) {
  const dir = new URL('./', import.meta.url)
  const files = (await readdir(dir)).filter((f) => new RegExp(`^${stem}-\\d+\\.live\\.mjs$`).test(f)).sort()
  assert.deepEqual(files, Array.from({ length: parts }, (_, k) => `${stem}-${k}.live.mjs`))
  for (const f of files) assert.ok((await readFile(new URL(f, dir), 'utf8')).includes(call), `${f} makes the call ${call}`)
  const taken = []
  for (let k = 0; k < parts; k++) taken.push(...await idsOf(k))
  assert.deepEqual(taken.sort(), ids)
}

// The call every `engine-replay-<k>.live.mjs` makes: `fileUrl` is its `import.meta.url`, and `k` comes from its name, so a
// file cannot replay another file's part.
export const REPLAY_CALL = 'await replayPart(import.meta.url)'

// Registers the replay tests of the part named by `fileUrl`.
export async function replayPart (fileUrl) {
  const part = Number(/engine-replay-(\d+)\.live\.mjs$/.exec(fileUrl)[1])
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
