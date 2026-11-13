/*
 * PROTOTYPE (throwaway, branch prototype/solve-ui): solve-UI variant B, "No modes".
 * Owned by variant B's builder: this file and variant-B.css only. See README.md for the contract.
 *
 * The idea: there is no mode bar. The gesture picks the action, and the genre picks the default reading:
 *   click a cell            select it (Shift/Ctrl+click adds); then a digit = value, Shift+digit = candidate
 *   drag through centres    line (Path genres), select cells (Value genres), shade (Paint genres)
 *   drag along cell edges   edge line (a drag that starts on a grid vertex or hugs the grid lines)
 *   right-click / right-drag  shade (Value genres: a light highlight)
 *   double-click            toggle a mark: a dot in a cell, a cross on an edge
 * A readout under the board says how the last gesture was read ("read as: line r3c2 -> r3c5") and offers
 * one-click "meant something else" buttons that undo it and replay the same gesture as another action.
 *
 * The claim it tests: mode switching is friction, and gestures can be told apart well enough to drop modes.
 *
 * How it works: a transparent overlay canvas sits on the board and takes every pointer event, so Penpa+ never sees
 * the raw mouse. On release the gesture is classified, then the variant switches Penpa+ to the matching mode and
 * replays the gesture with bridge.pointer(). Keys are caught in the capture phase: digits, Delete and arrows go to
 * the value mode at the selection; bare Shift/Ctrl, Tab/Enter and Z/X/C/V are swallowed, since they switch modes.
 *
 * Reads `pu` directly (bridge gaps, listed in the report): pu.point / pu.nx0 / pu.cellsoutsideFrame for cell
 * names and for skipping the outside ring, pu.size for gesture thresholds, pu.selection to follow arrow keys.
 */
(function() {
    'use strict';

    // Genre tags (pu.user_tags) by what the solver mostly does with a plain drag.
    const PATH_TAGS = ['masyu', 'slitherlink', 'yajilin', 'simpleloop', 'castlewall', 'countryroad', 'numberlink',
        'balanceloop', 'pipelink', 'loop', 'geradeweg', 'tapaloop', 'reflect', 'icebarn', 'mashu', 'path'];
    const PAINT_TAGS = ['nurikabe', 'heyawake', 'lits', 'hitori', 'kurodoko', 'norinori', 'statuepark', 'aqre',
        'tapa', 'shading', 'mochikoro', 'nurimisaki', 'canalview', 'kuromasu', 'stostone', 'cave', 'paint'];
    const VALUE_TAGS = ['classic', 'sudoku', 'killer', 'thermo', 'arrow', 'kropki', 'xv', 'sandwich', 'renban',
        'whisper', 'german whispers', 'skyscrapers', 'kakuro', 'futoshiki', 'fillomino', 'ripple'];

    const LABELS = {
        select: 'select', line: 'line', edge: 'edge line', shade: 'shade', mark: 'dot', cross: 'cross',
        value: 'value', corner: 'corner mark', centre: 'centre mark', clear: 'clear'
    };

    let ctx, bridge, el;
    let profile = 'path';
    let valueMode = 'sudoku';
    let hasCorner = true;
    let overlay, octx, readout, readText, readAlts, histEl, checkEl, timerEl, hintEl;
    let gesture = null;       // the drag in progress
    let last = null;          // the last action: {gesture, kind, before, alts}
    let selection = [];       // cells selected through this UI
    let replaying = false;    // true while sending synthetic keys through Penpa+'s handler

    // ---- Geometry -----------------------------------------------------------------------------------------------

    function size() {
        return pu.size;
    }

    function canvasRect() {
        const r = ctx.canvas.getBoundingClientRect();
        return {left: r.left + window.scrollX, top: r.top + window.scrollY, width: r.width, height: r.height};
    }

    let boardCells = null;
    let boardCellsFor = null;

    /** True for a cell off the board: pu.centerlist holds the board's cells (the outside ring is not in it). */
    function outside(i) {
        if (!pu.centerlist) {
            return (pu.cellsoutsideFrame || []).indexOf(i) !== -1;
        }
        if (boardCellsFor !== pu.centerlist) {
            boardCells = new Set(pu.centerlist);
            boardCellsFor = pu.centerlist;
        }
        return !boardCells.has(i);
    }

    /** Nearest used point of the given types to a page position, with its distance in px. */
    function nearest(x, y, types, skipOutside) {
        const r = canvasRect();
        const cx = x - r.left;
        const cy = y - r.top;
        let best = null;
        let min = Infinity;
        for (let i = 0; i < pu.point.length; i++) {
            const p = pu.point[i];
            if (!p || p.use !== 1 || types.indexOf(p.type) === -1 || (skipOutside && p.type === 0 && outside(i))) {
                continue;
            }
            const d = (cx - p.x) ** 2 + (cy - p.y) ** 2;
            if (d < min) {
                min = d;
                best = i;
            }
        }
        return {index: best, dist: Math.sqrt(min)};
    }

    function cellAt(pt) {
        const n = nearest(pt.x, pt.y, [0], true);
        return n.dist <= size() * 0.75 ? n.index : null;
    }

    /** Cells a path passes through, in order, without repeats in a row. */
    function cellsAlong(path) {
        const out = [];
        path.forEach(function(pt) {
            const c = cellAt(pt);
            if (c !== null && out[out.length - 1] !== c) {
                out.push(c);
            }
        });
        return out;
    }

    function plural(n, word) {
        return n + ' ' + word + (n === 1 ? '' : 's');
    }

    function uniq(list) {
        return list.filter(function(v, i) {
            return list.indexOf(v) === i;
        });
    }

    /** "r3c5" on square grids; "cell 41" elsewhere. */
    function cellName(i) {
        if (i === null || i === undefined) {
            return '?';
        }
        if ((pu.gridtype === 'square' || pu.gridtype === 'sudoku' || pu.gridtype === 'kakuro') && pu.nx0) {
            return 'r' + (Math.floor(i / pu.nx0) - 1) + 'c' + ((i % pu.nx0) - 1);
        }
        return 'cell ' + i;
    }

    /**
     * Read a left drag: along the grid lines (edge) or through cell centres. A drag that starts on a vertex, or
     * whose samples mostly sit closer to a vertex or edge midpoint than to a centre, is an edge drag.
     */
    function readsAsEdge(path) {
        const s = size();
        const start = nearest(path[0].x, path[0].y, [1]);
        const startCentre = nearest(path[0].x, path[0].y, [0]);
        let onLine = 0;
        path.forEach(function(pt) {
            const c = nearest(pt.x, pt.y, [0]).dist;
            const v = nearest(pt.x, pt.y, [1, 2, 3]).dist;
            if (v < c) {
                onLine++;
            }
        });
        const frac = onLine / path.length;
        const startsOnVertex = start.dist < s * 0.25 && start.dist < startCentre.dist;
        if (profile === 'value') {
            return startsOnVertex && frac > 0.75; // Value genres rarely draw edges: ask for both cues.
        }
        return startsOnVertex || frac > 0.65;
    }

    /** True once the pointer has left its first cell or travelled a third of a cell. */
    function isDrag(path) {
        const a = path[0];
        const moved = path.some(function(p) {
            return Math.hypot(p.x - a.x, p.y - a.y) > size() * 0.33;
        });
        return moved && (cellsAlong(path).length > 1 || nearest(a.x, a.y, [1]).dist < size() * 0.25 ||
            path.length > 1 && Math.hypot(path[path.length - 1].x - a.x, path[path.length - 1].y - a.y) > size() * 0.6);
    }

    // ---- Profile ------------------------------------------------------------------------------------------------

    function detectProfile() {
        const tags = bridge.genreTags().map(function(t) {
            return String(t).toLowerCase();
        });
        const tab = bridge.tabSet().join(' ');
        const has = function(list) {
            return tags.some(function(t) {
                return list.indexOf(t) !== -1;
            });
        };
        if (pu.gridtype === 'sudoku' || has(VALUE_TAGS) || /Sudoku/.test(tab)) {
            return 'value';
        }
        if (has(PAINT_TAGS)) {
            return 'paint';
        }
        if (has(PATH_TAGS)) {
            return 'path';
        }
        return 'path'; // no tags: lines are the most common unhinted drag
    }

    // ---- Actions: switch Penpa+ to the matching mode and replay the gesture -------------------------------------

    function boardPath(path) {
        const r = canvasRect();
        return path.filter(function(p) {
            return p.x >= r.left && p.y >= r.top && p.x <= r.left + r.width && p.y <= r.top + r.height;
        });
    }

    function clearSelection() {
        selection = [];
        if (pu.selection && pu.selection.length) {
            pu.selection = [];
        }
    }

    function showSelection() {
        if (bridge.getMode().mode !== valueMode) {
            bridge.setMode(valueMode);
        }
        bridge.select(selection);
    }

    const ACTIONS = {
        select(g) {
            const cells = g.cells.length ? g.cells : [];
            selection = g.add ? uniq(selection.concat(cells)) : cells.slice();
            showSelection();
            return selection.length === 1 ? cellName(selection[0]) : selection.length + ' cells';
        },
        line(g) {
            clearSelection();
            bridge.setMode('line');
            bridge.setSubmode(1);
            bridge.pointer(boardPath(g.path));
            return cellName(g.cells[0]) + ' → ' + cellName(g.cells[g.cells.length - 1]) +
                ' (' + plural(Math.max(0, g.cells.length - 1), 'segment') + ')';
        },
        edge(g) {
            clearSelection();
            bridge.setMode('lineE');
            bridge.setSubmode(1);
            bridge.pointer(boardPath(g.path));
            const v = g.path.map(function(p) {
                return nearest(p.x, p.y, [1]).index;
            }).filter(function(v, i, a) {
                return v !== null && a[i - 1] !== v;
            });
            return 'along the grid lines, ' + plural(Math.max(0, v.length - 1), 'edge');
        },
        shade(g) {
            clearSelection();
            bridge.setMode('surface');
            bridge.setStyle(profile === 'value' ? 3 : 1);
            const p = boardPath(g.path);
            bridge.pointer(p.length ? p : [g.cells[0]]);
            return g.cells.length === 1 ? cellName(g.cells[0]) : g.cells.length + ' cells';
        },
        mark(g) {
            clearSelection();
            bridge.setComposite('blpo');
            const p = boardPath(g.path);
            bridge.pointer(g.cells.length > 1 ? p : [g.cells[0]], {button: 2});
            return g.cells.length === 1 ? cellName(g.cells[0]) : g.cells.length + ' cells';
        },
        cross(g) {
            clearSelection();
            const end = g.path[g.path.length - 1];
            const e = nearest(end.x, end.y, [2, 3]).index;
            bridge.setMode('line');
            bridge.setSubmode(4);
            bridge.pointer([e]);
            bridge.setSubmode(1);
            return 'edge by ' + cellName(nearest(end.x, end.y, [0], true).index);
        },
        // Keys. g.digit is the digit; the selection is g.cells.
        value(g) {
            return typeDigit(g, 1);
        },
        corner(g) {
            return typeDigit(g, hasCorner ? 2 : 3);
        },
        centre(g) {
            return typeDigit(g, 3);
        },
        clear(g) {
            selection = g.cells.slice();
            showSelection();
            send(' '); // bridge gap: sendKey sets no keyCode, and Penpa+ reads Delete as keyCode 46 (main.js:498)
            return selection.length === 1 ? cellName(selection[0]) : selection.length + ' cells';
        }
    };

    function typeDigit(g, submode) {
        selection = g.cells.slice();
        bridge.setMode(valueMode);
        if (valueMode === 'sudoku') {
            bridge.setSubmode(submode);
        }
        bridge.select(selection);
        send(g.digit);
        if (valueMode === 'sudoku') {
            bridge.setSubmode(1);
        }
        return g.digit + ' in ' + (selection.length === 1 ? cellName(selection[0]) : selection.length + ' cells');
    }

    function send(key, mods) {
        replaying = true;
        try {
            bridge.sendKey(key, mods);
        } finally {
            replaying = false;
        }
    }

    /** Alternatives offered for each reading, most likely first. */
    function alternatives(g, kind) {
        let alts;
        if (g.type === 'key') {
            alts = g.digit === undefined ? [] : ['value', 'corner', 'centre'];
        } else if (g.type === 'dbl') {
            alts = ['mark', 'cross', 'shade'];
        } else if (g.type === 'click') {
            alts = ['select', 'shade', 'mark'];
        } else {
            alts = ['line', 'edge', 'shade', 'select', 'mark'];
        }
        return alts.filter(function(k) {
            return k !== kind && !(k === 'corner' && !hasCorner);
        });
    }

    /** Run `kind` for gesture g and record it as the last action. */
    function perform(g, kind, before) {
        const h = bridge.history();
        before = before === undefined ? h.position : before;
        let detail;
        try {
            detail = ACTIONS[kind](g);
        } catch (err) {
            console.error('[variant B] ' + kind + ' failed', err);
            detail = 'failed: ' + err.message;
        }
        last = {g: g, kind: kind, before: before, detail: detail};
        renderReadout();
    }

    function reinterpret(kind) {
        if (!last) {
            return;
        }
        bridge.jumpTo(last.before);
        perform(last.g, kind, last.before);
    }

    // ---- Pointer ------------------------------------------------------------------------------------------------

    function pagePt(e) {
        return {x: e.pageX, y: e.pageY};
    }

    function onPointerDown(e) {
        if (e.button !== 0 && e.button !== 2) {
            return;
        }
        e.preventDefault();
        overlay.setPointerCapture(e.pointerId);
        gesture = {button: e.button, path: [pagePt(e)], add: e.shiftKey || e.ctrlKey || e.metaKey};
        drawTrail();
    }

    function onPointerMove(e) {
        if (!gesture) {
            hover(e);
            return;
        }
        gesture.path.push(pagePt(e));
        drawTrail();
    }

    function onPointerUp(e) {
        if (!gesture) {
            return;
        }
        gesture.path.push(pagePt(e));
        const g = gesture;
        gesture = null;
        clearTrail();
        g.cells = cellsAlong(g.path);
        const drag = isDrag(g.path);
        let kind;
        if (g.button === 2) {
            g.type = drag ? 'drag' : 'click';
            kind = 'shade';
            if (!g.cells.length) {
                return;
            }
        } else if (!drag) {
            g.type = 'click';
            kind = 'select';
            if (!g.cells.length) {
                return;
            }
        } else {
            g.type = 'drag';
            kind = defaultDrag(g);
        }
        perform(g, kind);
    }

    function defaultDrag(g) {
        if (readsAsEdge(g.path)) {
            return 'edge';
        }
        if (profile === 'value') {
            return 'select';
        }
        if (profile === 'paint') {
            return 'shade';
        }
        return 'line';
    }

    function onDblClick(e) {
        e.preventDefault();
        const pt = pagePt(e);
        const c = nearest(pt.x, pt.y, [0], true);
        const ed = nearest(pt.x, pt.y, [2, 3]);
        const onEdge = ed.index !== null && ed.dist < c.dist && ed.dist < size() * 0.3;
        const g = {type: 'dbl', button: 0, path: [pt], cells: c.index !== null ? [c.index] : []};
        if (!onEdge && !g.cells.length) {
            return;
        }
        perform(g, onEdge ? 'cross' : 'mark');
    }

    /** Before any button is down: show whether a drag here would start as an edge line. */
    function hover(e) {
        const pt = pagePt(e);
        const v = nearest(pt.x, pt.y, [1]);
        const onVertex = v.dist < size() * 0.25 && profile !== 'value';
        overlay.classList.toggle('proto-b-onvertex', onVertex);
        clearTrail();
        if (onVertex) {
            const p = pu.point[v.index];
            octx.fillStyle = 'rgba(232, 140, 40, 0.9)';
            octx.beginPath();
            octx.arc(p.x, p.y, 4, 0, Math.PI * 2);
            octx.fill();
        }
    }

    // ---- Overlay drawing ----------------------------------------------------------------------------------------

    function syncOverlay() {
        const c = ctx.canvas;
        const w = c.offsetWidth || c.getBoundingClientRect().width;
        const h = c.offsetHeight || c.getBoundingClientRect().height;
        const host = overlay.parentNode.getBoundingClientRect();
        const r = c.getBoundingClientRect();
        overlay.style.left = (r.left - host.left) + 'px';
        overlay.style.top = (r.top - host.top) + 'px';
        overlay.style.width = w + 'px';
        overlay.style.height = h + 'px';
        if (overlay.width !== Math.round(w) || overlay.height !== Math.round(h)) {
            overlay.width = Math.round(w);
            overlay.height = Math.round(h);
        }
    }

    function clearTrail() {
        octx.clearRect(0, 0, overlay.width, overlay.height);
        if (hintEl) {
            hintEl.style.display = 'none';
        }
    }

    function drawTrail() {
        clearTrail();
        if (!gesture || gesture.path.length < 2) {
            return;
        }
        const r = canvasRect();
        const drag = isDrag(gesture.path);
        const kind = gesture.button === 2 ? 'shade' : drag ? defaultDrag(gesture) : 'select';
        const colour = {line: '#2f7bff', edge: '#e88c28', shade: '#3a3f4a', select: '#2fbf8f'}[kind] || '#888';
        // Thin raw trail, then what the gesture will do, snapped to the board.
        octx.globalAlpha = 0.35;
        polyline(gesture.path.map(function(p) {
            return {x: p.x - r.left, y: p.y - r.top};
        }), colour, 2);
        octx.globalAlpha = 0.6;
        if (kind === 'line') {
            polyline(cellsAlong(gesture.path).map(function(c) {
                return pu.point[c];
            }), colour, Math.max(4, size() * 0.16));
        } else if (kind === 'edge') {
            const v = gesture.path.map(function(p) {
                return nearest(p.x, p.y, [1]).index;
            }).filter(function(v, i, a) {
                return v !== null && a[i - 1] !== v;
            });
            polyline(v.map(function(i) {
                return pu.point[i];
            }), colour, Math.max(4, size() * 0.16));
        } else {
            octx.fillStyle = colour;
            uniq(cellsAlong(gesture.path)).forEach(function(c) {
                const b = bridge.cellRect(c);
                octx.fillRect(b.left - r.left + 2, b.top - r.top + 2, b.width - 4, b.height - 4);
            });
        }
        octx.globalAlpha = 1;
        const end = gesture.path[gesture.path.length - 1];
        hintEl.textContent = drag ? LABELS[kind] + '\u2026' : '';
        hintEl.style.left = (end.x - r.left + 14) + 'px';
        hintEl.style.top = (end.y - r.top - 22) + 'px';
        hintEl.style.display = drag ? 'block' : 'none';
    }

    function polyline(pts, colour, width) {
        if (pts.length < 2) {
            return;
        }
        octx.strokeStyle = colour;
        octx.lineWidth = width;
        octx.lineCap = 'round';
        octx.lineJoin = 'round';
        octx.beginPath();
        pts.forEach(function(p, i) {
            if (i === 0) {
                octx.moveTo(p.x, p.y);
            } else {
                octx.lineTo(p.x, p.y);
            }
        });
        octx.stroke();
    }

    // ---- Keys ---------------------------------------------------------------------------------------------------

    function digitOf(e) {
        const m = /^(Digit|Numpad)([0-9])$/.exec(e.code || '');
        return m ? m[2] : null;
    }

    function inField(e) {
        const t = e.target;
        return t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.isContentEditable) ||
            document.querySelector('.swal2-container');
    }

    function onKeyDown(e) {
        if (replaying || inField(e)) {
            return;
        }
        const k = e.key;
        const stop = function() {
            e.stopPropagation();
            e.preventDefault();
        };
        if (k === 'Shift' || k === 'Control' || k === 'Tab' || k === 'Enter' ||
            (!e.ctrlKey && !e.metaKey && !e.altKey && /^[zxcvZXCV]$/.test(k))) {
            stop(); // they switch Penpa+ modes
            return;
        }
        if ((e.ctrlKey || e.metaKey) && /^[zZyY]$/.test(k)) {
            stop();
            step(k === 'y' || k === 'Y' || e.shiftKey);
            return;
        }
        const d = digitOf(e);
        if (d !== null && e.altKey && !e.ctrlKey && !e.metaKey) {
            stop(); // Alt+n: the n-th "meant something else" button
            const kind = last && alternatives(last.g, last.kind)[parseInt(d, 10) - 1];
            if (kind) {
                reinterpret(kind);
            }
            return;
        }
        if (d !== null && !e.ctrlKey && !e.metaKey && !e.altKey) {
            stop();
            if (!selection.length) {
                flash('Click a cell first, then type.');
                return;
            }
            perform({type: 'key', digit: d, cells: selection.slice()}, e.shiftKey ? 'corner' : 'value');
            return;
        }
        if ((k === 'Delete' || k === 'Backspace' || k === ' ') && selection.length) {
            stop();
            perform({type: 'key', cells: selection.slice()}, 'clear');
            return;
        }
        if (/^Arrow/.test(k) && selection.length) {
            stop();
            showSelection();
            send(k, {shift: e.shiftKey});
            selection = (pu.selection && pu.selection.length) ? pu.selection.slice() : [pu.cursol];
            return;
        }
        if (k === 'Escape') {
            clearSelection();
        }
    }

    function onKeyUp(e) {
        if (replaying || inField(e)) {
            return;
        }
        if (e.key === 'Shift' || e.key === 'Control' || e.key === 'Tab' || e.key === 'Enter') {
            e.stopPropagation();
        }
    }

    // ---- Readout and side panels --------------------------------------------------------------------------------

    /** Undo or redo one step; the readout then offers no reinterpretation (the last gesture is gone). */
    function step(forward) {
        if (forward) {
            bridge.redo();
        } else {
            bridge.undo();
        }
        last = null;
        clearSelection();
        const h = bridge.history();
        flash((forward ? 'redone' : 'undone') + ': now at step ' + h.position + ' of ' + h.length);
    }

    function flash(text) {
        readText.textContent = text;
        readAlts.innerHTML = '';
    }

    function renderReadout() {
        readAlts.innerHTML = '';
        if (!last) {
            readText.innerHTML = '<span class="proto-b-muted">read as: —</span>';
            return;
        }
        readText.innerHTML = '';
        readText.appendChild(el('span', {class: 'proto-b-muted'}, ['read as: ']));
        readText.appendChild(el('b', {class: 'proto-b-kind proto-b-k-' + last.kind}, [LABELS[last.kind]]));
        readText.appendChild(document.createTextNode(' ' + last.detail));
        const alts = alternatives(last.g, last.kind);
        if (alts.length) {
            readAlts.appendChild(el('span', {class: 'proto-b-muted'}, ['meant ']));
            alts.forEach(function(kind, i) {
                readAlts.appendChild(el('button', {
                    class: 'proto-b-alt',
                    title: 'Undo it and redo the same gesture as ' + LABELS[kind] + ' (Alt+' + (i + 1) + ')',
                    onclick: function() {
                        reinterpret(kind);
                    }
                }, [LABELS[kind]]));
            });
        }
    }

    function renderState(state) {
        const h = bridge.history();
        histEl.textContent = 'step ' + h.position + ' / ' + h.length;
        document.getElementById('proto-b-undo').disabled = !state.canUndo;
        document.getElementById('proto-b-redo').disabled = !state.canRedo;
    }

    function runCheck() {
        const v = bridge.check();
        checkEl.className = 'proto-b-verdict';
        if (!v.hasAnswerCheck) {
            checkEl.textContent = 'This link has no answer check.';
        } else if (v.solved) {
            checkEl.textContent = 'Solved. Matches the setter’s answer.';
            checkEl.classList.add('proto-b-ok');
        } else {
            checkEl.textContent = 'Not solved yet.';
            checkEl.classList.add('proto-b-no');
        }
    }

    function legend() {
        const rows = [
            ['click', 'select a cell (Shift/Ctrl: add)'],
            ['digit', 'value'],
            ['Shift+digit', hasCorner ? 'corner candidate' : 'centre candidate'],
            ['drag', profile === 'value' ? 'select cells' : profile === 'paint' ? 'shade cells' : 'line through centres'],
            ['drag from a corner', 'edge line'],
            ['right-click / drag', profile === 'value' ? 'highlight' : 'shade'],
            ['double-click', 'dot in a cell, cross on an edge'],
            ['Ctrl+Z / Ctrl+Y', 'undo / redo']
        ];
        return el('dl', {class: 'proto-b-legend'}, rows.reduce(function(acc, r) {
            acc.push(el('dt', {}, [r[0]]), el('dd', {}, [r[1]]));
            return acc;
        }, []));
    }

    function fitBoard(stage) {
        const availW = stage.clientWidth - 40;
        const availH = stage.clientHeight - 40;
        let s = UserSettings.displaysize || 38;
        for (let i = 0; i < 3; i++) {
            const r = ctx.canvas.getBoundingClientRect();
            if (!r.width || !r.height) {
                break;
            }
            const next = Math.max(12, Math.min(90, Math.floor(s * Math.min(availW / r.width, availH / r.height))));
            if (next === s) {
                break;
            }
            s = next;
            bridge.setCellSize(s);
        }
        syncOverlay();
    }

    // ---- Mount --------------------------------------------------------------------------------------------------

    window.PrototypeVariants = window.PrototypeVariants || {};
    window.PrototypeVariants.B = {
        name: 'No modes',

        /** @param {object} c see README.md, "The variant contract" */
        mount(c) {
            ctx = c;
            bridge = c.bridge;
            el = c.helpers.el;
            profile = detectProfile();
            const modes = bridge.listModes({all: true}).map(function(m) {
                return m.mode;
            });
            valueMode = modes.indexOf('sudoku') !== -1 ? 'sudoku' : 'number';
            hasCorner = bridge.listSubmodes('sudoku').some(function(s) {
                return s.value === '2';
            });
            const info = bridge.getInfo();

            overlay = el('canvas', {class: 'proto-b-overlay'});
            octx = overlay.getContext('2d');
            hintEl = el('div', {class: 'proto-b-hint'});
            const boardWrap = el('div', {class: 'proto-b-boardwrap'});
            readText = el('span', {class: 'proto-b-readtext'});
            readAlts = el('span', {class: 'proto-b-alts'});
            readout = el('div', {class: 'proto-b-readout', 'aria-live': 'polite'}, [readText, readAlts]);
            const stage = el('div', {class: 'proto-b-stage'}, [boardWrap]);
            histEl = el('div', {class: 'proto-b-hist'});
            checkEl = el('div', {class: 'proto-b-verdict'});
            timerEl = el('div', {class: 'proto-b-timer'});

            const left = el('aside', {class: 'proto-b-left'}, [
                el('h1', {}, [info.title || 'Untitled puzzle']),
                el('div', {class: 'proto-b-author'}, [info.author ? 'by ' + info.author : '']),
                el('div', {class: 'proto-b-rules'}, []),
                el('h2', {}, ['Gestures']),
                el('div', {class: 'proto-b-profile'}, ['read as a ' + profile + ' puzzle' +
                    (bridge.genreTags().length ? ' (' + bridge.genreTags().join(', ') + ')' : ' (no genre tag)')]),
                legend()
            ]);
            left.querySelector('.proto-b-rules').innerHTML = info.rules;

            const right = el('aside', {class: 'proto-b-right'}, [
                timerEl,
                el('div', {class: 'proto-b-row'}, [
                    el('button', {id: 'proto-b-undo', class: 'proto-b-btn', title: 'Ctrl+Z', onclick: function() {
                        step(false);
                    }}, ['↶ Undo']),
                    el('button', {id: 'proto-b-redo', class: 'proto-b-btn', title: 'Ctrl+Y', onclick: function() {
                        step(true);
                    }}, ['Redo ↷'])
                ]),
                histEl,
                el('button', {id: 'proto-b-check', class: 'proto-b-btn proto-b-wide', onclick: runCheck}, ['Check answer']),
                checkEl
            ]);

            const centre = el('main', {class: 'proto-b-centre'}, [stage, readout]);
            const root = el('div', {id: 'proto-b-root', class: 'proto-b-root'}, [left, centre, right]);
            document.body.appendChild(root);

            c.helpers.adoptBoard(boardWrap);
            boardWrap.appendChild(overlay);
            boardWrap.appendChild(hintEl);
            c.helpers.hideLegacy();

            overlay.addEventListener('pointerdown', onPointerDown);
            overlay.addEventListener('pointermove', onPointerMove);
            overlay.addEventListener('pointerup', onPointerUp);
            overlay.addEventListener('pointercancel', function() {
                gesture = null;
                clearTrail();
            });
            overlay.addEventListener('pointerleave', function() {
                if (!gesture) {
                    clearTrail();
                    overlay.classList.remove('proto-b-onvertex');
                }
            });
            overlay.addEventListener('dblclick', onDblClick);
            overlay.addEventListener('contextmenu', function(e) {
                e.preventDefault();
            });
            window.addEventListener('keydown', onKeyDown, true);
            window.addEventListener('keyup', onKeyUp, true);

            bridge.onChange(function(state, reason) {
                renderState(state);
                if (reason === 'resize' || reason === 'redraw') {
                    syncOverlay();
                }
            });
            bridge.onTimer(function(t) {
                timerEl.textContent = t.text;
            });
            timerEl.textContent = bridge.getTimer().text;
            window.addEventListener('resize', function() {
                fitBoard(stage);
            });

            // Start with nothing selected and the value mode showing, so no Penpa+ mode is "current" to the eye.
            clearSelection();
            bridge.setMode(valueMode);
            fitBoard(stage);
            requestAnimationFrame(function() {
                fitBoard(stage);
            });
            renderState(bridge.getState());
            renderReadout();
        }
    };
})();
