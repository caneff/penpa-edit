# Web Awesome bundle for prototype variant M (PROTOTYPE, throwaway)

Vendored, not installed: nothing here is in `package.json`. Built on 2026-11-15 outside the repo, in a scratch folder
holding `@awesome.me/webawesome` **3.14.0** (MIT, `LICENSE.md` here) and **esbuild 0.28.2**. The bundle also holds
Web Awesome's own dependencies, Lit 3.3.3 (BSD-3-Clause; its licence comments are kept at the end of the bundle) and
Floating UI 1.8.0 (MIT; its build carries no licence comment).

| File | What | Size (bytes, gzip -9) |
|---|---|---|
| `webawesome-m.iife.js` | the ten components in `entry.js` (button, dialog, divider, dropdown, dropdown item, input, option, select, switch, tooltip), one classic-script IIFE with no autoloader and no base path | 285,717 (71,745) |
| `webawesome-default-theme.css` | `dist/styles/themes/default.css` with its `@import`s inlined (theme tokens, light and `.wa-dark`) | 51,635 (6,738) |
| `entry.js` | the bundle's entry: one import per component | |

Build, from the scratch folder (with `entry.js` copied to `src/wa-m-entry.js`):

```sh
npx esbuild src/wa-m-entry.js --bundle --minify --format=iife --legal-comments=eof --outfile=webawesome-m.iife.js
npx esbuild node_modules/@awesome.me/webawesome/dist/styles/themes/default.css --bundle --minify --outfile=webawesome-default-theme.css
```

`variant-M.js` loads the bundle as a classic `<script>`; `variant-M.css` `@import`s the theme.
