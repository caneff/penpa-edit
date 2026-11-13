# PROTOTYPE: solve UI variants

> **PROTOTYPE. Throwaway.** Lives only on the branch `prototype/solve-ui`, which never merges to `master`. Nothing here
> is a design decision, an engine API or production code.

**The question:** what should the fork's new desktop solve UI look like?

Eleven variants, A to K, each a radically different answer, render on Penpa+'s own solve page `docs/index.html`, gated by
a `?variant=` search param. With no param the page is unchanged. A floating switcher at the bottom cycles the variants
and picks sample puzzles. Desktop only.

## Run

```sh
npm run prototype
```

It serves `docs/` with node's own `http` module (no dependency) on `http://127.0.0.1:8765/` (or a free port if 8765 is
taken; `PORT=` and `HOST=` override) and prints one URL per variant with the first sample puzzle. Open them in Windows
Chrome: WSL2 forwards `localhost` / `127.0.0.1`. If forwarding does not reach it, run `HOST=0.0.0.0 npm run prototype`
and use the WSL address.

URL pattern: `http://127.0.0.1:8765/?variant=<K>#m=solve&p=...` where `#...` is any Penpa+ solve link's hash. Any
Penpa+ link works: paste its `#...` part after `?variant=K`.

## Files and ownership

| File | Owner |
|---|---|
| `variant-A.js`, `variant-A.css` | variant A's builder |
| `variant-B.js`, `variant-B.css` | variant B's builder |
| `variant-C.js`, `variant-C.css` | variant C's builder |
| `variant-D.js`, `variant-D.css` | variant D's builder |
| ... one pair per key, through `variant-K.js`, `variant-K.css` | that key's builder |
| everything else (`loader.js`, `engine-bridge.js`, `switcher.js`, `samples.js`, `serve.mjs`, this README, the one-line hook in `docs/index.html`) | the scaffold; do not edit from a variant |

**Variant K edits only `variant-K.js` and `variant-K.css`.** Nothing under `docs/js/`, `docs/css/` or `docs/index.html`.
If a variant needs something the bridge does not give, write it inside the variant file (it may read `pu` and the legacy
DOM directly as a last resort) and say so in the variant's header comment.

## How it loads

1. `docs/index.html` loads `loader.js` last. Without `?variant=` it returns at once.
2. With `?variant=K`, the loader hides the param from Penpa+'s `boot()` while boot reads the URL (boot treats any search
   string as the puzzle and only falls back to the hash when the search is empty, `general.js:29-32`), then puts it
   back. The address bar keeps `?variant=K#...`.
3. After `boot()` and its async `load()` finish, it loads `engine-bridge.js`, `samples.js`, `switcher.js`, then
   `variant-K.css` and `variant-K.js` (cache-busted, so a plain reload picks up edits), and calls `mount(ctx)`.

## The variant contract

`variant-K.js` is a classic script (no modules, no build step, no dependency) that registers:

```js
window.PrototypeVariants.K = {
    name: 'short name',   // shown in the switcher as "K (short name)"
    mount(ctx) { ... }    // called once, after the puzzle is on the board
};
```

`ctx`:

| Field | What |
|---|---|
| `ctx.key` | `'A'`..`'K'` |
| `ctx.bridge` | the engine bridge below (also `window.PrototypeBridge`) |
| `ctx.pu` | the live Penpa+ puzzle (a getter; prefer the bridge) |
| `ctx.canvas` | `#canvas`, the one canvas Penpa+ draws the board on |
| `ctx.board` | `#dvique`, the canvas's container |
| `ctx.legacyRoot` | `#proto-legacy-root`, a wrapper the scaffold puts around Penpa+'s `#header` and `#app-container` |
| `ctx.helpers.adoptBoard(container)` | move `#dvique` (and the canvas) into your container; returns it |
| `ctx.helpers.hideLegacy()` / `showLegacy()` | hide all legacy chrome but keep it in the DOM; legacy dialogs still open over it |
| `ctx.helpers.el(tag, attrs, children)` | tiny element builder; `on*` attrs become listeners |

Rules of the road:

- **Keep the legacy DOM in the document.** `main.js` and `general.js` look elements up by id all the time. Hide, move or
  restyle; never remove.
- **Do not scale the canvas with CSS** (`width`, `transform`, `zoom`): click hit-testing assumes 1 CSS px = 1 canvas px
  (`main.js:919-921`). Use `bridge.setCellSize(px)`. Moving the board anywhere is fine; the bridge patches the canvas's
  `offsetLeft`/`offsetTop` so hit-testing follows it.
- **Keyboard**: Penpa+ listens for keys on `document` (`main.js:84`) and handles every board key itself. A variant does
  not need its own key handler for digits, arrows or Delete. `bridge.sendKey()` sends a key through that handler.
- Penpa+ acts on `mousedown` on `document` by element id (`main.js:1057-1884`). A variant's buttons should have no id
  starting with `mo_`, `sub_`, `st_`, `rot_`, `combisub_`, `ms`, `tb_`, `sw_`, or any legacy id.
- Keep variant layers below `z-index: 1000` (legacy dialogs sit at 1000 once `hideLegacy()` runs; SweetAlert2 popups at
  1060; the switcher above everything).
- Scope your CSS: prefix classes with `proto-<k>-`, or scope under `html.proto-variant-K` (the loader adds that class).

## Engine bridge API (`ctx.bridge` / `window.PrototypeBridge`)

Each call wraps what the legacy UI does today; the source comments cite `docs/js/` file:line. Mode names are the
engine's: `surface`, `multicolor`, `line`, `lineE`, `wall`, `number`, `symbol` (Shape), `special`, `cage`, `combi`
(Composite), `sudoku`, `move`.

| Signature | Does |
|---|---|
| `getState() → {mode, submode, style, qa, mmode, gridtype, canUndo, canRedo, hasAnswerCheck, solved, timer}` | one snapshot for rendering |
| `getMode() → {mode, submode, style}` | current mode, sub-mode (string) and style (number) |
| `setMode(mode)` | switch mode, as the `mo_<mode>` radio does (`pu.mode_set`); restores that mode's last sub-mode and style |
| `setSubmode(value)` | switch sub-mode of the current mode (`pu.submode_check('sub_<mode><value>')`), e.g. Sudoku 1 Normal, 2 Corner, 3 Centre |
| `setStyle(value)` | switch style of the current mode (`pu.stylemode_check('st_<mode><value>')`) |
| `setComposite(name)` | pick a Composite tool, e.g. `'star'`, `'linex'` (`pu.subcombimode`) |
| `setShape(name)` | pick a Shape, e.g. `'circle_L'` (`pu.subsymbolmode`) |
| `listModes({all}?) → [{mode, label, hidden, inTabSet}]` | modes the legacy UI offers for this puzzle (grid type, Penpa Lite, solve mode); `all: true` includes hidden ones |
| `listSubmodes(mode?) → [{value, label, id}]` | sub-modes of a mode, from its legacy radios |
| `listStyles(mode?) → [{value, label, id}]` | styles of a mode; the legacy swatch is the element `<id>_lb` |
| `listComposite() → [{name, label}]` | Composite tools for this grid type |
| `tabSet() → string[]` | the link's Tab/Enter mode set, e.g. `["Surface", "Sudoku Normal"]` |
| `sendKey(key, {shift, ctrl, alt, code}?)` | send a key through Penpa+'s own key handler (digits, letters, `Delete`, arrows, ...) |
| `undo()` / `redo()` | as the Undo / Redo buttons |
| `history() → {position, length}` | undo history in steps (a step is what one `undo()` removes; Penpa+ undoes a line drag one segment at a time, so a 3-cell drag is 2 steps); `position` = steps undoable |
| `jumpTo(n)` | go to history step `n` (0 = empty board) by repeated undo/redo |
| `pointer(path, {button, ctrl, shift, alt, double}?)` | raw pointer gesture on the board as a real mouse: mousedown, mousemoves, mouseup on `#canvas`; `path` entries are point indices or `{x, y}` page pixels; one entry = click, more = drag; `button: 2` = right click |
| `getSelection() → {cells, cursor, rect}` | selected cells (`pu.selection` in Sudoku/multi Number, else the cursor `pu.cursol`) and their page-pixel bounding box `{left, top, right, bottom, width, height}` |
| `select(cells)` | set the selection |
| `pointToPage(index) → {x, y, type}` | board point to page pixels (type 0 = cell centre, 1 = vertex, 2/3 = edges) |
| `pageToPoint(pageX, pageY, types?) → index \| null` | page pixels to the nearest board point the current mode accepts (or of `types`), as a click picks it |
| `cellRect(index) → {left, top, right, bottom, width, height}` | a cell's page-pixel box |
| `genreTags() → string[]` | the link's genre tags (`pu.user_tags`), e.g. `["classic"]`; empty when the setter set none |
| `clear('mode' \| 'all')` | the legacy "erase selected mode" / "delete all" confirms |
| `check() → {hasAnswerCheck, solved}` | the answer check's verdict with no popup (Penpa+ itself checks on every redraw and shows Congratulations once) |
| `answerCheckInfo() → string \| null` | HTML describing what the check compares; null when the link has none |
| `getInfo() → {title, author, source, rules}` | puzzle metadata; `rules` is sanitized HTML with `<br>` |
| `getTimer() → {running, paused, text, seconds}` | the solve timer |
| `pauseTimer()` / `startTimer()` | as the Pause / Start buttons (pause also covers the board) |
| `getSettings() → {theme, displaySize, timerBar, conflictDetection, checkPencilMarks, sudokuNormalSize, sudokuCentreSize, starbattleDots, surfaceSecondColor, customColors, shortcutsEnabled, panelShown, language}` | solver settings, read-only |
| `setCellSize(px)` | board cell size, 12-90 (the Resize dialog's Apply) |
| `openSettings()` / `showRules()` | open the legacy Settings dialog / rules popup |
| `onChange(cb(state, reason)) → unsubscribe` | after any redraw, mode/sub-mode/style change, timer start/pause/reset or resize; at most once per frame |
| `onTimer(cb(timer)) → unsubscribe` | every timer tick |

Not in the bridge (use the legacy UI or `pu` directly, and note it): Share, Screenshot, I/O Sudoku, Edit Background,
Clone, the floating number panel, contest and replay links.

## Sample puzzles

In the switcher's picker; their hashes are in `samples.js`. Built on 2026-11-13 from `TESTING.md`'s puzz.link links,
imported on this page and exported as Penpa+ solve links, with a title, author and rules added.

| Sample | Family | Notes |
|---|---|---|
| 9x9 classic sudoku | Value | answer check on (numbers); a Tab set of Surface + Sudoku, so Penpa Lite shows two modes |
| 15x10 masyu | Path | Line mode; no answer check |
| 10x10 nurikabe | Paint | Surface mode; no answer check |
| Hex grid, size 4 | non-square | not a real puzzle: five givens on a hexagonal board, for layout; every mode shown |

<details>
<summary>Full links (variant A, default port)</summary>

- 9x9 classic sudoku (answer check):
  `http://127.0.0.1:8765/?variant=A#m=solve&p=zVb7b+JGEP6dv8JaqVKrWwXv2l4/pFNFyEONLjRpSNMEocgBB/swNmebhDrK/e03s15iG8hVPalSZVjmsft9M7OeXfLVNJ2vqAuP4VCdMngMR5dfx8SPrp5hVMSBp/VjP8+jiXZVLeytijDNPG25Ku/Ku4M4SuZa7i+WcaD9PDy+Gv42OD1YTH+hYVEsc6/bbczrLn+t2LsuPMyKXBEzO7JnwopMPmczyxBOyMHAl0ZozUxnxmfu3AjtSNCL2J8EWhEG2jSaRUWuMa1INVdLEzAH/iTUokQLnoLsby1Ln3/ifW2SxqtFovnJVDPWhvaQrg/o7ycn9NGP84Ce3X4+PJr3no97f3WtO8O4Hjx++Hx0ef15evMnu9SjbqYPYic5vzg6jD+clnfnYe8pOA7ERZ5Owjjwp355d3O2jpMTZxY+sv5Z2Hce/UTPvzhD9+nw8uPHzkhVctwZEUYo4fBlZPyVVFUgX6XZHXdeyj+8l/LeG41faXldi04tXnkvMA68F8Id4o1w1xALQF1QrTfVMEB1a9UEVbypptVaawpQ7TfVwskNFb31WstuEQkGqlmrHFT+ptqo1kQ2ItdrbQzDeFMdvUXkILJTq7i2RnYw/TpIt+1lOpajhmYMA6mZGcP5ddiM4fyajHEkb+Dxdj2ZrG8D32iXkJnNXGDHmNy3WzkOYStpacjxSI66HC05fpJzjmGHmQMALgTGAcV1KcckQIZfyjnUDmVuUW5ALVCGRuYWBI6yxSgXkCTKwqTchm1D2bYpdyE4lF1odx0SQXwH8HWFrwM+U/gM8PFVk1yAbyp8E/DxRZFcgC8UvgB83EiU4SjhboUPv8AFRZI4GL+ycwNkhcMBp5kX38wXICt8DvjNePC9lzLEbyheA3gNFafAOqi8BPAKxSuAt1kfoXgF8ArFK4C3mZdQvAJ4heIVwGsjL2zajdy6vhxNOQq5pTb2bqczgnixF5oPvpL/IwseUVer7BHOWDikqqNeG6TZwo8JnE8kT+P7vPLfB2t/UhCvOkabnpYtWS0egox4RbZSljhNl3AN7APYuFrGaJakWbDXhcZgOnsPCl17oB7SbIohNRzPfhy3U/my8rP24kmUTeK2qciilu5ncOe0LAu/CFuGB7+A6zQPo2UbKUi2aln47RD9ub/FtqjL8dohayK/cChxauJd4nplj5anXuvSoeUlXCbn3ubuwRtlRAjsPCWLVVxEcFumQKxscBrJ5RzE41q8kX6U+pWR6SAPlAziLYhVve4/VZYLb1QOKcEIDuVqFMkifYIUqghRn6SLB0hyRBplogY4VLgbBmit3o/kAVCbPFCs8kBpTx6Y3n+bhzt+rTZO/1dX/49dJ/94Pq1Vf6fZd1q8dm6bN43etn6n2RveffZ3+rrh3bbvNDEGu9vHYN3TymDd7mYw7TY0GHd6GmzvtDWibnc2RrXd3Ei1099I1WxxeBWr/+Bk3PkG&a=RZHdCQMxDIN36bMf4vh/ltL917iLFCgcfNSW5Ih+vz/5fx9dS/IjL1UGzMsSBVvqUJc0qNSryT7c17+3OOgSYNC3Uwy8eba5N6fe4s6Leda8b4N7tmA3xfY1H9PrOdmWkDh3zp0bh45necHuDPXB7Qj8isYueCgX3pGFlGTrHCiL3YvVi82bRdog6UBYJ+zNsmMYDitOInMKvmko51w//8XvAQ==`
- 15x10 masyu (Path):
  `http://127.0.0.1:8765/?variant=A#m=solve&p=7Vffb6M4EH7PX4H8dKe1GhsIBU6rU5r+0FbbXHtNt9egqHKIG2gAZzE0Waru3762SZsQ3H3Yu8cLymjyzfDZY/N5CP9akpxC3IMYQcuFCGJxOciFNnah0+upL9pco7hIqG9cEP6thP2yiFjuG8uyGlfjgyTOFgYn6TKhxm+jk+vRp+HZQTr7HUZFseR+t7uT113+mUqOLu51MerGiCATqU+8MJFjothRGA6R7YUm8mwPPSKMBIawZ5kePM7JyiAGj7O5GC9hbGkUUc7KeWSENEmEyYqc8gPjU2EsCeeUv8XpE82/GWGch7KWoswzg2XGNCHhYoNyg2QzY84MXuQknkfF271TVkRGRgU2ZWXO/2gkCZZVFBe0waL448wghZFQwmUW3TIcwL9OT+EDSTiF53ePR8eL/uqk/0+3N7asm+HDh8fjq5vH2e0XfIXibo6GiZtdXB4fJR/OqvFF1H+iJ9S55CyMBPeMVOPb83WSnbrz6AEPzqOB+0AyxL+6I+/p6Orjx06w2chJJwAmgOqLweQ7CFk6jcH3AIjdoWsArUnnufrbf67u/WDyAqubretu3Wv/WdihsljZO/8Z2Aj4gQlBvQr3nwHEEwhsR6C4hbo6tGfrGFysRfW5crQ26ulQT86hhWJk6mEtM8baojHWZ5uSu1U2NmUtbdjSc1uH+mztkmJL1t6G7Z4e1u4WtvVDqv3SwHrunnYXsGNpsx39kI6+ykM9yaF+SPVEtbNd/ZDqOWnB4tzSwlg7ExNrl8rEem71nLTmbZoabiG+kVAlrCxlj5VFyvaU/awEeqLsrbIDZW1lHZVzKHXd6QR23Qbeu0Sz+D/6esmz9LrMH0hIxWk6YOmScdEEgDhBAWfJPa9j93RNwgL49Vm/G2lgWZlOad6AZHOTx7KG4TXUAON5xnKqDUmQzubvUcmQhmrK8tnenFYkSZq1qPeIBlQ/nQ2oyOPGb5LnbNVAUlJEDWBKCvHOwaN42WQS/b05gYI0p0gWZG+0dLscLx2wBuobWNCEtmx3nl/1YXXmN1ojrK5Ev7vwNx1S9rwA1DJMy6SIQ5YwMe4GEyILxF3QFO7J1r1VcekNahAj4Q83vnDvhNvQeHXpB9UIAjmBI3W3dEHKnkQF6jb1u56UAHZWSfRuUW45Y4tyk6oOh/4vlCGYXsuQbl2G9DRlyOr+dRlvbx97FXiTl3rH0C+/lvyH5+N6o2yW/0Tc2+A+rJG4QH+i8p2oDn9H0DvRfbylXjnZtoAFqtGwQPdlLKC2kgXYErPA3tGzZN2XtJzVvqrlUC1hy6F2tR0A9e9CHMEK+AE=`
- 10x10 nurikabe (Paint):
  `http://127.0.0.1:8765/?variant=A#m=solve&p=1VZtb+I4EP7Or7AsnXSn9ZWYAE0jrU6UvuiqLdde6fVKhCqTmCbFsdm8tGyq7m/fsZMWEuhKd6v7cEo8zDwzHs84fizSzzlLOKGWfm2HwC88XeqY0XH6ZljVM44ywV00ypNowWacDPIsVImLlnkxKSZ7IpILlLJ4KTj6eXx8Nf59dLoXB7+QMMuWqdtub8S1l7/JKk2bWuZddHP6sB/ZSf8LffqV0tiWHXIVsoAjnwuRolQhzvwQyTye8QRFKYokYhLlMtVRASCCyQCpOcpClqGYyS/l1J86w8qZokAhqTKUqdwPNV7NLZfwlZTczzSuM0mFOquOXokJUUXukT9OTsiciZSTs9uHw6PF4Ol48He7N7Ht69H8w8PR5fVDcPMXvbSidmKNhCPPL44OxYfTYnIeDh75Me9fpMoPBWcBKyY3ZyshT5z7cE6HZ+HQmTNppZ+d8cHj4eXHjy2v2vxpy8MUE9yBQfH0K/ZVPIvwVw/PxFJhYk9bz8Wf7nNx53rTF1Jcr1VnrV65zyBH7jO2Lex6+mPrbATbfTC7b2a/7u33wNx/M/dtMO0380AH999MSp3aZNrtans9nfb0Yuv51KTvVDbUR02Vt0aOoXBS2EYeGWkZ2TPyk4k5NvLGyKGRXSP7JmZft95qeXZ5uOtP7/+H6ZNwlSdz5nM4C0MVL1UaZRzDAcCpEndp6bvjK+Zn2C1P6qanhpVkqkFCqSVwdFeGV1cNjO6lSvhOlwZ5cP9eKu3akWqmkqBR0xMQsN6LublqkB8lvqhDWRLVbJYk6qmGxCwLa8CMZXDLpWG0rGfisrGZGauXyBassVq83o6XFl5hM+Dgd0hXs/XALQakOHVrxCbFJdD13K34rSnrYQxfneA4F1nkK6Fg3QoDApjZHVCP1+qN8WttWILUAn1U6aDeglpu192nErlwvWJMsC7g0MzWKo7VI3RQFqjtsigANnYJrh5oNw/UIq9CqSbx4F+0AZle29Bq2YbWdrShu/vxNqq7s9HAwfSl/GDWP7pU/6Ora1URWyXf4fba2YR3MBzQ75B8w7sLf4fPG94mvkVeXew2fwHdQWFAmywGaJvIAG5xGbB36KyzNhmtq2qSWi+1xWu91Ca1Pfz6XwYuYYN9Aw==`
- Hex grid, size 4 (non-square):
  `http://127.0.0.1:8765/?variant=A#m=solve&p=tVTfb9o6FH7nr7As3aeZLb/oQqQ9UNruqlq5ZdBxS4QqkzgkrYmZkwAN6v72HTswGqDTvQ+Tk6Pj7/j8cs6XmK2JA8t2iUFMWLYBG3hd/RjbNUxyzjz0N1ujmUxCxOmzKHKU0fmCM9Ip8lhIDy2kyEX+vGAoC2gUCR4S0hM5okgyytGiKMflWMWhCPLSmUgBnQoqQ7RK8hjgiK3QLFmyNPvL6qJISBTELHhK0hkYt0lFCnoq0mb2vaCS6YLeo0FMQ6acQklXiCcpyxC4szRnEqXFfMpkhiLJGH9+T/65uiIR5Rkj1/eP5xdPndVl598PrbFt3/Wid48X/bvHcPTN7BvJB2n0uJve3F6c83efy/FN3FmyS3Z2m4kg5oyGtByPrtc8vXJncWR2r+OuG9HUyL67w/byvP/pU8M3Jg0fm5hgC14TT36Ugx8+xsScNDblV29TPnj+5IWUd3vV3asDbwOy522w08Kejx1w1GEIbn1UAETdAa6jAEj1C9AnWnug7SrA3gEQ2dTx77UcQkpS2lpeaGlo2dLyiz5zqeVIy66WjpZn+sxHVXSj4cPsNE1HTZRFLGKqyWo6esJAMUGxSSWbbXVEHwDLmVu5NAGwwGiBCaLYBHDwgKCWtsMG/NSCu4VrxJngD1khIxqwBxitIMde9YFfW2pYNRM1iAuxUJNzIsLOVAOTWSokO2lSIAtnb4VSphOhpkKGBzWtKOf1XvTU16AgkQGvQ7lMansqpVjVkDnN4xowpTmQPIuTRT0SUKheQE7rJdInepBtvr+OlwZeY/36NkyCo2a+7ZV9Un6uRnXHClL2YehvvLKnZr7iB8HzgudJILiAlFsM5lA7WqBe7tWRtiutu+WAAXrvFx++qhT3sK1u6+FLFezW88shwcp4riMoFc/FEhqo6lP7QMyn0KKP1Ydeb8GsCMVTsWOc4lKn6mDwHzuw9x0otepAaSc6UI39uerbk5fqQxn/65f0h34f6y2hhfwNp/fGQ/gEswH9DblfWU/hb/D4lfUQPyKtKvaYt4CeoC6gh+wF6JjAAB5xGLA3aKyiHjJZVXVIZpXqiM8q1WtKwy9Xaz8B`

</details>

## The switcher

The black-and-yellow dashed pill at the bottom is scaffolding, not part of any design. Arrows (or **Alt+Left /
Alt+Right**, ignored while typing in a field) cycle A to K with wrap; the picker loads a sample and keeps the variant.
Plain arrows are left to the board, which moves its selection with them.
