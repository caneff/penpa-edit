// The solve UI's only door to Penpa+'s engine: the global `engine`. The UI files (docs/ui/) never name `pu`,
// `UserSettings` or a legacy element id; this file does, once, and each call that has to read Penpa+'s internals
// says why (MVP gap). It must load after general.js and before main.js's onload runs boot().
(function () {
    'use strict';

    // UserSettings.displaysize clamps to these and pops a message up when it does (settings.js), so a call outside throws.
    const CELL_SIZE_RANGE = Object.freeze({ min: 12, max: 90 });

    // The board's canvas may overshoot its box by this much before it counts as not fitting.
    const FIT_TOLERANCE_PX = 0.5;

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
        'body.engine-mounted #header, body.engine-mounted #app-container { visibility: hidden; height: 0; overflow: hidden; }\n' +
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
    // shows, or with reopenInSolveMode's, shown here. An edit link never resolves: the page reloads.
    let resolveBoot;
    let rejectBoot;
    const ready = new Promise((resolve, reject) => {
        resolveBoot = resolve;
        rejectBoot = reject;
    });
    const penpaBoot = window.boot;
    window.boot = function () {
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
            resolveBoot();
        }, rejectBoot).catch((error) => {
            errorMsg(DOMPurify.sanitize(String(error)));
            rejectBoot(error);
        });
        return booting;
    };

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
    const VALUE_STYLE = { 1: 'black', 2: 'green', 8: 'blue', 3: 'grey', 9: 'dark blue', 10: 'red', 4: 'white', 5: 'white background' };
    const SURFACE_STYLE = Object.fromEntries(SURFACE_COLOURS);
    const STYLE_NAMES = {
        line: PATH_STYLE, lineE: PATH_STYLE, wall: PATH_STYLE, number: VALUE_STYLE, sudoku: VALUE_STYLE,
        surface: SURFACE_STYLE, symbol: { 1: 'behind lines', 2: 'in front of lines' },
        cage: { 10: 'dotted line', 7: 'grey line', 15: 'grey dots', 16: 'solid line' }
    };
    // The styles that are colours: only these have a swatch, since a checked legacy label has a grey ground of its own.
    // The modes whose colour styles are strokes of Penpa+'s `set_line_style`.
    const PEN_BOXES = new Set(['line', 'lineE', 'wall']);
    const COLOUR_STYLE_NAMES = new Set([...Object.values(SURFACE_STYLE), 'green', 'black', 'grey', 'red', 'blue', 'dark blue']);

    const SUBMODE_NAMES = {
        line: { 1: 'normal', 2: 'diagonal', 3: 'free', 5: 'middle', 4: 'helper ×' },
        lineE: { 1: 'normal', 2: 'diagonal', 3: 'free', 6: 'middle', 4: 'helper ×', 5: 'erase' },
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
        blpo: 'Shade + dot', shaka: 'Corner triangles + dot', linex: 'Loop + edge ×', lineox: 'Loop + cell ○ ×',
        linedir: 'Line + direction marks', yajilin: 'Shade + loop', hashi: 'Bridges', rassisillai: 'Line + cell marks',
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

    // The colour Penpa+ strokes pen style `style` with on the board, read from its own drawing style (`set_line_style`).
    // A legacy label's background is no source: a checked label has a ground of its own, and the greys differ.
    function penColourOf(style) {
        const scratch = document.createElement('canvas').getContext('2d');
        set_line_style(scratch, style);
        return scratch.strokeStyle;
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
            const background = getComputedStyle(label).backgroundColor;
            const labelSwatch = COLOUR_STYLE_NAMES.has(name) && background !== 'rgba(0, 0, 0, 0)' ? background : null;
            const swatch = PEN_BOXES.has(box) && COLOUR_STYLE_NAMES.has(name) ? penColourOf(parseInt(radio.value, 10)) : labelSwatch;
            return [{ style: parseInt(radio.value, 10), name, swatch }];
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

    const ENGINE_EVENTS = ['change', 'timer'];

    // easytimer's events that change the clock's reading or whether it runs. `secondsUpdated` is Penpa+'s own once-a-second tick.
    const TIMER_EVENTS = ['secondsUpdated', 'started', 'paused', 'stopped', 'reset'];
    const timerHandlers = new Set();
    function watchTimer() {
        TIMER_EVENTS.forEach((name) => sw_timer.addEventListener(name, () => timerHandlers.forEach((handler) => handler())));
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

    const engine = {
        ready,

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
        // the clock and whenever it starts, pauses or resets. Read `getTimer()` then.
        on(event, handler) {
            if (!ENGINE_EVENTS.includes(event)) {
                throw new RangeError(`engine.on: no event "${String(event)}"; the events are ${ENGINE_EVENTS.join(', ')}`);
            }
            if (typeof handler !== 'function') {
                throw new TypeError('engine.on: handler must be a function');
            }
            if (event === 'timer') {
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
        // zero, running. A paused board is uncovered.
        restart() {
            boardCanvas();
            pu.reset_board();
            pu.selection = [];
            pu.redraw();
            sw_timer.reset();
            pressTimerButton('sw_start');
        },

        // The clock: whole and fractional `seconds` elapsed, and whether it is `paused`. `covered` is true while the solver's
        // own pause (the Pause button or F4) has Penpa+'s pause layer up; a solve also pauses the clock, with no layer (#119).
        getTimer() {
            boardCanvas();
            return {
                seconds: sw_timer.getTotalTimeValues().secondTenths / 10,
                paused: sw_timer.isPaused(),
                // MVP gap: read from Penpa+'s pause layer, which its Pause and Start buttons show and hide.
                covered: document.getElementById('pause_canvas').style.display !== 'none'
            };
        },

        // Pauses the clock and covers Penpa+'s own board with its pause layer; nothing happens when the layer is already up.
        pauseTimer() {
            boardCanvas();
            if (!engine.getTimer().covered) {
                pressTimerButton('sw_pause');
            }
        },

        // Resumes the clock and uncovers the board.
        startTimer() {
            boardCanvas();
            pressTimerButton('sw_start');
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
        // `styles` its colours and line looks with a display name and the swatch colour (null where the style is no colour).
        listTools() {
            return toolCatalog().map((tool) => ({ ...tool, labels: [...tool.labels], styles: tool.styles.map((style) => ({ ...style })) }));
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

        // Removes this puzzle's saved progress, and stops Penpa+ saving it again until the page reloads, as Penpa+'s "Clear this
        // puzzle" does. A puzzle with no link data was never saved, so there is nothing to clear.
        // MVP gap: PenpaProgress.clearPuzzle does not wait for localforage's removal, so this waits for it itself.
        async clearSavedProgress() {
            boardCanvas();
            if (!pu.url) {
                return;
            }
            UserSettings.save_current_puzzle = false;
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
            UserSettings.displaysize = px;
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
