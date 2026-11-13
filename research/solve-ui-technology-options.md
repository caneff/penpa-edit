# What to build the new solve UI in: plain JS, or which framework

Asked for on 2026-11-13 as input for the open question "what is the new solve UI's technology (plain JS or a framework,
which would be a new dependency)", fog on the map "First release: ChinStrap solve UI on the split engine"
(caneff/penpa-edit#5), owned by the Engine API (#9) or Layout and look (#8) maps. A recommendation for Chris to rule on,
not a decision. Read on 2026-11-13, repo at `b9a76c0`.

The UI in question is the chrome around the board: mode bar, current-mode indicator, rules dock, dialogs, settings, dark
theme, keyboard handling. The board stays on the canvas Penpa+'s engine draws. Desktop only. Agents write most of the
code; tests are `node:test` + Playwright; the site stays static on GitHub Pages; the UI calls the engine through a
narrow API (`adr/0001-split-engine-from-ui.md`).

Each claim is marked **docs** (the project's own documentation or release notes say it), **registry** (read from the
npm registry with `npm view`), **measured** (run here, method given), **paper** (a published benchmark), or **not
verified**.

## Recommendation

**Plain JavaScript: one custom element per piece of chrome, rendering into light DOM (no shadow DOM), loaded as
classic `<script>` files like the rest of `docs/js/`, native `<dialog>` for dialogs, and a small hand-written store
(an `EventTarget` holding UI state, subscribed to the engine API's change events). No build step, no new dependency.**

Why, in this repo's terms:

- **It is the only option that adds nothing to approve and nothing to build.** Every framework here is a new dependency,
  which `CLAUDE.md` puts behind STOP-and-ask. The UI's surface is small (a bar, an indicator, a dock, a few dialogs, one
  settings panel), and most of its state lives in the engine, not in the UI.
- **It loads where the planned tests load.** The fork audit's test plan runs the page headless over `file://`
  (`research/fork-audit-2026-11.md` § Test plan, item 1). In the spike below, a classic-script custom element worked over
  `file://`; Preact and Lit, which ship only as ES modules, did not (Chromium blocks module scripts from `file://`).
- **The published benchmarks favour plain code for writing and editing new code**, which is most of this work.
  WebCompass (2026) found framework-free code scored highest in generation and editing for all four models it tried,
  including Claude Opus 4.5, but not in repair, where React sometimes won (§ Evidence, agents).
- **It coexists with the legacy globals and the engine's canvas with nothing in between**: a custom element is a DOM node
  whose code calls `engine.*` like any other script, and Playwright's locators work on it as on any element.

**Cost.** Nothing to install or approve. What you give up: re-rendering is written by hand, so each element needs a
stated pattern (one `render(state)` method that rewrites its own subtree; event listeners attached once, not per render)
or agents will each invent their own. That pattern belongs in `CODING_STANDARDS.md` before the first UI ticket. Expect
more lines per component than a template library would need. If the chrome grows past a handful of stateful views, the
hand-written updates become the thing that breaks, and the next option is the way out.

**Runner-up: Lit 3**, vendored as the single prebuilt `lit-core.min.js` (15.7 KB minified, 6.1 KB gzip, measured), BSD-3-
Clause. It keeps the same unit, a custom element, so the plain-JS elements can move to it one at a time. Its cost:

- A new dependency, needing Chris's approval.
- The bundle is an ES module, so the UI scripts become modules. Tests then have to serve the page over HTTP (a few-line
  `node:http` static server in the test helper, or Playwright's own web server config), not `file://`.
- Shadow DOM by default: page CSS (the dark theme) does not reach inside a component. Theme through CSS custom properties,
  which do cross the shadow boundary, or opt out with `createRenderRoot() { return this; }`, which Lit's docs say is
  "generally not recommended" (§ Lit).
- Decorators need a compiler, so the no-build form is `static properties = {...}`. Agents trained on the TypeScript
  examples will reach for decorators.
- A trap found in the spike: the minified bundle uses short names (`this.m`) for its own internals, so a reactive property
  named `m` broke the element with `Cannot read properties of undefined (reading 'has')`. Short property names must be
  avoided.

Preact 11 with htm is a close third (§ Preact). Svelte and Solid both need a build step to be used as intended, which
the site does not have today.

## Comparison

Sizes are measured here on 2026-11-13: a counter component that subscribes to state, bundled with esbuild 0.28.2
(`--bundle --minify --format=esm`, `NODE_ENV=production`), then `gzip -9`. They are a floor for each library's runtime,
not a forecast of the UI's size. "Release cadence" counts stable versions in the npm registry from 2025-11-13 to
2026-11-13.

| | Build step | Min / gzip (measured) | Loads as classic script | Worked over `file://` (spike) | Shadow DOM | Latest, cadence | Licence |
|---|---|---|---|---|---|---|---|
| Plain JS + custom elements + hand-written store | None | 0 / 0 | Yes | Yes | Optional, off by choice | Web platform | n/a |
| Plain JS + `@preact/signals-core` store | None | UMD 6.1 KB / 2.2 KB | Yes (UMD global) | Not run (UMD, same path as row 1) | n/a | 1.14.5, 8 releases | MIT |
| Lit 3 (`lit-core.min.js`) | None (prebuilt bundle) | 15.7 KB / 6.1 KB | No, ES module | No | On by default | 3.3.3 (2026-05-14), 2 releases | BSD-3-Clause |
| Preact 11 + hooks + htm | None (import map) | 14.7 KB / 6.3 KB | No, ES module only since 11 | No | No | 11.2.0 (2026-11-06), 22 releases; htm 3.1.1 (2022-04-26), 0 | MIT; htm Apache-2.0 |
| Preact 11 + htm + `@preact/signals` | None (import map) | 22.3 KB / 8.9 KB | No | Not run | No | as above; signals 2.11.4 | MIT |
| Solid 1.9 + `solid-js/html` | Optional; no-build form is the slower one | 31.2 KB / 11.8 KB | No, ES module | Not run | No | 1.9.19 (2026-11-10), 9 releases; 2.0 at RC 21 | MIT |
| Svelte 5 | **Required** (compiler) | 49.5 KB / 18.5 KB | Output can be any format | Not run | Only for custom-element output | 5.57.3 (2026-10-26), 90 releases | MIT |

## Evidence per option

### Shared ground: the page today, and the spike

- The page loads 13 vendored libraries from `docs/js/libs/` (jQuery 3.7.0, SweetAlert2, select2, spectrum, ...) and 21
  first-party scripts by injecting classic `<script>` tags with `async = false` (`docs/index.html:81-130`). Everything is
  a global. Vendoring a file into `docs/js/libs/` is the existing convention for third-party code; there is no npm
  runtime dependency and no bundler (`package.json` has only test dev dependencies).
- The engine wires its own input: `main.js:77-84` adds mouse and touch listeners on `#canvas` and a `keydown` listener
  on `document`. Whatever the UI is written in, keyboard handling has to go through the engine API (or replace that
  listener in an owned file); no framework changes that.
- **Spike (measured).** In the scratchpad, a page with a classic global script standing in for the engine (`engine.mode`,
  `engine.setMode()`, `engine.onMode()`, drawing a rectangle on a `<canvas>`), then a mode bar in each of three forms:
  a plain custom element (classic script), Preact 11.2.0 + htm 3.1.1 vendored as `.mjs` files behind an import map, and
  Lit's `lit-core.min.js` vendored. Playwright (Chromium, headless) clicked the bar's "number" button by role, then
  read the indicator by test id, `window.engine.mode`, and a canvas pixel. Over HTTP (`python3 -m http.server`) all three
  passed: the UI drove the engine global, the engine redrew the canvas, and the UI updated from the engine's callback.
  Over `file://` only the plain custom element passed; Preact and Lit failed with Chromium's "Access to script at
  'file:///...' ... blocked by CORS policy". The Lit element rendered in shadow DOM and `getByRole` / `getByTestId`
  found its contents without extra code.
- Module scripts are deferred by default and need CORS for cross-origin fetches (MDN, `<script>`, [MDNScript], docs),
  which is why the module options fail from `file://`. They run after the classic scripts, so a module UI can rely on
  the engine globals being defined.
- Import maps are Baseline "widely available ... since March 2023" ([MDNImportMap], docs). `<dialog>` is Baseline since
  March 2022; `showModal()` makes the rest of the page inert, closes on Esc, and closes only the last-shown dialog when
  several are open ([MDNDialog], docs). That covers what SweetAlert2 does for the chrome's own dialogs.
- Playwright: "All locators in Playwright by default work with elements in Shadow DOM", except XPath and closed-mode
  shadow roots ([PWLocators], docs). So shadow DOM costs nothing in tests unless a component uses `mode: 'closed'`.

### Agents writing each option

- **WebCompass** (Lei et al., arXiv 2604.18224, 2026-04-20, [WebCompass], paper): four models (GPT-5.2,
  Gemini-3-Pro-Preview, Claude-Opus-4.5, Qwen3-VL-235B) on a 180-task subset, each done in React, Vue and Vanilla
  (plain HTML/CSS/JS). "Across all four models, framework-free code consistently yields the highest scores in Generation
  and Editing. In Repair, however, the Vanilla advantage diminishes: for instance, GPT-5.2 achieves its best Repair score
  with React." The authors attribute this to plain code having no build toolchain or framework syntax to get wrong, and
  React's component boundaries helping a model find a defect. Claude-Opus-4.5 Edit scores: Vanilla 78.31 / 72.47 /
  65.37 against React 55.84 / 49.10 / 42.24 (three dimensions). Lit, Preact, Solid and Svelte were not tested.
- **DesignBench** (arXiv 2506.06251v3, [DesignBench], paper): React, Vue, Angular and vanilla HTML/CSS; "MLLMs exhibit
  substantially lower performance in framework-based development compared to vanilla HTML/CSS". Screenshot-to-code
  tasks, older models (Claude 3.7, GPT-4o); a weaker fit for chrome driven by an engine API.
- **Web-Bench** (Xu et al., ByteDance, arXiv 2505.07473, 2025-05-12, [WebBench], paper): 50 projects of 20 dependent
  tasks. On four identical UI-framework projects, Claude 3.7 Sonnet (thinking) scored pass@2 React 60, Vue 40, Angular 50,
  Svelte 55. The Svelte project pins `svelte ^5.15.0` (read from `projects/svelte/package.json` in the repo). One project
  per framework, 20 tasks each, a 2025 model: weak evidence.
- **Svelte 5 specifically**: the Svelte team ships an MCP server, skills and subagents for coding agents ([SvelteAI],
  docs). Its November 2025 newsletter says the MCP server "should replace the copy/pasting of the Svelte docs that's often
  required to get LLMs to write valid Svelte 5 code" ([SvelteNov25], docs). The project's own statement that models
  default to the older syntax.
- **Preact 11** shipped 2026-09-30 ([Preact11], docs), after most models' training data; the changes from 10 are small
  (§ Preact), so agents will mostly write working Preact 10-style code, but they will not know the 11-only features
  without being told.
- **Not found**: any benchmark that measures Lit, Preact, Solid or custom elements. Searched: one Exa query for
  framework-level LLM front-end benchmarks (results: DesignBench, Web-Bench, WebCompass, FrontendBench, WebGen-Bench,
  WebApp1K, MESCoder), and Web-Bench's project list (`gh api repos/bytedance/Web-Bench/contents/projects`: no lit,
  preact, solid or web-components project; it has `dom`, `canvas`, `svg`, `esmodule` standards projects). Any claim
  about how well agents write those four is unsupported here.

### Plain JS with custom elements, no build

- **Build**: none. Classic scripts, so the `file://` harness keeps working (spike).
- **Size**: zero library bytes.
- **Coexistence**: a custom element is an ordinary DOM node; its callbacks call the engine's globals directly (spike).
  Rendering into light DOM means the existing and future page CSS, including a dark theme switched by a class or
  attribute on `<html>`, applies without plumbing.
- **Tests**: plain DOM; role and test-id locators as for any page (spike).
- **Agents**: the best-supported case in the benchmarks above for writing and editing; weaker for repair.
- **Maintenance**: the platform. Custom elements, `<dialog>`, `EventTarget` need no upgrades. The risk is the code's
  own: without a convention, each agent re-invents update logic.
- **Licence**: n/a.
- **Variant with a store library**: `@preact/signals-core` 1.14.5 has a UMD build (`dist/signals-core.min.js`, global
  `preactSignalsCore`; 6,081 bytes, 2,184 gzip, measured) that loads as a classic script, MIT, 8 releases in the last
  year (registry). It gives `signal`, `computed` and `effect` without any component library. Worth it only if the
  hand-written store grows derived state; it is a new dependency.

### Lit 3

- **Build**: none needed. Lit's docs offer prebuilt single-file bundles: "standard JavaScript modules with no
  dependencies - any modern browser should be able to import and run the bundles from within a `<script type="module">`"
  ([LitStart], docs). They are ES modules, so `file://` fails (spike).
- **Size**: `lit-core.min.js` 15,734 bytes / 6,120 gzip; `lit-all.min.js` 29,370 / 10,225 (measured, from
  `cdn.jsdelivr.net/gh/lit/dist@3`). Bundled from npm: 15,827 / 6,155 (measured).
- **Coexistence**: components are custom elements; the spike's Lit element drove the engine global and redrew the canvas.
  Shadow DOM is the default: "DOM APIs like `document.querySelector` won't find elements in the component's shadow DOM"
  and styles are scoped. Rendering into light DOM via `createRenderRoot()` returning `this` is possible, but "generally not
  recommended. Your element will not have access to DOM or style scoping" ([LitShadow], docs).
- **Decorators**: "Decorators are a proposed JavaScript feature, so you'll need to use a compiler like Babel or TypeScript
  to use decorators" ([LitShadow], docs). No-build Lit means `static properties`.
- **Trap (measured)**: a reactive property named `m` collided with the minified bundle's own `this.m` (the constructor
  sets `this.v`, `this.m`, ... in `lit-core.min.js`) and threw on construction. Renamed to `mode`, it worked. Not
  documented on the pages read; check before relying on any short name.
- **Tests**: Playwright pierces open shadow roots ([PWLocators], docs; spike).
- **Maintenance**: 3.3.3 on 2026-05-14; 2 stable releases in the last year; 3.0.0 on 2023-10-10 (registry). Slow and
  steady. Lit moved from Google to the OpenJS Foundation on 2025-10-14, with a steering committee from Google, Adobe,
  Reddit and independents ([LitOpenJS], docs).
- **Licence**: BSD-3-Clause (registry; header of the bundle).

### Preact 11 + htm (no build)

- **Build**: none. Preact's docs: it "fully supports building applications without" build tools, recommend import maps,
  and recommend htm as "the most popular [way] for those choosing to forgo a build step"; htm "supports all standard
  Preact features" ([PreactNoBuild], docs; the page read is v10's, which links a v11 version).
- **Preact 11 is ESM only.** "Preact 11.x distributes its core and add-on bundles exclusively as ES modules using the
  `.mjs` extension. The `.module.js`, CommonJS, and UMD bundles that Preact 10.x provided have been removed"
  ([Preact11Upgrade], docs). So no classic-script build of 11 exists. htm's own all-in-one `htm/preact/standalone.umd.js`
  bundles a Preact 10 build from 2022 (htm's dev dependency is `preact ^10.2.0`; registry), so the classic-script route
  means a frozen Preact 10.
- **Other 11 changes** ([Preact11Upgrade], docs): browser floor Chrome 71 / Safari 12.1 / Firefox 69 / Edge 79; refs
  forwarded by default; `useEffect` cleanup deferred until after paint ("Tests which assert immediately after unmounting
  may need to flush effects first"); numeric `style` values no longer get `px` outside `preact/compat`; `render()`'s
  third argument removed. Released 2026-09-29/30 ([Preact11], [Preact11Rel], docs).
- **Size**: preact + hooks + htm 14,707 / 6,337 gzip; with `@preact/signals` 22,252 / 8,928 (measured).
- **Coexistence**: Preact renders into a container element of the page; the spike's Preact bar drove the engine global
  over HTTP. Only one copy of Preact may be loaded ("Preact must be used only as a singleton", [PreactNoBuild], docs),
  which vendoring the files ourselves satisfies.
- **Tests**: plain DOM, no shadow roots.
- **Maintenance**: Preact 22 stable releases in the last year (registry), active. htm: last release 3.1.1 on 2022-04-26,
  last push to `developit/htm` 2024-02-01, 50 open issues, not archived (`gh api repos/developit/htm`). htm is small and
  done, or unmaintained, depending on how you read that.
- **Licence**: Preact MIT; htm Apache-2.0 (registry). Two licences to carry.
- **Not verified**: whether GitHub Pages serves `.mjs` with a JavaScript MIME type (module scripts are refused under a
  wrong one). Renaming the vendored files to `.js` and fixing their internal imports would sidestep it.

### Svelte 5

- **Build**: required. Svelte "uses a compiler to turn declarative components written in HTML, CSS and JavaScript ...
  into lean, tightly optimized JavaScript" ([SvelteOverview], docs). Using it here means adding a compile step (Vite or
  the compiler directly) whose output is committed under `docs/` or built in CI for Pages, plus a toolchain for agents
  to run before every test.
- **Size**: 49,518 / 18,544 gzip for one compiled counter component and `mount` (measured: compiled with
  `svelte/compiler` 5.57.3, bundled with esbuild). The largest runtime floor here.
- **Coexistence**: compiled output is ordinary JS and can call globals; not run in the spike.
- **Agents**: the project's own AI tooling and the newsletter line above say models need help to write valid Svelte 5
  ([SvelteAI], [SvelteNov25], docs). Web-Bench's single Svelte 5 project scored close to React ([WebBench], paper).
- **Maintenance**: very active, 90 stable releases in the last year; 5.0.0 on 2024-10-19 (registry).
- **Licence**: MIT (registry).

### Solid 1.9

- **Build**: optional, but the no-build form is the weaker one. Solid's `solid-js/html` README: tagged templates are
  "useful to use Solid in non-compiled environments", but "slightly less efficient than JSX ..., requires a larger runtime
  that isn't treeshakeable, and cannot leverage expression analysis, so it requires manual wrapping of expressions";
  reactive expressions must be wrapped in functions by hand, and event props on components need an explicit argument or
  they are turned into getters ([SolidHtml], docs). Each is a silent bug an agent can write.
- **Size**: solid + web + html 31,234 / 11,843 gzip (measured, tagged-template form; compiled JSX would be smaller,
  not measured).
- **Maintenance**: 1.9.19 on 2026-11-10, 9 stable releases in the last year; **2.0.0 is at release candidate 21
  (2026-11-04)**, with packages renamed to `@solidjs/web`, `@solidjs/html` and so on (registry; `gh api
  repos/solidjs/solid/releases`). Starting on 1.9 now means a major migration soon.
- **Licence**: MIT (registry).
- `docs.solidjs.com/guides/how-to-get-started-without-a-build` returned "Page Not Found"; the README above is the only
  no-build documentation read.

### Plain JS with a tiny reactive store

This is the recommendation's store, compared on its own: a ~30-line `EventTarget` subclass holding UI state (current
mode echo, open dialog, settings, theme) with `get`, `set` and a `change` event, or `@preact/signals-core` (row 2 of the
table) if derived values multiply. Either way the engine stays the source of truth for puzzle state; the store holds only
chrome state and mirrors what the engine API reports. No source was found that measures agents on hand-written stores;
the WebCompass result for framework-free code is the nearest evidence.

## Not determined

- How well agents write Lit, Preact, Solid or plain custom elements: no benchmark found (search scope above).
- Whether GitHub Pages serves `.mjs` as JavaScript.
- Svelte's and Solid's behaviour beside the engine's globals and canvas: not run in the spike.
- Solid's compiled-JSX size; Svelte's size with more than one component.
- Whether `file://` must stay supported for users, or only for the test harness. If tests move to a local HTTP server,
  the ES-module options lose their main practical cost here.

## Sources

Each read once on 2026-11-13.

- [MDNScript] MDN, "`<script>`: The Script element", last modified 2026-11-05,
  https://developer.mozilla.org/en-US/docs/Web/HTML/Reference/Elements/script
- [MDNImportMap] MDN, "`<script type=\"importmap\">`", last modified 2026-11-05,
  https://developer.mozilla.org/en-US/docs/Web/HTML/Reference/Elements/script/type/importmap
- [MDNDialog] MDN, "`<dialog>`: The Dialog element", last modified 2026-11-10,
  https://developer.mozilla.org/en-US/docs/Web/HTML/Reference/Elements/dialog
- [PWLocators] Playwright, "Locators", § Locate in Shadow DOM, undated, https://playwright.dev/docs/locators
- [LitStart] Lit, "Getting Started", § Use bundles, undated, https://lit.dev/docs/getting-started/
- [LitShadow] Lit, "Working with Shadow DOM", undated, https://lit.dev/docs/components/shadow-dom/
- [LitOpenJS] Lit Team, "Lit is Joining the OpenJS Foundation!", 2025-10-14,
  https://lit.dev/blog/2025-10-14-openjs/
- [PreactNoBuild] Preact, "No-Build Workflows" (v10 guide), undated,
  https://preactjs.com/guide/v10/no-build-workflows
- [Preact11] The Preact Team, "Preact 11", 2026-09-29, https://preactjs.com/blog/preact-11
- [Preact11Rel] preactjs/preact, release 11.0.0, 2026-09-30, https://github.com/preactjs/preact/releases/tag/11.0.0
- [Preact11Upgrade] Preact, "Upgrading from Preact 10.x", undated, https://preactjs.com/guide/v11/upgrade-guide
- [SvelteOverview] Svelte, "Overview", undated, https://svelte.dev/docs/svelte/overview
- [SvelteAI] Svelte, AI docs "Overview" and "MCP Server", undated, https://svelte.dev/docs/ai/overview and
  https://svelte.dev/docs/ai/mcp
- [SvelteNov25] Dani Sandoval, "What's new in Svelte: November 2025", 2025-11-01,
  https://svelte.dev/blog/whats-new-in-svelte-november-2025 (read as a search excerpt, not the whole page)
- [SolidHtml] solidjs/solid, `packages/solid/html/README.md` on `main`, undated,
  https://raw.githubusercontent.com/solidjs/solid/main/packages/solid/html/README.md
- [WebCompass] Xinping Lei et al., "WebCompass: Towards Multimodal Web Coding Evaluation for Code Language Models",
  arXiv 2604.18224, 2026-04-20, https://arxiv.org/html/2604.18224 (read as a search excerpt: § 4.3.2 and Table 6)
- [DesignBench] "DesignBench: A Comprehensive Benchmark for MLLM-based Front-end Code Generation", arXiv 2506.06251v3,
  https://arxiv.org/html/2506.06251v3 (read as a search excerpt)
- [WebBench] Kai Xu, YiWei Mao, XinYi Guan, ZiLong Feng (ByteDance), "Web-Bench: A LLM Code Benchmark Based on Web
  Standards and Frameworks", arXiv 2505.07473v1, 2025-05-12, https://arxiv.org/html/2505.07473 ; project list and
  `projects/svelte/package.json` from https://github.com/bytedance/Web-Bench
- npm registry (`npm view <pkg> version license time dist-tags`), 2026-11-13: `preact`, `htm`, `lit`, `lit-html`,
  `svelte`, `solid-js`, `@preact/signals-core`, `@preact/signals`.
- GitHub API, 2026-11-13: `repos/lit/lit`, `repos/developit/htm`, `repos/solidjs/solid/releases`.
- Measurements and spike: scratchpad only, nothing installed in the repo. Packages installed into
  `$SCRATCHPAD/sizes`, esbuild 0.28.2, Playwright from `~/src/sudokupad-scripts/node_modules`, Chromium headless.
