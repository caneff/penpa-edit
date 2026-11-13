# What makes a Penpa+ replay non-deterministic, and the setup that removes it

Probe for #28 (wayfinder map #6), run 2026-11-13 on `origin/master` at `2a923e4` in a throwaway worktree. It answers:
what makes the engine's state differ between two loads, or two replays, of the same input, and which clock, storage and
viewport setup removes each source. The tracer bullet (#29) builds on the setup at the end. Terms (recording, step,
checkpoint, canonical state) are `GLOSSARY.md`'s.

## Method

- Every page was opened with the repo's own helpers: `openPenpa` (`live/page.mjs`: a fresh browser context per call,
  every `http(s)` request answered empty, `docs/` over `file://` unless `served`), `settle` (`live/settle.mjs`) before
  any read, and `canonicalState(readEngineState())` (`live/canonical-state.mjs`) for the comparison. One Chromium
  (Playwright 1.64.1), at most 4 contexts open at once.
- Beside canonical state, each read also took a wide dump, so a difference canonical state does not show (or scrubs)
  still surfaced: every own field of `pu` (long ones hashed), the `sw_timer` reading, `document.cookie`, the
  `localStorage` and `localforage` keys, the window size and `devicePixelRatio`, the canvas size and every `UserSettings`
  field.
- **Loads**: all 430 links in `TESTING.md` (397 puzz.link, 30 pzprxs, 2 pzv.jp, 1 git.io), opened as `#p=<link>`, and
  all 19 Penpa+ links in `research/lmd-penpa-sample-links.md` (the 12 genre picks plus the bonus, passed-over and
  second links in that file), turned to hash form (`#m=solve&p=...`) as the prototype did. 449 links, each loaded twice in
  fresh contexts: 898 loads with Playwright's defaults, then 898 more with the recommended setup.
- **Replays**: 8 puzzles across genres (LMD 000JAQ Moore slitherlink, 000THT masyu, 000MRB nurikabe, 000T39 star battle,
  000TM7 fillomino, 000G7N hex akari, 000FJM multi-grid, and TESTING.md's second akari puzz.link in its edit-mode import).
  One 26-step sequence through the engine driver: mode changes (`mode_set` to surface, line, number, lineE, sudoku),
  left click, right click, a three-cell line drag and a vertex-to-vertex edge drag (each `pu.mouseevent` with
  `mouse_mode` down/move/up at `pu.point[n]`, points named by cell index in `pu.centerlist`), `key_number`,
  `key_backspace`, `key_arrow`, `key_space`, `submode_check('sub_sudoku2')`, undo and redo. Each puzzle replayed twice,
  the second run with 150 ms of wall-clock time between steps, canonical state and wide dump compared after every step
  (26 checkpoints x 8 puzzles = 208 compared pairs per setup). Between 19 (hex akari) and 25 of the 26 steps changed
  canonical state, so the sequence does reach the engine. Run under Playwright's defaults, with the clock installed
  then paused an hour later, and twice with the recommended setup (150 ms and 300 ms of real time between the second
  run's steps).
- **Targeted tests**, one per suspected source: a reload in the same context after Penpa saved progress; cookies on a
  served origin (`openPenpa(..., { served: true, cookies })`); four viewport and `deviceScaleFactor` pairs; a read
  straight after `pu` exists against a settled read; real key presses through `main.js` at two gaps; the timer under a
  paused clock advanced by `clock.runFor`.
- The probe scripts are scratch, deleted with the worktree.

## Results in brief

- With Playwright's defaults, two loads of the same link gave the same canonical state for all 449 links; the only field
  that differed was the timer reading, in 4 of 449 pairs (10 vs 11 tenths of a second).
- With the defaults, all 208 replay checkpoints gave the same canonical state, but only because canonical state scrubs
  the timestamp: the raw `command_replay` timestamps differed at every checkpoint of the 7 solve-mode puzzles
  (e.g. 1100 vs 1400 ms on the first entry).
- With the recommended setup: 898 loads, 449 pairs, zero differences in canonical state or in the wide dump, timer
  included; and 208 replay checkpoints, zero differences, every timestamp 0, in each of two runs.
- No page error, no `console.error` and no native dialog in any run. The git.io link (a dead shortener, and the run has
  no network) opens an "Invalid URL" message box (Swal), the same both times.

## Sources found

| # | What differs | Where (file:line) | Setup that removes it | Verified |
|---|---|---|---|---|
| 1 | The stopwatch: `sw_timer` starts when a solve link loads and runs on the page's clock, so its reading depends on how long the run took. Seen in 4 of 449 load pairs (default setup). | start on load `docs/js/general.js:2307-2341`; easytimer reads `Date.now` (`docs/js/libs/easytimer.min.js`); written into duplicate links and saved progress `docs/js/class_p.js:2175`, `docs/js/class_p.js:2363` | `context.clock.install({ time })` then `context.clock.pauseAt(time)` (same instant) before the page opens; the timer reads 0 until the test calls `clock.runFor(ms)`. | yes: 449 pairs, timer equal |
| 2 | The timestamp in each `pu_a.command_replay` entry (index 5) is the timer reading in ms, so it depends on wall-clock time between steps. Differed at every checkpoint of 7 of 8 replays (default setup). Past 60 minutes it becomes `null`. | `record_replay` `docs/js/class_p.js:7291-7297`; undo `docs/js/class_p.js:6976`; redo `docs/js/class_p.js:7196`; cutoff `docs/js/class_p.js:226` | Same paused clock: every stamp is 0, or exactly the sum of the test's `clock.runFor` calls (two runs with `runFor(1000)` per step, one with an extra 300 ms of real sleep per step: both `[1000,2000,3000,4000]`). Canonical state also scrubs it (`REPLAY_TIMESTAMP`). | yes: 208 checkpoints, stamps equal |
| 3 | Clock installed but left running while the page loads, then paused later (`pauseAt(install + 1 h)`): the jump fires the timer once, and the reading at the pause (3599800 vs 3599900 ms) still depends on how long the load took. Close to the 60-minute cutoff, too. | as 1 and 2 | Pause at the install instant, before `goto`, as in 1. The page boots fine with a paused clock: no Penpa+ boot step waits on a timer. | yes: 4 of 8 replays differed this way; 0 with the pause before `goto` |
| 4 | Progress saved under `"penpa_" + md5(pu.url)` in localforage (IndexedDB, which works on `file://`). A second load in the same context restores it: the reopened page held the shaded cell, its undo and replay entries and the old timer (2.1 s), where a fresh load holds an empty board. | key `docs/js/progress.js:56-63`; save `docs/js/progress.js:69-99`, called on `beforeunload` and on `visibilitychange` to hidden `docs/js/main.js:2061-2076`; restored at boot `docs/js/general.js:46-58` and in `load` `docs/js/general.js:2521-2566` | A fresh browser context per load and per replay (what `openPenpa` already does); never reuse a context or reload a page between two runs that are compared. | yes: same-context reopen differed; a new context matched the first fresh load |
| 5 | Settings cookies from an earlier visit. `conflict_detection=3` empties `conflict_cells`, which canonical state writes (`[18,20]` without, `[]` with, on a duplicate digit in a 4x4 classic). Others seen changing `UserSettings` but not canonical state on load: `sudoku_centre_size`, `starbattle_dots`, `displaysize`. Only on an http(s) origin: Chromium keeps no cookie for `file://` (`document.cookie` stayed empty after `setCookie`). | `getCookie`/`setCookie` `docs/js/settings.js:10-19`; `loadFromCookies` `docs/js/settings.js:525`, called from `create()` `docs/js/general.js:85`, `docs/js/general.js:97` and `docs/js/general.js:2076`; `check_conflict` `docs/js/class_p.js:13678-13684` | Fresh context with no cookies (`openPenpa` with no `cookies`), or `file://`, where none can persist. | yes |
| 6 | Real key presses through `main.js` (UI driver only): in Surface, "1" then "2" within 300 ms is style 12, later it is style 8; in Sudoku, a key within 15 ms of releasing Shift switches the sub-mode. Real gaps of 50 and 600 ms gave 12 and 8. Under a paused clock with no advance `Date.now()` never moves, so every key counts as "within the limit" (12). The engine driver calls `key_*` directly and never reaches this code. | `docs/js/main.js:273-275` (limits), `docs/js/main.js:320`, `docs/js/main.js:330`, `docs/js/main.js:893`, `docs/js/main.js:908` | Paused clock, and the UI driver advances it by a fixed amount between key events (`clock.runFor`): 600 gave 8, 50 gave 12, every time. A recording that needs the combination must say so, since the step format carries no gap. | yes |
| 7 | Where a mouse event lands (UI driver only): `coord_point` subtracts `canvas.offsetLeft/Top` from `pageX/Y`, so the page pixel for a board point moves with the layout, and the layout depends on viewport width (`responsive_mode` and `innerWidth < 850`). The engine state itself did not depend on the viewport: 1280x720@1, 800x600@2, 1920x1080@1 and 400x800@3 gave the same canonical state and the same wide dump (`pu.point`, `pu.size`, canvas 1235 px backing / 494 px CSS) apart from the window size. `pu.resol` is a constant 2.5, not `devicePixelRatio`. | `docs/js/main.js:919-920`; `docs/js/main.js:2156-2160`; `docs/js/class_p.js:98` | Fix the viewport and `deviceScaleFactor` on the context (1280x720, 1) so the UI driver's layout is the same every run, and compute page pixels in the page from board units through the current layout, as the migration note already says. Not needed by the engine driver. | engine state: yes (4 viewports); UI pixel mapping: not run |

## Looked for and not found

- **Reading before boot ends.** `boot()` is async and not awaited by `onload` (`docs/js/main.js:69`); `load` awaits
  `PenpaProgress.tryLoad` before building `pu` from a solve link, and a puzz.link import runs from an un-awaited
  `import_url` (`docs/js/general.js:1987-1990`). `openPenpa` returns once `pu` exists, which could be early. In 9 tries (a
  solve link in query form, one in hash form, a puzz.link import, 3 times each) a read straight after `openPenpa` matched
  the settled read every time. Not seen, but the boot order allows it, so reads still go through `settle`.
- **`Math.random`**: none in Penpa+'s own scripts (`docs/js/*.js`). jQuery, select2, spectrum and canvas2svg in
  `docs/js/libs/` use it for DOM ids and SVG export only, nothing the engine state holds.
- **`performance.now`**: only in a commented-out line (`docs/js/main.js:953`).
- **Other `Date` uses**: cookie expiry (`docs/js/settings.js:16`) and Google Tag Manager's start time
  (`docs/index.html:34`, whose script `openPenpa` answers empty). Neither reaches engine state.
- **`devicePixelRatio`**: not read (`docs/js/class_p.js:98` has it commented out); verified at scale factors 1, 2 and 3.
- **Fonts**: `measureText` is used only while drawing (`docs/js/class_square.js:1730`, `docs/js/class_hex.js:1260`,
  `docs/js/class_tri.js:1088`, `docs/js/class_pyramid.js:1110`) and for the pause screen and GIF export; it decides
  pixels, not engine state. Pixel output was not compared.
- **`localStorage` besides progress**: spectrum keeps its colour palette under `spectrum.homepage`
  (`docs/js/main.js:63`); a fresh context starts without it, and it holds no engine state.
- **User agent**: `main.js` picks touch or mouse handlers from `navigator.userAgent` and `navigator.platform`
  (`docs/js/main.js:13-27`). Playwright's desktop Chromium gets mouse handlers every run; not varied here (phones and
  tablets are out of scope, `AGENTS.md`).
- **Timers inside the engine**: the solved message is shown by a 20 ms `setTimeout` (`docs/js/class_p.js:13368`,
  `docs/js/class_p.js:13406`), but `sol_flag` is set synchronously, so canonical state does not wait on it. Under a
  paused clock the message box appears only after a `clock.runFor`.

## Recommended setup for the tracer bullet (#29)

1. One fresh browser context per load and per replay run, created with no cookies and no storage state; close it after.
   Never reload or reuse a page between two runs that are compared.
2. Before the page opens: `await context.clock.install({ time: T })` and `await context.clock.pauseAt(T)` with the same
   fixed `T` (e.g. `new Date('2026-01-01T00:00:00Z')`). The timer then reads 0 and every replay timestamp is 0.
3. If a step must move time (the UI driver's key gaps, or a test of the timer), advance it with
   `context.clock.runFor(ms)` by an amount the recording fixes, never by a real sleep.
4. Context options `viewport: { width: 1280, height: 720 }` and `deviceScaleFactor: 1`, so the UI driver sees the same
   layout every run. (The engine state does not depend on them.)
5. Keep `openPenpa`'s catch-all route (no network) and its page-error and `console.error` collection, and read
   canonical state only through `settle`.
6. Keep canonical state's timestamp scrubber anyway: with 1-3 in place the stamps are equal, but a recording made in a
   human's browser carries real ones.

`openPenpa` takes no context options today, so 2 and 4 need either a `setup` hook (it already runs before the page
opens, which is enough for the clock) or a new option for the viewport. Choosing that is #29's call.

## Not settled

- The UI driver's pixel mapping across viewports was not run, since no UI driver exists yet; only the engine state was
  shown to be viewport-independent.
- Pixel output (canvas, fonts) was never compared; canonical state holds none of it.
- Only one input sequence was replayed. Modes not in it (multicolor, wall, cage, symbol, special, combi, move, board),
  `dblmouseevent` and Penpa's own live replay (`docs/js/general.js:960-1060`, which drives `setTimeout` from recorded
  timestamps) were not exercised.
