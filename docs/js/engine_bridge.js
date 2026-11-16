// The solve UI's only door to Penpa's engine: the global `engine`. The UI files (docs/ui/) never name `pu`,
// `UserSettings` or a legacy element id; this file does, once, and each call that has to read Penpa's internals
// says why (MVP gap). Loaded by solve.html after general.js, before main.js's onload runs boot().
(function () {
    'use strict';

    // UserSettings.displaysize clamps to these and pops a message up when it does (settings.js), so a call outside throws.
    const MIN_CELL_SIZE = 12;
    const MAX_CELL_SIZE = 90;

    // The board's canvas may overshoot its box by this much before it counts as not fitting.
    const FIT_TOLERANCE_PX = 0.5;

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

    // MVP gap: Penpa hit-tests a click as `e.pageX - canvas.offsetLeft` (main.js), which is right only while the canvas's
    // offsetParent is the page. The real page position makes it right wherever the board sits. Penpa also assumes
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

    // MVP gap: Penpa's toolbars live in the page the board lives in. They are hidden, not removed, so main.js and
    // general.js keep finding their ids. Penpa's `.modal` dialogs stay usable, above the UI's layers and below
    // SweetAlert2's popups (1060).
    const chromeStyle = document.createElement('style');
    chromeStyle.textContent =
        'body.engine-mounted #header, body.engine-mounted #app-container { visibility: hidden; height: 0; overflow: hidden; }\n' +
        'body.engine-mounted #app-container .modal { visibility: visible; z-index: 1000; }\n' +
        'body.engine-mounted #float-key { display: none !important; }\n';
    document.head.appendChild(chromeStyle);

    // MVP gap: Penpa decides the mode from the link's `m`, and an edit link's data does not load as a solve link. So an
    // edit link opens as Penpa opens it, then the page reopens on the solve link made from it.
    function reopenInSolveMode() {
        const solveLink = pu.maketext_solve();
        if (location.hash.includes('m=solve')) {
            throw new Error('engine: the solve link did not open in solve mode');
        }
        history.replaceState(null, '', location.pathname + solveLink.slice(solveLink.indexOf('#')));
        location.reload();
    }

    // Resolves when boot() has loaded the link's puzzle in solve mode; rejects with boot()'s error, which main.js already
    // shows. An edit link never resolves: the page reloads.
    let resolveBoot;
    let rejectBoot;
    const ready = new Promise((resolve, reject) => {
        resolveBoot = resolve;
        rejectBoot = reject;
    });
    const penpaBoot = window.boot;
    window.boot = function () {
        const booting = penpaBoot.apply(this, arguments);
        booting.then(() => (pu.mmode === 'solve' ? resolveBoot() : reopenInSolveMode()), rejectBoot);
        return booting;
    };

    // MVP gap: main.js adds its key handlers on `document` from inside its onload, as closure-local functions that cannot be
    // removed afterwards. This file runs before that onload, so it wraps `document.addEventListener` until both are
    // added and puts the gate around them. Nothing stops propagation, so other listeners (Web Awesome's) see every key.
    const PENPA_KEY_HANDLERS = { keydown: 'onKeyDown', keyup: 'onKeyUp' };
    const gatedKeyTypes = new Set();
    let keyHandler = null;
    document.addEventListener = function (type, listener, options) {
        if (type in PENPA_KEY_HANDLERS && PENPA_KEY_HANDLERS[type] === listener?.name && !gatedKeyTypes.has(type)) {
            const penpaListener = listener;
            gatedKeyTypes.add(type);
            listener = function (e) {
                if (!keyHandler || !keyHandler(e)) {
                    return penpaListener.call(this, e);
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
    const HOOKED_PUZZLE_METHODS = ['redraw', 'mode_set', 'submode_check', 'stylemode_check', 'subcombimode', 'subsymbolmode'];
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

    // MVP gap: Penpa's popups are SweetAlert2's container (the Congratulations popup, its alerts) and its `.modal` elements,
    // shown by setting `style.display`. The watcher only wakes the `change` event; getState reads the live elements.
    function penpaDialogOpen() {
        return document.querySelector('.swal2-container') !== null ||
            [...document.querySelectorAll('.modal')].some((m) => m.style.display && m.style.display !== 'none');
    }
    new MutationObserver(queueChange).observe(document.documentElement, {
        childList: true, subtree: true, attributes: true, attributeFilter: ['style', 'class']
    });


    // ---- The tool catalog: what the link offers, read once from Penpa's mode radios and menus. A tool is a mode, a
    // sub-mode (null where the mode has none) and a style (null where the tool has none).

    // Style names, checked against the legacy labels' computed backgrounds on 2026-11-13 (the prototype's tables).
    const PATH_STYLE = {
        3: 'green', 2: 'black', 5: 'grey', 8: 'red', 9: 'blue', 80: 'thin', 1: 'thin', 12: 'dotted',
        13: 'fat dots', 17: 'fat dots', 40: 'short', 30: 'double', 21: 'thicker', 14: 'grey dot'
    };
    const VALUE_STYLE = { 1: 'black', 2: 'green', 8: 'blue', 3: 'grey', 9: 'dark blue', 10: 'red', 4: 'white', 5: 'white background' };
    const SURFACE_STYLE = {
        1: 'dark grey', 8: 'grey', 3: 'light grey', 4: 'black', 2: 'green', 5: 'blue', 6: 'red', 7: 'yellow', 9: 'pink',
        10: 'orange', 11: 'purple', 12: 'brown'
    };
    const STYLE_NAMES = {
        line: PATH_STYLE, lineE: PATH_STYLE, wall: PATH_STYLE, number: VALUE_STYLE, sudoku: VALUE_STYLE,
        surface: SURFACE_STYLE, symbol: { 1: 'behind lines', 2: 'in front of lines' },
        cage: { 10: 'dotted line', 7: 'grey line', 15: 'grey dots', 16: 'solid line' }
    };
    // The styles that are colours: only these have a swatch, since a checked legacy label has a grey ground of its own.
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
    // Penpa's shape groups, from the ms1_ / ms3_ / ms4_ ids of the Shape menu.
    const SHAPE_GROUP_NAMES = {
        circle: 'Circle', square: 'Square', triup: 'Triangle up', tridown: 'Triangle down', triright: 'Triangle right',
        trileft: 'Triangle left', diamond: 'Diamond', hexpoint: 'Hexagon, point up', hexflat: 'Hexagon, flat',
        ox: '○ △ □ ×', bars: 'Bars', math: 'Math', degital: 'Digital digits', arrow_B: 'Arrow', arrow_N: 'Arrow, notched',
        arrow_tri: 'Arrow, triangle', arrow_fouredge: 'Arrows, four edges', arrow_GP: 'Arrow, graphic', battleship: 'Ship'
    };
    // The Composite tools that show Penpa's line / edge style box (subcombimode in class_p.js).
    const COMPOSITE_LINE_STYLE = ['linex', 'lineox', 'linedir', 'yajilin', 'rassisillai', 'tents'];
    const COMPOSITE_EDGE_STYLE = ['edgex', 'edgexoi'];

    // MVP gap: Penpa hides what a grid type or a link's tab set leaves out by `display: none` on the element or an
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
            const swatch = COLOUR_STYLE_NAMES.has(name) && background !== 'rgba(0, 0, 0, 0)' ? background : null;
            return [{ style: parseInt(radio.value, 10), name, swatch }];
        });
    }

    // The Shape menu's shapes this grid type offers, each with the label Penpa shows and the group it sits in.
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

    // Penpa stores a mode with no sub-mode as "" and a missing one as undefined.
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

    // easytimer's events that change the clock's reading or whether it runs. `secondsUpdated` is Penpa's own once-a-second tick.
    const TIMER_EVENTS = ['secondsUpdated', 'started', 'paused', 'stopped', 'reset'];
    const timerHandlers = new Set();
    function watchTimer() {
        TIMER_EVENTS.forEach((name) => sw_timer.addEventListener(name, () => timerHandlers.forEach((handler) => handler())));
    }

    // MVP gap: Penpa's pause and start closures live in main.js's onload and are reached only through their buttons, which
    // also show and hide Penpa's own pause layer.
    function pressTimerButton(id) {
        document.getElementById(id).click();
    }

    const THEMES = { light: THEME_LIGHT, dark: THEME_DARK };

    const engine = {
        ready,

        // The state the UI draws from. Read it when `change` fires.
        getState() {
            boardCanvas();
            // MVP gap: the solver's undo and redo stacks, where Penpa keeps them.
            const entries = pu[pu.mode.qa];
            return {
                penpaDialogOpen: penpaDialogOpen(),
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

        // The clock: whole and fractional `seconds` elapsed, and whether it is `paused`.
        getTimer() {
            boardCanvas();
            return { seconds: sw_timer.getTotalTimeValues().secondTenths / 10, paused: sw_timer.isPaused() };
        },

        // Pauses the clock and covers Penpa's own board with its pause layer; nothing happens when it is already paused.
        pauseTimer() {
            boardCanvas();
            if (!sw_timer.isPaused()) {
                pressTimerButton('sw_pause');
            }
        },

        // Resumes the clock and uncovers the board.
        startTimer() {
            boardCanvas();
            pressTimerButton('sw_start');
        },

        // 'light' or 'dark': the page's theme and the board's. Penpa remembers it in its settings cookie.
        setTheme(theme) {
            if (!(theme in THEMES)) {
                throw new RangeError(`engine.setTheme: theme must be one of ${Object.keys(THEMES).join(', ')}, got ${String(theme)}`);
            }
            boardCanvas();
            UserSettings.color_theme = THEMES[theme];
        },

        // The front door for keys. `handler(event)` runs for every keydown and keyup before Penpa's handlers and answers
        // 'ui' or 'browser' (Penpa never sees the event, and the bridge does not touch its default) or nothing (Penpa gets it).
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

        // Every tool the link offers, in the order of Penpa's mode list. `labels` are the names Penpa's own menus give it,
        // `styles` its colours and line looks with a display name and the swatch colour (null where the style is no colour).
        listTools() {
            return toolCatalog().map((tool) => ({ ...tool, labels: [...tool.labels], styles: tool.styles.map((style) => ({ ...style })) }));
        },

        // The tool in use: Penpa's current mode with that mode's sub-mode and style.
        getTool() {
            const mode = pu.mode[pu.mode.qa].edit_mode;
            const [submode, style] = pu.mode[pu.mode.qa][mode];
            const listed = toolCatalog().find((t) => t.mode === mode && t.submode === rememberedSubmode(submode));
            // A key or a script can put Penpa in a mode the link's tab set leaves out; it is still the tool in use.
            const current = listed?.styles.find((s) => s.style === Number(style));
            return { mode, submode: rememberedSubmode(submode), style: current ? current.style : null };
        },

        // The link's Tab set, in the order the link gives it, as tools of `listTools()` without a style. Penpa names a mode
        // with no sub-mode of its own in the set (Shape, Special, Composite); it is the sub-mode Penpa remembers for the
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

        // The Penpa settings the UI reads, by name: only the ones a ticket has needed so far.
        getSettings() {
            boardCanvas();
            return {
                shortcuts_enabled: Boolean(UserSettings.shortcuts_enabled),
                theme: UserSettings.color_theme === THEME_DARK ? 'dark' : 'light'
            };
        },

        // Applies a tool. A sub-mode or style left out stays as Penpa remembers it for the mode; one given must be in
        // `listTools()` (`submode: null` for a mode with none), or the call throws and changes nothing.
        setTool(tool) {
            if (typeof tool !== 'object' || tool === null) {
                throw new TypeError('engine.setTool: tool must be an object like { mode, submode, style }');
            }
            const { mode, style } = tool;
            const remembered = pu.mode[pu.mode.qa][mode];
            const submode = tool.submode !== undefined ? tool.submode
                : rememberedSubmode(remembered?.[0]);
            const entry = requireTool(mode, submode);
            if (style !== undefined && style !== null && !entry.styles.some((s) => s.style === style)) {
                throw new RangeError(`engine.setTool: ${entry.name} has no style ${JSON.stringify(style)}`);
            }
            if (style === null && tool.style !== undefined && entry.styles.length) {
                throw new RangeError(`engine.setTool: ${entry.name} needs one of its styles, not null`);
            }
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
                if (mode === 'multicolor') {
                    // Penpa colours the selected cells when a Multicolor swatch is chosen.
                    pu.key_number(String(style));
                }
            }
        },

        // Moves the board into `container`, fixes click hit-testing and hides Penpa's own chrome.
        mount(container) {
            if (!(container instanceof HTMLElement)) {
                throw new TypeError('engine.mount: container must be an element');
            }
            const canvas = boardCanvas();
            container.appendChild(document.getElementById('dvique'));
            fixPointerOffset(canvas);
            document.body.classList.add('engine-mounted');
        },

        // Zooms the board to `px` pixels per cell, 12 to 90.
        setCellSize(px) {
            if (!Number.isInteger(px) || px < MIN_CELL_SIZE || px > MAX_CELL_SIZE) {
                throw new RangeError(`engine.setCellSize: px must be a whole number from ${MIN_CELL_SIZE} to ${MAX_CELL_SIZE}, got ${String(px)}`);
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
            px = Math.min(MAX_CELL_SIZE, Math.max(MIN_CELL_SIZE, px));
            engine.setCellSize(px);
            while (px > MIN_CELL_SIZE && !fits()) {
                engine.setCellSize(--px);
            }
            while (px < MAX_CELL_SIZE) {
                engine.setCellSize(px + 1);
                if (!fits()) {
                    engine.setCellSize(px);
                    break;
                }
                px++;
            }
            return px;
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
