// What counts as a crash in a UI fuzz run (#195), as a pure function over a page snapshot (`page-state.mjs`). Not a check
// itself.

// The crash signals in a snapshot: each uncaught page error and `console.error` line, one readable line each; none means no crash.
export function crashSignals ({ errors }) {
  return errors.map((e) => `page error: ${e}`)
}
