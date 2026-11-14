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
- Presets are both: a few built-in pin sets named by their contents (never by genre), plus pin sets the solver saves.
- One desk layout for every puzzle, kept in the browser, with a "reset layout" button.
- The mouse card's headline names the whole current tool (mode, sub-mode, style), with left/right/drag rows below.

## Variant L (round 3, 2026-11-13)

Variant L (`?variant=L`, commit `4a8d256` on `prototype/solve-ui`) built the rulings above: the desk with five movable cards,
the fixed mouse card, a pinned-modes strip with presets, and an All modes browser in seven groups by what a tool puts on
the board, with search.

Chris, 2026-11-13: "It is getting closer." Changes asked for:
- Many of the button rows (presets, sub-modes, styles) can be compacted into pulldowns.
- All modes and Tool settings can be integrated together better.
- Genre names are not banned. Penpa's own tool labels (often genre names) stay as searchable tags on the descriptions.
  What is ruled out is grouping or organising by genre.

Chris, 2026-11-13, on round 3: "changing tool on the tool window shouldn't change a pin if selected", and "we are pinning a
sub mode. style can change and be remembered but we are pinning a specific sub mode". This replaces "a pinned item is a
mode" above:
- A pin is a mode and one sub-mode (Line · Helper; Sudoku · Corner; Shape or Composite with the tool picked from its list).
  The same mode can be pinned more than once with different sub-modes.
- The pin's style is the last one used on it; Tab lands on the pin with that style.
- Picking another tool or sub-mode in the Tool card never changes a pin: the pick becomes current and the pin stays as it was.

Chris, 2026-11-13, on round 3: "Recent tools should be its own window i think." Recent becomes its own desk card.

Chris, 2026-11-13: "we should not show a sub-mode picker. that is only in the mode pulldown. After the pulldown all that we should see are style things." The Tool card is the mode pulldown, whose entries are mode + sub-mode, plus style controls only.

Chris, 2026-11-13: "Can we make the buttons for types more compact somehow? and windows should be resizeable". Style buttons become small icon buttons; every desk card is resizable.

Chris, 2026-11-13: "size of mouse window should be fixed not change based on mode". Replaces round 3's "Mouse card fits its content": one height for every mode; the user can still resize it.

Chris, 2026-11-13: "I would really like it to be somehow even more clear visually what mode we are in", then "id like to see all 4" of the proposed cues: a board frame coloured by mode family, the tool name in the Board title bar, a short flash of the name on each mode change, and a cursor per mode (a cursor shape, not a badge that follows the pointer). Built as toggles in round 5.

Chris, 2026-11-13: "Tool window should be called \"Mode\", the pinned modes and mode and recent mode should all be on the right side, mouse and rules on the left."

Chris, 2026-11-13: "want to see it in dark mode too." A Light/Dark toggle in round 5; the board uses Penpa's own dark theme.

Chris, 2026-11-13, replacing "presets named by their contents, never by genre": "Presets should not be named as types but grouped as puzzle genres and titled as such. I only didnt want the modes themselves titled by genre." Built-in presets are titled and grouped by puzzle genre; modes, pins, the picker and Recent stay named by what they do.

Chris, 2026-11-13, on zoom: "zooming is weird ... only some cards stayed in, others scrolled out" (browser zoom). Ruled: every card stays inside the window after a zoom or resize, and the board always fits its card (on load, window resize, card resize); − and + zoom inside the card, which scrolls.

Chris, 2026-11-14, on round 5: "I dont like the cursors." The per-mode cursor cue is dropped; Penpa's own cursor stays.

Chris, 2026-11-14: "I like the window changing color with mode, but in pinned modes at the very least, every mode should be a different color, it shouldnt be a static mapping of colors to mode." Replaces round 5's frame colour by mode family: colour is assigned per pin, so every pin differs, two pins on one mode included.

Chris, 2026-11-14: "I like the mode switch popup but it could be a little less intrusive (maybe smaller, a bit more transparent, something else?)." The flash stays, toned down.

Chris, 2026-11-14: "The mode chips in pinned mode shouldn't have the main type in bold font. It should just list the sub-type (or a combined main > sub title) and not show the settings. Keep it compact." A pin chip is one line: the sub-mode, or "Mode > Sub-mode"; no style or settings on it. Built in round 6.
