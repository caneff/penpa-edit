# penpa-edit (caneff's fork of Penpa+)

Chris's fork of Penpa+ (`swaroopg92/penpa-edit`), served by GitHub Pages from `master:/docs` at `https://caneff.github.io/penpa-edit/`.
Changes are made straight in Penpa+'s source. A Tampermonkey script, `userscript/penpa-redirect.user.js`, sends every
`swaroopg92.github.io/penpa-edit/` link to the fork with its query and `#` data unchanged, so shared puzzle links open here (Chris,
2026-11-09). It is for Chris's own use until the upstream sync has run for a couple of weeks; then it may be released.

- **Read `docs/agents.md` first**: upstream's architecture overview and its four rules for AI agents (minimal modifications, readability, no
  guessing, document new code). They hold here too.
- **Upstream**: the `upstream` remote is `swaroopg92/penpa-edit`, branch `master`. Its changes are merged into our `master`, never rebased:
  `CODING_STANDARDS.md` § Upstream merges says how to keep our changes easy to merge. No pull request goes to upstream (Chris,
  2026-11-09): fixes to Penpa+'s own bugs, such as the Tab counter, are made here.
- **Share links point at the fork** (Chris, 2026-11-09). `maketext_baseurl()` in `docs/js/class_p.js` already builds links from
  `location.href`; only its localhost / `file://` branch names upstream's address.
- **Our files**, outside upstream's: `AGENTS.md`, `CLAUDE.md`, `CODING_STANDARDS.md`, `GLOSSARY.md`, `.agents/` (the skills' tracker,
  label and domain docs; upstream already has a `docs/agents.md`, so ours cannot be `docs/agents/`), `research/` (notes read from Penpa+'s
  source, outside `docs/` so Pages does not serve them) and `userscript/`.
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

Single-context: a root `GLOSSARY.md` and upstream's `docs/agents.md`, plus `docs/adr/` once one is needed. See `.agents/domain.md`.

## Coding standards

Before you write or review code: read `CODING_STANDARDS.md`.

## End-to-end seam

None yet. Upstream's `npm test` is a `nodemon` watch on `test/test_server.js` (snapshot checks under `test/snapshots/`), not a
one-shot run, and `TESTING.md` lists puzzle links to try by hand. The first code ticket sets up the seam: a one-shot test command, live tests
on the page in headless Chromium (Playwright) under `live/`, and CI. Until then, name what you ran by hand.
