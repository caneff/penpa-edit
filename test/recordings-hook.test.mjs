// The PreToolUse hook that keeps implement-lane workers off `live/recordings/**` (#33,
// `.claude/hooks/deny-recording-writes.mjs`), spawned with the JSON Claude Code sends it, and its registration in
// `.claude/settings.json`, whose `permissions` block (the one `npm ci` allow rule, #239) is checked here too.
import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { readFileSync } from 'node:fs'
import { describe, it } from 'node:test'
import { fileURLToPath } from 'node:url'

const HOOK_PATH = '.claude/hooks/deny-recording-writes.mjs'
const HOOK = fileURLToPath(new URL(`../${HOOK_PATH}`, import.meta.url))
const WORKER = '/home/u/src/penpa-edit/.claude/worktrees/implement-40'
const PRIMARY = '/home/u/src/penpa-edit'

// 'deny' or 'allow', read off the hook's output as Claude Code reads it; `stdin` replaces the call's JSON.
function decide (tool_name, tool_input, { project = WORKER, cwd = project, stdin } = {}) {
  const { status, stdout, stderr } = spawnSync('node', [HOOK], {
    input: stdin ?? JSON.stringify({ hook_event_name: 'PreToolUse', cwd, tool_name, tool_input }),
    env: { ...process.env, CLAUDE_PROJECT_DIR: project },
    encoding: 'utf8'
  })
  assert.equal(status, 0, stderr)
  if (!stdout.trim()) return 'allow'
  const { hookSpecificOutput: out } = JSON.parse(stdout)
  assert.equal(out.hookEventName, 'PreToolUse')
  return out.permissionDecision
}

const SETTINGS = JSON.parse(readFileSync(new URL('../.claude/settings.json', import.meta.url), 'utf8'))

const EXPECTED = `${WORKER}/live/recordings/genre/box.expected.json`

describe('the recordings hook in a worker session', () => {
  for (const tool of ['Write', 'Edit', 'MultiEdit']) {
    it(`denies ${tool} on a file under live/recordings/`, () => {
      assert.equal(decide(tool, { file_path: EXPECTED }), 'deny')
    })
  }

  it('denies a relative path under live/recordings/, read against the cwd', () => {
    assert.equal(decide('Write', { file_path: 'recordings/genre/box.steps.json' }, { cwd: `${WORKER}/live` }), 'deny')
  })

  it('allows a write anywhere else', () => {
    assert.equal(decide('Edit', { file_path: `${WORKER}/live/replay.mjs` }), 'allow')
  })

  it('denies a call it cannot read, rather than letting it through', () => {
    assert.equal(decide(null, null, { stdin: 'not json' }), 'deny')
  })

  it('allows a call with no tool input', () => {
    assert.equal(decide('Write', undefined), 'allow')
  })

  for (const command of [
    'npm run recordings:approve -- genre/box',
    'node live/approve-recordings.mjs genre/box',
    'cd live && node approve-recordings.mjs genre/box',
    'FOO=1 npm run recordings:approve -- genre/box',
    'env X=1 npm run recordings:approve -- genre/box',
    'npx npm run recordings:approve -- genre/box',
    'echo {} > live/recordings/genre/box.expected.json',
    'echo {} > "live/recordings/genre/box.expected.json"',
    'cat a.json >> live/recordings/genre/box.expected.json',
    'jq . x | tee live/recordings/genre/box.expected.json',
    "sed -i 's/1/2/' live/recordings/genre/box.expected.json",
    'cp /tmp/x.json live/recordings/genre/box.expected.json',
    'cd live/recordings && cp /tmp/x.json genre/box.expected.json',
    'cd live/recordings/genre && echo {} > box.expected.json',
    'rm live/recordings/genre/box.expected.json',
    'rm -r live',
    'git checkout HEAD~1 -- live/recordings/genre/box.expected.json',
    'git checkout origin/master -- live',
    'git restore --source=HEAD~1 live/'
  ]) {
    it(`denies Bash: ${command}`, () => {
      assert.equal(decide('Bash', { command }), 'deny')
    })
  }

  for (const command of [
    'node live/generate-recordings.mjs',
    'npm run test:live',
    'cat live/recordings/genre/box.expected.json 2>/dev/null | head',
    'git diff -- live/recordings/ > .scratch/recordings.diff',
    'git add live/recordings/genre/new.steps.json',
    'git commit -m "docs: the controller runs npm run recordings:approve -- <id>"',
    'cp /tmp/x.mjs live/'
  ]) {
    it(`allows Bash: ${command}`, () => {
      assert.equal(decide('Bash', { command }), 'allow')
    })
  }
})

describe('the recordings hook outside a worker session', () => {
  it('allows the controller in the primary checkout to approve and write', () => {
    assert.equal(decide('Bash', { command: 'npm run recordings:approve -- genre/box' }, { project: PRIMARY }), 'allow')
    assert.equal(decide('Write', { file_path: `${PRIMARY}/live/recordings/genre/box.expected.json` }, { project: PRIMARY }), 'allow')
  })
})

describe('.claude/settings.json', () => {
  it('runs the hook before every file-writing tool and Bash', () => {
    const { hooks } = SETTINGS
    const entry = hooks.PreToolUse.find(({ hooks: h }) => h.some(({ command }) => command.includes(HOOK_PATH)))
    assert.ok(entry, `no PreToolUse entry runs ${HOOK_PATH}`)
    const matcher = new RegExp(`^(${entry.matcher})$`)
    for (const tool of ['Write', 'Edit', 'MultiEdit', 'NotebookEdit', 'Bash']) assert.equal(matcher.test(tool), true, tool)
  })

  // Chris, 2026-11-17 (#239): `npm ci` in a worker worktree must not prompt. The docs' rule syntax: a Bash rule with no `*`
  // matches one exact command, so `npm ci --foo` and `npm install` still prompt (https://code.claude.com/docs/en/permissions).
  it('has one permissions entry: the allow rule `Bash(npm ci)`', () => {
    assert.deepEqual(SETTINGS.permissions, { allow: ['Bash(npm ci)'] })
  })
})
