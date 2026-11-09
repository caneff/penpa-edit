# Glossary

The words this repo uses for Penpa+ and our changes to it. Terms come from Penpa+'s own UI and source (`swaroopg92/penpa-edit`).

- **Penpa+**: the puzzle editor and solver at `https://swaroopg92.github.io/penpa-edit/`. Not "Penpa" alone, which names the older original.
- **Solve mode**: Penpa+ opened from a puzzle link for solving (`pu.mmode === "solve"`). Edit mode is the setter's.
- **Mode**: one of Penpa+'s top-row input modes (Surface, Line, Number, Shape, Sudoku, ...), in `pu.mode[pu.mode.qa].edit_mode`.
- **Sub-mode**: the choice within a mode (Number's Normal, Long, Candidates, ...).
- **Style**: the color or look choice within a sub-mode (the digit keys pick one in Surface).
- **Tab cycle**: Penpa+'s Tab and Enter keys, which step through the modes checked in its Tab settings (`#mode_choices`).
- **Upstream**: `swaroopg92/penpa-edit`, the Penpa+ this repo forks.
- **The fork**: this repo, served at `https://caneff.github.io/penpa-edit/`.
- **Redirect script**: `userscript/penpa-redirect.user.js`, which sends upstream's links to the fork.
- **Engine**: Penpa+'s puzzle model, grid geometry, importers and checkers: the part of upstream the fork keeps merging. Not "core" or "backend".
- **Owned file**: an upstream file the fork has taken over, marked `merge=ours`; a merge keeps our side.
- **First release**: the fork's ChinStrap-branded solve UI, live on Pages, solving everything Penpa+ solves; edit links go to upstream.
- **Mode family**: one of six groups of modes by what they place and how (Value, Paint, Path, Stamp, Genre tool, Move), from `research/penpa-mode-key-map.md`.
