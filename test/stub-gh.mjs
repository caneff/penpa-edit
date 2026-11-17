import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

// A stub `gh` on PATH prints `listOutput` for `issue list`, whatever its flags, or fails it when `listFails`.
export function stubGh ({ listOutput = '', listFails = false }) {
  const dir = mkdtempSync(join(tmpdir(), 'stub-gh-'))
  const log = join(dir, 'calls.jsonl')
  writeFileSync(log, '')
  writeFileSync(join(dir, 'open-issues'), listOutput)
  writeFileSync(join(dir, 'gh'), `#!/usr/bin/env bash
node -e 'process.stdout.write(JSON.stringify(process.argv.slice(1)) + "\\n")' -- "$@" >>"${log}"
if [[ $1 == issue && $2 == list ]]; then ${listFails ? 'exit 1' : `cat "${join(dir, 'open-issues')}"`}; fi
`, { mode: 0o755 })
  const env = { ...process.env, PATH: `${dir}:${process.env.PATH}`, GITHUB_REPOSITORY: 'owner/repo' }
  const calls = () => readFileSync(log, 'utf8').trim().split('\n').filter(Boolean).map((line) => JSON.parse(line))
  return { dir, env, calls }
}
