// The UI fuzz's command line (#195): `npm run fuzz:ui -- [--seed <n>] [--minutes <m>] [--path <printed path>]
// [--focus <area> ...]`, read, and the replay command a failure prints. Not a check itself.
import { parseArgs } from 'node:util'
import { AREAS } from './actions.mjs'

// A value that is not a number stops the run: NaN would switch a limit off.
function numberOption (values, name, { integer = false } = {}) {
  if (values[name] == null) return undefined
  const n = Number(values[name])
  if (Number.isNaN(n) || n <= 0 || (integer && !Number.isInteger(n))) throw new Error(`--${name} needs a positive ${integer ? 'whole number' : 'number'}, got "${values[name]}"`)
  return n
}

// `args` (the words after `--`) as `{ seed, minutes, path, focus }`, each undefined when not given but `focus`, the areas
// named (AREAS), none when not given.
export function parseFuzzArgs (args) {
  const { values } = parseArgs({ args, options: { seed: { type: 'string' }, minutes: { type: 'string' }, path: { type: 'string' }, focus: { type: 'string', multiple: true } } })
  const focus = values.focus ?? []
  const unknown = focus.find((area) => !AREAS.includes(area))
  if (unknown != null) throw new Error(`--focus needs one of ${AREAS.join(', ')}, got "${unknown}"`)
  return { seed: numberOption(values, 'seed', { integer: true }), minutes: numberOption(values, 'minutes'), path: values.path, focus }
}

// The command that runs a failure's list again, with the focus it was found with. A path holds digits, `:`, `@` and
// fast-check's replay letters, and an area lowercase letters and `-`, none of which a shell reads.
export const replayCommand = ({ seed, path, focus = [] }) => [`npm run fuzz:ui -- --seed ${seed} --path ${path}`, ...focus.map((area) => `--focus ${area}`)].join(' ')
