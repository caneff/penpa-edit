# Mouse card wording, draft (#103)

Status: accepted by Chris for now, to be revisited (2026-11-16, Q19). Cycles as `A → B → clear` (Q20); no entries that only restate another gesture. The six rows first marked unsure were settled live the same day.

Drafted 2026-11-16 against `origin/spec-90` (`8e94949`). Every row was read from `docs/js/class_p.js` in solve mode
(`pu.mode.qa === "pu_a"`), on a square grid, desktop mouse (`ondown_key === "mousedown"`, so the `*_reduced` and
`*_up_reduced` branches apply, not the touch ones). Button routing is in `docs/js/main.js` (`onDown`, `onMove`, `onUp`,
`coord_point`). Rows marked "checked live" were also confirmed in headless Chromium on `solve.html` with a blank 10x10 solve
link, real `page.mouse` clicks and drags, reading `pu.pu_a` afterwards (script `live/zz-verify.mjs` in a throwaway worktree,
not kept).

Things that hold for many rows, so they are not repeated in every cell:

- **Shift + click and Ctrl + click act as Right click** in Shading (`surface`) and every Composite tool (`mouseevent`:
  "Map shift/ctrl-click to right click"). Listed in More only where Right click does something.
- **"Starting on ... : erase"**: a drag's first step decides. If the first segment already holds this tool's line (same
  style), the whole drag erases that line; otherwise it draws, replacing a line of another style (`re_line`,
  `drawing_mode` 100 → style or 0). Crossing a line later in the drag does not erase it.
- Middle button does nothing (`onDown` ignores `e.button === 1`).
- The "2nd colour" is `UserSettings.secondcolor`, light green unless changed in Settings.

## Shading and colour

| key | name | Left click | Right click | Drag | More | Changed? | Sure? | Handler |
|---|---|---|---|---|---|---|---|---|
| surface/ | Shade cells | paint the cell → clear | paint the 2nd colour → clear | paint many cells; starting on a painted cell: clear many | Right drag: 2nd colour on many cells (starting on it: clear many); Alt + drag: paint a rectangle (starting on the colour: clear it); Alt + right drag: rectangle in the 2nd colour; Digit: pick colour n | reworded | yes (Shift + click checked live) | `mouse_surface`, `re_surface_twobutton`, `re_surfaceR`, `re_surfacemove`, `handle_rect_mousedown` |
| multicolor/ | Colour selected cells | select the cell (drops the rest) | — | select many cells | Ctrl/Shift + click: add or remove the cell; Ctrl/Shift + drag from a selected cell: remove cells; Alt + drag: select a rectangle; Double click: select every cell of the same colour; Digit: add or remove colour n in the selected cells | fixed | yes | `mouse_sudoku`, `dblmouseevent`, `key_number` (`edit_mode === "multicolor"`) |
| combi/blpo | Shade + dot | shade → dot · → clear | dot · → shade → clear | repeat the first cell's change on each cell (shade, dot or clear) | — | reworded | yes | `re_combi_blpo`, `re_combi_blpo_downright`, `re_combi_blpo_move` |
| combi/shaka | Corner triangles + dot | dot · → clear | — | from a cell toward a corner: black triangle filling that corner's half → clear (same way) | — | new | yes (checked live) | `re_combi_shaka`, `re_combi_shaka_move`, `re_combi_shaka_up` |

## Lines through cells

| key | name | Left click | Right click | Drag | More | Changed? | Sure? | Handler |
|---|---|---|---|---|---|---|---|---|
| line/1 | Line | — | — | line through cell centres; starting on it: erase | — | reworded | yes | `mouse_line`, `re_linemove`, `re_line` |
| line/2 | Diagonal line | — | — | line through cell centres, diagonals too; starting on it: erase | — | reworded | yes | `mouse_line`, `re_linemove` (submode "2") |
| line/3 | Free line | — | — | straight line from one cell centre to another, any angle, drawn on release; over the same line: erase | — | reworded | yes | `mouse_linefree`, `re_lineup_free` |
| line/5 | Midpoint line | — | — | line in half steps, cell centre to edge middle, so it can stop at an edge; starting on it: erase | — | fixed | yes | `mouse_line`, `re_linemove` (submode "5", `point.neighbor`) |
| line/4 | Line helper × | × on the edge between two cells → clear | — | — | — | same | yes | `mouse_lineX`, `re_lineX` |
| combi/linex | Loop + edge × | — | × on the edge → clear | loop through cell centres; starting on it: erase | Right drag: × on each edge crossed (starting on a ×: clear them) | reworded | yes | `re_combi_linex_move`, `re_combi_cross_downright` |
| combi/lineox | Loop + cell ○ × | ○ in the cell → × → clear | × in the cell → ○ → clear | loop through cell centres; starting on it: erase | — | reworded | yes (right drag checked live) | `re_combi_lineox`, `re_combi_lineox_move`, `re_combi_lineox_up` |
| combi/linedir | Line + direction marks | — | edge: × → arrowhead one way → the other way → clear | line through cell centres; starting on it: erase | Right drag from a cell toward an edge: arrowhead on that edge pointing that way → clear (same way); Right drag from an edge: × on each edge crossed (starting on a mark: clear them) | new | yes | `re_combi_linedir_move`, `re_combi_linedir_downright`, `re_combi_linedir_up` |
| combi/yajilin | Shade + loop | shade the cell → clear | cell: dot · → clear; edge: × → clear | loop through cell centres; starting on it: erase | Right drag: dot · on many cells (starting on a dot: clear many) | reworded | yes | `re_combi_yajilin_move`, `re_combi_yajilin_up_reduced`, `re_combi_yajilin_downright` |
| combi/hashi | Bridges | × in the cell → clear | × in the cell → clear | bridge between cells → double → clear | — | fixed | yes (clicks checked live) | `re_combi_hashi`, `re_combi_hashi_move`, `re_combi_hashi_up` |
| combi/rassisillai | Line + cell marks | ○ in the cell → clear | shade the cell → clear | line through cell centres; starting on it: erase | Right drag: shade many cells (starting on a shaded cell: clear many) | new | yes | `re_combi_rassisillai_move`, `re_combi_rassisillai_up_reduced`, `re_combi_rassisillai_downright` |

## Edges and walls

| key | name | Left click | Right click | Drag | More | Changed? | Sure? | Handler |
|---|---|---|---|---|---|---|---|---|
| lineE/1 | Edge line | — | — | line along grid lines; starting on it: erase | — | reworded | yes | `mouse_lineE`, `re_linemoveE` |
| lineE/2 | Diagonal edge line | — | — | line along grid lines, and across cells corner to corner; starting on it: erase | — | reworded | yes | `mouse_lineE`, `re_linemoveE` (submode "2") |
| lineE/3 | Free edge line | — | — | straight line from one corner to another, any angle, drawn on release; over the same line: erase | — | reworded | yes | `mouse_lineEfree`, `re_lineEup_free` |
| lineE/6 | Midpoint edge line | — | — | line along grid lines in half steps, corner to edge middle, so it can stop mid-edge; starting on it: erase | — | fixed | yes | `mouse_lineE`, `re_linemoveE` (submode "6", `edge_to_vertex`) |
| lineE/4 | Edge helper × | × on the grid line → clear | — | — | — | same | yes | `mouse_lineEX`, `re_lineEX` |
| lineE/5 | Erase grid lines | — | — | erase the grid lines it runs along; starting on an erased one: restore them | — | reworded | yes | `re_linemoveE` (submode "5", `deletelineE`) |
| wall/ | Wall | — | — | straight wall through cell centres, from edge middle to edge middle; it does not turn within a drag; starting on it: erase | — | reworded | yes (checked live) | `mouse_wall`, `re_wallmove` |
| combi/edgex | Edges + × | — | × on the edge, if no edge line is there → clear | line along grid lines; starting on it: erase | Right drag: × on each edge crossed (starting on a ×: clear them) | reworded | yes | `re_combi_edgex_move`, `re_combi_cross_downright` |
| combi/edgexoi | Edges + inside / outside | cell: yellow → 2nd colour → clear | edge: × → clear; cell: 2nd colour → yellow → clear | line along grid lines; starting on it: erase | — | reworded | yes | `re_combi_edgexoi_move`, `re_combi_edgexoi_up`, `re_combi_cross_downright` |
| combi/edgesub | Edges + helper line | — | — | from a corner: line along grid lines; from a cell: grey helper line through cell centres; starting on either: erase | — | new | yes | `re_combi_edgesub`, `re_combi_edgesub_move` |

## Numbers and letters

| key | name | Left click | Right click | Drag | More | Changed? | Sure? | Handler |
|---|---|---|---|---|---|---|---|---|
| number/1 | Number | select the cell (drops the rest) | — | select many cells | Ctrl/Shift + click: add or remove the cell; Alt + drag: select a rectangle; Double click: select every cell with the same number; Digit: write it in the selected cells | fixed | yes (right click checked live) | `mouse_sudoku` (via `number_multi_enabled`), `dblmouseevent`, `key_number` |
| number/10 | Large number | select the cell (drops the rest) | — | select many cells | as Number; Digit: large number in the selected cells | fixed | yes | as number/1 |
| number/6 | Medium number | select the cell (drops the rest) | — | select many cells | as Number; Digit: medium number in the selected cells | fixed | yes | as number/1 |
| number/5 | Small number | select the cell (drops the rest) | — | select many cells | as Number; Digit: small number in the selected cells | fixed | yes | as number/1 |
| number/7 | Candidates | select the cell (drops the rest) | — | select many cells | as Number; Digit: add or remove that candidate in the selected cells | fixed | yes | as number/1 |
| number/8 | Long number | select the cell (drops the rest) | — | select many cells | as Number; Digit: add it to the long number in the selected cells | fixed | yes | as number/1 |
| number/3 | Quarter numbers | cursor to the nearest cell corner spot | cursor to the nearest cell corner spot | — | Digit: number at the cursor | reworded | yes (checked live: Alt + drag selects cells it does not show, and the digit still goes to the cursor, so no Alt + drag row) | `mouse_numberS` |
| number/9 | Side numbers | cursor to the nearest cell side spot | cursor to the nearest cell side spot | — | Digit: number at the cursor | reworded | yes (checked live, as number/3) | `mouse_numberS` |
| sudoku/1 | Digits | select the cell (drops the rest) | — | select many cells | Ctrl/Shift + click: add or remove the cell; Ctrl/Shift + drag from a selected cell: remove cells; Alt + drag: select a rectangle; Double click: select every cell with the same digit; Digit: digit in the selected cells; Shift held: corner marks; Ctrl held: centre marks | fixed | yes (right click checked live) | `mouse_sudoku`, `dblmouseevent`, `handle_rect_mousedown` |
| sudoku/2 | Corner marks | select the cell (drops the rest) | — | select many cells | as Digits; Digit: corner mark in the selected cells | fixed | yes | as sudoku/1 |
| sudoku/3 | Centre marks | select the cell (drops the rest) | — | select many cells | as Digits; Digit: centre mark in the selected cells | fixed | yes | as sudoku/1 |
| combi/numfl | Numbers by flick | 5 in the cell → clear | — | from a cell: a digit by direction, laid out like a phone keypad around 5 (↖1 ↑2 ↗3 ←4 →6 ↙7 ↓8 ↘9) | — | new | yes (click and ↑ checked live) | `re_combi_numfl`, `re_combi_numfl_move`, `re_combi_numfl_up`, `direction_num8` |
| combi/alfl | Letters by flick | E in the cell → clear | — | from a cell: a letter by direction, around E (↖A ↑B ↗C ←D →F ↙G ↓H ↘ -) | — | new | yes (↘ checked live) | `re_combi_alfl`, `re_combi_alfl_move`, `re_combi_alfl_up` |

## Symbols and marks

| key | name | Left click | Right click | Drag | More | Changed? | Sure? | Handler |
|---|---|---|---|---|---|---|---|---|
| symbol/* (every shape except the on/off ones below; 86 tools) | the shape's name | the shape's first variant → clear; on another variant: the first variant | cursor to the cell | — | Digit: shape variant n at the cursor → clear (same digit) | fixed | yes (checked live: picking a Shape turns on Penpa's input-panel setting, which solve.html keeps hidden and has no control to turn off, so each click types the panel's variant 1) | `mouse_symbol` (`UserSettings.panel_shown`, `panel_pu.edit_num`), `mode_set` (`panelflag`), `key_number` |
| symbol/* on/off shapes: cross, arrow_cross, arrow_fourtip, degital_B/G/E/f, arrow_eight, arrow_fouredge_B/G/E, dice, polyomino, polyhex (14 tools) | the shape's name | cursor to the cell | cursor to the cell | — | Digit: add or remove part n of the shape at the cursor | fixed | yes (left click checked live on arrow_cross: places nothing) | `mouse_symbol`, `onoff_symbolmode_list`, `onofftext` |
| combi/blwh | Black + white circles | white ○ → black ● → clear | black ● → white ○ → clear | repeat the first cell's change on each cell | given circles are left alone | fixed | yes (drag checked live) | `re_combi_blwh`, `re_combi_blwh_downright`, `re_combi_blwh_move` |
| combi/star | Stars + × | star ★ → clear, also clears dots on the cell's corners and edges; on a ×: clear | cell: × → clear; corner or edge: green dot → clear | starting on a marked cell: clear many | Right drag: × on many cells (starting on a mark: clear many) | fixed | yes (left drag checked live) | `re_combi_star_reduced`, `re_combi_star_downright`, `re_combi_star_move` |
| combi/akari | Bulbs + dots | bulb 💡 → clear; on a dot: bulb | cell: dot · → clear; on a bulb: dot; edge: × → clear | dashed helper line through cell centres; starting on it: erase | Right drag: dot · on many cells (starting on a dot: clear many) | reworded | yes | `re_combi_akari_move`, `re_combi_akari_up_reduced`, `re_combi_akari_downright` |
| combi/battleship | Ship pieces + water | ship middle ■ → ● → · → water ≈ → clear; on a ship end: clear | water ≈ → clear | from an empty cell: ship end, its body toward where you drag (round side away); starting on · or ≈: that mark on each cell | Right drag: water on many cells (starting on water: clear many); given ship pieces are left alone | fixed | yes (click cycle and drag checked live) | `re_combi_battleship`, `re_combi_battleship_move`, `re_combi_battleship_up`, `re_combi_battleship_downright` |
| combi/tents | Tents + × | tent ▲ → dot · → clear | cell: dot · → ▲ → clear; edge: × → clear | line between cell centres, to link a tent to its tree; starting on it: erase | — | fixed | yes (right click on a cell checked live) | `re_combi_tents_move`, `re_combi_tents_up`, `re_combi_cross_downright` |
| combi/mines | Mines + × | mine 💣 → clear, also clears dots on the cell's corners and edges | cell: × → clear; corner or edge: green dot → clear | starting on a marked cell: clear many | Right drag: × on many cells (starting on a mark: clear many) | fixed | yes | `re_combi_mines_reduced`, `re_combi_mines_downright`, `re_combi_mines_move` |
| combi/doublemines | One or two mines + × | mine 💣 → two 💣💣 → clear, also clears dots on the cell's corners and edges | cell: × → clear; corner or edge: green dot → clear | starting on a marked cell: clear many | Right drag: × on many cells (starting on a mark: clear many) | fixed | yes | `re_combi_doublemines_reduced`, `re_combi_mines_downright`, `re_combi_mines_move` |
| combi/magnets | Magnet poles + − | + → − → shade → clear | shade → − → + → clear | — | — | new | yes (left cycle checked live) | `re_combi_magnets`, `re_combi_magnets_downright` |
| combi/arrowS | Arrows in cells | on an arrow: clear it | — | from a cell: arrow pointing the way you drag (8 directions) | — | new | yes | `re_combi_arrowS`, `re_combi_arrowS_move`, `re_combi_arrowS_up`, `direction_arrow8`, `draw_arrowS` |

## Objects and cages

| key | name | Left click | Right click | Drag | More | Changed? | Sure? | Handler |
|---|---|---|---|---|---|---|---|---|
| special/thermo | Thermometer | on a thermometer's bulb: erase it | — | thermometer from the bulb cell through cells, diagonals too; drag back to undo a step | — | fixed | yes (click-erase checked live) | `mouse_special`, `re_specialdown`, `re_special`, `re_specialup` |
| special/nobulbthermo | Thermometer, no bulb | on its first cell: erase it | — | thermometer through cells, diagonals too; drag back to undo a step | — | fixed | yes | as special/thermo |
| special/arrows | Arrow with circle | on its circle: erase it | — | arrow from the circled cell through cells, diagonals too; drag back to undo a step | — | fixed | yes | as special/thermo |
| special/direction | Arrow | on its tail cell: erase it | — | arrow through cells, head at the last cell, diagonals too; drag back to undo a step | — | fixed | yes | as special/thermo |
| special/squareframe | Rectangle frame | on its first cell: erase it | — | grey band through the cells, following the path (an L stays an L); drag back to undo a step | — | fixed | yes (checked live; diagonal steps read from `re_special` only) | as special/thermo |
| special/polygon | Polygon | first click starts at a grid corner; each click adds a corner; click the first or the last corner again to finish (closed, filled shape either way) | — | — (the next corner follows the pointer until you finish) | — | fixed | yes (checked live, including a right click mid-shape: nothing, drawing goes on) | `mouse_special`, `re_polygondown`, `re_polygonmove` |
| cage/1 | Cage | free cell: 1-cell cage → clear; caged cell: erase its whole cage (a cage in another style: restyle it to this one → erase) | — | cage around the cells; nothing if any of them is already caged | — | fixed | yes (checked live; an overlapping or inside drag makes nothing, so nested cages cannot be drawn here) | `mouse_cage` (`sub_cage1`), `flood_cage`, `cage_for_selection` |
| cage/2 | Free cage lines | — | — | cage line through points a quarter cell in from the corners; starting on it: erase | — | reworded | yes | `mouse_cage` (`sub_cage2`), `re_linecage` |

## Moving things

| key | name | Left click | Right click | Drag | More | Changed? | Sure? | Handler |
|---|---|---|---|---|---|---|---|---|
| move/1 | Move anything | — | — | move a number or shape you entered to an empty cell | — | reworded | yes | `mouse_move`, `re_movedown`, `re_movemove` |
| move/2 | Move numbers | — | — | move a number you entered to an empty cell | — | reworded | yes | as move/1 |
| move/3 | Move shapes | — | — | move a shape you entered to an empty cell | — | reworded | yes | as move/1 |

## Where today's text is factually wrong

Today's text is `mouseRows` / `COMPOSITE_ROWS` (and, for the eight placeholder Composite tools, the `ENTRIES` description).

1. **Right click in Number (1, 10, 6, 5, 7, 8), Sudoku (1, 2, 3) and Multicolor**: today "cursor on the cell" / "select a
   cell". It does nothing: `mouse_sudoku` has no `down_right` branch (checked live: selection and cursor unchanged).
2. **Number / Sudoku / Multicolor Left click**: today "cursor on the cell". It selects the cell and drops the rest of
   the selection (`mouse_sudoku`); Ctrl/Shift + click adds or removes.
3. **Shape, Left click "(again: next variant)"**: a click places the shape's first variant and a second click clears it;
   it never steps to the next variant. Picking a Shape turns on Penpa's input-panel setting (`panelflag` in `mode_set`);
   solve.html keeps the panel hidden, and `mouse_symbol` then types the panel's selected variant (1) on each click
   (checked live). On/off shapes only move the cursor.
4. **Black + white circles, Drag "—"**: dragging repeats the first click's change (white, black or clear) on every cell
   (`re_combi_blwh_move`; checked live).
5. **Bridges, Left and Right click "—"**: a click puts a grey × in the cell, again clears it (`re_combi_hashi_up`;
   checked live).
6. **Stars, Mines, One or two mines, Drag "—"**: a left drag that starts on a marked cell clears marks along the way
   (`drawing_mode` 2 in `*_reduced`, `re_combi_star_move` / `re_combi_mines_move`; checked live for Stars).
7. **Ship pieces, Left click cycle "■ (again: ●, ·, clear)"**: after · comes water ≈, then clear (`re_combi_battleship_up`,
   `drawing_mode` 3; checked live).
8. **Ship pieces, Drag "ship end, pointing the way you drag"**: the round end faces away from the drag; the drag points
   along the ship's body (drag right gives the left end; `direction_battleship4`, `draw_battleship_tip`; checked live).
9. **Tents, Right click "×"**: on a cell it gives a dot · (again: ▲, again: clear); × goes only on edges
   (`re_combi_tents_up` with `mouse_click_last === 2`; checked live).
10. **Corner triangles + dot (description)**: "Click places a half-cell triangle; right a dot." Click places the dot,
    a drag toward a corner places the triangle, and right click does nothing (no `down_right` case; checked live).
11. **Special tools (thermo, no-bulb thermo, sudoku arrow, arrow, rectangle frame), Left click "—"**: a click on the
    first cell of an existing one erases it (`re_specialup`; checked live for thermo and rectangle frame). The rectangle
    frame also draws a grey band along the dragged path, not a rectangle (checked live).
12. **Polygon, Drag "draw a polygon through the cells"**: it is click by click on grid corners, not a drag
    (`re_polygondown`; `mouse_mode === "up"` does nothing for it). Finishing gives a closed, filled shape (checked live).
13. **Killer cage, Left click "—"**: a click on a free cell makes a 1-cell cage; on a caged cell it erases
    that whole cage, or restyles it first if its style differs (`mouse_cage`, `sub_cage1`, single-cell branch; checked live).
14. **Midpoint line (line/5) "through edge midpoints"** and **Midpoint edge line (lineE/6) "through midpoints"**: both
    draw half steps (cell centre to edge middle; corner to edge middle), which is what lets a line stop at an edge
    (`point.neighbor`, `point.edge_to_vertex`).

Near misses, counted as "reworded" not "fixed": missing "again: clear" steps (Shade cells right, Shade + dot right,
Loop + cell ○ × right, Edges + inside / outside left and right, Yajilin right, Bridges drag, One or two mines left);
"(over a line: erase)" for line tools (only the first segment decides); Move "any item" (only numbers and shapes, only
your own); quarter / side Number right click "cursor on the cell" (it goes to the corner / side spot).

## Tools listTools() returns that tool-guide.js has no entry for

On a square-grid solve page, `engine.listTools()` returns 158 tools. Every non-shape tool (58) has an `ENTRIES` entry.
The 100 Shape tools (`symbol/*`) have none; `describeTool` falls back to a generic Shape entry for them, and `mouseRows`
handles them in its `symbol` case, so they are covered by fallback rather than an entry. Other grid types were not
listed and may offer tools (for example `board`, `number/2` arrows, `number/4` tapa, `number/11` killer sum) that a
square grid hides.

## Counts

- Tools: 158 (58 non-shape rows + 100 shapes in 2 row sets) = 60 table rows.
- Changed: 58 of 60 rows (fixed 28, reworded 22, new 8; same 2: line/4, lineE/4).
- Factual fixes: 14 items above, covering the 28 rows marked fixed.
- Unsure rows: 0. The 6 earlier ones (wall/, special/squareframe, special/polygon, cage/1, Shape, number/3 and
  number/9) were settled live on 2026-11-16; screenshots in `.scratch/mouse-wording/shots/`.


---

# Other grid types and tools with no entry

### Headline

- **No non-shape tool lacks an `ENTRIES` row on any grid type.** Every grid offers a subset of the square grid's 58
  non-shape tools. The draft guessed that other grids add `board`, `number/2` (arrow), `number/4` (tapa) and
  `number/11` (killer sum), but they do not. `set_solvemode` (general.js) hides Box (`mo_board_lb`) and
  `sub_number2_lb` / `sub_number4_lb` / `sub_number11_lb` on every grid type, so no solve link offers them.
- The only tools without an entry are the 100 shape tools (`symbol/*`). All 100 are on the square grid. No other
  grid offers a shape the square grid lacks.
- The list depends on three things:
  - **Grid type**: `penpa_modes[gridtype]` plus `PenpaUI.set_visible_modes_by_gridtype`.
  - **The link's tab set**: `advancecontrol_off` hides whole modes only (`mo_*_lb`). A mode it keeps lists all of
    its sub-modes. Checked live: tab set `['Line Helper', 'Yajilin']` lists line/1, 2, 3, 5 and 4, and nothing else.
    "Yajilin" alone does not bring in Composite; only the "Composite" tab does. The Akari link (tab set
    `['Surface', 'Composite']`) lists surface plus all 22 Composite tools.
  - **Contest mode**: `set_contestmode` hides Move (`mo_move_lb`). This was read from the code, not run.
- **Genre tags and the Composite set do not change the list.** No code hides a tool by `pu.user_tags`. The
  Composite tools follow only `penpa_modes[gridtype].combisub`.
- listTools() never includes a tool the link's mode restrictions hide (`hiddenInPenpa` checks `is_hidden` and
  `display:none`).

### Grid type → tools

The "Missing" column counts tools with no `ENTRIES` row. Every one is a shape.

| grid type | tools | non-shape | shapes | missing (no ENTRIES) | non-shape tools the square grid has and this grid lacks |
|---|---|---|---|---|---|
| square | 158 | 58 | 100 | 100 shapes | — |
| sudoku | 157 | 58 | 99 | 99 shapes | — (shape `polyhex` is not offered) |
| kakuro | 157 | 58 | 99 | 99 shapes | — (shape `polyhex` is not offered) |
| hex | 123 | 49 | 74 | 74 shapes | line/2, lineE/2, sudoku/2, combi/shaka, linedir, rassisillai, battleship, arrowS, doublemines |
| tri | 110 | 46 | 64 | 64 shapes | the hex list, plus wall/, number/10, number/9 |
| pyramid | 116 | 46 | 70 | 70 shapes | the hex list, plus line/5, lineE/6, number/9 |
| iso (Cube) | 108 | 40 | 68 | 68 shapes | the hex list minus lineE/2, plus line/5, lineE/6, wall/, number/3, number/9, special/thermo, nobulbthermo, arrows, direction, squareframe |
| tetrakis_square | 107 | 39 | 68 | 68 shapes | the iso list, plus lineE/2 |
| truncated_square | 100 | 35 | 65 | 65 shapes | the tetrakis list, plus number/7, move/1, move/2, move/3 |
| snub_square | 100 | 35 | 65 | 65 shapes | same as truncated_square |
| rhombitrihexagonal | 100 | 35 | 65 | 65 shapes | same as truncated_square |
| deltoidal_trihexagonal | 100 | 35 | 65 | 65 shapes | same as truncated_square |
| cairo_pentagonal | 98 | 33 | 65 | 65 shapes | the truncated_square list, plus cage/1, cage/2 |
| penrose_P3 | 106 | 38 | 68 | 68 shapes | the tetrakis list, plus multicolor/ |

On every grid except the square family, these shapes are not offered: triright\_\*, trileft\_\*, bars\_\*, tri,
arrow_fouredge\_\*, arrow_fourtip, battleship\_\*+, pencils, slovak, arc, darts, spans, neighbors. Some grids also
lack sudokumore, degital_B/E/G, battleship_B/G/W, kakuro, compass, pills, dice, frameline and polyhex. The full
lists are in the method's `grids.json`.

### Missing tools: rows

All 100 missing tools are shapes. They behave in two ways, so two row sets cover them. Which set a shape uses
depends on the grid, through `onoff_symbolmode_list`.

What the cards show today for any shape (from `describeTool` and `mouseRows`):

- **Mode card**: the name is `submodeName` with its first letter capitalised. The description is "Shape at the
  cursor; digits pick its variant."
- **Mouse card**:
  - Left: "cursor + <name> <style> (again: next variant)"
  - Right: "move the cursor"
  - Drag: —
  - Digit: "variant n at the cursor"

The Left row is wrong for both kinds of shape: clicking again clears the shape, and does not step to the next
variant. The Mode-card description is also wrong for the on/off shapes, because their digits switch parts on and off.

| key | name | Left click | Right click | Drag | More | Sure? | Handler |
|---|---|---|---|---|---|---|---|
| symbol/* except the on/off shapes (86 tools on square) | the shape's name (see the shape-name list) | the shape's first variant → clear; on another variant: the first variant | cursor to the cell | — | Digit: variant n at the cursor → clear (same digit) | yes: live on square and hex (circle_L, arrow_B_B) | `mouse_symbol` (`UserSettings.panel_shown`, `panel_pu.edit_num`), `key_number` (`edit_mode === "symbol"`) |
| symbol/ cross, arrow_cross, arrow_fourtip, arrow_eight, arrow_fouredge_B/G/E, degital_B/G/E, degital_f, dice, polyomino, polyhex (14 tools on square) | the shape's name | cursor to the cell | cursor to the cell | — | Digit: part n of the shape at the cursor on / off | yes for cross, live on square and hex; the rest read from code | `mouse_symbol` (`!this.onoff_symbolmode_list[...]`), `onofftext` |

On/off part counts, read from each grid class's `onoff_symbolmode_list`:

- **cross**: 4 arms on square, sudoku and kakuro. 6 on hex, tri, pyramid and iso. 4 on the other uniform grids
  and penrose.
- **arrow_cross**: 8 on square, sudoku and kakuro. 6 on hex, tri, pyramid and iso. 4 on the other uniform grids.
- **arrow_eight**: 8, except 6 on hex, tri and pyramid.
- **degital\_\***: 7 segments. **dice**: 9 pips. **polyomino**: 9. **polyhex**: 7.

Caveats:

- The Left row on the first set relies on Penpa's input panel being on, and `mode_set` turns it on when a shape is
  picked. Left click types panel variant `edit_num + 1`, which stays at 1 because solve.html shows no panel.
- `UserSettings.draw_edges`, a Penpa cookie setting that solve.html does not expose, lets the cursor land on corners
  and edges as well as cells (`type_set`, case `symbol`).

### Shape names that read badly in a picker

Names are listTools' `submodeName`. All are suggestions.

| key | today | suggested |
|---|---|---|
| symbol/cross | Cross | Cross arms (clashes with arrow_cross's "Cross") |
| symbol/arrow_cross | Cross | Arrow cross |
| symbol/arrow_Short | Short and fat | Arrow, short and fat |
| symbol/arrow_S | Small | Arrow, small |
| symbol/arrow_eight | 8-way | Arrows, 8-way |
| symbol/arrow_fourtip | Arrow tips | Arrow tips (keep) |
| symbol/arrow_fouredge_B / _G / _E | Arrows, four edges Black / Grey / Green | Edge arrows, black / grey / green |
| symbol/arrow_GP / arrow_GP_C | Arrow, graphic Normal / With circle | Arrow, graphic / Arrow, graphic, in a circle |
| symbol/degital_B / _G / _E | Digital digits Black / Gray / Green | Segment digit, black / grey / green |
| symbol/degital_f | Digital digits Digital Frame | Segment digit, outline |
| symbol/ox_B / _G / _E | ○ △ □ × Black / Gray / Green | ○ △ □ ×, black / grey / green |
| symbol/math / math_G | Math Black / Math Green | Maths signs, black / green |
| symbol/inequality | ＜ ＞ ^ v | Inequality signs |
| symbol/tri | ◢ ◣ ◤ ◥ | Corner triangles |
| symbol/dice | ⚀ ⚂ ⚅ | Dice pips |
| symbol/tents | 🌲 ▲ ≋ 🐟 | Trees, tents, water, fish |
| symbol/star | ✦ ☆ ★ | Stars |
| symbol/sun_moon | ☼ 🌙 💡 💣 | Sun, moon, bulb, bomb |
| symbol/line | Lines | Lines in a cell |
| symbol/frameline | Cage Lines | Frame lines |
| symbol/sudokuetc | Sudoku | Sudoku variant marks (unsure: draws checker squares, a big circle, a diamond …) |
| symbol/sudokumore | ArrowSums | Arrow-sum bulbs (unsure) |
| symbol/kakuro | Kakuro | Kakuro clue box |
| symbol/battleship_B+ / G+ / W+ | Ship Curvy Black / Grey / White | Ship, curvy, black / grey / white |
| symbol/hexpoint\_\*, hexflat\_\* | Hexagon, point up XL | Hexagon, point up, XL (a comma before the size) |
| symbol/slovak | Slovak Sums | Slovak sums |
| symbol/angleloop | Angle Loop | Angle loop |

Penpa spells grey two ways: "Gray" on ox_G and degital_G, "Grey" on the arrows and ships. Pick one.

The other names read well enough: circle, square, triangle and diamond with sizes, Bars, Compass, Polyomino,
Polyhex, Firefly, Pencils, Arc, Darts, Spans, Neighbors and Pills.

### Existing ENTRIES rows that differ on non-square grids

- **Alt + drag** (surface, multicolor, number rows): a rectangle only on square, sudoku and kakuro
  (`handle_rect_mousedown`, `grid_is_square()`). On other grids it is a plain drag. Read from code.
- **number/3 "Quarter numbers" / "a number in a quarter (1/4)"**: on hex the spots are the 6 corners of the cell
  (type 6), and the spots are corner spots on tri and pyramid too. "Quarter" is a square-only word. Read from code
  (`type_set`, `this.types`).
- **number/9 "Side numbers"**: hex has 6 sides. The tool is not offered on tri, pyramid, iso, the uniform grids or
  penrose.
- **sudoku "Shift / Ctrl held: corner / centre"**: hex and every other non-square grid offer no corner marks
  (sudoku/2). Seen live on hex: after a Shift press, `engine.getTool()` reports sudoku/2 with style null, a tool
  listTools() does not list. Unsure what Shift + digit then types; my key presses entered no digit on square either.
- **special/\***: on square they snap to cell centres and corners (type [0, 1]), on hex and tri to cell centres
  only. The wording "through the cells" still fits.
- **cage/2 "along corners"**: on hex and tri it uses the corner spots (type 6), which fits.
- **move/\***: not offered on the uniform grids except tetrakis and iso; contest-mode links hide it on every grid.

### Method

- Throwaway worktree of `origin/spec-90` at `.scratch/noentry`, with `node_modules` symlinked. One headless Chromium
  pinned to 2 cores (`taskset -c 0,1`). The scratch scripts and raw output were not kept.
- **Links**: for each grid type, open `docs/index.html` (`openPenpa`), set `#gridtype`, then call `changetype()`,
  `create_newboard()` (dialog defaults) and `pu.maketext_solve()`. This is the same path `tools.live.mjs` uses. Then
  open `docs/solve.html` with that `#` part, await `engine.ready` and call `engine.listTools()`. No page errors on
  any grid.
- **Tab-set check**: `AKARI_SOLVE`, and a square link with `UserSettings.tab_settings = ['Line Helper', 'Yajilin']`.
- **Mouse checks**: in solve.html on square and hex, `engine.setTool` to a shape, then left click twice, right click,
  then digit 2 twice, reading `pu.pu_a.symbol`. A Shift / Ctrl test in sudoku mode on hex and square.
- **Rows**: compared against the table in `docs/ui/tool-guide.js` (`ENTRIES`). Handlers read from `docs/js/class_p.js`
  (`mouseevent`, `mouse_symbol`, `key_number`, `onofftext`, `handle_rect_mousedown`), each grid class's `type_set`
  and `onoff_symbolmode_list`, `docs/js/general.js` (`set_solvemode`, `set_contestmode`, `advancecontrol_off`) and
  `docs/js/interface.js`.
