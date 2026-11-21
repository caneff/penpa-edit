// Scratch git repos for the tests of the live runners (`test/run-live.test.mjs`, `test/run-narrowed.test.mjs`).
// Every directory made here is removed when the test process exits.
import { execFileSync } from 'node:child_process'
import { cpSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

export const ENGINE = 'live/engine-replay-0.live.mjs'
export const UI = 'live/ui-replay-0.live.mjs'
export const PINS = 'live/pins.live.mjs'

// The environment for a child that runs `node --test`, without NODE_TEST_CONTEXT, which makes a child runner report to
// this one instead.
export const { NODE_TEST_CONTEXT, ...ENV } = process.env

const made = []
process.on('exit', () => made.forEach((dir) => rmSync(dir, { recursive: true, force: true })))

// Writes `files` (path: text) under a fresh directory and returns it.
export function tree (files) {
  const dir = mkdtempSync(join(tmpdir(), 'live-scratch-'))
  made.push(dir)
  for (const [path, text] of Object.entries(files)) {
    mkdirSync(join(dir, dirname(path)), { recursive: true })
    writeFileSync(join(dir, path), text)
  }
  return dir
}

// A scratch repo holding the real package.json, one engine-side file, one UI-driver replay, one solve-UI file, a page
// naming one script and a file it does not have yet, and the solve UI's source.
export function scratchRepo () {
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
