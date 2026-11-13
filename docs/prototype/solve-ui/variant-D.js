/*
 * PROTOTYPE (throwaway, branch prototype/solve-ui): solve-UI variant D, "Radial menu".
 * Owned by variant D's builder: this file and variant-D.css only. See README.md for the contract.
 *
 * The idea: no toolbar. Hold Space, or press the middle mouse button and drag, and a two-level marking menu opens
 * at the pointer. Ring 1 holds eight roles at fixed compass points, the same on every puzzle so a flick is
 * learnable once: N Number, NE Genre (the puzzle's own object: star, bulb, ship, yin-yang circle), E Loop (lines
 * through cells), SE Colour, S Shade, SW Stamp, W Edge (lines on cell borders), NW All tools. What sits in each
 * role is chosen per puzzle from what it needs: the answer check, the genre tags, the title and rules, and the
 * modes the link shows. On a Slitherlink, W is Composite "Edge x"; on a Fillomino, W is the same but N is the
 * value tool; on a Galaxies link with no Composite, W is plain Edge. Roles the puzzle needs are lit, the rest dim,
 * roles with nothing available are blank. A straight flick always commits the role's pick for this puzzle (never
 * "last used": a flick that changes meaning is not learnable); a zig-zag picks an alternative from the role's
 * second ring, whose compass points are the same on every puzzle. Flicks done before the
 * dwell delay never draw the menu (a marking menu, Kurtenbach 1993). Press and release without moving (or a
 * middle click) leaves the menu up for clicking. The right button is left to Penpa+: every Composite tool uses it
 * for its second mark (x, dot, water). A pill in the top-left names the current tool and its mouse grammar.
 *
 * Claim tested: speed comes from muscle memory, and a radial flick is learnable.
 *
 * Bridge gaps worked around here (read pu / the legacy DOM directly):
 *  - No "what does this puzzle need" call: the answer-check text (answerCheckInfo, HTML) is parsed with regexes.
 *  - setMode restores a mode's last style, which a setter may have left non-green; the answer check wants green
 *    lines and edges, so Line / Edge items set style 3 themselves.
 *  - listComposite() lists every Composite tool even when the link hides Composite (Galaxies, the sudoku);
 *    Composite items are only offered when listModes() has 'combi'.
 *  - Number sub-modes 3 and 9 have image labels (empty text in listSubmodes).
 *  - onChange does not fire when setComposite / setShape switches tool inside Composite / Shape; the pill is
 *    refreshed by hand after every pick.
 *  - Composite's right-click on a cell centre in Line x does nothing, so Masyu has no cell-exclusion mark in its
 *    Loop pick; the Loop ring's S slot (Yajilin: line + right-click dot) or the Shade flick (Black/dot) give one.
 *  - No Shape list call: the Stamp ring names a few legacy shape ids (circle_L, square_L, ox_B, ...).
 */
(function() {
    'use strict';

    // ---- Geometry and timing (px, ms) -------------------------------------------------------------------------
    const R_DEAD = 12;       // release inside this = no stroke (tap / sticky menu)
    const R_ROLE = 30;       // stroke must leave this radius to pick a role
    const R_SUB = 28;        // second segment must be this long to pick a ring-2 tool
    const CORNER_EXCESS = 10;
    const RING1_R = 110;     // where ring-1 bubbles are drawn
    const RING2_R = 104;
    const RING2_OPEN = 134;  // visible menu: crossing this distance opens ring 2 at the pointer
    const DWELL_MS = 260;    // pause this long and the menu shows

    const COMPASS = ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW'];
    const ARROW = ['↑', '↗', '→', '↘', '↓', '↙', '←', '↖'];

    // ---- Tool catalogue ---------------------------------------------------------------------------------------
    // `how` is the tool's mouse grammar, shown in the pill (Penpa+ README § Composite, research/penpa-mode-key-map.md).
    const T = {
        sudoku1: {label: 'Digit', sub: 'Sudoku', mode: 'sudoku', submode: 1, how: 'select · type 1-9'},
        sudoku3: {label: 'Centre', sub: 'pencil', mode: 'sudoku', submode: 3, how: 'select · type'},
        sudoku2: {label: 'Corner', sub: 'pencil', mode: 'sudoku', submode: 2, how: 'select · type'},
        number1: {label: 'Number', sub: 'Normal', mode: 'number', submode: 1, how: 'click cell · type'},
        number7: {label: 'Candidates', sub: 'Number', mode: 'number', submode: 7, how: 'click cell · type'},
        number5: {label: 'Small', sub: 'Number S', mode: 'number', submode: 5, how: 'click cell · type'},
        number8: {label: 'Long', sub: 'Number', mode: 'number', submode: 8, how: 'click cell · type'},

        blwh: {label: 'Yin-Yang', sub: '○ ●', combi: 'blwh', how: 'click ○, again ● · right ●'},
        star: {label: 'Star', sub: '★ ×', combi: 'star', how: 'click ★ · right × · right on edge: dot'},
        akari: {label: 'Bulb', sub: 'Akari', combi: 'akari', how: 'click bulb · right dot / ×'},
        battleship: {label: 'Ships', sub: 'Battleship', combi: 'battleship', how: 'click cycles ● ■ · drag: ship end · right: water'},
        tents: {label: 'Tents', combi: 'tents', how: 'click tent · drag line · right ×'},
        mines: {label: 'Mines', combi: 'mines', how: 'click mine · right ×'},
        doublemines: {label: '2 Mines', combi: 'doublemines', how: 'click 1, 2 mines · right ×'},
        magnets: {label: 'Magnets', combi: 'magnets', how: 'click + − ■'},

        linex: {label: 'Loop', sub: 'line + ×', combi: 'linex', how: 'drag: line · right: × on edge, dot in cell'},
        yajilin: {label: 'Yajilin', sub: '■ + loop', combi: 'yajilin', how: 'click ■ · drag: line · right: dot / ×'},
        lineox: {label: 'Line OX', combi: 'lineox', how: 'click ○, again × · drag: line'},
        linedir: {label: 'Line <>', sub: 'directed', combi: 'linedir', how: 'drag: line · right on edge: × < >'},
        line1: {label: 'Line', sub: 'plain', mode: 'line', submode: 1, style: 3, how: 'drag: line'},
        line4: {label: 'Line ×', sub: 'helper', mode: 'line', submode: 4, how: 'click edge: ×'},
        line3: {label: 'Line', sub: 'free', mode: 'line', submode: 3, style: 3, how: 'drag: line'},
        hashi: {label: 'Hashi', combi: 'hashi', how: 'drag: bridge, again: double'},

        edgex: {label: 'Edge', sub: 'edge + ×', combi: 'edgex', how: 'drag: edge · right: ×'},
        lineE1: {label: 'Edge', sub: 'plain', mode: 'lineE', submode: 1, style: 3, how: 'drag: edge'},
        lineE4: {label: 'Edge ×', sub: 'helper', mode: 'lineE', submode: 4, how: 'click edge: ×'},
        edgexoi: {label: 'Edge IO', sub: 'in / out', combi: 'edgexoi', how: 'drag: edge · right ×'},
        wall: {label: 'Wall', mode: 'wall', how: 'drag: wall'},
        edgesub: {label: 'Edge aux', combi: 'edgesub', how: 'drag'},

        blpo: {label: 'Shade', sub: '■ + dot', combi: 'blpo', how: 'click ■, again dot · right dot'},
        surf1: {label: 'Dark grey', mode: 'surface', style: 1, swatch: '#444', how: 'click / drag · right: 2nd colour'},
        surf8: {label: 'Grey', mode: 'surface', style: 8, swatch: '#999', how: 'click / drag · right: 2nd colour'},
        surf3: {label: 'Light grey', mode: 'surface', style: 3, swatch: '#ccc', how: 'click / drag · right: 2nd colour'},
        surf4: {label: 'Black', mode: 'surface', style: 4, swatch: '#000', how: 'click / drag · right: 2nd colour'},
        shaka: {label: 'Shakashaka', combi: 'shaka', how: 'pull: triangle · click dot'},

        multi: {label: 'Multicolor', sub: 'select + 1-9', mode: 'multicolor', how: 'select · type 1-9'},
        surf7: {label: 'Yellow', mode: 'surface', style: 7, swatch: '#ee6', how: 'click / drag'},
        surf2: {label: 'Green', mode: 'surface', style: 2, swatch: '#8c8', how: 'click / drag'},
        surf5: {label: 'Blue', mode: 'surface', style: 5, swatch: '#8bf', how: 'click / drag'},
        surf6: {label: 'Red', mode: 'surface', style: 6, swatch: '#f88', how: 'click / drag'},
        surf9: {label: 'Pink', mode: 'surface', style: 9, swatch: '#f9c', how: 'click / drag'},
        surf10: {label: 'Orange', mode: 'surface', style: 10, swatch: '#fa5', how: 'click / drag'},

        circle: {label: 'Circle', shape: 'circle_L', how: 'click cell · digit = variant'},
        square: {label: 'Square', shape: 'square_L', how: 'click cell · digit = variant'},
        ox: {label: 'O / X', shape: 'ox_B', how: 'click cycles'},
        tri: {label: 'Triangle', shape: 'triup_L', how: 'click cell'},
        thermo: {label: 'Thermo', mode: 'special', submode: 'thermo', how: 'drag'},
        arrow: {label: 'Arrow', mode: 'special', submode: 'arrows', how: 'drag'},
        cage1: {label: 'Cage', sub: 'Killer', mode: 'cage', submode: 1, how: 'drag'},
        move: {label: 'Move', mode: 'move', submode: 1, how: 'drag an item'}
    };
    Object.keys(T).forEach(function(k) {
        T[k].id = k;
    });

    /**
     * The eight roles. `slots` is ring 2, by compass point; it is the same on every puzzle (an empty or unavailable
     * slot stays blank) so a zig-zag means the same thing everywhere. The role's own pick for this puzzle comes from
     * pickFor() and is what a straight flick commits until another tool in the role is used.
     */
    const ROLES = [
        {key: 'number', label: 'Number', color: '#5aa9ff',
            slots: [T.sudoku1, T.number7, T.sudoku3, T.number8, T.number1, T.number5, T.sudoku2, null]},
        {key: 'genre', label: 'Genre', color: '#e070d0',
            slots: [T.star, T.akari, T.battleship, T.blwh, T.tents, T.mines, T.doublemines, T.magnets]},
        {key: 'loop', label: 'Loop', color: '#59d18b',
            slots: [T.linex, T.linedir, T.line1, T.line4, T.yajilin, T.line3, T.lineox, T.hashi]},
        {key: 'colour', label: 'Colour', color: '#f0c040',
            slots: [T.multi, T.surf7, T.surf2, T.surf5, T.surf6, T.surf9, T.surf10, null]},
        {key: 'shade', label: 'Shade', color: '#c0c6d0',
            slots: [T.blpo, T.surf3, T.surf8, T.surf1, T.surf4, null, T.shaka, null]},
        {key: 'stamp', label: 'Stamp', color: '#c8a0ff',
            slots: [T.circle, T.square, T.ox, T.tri, T.thermo, T.arrow, T.cage1, T.move]},
        {key: 'edge', label: 'Edge', color: '#ff9a5a',
            slots: [T.edgex, T.edgexoi, T.lineE1, T.lineE4, T.wall, T.edgesub, null, null]},
        {key: 'all', label: 'All…', color: '#a0a8b8', slots: []}
    ];
    const ALL = 7;

    let B, H;
    let root, overlay, svg, trail, pill, toastEl, hintEl, allPanel;
    let g = null;               // the gesture in progress, or the open sticky menu
    let mouse = {x: 800, y: 450};
    let kit = null;             // what this puzzle needs, from analyse()

    // ---- Small helpers ----------------------------------------------------------------------------------------
    function dist(a, b) {
        return Math.hypot(b.x - a.x, b.y - a.y);
    }
    /** Compass angle in degrees, 0 = up, clockwise. */
    function angle(a, b) {
        return (Math.atan2(b.x - a.x, a.y - b.y) * 180 / Math.PI + 360) % 360;
    }
    function sector8(deg) {
        return Math.round(deg / 45) % 8;
    }
    function dir(deg, r) {
        const rad = deg * Math.PI / 180;
        return {x: Math.sin(rad) * r, y: -Math.cos(rad) * r};
    }
    function el(tag, attrs, children) {
        return H.el(tag, attrs, children);
    }

    // ---- What this puzzle offers and needs -------------------------------------------------------------------
    /** Read the link: modes shown, answer check, genre words. Sets `kit`. */
    function analyse() {
        const modes = new Set(B.listModes().map(function(m) {
            return m.mode;
        }));
        const subs = {};
        modes.forEach(function(m) {
            subs[m] = new Set(B.listSubmodes(m).map(function(s) {
                return String(s.value);
            }));
        });
        const combis = modes.has('combi') ? B.listComposite() : [];
        const info = B.getInfo();
        const words = (B.genreTags().join(' ') + ' ' + (info.title || '') + ' ' + (info.rules || '')).toLowerCase();
        const check = (B.answerCheckInfo() || '').replace(/<[^>]+>/g, ' ');
        const pu = window.pu;
        const square = pu && (pu.gridtype === 'square' || pu.gridtype === 'sudoku' || pu.gridtype === 'kakuro');
        const need = {
            edge: /Edge must/i.test(check),
            line: /Line must/i.test(check),
            shade: /Shade cells/i.test(check),
            numbers: /Numbers must/i.test(check),
            bulbs: /Light bulbs/i.test(check) || /\bakari\b/.test(words),
            stars: /\bStars\b/.test(check) || /star ?battle/.test(words),
            ships: /Battleship/i.test(check) || /\bships?\b|battleship/.test(words),
            circles: /White and Black circles/i.test(check) || /yin.?yang/.test(words),
            yajilin: /yajilin/.test(words),
            loop: /\bloop\b/.test(words),
            fillo: /fillomino|region sizes?|size of the region/.test(words)
        };
        kit = {modes: modes, subs: subs, combis: combis, combiNames: new Set(combis.map(function(c) {
            return c.name;
        })), need: need, square: square};
        const has = function(item) {
            return item && itemEnabled(item);
        };
        const first = function() {
            for (let i = 0; i < arguments.length; i++) {
                if (has(arguments[i])) {
                    return arguments[i];
                }
            }
            return null;
        };
        // Each role's pick for this puzzle, and whether the puzzle needs the role.
        kit.pick = [
            square ? first(T.sudoku1, T.number1) : first(T.number1, T.sudoku1),
            first(need.stars && T.star, need.bulbs && T.akari, need.ships && T.battleship, need.circles && T.blwh),
            first(need.yajilin && T.yajilin, T.linex, T.line1),
            first(T.multi, T.surf7),
            first(T.blpo, T.surf8),
            first(T.circle),
            first(T.edgex, T.lineE1),
            null
        ];
        if (!kit.pick[1]) {
            kit.pick[1] = ROLES[1].slots.find(has) || null;
        }
        kit.needed = [
            need.numbers || need.fillo || pu.gridtype === 'sudoku' || (B.getMode().mode === 'sudoku' && !need.edge),
            need.stars || need.bulbs || need.ships || need.circles,
            need.line,
            false,
            need.shade && !need.ships,
            false,
            need.edge,
            false
        ];
    }
    function itemEnabled(item) {
        if (!item) {
            return false;
        }
        if (item.combi) {
            return kit.combiNames.has(item.combi);
        }
        if (item.shape) {
            return kit.modes.has('symbol');
        }
        if (!kit.modes.has(item.mode)) {
            return false;
        }
        if (item.submode != null && kit.subs[item.mode] && kit.subs[item.mode].size > 0) {
            return kit.subs[item.mode].has(String(item.submode));
        }
        return true;
    }
    function roleEnabled(ri) {
        return ri === ALL || ROLES[ri].slots.some(itemEnabled);
    }
    function roleTool(ri) {
        return kit.pick[ri] || ROLES[ri].slots.find(itemEnabled) || null;
    }
    function itemMatches(item, st) {
        if (!item) {
            return false;
        }
        if (item.combi) {
            return st.mode === 'combi' && st.submode === item.combi;
        }
        if (item.shape) {
            return st.mode === 'symbol' && st.submode === item.shape;
        }
        if (item.mode !== st.mode) {
            return false;
        }
        if (item.submode != null && String(item.submode) !== st.submode) {
            return false;
        }
        if (item.mode === 'surface' && item.style != null && item.style !== st.style) {
            return false;
        }
        return true;
    }
    function roleOf(st) {
        for (let ri = 0; ri < ALL; ri++) {
            const item = ROLES[ri].slots.find(function(it) {
                return itemMatches(it, st);
            });
            if (item) {
                return {ri: ri, item: item};
            }
        }
        return null;
    }
    function itemLabel(item) {
        return item.sub ? item.label + ' · ' + item.sub : item.label;
    }

    // ---- Applying a tool --------------------------------------------------------------------------------------
    function apply(item, ri) {
        if (item.combi) {
            B.setComposite(item.combi);
        } else if (item.shape) {
            B.setShape(item.shape);
        } else {
            B.setMode(item.mode);
            if (item.submode != null) {
                B.setSubmode(item.submode);
            }
            if (item.style != null) {
                B.setStyle(item.style);
            }
        }
        updatePill(B.getState()); // onChange misses a Composite-to-Composite or Shape-to-Shape switch
        flashPill();
        toast(itemLabel(item), ri != null ? ROLES[ri].color : '#888');
    }

    // ---- Stroke recognition (hidden menu) ---------------------------------------------------------------------
    /**
     * Recognise a stroke from its points: {role, sub} where sub is a compass slot or null.
     * A corner is the point P that maximises |OP| + |PE| - |OE| (handles side turns and reversals).
     */
    function recognize(o, pts) {
        let far = 0;
        pts.forEach(function(p) {
            far = Math.max(far, dist(o, p));
        });
        if (far < R_ROLE || pts.length === 0) {
            return {role: null, sub: null, far: far};
        }
        const e = pts[pts.length - 1];
        const oe = dist(o, e);
        let best = null;
        let bestEx = 0;
        pts.forEach(function(p) {
            const ex = dist(o, p) + dist(p, e) - oe;
            if (ex > bestEx) {
                bestEx = ex;
                best = p;
            }
        });
        if (best && bestEx > CORNER_EXCESS && dist(o, best) > R_ROLE && dist(best, e) > R_SUB) {
            return {role: sector8(angle(o, best)), sub: sector8(angle(best, e)), corner: best, far: far};
        }
        if (oe < R_ROLE) {
            // Went out and came back without a clear second segment: cancel.
            return {role: null, sub: null, far: far};
        }
        return {role: sector8(angle(o, e)), sub: null, far: far};
    }

    // ---- The visible menu ------------------------------------------------------------------------------------
    function clearOverlay() {
        overlay.querySelectorAll('.proto-d-bubble, .proto-d-hub, .proto-d-link').forEach(function(n) {
            n.remove();
        });
    }
    function bubble(pos, text, opts) {
        const b = el('div', {class: 'proto-d-bubble' + (opts.cls ? ' ' + opts.cls : '')}, []);
        if (opts.swatch) {
            b.appendChild(el('span', {class: 'proto-d-swatch', style: 'background:' + opts.swatch}, []));
        }
        b.appendChild(el('span', {class: 'proto-d-text'}, [text]));
        if (opts.subtext) {
            b.appendChild(el('span', {class: 'proto-d-subtext'}, [opts.subtext]));
        }
        b.style.left = pos.x + 'px';
        b.style.top = pos.y + 'px';
        if (opts.color) {
            b.style.setProperty('--fam', opts.color);
        }
        if (opts.onclick) {
            b.addEventListener('mousedown', function(e) {
                e.preventDefault();
                e.stopPropagation();
            });
            b.addEventListener('click', opts.onclick);
        }
        overlay.appendChild(b);
        return b;
    }
    function render() {
        clearOverlay();
        if (!g || !g.visible) {
            return;
        }
        const st = B.getMode();
        const cur = roleOf(st);
        const o = g.origin;
        const prov = provisional();
        const ri = g.c ? (g.sticky ? g.role : prov.role) : null;
        if (ri == null || !g.c) {
            // Ring 1: the eight roles around the origin; each shows the tool a straight flick commits.
            const hub = el('div', {class: 'proto-d-hub'}, []);
            hub.style.left = o.x + 'px';
            hub.style.top = o.y + 'px';
            overlay.appendChild(hub);
            ROLES.forEach(function(r, i) {
                const d = dir(i * 45, RING1_R);
                const on = roleEnabled(i);
                const tool = i === ALL ? null : roleTool(i);
                const cls = ['proto-d-ring1'];
                if (!on) {
                    cls.push('is-off');
                } else if (kit.needed[i]) {
                    cls.push('is-need');
                }
                if (prov.role === i) {
                    cls.push('is-hot');
                }
                if (cur && cur.ri === i) {
                    cls.push('is-current');
                }
                bubble({x: o.x + d.x, y: o.y + d.y}, r.label, {
                    cls: cls.join(' '), color: r.color,
                    subtext: on ? (i === ALL ? 'every tool' : (tool ? tool.label : '')) : '',
                    onclick: g.sticky && on ? function() {
                        if (i === ALL) {
                            close();
                            showAll();
                            return;
                        }
                        g.role = i;
                        g.c = {x: o.x + d.x * 1.7, y: o.y + d.y * 1.7};
                        render();
                    } : null
                });
            });
        } else {
            // Ring 2 replaces ring 1 (a hierarchical marking menu): the role's tools around the turn point.
            const r = ROLES[ri];
            const c = g.c;
            const hub2 = el('div', {class: 'proto-d-hub proto-d-hub2'}, [r.label]);
            hub2.style.left = c.x + 'px';
            hub2.style.top = c.y + 'px';
            hub2.style.setProperty('--fam', r.color);
            if (g.sticky) {
                hub2.title = 'Back to the roles';
                hub2.addEventListener('mousedown', function(e) {
                    e.preventDefault();
                    e.stopPropagation();
                });
                hub2.addEventListener('click', function() {
                    g.role = null;
                    g.c = null;
                    render();
                });
            }
            overlay.appendChild(hub2);
            const link = el('div', {class: 'proto-d-link'}, []);
            link.style.left = o.x + 'px';
            link.style.top = o.y + 'px';
            link.style.width = dist(o, c) + 'px';
            link.style.transform = 'rotate(' + (angle(o, c) - 90) + 'deg)';
            link.style.setProperty('--fam', r.color);
            overlay.appendChild(link);
            const def = roleTool(ri);
            r.slots.forEach(function(item, si) {
                if (!item) {
                    return;
                }
                const d = dir(si * 45, RING2_R);
                const on = itemEnabled(item);
                const cls = ['proto-d-ring2'];
                if (!on) {
                    cls.push('is-off');
                }
                if (prov.sub === si) {
                    cls.push('is-hot');
                }
                if (itemMatches(item, st)) {
                    cls.push('is-current');
                }
                if (item === def) {
                    cls.push('is-default');
                }
                bubble({x: c.x + d.x, y: c.y + d.y}, item.label, {
                    cls: cls.join(' '), color: r.color, swatch: item.swatch, subtext: item.sub || '',
                    onclick: g.sticky && on ? function() {
                        close();
                        apply(item, ri);
                    } : null
                });
            });
        }
    }
    /** The selection the visible menu currently shows. */
    function provisional() {
        if (!g) {
            return {role: null, sub: null};
        }
        if (g.sticky) {
            return {role: g.role != null ? g.role : null, sub: null};
        }
        const p = g.pts.length ? g.pts[g.pts.length - 1] : g.origin;
        if (!g.visible) {
            return recognize(g.origin, g.pts);
        }
        if (g.c) {
            if (dist(g.origin, p) < R_DEAD) {
                // Back at the origin: back out to ring 1.
                g.c = null;
                g.role = null;
            } else {
                return {role: g.role, sub: dist(g.c, p) > R_SUB ? sector8(angle(g.c, p)) : null};
            }
        }
        const d = dist(g.origin, p);
        if (d < R_ROLE) {
            return {role: null, sub: null};
        }
        const ri = sector8(angle(g.origin, p));
        if (d > RING2_OPEN && ri !== ALL && roleEnabled(ri)) {
            g.role = ri;
            g.c = {x: p.x, y: p.y};
        }
        return {role: ri, sub: null};
    }

    // ---- Gesture lifecycle -----------------------------------------------------------------------------------
    function start(source, x, y) {
        hideAll();
        g = {source: source, origin: {x: x, y: y}, pts: [], visible: false, sticky: false, c: null, role: null};
        trail.setAttribute('points', x + ',' + y);
        svg.classList.add('is-on');
        armDwell();
    }
    function armDwell() {
        clearTimeout(g.dwell);
        g.dwell = setTimeout(onDwell, DWELL_MS);
    }
    function onDwell() {
        if (!g || g.sticky) {
            return;
        }
        if (!g.visible) {
            const r = recognize(g.origin, g.pts);
            g.visible = true;
            overlay.classList.add('is-on');
            if (r.role != null && r.role !== ALL && roleEnabled(r.role)) {
                // Paused after a fast first flick: open ring 2 where the pointer is.
                g.role = r.role;
                g.c = g.pts.length ? g.pts[g.pts.length - 1] : g.origin;
            }
        } else if (!g.c) {
            const p = g.pts.length ? g.pts[g.pts.length - 1] : g.origin;
            const ri = dist(g.origin, p) > R_ROLE ? sector8(angle(g.origin, p)) : null;
            if (ri != null && ri !== ALL && roleEnabled(ri)) {
                g.role = ri;
                g.c = {x: p.x, y: p.y};
            }
        }
        render();
    }
    function move(x, y) {
        if (!g || g.sticky) {
            return;
        }
        const last = g.pts.length ? g.pts[g.pts.length - 1] : g.origin;
        if (dist(last, {x: x, y: y}) < 1) {
            return;
        }
        g.pts.push({x: x, y: y});
        trail.setAttribute('points', trail.getAttribute('points') + ' ' + x + ',' + y);
        if (dist(last, {x: x, y: y}) > 2) {
            armDwell();
        }
        if (g.visible) {
            render();
        }
    }
    function openSticky() {
        g.visible = true;
        g.sticky = true;
        g.role = null;
        g.c = null;
        clearTimeout(g.dwell);
        overlay.classList.add('is-on', 'is-sticky');
        svg.classList.remove('is-on');
        render();
    }
    /** Pointer / Space released. Returns 'tap' when nothing was stroked and no menu shown. */
    function end() {
        if (!g || g.sticky) {
            return null;
        }
        clearTimeout(g.dwell);
        const prov = provisional();
        const far = g.pts.reduce(function(m, p) {
            return Math.max(m, dist(g.origin, p));
        }, 0);
        const endPos = g.pts.length ? g.pts[g.pts.length - 1] : g.origin;
        if (far < R_DEAD) {
            if (g.visible || g.source === 'middle') {
                // Classic marking menu: press-and-release without moving leaves the menu up for clicking.
                openSticky();
                return 'sticky';
            }
            close();
            return 'tap';
        }
        const ri = prov.role;
        close();
        if (ri == null) {
            return 'cancel';
        }
        if (ri === ALL) {
            showAll(endPos);
            return 'commit';
        }
        if (!roleEnabled(ri)) {
            toast(ROLES[ri].label + ': nothing for this puzzle', '#888', endPos);
            return 'cancel';
        }
        if (prov.sub != null) {
            const item = ROLES[ri].slots[prov.sub];
            if (!item || !itemEnabled(item)) {
                toast(ROLES[ri].label + ' ' + COMPASS[prov.sub] + ': ' + (item ? itemLabel(item) + ' not here' : 'empty'),
                    '#888', endPos);
                return 'cancel';
            }
            apply(item, ri);
            return 'commit';
        }
        const tool = roleTool(ri);
        if (tool) {
            apply(tool, ri);
        }
        return 'commit';
    }
    function close() {
        if (g) {
            clearTimeout(g.dwell);
        }
        g = null;
        overlay.classList.remove('is-on', 'is-sticky');
        svg.classList.remove('is-on');
        clearOverlay();
    }

    // ---- "All" panel: every tool the link offers, grouped by role, then the rest of Composite ------------------
    function showAll(pos) {
        hideAll();
        pos = pos || {x: window.innerWidth / 2, y: window.innerHeight / 2};
        allPanel = el('div', {class: 'proto-d-all'}, []);
        const cur = B.getMode();
        const used = new Set();
        const addBtn = function(col, item, ri) {
            const btn = el('button', {class: 'proto-d-all-item' + (itemMatches(item, cur) ? ' is-current' : '')}, []);
            if (item.swatch) {
                btn.appendChild(el('span', {class: 'proto-d-swatch', style: 'background:' + item.swatch}, []));
            }
            btn.appendChild(document.createTextNode(itemLabel(item)));
            btn.addEventListener('mousedown', function(e) {
                e.stopPropagation();
            });
            btn.addEventListener('click', function() {
                hideAll();
                apply(item, ri);
            });
            col.appendChild(btn);
        };
        ROLES.forEach(function(r, ri) {
            if (ri === ALL) {
                return;
            }
            const items = r.slots.filter(itemEnabled);
            if (!items.length) {
                return;
            }
            const col = el('div', {class: 'proto-d-all-col'}, [
                el('div', {class: 'proto-d-all-title', style: 'color:' + r.color}, [ARROW[ri] + ' ' + r.label])
            ]);
            items.forEach(function(item) {
                used.add(item.combi || '');
                addBtn(col, item, ri);
            });
            allPanel.appendChild(col);
        });
        const rest = kit.combis.filter(function(c) {
            return !used.has(c.name);
        });
        if (rest.length) {
            const col = el('div', {class: 'proto-d-all-col'}, [el('div', {class: 'proto-d-all-title'}, ['Other Composite'])]);
            rest.forEach(function(c) {
                addBtn(col, {label: c.label || c.name, combi: c.name, how: 'Composite tool'}, null);
            });
            allPanel.appendChild(col);
        }
        root.appendChild(allPanel);
        const r = allPanel.getBoundingClientRect();
        allPanel.style.left = Math.max(8, Math.min(window.innerWidth - r.width - 8, pos.x - r.width / 2)) + 'px';
        allPanel.style.top = Math.max(56, Math.min(window.innerHeight - r.height - 60, pos.y - r.height / 2)) + 'px';
    }
    function hideAll() {
        if (allPanel) {
            allPanel.remove();
            allPanel = null;
        }
    }

    // ---- Pill, hint, corner actions, toast --------------------------------------------------------------------
    function describe(st) {
        const rr = roleOf(st);
        if (rr) {
            return {ri: rr.ri, label: itemLabel(rr.item), how: rr.item.how || ''};
        }
        if (st.mode === 'combi') {
            const c = kit.combis.find(function(x) {
                return x.name === st.submode;
            });
            return {ri: null, label: c ? c.label : st.submode, how: ''};
        }
        if (st.mode === 'symbol') {
            return {ri: 5, label: 'Shape · ' + st.submode.replace(/_/g, ' '), how: 'click cell'};
        }
        const s = B.listSubmodes(st.mode).find(function(x) {
            return String(x.value) === st.submode;
        });
        return {ri: null, label: st.mode + (s && s.label ? ' · ' + s.label : ''), how: ''};
    }
    function updatePill(state) {
        const d = describe(state);
        const color = d.ri != null ? ROLES[d.ri].color : '#888';
        pill.style.setProperty('--fam', color);
        pill.querySelector('.proto-d-pill-fam').textContent = d.ri != null ? ARROW[d.ri] + ' ' + ROLES[d.ri].label : 'Tool';
        pill.querySelector('.proto-d-pill-mode').textContent = d.label;
        pill.querySelector('.proto-d-pill-how').textContent = d.how;
        root.querySelector('.proto-d-undo').disabled = !state.canUndo;
        root.querySelector('.proto-d-redo').disabled = !state.canRedo;
        const chk = root.querySelector('.proto-d-check');
        chk.disabled = !state.hasAnswerCheck;
        chk.title = state.hasAnswerCheck ? 'Check the answer' : 'This puzzle has no answer check';
        chk.classList.toggle('is-solved', !!state.solved);
        renderHint();
    }
    /** Under the pill: the flicks this puzzle needs, as arrows, so the solver learns its two or three directions. */
    function renderHint() {
        hintEl.textContent = '';
        hintEl.appendChild(el('span', {}, [
            el('kbd', {}, ['Space']), ' or ', el('kbd', {}, ['middle-drag']), ' + flick, this puzzle:'
        ]));
        ROLES.forEach(function(r, ri) {
            if (ri === ALL || !kit.needed[ri] || !roleEnabled(ri)) {
                return;
            }
            const tool = roleTool(ri);
            const chip = el('span', {class: 'proto-d-hint-chip', style: '--fam:' + r.color}, [
                el('b', {}, [ARROW[ri]]), ' ' + r.label + (tool && tool.label !== r.label ? ': ' + tool.label : '')
            ]);
            hintEl.appendChild(chip);
        });
        hintEl.appendChild(el('span', {class: 'proto-d-hint-more'}, ['↖ All']));
    }
    function flashPill() {
        pill.classList.remove('is-flash');
        void pill.offsetWidth;
        pill.classList.add('is-flash');
    }
    let toastTimer = null;
    function toast(text, color, pos) {
        pos = pos || mouse;
        toastEl.textContent = text;
        toastEl.style.setProperty('--fam', color);
        toastEl.style.left = pos.x + 'px';
        toastEl.style.top = (pos.y - 34) + 'px';
        toastEl.classList.remove('is-on');
        void toastEl.offsetWidth;
        toastEl.classList.add('is-on');
        clearTimeout(toastTimer);
        toastTimer = setTimeout(function() {
            toastEl.classList.remove('is-on');
        }, 900);
    }
    function runCheck() {
        const r = B.check();
        const btn = root.querySelector('.proto-d-check');
        const rect = btn.getBoundingClientRect();
        const pos = {x: rect.left + rect.width / 2 - 60, y: rect.bottom + 52};
        if (!r.hasAnswerCheck) {
            toast('No answer check in this puzzle', '#888', pos);
        } else if (r.solved) {
            toast('Solved!', '#59d18b', pos);
        } else {
            toast('Not solved yet', '#f07070', pos);
        }
    }

    // ---- Input wiring -----------------------------------------------------------------------------------------
    function typingTarget(e) {
        const t = e.target;
        return t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.tagName === 'SELECT' || t.isContentEditable);
    }
    function dialogOpen() {
        if (document.querySelector('.swal2-container')) {
            return true;
        }
        return Array.from(document.querySelectorAll('.modal')).some(function(m) {
            return getComputedStyle(m).display !== 'none';
        });
    }

    function onKeyDown(e) {
        if (!e.isTrusted) {
            return;
        }
        if (e.key === 'Escape' && (g || allPanel)) {
            close();
            hideAll();
            e.stopImmediatePropagation();
            e.preventDefault();
            return;
        }
        if (e.key !== ' ' || e.ctrlKey || e.altKey || e.metaKey || typingTarget(e) || dialogOpen()) {
            return;
        }
        e.stopImmediatePropagation();
        e.preventDefault();
        if (e.repeat) {
            return;
        }
        if (g && g.sticky) {
            close();
            return;
        }
        if (!g) {
            start('space', mouse.x, mouse.y);
            g.shift = e.shiftKey;
        }
    }
    function onKeyUp(e) {
        if (!e.isTrusted || e.key !== ' ') {
            return;
        }
        if (!g || g.source !== 'space') {
            if (g && g.sticky) {
                e.stopImmediatePropagation();
                e.preventDefault();
            }
            return;
        }
        e.stopImmediatePropagation();
        e.preventDefault();
        const shift = g.shift;
        if (end() === 'tap') {
            // A plain Space tap keeps its Penpa+ meaning (clear the selection's entry).
            B.sendKey(' ', {shift: shift, code: 'Space'});
        }
    }

    // Middle button: Penpa+ ignores it in solve mode (main.js:106, 153, 188), so it is free for the menu.
    // Right button stays Penpa+'s: Composite's second mark (x, dot, water) and Surface's second colour.
    function onMouseDown(e) {
        if (!e.isTrusted) {
            return;
        }
        if (g && g.sticky && !e.target.closest('.proto-d-bubble, .proto-d-hub2')) {
            close();
            e.stopImmediatePropagation();
            e.preventDefault();
            return;
        }
        if (allPanel && !e.target.closest('.proto-d-all')) {
            hideAll();
        }
        if (e.button !== 1 || g || dialogOpen()) {
            return;
        }
        if (e.target.id !== 'canvas' && !e.target.closest('.proto-d-root')) {
            return;
        }
        e.stopImmediatePropagation();
        e.preventDefault(); // no autoscroll
        start('middle', e.pageX, e.pageY);
    }
    function onMouseMove(e) {
        mouse = {x: e.pageX, y: e.pageY};
        if (g) {
            move(e.pageX, e.pageY);
        }
    }
    function onMouseUp(e) {
        if (!e.isTrusted || e.button !== 1 || !g || g.source !== 'middle') {
            return;
        }
        e.stopImmediatePropagation();
        e.preventDefault();
        end();
    }
    function onAuxClick(e) {
        if (e.button === 1) {
            e.preventDefault();
        }
    }

    // ---- Layout -----------------------------------------------------------------------------------------------
    function fitBoard() {
        const canvas = document.getElementById('canvas');
        const availW = window.innerWidth - 80;
        const availH = window.innerHeight - 150;
        const probe = 40;
        B.setCellSize(probe);
        const r = canvas.getBoundingClientRect();
        if (!r.width || !r.height) {
            return;
        }
        const px = Math.max(12, Math.min(90, Math.floor(probe * Math.min(availW / r.width, availH / r.height))));
        B.setCellSize(px);
    }

    function build() {
        root = el('div', {class: 'proto-d-root'}, []);
        const stage = el('div', {class: 'proto-d-stage'}, []);
        root.appendChild(stage);
        H.adoptBoard(stage);
        H.hideLegacy();

        const info = B.getInfo();
        pill = el('div', {class: 'proto-d-pill', title: 'Current tool. Click for the menu; or hold Space / drag the middle button anywhere.'}, [
            el('span', {class: 'proto-d-pill-dot'}, []),
            el('span', {class: 'proto-d-pill-fam'}, []),
            el('span', {class: 'proto-d-pill-mode'}, []),
            el('span', {class: 'proto-d-pill-how'}, []),
            el('span', {class: 'proto-d-pill-timer'}, [])
        ]);
        pill.addEventListener('click', function() {
            const r = document.getElementById('canvas').getBoundingClientRect();
            start('pill', r.left + r.width / 2 + window.scrollX, r.top + r.height / 2 + window.scrollY);
            openSticky();
        });
        const corner = el('div', {class: 'proto-d-corner'}, [
            el('button', {class: 'proto-d-btn proto-d-undo', title: 'Undo (Ctrl+Z)', onclick: function() {
                B.undo();
            }}, ['↶']),
            el('button', {class: 'proto-d-btn proto-d-redo', title: 'Redo (Ctrl+Y)', onclick: function() {
                B.redo();
            }}, ['↷']),
            el('button', {class: 'proto-d-btn proto-d-check', onclick: runCheck}, ['Check'])
        ]);
        const title = el('div', {class: 'proto-d-title'}, [
            (info.title || 'Untitled') + (info.author ? '  —  ' + info.author : '')
        ]);
        title.addEventListener('click', function() {
            B.showRules();
        });
        title.title = 'Rules';
        hintEl = el('div', {class: 'proto-d-hint'}, []);
        hintEl.title = 'Flick toward a role and release. Zig-zag for the role\'s other tools. Pause to see the menu. ' +
            'Middle click opens it for clicking. Tap Space still clears a cell.';
        overlay = el('div', {class: 'proto-d-overlay'}, []);
        svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
        svg.setAttribute('class', 'proto-d-trail');
        trail = document.createElementNS('http://www.w3.org/2000/svg', 'polyline');
        svg.appendChild(trail);
        toastEl = el('div', {class: 'proto-d-toast'}, []);
        root.appendChild(pill);
        root.appendChild(title);
        root.appendChild(corner);
        root.appendChild(hintEl);
        root.appendChild(svg);
        root.appendChild(overlay);
        root.appendChild(toastEl);
        document.body.appendChild(root);
    }

    window.PrototypeVariants = window.PrototypeVariants || {};
    window.PrototypeVariants.D = {
        name: 'radial menu',

        /** @param {object} ctx see README.md, "The variant contract" */
        mount(ctx) {
            B = ctx.bridge;
            H = ctx.helpers;
            analyse();
            build();
            fitBoard();
            window.addEventListener('resize', fitBoard);

            window.addEventListener('keydown', onKeyDown, true);
            window.addEventListener('keyup', onKeyUp, true);
            window.addEventListener('mousedown', onMouseDown, true);
            window.addEventListener('mousemove', onMouseMove, true);
            window.addEventListener('mouseup', onMouseUp, true);
            window.addEventListener('auxclick', onAuxClick, true);
            window.addEventListener('contextmenu', function(e) {
                if (g) {
                    e.preventDefault();
                }
            }, true);
            window.addEventListener('blur', function() {
                if (g && !g.sticky) {
                    close();
                }
            });

            const timerEl = pill.querySelector('.proto-d-pill-timer');
            B.onTimer(function(t) {
                timerEl.textContent = t.text || '';
            });
            timerEl.textContent = B.getTimer().text || '';
            B.onChange(function(state) {
                updatePill(state);
            });
            updatePill(B.getState());
        }
    };
})();
