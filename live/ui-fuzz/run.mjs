// The UI fuzz from the command line (#195): `npm run fuzz:ui -- [--seed <n>] [--minutes <m>] [--puzzle <name>] [--max-steps
// <n>] [--path <printed path>] [--focus <area> ...]`, `--puzzle` running every list on that puzzle, `--max-steps` capping
// a list's actions (20 by default) and `--focus` drawing that area's actions more often.
// Random action lists on `solve.html` in headless Chromium, 2 minutes by default; a crash signal or a broken rule fails
// the run, which is shrunk and printed with its puzzle, its seed, its steps and the command that replays it. Exits 1 on a
// failure, and on a run with no verdict (bad arguments, or no list ran). Not in `npm test` or `npm run test:live`.
import { pathToFileURL } from 'node:url'
import { chromium } from 'playwright'
import { parseFuzzArgs, replayCommand } from './command.mjs'
import { runFuzz } from './engine.mjs'
import { uiFuzzPuzzles } from './puzzles.mjs'
import { openTarget } from './target.mjs'

// Runs the fuzz `args` (the words after `--`) ask for on `browser`, prints its verdict line by line to `print`, and
// returns `runFuzz`'s result. `target` is `openTarget`'s options: a test plants a bug through it, which no command names.
export async function fuzzUi (args, { browser, target, print = console.log }) {
  const { seed = Math.floor(Math.random() * 2 ** 31), minutes, puzzle, maxCommands, path, focus } = parseFuzzArgs(args)
  const puzzles = await uiFuzzPuzzles()
  const started = Date.now()
  const r = await runFuzz({ openTarget: openTarget(browser, target), puzzles, puzzle, seed, minutes, maxCommands, path, focus })
  const seconds = Math.round((Date.now() - started) / 1000)
  if (!r.failed) {
    print(`fuzz:ui passed: ${r.runs} action lists over ${puzzle == null ? `${puzzles.length} puzzles` : `the ${puzzle} puzzle`} in ${seconds} s (seed ${r.seed})`)
    return r
  }
  print(`fuzz:ui FAILED on the ${r.puzzle} puzzle (seed ${r.seed}) after ${seconds} s, shrunk from ${r.huntSteps} ${r.huntSteps === 1 ? 'step' : 'steps'}`)
  print(`error: ${r.error}`)
  print(`${r.sequence.length} ${r.sequence.length === 1 ? 'step' : 'steps'}:`)
  r.sequence.forEach((step, i) => print(`  ${i + 1}. ${step}`))
  print(`replay: ${replayCommand(r)}`)
  return r
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const browser = await chromium.launch()
  try {
    const r = await fuzzUi(process.argv.slice(2), { browser })
    process.exitCode = r.failed ? 1 : 0
  } catch (e) {
    console.log(`fuzz:ui gave no verdict: ${e.message}`)
    process.exitCode = 1
  } finally {
    await browser.close()
  }
}
