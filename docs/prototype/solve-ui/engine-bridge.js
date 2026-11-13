/*
 * PROTOTYPE (throwaway, branch prototype/solve-ui): engine bridge for the solve-UI variants.
 *
 * The small set of calls a solve UI needs, each wrapping what the legacy UI does today. Variants call
 * window.PrototypeBridge (also given to them as ctx.bridge) instead of poking `pu` directly. File:line citations are
 * to docs/js/ on this branch. Names in the legacy UI:
 *   mode     = pu.mode[qa].edit_mode            (e.g. "sudoku", "line", "surface", "combi")
 *   submode  = pu.mode[qa][mode][0]             (string, e.g. "1" Normal, "2" Corner, "3" Centre in Sudoku;
 *                                               for "combi" it is the Composite tool name, e.g. "star")
 *   style    = pu.mode[qa][mode][1]             (number, e.g. 1 = DG in Surface)
 * In solve mode qa is always "pu_a" (general.js:3114-3116).
 */
(function() {
    'use strict';

    const listeners = new Set();
    const timerListeners = new Set();
    let changeQueued = false;
    let installed = false;

    function $(id) {
        return document.getElementById(id);
    }

    function qa() {
        return pu.mode.qa;
    }

    /** True if the legacy form hides this element (Penpa Lite, set_solvemode, grid type). */
    function legacyHidden(el) {
        if (!el) {
            return true;
        }
        return el.classList.contains('is_hidden') || el.style.display === 'none';
    }

    function labelText(id) {
        const lb = document.querySelector('label[for="' + id + '"]') || $(id + '_lb') || $(id);
        return lb ? lb.textContent.replace(/\s+/g, ' ').trim() : id;
    }

    /**
     * Count undo steps in a command stack, the way undo()/redo() pop it from the end: consecutive entries sharing
     * a group index (entry[4]) are one step; an entry without one is a step on its own.
     */
    function countSteps(stack) {
        let steps = 0;
        let i = stack.length - 1;
        while (i >= 0) {
            const group = stack[i] && stack[i][4];
            i--;
            if (group) {
                while (i >= 0 && stack[i] && stack[i][4] == group) {
                    i--;
                }
            }
            steps++;
        }
        return steps;
    }

    /** Coalesce engine notifications into one callback per animation frame. */
    function queueChange(reason) {
        if (changeQueued) {
            return;
        }
        changeQueued = true;
        requestAnimationFrame(function() {
            changeQueued = false;
            const state = Bridge.getState();
            listeners.forEach(function(cb) {
                try {
                    cb(state, reason);
                } catch (err) {
                    console.error('[prototype] onChange listener failed', err);
                }
            });
        });
    }

    /** Wrap a Puzzle.prototype method so every call queues a change notification. */
    function hook(name) {
        const original = Puzzle.prototype[name];
        Puzzle.prototype[name] = function() {
            const result = original.apply(this, arguments);
            queueChange(name);
            return result;
        };
    }

    const Bridge = {
        /**
         * Hook the engine. Called once by loader.js before mount(). Puzzle methods are wrapped on the prototype
         * (class_p.js:1604, 1683, 1706, 1736, 12595), so the hooks survive `pu` being reassigned by load().
         * The subclasses in class_square.js etc. do not override these methods.
         */
        install() {
            if (installed) {
                return;
            }
            installed = true;
            ['redraw', 'mode_set', 'submode_check', 'stylemode_check', 'subcombimode', 'subsymbolmode'].forEach(hook);
            // easytimer events, as timer.js:33-41 uses them.
            ['secondTenthsUpdated', 'started', 'paused', 'stopped', 'reset'].forEach(function(ev) {
                sw_timer.addEventListener(ev, function() {
                    const t = Bridge.getTimer();
                    timerListeners.forEach(function(cb) {
                        cb(t);
                    });
                    if (ev !== 'secondTenthsUpdated') {
                        queueChange('timer');
                    }
                });
            });
            Bridge.fixPointerOffset();
        },

        /**
         * main.js:919-921 hit-tests a click as `e.pageX - canvas.offsetLeft`, which is only right while the canvas's
         * offsetParent is the page. Shadow offsetLeft/offsetTop with the canvas's real page position, so a variant
         * can move the board anywhere. Do not scale the canvas with CSS (width/transform): hit-testing assumes
         * 1 CSS px = 1 canvas px. Resize with setCellSize() instead.
         */
        fixPointerOffset() {
            const canvas = $('canvas');
            if (!canvas || canvas.__protoOffsetFixed) {
                return;
            }
            canvas.__protoOffsetFixed = true;
            Object.defineProperty(canvas, 'offsetLeft', {
                configurable: true,
                get() {
                    return canvas.getBoundingClientRect().left + window.scrollX;
                }
            });
            Object.defineProperty(canvas, 'offsetTop', {
                configurable: true,
                get() {
                    return canvas.getBoundingClientRect().top + window.scrollY;
                }
            });
        },

        /** Build the ctx object passed to a variant's mount(ctx). */
        makeContext(key) {
            return {
                key: key,
                get pu() {
                    return window.pu;
                },
                bridge: Bridge,
                canvas: $('canvas'),
                board: $('dvique'),
                legacyRoot: Bridge.legacyRoot(),
                helpers: Helpers
            };
        },

        /**
         * The legacy page chrome as one element: header#header and div#app-container, wrapped on first call in
         * div#proto-legacy-root. Everything keeps its id, so main.js still finds it. The board (#dvique, holding
         * #canvas) lives inside it until a variant calls helpers.adoptBoard().
         */
        legacyRoot() {
            let root = $('proto-legacy-root');
            if (!root) {
                root = document.createElement('div');
                root.id = 'proto-legacy-root';
                const header = $('header');
                header.parentNode.insertBefore(root, header);
                root.appendChild(header);
                root.appendChild($('app-container'));
            }
            return root;
        },

        // ---- State ---------------------------------------------------------------------------------------------

        /**
         * Snapshot of everything a solve UI usually shows.
         * @returns {{mode:string, submode:string, style:number, qa:string, mmode:string, gridtype:string,
         *            canUndo:boolean, canRedo:boolean, hasAnswerCheck:boolean, solved:boolean, timer:object}}
         */
        getState() {
            const m = Bridge.getMode();
            const stacks = pu[qa()];
            return {
                mode: m.mode,
                submode: m.submode,
                style: m.style,
                qa: qa(),
                mmode: pu.mmode || 'edit',
                gridtype: pu.gridtype,
                // set_redoundocolor, class_p.js:12615-12618
                canUndo: stacks.command_undo.__a.length > 0,
                canRedo: stacks.command_redo.__a.length > 0,
                hasAnswerCheck: !!pu.solution,
                solved: pu.sol_flag === 1,
                timer: Bridge.getTimer()
            };
        },

        // ---- Modes ---------------------------------------------------------------------------------------------

        /** @returns {{mode:string, submode:string, style:number}} current mode, sub-mode and style. */
        getMode() {
            const mode = pu.mode[qa()].edit_mode;
            const entry = pu.mode[qa()][mode] || [];
            return {mode: mode, submode: String(entry[0]), style: entry[1]};
        },

        /**
         * Switch mode, as a click on the `mo_<mode>` radio does (main.js:1842-1845 -> class_p.js:1604 mode_set).
         * mode_set restores the mode's last sub-mode and style.
         * @param {string} mode e.g. "sudoku", "line", "lineE", "surface", "combi"
         */
        setMode(mode) {
            pu.mode_set(mode);
        },

        /**
         * Switch sub-mode of the current mode, as a click on `sub_<mode><value>` does (main.js:1847-1850 ->
         * class_p.js:1683 submode_check, which reads the radio's value). For Composite use setComposite().
         * @param {string|number} value e.g. 2 for Sudoku Corner
         */
        setSubmode(value) {
            pu.submode_check('sub_' + pu.mode[qa()].edit_mode + value);
        },

        /**
         * Switch style of the current mode, as a click on `st_<mode><value>` does (main.js:1852-1860 ->
         * class_p.js:1706 stylemode_check). Multicolor uses Surface's swatches and also picks the colour as a
         * key press (main.js:1852-1856).
         * @param {string|number} value e.g. 8 for GR in Surface
         */
        setStyle(value) {
            const mode = pu.mode[qa()].edit_mode;
            if (mode === 'multicolor') {
                pu.stylemode_check('st_surface' + value);
                pu.key_number(String(value));
            } else {
                pu.stylemode_check('st_' + mode + value);
            }
        },

        /**
         * Pick a Composite tool (mode "combi"), as a click on `combisub_<name>` does (main.js:1866-1869 ->
         * class_p.js:1736 subcombimode). Switches to Composite first if needed.
         * @param {string} name e.g. "star", "linex", "blpo"
         */
        setComposite(name) {
            if (pu.mode[qa()].edit_mode !== 'combi') {
                pu.mode_set('combi');
            }
            pu.subcombimode(name);
        },

        /**
         * Pick a Shape (mode "symbol") sub-mode, as a click on `ms_<name>` does (main.js:1871-1875 ->
         * class_p.js:1723 subsymbolmode).
         * @param {string} name e.g. "circle_L", "star"
         */
        setShape(name) {
            if (pu.mode[qa()].edit_mode !== 'symbol') {
                pu.mode_set('symbol');
            }
            pu.subsymbolmode(name);
        },

        /**
         * Solve modes available for the loaded puzzle: the grid type's modes (modes.js `penpa_modes[gridtype].mode`)
         * whose `mo_<mode>_lb` label the legacy UI shows. set_solvemode hides Box (general.js:3126); Penpa Lite hides
         * modes outside the link's Tab set (general.js:1240-1316).
         * @param {{all?: boolean}} [opts] all: include modes the legacy UI hides, flagged hidden: true
         * @returns {Array<{mode:string, label:string, hidden:boolean, inTabSet:boolean}>}
         */
        listModes(opts) {
            const all = opts && opts.all;
            const tab = Bridge.tabSet();
            return penpa_modes[pu.gridtype].mode.map(function(mode) {
                const lb = $('mo_' + mode + '_lb');
                const label = lb ? lb.textContent.trim() : (mode_names[mode] || mode);
                return {
                    mode: mode,
                    label: label,
                    hidden: legacyHidden(lb) || mode === 'board',
                    inTabSet: tab.some(function(t) {
                        return t === mode_names[mode] || t.indexOf(mode_names[mode] + ' ') === 0;
                    })
                };
            }).filter(function(m) {
                return all || !m.hidden;
            });
        },

        /**
         * Sub-modes of a mode, read from its legacy radios `#mode_<mode> input[name=mode_<mode>]`
         * (index.html, e.g. 568-575 for Sudoku), skipping those set_solvemode hides (general.js:3127-3129).
         * @param {string} [mode] default: current mode
         * @returns {Array<{value:string, label:string, id:string}>}
         */
        listSubmodes(mode) {
            mode = mode || pu.mode[qa()].edit_mode;
            const box = $('mode_' + mode);
            if (!box || mode === 'combi') {
                return [];
            }
            return Array.from(box.querySelectorAll('input[type=radio][id^="sub_' + mode + '"]')).filter(function(inp) {
                return !legacyHidden($(inp.id + '_lb')) && penpa_modes[pu.gridtype].sub.indexOf(inp.id.slice(4)) !== -1;
            }).map(function(inp) {
                return {value: inp.value, label: labelText(inp.id), id: inp.id};
            });
        },

        /**
         * Styles of a mode, read from its legacy radios `#style_<mode> input` (index.html:589 on). Each label's
         * colour swatch is the element `<id>_lb`.
         * @param {string} [mode] default: current mode
         * @returns {Array<{value:number, label:string, id:string}>}
         */
        listStyles(mode) {
            mode = mode || pu.mode[qa()].edit_mode;
            const m = mode === 'multicolor' ? 'surface' : mode;
            const box = $('style_' + m);
            if (!box) {
                return [];
            }
            return Array.from(box.querySelectorAll('input[type=radio][id^="st_"]')).filter(function(inp) {
                return !legacyHidden($(inp.id + '_lb'));
            }).map(function(inp) {
                return {value: parseInt(inp.value, 10), label: labelText(inp.id), id: inp.id};
            });
        },

        /**
         * Composite tools for this grid type (modes.js `penpa_modes[gridtype].combisub`), labelled from
         * `combisub_<name>` (index.html:521-566).
         * @returns {Array<{name:string, label:string}>}
         */
        listComposite() {
            return penpa_modes[pu.gridtype].combisub.map(function(name) {
                const el = $('combisub_' + name);
                return {name: name, label: el ? el.textContent.trim() : name};
            });
        },

        /**
         * The link's Tab/Enter mode set (UserSettings.tab_settings, settings.js:308-315), as English names from
         * PenpaText.modes.EN, e.g. ["Surface", "Sudoku Normal"]. Tab and Enter cycle it (main.js:695-744).
         * @returns {string[]}
         */
        tabSet() {
            return (UserSettings.tab_settings || []).slice();
        },

        // ---- Input ---------------------------------------------------------------------------------------------

        /**
         * Send a key through Penpa+'s own keyboard handler (main.js:84 onKeyDown, 85 onKeyUp), so every mode's key
         * rules apply: digits, letters, Delete/Backspace, arrows, Shift/Ctrl sub-mode switching in Sudoku, Z/X/C/V.
         * @param {string} key a KeyboardEvent.key, e.g. "5", "Delete", "ArrowLeft"
         * @param {{shift?:boolean, ctrl?:boolean, alt?:boolean, code?:string}} [mods]
         */
        sendKey(key, mods) {
            mods = mods || {};
            const init = {
                key: key,
                code: mods.code || (/^[0-9]$/.test(key) ? 'Digit' + key : /^[a-z]$/i.test(key) ? 'Key' + key.toUpperCase() : key),
                shiftKey: !!mods.shift,
                ctrlKey: !!mods.ctrl,
                altKey: !!mods.alt,
                bubbles: true,
                cancelable: true
            };
            document.body.dispatchEvent(new KeyboardEvent('keydown', init));
            document.body.dispatchEvent(new KeyboardEvent('keyup', init));
        },

        /** Undo, as the Undo button does (main.js:1140-1142 -> class_p.js:6745). */
        undo() {
            pu.undo();
        },

        /** Redo, as the Redo button does (main.js:1143-1145 -> class_p.js:6980). */
        redo() {
            pu.redo();
        },

        /**
         * Undo/redo history in steps, where a step is what one undo() removes. undo() pops entries until the group
         * index (entry[4]) changes; an entry with no group index is a step on its own (class_p.js:6745-6790,
         * 6980-7020). position = steps that can be undone, length = position + steps that can be redone.
         * @returns {{position:number, length:number}}
         */
        history() {
            const undoSteps = countSteps(pu[qa()].command_undo.__a);
            return {position: undoSteps, length: undoSteps + countSteps(pu[qa()].command_redo.__a)};
        },

        /**
         * Jump to history step n (0 = nothing entered, history().length = everything redone) by calling undo() or
         * redo() repeatedly, as holding the Undo/Redo buttons does (main.js:970-1054). Redraws once per step.
         * @param {number} n
         */
        jumpTo(n) {
            const h = Bridge.history();
            n = Math.max(0, Math.min(h.length, n));
            let guard = h.length + 1;
            while (Bridge.history().position > n && guard-- > 0) {
                pu.undo();
            }
            while (Bridge.history().position < n && guard-- > 0) {
                pu.redo();
            }
        },

        // ---- Board geometry and selection ----------------------------------------------------------------------

        /**
         * Page-pixel position of a board point. pu.point[i].x/y are canvas pixels (main.js:919-921 compares them
         * with pageX - canvas.offsetLeft). Point types: 0 cell centre, 1 vertex, 2/3 edge midpoints, more on
         * special grids (see each class_*.js create_point).
         * @param {number} index point index, e.g. a cell from getSelection().cells
         * @returns {{x:number, y:number, type:number}}
         */
        pointToPage(index) {
            const r = $('canvas').getBoundingClientRect();
            const p = pu.point[index];
            return {x: r.left + window.scrollX + p.x, y: r.top + window.scrollY + p.y, type: p.type};
        },

        /**
         * The board point nearest a page-pixel position, as coord_point picks it for a click (main.js:919-962):
         * only point types the current mode accepts (pu.type), unless `types` is given.
         * @param {number} pageX
         * @param {number} pageY
         * @param {number[]} [types] e.g. [0] for cell centres only
         * @returns {number|null} point index, or null if the position is off the canvas
         */
        pageToPoint(pageX, pageY, types) {
            const r = $('canvas').getBoundingClientRect();
            const x = pageX - (r.left + window.scrollX);
            const y = pageY - (r.top + window.scrollY);
            if (x < 0 || y < 0 || x > r.width || y > r.height) {
                return null;
            }
            types = types || pu.type;
            let best = null;
            let min = Infinity;
            for (let i = 0; i < pu.point.length; i++) {
                const p = pu.point[i];
                if (p && p.use === 1 && types.indexOf(p.type) !== -1) {
                    const d = (x - p.x) ** 2 + (y - p.y) ** 2;
                    if (d < min) {
                        min = d;
                        best = i;
                    }
                }
            }
            return best;
        },

        /**
         * Page-pixel rectangle of a cell: the bounding box of its corner points (pu.point[i].surround), or a
         * pu.size square around the point when it has none.
         * @param {number} index
         * @returns {{left:number, top:number, right:number, bottom:number, width:number, height:number}}
         */
        cellRect(index) {
            const corners = (pu.point[index].surround || []).filter(function(s) {
                return pu.point[s];
            });
            const pts = corners.length ? corners.map(Bridge.pointToPage) : (function() {
                const c = Bridge.pointToPage(index);
                const h = pu.size / 2;
                return [{x: c.x - h, y: c.y - h}, {x: c.x + h, y: c.y + h}];
            })();
            const xs = pts.map(function(p) {
                return p.x;
            });
            const ys = pts.map(function(p) {
                return p.y;
            });
            const rect = {left: Math.min.apply(null, xs), top: Math.min.apply(null, ys),
                right: Math.max.apply(null, xs), bottom: Math.max.apply(null, ys)};
            rect.width = rect.right - rect.left;
            rect.height = rect.bottom - rect.top;
            return rect;
        },

        /**
         * The selected cells. Sudoku and multi-cell Number modes keep a list in pu.selection; every other mode
         * has one cursor, pu.cursol (both read by draw_selection / draw_cursol in class_*.js).
         * @returns {{cells:number[], cursor:number, rect:object|null}} rect: page-pixel bounding box of the cells
         */
        getSelection() {
            const multi = pu.selection && pu.selection.length ? pu.selection.slice() : null;
            const cells = multi || (pu.cursol !== undefined && pu.cursol !== null ? [pu.cursol] : []);
            let rect = null;
            cells.forEach(function(c) {
                const r = Bridge.cellRect(c);
                rect = rect ? {left: Math.min(rect.left, r.left), top: Math.min(rect.top, r.top),
                    right: Math.max(rect.right, r.right), bottom: Math.max(rect.bottom, r.bottom)} : r;
            });
            if (rect) {
                rect.width = rect.right - rect.left;
                rect.height = rect.bottom - rect.top;
            }
            return {cells: cells, cursor: pu.cursol, rect: rect};
        },

        /**
         * Select cells (pu.selection and pu.cursol, as a click or drag in Sudoku mode leaves them) and redraw.
         * @param {number[]} cells point indices
         */
        select(cells) {
            pu.selection = cells.slice();
            if (cells.length) {
                pu.cursol = cells[cells.length - 1];
            }
            pu.redraw();
        },

        /**
         * Send a raw pointer gesture to the board, as a real mouse does: a mousedown on #canvas (handled by the
         * document listener, main.js:1058, 1095-1101 -> onDown 111-149), mousemoves on #canvas (onMove, 183-246)
         * and a mouseup on #canvas (onUp, 151-181). Each path entry is a point index or {x, y} in page pixels.
         * @param {Array<number|{x:number, y:number}>} path one entry is a click; more is a drag
         * @param {{button?:0|2, ctrl?:boolean, shift?:boolean, alt?:boolean, double?:boolean}} [opts]
         */
        pointer(path, opts) {
            opts = opts || {};
            const canvas = $('canvas');
            const button = opts.button || 0;
            const pts = path.map(function(p) {
                return typeof p === 'number' ? Bridge.pointToPage(p) : p;
            });
            function fire(type, p, buttons) {
                canvas.dispatchEvent(new MouseEvent(type, {
                    bubbles: true, cancelable: true, view: window,
                    clientX: p.x - window.scrollX, clientY: p.y - window.scrollY,
                    button: button, buttons: buttons,
                    ctrlKey: !!opts.ctrl, shiftKey: !!opts.shift, altKey: !!opts.alt
                }));
            }
            const held = button === 2 ? 2 : 1;
            fire('mousedown', pts[0], held);
            pts.slice(1).forEach(function(p) {
                fire('mousemove', p, held);
            });
            fire('mouseup', pts[pts.length - 1], 0);
            if (opts.double) {
                fire('dblclick', pts[pts.length - 1], 0); // document listener, main.js:1906-1916
            }
        },

        // ---- Puzzle type ---------------------------------------------------------------------------------------

        /**
         * The link's genre tags (pu.user_tags, read from the link at general.js:2175; e.g. ["classic"] or
         * ["nurikabe"]). Empty when the setter set none.
         * @returns {string[]}
         */
        genreTags() {
            return (pu.user_tags || []).slice();
        },

        /**
         * Open the legacy "reset this mode's entries" / "delete all" confirms (main.js:1146-1152 -> general.js:1343,
         * 1384). They are SweetAlert2 popups.
         * @param {"mode"|"all"} what
         */
        clear(what) {
            if (what === 'all') {
                DeleteCheck();
            } else {
                ResetCheck();
            }
        },

        // ---- Answer check --------------------------------------------------------------------------------------

        /**
         * The answer check's verdict, without its side effects. Penpa+ runs the real check on every redraw
         * (class_p.js:12600 -> 13375 check_solution), which shows the Congratulations popup and pauses the timer
         * the first time the board matches. This compares the same way (make_solution() against pu.solution) and
         * shows nothing.
         * @returns {{hasAnswerCheck:boolean, solved:boolean}}
         */
        check() {
            if (!pu.solution) {
                return {hasAnswerCheck: false, solved: false};
            }
            let solved = false;
            const mine = pu.make_solution();
            if (!pu.multisolution) {
                solved = JSON.stringify(mine) === pu.solution && !pu.check_conflict(JSON.stringify(mine));
            } else {
                solved = pu.solution.some(function(author) {
                    const a = JSON.stringify(author);
                    return a && mine.some(function(u) {
                        return JSON.stringify(u) === a;
                    });
                });
            }
            return {hasAnswerCheck: true, solved: solved};
        },

        /**
         * What the answer check compares, as the title-click popup shows it (general.js:3201-3209 ->
         * class_p.js get_answercheck_settings). HTML from Penpa+'s text table.
         * @returns {string|null} null if the link has no answer check
         */
        answerCheckInfo() {
            if (!pu.solution) {
                return null;
            }
            const opt = pu.get_answercheck_settings();
            return opt.answercheck_opt.length === 0 ? PenpaText.get('answer_check_empty') : opt.message;
        },

        // ---- Puzzle info ---------------------------------------------------------------------------------------

        /**
         * Title, author, source and rules, as load() fills the Share form (general.js:2030-2074). rules is HTML
         * (sanitized by load(), `<br>` for newlines), as display_rules shows it (general.js:917-922).
         * @returns {{title:string, author:string, source:string, rules:string}}
         */
        getInfo() {
            return {
                title: $('saveinfotitle').value,
                author: $('saveinfoauthor').value,
                source: $('saveinfosource').value,
                rules: pu.rules || ''
            };
        },

        // ---- Timer ---------------------------------------------------------------------------------------------

        /**
         * The solve timer (easytimer `sw_timer`, timer.js:1), as timer_update prints it (timer.js:29-31).
         * @returns {{running:boolean, paused:boolean, text:string, seconds:number}}
         */
        getTimer() {
            const v = sw_timer.getTimeValues();
            const total = sw_timer.getTotalTimeValues();
            return {
                running: sw_timer.isRunning(),
                paused: sw_timer.isPaused(),
                text: (v.days ? v.days + ':' : '') + v.toString(['hours', 'minutes', 'seconds']),
                seconds: total.seconds
            };
        },

        /** Pause the timer and cover the board, as the Pause button does (main.js:2286, 2289-2292). */
        pauseTimer() {
            $('sw_pause').click();
        },

        /** Resume the timer and uncover the board, as the Start button does (main.js:2287, 2294-2297). */
        startTimer() {
            $('sw_start').click();
        },

        // ---- Settings ------------------------------------------------------------------------------------------

        /**
         * The solver settings a solve UI might show, read from UserSettings (settings.js). Read-only here; open the
         * legacy dialog with openSettings() to change them.
         * @returns {object}
         */
        getSettings() {
            const s = UserSettings;
            return {
                theme: s.color_theme === THEME_DARK ? 'dark' : 'light', // settings.js:317-347
                displaySize: s.displaysize,             // cell size in px, settings.js:349-370
                timerBar: s.timerbar_status,            // 1 show, 2 hide, settings.js:55-66
                conflictDetection: s.conflict_detection, // settings.js:105-123
                checkPencilMarks: s.check_pencil_marks,
                sudokuNormalSize: s.sudoku_normal_size,
                sudokuCentreSize: s.sudoku_centre_size,
                starbattleDots: s.starbattle_dots,
                surfaceSecondColor: s.secondcolor,
                customColors: s.custom_colors_on,
                shortcutsEnabled: s.shortcuts_enabled,  // Sudoku Z/X/C/V keys
                panelShown: s.panel_shown,              // floating number panel
                language: s.app_language
            };
        },

        /**
         * Set the board's cell size in px (12-90), as the Resize dialog's Apply does (main.js:1678-1685 ->
         * settings.js:350-367, which calls redraw_grid). The only safe way to make the board bigger or smaller.
         * @param {number} px
         */
        setCellSize(px) {
            UserSettings.displaysize = px;
            queueChange('resize');
        },

        /** Open the legacy General Settings dialog (main.js:1132-1135 -> general.js:1533-1535). */
        openSettings() {
            p_settings();
        },

        /** Open the legacy rules popup (main.js:1731-1734 -> general.js:917-922). */
        showRules() {
            display_rules();
        },

        // ---- Events --------------------------------------------------------------------------------------------

        /**
         * Subscribe to engine changes: called at most once per animation frame after any redraw, mode, sub-mode,
         * style or Composite/Shape change, timer start/pause/reset, or resize.
         * @param {(state: object, reason: string) => void} cb receives getState() and the last trigger's name
         * @returns {() => void} unsubscribe
         */
        onChange(cb) {
            listeners.add(cb);
            return function() {
                listeners.delete(cb);
            };
        },

        /**
         * Subscribe to timer ticks (every tenth of a second while running, plus start/pause/stop/reset).
         * @param {(timer: object) => void} cb receives getTimer()
         * @returns {() => void} unsubscribe
         */
        onTimer(cb) {
            timerListeners.add(cb);
            return function() {
                timerListeners.delete(cb);
            };
        }
    };

    /** Layout helpers for variants (ctx.helpers). */
    const Helpers = {
        /**
         * Move the board (#dvique with #canvas) into a variant's container. Listeners are on #canvas and
         * document (main.js:77-85), so they move with it.
         * @param {HTMLElement} container
         * @returns {HTMLElement} the board element
         */
        adoptBoard(container) {
            const board = $('dvique');
            container.appendChild(board);
            Bridge.fixPointerOffset();
            return board;
        },

        /**
         * Hide the legacy chrome (header, toolbars, side panels) without removing it: main.js and general.js keep
         * finding their element ids, and the legacy `.modal` dialogs (settings, share) still show. Call adoptBoard()
         * first, or the board is hidden with the chrome.
         */
        hideLegacy() {
            Bridge.legacyRoot().classList.add('proto-legacy-hidden');
            document.body.classList.add('proto-legacy-off');
        },

        /** Undo hideLegacy(). */
        showLegacy() {
            Bridge.legacyRoot().classList.remove('proto-legacy-hidden');
            document.body.classList.remove('proto-legacy-off');
        },

        /**
         * Create an element. el('div', {class: 'x', onclick: fn}, ['text', childEl])
         * @returns {HTMLElement}
         */
        el(tag, attrs, children) {
            const node = document.createElement(tag);
            Object.keys(attrs || {}).forEach(function(k) {
                if (k.indexOf('on') === 0 && typeof attrs[k] === 'function') {
                    node.addEventListener(k.slice(2), attrs[k]);
                } else if (k === 'class') {
                    node.className = attrs[k];
                } else {
                    node.setAttribute(k, attrs[k]);
                }
            });
            (children || []).forEach(function(c) {
                node.appendChild(typeof c === 'string' ? document.createTextNode(c) : c);
            });
            return node;
        }
    };

    // Shared CSS for hideLegacy(). Fixed-position .modal dialogs are not clipped by the zero-height root, and
    // `visibility: visible` lets them show through the hidden ancestor. Their z-index (2, base-structure.css:974)
    // is raised above variant chrome (keep variant layers below 1000) and below SweetAlert2's popups (1060).
    const style = document.createElement('style');
    style.id = 'proto-bridge-css';
    style.textContent =
        '#proto-legacy-root.proto-legacy-hidden { visibility: hidden; height: 0; overflow: hidden; }\n' +
        '#proto-legacy-root.proto-legacy-hidden .modal { visibility: visible; z-index: 1000; }\n' +
        'body.proto-legacy-off #float-key { display: none; }\n';
    document.head.appendChild(style);

    window.PrototypeBridge = Bridge;
})();
