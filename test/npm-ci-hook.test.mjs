// The PreToolUse hook that refuses `npm ci` while `node_modules` is a symlink (#240, `.claude/hooks/deny-npm-ci-symlink.mjs`),
// spawned with the JSON Claude Code sends it on real scratch directories, and its registration in `.claude/settings.json`.
// Why: workers link the primary checkout's `node_modules`, and `npm ci` through the link empties the primary's.
import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { mkdirSync, mkdtempSync, readFileSync, rmSync, symlinkSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { after, describe, it } from 'node:test'
import { fileURLToPath } from 'node:url'

const HOOK_PATH = '.claude/hooks/deny-npm-ci-symlink.mjs'
const HOOK = fileURLToPath(new URL(`../${HOOK_PATH}`, import.meta.url))
const ROOT = mkdtempSync(join(tmpdir(), 'npm-ci-hook-'))
after(() => rmSync(ROOT, { recursive: true, force: true }))

// Three directories: `linked` holds a symlinked node_modules, `real` a real one, `bare` none.
const real = join(ROOT, 'real')
const linked = join(ROOT, 'linked')
const bare = join(ROOT, 'bare')
mkdirSync(join(real, 'node_modules'), { recursive: true })
mkdirSync(join(ROOT, 'primary/node_modules'), { recursive: true })
mkdirSync(linked)
symlinkSync(join(ROOT, 'primary/node_modules'), join(linked, 'node_modules'))
mkdirSync(bare)

// 'deny' or 'allow', read off the hook's output as Claude Code reads it; `stdin` replaces the call's JSON.
function decide (command, cwd, { stdin } = {}) {
  const { status, stdout, stderr } = spawnSync('node', [HOOK], {
    input: stdin ?? JSON.stringify({ hook_event_name: 'PreToolUse', cwd, tool_name: 'Bash', tool_input: { command } }),
    encoding: 'utf8'
  })
  assert.equal(status, 0, stderr)
  if (!stdout.trim()) return { decision: 'allow' }
  const { hookSpecificOutput: out } = JSON.parse(stdout)
  assert.equal(out.hookEventName, 'PreToolUse')
  return { decision: out.permissionDecision, reason: out.permissionDecisionReason }
}

describe('the npm ci hook', () => {
  for (const command of ['npm ci', 'npm clean-install', 'npm ic', 'FOO=1 npm ci', 'npx npm ci', 'npm ci --ignore-scripts', 'echo hi && npm ci']) {
    it(`denies in a directory whose node_modules is a symlink: ${command}`, () => {
      assert.equal(decide(command, linked).decision, 'deny')
    })
  }

  it('tells the agent to remove the link only, never with -r', () => {
    assert.match(decide('npm ci', linked).reason, /rm node_modules/)
    assert.match(decide('npm ci', linked).reason, /never rm -r/)
  })

  it('follows cd to the directory the npm runs in', () => {
    assert.equal(decide(`cd ${linked} && npm ci`, bare).decision, 'deny')
    assert.equal(decide(`cd ${bare} && npm ci`, linked).decision, 'allow')
  })

  it('reads --prefix as the directory the npm runs in', () => {
    assert.equal(decide(`npm ci --prefix ${linked}`, bare).decision, 'deny')
  })

  for (const [command, cwd] of [
    ['npm ci', real],
    ['npm ci', bare],
    ['npm install', linked],
    ['npm run test', linked],
    ['git commit -m "docs: run npm ci"', linked],
    ['ls node_modules', linked]
  ]) {
    it(`allows: ${command} in ${cwd === linked ? 'a symlinked' : 'a real or missing'} node_modules`, () => {
      assert.equal(decide(command, cwd).decision, 'allow')
    })
  }

  it('denies a call it cannot read, rather than letting it through', () => {
    assert.equal(decide(null, null, { stdin: 'not json' }).decision, 'deny')
  })
})

describe('.claude/settings.json', () => {
  it('runs the hook before Bash', () => {
    const { hooks } = JSON.parse(readFileSync(new URL('../.claude/settings.json', import.meta.url), 'utf8'))
    const entry = hooks.PreToolUse.find(({ hooks: h }) => h.some(({ command }) => command.includes(HOOK_PATH)))
    assert.ok(entry, `no PreToolUse entry runs ${HOOK_PATH}`)
    assert.equal(new RegExp(`^(${entry.matcher})$`).test('Bash'), true)
  })
})
