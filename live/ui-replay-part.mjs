// The UI driver's per-recording comparisons with the engine driver (`compareDrivers` in `live/replay.mjs`), on Penpa+'s
// page and on `solve.html`, split into UI_REPLAY_PARTS files that node's test workers run side by side as the engine
// driver's are (`live/engine-replay-part.mjs`). Not a check itself, so `live/**/*.live.mjs` skips it.
//
// Every PR replays the hand-made recordings and a sample of the generated ones; with `REPLAY_UI_CORPUS=all` (the
// nightly run, `.github/workflows/ui-corpus.yml`) every recording replays (the Safety net map's standing ruling, #6).
import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { useBrowser } from './page.mjs'
import { replayPartIds } from './engine-replay-part.mjs'
import { compareDrivers, listRecordings, readRecording } from './replay.mjs'
import { TIER_C_FAMILY } from './tier-c.mjs'

export const UI_REPLAY_PARTS = 4

// The pages the UI driver replays on, as `compareDrivers`'s `solve` option names them.
const TARGETS = [{ name: "Penpa+'s page", solve: false }, { name: 'solve.html', solve: true }]

// Tier C's full solves replayed on every PR: those whose replay takes seconds. The 9x9 sudoku and the killer take tens
// of seconds each.
const TIER_C_SAMPLE = ['or-shading', 'slitherlink', 'sudoku-6x6', 'starbattle'].map((name) => `${TIER_C_FAMILY}/${name}`)

// The generated recordings (a header `tier`) replayed on every PR: one for each input the UI driver makes differently
// from a plain press, so a change that breaks one fails the PR rather than the night.
//   genre/compass: a drag along points halfway between two others on Penpa+'s page, aimed from its whole-pixel origin;
//   genre/shimaguni: Surface's two-digit colour, a `1` and then a digit within main.js's 300 ms window;
//   paint/multicolor-clear-keys: Multicolor's colour digits, remapped;
//   genre-tool/combi-linedir: a press outside the frame, which makes no engine call, then a drag onto the board;
//   genre/alternation: a click under Shape mode's key panel, which floats over the board until moved aside;
//   genre/masyu: a drag through points halfway between two others on solve.html, whose scaled cells leave no whole pixel
//   on the recorded point.
const GENERATED_SAMPLE = ['genre/compass', 'genre/shimaguni', 'paint/multicolor-clear-keys', 'genre-tool/combi-linedir',
  'genre/alternation', 'genre/masyu']

// The recordings whose UI-driver replay on solve.html still differs from the engine driver's, each with the ticket for
// its gap (controller, 2026-11-16); node reports each still-differing one as `todo`, failing nothing, and fails one that
// agrees, so the entry goes when its ticket's fix lands. None is marked on Penpa+'s page.
const CAGE_KEY = '#137: a killer cage\'s solve-history key on this grid depends on the cell size'
const SOLVE_TODO = {
  'grid/tri-cage': CAGE_KEY,
  'grid/uniform-cage': CAGE_KEY
}

// The ids each PR's run replays, or every id under `REPLAY_UI_CORPUS=all`; `ids` must be sorted.
export async function uiReplayIds (ids, all = process.env.REPLAY_UI_CORPUS === 'all') {
  if (all) return ids
  const chosen = []
  for (const id of ids) {
    if (!(await readRecording(id)).header.tier || TIER_C_SAMPLE.includes(id) || GENERATED_SAMPLE.includes(id)) chosen.push(id)
  }
  return chosen
}

// The call every `ui-replay-<k>.live.mjs` makes, `fileUrl` its `import.meta.url`, `k` read from its name.
export const UI_REPLAY_CALL = 'await uiReplayPart(import.meta.url)'

// The ids part `part` replays, of every recording under `all` (the nightly run's set) or of each PR's.
export async function uiReplayPartIds (part, all) {
  return replayPartIds(await uiReplayIds(await listRecordings(), all), part, UI_REPLAY_PARTS)
}

// Registers the UI driver's comparisons of the part named by `fileUrl`.
export async function uiReplayPart (fileUrl) {
  const part = Number(/ui-replay-(\d+)\.live\.mjs$/.exec(fileUrl)[1])
  const browser = useBrowser()
  const ids = await uiReplayPartIds(part)
  for (const { name, solve } of TARGETS) {
    describe(`the UI driver on ${name}, recordings part ${part + 1} of ${UI_REPLAY_PARTS}`, () => {
      for (const id of ids) {
        const reason = solve ? SOLVE_TODO[id] : undefined
        it(`replays ${id} through mouse and keyboard to the engine driver's states`, async (t) => {
          const compared = compareDrivers(browser(), await readRecording(id), { id, solve })
          if (!reason) return assert.equal(await compared, null)
          // The known gap shows as a report, or as a step the driver cannot make, whose message is the difference.
          const difference = await compared.catch((e) => e.message)
          assert.notEqual(difference, null, `${id} now agrees on ${name}: remove its SOLVE_TODO entry (${reason})`)
          t.todo(reason)
        })
      }
    })
  }
}
