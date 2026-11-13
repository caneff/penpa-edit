// Canonical state (GLOSSARY.md): the engine's state written out the same way every time, so two replays compare line
// by line. Not a check itself, so `live/**/*.live.mjs` skips it.

// The answer boards written out; their `_col` twin holds each entry's custom color.
const BOARDS = ['pu_a', 'pu_a_col']
// Stacks written as their depth only.
const DEPTH_STACKS = ['command_undo', 'command_redo']
// Where `record_replay` puts the timer reading, in milliseconds, in each `pu_a.command_replay` entry.
export const REPLAY_TIMESTAMP = 5

// Runs in the page: the engine fields canonical state is written from, as plain data. The timer and the progress kept
// in storage under `md5(pu.url)` are never read, so neither reaches the output. `page.evaluate` sends only this
// function's source, so it names the boards and fields itself rather than sharing the constants above.
export function readEngineState () {
  const plain = (board) => Object.fromEntries(Object.entries(pu[board]).map(([k, v]) => [k, v instanceof Stack ? v.__a : v]))
  const editMode = pu.mode[pu.mode.qa].edit_mode
  // The third element, the input orientation `set_orientation` stores, exists only once a mode has set one.
  const [submode, style, orientation = null] = pu.mode[pu.mode.qa][editMode]
  return {
    pu_a: plain('pu_a'),
    pu_a_col: plain('pu_a_col'),
    mode: { qa: pu.mode.qa, edit_mode: editMode, submode, style, orientation },
    selection: pu.selection,
    conflict_cells: pu.conflict_cells,
    sol_flag: pu.sol_flag
  }
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
