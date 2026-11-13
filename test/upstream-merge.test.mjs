// The nightly upstream merge's scripts (`.github/workflows/upstream-merge.yml`), run against scratch git repos and a
// stub `gh`. The workflow's own wiring (permissions, step order, the push) is proven only by a workflow_dispatch run.
import assert from 'node:assert/strict'
import { execFileSync, spawnSync } from 'node:child_process'
import { existsSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, it } from 'node:test'

const script = (name) => fileURLToPath(new URL(`../.github/scripts/${name}`, import.meta.url))
const MERGE_SCRIPT = script('upstream-merge.sh')
const FILE_ISSUE_SCRIPT = script('file-issue-once.sh')
const FAILING_TESTS_SCRIPT = script('failing-tests.sh')
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

// `theirs` is one commit's files, or a list of them committed in order as "upstream change 1", "upstream change 2", ...
function scratchRepo ({ base, ours, theirs = [] }) {
  const dir = mkdtempSync(join(tmpdir(), 'upstream-merge-'))
  git(dir, 'init', '-q', '-b', 'master')
  commit(dir, base, 'base')
  git(dir, 'branch', UPSTREAM)
  const oursTip = ours ? commit(dir, ours, 'ours') : git(dir, 'rev-parse', 'HEAD')
  git(dir, 'checkout', '-q', UPSTREAM)
  const theirsTips = (Array.isArray(theirs) ? theirs : [theirs])
    .map((files, i, all) => commit(dir, files, all.length === 1 ? 'upstream change' : `upstream change ${i + 1}`))
  git(dir, 'checkout', '-q', 'master')
  return { dir, oursTip, theirsTip: theirsTips.at(-1), theirsTips }
}

function runMerge (dir) {
  const report = `${dir}-report.md`
  const output = `${dir}-output`
  writeFileSync(output, '')
  const { status, stderr } = spawnSync('bash', [MERGE_SCRIPT, UPSTREAM, report], {
    cwd: dir, env: { ...GIT_ENV, GITHUB_OUTPUT: output }, encoding: 'utf8'
  })
  return { status, stderr, report: readFileSync(report, 'utf8'), output: readFileSync(output, 'utf8') }
}

// The sha listed on the line `- <sha> <subject>` of `text`, or null.
const listedSha = (text, subject) => text.match(new RegExp(`^- ([0-9a-f]{7,}) ${subject}$`, 'm'))?.[1] ?? null

const OWNED_BASE = { '.gitattributes': 'ui.js merge=ours\n', 'engine.js': 'engine\n', 'ui.js': 'ui\n' }

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
    assert.match(report, /^## The merge conflicted$/m)
    assert.match(report, /^- `engine\.js`$/m)
    assert.match(report, /^- `grid\.js`$/m)
    assert.doesNotMatch(report, /calm\.js/)
    assert.equal(git(dir, 'rev-parse', 'HEAD'), oursTip)
    assert.equal(git(dir, 'status', '--porcelain'), '')
  })

  it('reports a merge that failed without a conflict as a failure, not a conflict', () => {
    const { dir, oursTip } = scratchRepo({ base: { 'engine.js': 'engine\n' }, theirs: { 'new.js': 'theirs\n' } })
    writeFileSync(join(dir, 'new.js'), 'untracked here\n')
    const { status, report } = runMerge(dir)
    assert.notEqual(status, 0)
    assert.match(report, /^## The merge failed with no conflicting file$/m)
    assert.doesNotMatch(report, /conflicted/)
    assert.equal(git(dir, 'rev-parse', 'HEAD'), oursTip)
  })

  it('keeps our side of a merge=ours file with no driver configured outside the repo, and reports the upstream commit', () => {
    const { dir, theirsTip } = scratchRepo({
      base: OWNED_BASE,
      ours: { 'ui.js': 'our ui\n' },
      theirs: { 'engine.js': 'new engine\n', 'ui.js': 'their ui\n' }
    })
    const { status, stderr, report } = runMerge(dir)
    assert.equal(status, 0, stderr)
    assert.equal(readFileSync(join(dir, 'ui.js'), 'utf8'), 'our ui\n')
    assert.equal(readFileSync(join(dir, 'engine.js'), 'utf8'), 'new engine\n')
    for (const [where, text] of [['report', report], ['merge commit message', git(dir, 'log', '-1', '--format=%B')]]) {
      const sha = listedSha(text, 'upstream change')
      assert.ok(sha, `the ${where} lists no upstream commit:\n${text}`)
      assert.equal(theirsTip.startsWith(sha), true, `the ${where} lists ${sha}, not ${theirsTip}`)
    }
  })

  it('keeps our side of a merge=ours file that only upstream changed', () => {
    const { dir } = scratchRepo({
      base: OWNED_BASE,
      ours: { 'engine.js': 'our engine\n' },
      theirs: { 'ui.js': 'their ui\n' }
    })
    const { status, stderr } = runMerge(dir)
    assert.equal(status, 0, stderr)
    assert.equal(readFileSync(join(dir, 'ui.js'), 'utf8'), 'ui\n')
    assert.equal(git(dir, 'status', '--porcelain'), '')
  })

  it('keeps a merge=ours file absent when upstream adds it', () => {
    const { dir } = scratchRepo({
      base: { '.gitattributes': 'ui.js merge=ours\n', 'engine.js': 'engine\n' },
      theirs: { 'ui.js': 'their ui\n', 'engine.js': 'new engine\n' }
    })
    const { status, stderr } = runMerge(dir)
    assert.equal(status, 0, stderr)
    assert.equal(existsSync(join(dir, 'ui.js')), false)
    assert.equal(readFileSync(join(dir, 'engine.js'), 'utf8'), 'new engine\n')
    assert.equal(git(dir, 'status', '--porcelain'), '')
  })

  it('reports each upstream commit that touched a merge=ours file, even when a later one undid it', () => {
    const { dir, theirsTips } = scratchRepo({
      base: OWNED_BASE,
      theirs: [{ 'ui.js': 'their ui\n' }, { 'ui.js': 'ui\n', 'engine.js': 'new engine\n' }]
    })
    const { status, stderr, report } = runMerge(dir)
    assert.equal(status, 0, stderr)
    theirsTips.forEach((tip, i) => {
      const sha = listedSha(report, `upstream change ${i + 1}`)
      assert.ok(sha && tip.startsWith(sha), `the report does not list upstream change ${i + 1}:\n${report}`)
    })
  })
})

// A stub `gh` on PATH answers `issue list` with `openIssues` ("<number>\t<title>" lines), or fails it when `listFails`.
function runFileIssueOnce ({ title, body, openIssues = '', listFails = false }) {
  const dir = mkdtempSync(join(tmpdir(), 'file-issue-once-'))
  const log = join(dir, 'calls.jsonl')
  const bodyFile = join(dir, 'body.md')
  writeFileSync(bodyFile, body)
  writeFileSync(log, '')
  writeFileSync(join(dir, 'open-issues'), openIssues)
  writeFileSync(join(dir, 'gh'), `#!/usr/bin/env bash
node -e 'process.stdout.write(JSON.stringify(process.argv.slice(1)) + "\\n")' -- "$@" >>"${log}"
if [[ $1 == issue && $2 == list ]]; then ${listFails ? 'exit 1' : `cat "${join(dir, 'open-issues')}"`}; fi
`, { mode: 0o755 })
  const { status, stderr } = spawnSync('bash', [FILE_ISSUE_SCRIPT, title, bodyFile], {
    env: { ...process.env, PATH: `${dir}:${process.env.PATH}`, GITHUB_REPOSITORY: 'owner/repo' },
    encoding: 'utf8'
  })
  const calls = readFileSync(log, 'utf8').trim().split('\n').filter(Boolean).map((line) => JSON.parse(line))
  return { status, stderr, writes: calls.filter(([, verb]) => verb !== 'list') }
}

const TITLE = 'Nightly upstream merge failed'
const BODY = 'The merge conflicted in `a.js`.'

describe('file-issue-once', () => {
  it('files a bug, needs-info issue when none with the title is open', () => {
    const { status, stderr, writes } = runFileIssueOnce({ title: TITLE, body: BODY, openIssues: `7\t${TITLE} again\n` })
    assert.equal(status, 0, stderr)
    assert.deepEqual(writes, [['issue', 'create', '--repo', 'owner/repo', '--label', 'bug,needs-info', '--title', TITLE, '--body', BODY]])
  })

  it('comments on the open issue with exactly the title instead of filing another', () => {
    const { status, stderr, writes } = runFileIssueOnce({ title: TITLE, body: BODY, openIssues: `7\t${TITLE} again\n42\t${TITLE}\n` })
    assert.equal(status, 0, stderr)
    assert.deepEqual(writes, [['issue', 'comment', '42', '--repo', 'owner/repo', '--body', BODY]])
  })

  it('fails and writes nothing when the open issues cannot be listed', () => {
    const { status, writes } = runFileIssueOnce({ title: TITLE, body: BODY, listFails: true })
    assert.notEqual(status, 0)
    assert.deepEqual(writes, [])
  })
})

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
