// The live run's selection (`live/run-live.mjs`, #268, #315): a change to an input of the engine side runs every live
// file, any other change off the skip list every one but the engine side's, a change made only of skip-list paths every
// one but the safety net's, and the parts CI spreads them over hold each file once.
import assert from 'node:assert/strict'
import { execFileSync, spawnSync } from 'node:child_process'
import { cpSync, mkdirSync, mkdtempSync, rmSync, symlinkSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { describe, it } from 'node:test'
import { fileURLToPath } from 'node:url'
import { chooseLiveFiles, ENGINE_FILES, engineInputs, pageReach, partOf, SAFETY_NET_FILES } from '../live/run-live.mjs'

const SOLVE_UI_FILES = ['live/pins.live.mjs', 'live/mouse-card.live.mjs', 'live/desk.live.mjs']
const ALL = [...SAFETY_NET_FILES, ...SOLVE_UI_FILES].sort()

// The engine side's inputs as this checkout derives them, so each case below checks the real derivation.
const INPUTS = engineInputs(fileURLToPath(new URL('..', import.meta.url)), SAFETY_NET_FILES)
const BUT_ENGINE = ALL.filter((file) => !ENGINE_FILES.includes(file))

describe('chooseLiveFiles', () => {
  it('runs every live file but the safety net when each changed file is on the skip list', () => {
    const changed = ['docs/ui/pins.js', 'docs/ui/desk.css', 'research/notes.md', 'adr/0001-x.md', 'docs/agents.md',
      'GLOSSARY.md', 'live/pins.live.mjs']
    const { files, reason } = chooseLiveFiles(changed, ALL, INPUTS)
    assert.deepEqual(files, [...SOLVE_UI_FILES].sort())
    assert.match(reason, /7 changed files are all on the skip list/)
  })

  it('runs the full set when a change mixes skip-list paths with an input of the engine side, and names that input', () => {
    const { files, reason } = chooseLiveFiles(['docs/ui/pins.js', 'docs/js/class_p.js'], ALL, INPUTS)
    assert.deepEqual(files, ALL)
    assert.match(reason, /docs\/js\/class_p\.js is an input of the engine side/)
  })

  // What index.html loads, directly or through its scripts and sheets, and what the engine side's tests import or read.
  for (const path of ['docs/index.html', 'docs/js/class_p.js', 'docs/js/progress_autosave.js', 'docs/js/libs/gif.worker.js',
    'docs/css/base-structure.css', 'docs/css/dark_theme.css', 'docs/css/images/corners.png', 'docs/js/images/new_year.jpg',
    'docs/fonts/fontawesome-webfont.woff2', 'docs/identity.js', 'live/recordings/value/a.json', 'live/replay.mjs',
    'live/fuzz.mjs', 'live/tier-c.mjs', 'live/tier-c-puzzles.mjs', 'live/plants.mjs', 'live/canonical-state.mjs',
    'live/page.mjs', 'live/settle.mjs', 'live/engine-replay-0.live.mjs', 'live/fuzz.live.mjs', 'live/run-live.mjs',
    'package.json', 'package-lock.json', '.github/workflows/ci.yml', '.github/actions/setup-tests/action.yml']) {
    it(`runs the full set for a change to ${path}`, () => {
      assert.deepEqual(chooseLiveFiles([path], ALL, INPUTS).files, ALL)
    })
  }

  // Off the skip list but outside index.html's reach: the UI driver's replays still run (they replay on solve.html).
  for (const path of ['docs/solve.html', 'docs/js/engine_bridge.js', 'docs/js/penpa_layer.js', 'docs/gallery.js',
    'test/run-live.test.mjs', 'userscript/penpa-redirect.user.js', 'live/ui-replay-0.live.mjs',
    '.github/workflows/nightly.yml', '.github/scripts/file-issue-once.sh']) {
    it(`runs every live file but the engine side's for a change to ${path}, and says why`, () => {
      const { files, reason } = chooseLiveFiles([path], ALL, INPUTS)
      assert.deepEqual(files, BUT_ENGINE)
      assert.match(reason, /no changed file is an input of the engine side/)
    })
  }

  it('runs the full set for an empty change', () => {
    const { files, reason } = chooseLiveFiles([], ALL, INPUTS)
    assert.deepEqual(files, ALL)
    assert.match(reason, /no changed file/)
  })
})

// Writes `files` (path: text) under a fresh directory and returns it.
function tree (files) {
  const dir = mkdtempSync(join(tmpdir(), 'run-live-reach-'))
  for (const [path, text] of Object.entries(files)) {
    mkdirSync(join(dir, dirname(path)), { recursive: true })
    writeFileSync(join(dir, path), text)
  }
  return dir
}

describe('pageReach', () => {
  const PAGE = {
    'docs/index.html': '<link rel="icon" href="./css/images/logo.png"/>\n<script>let s = ["./css/base.css", "./js/main.js"]\n' +
      'for (const f of s) load(f + "?v=" + ver)</script>\n<a href="https://example.com/x.js">x</a>',
    'docs/css/base.css': '.a { background: url(images/corner.png) } .b { background: url("../fonts/f.woff2?v=4#x") }',
    'docs/css/images/logo.png': '',
    'docs/css/images/corner.png': '',
    'docs/fonts/f.woff2': '',
    'docs/js/main.js': "const w = new Worker('./js/libs/worker.js'); const theme = './css/dark.css'; const t = 'button'\n" +
      "popup({ background: 'url(js/images/solved.jpg)' })",
    'docs/js/images/solved.jpg': '',
    'docs/js/libs/worker.js': '',
    'docs/css/dark.css': '.c { background: url(images/dark.png) }',
    'docs/css/images/dark.png': '',
    'docs/js/engine_bridge.js': '',
    'docs/ui/pins.js': '',
    'docs/solve.html': '<script src="./js/engine_bridge.js"></script>'
  }

  it('holds the page, every file it names in its scripts, and every file a stylesheet or script it reaches names', () => {
    const reach = pageReach(tree(PAGE), 'docs/index.html')
    for (const path of ['docs/index.html', 'docs/css/images/logo.png', 'docs/css/base.css', 'docs/js/main.js',
      'docs/css/images/corner.png', 'docs/fonts/f.woff2', 'docs/js/libs/worker.js', 'docs/css/dark.css',
      'docs/css/images/dark.png', 'docs/js/images/solved.jpg']) {
      assert.ok(reach.has(path), `${path} is reached`)
    }
  })

  it('leaves out what the page never names: the solve page, its bridge, the solve UI', () => {
    const reach = pageReach(tree(PAGE), 'docs/index.html')
    for (const path of ['docs/solve.html', 'docs/js/engine_bridge.js', 'docs/ui/pins.js']) {
      assert.ok(!reach.has(path), `${path} is not reached`)
    }
  })

  // A pull request that deletes a file the page still loads changes no reached file that still exists.
  it('holds a file the page names that does not exist, so deleting a loaded file reaches the page', () => {
    const files = { ...PAGE }
    delete files['docs/js/main.js']
    assert.ok(pageReach(tree(files), 'docs/index.html').has('docs/js/main.js'))
  })

  it('fails when the page cannot be read', () => {
    assert.throws(() => pageReach(tree({}), 'docs/index.html'), /docs\/index\.html/)
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

// A scratch repo holding the real package.json, one engine-side file, one UI-driver replay, one solve-UI file, a page
// naming one script and a file it does not have yet, and the solve UI's source.
const ENGINE = 'live/engine-replay-0.live.mjs'
const UI = 'live/ui-replay-0.live.mjs'
const PINS = 'live/pins.live.mjs'
function scratchRepo () {
  const dir = tree({
    ...Object.fromEntries([ENGINE, UI, PINS, 'docs/ui/pins.js', 'docs/js/class_p.js', 'docs/js/engine_bridge.js']
      .map((file) => [file, '// one\n'])),
    'docs/index.html': '<script>load(["./js/class_p.js", "./js/new.js"])</script>\n'
  })
  const git = (...args) => execFileSync('git', args, { cwd: dir, encoding: 'utf8' })
  git('init', '-q', '-b', 'master')
  git('config', 'user.name', 'test')
  git('config', 'user.email', 'test@example.com')
  cpSync(fileURLToPath(new URL('../package.json', import.meta.url)), join(dir, 'package.json'))
  git('add', '-A')
  git('commit', '-q', '-m', 'base')
  return { dir, git }
}

const RUN_LIVE = fileURLToPath(new URL('../live/run-live.mjs', import.meta.url))
// Without NODE_TEST_CONTEXT, which makes a child runner report to this one instead.
const { NODE_TEST_CONTEXT, ...ENV } = process.env
const runLive = (dir, ...args) => spawnSync(process.execPath, [RUN_LIVE, ...args], { cwd: dir, env: ENV, encoding: 'utf8' })
const list = (dir, ...args) => {
  const out = runLive(dir, '--list', ...args)
  assert.equal(out.status, 0, out.stderr)
  return { files: out.stdout.split('\n').filter(Boolean), said: out.stderr }
}

describe('node live/run-live.mjs', () => {
  it('runs every live file but the safety net for an edit under docs/ui/, and says why', () => {
    const { dir } = scratchRepo()
    writeFileSync(join(dir, 'docs/ui/pins.js'), '// two\n')
    const { files, said } = list(dir, '--base', 'master')
    assert.deepEqual(files, [PINS])
    assert.match(said, /all on the skip list/)
  })

  it('runs the full set for an edit to a script the page loads, and names it', () => {
    const { dir } = scratchRepo()
    writeFileSync(join(dir, 'docs/js/class_p.js'), '// two\n')
    const { files, said } = list(dir, '--base', 'master')
    assert.deepEqual(files, [ENGINE, PINS, UI])
    assert.match(said, /docs\/js\/class_p\.js is an input of the engine side/)
  })

  it('runs every live file but the engine side\'s for an edit to a script the page does not load', () => {
    const { dir } = scratchRepo()
    writeFileSync(join(dir, 'docs/js/engine_bridge.js'), '// two\n')
    const { files, said } = list(dir, '--base', 'master')
    assert.deepEqual(files, [PINS, UI])
    assert.match(said, /docs\/js\/engine_bridge\.js is off the skip list and no changed file is an input/)
  })

  it('reads the page as the change leaves it: a script added to it reaches the engine side', () => {
    const { dir } = scratchRepo()
    writeFileSync(join(dir, 'docs/js/engine_bridge.js'), '// two\n')
    writeFileSync(join(dir, 'docs/index.html'), '<script>load(["./js/class_p.js", "./js/engine_bridge.js"])</script>\n')
    assert.match(list(dir, '--base', 'master').said, /is an input of the engine side: the full set/)
  })

  it('counts an untracked file as changed', () => {
    const { dir } = scratchRepo()
    writeFileSync(join(dir, 'docs/js/new.js'), '// new\n')
    const { files, said } = list(dir, '--base', 'master')
    assert.deepEqual(files, [ENGINE, PINS, UI])
    assert.match(said, /docs\/js\/new\.js is an input of the engine side/)
  })

  it('counts a file moved from docs/js/ to docs/ui/ as a change to its old path', () => {
    const { dir, git } = scratchRepo()
    git('mv', 'docs/js/class_p.js', 'docs/ui/class_p.js')
    git('commit', '-q', '-m', 'move')
    assert.match(list(dir, '--base', 'master~1').said, /docs\/js\/class_p\.js is an input of the engine side/)
  })

  it('runs the full set with no --base, and names it', () => {
    const { dir } = scratchRepo()
    const { files, said } = list(dir)
    assert.deepEqual(files, [ENGINE, PINS, UI])
    assert.match(said, /no --base/)
  })

  it('does not count a workspace\'s symlinked node_modules as changed', () => {
    const { dir } = scratchRepo()
    symlinkSync(tmpdir(), join(dir, 'node_modules'))
    writeFileSync(join(dir, 'docs/ui/pins.js'), '// two\n')
    assert.deepEqual(list(dir, '--base', 'master').files, [PINS])
  })

  it('runs the full set when the base cannot be read, and says why', () => {
    const { dir } = scratchRepo()
    const { files, said } = list(dir, '--base', 'no-such-ref')
    assert.deepEqual(files, [ENGINE, PINS, UI])
    assert.match(said, /change detection failed .*: the full set/)
  })

  it('runs the full set when the page cannot be read, and says why', () => {
    const { dir } = scratchRepo()
    rmSync(join(dir, 'docs/index.html'))
    writeFileSync(join(dir, 'docs/ui/pins.js'), '// two\n')
    const { files, said } = list(dir, '--base', 'master')
    assert.deepEqual(files, [ENGINE, PINS, UI])
    assert.match(said, /change detection failed .*docs\/index\.html.*: the full set/)
  })

  it('fails when no live file is found, rather than passing having run none', () => {
    const { dir } = scratchRepo()
    rmSync(join(dir, 'live'), { recursive: true })
    assert.notEqual(runLive(dir, '--list').status, 0)
  })

  for (const part of ['0/4', '5/4', '4']) {
    it(`fails on --part ${part}, rather than passing having run nothing`, () => {
      assert.notEqual(runLive(scratchRepo().dir, '--list', '--part', part).status, 0)
    })
  }

  // node --test given no file runs its default glob, which here holds a failing test.
  it('runs nothing for an empty part', () => {
    const { dir } = scratchRepo()
    mkdirSync(join(dir, 'test'))
    writeFileSync(join(dir, 'test/fails.test.mjs'), "import { it } from 'node:test'\nit('fails', () => { throw new Error('ran') })\n")
    const out = runLive(dir, '--part', '4/4')
    assert.equal(out.status, 0, out.stdout + out.stderr)
    assert.match(out.stderr, /part 4 of 4: 0 files/)
  })

  it('lists only its own part with --part', () => {
    const { dir } = scratchRepo()
    assert.deepEqual(list(dir, '--part', '3/3').files, [PINS])
  })
})
