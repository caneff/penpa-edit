// `npm run fuzz:ui:nightly`: the nightly workflow's 30-minute UI fuzz (#234). It runs `run.mjs` with a fresh seed and reads
// what it prints. A failure files one `bug` and `needs-info` issue titled by the failure (the seed, the shrunk steps and
// the replay command in the body); a title an open issue already has gets a comment instead, and one night files or
// comments once per title. After a failure the fuzz starts again on a new seed with the time left, so one failure cannot
// use the whole night. A run that could not start or printed no verdict files one "did not run" issue and ends the night.
// `FUZZ_DRY_RUN=1` prints each filing instead of making it.
import { spawn } from 'node:child_process'
import { pathToFileURL } from 'node:url'

const REPO = 'caneff/penpa-edit'
export const FUZZ_MINUTES = 30
const MINUTE_MS = 60000
const TITLE_MAX = 110
// Less time than this left is not worth a page start.
const MIN_RUN_MINUTES = 1
// The run's minutes, a shrink of up to 10 minutes (engine.mjs) and the page starts; a fuzz still running after this has hung.
const FUZZ_TIMEOUT_MS = (FUZZ_MINUTES + 20) * MINUTE_MS
const BLOCKED_BY = '## Blocked by\n\n- None — can start immediately.'

// A short, stable name for what failed, from the error line `run.mjs` prints: the broken rules' names, or the first crash
// signal with its numbers folded, so the same failure on another seed or step has the same title.
export function failureTitle (error) {
  const when = String.raw`after (?:step \d+ \(.*?\)|the last step)`
  const rules = new RegExp(`^rules? broken ${when}: (.*)$`, 's').exec(error)
  if (rules) {
    const names = [...new Set(rules[1].split('; ').map((v) => /^([\w-]+): /.exec(v)?.[1]).filter(Boolean))]
    if (names.length) return `UI fuzz: rule broken: ${names.join(', ')}`
  }
  const signal = new RegExp(`^crash signals? ${when}: (.*)$`, 's').exec(error)
  const text = (signal ? signal[1].split('; ')[0] : error).split('\n')[0].replace(/\d+/g, 'N').trim()
  return `UI fuzz: ${signal ? 'crash' : 'error'}: ${text}`.slice(0, TITLE_MAX).trimEnd()
}

// What `run.mjs` printed: a failure's parts, `{ passed: true }`, or null for no verdict. A pass that ran no action list
// (the time limit fired before the first) is no verdict.
export function parseFuzzOutput (output) {
  const passed = /^fuzz:ui passed: (\d+) action lists/m.exec(output)
  if (passed) return Number(passed[1]) > 0 ? { passed: true } : null
  const head = /^fuzz:ui FAILED on the (.+) puzzle \(seed (\d+)\)/m.exec(output)
  const error = /^error: (.*(?:\n(?!\d+ steps?:$).*)*)$/m.exec(output)?.[1]
  const replay = /^replay: (.*)$/m.exec(output)?.[1]
  if (!head || error == null || !replay) return null
  const steps = /^\d+ steps?:\n((?: {2}\d+\. .*\n?)*)/m.exec(output)?.[1].trimEnd().split('\n').map((l) => l.replace(/^ {2}\d+\. /, '')) ?? []
  return { failed: true, puzzle: head[1], seed: Number(head[2]), error: error.trim(), steps, replay }
}

function fuzzIssue (f, { runUrl } = {}) {
  const details = [
    `Error: ${f.error}`,
    '',
    `Shrunk to ${f.steps.length} ${f.steps.length === 1 ? 'step' : 'steps'}:`,
    '',
    ...f.steps.map((s, i) => `${i + 1}. ${s}`),
    '',
    'Replay:',
    '',
    '```',
    f.replay,
    '```',
    '',
    ...(runUrl ? [`Run: ${runUrl}`, ''] : [])
  ].join('\n')
  return {
    title: failureTitle(f.error),
    body: `The nightly UI fuzz (\`npm run fuzz:ui:nightly\`) failed on the ${f.puzzle} puzzle, seed ${f.seed}.\n\n${details}\nFiled by \`npm run fuzz:ui:nightly\` (\`live/ui-fuzz/nightly.mjs\`).\n\n${BLOCKED_BY}`,
    comment: `The same failure again, seed ${f.seed} on the ${f.puzzle} puzzle.\n\n${details}`
  }
}

// The fixed title is the dedupe key.
export const didNotRunIssue = (why) => ({
  title: 'UI fuzz did not run: the nightly UI fuzz could not be checked',
  body: [
    '`npm run fuzz:ui:nightly` ended without a verdict. The cause may be the runner (no Chromium, no network) or a change that stopped the fuzz starting; what stopped it:',
    '',
    why,
    '',
    'Filed by `npm run fuzz:ui:nightly` (`live/ui-fuzz/nightly.mjs`).',
    '',
    BLOCKED_BY
  ].join('\n')
})

// `hunt` loops until a run passes or the night's time is spent; a title already reported tonight is not filed again.
export async function nightly ({ runFuzz, fileIssue, newSeed, now = Date.now, runUrl }) {
  const start = now()
  const reported = new Set()
  const stopNight = async (why) => {
    await fileIssue(didNotRunIssue(why))
    return 'did-not-run'
  }
  while (true) {
    const minutes = FUZZ_MINUTES - (now() - start) / MINUTE_MS
    if (reported.size > 0 && minutes < MIN_RUN_MINUTES) return 'red'
    let result
    try { result = await runFuzz(newSeed(), { minutes, timeoutMs: FUZZ_TIMEOUT_MS - (now() - start) }) } catch (e) {
      return stopNight(`the fuzz could not be started: ${e.message}`)
    }
    const parsed = parseFuzzOutput(result.output)
    if (parsed?.passed && result.ok) return reported.size > 0 ? 'red' : 'green'
    if (!parsed?.failed) {
      return stopNight(`it printed no verdict (exit ${result.ok ? 0 : 'non-zero'}); the tail of its output:\n\n\`\`\`\n${result.output.split('\n').slice(-15).join('\n')}\n\`\`\``)
    }
    const issue = fuzzIssue(parsed, { runUrl })
    if (!reported.has(issue.title)) {
      reported.add(issue.title)
      await fileIssue(issue)
    }
  }
}

// Runs a command with its output both captured and echoed; `input` goes to its stdin.
const run = (command, args, { input, timeout } = {}) => new Promise((resolve, reject) => {
  const child = spawn(command, args, { timeout, stdio: [input === undefined ? 'ignore' : 'pipe', 'pipe', 'pipe'] })
  let output = ''
  child.stdout.on('data', (d) => { output += d; process.stdout.write(d) })
  child.stderr.on('data', (d) => { output += d; process.stderr.write(d) })
  child.on('error', reject)
  child.on('close', (code) => resolve({ ok: code === 0, output }))
  if (input !== undefined) child.stdin.end(input)
})

// Files `issue`, or comments on the open issue with its title. A failed list stops: filing blind could duplicate.
export async function fileIssue ({ title, body, comment }, runGh = run) {
  const list = await runGh('gh', ['issue', 'list', '--repo', REPO, '--state', 'open', '--limit', '200', '--json', 'number,title', '--jq', '.[] | "\\(.number)\t\\(.title)"'])
  if (!list.ok) throw new Error('gh issue list failed')
  const open = list.output.split('\n').map((l) => l.split('\t')).find(([, t]) => t === title)
  if (open) {
    if (!comment) return
    if (!(await runGh('gh', ['issue', 'comment', open[0], '--repo', REPO, '--body-file', '-'], { input: comment })).ok) throw new Error('gh issue comment failed')
    return
  }
  if (!(await runGh('gh', ['issue', 'create', '--repo', REPO, '--label', 'bug,needs-info', '--title', title, '--body-file', '-'], { input: body })).ok) throw new Error('gh issue create failed')
}

const printIssue = async ({ title, body }) => console.log(`fuzz:ui:nightly dry run, would file or comment on: ${title}\n\n${body}\n`)

// Each run is told its seed in the log, since a run killed for hanging prints none.
const fuzzProcess = (seed, { minutes, timeoutMs }) => {
  console.error(`fuzz:ui:nightly: seed ${seed} for ${minutes} minutes`)
  return run('node', ['live/ui-fuzz/run.mjs', '--seed', String(seed), '--minutes', String(minutes)], { timeout: timeoutMs })
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const { GITHUB_RUN_ID, GITHUB_SERVER_URL, GITHUB_REPOSITORY, FUZZ_DRY_RUN } = process.env
  const outcome = await nightly({
    runFuzz: fuzzProcess,
    fileIssue: FUZZ_DRY_RUN === '1' ? printIssue : fileIssue,
    newSeed: () => Math.floor(Math.random() * 2 ** 31),
    runUrl: GITHUB_RUN_ID ? `${GITHUB_SERVER_URL}/${GITHUB_REPOSITORY}/actions/runs/${GITHUB_RUN_ID}` : undefined
  })
  console.error(`fuzz:ui:nightly: ${outcome}`)
  process.exitCode = outcome === 'green' ? 0 : 1
}
