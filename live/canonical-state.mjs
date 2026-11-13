// Canonical state (GLOSSARY.md): the engine's state written out the same way every time, so two replays compare line
// by line. Not a check itself, so `live/**/*.live.mjs` skips it.

// The answer boards written out; their `_col` twin holds each entry's custom color.
const BOARDS = ['pu_a', 'pu_a_col']
// Stacks written as their depth only.
const DEPTH_STACKS = ['command_undo', 'command_redo']
// Where `record_replay` puts the timer reading, in milliseconds, in each `pu_a.command_replay` entry.
export const REPLAY_TIMESTAMP = 5

// Runs in the page: the engine fields canonical state is written from, as plain data. The reader is `readEngineState`
// in `docs/js/recorder.js`, which the page loads, so a recording's final board is read the same way.
export function readEngineState () {
  return window.readEngineState()
}

// JSON with every object's keys sorted, so a value reads the same whatever order its keys were added in.
function json (value) {
  return JSON.stringify(value, (key, v) =>
    v && typeof v === 'object' && !Array.isArray(v) ? Object.fromEntries(Object.entries(v).sort(byKey)) : v)
}

// Code-unit order, so the output is the same on every machine and locale.
function byKey ([a], [b]) {
  return a < b ? -1 : a > b ? 1 : 0
}

// A replay entry with its timer reading replaced, since the timer runs on whatever the clock says.
function scrubTimestamp (entry) {
  if (entry.length <= REPLAY_TIMESTAMP) return entry
  const scrubbed = [...entry]
  scrubbed[REPLAY_TIMESTAMP] = '[timestamp]'
  return scrubbed
}

// An empty object or array still writes a line, so a property the engine dropped reads apart from an empty one.
export function canonicalState (state) {
  const lines = []
  for (const board of BOARDS) {
    for (const [prop, value] of Object.entries(state[board]).sort(byKey)) {
      if (DEPTH_STACKS.includes(prop)) {
        lines.push(`${board}.${prop}.length = ${value.length}`)
      } else if (value && typeof value === 'object' && Object.keys(value).length) {
        const entries = Array.isArray(value) ? [...value.entries()] : Object.entries(value).sort(byKey)
        for (const [key, entry] of entries) {
          lines.push(`${board}.${prop}.${key} = ${json(prop === 'command_replay' ? scrubTimestamp(entry) : entry)}`)
        }
      } else {
        lines.push(`${board}.${prop} = ${json(value)}`)
      }
    }
  }
  for (const key of ['qa', 'edit_mode', 'submode', 'style', 'orientation']) lines.push(`mode.${key} = ${json(state.mode[key])}`)
  for (const key of ['selection', 'conflict_cells', 'sol_flag']) lines.push(`${key} = ${json(state[key])}`)
  return lines.join('\n') + '\n'
}
