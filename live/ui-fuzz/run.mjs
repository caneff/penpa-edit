// The UI fuzz from the command line (#195): `npm run fuzz:ui -- [--seed <n>] [--minutes <m>] [--path <printed path>]`.
// Random action lists on `solve.html` in headless Chromium, 2 minutes by default; a crash signal fails the run, which is
// shrunk and printed with its seed, its steps and the command that replays it. Exits 1 on a failure. Not in `npm test` or
// `npm run test:live`.
import { chromium } from 'playwright'
import { parseFuzzArgs, replayCommand } from './command.mjs'
import { runFuzz } from './engine.mjs'
import { uiFuzzPuzzles } from './puzzles.mjs'
import { openTarget } from './target.mjs'

const { seed = Math.floor(Math.random() * 2 ** 31), minutes, path } = parseFuzzArgs(process.argv.slice(2))
const puzzles = await uiFuzzPuzzles()
const started = Date.now()
const browser = await chromium.launch()
try {
  const r = await runFuzz({ openTarget: openTarget(browser), puzzles, seed, minutes, path })
  const seconds = Math.round((Date.now() - started) / 1000)
  if (!r.failed) {
    console.log(`fuzz:ui passed: ${r.runs} action lists over ${puzzles.length} puzzles in ${seconds} s (seed ${r.seed})`)
  } else {
    console.log(`fuzz:ui FAILED on the ${r.puzzle} puzzle (seed ${r.seed}) after ${seconds} s`)
    console.log(`error: ${r.error}`)
    console.log(`${r.sequence.length} ${r.sequence.length === 1 ? 'step' : 'steps'}:`)
    r.sequence.forEach((step, i) => console.log(`  ${i + 1}. ${step}`))
    console.log(`replay: ${replayCommand(r)}`)
  }
  process.exitCode = r.failed ? 1 : 0
} finally {
  await browser.close()
}
