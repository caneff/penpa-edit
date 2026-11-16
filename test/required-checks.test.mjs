// The ruleset that makes the safety-net checks required on master (#33, `.github/scripts/require-checks.sh`), read
// from its dry run: it requires exactly CI's jobs, and the nightly upstream merge posts a status for exactly those, so
// its direct push to master is not refused. Applying it is Chris's, once.
import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { readFileSync } from 'node:fs'
import { describe, it } from 'node:test'
import { fileURLToPath } from 'node:url'

const path = (p) => fileURLToPath(new URL(`../${p}`, import.meta.url))
const ruleset = JSON.parse(execFileSync('bash', [path('.github/scripts/require-checks.sh'), '--dry-run'], { encoding: 'utf8' }))
const required = ruleset.rules.find((r) => r.type === 'required_status_checks').parameters.required_status_checks.map((c) => c.context).sort()

// The job ids under `jobs:` in a workflow file, each a check context of its own.
const jobIds = (file) => [...readFileSync(path(file), 'utf8').split(/^jobs:\n/m)[1].matchAll(/^ {2}([\w-]+):$/gm)].map((m) => m[1]).sort()

describe('the master ruleset', () => {
  it('targets master alone, with only the admin role able to bypass it', () => {
    assert.equal(ruleset.target, 'branch')
    assert.deepEqual(ruleset.conditions.ref_name.include, ['refs/heads/master'])
    assert.deepEqual(ruleset.bypass_actors, [{ actor_id: 5, actor_type: 'RepositoryRole', bypass_mode: 'always' }])
  })

  it('requires exactly the jobs of ci.yml', () => {
    assert.deepEqual(required, jobIds('.github/workflows/ci.yml'))
  })

  it('is satisfied by the statuses the nightly upstream merge posts', () => {
    const posted = [...readFileSync(path('.github/workflows/upstream-merge.yml'), 'utf8').matchAll(/-f context=([\w-]+)/g)].map((m) => m[1]).sort()
    assert.deepEqual(posted, required)
  })
})
