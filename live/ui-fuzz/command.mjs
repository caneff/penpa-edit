// The UI fuzz's command line (#195): `npm run fuzz:ui -- [--seed <n>] [--minutes <m>] [--puzzle <name>] [--max-steps <n>]
// [--path <printed path>] [--focus <area> ...]`, read, and the replay command a failure prints. Not a check itself.
import { parseArgs } from 'node:util'
import { AREAS } from './actions.mjs'

// A value that is not a number stops the run: NaN would switch a limit off.
function numberOption (values, name, { integer = false } = {}) {
  if (values[name] == null) return undefined
  const n = Number(values[name])
  if (Number.isNaN(n) || n <= 0 || (integer && !Number.isInteger(n))) throw new Error(`--${name} needs a positive ${integer ? 'whole number' : 'number'}, got "${values[name]}"`)
  return n
}

// `args` (the words after `--`) as `runFuzz`'s `{ seed, minutes, puzzle, maxCommands, path, focus }`, `maxCommands` from
// `--max-steps`, each undefined when not given but `focus`, the areas named (AREAS), none when not given.
export function parseFuzzArgs (args) {
  const options = { seed: { type: 'string' }, minutes: { type: 'string' }, puzzle: { type: 'string' }, 'max-steps': { type: 'string' }, path: { type: 'string' }, focus: { type: 'string', multiple: true } }
  const { values } = parseArgs({ args, options })
  const focus = values.focus ?? []
  const unknown = focus.find((area) => !AREAS.includes(area))
  if (unknown != null) throw new Error(`--focus needs one of ${AREAS.join(', ')}, got "${unknown}"`)
  return { seed: numberOption(values, 'seed', { integer: true }), minutes: numberOption(values, 'minutes'), puzzle: values.puzzle, maxCommands: numberOption(values, 'max-steps', { integer: true }), path: values.path, focus }
}

// The command that runs a failure's list again on its puzzle, by name, with the list length (when not the default) and
// the focus it was found with, both of which shape the lists. A path holds
// digits, `:`, `@` and fast-check's replay letters, and a puzzle name or an area lowercase letters, digits and `-`, none
// of which a shell reads.
export const replayCommand = ({ seed, puzzle, maxCommands, path, focus = [] }) => [
  `npm run fuzz:ui -- --seed ${seed} --puzzle ${puzzle}`, ...(maxCommands == null ? [] : [`--max-steps ${maxCommands}`]), `--path ${path}`,
  ...focus.map((area) => `--focus ${area}`)
].join(' ')
