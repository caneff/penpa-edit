# How well the recordings guard the engine: handler coverage and planted bugs

Measured for #32 (wayfinder map #6) on 2026-11-15 with `npm run measure` (`live/measure.mjs`), which replays every
recording under `live/recordings/` on the engine driver against its expected file, with Chromium's JS coverage on, then
hunts each planted bug of `live/plants.mjs`. Terms (recording, checkpoint, plant, safety net) are `GLOSSARY.md`'s. The
design this answers is `research/agentic-legacy-migration.md` § How it gates agent PRs: coverage of `class_p.js`'s
`mouse_*` and `key_*` handlers first, then a planted-bug table modelled on sudokupad-scripts' `fuzz:plants`
(`~/src/sudokupad-scripts/docs/research/fuzz-planted-bugs.md`).

## The bar, and the result

The bar set on the map: every handler a solve mode can reach is called by some recording, and every plant taken from the
audit is caught. Other plants are reported, not failing. **Met**: all 20 handlers a solve mode reaches are called, all 5
audit plants are caught, and all 26 plants are caught (final run below).

## Method

- **Coverage**: `replay(..., { coverage: true })` starts Playwright's `page.coverage.startJSCoverage()` once the
  recording's page has loaded, so it counts only what the steps call, and reads each handler's call count off V8's
  function ranges for `class_p.js`. The handlers are every method of `class_p.js` named `mouse_*` or `key_*` (21);
  `key_arrow` lives in the grid classes and is out of the ticket's scope.
- **One handler no solve mode reaches**, so it is not part of the bar: `mouse_board`, since solve mode hides Board
  (`set_solvemode` in `general.js`) and a solve link's saved mode is not restored when it is Board (`load` in
  `general.js` skips `board`, `cage` and `special`). `mouse_number` looked unreachable
  too: `mouseevent` calls it only in Number sub-mode 2, Arrow, whose button `set_solvemode` hides (sub-modes 3 and 9 go
  to `mouse_numberS`, the rest to `mouse_sudoku`, by `number_multi_enabled`). But a solve link opens in the mode its
  solve layer was saved in, Arrow included, with the button still hidden (the review's P5, checked on a page:
  `pu.mode.pu_a.number` reads `["2",2,"R"]` after load). So it is in the bar, and `value/number-arrow-link` records on
  such a link.
- **Plants**: each a one-line find-and-replace on a file of `docs/js/`, served in its place (`served: true` and a
  `context.route`), never written to disk. A handler plant's line is searched for in its method alone. A plant is refused
  if its line is not there exactly once or the planted file does not parse (`node:vm`'s `Script`). One plant per
  solve-reachable handler, a second in `key_number` (Number and Multicolor take digits in different ways), and five that
  each undo one audit fix in one line: C1 (`class_p.js`), C4 (`general.js`), C7, C13 and C14 (`conflicts.js`). Those
  five are the audit findings the step vocabulary reaches (`research/agentic-legacy-migration.md` § Corpus, Tier D):
  every other audit fix that is one line to undo (C3's Source escape, C5's constraint list, C9's sort comparators) acts
  on an input no recording can hold, a link being made, the constraint dropdown or the clipboard, so its plant would be
  missed by construction and say nothing about the recordings. Their live tests stay their net.
- **Caught** means a replay with the plant in differs from its recording's expected file at a checkpoint, fails its
  duplicate-link round trip or its final board, throws at a step, or raises a page error or `console.error` on the
  replay's page. Any other throw (a page that never loads, a closed browser) stops the hunt as an **error**, never a
  catch, and a plant whose line is gone from its file is **not applied**. A handler plant is hunted only over the recordings that
  called its handler, since no other replay runs the planted line; any other plant over every recording, an audit
  plant's own `audit-<id>-*` recordings first. A hunt stops at its first catch.
- 2 replays at once on the shared box.

## What the measurement changed

The first coverage pass (257 recordings, 388 s) found three handlers no recording called: `mouse_number` (above),
`key_shiftspace` and `key_backspace`. The tier A gesture set presses no clearing key,
so `live/generate-recordings.mjs` now adds a `clear keys` recording in Number Normal, Number 1/4, Shape and Multicolor:
click a cell, `9`, `2`, Backspace, `3`, Delete, `4`, Ctrl+Space. They are new recordings rather than new gestures in the
shared set, which would have rewritten all 250 generated expected files.

The first plant run caught 23 of 26, and two of its results were wrong:

- `multicolor-delete-keeps-colour` was "caught" by a 30 s boot timeout: deleting `this.remove_value(...)` left a
  braceless `if` with no body, so `class_p.js` did not parse. `plantIn` now refuses a plant whose file does not parse,
  and the plant became `if (false)`.
- The first Multicolor `key_number` plant (drop `this.mode[...].multicolor[1] = key`) was an equivalent mutant on every
  real input path: `main.js` calls `stylemode_check('st_surface' + key)` with the same colour just before
  `key_number`, so the recorded mode step restores what the plant dropped. It was replaced by one on the line that adds
  the colour (`if (!remove)`).
- `number-cursor-off-by-one` was in `mouse_number`, then thought unreachable; dropped, and restored once the review
  showed a solve link reaches it.

The second run caught 23 of 25 and missed two plants, each a gesture no recording made: Delete in Multicolor
(`multicolor-delete-keeps-colour`) and a digit after a 9 in Number (`number-nine-takes-no-second-digit`, the gesture
set types 1 to 4 only). The Multicolor `clear keys` recording and the leading `9` close both. The review wave then
showed `mouse_number` reachable, and the third run, at `e7274e1`, caught 25 of 25 with it still out of the bar.

## Final run

At `3e18d12`, 2026-11-15, `npm run measure` exit 0. Under "replays", the replays the hunt had started when it stopped,
both lanes counted.

```
262 recordings, measured in 631.2 s.
```

| handler | solve mode reaches it | calls | recordings that call it |
| --- | --- | --- | --- |
| `key_number` | yes | 1091 | 260 |
| `key_space` | yes | 12 | 12 |
| `key_shiftspace` | yes | 4 | 4 |
| `key_backspace` | yes | 4 | 4 |
| `mouse_surface` | yes | 1158 | 38 |
| `mouse_line` | yes | 246 | 8 |
| `mouse_linefree` | yes | 30 | 1 |
| `mouse_lineX` | yes | 31 | 1 |
| `mouse_lineE` | yes | 327 | 10 |
| `mouse_lineEfree` | yes | 32 | 1 |
| `mouse_lineEX` | yes | 32 | 1 |
| `mouse_wall` | yes | 157 | 5 |
| `mouse_number` | yes | 32 | 1 |
| `mouse_numberS` | yes | 70 | 3 |
| `mouse_sudoku` | yes | 1580 | 59 |
| `mouse_symbol` | yes | 310 | 16 |
| `mouse_cage` | yes | 186 | 6 |
| `mouse_special` | yes | 320 | 10 |
| `mouse_board` | no: Board is hidden in solve mode (`set_solvemode` in `general.js`) | 0 | 0 |
| `mouse_move` | yes | 192 | 6 |
| `mouse_combi` | yes | 3439 | 108 |

| plant | in | audit | result | caught by | replays |
| --- | --- | --- | --- | --- | --- |
| `surface-right-click-paints-left` | `mouse_surface` |  | caught | `genre/aqre` | 2 |
| `line-drag-draws-nothing` | `mouse_line` |  | caught | `genre/tonttiraja` | 2 |
| `line-free-release-draws-nothing` | `mouse_linefree` |  | caught | `path/line-free` | 1 |
| `line-helper-on-right-click` | `mouse_lineX` |  | caught | `path/line-helper-x` | 1 |
| `edge-drag-draws-nothing` | `mouse_lineE` |  | caught | `genre/pencils` | 2 |
| `edge-free-release-draws-nothing` | `mouse_lineEfree` |  | caught | `path/linee-free` | 1 |
| `edge-helper-on-right-click` | `mouse_lineEX` |  | caught | `path/linee-helper-x` | 1 |
| `wall-drag-draws-nothing` | `mouse_wall` |  | caught | `genre/tatebo-yokobo` | 2 |
| `number-cursor-off-by-one` | `mouse_number` |  | caught | `value/number-arrow-link` | 1 |
| `number-corner-cursor-off-by-one` | `mouse_numberS` |  | caught | `value/number-sub-3-clear-keys` | 2 |
| `sudoku-click-keeps-selection` | `mouse_sudoku` |  | caught | `genre/box` | 2 |
| `shape-cursor-off-by-one` | `mouse_symbol` |  | caught | `genre/hakoiri-masashi` | 2 |
| `cage-click-adds-no-cell` | `mouse_cage` |  | caught | `grid/hex-cage` | 2 |
| `special-drag-extends-nothing` | `mouse_special` |  | caught | `grid/hex-special` | 2 |
| `move-drag-moves-nothing` | `mouse_move` |  | caught | `grid/hex-move` | 2 |
| `composite-black-dot-as-black-white` | `mouse_combi` |  | caught | `genre-tool/combi-blpo` | 6 |
| `multicolor-digit-paints-nothing` | `key_number` |  | caught | `grid/hex-multicolor` | 175 |
| `number-nine-takes-no-second-digit` | `key_number` |  | caught | `value/number-normal-clear-keys` | 254 |
| `multicolor-delete-keeps-colour` | `key_space` |  | caught | `paint/multicolor-clear-keys` | 9 |
| `ctrl-space-keeps-number` | `key_shiftspace` |  | caught | `value/number-normal-clear-keys` | 4 |
| `backspace-corner-drops-two` | `key_backspace` |  | caught | `value/number-sub-3-clear-keys` | 4 |
| `or-answer-empty-category-solves` | `class_p.js` | C1 | caught | `paint/audit-c1-or-empty-category` | 2 |
| `tracking-parameter-hides-link` | `general.js` | C4 | caught | `paint/audit-c4-tracking-parameter` | 2 |
| `alphabet-box-check-throws-on-digit` | `conflicts.js` | C7 | caught | `value/audit-c7-alphabet-digit` | 2 |
| `consecutive-every-symbol-a-bar` | `conflicts.js` | C13 | caught | `value/audit-c13-consecutive-inequality` | 3 |
| `sudoku-conflicts-only-on-9x9` | `conflicts.js` | C14 | caught | `value/audit-c14-small-sudoku-conflict` | 3 |

26 of 26 plants caught.
Handlers a solve mode reaches that no recording calls: none.
Audit plants missed: none.

## Caveats

- Plants written by the harness's author favour what the harness looks for, the caveat sudokupad-scripts' run names; the
  five audit plants are the fairer half. Each was caught at its own `audit-*` recording at the step the bug shows.
- A catch at a recording's first checkpoint (C1, C4) is a different board on load, not a step: those two plants change
  what the answer check or the boot does before any input.
- A hunt stops at its first catch, so it says the corpus notices a plant, not how many recordings would. 18 of the 21
  handler plants were caught within 6 replays and the Multicolor Delete plant in 9; the two `key_number` plants took
  175 and 254, since only the Multicolor and `clear keys` recordings among the 260 that call `key_number` reach their
  lines. One run per plant, no seeds: the replay is
  deterministic (`research/replay-determinism-2026-11.md`).
- `mouse_combi` dispatches to about 25 `re_combi_*` tools; one plant (Black/dot) stands for all of them. Coverage of the
  tools themselves was not measured.
