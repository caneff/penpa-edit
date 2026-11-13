# Solve-UI prototype: verdicts from two rounds (2026-11-13)

Prototype branch: `prototype/solve-ui` (throwaway, never merged). Eleven variants on the real solve page, `?variant=A..K`,
switch with Alt+←/→; `npm run prototype` in a checkout of that branch; contract and samples in
`docs/prototype/solve-ui/README.md` there. Each variant was built by its own agent and verified in headless Chromium at
1600x900; the verdicts below are the builders' own, from scripted use, not from a person solving. Chris's verdict is pending.

- **Round 1** (samples: a 9x9 sudoku, a masyu, a nurikabe, a made-up hex grid) judged each idea mostly on sudoku.
- **Round 2** (samples: eleven Logic Masters Deutschland puzzles, `research/lmd-penpa-sample-links.md`: Slitherlink, Masyu,
  Yajilin, Nurikabe, Yin-Yang, Star Battle, Galaxies, Fillomino, Akari, Battleships, a hex Akari; the sudoku kept last)
  reworked every variant for those genres. Every variant reached a checked solve on at least Yin-Yawake; most on all eleven.
  The scripts placed marks where each link's stored solution says, through the variant's own controls, so "solved" shows
  the tools produce what the answer check wants, not solving speed.

## What every variant converged on

1. **A per-puzzle tool kit of 1-5 tools.** No genre needed Penpa's 12-mode list. Most genres are one Penpa Composite tool
   whose left button places the main mark and right button the helper mark (edge ×, dot, water, black vs white circle).
2. **Read the kit from the answer-check settings, title and rules, not genre tags.** Only 3 of the 12 sample links carry
   genre tags. `pu.get_answercheck_settings().answercheck_opt` says what the check compares; the title and rules carry the
   variants (Moore, Aquarium, Statue Park, RGB, digits in Kyklos).
3. **Name each tool in the genre's words, with its mouse legend visible.** What is hidden in Penpa is the mouse grammar
   (right does a different helper mark per tool, clicking again cycles, cell vs edge placement), more than the key map.
4. **Keep combined gestures as one tool.** Yajilin's "click shades, drag draws the loop" beats two split tools.
5. **Tab (or a Space pie) to switch between the kit's tools.** Penpa's own Tab only cycles the link's Tab set.

## Per variant (round-2 verdict)

| Key | Variant | Verdict | Keep |
|---|---|---|---|
| A | Dock | The plain dock was not enough; a short "Solve with" kit with legends on top of it was | Familiar frame + kit |
| B | No modes | Holds for 2-3-mark genres once the genre is read from the check; weak where marks outnumber gestures | Gesture card with rebind; per-gesture undo; drag places a whole ship |
| C | Cursor ring | Weak claim: the kit removed most mode errors | Ring as indicator; hold-Space pie; Space tap = previous tool |
| D | Radial menu | Works with roles at fixed directions, tools picked per puzzle; middle button opens it | Space-flick as a fast layer |
| E | Genre tools | Holds; fully solved all eleven | Named single-purpose marks; editable genre chips |
| F | Live rules | Live checks are the value, not the links; per-genre checks do not scale to the long tail | Rules beside the board with live verdicts; hover a cell to see broken rules |
| G | Timeline | Holds; branching fits loop and region genres | What-if / Discard with branch marks outlined; one tick per gesture |
| H | Vim | Fits loop/border genres well (corner cursor, `3L 2J`); for keyboard-first solvers, not the default | Status line, which-key panel, `:` commands, `.` repeat |
| I | Desk | Free desk earns little; LMD boards fit one screen | Loupes on large boards; automatic layout |
| J | Selection toolbar | The palette's contents matter, not its position | Kit on an edge rail; last-stroke outline + "Undo stroke"; main/helper brush switch |
| K | Live key map | Round-1 claim mostly wrong for mouse genres | Mouse card tied to what the pointer is over; keyboard as an F1 toggle |

## Engine and bridge gaps every variant hit

- No call for which tools a puzzle needs, or for the answer-check options as data (only translated HTML).
- No list of Shapes or style colours; read from the legacy DOM.
- No cell-mark setter: marks are made by replaying Penpa's click cycles, and clearing can cost several undo steps.
- No notion of a gesture: a line drag is one undo step per segment.
- `sendKey` sends keyCode 0, so Delete and Backspace do nothing; it also re-enters the page's own key listeners.
- Keys typed in a `<textarea>` also reach the board (`main.js:279-298`).
- Penpa's Congratulations popup blocks the page and reopens on every redo into the solved state.
- `setMode` opens modes a link hides (Galaxies' Composite), undocumented.
- `pu.solution` is a JSON string on single-answer links and an array on multi-answer links.

## Chris's verdict (2026-11-13)

"Looking at the prototypes and none are quite right. We never want to have it be grouped by genre necessarily."
None of the eleven variants is the design. The UI is not organised by genre: the per-genre kit the variants converged on
(tools chosen and named per genre) is ruled out as the organising principle. What replaces it is open (Layout and look, #8).

Chris, 2026-11-13, on what to keep: "I kind of like the mouse card idea demonstrating whatever mode we are in more
loudly. I like the desk setup." Kept as directions: K's mouse card (what left, right and drag do with the current tool),
made a more prominent statement of the current mode; I's desk (the board with movable cards around it). Loupes were
explained; his verdict on them is pending.

Chris, 2026-11-13: loupes dropped for now. Tools: "I want to be able to pin specific ones I tab between like penpa does now, and otherwise a more intuitive full browsing of modes."

Chris, 2026-11-13, rulings for the new solve UI:
- The mouse card is a fixed card on the desk (no badge at the pointer); the desk's cards can be rearranged.
- A pinned item is a mode, not a full tool: Tab lands on the mode, keeping its last sub-mode and style.
- Pins are seeded from the link's Tab set, editable per puzzle, "plus maybe some preset options to pick between".
- The full mode browser is grouped by what a tool puts on the board, with a search box ("I think a+c", tentative).
