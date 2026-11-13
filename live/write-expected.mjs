// Writes `<id>.expected.json` beside each named recording from a replay of it on this checkout:
// `node live/write-expected.mjs <id> ...`, an id as `live/replay.mjs` names it. A replay that does not end on the
// recording's final board writes nothing and fails. Not a check itself, so `live/**/*.live.mjs` skips it.
import { chromium } from 'playwright'
import { readRecording, replay, writeExpected } from './replay.mjs'

const ids = process.argv.slice(2)
if (!ids.length) throw new Error('usage: node live/write-expected.mjs <id> ...')
const browser = await chromium.launch()
try {
  for (const id of ids) {
    const { checkpoints, report } = await replay(browser, await readRecording(id), { id })
    if (report) throw new Error(report)
    await writeExpected(id, checkpoints)
    console.log(`${id}: ${checkpoints.length} checkpoints written`)
  }
} finally {
  await browser.close()
}
