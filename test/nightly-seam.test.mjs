// The nightly full seam's failure report (`.github/workflows/nightly.yml`, #268): a planted failing test in a part's log
// files one issue naming it, through a stub `gh`. The workflow's run on GitHub is proven only by a scheduled run.
import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { mkdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, it } from 'node:test'
import { fileURLToPath } from 'node:url'
import { stubGh } from './stub-gh.mjs'

const SCRIPT = fileURLToPath(new URL('../.github/scripts/nightly-seam-issue.sh', import.meta.url))
const RUN_URL = 'https://github.com/owner/repo/actions/runs/7'
const FAILING_LOG = [
  '✔ the desk (114364ms)',
  '✖ failing tests:',
  '',
  'test at live/fuzz.live.mjs:12:3',
  '✖ akari seed 3 keeps the invariants (60001.5ms)',
  ''
].join('\n')

function runReport (logs) {
  const { dir, env, calls } = stubGh({})
  const logDir = join(dir, 'logs')
  mkdirSync(logDir)
  for (const [name, text] of Object.entries(logs)) writeFileSync(join(logDir, name), text)
  const { status, stderr } = spawnSync('bash', [SCRIPT, logDir, RUN_URL], { env, encoding: 'utf8' })
  return { status, stderr, writes: calls().filter(([, verb]) => verb !== 'list') }
}

describe('the nightly seam issue', () => {
  it('files one issue naming the planted failing test and the run', () => {
    const { status, stderr, writes } = runReport({ 'live-1.log': '✔ the engine driver (1ms)\n', 'live-2.log': FAILING_LOG })
    assert.equal(status, 0, stderr)
    assert.equal(writes.length, 1)
    const [args] = writes
    assert.deepEqual(args.slice(0, 8), ['issue', 'create', '--repo', 'owner/repo', '--label', 'bug,needs-info', '--title', 'Nightly seam failed'])
    const body = args[9]
    assert.match(body, /- `live\/fuzz\.live\.mjs:12:3` akari seed 3 keeps the invariants\n/)
    assert.match(body, new RegExp(`Run: ${RUN_URL}`))
  })

  it('still files the issue, saying so, when no part left a log', () => {
    const { status, stderr, writes } = runReport({})
    assert.equal(status, 0, stderr)
    assert.match(writes[0][9], /No part left a log; read the run\./)
  })
})
