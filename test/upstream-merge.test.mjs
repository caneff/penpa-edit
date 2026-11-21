// The nightly upstream merge's scripts (`.github/workflows/upstream-merge.yml`), run against scratch git repos and a
// stub `gh`. The workflow's own wiring (permissions, step order, the push) is proven only by a workflow_dispatch run.
import assert from 'node:assert/strict'
import { execFileSync, spawnSync } from 'node:child_process'
import { existsSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, it } from 'node:test'
import { stubGh } from './stub-gh.mjs'

const script = (name) => fileURLToPath(new URL(`../.github/scripts/${name}`, import.meta.url))
const MERGE_SCRIPT = script('upstream-merge.sh')
const FILE_ISSUE_SCRIPT = script('file-issue-once.sh')
const FILE_TRIAGE_SCRIPT = script('file-upstream-triage.sh')
const FAILING_TESTS_SCRIPT = script('failing-tests.sh')
const EXPECTED_UNCHANGED_SCRIPT = script('expected-unchanged.sh')
const UPSTREAM = 'upstream-master'
const SEP = '\x1f'

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
  for (const [name, text] of Object.entries(files)) {
    mkdirSync(join(dir, name, '..'), { recursive: true })
    writeFileSync(join(dir, name), text)
  }
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
  const owned = `${dir}-owned-commits.tsv`
  const output = `${dir}-output`
  writeFileSync(output, '')
  const { status, stderr } = spawnSync('bash', [MERGE_SCRIPT, UPSTREAM, report, owned], {
    cwd: dir, env: { ...GIT_ENV, GITHUB_OUTPUT: output }, encoding: 'utf8'
  })
  return {
    status, stderr, report: readFileSync(report, 'utf8'), output: readFileSync(output, 'utf8'),
    ownedCommits: readFileSync(owned, 'utf8')
  }
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

  // After the script ran (#117), a plain merge in the same repo must still text-merge or conflict an owned file both
  // sides changed: the driver is passed to the script's own merge and never written to a config.
  const UI_LINES = 'a\nb\nc\nd\ne\nf\ng\n'
  function plainMergesAfter (dir, expectedStatus) {
    const { status, stderr } = runMerge(dir)
    assert.equal(status, expectedStatus, stderr)
    assert.equal(spawnSync('git', ['config', '--get', 'merge.ours.driver'], { cwd: dir, env: GIT_ENV }).status, 1)
    const base = git(dir, 'rev-parse', 'HEAD')
    git(dir, 'checkout', '-q', '-b', 'worker', base)
    commit(dir, { 'ui.js': 'A\nb\nc\nd\ne\nf\ng\n' }, 'worker edits the top of ui.js')
    git(dir, 'checkout', '-q', 'master')
    commit(dir, { 'ui.js': 'a\nb\nc\nd\ne\nf\nG\n' }, 'master edits the bottom of ui.js')
    git(dir, 'merge', '-q', '--no-edit', 'worker')
    assert.equal(readFileSync(join(dir, 'ui.js'), 'utf8'), 'A\nb\nc\nd\ne\nf\nG\n')
    // Overlapping edits conflict instead of keeping our side.
    git(dir, 'checkout', '-q', '-b', 'worker2', base)
    commit(dir, { 'ui.js': 'worker\n' }, 'worker rewrites ui.js')
    git(dir, 'checkout', '-q', 'master')
    commit(dir, { 'ui.js': 'master\n' }, 'master rewrites ui.js')
    assert.throws(() => git(dir, 'merge', '--no-edit', 'worker2'), /Command failed/)
    assert.match(readFileSync(join(dir, 'ui.js'), 'utf8'), /<<<<<<<[^]*master[^]*worker[^]*>>>>>>>/)
  }

  it('leaves no merge driver in the config after a merge that conflicts and aborts, so a plain merge still text-merges (#117)', () => {
    const { dir } = scratchRepo({
      base: { ...OWNED_BASE, 'ui.js': UI_LINES },
      ours: { 'engine.js': 'our engine\n' },
      theirs: { 'engine.js': 'their engine\n' }
    })
    plainMergesAfter(dir, 1)
  })

  it('leaves no merge driver in the config after a merge that succeeds, so a plain merge still text-merges (#117)', () => {
    const { dir } = scratchRepo({
      base: { ...OWNED_BASE, 'ui.js': UI_LINES },
      ours: { 'ui.js': 'a\nb\nc\nD\ne\nf\ng\n' },
      theirs: { 'engine.js': 'new engine\n', 'ui.js': 'a\nb\nc\nd\nE\nf\ng\n' }
    })
    plainMergesAfter(dir, 0)
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

  it('lists each upstream commit that touched a merge=ours file as sha, subject and the owned files it touched', () => {
    const { dir, theirsTips } = scratchRepo({
      base: { ...OWNED_BASE, 'other.js': 'other\n' },
      theirs: [
        { 'ui.js': 'their ui\n', 'engine.js': 'engine 1\n' },
        { 'engine.js': 'engine 2\n' },
        { 'ui.js': 'ui again\n', 'other.js': 'other 3\n' }
      ]
    })
    const { status, stderr, ownedCommits } = runMerge(dir)
    assert.equal(status, 0, stderr)
    assert.deepEqual(ownedCommits.trim().split('\n').sort(), [
      `${theirsTips[0]}${SEP}upstream change 1${SEP}ui.js`,
      `${theirsTips[2]}${SEP}upstream change 3${SEP}ui.js`
    ].sort())
  })

  it('writes an empty owned-commit list when upstream touched no merge=ours file, and when it has nothing new', () => {
    const touched = scratchRepo({ base: OWNED_BASE, theirs: { 'engine.js': 'new engine\n' } })
    assert.equal(runMerge(touched.dir).ownedCommits, '')
    const idle = scratchRepo({ base: OWNED_BASE })
    assert.equal(runMerge(idle.dir).ownedCommits, '')
  })

  it('lists the owned commits even when the merge then conflicts', () => {
    const { dir, theirsTip } = scratchRepo({
      base: { ...OWNED_BASE },
      ours: { 'engine.js': 'our engine\n' },
      theirs: { 'ui.js': 'their ui\n', 'engine.js': 'their engine\n' }
    })
    const { status, ownedCommits } = runMerge(dir)
    assert.notEqual(status, 0)
    assert.equal(ownedCommits, `${theirsTip}${SEP}upstream change${SEP}ui.js\n`)
  })
})

// AGENTS.md § "Our files": a directory ends in "/", and a file in it is probed by a made-up name.
const OWNED_PATHS = [
  '.gitattributes', 'AGENTS.md', 'CLAUDE.md', 'CODING_STANDARDS.md', 'GLOSSARY.md', 'STREAM-FIT.md', '.agents/', 'research/', 'adr/', 'userscript/', 'live/',
  'docs/js/header_text.js', 'docs/js/recorder.js', 'docs/js/engine_bridge.js', 'docs/js/penpa_layer.js', 'docs/js/progress_autosave.js', 'docs/solve.html', 'docs/gallery.html', 'docs/gallery.js', 'docs/gallery-puzzles.js', 'docs/ui/',
  'test/ui-boundary.test.mjs',
  'test/snapshots.test.mjs', 'test/constraints.test.mjs', 'test/header-text.test.mjs', 'test/canonical-state.test.mjs', 'test/ui-fuzz-rules.test.mjs', 'test/ui-fuzz-nightly.test.mjs',
  'test/userscript.test.mjs', 'test/upstream-merge.test.mjs', 'test/package-scripts.test.mjs', 'test/stub-gh.mjs', 'test/run-live.test.mjs',
  'test/nightly-seam.test.mjs', 'test/redirect-urls.mjs', 'test/run-narrowed.test.mjs', 'test/ci-concurrency.test.mjs', 'test/live-scratch.mjs',
  '.github/workflows/', '.github/actions/', '.github/scripts/'
]
const REPO_ROOT = fileURLToPath(new URL('..', import.meta.url))

describe("the repo's .gitattributes", () => {
  for (const path of OWNED_PATHS) {
    it(`marks ${path} merge=ours`, () => {
      const probe = path.endsWith('/') ? `${path}sub/probe.txt` : path
      assert.equal(git(REPO_ROOT, 'check-attr', 'merge', '--', probe), `${probe}: merge: ours`)
    })
  }

  it('marks no tracked file that is not an owned path, so upstream\'s files still merge', () => {
    const tracked = git(REPO_ROOT, 'ls-files')
    const marked = execFileSync('git', ['check-attr', '--stdin', 'merge'], { cwd: REPO_ROOT, input: tracked, encoding: 'utf8' })
      .split('\n').filter((line) => line.endsWith(': merge: ours')).map((line) => line.slice(0, -': merge: ours'.length))
    const stray = marked.filter((file) => !OWNED_PATHS.some((path) => (path.endsWith('/') ? file.startsWith(path) : file === path)))
    assert.deepEqual(stray, [])
  })

  it('does not mark a same-named file in another directory, even on a case-insensitive clone', () => {
    const attr = (file) => execFileSync('git', ['-c', 'core.ignorecase=true', 'check-attr', 'merge', '--', file], { cwd: REPO_ROOT, encoding: 'utf8' }).trim()
    for (const file of ['docs/AGENTS.md', 'docs/agents.md', 'docs/GLOSSARY.md']) assert.equal(attr(file), `${file}: merge: unspecified`)
  })
})

function runFileIssueOnce ({ title, body, ...stub }) {
  const { dir, env, calls } = stubGh(stub)
  const bodyFile = join(dir, 'body.md')
  writeFileSync(bodyFile, body)
  const { status, stderr } = spawnSync('bash', [FILE_ISSUE_SCRIPT, title, bodyFile], { env, encoding: 'utf8' })
  return { status, stderr, writes: calls().filter(([, verb]) => verb !== 'list') }
}

const TITLE = 'Nightly upstream merge failed'
const BODY = 'The merge conflicted in `a.js`.'

describe('file-issue-once', () => {
  it('files a bug, needs-info issue when none with the title is open', () => {
    const { status, stderr, writes } = runFileIssueOnce({ title: TITLE, body: BODY, listOutput: `7\t${TITLE} again\n` })
    assert.equal(status, 0, stderr)
    assert.deepEqual(writes, [['issue', 'create', '--repo', 'owner/repo', '--label', 'bug,needs-info', '--title', TITLE, '--body', BODY]])
  })

  it('comments on the open issue with exactly the title instead of filing another', () => {
    const { status, stderr, writes } = runFileIssueOnce({ title: TITLE, body: BODY, listOutput: `7\t${TITLE} again\n42\t${TITLE}\n` })
    assert.equal(status, 0, stderr)
    assert.deepEqual(writes, [['issue', 'comment', '42', '--repo', 'owner/repo', '--body', BODY]])
  })

  it('fails and writes nothing when the open issues cannot be listed', () => {
    const { status, writes } = runFileIssueOnce({ title: TITLE, body: BODY, listFails: true })
    assert.notEqual(status, 0)
    assert.deepEqual(writes, [])
  })
})

const SHA_A = 'a'.repeat(40)
const SHA_B = 'b'.repeat(40)

function runFileTriage ({ lines, ...stub }) {
  const { dir, env, calls } = stubGh(stub)
  const file = join(dir, 'owned-commits.tsv')
  writeFileSync(file, lines.map((line) => `${line}\n`).join(''))
  const { status, stderr } = spawnSync('bash', [FILE_TRIAGE_SCRIPT, file], { env, encoding: 'utf8' })
  const all = calls()
  return { status, stderr, lists: all.filter(([, verb]) => verb === 'list'), writes: all.filter(([, verb]) => verb !== 'list') }
}

describe('file-upstream-triage', () => {
  it('files one needs-triage issue per upstream commit, naming the commit, its subject and the owned files', () => {
    const { status, stderr, writes } = runFileTriage({
      lines: [`${SHA_A}${SEP}Fix the grid${SEP}docs/js/class_p.js`, `${SHA_B}${SEP}Add a button${SEP}docs/js/class_p.js,docs/index.html`]
    })
    assert.equal(status, 0, stderr)
    assert.equal(writes.length, 2)
    const [first, second] = writes
    assert.deepEqual(first.slice(0, 7), ['issue', 'create', '--repo', 'owner/repo', '--label', 'needs-triage', '--title'])
    assert.equal(first[7], `Upstream ${SHA_A.slice(0, 10)}: Fix the grid`)
    assert.equal(first[8], '--body')
    assert.match(first[9], new RegExp(`https://github\\.com/swaroopg92/penpa-edit/commit/${SHA_A}`))
    assert.match(first[9], /^- `docs\/js\/class_p\.js`$/m)
    assert.equal(second[7], `Upstream ${SHA_B.slice(0, 10)}: Add a button`)
    assert.match(second[9], /^- `docs\/js\/class_p\.js`$/m)
    assert.match(second[9], /^- `docs\/index\.html`$/m)
  })

  it('files nothing for a commit whose title is already on an issue of any state, but files the others', () => {
    const { status, stderr, lists, writes } = runFileTriage({
      lines: [`${SHA_A}${SEP}Fix the grid${SEP}docs/js/class_p.js`, `${SHA_B}${SEP}Add a button${SEP}docs/js/class_p.js`],
      listOutput: `Upstream ${SHA_A.slice(0, 10)}: Fix the grid\n`
    })
    assert.equal(status, 0, stderr)
    const flagValue = (call, flag) => call[call.indexOf(flag) + 1]
    assert.deepEqual(lists.map((call) => flagValue(call, '--search')), [`${SHA_A.slice(0, 10)} in:title`, `${SHA_B.slice(0, 10)} in:title`])
    assert.ok(lists.every((call) => flagValue(call, '--state') === 'all'), 'a closed issue must count as filed')
    assert.deepEqual(writes.map((call) => call[7]), [`Upstream ${SHA_B.slice(0, 10)}: Add a button`])
  })

  it('caps a long subject so the title stays under GitHub\'s 256 characters, and still finds it by its sha', () => {
    const { status, stderr, writes } = runFileTriage({ lines: [`${SHA_A}${SEP}${'x'.repeat(379)}${SEP}docs/js/class_p.js`] })
    assert.equal(status, 0, stderr)
    assert.ok(writes[0][7].length <= 256, `title is ${writes[0][7].length} characters`)
    assert.ok(writes[0][7].startsWith(`Upstream ${SHA_A.slice(0, 10)}: xxx`))
  })

  it('keeps the owned files of a commit with an empty subject', () => {
    const { status, stderr, writes } = runFileTriage({ lines: [`${SHA_A}${SEP}${SEP}docs/js/class_p.js`] })
    assert.equal(status, 0, stderr)
    assert.equal(writes[0][7], `Upstream ${SHA_A.slice(0, 10)}: `)
    assert.match(writes[0][9], /^- `docs\/js\/class_p\.js`$/m)
  })

  it('files nothing for an empty list, and fails with no write when the issues cannot be listed', () => {
    const empty = runFileTriage({ lines: [] })
    assert.equal(empty.status, 0, empty.stderr)
    assert.deepEqual(empty.lists, [])
    assert.deepEqual(empty.writes, [])
    const blind = runFileTriage({ lines: [`${SHA_A}${SEP}Fix the grid${SEP}docs/js/class_p.js`], listFails: true })
    assert.notEqual(blind.status, 0)
    assert.deepEqual(blind.writes, [])
  })
})

describe('the upstream-merge workflow', () => {
  const workflow = readFileSync(fileURLToPath(new URL('../.github/workflows/upstream-merge.yml', import.meta.url)), 'utf8')

  it('hands the merge script the owned-commit file and runs the triage script on it, whether or not the merge succeeded', () => {
    assert.match(workflow, /upstream-merge\.sh upstream\/master "\$REPORT" "\$OWNED_COMMITS"/)
    assert.match(workflow, /- if: \$\{\{ !cancelled\(\) \}\}\n\s+name: File a triage issue[^\n]*\n(?:\s+[^\n]*\n)*?\s+run: bash \.github\/scripts\/file-upstream-triage\.sh "\$OWNED_COMMITS"/)
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

// Every expected-file change an upstream merge brings goes to Chris (#33), so the nightly pushes no merge that has one.
function runExpectedUnchanged (dir) {
  const report = `${dir}-report.md`
  writeFileSync(report, '')
  const { status, stderr } = spawnSync('bash', [EXPECTED_UNCHANGED_SCRIPT, 'HEAD^1', report], { cwd: dir, env: GIT_ENV, encoding: 'utf8' })
  return { status, stderr, report: readFileSync(report, 'utf8') }
}

function mergedRepo (theirs) {
  const { dir } = scratchRepo({ base: { 'engine.js': 'engine\n', [EXPECTED]: '{"checkpoints":[]}\n' }, theirs })
  git(dir, 'merge', '-q', '--no-ff', '-m', 'merge', UPSTREAM)
  return dir
}

const EXPECTED = 'live/recordings/genre/box.expected.json'

describe('expected-unchanged', () => {
  it('passes a merge that changes no expected file', () => {
    const { status, stderr, report } = runExpectedUnchanged(mergedRepo({ 'engine.js': 'new engine\n' }))
    assert.equal(status, 0, stderr)
    assert.equal(report, '')
  })

  it('fails a merge that changes an expected file, and names it in the report', () => {
    const { status, report } = runExpectedUnchanged(mergedRepo({ [EXPECTED]: '{"checkpoints":[1]}\n' }))
    assert.notEqual(status, 0)
    assert.match(report, /^## The merge changes expected files$/m)
    assert.match(report, new RegExp(`^- \`${EXPECTED}\`$`, 'm'))
  })
})
