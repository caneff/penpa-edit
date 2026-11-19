# Glossary

The words this repo uses for Penpa+ and our changes to it. Terms come from Penpa+'s own UI and source (`swaroopg92/penpa-edit`).

- **Penpa+**: the puzzle editor and solver at `https://swaroopg92.github.io/penpa-edit/`. Not "Penpa" alone, which names the older original.
- **Solve mode**: Penpa+ opened from a puzzle link for solving (`pu.mmode === "solve"`). Edit mode is the setter's.
- **Mode**: one of Penpa+'s top-row input modes (Surface, Line, Number, Shape, Sudoku, ...), in `pu.mode[pu.mode.qa].edit_mode`.
- **Sub-mode**: the choice within a mode (Number's Normal, Long, Candidates, ...).
- **Style**: the color or look choice within a sub-mode (the digit keys pick one in Surface).
- **Tab set**: the modes checked in Penpa+'s Tab settings (`#mode_choices`), which a link carries; Penpa+'s Tab and
  Enter keys step through it. In the new solve UI it seeds the pins.
- **Pin**: a mode and one of its sub-modes the solver keeps for Tab in the new solve UI; its style is the last one used
  on it. The same mode can be pinned with different sub-modes.
- **Tab cycle**: Tab and Shift+Tab stepping through the pins in the new solve UI. Not the Tab set, which only seeds them.
- **Review page**: `docs/gallery.html` (the file keeps the name "gallery"): a list of representative puzzles, each opened in `solve.html` inside an iframe at a size the reviewer picks, for going through the solve page by hand.
- **Upstream**: `swaroopg92/penpa-edit`, the Penpa+ this repo forks.
- **The fork**: this repo, served at `https://caneff.github.io/penpa-edit/`.
- **Redirect script**: `userscript/penpa-redirect.user.js`, which sends upstream's links to the fork.
- **Engine**: Penpa+'s puzzle model, grid geometry, importers and checkers: the part of upstream the fork keeps merging. Not "core" or "backend".
- **Owned file**: an upstream file the fork has taken over, marked `merge=ours`; a merge keeps our side.
- **First release**: the fork's ChinStrap-branded solve UI, live on Pages, solving everything Penpa+ solves; edit links go to upstream.
- **MVP**: the ChinStrap solve page behind a flag, over the engine as it stands, on every grid type and mode; the first
  milestone before the First release. Not "prototype" (the throwaway variants on `prototype/solve-ui`).
- **Board coordinates**: the Settings switch that labels the board's columns and rows in a gutter outside the canvas, so a solver can name a place
  in chat. When the board is scrolled in its card the labels stay at the card's top and left edges, over the cells. A square-cell grid gets its own row and column numbers; every other shape gets reference bands.
  "Number the grid only" (on by default, a sub-option of the switch) numbers only the grid inside the thick frame from 1, leaves the clue margin around it unlabelled, and repeats the numbers on the right and bottom edges; off, the whole canvas is numbered on the top and left only.
- **Reference band**: one of the equal strips, about 1.5 cells wide, that the board coordinates cut a non-square grid's bounding box into: letters
  A, B, C... across the top, numbers 1, 2, 3... down the left. Independent of the puzzle's geometry, so "the cell at C4" is a place, not a cell id.
- **Mode family**: one of six groups of modes by what they place and how (Value, Paint, Path, Stamp, Genre tool, Move), from `research/penpa-mode-key-map.md`.
- **Tool**: a mode with one of its sub-modes and, where it has them, one of its styles; what the solver picks and pins.
- **Tool group**: one of the seven headings the Mode card files tools under, by what the tool puts on the board
  (Shading and colour, Lines through cells, ...). It groups tools, not modes: the tools of Composite or Line sit in
  several. Not a Mode family, which groups whole modes by how their keys and clicks work.
- **Subgroup**: a heading under the Symbols and marks tool group (Solving marks, Shapes, Arrows, Signs and small marks, Genre
  symbols), so that group's tree is four levels deep and the others three.
- **Symbol entry**: a symbol of the Mode card's tree that comes in several sizes or colours; its sizes or colours are its variants,
  one level below it, each a tool.
- **Desk**: the solve page's work area under its top bar, holding the cards; its layout is fitted to the window and puzzle when
  the desk opens fresh, when Reset layout is pressed, and when the window changes size while no card has been moved or
  resized. The places the solver gives cards hold for every puzzle; the cards' sizes hold only for the puzzle they were set on.
- **Automatic size**: a card's width or height while the solver has not dragged that edge: the size a fresh load would
  give it. Mode and Mouse are as tall as the tallest of the pinned tools and the current tool; in a column the solver
  has not changed, Rules takes the rest of it, and Recent is as tall as its chips (#306), both ending on the desk's bottom. A double-click on a dragged edge's
  handle makes that axis automatic again, and the card's place too once no size of it is the solver's; Reset layout
  does it for every card.
- **Stream fit**: the desk laying itself out for a stream (`STREAM-FIT.md`): on a request from the stream userscript, the board's ink fills the board box and the Mode, Pinned and Mouse cards sit in the side box. Never kept in the layout.
- **Board box**: the box, in viewport CSS px, where a stream shows the board; the stream fit puts the ink rect in it.
- **Side box**: the box beside the board box, outside the stream's crop, where the stream fit puts the Mode, Pinned and Mouse cards.
- **Ink rect**: the bounding box, in viewport CSS px, of what the board draws other than its canvas's own margin, read from the pixels; the stream fit's reply.
- **Card**: one movable, resizable panel of the desk: Board, Mouse, Rules, Pinned, Mode or Recent. Every card but the Board can be closed by its × and shown again from the top bar's **Cards menu**; a closed card stays closed through a reload and Reset layout.
- **Cards menu**: the top bar's menu that shows or hides each card but the Board, one checkbox per card, with Reset layout as its last item.
- **Trial**: the solve page's way to guess (#258): Try marks the undo history, and Keep or Discard later keeps or undoes
  everything entered since. Trials nest; puzz.link calls it trial mode.
- **Stage**: one Try's mark in a trial, ended by Keep, Discard, Restart, or an undo by hand to before it; the top bar
  shows how many are on as "Trial <n>".
- **Hold**: a held Shift or Ctrl lending Sudoku's Corner or Centre tool until the key comes up; the solve page always
  ends it (key-up, a lost window, a hidden tab, a dialog, Tab or a tool picked).
- **Recording**: one solve kept for replay: a list of steps a human reviewed once, plus the expected states the tool
  generated from them. Not "trace" (Playwright's word) or "script". A failing fuzz run is saved as one, unreviewed and
  with no expected states until its bug is fixed.
- **Step**: one input in a recording, in board terms: a pointer gesture on a board point, a content key, a mode change
  named by its mode, sub-mode (Shape's or Composite's tool) and style (and Number's orientation), a selection key
  (Escape or Ctrl+A), or an undo or redo. Solve mode checks the answer after every input, so the
  verdict is in every checkpoint and no step runs it.
- **Checkpoint**: a point in a recording where the replay compares state: the board the link loads, after each finished
  gesture, content key, mode change, selection key, undo or redo, and at the end. The UI driver checks a digit in
  Surface and the colour change it makes as one, after both, and a Multicolor colour key and the style it sets the same way.
- **Solve history**: every board change a solver made on a puzzle, in order and with the timer's reading at each,
  which Penpa+'s Share > Replay link carries. Tier C turns one into a recording.
- **Answer-aimed fuzz**: many generated full solves of a puzzle with an answer check, each checked for no page error
  and for the answer check reading unsolved until the last correct entry and solved after it.
- **Engine driver**: replays a recording's steps as the engine calls their inputs made (`live/replay.mjs`).
- **UI driver**: replays a recording's steps as real mouse and keyboard input on the page; any checkpoint where it
  differs from the engine driver is a UI bug.
- **Bridge**: the layer the MVP calls to read and drive Penpa+'s engine as it stands (`docs/js/engine_bridge.js`); replaced
  by the engine API at the split.
- **MVP gap**: a bridge behaviour that has to read or patch Penpa+'s internals, marked so in its comment with the reason;
  the engine API must do it natively at the split.
- **Engine API**: the calls and events the solve UI uses to read and drive the engine. It starts as the Bridge's
  interface; the split re-implements it over the engine's own code. Not a second interface the UI is ported to.
- **Canonical state**: the engine's state written out the same way every time, so two replays can be compared line by
  line; timestamps and timers are left out.
- **Header**: the first lines of a link's saved text, holding the grid settings, Title, Author, Source and Rules as comma separated fields; `docs/js/header_text.js` escapes the text in them.
- **Safety net**: the recordings, the tests and the CI checks the migration runs under. Its live files (`SAFETY_NET_FILES` in
  `live/run-live.mjs`) are the recordings' replays, the fuzz, Tier C, the plants and the upstream links; a PR whose change
  cannot reach them skips them (#268), and one that cannot reach `docs/index.html` skips all but the UI driver's replays
  (#315).
- **Engine side**: the safety net's live files but the UI driver's replays (`ENGINE_FILES` in `live/run-live.mjs`): the
  engine driver's replays, the fuzz, Tier C, the plants and the upstream links, which open only `docs/index.html`. Its
  inputs are what that page loads and what those files import or read; a PR that changes none of them skips it (#315).
- **Plant**: a one-line bug served in place of a file while a test runs, to measure whether the safety net catches it
  (`live/plants.mjs`). A plant in `docs/js/` is served while recordings replay, and is caught when a replay with it differs
  from its expected file, fails its duplicate-link round trip, throws at a step, or raises a page error or `console.error`.
  A plant in `docs/ui/` (`UI_PLANTS`) is caught when the UI fuzz finds it, shrinks it and replays it.
- **UI fuzz**: random lists of actions on `solve.html`, checked by rules (`live/ui-fuzz/`, `npm run fuzz:ui`). Not the
  recordings' fuzz (`live/fuzz.mjs`), which drives the engine.
- **Action**: one thing a solver does in the UI fuzz (a kind and its numbers, `live/ui-fuzz/actions.mjs`). Not a **Step**,
  which is a recording's input. The fuzz prints an action's place in its list as "step N" (and `--max-steps` caps the list's
  length): a position, not a recording's Step.
- **Action list**: the actions one fuzz run draws, naming its puzzle first; shrunk on a failure and replayed from its path.
- **Rule**: something that must hold on the solve page after every action of a UI fuzz run (`live/ui-fuzz/rules.mjs`); a broken
  rule fails the run as a crash does.
- **Area**: the card or part of the page an action kind exercises; `--focus <area>` draws its kinds more often.
