// The narrowed seam (#316): the unit tests, then the live files CI would run for the same change, chosen by
// `live/run-live.mjs`. A change it cannot place, or a detection that fails, runs the full set and says so there.
// Usage: node live/run-narrowed.mjs [--changed <ref>] [--list]
//   --changed <ref>  the change is the working tree against its merge base with <ref>; without it, the full set
//   --list           prints one suite per line (`npm test`, then each live file) instead of running them
import { spawnSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { parseArgs } from 'node:util'

const RUN_LIVE = fileURLToPath(new URL('./run-live.mjs', import.meta.url))
const UNIT = 'npm test'

function main () {
  const { values } = parseArgs({ options: { changed: { type: 'string' }, list: { type: 'boolean' } } })
  const live = [RUN_LIVE, ...(values.changed === undefined ? [] : ['--base', values.changed])]
  if (values.list) {
    const listing = spawnSync(process.execPath, [...live, '--list'], { stdio: ['inherit', 'pipe', 'inherit'], encoding: 'utf8' })
    if (listing.status !== 0) return listing.status ?? 1
    console.log([UNIT, ...listing.stdout.split('\n').filter(Boolean)].join('\n'))
    return 0
  }
  const unit = spawnSync('npm', ['test'], { stdio: 'inherit' })
  if (unit.status !== 0) return unit.status ?? 1
  return spawnSync(process.execPath, live, { stdio: 'inherit' }).status ?? 1
}

process.exitCode = main()
