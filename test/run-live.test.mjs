// The live run's selection (`live/run-live.mjs`, #268): a change made only of skip-list paths runs every live file but
// the safety net's, any other change runs them all, and the parts CI spreads them over hold each file once.
import assert from 'node:assert/strict'
import { execFileSync, spawnSync } from 'node:child_process'
import { cpSync, mkdirSync, mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { describe, it } from 'node:test'
import { fileURLToPath } from 'node:url'
import { chooseLiveFiles, partOf, SAFETY_NET_FILES } from '../live/run-live.mjs'

const SOLVE_UI_FILES = ['live/pins.live.mjs', 'live/mouse-card.live.mjs', 'live/desk.live.mjs']
const ALL = [...SAFETY_NET_FILES, ...SOLVE_UI_FILES].sort()

describe('chooseLiveFiles', () => {
  it('runs every live file but the safety net when each changed file is on the skip list', () => {
    const changed = ['docs/ui/pins.js', 'docs/ui/desk.css', 'research/notes.md', 'adr/0001-x.md', 'docs/agents.md',
      'GLOSSARY.md', 'live/pins.live.mjs']
    const { full, files, reason } = chooseLiveFiles(changed, ALL)
    assert.equal(full, false)
    assert.deepEqual(files, [...SOLVE_UI_FILES].sort())
    assert.match(reason, /7 changed files are all on the skip list/)
  })

  it('runs the full set when a change mixes skip-list paths with one off it, and names that path', () => {
    const { full, files, reason } = chooseLiveFiles(['docs/ui/pins.js', 'docs/js/class_p.js'], ALL)
    assert.equal(full, true)
    assert.deepEqual(files, ALL)
    assert.match(reason, /docs\/js\/class_p\.js is off the skip list/)
  })

  for (const path of ['docs/js/class_p.js', 'docs/solve.html', 'live/recordings/value/a.json', 'live/replay.mjs',
    'live/fuzz.mjs', 'live/tier-c.mjs', 'live/plants.mjs', 'live/canonical-state.mjs', 'live/page.mjs',
    'live/engine-replay-0.live.mjs', 'live/fuzz.live.mjs', 'package.json', 'package-lock.json',
    '.github/workflows/ci.yml', 'test/run-live.test.mjs']) {
    it(`runs the full set for a change to ${path}`, () => {
      const { full, files } = chooseLiveFiles([path], ALL)
      assert.equal(full, true)
      assert.deepEqual(files, ALL)
    })
  }

  it('runs the full set for an empty change', () => {
    const { full, files, reason } = chooseLiveFiles([], ALL)
    assert.equal(full, true)
    assert.deepEqual(files, ALL)
    assert.match(reason, /no changed file/)
  })
})

describe('partOf', () => {
  it('puts each file in exactly one of the parts, the engine replays in different parts', () => {
    const parts = [1, 2, 3, 4].map((k) => partOf(ALL, k, 4))
    assert.deepEqual(parts.flat().sort(), ALL)
    const engineParts = ['live/engine-replay-0.live.mjs', 'live/engine-replay-1.live.mjs', 'live/engine-replay-2.live.mjs']
      .map((file) => parts.findIndex((part) => part.includes(file)))
    assert.equal(new Set(engineParts).size, 3)
  })

  it('leaves a part empty when there are fewer files than parts', () => {
    assert.deepEqual(partOf(['live/a.live.mjs'], 2, 2), [])
  })
})

// A scratch repo holding the real package.json, one safety-net file, one solve-UI file and two pages' worth of source.
function scratchRepo () {
  const dir = mkdtempSync(join(tmpdir(), 'run-live-'))
  const git = (...args) => execFileSync('git', args, { cwd: dir, encoding: 'utf8' })
  git('init', '-q', '-b', 'master')
  git('config', 'user.name', 'test')
  git('config', 'user.email', 'test@example.com')
  cpSync(fileURLToPath(new URL('../package.json', import.meta.url)), join(dir, 'package.json'))
  for (const file of ['live/engine-replay-0.live.mjs', 'live/pins.live.mjs', 'docs/ui/pins.js', 'docs/js/class_p.js']) {
    mkdirSync(join(dir, dirname(file)), { recursive: true })
    writeFileSync(join(dir, file), '// one\n')
  }
  git('add', '-A')
  git('commit', '-q', '-m', 'base')
  return { dir, git }
}

const RUN_LIVE = fileURLToPath(new URL('../live/run-live.mjs', import.meta.url))
const list = (dir, ...args) => {
  const out = spawnSync(process.execPath, [RUN_LIVE, '--list', ...args], { cwd: dir, encoding: 'utf8' })
  assert.equal(out.status, 0, out.stderr)
  return { files: out.stdout.split('\n').filter(Boolean), said: out.stderr }
}

describe('node live/run-live.mjs', () => {
  it('runs every live file but the safety net for an edit under docs/ui/, and says why', () => {
    const { dir } = scratchRepo()
    writeFileSync(join(dir, 'docs/ui/pins.js'), '// two\n')
    const { files, said } = list(dir, '--base', 'master')
    assert.deepEqual(files, ['live/pins.live.mjs'])
    assert.match(said, /all on the skip list/)
  })

  it('counts an untracked file as changed', () => {
    const { dir } = scratchRepo()
    writeFileSync(join(dir, 'docs/js/new.js'), '// new\n')
    const { files, said } = list(dir, '--base', 'master')
    assert.deepEqual(files, ['live/engine-replay-0.live.mjs', 'live/pins.live.mjs'])
    assert.match(said, /docs\/js\/new\.js is off the skip list/)
  })

  it('counts a file moved from docs/js/ to docs/ui/ as a change off the skip list', () => {
    const { dir, git } = scratchRepo()
    git('mv', 'docs/js/class_p.js', 'docs/ui/class_p.js')
    git('commit', '-q', '-m', 'move')
    assert.match(list(dir, '--base', 'master~1').said, /docs\/js\/class_p\.js is off the skip list/)
  })

  it('runs the full set with no --base, and names it', () => {
    const { dir } = scratchRepo()
    const { files, said } = list(dir)
    assert.deepEqual(files, ['live/engine-replay-0.live.mjs', 'live/pins.live.mjs'])
    assert.match(said, /no --base/)
  })

  it('fails, running nothing, when the base cannot be read', () => {
    const { dir } = scratchRepo()
    const out = spawnSync(process.execPath, [RUN_LIVE, '--list', '--base', 'no-such-ref'], { cwd: dir, encoding: 'utf8' })
    assert.notEqual(out.status, 0)
    assert.equal(out.stdout, '')
  })

  it('lists only its own part with --part', () => {
    const { dir } = scratchRepo()
    assert.deepEqual(list(dir, '--part', '2/2').files, ['live/pins.live.mjs'])
  })
})
