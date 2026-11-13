/*
 * PROTOTYPE (throwaway, branch prototype/solve-ui): solve-UI variant G, "Timeline".
 * Owned by variant G's builder: this file and variant-G.css only. See README.md for the contract.
 *
 * The idea: undo as a timeline. A strip along the bottom shows every move of the solve as a tick (coloured by what it
 * placed: value, paint, path, stamp); dragging or clicking the playhead is undo/redo, and undone moves stay visible as
 * hollow ticks until a new move replaces them. A "What if" button starts a branch: the strip forks (a new lane above,
 * starting at the playhead), the board is framed in the branch's colour and every mark made inside the branch is
 * highlighted in that colour, and one click Keeps the branch (it becomes the main line) or Discards it (the board and
 * the history go back to the fork, including any undone moves the fork had parked). A discarded branch leaves a red
 * stub on the strip; clicking the stub reopens it. Branches nest up to three deep.
 *
 * The claim it tests: bifurcation is a real solving technique, and today it is undo spam (or pen colour discipline);
 * a branch the UI knows about makes it one click in and one click out.
 *
 * Round 2 (genre puzzles):
 *   - A tick is one MOVE, not one engine step: a mouse gesture (press to release) is one tick, so a loop drawn in one
 *     drag is one tick, and ◀ / ▶ / Ctrl+Z / Ctrl+Y undo and redo a whole move. Penpa undoes a drag a segment at a
 *     time; the grouping lives here (see "Moves").
 *   - A genre kit: the top bar leads with the two or three tools the puzzle needs, picked from its answer check, rules
 *     and tags (Loop, Borders, Shade, Circles, Stars, Bulbs, Ships, Numbers), each with its left/right mouse legend.
 *     Tab cycles them. The full mode list is still there, behind "All modes".
 *   - The Loop tool routes a right-click: on a cell it puts an × in the cell (Penpa's Line OX), on an edge an × on the
 *     edge (Penpa's Line x). Penpa needs two Composite tools for that.
 *   - A branch no longer washes the whole board; the marks it changed are outlined in its colour (an overlay).
 *
 * How branches work (the bridge has no branch API, so it is all in this file):
 *   - Start: deep-copy (structuredClone) every property of pu.pu_a and pu.pu_a_col, with each Stack's __a array
 *     (command_undo, command_redo, command_replay), plus the history position, the moves not yet redone ("parked"),
 *     and a signature of the undo stack. Nothing is changed on the engine side; the branch's moves are ordinary undo
 *     steps on top of the fork.
 *   - Discard: write the copies back into pu.pu_a / pu.pu_a_col (Stack.set for the stacks) and pu.redraw(). Before
 *     that, the branch's own end state is copied the same way and kept with its stub, so it can be reopened.
 *   - Keep: forget the copy. The branch's moves are already the history; the parked moves are dropped.
 *   - Reopen a stub: jump to the fork; if the undo stack still matches the stored signature, start a branch there
 *     and write the stub's end state back.
 *   - Undo below the fork is blocked while a branch is open: pu.undo is wrapped on the instance (Ctrl+Z, the bridge's
 *     undo() and jumpTo() all go through it).
 *
 * Bridge gaps worked around here (read `pu` / the legacy DOM directly):
 *   - Branch snapshot/restore: none; pu.pu_a, pu.pu_a_col and their Stack objects are read and written directly.
 *   - Step list: history() gives only {position, length}; the strip reads pu.pu_a.command_undo / command_redo entries
 *     ([list, key, value, qa, group]) to colour and label each step, and groups them the way undo() pops them.
 *   - Move grouping: no notion of a gesture; window-capture mousedown/mouseup on #canvas bracket the steps a gesture
 *     made, and pu.undo / pu.redo are wrapped to keep the bracketing in step with the history.
 *   - Undo guard: no hook to veto an undo; pu.undo is wrapped on the instance.
 *   - Right-click routing: no per-click tool override; the Composite tool is switched (B.setComposite) in a capture
 *     mousedown before Penpa's own handler, and switched back after mouseup.
 *   - Cell names (r3c4) for tick labels: none; computed from pu.point / pu.centerlist positions.
 *   - Shapes and style swatch colours: read from the legacy DOM (#mode_symbolul1, `<id>_lb` computed background), as A.
 *   - Board fit: setCellSize() takes px per cell, so the canvas's px-per-cell ratio is measured (rect / pu.size), as A.
 */
(function() {
    'use strict';

    /** What a step placed, by the pu_a list its undo entry names; colours the tick. */
    const KINDS = {
        number: {label: 'Digit', fam: 'value'},
        numberS: {label: 'Mark', fam: 'value'},
        surface: {label: 'Shade', fam: 'paint'},
        line: {label: 'Line', fam: 'path'},
        lineE: {label: 'Edge', fam: 'path'},
        wall: {label: 'Wall', fam: 'path'},
        deletelineE: {label: 'Edge erase', fam: 'path'},
        symbol: {label: 'Shape', fam: 'stamp'},
        cage: {label: 'Cage', fam: 'stamp'},
        killercages: {label: 'Cage', fam: 'stamp'},
        thermo: {label: 'Thermo', fam: 'stamp'},
        nobulbthermo: {label: 'Thermo', fam: 'stamp'},
        arrows: {label: 'Arrow', fam: 'stamp'},
        direction: {label: 'Arrow', fam: 'stamp'},
        squareframe: {label: 'Frame', fam: 'stamp'},
        polygon: {label: 'Polygon', fam: 'stamp'},
        move: {label: 'Move', fam: 'move'}
    };
    const FAM_COLORS = {value: '#5aa9ff', paint: '#b8bec9', path: '#5fd68a', stamp: '#c48bff', move: '#9aa4b2'};
    const MODE_FAM = {
        sudoku: 'value', number: 'value', surface: 'paint', multicolor: 'paint', line: 'path', lineE: 'path',
        wall: 'path', symbol: 'stamp', special: 'stamp', cage: 'stamp', combi: 'stamp', move: 'move'
    };
    /** Branch colours by depth (1..3). */
    const BRANCH_COLORS = ['#f2a516', '#ff4fa3', '#1fb6ff'];
    const MAX_DEPTH = 3;
    const SUBMODE_FALLBACK = {number: {'3': '1/4', '9': 'Side'}};
    const DIGITS = ['1', '2', '3', '4', '5', '6', '7', '8', '9', '0'];

    /**
     * Genre-kit tools. mode/combi/submode/style say what to switch to; legend is the mouse grammar shown beside it
     * (Penpa+ README § Composite). `loop` is this variant's own: Line x with right-click routed (see routeRight).
     */
    const TOOLS = {
        loop: {label: 'Loop', mode: 'combi', combi: 'linex', fam: 'path',
            legend: 'Drag: loop · Right-click a cell: × · right-click/drag an edge: ×'},
        yajilin: {label: 'Shade + loop', mode: 'combi', combi: 'yajilin', fam: 'path',
            legend: 'Click: shade · drag: loop · right-click: dot (cell) / × (edge)'},
        edges: {label: 'Borders', mode: 'combi', combi: 'edgex', fam: 'path',
            legend: 'Drag along grid lines: border · right-click/drag: ×'},
        edgesPlain: {label: 'Borders', mode: 'lineE', submode: '1', style: 3, fam: 'path',
            legend: 'Drag along grid lines: border'},
        shade: {label: 'Shade', mode: 'combi', combi: 'blpo', fam: 'paint',
            legend: 'Click: shade (again: dot) · right-click: dot · drag: many'},
        shadePlain: {label: 'Shade', mode: 'surface', fam: 'paint',
            legend: 'Click/drag: shade · right-click: 2nd colour'},
        circles: {label: 'Circles', mode: 'combi', combi: 'blwh', fam: 'stamp',
            legend: 'Click: white (again: black) · right-click: black · drag: many'},
        stars: {label: 'Stars', mode: 'combi', combi: 'star', fam: 'stamp',
            legend: 'Click: star · right-click/drag: × · right-click a corner: dot'},
        bulbs: {label: 'Bulbs', mode: 'combi', combi: 'akari', fam: 'stamp',
            legend: 'Click: bulb · right-click: dot (cell) / × (edge)'},
        ships: {label: 'Ships', mode: 'combi', combi: 'battleship', fam: 'stamp',
            legend: 'Click cycles segment/water · drag out: ship end · right-drag: water'},
        numbers: {label: 'Numbers', mode: 'number', submode: '1', fam: 'value',
            legend: 'Click a cell (drag for many), type'},
        digits: {label: 'Digits', mode: 'sudoku', submode: '1', fam: 'value',
            legend: 'Select, type · Shift: corner · Ctrl: centre'}
    };

    window.PrototypeVariants = window.PrototypeVariants || {};
    window.PrototypeVariants.G = {
        name: 'Timeline',

        /** @param {object} ctx see README.md, "The variant contract" */
        mount(ctx) {
            const B = ctx.bridge;
            const el = ctx.helpers.el;
            const SVGNS = 'http://www.w3.org/2000/svg';

            /** A button that acts on click and never takes focus (keys stay with the board). */
            function btn(cls, label, onClick, title) {
                const b = el('button', {class: 'proto-g-btn ' + (cls || ''), type: 'button', tabindex: '-1'}, [label]);
                if (title) {
                    b.title = title;
                }
                b.addEventListener('mousedown', function(e) {
                    e.preventDefault();
                });
                b.addEventListener('click', function(e) {
                    e.preventDefault();
                    onClick(e);
                });
                return b;
            }

            // ==== Skeleton ==========================================================================================
            const title = el('div', {class: 'proto-g-title'});
            const kitBar = el('div', {class: 'proto-g-kit'});
            const modeBar = el('div', {class: 'proto-g-modes'});
            const allModesBtn = btn('proto-g-act proto-g-allmodes', 'All modes ▾', function() {
                app.classList.toggle('show-modes');
            }, 'Show every Penpa mode');
            const toolBar = el('div', {class: 'proto-g-tools'});
            const legend = el('span', {class: 'proto-g-legend'});
            const timerText = el('span', {class: 'proto-g-timer'}, ['00:00']);
            const checkChip = el('span', {class: 'proto-g-check'});
            const checkBtn = btn('proto-g-act proto-g-act-check', 'Check', runCheck, 'Check the answer');
            const top = el('div', {class: 'proto-g-top'}, [
                el('div', {class: 'proto-g-toprow'}, [
                    title, kitBar, allModesBtn, legend,
                    el('div', {class: 'proto-g-right'}, [
                        checkChip, checkBtn,
                        btn('proto-g-act', 'Rules', function() {
                            B.showRules();
                        }, 'Show the rules'),
                        timerText,
                        btn('proto-g-act proto-g-icon', '⚙', function() {
                            B.openSettings();
                        }, 'Settings')
                    ])
                ]),
                el('div', {class: 'proto-g-moderow'}, [modeBar]),
                el('div', {class: 'proto-g-toolrow'}, [toolBar])
            ]);

            const branchBanner = el('div', {class: 'proto-g-banner', hidden: ''});
            const overlay = document.createElementNS(SVGNS, 'svg');
            overlay.setAttribute('class', 'proto-g-overlay');
            const boardCard = el('div', {class: 'proto-g-boardcard'});
            const boardSlot = el('div', {class: 'proto-g-boardslot'}, [boardCard]);
            const stage = el('div', {class: 'proto-g-stage'}, [boardSlot]);

            const undoBtn = btn('proto-g-tl-btn', '◀', function() {
                undoMove();
            }, 'Undo one move (Ctrl+Z)');
            const redoBtn = btn('proto-g-tl-btn', '▶', function() {
                redoMove();
            }, 'Redo one move (Ctrl+Y)');
            const stepText = el('div', {class: 'proto-g-steptext'});
            const branchText = el('div', {class: 'proto-g-branchtext'});
            const emptyHint = el('div', {class: 'proto-g-empty'}, [
                'Every move lands here as a tick (a whole drag is one tick). Drag (or wheel) along the strip to ' +
                'rewind and replay; What if… starts a branch you can Keep or Discard.'
            ]);
            const lanes = el('div', {class: 'proto-g-lanes'});
            const scroller = el('div', {class: 'proto-g-scroller'}, [lanes]);
            const tickTip = el('div', {class: 'proto-g-tip', hidden: ''});
            const whatIfBtn = btn('proto-g-whatif', 'What if…', startBranch,
                'Start a branch here: try something, then Keep it or Discard it in one click');
            const strip = el('div', {class: 'proto-g-strip'}, [
                el('div', {class: 'proto-g-strip-left'}, [
                    el('div', {class: 'proto-g-tl-btns'}, [undoBtn, redoBtn]),
                    stepText,
                    branchText
                ]),
                scroller,
                el('div', {class: 'proto-g-strip-right'}, [branchBanner, whatIfBtn]),
                tickTip
            ]);
            const toast = el('div', {class: 'proto-g-toast', hidden: ''});

            const app = el('div', {class: 'proto-g-app'}, [top, stage, strip, toast]);
            document.body.appendChild(app);
            ctx.helpers.adoptBoard(boardCard);
            boardCard.appendChild(overlay);
            ctx.helpers.hideLegacy();

            let toastTimer = null;
            function flash(msg) {
                if (!msg) {
                    return;
                }
                toast.textContent = msg;
                toast.hidden = false;
                clearTimeout(toastTimer);
                toastTimer = setTimeout(function() {
                    toast.hidden = true;
                }, 2600);
            }

            // ==== Puzzle info =======================================================================================
            const info = B.getInfo();
            title.appendChild(el('span', {class: 'proto-g-title-main'}, [info.title || 'Untitled puzzle']));
            if (info.author) {
                title.appendChild(el('span', {class: 'proto-g-title-by'}, ['by ' + info.author]));
            }
            title.title = (info.title || '') + (info.author ? ' by ' + info.author : '');

            // ==== Board fit =========================================================================================
            function fitBoard() {
                const r = ctx.canvas.getBoundingClientRect();
                if (!r.width || !pu.size) {
                    return;
                }
                const perW = r.width / pu.size;
                const perH = r.height / pu.size;
                const availW = boardSlot.clientWidth - 40;
                const availH = boardSlot.clientHeight - 24;
                const px = Math.max(12, Math.min(90, Math.floor(Math.min(availW / perW, availH / perH))));
                if (Math.abs(px - pu.size) >= 1) {
                    B.setCellSize(px);
                }
            }
            let fitTimer = null;
            window.addEventListener('resize', function() {
                clearTimeout(fitTimer);
                fitTimer = setTimeout(fitBoard, 120);
            });

            // ==== Genre kit =========================================================================================
            /**
             * The tools this puzzle needs, from its answer check (what the check compares), its rules, title and tags.
             * A heuristic: good enough for the LMD samples, with "All modes" behind it for everything else.
             */
            function buildKit() {
                const text = ((info.title || '') + ' ' + (info.rules || '') + ' ' + B.genreTags().join(' ')).toLowerCase();
                const chk = (B.answerCheckInfo() || '').toLowerCase();
                const combis = B.listComposite().map(function(c) {
                    return c.name;
                });
                const visible = B.listModes().map(function(m) {
                    return m.mode;
                });
                const kit = [];
                function add(id) {
                    let t = TOOLS[id];
                    // Fall back to a plain mode when the grid has no such Composite tool.
                    if (t.combi && combis.indexOf(t.combi) === -1) {
                        t = TOOLS[id + 'Plain'];
                        id = id + 'Plain';
                    }
                    if (t && kit.indexOf(id) === -1) {
                        kit.push(id);
                    }
                }
                const isSudoku = pu.gridtype === 'sudoku' || /sudoku/.test(text) && visible.indexOf('sudoku') !== -1;
                if (/fillomino/.test(text)) {
                    add('numbers');
                }
                if (/light bulbs/.test(chk)) {
                    add('bulbs');
                }
                if (/stars/.test(chk)) {
                    add('stars');
                }
                if (/battleship/.test(chk)) {
                    add('ships');
                }
                if (/white and black circles/.test(chk)) {
                    add('circles');
                }
                if (/line must be/.test(chk)) {
                    if (/yajilin|arrow.*shade|shade.*arrow/.test(text)) {
                        add('yajilin');
                    }
                    add('loop');
                }
                if (/edge must be/.test(chk)) {
                    add('edges');
                }
                if (/shade cells/.test(chk) && kit.indexOf('ships') === -1) {
                    add('shade');
                }
                if (/numbers must be/.test(chk)) {
                    add(isSudoku ? 'digits' : 'numbers');
                }
                return kit.slice(0, 4);
            }
            const kit = buildKit();

            function toolActive(id, m) {
                const t = TOOLS[id];
                m = m || B.getMode();
                if (m.mode !== t.mode) {
                    return false;
                }
                if (t.combi) {
                    return m.submode === t.combi;
                }
                return t.submode === undefined || String(m.submode) === t.submode;
            }
            function activeTool(m) {
                for (let i = 0; i < kit.length; i++) {
                    if (toolActive(kit[i], m)) {
                        return kit[i];
                    }
                }
                return null;
            }
            function pickTool(id) {
                const t = TOOLS[id];
                B.setMode(t.mode);
                if (t.combi) {
                    B.setComposite(t.combi);
                }
                if (t.submode !== undefined) {
                    B.setSubmode(t.submode);
                }
                if (t.style !== undefined) {
                    B.setStyle(t.style);
                }
            }
            kit.forEach(function(id) {
                const t = TOOLS[id];
                const b = btn('proto-g-kitbtn', t.label, function() {
                    pickTool(id);
                }, t.legend + (kit.length > 1 ? '  (Tab cycles the kit)' : ''));
                b.dataset.tool = id;
                b.style.setProperty('--fam', FAM_COLORS[t.fam]);
                kitBar.appendChild(b);
            });
            if (!kit.length) {
                app.classList.add('show-modes');
            }
            // Start on the kit's first tool unless the setter's start mode already is one.
            if (kit.length && !activeTool()) {
                pickTool(kit[0]);
            }

            // Tab cycles the kit (Shift+Tab backwards); Penpa's own Tab cycles its mode set, which these links
            // rarely set.
            window.addEventListener('keydown', function(e) {
                if (e.key !== 'Tab' || kit.length < 2 || isTyping(e)) {
                    return;
                }
                e.preventDefault();
                e.stopImmediatePropagation();
                const cur = kit.indexOf(activeTool());
                const n = kit.length;
                pickTool(kit[((cur === -1 ? -1 : cur) + (e.shiftKey ? -1 : 1) + n) % n]);
            }, true);

            function isTyping(e) {
                const t = e.target;
                return t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.tagName === 'SELECT' ||
                    t.isContentEditable) || !!document.querySelector('.swal2-container');
            }

            // ---- Loop: one tool, right-click routed to the cell or the edge -----------------------------------------
            let routed = null;
            function routeRight(e) {
                if (e.button !== 2 || e.target !== ctx.canvas || activeTool() !== 'loop') {
                    return;
                }
                const p = B.pageToPoint(e.pageX, e.pageY, [0, 2, 3]);
                if (p === null || !pu.point[p] || pu.point[p].type !== 0) {
                    return;
                }
                routed = 'linex';
                B.setComposite('lineox'); // Line OX: right-click on a cell = × in the cell
            }
            function unroute() {
                if (routed) {
                    const back = routed;
                    routed = null;
                    B.setComposite(back);
                }
            }

            // ==== Top bar: modes and tools ==========================================================================
            const available = B.listModes();
            const modeButtons = {};
            available.forEach(function(m) {
                const b = btn('proto-g-mode', m.label, function() {
                    B.setMode(m.mode);
                }, m.label + ' mode');
                b.style.setProperty('--fam', FAM_COLORS[MODE_FAM[m.mode]] || '#9aa4b2');
                modeButtons[m.mode] = b;
                modeBar.appendChild(b);
            });

            function swatchColor(style) {
                const lb = document.getElementById(style.id + '_lb');
                if (!lb) {
                    return null;
                }
                const bg = getComputedStyle(lb).backgroundColor;
                return bg && bg !== 'rgba(0, 0, 0, 0)' && bg !== 'transparent' ? bg : null;
            }

            /** A labelled segmented group; items [{value, label, color?, title?}]. */
            function seg(label, items, current, onPick) {
                const g = el('div', {class: 'proto-g-seg'});
                if (label) {
                    g.appendChild(el('span', {class: 'proto-g-seglabel'}, [label]));
                }
                items.forEach(function(it) {
                    const b = btn(it.color ? 'proto-g-sw' : 'proto-g-opt', it.color ? '' : it.label, function() {
                        onPick(it.value);
                    }, it.title || it.label);
                    if (it.color) {
                        b.style.setProperty('--sw', it.color);
                    }
                    if (String(it.value) === String(current)) {
                        b.classList.add('is-on');
                    }
                    g.appendChild(b);
                });
                return g;
            }

            /** A compact <select>; blurs after a pick so keys go back to the board. */
            function picker(label, items, current, onPick) {
                const s = el('select', {class: 'proto-g-select', tabindex: '-1'});
                items.forEach(function(it) {
                    const o = el('option', {value: String(it.value)}, [it.label]);
                    if (String(it.value) === String(current)) {
                        o.selected = true;
                    }
                    s.appendChild(o);
                });
                s.addEventListener('change', function() {
                    onPick(s.value);
                    s.blur();
                });
                return el('div', {class: 'proto-g-seg'}, [el('span', {class: 'proto-g-seglabel'}, [label]), s]);
            }

            function submodeItems(mode) {
                const fb = SUBMODE_FALLBACK[mode] || {};
                return B.listSubmodes(mode).map(function(s) {
                    return {value: s.value, label: s.label || fb[s.value] || s.value};
                });
            }

            function styleItems(mode) {
                return B.listStyles(mode).filter(function(s) {
                    return s.label || swatchColor(s);
                }).map(function(s) {
                    const c = s.label.length <= 4 ? swatchColor(s) : null;
                    return {value: s.value, label: s.label, color: c, title: s.label};
                });
            }

            /** The Shape menu, read from the legacy DOM: groups (ms1_*) with sizes (ms_*). */
            function shapeItems() {
                const items = [];
                document.querySelectorAll('#mode_symbolul1 > li').forEach(function(li) {
                    const head = li.querySelector(':scope > span[id^="ms1_"]') || li.querySelector(':scope > span[id^="ms_"]');
                    if (!head || li.classList.contains('is_hidden') || li.style.display === 'none') {
                        return;
                    }
                    const group = head.textContent.trim().split(/\s+/).slice(0, 2).join(' ');
                    const sizes = Array.from(li.querySelectorAll('span[id^="ms_"]'));
                    sizes.forEach(function(s) {
                        items.push({value: s.id.slice(3), label: group + (sizes.length > 1 ? ' ' + s.textContent.trim() : '')});
                    });
                });
                return items;
            }

            function renderTools(m) {
                toolBar.textContent = '';
                const mode = m.mode;
                const tool = activeTool(m);
                kitBar.querySelectorAll('.proto-g-kitbtn').forEach(function(b) {
                    b.classList.toggle('is-on', b.dataset.tool === tool);
                });
                legend.textContent = tool ? TOOLS[tool].legend : hintFor(m);
                legend.title = legend.textContent;
                const digits = mode === 'sudoku' || mode === 'number' || mode === 'symbol';
                if (tool && mode === 'combi') {
                    // A kit tool carries its own grammar; the Composite picker stays under "All modes".
                    if (app.classList.contains('show-modes')) {
                        toolBar.appendChild(picker('Tool', compositeItems(), m.submode, B.setComposite));
                    }
                } else if (mode === 'combi') {
                    toolBar.appendChild(picker('Tool', compositeItems(), m.submode, B.setComposite));
                } else if (mode === 'symbol') {
                    toolBar.appendChild(picker('Shape', shapeItems(), m.submode, B.setShape));
                    toolBar.appendChild(seg('Layer', styleItems(mode), m.style, B.setStyle));
                } else {
                    const subs = submodeItems(mode);
                    if (subs.length > 1) {
                        toolBar.appendChild(seg(mode === 'sudoku' ? 'Enter' : 'Kind', subs, m.submode, B.setSubmode));
                    }
                    const styles = styleItems(mode);
                    const colours = styles.filter(function(s) {
                        return s.color;
                    });
                    const looks = styles.filter(function(s) {
                        return !s.color;
                    });
                    if (colours.length) {
                        toolBar.appendChild(seg(MODE_FAM[mode] === 'paint' ? 'Brush' : 'Colour', colours, m.style, B.setStyle));
                    }
                    if (looks.length) {
                        toolBar.appendChild(seg('Style', looks, m.style, B.setStyle));
                    }
                }
                if (digits) {
                    const pad = el('div', {class: 'proto-g-seg proto-g-pad'}, [
                        el('span', {class: 'proto-g-seglabel'}, [mode === 'symbol' ? 'Variant' : 'Type'])
                    ]);
                    DIGITS.forEach(function(d) {
                        pad.appendChild(btn('proto-g-key', d, function() {
                            B.sendKey(d);
                        }));
                    });
                    pad.appendChild(btn('proto-g-key proto-g-key-del', 'Del', function() {
                        B.sendKey('Delete');
                    }, 'Clear the selected cells (Delete)'));
                    toolBar.appendChild(pad);
                }
            }

            function compositeItems() {
                return B.listComposite().map(function(c) {
                    return {value: c.name, label: c.label};
                });
            }

            function hintFor(m) {
                return {
                    sudoku: 'Select cells, type. Shift = corner, Ctrl = centre.',
                    number: 'Click a cell, type.',
                    surface: 'Click/drag paints; right-click = 2nd colour.',
                    multicolor: 'Select cells, then a colour.',
                    line: 'Drag through cells.',
                    lineE: 'Drag along edges.',
                    wall: 'Drag to draw walls.',
                    symbol: 'Click a cell to place.',
                    special: 'Drag across cells.',
                    cage: 'Drag across cells.',
                    combi: 'Left = mark, right = auxiliary; drag for lines.',
                    move: 'Drag an item to move it.'
                }[m.mode] || '';
            }

            // ==== Steps: read from Penpa's undo/redo stacks =========================================================
            /** Group a stack's entries into steps from its end, as undo()/redo() pop them; newest step first. */
            function groupFromEnd(arr) {
                const out = [];
                let i = arr.length - 1;
                while (i >= 0) {
                    const g = arr[i] && arr[i][4];
                    const step = [arr[i]];
                    i--;
                    if (g) {
                        while (i >= 0 && arr[i] && arr[i][4] == g) {
                            step.push(arr[i]);
                            i--;
                        }
                    }
                    out.push(step);
                }
                return out;
            }

            /** The current value of a list entry in pu_a (what the board shows). */
            function liveValue(list, key) {
                const l = pu.pu_a[list];
                return l && !Array.isArray(l) ? l[key] : undefined;
            }

            /**
             * Every engine step, oldest first: [{kind, keys, value, done}]. Undo entries hold the value before the
             * step, so the value after it is the next newer entry's "before" for the same key, or the live value.
             */
            function readSteps() {
                const undo = pu.pu_a.command_undo.__a;
                const redo = pu.pu_a.command_redo.__a;
                const after = {};
                const done = groupFromEnd(undo).map(function(entries) {
                    let value;
                    entries.forEach(function(e) {
                        const k = e[0] + '|' + e[1];
                        if (value === undefined) {
                            value = k in after ? after[k] : liveValue(e[0], e[1]);
                        }
                        after[k] = e[2];
                    });
                    return describe(entries, value, true);
                }).reverse();
                const todo = groupFromEnd(redo).map(function(entries) {
                    return describe(entries, entries[0] && entries[0][2], false);
                });
                return done.concat(todo);
            }

            function describe(entries, value, isDone) {
                const e = entries[0] || [];
                const keys = [];
                entries.forEach(function(x) {
                    if (x && x[1] !== undefined && x[1] !== -1 && x[0] !== 'move') {
                        keys.push(String(x[1]));
                    }
                });
                return {kind: e[0] || '?', keys: keys, value: value, done: isDone, n: entries.length};
            }

            // ==== Moves: engine steps grouped by mouse gesture =====================================================
            /**
             * Positions k (1-based engine steps) whose step continues step k-1's move: both came from one mouse
             * gesture. A move is a run of steps; the strip draws one tick per move.
             */
            let cont = new Set();
            /** The gesture in progress: {p0} = history position at mousedown. */
            let gesture = null;
            /** The history as last seen, to tell a new step (which drops the redo tail) from a redo. */
            let seen = B.history();

            /** Bring `cont` in line with the history: a new step after an undo drops the moves it replaced. */
            function syncHistory(redoing) {
                const h = B.history();
                if (!redoing && h.position > seen.pos && h.position === h.length && seen.len > seen.pos) {
                    dropContAbove(seen.pos);
                }
                dropContAbove(h.length);
                seen = {pos: h.position, len: h.length};
                return h;
            }
            seen = {pos: seen.position, len: seen.length};
            function dropContAbove(p) {
                cont.forEach(function(k) {
                    if (k > p) {
                        cont.delete(k);
                    }
                });
            }

            /** Moves over the steps, oldest first: [{from, to, steps}] (steps from+1..to). */
            function buildMoves(all) {
                const moves = [];
                const live = gesture ? B.history().position : -1;
                all.forEach(function(s, i) {
                    const k = i + 1;
                    const joins = k > 1 && (cont.has(k) || (gesture && k > gesture.p0 + 1 && k <= live));
                    if (joins && moves.length && moves[moves.length - 1].to === k - 1) {
                        const m = moves[moves.length - 1];
                        m.to = k;
                        m.steps.push(s);
                    } else {
                        moves.push({from: k - 1, to: k, steps: [s]});
                    }
                });
                return moves;
            }

            window.addEventListener('mousedown', function(e) {
                if (e.target !== ctx.canvas) {
                    return;
                }
                if (gesture) {
                    endGesture(gesture); // a fast next press can beat the last release's timeout
                }
                syncHistory();
                gesture = {p0: B.history().position};
                routeRight(e);
            }, true);
            window.addEventListener('mouseup', function() {
                const g = gesture;
                if (g) {
                    // After Penpa's own mouseup (on the canvas, later in this dispatch) has recorded its step.
                    setTimeout(function() {
                        endGesture(g);
                    }, 0);
                }
            }, true);
            function endGesture(g) {
                if (gesture !== g || !g) {
                    return;
                }
                gesture = null;
                unroute();
                const h = syncHistory();
                cont.delete(g.p0 + 1);
                for (let k = g.p0 + 2; k <= h.position; k++) {
                    cont.add(k);
                }
                render();
            }

            /** History positions where moves end (0 included), ascending. */
            function boundaries() {
                const out = [0];
                buildMoves(readSteps()).forEach(function(m) {
                    out.push(m.to);
                });
                return out;
            }
            function undoMove() {
                if (gesture) {
                    endGesture(gesture);
                }
                const h = B.history();
                const b = boundaries().filter(function(p) {
                    return p < h.position;
                });
                const target = b.length ? b[b.length - 1] : 0;
                if (target < floorPos()) {
                    flash('That is the fork. Keep or Discard the What-if to go further back.');
                    return;
                }
                B.jumpTo(target);
            }
            function redoMove() {
                if (gesture) {
                    endGesture(gesture);
                }
                const h = B.history();
                const b = boundaries().filter(function(p) {
                    return p > h.position;
                });
                if (b.length) {
                    B.jumpTo(b[0]);
                } else if (h.position < h.length) {
                    B.jumpTo(h.length);
                }
            }

            // Ctrl+Z / Ctrl+Y (and Ctrl+Shift+Z) undo and redo a whole move, before Penpa's own handler sees them.
            window.addEventListener('keydown', function(e) {
                if (!(e.ctrlKey || e.metaKey) || e.altKey || isTyping(e)) {
                    return;
                }
                const k = e.key.toLowerCase();
                if ((k === 'z' || k === 'y') && gesture) {
                    endGesture(gesture);
                }
                if (k === 'z' && !e.shiftKey) {
                    e.preventDefault();
                    e.stopImmediatePropagation();
                    undoMove();
                } else if (k === 'y' || k === 'z') {
                    e.preventDefault();
                    e.stopImmediatePropagation();
                    redoMove();
                }
            }, true);

            // ---- Cell names ----------------------------------------------------------------------------------------
            let cellIndex = null;
            function buildCellIndex() {
                const cells = (pu.centerlist || []).filter(function(c) {
                    return pu.point[c];
                });
                const ys = Array.from(new Set(cells.map(function(c) {
                    return Math.round(pu.point[c].y);
                }))).sort(function(a, b) {
                    return a - b;
                });
                const rc = {};
                cells.forEach(function(c) {
                    const y = Math.round(pu.point[c].y);
                    const row = cells.filter(function(d) {
                        return Math.round(pu.point[d].y) === y;
                    }).sort(function(a, b) {
                        return pu.point[a].x - pu.point[b].x;
                    });
                    rc[c] = 'r' + (ys.indexOf(y) + 1) + 'c' + (row.indexOf(c) + 1);
                });
                cellIndex = {cells: cells, rc: rc, near: {}};
            }
            /** The cell whose centre is nearest board point p. */
            function nearestCell(p) {
                if (!cellIndex) {
                    buildCellIndex();
                }
                if (p in cellIndex.near) {
                    return cellIndex.near[p];
                }
                const q = pu.point[p];
                let best = null;
                let min = Infinity;
                if (q) {
                    cellIndex.cells.forEach(function(c) {
                        const d = (pu.point[c].x - q.x) ** 2 + (pu.point[c].y - q.y) ** 2;
                        if (d < min) {
                            min = d;
                            best = c;
                        }
                    });
                }
                cellIndex.near[p] = best;
                return best;
            }
            function cellName(p) {
                const c = nearestCell(p);
                return c === null ? '?' : cellIndex.rc[c];
            }
            /** Board points a step key names: "12" or "12,13" (a segment between two points). */
            function keyPoints(key) {
                return String(key).split(',').map(Number).filter(function(n) {
                    return !isNaN(n) && pu.point[n];
                });
            }

            function stepWhat(s) {
                const kind = KINDS[s.kind] || {label: s.kind};
                const v = s.value;
                if (v === undefined || v === null) {
                    return kind.label + ' erased';
                }
                if ((s.kind === 'number' || s.kind === 'numberS') && Array.isArray(v)) {
                    return (s.kind === 'numberS' ? 'Mark ' : '') + String(v[0]).replace(/,/g, '');
                }
                if (s.kind === 'symbol' && Array.isArray(v)) {
                    return 'Shape ' + v[1];
                }
                if ((s.kind === 'line' || s.kind === 'lineE') && v === 98) {
                    return '×';
                }
                return kind.label;
            }
            /** "Line (5 steps) @ r1c1…r2c4" for a move. */
            function moveLabel(m) {
                const first = m.steps[0];
                const last = m.steps[m.steps.length - 1];
                const a = first.keys.length ? keyPoints(first.keys[0]) : [];
                const z = last.keys.length ? keyPoints(last.keys[last.keys.length - 1]) : [];
                let where = a.length ? cellName(a[0]) : '';
                const end = z.length ? cellName(z[z.length - 1]) : '';
                if (end && end !== where) {
                    where += '…' + end;
                }
                const n = m.steps.length;
                return stepWhat(first) + (n > 1 ? ' (' + n + ' steps)' : '') + (where ? ' @ ' + where : '');
            }

            // ==== Branches ==========================================================================================
            /** Open branches, outermost first: {forkPos, snap, cont, parked: move[], sig, color}. */
            const branches = [];
            /** Discarded branches: {forkPos, depth, count, label, endSnap, endCont, sig}. */
            const stubs = [];

            function cloneSide(side) {
                const out = {};
                Object.keys(side).forEach(function(k) {
                    const v = side[k];
                    out[k] = v && v.__a !== undefined ? {__stack: structuredClone(v.__a)} : structuredClone(v);
                });
                return out;
            }
            function snapshot() {
                return {a: cloneSide(pu.pu_a), col: pu.pu_a_col ? cloneSide(pu.pu_a_col) : null};
            }
            function restoreSide(side, snap) {
                Object.keys(snap).forEach(function(k) {
                    const v = snap[k];
                    if (v && v.__stack) {
                        side[k].set(structuredClone(v.__stack));
                    } else {
                        side[k] = structuredClone(v);
                    }
                });
            }
            function restore(snap, contCopy) {
                restoreSide(pu.pu_a, snap.a);
                if (snap.col && pu.pu_a_col) {
                    restoreSide(pu.pu_a_col, snap.col);
                }
                cont = new Set(contCopy);
                const h = B.history();
                seen = {pos: h.position, len: h.length};
                pu.redraw();
            }
            function undoSig() {
                return JSON.stringify(pu.pu_a.command_undo.__a);
            }

            function startBranch() {
                if (branches.length >= MAX_DEPTH) {
                    flash('Three What-ifs deep is the limit: Keep or Discard one first.');
                    return;
                }
                const h = B.history();
                branches.push({
                    forkPos: h.position,
                    snap: snapshot(),
                    cont: new Set(cont),
                    parked: buildMoves(readSteps()).filter(function(m) {
                        return m.from >= h.position;
                    }),
                    sig: undoSig(),
                    color: BRANCH_COLORS[branches.length]
                });
                render();
            }

            function keepBranch() {
                const b = branches.pop();
                if (!b) {
                    return;
                }
                const n = movesSince(b.forkPos);
                flash('Kept: ' + n + ' move' + (n === 1 ? '' : 's') + ' now on the ' +
                    (branches.length ? 'outer What-if' : 'main line') + '.');
                render();
            }

            function movesSince(pos) {
                const h = B.history();
                return buildMoves(readSteps()).filter(function(m) {
                    return m.from >= pos && m.to <= h.position;
                }).length;
            }

            function discardBranch() {
                const b = branches[branches.length - 1];
                if (!b) {
                    return;
                }
                const h = B.history();
                const moves = buildMoves(readSteps()).filter(function(m) {
                    return m.from >= b.forkPos && m.to <= h.position;
                });
                if (moves.length) {
                    stubs.push({
                        forkPos: b.forkPos,
                        depth: branches.length,
                        count: moves.length,
                        label: moveLabel(moves[0]),
                        endSnap: snapshot(),
                        endCont: new Set(cont),
                        sig: b.sig
                    });
                }
                branches.pop();
                restore(b.snap, b.cont);
                flash('Discarded: back to the fork.');
                render();
            }

            function reopenStub(stub) {
                if (branches.length + 1 !== stub.depth) {
                    flash('That dead end grew from ' + (stub.depth === 1 ? 'the main line' : 'a What-if that is closed') + '.');
                    return;
                }
                B.jumpTo(stub.forkPos);
                if (B.history().position !== stub.forkPos || undoSig() !== stub.sig) {
                    flash('The moves before that fork have changed; it cannot be reopened.');
                    return;
                }
                startBranch();
                restore(stub.endSnap, stub.endCont);
                stubs.splice(stubs.indexOf(stub), 1);
                flash('Reopened: ' + stub.count + ' move' + (stub.count === 1 ? '' : 's') + '.');
                render();
            }

            /** Lowest history position the playhead may reach: the innermost fork. */
            function floorPos() {
                return branches.length ? branches[branches.length - 1].forkPos : 0;
            }

            // Undo below an open fork would rewrite history the branch was built on: block it, whatever asks.
            // Both wrappers also keep `seen` current, so a redo is never mistaken for a new step.
            const rawUndo = pu.undo;
            pu.undo = function() {
                if (branches.length && B.history().position <= floorPos()) {
                    flash('That is the fork. Keep or Discard the What-if to go further back.');
                    return;
                }
                syncHistory();
                const r = rawUndo.apply(this, arguments);
                syncHistory();
                return r;
            };
            const rawRedo = pu.redo;
            pu.redo = function() {
                syncHistory();
                const r = rawRedo.apply(this, arguments);
                syncHistory(true);
                return r;
            };

            // ==== Board overlay: a branch's marks, the hovered move =================================================
            /** Draw the board points a list of step keys names, in a colour, into the overlay. */
            function drawKeys(keys, color, cls) {
                const card = boardCard.getBoundingClientRect();
                const ox = card.left + window.scrollX;
                const oy = card.top + window.scrollY;
                const seenKey = {};
                const w = Math.max(4, pu.size * 0.32);
                keys.forEach(function(key) {
                    if (seenKey[key]) {
                        return;
                    }
                    seenKey[key] = true;
                    const pts = keyPoints(key);
                    if (pts.length >= 2) {
                        const a = B.pointToPage(pts[0]);
                        const b = B.pointToPage(pts[1]);
                        const ln = document.createElementNS(SVGNS, 'line');
                        ln.setAttribute('x1', a.x - ox);
                        ln.setAttribute('y1', a.y - oy);
                        ln.setAttribute('x2', b.x - ox);
                        ln.setAttribute('y2', b.y - oy);
                        ln.setAttribute('stroke', color);
                        ln.setAttribute('stroke-width', w);
                        ln.setAttribute('class', cls + ' is-seg');
                        overlay.appendChild(ln);
                    } else if (pts.length === 1) {
                        const t = pu.point[pts[0]].type;
                        if (t === 1 || t === 2 || t === 3) {
                            const c = B.pointToPage(pts[0]);
                            const dot = document.createElementNS(SVGNS, 'circle');
                            dot.setAttribute('cx', c.x - ox);
                            dot.setAttribute('cy', c.y - oy);
                            dot.setAttribute('r', w * 0.75);
                            dot.setAttribute('fill', color);
                            dot.setAttribute('class', cls + ' is-dot');
                            overlay.appendChild(dot);
                        } else {
                            const cr = B.cellRect(t === 0 ? pts[0] : nearestCell(pts[0]));
                            const r = document.createElementNS(SVGNS, 'rect');
                            r.setAttribute('x', cr.left - ox + 2);
                            r.setAttribute('y', cr.top - oy + 2);
                            r.setAttribute('width', Math.max(2, cr.width - 4));
                            r.setAttribute('height', Math.max(2, cr.height - 4));
                            r.setAttribute('rx', 4);
                            r.setAttribute('stroke', color);
                            r.setAttribute('fill', color);
                            r.setAttribute('class', cls + ' is-cell');
                            overlay.appendChild(r);
                        }
                    }
                });
            }
            let hoverKeys = null;
            function renderOverlay() {
                const card = boardCard.getBoundingClientRect();
                overlay.setAttribute('width', card.width);
                overlay.setAttribute('height', card.height);
                overlay.textContent = '';
                if (branches.length) {
                    const all = readSteps();
                    const h = B.history();
                    branches.forEach(function(b, i) {
                        const end = i + 1 < branches.length ? branches[i + 1].forkPos : h.position;
                        const keys = [];
                        all.slice(b.forkPos, end).forEach(function(s) {
                            Array.prototype.push.apply(keys, s.keys);
                        });
                        drawKeys(keys, b.color, 'proto-g-mark');
                    });
                }
                if (hoverKeys) {
                    drawKeys(hoverKeys, '#ff2d87', 'proto-g-hover');
                }
            }

            // ==== Strip rendering ===================================================================================
            const LANE_H = 18;
            let tickW = 14;
            let moves = [];

            /** Slot (tick index, fractional inside a move) of a history position. */
            function slotOf(pos) {
                if (pos <= 0) {
                    return 0;
                }
                for (let i = 0; i < moves.length; i++) {
                    const m = moves[i];
                    if (pos <= m.to) {
                        return i + (pos - m.from) / (m.to - m.from);
                    }
                }
                return moves.length;
            }

            function laneOfMove(m) {
                let lane = 0;
                branches.forEach(function(b, i) {
                    if (m.from >= b.forkPos) {
                        lane = i + 1;
                    }
                });
                return lane;
            }

            function renderStrip() {
                moves = buildMoves(readSteps());
                const h = B.history();
                const depth = branches.length;
                let parkedMax = 0;
                branches.forEach(function(b) {
                    parkedMax = Math.max(parkedMax, slotOf(b.forkPos) + b.parked.length);
                });
                stubs.forEach(function(s) {
                    parkedMax = Math.max(parkedMax, slotOf(s.forkPos) + 3);
                });
                const total = Math.max(moves.length, parkedMax) + 2;
                const avail = scroller.clientWidth - 24;
                tickW = Math.max(6, Math.min(22, Math.floor(avail / Math.max(total, 1))));
                const width = Math.max(avail, total * tickW + 24);
                // Room for every lane up front, so the strip (and the board above it) never changes height.
                const laneCount = MAX_DEPTH + 1;
                lanes.textContent = '';
                lanes.appendChild(emptyHint);
                lanes.style.width = width + 'px';
                lanes.style.height = (laneCount * LANE_H + 8) + 'px';
                lanes.style.setProperty('--tw', tickW + 'px');

                function y(lane) {
                    return (laneCount - 1 - lane) * LANE_H + 4;
                }
                function x(slot) {
                    return 12 + slot * tickW;
                }

                // Lane rails.
                for (let lane = 0; lane <= depth; lane++) {
                    const from = lane === 0 ? 0 : slotOf(branches[lane - 1].forkPos);
                    const to = lane === depth ? moves.length : slotOf(branches[lane].forkPos) +
                        branches[lane].parked.length;
                    const color = lane === 0 ? '#5d6675' : branches[lane - 1].color;
                    lanes.appendChild(el('div', {class: 'proto-g-rail', style: 'left:' + x(from) + 'px;top:' +
                        (y(lane) + LANE_H / 2 - 1) + 'px;width:' + Math.max(0, x(to) - x(from)) + 'px;background:' + color}));
                    if (lane > 0) {
                        // The fork: a short riser from the parent lane.
                        lanes.appendChild(el('div', {class: 'proto-g-riser', style: 'left:' + (x(from) - 1) + 'px;top:' +
                            (y(lane) + LANE_H / 2 - 1) + 'px;height:' + LANE_H + 'px;background:' + color}));
                        lanes.appendChild(el('div', {class: 'proto-g-forkdot', style: 'left:' + (x(from) - 5) + 'px;top:' +
                            (y(lane - 1) + LANE_H / 2 - 5) + 'px;border-color:' + color}));
                    }
                }

                // Active ticks: one per move; a multi-step move (a drag) gets a bar marker.
                moves.forEach(function(m, i) {
                    const lane = laneOfMove(m);
                    const fam = (KINDS[m.steps[0].kind] || {fam: 'move'}).fam;
                    const done = m.to <= h.position;
                    const t = el('div', {class: 'proto-g-tick' + (done ? '' : ' is-future') +
                        (m.steps.length > 1 ? ' is-multi' : ''), style: 'left:' + (x(i) + 1) +
                        'px;top:' + (y(lane) + 5) + 'px;--c:' + FAM_COLORS[fam]});
                    t.__move = m;
                    lanes.appendChild(t);
                });

                // Parked ticks (a fork's undone future on the parent lane).
                branches.forEach(function(b, i) {
                    const s0 = slotOf(b.forkPos);
                    b.parked.forEach(function(m, j) {
                        const fam = (KINDS[m.steps[0].kind] || {fam: 'move'}).fam;
                        const t = el('div', {class: 'proto-g-tick is-parked', style: 'left:' + (x(s0 + j) + 1) +
                            'px;top:' + (y(i) + 5) + 'px;--c:' + FAM_COLORS[fam]});
                        t.__move = m;
                        t.__parked = true;
                        lanes.appendChild(t);
                    });
                });

                // Dead-end stubs.
                stubs.forEach(function(s) {
                    const st = el('div', {class: 'proto-g-stub', style: 'left:' + (x(slotOf(s.forkPos)) - 1) + 'px;top:' +
                        (y(s.depth) + 3) + 'px'}, ['✕ ' + s.count]);
                    st.title = 'Discarded What-if: ' + s.count + ' move' + (s.count === 1 ? '' : 's') +
                        ', starting ' + s.label + '. Click to reopen.';
                    st.addEventListener('mousedown', function(e) {
                        e.preventDefault();
                        e.stopPropagation();
                    });
                    st.addEventListener('click', function(e) {
                        e.stopPropagation();
                        reopenStub(s);
                    });
                    lanes.appendChild(st);
                });

                // Floor shade (before the fork, unreachable while a branch is open).
                if (depth) {
                    lanes.appendChild(el('div', {class: 'proto-g-floor', style: 'width:' + x(slotOf(floorPos())) + 'px'}));
                }

                // Playhead.
                const phSlot = slotOf(h.position);
                const ph = el('div', {class: 'proto-g-playhead', style: 'left:' + (x(phSlot) - 1) + 'px;--c:' +
                    (depth ? branches[depth - 1].color : '#e6e9ef')}, [el('div', {class: 'proto-g-playknob'})]);
                lanes.appendChild(ph);

                // Keep the playhead in view.
                const px = x(phSlot);
                if (px < scroller.scrollLeft + 40 || px > scroller.scrollLeft + scroller.clientWidth - 40) {
                    scroller.scrollLeft = Math.max(0, px - scroller.clientWidth / 2);
                }

                const doneMoves = moves.filter(function(m) {
                    return m.to <= h.position;
                }).length;
                stepText.textContent = 'Move ' + doneMoves + ' / ' + moves.length;
                stepText.title = h.position + ' / ' + h.length + ' engine steps';
                branchText.style.setProperty('--bcol', depth ? branches[depth - 1].color : '');
                branchText.textContent = depth ? 'What-if ' + depth + ' · ' + movesSince(floorPos()) + ' in' : '';
                emptyHint.hidden = h.length > 0 || stubs.length > 0;
                undoBtn.disabled = h.position <= floorPos();
                redoBtn.disabled = h.position >= h.length;
                whatIfBtn.disabled = depth >= MAX_DEPTH;
                whatIfBtn.textContent = depth ? 'Nest…' : 'What if…';
                whatIfBtn.title = depth ? 'Start a What-if inside this one' :
                    'Start a branch here: try something, then Keep it or Discard it in one click';
            }

            // ---- Scrubbing ----------------------------------------------------------------------------------------
            /** The move boundary (history position) nearest a strip x. */
            function posAt(clientX) {
                const r = lanes.getBoundingClientRect();
                const slot = Math.max(0, Math.min(moves.length, Math.round((clientX - r.left - 12) / tickW)));
                return slot === 0 ? 0 : moves[slot - 1].to;
            }
            let scrubbing = false;
            let scrubTarget = null;
            let scrubQueued = false;
            function scrubTo(n) {
                const h = B.history();
                const lo = floorPos();
                if (n < lo && h.position <= lo && branches.length) {
                    flash('Before the fork. Keep or Discard the What-if first.');
                }
                n = Math.max(lo, Math.min(h.length, n));
                scrubTarget = n;
                if (!scrubQueued) {
                    scrubQueued = true;
                    requestAnimationFrame(function() {
                        scrubQueued = false;
                        if (scrubTarget !== null && scrubTarget !== B.history().position) {
                            B.jumpTo(scrubTarget);
                        }
                    });
                }
            }
            lanes.addEventListener('pointerdown', function(e) {
                if (e.button !== 0) {
                    return;
                }
                const t = e.target;
                if (t.closest('.proto-g-stub')) {
                    return; // the stub's own click reopens it
                }
                e.preventDefault();
                if (t.__parked) {
                    flash('Parked: these undone moves come back if you Discard the What-if.');
                    return;
                }
                scrubbing = true;
                lanes.setPointerCapture(e.pointerId);
                scrubTo(posAt(e.clientX));
            });
            lanes.addEventListener('pointermove', function(e) {
                if (scrubbing) {
                    scrubTo(posAt(e.clientX));
                    return;
                }
                showTip(e);
            });
            lanes.addEventListener('pointerup', function(e) {
                scrubbing = false;
                lanes.releasePointerCapture(e.pointerId);
            });
            lanes.addEventListener('pointerleave', function() {
                tickTip.hidden = true;
                if (hoverKeys) {
                    hoverKeys = null;
                    renderOverlay();
                }
            });
            scroller.addEventListener('wheel', function(e) {
                // Wheel scrubs: one notch = one move.
                e.preventDefault();
                if ((e.deltaY || e.deltaX) > 0) {
                    redoMove();
                } else {
                    undoMove();
                }
            }, {passive: false});

            /** Tooltip, and the hovered move's marks outlined on the board. */
            function showTip(e) {
                const r = lanes.getBoundingClientRect();
                const slot = Math.floor((e.clientX - r.left - 12) / tickW);
                let m = e.target.__move;
                if (!m && slot >= 0 && slot < moves.length) {
                    m = moves[slot];
                }
                if (!m) {
                    tickTip.hidden = true;
                    if (hoverKeys) {
                        hoverKeys = null;
                        renderOverlay();
                    }
                    return;
                }
                const which = e.target.__parked ? 'parked' : 'move ' + (moves.indexOf(m) + 1) +
                    (m.to <= B.history().position ? '' : ' (undone)');
                tickTip.textContent = which + ': ' + moveLabel(m);
                tickTip.hidden = false;
                const sr = strip.getBoundingClientRect();
                tickTip.style.left = Math.min(sr.width - 260, Math.max(8, e.clientX - sr.left - 20)) + 'px';
                const keys = [];
                m.steps.forEach(function(s) {
                    Array.prototype.push.apply(keys, s.keys);
                });
                hoverKeys = keys;
                renderOverlay();
            }

            // ==== Branch banner =====================================================================================
            function renderBranch() {
                const depth = branches.length;
                app.classList.toggle('is-branch', depth > 0);
                if (!depth) {
                    branchBanner.hidden = true;
                    boardCard.style.removeProperty('--bc');
                    return;
                }
                const b = branches[depth - 1];
                boardCard.style.setProperty('--bc', b.color);
                branchBanner.style.setProperty('--bc', b.color);
                branchBanner.hidden = false;
                branchBanner.textContent = '';
                const tag = el('span', {class: 'proto-g-banner-tag'}, ['What if' + (depth > 1 ? ' ' + depth : '')]);
                tag.title = 'Its moves are outlined on the board' + (b.parked.length ? '; ' + b.parked.length +
                    ' undone move' + (b.parked.length === 1 ? ' is' : 's are') + ' parked until you Discard' : '');
                branchBanner.appendChild(tag);
                branchBanner.appendChild(btn('proto-g-keep', 'Keep', keepBranch,
                    'Keep these moves: they become the ' + (depth > 1 ? 'outer What-if' : 'main line') +
                    (b.parked.length ? ' (the parked undone moves are dropped)' : '')));
                branchBanner.appendChild(btn('proto-g-discard', 'Discard', discardBranch,
                    'Throw these moves away: back to the fork exactly as it was'));
            }

            // ==== Answer check ======================================================================================
            const wants = (B.answerCheckInfo() || '').replace(/<br\s*\/?>/gi, '\n').replace(/<[^>]+>/g, ' ')
                .replace(/[ \t]+/g, ' ').trim();
            checkBtn.title = wants ? 'Check the answer.\n' + wants : 'This puzzle has no answer check';
            let checkPos = -1;
            function runCheck() {
                const r = B.check();
                checkPos = B.history().position;
                const kind = !r.hasAnswerCheck ? 'none' : r.solved ? 'solved' : 'wrong';
                checkChip.className = 'proto-g-check is-' + kind;
                checkChip.textContent = {solved: 'Solved', wrong: 'Not yet', none: 'No answer check'}[kind] +
                    (branches.length && kind === 'solved' ? ' (in a What-if: Keep it)' : '');
                checkChip.title = kind === 'wrong' ? wants : '';
            }

            // ==== Render on change ==================================================================================
            let lastModeKey = '';
            function render() {
                const m = B.getMode();
                if (!routed) {
                    const key = m.mode + '|' + m.submode + '|' + m.style + '|' + app.classList.contains('show-modes');
                    if (key !== lastModeKey) {
                        lastModeKey = key;
                        Object.keys(modeButtons).forEach(function(k) {
                            modeButtons[k].classList.toggle('is-on', k === m.mode);
                        });
                        renderTools(m);
                    }
                }
                const st = B.getState();
                timerText.textContent = st.timer.text;
                if (checkPos !== -1 && B.history().position !== checkPos) {
                    checkPos = -1;
                    checkChip.className = 'proto-g-check';
                    checkChip.textContent = '';
                }
                if (st.solved && checkPos === -1) {
                    runCheck();
                }
                if (!gesture) {
                    syncHistory();
                }
                renderStrip();
                renderBranch();
                renderOverlay();
            }
            allModesBtn.addEventListener('click', function() {
                render();
            });

            B.onChange(function() {
                render();
            });
            B.onTimer(function(t) {
                timerText.textContent = t.text;
            });
            window.addEventListener('resize', function() {
                render();
            });
            requestAnimationFrame(function() {
                fitBoard();
                requestAnimationFrame(function() {
                    requestAnimationFrame(function() {
                        fitBoard();
                        render();
                    });
                });
            });
            render();

            // For tests and the console: the move grouping as this variant sees it.
            window.PrototypeVariantG = {
                moves: function() {
                    return buildMoves(readSteps()).map(function(m) {
                        return [m.from, m.to];
                    });
                },
                cont: function() {
                    return Array.from(cont).sort(function(a, b) {
                        return a - b;
                    });
                }
            };
        }
    };
})();
