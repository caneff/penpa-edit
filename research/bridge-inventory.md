# Bridge inventory: what the MVP solve UI needs from Penpa's engine (#67)

The question (caneff/penpa-edit#67): what does the new solve UI need from the bridge, and where does each need come from
in Penpa today? The UI is variant L of the prototype, mounted over the engine as it stands.

Sources, read 2026-11-13:

- Prototype branch `prototype/solve-ui` at `169df84`: `docs/prototype/solve-ui/engine-bridge.js`, `variant-L.js` and
  `README.md`. The worktree holds uncommitted edits to `variant-L.js` by the agent building L. This note reads the
  committed file, not the working copy.
- Penpa's code on `master` at `a09c606`. Every `file:line` below is under `docs/js/` on master unless it says
  otherwise. The bridge's own comments cite the prototype branch, whose line numbers differ.
- `research/solve-ui-prototype-verdicts.md`, section "Engine and bridge gaps every variant hit".
- `research/solve-input-and-settings-inventory.md` for live key, focus and settings results. That note cites an older
  commit, so its line numbers are a few lines off master.

Evidence marks in the Works column:

- **READ**: read from the source.
- **RUN**: seen in a run. Either a builder's scripted run of the prototype (verdicts note) or a LIVE probe in the
  solve-input inventory.
- **INFERRED**: follows from the code, but nobody has run it.

Nothing here was run for this note.

## Table

| Need | Bridge call or event | Penpa internal (master `docs/js/`) | Works today? | Note |
|---|---|---|---|---|
| Know when the engine changed | `install()` wraps six `Puzzle.prototype` methods; `onChange(cb)` fires once per frame | `redraw` class_p.js:12575, `mode_set` 1610, `submode_check` 1689, `stylemode_check` 1712, `subsymbolmode` 1729, `subcombimode` 1743 | Yes (RUN) | Penpa has no change event. The bridge monkey-patches the prototype. No subclass overrides these on master (READ: `class_panel.js:21` is the panel's own class). `stylemode_check` does not redraw, so only the hook reports a style change. |
| Put the board on the desk | `helpers.adoptBoard`, `fixPointerOffset()` | Click hit-test `e.pageX - canvas.offsetLeft`, main.js:920 | Yes (RUN) | The bridge shadows `canvas.offsetLeft/Top` with the real page position. CSS scaling would break hit-testing. Use `setCellSize`. |
| Hide Penpa's chrome | `helpers.hideLegacy()` | `window_click` finds buttons by id, main.js:1058, 1843-1880 | Yes (RUN) | The legacy DOM must stay in the page. UI buttons must not use legacy id prefixes (`mo_`, `sub_`, `st_`, `ms`, `combisub_`, ...). |
| Current mode, sub-mode, style | `getMode()`, `getState()` | `pu.mode[qa].edit_mode`; `pu.mode[qa][mode]` = `[sub, style]`; `qa = "pu_a"` from `set_solvemode`, general.js:3146-3148 | Yes (RUN) | Sub-mode is a string, style a number. For Composite and Shape the "sub-mode" is the tool name. |
| Switch mode | `setMode(mode)` | `mode_set`, class_p.js:1610-1667 | Yes, with two side effects (READ) | It restores the mode's one remembered sub-mode and style (1621, 1634-1636). It opens modes the link hides: there is no visibility check (verdicts gap). Shape turns the floating panel on the first time (1622-1625). |
| Switch sub-mode | `setSubmode(value)` | `submode_check('sub_<mode><value>')`, class_p.js:1689 | Yes (RUN) | Does nothing if the radio id does not exist. |
| Switch style | `setStyle(value)` | `stylemode_check('st_<mode><value>')`, class_p.js:1712; Multicolor also `key_number` (mirrors main.js:1853-1857) | Partly (READ) | Composite: the bridge builds `st_combi<n>`, which does not exist. A Composite line or edge tool takes `st_line<n>` / `st_lineE<n>`, shown by `subcombimode` (class_p.js:1752-1760). Committed L shows no styles for Composite. Multicolor: `setStyle` also paints the selection. |
| Pick a Composite tool or Shape | `setComposite(name)`, `setShape(name)` | `subcombimode`, class_p.js:1743; `subsymbolmode`, class_p.js:1729 | Yes (RUN) | Both switch to the mode first. |
| Modes this puzzle offers | `listModes({all})` | `penpa_modes[gridtype].mode`, modes.js:42; names modes.js:4; hidden labels: `set_solvemode` hides Box (general.js:3158), Penpa Lite hides modes outside the Tab set (`advancecontrol_onoff`, general.js:1225) | Yes (RUN) | Visibility is read from the legacy DOM (`is_hidden`, `display:none`). |
| Sub-modes of a mode | `listSubmodes(mode)` | Legacy radios `#mode_<mode>`; solve mode hides Number 2, 4, 11 (general.js:3159-3161) | Yes (RUN) | Scraped from the DOM. Labels are Penpa's. |
| Styles of a mode | `listStyles(mode)` | Legacy radios `#style_<mode>` | Yes, but no names (READ) | Labels are colour letters ("G" is green or grey). L names styles from its own table and reads swatches from each label's computed background. |
| Composite tools | `listComposite()` | `penpa_modes[gridtype].combisub`, modes.js:42; labels from `#combisub_<name>` | Yes (RUN) | |
| Shapes list | none (gap) | `#mode_symbolul1` DOM (`ms1_*` groups, `ms_*` items) | Only by DOM scraping (READ) | L reads the DOM directly. Verdicts gap: "No list of Shapes or style colours". |
| Seed pins from the link's Tab set | `tabSet()` | `UserSettings.tab_settings`, settings.js:327-334, set from the link at general.js:2157 | Partly (READ) | The bridge returns English names only. L maps a name to a mode with `PenpaText.modes.EN` / `.mapping` (translate.js:1268, 1301), as Penpa's Tab handler does (main.js:708-711). |
| Read or prime a mode's remembered sub-mode without switching | none (gap) | `pu.mode[qa][mode][0]`, read back by `mode_set` (class_p.js:1621) | Only by writing `pu` (READ) | L writes the array directly when seeding pins and applying presets. |
| Land on a pin: its mode, its sub-mode, its own style | L's `landOnPin` = `setMode` + `setSubmode` / `setComposite` / `setShape` | `mode_set`, `submode_check`, `stylemode_check` | Partly (READ) | Penpa keeps one `[sub, style]` per mode. Two pins on one mode (Line Normal, Line Helper) share one style memory. The UI must keep each pin's sub-mode and style itself and re-apply both on landing. Committed L keys pins by mode, so it cannot pin a mode twice; the working copy is changing this (not reviewed). |
| Tab / Shift+Tab over the pins | none; L's capture-phase `window` keydown, `stopImmediatePropagation` | Penpa's own Tab/Enter cycle over the Tab set, main.js:695-744 | Yes (RUN) | L also takes Enter, because Penpa treats Enter as Tab. Whether the UI owns Enter is not ruled. Penpa cancels Tab and Enter only when a Tab set exists. |
| Z/X/C/V jump to pins 1-4 | none; not built in L | `checkShortcutKeys`, main.js:747-787: Z/X/C go to Sudoku Normal/Corner/Centre, V to Surface. They act only from Surface or Sudoku and only while `UserSettings.shortcuts_enabled` (settings.js:306-313) is on | Not built (INFERRED that a capture listener works, as Tab does) | Conflict for Chris: Z/X/C/V are content keys in Number and Sudoku (letters reach `key_number`, main.js:437-497). A pin jump on plain Z blocks typing Z there. The Settings row "Sudoku Z/Y & XCV Keys" becomes meaningless or wrong. |
| Undo, redo | `undo()`, `redo()` | `pu.undo`, class_p.js:6760; `pu.redo`, class_p.js:6995 | Yes, but ignores contest mode (READ) | `pu.undo` does not check `pu.undoredo_disable` (set by `set_contestmode`). Penpa's own key paths do (main.js:524, 586, 593). Ctrl+Z, Ctrl+Y and Ctrl+Shift+Z are already handled by Penpa itself. |
| Enable Undo / Redo buttons | `getState().canUndo/canRedo` | `command_undo.__a` / `command_redo.__a`, as `set_redoundocolor` reads them, class_p.js:12600-12603 | Yes (RUN) | |
| Undo history in steps | `history()`, `jumpTo(n)` | Group index `entry[4]` on the command stacks, popped by `undo` / `redo` | Yes (RUN) | A line drag is one undo step per segment (verdicts gap). L uses `history().position` only to clear its "Not solved yet" status. |
| Check button verdict | `check()` | Re-implements `check_solution`, class_p.js:13360, with `make_solution` (2621) and `check_conflict` (13690) | Single answer: yes (RUN). Multi-answer: wrong on one case (READ) | The copy was written against the prototype branch, which lacks master's #13 guard (class_p.js:13401). On master an empty author category no longer counts as solved; the bridge copy still counts it. `pu.solution` is a JSON string on single-answer links and a parsed array on multi-answer links (general.js:2424-2428; verdicts gap). |
| Solved state | `getState().solved`, delivered by `onChange` | `pu.sol_flag`, set and cleared only inside `check_solution`, run on every `redraw` (class_p.js:12583, 13360-13391, 13434) | Yes (RUN) | No solved event exists. The bridge learns it from the `redraw` hook. |
| Congratulations popup, unchanged | nothing to call | `check_solution` fires `Swal.fire` 20 ms later and pauses the timer (class_p.js:13372-13384, 13410-13421) | Yes (READ) | Chris ruled it stays as is. It reopens each time the board re-enters the solved state, redo included, because any change clears `sol_flag` (13389). The UI must stay below SweetAlert2's z-index 1060 (prototype README). The popup opens about one frame after `onChange` reports solved (INFERRED from the 20 ms timeout). |
| Has an answer check | `getState().hasAnswerCheck` | `!!pu.solution` | Yes (RUN) | |
| What the check compares | `answerCheckInfo()` (L does not use it) | `get_answercheck_settings`, class_p.js:2400, reads the `#answersetting` checkboxes | HTML only (READ) | Verdicts gap: no answer-check options as data. Not needed by L. |
| Is a Penpa dialog open | none; L polls `.swal2-container` and `.modal` `style.display` | `.modal` dialogs open by `style.display = 'block'` (for example `p_settings`, general.js:1540); SweetAlert2 popups (`Swal.fire`) | Only by polling the DOM (READ) | Penpa fires no open or close event. L skips its Tab cycle while one is open. |
| Escape closes the UI's dialogs | none; not built | Penpa's Escape, main.js:359-376: hides the first open `.modal`, else clears the selection; always cancels the key | Not built (INFERRED that a capture listener works) | The UI must take Escape before Penpa while its own dialog is open. Otherwise Penpa clears the board selection too. SweetAlert2 handles its own Escape (inventory, LIVE). |
| Keep keys from the board while a UI dialog is open | none; not built | Penpa's `onKeyDown` skips only `<input type=text\|number>` and seven ids (main.js:279-298) | No (RUN for Penpa's own Settings dialog) | With focus on a `<select>`, button or `<body>`, a digit goes into the board (inventory Summary 1, LIVE). L avoids `<select>` for this reason. A typed `<textarea>` key also reaches the board (verdicts gap). The bridge needs a key filter that stops Penpa's handler while a UI dialog has focus. |
| Read Penpa's solve settings | `getSettings()` | `UserSettings` getters, settings.js:44-497 | Yes (RUN) | Read-only today. |
| Write Penpa's solve settings | none (gap) | `UserSettings` setters: each updates its legacy `<select>` and applies the change (for example `conflict_detection` redraws, settings.js:125-139; `displaysize` calls `redraw_grid`, settings.js:368-386, general.js:909) | INFERRED: assigning the property works | Saving differs per setting. Some setters never call `attemptSave` (`shortcuts_enabled`, settings.js:306-313; custom colours; Conflict Detection 1/2; the Tab set). Table in the solve-input inventory § 2. `set_solvemode` hides some rows in solve mode (general.js:3175-3199); the UI should hide the same ones. |
| Open Penpa's Settings dialog | `openSettings()` | `p_settings`, general.js:1540 | Yes (RUN) | Penpa's dialog lets keys reach the board (row above). The MVP replaces it with the UI's own dialog. |
| Board size, zoom | `setCellSize(px)` | `UserSettings.displaysize` setter, settings.js:368-386, then `redraw_grid` | Yes (RUN) | L also reads `pu.size` to fit the board. |
| Title, author, rules | `getInfo()` | `#saveinfotitle` etc., filled at general.js:2056; `pu.rules` from general.js:2089 | Yes (RUN) | Title and author come from the DOM fields. |
| Timer | `getTimer()`, `onTimer()`, `pauseTimer()`, `startTimer()` | `sw_timer`, timer.js:1, events timer.js:33-40; `#sw_pause` / `#sw_start` handlers, main.js:2294-2306 | Yes (RUN) | Pausing does not block input (inventory Summary 2, LIVE). |
| Revert held modifiers on blur | none; not built | Shift / Ctrl held in Sudoku switches to Corner / Centre (main.js:404-427). Only `onKeyUp` reverts it (main.js:872-903), through the closure-local `present_submode` (main.js:267). No `blur`, `focusout` or `focusin` listener exists (READ; only `visibilitychange`, main.js:2072, 2309) | No (RUN: Ctrl held, then blur, left Centre on; inventory LIVE) | The bridge cannot read `present_submode`. It can send a synthetic `keyup` for Shift and Control on window `blur`, since `onKeyUp` reads only `e.key` and `e.location` (INFERRED). The Shift and Ctrl counters (main.js:269-270) reset there too. |
| Let browser keys pass through | none; not built | Penpa cancels with `e.returnValue = false`. In Surface every key without Ctrl is cancelled, F5 and F11 included (main.js:681-693). In every mode Alt+Left/Right, Ctrl+D, Ctrl+digits, Space, Backspace and Escape are cancelled | No (RUN, inventory Summary 3) | The UI cannot un-cancel a key after Penpa's handler. It can stop browser keys from reaching Penpa: a capture listener that calls `stopImmediatePropagation` without `preventDefault` (INFERRED). |
| Content keys stay Penpa's | none needed for real keys | Penpa's `keydown` / `keyup` on `document`, main.js:84-85 | Yes (RUN) | Real key events reach Penpa unchanged. |
| Send a content key from a UI button (not in L) | `sendKey(key)` | Same handler, through a synthetic `KeyboardEvent` | Partly (READ) | Synthetic events carry `keyCode` 0. Delete matches only `keycode === 46` (main.js:498), so it does nothing. Backspace matches on `key` (main.js:503) and calls `key_backspace`, which acts only in Number and Multicolor (class_p.js:8515-8600). So it does nothing in Sudoku. The event also re-enters the UI's own capture listeners (verdicts gap). L does not call `sendKey`. |
| Drop focus from UI text fields on a board click | none; L's capture `mousedown` | Penpa's canvas mousedown calls `preventDefault` (main.js:1096-1101), so focus stays where it was | Yes (RUN) | Without this, a focused UI field keeps eating digits. |
| Set marks directly; one gesture as one undo step | none | none in Penpa: marks come from replaying click cycles | Not needed for the MVP | Verdicts gaps. Penpa keeps board clicks in the MVP, so L does not need them. |

## Notes

1. **What the bridge is today.** Most of it works because it calls the same `pu` methods the legacy radios call. Its
   weak spots are lists scraped from the DOM, the per-mode memory, and keys.
2. **Per-mode memory against pins.** Penpa remembers one sub-mode and one style per mode. A pin is a mode plus one
   sub-mode, and its style is the last one used on it. So the UI must own each pin's sub-mode and style and write them
   back on every landing. The bridge needs two calls Penpa lacks: read a mode's memory and set it without switching.
   L does both by writing `pu.mode[qa][mode]` directly.
3. **Keys need one front door.** Five of the needs above are key routing: Tab, Z/X/C/V, Escape for UI dialogs,
   shielding the board while a UI dialog is open, and letting browser keys through. Penpa's handler sits on `document`
   and cancels keys by mode, by accident. One capture-phase `window` listener in the bridge can route all five before
   Penpa sees a key. L already does this for Tab. This is INFERRED for the other four.
4. **Z/X/C/V needs a ruling.** As pin jumps, they collide with letter entry in Number and Sudoku. They also collide
   with Penpa's own Z/X/C/V shortcuts and the Settings row that toggles them. Options include taking them only outside
   Value modes, or taking them only with a modifier. That choice is Chris's.
5. **Solved state and the popup.** `pu.sol_flag` after each redraw is enough for the UI's status. The popup stays
   Penpa's, untouched. The bridge's own `check()` should go: it duplicates `check_solution` and already lags master
   (#13). The UI's Check button can read `sol_flag` instead, since Penpa checks on every redraw.
6. **Dialogs.** Penpa has two dialog systems, `.modal` and SweetAlert2. Neither fires events. Open or closed is a DOM
   poll. The Congratulations popup is a SweetAlert2 popup and owns the keyboard while focused (inventory, LIVE).
7. **Settings write is the largest untested need.** The setters look usable from the bridge, but nobody has run them
   outside Penpa's own dialog. Saving is inconsistent per setting (inventory § 2). Which Penpa settings the UI's dialog
   shows is still open.
8. **Not checked.** The uncommitted variant-L working copy. Any behaviour on master that differs from the prototype
   branch beyond the #13 check. Whether `install()` still hooks correctly on master. INFERRED: the six method names
   and the `Puzzle` class are unchanged.
