# Solving aids other apps have that the solve page lacks (2026-11-17)

Asked by Chris, 2026-11-17: what UI features could the MVP solve page add cheaply that would help people solving pencil
puzzles? Built from three inputs:

- `docs/ui/` and `docs/js/engine_bridge.js` on master 0ae0925, read for what the solve page already does;
- `research/penpa-modes-and-script-ideas.md` § 2 (Penpa+'s source, for what the engine already holds);
- a survey of other apps' own docs this session. Its sources are listed under each row.

"Cost" is a guess from the code read. Small means a UI file plus an engine call over data Penpa+ already keeps.
Medium means a new engine call or a board overlay. Large means changing Penpa+'s drawing or checker code.

## What the solve page has now

- Undo, redo, Restart, the timer with Pause (F4), and Open in Penpa+.
- The solved dialog, with the setter's own words.
- Settings: Board look, Checking (conflict detection, pencil-mark checking, line colour match, Star Battle dots), Progress
  (save in the browser, history copy, ask before leaving, clear), and the Z/X/C/V keys.
- Pins, presets, the Mode and Mouse cards, Rules, Recent, and a paste-a-link box.
- In flight: row and column numbers (#249) and map-style board coordinates for other grid shapes (#250).

## Gaps, ranked by value for cost

| # | Feature | Who has it | Penpa+ today | Cost |
|---|---|---|---|---|
| 1 | **Copy a link with my progress**, to ask for help or carry on elsewhere | Penpa+ (Share → Clone URL, history in the URL) | `maketext_duplicate()` builds it; the solve page has no button for it | Small |
| 2 | **Solved line to copy**: "Solved <title> in 12:34", plus a replay link | SudokuPad (replay, GIF export) | Penpa+ already logs `command_replay` and builds a replay link (`maketext_replay`, modal "Share Replay") | Small |
| 3 | **Trial mode**: mark a point, try a guess, then keep or throw away everything since the mark; marks can nest | puzz.link (Trial mode button, accept or reject one stage or all) | Only linear undo. Undo-to-a-mark gives keep/throw-away on top of the undo stack; a different ink colour for trial entries needs drawing changes | Small to medium (without trial ink), large (with it) |
| 4 | **Bookmarks**: named snapshots of the board, restore any one | none of the surveyed apps; asked for before (script idea a) | The restore path exists in `load_data`; there is one save slot per puzzle | Medium |
| 5 | **Keyboard shortcut sheet** on `?` | SudokuPad documents its keys on its page; Penpa+ in its README | The solve page lists keys only in the Mouse card and tooltips | Small |
| 6 | **Rewind to the last correct state** (undo until no entry is wrong; redo is kept) | SudokuPad, through the Extended Checks userscript | Needs a puzzle with an answer in it. It gives away information, so it needs a confirm and a ruling on spoilers | Medium |
| 7 | **Colour each line by connected piece** (irowake), for loop puzzles | puzz.link (Config `irowake`, a "change colours" button) | None; "Any colour matches a green line" is a different thing | Large (drawing code) |
| 8 | **Loop progress**: loose ends, branches, a loop closed too early | puzz.link marks errors (`autoerr`) | None (`getloopdata` exists for the answer string only) | Medium (overlay) |
| 9 | **Live counts**: stars or shaded cells per row, column and region; killer cage sums | puzz.link greys completed clues (`autocmp`) | Star Battle reports only over-counts; no sums anywhere | Medium (overlay per genre) |
| 10 | **Check answer now** without a setter answer (rule check on demand) | puzz.link (Check button, per-genre checker) | Penpa+ checks only against the setter's answer, and conflicts only for tagged genres | Large (one checker per genre) |

Rows 1, 2 and 5 are pure UI over what the engine already has. Rows 3 and 4 add one engine call each. Rows 7 to 10 are
genre work, after the MVP.

## Sources

- puzz.link / pzprjs: `docs/Config.md` (`autocmp`, `autoerr`, `irowake`, `irowakeblk`), `Changelog.md` 0.6.0, 0.10.0, 0.13.0,
  `docs/Puzzle.md` (trial mode), at github.com/robx/pzprjs.
- SudokuPad: sudokupad.app (keys), Sven Neumann on ShopTalk Show episode 619 (replay, GIF export), the Extended Checks
  userscript page (dev-sudokucolors.netlify.app/extendedchecks/).
- Penpa+: its README at github.com/swaroopg92/penpa-edit, and the source notes in `penpa-modes-and-script-ideas.md`.
- f-puzzles' "Highlight conflicts" comes from a Logic Masters forum post only.

## Not verified

- SudokuPad's settings menu (highlighting, auto pencil marks, fog, zoom): it is in the app, not in any doc that was read.
- f-puzzles' own help, Conceptis, pzv.jp and Puzzle Square JP were not read.
- Accessibility, zoom and pan in any of the apps.
- Whether undo-to-a-mark (row 3) keeps the timer, conflicts and saved progress consistent. That needs a live test.
