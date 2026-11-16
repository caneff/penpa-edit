// `npm run recordings:approve -- <id> ...` (#33): replays each named recording on this checkout, prints what changes in
// its `<id>.expected.json` in plain words, then writes the file. Named ids only, each a recording's id as
// `live/replay.mjs` names it: there is no "update all", so a glob, a family or an unknown id is refused before
// anything runs. A replay that does not end on the recording's final board writes nothing and fails. Run by the
// controller for the ids its ticket listed, or by Chris; implement-lane workers are denied it
// (`.claude/hooks/deny-recording-writes.mjs`). Not a check itself, so `live/**/*.live.mjs` skips it.
import { chromium } from 'playwright'
import { expectedDiff } from './expected-diff.mjs'
import { expectedFile, listRecordings, readExpectedFile, readRecording, replay, writeExpected } from './replay.mjs'

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
    const changes = expectedDiff({ steps: recording.steps, before: await readExpectedFile(id), after: expectedFile(checkpoints) })
    console.log(`${id}: ${changes.length ? 'changes:' : 'unchanged'}`)
    for (const line of changes) console.log(`  ${line}`)
    await writeExpected(id, checkpoints)
    console.log(`${id}: ${checkpoints.length} checkpoints written`)
  }
} finally {
  await browser.close()
}
