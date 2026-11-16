// The expected-file gate (#33): a PR may change a recording's expected file only when a ticket it closes listed that
// recording's id before the fix started, under a `## Expected changes` heading, one `- \`<id>\`: <the change in words>`
// bullet per id. The fix started at the earliest author date of the PR's commits, which a rebase or an amend keeps. A
// new expected file is not a re-approval and passes unlisted. Every change, listed or not, goes into the PR comment in
// plain words. An upstream merge never gets here: the nightly refuses any merge that changes an expected file
// (`.github/scripts/expected-unchanged.sh`), so Chris rules on it.
//
// Run by `.github/workflows/ci.yml` on a pull request:
//   node .github/scripts/expected-gate.mjs <pr> <base-sha> <head-sha> <comment-file>
// with GH_TOKEN, GITHUB_REPOSITORY and GITHUB_OUTPUT set. Writes the comment to <comment-file> and `changed=true` or
// `changed=false` to GITHUB_OUTPUT, and exits 1 when an expected file changed unlisted.
import { execFileSync } from 'node:child_process'
import { appendFileSync, writeFileSync } from 'node:fs'
import { relative } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { expectedDiff } from '../../live/expected-diff.mjs'
import { EXPECTED_SUFFIX, RECORDINGS, STEPS_SUFFIX } from '../../live/replay.mjs'

const HEADING = /^## Expected changes\s*$/
const RECORDINGS_DIR = relative(fileURLToPath(new URL('../../', import.meta.url)), fileURLToPath(RECORDINGS)) + '/'
// Lines of one recording's diff the comment shows; GitHub refuses a comment over 65536 characters.
export const DIFF_LINES = 40

// The ids a ticket body lists: the first backticked word of each bullet in its `## Expected changes` section.
export function listedIds (body) {
  const ids = new Set()
  let inSection = false
  for (const line of body.split(/\r?\n/)) {
    if (/^#{1,2} /.test(line)) inSection = HEADING.test(line)
    else if (inSection) {
      const id = line.match(/^\s*[-*] `([^`]+)`/)?.[1]
      if (id) ids.add(id)
    }
  }
  return ids
}

// `changes`: { id, status: 'added' | 'modified' | 'deleted' } per changed expected file. `fixStartedAt`: when the PR's
// work began. `tickets`: { number, versions: [{ at, body }] } per ticket the PR closes, its body's versions oldest
// first. An id is listed in advance when a ticket's body lists it now and listed it in a version dated no later than
// `fixStartedAt`.
export function gateVerdict ({ changes, fixStartedAt, tickets }) {
  const verdict = { approved: [], added: [], unlisted: [] }
  for (const { id, status } of changes) {
    if (status === 'added') {
      verdict.added.push(id)
      continue
    }
    const listing = tickets.filter(({ versions }) => listedIds(versions.at(-1).body).has(id))
    const inAdvance = listing.find(({ versions }) => versions.some(({ at, body }) => at <= fixStartedAt && listedIds(body).has(id)))
    if (inAdvance) verdict.approved.push({ id, ticket: inAdvance.number })
    else if (listing.length) {
      const { number, versions } = listing[0]
      const at = versions.find(({ body }) => listedIds(body).has(id)).at
      verdict.unlisted.push({ id, reason: `#${number} listed it at ${at}, after the fix started at ${fixStartedAt}` })
    } else verdict.unlisted.push({ id, reason: 'no ticket this PR closes lists it' })
  }
  return verdict
}

// `sections` maps each id to its diff's lines; each is cut at DIFF_LINES.
export function commentBody ({ head, verdict, sections }) {
  const out = [`## Expected-file gate at ${head}`, '']
  const block = (title, items) => {
    if (!items.length) return
    out.push(`### ${title}`, '')
    for (const { id, note } of items) {
      const lines = sections.get(id)
      out.push(`#### \`${id}\`${note ? ` — ${note}` : ''}`, '', ...lines.slice(0, DIFF_LINES).map((line) => `- ${line}`))
      if (lines.length > DIFF_LINES) out.push(`- … and ${lines.length - DIFF_LINES} more lines: \`git diff\` the file to see them all`)
      out.push('')
    }
  }
  block('Not listed in advance: this check fails', verdict.unlisted.map(({ id, reason }) => ({ id, note: reason })))
  block('Approved', verdict.approved.map(({ id, ticket }) => ({ id, note: `listed in #${ticket}` })))
  block('New recordings', verdict.added.map((id) => ({ id })))
  return out.join('\n')
}

const run = (cmd, ...args) => execFileSync(cmd, args, { encoding: 'utf8', maxBuffer: 1 << 28 })
const git = (...args) => run('git', ...args)
const gh = (...args) => run('gh', ...args)

// A file's content at `sha` as JSON, or null when it does not exist there.
function jsonAt (sha, path) {
  if (!git('ls-tree', '--name-only', sha, '--', path).trim()) return null
  return JSON.parse(git('show', `${sha}:${path}`))
}

const STATUS = { A: 'added', M: 'modified', D: 'deleted' }

function changedExpectedFiles (base, head) {
  const lines = git('diff', '--name-status', '--no-renames', `${base}...${head}`, '--', `:(glob)${RECORDINGS_DIR}**/*${EXPECTED_SUFFIX}`)
  return lines.split('\n').filter(Boolean).map((line) => {
    const [code, path] = line.split('\t')
    const status = STATUS[code]
    if (!status) throw new Error(`git diff gave status ${code} for ${path}`)
    return { id: path.slice(RECORDINGS_DIR.length, -EXPECTED_SUFFIX.length), path, status }
  })
}

// The earliest author date of the PR's own commits.
function fixStart (base, head) {
  const dates = git('log', '--format=%aI', `${base}..${head}`).split('\n').filter(Boolean).map((d) => new Date(d).toISOString())
  if (!dates.length) throw new Error(`no commit between ${base} and ${head}`)
  return dates.sort()[0]
}

const ISSUE_QUERY = `query($owner: String!, $name: String!, $number: Int!) {
  repository(owner: $owner, name: $name) { issue(number: $number) {
    body createdAt userContentEdits(first: 100) { totalCount nodes { editedAt diff } }
  } }
}`

// Every version of a ticket's body, oldest first: GitHub keeps each edit's whole body, the oldest being the original.
function ticketVersions (repo, number) {
  const [owner, name] = repo.split('/')
  const { data } = JSON.parse(gh('api', 'graphql', '-f', `query=${ISSUE_QUERY}`, '-f', `owner=${owner}`, '-f', `name=${name}`, '-F', `number=${number}`))
  const { body, createdAt, userContentEdits: edits } = data.repository.issue
  if (edits.totalCount > edits.nodes.length) throw new Error(`#${number} has ${edits.totalCount} edits; the gate reads 100`)
  if (!edits.nodes.length) return [{ at: new Date(createdAt).toISOString(), body }]
  const versions = edits.nodes.map(({ editedAt, diff }) => {
    if (diff == null) throw new Error(`#${number}: GitHub returned no body for its edit at ${editedAt}`)
    return { at: new Date(editedAt).toISOString(), body: diff }
  })
  return versions.sort((a, b) => a.at.localeCompare(b.at))
}

// The diff's lines for one changed expected file; a new or deleted file is summed up in one line.
function diffLines (base, head, { path, status }) {
  const before = jsonAt(base, path)
  const after = jsonAt(head, path)
  if (status === 'added') return [`a new expected file of ${after.checkpoints.length} checkpoints`]
  if (status === 'deleted') return [`the expected file is deleted; it had ${before.checkpoints.length} checkpoints`]
  const { steps } = jsonAt(head, path.slice(0, -EXPECTED_SUFFIX.length) + STEPS_SUFFIX)
  const lines = expectedDiff({ steps, before, after })
  return lines.length ? lines : ['no checkpoint changed']
}

async function main ([pr, base, head, commentFile]) {
  const repo = process.env.GITHUB_REPOSITORY
  const output = process.env.GITHUB_OUTPUT
  if (!pr || !base || !head || !commentFile || !repo || !output) {
    throw new Error('usage: GITHUB_REPOSITORY=<owner/name> GITHUB_OUTPUT=<file> node .github/scripts/expected-gate.mjs <pr> <base-sha> <head-sha> <comment-file>')
  }
  const changed = changedExpectedFiles(base, head)
  appendFileSync(output, `changed=${changed.length > 0}\n`)
  if (!changed.length) {
    // Replaces an earlier run's comment, which may say this check fails.
    writeFileSync(commentFile, `## Expected-file gate at ${head}\n\nNo expected file changed.\n`)
    console.log('No expected file changed.')
    return 0
  }
  const closing = JSON.parse(gh('pr', 'view', pr, '--repo', repo, '--json', 'closingIssuesReferences')).closingIssuesReferences
  const tickets = closing
    .filter((issue) => `${issue.repository.owner.login}/${issue.repository.name}` === repo)
    .map(({ number }) => ({ number, versions: ticketVersions(repo, number) }))
  const verdict = gateVerdict({ changes: changed, fixStartedAt: fixStart(base, head), tickets })
  const sections = new Map(changed.map((change) => [change.id, diffLines(base, head, change)]))
  writeFileSync(commentFile, commentBody({ head, verdict, sections }) + '\n')
  for (const { id, reason } of verdict.unlisted) console.error(`${id}: expected file changed, not listed in advance: ${reason}`)
  console.log(`${verdict.approved.length} approved, ${verdict.added.length} new, ${verdict.unlisted.length} not listed in advance`)
  return verdict.unlisted.length ? 1 : 0
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) process.exitCode = await main(process.argv.slice(2))
