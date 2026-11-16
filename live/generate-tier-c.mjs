// Writes tier C's recordings (`live/tier-c.mjs`) under `live/recordings/solve/`, each with its expected file from a
// replay. Not a check itself, so `live/**/*.live.mjs` skips it.
//   node live/generate-tier-c.mjs [<puzzle> ...]
//     one generated solve per puzzle named (all of TIER_C_PUZZLES when none is), made with RECORDING_SEED, as
//     `solve/<puzzle>`, of only KEPT_OPEN_CELLS's count of open cells where it names one; the header's `generated`
//     names the puzzle, the seed and any such count.
//   node live/generate-tier-c.mjs --history <name> <file>
//     a solver's history: the Share > Replay link in `<file>` converted, as `solve/<name>-history`; the header's
//     `history` is `<name>`.
// The header's `tier` is `C`. A solve that fails its answer run, or a recording whose replay is refused, leaves no
// expected file, any earlier one removed, and fails the command.
import { mkdir, readFile, rm, writeFile } from 'node:fs/promises'
import { chromium } from 'playwright'
import { RECORDINGS, engineCommit, recordingText, replay, writeExpected } from './replay.mjs'
import { answerRun, convertReplayLink, generateSolve, RECORDING_SEED, TIER_C_FAMILY } from './tier-c.mjs'
import { buildPuzzle, KEPT_OPEN_CELLS, TIER_C_PUZZLES } from './tier-c-puzzles.mjs'

const removeExpected = (id) => rm(new URL(id + '.expected.json', RECORDINGS), { force: true })

// Writes `recording` as `id` and its expected file, or removes any earlier expected file and returns the replay's
// report when it is refused.
async function write (browser, id, recording) {
  await mkdir(new URL(TIER_C_FAMILY + '/', RECORDINGS), { recursive: true })
  await writeFile(new URL(id + '.steps.json', RECORDINGS), recordingText(recording))
  const { checkpoints, report } = await replay(browser, recording, { id })
  if (report) {
    await removeExpected(id)
    return report
  }
  await writeExpected(id, checkpoints)
  console.log(`${id}: ${recording.steps.length} steps, ${checkpoints.length} checkpoints`)
  return null
}

async function generated (browser, name) {
  const open = KEPT_OPEN_CELLS[name]
  const puzzle = await buildPuzzle(browser, name, { open })
  const id = `${TIER_C_FAMILY}/${name}`
  const steps = generateSolve(puzzle, RECORDING_SEED)
  const { failure, final, gridtype, genre } = await answerRun(browser, puzzle, steps)
  if (failure) {
    await removeExpected(id)
    return failure
  }
  const header = { source: puzzle.source, gridtype, genre, commit: engineCommit(), tier: 'C', generated: { puzzle: name, seed: RECORDING_SEED, ...open && { open } } }
  return write(browser, id, { header, final, steps })
}

async function history (browser, name, file) {
  const recording = await convertReplayLink(browser, (await readFile(file, 'utf8')).trim())
  recording.header = { ...recording.header, commit: engineCommit(), history: name }
  return write(browser, `${TIER_C_FAMILY}/${name}-history`, recording)
}

const args = process.argv.slice(2)
const browser = await chromium.launch()
const refused = []
try {
  if (args[0] === '--history') {
    if (args.length !== 3) throw new Error('usage: node live/generate-tier-c.mjs --history <name> <file>')
    const report = await history(browser, args[1], args[2])
    if (report) refused.push(report)
  } else {
    const unknown = args.filter((name) => !TIER_C_PUZZLES.includes(name))
    if (unknown.length) throw new Error(`no tier C puzzle ${unknown.join(', ')}: the puzzles are ${TIER_C_PUZZLES.join(', ')}`)
    for (const name of args.length ? args : TIER_C_PUZZLES) {
      const report = await generated(browser, name)
      if (report) refused.push(report)
    }
  }
} finally {
  await browser.close()
}
if (refused.length) {
  console.log(`\n${refused.length} refused:\n\n${refused.join('\n\n')}`)
  process.exitCode = 1
}
