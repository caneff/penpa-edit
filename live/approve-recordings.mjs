// `npm run recordings:approve -- <id> ...` (#33): writes `<id>.expected.json` beside each named recording from a replay
// of it on this checkout, after printing what changes in it in plain words. Named ids only, each a recording's id as
// `live/replay.mjs` names it: there is no "update all", so a glob, a family or an unknown id is refused before
// anything runs. A replay that does not end on the recording's final board writes nothing and fails. Run by the
// controller for the ids its ticket listed, or by Chris; implement-lane workers are denied it
// (`.claude/hooks/deny-recording-writes.mjs`). Not a check itself, so `live/**/*.live.mjs` skips it.
import { chromium } from 'playwright'
import { expectedDiff } from './expected-diff.mjs'
import { listRecordings, readExpectedFile, readRecording, replay, writeExpected } from './replay.mjs'

const ids = process.argv.slice(2)
if (!ids.length) {
  console.error('usage: npm run recordings:approve -- <id> ...')
  process.exit(2)
}
const known = new Set(await listRecordings())
const unknown = ids.filter((id) => !known.has(id))
if (unknown.length) {
  for (const id of unknown) console.error(`no recording ${id}: name each recording by its id, as live/replay.mjs does`)
  process.exit(2)
}
const browser = await chromium.launch()
try {
  for (const id of ids) {
    const recording = await readRecording(id)
    const { checkpoints, report } = await replay(browser, recording, { id })
    if (report) throw new Error(report)
    const before = await readExpectedFile(id)
    const after = await writeExpected(id, checkpoints)
    const changes = expectedDiff({ steps: recording.steps, before, after })
    console.log(`${id}: ${checkpoints.length} checkpoints written, ${changes.length ? 'changed:' : 'unchanged'}`)
    for (const line of changes) console.log(`  ${line}`)
  }
} finally {
  await browser.close()
}
