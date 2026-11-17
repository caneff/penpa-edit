// The ruleset that makes the safety-net checks required on master (#33, `.github/scripts/require-checks.sh`), read
// from its dry run: it requires exactly CI's jobs, and the nightly upstream merge posts a status for exactly those, so
// its direct push to master is not refused. Applying it is Chris's, once.
import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { readFileSync } from 'node:fs'
import { describe, it } from 'node:test'
import { fileURLToPath } from 'node:url'

const path = (p) => fileURLToPath(new URL(`../${p}`, import.meta.url))
const NIGHTLY = readFileSync(path('.github/workflows/upstream-merge.yml'), 'utf8')
const ruleset = JSON.parse(execFileSync('bash', [path('.github/scripts/require-checks.sh'), '--dry-run'], { encoding: 'utf8' }))
const required = ruleset.rules.find((r) => r.type === 'required_status_checks').parameters.required_status_checks.map((c) => c.context).sort()

// The job ids under `jobs:` in a workflow file, each a check context of its own, less each part another job `needs`:
// the job that waits on its parts is the check (#268).
function checkIds (file) {
  const jobs = readFileSync(path(file), 'utf8').split(/^jobs:\n/m)[1]
  const parts = [...jobs.matchAll(/^ {4}needs: \[([\w, -]+)\]$/gm)].flatMap((m) => m[1].split(/,\s*/))
  return [...jobs.matchAll(/^ {2}([\w-]+):$/gm)].map((m) => m[1]).filter((id) => !parts.includes(id)).sort()
}

// The text of ci.yml's job `<id>`, up to the next job.
const ciJob = (id) => readFileSync(path('.github/workflows/ci.yml'), 'utf8').match(new RegExp(`^ {2}${id}:\n[\\s\\S]*?(?=^ {2}[\\w#-]|(?![\\s\\S]))`, 'm'))?.[0] ?? ''

describe('the master ruleset', () => {
  it('targets master alone, with only the admin role able to bypass it', () => {
    assert.equal(ruleset.target, 'branch')
    assert.deepEqual(ruleset.conditions.ref_name.include, ['refs/heads/master'])
    assert.deepEqual(ruleset.bypass_actors, [{ actor_id: 5, actor_type: 'RepositoryRole', bypass_mode: 'always' }])
  })

  it('is strict: a PR must contain the current master before it merges (#221)', () => {
    const { parameters } = ruleset.rules.find((r) => r.type === 'required_status_checks')
    assert.equal(parameters.strict_required_status_checks_policy, true)
  })

  it("requires exactly ci.yml's checks, and not the parts `test` waits on", () => {
    assert.deepEqual(required, checkIds('.github/workflows/ci.yml'))
  })

  // A required check that is skipped counts as passed, so `test` must run when a part fails, and fail then.
  it('has `test` run whatever its parts did, and pass only when each of them passed (#268)', () => {
    const test = ciJob('test')
    assert.match(test, /^ {4}needs: \[unit, live\]$/m)
    assert.match(test, /^ {4}if: always\(\)$/m)
    assert.match(test, /UNIT: \$\{\{ needs\.unit\.result \}\}/)
    assert.match(test, /LIVE: \$\{\{ needs\.live\.result \}\}/)
    assert.match(test, /^ {10}\[\[ \$UNIT == success && \$LIVE == success \]\]$/m)
  })

  it('is satisfied by the statuses the nightly upstream merge posts', () => {
    const posted = [...NIGHTLY.matchAll(/-f context=([\w-]+)/g)].map((m) => m[1]).sort()
    assert.deepEqual(posted, required)
  })
})

// The text of the nightly's step with `id: <id>`, up to the next step.
const step = (id) => NIGHTLY.match(new RegExp(`^ {6}- id: ${id}\n[\\s\\S]*?(?=^ {6}- |^ {6}#|(?![\\s\\S]))`, 'm'))?.[0] ?? ''

describe('the nightly upstream merge', () => {
  it('checks the merged tree against master for changed expected files', () => {
    assert.match(step('expected'), /run: bash \.github\/scripts\/expected-unchanged\.sh HEAD\^1 "\$REPORT"$/m)
  })

  it("posts each status only when that status's own step passed on the merged commit", () => {
    const push = step('push')
    assert.match(push, /TESTS: \$\{\{ steps\.tests\.outcome \}\}/)
    assert.match(push, /EXPECTED: \$\{\{ steps\.expected\.outcome \}\}/)
    assert.match(push, /if \[\[ \$TESTS == success \]\]; then\n\s+gh api [^\n]*-f context=test /)
    assert.match(push, /if \[\[ \$EXPECTED == success \]\]; then\n\s+gh api [^\n]*-f context=expected-files /)
  })
})
