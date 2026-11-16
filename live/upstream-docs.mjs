// `upstream/master`'s `docs/` unpacked to a scratch directory, so a test can open Penpa+ as upstream ships it. Not a check
// itself, so `live/**/*.live.mjs` skips it.
import { execFileSync } from 'node:child_process'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'

const UPSTREAM_REF = 'upstream/master'
// A tar of `docs/` is tens of megabytes (fonts, images).
const ARCHIVE_MAX_BYTES = 1 << 29

// Unpacks `docs/` of the `upstream/master` ref of this clone and returns where its page is and how to delete it.
// A clone without the ref fails here, never skips: CI fetches it (`ci.yml`) and a local clone has it as the `upstream` remote.
export function unpackUpstreamDocs () {
  let archive
  try {
    archive = execFileSync('git', ['archive', '--format=tar', UPSTREAM_REF, 'docs'], { maxBuffer: ARCHIVE_MAX_BYTES })
  } catch (e) {
    throw new Error(`${UPSTREAM_REF} is missing: run \`git fetch upstream master\` (${e.message})`)
  }
  const dir = mkdtempSync(join(tmpdir(), 'upstream-docs-'))
  execFileSync('tar', ['-x', '-C', dir], { input: archive })
  return {
    pageUrl: pathToFileURL(join(dir, 'docs', 'index.html')).href,
    remove: () => rmSync(dir, { recursive: true, force: true })
  }
}
