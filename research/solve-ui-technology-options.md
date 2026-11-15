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

Superseded for polish by § Polish (2026-11-15) below, which weighs libraries now that a new dependency is fine.

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

## Polish (2026-11-15)

Asked for after Chris's ruling of 2026-11-15, "a new dependency is fine if it makes it much more polished": which
libraries would make the new solve UI's chrome much more polished than plain JS on the web platform, and at what cost.
The chrome is variant L's, frozen at `a023d8a` on `prototype/solve-ui` (`docs/prototype/solve-ui/variant-L.js` and
`.css`; rulings in `research/solve-ui-prototype-verdicts.md`). Read on 2026-11-15, repo at `f587238`. The 2026-11-13
facts above (sizes, `file://` spike, agent benchmarks) still hold and are not repeated. Claims are marked as above:
**docs**, **registry**, **measured**, **not verified**.

### Revised recommendation

**Keep the plain-JS custom elements of the 2026-11-13 recommendation, and add Web Awesome 3 (free tier, MIT) for the
stock controls, vendored as one prebuilt classic-script bundle.** Web Awesome supplies the top bar's buttons, the
dropdown menus (Presets, Mode cues), the style pulldown's select, tooltips, the restart and settings dialogs, the
settings switches, and the theme tokens with a dark theme. The desk, the cards' drag and resize, the pin and Recent
chips, the Mouse card, the mode flash and the mode picker stay hand-written plain JS, styled with Web Awesome's tokens;
the picker follows the WAI-ARIA combobox pattern (role `combobox`, `listbox`, `aria-activedescendant`), because Web
Awesome's own combobox is a paid Pro component.

Not through Web Awesome's ES-module loader: bundle the components we use once with esbuild into an IIFE and commit it
under `docs/js/libs/` beside the other vendored libraries. In the spike, eight components bundled that way (button,
dialog, dropdown, dropdown item, tooltip, select, option, input) came to 274,907 bytes, 69,996 gzip; the bundle loaded
as a classic `<script>` over `file://`, defined every element, opened and closed the dialog, made no network request and
logged no error or warning (measured, § Spike). So the test seam stays on `file://`, Pages stays a plain folder, and
there is no build step in an agent's loop; esbuild runs only when the vendored version is upgraded.

**Why this, and how much it buys.** The gain is mostly look and consistency, not behaviour. For behaviour, the platform
already matches Web Awesome on dialogs (focus moves in, Esc closes, focus returns to the opener: both measured), and no
library does much for L's desk (§ Per piece). Where Web Awesome wins is that every stock control comes styled, animated,
focus-ringed and dark-themed from one token set, and its menus and tooltips are keyboard-reachable out of the box; with
plain JS each of those is designed by an agent, piece by piece, which is where L's prototype is weakest today (pulldown
buttons carry `tabindex="-1"`, tooltips are `title` attributes, the picker has no ARIA roles: read in `variant-L.js`).

**Cost.**
- Two new dependencies to approve: `@awesome.me/webawesome` (runtime, vendored) and esbuild (a dev tool, or `npx`
  run at upgrade time). Plus a short vendor script that names the components bundled.
- About 70 KB gzip of JS for eight components, plus 2.6 KB gzip of theme CSS (measured): more than the vendored jQuery
  3.7.0 (87,462 bytes, 30,188 gzip) and SweetAlert2 (70,856, 19,016) the page already loads (measured).
- Shadow DOM: page CSS styles Web Awesome's insides only through its custom properties and `::part`.
- Agents' training data is Shoelace-era: Web Awesome is Shoelace's successor with renamed tags (`sl-` to `wa-`) and
  attribute values. In the spike `size="small"` logged "deprecated. Use size="s" instead" (measured). The package ships
  `llms.txt` and an agent skill (`skills/webawesome/SKILL.md`) that can be pointed at (measured, present in the package).
- `wa-icon`'s default icon library is Font Awesome's CDN (`ka-f.fontawesome.com` in the package code, measured); the
  dialog's close button uses the built-in `system` library and rendered offline (measured). L's own 16px SVG symbols
  stay.
- Penpa's document `keydown` handler (`main.js:294-297`) lets typing through only when `e.target.type` is `text` or
  `number`. Shadow DOM retargets the event to the host element; `<wa-input>`'s host reports `type` `text`, so typing in
  it passed through (measured). `<wa-select>` with arrow keys was not checked.

**Runner-up: plain JS on the platform alone**, as recommended on 2026-11-13, with Popover API menus, `<dialog>`,
`light-dark()` theming, `@starting-style` transitions and a hand-written token sheet, adding Floating UI's UMD build
(8.9 KB gzip, classic script) only if menus need to be kept clear of the window edges. It costs nothing to approve and matches Web Awesome's
behaviour on dialogs and popovers; it loses on look and consistency unless someone designs the tokens.

### Per piece of L's chrome

"Platform" means features usable without a polyfill; Baseline status is from web-features 3.46.0 ([WebFeatures],
registry), the dataset MDN's Baseline banners show. Anchor positioning, `<dialog closedby>`, `popover="hint"`,
`interestfor` and customizable `<select>` are **not** Baseline (Firefox or Safari lacks them), so none is relied on here.

| Piece | L at `a023d8a` | Platform alone | Best library help | Gain from a library |
|---|---|---|---|---|
| Desk cards: drag by header, resize by edge or corner, stay inside the window after zoom or resize | `mousedown` / `mousemove` on `document`, no pointer capture, no keyboard move; `place()` holds L's own policy (column stacking, anchoring to the nearer edge after zoom) | Pointer Events with `setPointerCapture` (Baseline 2020) and a `resize` re-clamp: about 25 lines in the spike kept a card inside on drag and on window shrink (measured) | Zag `floating-panel`: clamps to a boundary element on drag and on boundary resize (measured), arrow keys move a focused panel, Esc closes the topmost, `role="dialog"` with `aria-labelledby` (measured), stacking order, min / max size, 8 resize axes, grid snap ([ZagFP], docs; code read). interact.js clamps drags but not a window shrink (measured) | Small. Keyboard moving is the one real accessibility gain. L's placement policy is the hard part and is ours in every option; Zag keeps its own position state and re-clamps it, so it would have to run controlled (`position` / `size` props) to coexist with `place()` (not verified) |
| Mode picker: searchable list of every mode and sub-mode, grouped, with tag chips and a Pin toggle per entry | `<input>` plus a list, Up / Down / Enter / Esc handled by hand; no `combobox` / `listbox` / `option` roles, no `aria-activedescendant` (read) | No native filterable combobox; `<datalist>` cannot show groups, swatches or a Pin toggle | Zag `combobox`: roles, `aria-expanded`, `aria-activedescendant`, filtering, Enter selects (measured), 35 KB gzip with its positioning code (measured). Web Awesome's `<wa-combobox>` is Pro, paid ([WAComponents], docs). Base UI has a React Combobox (registry) | The largest accessibility gap in L, but it is a fixed, well-documented ARIA pattern that a hand-written element can follow; Zag only if that proves hard |
| Pulldowns: style (with swatches), Presets, Mode cues | Custom `div` lists, opened on click, flipped left by hand near the window edge; buttons have `tabindex="-1"` (read) | Popover API (Baseline 2025-01): top layer, Esc, light dismiss and focus back to the button (measured); position set by hand, since anchor positioning is not Baseline | Web Awesome `<wa-dropdown>`: `menuitemcheckbox` items, arrow keys, Esc returns focus to the trigger when opened from the keyboard (measured); open / close animation; `<wa-select>`. Floating UI's UMD build keeps a menu clear of the viewport edges (docs) | Moderate: look plus menu keyboard behaviour come for free. Whether `<wa-option>` can show L's colour swatches and drawn samples is not verified |
| Pin and Recent chips, drag to reorder | HTML5 drag and drop on `draggable` chips; no keyboard reorder (read) | Same drag and drop (Baseline since 2015) | SortableJS 1.15.7 (UMD, MIT; registry) animates the reorder. Keyboard reorder: not verified in any library | Small. Keyboard reorder is hand-written in every option |
| Mode-change flash (14px tag, about 350ms, 0.2s fade) | CSS opacity transition (read) | `@starting-style` and `transition-behavior` (Baseline 2024-08), Web Animations | Motion 14 (95 releases a year; registry) | None |
| Top bar symbol buttons (Undo, Redo, Restart, Pause, Settings, theme) with tooltips | `<button>`s with `aria-label` and a `title` tooltip (read): browser-drawn, delayed, never shown on keyboard focus | No Baseline styled tooltip (`popover="hint"` and `interestfor` are Chromium-only) | `<wa-tooltip>` (hover and focus), `<wa-button>`, `<wa-button-group>` ([WAComponents], docs) | Moderate, mostly visible |
| Dialogs: restart confirm, settings | Restart asks through Penpa's SweetAlert2; Settings opens Penpa's legacy panel (read) | `<dialog>.showModal()` (Baseline 2022): `autofocus`, Esc, inert page, focus back to the opener (measured). Tab is not held inside: after the last button, focus went to `<body>` once before coming back (measured) | `<wa-dialog>`: styled header, close button and footer, show / hide animation, a pulse when a close is refused ([WADialog], docs). Its Tab behaviour was the same as the native dialog's (measured) | Look only |
| Light / dark theme | `html.proto-l-dark` plus hand CSS, and Penpa's `color_theme` for the board (read) | `color-scheme` with `light-dark()` (Baseline 2024-05) switched a card's background (measured) | Web Awesome's `.wa-dark` class re-themes every component from one token set (measured on a button); tokens for colour, spacing, radius | Moderate: a coherent token set, which plain JS would have to write. The per-pin colour generator stays ours either way |
| Focus visibility and keyboard reach overall | Outlines on inputs and the open pulldown only (read) | `:focus-visible` (Baseline 2022) | Every Web Awesome control is focusable and ringed by default | Moderate |

### Evidence per candidate

#### Web Awesome 3 (framework-agnostic web components)

- **Version, cadence, licence**: 3.14.0 on 2026-09-24; 15 stable releases from 2025-11-15 to 2026-11-15; MIT
  (registry). The repo `shoelace-style/webawesome` was last pushed 2026-11-13 (GitHub API). Docs already describe a 3.15
  component, so the site runs ahead of npm (docs).
- **Free and Pro**: the component list marks Combobox, Data Grid, Date Input / Picker, File Input, charts and Video as
  "Pro. This requires access to Web Awesome Pro" ([WAComponents], docs). Dialog, Drawer, Dropdown, Popover, Select,
  Tooltip, Button Group, Switch, Split Panel, Color Picker, Tag are free (docs). Pro's price was not read.
- **Loading**: the documented routes are a CDN `<script type="module">` autoloader or npm imports for a bundler; `dist-cdn`
  is "bundled together, so you can use them directly without a build tool", and self-hosting needs a base path, set by a
  `data-webawesome` attribute or `setBasePath()` ([WAInstall], docs). Registry `type: module` (registry). A classic
  build is not offered; our own esbuild IIFE worked (measured, § Spike).
- **Trap (measured)**: self-hosted `dist-cdn` without `data-webawesome` resolved component paths against its own chunk
  directory and every element failed to autoload ("Unable to autoload <wa-button>"), as console warnings, not errors.
  The IIFE bundle has no autoloader and no base path for its system icons.
- **Size**: 8 components as an IIFE 274,907 / 69,996 gzip; served as ES modules from `dist-cdn`, 7 components pulled 84
  separate JS files, 441,407 bytes, 113,841 gzip summed per file (measured). Theme CSS `default.css` 16,773 / 2,610.
- **Dark theme**: `.wa-dark` / `.wa-light` classes in `styles/themes/default.css` (measured, grepped).
- **Behaviour** (measured, headless Chromium): dialog focus lands inside on open, Esc closes, focus returns to the opening
  button; dropdown items are `menuitemcheckbox`, ArrowDown moves focus, Esc from a keyboard-opened menu returns focus to
  the trigger, while Esc from a mouse-opened one left focus on `<body>`.
- **Shoelace** is sunset: "There is no active development on this codebase"; repo archived, last release 2.20.1 on
  2025-03-11 ([ShoelaceReadme], docs; registry). Pruned.

#### Zag 1.48 (headless state machines, vanilla adapter)

- **Version, cadence, licence**: 1.48.0 on 2026-11-13; 30 stable releases of `@zag-js/vanilla` in the year; MIT
  (registry). Repo pushed 2026-11-15 (GitHub API).
- **No look**: Zag supplies behaviour and ARIA attributes; every pixel of styling is ours ([ZagStart], docs). So it
  improves accessibility, not looks.
- **Vanilla use**: the getting-started page names React, Vue, Svelte and Solid only ([ZagStart], docs); a vanilla adapter
  exists on npm and in the repo's `examples/vanilla-ts` (registry; GitHub API). Usage is `new VanillaMachine(machine,
  props)`, then `spreadProps(node, api.getXProps())` on every part after each state change ([ZagVanillaEx], source read).
  Verbose: an agent must re-spread every part on every change.
- **Loading**: CommonJS and ESM only, with bare imports between `@zag-js/*` packages (registry). An esbuild IIFE worked as
  a classic script over `file://` (measured).
- **Size** (IIFE, min / gzip, measured): floating panel 49,317 / 16,904; combobox 107,940 / 35,107; both 134,542 /
  43,575.
- **Floating panel**: drag, resize on 8 axes, minimise / maximise, min / max size, grid snap, `getBoundaryEl`,
  `allowOverflow`, stacking via `--z-index` ([ZagFP], docs). Its content element moves 1 grid step per arrow key and
  closes on Esc when topmost (`floating-panel.connect.mjs:133-170`, source read); it re-clamps when the boundary element
  resizes (`trackBoundaryRect`, ResizeObserver; source read). In the spike, with `allowOverflow: false`, a drag far past
  the corner and a window shrink from 1200x800 to 700x500 both left the panel inside the desk (measured). With the
  default, the first drag ended 2px outside, a border my CSS added outside Zag's `--width`; `box-sizing: border-box`
  fixed it (measured).

#### Floating UI 1.8 (positioning)

- 1.8.0 on 2026-07-11, 3 stable releases in the year, MIT (registry). "Floating UI can be loaded via CDN using ESM or
  UMD format ... All exports will be available on `window.FloatingUIDOM`" ([FloatingUIStart], docs). UMD core + dom:
  22,594 bytes, 8,865 gzip (measured). Interactions (focus, dismiss, roles) are a React package only; the DOM package
  only positions (docs). Useful for keeping menus clear of the viewport edges if the Popover API's hand positioning falls short.

#### Desk and panel libraries

- **interact.js 1.10.28**: 2026-08-01, 1 release in the year, MIT; `dist/interact.min.js` loads as a classic script
  (registry; measured over `file://`). `restrictRect` keeps an element inside its parent while dragging ([InteractRestrict],
  docs). In the spike it did, but a window shrink left the card outside (measured): re-clamping is still ours. 98,203 /
  28,928 gzip (measured), more than the 25 hand-written lines it replaces. Pruned.
- **dockview 8.9**: a docking layout manager "supporting tabs, groups, grids and splitviews" ([DockviewReadme], docs);
  floating groups exist, bounded within the viewport, but each hosts tabs and a nested layout ([DockviewFloat], docs).
  42 releases in the year, MIT (registry). An IDE model, not a desk of fixed cards. Pruned.
- **gridstack 14.1**: "dashboard layout ... drag-and-drop, multi-column responsive dashboard" ([GridstackReadme], docs):
  cards snap to grid cells and columns, which changes L's free placement. 15 releases, MIT (registry). Pruned.
- **WinBox 0.2.82** (2023-07-13, repo last pushed 2024-08-15), **jsPanel4 4.16.1** (registry modified 2022-11-03),
  **golden-layout 2.6.0** (2023-02-21), **@neodrag/vanilla 2.3.1** (drag only, 2025-06-18): stale or too narrow
  (registry; GitHub API). Pruned.

#### Framework plus component kit

- **React 19 with Base UI or Radix**: React 19 ships no UMD build ("Starting with React 19, React will no longer produce
  UMD builds"; [React19Upgrade], docs), and JSX needs a compiler, so this means a real build step. Base UI 1.9.0
  (2026-10-09, 11 releases, MIT) and Radix are unstyled ([BaseUIStart], docs; registry): the look is still ours, so the
  polish over Zag is nil while the cost is a framework and a build. Pruned.
- **Svelte 5 with Bits UI 2.21** (2026-11-11, 37 releases, MIT; registry): headless ("Bring Your Own Styles";
  [BitsUI], docs) and the Svelte compiler is required (§ Svelte above). Pruned for the same reason.
- **Lit 3 with Web Awesome**: Web Awesome's components are built on Lit; its dependencies include `lit`, `@floating-ui/dom`
  and `@shoelace-style/animations` (registry), all inside the vendored bundle. Our own elements need not use Lit. Not worth a second library unless the plain elements' hand-written updates
  start breaking (§ Recommendation above).
- **Other web-component kits** read only in the registry: Material Web 2.5.0 (1 release in the year), Fluent UI web
  components 3.2.1 (11), Spectrum web components 1.12.6 (Apache-2.0). Not evaluated further.

### `file://`, tests and the build question

- **What moving tests to HTTP costs here (read, measured).** `live/page.mjs`'s `openPenpa` already has a `served: true`
  mode that answers `https://penpa.test/` from this checkout's `docs/` through Playwright's `context.route`, with no
  server process; 19 call sites use it (`grep -rn 'served: true' live`). `test/snapshots.test.mjs` uses the default `file://`
  page. In the spike, the same `route.fulfill({ path })` served ES modules that Chromium ran (measured). So switching is a
  default change in `openPenpa`, plus `live/share-base-url.live.mjs`, whose first test exists to open a `file://` page:
  an ES-module UI would fail to load there and its page error would fail that test. Small either way, and unneeded by
  the recommendation.
- **Pages serves `.js` as `application/javascript`** (measured with `curl -I` on `js/main.js` and a vendored library).
  `.mjs` remains not verified; use `.js` names.
- **Do users open the site over `file://`?** No documented path found: `README.md` has no `file://`, offline or
  download-the-site instructions (grepped), and `CONTRIBUTING.md` suggests local testing with browsersync, an HTTP
  server. But upstream's `maketext_baseurl()` keeps a `file://` branch (`docs/js/class_p.js:2047-2049`), so someone
  once opened it from disk. Whether anyone still does: not verified.
- **If a real build step were chosen** (Svelte, React): Pages builds from `master:/docs` with `build_type: legacy`
  (`gh api repos/caneff/penpa-edit/pages`, measured). Either the output is committed under `docs/` (generated diffs in
  every UI change; the nightly upstream merge must not touch it, so mark it `merge=ours`), or Pages switches to an
  Actions deploy, and both `ci.yml` and `upstream-merge.yml` must build before testing. No `.gitattributes` exists in
  the checkout yet (`git ls-files`), though `AGENTS.md` describes marking owned files in one. A vendored prebuilt bundle
  (the recommendation) needs neither: it is a new file under `docs/js/libs/`, which upstream does not have, so a merge
  cannot conflict on it.

### Spike

Scratchpad only, nothing installed in the repo: `@awesome.me/webawesome` 3.14.0, `@zag-js/*` 1.48.0, `interactjs`
1.10.28, `@floating-ui/dom` 1.8.0, esbuild 0.28; Playwright from `~/src/sudokupad-scripts/node_modules`, Chromium
headless at 1200x800, every outside request answered empty. Each page had a classic global `engine` drawing on a
`<canvas>` and a 44px top bar over a desk.

| Page | Loaded over | Result (measured) |
|---|---|---|
| Platform only: pointer-capture drag and resize, Popover menu, `<dialog>`, `light-dark()` | `file://` | Card stayed inside after a 3000px drag and a shrink to 700x500 (after fixing a 2px `box-sizing` overflow in my own first version); dialog: focus on `autofocus` Cancel, Esc closed, focus back on Restart, Tab went to `<body>` once; popover: Esc closed with focus back, outside click closed; theme switched; no errors |
| Zag floating panel and combobox, own IIFE | `file://` | Panel clamped on drag and on window shrink; typing "su" left Surface and Sudoku; ArrowDown set `aria-activedescendant`; Enter called `engine.setMode('sudoku')`; no errors |
| Web Awesome `dist-cdn`, ES-module loader | `file://` | No element defined; "Access to script ... blocked by CORS policy" |
| The same | HTTP via `context.route` | Worked once `data-webawesome="/wa"` was set; dialog, dropdown and theme as in § Web Awesome; 84 JS files |
| Web Awesome, 8 components as own IIFE | `file://` | All elements defined; dialog open, Esc, focus back, Restart ran; close icon drawn from the built-in library; no network request; no console error or warning |
| interact.js UMD | `file://` | Drag clamped; window shrink left the card outside |

### Not determined

- Whether the visual gain from Web Awesome is "much more polished" in Chris's eyes: only Chris can judge that; a
  side-by-side of L's top bar and dialogs restyled both ways would settle it.
- Whether `<wa-select>` / `<wa-option>` can show L's swatches and drawn style samples, and whether arrow keys on a focused
  `<wa-select>` reach Penpa's `keydown` handler.
- Web Awesome Pro's price, and whether its combobox could hold L's picker (groups, tag chips, per-entry Pin toggle).
- Zag's floating panel run controlled beside L's `place()` policy; keyboard resizing in Zag.
- Keyboard reorder of chips in any library.
- How well agents write Web Awesome 3 or Zag: no benchmark searched or found beyond § Agents above.
- Whether real users open the site over `file://`.

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

Added for § Polish, each read once on 2026-11-15 (pages undated unless a date is given):

- [WebFeatures] W3C WebDX, `web-features` 3.46.0 on npm, `data.json` (status of `dialog`, `popover`, `anchor-positioning`,
  `focus-visible`, `view-transitions`, `container-queries`, `dialog-closedby`, `invoker-commands`, `customizable-select`,
  `interest-invokers`, `popover-hint`, `light-dark`, `starting-style`, `transition-behavior`, `pointer-events-api`,
  `draganddrop`, `inert`), https://www.npmjs.com/package/web-features
- [WAInstall] Web Awesome, "Installation", https://webawesome.com/docs/
- [WAComponents] Web Awesome, "Components" (list with Pro markers), https://webawesome.com/docs/components/
- [WADialog] Web Awesome, "Dialog", https://webawesome.com/docs/components/dialog
- [ShoelaceReadme] shoelace-style/shoelace, `README.md` on the default branch (sunset notice) and https://shoelace.style/
- [ZagStart] Zag, "Getting Started", https://zagjs.com/overview/installation
- [ZagFP] Zag, "Floating Panel" (React page; the API is shared), https://zagjs.com/components/react/floating-panel
- [ZagVanillaEx] chakra-ui/zag, `examples/vanilla-ts/src/floating-panel.ts`, `component.ts` and `combobox.ts`, read through
  `gh api repos/chakra-ui/zag/contents/...`; `@zag-js/floating-panel` 1.48.0 `dist/floating-panel.connect.mjs` and
  `floating-panel.machine.mjs` from the npm package
- [FloatingUIStart] Floating UI, "Getting Started", https://floating-ui.com/docs/getting-started
- [InteractRestrict] interact.js, "Restriction", https://interactjs.io/docs/restriction/
- [DockviewFloat] Dockview, "Floating groups", https://dockview.dev/docs/core/groups/floatingGroups
- [DockviewReadme] dockview/dockview, `README.md`, through `gh api repos/mathuo/dockview/readme`
- [GridstackReadme] gridstack/gridstack.js, `README.md`, through `gh api repos/gridstack/gridstack.js/readme`
- [React19Upgrade] Ricky Hanlon, "React 19 Upgrade Guide", 2024-04-25, § UMD builds removed,
  https://react.dev/blog/2024/04/25/react-19-upgrade-guide
- [BaseUIStart] Base UI, "Quick start", https://base-ui.com/react/overview/quick-start
- [BitsUI] Bits UI, "Introduction", https://bits-ui.com/docs/introduction
- npm registry, 2026-11-15 (`npm view <pkg> version license time`; stable releases counted from 2025-11-15):
  `@awesome.me/webawesome`, `@shoelace-style/shoelace`, `@floating-ui/dom`, `@zag-js/vanilla`, `@zag-js/dialog`,
  `@zag-js/floating-panel`, `@zag-js/combobox`, `dockview-core`, `gridstack`, `interactjs`, `winbox`, `jspanel4`,
  `golden-layout`, `@neodrag/vanilla`, `motion`, `sortablejs`, `focus-trap`, `react`, `@radix-ui/react-dialog`,
  `@base-ui/react`, `bits-ui`, `@ark-ui/react`, `@material/web`, `@fluentui/web-components`,
  `@spectrum-web-components/bundle`, `web-features`.
- GitHub API, 2026-11-15: `repos/taye/interact.js`, `repos/shoelace-style/shoelace`, `repos/shoelace-style/webawesome`,
  `repos/chakra-ui/zag`, `repos/mathuo/dockview`, `repos/gridstack/gridstack.js`, `repos/nextapps-de/winbox`,
  `repos/floating-ui/floating-ui`, `repos/caneff/penpa-edit/pages`.
- `curl -I` on https://caneff.github.io/penpa-edit/js/main.js and `.../js/libs/sweetalert2@11.js`, 2026-11-15.
- Spike: scratchpad only (`$SCRATCHPAD/spike`, `$SCRATCHPAD/runner`), nothing installed in the repo; § Polish, Spike.
