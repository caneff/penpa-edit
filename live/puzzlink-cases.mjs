// Upstream's puzz.link import list (`test/public/puzz_link_parser.js`) and its snapshots, read from upstream's files so
// an upstream merge that adds a puzzle adds it here. Not a check itself, so `live/**/*.live.mjs` skips it.
import { readFileSync } from 'node:fs'

const PARSER = new URL('../test/public/puzz_link_parser.js', import.meta.url)
export const SNAPSHOTS = new URL('../test/snapshots/', import.meta.url)

// Each puzzle's display name ("Akari 1") and link.
export const cases = [...readFileSync(PARSER, 'utf8').matchAll(/^\s+\["([^"]+)", "([^"]+)"\],?$/mg)]
  .map(([, name, url]) => ({ name, url }))

// Upstream's filename rule, from `puzz_link_parser.js`.
export const snapshotName = (name) => `puzzlink_${name.toLowerCase().replace(/[^\w]/g, '_')}.json`

export const readSnapshot = (name) => JSON.parse(readFileSync(new URL(snapshotName(name), SNAPSHOTS), 'utf8'))
