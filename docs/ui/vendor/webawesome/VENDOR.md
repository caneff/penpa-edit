# Web Awesome bundle for the solve UI

Vendored, not installed: nothing here is in `package.json`. Web Awesome **3.14.0** (free tier, MIT, `LICENSE.md` here)
and **esbuild 0.28.2**. The bundle also holds Web Awesome's own dependencies, Lit 3.3.3 (BSD-3-Clause; its licence
comments are kept at the end of the bundle) and Floating UI 1.8.0 (MIT; its build carries no licence comment).
The bundle was first built on 2026-11-15 for the prototype branch `prototype/solve-ui` (commit `4a7a680`, variant
M) and is the same bytes; it was not rebuilt for this ticket.

| File | What | Size (bytes) |
|---|---|---|
| `webawesome.iife.js` | the ten components in `entry.js` (button, dialog, divider, dropdown, dropdown item, input, option, select, switch, tooltip), one classic-script IIFE with no autoloader and no base path | 285,717 |
| `webawesome-default-theme.css` | `dist/styles/themes/default.css` with its `@import`s inlined (theme tokens, light and `.wa-dark`) | 51,635 |
| `entry.js` | the bundle's entry: one import per component | |

## Rebuild

In a scratch folder outside the repo:

```sh
npm init -y && npm install @awesome.me/webawesome@3.14.0 esbuild@0.28.2
mkdir src && cp <repo>/docs/ui/vendor/webawesome/entry.js src/entry.js
npx esbuild src/entry.js --bundle --minify --format=iife --legal-comments=eof --outfile=webawesome.iife.js
npx esbuild node_modules/@awesome.me/webawesome/dist/styles/themes/default.css --bundle --minify --outfile=webawesome-default-theme.css
```

Copy the two outputs over the files here. To add a component, add its import line to `entry.js` and rebuild.
`solve.html` loads the bundle as a classic `<script>` and the theme as a `<link>`.
