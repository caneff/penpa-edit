// `npm run measure`: how well the recordings guard the engine (#32). Replays every recording with JS coverage on and
// prints, as Markdown, the calls of each `mouse_*` and `key_*` handler of `class_p.js`, then hunts each planted bug of
// `live/plants.mjs` and prints whether a recording caught it. A handler plant is hunted only over the recordings that
// called its handler, since no other replay runs the planted line. Exits 1 when the bar is not met: a handler a solve
// mode can reach that no recording calls, or an audit plant no recording catches. Other plants are reported, not
// failing. Progress goes to stderr, one line per recording and per plant. Not a check itself, so
// `live/**/*.live.mjs` skips it.
import { chromium } from 'playwright'
import { hunt, PLANTS } from './plants.mjs'
import { listRecordings, readExpected, readRecording, replay } from './replay.mjs'

// Replays at once: the box is shared, and the seam's own runs use 4.
const LANES = 2
// The handlers no solve mode reaches, each with why.
const SOLVE_UNREACHABLE = {
  mouse_board: 'Board is hidden in solve mode (`set_solvemode` in `general.js`)',
  mouse_number: 'only Number Arrow calls it, and solve mode hides Arrow (`set_solvemode`)'
}

const log = (line) => process.stderr.write(line + '\n')
const seconds = (since) => ((Date.now() - since) / 1000).toFixed(1)

// Each handler with the ids of the recordings that called it and its calls over all of them.
async function measureCoverage (browser, ids) {
  const handlers = {}
  let next = 0
  const lane = async () => {
    while (next < ids.length) {
      const id = ids[next++]
      const started = Date.now()
      const { report, handlerCalls } = await replay(browser, await readRecording(id), {
        id, expected: await readExpected(id), coverage: true
      })
      if (report) throw new Error(`the corpus does not replay green, so it measures nothing:\n${report}`)
      for (const [name, calls] of Object.entries(handlerCalls)) {
        handlers[name] ??= { calls: 0, ids: [] }
        handlers[name].calls += calls
        if (calls) handlers[name].ids.push(id)
      }
      log(`coverage ${id} ${seconds(started)} s`)
    }
  }
  await Promise.all(Array.from({ length: LANES }, lane))
  for (const h of Object.values(handlers)) h.ids.sort()
  return handlers
}

function coverageTable (handlers) {
  return [
    '| handler | solve mode reaches it | calls | recordings that call it |',
    '| --- | --- | --- | --- |',
    ...Object.entries(handlers).map(([name, { calls, ids }]) =>
      `| \`${name}\` | ${SOLVE_UNREACHABLE[name] ? `no: ${SOLVE_UNREACHABLE[name]}` : 'yes'} | ${calls} | ${ids.length} |`)
  ]
}

function plantTable (results) {
  return [
    '| plant | in | audit | result | caught by | replays |',
    '| --- | --- | --- | --- | --- | --- |',
    ...results.map(({ plant, caught, replayed }) =>
      `| \`${plant.id}\` | \`${plant.handler ?? plant.file}\` | ${plant.audit ?? ''} | ${caught ? 'caught' : '**missed**'} | ${caught ? `\`${caught}\`` : ''} | ${replayed} |`)
  ]
}

const browser = await chromium.launch()
try {
  const started = Date.now()
  const ids = await listRecordings()
  const handlers = await measureCoverage(browser, ids)
  const results = []
  for (const plant of PLANTS) {
    const huntStarted = Date.now()
    const over = plant.handler ? handlers[plant.handler]?.ids ?? [] : ids
    const result = await hunt(browser, plant, over, { lanes: LANES })
    results.push({ plant, ...result })
    log(`plant ${plant.id} ${result.caught ? `caught by ${result.caught}: ${result.why}` : 'missed'} after ${result.replayed} replays, ${seconds(huntStarted)} s`)
  }
  const uncovered = Object.entries(handlers).filter(([name, { calls }]) => !calls && !SOLVE_UNREACHABLE[name]).map(([name]) => name)
  const auditMissed = results.filter(({ plant, caught }) => plant.audit && !caught).map(({ plant }) => plant.id)
  const caught = results.filter(({ caught }) => caught).length
  console.log([
    `${ids.length} recordings, measured in ${seconds(started)} s.`,
    '',
    ...coverageTable(handlers),
    '',
    ...plantTable(results),
    '',
    `${caught} of ${results.length} plants caught.`,
    `Handlers a solve mode reaches that no recording calls: ${uncovered.join(', ') || 'none'}.`,
    `Audit plants missed: ${auditMissed.join(', ') || 'none'}.`
  ].join('\n'))
  if (uncovered.length || auditMissed.length) process.exitCode = 1
} finally {
  await browser.close()
}
