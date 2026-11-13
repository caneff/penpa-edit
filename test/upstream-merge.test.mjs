// The nightly upstream merge's scripts (`.github/workflows/upstream-merge.yml`), run against scratch git repos and a
// stub `gh`. The workflow's own wiring (permissions, step order, the push) is proven only by a workflow_dispatch run.
import assert from 'node:assert/strict'
import { execFileSync, spawnSync } from 'node:child_process'
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, it } from 'node:test'

const MERGE_SCRIPT = fileURLToPath(new URL('../.github/scripts/upstream-merge.sh', import.meta.url))
const FILE_ISSUE_SCRIPT = fileURLToPath(new URL('../.github/actions/file-issue-once/file-issue-once.sh', import.meta.url))
const FAILING_TESTS_SCRIPT = fileURLToPath(new URL('../.github/scripts/failing-tests.sh', import.meta.url))
const UPSTREAM = 'upstream-master'

// No global or system git config, so a merge driver configured on this box cannot help the script.
const GIT_ENV = {
  ...process.env,
  GIT_CONFIG_GLOBAL: '/dev/null',
  GIT_CONFIG_NOSYSTEM: '1',
  GIT_AUTHOR_NAME: 'test',
  GIT_AUTHOR_EMAIL: 'test@example.invalid',
  GIT_COMMITTER_NAME: 'test',
  GIT_COMMITTER_EMAIL: 'test@example.invalid'
}

const git = (dir, ...args) => execFileSync('git', args, { cwd: dir, env: GIT_ENV, encoding: 'utf8' }).trim()

function commit (dir, files, message) {
  for (const [name, text] of Object.entries(files)) writeFileSync(join(dir, name), text)
  git(dir, 'add', '-A')
  git(dir, 'commit', '-q', '-m', message)
  return git(dir, 'rev-parse', 'HEAD')
}

// A repo on `master` whose base commit holds `base`, with `ours` committed on master and `theirs` on the upstream branch.
function scratchRepo ({ base, ours, theirs }) {
  const dir = mkdtempSync(join(tmpdir(), 'upstream-merge-'))
  git(dir, 'init', '-q', '-b', 'master')
  commit(dir, base, 'base')
  git(dir, 'branch', UPSTREAM)
  const oursTip = ours ? commit(dir, ours, 'ours') : git(dir, 'rev-parse', 'HEAD')
  git(dir, 'checkout', '-q', UPSTREAM)
  const theirsTip = theirs ? commit(dir, theirs, 'upstream change') : git(dir, 'rev-parse', 'HEAD')
  git(dir, 'checkout', '-q', 'master')
  return { dir, oursTip, theirsTip }
}

// Runs the merge script in `dir`; returns its exit status, its report and its GITHUB_OUTPUT lines.
function runMerge (dir) {
  const report = join(dir, '..', `${dir.split('/').pop()}-report.md`)
  const output = join(dir, '..', `${dir.split('/').pop()}-output`)
  writeFileSync(output, '')
  const { status, stderr } = spawnSync('bash', [MERGE_SCRIPT, UPSTREAM, report], {
    cwd: dir, env: { ...GIT_ENV, GITHUB_OUTPUT: output }, encoding: 'utf8'
  })
  const read = (file) => { try { return readFileSync(file, 'utf8') } catch { return '' } }
  return { status, stderr, report: read(report), output: read(output) }
}

describe('the upstream merge script', () => {
  it('merges upstream with a merge commit whose second parent is upstream\'s tip', () => {
    const { dir, oursTip, theirsTip } = scratchRepo({
      base: { 'engine.js': 'engine\n', 'ui.js': 'ui\n' },
      ours: { 'ui.js': 'our ui\n' },
      theirs: { 'engine.js': 'new engine\n' }
    })
    const { status, stderr, output } = runMerge(dir)
    assert.equal(status, 0, stderr)
    assert.equal(git(dir, 'rev-parse', 'HEAD^1'), oursTip)
    assert.equal(git(dir, 'rev-parse', 'HEAD^2'), theirsTip)
    assert.equal(readFileSync(join(dir, 'engine.js'), 'utf8'), 'new engine\n')
    assert.match(output, /^merged=true$/m)
  })

  it('makes no commit when upstream has nothing new', () => {
    const { dir, oursTip } = scratchRepo({ base: { 'engine.js': 'engine\n' }, ours: { 'ui.js': 'our ui\n' } })
    const { status, stderr, output } = runMerge(dir)
    assert.equal(status, 0, stderr)
    assert.equal(git(dir, 'rev-parse', 'HEAD'), oursTip)
    assert.match(output, /^merged=false$/m)
  })

  it('on a conflict exits non-zero, names each conflicting file and leaves no merge behind', () => {
    const { dir, oursTip } = scratchRepo({
      base: { 'engine.js': 'engine\n', 'grid.js': 'grid\n', 'calm.js': 'calm\n' },
      ours: { 'engine.js': 'our engine\n', 'grid.js': 'our grid\n' },
      theirs: { 'engine.js': 'their engine\n', 'grid.js': 'their grid\n', 'calm.js': 'their calm\n' }
    })
    const { status, report } = runMerge(dir)
    assert.notEqual(status, 0)
    assert.match(report, /^- `engine\.js`$/m)
    assert.match(report, /^- `grid\.js`$/m)
    assert.doesNotMatch(report, /calm\.js/)
    assert.equal(git(dir, 'rev-parse', 'HEAD'), oursTip)
    assert.equal(git(dir, 'status', '--porcelain'), '')
  })

  it('keeps our side of a merge=ours file with no driver configured outside the repo, and reports the upstream commit', () => {
    const { dir, theirsTip } = scratchRepo({
      base: { '.gitattributes': 'ui.js merge=ours\n', 'engine.js': 'engine\n', 'ui.js': 'ui\n' },
      ours: { 'ui.js': 'our ui\n' },
      theirs: { 'engine.js': 'new engine\n', 'ui.js': 'their ui\n' }
    })
    const { status, stderr, report } = runMerge(dir)
    assert.equal(status, 0, stderr)
    assert.equal(readFileSync(join(dir, 'ui.js'), 'utf8'), 'our ui\n')
    assert.equal(readFileSync(join(dir, 'engine.js'), 'utf8'), 'new engine\n')
    for (const [where, text] of [['report', report], ['merge commit message', git(dir, 'log', '-1', '--format=%B')]]) {
      const listed = text.match(/^- ([0-9a-f]{7,}) upstream change$/m)
      assert.ok(listed, `the ${where} lists no upstream commit:\n${text}`)
      assert.equal(theirsTip.startsWith(listed[1]), true, `the ${where} lists ${listed[1]}, not ${theirsTip}`)
    }
  })
})

// A `gh` on PATH that answers `issue list` with `openIssues` ("<number>\t<title>" lines) and logs every call's arguments.
function runFileIssueOnce ({ title, body, openIssues }) {
  const dir = mkdtempSync(join(tmpdir(), 'file-issue-once-'))
  const log = join(dir, 'calls.jsonl')
  writeFileSync(join(dir, 'open-issues'), openIssues)
  writeFileSync(join(dir, 'gh'), `#!/usr/bin/env bash
node -e 'process.stdout.write(JSON.stringify(process.argv.slice(1)) + "\\n")' -- "$@" >>"${log}"
if [[ $1 == issue && $2 == list ]]; then cat "${join(dir, 'open-issues')}"; fi
`, { mode: 0o755 })
  const { status, stderr } = spawnSync('bash', [FILE_ISSUE_SCRIPT], {
    env: { ...process.env, PATH: `${dir}:${process.env.PATH}`, GITHUB_REPOSITORY: 'owner/repo', TITLE: title, BODY: body },
    encoding: 'utf8'
  })
  assert.equal(status, 0, stderr)
  return readFileSync(log, 'utf8').trim().split('\n').map((line) => JSON.parse(line)).filter(([, verb]) => verb !== 'list')
}

const TITLE = 'Nightly upstream merge failed'
const BODY = 'The merge conflicted in `a.js`.'

describe('file-issue-once', () => {
  it('files a bug, needs-info issue when none with the title is open', () => {
    const calls = runFileIssueOnce({ title: TITLE, body: BODY, openIssues: `7\t${TITLE} again\n` })
    assert.deepEqual(calls, [['issue', 'create', '--repo', 'owner/repo', '--label', 'bug,needs-info', '--title', TITLE, '--body', BODY]])
  })

  it('comments on the open issue with exactly the title instead of filing another', () => {
    const calls = runFileIssueOnce({ title: TITLE, body: BODY, openIssues: `7\t${TITLE} again\n42\t${TITLE}\n` })
    assert.deepEqual(calls, [['issue', 'comment', '42', '--repo', 'owner/repo', '--body', BODY]])
  })
})

// The extractor's Markdown list for `log`, written to a file as the workflow writes the test run's output.
function failingTests (log) {
  const file = join(mkdtempSync(join(tmpdir(), 'failing-tests-')), 'test.log')
  writeFileSync(file, log)
  return execFileSync('bash', [FAILING_TESTS_SCRIPT, file], { encoding: 'utf8' })
}

describe('the failing-test extractor', () => {
  it('names each failing test of a real node --test run by file, line and title, and not a todo test', () => {
    const dir = mkdtempSync(join(tmpdir(), 'failing-fixture-'))
    writeFileSync(join(dir, 'fixture.test.mjs'), [
      "import assert from 'node:assert/strict'",
      "import { describe, it } from 'node:test'",
      "describe('a suite', () => {",
      "  it('passes', () => {})",
      "  it('breaks here', () => { assert.equal(1, 2) })",
      "  it('owed', { todo: '#9' }, () => { assert.equal(1, 2) })",
      '})',
      "it('breaks at top level', () => { assert.equal(3, 4) })",
      ''
    ].join('\n'))
    // Piped, as in CI, so the runner prints its non-TTY report; without NODE_TEST_CONTEXT, which makes a child runner
    // report to this one instead.
    const { NODE_TEST_CONTEXT, ...env } = process.env
    const run = spawnSync(process.execPath, ['--test', 'fixture.test.mjs'], { cwd: dir, env, encoding: 'utf8' })
    assert.equal(run.status, 1, 'the fixture run should fail')
    assert.equal(failingTests(run.stdout + run.stderr),
      '- `fixture.test.mjs:5:3` breaks here\n- `fixture.test.mjs:8:1` breaks at top level\n')
  })

  it('says it found no failing test rather than printing nothing', () => {
    assert.equal(failingTests('npm error code ERESOLVE\n'), '- No failing test is named in the log; read the run.\n')
  })
})
