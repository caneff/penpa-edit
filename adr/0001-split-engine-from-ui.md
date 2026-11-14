# Split the fork: merge upstream's engine, own the UI

The fork keeps merging upstream Penpa+'s engine files (importers, grid classes, checkers), and rebuilds the UI as files it
owns, marked `merge=ours` in `.gitattributes`, against an engine API; `docs/js/class_p.js`, which mixes both, is split step
by step. The audit (`research/fork-audit-2026-11.md`) put most bugs in the UI files, which also hold nearly all the DOM
coupling (the engine-side importers and checkers use 0-8 element ids; `general.js` alone uses 134), and Chris will not
send work back upstream unless it is a trivial port (Chris, 2026-11-09).

## Considered options

- **Contract layer only** (a keyboard layer and a mode indicator over upstream's UI): merges cleanly, but leaves layout,
  dialogs, dark theme and board size as upstream has them.
- **A new UI shell over upstream's engine**, with upstream's controls kept hidden in the page as the engine's switchboard:
  avoids touching upstream files, but every upstream UI change has to be checked against the hidden controls.
- **Stop merging entirely**: simplest, but new puzz.link genres and grid fixes, upstream's steadiest stream, stop arriving.

## Consequences

- Upstream fixes to files we own are ported by hand or dropped; the nightly merge reports them.
- Git has no built-in `ours` merge driver, so every clone and CI set `git config merge.ours.driver true`.
- The link format stays upstream's, so puzzle links keep working on both sites.

## Sequencing (Chris, 2026-11-13)

The split stays the end state, but the new UI ships first as the MVP: a flagged solve page over the engine as it stands,
through a bridge that reads Penpa's internals and drives its hidden controls (the second considered option above, as an
interim step). The engine split follows under the safety net, and the bridge is reworked into the engine API then.

## The split, charted (Chris, 2026-11-14)

- **`class_p.js` becomes an owned file** at the split's first step, not before, and is cut into engine and UI files.
  Overriding its UI methods from our own files while it kept merging was considered and rejected. Upstream changed it
  in 35 commits in the year to 2026-11; each is now ported by hand or dropped, and the nightly merge files a triage
  issue for every upstream commit that touches an owned file.
- **Other upstream files** are owned only when owning one makes more organizational sense than patching on top of it.
  New UI code goes in new files.
- **The audit's duplicated logic is in scope**: the copied Problem and Solution branches of `undo`/`redo`/`record`,
  the stack handling copied into the `maketext*` functions, and the rules repeated in `make_solution` and
  `check_solution`. Each copy is merged into one in its own split step.
- **The old page is retired before the split**: the switch-over from the flagged page to the default happens at the
  end of the MVP, so no split step has to keep two UIs working on one engine.
- **Links stay upstream's in both directions**: every upstream link opens and works on the fork, every link the fork
  writes opens on upstream's site, and fork-only state never goes in a link.
- **The Engine API is the Bridge's interface**, re-implemented over the engine's own code and extended only where
  the split forces it. The new page drives the engine by calls, with no hidden legacy controls.
