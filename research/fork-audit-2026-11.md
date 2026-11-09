# Fork audit, 2026-11-09: bugs, UI polish, and a test plan

Audit of the fork at `a23f6b9` (upstream `34e3fe9`, 2026-06-02), asked for by Chris on 2026-11-09. Six read-only passes ran in
parallel: core engine (`class_p.js`, `general.js`, `progress.js`), input and settings (`main.js`, `settings.js`,
`translate.js`), grids, importers and checkers (`class_*.js`, `puzzlink.js`, `conflicts.js`, `constraints.js`), desktop UI
(screenshots at 1280, 1600 and 1920 wide, light and dark), a live smoke run of every link in `TESTING.md`, and upstream's
issue tracker. Line numbers are `docs/js/` at `a23f6b9` unless a path is given.

Evidence classes: **LIVE** = reproduced in headless Chromium by a script kept under `.scratch/audit-2026-11-09/<pass>/`
(git-ignored, local only); **READ** = from the source only; **SUSPECT** = plausible, not confirmed. Three claims were
re-checked by hand after the passes (settings cookie expiry, the "All" constraint arrays, the `subsymbolmode` `innerHTML`
sink); all three hold. The UI pass's screenshots and its collected page are at
`.scratch/audit-2026-11-09/ui/report.html`.

## Bottom line

- Penpa+ loads cleanly: 428 of 430 `TESTING.md` links import with no page error or console error (median 329 ms), and
  upstream's mocha suite passes 415 of 415. The two misses are a 25x25 sudoku Penpa+ refuses on purpose and a git.io
  shortener the run did not fetch.
- That health is import-only. Nothing tests drawing, solving, undo, mode switching, saving, link round trips or the
  keyboard, and that is where the bugs below are.
- Three things should land before the redirect script (#2) sends every upstream link here: the two script-injection holes
  (S1, S2) and the dead-page boot failures (C3, C4).
- Settings have never survived a browser restart (I1). That and the Tab-set bugs (I2, I3) are the biggest daily
  irritants for a solver.

## Fork-level

- **F1 Analytics and identity are upstream's.** `docs/identity.js` sends page views to Swaroop's Google Analytics tag
  (`G-2WQYM10ZE7`) and titles popups "Swaroop says". It is upstream's own customisation seam, so the ChinStrap brand
  (AGENTS.md) goes here: `appOwner`, `errorTitle`, `infoTitle`, the solve messages, and `googleTag` (ours or empty).
- **F2 Upstream addresses in the page.** Besides `maketext_baseurl()` (#4), `docs/index.html` still names upstream in the
  OG/Twitter meta tags (lines 9-20), the Bookmarklet (line 1986, which opens links on upstream) and every help link
  (lines 1971-2000). The `<title>` and `logo.png` are the rest of the branding surface. Penpa+'s MIT copyright lines stay.
- **F3 Pages is fine.** The Pages API reports `errored`, but the last deploy run succeeded and the live `index.html`,
  `class_p.js` and `main.js` match the checkout byte for byte.
- **F4 The git guard blocks pushes to this repo.** `block-dangerous-git.sh` maps a fork to its parent; fix handed to a
  non-auto-mode session on 2026-11-09 (Chris ruled: judge the remote actually pushed to, and gate `gh pr create` on its base).

## Security

- **S1 HIGH LIVE: a crafted link runs script on open.** `subsymbolmode` (`class_p.js:1725`, and `:1738` for Composite)
  writes the mode name from the link (`pu.mode = JSON.parse(rtext[11])`, `general.js:2466-2483`) into `innerHTML`. A solve
  link with `<img src=x onerror=...>` as the Shape sub-mode fired on load. Such script can read and rewrite every saved
  puzzle's progress.
- **S2 HIGH LIVE: the Source field breaks out of an attribute.** `general.js:3186-3187` puts the source into the
  `<a href="$v">` template at `translate.js:765`; DOMPurify does not escape quotes in plain text, so `x" onmouseover=...`
  fired in a contest link. `general.js:2046-2050` also sets `#puzzlesourcelink.href` to a `javascript:` URL (in the DOM;
  execution on click not confirmed headless).

## Correctness and data loss

Ranked by what a solver or setter loses.

- **C1 HIGH LIVE: OR answer checks say "solved" on an empty grid** when any checked OR category is empty
  (`class_p.js:13408-13444`): `sol_flag=1`, "Congratulations", timer paused.
- **C2 HIGH LIVE: resizing the board breaks the stored answer.** Keys such as `"75,1E"` and OR `math` entries are not
  moved, and four OR cases are missing (`class_p.js:1258-1261`, `1281-1318`). A correct solve is never accepted.
- **C3 HIGH LIVE: a comma in Source kills the link.** `class_p.js:1948` does not escape it (Title, Author and Rules are);
  the header shifts and `atob` throws (`general.js:2085-2088`). Dead page.
- **C4 MED LIVE: boot dies with no message** on `?fbclid=…` / `?utm_source=…` (`general.js:28-47` reads the query instead
  of the hash; `progress.js:57` fails) and on a truncated link (`load()` from `general.js:1969` has no try/catch).
- **C5 HIGH LIVE: picking the "All" constraint after another breaks Sudoku mode.** `constraints.js:47-49` lists 11 modes but
  10 sub-modes and 10 styles, so every mode after Surface takes the next one's defaults; digits stop entering. It survives
  New grid (`general.js:194-197`).
- **C6 MED LIVE: answer checks made after a resize miss new edges** (`get_edge_solution`, `class_p.js:2542-2566`, never
  clears its cache): pentominous, araf, fillomino become unsolvable.
- **C7 MED-HIGH LIVE: in an alphabet sudoku, typing a digit blanks the board** (`conflicts.js:58/79/173` call
  `.toLowerCase` on a number inside `redraw`'s try, whose catch skips `draw()` after the clear, `class_p.js:12595-12610`).
- **C8 MED LIVE: one undo removes two moves after reopening saved progress.** The group counter restarts at 0 each load
  (`class_p.js:190`, `general.js:2678`) and equal neighbours merge (`class_p.js:6857-6875`).
- **C9 MED LIVE: copy/paste.** Sort comparators `(a,b)=>a>=b` never sort (`class_p.js:7381-7415`), so a selection dragged
  from the bottom right pastes one cell up and left; on triangle grids Ctrl+C always throws (`class_p.js:7391`). Upstream
  #221 (paste ignores grid transform) is related.
- **C10 MED LIVE: a failed puzz.link import wipes the current board** and leaves the dialog open with no error
  (`puzzlink.js:973-1025`, `general.js:1945`). Truncated URLs import with `NaN`/null clues; 0x0 and -3x5 sizes are accepted.
- **C11 MED LIVE: Rules, Title and Author text is mangled on reload** (`general.js:2034-2074` writes DOMPurify's HTML into
  text fields): `<`, `&` and `%2C` are damaged.
- **C12 MED LIVE: making an edit link empties the answer replay** (`class_p.js:2066`).
- **C13 MED LIVE: consecutive checkers treat every edge symbol as a bar** (`conflicts.js:502`, inverted `&&`/`||`), so a
  correct grid never shows "solved".
- **C14 MED LIVE: the sudoku conflict checker runs only on 9x9** (`conflicts.js:141`); 4x4 and 6x6 get none.
- **C15 MED LIVE (perf): every redraw draws twice** on puzzles with an answer check (`check_solution` calls `redraw` from
  inside `redraw`, `class_p.js:13435`), and each also re-runs `make_solution` and the conflict check.
- Lower (READ unless marked): saved progress keyed by `md5(p)` overrides a corrected answer on the same link
  (`general.js:44-61`); `localforage.setItem` not awaited so quota failures are unseen (`progress.js:93-97`); `beforeunload`
  on `document` never fires (`main.js:71`); undo of Erase on the Solution layer does nothing (`class_p.js:7250-7256`);
  resize leaves Move undo entries and legacy edge keys untranslated (`class_p.js:1156-1176`); rotation leaves ~1e-14
  offsets that send thermo/arrow ends down the diagonal branch (LIVE drift, `class_p.js:748-760`); `draw_cross` on
  triangles uses `**` for `*` (`class_tri.js:1667`); custom colours dropped by `draw_pills` and tri/pyramid tents numbers;
  two conflict caches that never hit or go stale (`conflicts.js:96/121`, `590/641`).
- Duplicated logic that will keep producing these: `undo`/`redo`/`record`/`record_replay` each copy the Problem and
  Solution branches (they already differ); stack handling is copied into four `maketext*` functions (C12); header fields
  are escaped one by one (C3); `make_solution` and `check_solution` repeat the AND/OR rules.

## Input and settings

- **I1 HIGH LIVE: no setting survives a browser restart.** The expiry `now + 86400000 * 2147483647` ms is past the largest
  Date, so every cookie is a session cookie (`settings.js:15-19, 27, 47, 514-520`); all 23 had `expires: -1`.
- **I2 HIGH LIVE: solve links erase the solver's Tab set.** Every solve link carries the setter's Tab set, even `"[]"`,
  which replaces yours (`general.js:2139-2140`); the dropdown shows nothing ticked; then any settings change saves the
  empty dropdown over your cookie (`settings.js:520`). `general.js:1941` compares an array with 0 (dead branch).
- **I3 MED LIVE: a Tab-set-only change is never saved** (the `tab_settings` setter has no `attemptSave`, `settings.js:309-312`).
- **I4 MED-HIGH LIVE: Shift+Tab never stays on Sudoku Corner or Centre**: Shift-up restores the stored sub-mode
  (`main.js:405-414`, `883-894`).
- **I5 MED LIVE: the held Ctrl/Shift sub-mode sticks** when its key-up is lost (Ctrl+F, Ctrl+L, Ctrl+Tab: no `blur`
  reset, `main.js:269-270, 417-427, 895-904`), and any key within 15 ms of Shift-up forces Corner (`main.js:320-324`).
- **I6 MED LIVE: Surface mode, the default, swallows every non-Ctrl key's browser action**: F5, F11, F1, Tab
  (`main.js:681-693`). Alt+Left (Back) is swallowed in every mode (`main.js:346-353`).
- **I7 MED LIVE: "conflict detection off for this puzzle" carries over to every later puzzle** (`settings.js:105-120, 472`).
- **I8 MED LIVE (synthetic): AZERTY digits in Number mode store `&é"`**; the `e.code` fix is Sudoku-only
  (`main.js:456-489`). IME input (`keyCode 229`) is unhandled (SUSPECT).
- **I9 MED-LOW LIVE: keys reach the board through Penpa's own dialogs** (Settings, Share, New Grid; `main.js:294-298`).
- Lower (LIVE unless marked): quick-panel off and the Z/X/C/V toggle are not kept; an `alphabet` puzzle disables Z/X/C/V
  for the session (`general.js:2233`); two tabs overwrite each other's settings; an unknown Tab entry throws on every Tab
  (crafted link only); Escape closes the parent dialog before its sub-dialog (`main.js:363-365`); five translation keys
  are missing, so three Sudoku import/export error dialogs and the square New Grid note are blank (`general.js:442, 743,
  1854-1891`); the middle-click Problem/Solution toggle matches the English title (dead in JP/ZH, `main.js:1078`, READ);
  Alt+3..9 in Multicolor do nothing (READ); right and middle clicks trigger toolbar buttons (READ).

## UI polish (desktop)

- **U1 HIGH: the board never grows.** A 9x9 stays 380 px at 1600 and 1920 wide (~70% of 1920 empty); at 1280x800 the timer
  is cut and Start/Pause/Stop are below the fold (`#buttons` 600 px, `base-structure.css:239`; `_displaysize: 38`,
  `settings.js:349`).
- **U2 HIGH: the light-theme mode highlight is near-invisible**: 1.18:1 fill, 1.45:1 ring (dark theme 6.06:1). Ticket #1.
- **U3 HIGH: the Tab/↵ dropdown shows nothing ticked on a solve link while Tab cycles** (I2's display half).
- **U4 MED: no keyboard reach**: 144 radios are `display:none`, ON/OFF toggles are spans, an active Tab set swallows Tab.
- **U5 MED: dark theme half applied**: rules popup, dropdowns, Show Rules and the board stay white; Dark-Grey swatch is
  `#444` on `#444`; Undo/Redo enabled vs disabled is 1.61:1.
- **U6 MED: the rules popup covers two thirds of the board**; only "Streaming 1 (beta)" docks rules.
- **U7 MED: the floating number panel opens at a fixed spot** (left 300, top 250) over column 1 at 1280 wide.
- **U8 MED: sudoku colour chips labelled "B G B G B R"**, no tooltips, white text below AA on four of them.
- **U9 MED: settings modal**: a 380 px scrolling column, no close button, 25 selects with no tied label.
- **U10 MED: Tab dropdown and Constraints select have a red 2 px border** that reads as an error.
- Lower: the board jumps 33 px in Edit mode on Number/Composite; 16 toolbar buttons lack tooltips and the gear has no
  name; label sizes 14/12/10 px; two modal styles overlapping the header; `style.css` is never loaded.
- Checked fine: no console errors in 8 load runs; the canvas is drawn at 2.5x and is sharp at device scale 2.

## Consistency

The bugs in Input and settings and most of U2-U9 come from one cause: each mode, dialog and setting makes its own rules
for keys, indicators and persistence. A draft interaction contract and three open questions were put to Chris in chat on
2026-11-09; the survey of other solvers is `research/solver-ui-interaction-survey.md`.

## Upstream

Upstream's tracker is small (33 open issues, 9 open PRs; ~24 are feature requests) and names none of the bugs above. Open
PRs worth taking: #216 (delete the circle in number-in-a-circle mode, 4 lines), #231 (sudoku import whitespace fix and
error messages), #229 (over-long link warning; also loads URLs without "penpa-edit"). #232 (Penrose wall mode) touches
shared wall input and needs review. None was diffed against the fork. Detail: `.scratch/audit-2026-11-09/upstream/`.

## Test plan

The seam AGENTS.md names (one-shot command, Playwright live tests under `live/`, CI) fits these findings. In order:

1. **One-shot import snapshots.** Upstream's 414 snapshots already pass headless over `file://` with no express server
   (`.scratch/audit-2026-11-09/geometry/snap.mjs`). Port that into `npm test` and drop the unpinned mocha/chai/live.js CDN
   loads. Every upstream merge is then checked against them.
2. **Node unit tests on pure data**, no browser: `constraints.js` array lengths match (fails today, C5); every
   `PenpaText.get` key exists (`.scratch/audit-2026-11-09/input/tr.js` loads `translate.js` in `vm`); header
   encode/decode round trip of any text including `, & = < %2C` (C3, C11); puzz.link decoders against pzprjs on the same
   URLs (snapshots today only check against themselves).
3. **Live tests, one file per contract** (`node:test` + Playwright, copying `sudokupad-scripts/live/`: collect page
   errors, wait with `settle`, never a sleep). Each bug above gets a red test first, marked `{ todo: '#<ticket>' }` until
   its fix lands, as sudokupad-scripts does:
   - boot: `?fbclid`, truncated link, comma in Source → `pu` exists or an error is shown (C3, C4);
   - security: the S1/S2 links → no dialog fires, no `on*` attribute in `#symmode_content`, `#combimode_content`, `#answer_key`;
   - answer check: `make_solution()` equals `pu.solution` after each `resize_*(±1)` and rotate/reflect (C2, C6); empty OR
     category is not solved (C1);
   - undo: after save, reload and one new move, one undo removes one move (C8); undo-all returns to the opened state;
   - settings: a table of every setting round-tripped through a new browser context (I1, I3, I7);
   - keyboard: a window listener records `defaultPrevented` for F5, F11, Tab, Alt+Left in each mode (I6); the held
     sub-mode is Normal after a lost key-up plus `blur` (I5); Shift+Tab lands on its target (I4).
   The audit's repro scripts (`engine/e*.mjs`, `input/t*.mjs`, `geometry/*.mjs`) are most of these already.
4. **Invariants under fuzz** (model: `sudokupad-scripts/live/fuzz/`): random action sequences on a few puzzles, checking
   after each step that there is no page error, one `draw()` per `redraw()` (C15), undo-all then redo-all returns the same
   state, and `maketext()` → load gives back the same state.
5. **Visual baselines** for a fixed set of boards in light and dark at 1600x900, compared pixel-wise, so a polish change
   shows what it moved.
6. **Gate**: the nightly upstream merge (#3) pushes only when 1-3 are green.
