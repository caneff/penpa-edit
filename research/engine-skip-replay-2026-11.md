# The engine side's skip, replayed over the last 40 merged PRs (#315, 2026-11-18)

`live/run-live.mjs` at #315's branch decided each of the 40 most recently merged PRs (#257 to #333,
`gh pr list --state merged --limit 40`), on the PR's own changed files (`gh`'s `files` field) and the
engine side's inputs derived from the tree of its merge commit (`git archive <mergeCommit> docs live`).
"#268" is the skip list's rule before #315: the safety net runs on any change off the skip list.

**Result: the engine side skips on 26 of 40 PRs under #315's rule, against 12 of 40 under #268's.**
The 14 new skips are 8 changes to `docs/js/engine_bridge.js`, 5 to `live/` helpers the engine side
does not import (`live/ui-fuzz/actions.mjs` twice, `live/ui-fuzz/rules.mjs`, `live/pin-card.mjs`,
`live/desk-layout.mjs`), and #332's `.gitattributes`. The 14 that still run touch a script `index.html`
loads (5), `live/page.mjs` (4), `.github/workflows/ci.yml` (2), `package.json`, `live/fuzz.mjs` or
`live/plants.mjs` (1 each); the reason names the first input in the PR's file list. The UI driver's replays
still run on every PR off the skip list, so they run on 28 of the 40 either way.

| PR | #268 | #315 | Files | Why (#315's printed reason) |
|---|---|---|---|---|
| #333 | skip | skip | 2 | the 2 changed files are all on the skip list: every live file but the safety net's |
| #332 | run | skip | 11 | .gitattributes is off the skip list and no changed file is an input of the engine side: every live file but the engine side's |
| #331 | skip | skip | 3 | the 3 changed files are all on the skip list: every live file but the safety net's |
| #328 | run | skip | 2 | docs/js/engine_bridge.js is off the skip list and no changed file is an input of the engine side: every live file but the engine side's |
| #326 | skip | skip | 4 | the 4 changed files are all on the skip list: every live file but the safety net's |
| #325 | run | run | 6 | docs/js/class_p.js is an input of the engine side: the full set |
| #321 | run | run | 2 | docs/js/class_p.js is an input of the engine side: the full set |
| #320 | run | run | 2 | docs/js/conflicts.js is an input of the engine side: the full set |
| #313 | run | skip | 9 | docs/js/engine_bridge.js is off the skip list and no changed file is an input of the engine side: every live file but the engine side's |
| #312 | run | skip | 8 | live/ui-fuzz/rules.mjs is off the skip list and no changed file is an input of the engine side: every live file but the engine side's |
| #311 | skip | skip | 4 | the 4 changed files are all on the skip list: every live file but the safety net's |
| #310 | run | skip | 4 | docs/js/engine_bridge.js is off the skip list and no changed file is an input of the engine side: every live file but the engine side's |
| #309 | skip | skip | 2 | the 2 changed files are all on the skip list: every live file but the safety net's |
| #304 | run | run | 2 | docs/js/general.js is an input of the engine side: the full set |
| #303 | run | skip | 3 | live/ui-fuzz/actions.mjs is off the skip list and no changed file is an input of the engine side: every live file but the engine side's |
| #302 | run | skip | 6 | live/ui-fuzz/actions.mjs is off the skip list and no changed file is an input of the engine side: every live file but the engine side's |
| #301 | skip | skip | 2 | the 2 changed files are all on the skip list: every live file but the safety net's |
| #300 | skip | skip | 2 | the 2 changed files are all on the skip list: every live file but the safety net's |
| #299 | run | run | 5 | live/page.mjs is an input of the engine side: the full set |
| #298 | run | skip | 6 | docs/js/engine_bridge.js is off the skip list and no changed file is an input of the engine side: every live file but the engine side's |
| #297 | skip | skip | 4 | the 4 changed files are all on the skip list: every live file but the safety net's |
| #296 | run | run | 5 | docs/js/progress_autosave.js is an input of the engine side: the full set |
| #293 | skip | skip | 1 | the 1 changed files are all on the skip list: every live file but the safety net's |
| #291 | run | skip | 10 | docs/js/engine_bridge.js is off the skip list and no changed file is an input of the engine side: every live file but the engine side's |
| #290 | run | run | 23 | live/fuzz.mjs is an input of the engine side: the full set |
| #289 | run | skip | 7 | docs/js/engine_bridge.js is off the skip list and no changed file is an input of the engine side: every live file but the engine side's |
| #287 | skip | skip | 8 | the 8 changed files are all on the skip list: every live file but the safety net's |
| #286 | run | run | 14 | .github/workflows/ci.yml is an input of the engine side: the full set |
| #285 | run | skip | 6 | docs/js/engine_bridge.js is off the skip list and no changed file is an input of the engine side: every live file but the engine side's |
| #283 | run | skip | 8 | live/pin-card.mjs is off the skip list and no changed file is an input of the engine side: every live file but the engine side's |
| #280 | run | run | 14 | .github/workflows/ci.yml is an input of the engine side: the full set |
| #275 | run | skip | 8 | live/desk-layout.mjs is off the skip list and no changed file is an input of the engine side: every live file but the engine side's |
| #273 | run | run | 12 | live/page.mjs is an input of the engine side: the full set |
| #270 | run | run | 4 | live/plants.mjs is an input of the engine side: the full set |
| #269 | run | run | 7 | package.json is an input of the engine side: the full set |
| #266 | skip | skip | 3 | the 3 changed files are all on the skip list: every live file but the safety net's |
| #262 | run | skip | 5 | docs/js/engine_bridge.js is off the skip list and no changed file is an input of the engine side: every live file but the engine side's |
| #261 | run | run | 15 | live/page.mjs is an input of the engine side: the full set |
| #260 | skip | skip | 7 | the 7 changed files are all on the skip list: every live file but the safety net's |
| #257 | run | run | 5 | live/page.mjs is an input of the engine side: the full set |
