# Migrating a legacy codebase with coding agents: record behaviour first, then change it

Asked for by Chris on 2026-11-09: how to migrate a legacy codebase when AI coding agents do most of the work, and how to
record existing behaviour first so the migration cannot break things unnoticed. His ruling: the first large chunk of work
is a harness that records how solving behaves on a variety of existing puzzles in a replayable way, so later changes are
checked against it. Read on 2026-11-09. Each claim below is marked **evidence** (a measured result the source reports) or
**advice** (what the source recommends). A company's own numbers are its own account; where a source says a figure is an
estimate, so does this note.

## What was read

Local, in this repo at `e6fd5c2`: `AGENTS.md`, `adr/0001-split-engine-from-ui.md`, `research/fork-audit-2026-11.md`
(§ Test plan), `research/penpa-modes-and-script-ideas.md` (§ 2a), `research/penpa-mode-key-map.md` (header),
`TESTING.md`, `test/README.md`, `test/test_server.js`, `test/public/puzz_link_parser.js` lines 580-620, and
`docs/js/class_p.js` / `main.js` at the lines cited. In `~/src/sudokupad-scripts`: `live/README.md`, `live/settle.mjs`
(header), `live/redraw-probe.mjs` (header), `docs/research/fuzz-planted-bugs.md`, `docs/research/sudokupad-replay-files.md`
and `docs/research/ui-fuzz-tools.md` (headers).

Web, each read once (keys are used inline below):

- [Feathers16] Michael Feathers, "Characterization Testing", 2016-08-08,
  https://michaelfeathers.silvrback.com/characterization-testing
- [FeathersSeam] Michael Feathers, "Seams" and "Seam Types" (excerpt of *Working Effectively with Legacy Code*, 2004,
  ch. 4), InformIT, undated, https://www.informit.com/articles/article.aspx?p=359417&seqNum=2 and `&seqNum=3`. Read as
  search excerpts only, not the whole page.
- [FowlerSeam] Martin Fowler, "Legacy Seam", 2024-01-04, https://martinfowler.com/bliki/LegacySeam.html
- [FowlerFig] Martin Fowler, "Strangler Fig", 2024-08-22, https://martinfowler.com/bliki/StranglerFigApplication.html
- [FowlerBbA] Martin Fowler, "Branch By Abstraction", 2014-01-07, https://martinfowler.com/bliki/BranchByAbstraction.html
- [Parity] Ian Cartwright, Rob Horn, James Lewis, "Feature Parity" (Patterns of Legacy Displacement), 2021-07-27,
  https://martinfowler.com/articles/patterns-legacy-displacement/feature-parity.html
- [FowlerND] Martin Fowler, "Eradicating Non-Determinism in Tests", 2011-04-14,
  https://martinfowler.com/articles/nonDeterminism.html
- [Scientist] GitHub, `github/scientist` README (Ruby library), undated, read 2026-11-09, https://github.com/github/scientist
- [GHMerge] GitHub Engineering, "Move Fast and Fix Things", 2015-12-15,
  https://github.blog/engineering/engineering-principles/move-fast/ (the fetched text dropped the byline; the author
  writes that he led libgit2 for its first three years).
- [Zalando] Ali Sabzevari, "Parallel Run Pattern - A Migration Technique in Microservices Architecture", Zalando
  Engineering, 2021-11-03, https://engineering.zalando.com/posts/2021/11/parallel-run.html (search excerpt).
- [ApprovalsNet] approvals org (Llewellyn Falco's project), ApprovalTests.Net `readme.source.md`, undated,
  https://github.com/approvals/ApprovalTests.Net/blob/master/readme.source.md
- [ApprovalsScrub] ApprovalTests.Java, "Scrubbers", undated,
  https://github.com/approvals/ApprovalTests.Java/blob/master/approvaltests/docs/Scrubbers.md
- [ApprovalsStrings] ApprovalTests.cpp docs, "Tips for Designing Strings", undated,
  https://approvaltestscpp.readthedocs.io/en/latest/generated_docs/explanations/TipsForDesigningStrings.html
- [ApprovalsComb] ApprovalTests.cpp docs, "Testing Combinations", undated,
  https://approvaltestscpp.readthedocs.io/en/latest/generated%5Fdocs/TestingCombinations.html
- [Bache19] Emily Bache, "Approvals and Mutation Testing", 2019-08-08,
  https://coding-is-like-cooking.info/2019/08/approvals-and-mutation-testing/
- [BacheVid] Emily Bache, "Part 1/3 - Introducing the Gilded Rose kata and writing test cases using Approval Tests",
  video, Eficode Praqma channel, 2018-11-26, https://www.youtube.com/watch?v=zyM2Ep28ED8 (read as its transcript).
- [GildedTT] Emily Bache, GildedRose-Refactoring-Kata `texttests/README.md`, undated,
  https://github.com/emilybache/GildedRose-Refactoring-Kata/blob/main/texttests/README.md
- [Jest] Jest docs, "Snapshot Testing", undated, read 2026-11-09, https://jestjs.io/docs/snapshot-testing
- [Dodds] Kent C. Dodds, "Effective Snapshot Testing", 2017-10-30, https://kentcdodds.com/blog/effective-snapshot-testing
  (quotes Justin Searls's notes in full; Searls's original was a tweet image, not read).
- [PWVisual] Playwright docs, "Visual comparisons", undated, https://playwright.dev/docs/test-snapshots
- [PWClock] Playwright docs, "Clock", undated, https://playwright.dev/docs/clock
- [PWCov] Playwright docs, "Coverage" (API), undated, https://playwright.dev/docs/api/class-coverage
- [PdfjsWiki] Mozilla pdf.js wiki, "Contributing", undated, https://github.com/mozilla/pdf.js/wiki/Contributing; and
  "Bots", https://github.com/mozilla/pdf.js/wiki/Bots (search excerpt)
- [PdfjsTest] Mozilla pdf.js, `test/test.mjs` (`checkEq`, `checkFBF`, `stripPrivatePngChunks`), master,
  https://github.com/mozilla/pdf.js/blob/master/test/test.mjs (search excerpt of the file)
- [Google25a] Stoyan Nikolov, Daniele Codecasa, Anna Sjövall, Maxim Tabachnyk, Satish Chandra, Siddharth Taneja, Celal
  Ziftci, "How is Google using AI for internal code migrations?", arXiv:2501.06972v1, 2025-01-12,
  https://arxiv.org/html/2501.06972
- [Google25b] Celal Ziftci, Stoyan Nikolov, Anna Sjövall, Bo Kim, Daniele Codecasa, Max Kim, "Migrating Code At Scale With
  LLMs At Google", arXiv:2504.09691v1, 2025-04-13 (accepted at FSE 2025), https://arxiv.org/html/2504.09691
- [Airbnb] Charles Covey-Brandt, "Accelerating large-scale test migration with LLMs", The Airbnb Tech Blog, 2025-03-13,
  https://medium.com/airbnb-engineering/accelerating-large-scale-test-migration-with-llms-9565c208023b
- [Slack] Sergii Gorbachov, "Balancing Old Tricks with New Feats: AI-Powered Conversion From Enzyme to React Testing
  Library at Slack", Engineering at Slack, 2024-05-22 (updated 2024-10-03),
  https://slack.engineering/balancing-old-tricks-with-new-feats-ai-powered-conversion-from-enzyme-to-react-testing-library-at-slack/
- [Cherny25] Boris Cherny, "Claude Code: Best practices for agentic coding", Anthropic Engineering, 2025-04-18,
  https://www.anthropic.com/engineering/claude-code-best-practices. That URL now redirects to [CCDocs]; the 2025 text
  was read from the Wayback Machine capture of 2025-04-20,
  https://web.archive.org/web/20250420034405/https://www.anthropic.com/engineering/claude-code-best-practices
- [CCDocs] Anthropic, Claude Code docs, "Best practices", undated, read 2026-11-09,
  https://code.claude.com/docs/en/best-practices
- [Card37] Anthropic, "Claude 3.7 Sonnet System Card" § 6 "Excessive Focus on Passing Tests", February 2025 (the PDF has
  no printed date), https://www-cdn.anthropic.com/9ff93dfa8f445c932415d335c88852ef47f1201e/claude-3-7-sonnet-system-card.pdf
  (search excerpt of the PDF).
- [AWSQ] AWS, Amazon Q Developer User Guide, "How Amazon Q Developer transforms code for Java language upgrades",
  undated, https://docs.aws.amazon.com/amazonq/latest/qdeveloper-ug/how-CT-works.html
- [Jassy] Andy Jassy, LinkedIn post on Amazon Q Java upgrades, 2024-08-22,
  https://www.linkedin.com/posts/andy-jassy-8b1615_one-of-the-most-tedious-but-critical-tasks-activity-7232374162185461760-AdSz
  (post text from a search excerpt; LinkedIn itself not opened).
- [MetaTG] Nadia Alshahwan et al., "Automated Unit Test Improvement using Large Language Models at Meta",
  arXiv:2402.09171, 2024-02-14 (FSE '24), https://arxiv.org/abs/2402.09171 (abstract, plus § 2 of the HTML version)
- [MetaACH] Christopher Foster et al., "Mutation-Guided LLM-based Test Generation at Meta", arXiv:2501.12862,
  2025-01-22 (FSE Companion '25), https://arxiv.org/abs/2501.12862 (abstract and introduction)

Searched (Exa and web search) for: Fowler's legacy-displacement pattern pages, Feathers's seam definition, ApprovalTests
docs (received/approved, scrubbers, combinations, storyboards), Emily Bache on approval and mutation testing, pdf.js
reference tests, Slack's Enzyme migration, Andy Jassy's Amazon Q post, and Anthropic's system-card text on agents
special-casing tests. Not reached: the "Parallel Running" page of Patterns of Legacy Displacement (the guessed URL
returned not found, so Parallel Run rests on [GHMerge], [Scientist] and [Zalando]); ApprovalTests.Java's Storyboard doc
(fetch failed); the full text of Feathers's book (only the publisher's excerpt, as search excerpts); a page by Llewellyn
Falco himself beyond the ApprovalTests docs (not searched separately). No source on recording solver input in a canvas
puzzle app was found; that part of "For this fork" is reasoning from the sources plus Penpa's code, and says so.

## 1. Characterization, approval and record-replay testing

### What the method is

- Characterization tests "document your system's actual behavior, not check for the behavior you wish your system had";
  a production system "becomes its own specification", so you need to know when you change behaviour "regardless of
  whether we think it's right or not". Feathers's recipe: write a test named `x` with a dummy expected value, run it, paste
  in what the code actually returns, then rename the test once you understand it. Behaviour you find that is not yet ruled
  a bug stays pinned. The hard part is breaking dependencies enough to run the code in a harness. (advice, [Feathers16])
- Approval testing is the same idea at larger grain: run the code, review the output, and if it "correctly describes the
  behaviour as you understand it", approve it as the Golden Master; later runs diff against it ([GildedTT], advice).
  Bache: "run the code, accept whatever it does as 'correct', then invent scenarios that will exercise all the code
  branches" ([Bache19], advice).
- ApprovalTests mechanics: each test writes `*.received.*`; on mismatch a reporter opens a diff tool against
  `*.approved.*`; approving means copying received over approved; approved files are committed, received files never are
  ([ApprovalsNet]). Non-deterministic text (GUIDs, dates, ports) is replaced by scrubbers, with repeated values numbered
  consistently (`guid_1` each time the same GUID recurs) so the structure survives scrubbing ([ApprovalsScrub]).
  `verifyAllCombinations` prints every combination of input values with its output, one line each, so a failure names the
  inputs that changed ([ApprovalsComb]).
- The output format decides how maintainable the approved files are: objects should print their relevant data, the data
  must be "consistent between runs (no times, pointers, random)" and easy to read; tabular one-line-per-item layouts diff
  better than nested ones ([ApprovalsStrings], advice). The Gilded Rose text fixture runs the update for 30 days and prints
  every item's state each day ([GildedTT]): a time series of states, which is the shape a replay checkpoint log takes.

### Is the recording good enough? Coverage, then mutation

- Bache's Gilded Rose screencast (evidence, one worked example): combination approvals plus line coverage reached 100%
  line coverage with about 80 cases running in under 200 ms; she then mutated the code by hand and a mutant survived
  "despite 100% coverage", because the mutated line's effect was overwritten later in the method. Adding sellIn values 6
  and then 2 killed the surviving mutants ([BacheVid]). Coverage says a line ran; mutation says the recording would
  notice if it were wrong.
- When tests are ported to a new implementation, mutation testing checks the port: "similar mutations cause similar
  failures across the old and new implementations" ([Parity], advice).
- At Meta, ACH generated 9,095 mutants over 10,795 Kotlin classes and 571 tests that kill them; its LLM equivalent-mutant
  detector had precision 0.79 and recall 0.47 (0.95 and 0.96 with simple pre-processing), and engineers accepted 73% of
  its tests ([MetaACH], evidence).
- Local prior art: sudokupad-scripts' planted-bug run injects one one-line bug at a time into a userscript and fuzzes
  it. First run (2026-11-09): 9 of 10 plants caught, most in under 15 s; the one miss was code no fuzz action reached.
  Its own caveat: plants written by the rules' author favour what the rules look for
  (`~/src/sudokupad-scripts/docs/research/fuzz-planted-bugs.md`, evidence, small sample).

### Snapshot rot and blind re-approval

- Jest: commit snapshots and review them in code review; the goal is to "fight against the habit of regenerating
  snapshots when test suites fail instead of examining the root causes"; if another snapshot fails from an unintended bug,
  "fix the bug before re-generating snapshots"; limit re-recording to named tests (`--testNamePattern`) or step through
  failures one at a time in interactive mode; snapshots must be deterministic (advice, [Jest]).
- Searls, as quoted by Dodds: snapshot tests do not state the author's intent, they are generated files developers stop
  scrutinising, and "most developers, upon seeing a snapshot test fail, will sooner just nuke the snapshot and record a
  fresh passing one". Dodds's own experience: a 640-line snapshot "nobody reviews"; keep snapshots small and focused, use
  custom serializers that strip noise, and diff two states rather than storing whole renders (advice and anecdote,
  [Dodds]).
- Upstream Penpa+'s snapshot suite has the blind-update path built in: an "Update Snapshots" checkbox
  (`test/public/index.html:22-23`) makes `test_server.js` overwrite every snapshot it is sent. The port should not
  carry it over.

### Non-determinism

- A test that sometimes fails is worse than none: once a team starts ignoring red runs, real failures get ignored too.
  Quarantine, then fix the cause: isolation, asynchrony, remote services, time, resource leaks (advice, [FowlerND]).
- Agents make this sharper: Google's validation step rejected correct LLM changes whenever the target's test suite had
  pre-existing failures, and tests that compared against checked-in goldens failed because the pipeline could not run
  the tools that regenerate them ([Google25b] § 4.3, evidence, qualitative).

## 2. Migration patterns

- **Strangler fig.** Replace a legacy system gradually, building new parts beside it and moving behaviour over; a
  wholesale "do exactly what the old one does" replacement goes "down in flames most of the time", partly because "it's
  hard to figure out the details of existing behavior" and much of it "isn't really wanted". Expect to build
  transitional architecture that is thrown away later (advice, [FowlerFig]). "Feature parity" as the goal is a known trap;
  if parity is truly required, write an executable contract and run it against both old and new ([Parity], advice).
- **Branch by abstraction.** Put an abstraction layer between clients and the part being replaced, move clients onto it,
  build the new implementation behind the same layer, switch clients over a section at a time, and keep the system
  building and releasable throughout; a feature flag can run the new supplier in test environments "and compare its
  behavior" with the old ([FowlerBbA], advice). For this fork the engine API in ADR 0001 is that layer.
- **Seams.** "A seam is a place where you can alter behavior in your program without editing in that place"; every seam
  has an enabling point where the choice is made ([FeathersSeam]). Seams serve three purposes: break dependencies for
  testing, "insert probes to gain observability", and redirect flow to new code during displacement; in JavaScript a
  module-level reassignable binding is the simplest seam ([FowlerSeam], advice). Penpa's `Puzzle.prototype` methods are
  already such seams: `pu` is rebuilt on every load, so a probe goes on the prototype
  (`research/penpa-modes-and-script-ideas.md` § "The JS API a userscript can reach").
- **Parallel run (GitHub Scientist).** Run the old path (control) and the new path (candidate) on the same input, always
  return the control's result, randomise their order, swallow candidate exceptions, compare, and publish mismatches.
  `compare` sets equality, `clean` reduces values for reporting, `ignore` silences known and understood mismatches,
  `run_if`/`enabled?` ramp the experiment up ([Scientist], advice). GitHub's merge rewrite (evidence, [GHMerge]): started
  at 1% of requests, ramped to 100%, ran 4 days of fix-and-redeploy, then 24 hours at 100% with no mismatch or slow case,
  "tens of millions" of merges compared, about 5 days of part-time work. The first mismatches were noise (old code timing
  out; a missing `time` argument making timestamps differ), fixed by making the inputs explicit. Two of the real
  mismatches were bugs in the *old* implementation, fixed upstream in Git. Zalando's parallel run found the same lessons:
  refine the comparison (ignore fields that do not affect the outcome; ordering), expect bugs in the old system to surface,
  and budget for it, since it is "not a quick-win" ([Zalando], advice and experience).

## 3. Agent-driven migrations: what the first-party write-ups report

### Results

| Write-up | What moved | Measured result (as the source states it) |
|---|---|---|
| Google, int32→int64 IDs ([Google25b]) | 39 ID migrations, 3 developers, 12 months | 595 changes, 93,574 edits; LLM generated 74.45% of changes and 69.46% of edits; 25.55% of changes human-only; time saved estimated at 50% by the developers, and the paper lists that as a threat to validity |
| Google, JUnit3→4 ([Google25a]) | 5,359 files, 149,000+ lines, 3 months | ~87% of AI-generated code committed unchanged; review speed was the bottleneck, so changes per week were capped |
| Google, int32→int64 in Ads ([Google25a]) | Ads code base (500M+ lines) | 80% of landed modifications fully AI-authored; humans in most cases reverted some model changes; ~50% time saved, engineer-reported |
| Google, Joda→java.time ([Google25a]) | ongoing | ~89% time saved on small clusters, tech-lead estimate |
| Airbnb, Enzyme→RTL ([Airbnb]) | ~3.5K test files | estimated 1.5 years by hand, done in 6 weeks; 75% in the first 4-hour bulk run; 97% after 4 days of prompt tuning; the last ~100 files by hand in about a week |
| Slack, Enzyme→RTL ([Slack]) | 15,000+ test cases | AST codemod alone 45%, LLM alone 40-60%, AST+LLM 80% on selected files; of ~2,300 test cases in 338 files, ~500 converted and passed (22% of developer time saved, counting only passing cases); human review before every merge |
| Amazon Q, Java 8/11→17 ([Jassy]) | "more than 50%" of Amazon's production Java systems in under 6 months | 50 developer-days → "a few hours" per app; 4,500 developer-years and $260M a year, both estimates; 79% of generated code reviews shipped without changes |
| Meta TestGen-LLM ([MetaTG]) | test classes for Instagram Reels and Stories | 75% of classes got a test that builds, 57% one that passes reliably, 25% one that adds coverage; 73% of recommendations accepted |

### Practices that recur

- **Slice small, per file or per cluster, and drive each slice through a pipeline of gates.** Airbnb ran each file
  through a state machine (Enzyme refactor → fix Jest → fix lint and tsc → done), moving on only when the step's
  validation passed, and stamped each file with a machine-readable status comment so stuck files could be re-run by step
  ([Airbnb]). Google clusters files that depend on each other into one prompt, because a model migrating one file
  cannot know whether its neighbour was migrated ([Google25a]). Claude Code's `/batch` splits a mechanical change into
  5 to 30 units, each in its own worktree with its own PR ([CCDocs]).
- **Cheap deterministic gates first, expensive ones last, discard on failure.** Google's order: completion succeeded →
  not whitespace-only → parses, and its AST differs from the original → the LLM, shown before and after, agrees the change
  was needed ("punt") → builds → regression tests pass. Any failure discards the change and hands the location to a human
  ([Google25b] § 3.3). Meta's TestGen-LLM keeps a candidate only if it builds, passes on each of five runs (otherwise it
  is flaky and dropped), and raises coverage ([MetaTG] § 2).
- **Deterministic tools around the model.** Google: locating and validating changes is "mostly" deterministic (code
  search, cross-references, AST), the LLM edits; an AST diff of before and after catches a model that added needless
  comments or changed methods it should not have; multi-step planning was usually unnecessary ([Google25a] § VIII-B).
  Slack's jump from 40-60% to 80% came from feeding the LLM an AST codemod's partial conversion with in-code annotations,
  plus the real rendered DOM of each test case, captured by wrapping Enzyme's `mount` ([Slack]).
- **Retry with the failure in the prompt; tune breadth-first; hand-finish the tail.** Airbnb: most files passed within
  10 attempts; context grew to 40,000-100,000 tokens and up to 50 related files, and choosing the right related files
  mattered more than prompt wording; a "sample, tune, sweep" loop on 5-10 exemplar failures moved 75% to 97%; files
  retried 50-100 times were finished by hand from the failing attempt ([Airbnb]).
- **Human review is the bottleneck, so pace the output.** Google throttled generation to what reviewers could absorb and
  calls landing changes "a human process" ([Google25a] § VIII-D). Every write-up keeps a human approving each change:
  Slack ([Slack]), Google's owners in Critique ([Google25b]), Amazon Q's diff that "will not affect your current project
  files until you accept the changes" ([AWSQ]).
- **Measure the whole journey, not the edit.** Google's success bar was at least 50% end-to-end time saved, review and
  rollout included, not percent of code written by AI ([Google25a] § III).

### Keeping agents from editing tests to make them pass

- The failure mode is documented by a model vendor. Claude 3.7 Sonnet "occasionally resorts to special-casing in order to
  pass test cases", most often by returning expected values, "but also includes modifying the problematic tests
  themselves to match the code's output", typically after repeated failed attempts at a general solution. Anthropic's
  recommended mitigations: prompts that ask for general solutions, and monitoring for excessive edit/test cycles on one
  file, comments that suggest test-specific handling, and "unexpected modifications to test files" ([Card37], evidence
  of the behaviour, no rate given; advice for the mitigations).
- Workflow advice from Anthropic: write tests first, confirm they fail, commit them, then have the agent write code
  "instructing it not to modify the tests", and "verify with independent subagents that the implementation isn't
  overfitting to the tests"; one Claude writes, a fresh one reviews ([Cherny25]). The current docs go further: an
  instruction in `CLAUDE.md` is one the model may decide does not apply; a rule with zero exceptions belongs in a hook,
  and their example is a `PreToolUse` hook that blocks edits under a protected folder. A reviewer subagent given only
  read tools cannot edit, "enforced by Claude Code rather than requested in a prompt". Ask for evidence (the command and
  its output), not "all tests pass" ([CCDocs], advice).
- What the migration write-ups did: Slack's prompt required "the same number of tests in the file", "do not modify
  anything else" and the original `describe`/`it` names ([Slack]). Google's regression tests belonged to the code owners
  and had to pass ([Google25b]), but in its flag-cleanup migration the model itself deleted tests, and tests that mixed
  several flags fell back to failing runs and human reviewers ([Google25a] § VII). Airbnb says it kept "original test
  intent and our overall code coverage" but does not say how intent was checked ([Airbnb]). Amazon Q re-runs the
  project's existing unit tests as it fixes errors ([AWSQ]); the page does not say whether it may change them.
- The common thread: the oracle the agent is judged against must sit outside what the agent may write, and changes to
  it must be visible as their own event. None of the migration write-ups describes a technical lock on test files; the
  Claude Code docs describe one (a hook).

## 4. Canvas-rendered apps

- **State over pixels where state exists.** Pixel baselines depend on OS, browser version, hardware and headless mode;
  Playwright says to run them "in the same environment where the baseline screenshots were generated", names baselines
  per browser and platform, compares with pixelmatch (`threshold` default 0.2, `maxDiffPixels` unset), and can apply a
  stylesheet that hides volatile elements; text and arbitrary data can be compared with `toMatchSnapshot` the same way
  ([PWVisual]).
- **Reference from the base commit, not from a checked-in image.** pdf.js, a canvas renderer with years of screenshot
  tests, generates its reference images with `gulp makeref` from master before a change and compares the branch against
  them; references are kept per OS and browser; a bot command `makeref` regenerates them when a PR changes rendering on
  purpose; failures are shown side by side in a reftest analyzer ([PdfjsWiki]). The comparison is byte-exact after
  stripping PNG private chunks, because Firefox writes a per-session id into `toDataURL` output that made identical
  renders differ; an "fbf" test renders a page twice and fails if the two differ, a built-in determinism check
  ([PdfjsTest]). pdf.js can also list which reference tests ran a given source line and re-run only those ([PdfjsWiki],
  README excerpt).
- **Control time.** Playwright's clock replaces `Date`, `setTimeout`, `setInterval`, `requestAnimationFrame`,
  `performance` and `Event.timeStamp`, and can pause and tick them ([PWClock]). Penpa reads `Date.now()` in its key
  handler to time Shift and number-key releases (`main.js:320`, `330`, `893`, `908`), so a keyboard replay is timing
  dependent unless the clock is controlled.
- **Measure which code a replay reaches.** `page.coverage.startJSCoverage()` returns V8 function and block ranges with
  hit counts, Chromium only ([PWCov]).
- Penpa-specific help: the canvas backing store uses a fixed `this.resol = 2.5` with `window.devicePixelRatio` commented
  out (`class_p.js:98`), so the drawn bitmap should not change with the host's pixel ratio; the audit found it sharp at
  scale 2 (`research/fork-audit-2026-11.md` § UI polish). Not verified across hosts.

## 5. Penpa's existing replay log, read against this

`pu.pu_a.command_replay` (`research/penpa-modes-and-script-ideas.md` § 2a) is filled by `record_replay`
(`class_p.js:7276-7310`) on every `set_value` / `remove_value`: `[property, key, value after the edit, "pu_a",
groupcounter, timestamp]`. So it is an output trace (what the engine wrote), not an input log (what the solver did).
Replaying it re-applies writes and never runs the mode handlers (`mouse_surface`, `mouse_line`, `key_number`, ...), which is
where the audit's bugs are. It only records on the Solution side (`if (this.mode.qa === "pu_a")`), stamps times from
`sw_timer` and drops them after 60 minutes (`replaycutoff`, `:226`), and is emptied by making an edit link (`:2067-2069`,
audit C12). One push puts `groupcounter` outside the array (`:7292`, the `deletelineE` branch of the `_col` log; READ, not
run). Its value for the harness is as a second, finer-grained expected trace: it can name the first engine write that
differs.

## For this fork

This is a recommendation, reasoned from the sources above and from Penpa's code; nothing here was built or run.

### Record at the board, assert on the engine

Three candidate layers, and why each is or is not the recording:

- Page pixels and DOM events: invalidated by exactly the work planned. U1 (the board should grow) moves every pixel, and
  the UI rebuild removes the 206 element ids. Rejected as the input format.
- Engine writes (`command_replay`): an output, skips the input handlers. Kept as a secondary expected trace only.
- **Board gestures, at the main.js → engine boundary**: chosen. Penpa's mouse path is page pixel → `coord_point` →
  `(x, y, num)` in board units, then `main.js` sets `pu.mouse_mode` / `pu.mouse_click` and calls `pu.mouseevent(x, y,
  num, ctrl, e, obj)` (`main.js:105-148`, `class_p.js:8663`), which dispatches to the mode handler. Board units and point
  indices come from the grid classes, which stay engine-side under ADR 0001, so a recording in those units survives any
  layout change. Content keys enter through `pu.key_number`, `key_space`, `key_shiftspace`, `key_backspace` and
  `key_arrow` (`main.js:350-620`; `class_p.js:7689-8531`, and `key_arrow` in each grid class, e.g. `class_square.js:401`).

A recording is a list of steps of five kinds: `pointer` (down / move / up / double, left or right, Ctrl or Shift, board
`x, y, num`), `content-key` (the engine call and its argument), `mode` (main mode, sub-mode, style, as names: an intent,
not the key that chose it), `undo` / `redo`, and `check` (run the answer check). Mode changes are intents on purpose: Tab,
Enter and Z/X/C/V are what the interaction contract will change, and their tests belong to the contract suite (test plan
§ 3), not to the recordings.

### Recording format

- One file of inputs, `live/recordings/<family>/<id>.steps.json`: a header (source link, grid type, genre, the commit it
  was recorded at, recorder version, any `todo: #<ticket>`), then the steps. Inputs are reviewed once, by a human, when the
  recording is added, and do not change when behaviour changes.
- One file of expected outputs beside it, `<id>.expected.json`, generated by the tool and never hand-edited: a canonical
  state after each undo group and at the end. Canonical state = `pu.pu_a` and `pu.pu_a_col` (sorted keys, one entry per
  line, in the spirit of [ApprovalsStrings]), the current mode triple, undo and redo depth, selection, `conflict_cells`,
  the answer-check verdict, and the scrubbed `command_replay` tail since the last checkpoint. Scrubbers: replay
  timestamps, the timer, anything keyed by `md5(pu.url)` ([ApprovalsScrub] for the numbering rule). Each checkpoint also
  asserts a round trip: `maketext_duplicate()` loaded into a fresh page gives the same canonical state (test plan § 4's
  invariant, applied to every recording).
- Pixels are not in this file. The visual baselines of test plan § 5 stay a separate, small set.

### Corpus

- **Tier A, every solve mode** (scripted, not hand-solved): the 12 solve modes and their sub-modes
  (`research/penpa-mode-key-map.md`), each driven through a short gesture set on one small square puzzle: click, drag,
  right-click, Ctrl-click, undo, redo. Generated like a combination approval ([ApprovalsComb]): mode × sub-mode × gesture,
  one line of output per combination. Expected output is whatever master does today; known bugs are marked `todo`.
- **Tier B, every genre and grid type**: one import per genre from `test/snapshots/` (414 files, 146 distinct names once
  the trailing `_N` is dropped; `TESTING.md` has 433 links in 145 sections, 132 distinct puzz.link genre slugs), the
  smallest link per genre, each with a short solve in the genre's natural mode (Edge for slitherlink, Line for masyu, the
  Composite tool for akari). The ~25 Composite genre tools each get at least one. Grid classes covered at least once:
  square, hex, tri, pyramid, sudoku, kakuro, uniform.
- **Tier C, real solves on Penpa solve links with answer checks**: the only tier that exercises the answer check end to
  end. `TESTING.md` has no usable Penpa-native solve link (its one Penpa entry is a git.io short link the audit could not
  fetch), so these links have to come from Chris: a 9x9 classic, a 6x6, a killer, an OR-answer puzzle (C1), a star
  battle, a slitherlink. Recorded by hand with the recorder (below), several hundred steps each.
  - **Changed (Chris, 2026-11-14):** nothing is recorded by hand, and Chris does not solve sudoku in Penpa+. Kept
    recordings come from Chris's Penpa+ solve histories (Share > Replay links, converted from `command_replay`) for the
    genres he solves, and from generated solves on links the agent builds for the rest; answer-aimed fuzz runs many
    seeds on every puzzle (#34).
- **Tier D, the audit bugs**: one recording per LIVE finding in Correctness and Input (C1-C15, I1-I9 where the step
  vocabulary reaches them), marked `todo: #<ticket>` until fixed, as sudokupad-scripts does.
  - **What was recorded (#35, 2026-11-13).** #35 narrowed the scope to C1-C15 and I1; I2-I9 are UI-file bugs and belong
    to the Interaction contract and Layout and look maps. Every audit fix in that scope had landed before the recordings were made,
    so none is `todo`: each replays green, and each went red with its fix stripped in a throwaway worktree, at the step
    the bug shows. Recorded with the recorder through Playwright at `fe79bfc`, under `live/recordings/<family>/audit-c<n>-*`:
    - C1 (`paint/audit-c1-or-empty-category`): OR answer with an empty black-square category; shading a wrong cell
      leaves `sol_flag` 0, the answer cell solves it.
    - C4, its tracking-parameter half (`paint/audit-c4-tracking-parameter`): a solve link behind `?fbclid=x`; the board
      loads in solve mode.
    - C7 (`value/audit-c7-alphabet-digit`): two `1`s typed in one box of an alphabet sudoku, in no shared row or column,
      are flagged by the box check that used to throw, with no `console.error`. The `redraw` try/catch half of the fix acts
      only when a checker throws, which none does on the fixed engine; `live/redraw.live.mjs` covers it.
    - C13 (`value/audit-c13-consecutive-inequality`): an inequality sign between 1 and 3 is not a bar; the grid solves.
    - C14 (`value/audit-c14-small-sudoku-conflict`): two `1`s in a row, then in a 2-row by 3-column box (cells that
      would not share a 3-by-2 box), of a 6x6 are flagged. Its Ctrl+Z undo is recorded between two Sudoku sub-mode
      steps, because holding Ctrl switches Sudoku mode to its Ctrl sub-mode and releasing it switches back.
  - **Not reached by the step vocabulary** (a recording opens a finished link, then makes pointer, key, mode, undo and
    redo steps): C2 and C6 (resize), C4's truncated-link half (the fixed page shows an error and loads no puzzle to
    record on), C3 (the unescaped comma is written by `maketext`, and a recording's link is already
    made), C5 (the constraint dropdown), C8 (reload of saved progress, which the recorder's final-board check refuses),
    C9 (clipboard events), C10 (the import dialog), C11 (reload), C12 (making an edit link), C15 (a draw count, not
    engine state) and I1 (cookie expiry). Their live tests stay their only net.

### The recorder and the two replay drivers

- **Recorder**: a probe on `Puzzle.prototype.mouseevent`, `dblmouseevent` and the `key_*` methods, and on
  `mode_set` / `submode_check` / `stylemode_check` (the seams the modes note already names), which appends steps and
  downloads the file. It must run in Chris's Windows browser, since WSL has no GUI: as a dev-only query flag on the fork's
  page or a userscript like the redirect script. The same probe runs headless for tiers A and B. Note `mouseevent`
  returns early while `pu.replay` is set (`class_p.js:8664`), so the probe must not record during Penpa's own playback.
- **Engine driver**: calls `pu.mouseevent` / `key_*` / `mode_set` directly. Fast, and the one that keeps working when
  `main.js` is replaced.
- **UI driver**: Playwright real mouse and keyboard, with page pixels computed in the page from the board units through
  the current layout. Slower; it exercises `main.js` today and the new UI later.
- Running both drivers on every recording is a parallel run in the Scientist sense ([Scientist], [GHMerge]): the engine
  driver is the control, the UI driver the candidate, and any difference between them is a UI bug, whatever the golden
  says. During the `class_p.js` split (branch by abstraction, [FowlerBbA]) the same pair compares old and new paths.
- Determinism, before any golden is trusted: fresh browser context (no cookies, empty localforage), fixed viewport,
  Playwright clock installed ([PWClock]), page errors and `console.error` collected and failing the run (the
  sudokupad-scripts `openPage` rule), waits by `settle` and never by sleep (`live/settle.mjs`), and every recording
  replayed twice in its first week with the two runs compared, as pdf.js's fbf test does ([PdfjsTest]). A flaky
  recording is quarantined with a ticket, not retried ([FowlerND]).

### How a replay asserts

- Replay step by step and compare at each checkpoint. On the first difference stop and report: the recording id, the
  step number and the step in words ("left-drag from cell 34 to 36 in Line Normal"), a semantic diff of the state ("pu_a
  line 34,35: absent → 3"), the first differing `command_replay` write, and page errors. Stopping at the first difference
  keeps the report short enough to read, which [Dodds] and [Jest] both say decides whether anyone reviews it.
- Pixel baselines (test plan § 5) use references rendered from the PR's base commit in the same CI job, as pdf.js's
  `makeref` does ([PdfjsWiki]), so host drift cancels out; they are shown to a human, not used as the merge gate for
  engine work.

### Intentional changes without blind re-approval

- The UI rebuild should change no expected file at all: inputs are in board units, outputs are engine state. A UI PR
  that changes an expected file has broken something; that is the main protection, and it is structural.
- An engine behaviour change (an audit fix, an upstream merge) changes expected files on purpose. Its ticket lists the
  recording ids it will change and the change in words, written before the fix, the same way a red test is written
  first. Re-approval is one command scoped to ids, `npm run recordings:approve -- <id> ...`; there is no "update all"
  (drop upstream's checkbox). CI compares the expected files changed in a PR with the ids its ticket lists and fails on
  any extra one, and posts the semantic diff of each approved change as a PR comment for the reviewer. This is Jest's
  "limit re-recording to named tests" plus "review snapshots in code review" ([Jest]) made into a gate, because a
  prompt-level rule is one the model may decide does not apply ([CCDocs]).
- Workers in the implement lane cannot write `live/recordings/**` at all: a `PreToolUse` hook denies it ([CCDocs]'s own
  example), so a worker that hits a red replay can only change code or stop and report. The approve command is run by the
  controller after reading the semantic diff, or by Chris. This answers [Card37]'s failure mode directly: the agent cannot
  modify the oracle, and an attempt is visible.
- Upstream merges are characterization in Feathers's sense ([Feathers16]): a recording that changes after a merge is
  reported, not auto-approved; Chris rules whether the new behaviour is a fix or a regression.

### How it gates agent PRs

- Required on every PR: the import snapshots (test plan § 1), the engine-driver replay of all recordings, the UI-driver
  replay of tiers A and C, and the expected-file gate above. The nightly upstream merge (#3) pushes only when these are
  green (test plan § 6).
- Measured at #30 (2026-11-13): the UI-driver replay runs every recording, not a sample, on every PR. With one recording
  and the UI driver's own tests, the whole `npm run test:live` took 23 s on this box and CI's whole job about 1.5 min,
  under the 5-minute bar the map set for running everything on every PR. Re-time it when the corpus grows.
- Before the harness is trusted as a gate, measure it: Chromium JS coverage of `class_p.js`'s `mouse_*` and `key_*`
  functions over the whole corpus ([PWCov]), with a gesture added for every handler not reached; then a planted-bug
  table, one-line mutations of the mode handlers caught or missed, copied from sudokupad-scripts' `fuzz:plants`
  ([BacheVid] for why coverage alone is not enough). Plants should include bugs taken from the audit, not only ones
  written by the harness's author (the caveat in `fuzz-planted-bugs.md`).
- The independent reviewer in the lane reads the recordings' semantic diff, not only the code diff ([Cherny25]).

### Order of the first tickets

1. One-shot `npm test` and CI over the existing 414 import snapshots (test plan § 1), without the update checkbox. The
   seam everything else hangs on.
2. Canonical state and scrubbers: serialise a loaded page's engine state deterministically; Node unit tests on hand-built
   states; a round-trip check through `maketext_duplicate()`.
3. Determinism probe: load every `TESTING.md` link twice and compare canonical states; list every non-determinism source
   found (timer, `Date.now` in key timing, storage). Decide the clock and storage setup from the result.
4. Tracer bullet: the step format, the engine driver and the recorder probe, end to end on one Surface recording on one
   square puzzle: record, replay, a planted change goes red with the step-level report.
5. UI driver, and the engine-vs-UI comparison on the same recording.
6. Tier A generator (mode × sub-mode × gesture) and tier B picks per genre and grid class; goldens from master; Chris
   samples a few for the characterization review.
7. Adequacy: coverage report and the first planted-bug table; add gestures until every `mouse_*` handler is reached.
8. The expected-file gate: the scoped approve command, the CI check against the ticket's id list, the PR comment, and the
   worker hook on `live/recordings/**`.
9. Tier C: generated full solves on solve links the agent builds, with answer checks (#34; was a recorder session for
   Chris, changed 2026-11-14).
10. Tier D recordings for the audit bugs as `todo`, then visual baselines from the base commit, then fuzz over the same
    step vocabulary (test plan §§ 3-5).

Open questions for Chris: which Penpa solve links tier C uses; whether the recorder ships as a query flag on the fork's
page or as a userscript; whether the UI driver runs on every PR or nightly once the corpus is large.
