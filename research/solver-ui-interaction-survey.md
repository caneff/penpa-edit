# How other solver UIs keep their interactions consistent: a survey for Penpa+'s interaction contract

Asked for by Chris on 2026-11-09, to inform an interaction contract for the fork (solve mode first, desktop only). Read on
2026-11-09. Sources are each tool's own docs, help text, changelog or served source; no aggregator or blog was used for a
claim. Each claim is marked **documented** (the tool's own help, manual or changelog says it), **source** (read in the
tool's served or published code, not run) or **not determined**. "Run" means it was exercised in a browser; very little
here was.

What was read, per tool:

- **Penpa+** (baseline): the fork at `dce66ca` (upstream `34e3fe9`, 2026-06-02), through the notes already written:
  `research/penpa-modes-and-script-ideas.md` (Tab cycle, mode indicators), `research/penpa-mode-key-map.md` (every key
  and click by mode family) and `research/fork-audit-2026-11.md` (input, settings and dialog bugs, partly LIVE). Plus
  `docs/js/main.js` lines 340-380 (Escape) and 2065-2080, 2295-2310 (`visibilitychange`). Not redone here.
- **SudokuPad** (Sven Neumann): v0.616.0 JS as recorded by the sudokupad-scripts live harness
  (`~/.cache/sudokupad-scripts/live/sudokupad.har`, recorded 2026-11-09 07:45): `script.js`, `framework.js`,
  `controls-tools.js`, `tool-color.js`, `tool-pen.js`, `tool-letter.js`, `tool-select.js`, `style.css`, page HTML. Plus the
  sudokupad-scripts notes read from v0.611.0: `docs/research/sudokupad-pen-edge-marks.md`, `sudokupad-pen-line-mode.md`,
  `sudokupad-color-tool.md`, `sudokupad-letter-tool.md`, `sudokupad-dialog-slide-in.md`.
- **Puzzle Square JP** (puzsq.jp, now redirecting to `https://puzsq.logicpuzzle.app/`, v3.0.16): its Next.js chunks
  (`app/layout-d1f58d3de10937e9.js`, `7913-14022942dd3b3570.js`, `8143-36d445e48aa76e7a.js`, `6119-57d68b1a00d1fdb5.js`),
  its FAQ page (rendered), and one puzzle page rendered in headless Chromium
  (`https://puzsq.logicpuzzle.app/puzzle/10000`). Finding: its solve UI for pzpr-family puzzles is **puzz.link's player
  in an iframe** (the page loaded `https://puzz.link/p?heyawake/...`, `puzz.link/js/pzpr.js` and `pzpr-ui.js`), so its
  solve interactions are pzprjs's below.
- **puzz.link / pzprjs**: `robx/pzprjs` (the maintained fork puzz.link serves; `sabo2/pzprjs` was last pushed
  2019-07-17) at `ba714a2` (2026-11-01), via the GitHub API: `docs/InputModes.md`, `docs/Config.md`,
  `src/puzzle/KeyInput.js`, `src/puzzle/MouseInput.js`, `src/variety-common/MouseInput.js`,
  `src/variety-common/KeyInput.js`, `src/variety/heyawake.js`, `src/variety/slither.js`, `src-ui/js/ui/Event.js`,
  `MenuConfig.js`, `ToolArea.js`, `src-ui/p.html`.
- **f-puzzles** (Eric Fox): served files at `?v=1.11.3` from `https://f-puzzles.com/`: `Inputs.js`, `Main.js`,
  `Settings.js`, `Popups.js`, `Extra Functions.js`, `Sidebars.js`, `Button.js`, `Cell.js`, and the in-app changelog
  `~ Change Log.js` (newest entry "01/16/2021 - Version 1.11.2").
- **Cracking the Cryptic**: the CTC web app's own help, "Sudoku - How to Play", `https://cracking-the-cryptic.web.app/how-to-play`
  (text read from its bundle `static/js/main.148c7044.chunk.js`). `app.crackingthecryptic.com` is SudokuPad
  (sudokupad-scripts `AGENTS.md`: crackingthecryptic.com only redirects to SudokuPad). The Steam/mobile apps (Studio Goya)
  were **not covered**: the only detailed controls page found is a player-written Steam Community guide
  (`https://steamcommunity.com/sharedfiles/filedetails/?id=1922759124`), which is not a primary source and is not used.
- **Logic Masters Deutschland**: help page "How to solve puzzles", `https://logic-masters.de/Raetselportal/Hilfe/loesen.php?chlang=en`,
  and one puzzle page (`zeigen.php?id=0007ZG`). LMD has **no solve viewer of its own**: the help says to print the
  puzzle, and puzzle pages link out to SudokuPad, Penpa+ and f-puzzles.
- **GAPP / gmpuzzles**: GAPP is "Genuinely Approachable Pencil Puzzles", a daily puzzle project on the CTC Discord, not
  a viewer (bakpao, "#84 - GAPP & MTG puzzle collection", `https://puzpao.blogspot.com/search/label/GAPP`, an author's
  own post); its puzzles link to puzz.link, pzprxs and Penpa+. GM Puzzles' "Notes on Penpa-Edit"
  (`https://www.gmpuzzles.com/blog/penpa-edit-notes/`) says it adopted Penpa-Edit in 2021 for digital solving; its
  current posts also link SudokuPad replays. **Neither has a viewer of its own**, so both inherit Penpa+, puzz.link and
  SudokuPad's interactions.
- **Sudoku.coach**: the help pages are rendered client-side and did not render in two tries (`/en/about/help`,
  `/en/about/faq`; `/en/help` is 404). Read instead: the in-app "Keyboard Controls" dialog's data and settings strings in
  its (obfuscated) bundle `https://sudoku.coach/js/jCfXtZf-1776367508519.js`.
- **HoDoKu**: "HoDoKu: User Manual (Chapter 2: Playing the Game)", `https://hodoku.sourceforge.net/en/docs_play.php`.
- **Simon Tatham's Portable Puzzle Collection**: "Chapter 2: Common features"
  (`https://www.chiark.greenend.org.uk/~sgtatham/puzzles/doc/common.html`), "Chapter 11: Solo" (`.../doc/solo.html`),
  "Chapter 23: Loopy" (`.../doc/loopy.html`), and the developer docs "Chapter 6: How to write a new puzzle"
  (`.../devel/writing.html`), "Chapter 2: Interface to the back end" (`.../devel/backend.html`) and "Chapter 4: The API
  provided by the mid-end" (`.../devel/midend.html`), version 20260923.616da16.
- **Added: SudokuMaker** (`https://sudokumaker.app/`), because its keyboard layer is the most deliberately engineered
  one found (user-rebindable hotkeys, blur-safe modifiers, versioned settings). Read: its bundle
  `assets/main-CLLf-nZ4.js` (no help page: `/help`, `/faq`, `/about` are 404).
- **Tried and not covered**: Kudamono (`https://pedros.works/paper-puzzle-player` returned 401; `/kudamono/player` and
  `/kudamono/docs` are ~500-byte shells; not pursued). Logic Puzzle App beyond Puzzle Square JP was not looked at.

## (a) Comparison table

S = source, D = documented, ND = not determined, "-" = the tool has no such thing.

| Tool | Modes and how switched | Where the mode shows | Keyboard model | Temporary modes and revert | Selection | Dialogs and rules | Settings persistence |
|---|---|---|---|---|---|---|---|
| Penpa+ | 12 solve modes; buttons, Tab/Enter cycle over a ticked set from a private index, Z/X/C/V only from Surface/Sudoku | 1px orange ring on a grey button, off board; board cursor in 2 modes | digit = value, brush or applied colour by mode; most keys mean nothing outside Value modes | Shift/Ctrl in Sudoku only; key-up only, no blur reset | cursor or multi-select in Value, Multicolor, Shape; none elsewhere | Escape closes first open modal; settings has no close button; keys leak through dialogs; rules in a popup | cookies, session-only by bug; Tab set overwritten by links; progress on unload/hide |
| SudokuPad | Digit, Corner, Centre, Colour, Pen (setting), Letter (setting); buttons, Z X C V B N M, Space / Shift+Space and PageDown/PageUp cycle from the base tool (S) | selected tool button plus the number pad swapping to the tool's own pad, off board (S) | digit = the current tool's value; Delete = clear the current tool's layer; Z..M and Space global (S) | Shift or Alt = corner, Ctrl = centre, Ctrl+Shift/Alt = colour; revert on modifier key-up and on window blur/focusout (S) | multi-select; drag, Ctrl/Shift add/toggle, double-click smart select, arrows and WASD with wraparound, Ctrl+A, Ctrl+I invert, Escape deselect (S) | one dialog at a time; Escape cancels, overlay click cancels, board handlers paused while open; settings has Back; rules docked in the side panel (S) | settings to localStorage on each change (throttled 0.5-2 s); current tool saved; URL `?setting-x` overrides are temporary; progress per puzzle on each action (S) |
| Puzzle Square JP | its solve UI is puzz.link in an iframe (S, run); site adds full-width and sidebar toggles | as puzz.link | as puzz.link | as puzz.link | as puzz.link | site modals: Escape closes only the topmost (stack), body scroll locked (S); rules on the puzzle page tab, outside the player | as puzz.link (the iframe) |
| puzz.link / pzprjs | one genre per page; input mode `auto` by default, explicit modes (shade, unshade, line, peke, number, ...) in a tool-area panel (D, S) | tool-area panel, selected child highlighted, off board; panel disabled when only one mode (S) | digits only in number genres, at a single cursor; Alt deliberately unused ("ALT is for menus", source comment) (S) | Shift or Cmd held swaps left/right mouse buttons; Z held = check-connection mode; both reset on blur (S) | single cursor, no wraparound; first key press only shows the cursor (S) | ND for Escape (no handler found in the UI files read) | localStorage on `pagehide` only if changed; input mode and button swap are volatile (not saved); global (S) |
| f-puzzles | Normal, Corner, Center, Highlight; sidebar buttons, Z/X/C/V (D changelog 1.1.0, S) | the enter-mode button highlighted, including a held temporary mode (S) | digits enter in the current mode; Space toggles the timer in solving (S) | Shift = corner, Ctrl = center while held, revert on key-up (S); stuck-modifier fix on tab switch (D 1.2.0); no blur handler found (S) | multi-select; drag, Shift/Ctrl add, arrows with wraparound, Shift-arrow extends (D 1.7.0, S) | one popup at a time, each with an X button; Escape closes; board keys blocked while open; rules docked in the solving sidebar (S) | only if the user ticks "Save Settings in Browser"; then saved on change (S) |
| CTC web app | Normal, Corners, Centre, Highlight; Z/X/C/V, Space cycles all four (D) | ND | digits 1-9, numpad too (D) | Shift = corners, Control = centre while held; "When you release the key you will be returned to the previous mode" (D); blur ND | drag, Control-click adds, arrows/WASD with wraparound (D) | ND | ND |
| LMD | no viewer; links out | - | - | - | - | rules on the puzzle page | - |
| GAPP / gmpuzzles | no viewer; links to puzz.link, pzprxs, Penpa+, SudokuPad | - | - | - | - | rules on the post | - |
| Sudoku.coach | Solution, Cell Candidate, Box Candidate, Colour; Y or Z, X, C, V; Space switches solution/candidate (S, in-app dialog) | ND | Ctrl+digit = cell candidate, Shift+digit = box candidate, Alt+digit = highlight digit, as chords (S) | none found: modifiers are chords, not held modes (S) | arrows/WASD, Ctrl or Shift + click or arrows adds, Ctrl+Shift+Alt+click symmetrical, double-click similar cells, Esc deselect (S) | the controls dialog has a Close button (S) | progress saved on the server (S string "Your progress is now automatically saved"); settings ND |
| HoDoKu | one main input, colouring as a separate mode from palette or status bar (D) | mouse cursor changes in colouring mode; status-bar label "Coloring: Cell / Candidate" (D) | digit sets value; Ctrl+digit toggles candidate; A-E colours, Shift+A-E the opposite colour (D) | Shift+Ctrl shows the cell's candidates, Shift+Alt the grid's, while held (D) | focus cell with arrows; Ctrl/Shift-click multi-select; Home/End jumps (D) | Esc ends colouring mode (D) | `.hcfg` configuration files; puzzles to `.hsol` (D) |
| Tatham's collection | mostly modeless; Solo: right-click (or Enter at the keyboard cursor) selects pencil marks (D) | Solo: the cursor itself shows normal vs pencil (D) | digits enter; Space clears; common shortcuts N, U, R, Q, Ctrl+Z (D) | - | single keyboard cursor, hidden on mouse use (D, devel 6.3.3) | native menus and dialogs | Preferences per game in a config file where supported; doc 2.4 still says the games save nothing (D, contradiction) |
| SudokuMaker | Digits, Corner, Candidates, Colour; default hotkeys Z/X/C/V on physical key codes, user-rebindable (S) | ND | hotkeys matched with exact modifiers; keys ignored in inputs, textareas, selects, contentEditable (S) | modifier state tracked; window blur sends a synthetic key-up for every held modifier (S) | ND | Escape bound to "exit constraint editor" and "stop solver" by default (S) | every preferences change written to localStorage at once, versioned with migrations, synced across tabs (S) |

## (b) Per-tool notes

### Penpa+ (baseline)

All from the fork's own notes; see those for line numbers.

- Modes, switching and indicator: `research/penpa-modes-and-script-ideas.md` § 1. The Tab cycle keeps a private index that
  never reads the current mode, has a first-press skip and runs in list order; the only constant indicator is a 1px
  orange ring on a pale label, off the board, which the audit measured at 1.18:1 fill, 1.45:1 ring in the light theme
  (`research/fork-audit-2026-11.md` U2).
- Keys and clicks by family: `research/penpa-mode-key-map.md`. A digit is a value (Value), a brush (Surface) or a colour
  applied to the selection (Multicolor); selection exists only in Value, Multicolor and Shape.
- Temporary modes: Shift/Ctrl in Sudoku only; no `blur` reset, so a lost key-up leaves Corner or Centre on
  (audit I5, LIVE); Shift+Tab never stays on Corner/Centre (I4).
- Browser keys: Surface swallows F5, F11, F1, Tab; Alt+Left is swallowed everywhere (I6).
- Dialogs: Escape closes the first visible `.modal` (`main.js:359-376`) and otherwise clears the selection; Escape
  closes a parent before its sub-dialog (audit, Lower); keys reach the board through Settings, Share and New Grid (I9);
  the settings modal has no close button (U9); rules open in a SweetAlert2 popup covering two thirds of the board (U6).
- Settings: cookies whose expiry is past the largest Date, so session-only (I1); a solve link replaces the solver's Tab
  set (I2); a Tab-set-only change is never saved (I3); "conflict detection off for this puzzle" carries to later puzzles
  (I7). Progress: `PenpaProgress.save()` on `beforeunload` and `visibilitychange` to hidden (`main.js:2065-2076`).

### SudokuPad

All source, v0.616.0 unless marked.

- **One funnel for tool changes.** Every path (button, hotkey, Space, PageUp/PageDown, held modifier, blur) calls
  `App.changeTool(tool, tempChange)` (`script.js` ~3557). It clears `button.selected` on every `.controls-tool` button,
  marks the new one, swaps the `tool-<name>` class on `.controls-main` (which swaps the pad's contents), runs the old
  tool's `handleToolExit` and the new one's `handleToolEnter`, and, unless temporary, saves the tool with
  `Framework.setData('tool', ...)`. `init` restores the saved tool at start.
- **Cycling steps from where you are.** `changeToolNext`/`changeToolPrev` index from `this.prevTool || this.tool`, that
  is, from the base tool even while a temporary tool is showing, and wrap. Space = next, Shift+Space = previous,
  PageDown/PageUp the same without Ctrl (`handleKeydown`).
- **Hotkeys are global.** `App.toolHotkeys = ['KeyZ','KeyX','KeyC','KeyV','KeyB','KeyN','KeyM']` map to the tools in the
  order they were added (Digit, Corner, Centre, Colour, then Pen, Letter and so on when enabled), with no Shift or Ctrl,
  from any tool (`handleKeydown`). Physical key codes, not characters.
- **Temporary tools.** Each tool may declare a `tempKey` predicate (`controls-tools.js`): Corner = no Ctrl and (Alt or
  Shift); Centre = Ctrl and not (Alt or Shift); Colour = Ctrl and (Alt or Shift). On keydown a matching `tempKey` calls
  `changeTool(name, true)`; on keyup of Control, Shift, Alt or Meta, `changeTool()` with no argument returns to
  `prevTool` (`handleKeyup`). `handleBlur`, bound to `window` `blur focusout`, clears all held keys and calls
  `changeTool()` (`script.js` 4729-4735). A numlock+Shift workaround and an X11 key-up workaround are both in
  `updateKeys`. The Letter tool moves the corner modifier to Alt when Shift is chosen for letters
  (`tool-letter.js` header comment lists six activation options; sudokupad-scripts `sudokupad-letter-tool.md`).
- **What a digit means.** `doPressDigit(digit)` first offers the digit to the current tool's `handleToolButton`; if the
  tool does not take it, it becomes `act({type: <tool's action>, arg: digit})` on the selection (`script.js` 4748-4753).
  So in Digit, Corner, Centre and Colour, a digit is "this tool's value, applied to the selected cells" (Colour's
  `handleToolButton` is commented out in `tool-color.js`). The Pen tool takes the digit as its colour
  (`handleToolButton` calls `setSelectedColor`, and its `keyHandlers` swallow `/[0-9]/` while Pen is current), so in
  Pen a digit is a brush. That is the same split Penpa has between Multicolor and Surface, with one rule behind it: a
  tool that has a selection applies the digit; Pen, which clears the selection (`actSend` sends `deselect` before and
  after), picks a brush.
- **Delete/Backspace** = `act({type: 'clear', arg: this.tool})`: clear the current tool's layer on the selection.
- **Tab** is tool-specific: in Colour, Tab steps the palette page (Tab+Shift back, Tab+digit to page n), Alt-left held
  enters colour edit mode (`tool-color.js` `handleKeydown`); with the Letter tool on, Tab and `/` toggle letter mode
  (`tool-letter.js` `keyHandlers`). Otherwise Tab is left to the browser.
- **Selection.** `handleDragStart`: a click without Ctrl/Shift selects that cell only; with Ctrl or Shift it toggles the
  cell and the drag continues in that sense (select or deselect); a click off the grid deselects (delayed when 4+ cells
  are selected and a modifier is held). Arrow keys and WASD move from the last selected cell with wraparound
  (`handleKeySelect`, modulo rows/cols), Ctrl or Shift extends. Ctrl+A all, Ctrl+Shift+A none, Ctrl+I invert, Escape
  deselects. Double-click or long press calls `smartSelectCell` (cells like this one).
- **Mouse buttons.** No `event.button` test was found in `script.js`, `tool-color.js` or `tool-pen.js`, and
  `Framework.disableContextMenu` suppresses the context menu; a live run on 0.611.0 found a right click on an edge
  does what a left click does (`sudokupad-pen-edge-marks.md` § Right click).
- **Pen strokes.** A drag's first segment decides draw or erase for the whole stroke (`getEraseMode`, set once per drag in
  `handleDragMove`); line mode `both` / `centeronly` / `edgeonly` decides where the ends snap
  (`sudokupad-pen-line-mode.md`, run). A click on a cell edge toggles an X; a click in a cell cycles circle, cross, none
  (`sudokupad-pen-edge-marks.md`).
- **Browser keys.** Listeners are on `document`, capture phase. `preventDefault` is called only on handled keys: digits
  with Ctrl or Shift, Space, PageUp/PageDown, Backspace/Delete, arrows/WASD, Ctrl+A, Ctrl+I, temp keys. Ctrl+P is passed
  through on purpose (`// Pass-through print hotkey`). But the temp-key branch is reached by any Ctrl+letter that is
  not otherwise handled, and calls `preventDefault`: reading the branch order, Ctrl+F, Ctrl+L, Ctrl+S and similar are
  swallowed and flip to Centre for as long as Ctrl is held (source only, not run).
- **Dialogs.** `Framework.showDialog` refuses to open a second dialog, adds a `keydown` listener (Escape cancels; Space or
  Enter closes a dialog that has a single button), cancels on a press on the overlay, and calls
  `app.pauseInteractionHandlers()` so the board gets no keys or clicks while it is open; `closeDialog` undoes all of it
  (`framework.js` 270-335). The settings dialog ends with a sticky "Back" button (`framework.js` ~590). Dialogs slide in
  over 0.2 s (`sudokupad-dialog-slide-in.md`, run).
- **Rules** are docked: `.puzzle-rules` inside `.controls-info`, the side panel, selectable text (page HTML, `script.js`
  3719-3722).
- **Settings.** `Framework.setSetting` saves through `throttledSaveSettings` (min 500 ms, max 2000 ms) to `localStorage`
  under `svencodes_settings`, global per browser profile (`framework.js` 39-41, 405-434). URL parameters
  `?setting-<name>=` are applied and added to `tempSettings`, so they are never written back (`getQuerySettings`,
  `initSettings`): a per-link setting is silently temporary. Progress: `progress_<puzzleId>` in `localStorage`, saved on
  every non-selection action (throttled) and forced at key moments (`saveProgress`, `logReplayAct`). The colour palette
  is one per browser profile (`sudokupad-color-tool.md`); letter mode is saved globally (`sudokupad-letter-tool.md`).

### Puzzle Square JP

- The puzzle page (`/puzzle/10000`, a Heyawake) rendered in headless Chromium had one iframe,
  `https://puzz.link/p?heyawake/10/10/...`, and loaded `puzz.link/js/pzpr.js`, `pzpr-ui.js` and
  `pzpr-variety/heyawake.js` (run). Its buttons were "横幅最大化" (maximise width), "サイドバーを閉じる" (close sidebar), tabs
  for 概要/ルール/コメント, and "ツールを開く" links to puzz.link, pzplus, pzprxs.
- Its tool map (`7913-...js`) knows Penpa (opt-pan), Penpa V2, Penpa+, puzz.link, pzv3, pzprxs, pzplus, Honey Island's hex
  editor and Kudamono; the site string says "puzz.link, pzprxs, pzplus, hex-editor(Honey View), penpa edit, and penpa+ are
  supported". Whether a Penpa+ puzzle is embedded or only linked was not determined.
- Its layout bundle carries English and Japanese strings for a pzpr player's chrome ("Aux", "Input settings",
  "Extra tools", "Special actions", input-mode names "Auto", "Shade", "Unshade", "Line", "X", ..., "Check line
  connection") and the FAQ says "プレイヤーの設定より「表示→横幅最大拡張」を切る" (turn off Display > maximum width in the
  player's settings). So Puzzle Square has, or is building, its own chrome around pzpr; on the page probed, the iframe
  was plain puzz.link. Not determined which puzzles get which.
- Site modals (`8143-...js`): a stack of open modals; Escape closes only the topmost (`l.at(-1)===t`) unless that modal
  disables it, and body scrolling is locked while any is open. Menus (`6119-...js`) close on Escape or an outside
  mousedown.

### puzz.link / pzprjs

- **Modes.** One genre per page, so "mode" means input mode: default `auto`, where the genre's own handler reads the
  button, plus explicit modes listed per genre (`docs/InputModes.md`; e.g. Heyawake play: `shade`, `unshade`, `peke`,
  `info-blk`; Slitherlink play: `line`, `peke`, `bgcolor`, `bgcolor1`, `bgcolor2`, `clear`, `info-line`). All set through
  `mouse.setInputMode` (`MouseInput.js` ~438). `inputmode` is a volatile setting, not saved (`MenuConfig.js`); switching
  edit/play restores the input mode saved for that side (`modechange`).
- **Indicator.** The tool area's `inputmode` panel marks the current child `childsel` and hides modes the genre lacks;
  the panel is disabled when only one mode exists (`ToolArea.js` ~241-268, `p.html` 131-141). Off the board.
- **Temporary modifiers.** Shift or Cmd held swaps left and right buttons for the mouse event, as does a mode name ending
  in `-` (`setMouseButton`); the `lrinvert` setting swaps them permanently and is volatile. Z held turns a click into a
  connection check (`info-line`, `info-blk`, ...) (`mouseinput`). `onblur_func` on `document` `blur` calls
  `key.keyreset()` and `mouse.mousereset()`, clearing Shift/Ctrl/Alt/Meta and Z/X/Y state (`Event.js` 128-131).
- **Keys.** `getchar` builds names like `shift+3`, maps Alt+H/J/K/L to arrows, and the source comment on `isALT` says
  "ALTはメニュー用なので基本的に使わない" (Alt is for menus, so basically not used) (`KeyInput.js`). Alt+C toggles edit/play
  where allowed (`keyexec`). F4 pauses in player-only mode. The first key press only activates and draws the cursor
  (`keyevent`). Arrows move a single cursor, bounded, no wraparound (`moveTC`). Digits go to `key_inputqnum` in genres
  that enable play-mode keys; elsewhere keys do nothing (`enableplay` false by default). In genres with sub-numbers, a
  Shift tap in an empty cell cycles the cursor's target among the answer and the corner sub-numbers
  (`variety-common/KeyInput.js` 38-50, `chtarget`).
- **Browser keys.** `preventDefault` is called only when the event's target is the puzzle canvas, or when the handler set
  `cancelDefault` (Backspace and Space always, to stop back-navigation and scrolling; arrows that moved the cursor; a
  number that was entered) (`e_keydown`, `keyevent`). Everything else reaches the browser.
- **Mouse.** Shading (`decIC`): with config `use` = 1, left toggles shade and right toggles the unshaded dot; with `use` =
  2, left cycles shade, dot, blank and right the reverse. The first cell of a drag decides the value and the whole drag
  paints it (`inputcell`, `inputData`). Lines: the first segment decides draw or erase for the drag (`inputLine`);
  Slitherlink left-drag draws, a left click without moving or a right drag places the X (`peke`) (`slither.js`).
- **Settings.** `menuconfig.save()` writes `pzprv3_config:puzzle` and `pzprv3_config:ui` to localStorage only on
  `pagehide` and only if something changed; `restore()` reads them at start (`MenuConfig.js` 265-296, `Event.js`
  `onpagehide_func`). Global, not per puzzle; a few display configs are named per genre (`docs/Config.md`).

### f-puzzles

- Enter modes Normal, Corner, Center, Highlight are sidebar buttons in both setting and solving (`Sidebars.js` 173-179)
  and Z, X, C, V (`Inputs.js` keydown; changelog 1.1.0 "Ability to use Z, X, C, and V to switch between enter-modes").
  All go through `setEnterMode` (`Main.js` 205-213).
- Temporary: while the solving tool ("Given Digit") is current, Shift down sets `tempEnterMode = 'Corner'`, Control down
  `'Center'`, and key-up of either restores `enterMode` (`Inputs.js` 287-292, 314-323). The button for the temporary mode
  is drawn highlighted (`Button.js` 277: `tempEnterMode === this.title`). Modifier flags are re-read from every event
  (`updateHeldKeys`), and changelog 1.2.0 lists "Bug causing alt, shift, and control to get stuck when switching
  tabs/windows" as fixed; no `blur` handler was found in the files read, so a lost key-up of Shift could leave the temp
  mode until the next Shift key-up (not run).
- Space toggles the timer in solving mode; Escape closes popups and resets the camera; arrows move with wraparound and
  Shift/Ctrl extend (changelog 1.7.0, 06/25/2020: "Ability to shift-select with the arrow keys", "shift-click on a selected cell to
  deselect it", "ctrl+a to select the entire grid"); Alt+digit types 10+ on big grids (changelog 1.1.0).
- Browser keys: digits and Backspace/Delete are `preventDefault`ed; Ctrl+A only when the body has focus; held repeats are
  swallowed except Ctrl+Z/Y and Backspace (`Inputs.js` 179-312). Changelog 1.11.2 fixed "ctrl+num to switch tabs when
  entering pencil marks".
- Popups: one at a time (`togglePopup` closes others), each with an "X" button (`Popups.js`), click outside closes, and
  board input is skipped while one is open (`!popup` guards).
- Rules: shown docked in solving mode (`showRules` in `Extra Functions.js` 145-147; a "Rules" sidebar section).
- Settings: saved to `localStorage.puzzleSetterSettings` on change, but only when "Save Settings in Browser" (default
  off) is ticked (`Settings.js`).

### Cracking the Cryptic web app

From its help page only (documented): four modes; "You can switch to any of one these modes using the shortcut keys Z,
X, C and V respectively" (listed Normal, Corners, Centre, Highlight); "You can also temporarily enter Corners mode by
holding down the Shift key, and Centre mode by holding down the Control key. When you release the key you will be
returned to the previous mode"; "you can cycle through all four modes in turn by pressing the Spacebar"; arrow keys and
WASD wrap around the grid; Control-click and Control+arrows add to the selection; Ctrl+Z / Ctrl+Y undo and redo. The
SudokuPad lineage is visible: these are SudokuPad's conventions.

### HoDoKu

Documented in the manual chapter 2: arrows move the focus cell; digit sets; Ctrl+digit toggles a candidate; 0, Del or
Backspace deletes; Ctrl/Shift-click multi-selects ("Use [Shift] for region select" is a preference); colouring is a
separate mode entered from the palette, during which "The mouse cursor changes to indicate coloring mode", "Clicking
the field with the background color (usually white) or pressing [Esc] ends coloring mode", and "the normal mouse
functions are disabled"; a status-bar label "Coloring: Cell" / "Coloring: Candidate" switches what is coloured. Two
mouse models are offered as a preference: normal (click selects, double-click or context menu acts) and alternate
(left click sets a candidate, right click removes it). Configurations are XML `.hcfg` files.

### Simon Tatham's Portable Puzzle Collection

- Common actions and their keys are the same in every game, from the Game menu: New (N, Ctrl+N), Undo (U, Ctrl+Z,
  Ctrl+_, `*`), Redo (R, Ctrl+R, `#`), Quit (Q, Ctrl+Q) ("Common features" 2.1). A preference common to all games turns
  off the one-key shortcuts "so that there's less chance of hitting them by accident"; Ctrl versions still work. On
  Mac OS X the actions sit on File and Edit menus "to conform with local user interface standards".
- Solo: right-click then type enters a pencil mark; at the keyboard cursor, Return toggles the cursor between normal
  and pencil, so the cursor on the board shows which you will enter ("Solo controls" 11.1).
- Developer rules: a keyboard cursor lives in `game_ui`, not the game state, "since if it were in the game_state then
  the user would have to separately undo every cursor move"; hide it "when a mouse action occurs (so that it doesn't
  clutter the display)" (devel 6.3.3). `CURSOR_SELECT` and `CURSOR_SELECT2` are Enter and Space on keyboards
  (backend 2.7.1), and `current_key_label()` lets a front end label what those keys will do right now (backend 2.10.8).
  The mid-end sorts out button changes when a platform emulates the right button with a modifier mid-drag
  (midend 4.12).
- Contradiction, both sides: "Common features" 2.4 says "The games in this collection deliberately do not ever save
  information on to the computer they run on: they have no high score tables and no saved preferences", while 2.1
  describes a Preferences dialog and 2.5 a `--delete-prefs` option that "delete[s] the configuration file in which its
  user preferences were stored". The newer text wins in practice; the 2.4 sentence predates preferences.

### Sudoku.coach

From the in-app "Keyboard Controls" dialog's data in the bundle (source, the dialog not rendered): Selection: arrows or
W/A/S/D move; Ctrl or Shift + click, or + arrows, add; Ctrl+Shift+Alt+click symmetrical selection; Ctrl+A; double-click
selects similar cells; Esc deselects all. Numbers: 1-9 solution; Ctrl+1-9 cell candidate; Shift+1-9 box candidate;
Alt+1-9 highlight digit; Space "Switch between Solution and Candidate Input"; Del deletes. Grid: Ctrl+C/V copy and paste
the sudoku, E or G edit/givens mode. Tools: Y or Z solution, X cell candidate, C box candidate, V colour, N fill naked
singles. Ctrl+Z/Y undo/redo, P pause. Settings strings include "Keyboard writes Numbers" / "Keyboard activates Numbers"
(an "Insertion Mode" choice of "Selection First" or "Number First") and "Delete Key first deletes according to active
Pad". The dialog closes with a "Close" button. Modifiers are chords on the digit, not held modes.

### SudokuMaker

Source only. A keyboard layer (`class pP`) listens on `document` and ignores events whose target is an input, textarea,
select or contentEditable (`Xg`); it tracks Control/Meta/Shift/Alt and, on `window` `blur`, emits a key-up for every
modifier still held. Hotkeys are data: defaults `undo` Ctrl+Z, `redo` Ctrl+Y or Ctrl+Shift+Z, `selectAll` Ctrl+A,
`delete` Delete or Backspace, `setEnterDigits` KeyZ, `setEnterCornerPencilMarks` KeyX, `setEnterCandidates` KeyC,
`setEnterColorMarks` KeyV, `exitConstraintEditor` and `stopSolver` Escape (the `:` prefix means physical key code), and
a Preferences tab "Shortcut keys" lets the user rebind them, warns about clashes and offers "Prefer physical keys". A
hotkey matches only with exactly its modifiers. Persisted state (`preferences` and others) is versioned, migrated at
start, written to `localStorage` on every change by a deep watcher, and synced across tabs through the `storage` event,
with an alert if two tabs run different versions.

## (c) Shared conventions, and where tools disagree

What a solver arriving from SudokuPad or its relatives expects:

1. **Z / X / C / V pick Normal / Corner / Centre / Colour**, from any mode: SudokuPad (`toolHotkeys`), CTC web app (D),
   f-puzzles (D, S), SudokuMaker defaults (S). Sudoku.coach uses the same four letters with its own candidate kinds
   (X = cell candidate, C = box candidate) plus Y. Penpa+ honours them only from Surface or Sudoku.
2. **Held Shift = corner, held Ctrl = centre, back on release**: SudokuPad, CTC web app, f-puzzles, Penpa+ (Sudoku only).
   Sudoku.coach gets the same effect as chords (Shift+digit, Ctrl+digit) without a mode. HoDoKu: Ctrl+digit toggles a
   candidate.
3. **Space cycles the modes** (SudokuPad, with Shift+Space back; CTC web app; Sudoku.coach toggles solution/candidate).
   No surveyed tool cycles modes with Tab. Tab is either left to the browser or tool-local (SudokuPad's palette page and
   letter toggle).
4. **Selection**: drag selects, Ctrl- or Shift-click adds or toggles, arrows and WASD move, Ctrl/Shift+arrow extends,
   Ctrl+A selects all, Escape deselects (SudokuPad, CTC web, f-puzzles, Sudoku.coach; HoDoKu without WASD).
   Wraparound at the edge: SudokuPad, CTC web, f-puzzles. Double-click selects similar cells: SudokuPad, Sudoku.coach.
5. **A digit acts on the selection with the current mode's meaning**; Delete/Backspace clears the current mode's layer
   (SudokuPad's `clear` with `arg: this.tool`).
6. **Ctrl+Z / Ctrl+Y (or Ctrl+Shift+Z)** undo and redo everywhere.
7. **A drag's first step decides draw or erase** for the whole drag, for lines and for shading: SudokuPad
   (`getEraseMode`), pzprjs (`inputLine`, `decIC`/`inputData`).
8. **Revert on blur**: SudokuPad, pzprjs and SudokuMaker all reset held-key state when the window loses focus.
9. **Dialogs**: one at a time, Escape cancels the topmost, the board is deaf while one is open, and there is a visible
   close control (SudokuPad, f-puzzles, Puzzle Square's site modals, Sudoku.coach).
10. **Rules docked** beside the board (SudokuPad, f-puzzles; Puzzle Square and LMD show rules on the page around the
    player).

Where they disagree:

- **Right click.** Pencil-puzzle tools give it the secondary mark (pzprjs: dot or X; Tatham: pencil marks in Solo,
  remove a line in Loopy; Penpa+: second colour, X; HoDoKu alternate mode: remove candidate). SudokuPad ignores the
  button and suppresses the context menu, so right = left. HoDoKu normal mode opens a context menu.
- **Space.** Mode cycle (SudokuPad, CTC) or clear (Tatham's Solo, pzprjs) or timer (f-puzzles solving).
- **Escape.** Deselect (SudokuPad, Sudoku.coach, Penpa+ when no modal) versus close/cancel (f-puzzles, HoDoKu colouring,
  SudokuMaker editor and solver).
- **Selection model.** Sudoku tools have multi-select; pzprjs has one cursor that hides on mouse use (Tatham advises the
  same), and acts on click with no selection at all.
- **What a digit means outside value modes.** SudokuPad: the tool's value on the selection (Colour) or a brush (Pen).
  pzprjs: nothing outside number genres. Penpa+: brush in Surface, applied colour in Multicolor, nothing in six modes.
- **Where modifiers are modes or chords.** SudokuPad, CTC, f-puzzles, Penpa+: held modes. Sudoku.coach: chords.
  pzprjs: Shift is a mouse-button swap and a sub-number target cycle; Alt is deliberately unused.
- **Persistence.** On every change (SudokuPad throttled, SudokuMaker immediate), on page hide (pzprjs), opt-in (f-puzzles),
  config file (HoDoKu, Tatham).

## (d) The draft contract rules against the survey

1. **One current-mode indicator on the board, the same in every mode.**
   *Partly supported.* The single, uniform indicator is the norm: SudokuPad marks one `.selected` tool button and swaps
   the pad for every tool through one function (`changeTool`); f-puzzles highlights the enter-mode button, including a
   held temporary mode; pzprjs marks one `childsel` in its input-mode panel. **On the board** has little precedent: only
   Tatham's Solo shows the entry kind in the board cursor, and HoDoKu changes the mouse cursor in colouring mode. No
   surveyed web tool draws a mode label on the board. So the "same in every mode" half is the convention; the "on the
   board" half is new and needs its own justification (Penpa's off-board ring is near-invisible, audit U2).

2. **Every mode-switch path ends in the same state; Tab steps from where you are.**
   *Supported for the first half; the key choice is contradicted.* SudokuPad, f-puzzles (`setEnterMode`) and pzprjs
   (`setInputMode`) each route every path through one function, and SudokuPad's cycle indexes from the base tool
   (`prevTool || tool`), which is "steps from where you are" including during a held temporary mode. But the cycle key
   is Space (SudokuPad, CTC web app; Sudoku.coach's toggle), with Shift+Space back and PageUp/PageDown as aliases; no
   surveyed tool uses Tab or Enter. Consider Space as the cycle key, or both.

3. **A key means the same kind of thing in every mode.**
   *Supported, with a precise form.* SudokuPad's rule is: a digit is the current tool's value applied to the selection,
   Delete clears the current tool's layer, Z..M and Space work from every tool. Its one split (Pen takes a digit as a
   brush) follows from Pen having no selection. Sudoku.coach and HoDoKu keep the meaning fixed by using chords. Tab is the
   counterexample inside SudokuPad (palette page in Colour, letter toggle with the Letter tool). The survey suggests
   wording the rule as "a digit applies the mode's value to the selection; a mode with no selection takes the digit as
   its brush", and making Z/X/C/V global.

4. **A temporary mode always reverts on key-up and on blur.**
   *Supported.* SudokuPad (`handleKeyup`, and `handleBlur` on `window` `blur focusout`), pzprjs (`onblur_func` resets
   key and mouse state), SudokuMaker (synthetic key-up for every held modifier on `blur`), CTC web app (documented
   revert on release), f-puzzles (key-up revert; its changelog fixed modifiers sticking on tab switch). Penpa+ is the
   outlier (audit I5).

5. **An open dialog owns the keyboard; Escape closes the topmost; every dialog has a close button.**
   *Supported.* SudokuPad pauses the board's handlers while a dialog is open, Escape cancels, an overlay press cancels,
   only one dialog can be open, and settings ends in a Back button. Puzzle Square's site modals keep a stack and close
   only the topmost on Escape. f-puzzles gives every popup an X, closes on Escape, and blocks board input while one is
   open. Sudoku.coach's controls dialog has a Close button. No counterexample found. Rules: SudokuPad and f-puzzles dock
   them rather than use a popup.

6. **The tool takes only the keys it uses; browser keys pass through.**
   *Supported, with a caution from SudokuPad.* pzprjs is the strictest: `preventDefault` only when the canvas has focus or
   for keys it acted on (Backspace and Space always, against back-navigation and scrolling). SudokuMaker ignores keys in
   text fields and matches hotkeys with exact modifiers; Tatham lets the user turn single-key shortcuts off. SudokuPad
   mostly complies and passes Ctrl+P on purpose, but its held-Ctrl temp-key branch swallows unhandled Ctrl+letters such
   as Ctrl+F and Ctrl+L (source, not run): a temporary-modifier design must not `preventDefault` the chord it is part
   of. f-puzzles fixed Ctrl+digit switching browser tabs by preventing it, which is a justified take.

7. **Every setting saves when it changes and survives a restart; per-puzzle settings say so.**
   *First half supported; second half no evidence.* SudokuPad saves on change (throttled 0.5-2 s) to `localStorage`, and
   SudokuMaker on every change with versioned migrations and cross-tab sync; both survive restarts. pzprjs saves only on
   `pagehide` and keeps the input mode volatile; f-puzzles saves only if the user opts in. No surveyed tool labels a
   setting as per-puzzle: SudokuPad's per-link `?setting-x` values are silently temporary. Penpa+'s per-puzzle
   conflict-detection option (audit I7) has no precedent to copy, so the "say so" half is Penpa's own call.

## (e) Six mode families, side by side: Penpa+, SudokuPad, Puzzle Square JP

Penpa+ is from `research/penpa-mode-key-map.md` (source, fork `dce66ca`) unless marked. SudokuPad is v0.616.0 source and
the sudokupad-scripts notes. Puzzle Square JP's solve UI is puzz.link's player (see § b), so its column is pzprjs at
`ba714a2`. "None" = no such mode; ND = not determined.

How the current mode is shown, for every family: **Penpa+**: the mode's label gets a 1px orange ring on grey, the
sub-mode and style rows under it swap, off the board; a board cursor only in single-cell Number and Shape, a selection
glow in Sudoku, multi-cell Number, Multicolor (`penpa-modes-and-script-ideas.md`). **SudokuPad**: one selected tool
button and the pad's contents (digits, colour swatches, pen colours), off the board; the selection glow on the board is
the same in every tool that has one. **Puzzle Square JP / pzprjs**: the input-mode panel's highlighted child, usually
"Auto"; the mode is otherwise implicit in which button you press.

### Value (Penpa+: Sudoku, Number)

| Input | Penpa+ | SudokuPad (Digit, Corner, Centre; Letter) | Puzzle Square JP (pzprjs number genres, play) |
|---|---|---|---|
| Digit | enters the digit in the sub-mode at the selection | the tool's value on every selected cell | sets the number at the single cursor; in sub-number genres, at the cursor's target (answer or a corner) |
| Letter | enters the letter (Sudoku: Shift = lower case) | Z X C V B N M switch tool, WASD move, P pause; letters typed only with the Letter tool (Alt held by default) | ND per genre; Alt+H/J/K/L are arrows |
| Shift / Ctrl / Alt | Sudoku only: held Shift = Corner, Ctrl = Centre | Shift or Alt held = Corner, Ctrl = Centre, Ctrl+Shift/Alt = Colour; revert on key-up and blur | Shift tap in an empty cell cycles the sub-number target; Shift held swaps mouse buttons; Alt unused |
| Space / Delete / Backspace | clear the selection's entry (Backspace = Delete in Sudoku) | Space next tool; Delete/Backspace clear this tool's marks on the selection | Space/Delete clear, Backspace clears; both `preventDefault` |
| Arrows | move the cursor/selection; Ctrl/Shift extend | move from the last selected cell, wraparound, WASD too, Ctrl/Shift extend | move one cursor, no wraparound; first press only shows it |
| Left click / drag | select / drag-select (Alt+drag: rectangle) | select; Ctrl/Shift toggles and the drag follows; double-click = similar cells | sets the cursor; per genre, a click may also cycle the number (ND for auto) |
| Right click | ND in this family (README gives right-click meanings for other modes) | same as left; context menu suppressed | in `number-` mode, click decrements; Shift swaps buttons (`InputModes.md`, `setMouseButton`) |

### Paint (Penpa+: Surface, Multicolor)

| Input | Penpa+ | SudokuPad (Colour) | Puzzle Square JP (pzprjs shading genres) |
|---|---|---|---|
| Digit | Surface: picks a style (brush), paints nothing; Multicolor: picks the colour and applies it to the selection | toggles that colour key on every selected cell (applies, not a brush) | none (no key input in shading genres) |
| Letter | nothing; browser action blocked in Surface (audit I6) | global tool hotkeys | nothing |
| Shift / Ctrl / Alt | Alt+digit = secondary colours (Multicolor) | Tab (+Shift, +digit) steps palette pages; Alt held = colour edit mode; Ctrl+Shift = temporary Colour from other tools | Shift held swaps mouse buttons; Z held = connection check |
| Space / Delete / Backspace | Multicolor: Space/Delete clear the colour | Delete/Backspace clear colour on the selection; Space next tool | nothing for shading |
| Arrows | Multicolor moves the selection; Surface none | move the selection | ND (cursor hidden after a mouse input, `inputcell`) |
| Selection | Surface: none; Multicolor: yes | yes, the same as Value | none: a click acts at once |
| Left click / drag | Surface: paints with the brush; drag paints many; Multicolor: selects | selects | `use`=1: toggles shade; `use`=2: cycles shade, dot, blank; the first cell decides the drag's value |
| Right click | Surface: second colour (README:126) | same as left | `use`=1: toggles the unshaded dot; `use`=2: reverse cycle |

### Path (Penpa+: Line, Edge, Wall)

| Input | Penpa+ | SudokuPad (Pen, a setting) | Puzzle Square JP (pzprjs line genres) |
|---|---|---|---|
| Digit | nothing | picks the pen colour (a brush); swallowed while Pen is current | nothing |
| Letter | nothing | global tool hotkeys | nothing |
| Shift / Ctrl / Alt | — | the global temp keys still switch tools | Shift held swaps buttons; Z held = check line connection |
| Space / Delete / Backspace | — | Space next tool; Delete ND (no selection to clear) | ND |
| Arrows | — | move a selection although Pen clears it on each stroke (effect ND) | ND |
| Selection | none | none: each stroke sends `deselect` before and after | none |
| Left drag | draws the path (sub-mode decides centre, edge, diagonal, free) | draws; first segment decides draw or erase; line mode decides centre vs edge snapping | draws a line; first segment decides draw or erase |
| Left click | ND per sub-mode (the Helper (x) sub-mode places "an auxiliary cross mark placed on the side", README:138, 145; which button not stated there) | click on an edge toggles an X; in a cell cycles circle, cross, none | Slitherlink: a click without moving places an X |
| Right click / drag | Composite "Line x" and "Edge x": right click or right drag places crosses (README:224, 227); in plain Line/Edge, ND | same as left | Slitherlink: right drag places or removes X (first decides) |

### Stamp (Penpa+: Shape, Special, Cage)

| Input | Penpa+ | SudokuPad | Puzzle Square JP |
|---|---|---|---|
| Overall | Shape: digit places variant n at the cursor; Space/Delete/Backspace clear; arrows move the cursor; repeat-click cycles; Special and Cage: mouse only | none. The nearest is Pen's cell circle/cross (click cycles) | no general stamp mode; genre objects are placed in `auto` or named modes (`akari`, `star`, `futon`, `balloon`, ... in `InputModes.md`); per-genre click rules ND |

### Genre tool (Penpa+: Composite)

| Input | Penpa+ | SudokuPad | Puzzle Square JP |
|---|---|---|---|
| Overall | ~25 genre tools; left = primary, right = auxiliary (X, dot, water); repeat-click cycles in several; keys do nothing | none | this is pzprjs's whole model: one genre per page, `auto` reads the button (left primary, right auxiliary), named modes fix the meaning, Shift swaps buttons, Z checks connections |

### Move (Penpa+: Move)

| Input | Penpa+ | SudokuPad | Puzzle Square JP |
|---|---|---|---|
| Overall | drag moves existing items (All, Numbers, Shapes) | none | no generic move; in moving genres a drag from an object draws its path, shown as moved with `dispmove` (`inputMoveLine`) |

What the side-by-side says about the four splits in `penpa-mode-key-map.md`:

- **A digit's meaning.** SudokuPad has the same three-way split in a smaller form (value, applied colour, brush), but
  with one rule: a tool with a selection applies the digit; Pen, which has none, takes it as a brush. pzprjs avoids the
  question by giving digits to number genres only.
- **Two paint models.** SudokuPad has only the select-then-type model for colour; pzprjs has only click-to-paint for
  shading, with the first cell deciding the drag. Penpa+ is alone in offering both side by side with no visible cue.
- **Selection outside Value.** SudokuPad keeps one selection model across Digit, Corner, Centre and Colour, and clears
  it in Pen. pzprjs never has a multi-cell selection.
- **Modifiers.** SudokuPad's modifiers are uniform temporary tools from every tool (Shift/Alt corner, Ctrl centre,
  Ctrl+Shift colour). pzprjs gives Shift one mouse meaning (swap buttons) in every genre and leaves Alt alone. Penpa+'s
  modifiers mean different things per mode.
- **Line drawing and erasing.** Both comparators decide draw or erase from the drag's first segment; Penpa+'s rule was
  not read for this note (not determined).

## Not determined

- CTC Steam and mobile apps (Studio Goya): no primary controls source reached.
- Sudoku.coach's help pages (client-rendered; two rendering attempts failed); its blur handling and settings storage.
- Kudamono (401 and empty shells); Logic Puzzle App's other players.
- Whether Puzzle Square JP embeds Penpa+ puzzles or only links them, and which puzzles get its own pzpr chrome.
- SudokuPad: whether Ctrl+F and similar are swallowed in practice (read, not run); what Delete and arrows do in Pen.
- pzprjs: Escape and dialog handling in its popups; click meaning in number genres under `auto`.
- f-puzzles: whether a lost Shift key-up leaves the temporary mode on (no blur handler found; not run).
- Penpa+: right click in Value modes and how a Line drag decides draw vs erase (not in the notes read).
