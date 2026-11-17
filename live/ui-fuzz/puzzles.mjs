// The puzzles a UI fuzz list runs on (#195): tier C's, each opened by the link its kept recording was made on, and Akari.
// A list names its puzzle, so a replay opens the same one. Not a check itself.
import { AKARI_SOLVE } from '../page.mjs'
import { readRecording } from '../replay.mjs'
import { TIER_C_FAMILY } from '../tier-c.mjs'
import { TIER_C_PUZZLES } from '../tier-c-puzzles.mjs'

// Each puzzle as `{ name, source }`, `source` its solve link's `#` part.
export async function uiFuzzPuzzles () {
  const tierC = await Promise.all(TIER_C_PUZZLES.map(async (name) => ({ name, source: (await readRecording(`${TIER_C_FAMILY}/${name}`)).header.source })))
  return [...tierC, { name: 'akari', source: AKARI_SOLVE }]
}
