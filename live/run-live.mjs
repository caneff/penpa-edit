// Runs the live files a change needs (#268, #315). A change to an input of the engine side (a file `docs/index.html`
// loads, or one the engine side's tests import or read) runs the full set; any other change off the skip list runs every
// live file but the engine side's; a change made only of skip-list paths runs every live file but the safety net's. An
// empty change, a run with no `--base`, and a detection that fails run the full set.
// Usage: node live/run-live.mjs [--base <ref>] [--part <k>/<n>] [--list]
//   --base <ref>    the change is the working tree, untracked files included, against its merge base with <ref>
//   --part <k>/<n>  runs the k-th of n parts
//   --list          prints the chosen files instead of running them
import { execFileSync, spawnSync } from 'node:child_process'
import { globSync, readFileSync, statSync } from 'node:fs'
import { join, posix } from 'node:path'
import { fileURLToPath } from 'node:url'
import { parseArgs } from 'node:util'

// At most 4 files at once (#76): node runs one per core otherwise, and a Chromium per live file hangs the shared box.
export const NODE_TEST_FLAGS = ['--test-concurrency=4', '--test-timeout=60000']
const LIVE_GLOB = 'live/**/*.live.mjs'

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

// The engine side: the safety net's files but the UI driver's replays, which also replay on `solve.html` and so keep the
// skip list's rule (controller's ruling on #315, 2026-11-18).
export const ENGINE_FILES = SAFETY_NET_FILES.filter((file) => !/^live\/ui-replay-\d+\.live\.mjs$/.test(file))

// The page the engine side opens (`live/page.mjs`'s default page).
const ENGINE_PAGE = 'docs/index.html'

// What runs the engine side besides its page and its tests: the dependencies, CI, and this selection itself. A path
// ending in `/` holds everything under it.
const ENGINE_HARNESS = ['package.json', 'package-lock.json', '.github/', 'live/run-live.mjs']

// A live test file outside the safety net is on the skip list: no other file imports it, and the reduced set runs it.
const onSkipList = (path) =>
  path.startsWith('docs/ui/') || path.startsWith('research/') || path.startsWith('adr/') || path.endsWith('.md') ||
  (/^live\/[^/]+\.live\.mjs$/.test(path) && !SAFETY_NET_FILES.includes(path))

// `allFiles` is every live file and `inputs` the engine side's (`engineInputs`); the result keeps `allFiles`' order.
export function chooseLiveFiles (changed, allFiles, inputs) {
  if (changed.length === 0) return { files: allFiles, reason: 'no changed file: the full set' }
  const input = changed.find((path) => isInput(path, inputs))
  if (input) return { files: allFiles, reason: `${input} is an input of the engine side: the full set` }
  const off = changed.find((path) => !onSkipList(path))
  if (off) {
    return {
      files: allFiles.filter((file) => !ENGINE_FILES.includes(file)),
      reason: `${off} is off the skip list and no changed file is an input of the engine side: every live file but the engine side's`
    }
  }
  return {
    files: allFiles.filter((file) => !SAFETY_NET_FILES.includes(file)),
    reason: `the ${changed.length} changed files are all on the skip list: every live file but the safety net's`
  }
}

// Every file of the checkout under `root` that `page` (a path such as `docs/index.html`) can load, repo-relative: the
// page; each quoted string in it or in a script it reaches that names a file beside the page (the page builds its
// `<script>` and `<link>` tags from such lists, and its scripts name the theme sheets and the GIF worker the same way);
// and each `url()` or quoted path in a stylesheet it reaches, read beside that sheet. A named path with an extension is
// kept even when no such file exists, so a change deleting a file the page loads reaches the page. Throws when the
// page cannot be read.
export function pageReach (root, page) {
  const pageDir = posix.dirname(page)
  const reached = new Set()
  const visit = (path) => {
    if (reached.has(path)) return
    reached.add(path)
    if (!/\.(html|js|css)$/.test(path) || !isFile(join(root, path))) return
    const text = readFileSync(join(root, path), 'utf8')
    const css = path.endsWith('.css')
    const names = [...text.matchAll(/(["'`])([^"'`\s<>(){}]+?)\1/g)].map((m) => m[2])
    if (css) names.push(...[...text.matchAll(/url\(\s*([^"')\s]+)\s*\)/g)].map((m) => m[1]))
    for (const name of names) {
      const target = pathNamed(css ? posix.dirname(path) : pageDir, name)
      if (target !== null && (/^\.[a-z][a-z0-9]{0,4}$/i.test(posix.extname(target)) || isFile(join(root, target)))) visit(target)
    }
  }
  readFileSync(join(root, page))
  visit(page)
  return reached
}

// The repo-relative path `name` names when read in `dir`, without its query or fragment; null for an address, an
// absolute path, a path outside `dir`'s top directory, or a name that holds no path.
function pathNamed (dir, name) {
  if (/^[a-z][a-z0-9+.-]*:|^\/|^#/i.test(name)) return null
  const bare = name.replace(/[?#].*$/, '')
  if (!/^[\w@.~/-]+$/.test(bare) || bare === '.' || bare === './') return null
  const path = posix.normalize(posix.join(dir, bare))
  const top = dir.split('/')[0]
  return path.startsWith(top + '/') ? path : null
}

const isFile = (path) => statSync(path, { throwIfNoEntry: false })?.isFile() ?? false

const isInput = (path, inputs) => inputs.has(path) || [...inputs].some((input) => input.endsWith('/') && path.startsWith(input))

// The engine side's inputs in the checkout under `root`, repo-relative, a directory's ending in `/`: every file its page
// can load (`pageReach`), every module its live files among `liveFiles` import, every file or directory under `live/` or `test/` those
// modules name with `new URL(..., import.meta.url)`, such as the recordings, and `ENGINE_HARNESS`. A module's name for
// `docs/` is left to `pageReach`, and one for its own directory (a base to list or run git in) holds nothing. Throws when
// a page or module cannot be read.
export function engineInputs (root, liveFiles) {
  const inputs = new Set([...pageReach(root, ENGINE_PAGE), ...ENGINE_HARNESS])
  const visit = (path) => {
    if (inputs.has(path)) return
    inputs.add(path)
    const dir = posix.dirname(path)
    const text = readFileSync(join(root, path), 'utf8')
    for (const [, name] of text.matchAll(/(?:\bfrom|\bimport\s*\(?)\s*['"](\.{1,2}\/[^'"]+)['"]/g)) visit(posix.join(dir, name))
    for (const [, name] of text.matchAll(/new URL\(\s*['"]([^'"]+)['"]\s*,\s*import\.meta\.url/g)) {
      const named = posix.normalize(posix.join(dir, name))
      if (/^(live|test)\/./.test(named) && named !== dir + '/') inputs.add(named)
    }
  }
  for (const file of ENGINE_FILES.filter((file) => liveFiles.includes(file))) visit(file)
  return inputs
}

// The k-th of n parts (k from 1): the safety net's files first, heaviest first, then the rest, dealt round the parts.
export function partOf (files, k, n) {
  const ordered = [...SAFETY_NET_FILES.filter((file) => files.includes(file)), ...files.filter((file) => !SAFETY_NET_FILES.includes(file))]
  return ordered.filter((_, i) => i % n === k - 1)
}

const git = (...args) => execFileSync('git', args, { encoding: 'utf8' }).split('\n').filter(Boolean)

// `--no-renames` lists a moved file's old path too, so a file moved out of `docs/js/` is a change there. A workspace's
// `node_modules` is a symlink, which `.gitignore`'s `node_modules/` does not match, so git lists it as untracked.
function changedSince (ref) {
  const [base] = git('merge-base', ref, 'HEAD')
  const untracked = git('ls-files', '--others', '--exclude-standard').filter((path) => path !== 'node_modules')
  return [...new Set([...git('diff', '--name-only', '--no-renames', base), ...untracked])].sort()
}

// The files `chooseLiveFiles` picks for the change since `ref`; when the change or the engine side's inputs cannot be
// read, the full set, saying why, so a broken detection never skips a test.
function detect (ref, all) {
  let changed, inputs
  try {
    changed = changedSince(ref)
    inputs = engineInputs('.', all)
  } catch (err) {
    return { files: all, reason: `change detection failed (${err.message.split('\n')[0]}): the full set` }
  }
  return chooseLiveFiles(changed, all, inputs)
}

function main () {
  const { values } = parseArgs({ options: { base: { type: 'string' }, part: { type: 'string' }, list: { type: 'boolean' } } })
  const all = globSync(LIVE_GLOB).sort()
  if (all.length === 0) throw new Error(`no live file matches ${LIVE_GLOB} under ${process.cwd()}`)
  const chosen = values.base === undefined ? { files: all, reason: 'no --base: the full set' } : detect(values.base, all)
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
  return spawnSync(process.execPath, ['--test', ...NODE_TEST_FLAGS, ...files], { stdio: 'inherit' }).status ?? 1
}

if (process.argv[1] === fileURLToPath(import.meta.url)) process.exitCode = main()
