// Runs the live files a change needs (#268). A change whose every file is on the skip list runs every live file but the
// safety net's; any other change, an empty one, and a run with no `--base` run the full set. CI and the seam both call
// this, and `npm run test:live` stays the full set. `--part <k>/<n>` runs the k-th of n parts, for CI's runners.
// Usage: node live/run-live.mjs [--base <ref>] [--part <k>/<n>] [--list]
//   --base <ref>  the change is the working tree, untracked files included, against its merge base with <ref>
//   --list        prints the chosen files instead of running them
import { execFileSync, spawnSync } from 'node:child_process'
import { globSync, readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { parseArgs } from 'node:util'

// The safety net's live files, heaviest first, so `partOf` spreads the slowest across the parts.
export const SAFETY_NET_FILES = [
  'live/engine-replay-0.live.mjs',
  'live/engine-replay-1.live.mjs',
  'live/engine-replay-2.live.mjs',
  'live/fuzz.live.mjs',
  'live/tier-c.live.mjs',
  'live/replay.live.mjs',
  'live/ui-replay-0.live.mjs',
  'live/ui-replay-1.live.mjs',
  'live/ui-replay-2.live.mjs',
  'live/ui-replay-3.live.mjs',
  'live/upstream-links.live.mjs',
  'live/safety-net.live.mjs'
]

// A live test file outside the safety net is on the skip list: no other file imports it, and the reduced set runs it.
const onSkipList = (path) =>
  path.startsWith('docs/ui/') || path.startsWith('research/') || path.startsWith('adr/') || path.endsWith('.md') ||
  (/^live\/[^/]+\.live\.mjs$/.test(path) && !SAFETY_NET_FILES.includes(path))

// `allFiles` is every live file; the result keeps its order.
export function chooseLiveFiles (changed, allFiles) {
  if (changed.length === 0) return { full: true, files: allFiles, reason: 'no changed file: the full set' }
  const off = changed.find((path) => !onSkipList(path))
  if (off) return { full: true, files: allFiles, reason: `${off} is off the skip list: the full set` }
  return {
    full: false,
    files: allFiles.filter((file) => !SAFETY_NET_FILES.includes(file)),
    reason: `the ${changed.length} changed files are all on the skip list: every live file but the safety net's`
  }
}

// The k-th of n parts (k from 1): the safety net's files first, heaviest first, then the rest, dealt round the parts.
export function partOf (files, k, n) {
  const ordered = [...SAFETY_NET_FILES.filter((file) => files.includes(file)), ...files.filter((file) => !SAFETY_NET_FILES.includes(file))]
  return ordered.filter((_, i) => i % n === k - 1)
}

const git = (...args) => execFileSync('git', args, { encoding: 'utf8' }).split('\n').filter(Boolean)

// `--no-renames` lists a moved file's old path too, so a file moved out of `docs/js/` is a change there.
function changedSince (ref) {
  const [base] = git('merge-base', ref, 'HEAD')
  return [...new Set([...git('diff', '--name-only', '--no-renames', base), ...git('ls-files', '--others', '--exclude-standard')])].sort()
}

// `npm run test:live`'s own flags and glob, so the cap and timeout are written once (`test/package-scripts.test.mjs`).
function testLiveScript () {
  const words = JSON.parse(readFileSync('package.json', 'utf8')).scripts['test:live'].split(/\s+/)
  return { flags: words.slice(1).filter((word) => !word.startsWith('"')), glob: words.find((word) => word.startsWith('"')).slice(1, -1) }
}

function main () {
  const { values } = parseArgs({ options: { base: { type: 'string' }, part: { type: 'string' }, list: { type: 'boolean' } } })
  const { flags, glob } = testLiveScript()
  const all = globSync(glob).sort()
  const chosen = values.base === undefined
    ? { files: all, reason: 'no --base: the full set' }
    : chooseLiveFiles(changedSince(values.base), all)
  let files = chosen.files
  let said = `live files: ${chosen.reason} (${files.length} files)`
  if (values.part !== undefined) {
    const [k, n] = values.part.split('/').map(Number)
    if (!(Number.isInteger(k) && Number.isInteger(n) && k >= 1 && k <= n)) throw new Error(`--part takes <k>/<n>, 1 <= k <= n: ${values.part}`)
    files = partOf(files, k, n)
    said += `, part ${k} of ${n}: ${files.length} files`
  }
  console.error(said)
  if (values.list) {
    if (files.length) console.log(files.join('\n'))
    return 0
  }
  // node --test with no file runs its default glob, which is not this part.
  if (files.length === 0) return 0
  return spawnSync(process.execPath, ['--test', ...flags, ...files], { stdio: 'inherit' }).status ?? 1
}

if (process.argv[1] === fileURLToPath(import.meta.url)) process.exitCode = main()
