// PreToolUse hook (#33): an implement-lane worker cannot write `live/recordings/**`, so a worker whose replay goes red can
// only change code or stop and report; the controller, or Chris, runs `npm run recordings:approve` after reading the
// diff. A worker is a session whose project is a workspace under `.claude/worktrees/`. Bash is read for the usual
// write forms (a redirection, `tee`, `cp`, `sed -i`, `git checkout` ...) aimed under `live/recordings/`, and for the
// approve command; a script that writes the files itself is not seen. The generator and the test runs, which write
// recordings as their job, are allowed.
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

const REASON = 'Implement-lane workers cannot write live/recordings/** (#33). Change code, or stop and report the red ' +
  'replay to your controller; the controller or Chris runs npm run recordings:approve for the ids the ticket lists.'
// A command that runs the approve command, not one that only mentions it (a commit message, a doc edit).
const APPROVE = /^(npm run(-script)? recordings:approve|node \S*approve-recordings\.mjs)(\s|$)/
const WRITERS = new Set(['cp', 'mv', 'rm', 'touch', 'truncate', 'ln', 'install', 'rsync', 'tee'])
const GIT_WRITERS = new Set(['checkout', 'restore', 'rm', 'mv'])

const underRecordings = (cwd, path) => `${resolve(cwd, path)}/`.includes('/live/recordings/')

function bashWrites (cwd, command) {
  return command.split(/&&|\|\||[;|\n]/).some((segment) => {
    if (APPROVE.test(segment.trim())) return true
    for (const [, target] of segment.matchAll(/(?:^|[^0-9&>])>>?\s*([^\s;&|]+)/g)) {
      if (underRecordings(cwd, target)) return true
    }
    const [name, ...args] = segment.trim().split(/\s+/)
    const writes = WRITERS.has(name) ||
      (['sed', 'perl'].includes(name) && args.some((a) => /^-[a-zA-Z]*i/.test(a))) ||
      (name === 'git' && GIT_WRITERS.has(args[0]))
    return writes && args.some((a) => underRecordings(cwd, a.replace(/^['"]|['"]$/g, '')))
  })
}

const input = JSON.parse(readFileSync(0, 'utf8'))
const worker = (process.env.CLAUDE_PROJECT_DIR ?? '').includes('/.claude/worktrees/')
const { cwd, tool_name: tool, tool_input: args } = input
const path = args.file_path ?? args.notebook_path
const denied = worker && (tool === 'Bash' ? bashWrites(cwd, args.command ?? '') : path !== undefined && underRecordings(cwd, path))
if (denied) {
  process.stdout.write(JSON.stringify({
    hookSpecificOutput: { hookEventName: 'PreToolUse', permissionDecision: 'deny', permissionDecisionReason: REASON }
  }))
}
