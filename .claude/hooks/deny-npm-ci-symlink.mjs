// PreToolUse hook (#240): `npm ci` is allowed without a prompt (#239), but a worker's `node_modules` is a symlink to the
// primary checkout's, and `npm ci` through the link removes it and empties the primary's, which every worktree shares.
// So a Bash call that runs `npm ci` in a directory whose `node_modules` is a symlink is denied. The directory is the
// cwd, followed through `cd`, or the `--prefix` value. Other forms of the same wipe (a script that runs npm itself) are not seen.
import { lstatSync, readFileSync } from 'node:fs'
import { resolve } from 'node:path'

const REASON = '`npm ci` through a symlinked node_modules empties the primary checkout\'s node_modules, which every ' +
  'worktree shares. Run `rm node_modules` first (the link only, never rm -r), then npm ci.'
// npm's spellings of `ci`.
const CI = new Set(['ci', 'clean-install', 'ic', 'install-clean', 'isntall-clean'])
// Words that run the command after them.
const PREFIXES = new Set(['env', 'npx', 'command', 'exec'])

const unquote = (word) => word.replace(/^(['"])(.*)\1$/, '$2')

function commandWords (segment) {
  const words = segment.trim().split(/\s+/).filter(Boolean).map(unquote)
  while (words.length && (PREFIXES.has(words[0]) || /^\w+=/.test(words[0]))) words.shift()
  return words
}

function isSymlink (path) {
  try {
    return lstatSync(path).isSymbolicLink()
  } catch {
    return false // no node_modules there: nothing to wipe
  }
}

function wipesLink (startCwd, command) {
  let cwd = startCwd
  return command.split(/&&|\|\||[;|\n]/).some((segment) => {
    const [name, sub, ...args] = commandWords(segment)
    if (name === 'cd' && sub) {
      cwd = resolve(cwd, sub)
      return false
    }
    if (name !== 'npm' || !CI.has(sub)) return false
    const at = args.indexOf('--prefix')
    const prefix = at >= 0 ? args[at + 1] : args.find((a) => a.startsWith('--prefix='))?.slice('--prefix='.length)
    return isSymlink(resolve(cwd, prefix ?? '.', 'node_modules'))
  })
}

function denied (raw) {
  let input
  try {
    input = JSON.parse(raw)
  } catch {
    return true // a call this hook cannot read is denied, not let through
  }
  const { cwd = process.env.CLAUDE_PROJECT_DIR, tool_name: tool, tool_input: args = {} } = input ?? {}
  return tool === 'Bash' && wipesLink(cwd, args?.command ?? '')
}

if (denied(readFileSync(0, 'utf8'))) {
  process.stdout.write(JSON.stringify({
    hookSpecificOutput: { hookEventName: 'PreToolUse', permissionDecision: 'deny', permissionDecisionReason: REASON }
  }))
}
