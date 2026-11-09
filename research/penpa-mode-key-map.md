# Penpa+ modes: what each key and click does, by mode

Read from the fork's source at `dce66ca` (upstream `34e3fe9`) for the "consistent UI interactions" grill on #1 (Chris,
2026-11-09: "think harder about ALL the modes"). Source only; nothing here was run. `research/penpa-modes-and-script-ideas.md`
covers the Tab cycle, the mode indicators and the JS hooks, and is not repeated.

## The modes in solve mode

`set_solvemode()` (`general.js:3118-3171`) hides only Board (`mo_board`) and three Number sub-modes (Arrow, Tapa, Killer).
So a solver has 12 modes: Surface, Multicolor, Line, Edge (`lineE`), Wall, Number, Shape (`symbol`), Special, Cage,
Composite (`combi`), Sudoku and Move. Sub-modes, from the `sub_<mode><n>_lb` labels in `index.html`:

- Line: Normal, Diagonal, Free, Middle, Helper (x). Edge: the same plus Erase.
- Number: Normal, L, M, S, Candidates, 1/4, Side, Long (Tapa, Arrow and Killer are hidden in solve mode).
- Sudoku: Normal, Corner, Centre. Cage: Killer, Free. Move: All, Numbers, Shapes.
- Shape, Special and Composite pick their tool from a list (`subsymbolmode`, `subcombimode`), not from radios; Composite
  holds ~25 genre tools (Yajilin, Star Battle, Battleships, Akari, Tents, ...), each with its own mouse grammar
  (README § Composite, lines 220-242).

## Families, by what a mode places and how

| Family | Modes | Places | Driven by | Selection |
|---|---|---|---|---|
| Value | Sudoku, Number | digits, letters, marks in cells | keyboard | cursor or multi-cell selection |
| Paint | Surface, Multicolor | colour or shade on cells | mouse (Surface), keyboard + selection (Multicolor) | Surface: none, click paints; Multicolor: selection |
| Path | Line, Edge, Wall | segments between points | mouse drag | none |
| Stamp | Shape, Special, Cage | a chosen object | mouse click (Shape also keyboard at the cursor) | Shape: cursor |
| Genre tool | Composite | a genre's marks (left = primary, right = auxiliary) | mouse | none |
| Move | Move | moves existing items | mouse drag | none |

## What a key does, by mode

Every typed character ends in `pu.key_number(key)` (`main.js:436-496`), which branches on the mode
(`class_p.js:7689-8325`); Space and Delete go to `key_space` (`class_p.js:8325`), Backspace to `key_backspace`
(`class_p.js:8531`).

| Key | Value (Sudoku, Number) | Surface | Multicolor | Shape | Line, Edge, Wall, Special, Cage, Composite, Move |
|---|---|---|---|---|---|
| Digit | enters that digit in the sub-mode (Normal, Corner, Centre, size, candidate) at the selection | picks a style (brush) via `surfaceKeys` (`main.js:666-693`); two quick digits after 1 give styles 11 and 12 (`main.js:327-333`); paints nothing | picks colour `MULTICOLOR_REMAP[d]` **and** applies it to the selection (`main.js:491-495`, `class_p.js:8212`) | places shape variant n at the cursor (`class_p.js:7863`) | nothing |
| Letter | enters the letter (Sudoku with Shift: lower case) | nothing; browser action blocked (`main.js:681-693`) | nothing | nothing | nothing; Z/X/C/V only from Surface or Sudoku |
| Shift / Ctrl held | Sudoku only: temporary Corner / Centre | — | — | — | — |
| Alt + digit | — | — | secondary colours 10+n (`main.js:509-519`) | — | — |
| Space / Delete | clears the selection's entry | — | clears colour | clears shape | — |
| Backspace | clears (Number); acts as Delete in Sudoku | — | — | clears shape | — |
| Arrow keys | move the cursor / selection | — | move the selection | move the cursor | — |

## What a click does, by family (README)

- **Left = primary, right = secondary** holds in most modes: Surface (right = second colour, default green, README:126),
  Line/Edge Helper (right = cross), every Composite tool (right = X, dot or water).
- **Repeat-click cycles** in Shape and several Composite tools (Black/dot, Yin-Yang, Line OX, Battleships, DoubleMines).
- **Drag** means four different things: select cells (Sudoku, Number, Multicolor), paint many cells (Surface), draw a path
  (Line, Edge, Wall, Composite), or move an item (Move). Alt + drag draws a rectangle in Surface, Multicolor, Number and
  Sudoku (README:32).

## The splits that matter for a contract

1. **A digit means one of three things**: a value (Value family), a brush (Surface), or a value of the placed thing
   applied to the selection (Multicolor colour, Shape variant). Six modes ignore digits.
2. **Paint has two models side by side**: Surface paints by clicking with a brush; Multicolor selects then types. The
   difference is invisible from the mode buttons.
3. **Selection exists only in the Value family, Multicolor and Shape**; in every other mode a click acts at once.
4. **Modifiers mean different things**: Shift and Ctrl are temporary Sudoku sub-modes, Alt is "secondary colours" in
   Multicolor and "rectangle" with a drag, Ctrl is undo/redo/select-all everywhere.
