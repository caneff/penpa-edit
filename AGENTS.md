# penpa-edit (caneff's fork of Penpa+)

Chris's fork of Penpa+ (`swaroopg92/penpa-edit`), served by GitHub Pages from `master:/docs` at `https://caneff.github.io/penpa-edit/`.
The fork is splitting from upstream (Chris, 2026-11-09): upstream's engine files (parsers, grid classes, checkers) keep
being merged; the UI becomes ours, rebuilt against an engine API; `docs/js/class_p.js` is split step by step into the two.
The plan is the `/wayfinder` map on the tracker. A Tampermonkey script, `userscript/penpa-redirect.user.js`, sends every
`swaroopg92.github.io/penpa-edit/` link to the fork with its query and `#` data unchanged, so shared puzzle links open here (Chris,
2026-11-09). It is for Chris's own use until the upstream sync has run for a couple of weeks; then it may be released, branded
ChinStrap, Chris's setter name (Chris, 2026-11-09). Penpa+'s MIT copyright lines stay.

- **Read `docs/agents.md` first**: upstream's architecture overview and its four rules for AI agents (minimal modifications, readability, no
  guessing, document new code). They hold here too.
- **Upstream**: the `upstream` remote is `swaroopg92/penpa-edit`, branch `master`. Its changes are merged into our `master`, never rebased.
  A file we own is marked `merge=ours` in `.gitattributes`, so a merge keeps our side and upstream's change to it is ported by hand
  or dropped (git has no built-in `ours` driver: only `upstream-merge.sh` passes one, with `git -c`; never write it to a config); every other upstream file follows `CODING_STANDARDS.md` § Upstream merges. Nothing ever goes back to upstream: no commit,
  push or PR (Chris, 2026-11-13). `gh repo set-default` names `caneff/penpa-edit`, so `gh pr create` targets the fork.
- **Share links point at the fork** (Chris, 2026-11-09). `maketext_baseurl()` in `docs/js/class_p.js` already builds links from
  `location.href`; its localhost / `file://` branch names the fork's address too.
- **Our files**, outside upstream's: `.gitattributes`, `AGENTS.md`, `CLAUDE.md`, `CODING_STANDARDS.md`, `GLOSSARY.md`, `STREAM-FIT.md` (the contract with the stream userscript), `.agents/` (the skills' tracker,
  label and domain docs; upstream already has a `docs/agents.md`, so ours cannot be `docs/agents/`), `research/` (notes read from Penpa+'s
  source, outside `docs/` so Pages does not serve them), `adr/`, `userscript/`, `live/`, `.claude/settings.json`, `.claude/hooks/`, `docs/js/header_text.js`, `docs/js/recorder.js`, `docs/solve.html` (a copy of `index.html` plus the solve UI: port upstream's `index.html` changes to it by hand), `docs/gallery.html`, `docs/gallery.js` and `docs/gallery-puzzles.js` (the review page, #256: representative puzzles opened in `solve.html` at set sizes; `gallery-puzzles.js` is written by `node live/generate-gallery.mjs` from `live/gallery-puzzles.mjs`, which a live test checks it matches), `docs/ui/` (the solve UI; Web Awesome's bundle is vendored in it), `docs/js/engine_bridge.js`, `docs/js/penpa_layer.js`, `docs/js/progress_autosave.js`, `test/ui-boundary.test.mjs`, `test/snapshots.test.mjs`, `test/constraints.test.mjs`, `test/header-text.test.mjs`, `test/canonical-state.test.mjs`, `test/ui-fuzz-rules.test.mjs`, `test/ui-fuzz-nightly.test.mjs`, `test/userscript.test.mjs`, `test/upstream-merge.test.mjs`, `test/stub-gh.mjs`, `test/package-scripts.test.mjs`, `test/run-live.test.mjs`, `test/nightly-seam.test.mjs`, `test/recordings-approve.test.mjs`, `test/expected-gate.test.mjs`, `test/recordings-hook.test.mjs`, `test/npm-ci-hook.test.mjs`, `test/required-checks.test.mjs`, `test/redirect-urls.mjs`, `test/run-narrowed.test.mjs`, `test/ci-concurrency.test.mjs`, `test/live-scratch.mjs`,
  `.github/workflows/`, `.github/actions/` and `.github/scripts/`.
- **`GLOSSARY.md`**: the vocabulary.
- **Phones and tablets**: no change of ours is checked, styled or demonstrated at a phone or tablet size, and no ticket asks for it.
  Upstream's own phone support is left as it is.

## Agent skills

- **Dispatch cap**: a controller has at most 6 workers out at once, and at most 2 whose tickets change the same file under `docs/js/`.

### Issue tracker

GitHub issues at `caneff/penpa-edit`, through `gh`. See `.agents/issue-tracker.md`.

### Triage labels

The six default roles, each label string equal to its role: `needs-triage`, `needs-info`, `ready-for-agent`, `ready-for-human`, `backlog`, `wontfix`. See `.agents/triage-labels.md`.

### Domain docs

Single-context: a root `GLOSSARY.md` and upstream's `docs/agents.md`, plus a root `adr/` (outside `docs/`, so Pages does not serve it). See `.agents/domain.md`.

## Coding standards

Before you write or review code: read `CODING_STANDARDS.md`.

## End-to-end seam

- **Seam**: `npm test && npm run test:live:changed`. `npm test` runs `test/constraints.test.mjs` (a Node check of `docs/js/constraints.js`), `test/header-text.test.mjs` (a Node check of `docs/js/header_text.js`), `test/canonical-state.test.mjs` (a Node check of `live/canonical-state.mjs`), `test/ui-fuzz-rules.test.mjs` (the solve page's UI fuzz rules, `live/ui-fuzz/rules.mjs`, on hand-made snapshots, and the unpin action of `live/ui-fuzz/actions.mjs`, on a fake page), `test/ui-fuzz-nightly.test.mjs` (the nightly UI fuzz's failure title, output reader and filing, `live/ui-fuzz/nightly.mjs`, on sample lines and fake runners), `test/ui-boundary.test.mjs` (no file under `docs/ui/` names Penpa's internals), `test/userscript.test.mjs` (the Redirect script), `test/upstream-merge.test.mjs` (the upstream merge's scripts, on scratch git repos), `test/package-scripts.test.mjs` (the scripts' concurrency cap), `test/run-live.test.mjs` (the live files' selection), `test/run-narrowed.test.mjs` (the narrowed command's listing and run), `test/nightly-seam.test.mjs` (the nightly seam's issue), `test/ci-concurrency.test.mjs` (CI's cancel-a-superseded-PR-run rule, #317), the expected-file gate's own tests (`test/recordings-approve.test.mjs`, `test/expected-gate.test.mjs`, `test/recordings-hook.test.mjs`, `test/required-checks.test.mjs`), `test/npm-ci-hook.test.mjs` (the hook that refuses `npm ci` through a symlinked `node_modules`, #240) and, once in headless Chromium
  (Playwright) over `file://`, upstream's puzz.link import snapshots (`test/snapshots.test.mjs`, the puzzle list read from upstream's
  `test/public/puzz_link_parser.js`); a missing or changed snapshot, or a snapshot file with no puzzle in the list, fails
  it, and nothing writes one. `npm run test:live:changed` runs the live files the change since `origin/master`'s merge base
  needs (`live/run-live.mjs`, #268, #315, untracked files counted). A change to an input of the engine side runs the full
  set: a file `docs/index.html` loads, read from the page and the scripts and sheets it reaches (`pageReach`, which
  `live/page-reach.live.mjs` checks against what the page asks for), a module or `live/`/`test/` path the engine side's
  live files import or name, `package*.json`, `.github/workflows/ci.yml`, `.github/actions/**` or the script itself. The engine side is the safety net's files
  but the UI driver's replays: `live/engine-replay-*.live.mjs`, `live/replay.live.mjs`, the fuzz, Tier C, the plants'
  `live/safety-net.live.mjs` and `live/upstream-links.live.mjs`. Any other change off the skip list (`docs/ui/**`,
  `research/**`, `adr/**`, `*.md`, and the files `live/*.live.mjs` outside the safety net's) runs every live file but the
  engine side's, the UI driver's replays `live/ui-replay-*.live.mjs` included; a change made only of skip-list paths runs
  every live file but the safety net's. No change, or a detection that fails (an unreadable base, page or module), runs the full
  set, and it prints which set it chose and why. `npm run test:live` is the full
  set: it runs, through the same script,
  `live/**/*.live.mjs` (`node:test` + Playwright, helpers in `live/page.mjs`, `live/pin-card.mjs`, `live/desk-layout.mjs`, `live/settle.mjs`, `live/upstream-docs.mjs`, `live/canonical-state.mjs`, `live/replay.mjs`, `live/engine-replay-part.mjs`, `live/ui-replay-part.mjs`, `live/fuzz.mjs`, `live/plants.mjs`, `live/puzzlink-cases.mjs`, `live/gallery-puzzles.mjs`, `live/tier-c.mjs`, `live/tier-c-puzzles.mjs` and the UI fuzz's `live/ui-fuzz/*.mjs`), replays every
  recording under `live/recordings/` on the engine driver against its expected file (one with none fails; at its first and last checkpoint it also loads the board's duplicate link in a fresh page and checks the same board comes back, and with `REPLAY_FULL_ROUND_TRIPS=1` set, at every checkpoint, which the nightly's call of `ci.yml` sets through its `full-round-trips` input, #267), replays the
  hand-made recordings and a sample of the generated ones on the UI driver against the engine driver, on Penpa+'s page
  and on `solve.html` (`live/replay.mjs`, `live/ui-replay-part.mjs`), and fuzzes a few puzzles with fixed seeds against the solving
  invariants, saving a failing run as a recording under `live/recordings/fuzz/`. Tier C (`live/tier-c.live.mjs`) runs the
  answer-aimed fuzz on each of its puzzles and turns a Replay link into a recording; its kept recordings under
  `live/recordings/solve/` are written by `node live/generate-tier-c.mjs`, a solver's history by its `--history`. It also opens the Penpa links the fork writes (the save dialog's, the progress store's; not the .pp and .gmp file texts) on `upstream/master`'s own files and checks the board matches the fork's (`live/upstream-links.live.mjs`; it needs the `upstream/master` ref, which CI fetches). It also checks that each plant undoing an
  audit fix still applies to its file and fails a recording made for that finding (`live/safety-net.live.mjs`). It also runs the solve page's UI fuzz on a scripted
  action list on each of its puzzles, and a seeded run on a page that throws on one action, and one on a page that breaks a rule on one, whose printed replay must fail
  again on the same step, and one on each planted solve-UI bug (`UI_PLANTS` in `live/plants.mjs`), which it must shrink to
  at most 5 steps and replay, the same seed passing with no plant in (`live/ui-fuzz.live.mjs`, #195, #233). It also opens the review page (`live/gallery.live.mjs`, #256) and steps through every puzzle it lists, checking each loads its board, the size picker and the address. In both commands, a page error or
  `console.error` on a page `openPenpa` or `openReloader` opened fails the test it happened in (`useBrowser`), the network is stubbed, and
  waits use `settle`, never a sleep. Both cap node at `--test-concurrency=4` (`live/run-live.mjs` holds the live files' flags), so at most 4 test files run at
  once on the shared box.
- **Narrowed**: `node live/run-narrowed.mjs --changed origin/master`: `npm test`, then the live files CI's `live` job would run for
  the change since that ref (`live/run-live.mjs`'s rule above); `--list` prints one suite per line. A detection that fails runs the full set and says why (#316).
- **CI**: `.github/workflows/ci.yml` runs `npm test` (job `unit`) and the live files spread over four runners (job `live`,
  `node live/run-live.mjs --part <k>/<n>`) on every PR and push to `master`, behind job `test`, which fails unless both
  passed; a PR runs the live files its change needs, by the rule above, and a push the full set. It also runs the
  expected-file gate on every PR (job `expected-files`, below). `.github/workflows/nightly.yml` runs CI's jobs on
  `master` every night with the full set and files one issue on a failure, or comments on the open one (#268). `.github/workflows/ui-corpus.yml` replays every recording on the UI driver
  nightly, a recording that still differs marked `todo` with its ticket (#80). `.github/workflows/ui-fuzz-nightly.yml` runs `npm run fuzz:ui:nightly` (`live/ui-fuzz/nightly.mjs`) for 30 minutes on a fresh seed each night, and files one `bug` + `needs-info` issue per new failure title or comments on the open one (#234); its manual dispatch has a `dry_run` input that prints the issues instead. `.github/workflows/upstream-merge.yml` merges upstream nightly and pushes
  only when both pass on the merged tree and it changes no expected file; it also files one `needs-triage` issue per upstream
  commit that touched an owned file (Chris, 2026-11-14). `.github/scripts/require-checks.sh` makes both
  jobs required on `master` and strict (#221: a PR must contain the current master, else GitHub reports it BEHIND), with the admin role able to bypass; the nightly posts their statuses on the commit it
  tested before it pushes.
- **Expected-file changes** (#33): a ticket whose fix changes a recording's expected file lists each recording before the
  fix, under a `## Expected changes` heading, one bullet per id: a backticked id, a colon, the change in words. The
  controller approves only those ids, with the approve command (`npm run recordings:approve -- <id> ...`, no "update
  all"), which prints each file's change in plain words before it writes; every other change, and every change an
  upstream merge brings, goes to Chris. CI's `expected-files` job fails a PR that changes an expected file no ticket it
  closes listed before the fix started (the earliest author date of the PR's commits), passes a new recording, and posts
  each change in plain words as a PR comment. A ticket edit starts no run: re-run the job after one. Workers in
  `.claude/worktrees/` are denied writes to `live/recordings/**` and the approve command
  (`.claude/hooks/deny-recording-writes.mjs`).
- **Blind to**: phones and tablets, and anything `TESTING.md`'s links exercise that no test opens. Upstream's in-browser
  Mocha page stays as `npm run test:browser`; it is not part of the seam. Nor is `npm run measure` (`live/measure.mjs`,
  #32), which replays the whole corpus with JS coverage on and hunts every plant. It is run by hand, and nothing
  enforces when; its last tables are in `research/safety-net-measure-2026-11.md`. Nor is `npm run fuzz:ui -- [--seed <n>] [--minutes <m>]
  [--puzzle <name>] [--max-steps <n>] [--path <printed path>] [--focus <area> ...]` (`live/ui-fuzz/run.mjs`, #195): random fast-check action
  lists on `solve.html`, 2 minutes by default, `--focus` drawing one area's actions more often, a crash or broken rule shrunk and printed
  with the command that replays it (naming its puzzle), and a run that checked no list printed as "gave no verdict" with exit 1.
- **Playwright** is an approved dev dependency (Chris, 2026-11-09).
- **fast-check** is an approved dev dependency, for the solve.html UI fuzz (#195) (Chris, 2026-11-16).
- **CI runs on GitHub Actions here**, an exception to the local-CI rule: the repo is public, so Actions minutes are free, and
  the nightly upstream merge (#3) must run unattended (Chris, 2026-11-09).
- **The test plan** is `research/fork-audit-2026-11.md` § Test plan: each audit bug gets a red test, marked `todo` with its
  ticket until the fix lands.
