# Polish hunt: a template for re-running the solve page's UI hunt

A polish hunt sends one read-only subagent per area of `docs/solve.html` (the desk) to find what a solver on a laptop
would hit, then the controller merges the findings, drops what is already ticketed, and puts the rest to Chris before
filing. First run 2026-11-16/17: six areas, about 75 findings, little overlap (only the resize refit was found twice).

## When to run it (Chris, 2026-11-17)

- After a wave of polish tickets has merged, to check the fixes and what they broke.
- Before releasing the redirect script or the paste-link page to other people.
- After any spec that adds a card or a dialog.

Not on a schedule, and not while the code it would look at is about to change: it re-finds filed bugs. The nightly UI
fuzz (#195) checks the mechanical rules (overlap, fit, one-line labels); the hunt is for what a rule cannot judge:
wording, size of text, what a label suggests, missing feedback.

## Areas (one opus subagent each, in the background)

1. Top bar and dialogs: timer, Pause, Undo and Redo, Restart, Settings, Open in Penpa+, the solved state.
2. Board card: fit across puzzles and sizes, zoom and Fit, conflict highlight, selection look, window resize.
3. Mouse and Rules cards: wording across many tools, Rules formatting and text size.
4. Tool cards: Pinned, Mode, Recent; pinning, pin keys, presets, search, swatches.
5. Keyboard and theme: Tab order, visible focus, shortcuts, every card and dialog in the dark theme.
6. Layout: card drag, resize from every edge, Reset layout, reload, switching between puzzles of different shapes.

## The shared brief

Each agent gets the brief below plus one line naming its area. Rewrite "Already known" from the open tickets before
each run.

```
Goal: find UI polish problems on caneff/penpa-edit's solve page, docs/solve.html (the desk: top bar plus its cards),
as a puzzle solver on a laptop would hit them. Report findings only. Do NOT edit any tracked file, commit, push, file
issues, or message anyone. Scripts and screenshots go under .scratch/polish/<area>/ in /home/caneff/src/penpa-edit.
Do not write a report file: the harness blocks subagent report files. Your findings are your final message.

How to look
- Node + Playwright (import { chromium } from 'playwright'), run from the repo root. One headless browser at a time;
  no servers. Launch with ignoreDefaultArgs: ['--hide-scrollbars'] or scrollbars stay hidden.
- Open file:///home/caneff/src/penpa-edit/docs/solve.html + a hash. Puzzles: each
  live/recordings/solve/<name>.steps.json has header.source, a ready hash (killer, sudoku-9x9, sudoku-6x6, starbattle,
  slitherlink, or-shading); also one puzzle with long rules text (most recordings have none).
- Main size 1366x768; also 1280x720 and 1536x864 where relevant, 1920x1080 once.
- Wait for the desk after load. Screenshot and Read the PNGs yourself; measure with page.evaluate
  (getBoundingClientRect, getComputedStyle) when a claim needs a number.
- Collect page errors and console errors; any is a finding.

Already known (do not report again)
<one line per open UI ticket: number and what it covers>

Report format (your final message)
At most 15 items, most visible first. Each: bug | polish | question; what is wrong (one sentence); where (card or
control, size, puzzle); evidence (screenshot path or a measured number); a one-line fix. A question says what you would
need to know. Then one line of what you checked and found fine. Keep the whole message under about 6000 characters:
a longer one is cut off.
```

## Lessons from the first run

- Five of the six final messages were cut off in the middle; asking for the rest cost a round trip each. Hence the
  length cap above.
- Asking agents to write a findings file failed: the harness denies it. The controller saves the merged list itself
  (under `.scratch/polish/<area>/FINDINGS.md`) so it survives a context reset.
- The "Already known" list kept duplicates near zero; keep it.
