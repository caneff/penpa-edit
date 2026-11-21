// The narrowed seam command (`live/run-narrowed.mjs`, #316): the unit tests, then the live files CI would run for the
// same change. Its `--list` names what it would run, which the implement skill records on a PR.
import assert from 'node:assert/strict'
import { execFileSync, spawnSync } from 'node:child_process'
import { cpSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { describe, it } from 'node:test'
import { fileURLToPath } from 'node:url'

const ENGINE = 'live/engine-replay-0.live.mjs'
const UI = 'live/ui-replay-0.live.mjs'
const PINS = 'live/pins.live.mjs'
const ROOT = fileURLToPath(new URL('..', import.meta.url))

// A scratch repo like `test/run-live.test.mjs`'s: one engine-side file, one UI-driver replay, one solve-UI file.
function scratchRepo () {
  const dir = mkdtempSync(join(tmpdir(), 'run-narrowed-'))
  const files = { [ENGINE]: '// one\n', [UI]: '// one\n', [PINS]: '// one\n', 'docs/ui/pins.js': '// one\n',
    'docs/js/class_p.js': '// one\n', 'docs/index.html': '<script>load(["./js/class_p.js"])</script>\n' }
  for (const [path, text] of Object.entries(files)) {
    mkdirSync(dirname(join(dir, path)), { recursive: true })
    writeFileSync(join(dir, path), text)
  }
  const git = (...args) => execFileSync('git', args, { cwd: dir, encoding: 'utf8' })
  git('init', '-q', '-b', 'master')
  git('config', 'user.name', 'test')
  git('config', 'user.email', 'test@example.com')
  cpSync(join(ROOT, 'package.json'), join(dir, 'package.json'))
  git('add', '-A')
  git('commit', '-q', '-m', 'base')
  return dir
}

// Without NODE_TEST_CONTEXT, which makes a child runner report to this one instead.
const { NODE_TEST_CONTEXT, ...ENV } = process.env
const RUN = join(ROOT, 'live/run-narrowed.mjs')
const listed = (dir, ...args) => {
  const out = spawnSync(process.execPath, [RUN, '--list', ...args], { cwd: dir, env: ENV, encoding: 'utf8' })
  assert.equal(out.status, 0, out.stderr)
  return { suites: out.stdout.split('\n').filter(Boolean), said: out.stderr }
}

describe('node live/run-narrowed.mjs --list', () => {
  it('names the unit tests and the live files CI would run for a change under docs/ui/', () => {
    const dir = scratchRepo()
    writeFileSync(join(dir, 'docs/ui/pins.js'), '// two\n')
    const { suites, said } = listed(dir, '--changed', 'master')
    assert.deepEqual(suites, ['npm test', PINS])
    assert.match(said, /all on the skip list/)
  })

  it('adds the engine side for an edit to a script the page loads', () => {
    const dir = scratchRepo()
    writeFileSync(join(dir, 'docs/js/class_p.js'), '// two\n')
    assert.deepEqual(listed(dir, '--changed', 'master').suites, ['npm test', ENGINE, PINS, UI])
  })

  it('runs the full set with no --changed, and says so', () => {
    const { suites, said } = listed(scratchRepo())
    assert.deepEqual(suites, ['npm test', ENGINE, PINS, UI])
    assert.match(said, /the full set/)
  })

  it('runs the full set when the ref cannot be read, and says why', () => {
    const dir = scratchRepo()
    writeFileSync(join(dir, 'docs/ui/pins.js'), '// two\n')
    const { suites, said } = listed(dir, '--changed', 'no-such-ref')
    assert.deepEqual(suites, ['npm test', ENGINE, PINS, UI])
    assert.match(said, /change detection failed .*: the full set/)
  })
})

describe('AGENTS.md', () => {
  it('names the narrowed command on a Narrowed line, so the implement skill reads it', () => {
    const text = readFileSync(join(ROOT, 'AGENTS.md'), 'utf8')
    assert.match(text, /^- \*\*Narrowed\*\*: `node live\/run-narrowed\.mjs --changed origin\/master`/m)
  })
})
