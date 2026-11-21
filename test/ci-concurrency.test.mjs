// CI's concurrency rule (#317): a newer push to a PR cancels the PR's older run; a push to master and the nightly's call
// are never cancelled. GitHub's behaviour on a real double push is proven only by one (the ticket's first criterion);
// this reads the workflow's own lines, since no YAML parser is a dependency.
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { describe, it } from 'node:test'

const CI = readFileSync(new URL('../.github/workflows/ci.yml', import.meta.url), 'utf8')
const block = CI.match(/^concurrency:\n((?: {2}.*\n)+)/m)?.[1] ?? ''

describe('ci.yml concurrency', () => {
  it('cancels in progress only for a pull_request event', () => {
    assert.match(block, /cancel-in-progress: \$\{\{ github\.event_name == 'pull_request' \}\}/)
  })
  it('groups a PR by its number and any other run by its run id', () => {
    assert.match(block, /group: ci-\$\{\{ github\.event_name == 'pull_request' && github\.event\.pull_request\.number \|\| github\.run_id \}\}/)
  })
  it('has no job-level concurrency, which could cancel a master or nightly run', () => {
    assert.doesNotMatch(CI, /^ {2,}concurrency:/m)
  })
})
