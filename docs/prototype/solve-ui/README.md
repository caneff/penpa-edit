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

In the switcher's picker; their hashes are in `samples.js`. The user judges the variants on genres other than sudoku,
so eleven of the twelve are real Penpa+ solve links from Logic Masters Deutschland, picked in
`research/lmd-penpa-sample-links.md` (on `master`). Every one has an answer check. Each link's data is unchanged: title,
author and rules are the setter's own (and so is the empty source field, set only on 000Q8D).

Ten of those links carry their data as a query (`?m=solve&p=...&a=...`). The picker stores every sample in hash form,
the same parameters moved after `#`, because `?variant=K` occupies the query and `boot()` reads either the same way
(`general.js:29-32`). On 2026-11-13 each hash form booted to the same puzzle as its original link in headless Chromium
(same `pu.solution`, grid type, starting mode, visible modes, canvas size and title; no page errors). To add an LMD link
that uses `?`, swap its `?` for `#`.

| Sample | LMD | Author | Modes shown in solve |
|---|---|---|---|
| Slitherlink: Moore Slitherlink | [000JAQ](https://logic-masters.de/Raetselportal/Raetsel/zeigen.php?id=000JAQ) | Nell Gwyn | Line Edge, Composite only; starts on Composite |
| Masyu: Masyu on Ice | [000THT](https://logic-masters.de/Raetselportal/Raetsel/zeigen.php?id=000THT) | AllesUgo | all 12; starts on Line. The link's own title reads "Maysu on Ice" |
| Yajilin: Zodiac Project: Kyklos | [000KCF](https://logic-masters.de/Raetselportal/Raetsel/zeigen.php?id=000KCF) | Shintaro Fushida-Hardy | all 12; starts on Surface |
| Nurikabe: Wet Assignment of Cells Puzzle | [000Q8D](https://logic-masters.de/Raetselportal/Raetsel/zeigen.php?id=000Q8D) | ChinStrap | all 12; starts on Surface. Chris's own; the only one already a `#` link |
| Yin-Yang: Yin-Yawake | [000MYT](https://logic-masters.de/Raetselportal/Raetsel/zeigen.php?id=000MYT) | webato | all 12; starts on Composite |
| Star Battle: Beyond the Triple Limit | [000T39](https://logic-masters.de/Raetselportal/Raetsel/zeigen.php?id=000T39) | Jaap van Diermen | all 12; starts on Composite |
| Galaxies: The Aqua Galaxy | [000EUI](https://logic-masters.de/Raetselportal/Raetsel/zeigen.php?id=000EUI) | Math Pesto | Surface, Line, Line Edge, Sudoku; starts on Sudoku |
| Fillomino: Valor Comun | [000TM7](https://logic-masters.de/Raetselportal/Raetsel/zeigen.php?id=000TM7) | Justalilguy | all 12; starts on Line Edge |
| Akari: Statue Gallery Akari | [000JQM](https://logic-masters.de/Raetselportal/Raetsel/zeigen.php?id=000JQM) | blotwell | all 12; starts on Composite |
| Battleships: Sail the Seven Seas | [000IFY](https://logic-masters.de/Raetselportal/Raetsel/zeigen.php?id=000IFY) | Wisteria Fall | all 12; starts on Shape |
| Hex: Gemstone, hexagonal Akari RGB | [000G7N](https://logic-masters.de/Raetselportal/Raetsel/zeigen.php?id=000G7N) | Wisteria Fall | all 12; starts on Number; hex grid |
| Sudoku: 9x9 classic sudoku | (puzz.link, `TESTING.md`) | | Surface, Sudoku (a Tab set of two, so Penpa Lite shows two modes); starts on Sudoku |

"All 12" is Surface, Multicolor, Line, Line Edge, Wall, Number, Shape, Special, Cage, Composite, Sudoku, Move.

<details>
<summary>Full links (variant A, default port)</summary>

- Slitherlink: Moore Slitherlink (LMD 000JAQ):
  `http://127.0.0.1:8765/?variant=A#m=solve&p=7VVNb9s4EL37VxAE9lJwC1GSLVu3bD56Sb3tJkURCEZAy0wsRBKzlJSkMtLf3uFIqUjJeyj2sJeFrMHokXwzHPMNq78boSXjvvkFS+YxDk+4CvENojm+Xv9cZ3UuY/JRKS3JVZ7Ve6nzrHxgJ029Vzoma5nn5MPzt5Kxd+RMi2ciSJWV97kkpSp/32pRpnv4JmmuKrkjuVKPRGjVlDsCZGSr9E7qiqg7UqlCkhT4qve/+WfvyAkpm2IrNclKIDUDJIV1dYUL+zFYJ3f3siKfLr9cjQaepK6zFMZ+xhN1x4MelIE8ZVVWQ1rbb7jWZPee/Xlxwe5EXslZ0tdhM0uoTxnl8Pp0852mqthm9HtCTfAXQOlmdmj/ig/tbZxsXln7ZXCXg3sVH8Cu4wMNFjRO6JxC7YF1w2gQGSAagNA3QDgAc28McAMsLCAYccxXoyiLMUeEgDUjwrCw2TdgiaTBAKwQsDi4hyTWGu7h9qBcPxEejnLjwTgXHmBsZ844OO8KZzMHywkPbtsqDA+xVJ6FLOZj5gX+AzZzhKts5mjCvJzwLMdz/K4+VpF9D/dlVcz3sD5WLJ/jKovZ51gfK0Ofu9HhcHE8YjdoL9D6aK/hBLI2QHuG1kM7R3uJc87RfkV7ijZEu8A5kTnDs1kShNgyps/8f9w8plmcQ1sga6ULkUNzOFXFozKNxnQJWqn8tmr0nUgljbHPMMS6xuVAph9Bu3XnZfcldOOjQwY0HYnGtW6c6V2fdSY/izx3gO5qcKA002nuQrXOnG+htXp2kELUewfYihqukWqfPbpMsqzdBGrhpigexChaMWz5dUZfKL5JYK4w04FXcfuZtR86bb21a9Z+hhb8MW7XpgMnFNSCRx6l5IN7Prhfcdx4p73UPPDXvQ/uDbhdVW4vO+RTnLTX5gZg7R+42ri0UE+QKC7D7+7GAMAqRjdSNTv10Lwp22j4BNPtlxzJORhyNm6Xs/GO5Gy28q9zHm65UbqrzWv3N/Bfu/7+g8b10ktP6aPqA/iIAAE9KrQe77Tm4hNZmYBTZQF6RFyAjvUF0FRiAE5UBtg/CM2wjrVmshrLzYSaKM6EskWXbGY/AA==&a=RVTBje0wEOplzznEBsdxLavffxsLGewvRQKNZoBEvPf7++/y89Mnrz7H1X6u4usOH5o/4Y/4DJ/aQfir+frPF8PX1d/oCPvbwpt4D+/i0RH2FR3595V9Ie74Lu1vX3HcbzgvtHgtZV7JLI62dZR/bZ2p+dZZ4vXuuLV/1+3He916hl6ZnQW9bu2PuzIb0aOjLNvXPujZac65d8RRmdGk3yrbxxEvzYB4KQuQHWU5Gbp0tq85o9mdee+LM5qagftWmZlbZQGSWXgyyB9Mfvlj5FY+YPaFR1/aYHXAePSlgSdcGniiObQz9lx8Jr9mmNEf+s5j74uro8WtmX0h0lU81s+Oefrp2ckg/+MlH8zkF+KtXtkH+S1YG+m/Eep6ceeJ/qudNzvivKOp2dGUHnfH3Ft1dHOmw54x/bEG7/rmRrbyovq5dT6erlI93DofTzesx1Z5jEz/jUw/qb6xVc6Pp3ueHV/5MD20NtWt4nrfdIDqGHt0zNM3z46XtJleEXp3JKf5SH7NiOgLOaIvfyL6QmLr6H3TfyNHbtXPk818JL9yMV01Ml018sn3VMaTR/5M/41Mh+1zNNXDc2ueTnqX6ZuR6baR6Z6RM/pCpudG5v/ZWJr15+3n3x8=`
- Masyu: Masyu on Ice (LMD 000THT):
  `http://127.0.0.1:8765/?variant=A#m=solve&p=zVXfT+M4EH7vX2FZ2qf17eYHhTTSPpQWVouAhVs4DqIKuYnbBNx4104KBLF/+47tdNskBd3DnXRKa0++GY+/cf1N1Y+SSkYG8PgBcYgLjx845hvs6I9TPxdZwVmITuiTKpHI0ZeYkWFZpEKGaMg5U5dzQchY0gdEERfiO5o+oVjkOYuLLJ+jImUoZnnBpEJihpRYMCQkrJ+LnHL+hGhyR3UARHGuIJ4WaJmprFCILZmEZJmMOfuALiCT2WBRqgIVpcw1H4qmnMb3dRSieWL9uahjsrzmoLPDApbBq0QqSzo5f68xeR/SrIB1rbyrnMCSMwqAyKGg2et7vPPG8BkZl0ppwhJgXEJGCQvgBOAdZ3G9+ANGXyH96vWdNzKJuxS1R3P67c0UolMgWggUS6EUggNkfLatxE2/ZpuL/I81A/L18JDMKFeMHF3f7Y/vhw8Hw78/9m98//J09v5ufH55l1z95Z472UfpnPIgPzkb7/P3n6ubk3S4ZAds90yJOIXTSWh1c3X0yPPDYJ7O3NFROgpmNHfUj+BisNw///SpF9X3bNKLsIsJ9uDr4snP6vinAfxJ77n6M3yubsNo8kKqy7UZrM1v4TP2d3DYJ9jv22nXTDt7dgrsNDDTrmMn106emfbsFFhfYH2BzTmwyVzHpnE9G+R6vp19u9Y1mwKd0/AZRteM10CtD3jkEWzv0u0xJu6E4D5w66J7kLuLDqCqyO2gwGdLLFTZRV1Hw50Urgvc29FA+wIOllS+GcdmdMzYN+OxKe3AjFdmHJlxx4y7JmZP/zS9XuQFprtsPv3/FwJ3D24ZVoLfqlLOoBvdskcaFzi0Mtj0NLC8XEyZbEBaaTzLt2VYuXBYyLLGsnkuJFt7WuEsmb+WSbsaoE01FTJpUXqAJtMsxTT/BmR//QZUyKzxTqUUDw1kQYu0AUxpAX8WKs2+NzNBd28SKGiTIr2nrd0W6+N46eFHbL6RTzyyozvCIKyGpPocNpoGqc6hJZyE1TfdESKMSR9u+KLkRRYLLmBLjcGth/trFnpgHqzNK+PX1siCrgP2aW2DeQ1mQz7VWRhVFwTrvffNam3ihVgCectNv8diMYXyIrxxQNDZoNIyEfdlHWp0N7QVHK8q0Bp9owJIsqpAm7YCbW2pQBf231YwmLzYH8v5h0272yv/xdbzWGtayDdkvXa24S3iBvQNfW94t+GvaHnD28Y7wtVku9oFdIt8AW0rGKCuiAHs6BiwV6Sss7bVrFm1Ba236mhab7Up62jS+wU=&a=RZLRDYQwDEN34TsfTUNoOwti/zWwcSqkk/xkErvQu+/H7sNbM29ufhgY6mfxBV7Fw7xj7mN4vYsd6vFzz2J4O4cZe5faq4sctUtvZzIjppjPo3KoUfnUwPk+hgbO9zG0dqNZqAl0qgfGqTQYqX0Yqe0EKR90lZd7DkOpZEjqu0CGTo3xqXcczYZ6QVO9MGoOMsrrNtUGY6oDEUtPsbjKS1vqxdBSL4d4PUS8D29HuJQIqW0KL0y4anDsSObx/g/8E/7f8wI=`
- Yajilin: Zodiac Project: Kyklos (LMD 000KCF):
  `http://127.0.0.1:8765/?variant=A#m=solve&p=3VbbbuM2EH33VxACFkkArRHZsZPoLc2lBZq22ybFIhWMgJYYi4ksphQVrxVkv33PjOS15cti+7AvhSxqdGY0nAt56OLfUlrlBwH9+if+oQ/JPxoM+Q6CHt+HzXWrXaZC8Y9JtIzFB2seVexC8ev8KTOFf1a61NhQ3KQ6d9IacVUWqU7k+1+kTea+fycfdaZz8SKtlrkT+7NUWSWKVCYqEbHKskLEMhfOlHF6EAqXKjGxGiqTF7pwhTAPAK1Sws2fFb/yV6HYi7NS1S9773rnYm/VKSMyT8ReZsxzg3XFnSnFTGeZKAs4xFxLHwhBJMopO9V5O8CFq8TKmZCCHSIkU05SIeHLqqnUuc4ntXlX3MJxbWXli4JrY1GliclhPf/6KU+vcsy4zIrnmcq5yI0TYyvzOMXHIramKIR2hcoe4H5m2gVEN8VEv6i8+653gd+FLh4N+sHZoVLPmYzrdBM9gRdxSMmeCPSFQISuMJmZ5avlmGmXIgxk96ykQ1aXEsGwAzSnzOHGIRCHxk8wx4O2haNKQa2hIr/ldKws5daKtplV6UnqRE6PsSntSvluFJqftH0542T2DY/UB50nOpYOcKItFqnGEuqK/dsUPjhickaFNePC2TImy/EcJZ8LgzlQZnh7z8use1BX8oqKn2HtujnFs1Ieqjn54nWaYE0nTUyL1YJVzU1crKWu/8fVlf8gs0J1omZzjTqRF3i+18MdeKPP1c3nyPP83qjzWv0Vvlb3YTR686u/l+LJUrwJX73BwAuxV71h8zwZ1s/TfvMkHI/T+jXonTTCUa8RBkeNMCQEz+OAAPj/PXzFGPB418wVLSJvrmDke9Ji6dxzOz0GKBgyDJhZFqluMaRov8uQ0llM/dV4qyESXXj8ZoxciSha2BEBQt5qSaVa5s12Oyyplqth7syHi7zqk+9NS1T+iuvf4/EWjferPo8XPB7yOODxmm0uefzI4zmPRzwO2eaYlk6nE/XB8Vuuwf8XxVbDrvIKk90XpX0AIXohb0afsZpZWhAxOI4u2IEsGkxPcmPVUrNmrpJJG6ztx8aCIVqKGQirBdSHcguKtY2zNuSsbr3zemkhU+nSFjCWDgc4DuXntiecPO0AcHy3fT+B99q+lzm/dbxPHt9Rn/48EGOdhtWZX/0ctjjNr/4EZf0WVjfEWMRuIBk7Ge8Hx8e+CI4CDMHwgAyv6y97EC+X4kf+iKTzGgywUUBOtQzxDuL6Dqs+hFF163vk9id2QKI3NS9IoI6P3mMzHSPFyFspUq0pysQ8lY0tb8SztTQooibi/jJiEuuISdoSMX1GEdfNvb/+AeGejt7q9gT/5RihpkjuCjUFPfGDA3gnMt+hIvreoSLC3qUCRe9QMSnv0hEN79IR8e7SEdVu1W0ecT+Ibj81vGPsVuoBvIV9gG6lmQbfYBrgG5xCE27SCtAtzAJ0nVwAbfILwA2KAbaDZcjrOtFQVOtcQ1Nt0A1Ntco40ajzBQ==&a=RZJdCgQhDIPvss99GH9q7VmGvf81NrGRhYGEmnyj4vt+7f20p1l7urWPlW9LPqz1O9/I5N/3Ub49yKNzfXd5MBr6x0OHOOQNzckYYB2P3kSffkCHmPRTTM6m9kbeFIe8yyFjqkt15clY4pNxu1z366EuDjV0RvaWmNQQM7CHm6Hf4nA9ledsi0ndukNqaj9U5ccy3Q6caxbmdXszzasDt+ZxGCiHkNduIKv+ueAqBxeabVu1C0gUDxJFgfAsdN10oojbhUutpm1107L+gcEuCiTrlojQ42KTb4oWBT0n5s4Lwlv8f98f`
- Nurikabe: Wet Assignment of Cells Puzzle (LMD 000Q8D):
  `http://127.0.0.1:8765/?variant=A#m=solve&p=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&a=VdDBrQMhEAPQXnLOgTWwQC2r9N9G/rycvhRZE6/tGfM8r6v11/sPJ7wLL8yFuX7MLkyD+KzCbu40nWbQjEA5Y0D68dOcwkk5L4i/zTfvLXnRLMyi2ZhNueVvyi3/+HroT+1NKyY6pv2Y0kfTtHKl1T25yhV9E3O4NE2vjekStI6+GebBpWO0y5QwJUyu6aummTS327TOjVlmfbN4F++Sr3W0zpazubTO8VX3HJrDdew9pe9eo7dS9lbK7mW6l+lexiHucIYrHLEqxwm7/lrnja2Rf87r837+/T5f`
- Yin-Yang: Yin-Yawake (LMD 000MYT):
  `http://127.0.0.1:8765/?variant=A#m=solve&p=pVRRT9s8FH3Pr0B+NlLstND6jTHYC7B9Wz+hKooqtwQakdbMTVaUqvx27r1xCG4yITG5uT09Pb6+1/bJ5nepbcqHMKIRD7mAIeWInkGIn2ZMsiJP1dE0Wx9P9VY/pvysLJbGqqNtOteF4Zx/v7zk9zrfpEHsZiVBzATjTMIjWPLCFmY1z9hLzOb5dgkkS4Jd9VPtqpmKkz2v/m/hqIW/1A7iDUVBcap2bHjCVCw4W2R2kaeza8Ylii9JIClOYD6vIopfKYYUhxSvSHMBqYQ85UKOmJJQJ7Qu5NjhMRdRwyMOaxzBVkWNBjat4RFL6bAEHDkM+ianQI3TC+CFqHEI+UXDg0a4PGH0hscDDj+dBNO7qZSmSQ9pqBXo7ZY6PKc4oHhCnZ/ivgZBjOXSGLrvj9DxAM8UDo1tTD7blPZeL1Km6NQ5cetyNU+tR+XGPOXZ2tdlD2tj096/kEzvHvr0c2PvDrJvdZ57RH2nPaq+IkwVtnRMYTNPoa01W49Z6WLpEXDLwQKbZfbk0UW6Lvz1C+1XqB/1wWqrtuV9wJ4ZPTGcMx+gIcaqOuPVN+WZh1f/gSOuVXWBhogZ44LuMIkkwIsW3tL/iM4BQQJxAvimFuC0KcDWN8j8UHEVoiF59YVmI2Qr8wcKrevA37V/gXjzLzRU3pnH0qkEWvCMCnXinmqjtlqEdbWIsFpMErbVYhPvqr1qq538e7XjZF/vf/jp19Dn3jgfevPZWczYXpcB3WM0YHsN5fiOp4DvuAcX7BoI2MZDPnvoI6C6VgKy4ybg/mIozHroKazq0Fa4VMdZuNR7c8VJ8Ao=&a=VY47CgAhDAXvkjqF+e1quecQ738NQadZCAwPhiFzLv2deFP/RMUNOgyYcFxGUzs06BA/OntcJv3ET/r5sjubftEv/im8wiu853TX2g==`
- Star Battle: Beyond the Triple Limit (LMD 000T39):
  `http://127.0.0.1:8765/?variant=A#m=solve&p=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&a=VZDLbcVADAN78dmHlSjtp4BU8eD+23AQcB4QwAeCnhUpfT7P/e+7YsQdP9f9K9oiFuJYJEzCqBDTovjVw2LyagoBs2DWttg4m9DjiBxf4awcZjI8OTMRwPIWKeByVraLZfO8gSfMwtnAG/iQ9W14XEwcU4FI7yVOp/RkCUcOVQGXJ6thJg4NtYjgdNoupg28gY+PUMNOheEKw5VesKhaVC0BF0zjtHevZvLk1SR0AS/Dx5XP37jneQE=`
- Galaxies: The Aqua Galaxy (LMD 000EUI):
  `http://127.0.0.1:8765/?variant=A#m=solve&p=7VbNbuM2EL77KQgBexMC68+RdEuTdC+72W2dYhEYRsDItCWsJKYUHScKsuhr9PX6JDszlGLLprdB0d4KWwT16ePMN0MOyeb3NVfC9Xz8R2N37Hrwm0APn+A0ogdx/F0XuhQpu84FO4OB7D0v+eOTe7bWuVQp+8h1zj6LRkvXvRa15kWTy5RdFA/FQjANo1aqWLCi1pIpsSpk3TC5ZFLB8JWseVk+sUzWtci0WLBMlGVzwi55lnds/AhGYZR45JkGtqwFywqVlYLxGiw3TEnNNXDJWPNUVUKrImNcyTUQUIPhn7zzL+CPYahiXaVsmnMQ2cgKGOgZZG4lb3Kh4CNSOmFgEUJSgqNU3rANdBSJ0H3krzHuUXnnsw+uf0f5y6IsgbUpIJPG5PqeQbo4eFUYOyvFgyjf+eeQNugvNRPVvX46oUkxI4iB8sW+dYyn4RAhz5RsIEQNqax1Afo2xULnfVKUkpsmZWcUqhHDCWM56mcPvFwLJsByieLIbNEKnEw0aeJGSVx3XF420gwwKngF86FxwCCpXc6Ns7/++JMtQFuG89nA5Fd3RS0WGHstNbyDhaJemUlFoeBblEsMwv105S7BlxjNurU7H80cz3EdHx7PmX9zmvVCfl073whO5qPn9tf0ub1NZ/MXt/1t24233Wn6DO0VtR61N+mzE4ROOuvdQPEYd65DQdyKYpVrx/UBCJHouY5ZgLfTqYEjH8d343ortvGngSEOqFbiqVG0JcIgGzHuiFvp8FiJiVV6Mt5XdGR8gjFaxsdW2BtTSnYTciRSbzyI4EdML7L78ge+fjB9XuD1ad2ZATtzcjildmaINi2qQszMm+KKKANvWBXe5HWhdjN9nIm56vS/tnZmF+nfe4+RaYk0sS8t33vrGvB9WoVviMtPMFeHvoKxXVsQ2ddn6KFHG26PJYzssxwesR+FdjtRbPcbJfa1PTmiZ+Lb/U5C3GFs+BH+6RE8tsc7ie074CSx5z8O7Pbj0L6dxJFdf2zdvmD7/pk2cZ/aa9jj3Tag9oLaMbURtR+Ic0ntF2rPqQ2pnRDnFE+J0WgWhLRFHP6i/3E6ieAonq7VkmcCDuMPcKazK6kqXsLb5WK18zalM7p/hzPaaWR523RjU63WwiWoXld3QjkpnfkGKqW8L8H2ACxWtVTC+glBAd4t/DupFmh9628D18sB0dyjB5BZbAMIrqKDd9qhBkgFV+gBcMc13LmbvLgfWoJr21CA5sP4+Ve49g1tb0N+GTmPDj2zAHbLGK8/Sdqeue37dHBPcttf4P7zMW1v8Pozcxw3omogEtQWlMRr9wt9x965AT3YheG6ZPrQvYHu/qbcfk5n7YXroKufyAB2nUo+gFYjBd/p8ofATj7Ml+4e13uBajwjxf2HXnew1Y3dTjd2jW7sWXQnne6drQNDQdXX/5bqZP5iJmT8z2+hdMa0n/6jTe2xKz2pttW3s7IAtlQgoNZK6/CDYgP8oK7Q4WFpAWqpLkD3CwygwxoD8KDMADtSaWh1v9hQ1X69oauDkkNXu1U3m4++Aw==&a=PVVbbgQxCLtLv+djAuQxZ6l6/2vUdpxIq2CRYBu07P7+/rT3/Xlwdp2LZyudyrShc+rctx/PUFWkTr3P0KlM7owYSgwlhhJDiaGLYahqqGqoaqhqqGqoaqhqqGqqajadqp2qnXoz9WbpzdKbpTdLzEvMS5xL75fef7r9lP+YD80kXjLEy9vQfKIp36gYmlJoPqH5hGYSwaokTZK9mCzmilaKtcXSIqOG0HnbSdFZ1lk2eDF4oUloEJqABqD+1f4k1SSVOlWj6lANqr+PFR8r0Nzf84vPT8z5xJePOlwBvIw/4HdjxPiacQOOi/OdxgHsWvDFV8YF3I078DAeT7bDs5D/jD/wbF3GfLcudTK2T+rku98Lx9ZiLptrEbO5FvFoMWYzD3Fsz8xlMw9xmB+5bNs/Y7btXzgPP3vZcxBOawV042BqWZc4rYtcprXQR4a1iMu9IJdhXcQMaxHX4ed8DifmkK5FvD4Rs1wLj1l+Dy/Z3Tu8ZLcH6Ge5lrjbA3JXFzHLfSFmmQcxhz0U/NepBR6Hk/7tBzHH4YGfYR74un6IpzmRu36IpzmRy2lv0L9axNPvkctx3sD/9Bygf3URc1lrYCZHF/FqIeayf2jmtH/iZU7kcpqTGHu1MXtxX4jXG7F3jbnEfm6M+RyfxN5Z5nIeTmDvHXPXP2J673KBfx08nno9B/RxPSPWax74rdc+8TtwvQHXax7u/vEDXP4dYK7OnsJX+neAsc5uwld5N+ml3s3DeDxQv7BLG9Pznomw94u5o8tY/k2gfnmnqFneHWqW94Xclc6Dr7ynwt5T5sp7Su7ybpK7vJvC3hfmyjtCzfKOULO8I5XgSXsj7uZErtKciNXNA4/VzQNf5Z2lr/KO0Fd5L+jleiDu7hG56wexuvuCr/LO0ksN80D/6hIPzwT65b2gfnkvqH+1EMt7QZ3yd546pd3cf0T8/P0D`
- Fillomino: Valor Comun (LMD 000TM7):
  `http://127.0.0.1:8765/?variant=A#m=solve&p=1VVtT+M4EP7eX2FZOu2d1mLjOEnTSPuhQFkJLRwssBxUFXJTtw2kNpsXXoLY375jO4WkLZzuPpx0auM8eTx+ZsbJjPMfJc8EoY7+s5DAHX4eDc3lhoG5nPp3mhSpiNB3nqoM7ahFKUm/LOYqi9B+mRc8TdJZ+UjIXpKmapFIFaHd5C6ZCFTMBZplyQQlslBIZbBopiRP00cUKylFXIgJysQsUTJHeRnPYQUvkFSouFcvE2pqhHK+gCGpLgWC4NtqfHLNYyGLrd/cXfh/Se6ERLJcjEWWg85tJnKYtTJGoda0LjR8/ACaiawFTrSR9QyBbHT1Et4C9gDlcx0Th7QWCxCc8riAzTLZJLn8UCC6hX7vI7b0yOUErKm/fI65RGMQWIqPywLmV8yb1lIVf9hYt1Me36CxyiY6WR1GbVVTW+TPvT0y5WkuyP7F9fbuTf9+0P/rk3/J2Nnh9OP17vHZ9eT8Oz12kk+Zc5iG8uAIVD9+qS4P5v07MRDBUa7ieSr4hFeX5/sPqdwLZ/Mp3dmf74RTLp38R3jau9s+/vy5M6w/m1FniCkm2IWL4tHPavDTEGzUeaq+RU/VVTQcPZPq7BWGr/AkeoLxMHrCzMERLPQwfKGYOnhEcOBrqttgesaINRjqGCO/SVmpphK1UsELBU6pcX1hxlOIhlTMjLtmdMzom/GrsRnoIL2AsADkXUiYusR1A4s9h7getdjtNjCUmefWNmDvMYt9j7g+xGSwT9ygZ3HQI2631vehPJvY71rMGOjU2NO+wtoG1i5jCyCermdxLySM2hjgDtjGwFyPMNfGAHfCWB1DCDp6o81a0OnVuVCIQW+tiUHna/UZhbXU7gNztH6NGSXMq/U1ZnUMDgMbGz/cAdv4GWiyF03AtPbb0zY1DiH3UNvACzk3r2XHjJ4ZA/O6uvrT6nSGoKfbXfvn//84qDCoJZyr9CovM2g54ko8QOPBkS325kyLs42xRaVK3aaJ3KSwnGqRyUyqTGyc0qSYzN6S0lM4KrKypWR7VZO/h27bzsQcWi0qTrI4bVNFlrSeeZap+xaz4MW8RYx5AQdcPk9u20rQh9sBFLy9afyGr3iD028ZznMHP2BzDeHbJJ5ue72o6pPqi+5nr52RVMfQ9w6i6kS3vSHGxIfOtCjTIokVHLm6QUF/Mv3GLHQBDl7huZnXaMeS1AF8qLFj+to37eMCnu12XX21akfRsDolWE9uGwkN8ULdQQY2QP0MB9oYchzixi5BD4d0y4m6KWtTqhtn36YxWKZBwct7eYDKMg8NbR4areUB6f0nafRGz/a1Of/ojPp3h8bfdqqHurhV9k59v06u0huqHNh3Cr0xu4l/o6Ybs6v8WgnrYNerGNgNhQzsai0DtV7OQK5VNHBvFLVWXa1rHdVqaWtXa9WtXTULfDjq/AI=&a=RZLRrcMwDAN36bc/bNGOlVmK7r/GO0NMHhDAB4ISparf76+d7xNxtZi9jU+Dd4vIYo0Win+eyxzoKp7oy/oUnmle6Lc5W1zusybs/ous9TCebQ/e2JcZPa3vjj7M5KZzqYvteQ6na9Fiex7e2I8fTueivVnkRLpP4rntIeftyRu5X1b374am7tnoHendb3Z0n+PVqHmOV732Uhf86BOuOTXwh/WBh9sU4/GNNBZcWRrZ5Hspjl4zn/etpU7z8dxw7SuRxY2L2UXuzyu5P3WvnzvLtxO31jxZ9Yc63+8P`
- Akari: Statue Gallery Akari (LMD 000JQM):
  `http://127.0.0.1:8765/?variant=A#m=solve&p=7Vfdjto4FL7nKaxIldoqGpEAM0PuZvt30+3PzqyqCqGRSQzxThKzjlOGjFrtQ+wT7pP0OzaUBDwXXWnvVoBjPvuc850/G+o/G65FGI3CaBKOLsNhGOE1GcXh+fAyjM7xDZ/h7nUjTSESdm24aQR7w4tC6C27uuNahleNyZVO2KJQZiOKIgyf7zd+4PoOUjnPBEuxVDNZMZMLttIyY0axpdIlEzzNmVq6BflFVKzO+VrU7Glt1dTPmLjnqSm2TFWpeBK/YBtpcqYVlqWqasarjGmxLES6+14UaiOyM/ZOMbNRe30pr5j6InTB10xpthAYwX2lKghsGc/+4KmoDBkgjQD3tOo1VlilDFNp2qylyNhiu1dbNrUhZSJbiY2s4aqqKlAhAk/il3g/ZzdQwgsteLZl6wLKMraBfvhoXQEbeqrGuKCytLB+I0XW6i4Qlha8IAgGOVtzDUpLzNyOs709qyVhH8gUK+Qqh0BTLGwCmgrEM2KQS7NPTI1I5dwwgfhsfVt6qZM1lMKyJl8NlxTzjpkzdsWqplwIDRU74Uym3MCFXG1Yyattj5X1U9wbqglpE4CSki3ptpmB2+BloAJfz9jbjmjJt2wFqQq7/MRJWhZFU8oKDGxayRHn90Gt3dczu9SqBB0ixVHePL1zCp9S6p7ZMqEaIHMOd0l4RnEhC1QQ+wpaKK4zW7q5THOKMkJXIh5LqWtjK/UQEOtUlzI8U9CiuzHep/qVzZi1VYtViQJGm1iba6FlKQzEOiXyo1wP+jP2z19/u/TLmjjCZ7tLoCYhTZvLUmQSezt94uJyYESS8HxJJWfUBv7WYCJcs6oKkt7KkxUYoutltTp7vE98nZApC+X8Cxk88uksfP/6dbjkRS0Gs2EY0zk2H8yCKAiDGJ8omH8LkIKFDL7NAk79AjSYDx7a35KH9jaZzb+G7e+H6eVhep08BNNhkIzDYDpyj3P7iMZj95zGu+dk97zEE5LvdpIz4kALwdzpmAWjDgBts2B8AKy+IwSae0LWRkcvrEXJA8bPsBlf0PY4DNy5f3sdhDFk4guy5IFJlQeeeuHLyA8TZw+MEPlgL8GJX8nksd1e3pOpl+B06GUyHV544YjS5oEpeSdwFI8fw73MgXszAdzrEnBvLqJ44vUVuDeQwD1BQNG8tqUT2/EGVR+2Izu+tOPQjhM7vrV7Xtnxkx1f2HFsx3O754L6ZjCYjc7tzwzfa/L/yr9ZwZGGIyuoVXFbN5rO3iAxuhFIKCB3CQeJPQYdVCi1LmSFbR1QriqlhXeJQLpcPPsXSmdH2umw7gGurHpQKnVa9CGDw7f7nWutNj2k5CbvAQtu8Ju0zuW6rwkXU5+A4X2K7qjvBAkXxp7N10FwH9jPDD+MwzHdBtOk/Ri2b3C0dq6OsP2I6+DXpL2m22AW4NC1rWA3obHQDz+mn+w6zV44MBpi/s7NSewzpr22bD8ks/aGbqOw/cVK0zQo8eOVjnjiQd/d7QWgEwu3UjeZumt2eyPq5ytLdyey5xwdOI8OnGnqONPMw5kYEmeXyNu3TtFPcj7cuEd0p/OvLg3Dn7mK2/fudu3eev/RMXa/6zelDy3XqS/AnrYD6m2vHX7SYcBPeokMnrYTUE9HAT1uKkCnfQXwpLWAPdJdpPW4wYjVcY+RKddmR6a6rYaitz/m8CfmDoXgBOaD7w==&a=TY7drYYwDEN34bkPjUvzs8G3A2L/NSDBuboSOliJ7fS6Dpl6jJdejKQgiY+rWB7Uds3kLv+uiZZTd7Gc9rG2Xn5PDyQ1RJLIBs2BWcKPe1z/v/c5e6xfvcsoZLZYFJAWbYZTLFBspdCOa8e1m63j1nHvZm9z9CT+Jt0c8QnMFsLrAE9gMY6Tt07WbDqUBmOrscv5D1YG81G5+34A`
- Battleships: Sail the Seven Seas (LMD 000IFY):
  `http://127.0.0.1:8765/?variant=A#m=solve&p=zVfbjts2EH33VwgCCrQAszAp62b0JbfNS9qk2RRJYBgL2VZsIbK1leRcvEi+PeeQomzZUi9oHwrbBM8MOXNmzOGl+mOflKmQUkglJkqMBXrCH0+EPwmEHyv9Gzef11mdp1PnJslyp96kzk36Md2hTSrxcF9vinLqvMmqOi2zxLlO8lyIl3myTPXYdcax1Sa7q5xsVxdGWGYrp9ovN0BJ7eyKZkBdUFaUsLkudrD0BcBZZUmDrpxXRZ3U2W5tLVYO5MWndHXlPM73aeUU+7rKVo1vulkW+12t4W6/XaSlU7x3lmmekw7FWemUaXWXLmswdcriE10ui3y/pRrskCinWC73d1m6chZfjOcr502CgBtLy2S3K2pnkWqlEV79oJ7g+9bZJAgM7qtkmzofE7B00oShZ8AZ7N/dpUlZXYkX19eiLvfpaNYkfj6audIVrsJPuvNvh3ffZu4iqfFv0M/tI1fI+ej+8Gp6f7idzuZfxeH3Yzc6dm+m92h/nd67fuhOZ66HiTA5dufCjbQELlqJHKvzQVJejppcmJKBET14eyoMxxR2RfLCWqh9Bh3RpDsKIUgdyDsEMomhDMVFOoTr01+/hgZ7NcGgRrPv1URk3KuJgyGNlIOTpDcYkZwMkpCTYV/637BryX6gSEqs8ts0W2/qZqT+P/7WSB2013H3zKo8qFS/iukdUPlQ+f0q8h/wFQ0bZBr7DcZMY7/BmBnoNxgz5AGDwwxjMhyYRYa9s9SYDHtnqTEZDswaZKjGzDzqp0/FzA+ouKgGVAy5R4WyvNbFqXT7GhuPOHi6faLbsW593T7XY57q9o1uH6OkZRBFQgb8l7CgG8S/06CYOkSqUYzzKogRnEE4vyCySBFhNRrkESEgg3wi/DcGTYiQB4MCIsRnUCiwdVkuMbyHzLNBmmfDDIOoa7yjQ9R4x5QOwrwQW9kJGrdW6IHbg0Y8mUPZxIcpRNYDjmw01qZEfKFs4gsl4gtlEx8MEDXxYRBREx86RNa71MwsUvSnLBeDrHdFZsoyU/SurHdFZsoyU/SurHdFZsoyU/Tu2UwoMlOWmSIX1XJhXjzr3SOXFnGFhHa9GGTXCzrU2ZFcIUcUkVlkWRtkeUbkya3HIDI7IlrhFniCWpvMC/dAg5iJFoW0EtrYDbI2Q2YitKxDxtCigMwCy9MgyzMgz8DaDLQVm4mAHrj9G0SbQWuTeeGGb/wxhhb5nOdbmwZZKz49BNaDTyuBzYRPD37rgTYDazNgXgKbiYB5adFEz7M2NeK5bhA9+K0HWuH5bRA9+C1r2vStTZ8r0rdZ8pkzjbDJTPRWE+Com4u/+OKgEzjR8IOByNcSJIBLLIqJuKC4CcXKTMDGqNtAt5yAvVe3UmCD1lNi9HCsogdTcTTHThjygjYazTy4OvtgzP9K8iAWD7C9/MkP91VcR92qyG+rffkeTwB3+j7Jq1Rombl/d0R5Udzl2a47LlvvijLtVVGYrtZ94xdFuTqz/glvg47APHs6omVWLvOuqC6zDta3oI5km9SbjuB4GnYtpbu6S6BOuhSTD8mZt+0x5q8j97Orfzj4pfB414+nh4fi8AwX45OXgTj8hsv+L9PDDe/6M9cVkXDL9eJH5fnCUT4bz/+JA5+bmbgt9OufGn2EdYqjmaawdnE8aymWOF4R6I71bQAX8VlzR1yWRVUZ4cvp7PBauDT2SBtg190WHxGWYU28LLYLBH76nmk01X5VfNg3Y/XF4qEJ7t15cDiKwDtCo+RpcN4xDnZNGOw1YUgGp+Mw0TGMi/vzfxtHPP9q/k35z95ruPfQws/mEXTynjp/ZJ2+lc6eSvohcHjR3PMPL/79Ve10L203sc9N6Rflsfr5nDXLGtKe+oe0t84b+UWpQ35R1PR3WdeQ9pQ2pOfVDdFlgUN4UeOQnZZ5J7SLQiep81qnp4typ6fTip/NR98B&a=vc3BDQAhCAXRXjh7WBREayH234Y7FOHlxfwxmin6qbTfQDXss6xlLLTazdGrOnWAccM7UCZb8GZwWmybukNOe/zfuQ==`
- Hex: Gemstone, hexagonal Akari RGB (LMD 000G7N):
  `http://127.0.0.1:8765/?variant=A#m=solve&p=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&a=Lc47EsMgDIThu1CrAD3AatOkT+vh/tewo59qRxLsfPfdtC/5NGlqLr9/psr3TdOTnrW3CHIF+3XVP7t6pXetu3fe+RjslX4//T7PftLjVzBnr3ucfzG4xzLmpGdqvrml5LhRY0aMFy1WpDhRYkSIDx02ZLhQYUKEB03b+wE=`
- Sudoku: 9x9 classic sudoku:
  `http://127.0.0.1:8765/?variant=A#m=solve&p=zVb7b+JGEP6dv8JaqVKrWwXv2l4/pFNFyEONLjRpSNMEocgBB/swNmebhDrK/e03s15iG8hVPalSZVjmsft9M7OeXfLVNJ2vqAuP4VCdMngMR5dfx8SPrp5hVMSBp/VjP8+jiXZVLeytijDNPG25Ku/Ku4M4SuZa7i+WcaD9PDy+Gv42OD1YTH+hYVEsc6/bbczrLn+t2LsuPMyKXBEzO7JnwopMPmczyxBOyMHAl0ZozUxnxmfu3AjtSNCL2J8EWhEG2jSaRUWuMa1INVdLEzAH/iTUokQLnoLsby1Ln3/ifW2SxqtFovnJVDPWhvaQrg/o7ycn9NGP84Ce3X4+PJr3no97f3WtO8O4Hjx++Hx0ef15evMnu9SjbqYPYic5vzg6jD+clnfnYe8pOA7ERZ5Owjjwp355d3O2jpMTZxY+sv5Z2Hce/UTPvzhD9+nw8uPHzkhVctwZEUYo4fBlZPyVVFUgX6XZHXdeyj+8l/LeG41faXldi04tXnkvMA68F8Id4o1w1xALQF1QrTfVMEB1a9UEVbypptVaawpQ7TfVwskNFb31WstuEQkGqlmrHFT+ptqo1kQ2ItdrbQzDeFMdvUXkILJTq7i2RnYw/TpIt+1lOpajhmYMA6mZGcP5ddiM4fyajHEkb+Dxdj2ZrG8D32iXkJnNXGDHmNy3WzkOYStpacjxSI66HC05fpJzjmGHmQMALgTGAcV1KcckQIZfyjnUDmVuUW5ALVCGRuYWBI6yxSgXkCTKwqTchm1D2bYpdyE4lF1odx0SQXwH8HWFrwM+U/gM8PFVk1yAbyp8E/DxRZFcgC8UvgB83EiU4SjhboUPv8AFRZI4GL+ycwNkhcMBp5kX38wXICt8DvjNePC9lzLEbyheA3gNFafAOqi8BPAKxSuAt1kfoXgF8ArFK4C3mZdQvAJ4heIVwGsjL2zajdy6vhxNOQq5pTb2bqczgnixF5oPvpL/IwseUVer7BHOWDikqqNeG6TZwo8JnE8kT+P7vPLfB2t/UhCvOkabnpYtWS0egox4RbZSljhNl3AN7APYuFrGaJakWbDXhcZgOnsPCl17oB7SbIohNRzPfhy3U/my8rP24kmUTeK2qciilu5ncOe0LAu/CFuGB7+A6zQPo2UbKUi2aln47RD9ub/FtqjL8dohayK/cChxauJd4nplj5anXuvSoeUlXCbn3ubuwRtlRAjsPCWLVVxEcFumQKxscBrJ5RzE41q8kX6U+pWR6SAPlAziLYhVve4/VZYLb1QOKcEIDuVqFMkifYIUqghRn6SLB0hyRBplogY4VLgbBmit3o/kAVCbPFCs8kBpTx6Y3n+bhzt+rTZO/1dX/49dJ/94Pq1Vf6fZd1q8dm6bN43etn6n2RveffZ3+rrh3bbvNDEGu9vHYN3TymDd7mYw7TY0GHd6GmzvtDWibnc2RrXd3Ei1099I1WxxeBWr/+Bk3PkG&a=RZHdCQMxDIN36bMf4vh/ltL917iLFCgcfNSW5Ih+vz/5fx9dS/IjL1UGzMsSBVvqUJc0qNSryT7c17+3OOgSYNC3Uwy8eba5N6fe4s6Leda8b4N7tmA3xfY1H9PrOdmWkDh3zp0bh45necHuDPXB7Qj8isYueCgX3pGFlGTrHCiL3YvVi82bRdog6UBYJ+zNsmMYDitOInMKvmko51w//8XvAQ==`

</details>

## The switcher

The black-and-yellow dashed pill at the bottom is scaffolding, not part of any design. Arrows (or **Alt+Left /
Alt+Right**, ignored while typing in a field) cycle A to K with wrap; the picker loads a sample and keeps the variant.
Plain arrows are left to the board, which moves its selection with them.
