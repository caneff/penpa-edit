# Glossary

The words this repo uses for Penpa+ and our changes to it. Terms come from Penpa+'s own UI and source (`swaroopg92/penpa-edit`).

- **Penpa+**: the puzzle editor and solver at `https://swaroopg92.github.io/penpa-edit/`. Not "Penpa" alone, which names the older original.
- **Solve mode**: Penpa+ opened from a puzzle link for solving (`pu.mmode === "solve"`). Edit mode is the setter's.
- **Mode**: one of Penpa+'s top-row input modes (Surface, Line, Number, Shape, Sudoku, ...), in `pu.mode[pu.mode.qa].edit_mode`.
- **Sub-mode**: the choice within a mode (Number's Normal, Long, Candidates, ...).
- **Style**: the color or look choice within a sub-mode (the digit keys pick one in Surface).
- **Tab set**: the modes checked in Penpa+'s Tab settings (`#mode_choices`), which a link carries; Penpa+'s Tab and
  Enter keys step through it. In the new solve UI it only seeds the pins.
- **Pin**: a mode and one of its sub-modes the solver keeps for Tab in the new solve UI; its style is the last one used
  on it. The same mode can be pinned with different sub-modes.
- **Tab cycle**: Tab and Shift+Tab stepping through the pins in the new solve UI. Not the Tab set, which only seeds them.
- **Upstream**: `swaroopg92/penpa-edit`, the Penpa+ this repo forks.
- **The fork**: this repo, served at `https://caneff.github.io/penpa-edit/`.
- **Redirect script**: `userscript/penpa-redirect.user.js`, which sends upstream's links to the fork.
- **Engine**: Penpa+'s puzzle model, grid geometry, importers and checkers: the part of upstream the fork keeps merging. Not "core" or "backend".
- **Owned file**: an upstream file the fork has taken over, marked `merge=ours`; a merge keeps our side.
- **First release**: the fork's ChinStrap-branded solve UI, live on Pages, solving everything Penpa+ solves; edit links go to upstream.
- **MVP**: the ChinStrap solve page behind a flag, over the engine as it stands, on every grid type and mode; the first
  milestone before the First release. Not "prototype" (the throwaway variants on `prototype/solve-ui`).
- **Mode family**: one of six groups of modes by what they place and how (Value, Paint, Path, Stamp, Genre tool, Move), from `research/penpa-mode-key-map.md`.
- **Recording**: one solve kept for replay: a list of steps a human reviewed once, plus the expected states the tool
  generated from them. Not "trace" (Playwright's word) or "script". A failing fuzz run is saved as one, unreviewed and
  with no expected states until its bug is fixed.
- **Step**: one input in a recording, in board terms: a pointer gesture on a board point, a content key, a mode change
  named by its mode, sub-mode and style, or an undo or redo. Solve mode checks the answer after every input, so the
  verdict is in every checkpoint and no step runs it.
- **Checkpoint**: a point in a recording where the replay compares state: after each finished gesture, content key, mode
  change, undo or redo, and at the end. The UI driver checks a digit in Surface and the colour change it makes as
  one, after both.
- **Engine driver**: replays a recording's steps as the engine calls their inputs made (`live/replay.mjs`).
- **UI driver**: replays a recording's steps as real mouse and keyboard input on the page; any checkpoint where it
  differs from the engine driver is a UI bug.
- **Bridge**: the layer the MVP calls to read and drive Penpa's engine as it stands; replaced by the engine API at the split.
- **Canonical state**: the engine's state written out the same way every time, so two replays can be compared line by
  line; timestamps and timers are left out.
- **Header**: the first lines of a link's saved text, holding the grid settings, Title, Author, Source and Rules as comma separated fields; `docs/js/header_text.js` escapes the text in them.
- **Safety net**: the recordings, the tests and the CI checks the migration runs under.
