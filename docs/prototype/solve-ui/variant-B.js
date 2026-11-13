/*
 * PROTOTYPE (throwaway, branch prototype/solve-ui): solve-UI variant B, "No modes".
 * Owned by variant B's builder: this file and variant-B.css only. See README.md for the contract.
 *
 * The idea: there is no mode bar. The gesture picks the action, and the genre picks what each gesture places:
 *   click a cell             the genre's main mark (shade, star, bulb, ship, white circle; select in number genres)
 *   right-click a cell       the genre's exclusion (dot, cross, water; black circle in Yin-Yang)
 *   double-click a cell      a third mark (undoes the two clicks first)
 *   drag through centres     line (loop genres), paint the main mark (shading genres), select (number genres)
 *   drag along grid lines    edge line (a drag that starts on a grid vertex or hugs the grid lines)
 *   click / right-click an edge   line segment / cross on that edge (loop and border genres)
 * The genre is read from the link: its answer-check settings first (what the setter checks is what the solver
 * places), then the tool the link opens on, then its genre tags. A "gesture card" beside the board shows each
 * gesture and what it places; click a card row to bind that gesture to another mark (that is where colour and
 * style choice lives: Yin-Yang's two circles, Star Battle's star vs cross, a second shade).
 * A readout under the board says how the last gesture was read ("read as: line r3c2 -> r3c5") and offers
 * one-click "meant something else" buttons (Alt+1..9) that undo it and replay the same gesture as another action.
 * Undo and redo work per gesture, not per Penpa+ history step (a 6-cell line is one undo, not five).
 *
 * The claim it tests: mode switching is friction, and gestures can be told apart well enough to drop modes.
 *
 * How it works: a transparent overlay canvas sits on the board and takes every pointer event, so Penpa+ never sees
 * the raw mouse. On release the gesture is classified. Lines, edges and edge crosses are replayed into Penpa+'s own
 * Composite tools (Line x, Edge x) with bridge.pointer(); cell marks are written straight into the answer layer
 * through pu.record / set_value with one undo group per gesture, because Penpa+'s cell tools cycle through states
 * (Black/dot: black -> dot -> empty) where this UI wants "the first cell decides: place everywhere or clear
 * everywhere". Battleship segments are re-shaped from their neighbours after every ship gesture.
 *
 * Reads and writes `pu` directly (bridge gaps, listed in the report): pu.point / pu.centerlist for geometry and
 * cell names, pu.size for gesture thresholds, pu.pu_q / pu.pu_a and record/set_value/remove_value for cell marks,
 * pu.mode[qa].combi[1] to force the green (answer) line style, pu.mode[qa] to read the tool the link opens on,
 * the legacy #sol_* checkboxes to read what the answer check compares, pu.selection to follow arrow keys.
 */
(function() {
    'use strict';

    const PATH_TAGS = ['masyu', 'slitherlink', 'yajilin', 'simpleloop', 'castlewall', 'countryroad', 'numberlink',
        'balanceloop', 'pipelink', 'loop', 'geradeweg', 'tapaloop', 'reflect', 'icebarn', 'mashu', 'path'];
    const PAINT_TAGS = ['nurikabe', 'heyawake', 'lits', 'hitori', 'kurodoko', 'norinori', 'statuepark', 'aqre',
        'tapa', 'shading', 'mochikoro', 'nurimisaki', 'canalview', 'kuromasu', 'stostone', 'cave', 'paint'];
    const VALUE_TAGS = ['classic', 'sudoku', 'killer', 'thermo', 'arrow', 'kropki', 'xv', 'sandwich', 'renban',
        'whisper', 'german whispers', 'skyscrapers', 'kakuro', 'futoshiki', 'ripple'];
    const ACCEPTED_SHADES = [1, 3, 4, 8]; // the shades the answer check counts (class_p.js get_surface_solution)

    /*
     * Cell marks this UI writes itself. `sym` is the answer-layer symbol Penpa+'s own Composite tool writes for it
     * (class_p.js re_combi_*), so the answer check sees the same data.
     */
    const MARKS = {
        shade: {label: 'shade', surface: 'shade'},
        tint: {label: 'light shade', surface: 3},
        dot: {label: 'dot', sym: [8, 'ox_B', 2]},
        white: {label: 'white circle', sym: [1, 'circle_M', 2]},
        black: {label: 'black circle', sym: [2, 'circle_M', 2]},
        star: {label: 'star', sym: [2, 'star', 2]},
        xcell: {label: 'cross', sym: [0, 'star', 2]},
        bulb: {label: 'bulb', sym: [3, 'sun_moon', 2]},
        ship: {label: 'ship', ship: true},
        water: {label: 'water', sym: [7, 'battleship_B', 2]}
    };

    const LABELS = {
        select: 'select', line: 'line', edge: 'edge line', segment: 'line segment', cross: 'edge cross', letter: 'bulb colour',
        value: 'value', corner: 'corner mark', centre: 'centre mark', clear: 'clear', erase: 'erase'
    };
    Object.keys(MARKS).forEach(function(k) {
        LABELS[k] = MARKS[k].label;
    });

    /*
     * Profiles: what each gesture slot places. `loop` says where the genre's loop lives ('line' through centres,
     * 'edge' along the grid lines, null for none); `digits` whether typing a digit means anything.
     */
    const PROFILES = {
        value: {name: 'number (sudoku-like)', loop: null, digits: true,
            slots: {click: 'select', right: 'tint', dbl: null, drag: 'select', rdrag: 'tint'}},
        region: {name: 'region (Fillomino-like)', loop: 'edge', digits: true,
            slots: {click: 'select', right: 'tint', dbl: 'dot', drag: 'select', rdrag: 'tint'}},
        loop: {name: 'loop through cells (Masyu, Yajilin)', loop: 'line', digits: false,
            slots: {click: 'dot', right: 'dot', dbl: 'shade', drag: 'line', rdrag: 'dot'}},
        edgeloop: {name: 'loop on the grid lines (Slitherlink)', loop: 'edge', digits: false,
            slots: {click: 'tint', right: 'dot', dbl: 'dot', drag: 'edge', rdrag: 'dot'}},
        paint: {name: 'shading (Nurikabe-like)', loop: 'edge', digits: false,
            slots: {click: 'shade', right: 'dot', dbl: 'dot', drag: 'shade', rdrag: 'dot'}},
        yinyang: {name: 'two colours (Yin-Yang)', loop: null, digits: false,
            slots: {click: 'white', right: 'black', dbl: 'dot', drag: 'white', rdrag: 'black'}},
        star: {name: 'stars (Star Battle)', loop: null, digits: false,
            slots: {click: 'star', right: 'xcell', dbl: 'dot', drag: 'xcell', rdrag: 'xcell'}},
        akari: {name: 'light bulbs (Akari)', loop: null, digits: false,
            slots: {click: 'bulb', right: 'dot', dbl: 'shade', drag: 'dot', rdrag: 'dot'}},
        ships: {name: 'ships (Battleships)', loop: null, digits: false,
            slots: {click: 'ship', right: 'water', dbl: 'dot', drag: 'ship', rdrag: 'water'}}
    };

    const SLOT_LABELS = {
        click: 'click', right: 'right-click', dbl: 'double-click', drag: 'drag', rdrag: 'right-drag'
    };
    const CELL_CHOICES = ['shade', 'tint', 'dot', 'white', 'black', 'star', 'xcell', 'bulb', 'ship', 'water', 'select'];
    const DRAG_CHOICES = ['line', 'edge', 'select'].concat(CELL_CHOICES.filter(function(k) {
        return k !== 'select';
    }));

    let ctx, bridge, el;
    let profileKey = 'loop';
    let profile = PROFILES.loop;
    let slots = {};
    let why = '';
    let shadeStyle = 1;
    let shadeColour;
    let valueMode = 'sudoku';
    let hasCorner = true;
    let overlay, octx, readText, readAlts, histEl, checkEl, timerEl, hintEl, cardEl, popEl;
    let gesture = null;       // the drag in progress
    let last = null;          // the last action: {g, kind, before, detail}
    let selection = [];       // cells selected through this UI
    let replaying = false;    // true while sending synthetic keys through Penpa+'s handler
    let done = [];            // gestures, for per-gesture undo: {before, after, text}
    let undone = [];
    let clicks = [];          // the last two plain clicks, to roll them back on a double-click
    let lastCells = [];       // cells of the last cell gesture, for letters typed after a click
    let group = 5000;         // undo group counter for cell marks (Penpa+'s own counters stay below 10)

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

    let typeCache = {};
    let typeCacheFor = null;

    /** Indices of the board's used points of the given types (cached until the grid changes). */
    function pointsOf(types) {
        if (typeCacheFor !== pu.point) {
            typeCache = {};
            typeCacheFor = pu.point;
        }
        const key = types.join(',');
        if (!typeCache[key]) {
            typeCache[key] = [];
            pu.point.forEach(function(p, i) {
                if (p && p.use === 1 && types.indexOf(p.type) !== -1) {
                    typeCache[key].push(i);
                }
            });
        }
        return typeCache[key];
    }

    /** Nearest used point of the given types to a page position, with its distance in px. */
    function nearest(x, y, types, skipOutside) {
        const r = canvasRect();
        const cx = x - r.left;
        const cy = y - r.top;
        let best = null;
        let min = Infinity;
        const list = pointsOf(types);
        for (let j = 0; j < list.length; j++) {
            const i = list[j];
            const p = pu.point[i];
            if (skipOutside && p.type === 0 && outside(i)) {
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

    /** The path with extra points so no two are more than a quarter cell apart (a fast flick skips cells). */
    function dense(path) {
        const out = [];
        const step = size() / 4;
        path.forEach(function(p, i) {
            if (i > 0) {
                const a = path[i - 1];
                const n = Math.floor(Math.hypot(p.x - a.x, p.y - a.y) / step);
                for (let k = 1; k < n; k++) {
                    out.push({x: a.x + (p.x - a.x) * k / n, y: a.y + (p.y - a.y) * k / n});
                }
            }
            out.push(p);
        });
        return out;
    }

    /** Cells a path passes through, in order, without repeats in a row. */
    function cellsAlong(path) {
        const out = [];
        dense(path).forEach(function(pt) {
            const c = cellAt(pt);
            if (c !== null && out[out.length - 1] !== c) {
                out.push(c);
            }
        });
        return out;
    }

    /** The two cells an edge midpoint separates, and the two grid vertices it joins. */
    function edgeEnds(e) {
        const p = pu.point[e];
        const cells = (p.neighbor || []).slice(0, 2);
        let verts = [];
        if (cells.length === 2) {
            const a = pu.point[cells[0]].surround || [];
            const b = pu.point[cells[1]].surround || [];
            verts = a.filter(function(v) {
                return b.indexOf(v) !== -1;
            });
        }
        return {cells: cells, verts: verts};
    }

    /** The edge midpoint under a page position, if the position is nearer an edge than the cell's middle. */
    function edgeAt(pt, generous) {
        const c = nearest(pt.x, pt.y, [0]);
        const ed = nearest(pt.x, pt.y, [2, 3]);
        if (ed.index === null) {
            return null;
        }
        const limit = generous ? c.dist : Math.min(c.dist, size() * 0.3);
        return ed.dist < limit ? ed.index : null;
    }

    /** "between r3c4 and r3c5", or "r1c4, outer edge" for an edge on the board's rim. */
    function edgeName(e) {
        const inside = edgeEnds(e).cells.filter(function(c) {
            return !outside(c);
        });
        return inside.length === 2 ? 'between ' + inside.map(cellName).join(' and ') :
            inside.length === 1 ? cellName(inside[0]) + ', outer edge' : 'edge ' + e;
    }

    /** Grid vertices a path passes, in order, without repeats in a row. */
    function vertsAlong(path) {
        return dense(path).map(function(p) {
            return nearest(p.x, p.y, [1]).index;
        }).filter(function(v, i, a) {
            return v !== null && a[i - 1] !== v;
        });
    }

    /** Edge midpoints between consecutive vertices of a path along the grid lines. */
    function edgesAlong(path) {
        const v = vertsAlong(path);
        const out = [];
        for (let i = 1; i < v.length; i++) {
            const a = pu.point[v[i - 1]];
            const b = pu.point[v[i]];
            if ((a.adjacent || []).indexOf(v[i]) === -1) {
                continue;
            }
            const r = canvasRect();
            const m = nearest(r.left + (a.x + b.x) / 2, r.top + (a.y + b.y) / 2, [2, 3]);
            if (m.index !== null && m.dist < size() * 0.15 && out.indexOf(m.index) === -1) {
                out.push(m.index);
            }
        }
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

    function cellsText(cells) {
        return cells.length === 1 ? cellName(cells[0]) : plural(cells.length, 'cell');
    }

    /**
     * Read a left drag: along the grid lines (edge) or through cell centres. A drag that starts on a vertex, or
     * whose samples mostly sit closer to a vertex or edge midpoint than to a centre, is an edge drag.
     */
    function readsAsEdge(path) {
        if (profile.loop === 'edge' && slots.drag === 'edge') {
            return true;
        }
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
        if (!profile.loop) {
            return startsOnVertex && frac > 0.75; // genres with no edges: ask for both cues
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

    /** What the link's answer check compares, from the legacy answer-settings checkboxes (AND and OR columns). */
    function checks(name) {
        const and = document.getElementById('sol_' + name);
        const or = document.getElementById('sol_or_' + name);
        return !!(and && and.checked) || !!(or && or.checked);
    }

    function detectProfile() {
        const tags = bridge.genreTags().map(function(t) {
            return String(t).toLowerCase();
        });
        const has = function(list) {
            return tags.some(function(t) {
                return list.indexOf(t) !== -1;
            });
        };
        const m = pu.mode[pu.mode.qa];
        const start = m.edit_mode;
        const startCombi = start === 'combi' ? m.combi[0] : '';
        const startShape = start === 'symbol' ? String(m.symbol[0]) : '';
        const modes = bridge.listModes().map(function(x) {
            return x.mode;
        });
        const tab = bridge.tabSet().join(' ');
        if (start === 'surface' && ACCEPTED_SHADES.indexOf(m.surface[1]) !== -1) {
            shadeStyle = m.surface[1];
            shadeColour = m.surface[2];
        }
        const pick = function(key, reason) {
            why = reason;
            return key;
        };
        if (pu.gridtype === 'sudoku' || has(VALUE_TAGS)) {
            return pick('value', pu.gridtype === 'sudoku' ? 'sudoku grid' : 'genre tag');
        }
        if (checks('star') || startCombi === 'star' || has(['starbattle'])) {
            return pick('star', checks('star') ? 'the answer check looks at stars' : 'opens on the Star Battle tool');
        }
        if (checks('circle') || startCombi === 'blwh' || has(['yinyang'])) {
            return pick('yinyang', checks('circle') ? 'the answer check looks at circles' : 'opens on Yin-Yang');
        }
        if (checks('akari') || startCombi === 'akari' || has(['akari'])) {
            return pick('akari', checks('akari') ? 'the answer check looks at bulbs' : 'opens on the Akari tool');
        }
        if (checks('battleship') || startCombi === 'battleship' || /^battleship/.test(startShape)) {
            return pick('ships', checks('battleship') ? 'the answer check looks at ships' : 'opens on ships');
        }
        if (checks('loopline')) {
            return pick('loop', 'the answer check looks at the loop through cells');
        }
        const edges = checks('loopedge') || checks('ignoreborder'); // ignoreborder also turns the edge check on
        if (edges && checks('surface')) {
            return pick('paint', 'the answer check looks at shading and borders');
        }
        if (edges) {
            if (modes.indexOf('number') !== -1 || modes.indexOf('sudoku') !== -1) {
                return pick('region', 'the answer check looks at borders, and the link offers digits');
            }
            return pick('edgeloop', 'the answer check looks at edges');
        }
        if (checks('number') && (/Sudoku/.test(tab) || start === 'sudoku')) {
            return pick('value', 'the answer check looks at digits');
        }
        if (checks('surface')) {
            return pick('paint', 'the answer check looks at shading');
        }
        if (has(PAINT_TAGS)) {
            return pick('paint', 'genre tag');
        }
        if (has(PATH_TAGS)) {
            return pick('loop', 'genre tag');
        }
        return pick('loop', 'no hint in the link; lines are the most common guess');
    }

    function setProfile(key) {
        profileKey = key;
        profile = PROFILES[key];
        slots = Object.assign({}, profile.slots);
        // Loop genres where the setter opens on shading (Yajilin) or the Yajilin tool: a click shades.
        if (key === 'loop' && (startMode.mode === 'surface' || startMode.combi === 'yajilin')) {
            slots.click = 'shade';
            slots.dbl = 'dot';
        }
        // Akari with shading in its check (Statue Park hybrids): a drag paints the shading.
        if (key === 'akari' && checks('surface')) {
            slots.drag = 'shade';
        }
        // Akari RGB: the check also reads R/G/B letters, so typing one colours the bulb last clicked.
        profile = Object.assign({}, profile, {letters: key === 'akari' && checks('number') ? 'RGB' : ''});
    }

    let startMode = {};

    // ---- Cell marks: written straight into the answer layer, one undo group per gesture ------------------------

    function answer() {
        return pu[pu.mode.qa];
    }

    function isShipSym(s) {
        return s && String(s[1]).indexOf('battleship') === 0 && ((s[0] >= 1 && s[0] <= 6) || s[0] === 8);
    }

    function hasMark(key, c) {
        const a = answer();
        const mk = MARKS[key];
        if (mk.surface) {
            const v = mk.surface === 'shade' ? shadeStyle : mk.surface;
            return a.surface[c] === v;
        }
        if (mk.ship) {
            return isShipSym(a.symbol[c]);
        }
        const s = a.symbol[c];
        return !!s && s[0] === mk.sym[0] && s[1] === mk.sym[1];
    }

    function hasAnyMark(c) {
        const a = answer();
        return a.surface[c] !== undefined || a.symbol[c] !== undefined;
    }

    /** A given (problem-layer) clue sits here, so no answer mark goes on it. Shading may cover given symbols. */
    function blocked(key, c) {
        const q = pu.pu_q;
        if (outside(c) || q.surface[c] === 1 || q.surface[c] === 4) {
            return true; // off the board, or a given black cell (Akari walls, Yajilin blacks)
        }
        if (q.number[c] && (q.number[c][2] === '1' || q.number[c][2] === '10')) {
            return true; // a full-size given number (small hint letters, as in Akari RGB, do not count)
        }
        const mk = MARKS[key];
        const given = q.symbol[c] && String(q.symbol[c][1]);
        if (!given || mk.surface || key === 'dot') {
            return false;
        }
        // A given of the same family: a Yin-Yang circle, a Battleships segment or water, a star, a bulb.
        const family = mk.ship || key === 'water' ? 'battleship' : String(mk.sym[1]).split('_')[0];
        return given.indexOf(family) === 0;
    }

    function withGroup(fn) {
        const saved = pu.undoredo_counter;
        group = group >= 9000 ? 5000 : group + 1;
        pu.undoredo_counter = group;
        try {
            fn();
        } finally {
            pu.undoredo_counter = saved;
        }
    }

    function clearCell(c) {
        const a = answer();
        if (a.surface[c] !== undefined) {
            pu.remove_surface(c);
        }
        if (a.symbol[c] !== undefined) {
            pu.remove_value('symbol', c);
        }
        if (a.number[c] !== undefined && profile.letters) {
            pu.remove_value('number', c);
        }
    }

    /** Place `key` on every cell, or clear it from every cell when the first cell already has it. */
    function applyMark(key, cells) {
        cells = cells.filter(function(c) {
            return !blocked(key, c);
        });
        if (!cells.length) {
            return {text: 'nothing (a given clue is there)', on: false};
        }
        const on = !hasMark(key, cells[0]);
        const mk = MARKS[key];
        withGroup(function() {
            cells.forEach(function(c) {
                if (!on) {
                    if (hasMark(key, c)) {
                        clearCell(c);
                    }
                    return;
                }
                if (hasMark(key, c)) {
                    return;
                }
                if (cells.length > 1 && hasAnyMark(c)) {
                    return; // a drag fills empty cells only: crossing out a row keeps its stars
                }
                clearCell(c);
                if (mk.surface) {
                    if (mk.surface === 'shade') {
                        pu.set_surface(c, shadeStyle, shadeColour);
                    } else {
                        pu.set_surface(c, mk.surface);
                    }
                } else if (mk.ship) {
                    pu.set_value('symbol', c, [1, 'battleship_B', 2]);
                } else {
                    pu.set_value('symbol', c, mk.sym.slice());
                }
            });
            if (mk.ship || key === 'water' || profileKey === 'ships') {
                shapeShips();
            }
        });
        pu.redraw();
        return {text: (on ? '' : 'removed from ') + cellsText(cells), on: on};
    }

    /**
     * Battleship segments take their shape from their ship neighbours: none = a one-cell ship, one = the end
     * pointing away from it, two = a middle. Square grids only; elsewhere a ship cell stays a circle.
     */
    function shapeShips() {
        const a = answer();
        const q = pu.pu_q;
        const isShip = function(c) {
            return isShipSym(a.symbol[c]) || isShipSym(q.symbol[c]);
        };
        Object.keys(a.symbol).forEach(function(k) {
            const c = parseInt(k, 10);
            if (!isShipSym(a.symbol[c])) {
                return;
            }
            let want = 1;
            if (pu.gridtype === 'square' || pu.gridtype === 'sudoku') {
                const p = pu.point[c];
                const dirs = (p.adjacent || []).filter(isShip).map(function(n) {
                    const d = pu.point[n];
                    return Math.abs(d.x - p.x) > Math.abs(d.y - p.y) ? (d.x > p.x ? 'E' : 'W') : (d.y > p.y ? 'S' : 'N');
                });
                if (dirs.length === 1) {
                    want = {E: 3, S: 4, W: 5, N: 6}[dirs[0]]; // battleship_B 3..6: the end of a ship running E/S/W/N
                } else if (dirs.length > 1) {
                    want = 2;
                }
            }
            if (a.symbol[c][0] !== want) {
                pu.set_value('symbol', c, [want, 'battleship_B', 2]);
            }
        });
    }

    // ---- Actions ------------------------------------------------------------------------------------------------

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

    /** Pick a Composite line tool with the green answer style the check looks for. */
    function lineTool(name) {
        bridge.setComposite(name);
        pu.mode[pu.mode.qa].combi[1] = 3; // bridge gap: no setter for a Composite tool's line style
    }

    function idle() {
        clearSelection();
        if (bridge.getMode().mode !== 'line') {
            bridge.setMode('line'); // a mode with no cursor of its own, so Penpa+ draws no selection box
        }
    }

    const ACTIONS = {
        select(g) {
            selection = g.add ? uniq(selection.concat(g.cells)) : g.cells.slice();
            showSelection();
            return selection.length === 1 ? cellName(selection[0]) : selection.length + ' cells';
        },
        line(g) {
            clearSelection();
            lineTool('linex');
            bridge.pointer(boardPath(g.path));
            idle();
            return cellName(g.cells[0]) + ' → ' + cellName(g.cells[g.cells.length - 1]) +
                ' (' + plural(Math.max(0, g.cells.length - 1), 'segment') + ')';
        },
        edge(g) {
            clearSelection();
            lineTool('edgex');
            const v = vertsAlong(g.path);
            bridge.pointer(v.length > 1 ? v : boardPath(g.path));
            idle();
            return 'along the grid lines, ' + plural(Math.max(0, v.length - 1), 'edge');
        },
        segment(g) {
            clearSelection();
            const ends = edgeEnds(g.edge);
            if (profile.loop === 'edge' || ends.cells.some(outside)) {
                if (ends.verts.length !== 2) {
                    return 'no edge there';
                }
                lineTool('edgex');
                bridge.pointer(ends.verts);
            } else {
                lineTool('linex');
                bridge.pointer(ends.cells);
            }
            idle();
            return edgeName(g.edge);
        },
        cross(g) {
            clearSelection();
            const layer = profile.loop === 'edge' ? 'lineE' : 'line';
            const crossed = function(e) {
                return answer()[layer][e] === 98;
            };
            let edges = g.edges || [g.edge];
            if (edges.length > 1) {
                const on = !crossed(edges[0]); // the first edge decides: cross them all, or clear them all
                edges = edges.filter(function(e) {
                    return crossed(e) !== on;
                });
            }
            lineTool(layer === 'lineE' ? 'edgex' : 'linex');
            edges.forEach(function(e) {
                bridge.pointer([e], {button: 2});
            });
            idle();
            const all = g.edges || [g.edge];
            return all.length === 1 ? edgeName(all[0]) : plural(all.length, 'edge');
        },
        letter(g) {
            // Akari RGB: the letter goes in the cell as an answer number, as the check reads it.
            const cells = g.cells.filter(function(c) {
                return !blocked('bulb', c);
            });
            const on = !(answer().number[cells[0]] && answer().number[cells[0]][0] === g.letter);
            withGroup(function() {
                cells.forEach(function(c) {
                    if (on) {
                        // Red / green / blue, in colours the check accepts; full size, drawn over the bulb.
                        pu.set_value('number', c, [g.letter, {R: 10, G: 2, B: 8}[g.letter] || 2, '1']);
                    } else if (answer().number[c]) {
                        pu.remove_value('number', c);
                    }
                });
            });
            pu.redraw();
            return (on ? g.letter + ' on ' : g.letter + ' removed from ') + cellsText(cells);
        },
        erase(g) {
            clearSelection();
            withGroup(function() {
                g.cells.forEach(clearCell);
            });
            pu.redraw();
            return cellsText(g.cells);
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
            return cellsText(selection);
        }
    };
    Object.keys(MARKS).forEach(function(k) {
        ACTIONS[k] = function(g) {
            idle();
            return applyMark(k, g.cells).text;
        };
    });

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
        return g.digit + ' in ' + cellsText(selection);
    }

    function send(key, mods) {
        replaying = true;
        try {
            bridge.sendKey(key, mods);
        } finally {
            replaying = false;
        }
    }

    /** The marks this genre uses, from its gesture slots, most used first. */
    function genreMarks() {
        return uniq(['click', 'right', 'dbl', 'drag', 'rdrag'].map(function(s) {
            return slots[s];
        }).filter(function(k) {
            return k && MARKS[k];
        }));
    }

    /** Alternatives offered for each reading, most likely first. */
    function alternatives(g, kind) {
        let alts;
        if (g.type === 'key') {
            alts = g.digit === undefined || g.letter ? [] : ['value', 'corner', 'centre'];
        } else if (g.type === 'edgeclick') {
            alts = ['segment', 'cross'];
        } else if (g.type === 'drag') {
            alts = (profile.loop === 'line' ? ['line'] : []).concat(profile.loop ? ['edge'] : [], genreMarks(),
                profile.digits ? ['select'] : [], ['erase']);
        } else {
            alts = genreMarks().concat(profile.digits ? ['select'] : [], ['erase']);
        }
        return uniq(alts).filter(function(k) {
            return k !== kind && !(k === 'corner' && !hasCorner) && !(g.type === 'drag' && k === 'line' && !g.cells.length);
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
        if (g.type !== 'key' && g.cells && g.cells.length) {
            lastCells = g.cells.slice();
        }
        const after = bridge.history().position;
        if (after !== before) {
            done.push({before: before, after: after, text: LABELS[kind] + ' ' + detail});
            undone = [];
        }
        renderReadout();
        renderState(bridge.getState());
    }

    function reinterpret(kind) {
        if (!last) {
            return;
        }
        rollbackTo(last.before);
        perform(last.g, kind, last.before);
    }

    /** Go back to history position `pos`, dropping the per-gesture undo entries above it. */
    function rollbackTo(pos) {
        bridge.jumpTo(pos);
        done = done.filter(function(d) {
            return d.after <= pos;
        });
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
        closePop();
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
        const right = g.button === 2;
        let kind;
        if (drag) {
            g.type = 'drag';
            kind = right ? rightDrag(g) : leftDrag(g);
        } else {
            const pt = g.path[0];
            const e1 = profile.loop ? edgeAt(pt, profile.loop === 'edge' && slots.drag === 'edge') : null;
            if (e1 !== null && !g.add) {
                g.type = 'edgeclick';
                g.edge = e1;
                kind = right ? 'cross' : 'segment';
            } else {
                g.type = 'click';
                g.cells = g.cells.slice(0, 1);
                if (!g.cells.length) {
                    return;
                }
                kind = right ? slots.right : (g.add && profile.digits ? 'select' : slots.click);
            }
            clicks.push({t: Date.now(), before: bridge.history().position, type: g.type,
                at: g.type === 'edgeclick' ? g.edge : g.cells[0]});
            clicks = clicks.slice(-2);
        }
        if (!kind) {
            return;
        }
        perform(g, kind);
    }

    function leftDrag(g) {
        if (readsAsEdge(g.path)) {
            return 'edge';
        }
        return slots.drag;
    }

    function rightDrag(g) {
        // A right-drag along the grid lines in a loop genre crosses out every edge it passes.
        if (profile.loop && readsAsEdge(g.path)) {
            const edges = edgesAlong(g.path);
            if (edges.length) {
                g.edges = edges;
                return 'cross';
            }
        }
        return slots.rdrag;
    }

    /** A double-click arrives after two clicks; undo both, then place the double-click mark. */
    function onDblClick(e) {
        e.preventDefault();
        const first = clicks.length === 2 && Date.now() - clicks[0].t < 900 && clicks[0].at === clicks[1].at ?
            clicks[0] : null;
        clicks = [];
        if (!first) {
            return;
        }
        const pt = pagePt(e);
        if (first.type === 'edgeclick') {
            rollbackTo(first.before);
            perform({type: 'edgeclick', button: 0, path: [pt], edge: first.at, cells: []}, 'cross', first.before);
            return;
        }
        if (!slots.dbl) {
            return;
        }
        rollbackTo(first.before);
        perform({type: 'click', button: 0, path: [pt], cells: [first.at]}, slots.dbl, first.before);
    }

    /** Before any button is down: show whether a drag here would start as an edge line. */
    function hover(e) {
        const pt = pagePt(e);
        const v = nearest(pt.x, pt.y, [1]);
        const onVertex = v.dist < size() * 0.25 && !!profile.loop;
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

    const TRAIL = {line: '#2f7bff', edge: '#e88c28', select: '#2fbf8f', cross: '#c94f4f'};

    function drawTrail() {
        clearTrail();
        if (!gesture || gesture.path.length < 2) {
            return;
        }
        const r = canvasRect();
        const drag = isDrag(gesture.path);
        if (!drag) {
            return;
        }
        const g = {path: gesture.path};
        const kind = gesture.button === 2 ? rightDrag(g) : leftDrag(g);
        const colour = TRAIL[kind] || '#7a55c9';
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
            const v = vertsAlong(gesture.path);
            polyline(v.map(function(i) {
                return pu.point[i];
            }), colour, Math.max(4, size() * 0.16));
        } else if (kind === 'cross') {
            octx.fillStyle = colour;
            (g.edges || []).forEach(function(e) {
                const p = pu.point[e];
                octx.fillRect(p.x - 5, p.y - 5, 10, 10);
            });
        } else {
            octx.fillStyle = colour;
            uniq(cellsAlong(gesture.path)).forEach(function(c) {
                const b = bridge.cellRect(c);
                octx.fillRect(b.left - r.left + 3, b.top - r.top + 3, b.width - 6, b.height - 6);
            });
        }
        octx.globalAlpha = 1;
        const end = gesture.path[gesture.path.length - 1];
        hintEl.textContent = (LABELS[kind] || kind) + '…';
        hintEl.style.left = (end.x - r.left + 14) + 'px';
        hintEl.style.top = (end.y - r.top - 22) + 'px';
        hintEl.style.display = 'block';
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
        if (profile.letters && !e.ctrlKey && !e.metaKey && !e.altKey && k.length === 1 &&
            profile.letters.indexOf(k.toUpperCase()) !== -1) {
            stop();
            const at = selection.length ? selection : lastCells;
            if (!at.length) {
                flash('Click a bulb first, then type ' + profile.letters.split('').join(', ') + '.');
                return;
            }
            perform({type: 'key', letter: k.toUpperCase(), cells: at.slice()}, 'letter');
            return;
        }
        if (d !== null && !e.ctrlKey && !e.metaKey && !e.altKey) {
            stop();
            if (!profile.digits) {
                flash('This puzzle takes no digits: click, right-click and drag place its marks.');
                return;
            }
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
            closePop();
            idle();
            if (profile.digits) {
                bridge.setMode(valueMode);
            }
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

    // ---- Readout, gesture card and side panels ------------------------------------------------------------------

    /** Undo or redo one gesture (falls back to one Penpa+ step when history moved some other way). */
    function step(forward) {
        const pos = bridge.history().position;
        let text;
        if (forward) {
            const u = undone[undone.length - 1];
            if (u && u.before === pos) {
                bridge.jumpTo(u.after);
                done.push(undone.pop());
                text = 'redone: ' + u.text;
            } else {
                bridge.redo();
                undone = [];
                text = 'redone one step';
            }
        } else {
            const d = done[done.length - 1];
            if (d && d.after === pos) {
                bridge.jumpTo(d.before);
                undone.push(done.pop());
                text = 'undone: ' + d.text;
            } else {
                bridge.undo();
                done = [];
                text = 'undone one step';
            }
        }
        last = null;
        clicks = [];
        clearSelection();
        flash(text);
        renderState(bridge.getState());
    }

    function flash(text) {
        readText.textContent = text;
        readAlts.innerHTML = '';
    }

    function chip(kind, extra) {
        return el('b', {class: 'proto-b-kind proto-b-k-' + kind + (extra ? ' ' + extra : '')}, [
            el('i', {class: 'proto-b-sw proto-b-sw-' + kind}), LABELS[kind] || kind
        ]);
    }

    function renderReadout() {
        readAlts.innerHTML = '';
        if (!last) {
            readText.innerHTML = '<span class="proto-b-muted">read as: —</span>';
            return;
        }
        readText.innerHTML = '';
        readText.appendChild(el('span', {class: 'proto-b-muted'}, ['read as: ']));
        readText.appendChild(chip(last.kind));
        readText.appendChild(document.createTextNode(' ' + last.detail));
        const alts = alternatives(last.g, last.kind);
        if (alts.length) {
            readAlts.appendChild(el('span', {class: 'proto-b-muted'}, ['meant ']));
            alts.slice(0, 9).forEach(function(kind, i) {
                readAlts.appendChild(el('button', {
                    class: 'proto-b-alt',
                    title: 'Undo it and redo the same gesture as ' + LABELS[kind] + ' (Alt+' + (i + 1) + ')',
                    onclick: function() {
                        reinterpret(kind);
                    }
                }, [el('i', {class: 'proto-b-sw proto-b-sw-' + kind}), LABELS[kind]]));
            });
        }
    }

    function renderState(state) {
        histEl.textContent = plural(done.length, 'gesture') + ' to undo · ' + plural(undone.length, 'gesture') +
            ' to redo';
        document.getElementById('proto-b-undo').disabled = !state.canUndo;
        document.getElementById('proto-b-redo').disabled = !state.canRedo;
        if (!!state.solved !== checkEl.classList.contains('proto-b-ok') && (state.solved || checkEl.textContent)) {
            runCheck(); // keep the verdict in step: Penpa+ checks on every redraw
        }
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

    /** The gesture card: each gesture and what it places here; click a row to rebind it. */
    function renderCard() {
        cardEl.innerHTML = '';
        cardEl.appendChild(el('div', {class: 'proto-b-profile'}, ['Read as ' + profile.name + ': ' + why + '.']));
        Object.keys(SLOT_LABELS).forEach(function(slot) {
            const kind = slots[slot];
            cardEl.appendChild(el('button', {
                class: 'proto-b-slot',
                title: 'Click to make ' + SLOT_LABELS[slot] + ' place something else',
                onclick: function(ev) {
                    openPop(slot, ev.currentTarget);
                }
            }, [el('span', {class: 'proto-b-slotname'}, [SLOT_LABELS[slot]]),
                kind ? chip(kind) : el('span', {class: 'proto-b-muted'}, ['nothing'])]));
        });
        const fixed = [['drag on grid lines', 'edge']];
        if (profile.loop) {
            fixed.push(['click an edge', 'segment'], ['right-click an edge', 'cross']);
        }
        if (profile.digits) {
            fixed.push(['digit', 'value'], ['Shift+digit', hasCorner ? 'corner' : 'centre']);
        }
        if (profile.letters) {
            fixed.push([profile.letters.split('').join(' / ') + ' after a click', 'letter']);
        }
        fixed.push(['Ctrl+Z / Ctrl+Y', null]);
        fixed.forEach(function(f) {
            cardEl.appendChild(el('div', {class: 'proto-b-slot proto-b-fixed'}, [
                el('span', {class: 'proto-b-slotname'}, [f[0]]),
                f[1] ? chip(f[1]) : el('span', {class: 'proto-b-muted'}, ['undo / redo a whole gesture'])]));
        });
        const other = el('select', {class: 'proto-b-genre', title: 'Read the puzzle as another genre'},
            Object.keys(PROFILES).map(function(k) {
                const o = el('option', {value: k}, [PROFILES[k].name]);
                if (k === profileKey) {
                    o.selected = true;
                }
                return o;
            }));
        other.addEventListener('change', function() {
            why = 'picked by hand';
            setProfile(other.value);
            renderCard();
            other.blur();
        });
        cardEl.appendChild(el('label', {class: 'proto-b-genrepick'}, ['wrong genre? ', other]));
    }

    function openPop(slot, anchor) {
        closePop();
        const choices = (slot === 'drag' || slot === 'rdrag' ? DRAG_CHOICES : CELL_CHOICES).filter(function(k) {
            return k !== 'select' || profile.digits || slot === 'drag';
        });
        popEl = el('div', {class: 'proto-b-pop'}, [el('div', {class: 'proto-b-muted'}, [SLOT_LABELS[slot] + ' places:'])]
            .concat(choices.map(function(k) {
                return el('button', {
                    class: 'proto-b-popitem' + (slots[slot] === k ? ' proto-b-on' : ''),
                    onclick: function() {
                        slots[slot] = k;
                        closePop();
                        renderCard();
                        flash(SLOT_LABELS[slot] + ' now places ' + LABELS[k] + '.');
                    }
                }, [el('i', {class: 'proto-b-sw proto-b-sw-' + k}), LABELS[k]]);
            })));
        document.body.appendChild(popEl);
        const r = anchor.getBoundingClientRect();
        popEl.style.left = Math.max(8, r.left - popEl.offsetWidth - 8) + 'px';
        popEl.style.top = Math.min(r.top, window.innerHeight - popEl.offsetHeight - 70) + 'px';
    }

    function closePop() {
        if (popEl) {
            popEl.remove();
            popEl = null;
        }
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
            const m0 = pu.mode[pu.mode.qa];
            startMode = {mode: m0.edit_mode, combi: m0.edit_mode === 'combi' ? m0.combi[0] : ''};
            setProfile(detectProfile());
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
            const readout = el('div', {class: 'proto-b-readout', 'aria-live': 'polite'}, [readText, readAlts]);
            const stage = el('div', {class: 'proto-b-stage'}, [boardWrap]);
            histEl = el('div', {class: 'proto-b-hist'});
            checkEl = el('div', {class: 'proto-b-verdict'});
            timerEl = el('div', {class: 'proto-b-timer'});
            cardEl = el('div', {class: 'proto-b-card'});

            const left = el('aside', {class: 'proto-b-left'}, [
                el('h1', {}, [info.title || 'Untitled puzzle']),
                el('div', {class: 'proto-b-author'}, [info.author ? 'by ' + info.author : '']),
                el('div', {class: 'proto-b-rules'}, [])
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
                checkEl,
                el('h2', {}, ['Gestures']),
                cardEl
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
            document.addEventListener('pointerdown', function(e) {
                if (popEl && !popEl.contains(e.target) && !e.target.closest('.proto-b-slot')) {
                    closePop();
                }
            });

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

            // Start with nothing selected and no Penpa+ cursor showing, so no Penpa+ mode is "current" to the eye.
            idle();
            if (profile.digits) {
                bridge.setMode(valueMode);
            }
            fitBoard(stage);
            requestAnimationFrame(function() {
                fitBoard(stage);
            });
            renderCard();
            renderState(bridge.getState());
            renderReadout();
        }
    };
})();
