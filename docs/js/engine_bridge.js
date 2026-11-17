// The solve UI's only door to Penpa+'s engine: the global `engine`. The UI files (docs/ui/) never name `pu`,
// `UserSettings` or a legacy element id; this file does, once, and each call that has to read Penpa+'s internals
// says why (MVP gap). It must load after general.js and before main.js's onload runs boot().
(function () {
    'use strict';

    // UserSettings.displaysize clamps to 12-90 and pops a message up when it does (settings.js). The solve page draws up to
    // `max`, so a small board can fill a large Board card; a size over PENPA_CELL_SIZE_MAX is written past the setter and never
    // leaves the page (see exportAtPenpaSize). A call outside the range throws.
    const PENPA_CELL_SIZE_MAX = 90;
    const CELL_SIZE_RANGE = Object.freeze({ min: 12, max: 240 });

    // The translucent grey a selected cell is filled with on this page: it darkens the white board a little and has no hue, so it
    // never reads like the conflict pink (#242). Penpa+ paints the board white in both themes.
    // MVP gap: draw_selection fills with `Puzzle.prototype.selection_fill` when it is set (a caneff: line in class_p.js).
    Puzzle.prototype.selection_fill = 'rgba(110, 110, 110, 0.12)';

    // Penpa+'s square-cell grids keep this many unused cells (`pu.point` ids) round the board on each side.
    const PENPA_MARGIN_CELLS = 2;

    // The board's canvas may overshoot its box by this much before it counts as not fitting.
    const FIT_TOLERANCE_PX = 0.5;

    // What index.html reads back is a puzzle link, the progress store and the `displaysize` cookie. Each is written as Penpa+
    // would write it at PENPA_CELL_SIZE_MAX, since index.html clamps a larger size with its max-size message and sizes the
    // board's canvas from `canvasx / size`.
    // MVP gap: this assumes every link and the stored progress text come out of Puzzle.__export_text_shared and the cookie out of
    // UserSettings.attemptSave; a new way out of the page would carry the large size.
    function exportAtPenpaSize() {
        const original = Puzzle.prototype.__export_text_shared;
        Puzzle.prototype.__export_text_shared = function (...args) {
            const real = { size: this.size, canvasx: this.canvasx, canvasy: this.canvasy };
            const size = Math.min(real.size, PENPA_CELL_SIZE_MAX);
            // Scaled through the cell count, `canvasx / size`: index.html reads the canvas size with parseInt, and scaling by
            // `size / real.size` can land a hair under a whole number (629.99... for 1225 px at 175 px a cell) (#181).
            this.size = size;
            this.canvasx = real.canvasx / real.size * size;
            this.canvasy = real.canvasy / real.size * size;
            try {
                return original.apply(this, args);
            } finally {
                Object.assign(this, real);
            }
        };
        const originalSave = UserSettings.attemptSave;
        UserSettings.attemptSave = function (...args) {
            const real = this._displaysize;
            this._displaysize = Math.min(real, PENPA_CELL_SIZE_MAX);
            try {
                return originalSave.apply(this, args);
            } finally {
                this._displaysize = real;
            }
        };
    }
    exportAtPenpaSize();

    // Surface's colours as [style, name], in the order of Penpa+'s palette; `secondcolor` takes the same values.
    const SURFACE_COLOURS = Object.freeze([
        [1, 'dark grey'], [8, 'grey'], [3, 'light grey'], [4, 'black'], [2, 'green'], [5, 'blue'], [6, 'red'], [7, 'yellow'],
        [9, 'pink'], [10, 'orange'], [11, 'purple'], [12, 'brown']
    ].map((pair) => Object.freeze(pair)));

    // The Penpa+ settings the solve UI shows, by name. A boolean setting takes `true` or `false`; the others take one of the
    // whole numbers listed, which are the values of Penpa+'s own controls.
    const BOOLEAN = 'boolean';
    const SETTINGS = {
        sudoku_centre_size: [1, 2, 3],
        sudoku_normal_size: [1, 2],
        outline_text: BOOLEAN,
        secondcolor: SURFACE_COLOURS.map(([style]) => style),
        custom_colors_on: BOOLEAN,
        conflict_detection: [1, 2, 3],
        check_pencil_marks: BOOLEAN,
        ignore_line_style: BOOLEAN,
        starbattle_dots: [1, 2, 3],
        local_storage: BOOLEAN,
        auto_save_history: BOOLEAN,
        reload_button: BOOLEAN,
        shortcuts_enabled: BOOLEAN
    };

    // The settings that only some puzzles use, by the genre tags that make them apply. Sudoku's tags are Penpa+'s own "Sudoku"
    // group of genre tags, and a Sudoku grid applies whatever its tags.
    // A puzzle with no genre tag shows them all: its genre is not known, and a tag a setter left off must not hide a setting it uses.
    const untagged = () => pu.user_tags.length === 0;
    const isSudoku = () => untagged() || pu.gridtype === 'sudoku' || pu.user_tags.some((tag) => penpa_tags.options.Sudoku.includes(tag));
    const SETTING_GENRES = {
        sudoku_centre_size: isSudoku,
        sudoku_normal_size: isSudoku,
        starbattle_dots: () => untagged() || pu.user_tags.includes('starbattle')
    };

    // MVP gap: most setters save their own cookie, but custom_colors_on's does not, and shortcuts_enabled is in no cookie
    // list at all. Its cookie is read back before boot() runs, so a link's own override (an `alphabet` puzzle turns the
    // shortcuts off) still wins.
    const SHORTCUTS_COOKIE = 'shortcuts_enabled';
    // The outline's own cookie: Penpa+'s `outline_text` cookie is shared with Penpa+'s page, which keeps it off by default.
    const OUTLINE_COOKIE = 'chinstrap_outline_text';
    const SETTING_SAVERS = {
        custom_colors_on: () => UserSettings.attemptSave(),
        shortcuts_enabled: (on) => setCookie(SHORTCUTS_COOKIE, on ? '1' : '0', UserSettings._expDate),
        outline_text: (on) => setCookie(OUTLINE_COOKIE, on ? '1' : '0', UserSettings._expDate)
    };
    // MVP gap: the setters of these keep the new value but leave the board as it was drawn, so the bridge redraws it.
    const REDRAWN_SETTINGS = ['sudoku_normal_size'];

    // ---- Outline on text: Penpa+ strokes every board text before filling it, and its Outline on text setting only makes the
    // stroke white, at whatever width the last style left (often 1 px, whatever the font size). So the bridge scales the
    // width to the font and rounds the joins while a text is drawn. The setting is on until the visitor turns it off, and,
    // like the theme, is kept out of the cookies Penpa+'s own page shares.
    const OUTLINE_WIDTH_PER_FONT_PX = 0.1;
    // Penpa+'s style 0 is hollow text: a black stroke round a transparent fill, which a white stroke would hide.
    const HOLLOW_TEXT_STYLE = 0;
    UserSettings.can_save = UserSettings.can_save.filter((name) => name !== 'outline_text');

    // The width the next text() strokes at, set by the style it follows; null for a text that keeps Penpa+'s own.
    let outlineWidth = null;
    const penpaSetFontStyle = window.set_font_style;
    window.set_font_style = function (ctx, size, type) {
        penpaSetFontStyle.apply(this, arguments);
        outlineWidth = null;
        if (!UserSettings.outline_text) {
            return;
        }
        if (type === HOLLOW_TEXT_STYLE) {
            ctx.strokeStyle = Color.BLACK;
        } else {
            outlineWidth = parseFloat(size) * OUTLINE_WIDTH_PER_FONT_PX;
        }
    };

    // Only text() takes the width and the round joins (they keep a thick stroke from growing spikes at a glyph's corners), and
    // gives back the context's own: Penpa+'s other drawing (arrows, lines) relies on the width and join it set last or the default.
    const penpaText = CanvasRenderingContext2D.prototype.text;
    CanvasRenderingContext2D.prototype.text = function () {
        if (!UserSettings.outline_text || outlineWidth === null) {
            return penpaText.apply(this, arguments);
        }
        const { lineWidth, lineJoin } = this;
        this.lineWidth = outlineWidth;
        this.lineJoin = 'round';
        try {
            return penpaText.apply(this, arguments);
        } finally {
            this.lineWidth = lineWidth;
            this.lineJoin = lineJoin;
        }
    };

    // A positive finite number, or a TypeError naming the call and the argument.
    function requirePositiveNumber(call, name, value) {
        if (typeof value !== 'number' || !Number.isFinite(value) || value <= 0) {
            throw new TypeError(`engine.${call}: ${name} must be a positive number, got ${String(value)}`);
        }
        return value;
    }

    function boardCanvas() {
        const canvas = document.getElementById('canvas');
        if (!canvas || typeof pu === 'undefined') {
            throw new Error('engine: no puzzle is open');
        }
        return canvas;
    }

    // MVP gap: Penpa+ hit-tests a click as `e.pageX - canvas.offsetLeft` (main.js), which is right only while the canvas's
    // offsetParent is the page. The real page position makes it right wherever the board sits. Penpa+ also assumes
    // 1 CSS px = 1 canvas px, so the board is never scaled by CSS; setCellSize resizes it.
    function fixPointerOffset(canvas) {
        Object.defineProperty(canvas, 'offsetLeft', {
            configurable: true,
            get: () => canvas.getBoundingClientRect().left + window.scrollX
        });
        Object.defineProperty(canvas, 'offsetTop', {
            configurable: true,
            get: () => canvas.getBoundingClientRect().top + window.scrollY
        });
    }

    // MVP gap: Penpa+'s toolbars live in the page the board lives in. They are hidden, not removed, so main.js and
    // general.js keep finding their ids. Penpa+'s `.modal` dialogs stay usable, above the UI's layers and below
    // SweetAlert2's popups (1060).
    const chromeStyle = document.createElement('style');
    chromeStyle.textContent =
        'body.engine-mounted #header, body.engine-mounted #app-container, body.engine-no-puzzle #header, body.engine-no-puzzle #app-container { visibility: hidden; height: 0; overflow: hidden; }\n' +
        'body.engine-mounted #app-container .modal { visibility: visible; z-index: 1000; }\n' +
        'body.engine-mounted #float-key { display: none !important; }\n';
    document.head.appendChild(chromeStyle);

    // The theme is the UI's own choice, kept in localStorage: 'light' (the default) or 'dark'.
    const THEME_KEY = 'chinstrap-solve-theme-v1';
    const THEMES = { light: THEME_LIGHT, dark: THEME_DARK };
    function savedTheme() {
        return localStorage.getItem(THEME_KEY) === 'dark' ? 'dark' : 'light';
    }

    // MVP gap: Penpa+ keeps its theme in its `color_theme` cookie, which Penpa+'s own page shares. Taken off the list of
    // settings Penpa+ reads from and writes to its cookies, the solve page neither follows nor changes Penpa+'s theme;
    // Penpa+'s setter still swaps its stylesheet and redraws the board.
    UserSettings.can_save = UserSettings.can_save.filter((name) => name !== 'color_theme');
    function applyTheme(theme) {
        UserSettings.color_theme = THEMES[theme];
    }

    // MVP gap: Penpa+ decides the mode from the link's `m`, and an edit link's data does not load as a solve link. So an
    // edit link opens as Penpa+ opens it, then the page reopens on the solve link made from it.
    function reopenInSolveMode() {
        const solveLink = pu.maketext_solve();
        if (location.hash.includes('m=solve')) {
            throw new Error('engine: the solve link did not open in solve mode');
        }
        history.replaceState(null, '', location.pathname + solveLink.slice(solveLink.indexOf('#')));
        location.reload();
    }

    // solve.html never uses Penpa Lite, so every tool the grid supports is offered whatever the link's Tab set. Penpa+ looks
    // the function up by its global name when it runs, so replacing it here keeps the Tab set for the pins and the Tab cycle
    // (`tabSet`) and leaves Penpa+'s files as they are.
    window.advancecontrol_off = function () {};

    // Resolves when boot() has loaded the link's puzzle in solve mode; rejects with boot()'s error, which main.js already
    // shows, or with reopenInSolveMode's, shown here. An edit link never resolves: the page reloads. A page with no link
    // never resolves either.
    let resolveBoot;
    let rejectBoot;
    const ready = new Promise((resolve, reject) => {
        resolveBoot = resolve;
        rejectBoot = reject;
    });
    const penpaBoot = window.boot;
    // A copy of boot()'s own test for a link (general.js): a query with `p=`, else any `#` data. general.js is upstream's, so
    // it is copied rather than edited to export it.
    const hasPuzzleData = () => /(^|&)p=/.test(location.search.substring(1)) || location.hash.length > 1;
    window.boot = function () {
        if (!hasPuzzleData()) {
            document.body.classList.add('engine-no-puzzle');
            // Penpa+'s own handlers (a click anywhere, saving on unload) need its blank board, so boot() makes it as usual
            // and the CSS keeps it hidden. Nothing here waits on it: `ready` never settles.
            return penpaBoot.apply(this, arguments);
        }
        holdClockWhenSolved();
        UserSettings.outline_text = getCookie(OUTLINE_COOKIE) !== '0';
        const savedShortcuts = getCookie(SHORTCUTS_COOKIE);
        if (savedShortcuts !== null) {
            UserSettings.shortcuts_enabled = savedShortcuts === '1';
        }
        // Before the link loads, so a dark choice does not open light; after, since a link's own view setting can set dark.
        applyTheme(savedTheme());
        const booting = penpaBoot.apply(this, arguments);
        booting.then(() => {
            if (pu.mmode !== 'solve') {
                return reopenInSolveMode();
            }
            applyTheme(savedTheme());
            bootDone = true;
            // The clock was started by the restore of the saved progress, with a time that is the solve time.
            if (solvedWhileBooting || localStorage.getItem(solvedKey())) {
                latchSolved();
                sw_timer.pause();
            }
            resolveBoot();
        }, rejectBoot).catch((error) => {
            errorMsg(DOMPurify.sanitize(String(error)));
            rejectBoot(error);
        });
        return booting;
    };

    // ---- The solved state (#198). Penpa+ shows its SweetAlert2 popup (fireworks, its own fonts) on every solve and pauses the
    // clock, which Pause and Resume then restart. The solve page keeps the popup out, tells the UI once (`solved` event, the
    // first solve only) and holds the clock stopped for good: once latched, `sw_timer.start` does nothing until `restart()`.
    // A puzzle that opens already solved (a reload) is latched at the end of boot, with no event.
    // MVP gap: wraps Puzzle.check_solution, whose popup is a `Swal.fire` call 20 ms later, and the timer's start on the page.
    let latched = false;
    let bootDone = false;
    let solvedWhileBooting = false;
    // Set when a solve just happened: the next success popup is that solve's, and `announce` says whether the UI is told.
    let solvePopupDue = false;
    let announce = false;
    const solvedHandlers = new Set();

    // Kept per puzzle, so a reload of a board that was solved and then undone still opens with the clock stopped.
    const solvedKey = () => `chinstrap-solved-v1-${engine.getPuzzleId()}`;

    function latchSolved() {
        latched = true;
        localStorage.setItem(solvedKey(), '1');
        wakeTimerHandlers();
    }

    function unlatchSolved() {
        latched = false;
        localStorage.removeItem(solvedKey());
        wakeTimerHandlers();
    }

    const penpaCheckSolution = Puzzle.prototype.check_solution;
    Puzzle.prototype.check_solution = function () {
        const before = this.sol_flag;
        const result = penpaCheckSolution.apply(this, arguments);
        if (before === 0 && this.sol_flag === 1) {
            solvePopupDue = true;
            if (bootDone) {
                announce = !latched;
                latchSolved();
            } else {
                solvedWhileBooting = true;
            }
        }
        return result;
    };

    // The text of the popup's HTML, which Penpa+ builds from the setter's sanitized message.
    const textOfHtml = (html) => (html ? new DOMParser().parseFromString(html, 'text/html').body.textContent.trim() : '');

    const penpaFire = Swal.fire;
    Swal.fire = function (options) {
        if (solvePopupDue && options && options.icon === 'success') {
            solvePopupDue = false;
            if (announce) {
                announce = false;
                const detail = { title: textOfHtml(options.title), message: textOfHtml(options.html) };
                solvedHandlers.forEach((handler) => handler(detail));
            }
            return Promise.resolve({ isConfirmed: true });
        }
        return penpaFire.apply(this, arguments);
    };

    // Penpa+ covers the board whenever it redraws the grid with a paused clock (general.js redraw_grid, which the desk's fit and
    // zoom call), and a solved clock is paused: so a solved board would be covered by its first resize. A solved board is never
    // covered (`pauseTimer` does nothing then).
    const penpaShowPauseLayer = Puzzle.prototype.show_pause_layer;
    Puzzle.prototype.show_pause_layer = function () {
        if (!latched) {
            return penpaShowPauseLayer.apply(this, arguments);
        }
    };

    function holdClockWhenSolved() {
        const penpaStart = sw_timer.start;
        sw_timer.start = function () {
            return latched ? undefined : penpaStart.apply(this, arguments);
        };
    }

    // ---- Holds: in Sudoku mode Penpa+ lends Corner to a held Shift and Centre to a held Ctrl, and gives the sub-mode back on
    // the key's key-up. Penpa+ keeps no record the bridge can read, and a key-up that never comes (the window lost focus)
    // leaves its counters stuck so the next hold does nothing. So the bridge keeps its own: each key it saw start a hold,
    // with the tool before it.
    const HOLD_KEYS = ['Shift', 'Control', 'Meta'];
    const holds = new Map();
    // Keys whose hold was ended early: their real key-up, and the auto-repeats of the key still down, never reach Penpa+.
    const releasedKeys = new Set();
    let releasing = false;

    // Penpa+'s own condition for starting a hold (main.js onKeyDown): the first press, in Sudoku mode, with no other modifier.
    function startsHold(e) {
        const otherModifier = e.key === 'Shift' ? e.ctrlKey || e.metaKey || e.altKey : e.shiftKey || e.altKey;
        return HOLD_KEYS.includes(e.key) && !e.repeat && !otherModifier && pu.mode[pu.mode.qa].edit_mode === 'sudoku';
    }

    // The sub-mode of Sudoku each hold key lends: Shift Corner, Ctrl and Cmd Centre.
    const HOLD_SUBMODES = { Shift: '2', Control: '3', Meta: '3' };

    // A grid without the tool a key would lend (hex has no Corner) gets no hold from it: Penpa+ would put itself on a tool
    // `listTools()` does not list.
    function lendsListedTool(key) {
        return toolCatalog().some((t) => t.mode === 'sudoku' && t.submode === HOLD_SUBMODES[key]);
    }

    // MVP gap: main.js's onKeyUp is the only way to end a hold, so the end is a synthetic key-up straight to it. That key-up
    // stamps a Shift's release with Date.now(), and any key-down within 15 ms of the stamp turns Corner on in whatever mode
    // is then current (main.js onKeyDown reads a quick release-and-type as Shift still held). A release the bridge makes is
    // no such thing, so its stamp is main.js's own "long ago".
    const LONG_AGO_MS = -1e5;
    function endHolds() {
        for (const key of [...holds.keys()]) {
            holds.delete(key);
            releasedKeys.add(key);
            releasing = true;
            const now = Date.now;
            Date.now = () => LONG_AGO_MS;
            try {
                document.dispatchEvent(new KeyboardEvent('keyup', { key, bubbles: true }));
            } finally {
                Date.now = now;
                releasing = false;
            }
        }
    }
    window.addEventListener('blur', endHolds);
    document.addEventListener('visibilitychange', () => {
        if (document.hidden) {
            endHolds();
        }
    });

    // MVP gap: main.js adds its key handlers on `document` from inside its onload, as closure-local functions that cannot be
    // removed afterwards. This file runs before that onload, so it wraps `document.addEventListener` until both are
    // added and puts the gate around them. Nothing stops propagation, so other listeners (Web Awesome's) see every key.
    const PENPA_KEY_HANDLERS = { keydown: 'onKeyDown', keyup: 'onKeyUp' };
    const gatedKeyTypes = new Set();
    let keyHandler = null;
    // A hold ends on its key's key-up wherever focus is: the UI may answer for that key-up, and Penpa+ ignores one aimed
    // at a text field.
    function endsHold(e) {
        return e.type === 'keyup' && holds.has(e.key);
    }
    // Runs Penpa+'s handler for a key the gate let through, keeping the holds' record.
    function passToPenpa(penpaListener, self, e) {
        if (e.type === 'keyup') {
            holds.delete(e.key);
        }
        if (!HOLD_KEYS.includes(e.key) || releasing) {
            return penpaListener.call(self, e);
        }
        if (releasedKeys.has(e.key)) {
            if (e.type === 'keydown' && !e.repeat) {
                releasedKeys.delete(e.key);
            } else {
                return;
            }
        }
        if (e.type === 'keydown' && startsHold(e)) {
            if (!lendsListedTool(e.key)) {
                releasedKeys.add(e.key);
                return;
            }
            holds.set(e.key, engine.getTool());
        }
        return penpaListener.call(self, e);
    }
    document.addEventListener = function (type, listener, options) {
        if (type in PENPA_KEY_HANDLERS && PENPA_KEY_HANDLERS[type] === listener?.name && !gatedKeyTypes.has(type)) {
            const penpaListener = listener;
            gatedKeyTypes.add(type);
            listener = function (e) {
                const caught = !releasing && keyHandler !== null && keyHandler(e);
                if (endsHold(e)) {
                    endHolds();
                } else if (!caught) {
                    return passToPenpa(penpaListener, this, e);
                }
            };
            if (gatedKeyTypes.size === Object.keys(PENPA_KEY_HANDLERS).length) {
                delete document.addEventListener;
            }
        }
        return EventTarget.prototype.addEventListener.call(this, type, listener, options);
    };

    // The Puzzle methods whose calls can change what the UI shows. Hooked on the prototype, so a `pu` that load() replaces
    // stays hooked, and a wrapper on the instance (recorder.js) calls through to the hook.
    const HOOKED_PUZZLE_METHODS = ['redraw', 'mode_set', 'submode_check', 'stylemode_check', 'subcombimode', 'subsymbolmode',
        'set_orientation'];
    const changeHandlers = new Set();
    let changeQueued = false;
    function queueChange() {
        if (changeQueued) {
            return;
        }
        changeQueued = true;
        requestAnimationFrame(() => {
            changeQueued = false;
            changeHandlers.forEach((handler) => handler());
        });
    }
    HOOKED_PUZZLE_METHODS.forEach((name) => {
        const original = Puzzle.prototype[name];
        Puzzle.prototype[name] = function () {
            try {
                return original.apply(this, arguments);
            } finally {
                queueChange();
            }
        };
    });

    // MVP gap: Penpa+'s first landing on Shape mode switches `UserSettings.panel_shown` on, and the solve page has no control
    // for it, so picking a tool restores the setting as it was.
    const penpaModeSet = Puzzle.prototype.mode_set;
    Puzzle.prototype.mode_set = function () {
        const panelShown = UserSettings.panel_shown;
        try {
            return penpaModeSet.apply(this, arguments);
        } finally {
            if (UserSettings.panel_shown !== panelShown) {
                UserSettings.panel_shown = panelShown;
            }
        }
    };

    // MVP gap: Penpa+'s left click with a Shape tool places the panel's selected variant (the first, as the hidden panel
    // is never clicked) only while `panel_shown` is on, and otherwise just moves the cursor. The raw field is set, not the
    // setter, so no panel or toggle on the page changes.
    const penpaMouseSymbol = Puzzle.prototype.mouse_symbol;
    Puzzle.prototype.mouse_symbol = function () {
        const panelShown = UserSettings._panel_shown;
        UserSettings._panel_shown = true;
        try {
            return penpaMouseSymbol.apply(this, arguments);
        } finally {
            UserSettings._panel_shown = panelShown;
        }
    };

    // MVP gap: Penpa+'s popups are SweetAlert2's container (the Congratulations popup, its alerts) and its `.modal` elements,
    // shown by setting `style.display`. The watcher only wakes the `change` event; getState reads the live elements.
    function penpaDialogOpen() {
        return document.querySelector('.swal2-container') !== null ||
            [...document.querySelectorAll('.modal')].some((m) => m.style.display && m.style.display !== 'none');
    }
    new MutationObserver(queueChange).observe(document.documentElement, {
        childList: true, subtree: true, attributes: true, attributeFilter: ['style', 'class']
    });


    // ---- The tool catalog: what the link offers, read once from Penpa+'s mode radios and menus. A tool is a mode, a
    // sub-mode (null where the mode has none) and a style (null where the tool has none).

    // Style names, checked against the legacy labels' computed backgrounds on 2026-11-13 (the prototype's tables).
    const PATH_STYLE = {
        3: 'green', 2: 'black', 5: 'grey', 8: 'red', 9: 'blue', 80: 'thin', 1: 'thin', 12: 'dotted',
        13: 'fat dots', 17: 'fat dots', 40: 'short', 30: 'double', 21: 'thicker', 14: 'grey dot'
    };
    const VALUE_STYLE = {
        1: 'black', 2: 'green', 8: 'blue', 3: 'grey', 9: 'dark blue', 10: 'red', 4: 'white', 5: 'white background',
        0: 'outline', 6: 'black on white circle', 7: 'white on black circle', 11: 'white on red circle'
    };
    const SURFACE_STYLE = Object.fromEntries(SURFACE_COLOURS);
    const STYLE_NAMES = {
        line: PATH_STYLE, lineE: PATH_STYLE, wall: PATH_STYLE, number: VALUE_STYLE, sudoku: VALUE_STYLE,
        surface: SURFACE_STYLE, symbol: { 1: 'behind lines', 2: 'in front of lines' },
        cage: { 10: 'dotted line', 7: 'grey line', 15: 'grey dots', 16: 'solid line' }
    };
    // The modes whose colour styles are pen strokes, so their swatch is the stroke colour of Penpa+'s `set_line_style`.
    const PEN_BOXES = new Set(['line', 'lineE', 'wall']);
    // The styles that are colours: only these have a swatch.
    const COLOUR_STYLE_NAMES = new Set([...Object.values(SURFACE_STYLE), 'green', 'black', 'grey', 'red', 'blue', 'dark blue']);

    // The key that picks each Surface colour, which Penpa+'s `surfaceKeys` (main.js) deals out in a different order from the colours' own
    // numbers. Multicolor's keys pick the same colours.
    const SURFACE_KEY_OF_STYLE = { 1: '1', 8: '2', 3: '3', 4: '4', 2: '5', 5: '6', 6: '7', 7: '8', 9: '9', 10: '0', 11: '11', 12: '12' };

    const SUBMODE_NAMES = {
        line: { 1: 'normal', 2: 'diagonal', 3: 'free', 5: 'middle', 4: 'helper ×' },
        lineE: { 1: 'normal', 2: 'diagonal', 3: 'free', 6: 'middle', 4: 'helper ×', 5: 'clear' },
        number: { 1: 'normal', 10: 'large', 6: 'medium', 5: 'small', 7: 'candidates', 3: 'quarter', 9: 'side', 8: 'long' },
        sudoku: { 1: 'normal', 2: 'corner', 3: 'centre' },
        cage: { 1: 'killer', 2: 'free' },
        move: { 1: 'all', 2: 'numbers', 3: 'shapes' },
        special: {
            thermo: 'thermo', nobulbthermo: 'no-bulb thermo', arrows: 'sudoku arrow', direction: 'arrow',
            squareframe: 'rectangle frame', polygon: 'polygon'
        }
    };
    const COMPOSITE_NAMES = {
        blpo: 'Shade + dot', shaka: 'Corner triangles + dot', linex: 'Line + edge ×', lineox: 'Line + cell ○ ×',
        linedir: 'Line + direction marks', yajilin: 'Shade + line', hashi: 'Bridges', rassisillai: 'Line + cell marks',
        edgex: 'Edges + ×', edgexoi: 'Edges + inside / outside', edgesub: 'Edges + helper line', numfl: 'Numbers by flick',
        alfl: 'Letters by flick', blwh: 'Black + white circles', star: 'Stars + ×', akari: 'Bulbs + dots',
        battleship: 'Ship pieces + water', tents: 'Tents + ×', mines: 'Mines + ×', doublemines: 'One or two mines + ×',
        magnets: 'Magnet poles + −', arrowS: 'Arrows in cells'
    };
    // Penpa+'s shape groups, from the ms1_ / ms3_ / ms4_ ids of the Shape menu.
    const SHAPE_GROUP_NAMES = {
        circle: 'Circle', square: 'Square', triup: 'Triangle up', tridown: 'Triangle down', triright: 'Triangle right',
        trileft: 'Triangle left', diamond: 'Diamond', hexpoint: 'Hexagon, point up', hexflat: 'Hexagon, flat',
        ox: '○ △ □ ×', bars: 'Bars', math: 'Math', degital: 'Digital digits', arrow_B: 'Arrow', arrow_N: 'Arrow, notched',
        arrow_tri: 'Arrow, triangle', arrow_fouredge: 'Arrows, four edges', arrow_GP: 'Arrow, graphic', battleship: 'Ship'
    };
    // The Composite tools that show Penpa+'s line / edge style box (subcombimode in class_p.js).
    const COMPOSITE_LINE_STYLE = ['linex', 'lineox', 'linedir', 'yajilin', 'rassisillai', 'tents'];
    const COMPOSITE_EDGE_STYLE = ['edgex', 'edgexoi'];

    // MVP gap: Penpa+ hides what a grid type or a mode of the solve page leaves out by `display: none` on the element or an
    // ancestor, or by the class `is_hidden`. `container` is the mode's own box, whose display follows the current mode.
    function hiddenInPenpa(node, container) {
        for (let n = node; n && n !== container; n = n.parentElement) {
            if (n.classList.contains('is_hidden') || n.style.display === 'none') {
                return true;
            }
        }
        return false;
    }

    function textOf(node) {
        return node ? node.textContent.replace(/\s+/g, ' ').trim() : '';
    }

    // The style box whose radios a tool picks from, or null when it has none. Multicolor uses Surface's swatches.
    function styleBoxOf(mode, submode) {
        if (mode === 'combi') {
            return COMPOSITE_LINE_STYLE.includes(submode) ? 'line' : COMPOSITE_EDGE_STYLE.includes(submode) ? 'lineE' : null;
        }
        return mode === 'multicolor' ? 'surface' : mode;
    }

    const SAMPLE_FONT_PX = 10;

    // MVP gap: reads the colour Penpa+'s own paint setter gives colour style `style` of style box `box`, on a scratch canvas.
    // A legacy label's background is no source: its colour is a variable of the theme stylesheet, undefined while a theme
    // switch reloads it, and a checked label has a grey ground of its own.
    function colourOf(box, style) {
        const scratch = document.createElement('canvas').getContext('2d');
        if (PEN_BOXES.has(box)) {
            set_line_style(scratch, style);
            return scratch.strokeStyle;
        }
        if (box === 'surface') {
            set_surface_style(scratch, style);
        } else {
            set_font_style(scratch, SAMPLE_FONT_PX, style);
        }
        return scratch.fillStyle;
    }

    // The disc Penpa+ draws behind a digit of each text style that has one: the `set_circle_style` number class_square.js draws it
    // with, or null for a style that is only listed here to get a sample.
    const TEXT_STYLE_DISC = { 0: null, 6: 1, 7: 2, 11: 11 };

    // MVP gap: calls Penpa+'s `set_font_style` and `set_circle_style` on a scratch canvas to read how it paints a digit of text
    // style `style` and the disc behind it, so the Mode card's sample is the board's own drawing. `text()` strokes at
    // `outlineWidth` when the outline is on, which `set_font_style` leaves in the module, not on the context.
    function textSampleOf(style) {
        const scratch = document.createElement('canvas').getContext('2d');
        const paint = () => ({ fill: scratch.fillStyle, stroke: scratch.strokeStyle, lineWidth: scratch.lineWidth });
        set_font_style(scratch, SAMPLE_FONT_PX, style);
        const text = { ...paint(), lineWidth: outlineWidth ?? scratch.lineWidth };
        const discStyle = TEXT_STYLE_DISC[style];
        if (discStyle === null) {
            return { fontSize: SAMPLE_FONT_PX, text, disc: null };
        }
        set_circle_style(scratch, discStyle);
        return { fontSize: SAMPLE_FONT_PX, text, disc: paint() };
    }

    function stylesOf(mode, submode) {
        const box = styleBoxOf(mode, submode);
        const container = box && document.getElementById(`style_${box}`);
        if (!container) {
            return [];
        }
        return [...container.querySelectorAll('input[type=radio][id^="st_"]')].flatMap((radio) => {
            const label = document.getElementById(`${radio.id}_lb`);
            if (!label || hiddenInPenpa(label, container)) {
                return [];
            }
            const name = STYLE_NAMES[box]?.[radio.value] ?? `style ${radio.value}`;
            const style = parseInt(radio.value, 10);
            const swatch = COLOUR_STYLE_NAMES.has(name) ? colourOf(box, style) : null;
            const sample = box === 'number' && style in TEXT_STYLE_DISC ? textSampleOf(style) : null;
            return [{ style, name, swatch, sample, key: box === 'surface' ? SURFACE_KEY_OF_STYLE[style] ?? null : null }];
        });
    }

    // The Shape menu's shapes this grid type offers, each with the label Penpa+ shows and the group it sits in.
    function shapeTools() {
        const menu = document.getElementById('mode_symbol');
        const tools = [];
        let group = '';
        menu.querySelectorAll('[id^="ms"]').forEach((node) => {
            if (/^ms\d+$/.test(node.id)) {
                group = '';
            } else if (/^ms\d+_/.test(node.id)) {
                group = node.id.replace(/^ms\d+_/, '');
            } else if (node.id.startsWith('ms_') && !hiddenInPenpa(node, menu)) {
                const name = node.id.slice(3);
                const size = textOf(node);
                const inGroup = group && (name === group || name.startsWith(`${group}_`));
                const submodeName = inGroup ? `${SHAPE_GROUP_NAMES[group] ?? group.replace(/_/g, ' ')} ${size}` : size || name;
                tools.push({ submode: name, submodeName, labels: [size, name].filter(Boolean) });
            }
        });
        return tools;
    }

    function compositeTools() {
        const menu = document.getElementById('mode_combi');
        return penpa_modes[pu.gridtype].combisub.flatMap((name) => {
            const node = document.getElementById(`combisub_${name}`);
            if (!node || hiddenInPenpa(node, menu)) {
                return [];
            }
            return [{ submode: name, submodeName: COMPOSITE_NAMES[name] ?? textOf(node), labels: [textOf(node)] }];
        });
    }

    function radioTools(mode) {
        const container = document.getElementById(`mode_${mode}`);
        if (!container) {
            return [];
        }
        return [...container.querySelectorAll(`input[type=radio][id^="sub_${mode}"]`)].flatMap((radio) => {
            const label = document.getElementById(`${radio.id}_lb`);
            if (!label || hiddenInPenpa(label, container) || !penpa_modes[pu.gridtype].sub.includes(radio.id.slice(4))) {
                return [];
            }
            return [{ submode: radio.value, submodeName: SUBMODE_NAMES[mode]?.[radio.value] ?? textOf(label), labels: [textOf(label)] }];
        });
    }

    function buildCatalog() {
        return penpa_modes[pu.gridtype].mode.flatMap((mode) => {
            const modeLabel = document.getElementById(`mo_${mode}_lb`);
            if (!modeLabel || hiddenInPenpa(modeLabel, null)) {
                return [];
            }
            const subTools = mode === 'symbol' ? shapeTools() : mode === 'combi' ? compositeTools() : radioTools(mode);
            const modeName = mode_names[mode] ?? mode;
            const own = [{ submode: null, submodeName: null, labels: [] }];
            return (subTools.length || mode === 'symbol' || mode === 'combi' ? subTools : own).map((sub) => ({
                mode,
                modeName,
                submode: sub.submode,
                submodeName: sub.submodeName,
                name: [modeName, sub.submodeName].filter(Boolean).join(' · '),
                labels: [textOf(modeLabel), ...sub.labels],
                styles: stylesOf(mode, sub.submode)
            }));
        });
    }

    let catalog = null;
    function toolCatalog() {
        boardCanvas();
        catalog ??= buildCatalog();
        return catalog;
    }

    // Penpa+ stores a mode with no sub-mode as "" and a missing one as undefined.
    function rememberedSubmode(value) {
        return value === undefined || value === '' ? null : String(value);
    }

    // The tool in the catalog for `mode` and `submode`, or a RangeError naming what the call got wrong.
    function requireTool(mode, submode) {
        const ofMode = toolCatalog().filter((t) => t.mode === mode);
        if (!ofMode.length) {
            throw new RangeError(`engine.setTool: no mode "${String(mode)}"; the link offers ${[...new Set(toolCatalog().map((t) => t.mode))].join(', ')}`);
        }
        const tool = ofMode.find((t) => t.submode === submode);
        if (!tool) {
            throw new RangeError(`engine.setTool: mode "${mode}" has no sub-mode ${JSON.stringify(submode)}`);
        }
        return tool;
    }

    const ENGINE_EVENTS = ['change', 'timer', 'solved'];

    // easytimer's events that change the clock's reading or whether it runs. `secondsUpdated` is Penpa+'s own once-a-second tick.
    const TIMER_EVENTS = ['secondsUpdated', 'started', 'paused', 'stopped', 'reset'];
    const timerHandlers = new Set();
    function wakeTimerHandlers() {
        timerHandlers.forEach((handler) => handler());
    }
    function watchTimer() {
        TIMER_EVENTS.forEach((name) => sw_timer.addEventListener(name, wakeTimerHandlers));
    }

    // MVP gap: Penpa+'s pause and start closures live in main.js's onload and are reached only through their buttons, which
    // also show and hide Penpa+'s own pause layer.
    function pressTimerButton(id) {
        document.getElementById(id).click();
    }

    // True while a hold has lent a tool other than the one before it.
    function isHeld() {
        const now = engine.getTool();
        return [...holds.values()].some((before) => before.mode !== now.mode || before.submode !== now.submode);
    }

    // ---- Change size ------------------------------------------------------------------------------------------------

    const NOT_SQUARE = 'Only a grid of square cells can change size.';

    // The sides `changeSize` takes, as the board is drawn: what the outermost line of cells there is, the axis it lies across,
    // which way is outward on that axis, and the side of Penpa+'s unturned board it is at each `get_orientation` value (0 to
    // 3), main.js's table for its Change Size buttons (`rt_addtop` and the rest).
    const SIZE_SIDES = Object.freeze({
        top: { line: 'row', axis: 'y', outward: -1, penpa: ['b', 'l', 't', 'r'] },
        bottom: { line: 'row', axis: 'y', outward: 1, penpa: ['t', 'r', 'b', 'l'] },
        left: { line: 'column', axis: 'x', outward: -1, penpa: ['r', 'b', 'l', 't'] },
        right: { line: 'column', axis: 'x', outward: 1, penpa: ['l', 't', 'r', 'b'] }
    });
    // Penpa+'s unturned sides: the method that resizes each, its index in `pu.space`, and the count of lines across it.
    const PENPA_SIDES = Object.freeze({
        t: { resize: 'resize_top', space: 0, count: 'ny' },
        b: { resize: 'resize_bottom', space: 1, count: 'ny' },
        l: { resize: 'resize_left', space: 2, count: 'nx' },
        r: { resize: 'resize_right', space: 3, count: 'nx' }
    });
    // A point this far inside the line between the outermost two lines of cells, as a share of the cell size, is on the
    // outermost line; one nearer is on that boundary and stays.
    const BOUNDARY_SLACK = 0.1;
    // Canvas positions are compared to a hundredth of a pixel: a turned board puts cell centres at half pixels, give or take
    // a float's error.
    const POSITION_STEPS_PER_PX = 100;

    const penpaSideOf = (side) => PENPA_SIDES[SIZE_SIDES[side].penpa[pu.get_orientation(side[0])]];

    // The centres of the drawn cells' columns (`xs`) and rows (`ys`), in canvas px, ascending; blank rows and columns included.
    // MVP gap: Penpa+ draws the cells `i + j * nx0` inside PENPA_MARGIN_CELLS on each side, turned and flipped in place.
    function drawnLines() {
        const at = (px) => Math.round(px * POSITION_STEPS_PER_PX) / POSITION_STEPS_PER_PX;
        const xs = new Set();
        const ys = new Set();
        for (let j = PENPA_MARGIN_CELLS; j < pu.ny0 - PENPA_MARGIN_CELLS; j++) {
            for (let i = PENPA_MARGIN_CELLS; i < pu.nx0 - PENPA_MARGIN_CELLS; i++) {
                const cell = pu.point[i + j * pu.nx0];
                xs.add(at(cell.x));
                ys.add(at(cell.y));
            }
        }
        const ascending = (set) => [...set].sort((a, b) => a - b);
        return { xs: ascending(xs), ys: ascending(ys) };
    }

    // MVP gap: Penpa+ keys an object feature of `pu.pu_q` or `pu.pu_a` by a point id or a "a,b" pair of them, and fills an array
    // feature with lists of point ids (a removed one leaves a hole), as its `translate_puzzle_elements` reads them; the undo
    // logs are left out. Anything else throws, so content this cannot place never reads as an empty row.
    function pointsUsed(entries) {
        const ids = [];
        Object.entries(entries).forEach(([name, feature]) => {
            if (name.startsWith('command_') || !feature) {
                return;
            }
            if (Array.isArray(feature)) {
                feature.forEach((item) => {
                    if (Array.isArray(item)) {
                        ids.push(...item);
                    } else if (item != null) {
                        throw new Error(`engine: ${name} holds ${JSON.stringify(item)}, not a list of points`);
                    }
                });
            } else {
                Object.keys(feature).forEach((key) => ids.push(...key.split(',')));
            }
        });
        return ids.map((id) => {
            if (!pu.point[Number(id)]) {
                throw new Error(`engine: an entry is on ${JSON.stringify(id)}, which is not a point of the board`);
            }
            return Number(id);
        });
    }

    // The outermost line ends halfway to the next line's centres, less BOUNDARY_SLACK.
    function isOnOutermostLine(id, side, drawn) {
        const { axis, outward } = SIZE_SIDES[side];
        const lines = axis === 'x' ? drawn.xs : drawn.ys;
        const [outer, inner] = outward < 0 ? [lines[0], lines[1]] : [lines.at(-1), lines.at(-2)];
        const boundary = (outer + inner) / 2;
        const slack = Math.abs(outer - inner) * BOUNDARY_SLACK;
        return (pu.point[id][axis] - boundary) * outward > slack;
    }

    // Why `changeSize(side, change)` cannot run on a square-cell grid, or null when it can.
    function sizeChangeRefusal(side, change) {
        const { line } = SIZE_SIDES[side];
        const penpaSide = penpaSideOf(side);
        if (change > 0) {
            const max = pu.gridmax.square;
            return pu[penpaSide.count] + 1 > max ? `The board has ${max} ${line}s, the most Penpa+ allows.` : null;
        }
        if (pu.space[penpaSide.space] === 0) {
            return `The ${side} ${line} is part of the grid.`;
        }
        const drawn = drawnLines();
        const holds = (entries) => pointsUsed(entries).some((id) => isOnOutermostLine(id, side, drawn));
        if (holds(pu.pu_q)) {
            return `The ${side} ${line} holds a given.`;
        }
        if (holds(pu.pu_a)) {
            return `The ${side} ${line} holds an entry.`;
        }
        return null;
    }

    const engine = {
        ready,

        // False when the page opened with no link: `ready` then never settles and no puzzle is loaded.
        hasPuzzle: hasPuzzleData(),

        // The theme the page opens in, 'light' or 'dark': read without a puzzle open, which `getSettings` needs.
        savedTheme: savedTheme(),

        // The state the UI draws from. Read it when `change` fires. `tool` is `getTool()`'s, `held` is true while a held Shift
        // or Ctrl lends a tool, `solved` while the board matches the author's answer, and `cellSize` is the board's pixels
        // per cell.
        getState() {
            boardCanvas();
            // MVP gap: the solver's undo and redo stacks, where Penpa+ keeps them.
            const entries = pu[pu.mode.qa];
            return {
                tool: engine.getTool(),
                // MVP gap: Penpa+'s answer check keeps its verdict in `sol_flag`.
                solved: pu.sol_flag === 1,
                cellSize: UserSettings.displaysize,
                penpaDialogOpen: penpaDialogOpen(),
                held: isHeld(),
                canUndo: entries.command_undo.__a.length > 0,
                canRedo: entries.command_redo.__a.length > 0
            };
        },

        // `change` runs `handler()` at most once per frame after the state may have changed; `timer` runs it on every tick of
        // the clock and whenever it starts, pauses, resets or becomes solved. Read `getTimer()` then; `solved` runs
        // `handler({ title, message })` (the setter's words, as text) when the puzzle is solved and was not solved since it
        // was last restarted or its progress cleared: not for a puzzle that opened solved, nor a redo back into the solved state.
        on(event, handler) {
            if (!ENGINE_EVENTS.includes(event)) {
                throw new RangeError(`engine.on: no event "${String(event)}"; the events are ${ENGINE_EVENTS.join(', ')}`);
            }
            if (typeof handler !== 'function') {
                throw new TypeError('engine.on: handler must be a function');
            }
            if (event === 'solved') {
                solvedHandlers.add(handler);
            } else if (event === 'timer') {
                boardCanvas();
                if (!timerHandlers.size) {
                    watchTimer();
                }
                timerHandlers.add(handler);
            } else {
                changeHandlers.add(handler);
            }
        },

        // Ends a held Shift or Ctrl: the tool before the hold comes back, and the key's real key-up changes nothing. Nothing
        // happens when no hold is on.
        releaseHolds() {
            boardCanvas();
            endHolds();
        },

        // Undoes the solver's last entry; false when there is none.
        undo() {
            boardCanvas();
            if (!engine.getState().canUndo) {
                return false;
            }
            pu.undo();
            return true;
        },

        // Redoes what `undo()` took back; false when there is nothing to redo.
        redo() {
            boardCanvas();
            if (!engine.getState().canRedo) {
                return false;
            }
            pu.redo();
            return true;
        },

        // Clears the solver's entries (never the givens), the selection and the undo history, then restarts the clock from
        // zero, running, and the puzzle is unsolved again. A paused board is uncovered.
        restart() {
            boardCanvas();
            pu.reset_board();
            pu.selection = [];
            pu.redraw();
            unlatchSolved();
            sw_timer.reset();
            pressTimerButton('sw_start');
        },

        // The clock: whole and fractional `seconds` elapsed, and whether it is `paused`. `covered` is true while the solver's
        // own pause (the Pause button or F4) has Penpa+'s pause layer up; a solve also pauses the clock, with no layer (#119).
        // `solved` is true from the puzzle's first solve (or its opening solved) until `restart()`: the clock then never runs.
        getTimer() {
            boardCanvas();
            return {
                seconds: sw_timer.getTotalTimeValues().secondTenths / 10,
                paused: sw_timer.isPaused(),
                solved: latched,
                // MVP gap: read from Penpa+'s pause layer, which its Pause and Start buttons show and hide.
                covered: document.getElementById('pause_canvas').style.display !== 'none'
            };
        },

        // Pauses the clock and covers Penpa+'s own board with its pause layer; nothing happens when the layer is already up or the
        // puzzle is solved (its clock is stopped for good).
        pauseTimer() {
            boardCanvas();
            if (!latched && !engine.getTimer().covered) {
                pressTimerButton('sw_pause');
            }
        },

        // Resumes the clock and uncovers the board. A solved puzzle's clock stays stopped, so the timer handlers are woken here:
        // no `started` event does it.
        startTimer() {
            boardCanvas();
            pressTimerButton('sw_start');
            wakeTimerHandlers();
        },

        // 'light' or 'dark': the page's theme and the board's, kept in localStorage for the next visit.
        setTheme(theme) {
            if (!Object.hasOwn(THEMES, theme)) {
                throw new RangeError(`engine.setTheme: theme must be one of ${Object.keys(THEMES).join(', ')}, got ${String(theme)}`);
            }
            boardCanvas();
            localStorage.setItem(THEME_KEY, theme);
            applyTheme(theme);
        },

        // The front door for keys. `handler(event)` runs for every keydown and keyup before Penpa+'s handlers and answers
        // 'ui' or 'browser' (Penpa+ never sees the event, and the bridge does not touch its default) or nothing (Penpa+ gets it).
        onKey(handler) {
            if (typeof handler !== 'function') {
                throw new TypeError('engine.onKey: handler must be a function');
            }
            if (gatedKeyTypes.size !== Object.keys(PENPA_KEY_HANDLERS).length) {
                throw new Error('engine.onKey: the gate missed main.js\'s key handlers, so it would do nothing');
            }
            if (keyHandler) {
                throw new Error('engine.onKey: a key handler is already set');
            }
            keyHandler = (e) => {
                const answer = handler(e);
                if (answer !== undefined && answer !== 'ui' && answer !== 'browser') {
                    throw new RangeError(`engine.onKey: the handler answered ${String(answer)}; it must answer 'ui', 'browser' or nothing`);
                }
                return answer !== undefined;
            };
        },

        // Every tool the link offers, in the order of Penpa+'s mode list. `labels` are the names Penpa+'s own menus give it,
        // `styles` its colours and line looks with a display name, the swatch colour (null where the style is no colour), the `key` that picks a Surface
        // or Multicolor colour (null elsewhere) and, for Number's text styles drawn as outline or on a disc, a `sample` of how Penpa+ paints the digit and its disc.
        listTools() {
            return toolCatalog().map((tool) => ({
                ...tool, labels: [...tool.labels], styles: tool.styles.map((style) => ({ ...style, sample: structuredClone(style.sample) }))
            }));
        },

        // The tool in use: Penpa+'s current mode with that mode's sub-mode and style.
        getTool() {
            const mode = pu.mode[pu.mode.qa].edit_mode;
            const [submode, style] = pu.mode[pu.mode.qa][mode];
            const listed = toolCatalog().find((t) => t.mode === mode && t.submode === rememberedSubmode(submode));
            // A key or a script can put Penpa+ in a mode the catalogue leaves out; it is still the tool in use.
            const current = listed?.styles.find((s) => s.style === Number(style));
            return { mode, submode: rememberedSubmode(submode), style: current ? current.style : null };
        },

        // The directions Number mode writes in that the link's grid offers, in the order of Penpa+'s Orientation buttons: `R` is
        // the usual left to right, and the rest turn the text (`U` up, `UL` up and left, `DL` down and left, and so on).
        listOrientations() {
            const offered = penpa_modes[pu.gridtype].rot;
            return [...document.querySelectorAll('#orientation_button input[name=orientation_button]')]
                .map((radio) => radio.value).filter((direction) => offered.includes(direction));
        },

        // The direction Number mode writes in, or null while the tool is not Number or the grid offers no direction. `R` is
        // what Penpa+'s `mode_set` falls back to while none has been picked.
        getOrientation() {
            const mode = pu.mode[pu.mode.qa].edit_mode;
            return mode === 'number' && engine.listOrientations().length ? pu.mode[pu.mode.qa].number[2] || 'R' : null;
        },

        // Sets the direction Number mode writes in, which only Number has: another tool, or a direction `listOrientations()`
        // does not list, throws and changes nothing.
        setOrientation(direction) {
            if (pu.mode[pu.mode.qa].edit_mode !== 'number') {
                throw new Error(`engine.setOrientation: the tool is ${pu.mode[pu.mode.qa].edit_mode}, not number`);
            }
            if (!engine.listOrientations().includes(direction)) {
                throw new RangeError(`engine.setOrientation: no direction ${JSON.stringify(direction)}; the grid offers ${engine.listOrientations().join(', ')}`);
            }
            pu.set_orientation(direction);
        },

        // The link's Tab set, in the order the link gives it, as tools of `listTools()` without a style. Penpa+ names a mode
        // with no sub-mode of its own in the set (Shape, Special, Composite); it is the sub-mode Penpa+ remembers for the
        // mode, else the first listed. A name the link's grid does not offer is left out, and so is a repeat.
        tabSet() {
            const catalog = toolCatalog();
            const seen = new Set();
            return UserSettings.tab_settings.flatMap((name) => {
                const target = PenpaText.modes.mapping[PenpaText.modes.EN.indexOf(name)];
                const ofMode = catalog.filter((t) => t.mode === target);
                const tool = catalog.find((t) => `sub_${t.mode}${t.submode}` === target) ??
                    ofMode.find((t) => t.submode === rememberedSubmode(pu.mode[pu.mode.qa][target]?.[0])) ?? ofMode[0];
                const key = tool && `${tool.mode}/${tool.submode}`;
                if (!tool || seen.has(key)) {
                    return [];
                }
                seen.add(key);
                return [{ mode: tool.mode, submode: tool.submode }];
            });
        },

        // Every setting of the fixed list by name: a boolean, or the number Penpa+'s own control holds. `theme` is read here too,
        // but set with `setTheme`.
        getSettings() {
            boardCanvas();
            const listed = Object.fromEntries(Object.entries(SETTINGS).map(([name, allowed]) =>
                [name, allowed === BOOLEAN ? Boolean(UserSettings[name]) : UserSettings[name]]));
            return { ...listed, theme: UserSettings.color_theme === THEME_DARK ? 'dark' : 'light' };
        },

        // The settings of the fixed list the open puzzle uses: every one, less the genre ones its genre tags rule out.
        getPuzzleSettings() {
            boardCanvas();
            return Object.keys(SETTINGS).filter((name) => SETTING_GENRES[name]?.() ?? true);
        },

        // Changes one setting and saves it where Penpa+ saves it. An unknown name or a value the setting does not take throws and
        // changes nothing. conflict_detection 2 is "off for this puzzle": Penpa+ keeps it in memory only and turns it back on for
        // the next puzzle it loads, so the UI keeps it per puzzle.
        setSetting(name, value) {
            boardCanvas();
            if (!Object.hasOwn(SETTINGS, name)) {
                throw new RangeError(`engine.setSetting: no setting "${String(name)}"; the settings are ${Object.keys(SETTINGS).join(', ')}`);
            }
            const allowed = SETTINGS[name];
            if (allowed === BOOLEAN && typeof value !== 'boolean') {
                throw new TypeError(`engine.setSetting: ${name} takes true or false, got ${String(value)}`);
            }
            if (allowed !== BOOLEAN && !allowed.includes(value)) {
                throw new RangeError(`engine.setSetting: ${name} takes one of ${allowed.join(', ')}, got ${JSON.stringify(value)}`);
            }
            UserSettings[name] = value;
            SETTING_SAVERS[name]?.(value);
            if (REDRAWN_SETTINGS.includes(name)) {
                pu.redraw();
            }
        },

        // Writes the open puzzle's progress to the store where Penpa+ reads it back at boot, and resolves true once the write
        // has finished, or false, writing nothing, when Penpa+ would not save it (`saveProgressNow`, progress_autosave.js).
        async saveProgress() {
            boardCanvas();
            return saveProgressNow();
        },

        // Removes this puzzle's saved progress, and stops Penpa+ saving it again until the page reloads, as Penpa+'s "Clear this
        // puzzle" does. A puzzle with no link data was never saved, so there is nothing to clear.
        // MVP gap: PenpaProgress.clearPuzzle does not wait for localforage's removal, so this waits for it itself.
        async clearSavedProgress() {
            boardCanvas();
            if (!pu.url) {
                return;
            }
            UserSettings.save_current_puzzle = false;
            localStorage.removeItem(solvedKey());
            const hash = PenpaProgress.getHash(pu.url);
            await PenpaProgress.clearPuzzle(hash);
            if (await PenpaProgress.canSaveProgress()) {
                await localforage.removeItem(hash);
            }
        },

        // Applies a tool. A sub-mode or style left out stays as Penpa+ remembers it for the mode; one given must be in
        // `listTools()` (`submode: null` for a mode with none), or the call throws and changes nothing. A held Shift or Ctrl
        // ends first, and a style only picks the colour: it never colours a cell (`colourSelection` does).
        setTool(tool) {
            if (typeof tool !== 'object' || tool === null) {
                throw new TypeError('engine.setTool: tool must be an object like { mode, submode, style }');
            }
            const { mode, style } = tool;
            // A hold has lent Penpa+'s remembered sub-mode; the one before it is what the hold gives back.
            const beforeHold = holds.values().next().value;
            const remembered = beforeHold?.mode === mode ? beforeHold.submode
                : rememberedSubmode(pu.mode[pu.mode.qa][mode]?.[0]);
            const submode = tool.submode !== undefined ? tool.submode : remembered;
            const entry = requireTool(mode, submode);
            if (style !== undefined && style !== null && !entry.styles.some((s) => s.style === style)) {
                throw new RangeError(`engine.setTool: ${entry.name} has no style ${JSON.stringify(style)}`);
            }
            if (style === null && tool.style !== undefined && entry.styles.length) {
                throw new RangeError(`engine.setTool: ${entry.name} needs one of its styles, not null`);
            }
            // While still in Sudoku, the only mode whose key-up Penpa+ resets its hold counters in.
            endHolds();
            if (pu.mode[pu.mode.qa].edit_mode !== mode) {
                pu.mode_set(mode);
            }
            if (submode !== null) {
                if (mode === 'symbol') {
                    pu.subsymbolmode(submode);
                } else if (mode === 'combi') {
                    pu.subcombimode(submode);
                } else {
                    pu.submode_check(`sub_${mode}${submode}`);
                }
            }
            if (typeof style === 'number') {
                const box = styleBoxOf(mode, submode);
                pu.stylemode_check(`st_${box}${style}`);
            }
        },

        // Multicolor's swatch press: adds colour `style` to the selected cells, or takes it off when they all have it, and
        // makes it the colour in use. Throws when the tool is not Multicolor or the style is not one of its colours. While
        // the solver's pause covers the board it changes nothing and returns false; otherwise it returns true.
        colourSelection(style) {
            boardCanvas();
            if (engine.getTimer().covered) {
                return false;
            }
            const tool = engine.getTool();
            if (tool.mode !== 'multicolor') {
                throw new Error(`engine.colourSelection: the tool is ${tool.mode}, not multicolor`);
            }
            const colours = stylesOf('multicolor', null);
            if (!colours.some((s) => s.style === style)) {
                throw new RangeError(`engine.colourSelection: Multicolor has no colour ${JSON.stringify(style)}`);
            }
            pu.stylemode_check(`st_surface${style}`);
            pu.key_number(String(style));
            return true;
        },

        // Moves the board into `container`, fixes click hit-testing and hides Penpa+'s own chrome.
        mount(container) {
            if (!(container instanceof HTMLElement)) {
                throw new TypeError('engine.mount: container must be an element');
            }
            const canvas = boardCanvas();
            container.appendChild(document.getElementById('dvique'));
            fixPointerOffset(canvas);
            document.body.classList.add('engine-mounted');
        },

        // The cell sizes `setCellSize` takes, in pixels per cell: `min` to `max`.
        CELL_SIZE_RANGE,

        // Surface's colours as [style, name], in the order of its palette: the values `secondcolor` takes, with their names.
        SURFACE_COLOURS,

        // Zooms the board to `px` pixels per cell, within CELL_SIZE_RANGE.
        setCellSize(px) {
            if (!Number.isInteger(px) || px < CELL_SIZE_RANGE.min || px > CELL_SIZE_RANGE.max) {
                throw new RangeError(`engine.setCellSize: px must be a whole number from ${CELL_SIZE_RANGE.min} to ${CELL_SIZE_RANGE.max}, got ${String(px)}`);
            }
            boardCanvas();
            if (px <= PENPA_CELL_SIZE_MAX) {
                UserSettings.displaysize = px;
            } else {
                // MVP gap: the setter clamps with a message, so a larger size is stored in its `_displaysize` and the grid redrawn as
                // the setter does. The setter's other step, copying the size into the hidden `nb_size3` inputs, is skipped.
                UserSettings._displaysize = px;
                redraw_grid();
            }
        },

        // The cursor's cell: its number as `cell`, and where it lies on the page as `{ left, top, right, bottom }` in viewport px.
        // Null when the cursor is not on a cell: it is on an edge or a corner, or names no point (a board with no cells).
        // MVP gap: the cursor is `pu.cursol`, a point id, and the canvas is drawn 1 CSS px per canvas px (see fixPointerOffset).
        getFocusRect() {
            const canvas = boardCanvas();
            const cell = pu.point[pu.cursol];
            if (!cell || cell.type !== 0) {
                return null;
            }
            const corners = cell.surround.map((id) => pu.point[id]);
            const xs = corners.map((p) => p.x);
            const ys = corners.map((p) => p.y);
            const origin = canvas.getBoundingClientRect();
            return {
                cell: pu.cursol,
                left: origin.left + Math.min(...xs),
                top: origin.top + Math.min(...ys),
                right: origin.left + Math.max(...xs),
                bottom: origin.top + Math.max(...ys)
            };
        },

        // Where the rows and columns of a square-cell grid lie, in viewport px: the x of each column's centre, left to right, and
        // the y of each row's, top to bottom. The outside-clue margins are not rows or columns, and a cell taken out of the grid
        // leaves its row and column in place. Null for any other grid type.
        // MVP gap: the grid's cells are `pu.point` ids `row * pu.nx0 + column`, the grid proper being inside PENPA_MARGIN_CELLS and
        // `pu.space` on each side; `pu.centerlist` is not read, since Box mode reorders and thins it.
        getGridAxes() {
            const origin = boardCanvas().getBoundingClientRect();
            if (!pu.grid_is_square()) {
                return null;
            }
            const [top, bottom, left, right] = pu.space;
            const firstRow = PENPA_MARGIN_CELLS + top;
            const firstColumn = PENPA_MARGIN_CELLS + left;
            const span = (count, at) => Array.from({ length: count }, (_, k) => at(k));
            return {
                columns: span(pu.nx0 - 2 * PENPA_MARGIN_CELLS - left - right, (k) => origin.left + pu.point[firstRow * pu.nx0 + firstColumn + k].x),
                rows: span(pu.ny0 - 2 * PENPA_MARGIN_CELLS - top - bottom, (k) => origin.top + pu.point[(firstRow + k) * pu.nx0 + firstColumn].y)
            };
        },

        // Sets the largest cell size whose board fits a `w` x `h` box (CSS px) and returns it; the smallest size when none does.
        fitBoard(w, h) {
            requirePositiveNumber('fitBoard', 'w', w);
            requirePositiveNumber('fitBoard', 'h', h);
            const canvas = boardCanvas();
            const fits = () => {
                const r = canvas.getBoundingClientRect();
                return r.width <= w + FIT_TOLERANCE_PX && r.height <= h + FIT_TOLERANCE_PX;
            };
            const drawn = canvas.getBoundingClientRect();
            if (!drawn.width || !drawn.height) {
                throw new Error('engine.fitBoard: the board is not drawn');
            }
            // The canvas holds fixed margins besides the cells, so this estimate runs a little small; the loops settle it.
            const perCell = UserSettings.displaysize;
            let px = Math.floor(Math.min(w / (drawn.width / perCell), h / (drawn.height / perCell)));
            px = Math.min(CELL_SIZE_RANGE.max, Math.max(CELL_SIZE_RANGE.min, px));
            engine.setCellSize(px);
            while (px > CELL_SIZE_RANGE.min && !fits()) {
                engine.setCellSize(--px);
            }
            while (px < CELL_SIZE_RANGE.max) {
                engine.setCellSize(px + 1);
                if (!fits()) {
                    engine.setCellSize(px);
                    break;
                }
                px++;
            }
            return px;
        },

        // The board's size, blank rows and columns included, and what `changeSize` allows on each side: `add` and `remove` are
        // null when allowed, else why not. `unavailable` says why no side can change (the grid is not square), else is null;
        // `columns` and `rows` are null then.
        getSizeChanges() {
            boardCanvas();
            const unavailable = pu.grid_is_square() ? null : NOT_SQUARE;
            const sides = {};
            Object.keys(SIZE_SIDES).forEach((side) => {
                sides[side] = { add: unavailable ?? sizeChangeRefusal(side, 1), remove: unavailable ?? sizeChangeRefusal(side, -1) };
            });
            const drawn = unavailable ? null : drawnLines();
            return { unavailable, columns: drawn ? drawn.xs.length : null, rows: drawn ? drawn.ys.length : null, sides };
        },

        // Adds (`change` 1) or removes (-1) a blank row or column on `side` of the board as drawn ('top', 'bottom', 'left' or
        // 'right'). A change `getSizeChanges` does not allow throws, with its reason, and changes nothing.
        changeSize(side, change) {
            if (!Object.hasOwn(SIZE_SIDES, side)) {
                throw new RangeError(`engine.changeSize: no side ${JSON.stringify(side)}; the sides are ${Object.keys(SIZE_SIDES).join(', ')}`);
            }
            if (change !== 1 && change !== -1) {
                throw new RangeError(`engine.changeSize: change must be 1 or -1, got ${String(change)}`);
            }
            boardCanvas();
            const reason = pu.grid_is_square() ? sizeChangeRefusal(side, change) : NOT_SQUARE;
            if (reason) {
                throw new Error(`engine.changeSize: ${reason}`);
            }
            // MVP gap: Penpa+'s Change Size buttons call `resize_top` and its siblings; 'white' makes the row blank board outside
            // the grid (`pu.space`), and a removal takes only such a row.
            pu[penpaSideOf(side).resize](change, 'white');
        },

        // A key for the open puzzle that the solver's progress never changes, so a history copy of its link (which carries the
        // progress) has the same key. Two puzzles that differ only in the grid lines the setter erased share one key.
        // MVP gap: an MD5 of the grid and the givens, read where Penpa+ keeps them. The undo logs are left out, and so are
        // the erased grid lines, since Penpa+ keeps the solver's erasures among the givens.
        getPuzzleId() {
            boardCanvas();
            const { command_undo, command_redo, command_replay, deletelineE, ...givens } = pu.pu_q;
            return md5(JSON.stringify([pu.gridtype, pu.nx, pu.ny, pu.space, givens]));
        },

        // The puzzle's text as the link carries it: Title, Author and Rules, plain text.
        // MVP gap: read from the Share form's fields, where load() puts them.
        getInfo() {
            boardCanvas();
            return {
                title: document.getElementById('saveinfotitle').value,
                author: document.getElementById('saveinfoauthor').value,
                rules: document.getElementById('saveinforules').value
            };
        }
    };

    window.engine = engine;
})();
