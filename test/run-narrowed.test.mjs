// The narrowed seam command (`live/run-narrowed.mjs`, #316): the unit tests, then the live files CI would run for the
// same change. `--list` names what it would run.
import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { chmodSync, existsSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, it } from 'node:test'
import { fileURLToPath } from 'node:url'
import { ENGINE, ENV, PINS, scratchRepo, tree, UI } from './live-scratch.mjs'

const ROOT = fileURLToPath(new URL('..', import.meta.url))
const RUN = join(ROOT, 'live/run-narrowed.mjs')
const run = (dir, args, env = ENV) => spawnSync(process.execPath, [RUN, ...args], { cwd: dir, env, encoding: 'utf8' })
const listed = (dir, ...args) => {
  const out = run(dir, ['--list', ...args])
  assert.equal(out.status, 0, out.stderr)
  return { suites: out.stdout.split('\n').filter(Boolean), said: out.stderr }
}

describe('node live/run-narrowed.mjs --list', () => {
  it('names the unit tests and the live files CI would run for a change under docs/ui/', () => {
    const { dir } = scratchRepo()
    writeFileSync(join(dir, 'docs/ui/pins.js'), '// two\n')
    const { suites, said } = listed(dir, '--changed', 'master')
    assert.deepEqual(suites, ['npm test', PINS])
    assert.match(said, /all on the skip list/)
  })

  it('adds the engine side for an edit to a script the page loads', () => {
    const { dir } = scratchRepo()
    writeFileSync(join(dir, 'docs/js/class_p.js'), '// two\n')
    assert.deepEqual(listed(dir, '--changed', 'master').suites, ['npm test', ENGINE, PINS, UI])
  })

  it('runs the full set with no --changed, and says so', () => {
    const { suites, said } = listed(scratchRepo().dir)
    assert.deepEqual(suites, ['npm test', ENGINE, PINS, UI])
    assert.match(said, /the full set/)
  })

  it('runs the full set when the ref cannot be read, and says why', () => {
    const { dir } = scratchRepo()
    writeFileSync(join(dir, 'docs/ui/pins.js'), '// two\n')
    const { suites, said } = listed(dir, '--changed', 'no-such-ref')
    assert.deepEqual(suites, ['npm test', ENGINE, PINS, UI])
    assert.match(said, /change detection failed .*: the full set/)
  })

  it('fails, rather than listing the unit tests alone, when the live files cannot be listed', () => {
    const { dir } = scratchRepo()
    rmSync(join(dir, 'live'), { recursive: true })
    const out = run(dir, ['--list'])
    assert.notEqual(out.status, 0)
    assert.equal(out.stdout, '')
    assert.match(out.stderr, /listing the live files/)
  })
})

// A scratch repo whose live files record that they ran, and a fake `npm` first on the PATH that records its arguments
// and exits with $FAKE_NPM_STATUS.
function runnableRepo () {
  const { dir, git } = scratchRepo()
  for (const file of [ENGINE, UI, PINS]) writeFileSync(join(dir, file), `import { appendFileSync } from 'node:fs'\nappendFileSync(process.env.RAN_LOG, '${file}\\n')\n`)
  git('add', '-A')
  git('commit', '-q', '-m', 'live files that record a run')
  const bin = tree({ 'npm': '#!/bin/sh\necho "$@" >> "$FAKE_NPM_LOG"\nexit "${FAKE_NPM_STATUS:-0}"\n' })
  chmodSync(join(bin, 'npm'), 0o755)
  // The logs sit outside the repo: an untracked file in it would count as a changed file.
  const env = { ...ENV, PATH: `${bin}:${ENV.PATH}`, FAKE_NPM_LOG: join(bin, 'npm.log'), RAN_LOG: join(bin, 'ran.log') }
  return { dir, env, ran: () => (existsSync(env.RAN_LOG) ? readFileSync(env.RAN_LOG, 'utf8').split('\n').filter(Boolean) : []) }
}

describe('node live/run-narrowed.mjs', () => {
  it('runs the unit tests, then only the live files for the change', () => {
    const { dir, env, ran } = runnableRepo()
    writeFileSync(join(dir, 'docs/ui/pins.js'), '// two\n')
    const out = run(dir, ['--changed', 'master'], env)
    assert.equal(out.status, 0, out.stdout + out.stderr)
    assert.equal(readFileSync(env.FAKE_NPM_LOG, 'utf8').trim(), 'test')
    assert.deepEqual(ran(), [PINS])
  })

  it('runs every live file with no --changed', () => {
    const { dir, env, ran } = runnableRepo()
    assert.equal(run(dir, [], env).status, 0)
    assert.deepEqual(ran().sort(), [ENGINE, PINS, UI])
  })

  it('runs no live file, and fails, when the unit tests fail', () => {
    const { dir, env, ran } = runnableRepo()
    const out = run(dir, [], { ...env, FAKE_NPM_STATUS: '3' })
    assert.equal(out.status, 3)
    assert.deepEqual(ran(), [])
  })

  it('says so, and fails, when npm cannot be started', () => {
    const { dir } = runnableRepo()
    const out = run(dir, [], { ...ENV, PATH: '/nonexistent' })
    assert.notEqual(out.status, 0)
    assert.match(out.stderr, /npm test: .*ENOENT/)
  })
})

describe('AGENTS.md', () => {
  it('names the narrowed command on a Narrowed line', () => {
    const text = readFileSync(join(ROOT, 'AGENTS.md'), 'utf8')
    assert.match(text, /^- \*\*Narrowed\*\*: `node live\/run-narrowed\.mjs --changed origin\/master`/m)
  })
})
