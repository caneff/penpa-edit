# Solve mode: every input listener, setting and dialog

Input for the uncharted map "Interaction contract: one set of rules for keys, modes, dialogs and settings" (#7). Read from
the fork's source at `b9a76c0` (upstream `34e3fe9`; `docs/` is unchanged since the audit's `a23f6b9`), 2026-11-13. Paths
are under `docs/` unless given. It extends `research/penpa-mode-key-map.md` (what each key and click does by mode, not
repeated) and the Input and settings section of `research/fork-audit-2026-11.md` (I1-I9, cross-referenced, not re-argued).

Evidence: **READ** = from the source only. **LIVE** = run on 2026-11-13 in headless Chromium (Playwright from
`sudokupad-scripts/node_modules`, page served on a random local port, Google Tag Manager blocked) on a solve link made
from a blank 10x10 square grid. Scripts: `probe.mjs` and `probe2.mjs` in this session's scratchpad (not kept in the repo).
LIVE key results come from `page.keyboard.press` with focus on `<body>` and a window-level listener reading
`defaultPrevented`; they show what the page cancels, not what Chrome does with a key the page leaves alone.

Note on `e.returnValue = false`: `main.js` cancels most keys this way, not with `preventDefault()`. The DOM Standard's
legacy `returnValue` setter sets the canceled flag when given false (DOM Standard, "Interface Event", `returnValue`,
https://dom.spec.whatwg.org/#dom-event-returnvalue), and the listeners are registered `passive: false` (`main.js:84-85`),
so it acts as `preventDefault()`. The LIVE table agrees (Alt+arrows are cancelled only through `returnValue`,
`main.js:351`).

## Summary: what one interaction contract has to settle, ranked

1. **Nothing owns the keyboard while a Penpa dialog is open.** The board's `keydown` listener sits on `document`
   (`main.js:84`) and skips only `<input type=text|number>` and seven element ids (`main.js:279-298`). The 15 custom
   `.modal` dialogs do not stop it: with Settings open, a digit typed with `<body>` focused or with a Settings `<select>`
   focused went into the board, and ArrowDown on the focused select was swallowed so the select did not change (LIVE;
   audit I9). SweetAlert2 popups do own the keyboard while focus is inside them (LIVE, below). Two dialog systems, two
   rules.
2. **Pausing does not stop input.** The pause layer is a canvas over the board (`class_p.js:417-440`); no key path checks
   it. With the timer paused (F4), a digit still entered the selected cell (LIVE).
3. **Which browser keys are swallowed depends on the mode, by accident.** Surface (the default mode, `general.js:85`)
   cancels every key without Ctrl, F1, F5, F11, Tab, PageDown and Home included (`main.js:681-693`); the other 11 solve
   modes leave those alone. Every mode cancels Alt+Left/Right (Back/Forward), Ctrl+D (bookmark), Ctrl+1..9, Space, `/`
   and `'` (Firefox quick find), Backspace and Escape; Tab and Enter are cancelled in every mode only when a Tab set
   exists (`main.js:695-744`). Table below. Audit I6.
4. **A setting is saved by one of four mechanisms, and none outlives the browser.** Most are written all together by
   `attemptSave` whenever any one of them changes; two write their own cookie; some are written only when a different
   setting changes; some are never written. Every cookie is a session cookie (I1; a second cause is noted below). On top,
   a solve link overrides the solver's Tab set, display size, edge drawing, and can force dark theme, custom colours on
   and the Z/X/C/V keys off. Table below. Audits I1, I2, I3, I7.
5. **Held-modifier state has no focus model.** No file listens for `blur`, `focusout` or `focusin`; only
   `visibilitychange` is handled (progress save, timer auto-pause, `main.js:2072-2076, 2301-2316`). Ctrl held in Sudoku,
   then a window `blur` with no key-up, left the sub-mode on Centre (LIVE; audit I5).
6. **Dialogs close by different rules.** SweetAlert2: Escape, outside click, its buttons; focus trapped inside and given
   back on close. `.modal`: Escape closes the first open one in an unordered list (with Share and its Genre Tags child
   both open, Escape closed the parent and left the child, LIVE); a mouse-down on the backdrop closes it
   (`main.js:1068-1071`); 8 of the 15 have no close button, Settings among them. Settings apply on change with no
   cancel; New grid and Resize have Apply and Close-with-revert (`main.js:1659-1690`).
7. **Buttons act on mouse-down with any mouse button**, through one `document` `mousedown` switch on the target's id
   (`main.js:1057-1884`); only the middle button is filtered, and only on the canvas (`main.js:106`). A mouse-down on the
   canvas calls `preventDefault()` (`main.js:1099-1101`), so focus stays wherever it was: in one LIVE run a Settings
   `<select>` kept focus after the dialog closed and the board was clicked, and the next digit still went to the board
   (in another run focus ended on `<body>`; why the runs differed was not determined).
8. **Progress and settings persist on different clocks.** Settings are written on change (when written at all);
   puzzle progress only on `beforeunload` and on the page becoming hidden (`main.js:2062-2076`), into localforage.

## 1. Event listeners

### Keyboard

| Event | Element | Handler | What it does | Cancels |
|---|---|---|---|---|
| `keydown` | `document` | `onKeyDown`, `main.js:84, 294-745` | every board key; see the order below | per key, table below |
| `keyup` | `document` | `onKeyUp`, `main.js:85, 872-917` | Sudoku: Shift or Ctrl up restores the stored sub-mode (`main.js:883-905`); Surface: records a `1` release for the two-digit style shortcut (`main.js:906-916`) | Shift/Ctrl up in Sudoku; every key-up in Surface |
| `keydown` | each SweetAlert2 popup, while open | SweetAlert2 v11.14.4, `js/libs/sweetalert2@11.js` (`keydownListenerCapture:!1` puts it on the popup, not `window`; `stopKeydownPropagation:!0`) | Enter, Tab (focus trap), arrows between buttons, Escape closes; **every** key that starts inside the popup is stopped from reaching `document` | per key |
| `keyup` | Tab-dropdown search box | `js/libs/vanillaSelectBox.js:340` | filters the Tab-set list | no |
| select2 handlers | genre-tag picker | `js/libs/select2.full.js:1475, 2137, 4225, 6155-6175` | the select2 dropdown stops propagation of key and mouse events (`6155-6175`) | not traced |

`onKeyDown`, in order (READ):

1. Returns at once if the target is an `<input>` of type `text` or `number`, or has one of the ids `savetextarea_pp`,
   `custom_message`, `iostring`, `inputtext`, `select2_search`, `saveinforules`, `urlstring` (`main.js:279-298`).
   `<select>`, `<button>`, checkboxes, the read-only `#savetextarea` and select2's multi-select search
   `#select2_search_multiple` (`select2.full.js:2062`) are not exempt. Typing in the genre-tag search worked anyway
   (LIVE: "ab3" typed, board untouched), so select2 stops the keys itself; where exactly was not traced.
2. F2, F3, F4, F12 (`checkFunctionKeys`, `main.js:795-870`): F2 and F3 open a confirm (switch to the Problem or
   Solution layer, solve mode only) and are cancelled; F4 toggles the timer and is cancelled; F12 returns without
   cancelling.
3. Sudoku Corner forced if any key comes within 15 ms of a Shift release (`main.js:320-324`; I5). Surface two-digit
   style (`main.js:327-333`).
4. `?` opens the Keyboard Shortcuts dialog outside Number and Sudoku, cancelled (`main.js:335-341`).
5. Arrows: `key_arrow`, cancelled in every mode and with any modifier, so Alt+Left/Right (Back/Forward) never reach the
   browser; numpad arrows in Sudoku skip this (`main.js:346-353`).
6. Z/X/C/V by `e.code`, only in Surface and Sudoku and only without Ctrl or Caps Lock; cancelled only if it changed the
   mode (`main.js:355-357, 747-793`). It does not check Alt, so Alt+Z also switches.
7. Escape: hides the first `.modal` whose `style.display` is set and not `none`, else clears the selection; always
   cancelled (`main.js:359-379`). The sort meant to put sub-dialogs first returns a boolean (`main.js:365`), which never
   orders anything below zero; LIVE it closed Share before its Genre Tags child (audit "Lower").
8. Sudoku: numpad remap with Num Lock off; Shift down → Corner, Ctrl down → Centre, each cancelled; Ctrl+Delete/Backspace
   clears (`main.js:384-435`).
9. No Ctrl, no Alt: Shift+Space → `key_number(" ")`; any digit, letter or symbol in `str_num`/`str_alph_*`/`str_sym`
   (which include `/`, `'`, `?`, `;`, `.`, `,`) → `preventDefault()` then `key_number`; Space, Delete (and Backspace in
   Sudoku) → `key_space`; Backspace → `key_backspace`; all cancelled, in every mode (`main.js:437-507`).
10. Alt+digit in Multicolor → secondary colour; **not** cancelled (`main.js:509-520`).
11. Ctrl+Shift+Z → redo, cancelled (`main.js:522-529`). Other Ctrl+Shift combinations (Ctrl+Shift+T, Ctrl+Shift+I) pass.
12. Ctrl alone or Ctrl+key without Shift/Alt (`main.js:531-664`): the Ctrl key-down itself is cancelled (`main.js:662`).
    Handled and cancelled: Ctrl+A (select all, unless the target has an id, `main.js:568-578`), Ctrl+D (Clone into a new
    window, `main.js:579-583`), Ctrl+Y, Ctrl+Z, Ctrl+Space, Ctrl+I (floating-panel insert), Ctrl+0..9 (`key_number`, so
    Ctrl+digit acts like the digit in every mode). Everything else passes, so Ctrl+C/X/V reach the `copy`/`cut`/`paste`
    listeners below and Ctrl+F, L, P, S, T, W, R reach the browser.
13. Surface without Ctrl: **every** key is cancelled (`main.js:681-693`), after any action above.
14. Tab or Enter with a non-empty Tab set: next (Shift: previous) mode in the set, cancelled (`main.js:695-744`). With
    an empty set, Tab moves browser focus as usual. LIVE with the set `Surface, Sudoku Normal`: three Tabs went
    Sudoku → Surface → Sudoku, all cancelled, focus stayed on `<body>`.

What the page cancels, LIVE, focus on `<body>`, solve link with an empty Tab set (`P` = cancelled, `-` = left to the
browser):

| Key | Surface | Every other solve mode (Multicolor, Sudoku, Number, Line, Edge, Wall, Shape, Special, Cage, Composite, Move) |
|---|---|---|
| F1, F5, F11 | P | - |
| F12 | - | - |
| Tab, Shift+Tab, Enter | P | - (P in every mode once a Tab set exists, READ `main.js:695-744`, LIVE in Number) |
| PageDown, Home, Alt alone | P | - |
| Alt+Left, Alt+Right | P | P |
| Ctrl+D, Ctrl+1 | P | P |
| Ctrl+F, Ctrl+L, Ctrl+P, Ctrl+S, Ctrl+Shift+I | - | - |
| Space, `/`, `'`, Backspace, Escape | P | P |

The navigation did not leave the page during the run (no reload from F5). Whether Chrome lets a page cancel Ctrl+1..9
tab switching was not tested; headless key presses go to the page, not to the browser's own shortcuts.

### Pointer, clipboard and page

| Event | Element | Line | What it does | Cancels |
|---|---|---|---|---|
| `mousedown`, `touchstart` | `document` | `main.js:1057-1058, 1060-1884` | one switch on `e.target.id`: canvas → `onDown`; every toolbar, dialog and panel button; `mo_`, `sub_`, `st_`, `rot_`, `combisub_`, `ms_` prefixes pick mode, sub-mode, style, orientation, Composite tool, Shape. A backdrop (`className === "modal"`) hides that dialog. Middle button toggles Problem/Solution only when the title contains "setter" and the setting is on (`main.js:1078-1092`) | most branches call `preventDefault()`; canvas only when `checkms === 0` |
| `mouseup`, `touchend` | canvas | `main.js:78-79, 151-181` | ends the gesture (`mouse_mode = "up"`) | touch only |
| `mousemove`, `touchmove` | canvas | `main.js:80-81, 183-246` | drag; Alt+drag rectangle selection | always |
| `mouseout` | canvas | `main.js:82, 252-259` | ends the gesture (`mouse_mode = "out"`); there is no `document` `mouseup`, so releasing outside the canvas is handled only through this | no |
| `contextmenu` | canvas; Undo and Redo buttons | `main.js:83, 261-263, 976, 984` | blocks the context menu | yes |
| `dblclick` | `document` | `main.js:1906-1916` | on the canvas: `onDown` as a double click (`dblmouseevent`, select similar) | yes |
| `mousedown/up/leave`, `touchstart/end` | Undo, Redo | `main.js:970-1054` | hold to repeat: after 10 ticks of 80 ms, one undo or redo per tick. The single step comes from the `document` switch (`main.js:1140-1145`), on any mouse button | yes |
| `mousemove`, `touchmove`, `mouseup`, `touchend`, `mouseleave`, `touchleave` | `body`, floating-panel header | `main.js:1922-1984` | drag the floating panel; listeners added on each drag start/move, partly removed on release | move only |
| `click` | `#sw_pause`, `#sw_start` | `main.js:2286-2287` | pause/start the timer | no |
| `click` | `#title` in solve mode with an answer check | `general.js:3195` | answer-check info popup | no |
| `click` | `#edit_bg_image` | `main.js:2052-2054` | opens Background Image | no |
| `click` | Penpa Lite button in the Tab dropdown | `interface.js:135` | toggles hiding of modes outside the Tab set | no |
| `click` | Tab dropdown; `document` while it is open | `vanillaSelectBox.js:400-420` | open, pick, close on outside click | yes, stops propagation |
| `copy`, `cut`, `paste` | `document` | `class_p.js:230-232, 7360, 7523, 7580` | board copy/paste of the selection; skipped when the target is an `INPUT`/`TEXTAREA` with an id (copy) or any element with an id (paste). Added in the `Puzzle` constructor, so each new board adds another set; whether old sets still act after New grid was not checked | when they handle it |
| `change` | 25 settings selects, `#auto_shorten_chk`, `#genre_tags_opt`, colour picker, replay controls, background-image fields | `main.js:32-34, 65-67, 2056-2058, 2081-2283`; `general.js:2609-2616` | apply the setting (next section) | no |
| `beforeunload` | `window` | `main.js:2062-2070` | Reload Protection prompt if on; saves progress | if the setting is on |
| `beforeunload` | `document` | `main.js:71-73` | dead: `beforeunload` fires on `window` only (audit "Lower") | - |
| `visibilitychange` | `document` | `main.js:2072-2076` | saves progress when hidden | no |
| `visibilitychange` | `document` | `main.js:2301-2316` | auto-pauses a running timer when hidden, restarts it when visible | no |
| easytimer events | `sw_timer` | `timer.js:33-41` | timer display | - |

Not found anywhere outside `js/libs/`: `wheel`, `pointer*`, `keypress`, `blur`, `focus`, `focusin`, `focusout`,
`input` listeners. Inline `onclick`/`onchange`/`oninput` attributes in `index.html` (lines 165, 836, 878, 923-925, 1109,
1170, 1174, 1211-1212, 1549-1550, 1561, 1865, 1890-1891, 1970, 1991) call named functions and touch no keys.

### Focus

- **Text fields**: exempt by type or id (above). `#inputtext` is blurred on every canvas mouse-down
  (`main.js:1097, 1910`); no other element is blurred. Sudoku I/O and Load URL focus their textarea on open
  (`general.js:1525, 1530`). No other dialog sets focus.
- **Custom dialog open**: the board still gets keys from `<body>` and from any non-text control (LIVE, Summary 1).
- **SweetAlert2 open**: its confirm button takes focus (`focusConfirm:!0`); a digit typed then did not reach the board,
  and Escape closed it without the board's Escape clearing the selection (LIVE). On close it returns focus to the
  element that had it (`returnFocus:!0`).
- **Window blur**: no handler. Held Shift/Ctrl sub-modes stick (LIVE, I5); Ctrl/Shift counters (`main.js:269-270`) are
  not reset.
- **Tab hidden**: progress saved, timer auto-paused (`main.js:2072-2076, 2301-2316`).

## 2. Settings

Where each is stored and how it moves. "Bulk" = written by `UserSettings.attemptSave()` (`settings.js:509-522`), which
writes every name in `can_save` and `gridtype_size` plus `tab_settings` at once, and only after the first
`loadFromCookies("others")` has set `_settingsLoaded` (`settings.js:510, 542`). Cookies are read by
`loadFromCookies("others")` at boot: `create()` for a bare page (`general.js:90`) and `load()` for a link
(`general.js:2067`). `gridtype` and `displaysize` cookies are read only by `create()` (`general.js:78`).

| Setting (UI label) | Storage | Default | Saved when | Loaded when | Survives restart |
|---|---|---|---|---|---|
| Display Theme | cookie `color_theme`, bulk | Light (`settings.js:317`) | on change (`settings.js:343`) | boot | no (I1). A link whose view setting is `dark` sets Dark and so saves it (`general.js:2496-2504`); no link sets Light |
| Display Layout | cookie `responsive_mode`: own write in the setter (`settings.js:44-48`) **and** bulk | Classic | own write on change; bulk on any other change | boot | no |
| Language | cookie `app_language`, bulk | EN | on change (`settings.js:98`) | boot; re-runs `trans()`, which rebuilds the Tab dropdown (`translate.js:109`) | no |
| Timer (show/hide) | cookie `timerbar_status`, bulk | Show | on change (`settings.js:62`) | boot | no |
| Sudoku Pencil Marks | cookie `sudoku_centre_size`, bulk | Dynamic | on change (`settings.js:189`) | boot | no |
| Sudoku Normal | cookie `sudoku_normal_size`, bulk | Centered | on change (`settings.js:174`) | boot | no |
| Outline on Text | cookie `outline_text`, bulk | OFF | on change (`settings.js:201`) | boot | no |
| Star Battle Dots | cookie `starbattle_dots`, bulk | High Range | on change (`settings.js:148`) | boot | no |
| Surface Second Color | cookie `secondcolor`, bulk | Green (2) | on change (`settings.js:161`) | boot | no |
| Custom Colors | cookie `custom_colors_on`, bulk | No | **only when another setting changes**: the setter has no `attemptSave` (`settings.js:208-225`). A link with custom colours turns it on (`general.js:2464-2470`) | boot | no |
| Floating Panel | not stored (`panel_shown` is not in `can_save`) | OFF | never | - ; Shape mode turns it on the first time (`class_p.js:1616-1620`) | no |
| Quick Panel Button | cookie `quick_panel_button`, bulk | ON | on change (`settings.js:451`) | boot, **broken**: the cookie holds `"false"`, a truthy string, and the setter keeps it as is (`settings.js:438-449`). LIVE: after OFF and reload, the button showed and the select read ON | no |
| Auto-Shorten Links (also the Share dialog checkbox) | cookie `shorten_links`, bulk | OFF | on change (`settings.js:414`) | boot (`"false"` handled, `settings.js:409`) | no |
| Mouse Middle Button | cookie `mousemiddle_button`, bulk | No | on change | boot | no; row hidden in solve mode (`general.js:3148-3149`) |
| Reload Protection | cookie `reload_button`, bulk | OFF | on change (`settings.js:281`) | boot | no |
| Conflict Detection | cookie `conflict_detection`: own write only for "OFF (all puzzles)" (`settings.js:113-117`) **and** bulk | ON | value 3: own write on change; values 1/2: only when another setting changes (no `attemptSave` in the setter) | boot | no. "OFF (this puzzle)" is stored by the next bulk write and then applies to every later puzzle (I7) |
| Check pencil marks | cookie `check_pencil_marks`, bulk | OFF | on change (`settings.js:135`) | boot | no |
| Any color can match green line/edge | cookie `ignore_line_style`, bulk | OFF | on change (`settings.js:235`) | boot | no |
| Sudoku Z/Y & XCV Keys | not stored (`shortcuts_enabled` not in `can_save`, no `attemptSave`, `settings.js:287-295`) | ON | never | - ; a puzzle tagged `alphabet` turns it off for the session (`general.js:2232-2234`) | no |
| Auto-save puzzle in browser history | cookie `auto_save_history`, bulk | OFF | on change (`settings.js:72`) | boot | no. When on, each progress save also `history.pushState`s a Clone link (`progress.js:71-73`, `general.js:1829-1837`) |
| Local Storage | cookie `local_storage`, bulk | ON | on change (`settings.js:250`) | boot | no |
| Clear this puzzle / Clear all | sets in-memory `save_current_puzzle = false` (`main.js:2331, 2338`) | - | never | - | no: progress saving resumes on the next page load |
| Tab/↵ set (`#mode_choices`) | cookie `tab_settings`, bulk (written from the dropdown, `settings.js:520`); also in every link (`rtext[6]`) | empty | **only when another setting changes** (I3: no `attemptSave` in the setter, `settings.js:309-312`) | cookie at boot (`settings.js:533-540`), then replaced by the link's set (`general.js:2139-2140`, I2) | no |
| Penpa Lite (hide modes outside the Tab set) | not stored; derived from the Tab set at load (`general.js:2145-2147`, `settings.js:536-538`) | on if a set exists | never | - | no |
| Display size (Resize dialog "Apply changes", New grid) | cookie `displaysize`, bulk; also in every link (`rtext_para[3]`) | 38 (`settings.js:349`) | only when another setting changes (setter has no `attemptSave`, `settings.js:350-367`) | cookie only for a bare page (`general.js:78`); a link's own size always wins (`general.js:2005`), and the next bulk write stores it | no |
| Grid type | cookie `gridtype`, bulk; link | square | as display size | as display size (`general.js:78, 2001`) | no |
| Draw on edges/corners (`#edge_button`) | not stored; in the link (`rtext_para[19]`, `general.js:2077-2087`) | OFF | never | link | n/a |
| Show solution (`#visibility_button`) | not stored | ON | never | - | n/a; hidden in solve mode (`general.js:3133`) |
| Resize white space (`#resize_whitespace_button`) | not stored | OFF | never | - | no |
| Custom-colour picker recent colours | `localStorage["spectrum.homepage"]` (spectrum library, `main.js:63`) | empty | by the library on pick | by the library | **yes**: the only user choice that does |
| Puzzle progress | localforage key `penpa_` + md5 of the link's `p` (`progress.js:56-63, 94`), fallback read from `localStorage` (`progress.js:117`) | - | on `beforeunload` and on hide only (`main.js:2069, 2074`); solve mode, not replay, Local Storage on (`progress.js:77-82`); `setItem` not awaited, errors unseen | at boot, before the link (`general.js:45-58`) | yes |
| Floating panel position | `window.panel_toplast/leftlast` (`main.js:1961-1962`) | fixed spot (U7) | - | - | no |

Why nothing survives a restart (I1), with one cause the audit did not name: `setCookie` builds
`now + 86400000 × days` (`settings.js:15-19`). In the setters (`settings.js:47, 114`) and for `tab_settings`
(`settings.js:520`), `days` is `_expDate = 2147483647`, past the largest Date. Inside the two `forEach` callbacks
(`settings.js:514-519`), `this` is not `UserSettings` (plain `function`, non-strict script), so `this._expDate` is
`undefined` and the expiry is `NaN`. Both give `expires=Invalid Date`, which browsers treat as a session cookie. LIVE:
22 cookies written by one bulk save, every one with `expires: -1`.

Other persistence quirks (READ): "Clear cookies" deletes the cookies but not the in-memory values, so the next bulk
write puts them all back (`settings.js:493-504`); the row is hidden in solve mode anyway (`general.js:3145`). Every bulk
write stores all settings, so two tabs overwrite each other (audit "Lower").

Audit cross-reference: **I1** (session-only cookies) holds, LIVE again; **I3** (Tab set not saved) holds, and the same
gap affects Custom Colors, display size and Conflict Detection values 1/2; **I7** holds through the bulk write.
Possible cause of U3/I2's display half (SUSPECT, not run): the Tab dropdown is built at `main.js:2060` while `boot()`
(`main.js:69`, async, not awaited) is still waiting on localforage (`general.js:47`), and is rebuilt by `trans()` only
from inside `loadFromCookies` (`general.js:2067`), which runs before the link's set is applied (`general.js:2140`).

## 3. Dialogs reachable in solve mode

`set_solvemode()` hides New grid, Rotate, Load URL and the Problem/Check buttons (`general.js:3117-3136`); Contest mode
also hides Share, Sudoku I/O and Undo/Redo (`general.js:3176-3180`). Custom `.modal` dialogs open with
`style.display = 'block'` and never take the keyboard; SweetAlert2 popups (`Swal.fire`) do while focused. No
`alert()`, `confirm()` or `prompt()` call exists outside `js/libs/`.

### Custom `.modal` dialogs

All close on Escape (first open one in DOM-derived order, `main.js:359-373`) and on a mouse-down on their backdrop
(`main.js:1068-1071`). None owns the keyboard.

| Dialog | Opened by | Other ways to close |
|---|---|---|
| General Settings `#modal-settings` | gear `#page_settings` (`main.js:1132-1135`, `general.js:1533-1535`) | none: no close button (U9); changes apply on change |
| Help `#modal-help` | `#page_help` (`general.js:1537-1539`) | none |
| Keyboard Shortcuts `#modal-keys` | `?` outside Number and Sudoku (`main.js:335-341`); "Shortcuts" in Help (`index.html:1970`) | none |
| Share Puzzle `#modal-save` | `#savetext` (`general.js:1518-1521`) | Close `#closeBtn_save4` (`main.js:1306-1309`) |
| Extended Output `#modal-save2` | Share → "URL with Answer Check / Advanced Options" (`general.js:1541-1543`) | none |
| Share Replay `#modal-replay` | Share → Replay URL (`general.js:1545-1547`) | none |
| Genre Tags `#modal-save-tag` | Share or Settings → tags (`main.js:1249-1253`) | none; Escape closes its parent first (LIVE) |
| Resize `#modal-newsize` | `#newsize`, shown in solve mode (`general.js:3119`) | Apply changes / Close, Close reverts the size field (`main.js:1677-1691`) |
| Save screenshot `#modal-image` | `#saveimage` (`general.js:1441`) | Close `#closeBtn_image3` |
| Sudoku I/O `#modal-input` | `#input_sudoku` (`general.js:1523-1526`), focuses its textarea | none |
| Background Image `#modal-bg-image` | `#edit_bg_image` (`main.js:2052-2054`); whether it is visible in solve mode was not checked | Close `#closeBtn_bg_image` |

Not reachable in solve mode: New Grid `#modal`, Rotate `#modal-rotate`, Load URL `#modal-load`.

### SweetAlert2 popups

All use library defaults unless noted: Escape closes, outside click closes, focus trapped and returned, keys stopped at
the popup (Section 1). None sets `allowEscapeKey` or `allowOutsideClick`.

| Popup | Opened by | Buttons |
|---|---|---|
| Rules | "Show Rules" `#puzzlerules` (`main.js:1731-1734`, `general.js:917-922`) | OK; covers most of the board (U6) |
| Answer-check info | click on the solve title (`general.js:3195, 3201-3209`) | OK |
| Congratulations | a correct solution, from `check_solution` on redraw (`class_p.js:13387-13396, 13424-13432`), 20 ms later; also pauses the timer | OK |
| Switch to Problem / Solution layer | F2 / F3 in solve mode (`main.js:796-853`) | confirm / cancel |
| Reset this mode's entries | `#tb_reset` (`general.js:1343-1382`); nothing for Composite | confirm / cancel |
| Delete all | `#tb_delete` (`general.js:1384-1405`) | confirm / cancel |
| Local storage cleared | Settings → Clear this puzzle / Clear all (`main.js:2319-2344`) | OK |
| Copied, file and import errors | Share Copy (`general.js:1664`), Download (`general.js:1708, 1754, 1783`), screenshot (`general.js:1473, 1505`), Sudoku I/O (`general.js:1864, 1895`) | OK |
| Display size min/max | Resize below 12 or above 90 (`settings.js:353-360`) | OK |
| Feedback | Help → Provide Feedback (`general.js:1957-1963`) | OK |
| Single-cell box warning | `check_last_cell` (`class_p.js:10179-10186`) | OK |

### Other overlays

- **Pause layer** `#pause_canvas` (`class_p.js:417-450`): shown by Pause, F4 or a solve; blocks board clicks only
  because the canvas mouse-down branch needs `target.id === "canvas"` (`main.js:1096`). Keys still edit the board (LIVE).
- **Floating panel** `#float-key-body`: closed by its × (`index.html:836`, `panel_off()`); Escape does not close it.
- **Tab/↵ dropdown** (vanillaSelectBox): closes on an outside click (`vanillaSelectBox.js:400-406`); Escape not handled
  there (not traced further).

## Not determined

- Where select2 stops key events from its multi-select search field (it does, LIVE).
- Why focus stayed on a closed dialog's `<select>` in one LIVE run and not in the other.
- Whether old `copy`/`cut`/`paste` listeners from a replaced `Puzzle` still act.
- Whether Chrome honours a page's cancel of Ctrl+1..9.
- Whether Background Image is reachable in solve mode.
