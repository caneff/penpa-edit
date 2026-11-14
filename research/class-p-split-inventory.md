# class_p.js split inventory: engine, UI, mixed (#84)

The question (caneff/penpa-edit#84): which methods of `docs/js/class_p.js` are engine, which are UI, and which mix the
two? It feeds the ticket that orders the split steps (caneff/penpa-edit#88), under ADR 0001 § "The split, charted"
(`adr/0001-split-engine-from-ui.md:29-45`). This note proposes no split order.

Sources, read 2026-11-14 on `master` at `bc7160c`. Every `file:line` below is under `docs/js/` at that commit unless it
says otherwise. Nothing was run in a browser.

Evidence marks, as in `research/bridge-inventory.md`:

- **READ**: the cited lines were read.
- **RUN**: seen in a run. Nothing in this note is RUN.
- **INFERRED**: the method's body was only scanned by pattern (see Method) and no hit was found. The class follows from
  the scan, but the body was not read line by line.

## Bottom line

`class Puzzle` (class_p.js:95-13788) has 271 methods in 13,320 method lines. **Engine: 191 methods, 4,819 lines.
Mixed: 71 methods, 8,356 lines**, of which 42 (5,706 lines) touch page elements or dialogs and 29 (2,650 lines) only
read `UserSettings`, the custom-colour flags or the `sw_timer` clock. **UI: 9 methods, 145 lines.** The biggest mixed
methods are the three file writers `maketext_gmpfile` (4472-6758, 2,287 lines), `maketext_ppfile2` (3475-4189, 715
lines, no call site anywhere) and `maketext_ppfile` (3029-3473, 445 lines); each reads only a few form fields
(`#savetextarea_pp`, `#nb_size1/2`), so their UI part is thin. The mixed methods whose UI part is thick are
`make_solution` (2621-3027: 22 checkbox reads and six genre-tag reads woven through the rules), `mode_set` (1610-1669)
and `check_solution` (13360-13440: `Swal` popup, timer pause). Three things surprised me. First, the mode API is keyed
by DOM ids: `submode_check` and `stylemode_check` copy the new sub-mode and style from the radio's `.value`, and change
nothing if the radio is missing (1690-1692, 1713-1715); the puzz.link importer calls the radio-ticking mode methods
`mode_set` 78 times, `mode_qa` 67, `subcombimode` 53 and `mode_grid` 44 (`grep -c` lines, puzzlink.js). Second, the answer check's inputs live in
the page: `make_solution`, `checkall_status` and `translate_puzzle_elements` read the `#answersetting` checkboxes and the
select2 genre tags, and `check_solution` runs inside every `redraw` (12583). Third, six `Puzzle` methods have no call
site in `docs/` (887 lines). The audit's "AND/OR rules repeated in `make_solution` and `check_solution`" are really
two branches inside `make_solution` (2624-2822 and 2823-3025), and they already disagree on symbols (§ 3).

## Method

- Methods: every 4-space-indented `name(...) {` line between `class Puzzle {` (95) and its closing brace (13788), 271
  in all. A method ends at the last 4-space `}` before the next method. The 7 methods of `Point` and `Stack`
  (class_p.js:3-50) are engine and are not in the table. Every gap between methods was checked: comments only.
- The method list matches the earlier, unmerged `research/class-p-coupling-inventory.md` on branch
  `prototype/solve-ui` (commit `f0a58fa`, read at `b9a76c0`): it counted 270 methods; master adds `tri_point_order`
  (7376). That note uses other classes (it splits out "Render") and its line numbers are 6-20 lines off master.
  Nothing from it is used here unless re-read on master.
- Class, from the method's own body, by the definitions in caneff/penpa-edit#84:
  - **Engine**: puzzle model, geometry, drawing to the board canvas, board-level input, undo/redo, answer checking,
    link encoding. The board canvas `#canvas` and its wrapper `#dvique` (`docs/index.html:798`) count as board.
  - **UI**: reads or writes page elements other than the board, `Swal`, or `UserSettings`, and does nothing else.
  - **Mixed**: does both. The table says where the engine part ends, or that the two are interleaved.
  - **Mixed (settings)**: a Mixed method whose only non-engine touch is reading `UserSettings`, the pure
    `CustomColor` helpers (customcolor.js has no `document` or `$(` use) or the `sw_timer` clock. It touches no element.
    This is a sub-class of Mixed, kept apart because such a touch becomes a parameter, not a UI call.
  - A touch through a callee is named in the touches column but does not change the class. Example: `key_number` reads
    the colour picker only through `get_customcolor`.
- Scan pattern for touches: `document.`, `getElementById`, `querySelector`, `$(`, `Swal`, `UserSettings`, `window.`,
  `sw_timer`, `panel_pu`, `errorMsg`, `infoMsg`, `alert(`, `localStorage`, `.style.`, `classList`, `navigator`,
  `PenpaText`, `CustomColor`, plus every top-level name defined in general.js, main.js, settings.js, timer.js and the
  other non-class scripts. `errorMsg` and `infoMsg` are `Swal` popups (general.js:1-18).
- Callers outside the file: `pu.name(` or `puzzle.name(` in any other `docs/js/*.js`, plus `this.` / `super.` in the
  five grid-subclass files (class_square.js, class_hex.js, class_tri.js, class_pyramid.js, class_uniform.js). Each
  cell gives up to three lines and the count. "Overridden" lists same-named methods in those subclass files.
- "No call site anywhere": no `.name(` in `docs/js/*.js` or `docs/index.html` (`grep`, READ). Dynamic calls such as
  `this[name]()` do not occur in class_p.js, main.js or general.js (`grep`).

## Counts

| Class | Methods | Method lines |
|---|---:|---:|
| Engine | 191 | 4,819 |
| Mixed (touches page elements or dialogs) | 42 | 5,706 |
| Mixed (settings or clock only) | 29 | 2,650 |
| UI | 9 | 145 |
| **Total** | **271** | **13,320** |

## 1. Every Puzzle method, classified

Grouped by area, in file order. "Mixed (settings)" is the sub-class defined in Method.

### Setup and reset, class_p.js:96-404

| Method | class_p.js | Class | DOM / UI touches (class_p.js lines) | Callers outside class_p.js (`docs/js/`) | Evidence |
|---|---|---|---|---|---|
| `constructor` | 96-233 | Mixed | Engine 96-229: state, board `#canvas` (105) and its wrapper `#dvique` (107). UI 230-232: `document` copy/cut/paste listeners. | - | READ |
| `reset_puzzle` | 235-256 | Engine | - | - | INFERRED |
| `reset` | 258-268 | Engine | - | class_hex.js:33 (1); class_pyramid.js:34 (1); class_square.js:43,4261,4349 (3); class_tri.js:33 (1); class_uniform.js:34,2759,3417… (8) | INFERRED |
| `reset_board` | 270-273 | Engine | - | general.js:1416 (1) | INFERRED |
| `reset_arr` | 275-345 | Engine | No call site anywhere. | - | READ |
| `reset_frame_newgrid` | 347-361 | Engine | - | general.js:918 (1) | INFERRED |
| `load_compat_fixes` | 365-404 | Engine | - | general.js:2702 (1) | INFERRED |

### Pause overlay (UI), class_p.js:406-451

| Method | class_p.js | Class | DOM / UI touches (class_p.js lines) | Callers outside class_p.js (`docs/js/`) | Evidence |
|---|---|---|---|---|---|
| `reset_pause_layer` | 406-415 | UI | `#pause_canvas` size (408-412). | - | READ |
| `show_pause_layer` | 417-440 | UI | `#pause_canvas` (418, 439); `UserSettings.color_theme` (423); `PenpaText` (431). | general.js:910,923 (2); main.js:2298 (1) | READ |
| `hide_pause_layer` | 442-451 | UI | `#pause_canvas` (444, 450). | main.js:2303 (1) | READ |

### Geometry, resize, rotate, class_p.js:453-1368

| Method | class_p.js | Class | DOM / UI touches (class_p.js lines) | Callers outside class_p.js (`docs/js/`) | Evidence |
|---|---|---|---|---|---|
| `make_frameline` | 453-525 | Engine | - | class_hex.js:232 (1); class_pyramid.js:223 (1); class_square.js:213 (1); class_tri.js:239 (1); class_uniform.js:239,2992,3717… (8); general.js:2485,2806 (2) | INFERRED |
| `fill_neighbors` | 529-546 | Engine | - | class_hex.js:205 (1); class_square.js:179 (1) | INFERRED |
| `fix_points` | 551-644 | Engine | - | class_pyramid.js:192 (1); class_tri.js:191 (1); class_uniform.js:218,2971,3696… (7) | INFERRED |
| `point_connect_corners` | 647-672 | Engine | - | class_pyramid.js:192 (1); class_tri.js:191 (1); class_uniform.js:218,2971,3696… (7) | INFERRED |
| `point_fillin_corners` | 675-712 | Engine | - | class_pyramid.js:192 (1); class_tri.js:191 (1) | INFERRED |
| `distance_to_line` | 715-721 | Engine | - | - | INFERRED |
| `between_points` | 723-729 | Engine | - | - | INFERRED |
| `create_corners` | 733-746 | Engine | - | class_uniform.js:218,2971,3696… (7) | INFERRED |
| `point_move` | 748-762 | Engine | - | class_hex.js:231 (1); class_pyramid.js:222 (1); class_square.js:204 (1); class_tri.js:238 (1); class_uniform.js:237,2990,3715… (8); general.js:2476,2801 (2) | INFERRED |
| `search_center` | 764-798 | Engine | - | class_hex.js:228 (1); class_pyramid.js:218 (1); class_square.js:200 (1); class_tri.js:234 (1); class_uniform.js:231,2984,3709… (8); general.js:2742 (1); overridden in 8 subclasses (class_uniform.js:245…) | INFERRED |
| `search_center_pixel` | 800-827 | Engine | - | - | INFERRED |
| `rotate_UD` | 829-833 | Engine | - | main.js:1349 (1) | INFERRED |
| `rotate_LR` | 835-839 | Engine | - | main.js:1345 (1) | INFERRED |
| `point_reflect_LR` | 841-847 | Engine | - | general.js:2480 (1) | INFERRED |
| `point_reflect_UD` | 849-855 | Engine | - | general.js:2483 (1) | INFERRED |
| `rotate_center` | 857-862 | Engine | - | main.js:1353 (1) | INFERRED |
| `rotate_size` | 864-879 | Engine | - | main.js:1336,1341,1357… (11) | INFERRED |
| `rotate_grid` | 881-889 | Engine | - | class_hex.js:389,393 (2); class_pyramid.js:376,380 (2); class_square.js:380,384 (2); class_tri.js:393,397 (2); class_uniform.js:472,476,3190… (16) | INFERRED |
| `rotate_theta` | 891-901 | Engine | - | class_hex.js:1836,2006,2008… (17); class_pyramid.js:1670,1840,1842… (23); class_square.js:2508,2509,2510… (41); class_tri.js:1665,1835,1837… (17); class_uniform.js:1753,1921,1923… (48); overridden in 7 subclasses (class_uniform.js:2712…) | INFERRED |
| `resize_top` | 903-915 | Mixed | Engine except `errorMsg` (a `Swal` popup, general.js:1) at the size limits (910, 912). | main.js:1378,1396,1429… (10); puzzlink.js:1126,2042 (2) | READ |
| `resize_bottom` | 917-929 | Mixed | Same as `resize_top`; `errorMsg` at 924, 926. | main.js:1372,1402,1423… (10); puzzlink.js:1128 (1) | READ |
| `resize_left` | 931-943 | Mixed | Same; `errorMsg` at 938, 940. | main.js:1375,1405,1426… (10); puzzlink.js:1129 (1) | READ |
| `resize_right` | 945-957 | Mixed | Same; `errorMsg` at 952, 954. | main.js:1381,1399,1420… (10); puzzlink.js:1127 (1) | READ |
| `make_resize_point_translator` | 959-1019 | Engine | - | - | INFERRED |
| `resize_board` | 1021-1134 | Engine | - | - | INFERRED |
| `translate_puzzle_elements` | 1145-1330 | Mixed | Reads the `#answersetting .solcheck_or` checkboxes (1238, 1283) to learn the OR categories of the stored solution. The rest is engine. | - | READ |
| `rotate_reset` | 1332-1340 | Engine | - | main.js:1361 (1) | INFERRED |
| `point_usecheck` | 1342-1352 | Engine | - | - | INFERRED |
| `canvasxy_update` | 1354-1358 | Mixed (settings) | `UserSettings.displaysize` sets the cell size (1355). | class_hex.js:229 (1); class_pyramid.js:220 (1); class_square.js:202 (1); class_tri.js:236 (1); class_uniform.js:235,2988,3713… (8) | READ |
| `canvas_size_setting` | 1360-1368 | Engine | Board canvas and `#dvique` style only (1364-1367). | class_hex.js:230 (1); class_pyramid.js:221 (1); class_square.js:203 (1); class_tri.js:237 (1); class_uniform.js:236,2989,3714… (8); general.js:2477,2802 (2) | READ |

### Image export, class_p.js:1370-1540

| Method | class_p.js | Class | DOM / UI touches (class_p.js lines) | Callers outside class_p.js (`docs/js/`) | Evidence |
|---|---|---|---|---|---|
| `resizecanvas` | 1370-1475 | Mixed | Image export. Reads `#nb_margin2`, `#nb_quality1`, `#nb_type1-3`, `#nb_title1`, `#nb_rules1` (1379-1467), interleaved with the offscreen-canvas copy. | general.js:1475,1499,1510 (3) | READ |
| `canvaswithinfo` | 1477-1521 | Mixed | Image export with title and rules. Reads `#saveinfotitle`, `#saveinforules`, `#saveinfoauthor`, `#nb_title1`, `#nb_rules1` (1488-1496). | - | READ |
| `splitTextLines` | 1523-1540 | Engine | Canvas text helper; only caller `canvaswithinfo`. main.js:1886 has its own copy. | - | READ |

### Geometry, resize, rotate, class_p.js:1542-1608

| Method | class_p.js | Class | DOM / UI touches (class_p.js lines) | Callers outside class_p.js (`docs/js/`) | Evidence |
|---|---|---|---|---|---|
| `gridspace_calculate` | 1542-1604 | Engine | - | - | INFERRED |
| `grid_is_square` | 1606-1608 | Engine | - | main.js:1367,1391,1415… (16) | INFERRED |

### Mode switching, class_p.js:1610-1936

| Method | class_p.js | Class | DOM / UI touches (class_p.js lines) | Callers outside class_p.js (`docs/js/`) | Evidence |
|---|---|---|---|---|---|
| `mode_set` | 1610-1669 | Mixed | Engine is spread through it: `edit_mode` (1611), the remembered sub-mode and style (1634-1635), `cursolS` (1660). UI: mode and style rows (1612-1620), `UserSettings.panel_shown` (1622-1633), colour picker and `#style_special` (1645-1653), `#float-key-header-lb` (1656), `#closeBtn_input3` and `#orientation_button` (1663-1664). Restores sub-mode and style through the DOM-keyed `submode_check` / `stylemode_check`. | general.js:96,236,2399… (7); main.js:717,721,724… (9); puzzlink.js:1006,1046,1077… (78); settings.js:236 (1) | READ |
| `number_multi_enabled` | 1671-1675 | Engine | - | class_square.js:507 (1); main.js:200 (1) | INFERRED |
| `set_custom_color` | 1677-1687 | UI | Sets the `#colorpicker_special` spectrum picker (1684) when custom colours are on. | - | READ |
| `submode_check` | 1689-1705 | Mixed | Ticks radio `name` and copies its `.value` into `this.mode` (1690-1692). If the radio is missing the model is not changed. `#closeBtn_input3` (1698). Engine: `cursolcheck`, `type_set` (1703), `redraw`. | main.js:322,411,423… (12); puzzlink.js:2322,2904 (2) | READ |
| `cursolcheck` | 1708-1710 | Engine | Empty hook; overridden in four subclasses. | -; overridden in 4 subclasses (class_pyramid.js:383…) | READ |
| `stylemode_check` | 1712-1719 | Mixed | Ticks radio `name` and copies its `.value` into `this.mode` (1713-1715); `panel_pu.draw_panel` (1716). | main.js:494,517,687… (5) | READ |
| `set_orientation` | 1721-1727 | Mixed | Sets `this.mode[..][2]` only if radio `rot_<dir>` exists (1723-1725). | main.js:1864 (1) | READ |
| `subsymbolmode` | 1729-1741 | Mixed | Engine 1730 (`symbol[0]`), 1739-1740. UI: `#symmode_content` (1732), picker (1733-1737), `panel_pu.draw_panel` (1738). | main.js:1874 (1); puzzlink.js:2014 (1) | READ |
| `subcombimode` | 1743-1778 | Mixed | Engine 1744, 1760-1768, 1775-1777. UI: `#combimode_content` (1746), `#style_line` / `#style_lineE` rows (1756-1757), picker (1770-1774). Calls `stylemode_check('st_edge3')` (1766); `index.html` has no `st_edge3` (it has `st_lineE3`). | main.js:1868 (1); puzzlink.js:1078,1137,1192… (53) | READ |
| `mode_qa` | 1780-1785 | Mixed | Ticks radio (1781); engine 1782-1784. | general.js:2504,2808 (2); main.js:809,816,836… (8); puzzlink.js:1045,1076,1105… (67); puzzlink_import.js:30 (1) | READ |
| `mode_grid` | 1787-1796 | Mixed | Ticks radio (1788); engine 1789-1795. | main.js:1652 (1); puzzlink.js:1064,1118,1175… (44) | READ |
| `submode_reset` | 1798-1821 | UI | Hides 20 mode and style rows by id (1799-1820). | - | READ |
| `reset_selectedmode` | 1823-1930 | Mixed (settings) | Clears the current mode's marks; reads `UserSettings.custom_colors_on` (1828-1924). | general.js:1393 (1) | READ |
| `update_genre_tags` | 1932-1936 | Mixed | Copies the select2 `#genre_tags_opt` into `this.user_tags` (1933). | main.js:33 (1) | READ |

### Link I/O (writers), class_p.js:1940-2367

| Method | class_p.js | Class | DOM / UI touches (class_p.js lines) | Callers outside class_p.js (`docs/js/`) | Evidence |
|---|---|---|---|---|---|
| `__export_text_shared` | 1940-1972 | Mixed | Reads `#saveinfotitle`, `#saveinfoauthor`, `#saveinfosource`, `#saveinforules` (1947-1958) and `UserSettings.draw_edges` (1962) into the link header. | - | READ |
| `__export_list_tab_shared` | 1974-1989 | Mixed (settings) | Writes `UserSettings.tab_settings` into the link (1985). | - | READ |
| `__export_version_shared` | 1991-2013 | Mixed (settings) | `UserSettings.custom_colors_on` (2010). | - | READ |
| `__get_answer_settings` | 2015-2025 | Mixed | Reads the `#answersetting` checkboxes (2019-2022). | - | READ |
| `__export_solcheck_shared` | 2027-2029 | Engine | Own body none; DOM through `__get_answer_settings`. | - | READ |
| `__export_checker_shared` | 2031-2038 | Mixed | select2 `#genre_tags_opt` (2035); DOM through `__get_answer_settings`. | - | READ |
| `__export_finalize_shared` | 2040-2043 | Engine | - | - | READ |
| `maketext_baseurl` | 2045-2056 | Mixed (settings) | `UserSettings.shorten_links` (2047). | - | READ |
| `maketext` | 2058-2138 | Mixed | `#save_undo` (2064, 2084, 2095, 2113), `#custom_message` (2126). | general.js:1578 (1) | READ |
| `maketext_duplicate` | 2140-2238 | Mixed | `sw_timer` (2175), `#custom_message` (2215). | general.js:1588,1857 (2); progress.js:87 (1) | READ |
| `maketext_solve` | 2240-2291 | Mixed | `#custom_message` (2277). | general.js:1583 (1) | READ |
| `maketext_compsolve` | 2293-2334 | Engine | Own body none; DOM through the `__export_*` helpers. | general.js:1596 (1) | READ |
| `maketext_solve_solution` | 2336-2343 | Engine | Own body none; DOM through `maketext_solve` and `make_solution`. | general.js:1601 (1) | READ |
| `maketext_replay` | 2345-2367 | Mixed | `#saveinfosolver` (2362), `sw_timer` (2363); uses the global `pu` (2346, 2350). | general.js:1607 (1) | READ |

### Answer check, class_p.js:2369-3027

| Method | class_p.js | Class | DOM / UI touches (class_p.js lines) | Callers outside class_p.js (`docs/js/`) | Evidence |
|---|---|---|---|---|---|
| `checkall_status` | 2369-2398 | Mixed | Reads the `#answersetting` checkboxes (2371-2393) and sets `this.multisolution`. | - | READ |
| `get_answercheck_settings` | 2400-2444 | UI | Builds an HTML list of the ticked checks with `PenpaText` (2401-2432). Only caller: `display_answercheck`, general.js:3254. | general.js:3254 (1) | READ |
| `get_surface_solution` | 2446-2469 | Engine | - | - | INFERRED |
| `get_line_solution` | 2471-2517 | Mixed (settings) | `UserSettings.ignore_line_style` (2496). | - | READ |
| `get_edge_solution` | 2519-2619 | Mixed | `UserSettings.ignore_line_style` (2543); select2 `#genre_tags_opt` (2552). | - | READ |
| `make_solution` | 2621-3027 | Mixed | Rules interleaved with 22 checkbox reads (`#sol_*`, `#answersetting`, 2625-2832) and six select2 `#genre_tags_opt` reads (2714, 2723, 2734, 2876, 2885, 2896). No engine-only range. | - | READ |

### Link I/O (other formats), class_p.js:3029-4189

| Method | class_p.js | Class | DOM / UI touches (class_p.js lines) | Callers outside class_p.js (`docs/js/`) | Evidence |
|---|---|---|---|---|---|
| `maketext_ppfile` | 3029-3473 | Mixed | Reads the export header `#savetextarea_pp` (3033); the rest is engine. | general.js:1657 (1) | READ |
| `maketext_ppfile2` | 3475-4189 | Mixed | Reads `#savetextarea_pp` (3481). No call site anywhere. | - | READ |

### Link I/O helpers, class_p.js:4191-4470

| Method | class_p.js | Class | DOM / UI touches (class_p.js lines) | Callers outside class_p.js (`docs/js/`) | Evidence |
|---|---|---|---|---|---|
| `getAllIndexes` | 4191-4202 | Engine | - | - | INFERRED |
| `getloopdata` | 4204-4313 | Engine | - | - | INFERRED |
| `getregiondata` | 4315-4470 | Engine | - | conflicts.js:206,553 (2) | INFERRED |

### Link I/O (other formats), class_p.js:4472-6758

| Method | class_p.js | Class | DOM / UI touches (class_p.js lines) | Callers outside class_p.js (`docs/js/`) | Evidence |
|---|---|---|---|---|---|
| `maketext_gmpfile` | 4472-6758 | Mixed | Reads `#savetextarea_pp` (4474), `#nb_size1/2` in 22 branches (4549-6513), `#nb_space1/3` (6367-6368); `PenpaText` (6751, 6754). | general.js:1663 (1) | READ |

### Undo, redo, replay, class_p.js:6760-7326

| Method | class_p.js | Class | DOM / UI touches (class_p.js lines) | Callers outside class_p.js (`docs/js/`) | Evidence |
|---|---|---|---|---|---|
| `undo` | 6760-6993 | Mixed (settings) | `sw_timer` stamps the replay entry (6976). | general.js:1167,1177 (2); main.js:594,1000,1141… (5) | READ |
| `redo` | 6995-7213 | Mixed (settings) | `sw_timer` (7196). | general.js:1007,1123,1186 (3); main.js:525,587,1033… (5) | READ |
| `record` | 7216-7289 | Engine | - | - | READ |
| `record_replay` | 7291-7326 | Mixed (settings) | `sw_timer` (7294). | - | READ |

### Model edits, class_p.js:7328-7368

| Method | class_p.js | Class | DOM / UI touches (class_p.js lines) | Callers outside class_p.js (`docs/js/`) | Evidence |
|---|---|---|---|---|---|
| `set_value` | 7328-7337 | Engine | - | - | INFERRED |
| `remove_value` | 7339-7345 | Engine | - | - | INFERRED |
| `set_surface` | 7347-7364 | Engine | - | - | INFERRED |
| `remove_surface` | 7366-7368 | Engine | - | - | INFERRED |

### Clipboard, class_p.js:7376-7698

| Method | class_p.js | Class | DOM / UI touches (class_p.js lines) | Callers outside class_p.js (`docs/js/`) | Evidence |
|---|---|---|---|---|---|
| `tri_point_order` | 7376-7380 | Engine | - | - | INFERRED |
| `copy_handler` | 7382-7535 | Engine | Receives the `document` copy event wired in the constructor (230). | - | INFERRED |
| `cut_handler` | 7537-7592 | Engine | Same, cut (231). | - | INFERRED |
| `paste_handler` | 7594-7698 | Engine | Same, paste (232). | - | INFERRED |

### Key input, class_p.js:7706-8605

| Method | class_p.js | Class | DOM / UI touches (class_p.js lines) | Callers outside class_p.js (`docs/js/`) | Evidence |
|---|---|---|---|---|---|
| `key_number` | 7706-8267 | Mixed (settings) | `UserSettings.shortcuts_enabled` (7716), `sudoku_centre_size` (8195-8196), `custom_colors_on`; the picker through `get_customcolor` (7894). | class_panel.js:78 (1); main.js:439,451,453… (19) | READ |
| `onofftext` | 8269-8286 | Engine | - | - | INFERRED |
| `check_neighbors` | 8288-8318 | Engine | No call site anywhere (conflicts.js:249, 286 have their own local `check_neighbors`). | - | READ |
| `key_space` | 8320-8495 | Mixed (settings) | `UserSettings.custom_colors_on`. | class_panel.js:76 (1); main.js:432,501,616… (11) | READ |
| `key_shiftspace` | 8497-8513 | Engine | - | main.js:599 (1) | INFERRED |
| `key_backspace` | 8515-8597 | Engine | - | main.js:504,614,2024 (3) | INFERRED |
| `recalculate_num` | 8603-8605 | Engine | - | -; overridden in 8 subclasses (class_uniform.js:404…) | INFERRED |

### Pointer input, class_p.js:8607-12469

| Method | class_p.js | Class | DOM / UI touches (class_p.js lines) | Callers outside class_p.js (`docs/js/`) | Evidence |
|---|---|---|---|---|---|
| `handle_rect_mousedown` | 8607-8641 | Mixed (settings) | `UserSettings.secondcolor`; `isAltKeyHeld` / `isShiftKeyHeld` (main.js:4-6, pure event readers) at 8615-8616. | - | READ |
| `mouseevent` | 8643-8731 | Mixed | Enables `#closeBtn_input3` after a Number click (8705); the rest is engine dispatch. | main.js:140,145,178… (5) | READ |
| `dblmouseevent` | 8735-8800 | Engine | - | main.js:135 (1) | INFERRED |
| `mouse_surface` | 8806-8860 | Mixed (settings) | `UserSettings.secondcolor`. | - | READ |
| `re_surface` | 8862-8879 | Mixed (settings) | `UserSettings.secondcolor`. | - | READ |
| `re_surface_twobutton` | 8881-8892 | Engine | - | - | INFERRED |
| `re_surfaceR` | 8894-8905 | Mixed (settings) | `UserSettings.secondcolor`. | - | READ |
| `re_surfacemove` | 8907-8925 | Engine | - | - | INFERRED |
| `get_rgbcolor` | 8927-8966 | Engine | No call site anywhere. | - | READ |
| `line_key` | 8972-8974 | Engine | - | - | INFERRED |
| `split_line` | 8977-8980 | Engine | - | -; overridden in 1 subclass (class_square.js:1276) | INFERRED |
| `line_change` | 8983-8992 | Engine | - | - | INFERRED |
| `mouse_line` | 8994-9013 | Engine | - | - | INFERRED |
| `re_line` | 9016-9110 | Mixed (settings) | `UserSettings.custom_colors_on`; picker through `get_customcolor` (9068, 9095). | class_pyramid.js:525 (1) | READ |
| `re_linemove` | 9112-9137 | Engine | - | - | INFERRED |
| `mouse_linefree` | 9139-9165 | Engine | - | - | INFERRED |
| `re_lineup_free` | 9167-9188 | Engine | - | - | INFERRED |
| `mouse_lineX` | 9190-9194 | Engine | - | - | INFERRED |
| `re_lineX` | 9196-9218 | Mixed (settings) | Same; `get_customcolor` (9208). | - | READ |
| `mouse_lineE` | 9224-9243 | Engine | - | - | INFERRED |
| `re_linemoveE` | 9245-9276 | Engine | - | - | INFERRED |
| `mouse_lineEfree` | 9278-9304 | Engine | - | - | INFERRED |
| `re_lineEup_free` | 9306-9324 | Engine | - | - | INFERRED |
| `mouse_lineEX` | 9326-9330 | Engine | - | - | INFERRED |
| `re_lineEX` | 9332-9354 | Mixed (settings) | Same; `get_customcolor` (9344). | - | READ |
| `mouse_wall` | 9360-9378 | Engine | - | - | INFERRED |
| `re_wallmove` | 9380-9391 | Engine | - | -; overridden in 1 subclass (class_pyramid.js:518) | INFERRED |
| `mouse_number` | 9397-9433 | Engine | - | - | INFERRED |
| `mouse_numberS` | 9435-9454 | Engine | - | - | INFERRED |
| `mouse_sudoku` | 9456-9503 | Engine | - | - | INFERRED |
| `re_numberarrow` | 9505-9543 | Engine | - | - | INFERRED |
| `direction_arrow8` | 9545-9546 | Engine | - | -; overridden in 7 subclasses (class_hex.js:650…) | INFERRED |
| `direction_arrow4` | 9547-9548 | Engine | - | -; overridden in 1 subclass (class_square.js:688) | INFERRED |
| `mouse_symbol` | 9554-9571 | Mixed | `UserSettings.panel_shown` and the floating panel's `panel_pu.edit_num` pick the symbol (9557-9562). | - | READ |
| `mouse_cage` | 9577-9765 | Mixed | Radios `#sub_cage1` / `#sub_cage2` choose Killer or Free (9578, 9749), not `this.mode`. | - | READ |
| `cage_for_selection` | 9768-9809 | Engine | - | - | INFERRED |
| `flood_cage` | 9814-9852 | Engine | - | - | INFERRED |
| `get_cage_context` | 9854-9946 | Engine | - | - | INFERRED |
| `cell_outside` | 9949-9962 | Engine | - | - | INFERRED |
| `re_linecage` | 9964-9975 | Engine | - | - | INFERRED |
| `mouse_special` | 9981-10011 | Engine | - | - | INFERRED |
| `re_specialdown` | 10013-10019 | Engine | - | - | INFERRED |
| `re_special` | 10021-10042 | Mixed (settings) | `custom_colors_on`; `get_customcolor` (10032). | - | READ |
| `re_specialup` | 10044-10073 | Mixed (settings) | `custom_colors_on` (10049). | - | READ |
| `re_polygonmove` | 10075-10091 | Mixed (settings) | `custom_colors_on`; `get_customcolor` (10081). | - | READ |
| `re_polygondown` | 10093-10118 | Engine | - | - | INFERRED |
| `mouse_board` | 10124-10138 | Engine | - | - | INFERRED |
| `re_board` | 10140-10157 | Engine | - | - | INFERRED |
| `check_last_cell` | 10159-10166 | Mixed | `infoMsg` (`Swal`) with `PenpaText` (10161). | - | READ |
| `re_boardmove` | 10168-10182 | Engine | - | - | INFERRED |
| `mouse_move` | 10188-10213 | Engine | - | - | INFERRED |
| `re_movedown` | 10215-10233 | Engine | - | - | INFERRED |
| `re_movemove` | 10235-10269 | Engine | - | - | INFERRED |
| `mouse_combi` | 10275-10596 | Mixed (settings) | `UserSettings.starbattle_dots` (10356-10440). | - | READ |
| `re_combi_blpo` | 10598-10611 | Engine | - | - | INFERRED |
| `re_combi_blpo_downright` | 10613-10626 | Engine | - | - | INFERRED |
| `re_combi_blpo_move` | 10628-10647 | Engine | - | - | INFERRED |
| `re_combi_blwh` | 10649-10669 | Engine | - | - | INFERRED |
| `re_combi_blwh_downright` | 10671-10691 | Engine | - | - | INFERRED |
| `re_combi_blwh_move` | 10693-10712 | Engine | - | - | INFERRED |
| `re_combi_shaka` | 10714-10721 | Engine | - | - | INFERRED |
| `re_combi_shaka_move` | 10723-10742 | Engine | - | - | INFERRED |
| `re_combi_shaka_up` | 10744-10759 | Engine | - | - | INFERRED |
| `re_combi_linex` | 10761-10766 | Engine | - | - | INFERRED |
| `re_combi_linex_move` | 10768-10797 | Engine | - | - | INFERRED |
| `re_combi_lineox` | 10799-10803 | Engine | - | - | INFERRED |
| `re_combi_lineox_move` | 10805-10820 | Engine | - | - | INFERRED |
| `re_combi_lineox_up` | 10822-10852 | Engine | - | - | INFERRED |
| `re_combi_linedir` | 10854-10858 | Engine | - | - | INFERRED |
| `re_combi_linedir_get_arrow_side` | 10860-10873 | Engine | - | - | INFERRED |
| `re_combi_linedir_make_arrow` | 10875-10901 | Engine | No call site anywhere. | - | READ |
| `re_combi_linedir_move` | 10903-10953 | Engine | - | - | INFERRED |
| `re_combi_linedir_downright` | 10955-11021 | Engine | - | - | INFERRED |
| `re_combi_linedir_up` | 11023-11094 | Engine | - | - | INFERRED |
| `re_combi_cross_downright` | 11096-11158 | Engine | - | - | INFERRED |
| `re_combi_edgexoi` | 11160-11165 | Engine | - | - | INFERRED |
| `re_combi_edgexoi_move` | 11167-11179 | Engine | - | - | INFERRED |
| `re_combi_edgexoi_up` | 11181-11204 | Mixed (settings) | `UserSettings.secondcolor`. | - | READ |
| `re_combi_edgex` | 11206-11211 | Engine | - | - | INFERRED |
| `re_combi_edgex_move` | 11213-11272 | Engine | - | - | INFERRED |
| `re_combi_edgex_up` | 11274-11279 | Engine | - | - | INFERRED |
| `re_combi_yajilin` | 11281-11286 | Engine | - | - | INFERRED |
| `re_combi_yajilin_move` | 11288-11315 | Engine | - | - | INFERRED |
| `re_combi_yajilin_up` | 11317-11340 | Engine | - | - | INFERRED |
| `re_combi_yajilin_up_reduced` | 11342-11357 | Engine | - | - | INFERRED |
| `re_combi_yajilin_downright` | 11359-11380 | Engine | - | - | INFERRED |
| `re_combi_rassisillai` | 11382-11387 | Engine | - | - | INFERRED |
| `re_combi_rassisillai_move` | 11389-11411 | Engine | - | - | INFERRED |
| `re_combi_rassisillai_up` | 11413-11428 | Engine | - | - | INFERRED |
| `re_combi_rassisillai_up_reduced` | 11430-11445 | Engine | - | - | INFERRED |
| `re_combi_rassisillai_downright` | 11447-11462 | Engine | - | - | INFERRED |
| `re_combi_akari` | 11464-11469 | Engine | - | - | INFERRED |
| `re_combi_akari_move` | 11471-11498 | Engine | - | - | INFERRED |
| `re_combi_akari_up` | 11500-11535 | Engine | - | - | INFERRED |
| `re_combi_akari_up_reduced` | 11537-11560 | Engine | - | - | INFERRED |
| `re_combi_akari_downright` | 11562-11595 | Engine | - | - | INFERRED |
| `re_combi_hashi` | 11597-11601 | Engine | - | - | INFERRED |
| `re_combi_hashi_move` | 11603-11622 | Engine | - | - | INFERRED |
| `re_combi_hashi_up` | 11624-11640 | Engine | - | - | INFERRED |
| `re_combi_edgesub` | 11642-11653 | Engine | - | - | INFERRED |
| `re_combi_edgesub_move` | 11655-11677 | Engine | - | - | INFERRED |
| `re_combi_battleship` | 11679-11698 | Engine | - | - | INFERRED |
| `re_combi_battleship_downright` | 11700-11715 | Engine | - | - | INFERRED |
| `re_combi_battleship_move` | 11717-11772 | Engine | - | - | INFERRED |
| `re_combi_battleship_up` | 11774-11819 | Engine | - | - | INFERRED |
| `get_neighbors` | 11821-11882 | Engine | - | - | INFERRED |
| `re_combi_star_reduced` | 11884-11912 | Engine | - | - | INFERRED |
| `re_combi_star` | 11914-11964 | Engine | - | - | INFERRED |
| `re_combi_star_downright` | 11966-11998 | Engine | - | - | INFERRED |
| `re_combi_star_move` | 12000-12014 | Engine | - | - | INFERRED |
| `re_combi_mines_reduced` | 12016-12043 | Engine | - | - | INFERRED |
| `re_combi_mines` | 12045-12094 | Engine | - | - | INFERRED |
| `re_combi_doublemines_reduced` | 12096-12127 | Engine | - | - | INFERRED |
| `re_combi_doublemines` | 12129-12182 | Engine | - | - | INFERRED |
| `re_combi_mines_downright` | 12184-12216 | Engine | - | - | INFERRED |
| `re_combi_mines_move` | 12218-12232 | Engine | - | - | INFERRED |
| `re_combi_tents` | 12234-12239 | Engine | - | - | INFERRED |
| `re_combi_tents_move` | 12241-12253 | Engine | - | - | INFERRED |
| `re_combi_tents_up` | 12255-12284 | Engine | - | - | INFERRED |
| `re_combi_magnets` | 12286-12298 | Engine | - | - | INFERRED |
| `re_combi_magnets_downright` | 12300-12312 | Engine | - | - | INFERRED |
| `re_combi_arrowS_up` | 12314-12326 | Engine | - | - | INFERRED |
| `re_combi_arrowS` | 12328-12336 | Engine | - | - | INFERRED |
| `re_combi_arrowS_move` | 12338-12354 | Engine | - | - | INFERRED |
| `re_combi_numfl_up` | 12356-12372 | Engine | - | - | INFERRED |
| `re_combi_numfl` | 12374-12382 | Engine | - | - | INFERRED |
| `re_combi_numfl_move` | 12384-12400 | Engine | - | - | INFERRED |
| `re_combi_alfl_up` | 12402-12418 | Engine | - | - | INFERRED |
| `re_combi_alfl` | 12420-12428 | Engine | - | - | INFERRED |
| `re_combi_alfl_move` | 12430-12446 | Engine | - | - | INFERRED |
| `direction_num8` | 12448-12469 | Engine | - | - | INFERRED |

### Background image, class_p.js:12475-12573

| Method | class_p.js | Class | DOM / UI touches (class_p.js lines) | Callers outside class_p.js (`docs/js/`) | Evidence |
|---|---|---|---|---|---|
| `update_bg_image_url` | 12475-12484 | Mixed | Reads `#bg_image_url` (12476) into `bg_image_data`. | main.js:2056 (1) | READ |
| `extract_bg_image_pixels` | 12486-12526 | Engine | Offscreen canvas only (12491). | - | READ |
| `update_bg_image_attrs` | 12528-12540 | Mixed | Reads `#bg_image_*` fields (12530-12538) into `bg_image_data`. | main.js:2058 (1) | READ |
| `load_bg_image_attrs` | 12542-12553 | UI | Writes `bg_image_data` into the `#bg_image_*` fields (12545-12550). | general.js:2122 (1) | READ |
| `draw_bg_image` | 12555-12573 | Engine | - | - | INFERRED |

### Drawing, class_p.js:12575-13358

| Method | class_p.js | Class | DOM / UI touches (class_p.js lines) | Callers outside class_p.js (`docs/js/`) | Evidence |
|---|---|---|---|---|---|
| `redraw` | 12575-12598 | Mixed | Engine: `flushcanvas`, `draw_bg_image`, `check_solution`, `draw` (12577-12592). UI: `panel_pu.draw_panel` (12588), `set_redoundocolor` (12590). | class_hex.js:647 (1); class_pyramid.js:487,527 (2); class_square.js:654 (1); class_tri.js:493 (1); class_uniform.js:796,3300,8077 (3); general.js:112,908,920… (6); main.js:239,376,576… (4); puzzlink.js:3048 (1); settings.js:138,153,219… (7) | READ |
| `set_redoundocolor` | 12600-12603 | UI | `#tb_undo` / `#tb_redo` disabled state (12601-12602). | settings.js:359 (1) | READ |
| `flushcanvas` | 12605-12613 | Engine | - | - | INFERRED |
| `draw` | 12615-12617 | Engine | - | -; overridden in 12 subclasses (class_hex.js:679…) | INFERRED |
| `draw_frame` | 12619-12631 | Engine | - | class_hex.js:698,724 (2); class_pyramid.js:551,577 (2); class_square.js:780,806 (2); class_tri.js:542,567 (2); class_uniform.js:839,858,3208… (16) | INFERRED |
| `draw_frameBold` | 12633-12646 | Engine | - | class_hex.js:682,716 (2); class_pyramid.js:536,569 (2); class_square.js:762,798 (2); class_tri.js:529,560 (2); class_uniform.js:846,863,3203… (16) | INFERRED |
| `draw_polygonsp` | 12648-12670 | Mixed (settings) | `custom_colors_on` (12653). | class_hex.js:699,700,725 (3); class_pyramid.js:552,553,578 (3); class_square.js:781,782,807 (3); class_tri.js:543,544,568 (3); class_uniform.js:840,841,859… (24) | READ |
| `draw_surface` | 12672-12811 | Mixed (settings) | `custom_colors_on`, `secondcolor`. | class_hex.js:683,684,717 (3); class_pyramid.js:537,538,570 (3); class_square.js:763,764,799 (3); class_tri.js:530,531,561 (3); class_uniform.js:835,836,856… (24) | READ |
| `draw_freecircle` | 12813-12840 | Engine | - | class_hex.js:714,734 (2); class_pyramid.js:567,587 (2); class_square.js:796,817 (2); class_tri.js:558,577 (2); class_uniform.js:854,868,3222… (16); overridden in 1 subclass (class_tri.js:1139) | INFERRED |
| `draw_cursol` | 12842-12864 | Mixed (settings) | `UserSettings.panel_shown` (12847), `draw_edges` (12858). | class_hex.js:713,733 (2); class_pyramid.js:566,586 (2); class_square.js:795,816 (2); class_tri.js:557,576 (2); class_uniform.js:853,867,3221… (16) | READ |
| `default_cursol` | 12866-12875 | Engine | - | - | INFERRED |
| `draw_conflicts` | 12877-12891 | Engine | - | class_hex.js:685 (1); class_square.js:765 (1) | INFERRED |
| `draw_selection` | 12893-12959 | Mixed | Reads radio `#sub_cage1` (12896). | class_hex.js:706,729 (2); class_pyramid.js:559,582 (2); class_square.js:786,811 (2); class_tri.js:550,572 (2); class_uniform.js:845,862,3214… (16) | READ |
| `draw_cage` | 12961-13173 | Mixed (settings) | `custom_colors_on` (12972-13080). | class_hex.js:709,710,731 (3); class_pyramid.js:562,563,584 (3); class_square.js:791,792,814 (3); class_tri.js:553,554,574 (3); class_uniform.js:849,850,865… (21) | READ |
| `get_cage_coordinates` | 13175-13187 | Engine | - | - | INFERRED |
| `preprocess_cage` | 13190-13256 | Engine | - | - | INFERRED |
| `remove_from_array` | 13259-13265 | Engine | - | - | INFERRED |
| `process_for_drawing` | 13268-13358 | Mixed (settings) | `custom_colors_on` (13303, 13335). | - | READ |

### Answer check, class_p.js:13360-13440

| Method | class_p.js | Class | DOM / UI touches (class_p.js lines) | Callers outside class_p.js (`docs/js/`) | Evidence |
|---|---|---|---|---|---|
| `check_solution` | 13360-13440 | Mixed | Engine: compare `make_solution` with `this.solution`, set `sol_flag` (13361-13366, 13385-13389, 13394-13438). UI: `#custom_message` (13367, 13405), `Swal.fire` (13373, 13411), `sw_timer.pause` (13382, 13419), `Identity`, `DOMPurify`. | - | READ |

### Key input, class_p.js:13442-13444

| Method | class_p.js | Class | DOM / UI touches (class_p.js lines) | Callers outside class_p.js (`docs/js/`) | Evidence |
|---|---|---|---|---|---|
| `only_alphanumeric` | 13442-13444 | Engine | - | - | INFERRED |

### Sudoku text import/export, class_p.js:13446-13653

| Method | class_p.js | Class | DOM / UI touches (class_p.js lines) | Callers outside class_p.js (`docs/js/`) | Evidence |
|---|---|---|---|---|---|
| `load_clues` | 13446-13541 | Mixed | UI 13447-13499: reads `#iostring` and five option fields, toggles the error labels. Engine 13500-13540: places the digits with `record`. | general.js:1878 (1) | READ |
| `export_clues` | 13543-13653 | Mixed | UI 13545-13569 reads `#nb_space1/3`, `#firstcell_*`, `#ignore_pencilmarks`. Engine builds the string (13556-13634). UI 13636-13651 writes `#iostring` and the clipboard. | general.js:1909 (1) | READ |

### Geometry, resize, rotate, class_p.js:13655-13682

| Method | class_p.js | Class | DOM / UI touches (class_p.js lines) | Callers outside class_p.js (`docs/js/`) | Evidence |
|---|---|---|---|---|---|
| `get_orientation` | 13655-13682 | Engine | - | main.js:1366,1390,1414… (8) | INFERRED |

### Custom colour, class_p.js:13684-13688

| Method | class_p.js | Class | DOM / UI touches (class_p.js lines) | Callers outside class_p.js (`docs/js/`) | Evidence |
|---|---|---|---|---|---|
| `get_customcolor` | 13684-13688 | UI | Reads the `#colorpicker_special` picker (13685). Called by seven input sites (7894, 9068, 9095, 9208, 9344, 10032, 10081) and class_panel.js:300. | class_panel.js:300 (1) | READ |

### Answer check, class_p.js:13690-13735

| Method | class_p.js | Class | DOM / UI touches (class_p.js lines) | Callers outside class_p.js (`docs/js/`) | Evidence |
|---|---|---|---|---|---|
| `check_conflict` | 13690-13735 | Mixed (settings) | `UserSettings.show_conflicts` (13691). | -; overridden in 1 subclass (class_hex.js:2965) | READ |

### Custom colour, class_p.js:13737-13762

| Method | class_p.js | Class | DOM / UI touches (class_p.js lines) | Callers outside class_p.js (`docs/js/`) | Evidence |
|---|---|---|---|---|---|
| `update_customcolor` | 13737-13755 | Mixed | Engine 13738-13750 (mode memory, `custom_colors`). UI: `#st_surface<n>_lb` swatch (13752), `panel_pu.draw_panel` (13754). | main.js:66 (1) | READ |
| `get_surface_color` | 13757-13762 | Engine | - | - | INFERRED |

### Version checks, class_p.js:13764-13786

| Method | class_p.js | Class | DOM / UI touches (class_p.js lines) | Callers outside class_p.js (`docs/js/`) | Evidence |
|---|---|---|---|---|---|
| `version_lt` | 13764-13770 | Engine | - | class_square.js:3966,3995,4024… (4) | INFERRED |
| `version_ge` | 13772-13774 | Engine | - | class_square.js:1656,1900,2507… (16) | INFERRED |
| `version_gt` | 13776-13782 | Engine | - | - | INFERRED |
| `version_le` | 13784-13786 | Engine | No call site anywhere. | - | READ |

## 2. What general.js and main.js call in class_p.js

Each row is a named function that calls a `pu` method or reads a `pu` property. Tags after each method: [E] Engine,
[M] Mixed, [MS] Mixed (settings), [U] UI, [sub] a grid-subclass method not defined on `Puzzle`. "Page lines" counts
lines in the function that match `document.`, `$(`, `Swal` or `UserSettings`; it shows how much of the function is
page code. "pu props" counts distinct `pu.<name>` properties read or written without a call. Functions with neither are
left out: they are pure page code (for example `set_display_labels`, general.js:251-422, 43 page lines). All rows are
READ from `grep` output; the function ranges run to the next `function` line, so a range can include trailing
top-level code (noted).

### general.js

| Function | Range | Page lines | `pu` methods called | pu props |
|---|---|---:|---|---:|
| `create` | 85-114 | 5 | `mode_set` [M] 96; `redraw` [M] 112; `reset_frame` [sub] 91 | 1 |
| `create_newboard` | 198-250 | 7 | `mode_set` [M] 236; `reset_frame` [sub] 233 | 2 |
| `make_class` | 423-746 | 78 | `draw_N` [sub] 593,622,651; `draw_Z` [sub] 598,627,656; `draw_kakurogrid` [sub] 670; `draw_sudokugrid` [sub] 589,618,647 | 1 |
| `CreateCheck` | 891-915 | 3 | `redraw` [M] 908; `show_pause_layer` [U] 910 | 0 |
| `redraw_grid` | 916-926 | 1 | `redraw` [M] 920; `reset_frame_newgrid` [E] 918; `show_pause_layer` [U] 923 | 1 |
| `display_rules` | 931-937 | 1 | - | 1 |
| `replay_choice` | 938-1109 | 49 | `redo` [MS] 1007 | 6 |
| `replay_play` | 1110-1141 | 10 | `redo` [MS] 1123 | 3 |
| `replay_pause` | 1142-1156 | 5 | - | 2 |
| `replay_reset` | 1157-1173 | 3 | `undo` [MS] 1167 | 4 |
| `replay_backward` | 1174-1182 | 0 | `undo` [MS] 1177 | 3 |
| `replay_forward` | 1183-1189 | 0 | `redo` [MS] 1186 | 2 |
| `panel_onoff` | 1198-1217 | 11 | `redraw` [M] 1215 | 0 |
| `advancecontrol_on` | 1332-1356 | 0 | `erase_buttons` [sub] 1338 | 4 |
| `ResetCheck` | 1357-1397 | 1 | `reset_selectedmode` [MS] 1393 | 1 |
| `DeleteCheck` | 1398-1428 | 3 | `redraw` [M] 1417; `reset_board` [E] 1416 | 0 |
| `saveimage_download` | 1458-1506 | 6 | `resizecanvas` [M] 1475,1499 | 1 |
| `saveimage_window` | 1507-1531 | 4 | `resizecanvas` [M] 1510 | 0 |
| `savetext_edit` | 1577-1581 | 0 | `maketext` [M] 1578 | 0 |
| `savetext_solve` | 1582-1586 | 0 | `maketext_solve` [M] 1583 | 0 |
| `savetext_clone` | 1587-1594 | 0 | `maketext_duplicate` [M] 1588 | 1 |
| `savetext_comp` | 1595-1599 | 0 | `maketext_compsolve` [E] 1596 | 0 |
| `savetext_withsolution` | 1600-1605 | 1 | `maketext_solve_solution` [E] 1601 | 0 |
| `savetext_withreplay` | 1606-1612 | 1 | `maketext_replay` [M] 1607 | 1 |
| `update_textarea` | 1630-1655 | 4 | - | 1 |
| `make_ppfile` | 1656-1661 | 2 | `maketext_ppfile` [M] 1657 | 0 |
| `make_gmpfile` | 1662-1667 | 2 | `maketext_gmpfile` [M] 1663 | 0 |
| `duplicate` | 1856-1866 | 0 | `maketext_duplicate` [M] 1857 | 1 |
| `import_sudoku` | 1867-1897 | 4 | `load_clues` [M] 1878 | 1 |
| `export_sudoku` | 1898-1928 | 4 | `export_clues` [M] 1909 | 1 |
| `load` | 1995-2705 | 77 | `canvas_size_setting` [E] 2477; `create_point` [sub] 2475; `load_bg_image_attrs` [U] 2122; `load_compat_fixes` [E] 2702; `make_frameline` [E] 2485; `mode_qa` [M] 2504; `mode_set` [M] 2399,2518,2597; `point_move` [E] 2476; `point_reflect_LR` [E] 2480; `point_reflect_UD` [E] 2483; `redraw` [M] 2563 | 28 |
| `largest_undo_group` | 2706-2719 | 0 | - | 4 |
| `loadver1` | 2720-2811 | 11 | `canvas_size_setting` [E] 2802; `create_point` [sub] 2800; `make_frameline` [E] 2806; `mode_qa` [M] 2808; `mode_set` [M] 2770,2809; `point_move` [E] 2801; `reset_frame` [sub] 2754,2775; `search_center` [E] 2742 | 13 |
| `loadqa_arrayver1` | 2812-3152 | 0 | - | 4 |
| `set_solvemode` | 3153-3212 | 29 | - | 2 |
| `set_contestmode` | 3213-3233 | 13 | - | 2 |
| `display_answercheck` | 3252-3261 | 0 | `get_answercheck_settings` [U] 3254 | 0 |

### main.js

| Function | Range | Page lines | `pu` methods called | pu props |
|---|---|---:|---|---:|
| (top-level setup) | 1-89 | - | `update_genre_tags` [M] 33 (select2 `change` handler from 32); `update_customcolor` [M] 66 (spectrum picker `change` handler from 65) | - |
| `restrict_mouse` | 90-104 | 0 | - | 3 |
| `onDown` | 105-150 | 0 | `dblmouseevent` [E] 135; `mouseevent` [M] 140,145 | 7 |
| `onUp` | 151-182 | 0 | `mouseevent` [M] 178 | 3 |
| `onMove` | 183-247 | 0 | `mouseevent` [M] 242; `number_multi_enabled` [E] 200; `redraw` [M] 239 | 9 |
| `onOut` | 252-260 | 0 | `mouseevent` [M] 256 | 2 |
| `onKeyDown` | 294-753 | 4 | `key_arrow` [sub] 350; `key_backspace` [E] 504,614; `key_number` [MS] 439,451,453…; `key_shiftspace` [E] 599; `key_space` [MS] 432,501,616…; `mode_set` [M] 717,721,724…; `redo` [MS] 525,587; `redraw` [M] 376,576; `stylemode_check` [M] 494,517,687; `submode_check` [M] 322,411,423…; `undo` [MS] 594 | 4 |
| `checkShortcutKeys` | 754-794 | 3 | `mode_set` [M] 771; `submode_check` [M] 780 | 1 |
| `checkFunctionKeys` | 795-871 | 8 | `mode_qa` [M] 809,816,836… | 3 |
| `onKeyUp` | 872-918 | 0 | `submode_check` [M] 886,888,890… | 1 |
| `coord_point` | 919-985 | 2 | - | 3 |
| `undoDown` | 990-1008 | 0 | `undo` [MS] 1000 | 1 |
| `redoDown` | 1023-1041 | 0 | `redo` [MS] 1033 | 1 |
| `window_click` | 1060-1885 | 47 | `get_orientation` [E] 1366,1390,1414…; `grid_is_square` [E] 1367,1391,1415…; `key_number` [MS] 1856; `mode_grid` [M] 1652; `mode_qa` [M] 1082,1086,1713…; `mode_set` [M] 1844; `redo` [MS] 1144,1819; `resize_bottom` [M] 1372,1402,1423…; `resize_left` [M] 1375,1405,1426…; `resize_right` [M] 1381,1399,1420…; `resize_top` [M] 1378,1396,1429…; `rotate_LR` [E] 1345; `rotate_UD` [E] 1349; `rotate_center` [E] 1353; `rotate_left` [sub] 1340; `rotate_reset` [E] 1361; `rotate_right` [sub] 1335; `rotate_size` [E] 1336,1341,1357…; `set_orientation` [M] 1864; `stylemode_check` [M] 1855,1859; `subcombimode` [M] 1868; `submode_check` [M] 1849; `subsymbolmode` [M] 1874; `undo` [MS] 1141,1811,1835 | 5 |
| `f_mdown` and the top-level listeners after it | 1990-2296 (f_mdown ends at 2049; 2052-2058 background-image listeners; 2062-2296 settings `onchange` handlers) | 77 | `key_backspace` [E] 2024; `key_number` [MS] 2012,2014,2022…; `key_space` [MS] 2016,2026,2034…; `redraw` [M] 2218; `update_bg_image_attrs` [M] 2058; `update_bg_image_url` [M] 2056 | 5 |
| `pauseTimer` | 2297-2301 | 0 | `show_pause_layer` [U] 2298 | 0 |
| `startTimer` | 2302-2326 | 3 | `hide_pause_layer` [U] 2303 | 0 |
| `clear_storage_one` | 2327-2341 | 2 | - | 1 |

What `window_click` (main.js:1060-1885) is: one `mousedown`/`touchstart` handler on `document` (main.js:1057-1058) that
switches on the clicked element's id. Its `pu` calls fall in groups (READ):

- Middle click flips Problem and Solution with `mode_qa` (1076-1088), and recolours `#dvique`.
- Toolbar Undo and Redo (`tb_undo` / `tb_redo`, 1140-1144).
- Rotate and resize buttons `rt_*` (1330-1610): `rotate_*`, `resize_*`, `get_orientation`, `grid_is_square`. These are
  engine methods except the `resize_*` limit popups.
- Grid-line radios via `mode_grid` (1648-1653); `pu_q_label` / `pu_a_label` via `mode_qa` (1708-1730).
- The replay GIF export drives `undo(replay = true)` and `redo(replay = true)` frame by frame (1805-1822).
- Id-prefix dispatch for the legacy mode controls (1842-1880): `mo_` → `mode_set`, `sub_` → `submode_check`,
  `st_` → `stylemode_check` (plus `key_number` in Multicolor), `rot_` → `set_orientation`, `combisub_` →
  `subcombimode`, `ms_` → `subsymbolmode`. All six are Mixed and DOM-keyed.

### Other files that call `Puzzle` methods (READ, `grep`)

- settings.js: `redraw` (138, 153, 219, 243, 360, 402, 416), `mode_set` (236), `set_redoundocolor` (359), `type_set`
  [sub] (401). Each is inside a `UserSettings` setter.
- progress.js:87: `maketext_duplicate`.
- class_panel.js (the floating panel, `class Panel`, class_panel.js:1): `key_space` (76), `key_number` (78),
  `get_customcolor` (300), `draw_symbol_select` [sub] (306).
- puzzlink.js (the puzz.link importer, engine side): `mode_set`, `mode_qa`, `mode_grid`, `subcombimode`,
  `submode_check`, `subsymbolmode` (counts in the Bottom line), and `resize_*` (1126-1129, 2042). All are Mixed.
- The grid subclasses call `Puzzle`'s DOM-keyed methods too: none of the six mode methods, but they read `#nb_space1-4`
  themselves (for example class_square.js:20-23, 188-191; 20 `getElementById` lines in class_square.js by `grep -c`).

### What each UI method of class_p.js is used by

The nine UI methods and who calls them, so a step that moves one knows what comes with it (READ):

| UI method | Called from |
|---|---|
| `reset_pause_layer` (406-415) | `show_pause_layer` 420, `hide_pause_layer` 446 |
| `show_pause_layer` (417-440) | `CreateCheck` general.js:910, `redraw_grid` general.js:923, `pauseTimer` main.js:2298 |
| `hide_pause_layer` (442-451) | `startTimer` main.js:2303 |
| `set_custom_color` (1677-1687) | `submode_check` 1704, `stylemode_check` 1718 |
| `submode_reset` (1798-1821) | `mode_set` 1612 |
| `get_answercheck_settings` (2400-2444) | `display_answercheck` general.js:3254 |
| `load_bg_image_attrs` (12542-12553) | `load` general.js:2122 |
| `set_redoundocolor` (12600-12603) | `redraw` 12590, settings.js:359 |
| `get_customcolor` (13684-13688) | seven input sites in class_p.js (7894, 9068, 9095, 9208, 9344, 10032, 10081), class_panel.js:300 |

## 3. The audit's three duplicated-logic groups

The audit names them at `research/fork-audit-2026-11.md:110-112`. ADR 0001 puts each in scope for its own split step
(`adr/0001-split-engine-from-ui.md:37-39`). All READ unless marked.

### 3.1 `undo` / `redo` / `record` / `record_replay`: Problem and Solution branches

| Method | Problem branch (`pu_q`) | Solution branch (`pu_a`) |
|---|---|---|
| `undo` (6760-6993) | 6764-6869 | 6870-6992 |
| `redo` (6995-7213) | 6999-7100 | 7101-7212 |
| `record` (7216-7289) | 7217-7255 | 7256-7288 |
| `record_replay` (7291-7326) | none | 7292-7325, a copy of `record`'s Solution branch that writes to `command_replay` |

How far the copies already differ:

1. **Killer cages.** Problem has its own `killercages` branch that keeps the group index `a[4]` (undo 6803, redo 7038,
   record 7221-7223). Solution folds `killercages` into the list-type branch (undo 6917, redo 7144, record 7259) and
   carries `a[4]` and `a[5]` on every entry through `a_45` / `a_4`.
2. **Group index on plain entries.** Problem keeps `a[4]` only through an extra `if (a[4])` split (undo 6826, redo
   7061), and `record` adds `groupcounter` only when it is non-zero (7229, 7245). Solution always appends
   `groupcounter` and a timestamp (7260-7283).
3. **`deletelineE`.** Solution only. `undo` and `redo` switch `pu_mode` to `"pu_q"` (6940-6942, 7167-7169); `record`
   and `record_replay` file it under `"pu_q"` (7265-7272, 7304-7311). `pu_mode` is set once per call (6761, 6996) and
   never reset inside the loop. So in a grouped undo, entries after a `deletelineE` entry are applied to `pu_q` too
   (INFERRED, not run; `deletelineE` gets a group index only when `re_line` is called with `group_counter > 0`,
   9019-9020).
4. **Replay.** Solution `undo` and `redo` push the step to `command_replay` with a `sw_timer` stamp unless
   `replay = true` (6974-6988, 7194-7208). Problem has no replay.
5. **Value encoding.** `record` stores values as JSON strings (7230, 7275). `record_replay` stores
   `structuredClone` objects (7314-7318), except its own `deletelineE` case, which stores a JSON string (7306-7307).
   `undo` parses the string again for its replay copy (6957-6961).
6. **Group test.** Problem tests `a && a[4]` (6768, 7003); Solution tests `a && a[4] && a[4] != 0` (6874, 7105).
   Same result for every value (INFERRED).

### 3.2 Stack handling copied into four `maketext*` functions

Each function saves `command_undo/redo/replay.__a`, empties them, serialises `pu_q` / `pu_a`, then restores them. It
does this twice: once for the model stacks and once for the `_col` colour stacks.

| Function | Model stacks | Colour stacks | What it empties |
|---|---|---|---|
| `maketext` (2058-2138) | 2064-2089 | 2095-2118 | Undo and redo of both sides only when `#save_undo` is unticked; the `pu_a` replay always (2077-2082, 2107-2111, both marked `caneff` #22). |
| `maketext_duplicate` (2140-2238) | 2150-2169 | 2189-2210 | Problem undo and redo and Solution redo always; Solution undo and replay only outside solve mode (2157-2162, 2198-2203). Ignores `#save_undo`. |
| `maketext_solve` (2240-2291) | 2253-2259 | 2265-2271 | `pu_q` undo and redo; `pu_a` is not written at all. |
| `maketext_compsolve` (2293-2334) | 2299-2305 | 2313-2319 | Same as `maketext_solve`; the two stack blocks are identical (`diff`, READ). |

Other differences: `maketext_compsolve` and `maketext_solve` differ only in `multi`, the `comp` flag and the custom
message (2241-2246, 2276-2281, 2310-2312, 2324). `maketext_duplicate` calls `encrypt_data` directly (2222); the others
call `__export_finalize_shared` (2040-2043), which does the same. None restores the stacks in a `finally`, so a throw in
`JSON.stringify` leaves them emptied (INFERRED).

### 3.3 AND / OR rules in `make_solution` and `check_solution`

The repeated rules are two branches of `make_solution`, not a copy between the two methods:

- AND (single answer, `!this.multisolution`): 2624-2822. OR (multi answer): 2823-3025.
- The number rules are copied: 2690-2743 and 2852-2905 are identical after trimming indentation and renaming
  `sol[4]` / `temp_sol` (`diff`, READ).
- **Symbols already differ.** AND records the value and a letter tag, `cell,<value>A` to `I` (2748-2817), so the
  variant counts: which circle colour, which arrow. OR records only the cell for circle, tri, arrow, battleship, tent,
  star, akari and mine (2936-3019), so any variant passes. Math is `cell,<value>` in both.
- **Lines and edges.** AND reads the `ignore` / `exact` checkboxes and forces edge-ignore for links newer than 2.26.20
  (2664-2679). OR always passes `ignore = true` (2908-2918).
- **Shaded squares** (`square_LL`). AND adds them to the surface list `sol[0]` (2654-2662); OR keeps them as their
  own category (2928-2935).
- A third reader of the OR categories is `translate_puzzle_elements` (1238, 1283), which re-reads the OR checkboxes to
  translate the stored solution on resize.

`check_solution` (13360-13440) has the matching two branches: single 13361-13395, multi 13396-13438.

- The solved-popup block is copied (13367-13382 and 13405-13419). They differ by one commented line, `// timer: 5000`
  (13379; `diff`, READ).
- Single answer is gated on `check_conflict` (13364-13365); multi answer is not.
- Multi answer compares every user category with every author category (loops at 13398 and 13402), not category `i` with
  category `i`. The #13 guard skips only empty author categories (13400-13401).

## 4. Other findings for the split

1. **The mode API is keyed by element ids** (READ). `submode_check(name)` and `stylemode_check(name)` take a radio id,
   tick it and copy its `.value` into `this.mode` (1690-1692, 1713-1715). With no such radio, `this.mode` is not
   changed. `set_orientation` is gated the same way (1723-1725). `mode_set`, `mode_qa` and `mode_grid` tick radios
   too (1620, 1781, 1788). The importer and every key path in main.js go through these methods (§ 2).
2. **`subcombimode` asks for a radio that does not exist** (READ). It calls `stylemode_check('st_edge3')` (1766);
   `docs/index.html` has `st_lineE3` but no `st_edge3` (`grep -c`). `this.mode` is set directly one line earlier
   (1765), so only the radio and panel are skipped.
3. **The answer check runs inside every `redraw`** (READ). `redraw` calls `check_solution` (12583) unless called with
   `check_sol = false`, which only class_p.js:1451 does. `check_solution` reads `#custom_message`, opens `Swal` and
   pauses `sw_timer` (13367-13419). 151 lines in class_p.js call `this.redraw()` (`grep -c`).
4. **The answer check's inputs live in the page** (READ): the `#answersetting` checkboxes (`checkall_status` 2371-2393,
   `__get_answer_settings` 2019-2022, `make_solution`, `translate_puzzle_elements` 1238) and the select2
   `#genre_tags_opt` (`make_solution`, `get_edge_solution` 2552, `__export_checker_shared` 2035), although
   `update_genre_tags` already copies the tags into `this.user_tags` (1933).
5. **The cage tool reads its sub-mode from radios** (READ): `mouse_cage` (9578, 9749) and `draw_selection` (12896)
   read `#sub_cage1` / `#sub_cage2`, not `this.mode`.
6. **Engine input reads the colour picker** (READ): seven input sites call `get_customcolor`, which reads
   `#colorpicker_special` (13685).
7. **Geometry is in canvas pixels** (READ): the cell size is `UserSettings.displaysize` (1355), points are placed at
   `(i + 0.5) * this.size` (class_square.js:67), and `gridspace_calculate` finds the board by reading rendered
   pixels (1542-1546).
8. **Six methods have no call site** (READ, `grep` over `docs/js/*.js` and `docs/index.html`): `reset_arr` (275-345),
   `maketext_ppfile2` (3475-4189), `check_neighbors` (8288-8318; conflicts.js:249 and 286 define their own),
   `get_rgbcolor` (8927-8966), `re_combi_linedir_make_arrow` (10875-10901), `version_le` (13784-13786). 887 lines.
9. **`splitTextLines` exists twice**: `Puzzle.splitTextLines` (1523-1540) and a local copy in main.js (1886-1907)
   (READ).

## Could not classify

Nothing was left unclassified. Two judgement calls: the `sw_timer` clock is put with settings ("Mixed (settings)"),
not with UI, because undo and redo only read it; and `#dvique`, the board's wrapper `<div>`, is treated as board, so
`canvas_size_setting` is Engine.
