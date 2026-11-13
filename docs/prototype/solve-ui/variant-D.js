/*
 * PROTOTYPE (throwaway, branch prototype/solve-ui): solve-UI variant D, "Radial menu".
 * Owned by variant D's builder: this file and variant-D.css only. See README.md for the contract.
 *
 * The idea: no toolbar. Hold Space (or press and hold the right mouse button) and a two-level marking menu opens
 * at the pointer. Ring 1 holds the six mode families (GLOSSARY.md, Mode family) at fixed compass directions; flick
 * toward one, then flick again (a zig-zag) into ring 2, its tools at the 8 compass points. Release to commit.
 * Flicks done before the dwell delay never draw the menu (a marking menu, Kurtenbach 1993): the stroke is
 * recognised from its shape on release. A short flick commits the family's last-used tool; a long straight flick
 * commits the tool that sits in the family's own direction (its primary). Press and release without moving leaves
 * the menu open for clicking. A minimal pill in the top-left corner names the current mode; undo, redo and the
 * answer check sit in the top-right corner.
 *
 * Claim tested: speed comes from muscle memory, and a radial flick is learnable.
 *
 * Bridge gaps worked around here (read pu / dispatch events directly):
 *  - Right button: Penpa acts on mousedown, so a right press is held back for HOLD_MS; a quick right click or a
 *    right drag that starts early is replayed to #canvas as synthetic events (bridge.pointer cannot hand over a
 *    drag that the real mouse continues).
 *  - Number sub-modes 3 and 9 have image labels (empty text in listSubmodes); named here as 1/4 and Side.
 *  - No "current Composite tool label" call; read from listComposite().
 */
(function() {
    'use strict';

    // ---- Geometry and timing (px, ms) -------------------------------------------------------------------------
    const R_DEAD = 12;       // release inside this = no stroke (tap / sticky menu)
    const R_FAMILY = 30;     // stroke must leave this radius to pick a family
    const R_SUB = 28;        // second segment must be this long to pick a ring-2 tool
    const R_STRAIGHT = 130;  // a straight stroke this long picks the tool in the family's own direction
    const CORNER_EXCESS = 8;
    const RING1_R = 78;      // where ring-1 bubbles are drawn
    const RING2_R = 92;
    const RING2_OPEN = 110;  // visible menu: crossing this distance opens ring 2 at the pointer
    const DWELL_MS = 260;    // pause this long and the menu shows
    const HOLD_MS = 180;     // right button: hold this long before it becomes the menu

    // Compass slots for ring 2: 0 = N, 1 = NE, ... 7 = NW. Ring 1 uses 6 sectors of 60 degrees, 0 = N.
    // Each family's primary tool sits in ring 2 at the compass point nearest the family's own direction, so a long
    // straight flick picks it.
    const FAMILIES = [
        {key: 'value', label: 'Value', color: '#5aa9ff', items: [
            {label: 'Sudoku', sub: 'Normal', mode: 'sudoku', submode: 1},
            {label: 'Sudoku', sub: 'Corner', mode: 'sudoku', submode: 2},
            {label: 'Sudoku', sub: 'Centre', mode: 'sudoku', submode: 3},
            {label: 'Number', sub: 'Candidates', mode: 'number', submode: 7},
            {label: 'Number', sub: 'Normal', mode: 'number', submode: 1},
            {label: 'Number', sub: 'Side', mode: 'number', submode: 9},
            {label: 'Number', sub: 'Long', mode: 'number', submode: 8},
            {label: 'Number', sub: '1/4', mode: 'number', submode: 3}
        ]},
        {key: 'paint', label: 'Paint', color: '#f0a040', items: [
            {label: 'Shade', sub: 'Light grey', mode: 'surface', style: 3, swatch: '#ccc'},
            {label: 'Shade', sub: 'Dark grey', mode: 'surface', style: 1, swatch: '#444'},
            {label: 'Shade', sub: 'Grey', mode: 'surface', style: 8, swatch: '#999'},
            {label: 'Shade', sub: 'Green', mode: 'surface', style: 2, swatch: '#8c8'},
            {label: 'Shade', sub: 'Yellow', mode: 'surface', style: 7, swatch: '#ee6'},
            {label: 'Shade', sub: 'Blue', mode: 'surface', style: 5, swatch: '#8bf'},
            {label: 'Shade', sub: 'Red', mode: 'surface', style: 6, swatch: '#f88'},
            {label: 'Multicolor', sub: 'select + digit', mode: 'multicolor'}
        ]},
        {key: 'path', label: 'Path', color: '#59d18b', items: [
            {label: 'Line', sub: 'Free', mode: 'line', submode: 3},
            {label: 'Line', sub: 'Diagonal', mode: 'line', submode: 2},
            {label: 'Line', sub: 'Middle', mode: 'line', submode: 5},
            {label: 'Line', sub: 'Normal', mode: 'line', submode: 1},
            {label: 'Edge', sub: 'Normal', mode: 'lineE', submode: 1},
            {label: 'Edge', sub: 'Helper (x)', mode: 'lineE', submode: 4},
            {label: 'Wall', sub: '', mode: 'wall'},
            {label: 'Line', sub: 'Helper (x)', mode: 'line', submode: 4}
        ]},
        {key: 'genre', label: 'Genre', color: '#e070d0', items: [
            {label: 'Black/dot', combi: 'blpo'},
            {label: 'Star', combi: 'star'},
            {label: 'Tents', combi: 'tents'},
            {label: 'Akari', combi: 'akari'},
            {label: 'Line/x', combi: 'linex'},
            {label: 'Yajilin', combi: 'yajilin'},
            {label: 'Edge/x', combi: 'edgex'},
            {label: 'More...', more: true}
        ]},
        {key: 'stamp', label: 'Stamp', color: '#c8a0ff', items: [
            {label: 'Thermo', mode: 'special', submode: 'thermo'},
            {label: 'Square', shape: 'square_L'},
            {label: 'O / X', shape: 'ox_B'},
            {label: 'Cage', sub: 'Killer', mode: 'cage', submode: 1},
            {label: 'Cage', sub: 'Free', mode: 'cage', submode: 2},
            {label: 'Circle', shape: 'circle_L'},
            {label: 'Arrow', mode: 'special', submode: 'arrows'},
            {label: 'Triangle', shape: 'triup_L'}
        ]},
        {key: 'move', label: 'Move', color: '#a0a8b8', items: [
            null,
            null,
            {label: 'Move', sub: 'Numbers', mode: 'move', submode: 2},
            null,
            null,
            null,
            {label: 'Move', sub: 'Shapes', mode: 'move', submode: 3},
            {label: 'Move', sub: 'All', mode: 'move', submode: 1}
        ]}
    ];
    const FAMILY_OF_MODE = {
        sudoku: 0, number: 0, surface: 1, multicolor: 1, line: 2, lineE: 2, wall: 2,
        combi: 3, symbol: 4, special: 4, cage: 4, move: 5
    };
    const MODE_LABEL = {
        sudoku: 'Sudoku', number: 'Number', surface: 'Shade', multicolor: 'Multicolor', line: 'Line', lineE: 'Edge',
        wall: 'Wall', combi: 'Genre', symbol: 'Shape', special: 'Special', cage: 'Cage', move: 'Move'
    };
    const COMPASS = ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW'];

    let B, H;
    let root, overlay, svg, trail, pill, toastEl, morePanel;
    let g = null;               // the gesture in progress, or the open sticky menu
    let mouse = {x: 800, y: 450};
    const lastItem = {};        // family index -> item last used in it

    // ---- Small helpers ----------------------------------------------------------------------------------------
    function dist(a, b) {
        return Math.hypot(b.x - a.x, b.y - a.y);
    }
    /** Compass angle in degrees, 0 = up, clockwise. */
    function angle(a, b) {
        return (Math.atan2(b.x - a.x, a.y - b.y) * 180 / Math.PI + 360) % 360;
    }
    function sector6(deg) {
        return Math.round(deg / 60) % 6;
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

    // ---- What is available for this puzzle -------------------------------------------------------------------
    let avail = null;
    function computeAvail() {
        const modes = new Set(B.listModes().map(function(m) {
            return m.mode;
        }));
        const subs = {};
        modes.forEach(function(m) {
            subs[m] = new Set(B.listSubmodes(m).map(function(s) {
                return String(s.value);
            }));
        });
        const styles = new Set(B.listStyles('surface').map(function(s) {
            return s.value;
        }));
        const combis = modes.has('combi') ? B.listComposite() : [];
        avail = {modes: modes, subs: subs, styles: styles, combis: combis, combiNames: new Set(combis.map(function(c) {
            return c.name;
        }))};
    }
    function itemEnabled(item) {
        if (!item) {
            return false;
        }
        if (item.more) {
            return avail.combis.length > 0;
        }
        if (item.combi) {
            return avail.combiNames.has(item.combi);
        }
        if (item.shape) {
            return avail.modes.has('symbol');
        }
        if (!avail.modes.has(item.mode)) {
            return false;
        }
        if (item.submode != null && avail.subs[item.mode] && avail.subs[item.mode].size > 0) {
            return avail.subs[item.mode].has(String(item.submode));
        }
        if (item.style != null) {
            return avail.styles.has(item.style);
        }
        return true;
    }
    function familyEnabled(fi) {
        return FAMILIES[fi].items.some(itemEnabled);
    }
    function familyDefault(fi) {
        const last = lastItem[fi];
        if (last && itemEnabled(last) && !last.more) {
            return last;
        }
        // No history yet: the primary (the slot in the family's own direction), else the first one that works here.
        const primary = FAMILIES[fi].items[sector8(fi * 60)];
        if (itemEnabled(primary) && !primary.more) {
            return primary;
        }
        return FAMILIES[fi].items.find(function(it) {
            return itemEnabled(it) && !it.more;
        }) || null;
    }
    function itemMatches(item, st) {
        if (!item || item.more) {
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
        if (item.style != null && item.style !== st.style) {
            return false;
        }
        return true;
    }
    function itemLabel(item) {
        return item.sub ? item.label + ' · ' + item.sub : item.label;
    }

    // ---- Applying a tool --------------------------------------------------------------------------------------
    function apply(item, fi) {
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
        lastItem[fi] = item;
        flashPill();
        toast(itemLabel(item), FAMILIES[fi].color);
    }

    // ---- Stroke recognition (hidden menu) ---------------------------------------------------------------------
    /**
     * Recognise a stroke from its points: {family, sub} where sub is a compass slot or null.
     * A corner is the point P that maximises |OP| + |PE| - |OE| (handles side turns and reversals).
     */
    function recognize(o, pts) {
        let far = 0;
        pts.forEach(function(p) {
            far = Math.max(far, dist(o, p));
        });
        if (far < R_FAMILY || pts.length === 0) {
            return {family: null, sub: null, far: far};
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
        if (best && bestEx > CORNER_EXCESS && dist(o, best) > R_FAMILY && dist(best, e) > R_SUB) {
            return {family: sector6(angle(o, best)), sub: sector8(angle(best, e)), corner: best, far: far};
        }
        if (oe < R_FAMILY) {
            // Went out and came back without a clear second segment: cancel.
            return {family: null, sub: null, far: far};
        }
        const a = angle(o, e);
        return {family: sector6(a), sub: oe > R_STRAIGHT ? sector8(a) : null, far: far};
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
        b.appendChild(document.createTextNode(text));
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
        const o = g.origin;
        const prov = provisional();
        const fi = g.c ? (g.sticky ? g.family : prov.family) : null;
        if (fi == null || !g.c) {
            // Ring 1: the six families around the origin.
            const hub = el('div', {class: 'proto-d-hub'}, []);
            hub.style.left = o.x + 'px';
            hub.style.top = o.y + 'px';
            overlay.appendChild(hub);
            FAMILIES.forEach(function(f, i) {
                const d = dir(i * 60, RING1_R);
                const on = familyEnabled(i);
                const cls = ['proto-d-ring1'];
                if (!on) {
                    cls.push('is-off');
                }
                if (prov.family === i) {
                    cls.push('is-hot');
                }
                if (FAMILY_OF_MODE[st.mode] === i) {
                    cls.push('is-current');
                }
                bubble({x: o.x + d.x, y: o.y + d.y}, f.label, {
                    cls: cls.join(' '), color: f.color,
                    onclick: g.sticky && on ? function() {
                        g.family = i;
                        g.c = {x: o.x + d.x * 1.6, y: o.y + d.y * 1.6};
                        render();
                    } : null
                });
            });
        } else {
            // Ring 2 replaces ring 1 (a hierarchical marking menu): the family's tools around the turn point.
            const f = FAMILIES[fi];
            const c = g.c;
            const hub2 = el('div', {class: 'proto-d-hub proto-d-hub2'}, [f.label]);
            hub2.style.left = c.x + 'px';
            hub2.style.top = c.y + 'px';
            hub2.style.setProperty('--fam', f.color);
            if (g.sticky) {
                hub2.title = 'Back to the families';
                hub2.addEventListener('mousedown', function(e) {
                    e.preventDefault();
                    e.stopPropagation();
                });
                hub2.addEventListener('click', function() {
                    g.family = null;
                    g.c = null;
                    render();
                });
            }
            overlay.appendChild(hub2);
            const link = el('div', {class: 'proto-d-link'}, []);
            const len = dist(o, c);
            link.style.left = o.x + 'px';
            link.style.top = o.y + 'px';
            link.style.width = len + 'px';
            link.style.transform = 'rotate(' + (angle(o, c) - 90) + 'deg)';
            link.style.setProperty('--fam', f.color);
            overlay.appendChild(link);
            f.items.forEach(function(item, si) {
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
                if (!g.sticky && prov.sub == null && familyDefault(fi) === item) {
                    cls.push('is-default');
                }
                bubble({x: c.x + d.x, y: c.y + d.y}, item.label, {
                    cls: cls.join(' '), color: f.color, swatch: item.swatch, subtext: item.sub || '',
                    onclick: g.sticky && on ? function() {
                        const pos = {x: c.x + d.x, y: c.y + d.y};
                        close();
                        commitItem(item, fi, pos);
                    } : null
                });
            });
        }
    }
    /** The selection the visible menu currently shows. */
    function provisional() {
        if (!g) {
            return {family: null, sub: null};
        }
        if (g.sticky) {
            return {family: g.family != null ? g.family : null, sub: null};
        }
        const p = g.pts.length ? g.pts[g.pts.length - 1] : g.origin;
        if (!g.visible) {
            return recognize(g.origin, g.pts);
        }
        if (g.c) {
            if (dist(g.origin, p) < R_DEAD) {
                // Back at the origin: back out to ring 1.
                g.c = null;
                g.family = null;
            } else {
                return {family: g.family, sub: dist(g.c, p) > R_SUB ? sector8(angle(g.c, p)) : null};
            }
        }
        const d = dist(g.origin, p);
        if (d < R_FAMILY) {
            return {family: null, sub: null};
        }
        const fi = sector6(angle(g.origin, p));
        if (d > RING2_OPEN && familyEnabled(fi)) {
            g.family = fi;
            g.c = {x: p.x, y: p.y};
        }
        return {family: fi, sub: null};
    }

    // ---- Gesture lifecycle -----------------------------------------------------------------------------------
    function start(source, x, y) {
        hideMore();
        g = {source: source, origin: {x: x, y: y}, pts: [], visible: false, sticky: false, c: null, family: null};
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
            if (r.family != null && familyEnabled(r.family)) {
                // Paused after a fast first flick: open ring 2 where the pointer is.
                g.family = r.family;
                g.c = g.pts.length ? g.pts[g.pts.length - 1] : g.origin;
            }
        } else if (!g.c) {
            const p = g.pts.length ? g.pts[g.pts.length - 1] : g.origin;
            const fi = dist(g.origin, p) > R_FAMILY ? sector6(angle(g.origin, p)) : null;
            if (fi != null && familyEnabled(fi)) {
                g.family = fi;
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
    /** Pointer released / Space released. Returns 'tap' when nothing was stroked and no menu shown. */
    function end() {
        if (!g || g.sticky) {
            return null;
        }
        clearTimeout(g.dwell);
        const prov = provisional();
        const far = g.pts.reduce(function(m, p) {
            return Math.max(m, dist(g.origin, p));
        }, 0);
        const wasVisible = g.visible;
        const endPos = g.pts.length ? g.pts[g.pts.length - 1] : g.origin;
        if (far < R_DEAD) {
            if (wasVisible) {
                // Classic marking menu: press-and-release without moving leaves the menu up for clicking.
                g.sticky = true;
                g.family = null;
                g.c = null;
                overlay.classList.add('is-sticky');
                svg.classList.remove('is-on');
                render();
                return 'sticky';
            }
            close();
            return 'tap';
        }
        const fi = prov.family;
        close();
        if (fi == null) {
            return 'cancel';
        }
        if (!familyEnabled(fi)) {
            toast(FAMILIES[fi].label + ': nothing for this puzzle', '#888', endPos);
            return 'cancel';
        }
        if (prov.sub != null) {
            const item = FAMILIES[fi].items[prov.sub];
            if (!item || !itemEnabled(item)) {
                toast(FAMILIES[fi].label + ' ' + COMPASS[prov.sub] + ': ' + (item ? itemLabel(item) + ' not here' : 'empty'),
                    '#888', endPos);
                return 'cancel';
            }
            commitItem(item, fi, endPos);
            return 'commit';
        }
        const def = familyDefault(fi);
        if (def) {
            commitItem(def, fi, endPos);
        }
        return 'commit';
    }
    function commitItem(item, fi, pos) {
        if (item.more) {
            showMore(pos);
            return;
        }
        apply(item, fi);
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

    // ---- "More..." Composite list ----------------------------------------------------------------------------
    function showMore(pos) {
        hideMore();
        morePanel = el('div', {class: 'proto-d-more'}, [el('div', {class: 'proto-d-more-title'}, ['Genre tools'])]);
        const cur = B.getMode();
        avail.combis.forEach(function(c) {
            const btn = el('button', {class: 'proto-d-more-item' + (cur.mode === 'combi' && cur.submode === c.name ? ' is-current' : '')},
                [c.label || c.name]);
            btn.addEventListener('mousedown', function(e) {
                e.stopPropagation();
            });
            btn.addEventListener('click', function() {
                hideMore();
                B.setComposite(c.name);
                lastItem[3] = {label: c.label || c.name, combi: c.name};
                flashPill();
                toast(c.label || c.name, FAMILIES[3].color);
            });
            morePanel.appendChild(btn);
        });
        root.appendChild(morePanel);
        const r = morePanel.getBoundingClientRect();
        morePanel.style.left = Math.max(8, Math.min(window.innerWidth - r.width - 8, pos.x - r.width / 2)) + 'px';
        morePanel.style.top = Math.max(8, Math.min(window.innerHeight - r.height - 60, pos.y - r.height / 2)) + 'px';
    }
    function hideMore() {
        if (morePanel) {
            morePanel.remove();
            morePanel = null;
        }
    }

    // ---- Pill, corner actions, toast --------------------------------------------------------------------------
    function describeMode(st) {
        const fi = FAMILY_OF_MODE[st.mode];
        let label = MODE_LABEL[st.mode] || st.mode;
        let sub = '';
        if (st.mode === 'combi') {
            const c = avail.combis.find(function(x) {
                return x.name === st.submode;
            });
            label = c ? c.label : st.submode;
        } else if (st.mode === 'symbol') {
            sub = st.submode.replace(/_/g, ' ');
        } else if (st.mode === 'surface' || st.mode === 'multicolor') {
            const s = B.listStyles('surface').find(function(x) {
                return x.value === st.style;
            });
            const item = FAMILIES[1].items.find(function(it) {
                return it && it.style === st.style;
            });
            sub = item ? item.sub : (s ? s.label : '');
        } else {
            const s = B.listSubmodes(st.mode).find(function(x) {
                return String(x.value) === st.submode;
            });
            const item = fi != null && FAMILIES[fi].items.find(function(it) {
                return itemMatches(it, st);
            });
            sub = item ? item.sub : (s ? s.label : '');
        }
        return {fi: fi, label: label, sub: sub};
    }
    function updatePill(state) {
        const d = describeMode(state);
        const color = d.fi != null ? FAMILIES[d.fi].color : '#888';
        pill.style.setProperty('--fam', color);
        pill.querySelector('.proto-d-pill-fam').textContent = d.fi != null ? FAMILIES[d.fi].label : '';
        pill.querySelector('.proto-d-pill-mode').textContent = d.label + (d.sub ? ' · ' + d.sub : '');
        root.querySelector('.proto-d-undo').disabled = !state.canUndo;
        root.querySelector('.proto-d-redo').disabled = !state.canRedo;
        const chk = root.querySelector('.proto-d-check');
        chk.disabled = !state.hasAnswerCheck;
        chk.title = state.hasAnswerCheck ? 'Check the answer' : 'This puzzle has no answer check';
        // Track last-used tools per family from whatever changed the mode (keys, Tab, the menu).
        if (d.fi != null) {
            const item = FAMILIES[d.fi].items.find(function(it) {
                return itemMatches(it, state);
            });
            if (item) {
                lastItem[d.fi] = item;
            }
        }
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
        if (e.key === 'Escape' && (g || morePanel)) {
            close();
            hideMore();
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

    // Right button: held back until we know whether it is a click, a drag (both go to Penpa+) or the menu.
    let rp = null;
    function fireCanvas(type, x, y, buttons, ev) {
        const canvas = document.getElementById('canvas');
        canvas.dispatchEvent(new MouseEvent(type, {
            bubbles: true, cancelable: true, view: window,
            clientX: x - window.scrollX, clientY: y - window.scrollY, button: 2, buttons: buttons,
            ctrlKey: ev.ctrlKey, shiftKey: ev.shiftKey, altKey: ev.altKey
        }));
    }
    function onMouseDown(e) {
        if (!e.isTrusted) {
            return;
        }
        if (g && g.sticky && !e.target.closest('.proto-d-bubble')) {
            close();
            e.stopImmediatePropagation();
            e.preventDefault();
            return;
        }
        if (morePanel && !e.target.closest('.proto-d-more')) {
            hideMore();
        }
        if (e.button !== 2 || g || dialogOpen()) {
            return;
        }
        const onBoard = e.target.id === 'canvas';
        if (!onBoard && !e.target.closest('.proto-d-root')) {
            return;
        }
        e.stopImmediatePropagation();
        e.preventDefault();
        rp = {x: e.pageX, y: e.pageY, onBoard: onBoard, ev: e, armed: false, passed: false};
        rp.timer = setTimeout(function() {
            if (rp && !rp.passed) {
                rp.armed = true;
                start('right', rp.x, rp.y);
                onDwell(); // holding is the deliberate path: show at once
            }
        }, HOLD_MS);
    }
    function onMouseMove(e) {
        mouse = {x: e.pageX, y: e.pageY};
        if (rp && !rp.armed && !rp.passed && dist(rp, mouse) > 4) {
            // A right drag started before the hold delay: hand it to Penpa+ (right-drag painting, x lines).
            clearTimeout(rp.timer);
            rp.passed = true;
            if (rp.onBoard) {
                fireCanvas('mousedown', rp.x, rp.y, 2, rp.ev);
            }
            return;
        }
        if (g) {
            move(e.pageX, e.pageY);
        }
    }
    function onMouseUp(e) {
        if (!e.isTrusted || e.button !== 2 || !rp) {
            return;
        }
        const r = rp;
        rp = null;
        clearTimeout(r.timer);
        if (r.passed) {
            return; // the real mouseup goes on to Penpa+
        }
        e.stopImmediatePropagation();
        e.preventDefault();
        if (!r.armed) {
            if (r.onBoard) {
                fireCanvas('mousedown', r.x, r.y, 2, r.ev);
                fireCanvas('mouseup', r.x, r.y, 0, r.ev);
            }
            return;
        }
        end();
    }
    function onContextMenu(e) {
        if (e.target.id === 'canvas' || e.target.closest('.proto-d-root') || g) {
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

    function build(ctx) {
        root = el('div', {class: 'proto-d-root'}, []);
        const stage = el('div', {class: 'proto-d-stage'}, []);
        root.appendChild(stage);
        H.adoptBoard(stage);
        H.hideLegacy();

        const info = B.getInfo();
        pill = el('div', {class: 'proto-d-pill', title: 'Current mode. Click for the menu; or hold Space / right mouse anywhere.'}, [
            el('span', {class: 'proto-d-pill-dot'}, []),
            el('span', {class: 'proto-d-pill-fam'}, []),
            el('span', {class: 'proto-d-pill-mode'}, []),
            el('span', {class: 'proto-d-pill-timer'}, [])
        ]);
        pill.addEventListener('click', function() {
            const r = document.getElementById('canvas').getBoundingClientRect();
            start('pill', r.left + r.width / 2 + window.scrollX, r.top + r.height / 2 + window.scrollY);
            g.visible = true;
            g.sticky = true;
            clearTimeout(g.dwell);
            overlay.classList.add('is-on', 'is-sticky');
            svg.classList.remove('is-on');
            render();
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
        const hint = el('div', {class: 'proto-d-hint'}, [
            'Hold ', el('kbd', {}, ['Space']), ' or right mouse for tools'
        ]);
        hint.title = 'Flick toward a family, flick again toward a tool, release. Pause to see the menu. ' +
            'A short flick picks the family\'s last tool. Tap Space still clears a cell.';
        overlay = el('div', {class: 'proto-d-overlay'}, []);
        svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
        svg.setAttribute('class', 'proto-d-trail');
        trail = document.createElementNS('http://www.w3.org/2000/svg', 'polyline');
        svg.appendChild(trail);
        toastEl = el('div', {class: 'proto-d-toast'}, []);
        root.appendChild(pill);
        root.appendChild(title);
        root.appendChild(corner);
        root.appendChild(hint);
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
            computeAvail();
            build(ctx);
            fitBoard();
            window.addEventListener('resize', fitBoard);

            window.addEventListener('keydown', onKeyDown, true);
            window.addEventListener('keyup', onKeyUp, true);
            window.addEventListener('mousedown', onMouseDown, true);
            window.addEventListener('mousemove', onMouseMove, true);
            window.addEventListener('mouseup', onMouseUp, true);
            window.addEventListener('contextmenu', onContextMenu, true);
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
