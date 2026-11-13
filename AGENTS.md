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
  or dropped (git has no built-in `ours` driver: each clone and CI set `git config merge.ours.driver true`); every other upstream file follows `CODING_STANDARDS.md` § Upstream merges. Nothing ever goes back to upstream: no commit,
  push or PR (Chris, 2026-11-13). `gh repo set-default` names `caneff/penpa-edit`, so `gh pr create` targets the fork.
- **Share links point at the fork** (Chris, 2026-11-09). `maketext_baseurl()` in `docs/js/class_p.js` already builds links from
  `location.href`; only its localhost / `file://` branch names upstream's address.
- **Our files**, outside upstream's: `AGENTS.md`, `CLAUDE.md`, `CODING_STANDARDS.md`, `GLOSSARY.md`, `.agents/` (the skills' tracker,
  label and domain docs; upstream already has a `docs/agents.md`, so ours cannot be `docs/agents/`), `research/` (notes read from Penpa+'s
  source, outside `docs/` so Pages does not serve them), `adr/`, `userscript/`, `live/`, `test/snapshots.test.mjs`, `test/constraints.test.mjs`, `test/userscript.test.mjs`, `test/upstream-merge.test.mjs`, `test/redirect-urls.mjs`, `.github/workflows/`, `.github/actions/`
  and `.github/scripts/`.
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

- **Seam**: `npm test && npm run test:live`. `npm test` runs `test/constraints.test.mjs` (a Node check of `docs/js/constraints.js`), `test/userscript.test.mjs` (the Redirect script), `test/upstream-merge.test.mjs` (the upstream merge's scripts, on scratch git repos) and, once in headless Chromium
  (Playwright) over `file://`, upstream's puzz.link import snapshots (`test/snapshots.test.mjs`, the puzzle list read from upstream's
  `test/public/puzz_link_parser.js`); a missing or changed snapshot, or a snapshot file with no puzzle in the list, fails
  it, and nothing writes one. `npm run test:live` runs
  `live/**/*.live.mjs` (`node:test` + Playwright, helpers in `live/page.mjs` and `live/settle.mjs`). In both, a page error or
  `console.error` on a page `openPenpa` opened fails the test it happened in (`useBrowser`), the network is stubbed, and
  waits use `settle`, never a sleep.
- **CI**: `.github/workflows/ci.yml` runs both on every PR and push to `master`. `.github/workflows/upstream-merge.yml`
  merges upstream nightly and pushes only when both pass on the merged tree.
- **Blind to**: phones and tablets, and anything `TESTING.md`'s links exercise that no test opens. Upstream's in-browser
  Mocha page stays as `npm run test:browser`; it is not part of the seam.
- **Playwright** is an approved dev dependency (Chris, 2026-11-09).
- **CI runs on GitHub Actions here**, an exception to the local-CI rule: the repo is public, so Actions minutes are free, and
  the nightly upstream merge (#3) must run unattended (Chris, 2026-11-09).
- **The test plan** is `research/fork-audit-2026-11.md` § Test plan: each audit bug gets a red test, marked `todo` with its
  ticket until the fix lands.
