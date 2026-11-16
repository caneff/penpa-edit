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

    const ENGINE_EVENTS = ['change'];

    const engine = {
        ready,

        // The state the UI draws from. Read it when `change` fires.
        getState() {
            boardCanvas();
            return { penpaDialogOpen: penpaDialogOpen() };
        },

        // Runs `handler()` at most once per frame after the state may have changed.
        on(event, handler) {
            if (!ENGINE_EVENTS.includes(event)) {
                throw new RangeError(`engine.on: no event "${String(event)}"; the events are ${ENGINE_EVENTS.join(', ')}`);
            }
            if (typeof handler !== 'function') {
                throw new TypeError('engine.on: handler must be a function');
            }
            changeHandlers.add(handler);
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
