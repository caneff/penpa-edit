// The PreToolUse hook that keeps implement-lane workers off `live/recordings/**` (#33,
// `.claude/hooks/deny-recording-writes.mjs`), spawned with the JSON Claude Code sends it.
import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { describe, it } from 'node:test'
import { fileURLToPath } from 'node:url'

const HOOK = fileURLToPath(new URL('../.claude/hooks/deny-recording-writes.mjs', import.meta.url))
const WORKER = '/home/u/src/penpa-edit/.claude/worktrees/implement-40'
const PRIMARY = '/home/u/src/penpa-edit'

// 'deny' or 'allow', read off the hook's output as Claude Code reads it.
function decide (tool_name, tool_input, { project = WORKER, cwd = project } = {}) {
  const { status, stdout, stderr } = spawnSync('node', [HOOK], {
    input: JSON.stringify({ hook_event_name: 'PreToolUse', cwd, tool_name, tool_input }),
    env: { ...process.env, CLAUDE_PROJECT_DIR: project },
    encoding: 'utf8'
  })
  assert.equal(status, 0, stderr)
  if (!stdout.trim()) return 'allow'
  const { hookSpecificOutput: out } = JSON.parse(stdout)
  assert.equal(out.hookEventName, 'PreToolUse')
  return out.permissionDecision
}

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

  for (const command of [
    'npm run recordings:approve -- genre/box',
    'node live/approve-recordings.mjs genre/box',
    'cd live && node approve-recordings.mjs genre/box',
    'echo {} > live/recordings/genre/box.expected.json',
    'cat a.json >> live/recordings/genre/box.expected.json',
    'jq . x | tee live/recordings/genre/box.expected.json',
    "sed -i 's/1/2/' live/recordings/genre/box.expected.json",
    'cp /tmp/x.json live/recordings/genre/box.expected.json',
    'rm live/recordings/genre/box.expected.json',
    'git checkout HEAD~1 -- live/recordings/genre/box.expected.json'
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
    'git commit -m "docs: the controller runs npm run recordings:approve -- <id>"'
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
