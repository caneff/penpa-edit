# Where Penpa+ puts Sudoku corner marks (2026-11-16)

Read from `key_number` in `docs/js/class_p.js` (Sudoku mode, `case "2": // Corner mode`) and the corner and side points
of `Puzzle_square` in `docs/js/class_square.js`. Not checked live.

**Slots.** Each cell has 4 corner slots and 4 side slots in `numberS`. Corner slot 0 is top-left, 1 top-right,
2 bottom-left, 3 bottom-right. Side slot 0 is top, 1 right, 2 left, 3 bottom.

**Order.** A new mark goes in the next free slot, in the order typed: no sorting. The 1st to 4th marks fill
top-left, top-right, bottom-left, bottom-right; the 5th to 8th fill top, right, left, bottom (a cell holds 8).

Why the order looks odd:

1. **Typing order, not digit order.** Typing 7 then 2 puts 7 top-left and 2 top-right.
2. **Top-left is never skipped (changed in #140, Chris 2026-11-16).** Upstream skipped it in Solution mode on any puzzle whose
   given layer (`pu_q.numberS`) held a small number, such as killer cage totals: marks started top-right and a cell held 6.
   The fork removed that case, so every puzzle starts top-left and a cell holds 8; a mark may draw over a cage total.
3. **Deleting a mark repacks the rest.** The remaining marks are written back in order from the first slot, so marks
   after the deleted one move.
4. **One key, several cells, different corners.** With a multi-cell selection, each cell gets the digit in its own next
   free slot, so the same digit lands in different corners across the selection.
5. **The 5th mark onward is not clockwise.** Sides fill top, right, left, bottom.

Only square grids take corner marks (`grid_is_square()`).
