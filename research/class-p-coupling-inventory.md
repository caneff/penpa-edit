# class_p.js coupling inventory: where the Puzzle class mixes engine and UI

Asked for on 2026-11-13 as input to the uncharted map "Engine API and file split: what the UI calls, and how class_p.js
divides" (caneff/penpa-edit#9). ADR 0001 (`adr/0001-split-engine-from-ui.md`) splits `docs/js/class_p.js` into an
engine half (model, geometry, importers, checkers; keeps merging from upstream) and a UI half (ours). This note
measures where the line runs today. Read at commit `b9a76c0`; every `file:line` below is under `docs/js/` unless it
says otherwise, and holds at that commit.

## Summary

`class Puzzle` (class_p.js:95-13794) has **270 methods** (13,328 method lines). Classified by the rules under
[Method](#method):

| Class | Methods | Method lines | What it means |
|---|---:|---:|---|
| Engine | 194 | 6,118 | No DOM, dialog, timer or canvas access in its own body |
| ... of which clean | 74 | 1,754 | Also calls no `redraw`, no UI or Mixed method, and reads no `UserSettings`, `CustomColor` or global `pu` |
| Render | 19 | 869 | Canvas drawing and its helpers; no model writes |
| UI | 17 | 294 | DOM, dialogs or view state only; reads the model at most |
| Mixed | 40 | 6,047 | Changes or computes engine state and touches the DOM, a dialog, the timer or a UI global |

The 12 grid subclasses plus `Puzzle_sudoku` and `Puzzle_kakuro` (class_square.js, class_hex.js, class_tri.js,
class_pyramid.js, class_uniform.js) add **497 methods** (22,177 lines): 347 Render (14,544 lines), 138 Engine (7,213),
12 Mixed (420). Rendering is where the subclasses' weight is: 65% of their lines.

The UI files call **71 distinct `pu.*` methods at 255 call sites**, write **43 `pu` properties at 108 sites**
and read **54 at 706 sites** ([§ 3](#3-the-de-facto-engine-api-what-the-ui-calls-on-pu)).

Riskiest tangles, each detailed below:

1. **The answer check runs inside `redraw`.** `redraw` (class_p.js:12595-12613) calls `check_solution`
   (class_p.js:12601, its only call site), which reads `#custom_message`, pauses `sw_timer` and opens a SweetAlert
   modal (class_p.js:13375-13454). All 102 Engine methods that call `this.redraw()` use the default `check_sol = true` (the only
   calls passing `false` are class_p.js:1445 and 13409), so each can reach that dialog. The engine cannot be run headless until check and redraw are separated.
2. **Engine input lives in the DOM.** Answer-check options are read from `#answersetting` checkboxes and `sol_*` ids
   inside `make_solution` (class_p.js:2606-3012, 22 ids); genre tags from the select2 `#genre_tags_opt`
   (class_p.js:2538, 2699, 2708, 2719); the cage sub-mode from radios `sub_cage1`/`sub_cage2` (class_p.js:9598, 9769,
   12911); the custom color from the spectrum picker (`get_customcolor`, class_p.js:13690-13694, called by six input
   methods); board margins from `nb_space1..4` in every subclass's `constructor` and `reset_frame` (e.g.
   class_square.js:20-23, 188-191). The DOM, not the model, is the source of truth for these.
3. **The mode API is keyed by DOM ids.** `submode_check(name)` and `stylemode_check(name)` take an element id, tick
   it, and copy its `.value` into `this.mode` (class_p.js:1683-1713). `mode_set`, `mode_qa` and `mode_grid` tick
   radios too (class_p.js:1604-1663, 1772-1788). The puzz.link importer drives these same methods 244 times
   (puzzlink.js; [§ 3](#importer-calls)), so an importer cannot run without the page's form.
4. **Geometry is in canvas pixels.** Points are created at `(i + 0.5) * this.size` (class_square.js:67), `this.size`
   is `UserSettings.displaysize` (class_p.js:1349), and boards are centred with `point_move` to canvas coordinates
   (class_square.js:204). `search_center_pixel` and so `rotate_center`/`rotate_size` find the board by reading
   rendered pixels (`gridspace_calculate`, class_p.js:1536-1598, `getImageData` at 1539). Hit-testing is in main.js
   (`coord_point`, main.js:919-962, nearest `pu.point[i].x/y`). Engine and view share one coordinate space.
5. **Every solve edit reads the UI stopwatch.** `record_replay` (class_p.js:7276-7311), called by 52 Engine input
   methods, and `undo`/`redo` (class_p.js:6961, 7181) stamp replay steps with `sw_timer` (timer.js:1). Timestamps
   are already excluded from the canonical state (GLOSSARY.md, "Canonical state"); the seam is a clock passed in.

Also measured: `class_p.js` itself uses no `localStorage`, `localforage` or cookies (`grep -c` returns 0); storage and
cookies are in main.js, progress.js, settings.js and translate.js (`grep -l`). Five Puzzle methods have no call site found by `grep` for `.name(` or
`["name"]` over `docs/js/*.js` and `docs/index.html`: `reset_arr`, `maketext_ppfile2`, `get_rgbcolor`,
`re_combi_linedir_make_arrow`, `version_le`. That is a text search, not proof they are dead.

## Method

Measured with a Node script over the parsed source, not by reading alone. `espree` parsed each of `docs/js/*.js` and
`docs/identity.js`; `eslint-scope` resolved every identifier, so a name counts as a global only when it is not bound in
any enclosing scope (a local `var pu` in `get_edge_solution` is not the global `pu`). Both packages were loaded from
`~/src/sudokupad-scripts/node_modules`; nothing was installed in this repo. Per method the script recorded:

- **Browser globals**: `document`, `window`, `$`, `location`, `navigator`, `Swal`, `setTimeout`, `Image`,
  `DOMPurify`, `C2S` (plus storage, `alert`, `confirm`, `setInterval`; none of those occur in class_p.js).
- **App globals** and the file that defines them (top-level and implicit globals of every script): e.g. `UserSettings`
  (settings.js:25), `pu` (implicit, general.js:82), `panel_pu` (general.js:86), `sw_timer` (timer.js:1),
  `errorMsg`/`infoMsg` (SweetAlert wrappers, general.js:1-17), `PenpaText` (translate.js:585), `Identity`
  (identity.js:1), `isAltKeyHeld`/`isShiftKeyHeld` (main.js:4-6), `Color` (style.js:7).
- **Element ids** from `getElementById("...")`, `$("#...")` and `querySelector`; ids built at run time are listed as
  "dynamic id".
- **Canvas use**: the token `ctx` or `getContext(`; DOM reached through the fields `this.canvas`, `this.obj`
  (assigned at class_p.js:105-107) is flagged separately, because the global scan cannot see it.
- **`this.` calls**, to see which methods trigger `redraw` or call a UI or Mixed method.

Classes, applied first mechanically and then corrected by reading each flagged method:

- **UI**: touches the DOM, a dialog or a UI global, and at most reads the model.
- **Mixed**: changes or computes engine state (the `pu_q`/`pu_a` boards, `mode`, `point`, `solution`, the URL text)
  *and* touches the DOM, a dialog, `sw_timer` or a UI global.
- **Render**: draws on the canvas or exists only to feed a draw method.
- **Engine**: none of the above in its own body. Transitive coupling is not folded in; it is counted instead (the
  "clean" row, and the `redraw` / `calls UI/Mixed` columns of the table).

Hand corrections to the mechanical pass: `mode_set`, `submode_check`, `stylemode_check`, `set_orientation`,
`subsymbolmode`, `subcombimode`, `mode_qa`, `mode_grid`, `update_genre_tags`, `update_customcolor`, `mouseevent`,
`mouse_symbol`, `maketext_replay`, `checkall_status` and `resizecanvas` moved from UI to Mixed, because they write
`this.mode`, `this.user_tags`, `this.custom_colors`, `this.multisolution` or the point geometry, which the scan's
model-field list did not include. `redraw` moved to Mixed (it runs the answer check). `canvas_size_setting` moved from
Render to UI (it styles `this.obj`). `get_cage_coordinates`, `preprocess_cage` and `process_for_drawing` moved from
Engine to Render: their only callers are in `draw_cage` (class_p.js:12990-13128). `draw_selection` stays Render though
it reads `#sub_cage1` (class_p.js:12911).

What the scan cannot see: DOM reached through objects passed in as arguments (e.g. the event `e` handed to
`handle_rect_mousedown`), and calls through computed names. A search for `this[...](` in class_p.js found none.

Unclear, left open: whether Render belongs to the engine (it is geometry-specific and 14,544 lines of upstream
subclass code that we would want to keep merging) or to the UI (ADR 0001 says the UI is ours). That is a decision for
#9, not something the code settles.

## 1. Every Puzzle method, classified

Lines are class_p.js lines. Evidence lists what the method's own body touches: browser globals, element ids, app
globals (`UserSettings`, `pu`, `panel_pu`, `sw_timer`, ...; pure helpers such as `isEmpty`, `encrypt_data`, `Stack`,
`COMPRESS_SUB`, `penpa_modes` are left out), the number of `ctx` tokens, calls to UI or Mixed methods, and whether
it calls `this.redraw()`. `-` means none of these.

| Method | Lines | Class | Evidence |
|---|---|---|---|
| `constructor` | 96-233 | Mixed | `document`; ids: `canvas` `dvique`; ctx x2; DOM via `this.canvas`/`this.obj` |
| `reset_puzzle` | 235-256 | Engine | - |
| `reset` | 258-268 | Engine | - |
| `reset_board` | 270-273 | Engine | - |
| `reset_arr` | 275-345 | Engine | redraw |
| `reset_frame_newgrid` | 347-361 | Engine | calls UI/Mixed: canvas_size_setting |
| `load_compat_fixes` | 365-404 | Engine | redraw |
| `reset_pause_layer` | 406-415 | UI | `document`; ids: `pause_canvas`; ctx x1 |
| `show_pause_layer` | 417-440 | UI | `document`; ids: `pause_canvas`; `UserSettings` `THEME_LIGHT` `PenpaText` `Color`; ctx x1; calls UI/Mixed: reset_pause_layer |
| `hide_pause_layer` | 442-451 | UI | `document`; ids: `pause_canvas`; `Color`; ctx x1; calls UI/Mixed: reset_pause_layer |
| `make_frameline` | 453-525 | Engine | - |
| `fill_neighbors` | 529-546 | Engine | - |
| `fix_points` | 551-644 | Engine | - |
| `point_connect_corners` | 647-672 | Engine | - |
| `point_fillin_corners` | 675-712 | Engine | - |
| `distance_to_line` | 715-721 | Engine | - |
| `between_points` | 723-729 | Engine | - |
| `create_corners` | 733-746 | Engine | - |
| `point_move` | 748-762 | Engine | - |
| `search_center` | 764-798 | Engine | - |
| `search_center_pixel` | 800-827 | Engine | - |
| `rotate_UD` | 829-833 | Engine | redraw |
| `rotate_LR` | 835-839 | Engine | redraw |
| `point_reflect_LR` | 841-847 | Engine | - |
| `point_reflect_UD` | 849-855 | Engine | - |
| `rotate_center` | 857-862 | Engine | redraw |
| `rotate_size` | 864-879 | Engine | calls UI/Mixed: canvas_size_setting; redraw |
| `rotate_grid` | 881-889 | Engine | calls UI/Mixed: canvas_size_setting; redraw |
| `rotate_theta` | 891-901 | Engine | - |
| `resize_top` | 903-915 | Mixed | `errorMsg`; redraw |
| `resize_bottom` | 917-929 | Mixed | `errorMsg`; redraw |
| `resize_left` | 931-943 | Mixed | `errorMsg`; redraw |
| `resize_right` | 945-957 | Mixed | `errorMsg`; redraw |
| `make_resize_point_translator` | 959-1019 | Engine | - |
| `resize_board` | 1021-1134 | Engine | calls UI/Mixed: canvas_size_setting, translate_puzzle_elements |
| `translate_puzzle_elements` | 1145-1324 | Mixed | `document`; ids: `answersetting`; `pu` |
| `rotate_reset` | 1326-1334 | Engine | calls UI/Mixed: canvas_size_setting; redraw |
| `point_usecheck` | 1336-1346 | Engine | - |
| `canvasxy_update` | 1348-1352 | Engine | `UserSettings` |
| `canvas_size_setting` | 1354-1362 | UI | ctx x1; DOM via `this.canvas`/`this.obj` |
| `resizecanvas` | 1364-1469 | Mixed | `document` `C2S`; ids: `nb_margin2` `nb_quality1` `nb_type1` `nb_title1` `nb_rules1` `nb_type2` `nb_type3`; ctx x4; calls UI/Mixed: canvas_size_setting, canvaswithinfo; redraw; DOM via `this.canvas`/`this.obj` |
| `canvaswithinfo` | 1471-1515 | UI | `$` `document`; ids: `saveinfotitle` `saveinforules` `saveinfoauthor` `nb_title1` `nb_rules1` `canvas`; ctx x2 |
| `splitTextLines` | 1517-1534 | Render | ctx x2 |
| `gridspace_calculate` | 1536-1598 | Render | ctx x1; redraw; DOM via `this.canvas`/`this.obj` |
| `grid_is_square` | 1600-1602 | Engine | - |
| `mode_set` | 1604-1663 | Mixed | `document` `window` `$`; ids: `mode_` `style_` `mo_` `style_special` `float-key-header-lb` `closeBtn_input3` `orientation_button` `colorpicker_special`; `UserSettings` `pu`; calls UI/Mixed: submode_reset, submode_check, stylemode_check, subsymbolmode, subcombimode, set_orientation; redraw |
| `number_multi_enabled` | 1665-1669 | Engine | - |
| `set_custom_color` | 1671-1681 | UI | `$`; ids: `colorpicker_special`; `UserSettings` `CustomColor` |
| `submode_check` | 1683-1699 | Mixed | `document`; ids: `closeBtn_input3`; dynamic id: `name`; `pu`; calls UI/Mixed: set_custom_color; redraw |
| `cursolcheck` | 1702-1704 | Engine | - |
| `stylemode_check` | 1706-1713 | Mixed | `document`; dynamic id: `name`; `panel_pu`; calls UI/Mixed: set_custom_color |
| `set_orientation` | 1715-1721 | Mixed | `document`; dynamic id: `input_name` |
| `subsymbolmode` | 1723-1734 | Mixed | `document` `$`; ids: `symmode_content` `colorpicker_special`; `UserSettings` `panel_pu` `CustomColor`; redraw |
| `subcombimode` | 1736-1770 | Mixed | `document` `$`; ids: `combimode_content` `style_line` `style_lineE` `colorpicker_special`; `UserSettings` `CustomColor`; calls UI/Mixed: stylemode_check; redraw |
| `mode_qa` | 1772-1777 | Mixed | `document`; dynamic id: `mode`; calls UI/Mixed: mode_set; redraw |
| `mode_grid` | 1779-1788 | Mixed | `document`; dynamic id: `mode` |
| `submode_reset` | 1790-1813 | UI | `document`; ids: `mode_line` `mode_lineE` `mode_number` `mode_symbol` `mode_special` `mode_cage` `mode_move` `mode_combi` `mode_sudoku` `style_surface` `style_line` `style_lineE` `style_wall` `style_number` `style_symbol` `style_special` `style_cage` `style_combi` `style_sudoku` `orientation_button` |
| `reset_selectedmode` | 1815-1922 | Engine | `UserSettings`; redraw |
| `update_genre_tags` | 1924-1928 | Mixed | `$`; ids: `genre_tags_opt`; redraw |
| `__export_text_shared` | 1932-1964 | Mixed | `document`; ids: `saveinfotitle` `saveinfoauthor` `saveinfosource` `saveinforules`; `UserSettings` |
| `__export_list_tab_shared` | 1966-1981 | Engine | `UserSettings` |
| `__export_version_shared` | 1983-2005 | Engine | `UserSettings` |
| `__get_answer_settings` | 2007-2017 | UI | `document`; ids: `answersetting` |
| `__export_solcheck_shared` | 2019-2021 | Engine | calls UI/Mixed: __get_answer_settings |
| `__export_checker_shared` | 2023-2030 | UI | `$`; ids: `genre_tags_opt`; calls UI/Mixed: __get_answer_settings |
| `__export_finalize_shared` | 2032-2035 | Engine | - |
| `maketext_baseurl` | 2037-2048 | UI | `location`; `UserSettings` |
| `maketext` | 2050-2124 | Mixed | `document`; ids: `save_undo` `custom_message`; calls UI/Mixed: __export_text_shared, __export_checker_shared, maketext_baseurl |
| `maketext_duplicate` | 2126-2224 | Mixed | `document`; ids: `custom_message`; `sw_timer`; calls UI/Mixed: __export_text_shared, __export_checker_shared, maketext_baseurl |
| `maketext_solve` | 2226-2277 | Mixed | `document`; ids: `custom_message`; calls UI/Mixed: checkall_status, __export_text_shared, __export_checker_shared, maketext_baseurl |
| `maketext_compsolve` | 2279-2320 | Engine | calls UI/Mixed: __export_text_shared, __export_checker_shared, maketext_baseurl |
| `maketext_solve_solution` | 2322-2329 | Engine | calls UI/Mixed: maketext_solve, make_solution |
| `maketext_replay` | 2331-2353 | Mixed | `document`; ids: `saveinfosolver`; `pu` `sw_timer` |
| `checkall_status` | 2355-2384 | Mixed | `document`; ids: `answersetting` |
| `get_answercheck_settings` | 2386-2430 | UI | `document`; ids: `answersetting`; `PenpaText` |
| `get_surface_solution` | 2432-2455 | Engine | - |
| `get_line_solution` | 2457-2503 | Engine | `UserSettings` |
| `get_edge_solution` | 2505-2604 | Mixed | `$`; ids: `genre_tags_opt`; `UserSettings` |
| `make_solution` | 2606-3012 | Mixed | `document` `$`; ids: `sol_surface_exact` `sol_loopline_exact` `sol_loopedge_exact` `sol_ignoreloopline` `sol_ignoreborder` `sol_surface` `sol_square` `sol_loopline` `sol_loopedge` `sol_wall` `sol_number` `sol_circle` `sol_tri` `sol_arrow` `sol_battleship` `sol_star` `sol_tent` `sol_math` `sol_akari` `sol_mine` `answersetting` `genre_tags_opt`; calls UI/Mixed: checkall_status, get_edge_solution |
| `maketext_ppfile` | 3014-3458 | Mixed | `document`; ids: `savetextarea_pp`; `isEmptycontent` |
| `maketext_ppfile2` | 3460-4174 | Mixed | `document`; ids: `savetextarea_pp`; `isEmptycontent` `pu` |
| `getAllIndexes` | 4176-4187 | Engine | - |
| `getloopdata` | 4189-4298 | Engine | - |
| `getregiondata` | 4300-4455 | Engine | - |
| `maketext_gmpfile` | 4457-6743 | Mixed | `document`; ids: `savetextarea_pp` `nb_size2` `nb_size1` `nb_space1` `nb_space3`; `isEmptycontent` `pu` `PenpaText` |
| `undo` | 6745-6978 | Mixed | `sw_timer`; redraw |
| `redo` | 6980-7198 | Mixed | `sw_timer`; redraw |
| `record` | 7201-7274 | Engine | - |
| `record_replay` | 7276-7311 | Mixed | `sw_timer` |
| `set_value` | 7313-7322 | Engine | calls UI/Mixed: record_replay |
| `remove_value` | 7324-7330 | Engine | calls UI/Mixed: record_replay |
| `set_surface` | 7332-7349 | Engine | - |
| `remove_surface` | 7351-7353 | Engine | - |
| `copy_handler` | 7360-7521 | Engine | - |
| `cut_handler` | 7523-7578 | Engine | redraw |
| `paste_handler` | 7580-7681 | Engine | redraw |
| `key_number` | 7689-8272 | Engine | `UserSettings` `CustomColor` `pu` `SUDOKU_CENTRE_AUTO` `SUDOKU_CENTRE_SMALL`; calls UI/Mixed: record_replay, get_customcolor; redraw |
| `onofftext` | 8274-8291 | Engine | - |
| `check_neighbors` | 8293-8323 | Engine | - |
| `key_space` | 8325-8511 | Engine | `UserSettings`; calls UI/Mixed: record_replay; redraw |
| `key_shiftspace` | 8513-8529 | Engine | calls UI/Mixed: record_replay; redraw |
| `key_backspace` | 8531-8617 | Engine | calls UI/Mixed: record_replay; redraw |
| `recalculate_num` | 8623-8625 | Engine | - |
| `handle_rect_mousedown` | 8627-8661 | Mixed | `isAltKeyHeld` `isShiftKeyHeld` `UserSettings` |
| `mouseevent` | 8663-8751 | Mixed | `document`; ids: `closeBtn_input3`; `pu`; calls UI/Mixed: handle_rect_mousedown, mouse_symbol, mouse_cage |
| `dblmouseevent` | 8755-8820 | Engine | redraw |
| `mouse_surface` | 8826-8880 | Engine | `UserSettings`; redraw |
| `re_surface` | 8882-8899 | Engine | `UserSettings`; redraw |
| `re_surface_twobutton` | 8901-8912 | Engine | redraw |
| `re_surfaceR` | 8914-8925 | Engine | `UserSettings`; redraw |
| `re_surfacemove` | 8927-8945 | Engine | redraw |
| `get_rgbcolor` | 8947-8986 | Render | `Color` |
| `line_key` | 8992-8994 | Engine | - |
| `split_line` | 8997-9000 | Engine | - |
| `line_change` | 9003-9012 | Engine | - |
| `mouse_line` | 9014-9033 | Engine | - |
| `re_line` | 9036-9130 | Engine | `UserSettings` `CustomColor`; calls UI/Mixed: record_replay, get_customcolor |
| `re_linemove` | 9132-9157 | Engine | redraw |
| `mouse_linefree` | 9159-9185 | Engine | redraw |
| `re_lineup_free` | 9187-9208 | Engine | - |
| `mouse_lineX` | 9210-9214 | Engine | - |
| `re_lineX` | 9216-9238 | Engine | `UserSettings` `CustomColor`; calls UI/Mixed: record_replay, get_customcolor; redraw |
| `mouse_lineE` | 9244-9263 | Engine | - |
| `re_linemoveE` | 9265-9296 | Engine | redraw |
| `mouse_lineEfree` | 9298-9324 | Engine | redraw |
| `re_lineEup_free` | 9326-9344 | Engine | - |
| `mouse_lineEX` | 9346-9350 | Engine | - |
| `re_lineEX` | 9352-9374 | Engine | `UserSettings` `CustomColor`; calls UI/Mixed: record_replay, get_customcolor; redraw |
| `mouse_wall` | 9380-9398 | Engine | - |
| `re_wallmove` | 9400-9411 | Engine | redraw |
| `mouse_number` | 9417-9453 | Engine | redraw |
| `mouse_numberS` | 9455-9474 | Engine | redraw |
| `mouse_sudoku` | 9476-9523 | Engine | redraw |
| `re_numberarrow` | 9525-9563 | Engine | calls UI/Mixed: record_replay; redraw |
| `direction_arrow8` | 9565-9566 | Engine | - |
| `direction_arrow4` | 9567-9568 | Engine | - |
| `mouse_symbol` | 9574-9591 | Mixed | `UserSettings` `panel_pu`; redraw |
| `mouse_cage` | 9597-9785 | Mixed | `document`; ids: `sub_cage1` `sub_cage2`; redraw |
| `cage_for_selection` | 9788-9829 | Engine | - |
| `flood_cage` | 9834-9872 | Engine | - |
| `get_cage_context` | 9874-9966 | Engine | - |
| `cell_outside` | 9969-9982 | Engine | - |
| `re_linecage` | 9984-9995 | Engine | redraw |
| `mouse_special` | 10001-10031 | Engine | redraw |
| `re_specialdown` | 10033-10039 | Engine | calls UI/Mixed: record_replay |
| `re_special` | 10041-10062 | Engine | `UserSettings` `CustomColor`; calls UI/Mixed: get_customcolor; redraw |
| `re_specialup` | 10064-10093 | Engine | `UserSettings`; calls UI/Mixed: record_replay |
| `re_polygonmove` | 10095-10111 | Engine | `UserSettings` `CustomColor`; calls UI/Mixed: get_customcolor; redraw |
| `re_polygondown` | 10113-10138 | Engine | calls UI/Mixed: record_replay; redraw |
| `mouse_board` | 10144-10158 | Engine | - |
| `re_board` | 10160-10177 | Engine | calls UI/Mixed: check_last_cell; redraw |
| `check_last_cell` | 10179-10186 | Mixed | `infoMsg` `PenpaText` |
| `re_boardmove` | 10188-10202 | Engine | calls UI/Mixed: check_last_cell; redraw |
| `mouse_move` | 10208-10233 | Engine | calls UI/Mixed: record_replay; redraw |
| `re_movedown` | 10235-10253 | Engine | - |
| `re_movemove` | 10255-10289 | Engine | redraw |
| `mouse_combi` | 10295-10616 | Engine | `UserSettings` `STAR_DOTS_DISABLED` `STAR_DOTS_LOW` |
| `re_combi_blpo` | 10618-10631 | Engine | redraw |
| `re_combi_blpo_downright` | 10633-10646 | Engine | redraw |
| `re_combi_blpo_move` | 10648-10667 | Engine | redraw |
| `re_combi_blwh` | 10669-10689 | Engine | calls UI/Mixed: record_replay; redraw |
| `re_combi_blwh_downright` | 10691-10711 | Engine | calls UI/Mixed: record_replay; redraw |
| `re_combi_blwh_move` | 10713-10732 | Engine | calls UI/Mixed: record_replay; redraw |
| `re_combi_shaka` | 10734-10741 | Engine | - |
| `re_combi_shaka_move` | 10743-10762 | Engine | calls UI/Mixed: record_replay; redraw |
| `re_combi_shaka_up` | 10764-10779 | Engine | calls UI/Mixed: record_replay; redraw |
| `re_combi_linex` | 10781-10786 | Engine | redraw |
| `re_combi_linex_move` | 10788-10817 | Engine | calls UI/Mixed: record_replay; redraw |
| `re_combi_lineox` | 10819-10823 | Engine | - |
| `re_combi_lineox_move` | 10825-10840 | Engine | redraw |
| `re_combi_lineox_up` | 10842-10872 | Engine | calls UI/Mixed: record_replay; redraw |
| `re_combi_linedir` | 10874-10878 | Engine | - |
| `re_combi_linedir_get_arrow_side` | 10880-10893 | Engine | - |
| `re_combi_linedir_make_arrow` | 10895-10921 | Engine | calls UI/Mixed: record_replay |
| `re_combi_linedir_move` | 10923-10973 | Engine | calls UI/Mixed: record_replay; redraw |
| `re_combi_linedir_downright` | 10975-11041 | Engine | calls UI/Mixed: record_replay; redraw |
| `re_combi_linedir_up` | 11043-11114 | Engine | calls UI/Mixed: record_replay; redraw |
| `re_combi_cross_downright` | 11116-11178 | Engine | calls UI/Mixed: record_replay; redraw |
| `re_combi_edgexoi` | 11180-11185 | Engine | redraw |
| `re_combi_edgexoi_move` | 11187-11199 | Engine | redraw |
| `re_combi_edgexoi_up` | 11201-11224 | Engine | `UserSettings`; redraw |
| `re_combi_edgex` | 11226-11231 | Engine | redraw |
| `re_combi_edgex_move` | 11233-11292 | Engine | calls UI/Mixed: record_replay; redraw |
| `re_combi_edgex_up` | 11294-11299 | Engine | redraw |
| `re_combi_yajilin` | 11301-11306 | Engine | redraw |
| `re_combi_yajilin_move` | 11308-11335 | Engine | calls UI/Mixed: record_replay; redraw |
| `re_combi_yajilin_up` | 11337-11360 | Engine | redraw |
| `re_combi_yajilin_up_reduced` | 11362-11377 | Engine | redraw |
| `re_combi_yajilin_downright` | 11379-11400 | Engine | - |
| `re_combi_rassisillai` | 11402-11407 | Engine | redraw |
| `re_combi_rassisillai_move` | 11409-11431 | Engine | redraw |
| `re_combi_rassisillai_up` | 11433-11448 | Engine | redraw |
| `re_combi_rassisillai_up_reduced` | 11450-11465 | Engine | redraw |
| `re_combi_rassisillai_downright` | 11467-11482 | Engine | - |
| `re_combi_akari` | 11484-11489 | Engine | redraw |
| `re_combi_akari_move` | 11491-11518 | Engine | calls UI/Mixed: record_replay; redraw |
| `re_combi_akari_up` | 11520-11555 | Engine | calls UI/Mixed: record_replay; redraw |
| `re_combi_akari_up_reduced` | 11557-11580 | Engine | calls UI/Mixed: record_replay; redraw |
| `re_combi_akari_downright` | 11582-11615 | Engine | calls UI/Mixed: record_replay |
| `re_combi_hashi` | 11617-11621 | Engine | - |
| `re_combi_hashi_move` | 11623-11642 | Engine | redraw |
| `re_combi_hashi_up` | 11644-11660 | Engine | calls UI/Mixed: record_replay; redraw |
| `re_combi_edgesub` | 11662-11673 | Engine | redraw |
| `re_combi_edgesub_move` | 11675-11697 | Engine | redraw |
| `re_combi_battleship` | 11699-11718 | Engine | - |
| `re_combi_battleship_downright` | 11720-11735 | Engine | - |
| `re_combi_battleship_move` | 11737-11792 | Engine | calls UI/Mixed: record_replay; redraw |
| `re_combi_battleship_up` | 11794-11839 | Engine | calls UI/Mixed: record_replay; redraw |
| `get_neighbors` | 11841-11902 | Engine | - |
| `re_combi_star_reduced` | 11904-11932 | Engine | calls UI/Mixed: record_replay; redraw |
| `re_combi_star` | 11934-11984 | Engine | calls UI/Mixed: record_replay; redraw |
| `re_combi_star_downright` | 11986-12018 | Engine | calls UI/Mixed: record_replay; redraw |
| `re_combi_star_move` | 12020-12034 | Engine | calls UI/Mixed: record_replay; redraw |
| `re_combi_mines_reduced` | 12036-12063 | Engine | calls UI/Mixed: record_replay; redraw |
| `re_combi_mines` | 12065-12114 | Engine | calls UI/Mixed: record_replay; redraw |
| `re_combi_doublemines_reduced` | 12116-12147 | Engine | calls UI/Mixed: record_replay; redraw |
| `re_combi_doublemines` | 12149-12202 | Engine | calls UI/Mixed: record_replay; redraw |
| `re_combi_mines_downright` | 12204-12236 | Engine | calls UI/Mixed: record_replay; redraw |
| `re_combi_mines_move` | 12238-12252 | Engine | calls UI/Mixed: record_replay; redraw |
| `re_combi_tents` | 12254-12259 | Engine | redraw |
| `re_combi_tents_move` | 12261-12273 | Engine | redraw |
| `re_combi_tents_up` | 12275-12304 | Engine | calls UI/Mixed: record_replay; redraw |
| `re_combi_magnets` | 12306-12318 | Engine | redraw |
| `re_combi_magnets_downright` | 12320-12332 | Engine | redraw |
| `re_combi_arrowS_up` | 12334-12346 | Engine | calls UI/Mixed: record_replay; redraw |
| `re_combi_arrowS` | 12348-12356 | Engine | - |
| `re_combi_arrowS_move` | 12358-12374 | Engine | calls UI/Mixed: record_replay; redraw |
| `re_combi_numfl_up` | 12376-12392 | Engine | calls UI/Mixed: record_replay; redraw |
| `re_combi_numfl` | 12394-12402 | Engine | - |
| `re_combi_numfl_move` | 12404-12420 | Engine | calls UI/Mixed: record_replay; redraw |
| `re_combi_alfl_up` | 12422-12438 | Engine | calls UI/Mixed: record_replay; redraw |
| `re_combi_alfl` | 12440-12448 | Engine | - |
| `re_combi_alfl_move` | 12450-12466 | Engine | calls UI/Mixed: record_replay; redraw |
| `direction_num8` | 12468-12489 | Engine | - |
| `update_bg_image_url` | 12495-12504 | UI | `document` `Image`; ids: `bg_image_url`; calls UI/Mixed: extract_bg_image_pixels |
| `extract_bg_image_pixels` | 12506-12546 | UI | `document`; ctx x5; redraw |
| `update_bg_image_attrs` | 12548-12560 | UI | `document`; ids: `bg_image_` `bg_image_foreground` `bg_image_mask_white`; calls UI/Mixed: extract_bg_image_pixels |
| `load_bg_image_attrs` | 12562-12573 | UI | `document`; ids: `bg_image_` `bg_image_foreground` `bg_image_mask_white`; calls UI/Mixed: update_bg_image_url |
| `draw_bg_image` | 12575-12593 | Render | ctx x1 |
| `redraw` | 12595-12613 | Mixed | `panel_pu`; calls UI/Mixed: check_solution, set_redoundocolor |
| `set_redoundocolor` | 12615-12618 | UI | `document`; ids: `tb_redo` `tb_undo` |
| `flushcanvas` | 12620-12628 | Render | `Color`; ctx x4; DOM via `this.canvas`/`this.obj` |
| `draw` | 12630-12632 | Render | - |
| `draw_frame` | 12634-12646 | Render | `set_line_style`; ctx x5 |
| `draw_frameBold` | 12648-12661 | Render | `set_line_style`; ctx x5 |
| `draw_polygonsp` | 12663-12685 | Render | `UserSettings` `Color`; ctx x12 |
| `draw_surface` | 12687-12826 | Render | `set_surface_style` `UserSettings`; ctx x30 |
| `draw_freecircle` | 12828-12855 | Render | `Color`; ctx x11 |
| `draw_cursol` | 12857-12879 | Render | `set_line_style` `UserSettings` `pu` `Color`; ctx x5 |
| `default_cursol` | 12881-12890 | Render | ctx x6 |
| `draw_conflicts` | 12892-12906 | Render | `set_surface_style`; ctx x7 |
| `draw_selection` | 12908-12974 | Render | `document`; ids: `sub_cage1`; `Color` `set_line_style`; ctx x13 |
| `draw_cage` | 12976-13188 | Render | `set_line_style` `UserSettings`; ctx x56 |
| `get_cage_coordinates` | 13190-13202 | Render | - |
| `preprocess_cage` | 13205-13271 | Render | - |
| `remove_from_array` | 13274-13280 | Engine | - |
| `process_for_drawing` | 13283-13373 | Render | `UserSettings` |
| `check_solution` | 13375-13454 | Mixed | `document` `DOMPurify` `setTimeout` `Swal`; ids: `custom_message`; `sw_timer` `Identity`; calls UI/Mixed: make_solution; redraw |
| `only_alphanumeric` | 13456-13458 | Engine | - |
| `load_clues` | 13460-13547 | Mixed | `document`; ids: `iostring` `sudokuIgnoreSpaces` `sudokuIgnoreNotSquare` `sudokuIOFail` `nb_space1` `nb_space3` `firstcell_row` `firstcell_column`; `pu`; redraw |
| `export_clues` | 13549-13659 | Mixed | `document` `navigator` `window`; ids: `nb_space1` `nb_space3` `firstcell_row` `firstcell_column` `ignore_pencilmarks` `iostring`; `pu` |
| `get_orientation` | 13661-13688 | Engine | - |
| `get_customcolor` | 13690-13694 | UI | `$`; ids: `colorpicker_special` |
| `check_conflict` | 13696-13741 | Engine | `UserSettings` |
| `update_customcolor` | 13743-13761 | Mixed | `document`; ids: `st_surface`; `panel_pu` |
| `get_surface_color` | 13763-13768 | Engine | - |
| `version_lt` | 13770-13776 | Engine | - |
| `version_ge` | 13778-13780 | Engine | - |
| `version_gt` | 13782-13788 | Engine | - |
| `version_le` | 13790-13792 | Engine | - |
### Subclass overrides and additions

Same mechanical rules, with each subclass's `draw` (a dispatcher to `draw_*`) counted as Render; the subclass methods
were not hand-reviewed one by one, so treat these counts as the scan's, not a reading's.

| Class | File:lines | Extends | Methods | Engine | Render | Mixed |
|---|---|---|---:|---:|---:|---:|
| `Puzzle_hex` | class_hex.js:2-2992 | `Puzzle` | 64 | 10 | 52 | 2 |
| `Puzzle_pyramid` | class_pyramid.js:2-2789 | `Puzzle` | 66 | 11 | 53 | 2 |
| `Puzzle_square` | class_square.js:2-4211 | `Puzzle` | 86 | 16 | 68 | 2 |
| `Puzzle_sudoku` | class_square.js:4215-4303 | `Puzzle_square` | 4 | 3 | 0 | 1 |
| `Puzzle_kakuro` | class_square.js:4307-4372 | `Puzzle_square` | 2 | 1 | 0 | 1 |
| `Puzzle_tri` | class_tri.js:2-2769 | `Puzzle` | 61 | 9 | 50 | 2 |
| `Puzzle_truncated_square` | class_uniform.js:2-2722 | `Puzzle` | 61 | 14 | 47 | 0 |
| `Puzzle_tetrakis_square` | class_uniform.js:2726-3380 | `Puzzle_truncated_square` | 15 | 11 | 4 | 0 |
| `Puzzle_snub_square` | class_uniform.js:3384-4069 | `Puzzle_truncated_square` | 14 | 10 | 4 | 0 |
| `Puzzle_cairo_pentagonal` | class_uniform.js:4073-4729 | `Puzzle_truncated_square` | 13 | 10 | 3 | 0 |
| `Puzzle_iso` | class_uniform.js:4733-5965 | `Puzzle_truncated_square` | 23 | 11 | 11 | 1 |
| `Puzzle_rhombitrihexagonal` | class_uniform.js:5969-6671 | `Puzzle_truncated_square` | 14 | 10 | 4 | 0 |
| `Puzzle_deltoidal_trihexagonal` | class_uniform.js:6675-7397 | `Puzzle_truncated_square` | 14 | 10 | 4 | 0 |
| `Puzzle_penrose_P3` | class_uniform.js:7401-9992 | `Puzzle` | 60 | 12 | 47 | 1 |
| **Total** | | | **497** | **138** | **347** | **12** |

Puzzle methods the subclasses override (name, number of classes): `constructor` 14, `draw` 12, `search_center` 8,
`recalculate_num` 8, `direction_arrow8` 7, `rotate_theta` 7, `cursolcheck` 4, `check_conflict` 1, `re_wallmove` 1,
`direction_arrow4` 1, `split_line` 1, `draw_freecircle` 1. Methods every geometry adds that Puzzle lacks but calls or
the UI calls: `create_point`, `reset_frame`, `type_set`, `coord_p_edgex`, `rotate_left`, `rotate_right` (12 classes
each); `key_arrow` (7).

The 12 subclass Mixed methods are all of one kind: the `constructor` or `reset_frame` reads the board margins or grid
options from the new-grid form.

- `nb_space1..4`: class_square.js:20-23 (constructor), 188-191 (`reset_frame`), 4239-4242 (`Puzzle_sudoku`),
  4326-4329 (`Puzzle_kakuro`); class_hex.js:19, 222; class_tri.js:10-11, 216; class_pyramid.js:22, 211.
- `nb_sudoku1..4`: `Puzzle_sudoku` constructor, class_square.js:4233-4236.
- `nb_penrose1..2`: class_uniform.js:7410-7411 (`Puzzle_penrose_P3` constructor).
- `Puzzle_iso` constructor shows `#sub_lineE2_lb` (class_uniform.js:4768).

Seam: pass `space` (and the sudoku / penrose options) to the constructor; the UI reads the form. The engine half of
`reset_frame` is everything else in it (class_square.js:184-216 is the pattern), but it also calls
`canvasxy_update`, `canvas_size_setting` and `point_move` to canvas coordinates (class_square.js:202-204), which is
tangle 4.

Render code in the subclasses reads the global `pu` for `pu.size` 2,868 times (class_uniform.js 884, class_square.js
672, class_pyramid.js 476, class_hex.js 434, class_tri.js 402), not `this.size`; style.js does too (style.js:157-252,
20 reads). A second `Puzzle` instance would draw with the first one's scale.

## 2. The Mixed methods: engine part, UI part, smallest seam

Grouped where several methods share one seam. Every Puzzle Mixed method from § 1 appears once.

### Answer check

- **`redraw`** (12595-12613). Engine part: none of its own; it orders the draw. UI part: `panel_pu.draw_panel()`
  (12603), `set_redoundocolor` (DOM undo/redo buttons, 12615-12618), and `check_solution` when `check_sol` is true
  (12600-12602). Seam: take `check_solution` out of `redraw`; the caller that changed the answer board asks for the
  check. `redraw(svgcall, check_sol)` already has the flag; 17 UI call sites (§ 3) and 102 Engine methods use the
  default `check_sol = true`.
- **`check_solution`** (13375-13454). Engine part: compare `make_solution()` with `this.solution`, run
  `check_conflict`, set `this.sol_flag`. UI part: read `#custom_message`, `setTimeout` + `Swal.fire` with `Identity`
  text, `sw_timer.pause()`, `DOMPurify`. Seam: an engine `is_solved()` returning a verdict; the UI decides on modal,
  message and timer.
- **`make_solution`** (2606-3012). Engine part: build the solution object from `pu_q`/`pu_a`. UI part: which parts to
  compare come from 20 `sol_*` checkboxes (2610-2796), `#answersetting .solcheck_or` (2817) and the select2
  `#genre_tags_opt` (2699, 2708, 2719, 2861, 2870, 2881). Seam: an options argument
  `{checks, exact, ignore, tags}`; `this.user_tags` already holds the tags (written by `update_genre_tags`, 1925).
- **`get_edge_solution`** (2505-2604). Engine: edge solution. UI: `$('#genre_tags_opt').select2("val")` (2538) and
  `UserSettings.ignore_line_style` (2529). Seam: same options argument. Note the result of an answer check depends on
  a display preference here and in `get_line_solution` (2482), an Engine-class method.
- **`checkall_status`** (2355-2384). Engine: decides `this.multisolution`. UI: reads `#answersetting` checkboxes.
  Seam: same options argument; the flag is computed from it.
- **`translate_puzzle_elements`** (1145-1324). Engine: shifts every stored element when the board is resized. UI:
  reads `#answersetting .solcheck_or` (1229) to choose how to translate `solution`, and writes the global
  `pu.solution` (1267) instead of `this.solution`. Seam: read `this.multisolution` (already engine state) and write
  `this.solution`.

### Mode state

`this.mode` is engine state: input dispatch reads it (`mouseevent`, 8663-8751) and it is written into every link
(`maketext`, 2054). These methods write it and drive the form in the same breath.

- **`mode_set`** (1604-1663). Engine: `this.mode[qa].edit_mode = mode` (1605). It then re-reads the stored sub-mode
  and style *through the DOM*: it builds the ids `'sub_' + mode + submode` and `'st_' + mode + style` and passes them
  to `submode_check`/`stylemode_check` (1615, 1630), which copy the element's `.value` back into `this.mode`. UI: shows `mode_*`/`style_*` blocks, ticks `mo_<mode>`, sets
  `UserSettings.panel_shown`, the spectrum picker, `#float-key-header-lb`, `#closeBtn_input3` via the global `pu`
  (1654-1657), `#orientation_button`.
- **`submode_check(name)`** (1683-1699) and **`stylemode_check(name)`** (1706-1713). Engine: set
  `mode[qa][edit_mode][0]` or `[1]`, recompute `this.type`. UI: the argument *is* a DOM id; the value is read from
  `document.getElementById(name).value` (1686, 1709). The `#closeBtn_input3` update goes through global `pu`
  (1689-1692).
- **`set_orientation`** (1715-1721), **`subsymbolmode`** (1723-1734), **`subcombimode`** (1736-1770),
  **`mode_qa`** (1772-1777), **`mode_grid`** (1779-1788). Engine: one assignment into `this.mode` each. UI: tick a
  radio, set `#symmode_content`/`#combimode_content`, show `style_line`/`style_lineE`, the spectrum picker,
  `panel_pu.draw_panel()`.
- **`update_customcolor`** (13743-13761). Engine: `mode[qa][mode][2]` and `this.custom_colors`. UI: colours the
  `st_surface<n>_lb` swatch (13758), `panel_pu.draw_panel()`.
- **`update_genre_tags`** (1924-1928). Engine: `this.user_tags`. UI: read from select2.

Seam for the group: engine setters that take values, not ids (`set_submode(mode, value)`, `set_style(mode, value)`,
`set_qa(qa)`), and a mode-changed notification the UI listens to in order to update the form. The importer
(puzzlink.js) and general.js `load()` call the value setters.

### Input

- **`mouseevent`** (8663-8751). Engine: the mode dispatch to `mouse_*`. UI: early return on the global
  `pu.replay` (8664), and `#closeBtn_input3` enabled from the global `pu` (8722-8725). Seam: move the button update
  to the mode/cursor notification; read `this.replay`.
- **`handle_rect_mousedown`** (8627-8661). Engine: start of a rectangle selection. UI: takes the DOM event `e` and
  calls `isAltKeyHeld(e)`/`isShiftKeyHeld(e)` (main.js:4-6) at 8635-8636. Seam: pass `{alt, shift}` booleans.
- **`mouse_cage`** (9597-9785). Engine: cage selection and drawing. UI: which cage sub-mode is active is read from
  radios `sub_cage1`/`sub_cage2` (9598, 9769), not from `this.mode`. Seam: store the sub-mode in `this.mode` like the
  other modes (also removes the read in `draw_selection`, 12911).
- **`mouse_symbol`** (9574-9591). Engine: place a symbol via `key_number`/`key_space`. UI: reads
  `panel_pu.edit_num` (9578-9582), the floating panel's selection. Seam: the UI passes the chosen key.
- **`check_last_cell`** (10179-10186). Engine: refuse to remove the last board cell. UI: `infoMsg` (10181). Seam:
  return the refusal; the UI shows it.
- **`resize_top` / `resize_bottom` / `resize_left` / `resize_right`** (903-957). Engine: bounds check +
  `resize_board`. UI: `errorMsg` on the limit (910, 912, 924, 926, 938, 940, 952, 954). Seam: return or throw a
  result; the UI shows it.

### Undo, redo, replay

- **`undo`** (6745-6978), **`redo`** (6980-7198), **`record_replay`** (7276-7311). Engine: the stacks. UI: replay
  timestamps from `sw_timer` (6961, 7181, 7279). Seam: a clock function passed to the engine (the UI passes the
  stopwatch; a test passes a constant).

### Save, links, export

- **`__export_text_shared`** (1932-1964). Engine: the link header (grid type, size, space). UI: title, author,
  source and rules from `saveinfotitle`, `saveinfoauthor`, `saveinfosource`, `saveinforules` (1939-1950), and
  `UserSettings.draw_edges` (1954). Seam: puzzle metadata held on the puzzle (an engine field) and set by the UI form;
  the export reads the field.
- **`maketext`** (2050-2124), **`maketext_duplicate`** (2126-2224), **`maketext_solve`** (2226-2277). Engine: the
  link body. UI: `#save_undo` checkbox (2056, 2074, 2085, 2099), `#custom_message` (2112, 2201, 2263), `sw_timer`
  (2161). Seam: an options argument `{saveUndo, customMessage, elapsed}`; `maketext_baseurl` (UI, reads `location`)
  stays on the UI side and is passed in or prefixed by the caller.
- **`maketext_replay`** (2331-2353). Engine: the replay payload from `pu_a.command_replay`. UI: `#saveinfosolver`,
  `sw_timer` (2348-2349), and it calls itself through the global `pu` (2332, 2336). Seam: same options argument; use
  `this`.
- **`maketext_ppfile`** (3014-3458), **`maketext_ppfile2`** (3460-4174), **`maketext_gmpfile`** (4457-6743).
  Engine: puzzle-file exporters. UI: the template name from `#savetextarea_pp` (3018, 3466, 4459), grid size from
  `nb_size1`/`nb_size2` (23 reads each, e.g. 4534), `nb_space1`/`nb_space3`; `maketext_ppfile2` reads geometry through
  the global `pu` (3482-3485 and 20 more). Seam: arguments for template and size. `maketext_gmpfile` alone is 2,287
  lines.
- **`load_clues`** (13460-13547) and **`export_clues`** (13549-13659). Engine: sudoku string to `pu_q.number` and
  back. UI: `#iostring` and option checkboxes; `export_clues` copies to the clipboard (`navigator.clipboard`,
  `document.execCommand("copy")`, 13642-13654). Seam: `parse_sudoku_string(text, opts)` and
  `sudoku_string(opts)`; clipboard and form stay in the UI.

### Construction and view geometry

- **`constructor`** (96-233). Engine: all model fields. UI: grabs `#canvas`, its 2D context and `#dvique`
  (105-107), and registers document-level `copy`/`cut`/`paste` listeners (230-232) that call the engine's
  `copy_handler`/`cut_handler`/`paste_handler`. Seam: the UI attaches canvas and listeners after construction.
- **`resizecanvas`** (1364-1469). Image export. Engine: temporarily sets `edit_mode` to `"surface"` (1372) and moves
  every point (`point_move`, 1381, 1464). UI: an offscreen canvas, `nb_margin2`/`nb_quality1`/`nb_type*`/`nb_title1`
  /`nb_rules1`, `C2S` for SVG. Seam: render with a view transform instead of moving the model's points; tangle 4.

## 3. The de facto engine API: what the UI calls on `pu`

Measured by resolving every reference to the global `pu` (scope-checked, so locals named `pu` are excluded) in the
UI files: main.js, general.js, settings.js, progress.js, translate.js, style.js and class_panel.js (the other
`docs/js` UI files and `docs/identity.js` have none; `docs/index.html` has no `pu.` at all, its inline handlers call
global functions). Calls: **71 methods, 255 sites**. Each line gives the method, its number of call sites, and the
sites. `draw_sudokugrid`, `draw_N`, `draw_Z`, `draw_kakurogrid`, `draw_symbol_select`, `type_set`, `key_arrow`,
`reset_frame`, `create_point`, `rotate_left` and `rotate_right` are subclass methods, not Puzzle's.

### Pointer input (6 call sites, 2 methods)

- `mouseevent` 5 (main.js:140, main.js:145, main.js:178, main.js:242, main.js:256)
- `dblmouseevent` 1 (main.js:135)

### Key input (38 call sites, 6 methods)

- `key_number` 20 (class_panel.js:78, main.js:439, main.js:451, main.js:453, main.js:496, main.js:518, main.js:612, main.js:620, main.js:622, main.js:630, main.js:636, main.js:657, main.js:1856, main.js:2012, main.js:2014, main.js:2022, main.js:2030, main.js:2032, main.js:2038, main.js:2044)
- `key_space` 12 (class_panel.js:76, main.js:432, main.js:501, main.js:616, main.js:624, main.js:632, main.js:638, main.js:2016, main.js:2026, main.js:2034, main.js:2040, main.js:2046)
- `key_backspace` 3 (main.js:504, main.js:614, main.js:2024)
- `key_shiftspace` 1 (main.js:599)
- `key_arrow` 1 (main.js:350)
- `number_multi_enabled` 1 (main.js:200)

### Mode changes (53 call sites, 13 methods)

- `mode_set` 17 (general.js:88, general.js:228, general.js:2375, general.js:2494, general.js:2573, general.js:2731, general.js:2770, main.js:717, main.js:721, main.js:724, main.js:727, main.js:730, main.js:733, main.js:736, main.js:771, main.js:1844, settings.js:217)
- `submode_check` 12 (main.js:322, main.js:411, main.js:423, main.js:739, main.js:780, main.js:886, main.js:888, main.js:890, main.js:897, main.js:899, main.js:901, main.js:1849)
- `mode_qa` 10 (general.js:2480, general.js:2769, main.js:809, main.js:816, main.js:836, main.js:847, main.js:1082, main.js:1086, main.js:1713, main.js:1728)
- `stylemode_check` 5 (main.js:494, main.js:517, main.js:687, main.js:1855, main.js:1859)
- `mode_grid` 1 (main.js:1652)
- `set_orientation` 1 (main.js:1864)
- `subcombimode` 1 (main.js:1868)
- `subsymbolmode` 1 (main.js:1874)
- `type_set` 1 (settings.js:382)
- `reset_selectedmode` 1 (general.js:1379)
- `update_customcolor` 1 (main.js:66)
- `get_customcolor` 1 (class_panel.js:300)
- `update_genre_tags` 1 (main.js:33)

### Undo/redo (16 call sites, 3 methods)

- `undo` 7 (general.js:1153, general.js:1163, main.js:594, main.js:1000, main.js:1141, main.js:1811, main.js:1835)
- `redo` 8 (general.js:993, general.js:1109, general.js:1172, main.js:525, main.js:587, main.js:1033, main.js:1144, main.js:1819)
- `set_redoundocolor` 1 (settings.js:340)

### Board shape and geometry (91 call sites, 24 methods)

- `resize_top` 10 (main.js:1378, main.js:1396, main.js:1429, main.js:1447, main.js:1474, main.js:1492, main.js:1525, main.js:1543, main.js:1562, main.js:1586)
- `resize_bottom` 10 (main.js:1372, main.js:1402, main.js:1423, main.js:1453, main.js:1468, main.js:1498, main.js:1519, main.js:1549, main.js:1568, main.js:1592)
- `resize_left` 10 (main.js:1375, main.js:1405, main.js:1426, main.js:1444, main.js:1471, main.js:1501, main.js:1522, main.js:1540, main.js:1574, main.js:1598)
- `resize_right` 10 (main.js:1381, main.js:1399, main.js:1420, main.js:1450, main.js:1477, main.js:1495, main.js:1516, main.js:1546, main.js:1580, main.js:1604)
- `get_orientation` 8 (main.js:1366, main.js:1390, main.js:1414, main.js:1438, main.js:1462, main.js:1486, main.js:1510, main.js:1534)
- `grid_is_square` 16 (main.js:1367, main.js:1391, main.js:1415, main.js:1439, main.js:1463, main.js:1487, main.js:1511, main.js:1535, main.js:1561, main.js:1567, main.js:1573, main.js:1579, main.js:1585, main.js:1591, main.js:1597, main.js:1603)
- `rotate_size` 3 (main.js:1336, main.js:1341, main.js:1357)
- `rotate_right` 1 (main.js:1335)
- `rotate_left` 1 (main.js:1340)
- `rotate_LR` 1 (main.js:1345)
- `rotate_UD` 1 (main.js:1349)
- `rotate_center` 1 (main.js:1353)
- `rotate_reset` 1 (main.js:1361)
- `reset_frame` 4 (general.js:83, general.js:225, general.js:2715, general.js:2736)
- `reset_frame_newgrid` 1 (general.js:904)
- `reset_board` 1 (general.js:1402)
- `create_point` 2 (general.js:2451, general.js:2761)
- `point_move` 2 (general.js:2452, general.js:2762)
- `canvas_size_setting` 2 (general.js:2453, general.js:2763)
- `make_frameline` 2 (general.js:2461, general.js:2767)
- `point_reflect_LR` 1 (general.js:2456)
- `point_reflect_UD` 1 (general.js:2459)
- `search_center` 1 (general.js:2703)
- `load_compat_fixes` 1 (general.js:2678)

### Templates (10 call sites, 4 methods)

- `draw_sudokugrid` 3 (general.js:575, general.js:604, general.js:633)
- `draw_N` 3 (general.js:579, general.js:608, general.js:637)
- `draw_Z` 3 (general.js:584, general.js:613, general.js:642)
- `draw_kakurogrid` 1 (general.js:656)

### Save, load, links, export (13 call sites, 11 methods)

- `maketext` 1 (general.js:1564)
- `maketext_duplicate` 3 (general.js:1574, general.js:1831, progress.js:87)
- `maketext_solve` 1 (general.js:1569)
- `maketext_compsolve` 1 (general.js:1582)
- `maketext_solve_solution` 1 (general.js:1587)
- `maketext_replay` 1 (general.js:1593)
- `maketext_ppfile` 1 (general.js:1631)
- `maketext_gmpfile` 1 (general.js:1637)
- `load_clues` 1 (general.js:1852)
- `export_clues` 1 (general.js:1883)
- `load_bg_image_attrs` 1 (general.js:2098)

### Answer check (1 call sites, 1 methods)

- `get_answercheck_settings` 1 (general.js:3203)

### Rendering and view (27 call sites, 7 methods)

- `redraw` 17 (general.js:104, general.js:894, general.js:906, general.js:1201, general.js:1403, general.js:2539, main.js:239, main.js:376, main.js:576, main.js:2218, settings.js:119, settings.js:134, settings.js:200, settings.js:224, settings.js:341, settings.js:383, settings.js:397)
- `resizecanvas` 3 (general.js:1461, general.js:1485, general.js:1496)
- `show_pause_layer` 3 (general.js:896, general.js:909, main.js:2290)
- `hide_pause_layer` 1 (main.js:2295)
- `draw_symbol_select` 1 (class_panel.js:306)
- `update_bg_image_url` 1 (main.js:2056)
- `update_bg_image_attrs` 1 (main.js:2058)

### Properties the UI writes and reads

Beyond calls, the UI reaches into the object: **43 properties written at 108 sites, 54 read at 706 sites**. The
ones that matter for an API:

- **Pointer state is set from outside before each call.** main.js sets `pu.mouse_mode`, `pu.mouse_click`,
  `pu.mouse_click_last` and `pu.select_remove` and then calls `pu.mouseevent(x, y, num, ...)` (main.js:128-145,
  176-178, 241-256). `x, y` are canvas pixels and `num` is the point index main.js found itself: `coord_point`
  (main.js:919-962) scans `pu.point[i].x/y` for the nearest point whose type is in `pu.type`, and temporarily
  overwrites `pu.type` to do it (main.js:933, 950). Hit-testing is UI code over engine geometry.
- **Loading writes the model directly.** general.js `load()` (general.js:1969-2679, 711 lines, 63 of them
  with `document.` or `$(`) decodes a link and assigns `pu.pu_q`, `pu.pu_a`, `pu.pu_q_col`, `pu.pu_a_col` (general.js:2245-2256,
  2376-2382, 2520-2523), `pu.centerlist`, `pu.solution`, `pu.mode`, `pu.version`, `pu.canvasx/y`, `pu.width_c` and
  more (general.js:2091-2125). The link decoder, an engine job, lives in a UI file and needs the DOM.
- **`pu` itself is reassigned**: 16 sites in general.js (e.g. general.js:82, 196, 444-727 in `make_class`) and 68 in
  puzzlink.js.
- **Most-read properties**: `pu.mode` (192 reads), `pu.nx` (125), `pu[qa]` (75), `pu.centerlist` (45), `pu.point`
  (35), `pu[pu.mode.qa]` (28), `pu.gridtype` (22), `pu.size` (21). Replay state (`replay_timer`, `live_replay`,
  `first_click`, `temp_timer`) is read and written as fields on `pu` by general.js (927-1165).

### Importer calls

The puzz.link importer `decode_puzzlink` (puzzlink.js:973-3052) is engine-side by ADR 0001, but it builds the puzzle
through the UI-coupled methods: `mode_set` 77 sites, `mode_qa` 67, `subcombimode` 53, `mode_grid` 44,
`draw_sudokugrid` 3, `submode_check` 2, `resize_top` 2, `resize_bottom`/`resize_left`/`resize_right`/`redraw`/
`draw_kakurogrid`/`subsymbolmode` 1 each. It also reassigns the global `pu` (68 sites, e.g. puzzlink.js:1025), writes
`pu.user_tags` (89 sites), references `UserSettings.` 78 times in that range (77 of them
`tab_settings`), reads the margins form `nb_space1..4` (42 `getElementById` calls), hides `#modal` and draws
`panel_pu` (`setupProblem`, puzzlink.js:1002-1007). The `Puzzlink` and `DisjointSets` classes above it (puzzlink.js:1-972) has no
`document.`, `UserSettings` or `panel_pu` reference.
