// PreToolUse hook (#33): an implement-lane worker cannot write `live/recordings/**`, so a worker whose replay goes red can
// only change code or stop and report; the controller, or Chris, runs `npm run recordings:approve` after reading the
// diff. A worker is a session whose project is a workspace under `.claude/worktrees/`. Bash is read for the common
// write forms aimed at `live/recordings/` (a redirection, `tee`, `cp`, `rm`, `sed -i`, a `git checkout` or `git restore`
// of it or a directory above it), following `cd`, and for a run of the approve command; anything subtler, such as a
// script that writes the files itself, is not seen, and CI's expected-file gate still fails the change. The generator
// and the test runs, which write recordings as their job, are allowed. A worker's call the hook cannot read is denied.
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

const REASON = 'Implement-lane workers cannot write live/recordings/** (#33). Change code, or stop and report the red ' +
  'replay to your controller; the controller or Chris runs npm run recordings:approve for the ids the ticket lists.'
const WRITERS = new Set(['cp', 'mv', 'rm', 'touch', 'truncate', 'ln', 'install', 'rsync', 'tee'])
const GIT_WRITERS = new Set(['checkout', 'restore', 'rm', 'mv'])
// Words that run the command after them.
const PREFIXES = new Set(['env', 'npx', 'command', 'exec'])

const unquote = (word) => word.replace(/^(['"])(.*)\1$/, '$2')

// Whether `path` is under `live/recordings/`, or, when `above` is set, a directory that holds it.
function touches (cwd, recordings, path, above = false) {
  const at = resolve(cwd, path)
  return `${at}/`.includes('/live/recordings/') || (above && `${recordings}/`.startsWith(`${at}/`))
}

// The command a segment runs, with the variable assignments and prefixes before it dropped.
function commandWords (segment) {
  const words = segment.trim().split(/\s+/).filter(Boolean).map(unquote)
  while (words.length && (PREFIXES.has(words[0]) || /^\w+=/.test(words[0]))) words.shift()
  return words
}

function runsApprove ([name, ...args]) {
  if (name === 'npm') return ['run', 'run-script'].includes(args[0]) && args[1] === 'recordings:approve'
  return name === 'node' && args.some((a) => a.endsWith('approve-recordings.mjs'))
}

function bashWrites (startCwd, recordings, command) {
  let cwd = startCwd
  return command.split(/&&|\|\||[;|\n]/).some((segment) => {
    const words = commandWords(segment)
    if (words[0] === 'cd' && words[1]) {
      cwd = resolve(cwd, words[1])
      return false
    }
    if (runsApprove(words)) return true
    for (const [, target] of segment.matchAll(/(?:^|[^0-9&>])>>?\s*("[^"]*"|'[^']*'|[^\s;&|]+)/g)) {
      if (touches(cwd, recordings, unquote(target))) return true
    }
    const [name, ...args] = words
    const git = name === 'git' && GIT_WRITERS.has(args[0])
    const writes = WRITERS.has(name) || git || (['sed', 'perl'].includes(name) && args.some((a) => /^-[a-zA-Z]*i/.test(a)))
    const paths = args.filter((a) => !a.startsWith('-'))
    return writes && paths.some((a) => touches(cwd, recordings, a, git || name === 'rm'))
  })
}

function denied (raw) {
  const worker = (process.env.CLAUDE_PROJECT_DIR ?? '').includes('/.claude/worktrees/')
  if (!worker) return false
  let input
  try {
    input = JSON.parse(raw)
  } catch {
    return true // a worker's call this hook cannot read is denied, not let through
  }
  const { cwd = process.env.CLAUDE_PROJECT_DIR, tool_name: tool, tool_input: args = {} } = input ?? {}
  const recordings = resolve(process.env.CLAUDE_PROJECT_DIR, 'live/recordings')
  if (tool === 'Bash') return bashWrites(cwd, recordings, args?.command ?? '')
  const path = args?.file_path ?? args?.notebook_path
  return path !== undefined && touches(cwd, recordings, path)
}

if (denied(readFileSync(0, 'utf8'))) {
  process.stdout.write(JSON.stringify({
    hookSpecificOutput: { hookEventName: 'PreToolUse', permissionDecision: 'deny', permissionDecisionReason: REASON }
  }))
}
