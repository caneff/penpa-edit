// What changes between two versions of a recording's expected file, in plain words: one line per changed key of a
// checkpoint, with the step that checkpoint follows. Printed by `npm run recordings:approve` before it writes, and
// posted on a PR by the expected-file gate (`.github/scripts/expected-gate.mjs`). Not a check itself, so
// `live/**/*.live.mjs` skips it.
import { changedKeys, checkpointWords, entries } from './replay.mjs'

// `before` and `after` are expected files as JSON reads them, either null for a file that does not exist.
export function expectedDiff ({ steps, before, after }) {
  const byStep = (file) => new Map((file?.checkpoints ?? []).map(({ step, state }) => [step, entries(state.join('\n'))]))
  const old = byStep(before)
  const now = byStep(after)
  const value = (map, key) => map.get(key) ?? 'absent'
  return [...new Set([...old.keys(), ...now.keys()])].sort((a, b) => a - b).flatMap((step) => {
    // A step the steps file does not hold (none at that sha) is named by its number alone.
    const words = step === 0 || steps[step - 1] ? `step ${step} (${checkpointWords(steps, step)})` : `step ${step}`
    if (!now.has(step)) return [`${words}: a checkpoint only the old file has`]
    if (!old.has(step)) return [`${words}: a checkpoint only the new file has`]
    const w = old.get(step)
    const g = now.get(step)
    return changedKeys(w, g).map((key) => `${words}: ${key}: ${value(w, key)} → ${value(g, key)}`)
  })
}
