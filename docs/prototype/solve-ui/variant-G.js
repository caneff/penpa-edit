/*
 * PROTOTYPE (throwaway, branch prototype/solve-ui): solve-UI variant G, "Timeline".
 * Owned by variant G's builder: this file and variant-G.css only. See README.md for the contract.
 *
 * The idea: undo as a timeline. A strip along the bottom shows every step of the solve as a tick (coloured by what it
 * placed: value, paint, path, stamp); dragging or clicking the playhead is undo/redo, and undone steps stay visible as
 * hollow ticks until a new step replaces them. A "What if" button starts a branch: the strip forks (a new lane above,
 * starting at the playhead), the board is tinted and framed in the branch's colour, and one click Keeps the branch
 * (it becomes the main line) or Discards it (the board and the history go back to the fork, including any undone steps
 * the fork had parked). A discarded branch leaves a red stub on the strip; clicking the stub reopens it. Branches nest
 * up to three deep. Modes, sub-modes, styles and a digit row live in one compact top bar.
 *
 * The claim it tests: bifurcation is a real solving technique, and today it is undo spam (or pen colour discipline);
 * a branch the UI knows about makes it one click in and one click out.
 *
 * How branches work (the bridge has no branch API, so it is all in this file):
 *   - Start: deep-copy (structuredClone) every property of pu.pu_a and pu.pu_a_col, with each Stack's __a array
 *     (command_undo, command_redo, command_replay), plus the history position, the steps not yet redone ("parked"),
 *     and a signature of the undo stack. Nothing is changed on the engine side; the branch's steps are ordinary undo
 *     steps on top of the fork.
 *   - Discard: write the copies back into pu.pu_a / pu.pu_a_col (Stack.set for the stacks) and pu.redraw(). Before
 *     that, the branch's own end state is copied the same way and kept with its stub, so it can be reopened.
 *   - Keep: forget the copy. The branch's steps are already the history; the parked steps are dropped.
 *   - Reopen a stub: jump to the fork step; if the undo stack still matches the stored signature, start a branch there
 *     and write the stub's end state back.
 *   - Undo below the fork is blocked while a branch is open: pu.undo is wrapped on the instance (Ctrl+Z, the bridge's
 *     undo() and jumpTo() all go through it).
 *
 * Bridge gaps worked around here (read `pu` / the legacy DOM directly):
 *   - Branch snapshot/restore: none; pu.pu_a, pu.pu_a_col and their Stack objects are read and written directly.
 *   - Step list: history() gives only {position, length}; the strip reads pu.pu_a.command_undo / command_redo entries
 *     ([list, key, value, qa, group]) to colour and label each step, and groups them the way undo() pops them.
 *   - Undo guard: no hook to veto an undo; pu.undo is wrapped on the instance.
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
    const BRANCH_COLORS = ['#f2b84b', '#ff7ab8', '#6fd3ff'];
    const MAX_DEPTH = 3;
    const SUBMODE_FALLBACK = {number: {'3': '1/4', '9': 'Side'}};
    const DIGITS = ['1', '2', '3', '4', '5', '6', '7', '8', '9', '0'];

    window.PrototypeVariants = window.PrototypeVariants || {};
    window.PrototypeVariants.G = {
        name: 'Timeline',

        /** @param {object} ctx see README.md, "The variant contract" */
        mount(ctx) {
            const B = ctx.bridge;
            const el = ctx.helpers.el;

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
            const modeBar = el('div', {class: 'proto-g-modes'});
            const toolBar = el('div', {class: 'proto-g-tools'});
            const timerText = el('span', {class: 'proto-g-timer'}, ['00:00']);
            const checkChip = el('span', {class: 'proto-g-check'});
            const checkBtn = btn('proto-g-act proto-g-act-check', 'Check', runCheck, 'Check the answer');
            const top = el('div', {class: 'proto-g-top'}, [
                el('div', {class: 'proto-g-toprow'}, [
                    title, modeBar,
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
                toolBar
            ]);

            const branchBanner = el('div', {class: 'proto-g-banner', hidden: ''});
            const tint = el('div', {class: 'proto-g-tint'});
            const hoverRing = el('div', {class: 'proto-g-ring', hidden: ''});
            const boardCard = el('div', {class: 'proto-g-boardcard'});
            const boardSlot = el('div', {class: 'proto-g-boardslot'}, [boardCard]);
            const stage = el('div', {class: 'proto-g-stage'}, [branchBanner, boardSlot]);

            const undoBtn = btn('proto-g-tl-btn', '◀', function() {
                B.undo();
            }, 'Undo one step (Ctrl+Z)');
            const redoBtn = btn('proto-g-tl-btn', '▶', function() {
                B.redo();
            }, 'Redo one step (Ctrl+Y)');
            const stepText = el('div', {class: 'proto-g-steptext'});
            const branchText = el('div', {class: 'proto-g-branchtext'});
            const emptyHint = el('div', {class: 'proto-g-empty'}, [
                'Every step lands here as a tick. Drag (or wheel) along the strip to rewind and replay; ' +
                'What if… starts a branch you can Keep or Discard.'
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
                el('div', {class: 'proto-g-strip-right'}, [whatIfBtn]),
                tickTip
            ]);
            const toast = el('div', {class: 'proto-g-toast', hidden: ''});

            const app = el('div', {class: 'proto-g-app'}, [top, stage, strip, toast]);
            document.body.appendChild(app);
            ctx.helpers.adoptBoard(boardCard);
            boardCard.appendChild(tint);
            boardCard.appendChild(hoverRing);
            ctx.helpers.hideLegacy();

            let toastTimer = null;
            function flash(msg) {
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
            requestAnimationFrame(function() {
                fitBoard();
                requestAnimationFrame(function() {
                    requestAnimationFrame(fitBoard);
                });
            });

            // ==== Top bar: modes and tools ==========================================================================
            const available = B.listModes();
            const modeButtons = {};
            available.forEach(function(m) {
                const b = btn('proto-g-mode', m.label, function() {
                    B.setMode(m.mode);
                }, m.label + ' mode' + (available.length > 1 ? ' (Tab cycles)' : ''));
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
                const digits = mode === 'sudoku' || mode === 'number' || mode === 'symbol';
                if (mode === 'combi') {
                    const tools = B.listComposite().map(function(c) {
                        return {value: c.name, label: c.label};
                    });
                    toolBar.appendChild(picker('Tool', tools, m.submode, B.setComposite));
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
                toolBar.appendChild(el('span', {class: 'proto-g-hint'}, [hintFor(m)]));
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
             * Every step, oldest first: [{kind, keys, value, done}]. Undo entries hold the value before the step, so
             * the value after it is the next newer entry's "before" for the same key, or the live value.
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

            function stepLabel(s) {
                const kind = KINDS[s.kind] || {label: s.kind};
                const pts = s.keys.length ? keyPoints(s.keys[0]) : [];
                let where = pts.map(cellName).filter(function(v, i, a) {
                    return a.indexOf(v) === i;
                }).join('–');
                if (s.keys.length > 1) {
                    where += ' +' + (s.keys.length - 1);
                }
                let what = kind.label;
                const v = s.value;
                if (v === undefined || v === null) {
                    what = kind.label + ' erased';
                } else if ((s.kind === 'number' || s.kind === 'numberS') && Array.isArray(v)) {
                    what = (s.kind === 'numberS' ? 'Mark ' : '') + String(v[0]).replace(/,/g, '');
                } else if (s.kind === 'symbol' && Array.isArray(v)) {
                    what = 'Shape ' + v[1];
                }
                return what + (where ? ' @ ' + where : '');
            }

            // ==== Branches ==========================================================================================
            /** Open branches, outermost first: {forkPos, snap, parked: step[], sig, color}. */
            const branches = [];
            /** Discarded branches: {forkPos, depth, count, label, endSnap, sig}. */
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
            function restore(snap) {
                restoreSide(pu.pu_a, snap.a);
                if (snap.col && pu.pu_a_col) {
                    restoreSide(pu.pu_a_col, snap.col);
                }
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
                    parked: readSteps().slice(h.position),
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
                const n = B.history().position - b.forkPos;
                flash('Kept: ' + n + ' step' + (n === 1 ? '' : 's') + ' now on the ' +
                    (branches.length ? 'outer What-if' : 'main line') + '.');
                render();
            }

            function discardBranch() {
                const b = branches[branches.length - 1];
                if (!b) {
                    return;
                }
                const h = B.history();
                const steps = readSteps().slice(b.forkPos, h.position);
                if (steps.length) {
                    stubs.push({
                        forkPos: b.forkPos,
                        depth: branches.length,
                        count: steps.length,
                        label: stepLabel(steps[0]),
                        endSnap: snapshot(),
                        sig: b.sig
                    });
                }
                branches.pop();
                restore(b.snap);
                flash('Discarded: back to step ' + b.forkPos + '.');
                render();
            }

            function reopenStub(stub) {
                if (branches.length + 1 !== stub.depth) {
                    flash('That dead end grew from ' + (stub.depth === 1 ? 'the main line' : 'a What-if that is closed') + '.');
                    return;
                }
                B.jumpTo(stub.forkPos);
                if (B.history().position !== stub.forkPos || undoSig() !== stub.sig) {
                    flash('The steps before that fork have changed; it cannot be reopened.');
                    return;
                }
                startBranch();
                restore(stub.endSnap);
                stubs.splice(stubs.indexOf(stub), 1);
                flash('Reopened: ' + stub.count + ' step' + (stub.count === 1 ? '' : 's') + ' from step ' + stub.forkPos + '.');
                render();
            }

            /** Lowest history position the playhead may reach: the innermost fork. */
            function floorPos() {
                return branches.length ? branches[branches.length - 1].forkPos : 0;
            }

            // Undo below an open fork would rewrite history the branch was built on: block it, whatever asks.
            const rawUndo = pu.undo;
            pu.undo = function() {
                if (branches.length && B.history().position <= floorPos()) {
                    flash('That is the fork. Keep or Discard the What-if to go further back.');
                    return;
                }
                return rawUndo.apply(this, arguments);
            };

            // ==== Strip rendering ===================================================================================
            const LANE_H = 24;
            let tickW = 14;
            let steps = [];
            let laneSegs = [];

            function laneOf(pos) {
                // Step at 1-based position pos lives on the lane whose fork is before it.
                let lane = 0;
                branches.forEach(function(b, i) {
                    if (pos > b.forkPos) {
                        lane = i + 1;
                    }
                });
                return lane;
            }

            function renderStrip() {
                steps = readSteps();
                const h = B.history();
                const depth = branches.length;
                let parkedMax = 0;
                branches.forEach(function(b) {
                    parkedMax = Math.max(parkedMax, b.forkPos + b.parked.length);
                });
                stubs.forEach(function(s) {
                    parkedMax = Math.max(parkedMax, s.forkPos + 3);
                });
                const total = Math.max(steps.length, parkedMax) + 2;
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
                laneSegs = [];

                function y(lane) {
                    return (laneCount - 1 - lane) * LANE_H + 4;
                }
                function x(pos) {
                    return 12 + pos * tickW;
                }

                // Lane rails.
                for (let lane = 0; lane <= depth; lane++) {
                    const from = lane === 0 ? 0 : branches[lane - 1].forkPos;
                    const to = lane === depth ? steps.length : branches[lane].forkPos +
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

                // Active ticks.
                steps.forEach(function(s, i) {
                    const pos = i + 1;
                    const lane = laneOf(pos);
                    const fam = (KINDS[s.kind] || {fam: 'move'}).fam;
                    const t = el('div', {class: 'proto-g-tick' + (s.done ? '' : ' is-future'), style: 'left:' + (x(i) + 1) +
                        'px;top:' + (y(lane) + 5) + 'px;--c:' + FAM_COLORS[fam]});
                    t.dataset.pos = String(pos);
                    t.__step = s;
                    lanes.appendChild(t);
                });

                // Parked ticks (a fork's undone future on the parent lane).
                branches.forEach(function(b, i) {
                    b.parked.forEach(function(s, j) {
                        const fam = (KINDS[s.kind] || {fam: 'move'}).fam;
                        const t = el('div', {class: 'proto-g-tick is-parked', style: 'left:' + (x(b.forkPos + j) + 1) +
                            'px;top:' + (y(i) + 5) + 'px;--c:' + FAM_COLORS[fam]});
                        t.__step = s;
                        t.__parked = true;
                        lanes.appendChild(t);
                    });
                });

                // Dead-end stubs.
                stubs.forEach(function(s) {
                    const st = el('div', {class: 'proto-g-stub', style: 'left:' + (x(s.forkPos) - 1) + 'px;top:' +
                        (y(s.depth) + 3) + 'px'}, ['✕ ' + s.count]);
                    st.title = 'Discarded What-if from step ' + s.forkPos + ': ' + s.count + ' step' +
                        (s.count === 1 ? '' : 's') + ', starting ' + s.label + '. Click to reopen.';
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
                    lanes.appendChild(el('div', {class: 'proto-g-floor', style: 'width:' + x(floorPos()) + 'px'}));
                }

                // Playhead.
                const ph = el('div', {class: 'proto-g-playhead', style: 'left:' + (x(h.position) - 1) + 'px;--c:' +
                    (depth ? branches[depth - 1].color : '#e6e9ef')}, [el('div', {class: 'proto-g-playknob'})]);
                lanes.appendChild(ph);

                // Keep the playhead in view.
                const px = x(h.position);
                if (px < scroller.scrollLeft + 40 || px > scroller.scrollLeft + scroller.clientWidth - 40) {
                    scroller.scrollLeft = Math.max(0, px - scroller.clientWidth / 2);
                }

                stepText.textContent = 'Step ' + h.position + ' / ' + h.length;
                branchText.style.setProperty('--bcol', depth ? branches[depth - 1].color : '');
                branchText.textContent = depth ? 'What-if ' + depth + ' · ' + (h.position - floorPos()) + ' in' : '';
                emptyHint.hidden = h.length > 0 || stubs.length > 0;
                undoBtn.disabled = h.position <= floorPos();
                redoBtn.disabled = h.position >= h.length;
                whatIfBtn.disabled = depth >= MAX_DEPTH;
                whatIfBtn.textContent = depth ? 'What if… (nest)' : 'What if…';
            }

            // ---- Scrubbing ----------------------------------------------------------------------------------------
            function posAt(clientX) {
                const r = lanes.getBoundingClientRect();
                return Math.round((clientX - r.left - 12) / tickW);
            }
            let scrubbing = false;
            let scrubTarget = null;
            let scrubQueued = false;
            function scrubTo(n) {
                const h = B.history();
                const lo = floorPos();
                if (n < lo && h.position <= lo) {
                    flash(branches.length ? 'Before the fork. Keep or Discard the What-if first.' : '');
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
                    flash('Parked: these undone steps come back if you Discard the What-if.');
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
                hoverRing.hidden = true;
            });
            scroller.addEventListener('wheel', function(e) {
                // Wheel scrubs: one notch = one step.
                e.preventDefault();
                const d = (e.deltaY || e.deltaX) > 0 ? 1 : -1;
                scrubTo(B.history().position + d);
            }, {passive: false});

            /** Tooltip and board ring for the tick under the pointer. */
            function showTip(e) {
                const pos = posAt(e.clientX + tickW / 2);
                let s = e.target.__step;
                if (!s && pos >= 1 && pos <= steps.length) {
                    s = steps[pos - 1];
                }
                if (!s) {
                    tickTip.hidden = true;
                    hoverRing.hidden = true;
                    return;
                }
                const which = e.target.__parked ? 'parked' : 'step ' + pos + (s.done ? '' : ' (undone)');
                tickTip.textContent = which + ': ' + stepLabel(s);
                tickTip.hidden = false;
                const sr = strip.getBoundingClientRect();
                tickTip.style.left = Math.min(sr.width - 260, Math.max(8, e.clientX - sr.left - 20)) + 'px';
                const pts = s.keys.length ? keyPoints(s.keys[0]) : [];
                if (pts.length) {
                    const cell = nearestCell(pts[0]);
                    const cr = B.cellRect(cell);
                    const br = boardCard.getBoundingClientRect();
                    hoverRing.style.left = (cr.left - window.scrollX - br.left - 3) + 'px';
                    hoverRing.style.top = (cr.top - window.scrollY - br.top - 3) + 'px';
                    hoverRing.style.width = (cr.width + 6) + 'px';
                    hoverRing.style.height = (cr.height + 6) + 'px';
                    hoverRing.hidden = false;
                } else {
                    hoverRing.hidden = true;
                }
            }

            // ==== Branch banner and tint ============================================================================
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
                const n = B.history().position - b.forkPos;
                branchBanner.appendChild(el('span', {class: 'proto-g-banner-tag'}, ['What if ' + (depth > 1 ? depth : '')]));
                branchBanner.appendChild(el('span', {class: 'proto-g-banner-text'}, [
                    'from step ' + b.forkPos + ' · ' + n + ' step' + (n === 1 ? '' : 's') + ' in' +
                    (b.parked.length ? ' · ' + b.parked.length + ' undone step' + (b.parked.length === 1 ? '' : 's') +
                        ' parked' : '')
                ]));
                branchBanner.appendChild(btn('proto-g-keep', 'Keep', keepBranch,
                    'Keep these steps: they become the ' + (depth > 1 ? 'outer What-if' : 'main line') +
                    (b.parked.length ? ' (the parked undone steps are dropped)' : '')));
                branchBanner.appendChild(btn('proto-g-discard', 'Discard', discardBranch,
                    'Throw these steps away: back to step ' + b.forkPos + ' exactly as it was'));
            }

            // ==== Answer check ======================================================================================
            let checkPos = -1;
            function runCheck() {
                const r = B.check();
                checkPos = B.history().position;
                const kind = !r.hasAnswerCheck ? 'none' : r.solved ? 'solved' : 'wrong';
                checkChip.className = 'proto-g-check is-' + kind;
                checkChip.textContent = {solved: 'Solved', wrong: 'Not yet', none: 'No answer check'}[kind] +
                    (branches.length && kind === 'solved' ? ' (in a What-if: Keep it)' : '');
            }

            // ==== Render on change ==================================================================================
            let lastModeKey = '';
            function render() {
                const m = B.getMode();
                const key = m.mode + '|' + m.submode + '|' + m.style;
                if (key !== lastModeKey) {
                    lastModeKey = key;
                    Object.keys(modeButtons).forEach(function(k) {
                        modeButtons[k].classList.toggle('is-on', k === m.mode);
                    });
                    renderTools(m);
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
                renderStrip();
                renderBranch();
            }

            B.onChange(function() {
                render();
            });
            B.onTimer(function(t) {
                timerText.textContent = t.text;
            });
            window.addEventListener('resize', function() {
                renderStrip();
            });
            render();
        }
    };
})();
