# Settings Penpa+ offers a solver, and how each behaves on master

Answers issue #65. Read from the source at `master` (`a09c606`), local code only, nothing run in a browser.
Files are under `docs/`. `S` = `js/settings.js`, `G` = `js/general.js`, `M` = `js/main.js`, `H` = `index.html`.
Everything is READ from source unless marked **(inferred)**.

## How the machinery works

- All persistent settings live in one object, `UserSettings` (`S:44`). Each setting is a property with a setter that
  updates the matching DOM control. A bridge reads `UserSettings.<name>` and sets it by assignment
  (`UserSettings.timerbar_status = 2`). Assignment runs the same setter the dialog runs.
- The dialog controls call those setters from `onchange` handlers (`M:2080-2290`). Setting by assignment is therefore
  equivalent to the user changing the control. Setting the DOM value alone does not fire `onchange`.
- Storage is cookies. `setCookie` writes `path=/; SameSite=Lax; expires=<now + days>` (`S:15-19`). There is no
  localStorage for settings. localStorage / localforage (IndexedDB) only holds puzzle progress (`js/progress.js:15-34, 116`).
- `attemptSave()` (`S:543-557`) rewrites every cookie in `can_save` (`S:500-521`), the two in `gridtype_size`
  (`S:522-525`) and `tab_settings`. It does nothing until `_settingsLoaded` is true, set at the end of the first
  `loadFromCookies("others")` (`S:577`, called at `G:97` and `G:2083`).
- Cookies are read back by `loadFromCookies` (`S:559-585`) by assigning each value to its setter. The grid type and
  display size load first and only in `create()` (`G:85`). The rest load in `create()` (`G:97`) and again in `load()` (`G:2083`).
- **I1 is fixed.** `_expDate` is 400 days (`S:46`, commit `08c8a9e`, #39); `setCookie` takes days (`S:15-19`). The
  expiry is renewed on every save, not on load (**inferred** from `S:543-557`: only `attemptSave` and the two
  self-saving setters call `setCookie`).

## The table

"Saves on change": whether changing it alone writes a cookie. "Restart": whether the stored value comes back after a
browser restart, given the 400-day cookie. "Link" is whether a puzzle link overrides it.

| Setting | UI element (id) | Property to read/set | What it does | Stored | Scope | Saves on change | Restart |
|---|---|---|---|---|---|---|---|
| Display theme | `theme_mode_opt` (`H:1590`) | `UserSettings.color_theme` 1 light / 2 dark (`S:341-363`) | Swaps the theme stylesheet, redraws | cookie `color_theme` | global; a link can force dark (`G:2514-2519`, only ever to dark) | yes (`S:362`) | yes |
| Display layout | `responsive_settings_opt` (`H:1601`) | `responsive_mode` 1-4 (`S:50-68`) | Classic, Flex left/right, Streaming | cookie `responsive_mode`, deleted when 1 | global | yes, via its own setCookie (`S:63-67`) | yes |
| Language | `language_opt` (`H:1615`) | `app_language` EN/JP/ZH (`S:112-118`) | Retranslates the UI | cookie `app_language` | global | yes | yes |
| Timer bar | `timer_bar_opt` (`H:1627`) | `timerbar_status` 1 show / 2 hide (`S:75-82`) | Shows or hides the whole `#stop_watch` block (timer and buttons, `H:825-833`) | cookie `timerbar_status` | global | yes | yes |
| Sudoku pencil marks | `sudoku_settings_opt` (`H:1641`) | `sudoku_centre_size` 1 dynamic / 2 large / 3 small (`S:203-209`) | Size of Sudoku-mode centre marks | cookie `sudoku_centre_size` | global | yes | yes |
| Sudoku normal | `sudoku_settings_normal_opt` (`H:1653`) | `sudoku_normal_size` 1 centred / 2 bottom (`S:188-194`) | Where a Sudoku digit sits | cookie `sudoku_normal_size` | global | yes | yes |
| Outline on text | `outline_text_opt` (`H:1665`) | `outline_text` bool (`S:215-221`) | Text outline, redraws | cookie `outline_text` | global | yes | yes |
| Star Battle dots | `starbattle_settings_opt` (`H:1676`) | `starbattle_dots` 1 high / 2 low / 3 off (`S:162-168`) | Auto-dot range in Star Battle | cookie `starbattle_dots` | global | yes | yes |
| Surface second colour | `secondcolor_settings_opt` (`H:1701`) | `secondcolor` 1-12, default 2 green (`S:175-181`) | Colour of the second click in Surface | cookie `secondcolor` | global | yes | yes |
| Custom colours | `custom_color_opt` (`H:1725`) | `custom_colors_on` bool (`S:227-244`) | Shows the custom-colour picker | cookie `custom_colors_on` | global; a link can force it on, never off (`G:2482-2486`); the link writes it (`class_p.js:2010`) | no: setter has no `attemptSave`; written with the next save | yes once some later change saved it |
| Floating panel | `panel_button` (`H:1736`) | `panel_shown` bool (`S:454-468`) | Shows the floating key panel (`#float-key`, `H:837`) | none | per session | n/a | no |
| Quick panel button | `quick_panel_dropdown` (`H:1747`) | `quick_panel_button` bool (`S:471-485`) | Shows the on-page "Panel:" toggle (`H:189-190`) | cookie `quick_panel_button` | global | yes (`S:484`) | **yes** (the audit said it was not kept) |
| Quick panel toggle | `quick_panel_toggle` span (`H:190`) | `panel_shown`; click handler `M:1704-1707`; also `panel_toggle()` (`G:1187`) | The on/off of the floating panel itself | none | per session | n/a | no |
| Tab set | `mode_choices` multi-select (`H:223`), built by `initPenpaLite` (`interface.js:90-140`) | `tab_settings` array of English mode names (`S:327-334`) | The modes Tab and Enter step through (`M:695-730`); non-empty also hides the other mode buttons (Penpa Lite, `G:1211-1260`) | cookie `tab_settings` (JSON); also in every link (`G:2156-2157`, `class_p.js:1985`) | global in the cookie; a link replaces it | **no** (`M:2221-2222`, no save) | only if a later save ran |
| Draw on edges | `edge_button` span (`H:187-188`) | `draw_edges` bool (`S:392-404`) | Click on edges/corners | none; link carries it (`G:2095-2102`, `class_p.js:1962`) | per puzzle | n/a | no |
| Visibility | `visibility_button` span (`H:184-185`) | `show_solution` bool (`S:410-420`) | Shows or hides the solution layer | none | per session | n/a | no |
| Adjust only whitespace | `resize_whitespace_button` (`H:1156`) | `resize_whitespace` bool (`S:491-497`) | Edit-side grid resize | none | per session | n/a | no |
| Display size | `nb_size3` / `nb_size3_r` (`H:955, 990`) | `displaysize` 12-90 (`S:369-386`) | Cell size in px | cookie `displaysize` | global default; a link sets it (`G:2024`) | no (`S:369` has no save); saved with the next save | yes once saved; read only by `create()` (`G:85`), so link loads ignore it |
| Grid type | `gridtype` select (`H:882`) | `gridtype` (`S:317-325`) | New-grid type | cookie `gridtype` | as displaysize | no | same as displaysize |
| Auto-shorten links | `shorten_links_dropdown` (`H:1761`), `auto_shorten_chk` | `shorten_links` bool (`S:424-432`) | Shortens generated links | cookie | global | yes | yes |
| Warn on long links | `warn_long_links_dropdown` (`H:1772`), `warn_long_links_chk` | `warn_long_links` bool (`S:443-451`) | Warns before a very long link | cookie | global | yes (`S:447`) | yes |
| Mouse middle button | `mousemiddle_settings_opt` (`H:1808`) | `mousemiddle_button` 1 no / 2 yes (`S:99-105`) | Middle click toggles Problem/Solution (`M:1079`) | cookie | global | yes | yes |
| Reload protection | `reload_button` (`H:1819`) | `reload_button` (getter returns bool, `S:291-304`) | `beforeunload` prompt (`M:2062-2068`) | cookie | global | yes | yes |
| Conflict detection | `conflict_detection_opt` (`H:1830`) | `conflict_detection` 1 on / 2 off this puzzle / 3 off all (`S:125-139`); read via `show_conflicts` (`S:143`) | Highlights conflicting cells (`class_p.js:13691`, `class_hex.js:2966`), redraws | cookie `conflict_detection`, but see I7 note | 3 global; 2 "this puzzle" | writes its own cookie only for 3 (`S:132-136`), and `attemptSave` rewrites it with whatever value is current | 3 yes; 2 see note |
| Check pencil marks | `check_pencil_marks_opt` (`H:1842`) | `check_pencil_marks` bool (`S:149-157`) | Conflicts also check pencil marks | cookie | global | yes | yes |
| Edit tags for conflict checker | button `saveinfogenre2` (`H:1850`) | genre tags, `pu.user_tags`, set by `set_genre_tags` | Which rules the conflict checker applies; `alphabet` turns shortcuts off (`G:2249-2250`) | in the link (tag list) | per puzzle | n/a | link only |
| Any colour matches green line | `ignore_line_style_opt` (`H:1858`) | `ignore_line_style` bool (`S:251-258`) | Looser line/edge answer check (`class_p.js:2496, 2543`) | cookie | global | yes | yes |
| Sudoku Z/Y and XCV keys | `enable_shortcuts_opt` (`H:1869`) | `shortcuts_enabled` bool (`S:306-314`) | Turns the Sudoku Z/X/C/V shortcuts on or off (`M:763`, `class_p.js:7716`) | none (not in `can_save`) | per session; an `alphabet` link turns it off (`G:2250`) | n/a | no |
| Auto-save to history | `auto_save_history_opt` (`H:1891`) | `auto_save_history` bool (`S:88-95`) | Duplicates the tab into browser history on save (`progress.js:71-73`) | cookie | global | yes | yes |
| Local storage | `allow_local_storage` (`H:1904`) | `local_storage` bool, writes value 1 or 4 (`S:262-270`) | Master switch for saving progress | cookie | global | yes | yes |
| Save this puzzle | buttons `clear_storage_one` / `clear_storage_all` (`H:1908-1909`, `M:2330-2351`) | `save_current_puzzle` (`S:277-288`) | Clearing sets "do not save this puzzle" | none | per puzzle, per session | n/a | no |
| Clear cookies | `clear_settings` button (`H:1883`) | `UserSettings.clearSettings()` (`S:527-538`) | Deletes every settings cookie. Does not reset the live values | n/a | n/a | n/a | n/a |
| Timer controls | buttons `sw_start`, `sw_pause`, `sw_stop`, `sw_reset`, `sw_hide` (`H:828-832`) | `sw_timer` (`timer.js:1`); handlers `timer.js:3-27`, `M:2294-2305` | Start, pause, stop, reset, hide the digits | none; the elapsed time travels in the saved puzzle (`class_p.js:2175`) | per puzzle | n/a | with the puzzle's saved progress only |

Settings whose names are in `can_save` (`S:500-521`) are twenty: `auto_save_history`, `check_pencil_marks`, `app_language`,
`color_theme`, `conflict_detection`, `custom_colors_on`, `ignore_line_style`, `local_storage`, `mousemiddle_button`,
`outline_text`, `quick_panel_button`, `reload_button`, `responsive_mode`, `secondcolor`, `shorten_links`,
`starbattle_dots`, `sudoku_centre_size`, `sudoku_normal_size`, `timerbar_status`, `warn_long_links`.
Add `gridtype`, `displaysize` and `tab_settings` for the 23 cookies the audit counted.

## The known bugs, checked on master

- **I1 (cookie expiry): fixed.** `S:46` sets 400 days; the old `86400000 * 2147483647` product is gone. The cookies
  now carry a real expiry. I did not run it in a browser, so "survives a restart" is read from the code.
- **I2 (a solve link erases the solver's Tab set): still live.** `G:2156-2157` still replaces `UserSettings.tab_settings`
  with the link's value, `"[]"` included. It does not touch the `#mode_choices` dropdown on a `url` load, only on a
  `local` load (`G:2166`). The dropdown is built once by `initPenpaLite` (`M:2060`), which runs after `boot()` has
  started (`M:69`) but before its async link load reaches `G:2083`, so on a link load it is built from empty settings
  **(inferred from the call order)**. The next `attemptSave` writes `getValues('mode_choices')` (`S:555`), the dropdown's
  state, over the `tab_settings` cookie. The dead branch is also still there: `G:1959` compares an array with 0.
- **I3 (a Tab-set-only change is not saved): still live.** The `mode_choices` handler (`M:2221-2222`) only assigns
  `UserSettings.tab_settings`, and that setter (`S:328-331`) has no `attemptSave`. The change reaches the cookie on the
  next save of any other setting.
- **I7 ("conflict detection off for this puzzle" carries over): still live, and the fix to I1 sharpened it.** Value 2
  is memory only: the setter deletes the cookie unless the value is 3 (`S:132-136`), and no puzzle load resets
  `_conflict_detection` (`rg` finds no other writer outside `S`). So it carries over to every puzzle loaded in the
  same page. New on master: `conflict_detection` is also in `can_save`, so any later `attemptSave` writes
  `conflict_detection=2` (or `=1`) to a cookie through `S:549-551` **(inferred; not run)**. With a real expiry, that
  value then comes back after a restart, so "off for this puzzle" can become "off for every puzzle".

## Notes for the bridge

- Read and write through `UserSettings`. It is a global `const` in a classic script, so `page.evaluate(() => UserSettings.x)`
  reaches it. Setters touch the DOM and call `pu.redraw()`, so call them after `pu` exists.
- Setting a value from a bridge saves it as a side effect for most settings (the setters call `attemptSave`). A bridge that
  must not change the solver's stored settings should set them in a fresh browser context, or snapshot and restore the
  cookies. Settings with no `attemptSave` (Tab set, custom colours, display size, conflict detection 1/2) save only on
  the next save of another setting.
- To seed the pins from the Tab set, read `UserSettings.tab_settings` (an array of English mode names) after the link
  loads. It holds the link's set, not the solver's (I2). The solver's own set is only in the `tab_settings` cookie.
- Not settings but reachable: Tab and Enter step through `tab_settings` using module-level counters in `M:695-730`, and
  Shift reverses.
- Not read: the Share/Duplicate dialogs, the Rules/Title dialog, and edit-mode-only controls. The solve-mode Sudoku
  `Dynamic` centre size depends on `class_square.js` / `class_p.js` code I did not open.
