# Grid shapes and board coordinates (2026-11-21)

Read from `docs/js/class_*.js`, `docs/js/engine_bridge.js` and `live/gallery-puzzles.mjs`. Nothing was run, and no grid but the gallery's hex puzzle was opened (Chris says it shows the problem, #350).

## Grid classes

| Class (`gridtype`) | File | Coordinates today |
|---|---|---|
| `Puzzle_square` (`square`, `kakuro`, `sudoku`; `grid_is_square()`) | `class_square.js` | Numbers per row and column, from `getGridAxes()`; #348 numbers the framed grid only. |
| `Puzzle_hex` (`hex`) | `class_hex.js` | Bands: letters across the bounding box, numbers down it, about 1.5 cells wide (#250). |
| `Puzzle_tri` (`tri`) | `class_tri.js` | Bands. |
| `Puzzle_pyramid` (`pyramid`) | `class_pyramid.js` | Bands. |
| `Puzzle_truncated_square` and its subclasses (`iso`, `tetrakis_square`, `snub_square`, `cairo_pentagonal`, `rhombitrihexagonal`, `deltoidal_trihexagonal`) | `class_uniform.js` | Bands. |

`getGridAxes()` returns null unless `pu.grid_is_square()`, and `drawCoordinates()` in `docs/ui/desk.js` then calls `bandLabels(engine.getGridArea())`.

## Hex

- The cell centres sit on a lattice of `n = nx * 3 + 1` points per side. Row `j` is shifted by half a cell when `j` is odd, and rows are `size * sqrt(3) / 2` apart. That is a pointy-top hex layout, so a row of hexagons is the cells that share one y.
- Chris's ruling (#350): one number per row of hexagons. Rows can be found by grouping the grid's cell centres by y, which is the same data `getGridArea()` already reads (`pu.centerlist`).
- Open: whether the row number goes at the left edge at that row's y, which zigzags by half a cell between odd and even rows, or in a straight gutter.

## Not yet decided

- Ruled after this note (#350): `hex`, `tri`, `pyramid` and `truncated_square` get one number per row of cells (rows grouped by the middle of each cell's box) with letters across; the other tilings keep bands. The list is `ROW_NUMBERED_GRIDS` in `engine_bridge.js`.
