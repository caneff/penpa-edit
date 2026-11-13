/*
 * PROTOTYPE (throwaway, branch prototype/solve-ui): solve-UI variant C, "Cursor ring".
 * Owned by variant C's builder: this file and variant-C.css only. See README.md for the contract.
 *
 * The idea: the mode lives on the pointer. A ring around the mouse cursor shows the current tool by colour and icon,
 * with a second small badge for what the RIGHT button does in it (Composite tools give left and right different
 * jobs). Claim tested: mode errors come from the indicator being far from where you look.
 *
 * Round 2, for logic genres:
 * - A genre kit. The puzzle's title, rules and tags pick the two to four tools a solver of that genre uses (mostly
 *   Penpa+'s Composite tools, which put a genre's primary and auxiliary marks on the left and right buttons), so the
 *   wheel and [ ] cycle a short list instead of all sixteen tools. Unknown genres get the starting tool plus the
 *   link's Tab set.
 * - A direct jump: hold Space and a pie of the kit opens round the cursor; flick toward a tool and let go, or press
 *   its digit, or click it. A quick tap of Space swaps back to the previous tool (Fillomino: digits <-> borders).
 *   The pie's "All tools" slice swaps in every mode and Composite tool. Middle-click opens the same pie.
 * - The name label at the cursor no longer lists neighbours, and it fades the moment the mouse clicks or moves on,
 *   so it never sits over the cells being worked.
 *
 * Bridge gaps worked around here: no genre id (the kit is guessed from the title/rules/tags text); no list of Shape
 * tools (the second dial uses Shape's styles); swatch colours for styles are read from the legacy `<id>_lb` labels'
 * computed background; a Composite tool hidden by Penpa Lite (Galaxies' Tab set) is still set with setComposite;
 * the Penpa key handler is pre-empted for [ ] { } and Space by a capture-phase listener on window, so Space no longer
 * clears a cell (Delete and Backspace still do).
 */
(function() {
    'use strict';

    // Tool looks, by mode, "mode:submode" or "combi:<tool>". icon = left button, ricon = right button.
    const LOOK = {
        'sudoku:1': {color: '#4aa3ff', icon: '7', cls: 'normal', hint: 'type a digit'},
        'sudoku:2': {color: '#c77dff', icon: '7', cls: 'corner', hint: 'type: corner marks'},
        'sudoku:3': {color: '#ffab40', icon: '7', cls: 'centre', hint: 'type: centre marks'},
        'number:1': {color: '#4aa3ff', icon: '#', cls: 'normal', hint: 'type a number'},
        'number:7': {color: '#ffab40', icon: '#', cls: 'centre', hint: 'type: candidates'},
        'line:1': {color: '#3ddc84', icon: '╱', ricon: '×', hint: 'drag: line'},
        'line:4': {color: '#ff6b6b', icon: '×', hint: 'click edge: ×'},
        'lineE:1': {color: '#26c6da', icon: '┐', hint: 'drag: edge'},
        'lineE:4': {color: '#ff8a80', icon: '×', hint: 'click edge: ×'},
        surface: {color: '#e0e0e0', icon: '■', ricon: '▩', hint: 'click/drag: paint · right: 2nd colour · Shift+wheel: colour'},
        multicolor: {color: '#f06292', icon: '◩', hint: 'select, then a digit: colour'},
        line: {color: '#3ddc84', icon: '╱'},
        lineE: {color: '#26c6da', icon: '┐'},
        wall: {color: '#8d6e63', icon: '┃'},
        number: {color: '#4aa3ff', icon: '#'},
        symbol: {color: '#ffd54f', icon: '●'},
        special: {color: '#ba68c8', icon: '⟿'},
        cage: {color: '#90a4ae', icon: '⬚'},
        combi: {color: '#ff7043', icon: '✦'},
        sudoku: {color: '#4aa3ff', icon: '7'},
        move: {color: '#bdbdbd', icon: '✥'},
        'combi:edgex': {color: '#26c6da', icon: '┐', ricon: '×', hint: 'drag: edge · right: ×'},
        'combi:edgexoi': {color: '#4dd0e1', icon: '┐', ricon: '◐', hint: 'drag: edge · right: × · click cell: in / out'},
        'combi:linex': {color: '#3ddc84', icon: '╱', ricon: '×', hint: 'drag: loop · right: × on edge'},
        'combi:lineox': {color: '#9ccc65', icon: '○', ricon: '×', hint: 'drag: loop · click: ○ · right: × in cell'},
        'combi:yajilin': {color: '#66bb6a', icon: '■', ricon: '•', hint: 'click: shade · drag: loop · right: dot / ×'},
        'combi:blpo': {color: '#b0bec5', icon: '■', ricon: '•', hint: 'click: shade · right: dot · drag: many'},
        'combi:blwh': {color: '#eeeeee', icon: '○', ricon: '●', hint: 'click: white ○ · right: black ● · twice: other'},
        'combi:star': {color: '#ffd54f', icon: '★', ricon: '×', hint: 'click: star · right: × · right on edge: dot'},
        'combi:akari': {color: '#fff176', icon: '☼', ricon: '•', hint: 'click: bulb · right: dot · drag: line'},
        'combi:battleship': {color: '#4fc3f7', icon: '◖', ricon: '≈',
            hint: 'click: cycle ship ● ■ · dot · water · drag: ship end · right-drag: water'},
        'combi:mines': {color: '#ef5350', icon: '✹', ricon: '×', hint: 'click: mine · right: ×'},
        'combi:tents': {color: '#81c784', icon: '▲', ricon: '×', hint: 'click: tent · right: × · drag: link'}
    };

    function lookFor(mode, submode) {
        return LOOK[mode + ':' + submode] || LOOK[mode] || {color: '#ffffff', icon: '?'};
    }

    // Genre kits: the first rule whose test matches the puzzle's text wins. Tools: {combi} or {mode, sub, style}.
    const KITS = [
        {genre: 'Yin-Yang', test: /yin.?ya/i, combi: 'blwh', tools: [{combi: 'blwh'}, {mode: 'surface'}]},
        {genre: 'Star Battle', test: /star ?battle/i, combi: 'star', tools: [{combi: 'star'}, {mode: 'surface'}]},
        {genre: 'Battleships', test: /battleship|\bships?\b|fleet/i, combi: 'battleship',
            tools: [{combi: 'battleship'}, {combi: 'blpo'}]},
        {genre: 'Slitherlink', test: /slither/i, tools: [{combi: 'edgex'}, {combi: 'edgexoi'}]},
        {genre: 'Masyu', test: /masyu|maysu|black circle.*white circle|white circle.*black circle/i,
            tools: [{combi: 'linex'}, {combi: 'lineox'}, {mode: 'surface'}]},
        {genre: 'Yajilin', test: /yajilin|yajikazu/i, combi: 'yajilin',
            tools: [{combi: 'yajilin'}, {combi: 'linex'}, {combi: 'blpo'}]},
        {genre: 'Akari', test: /akari|light ?up|lights? (in|illuminate)/i, combi: 'akari',
            tools: [{combi: 'akari'}, {combi: 'blpo'}, {mode: 'surface'}]},
        {genre: 'Nurikabe', test: /nurikabe/i, tools: [{combi: 'blpo'}, {mode: 'surface'}]},
        {genre: 'Fillomino', test: /fillomino/i,
            tools: [{combi: 'edgex'}, {mode: 'sudoku', sub: '1'}, {mode: 'sudoku', sub: '3'}]},
        {genre: 'Galaxies', test: /tentaisho|galax|spiral/i, tools: [{combi: 'edgex'}, {combi: 'blpo'}, {mode: 'surface'}]},
        {genre: 'Heyawake', test: /heyawake/i, tools: [{combi: 'blpo'}, {mode: 'surface'}]},
        {genre: 'Tents', test: /\btents?\b/i, combi: 'tents', tools: [{combi: 'tents'}]},
        {genre: 'Minesweeper', test: /minesweeper|\bmines?\b/i, combi: 'mines', tools: [{combi: 'mines'}]},
        {genre: 'Sudoku', test: /sudoku/i, gridtype: 'sudoku',
            tools: [{mode: 'sudoku', sub: '1'}, {mode: 'sudoku', sub: '2'}, {mode: 'sudoku', sub: '3'}, {mode: 'surface'}]}
    ];

    function toolKey(t) {
        return t.combi ? 'combi:' + t.combi : t.mode + (t.sub !== undefined ? ':' + t.sub : '');
    }

    window.PrototypeVariants = window.PrototypeVariants || {};
    window.PrototypeVariants.C = {
        name: 'cursor ring',

        /** @param {object} ctx see README.md, "The variant contract" */
        mount(ctx) {
            const B = ctx.bridge;
            const el = ctx.helpers.el;

            // ---- Layout: a dark stage with only the board on it --------------------------------------------------
            const holder = el('div', {class: 'proto-c-board'});
            const stage = el('div', {class: 'proto-c-stage'}, [holder]);
            document.body.appendChild(stage);
            ctx.helpers.adoptBoard(holder);
            ctx.helpers.hideLegacy();

            function fitBoard() {
                const s0 = pu.size;
                const r = ctx.canvas.getBoundingClientRect();
                if (!r.width || !r.height) {
                    return;
                }
                const availW = window.innerWidth - 120;
                const availH = window.innerHeight - 110; // room for the scaffold's switcher at the bottom
                const px = Math.max(12, Math.min(90, Math.floor(s0 * Math.min(availW / r.width, availH / r.height))));
                if (Math.abs(px - s0) >= 1) {
                    B.setCellSize(px);
                }
            }

            // ---- Tools: the genre kit, and the full list behind "All tools" ---------------------------------------
            const comps = B.listComposite();
            const compNames = comps.map(function(c) {
                return c.name;
            });
            const visibleModes = B.listModes().map(function(m) {
                return m.mode;
            });

            function available(t) {
                // A Composite tool works even when Penpa Lite hides the Composite mode (Galaxies' Tab set).
                return t.combi ? compNames.indexOf(t.combi) !== -1 :
                    (visibleModes.indexOf(t.mode) !== -1 || t.mode === 'surface' || t.mode === 'sudoku');
            }

            function detectKit() {
                const info = B.getInfo();
                const st = B.getMode();
                const text = [info.title, (info.rules || '').replace(/<[^>]+>/g, ' '), B.genreTags().join(' ')].join(' \n ');
                const startCombi = st.mode === 'combi' ? st.submode : null;
                const gridtype = B.getState().gridtype;
                const kit = KITS.find(function(k) {
                    return k.gridtype && k.gridtype === gridtype;
                }) || KITS.find(function(k) {
                    return k.test.test(text) || (startCombi && k.combi === startCombi);
                });
                let tools = kit ? kit.tools.filter(available) : [];
                if (!tools.length) {
                    // Unknown genre: the starting tool, then the link's Tab set as tools.
                    tools.push(startCombi ? {combi: startCombi} : {mode: st.mode, sub: st.submode || undefined});
                    B.tabSet().forEach(function(name) {
                        const m = B.listModes().find(function(x) {
                            return name === x.label || name.indexOf(x.label + ' ') === 0;
                        });
                        if (m && !tools.some(function(t) {
                            return t.mode === m.mode;
                        })) {
                            tools.push({mode: m.mode});
                        }
                    });
                }
                return {genre: kit ? kit.genre : 'this puzzle', tools: tools};
            }

            function buildAll() {
                const all = [];
                B.listModes().forEach(function(m) {
                    if (m.mode === 'combi') {
                        return; // listed tool by tool below
                    }
                    const subs = B.listSubmodes(m.mode);
                    const want = {sudoku: ['1', '2', '3'], number: ['1', '7'], line: ['1', '4'], lineE: ['1', '4']}[m.mode];
                    if (want) {
                        subs.filter(function(s) {
                            return want.indexOf(s.value) !== -1;
                        }).forEach(function(s) {
                            all.push({mode: m.mode, sub: s.value});
                        });
                    }
                    if (!all.some(function(t) {
                        return t.mode === m.mode;
                    })) {
                        all.push({mode: m.mode});
                    }
                });
                comps.forEach(function(c) {
                    all.push({combi: c.name});
                });
                return all;
            }

            const kitInfo = detectKit();
            let kit = kitInfo.tools;
            let allTools = buildAll();

            function matches(t, m) {
                if (t.combi) {
                    return m.mode === 'combi' && m.submode === t.combi;
                }
                return t.mode === m.mode && (t.sub === undefined || t.sub === m.submode);
            }

            function indexIn(list) {
                const m = B.getMode();
                return list.findIndex(function(t) {
                    return matches(t, m);
                });
            }

            function applyTool(t) {
                if (t.combi) {
                    B.setComposite(t.combi);
                    return;
                }
                B.setMode(t.mode);
                if (t.sub !== undefined && B.getMode().submode !== t.sub) {
                    B.setSubmode(t.sub);
                }
            }

            function rotateTool(dir) {
                if (!kit.length) {
                    return;
                }
                const i = indexIn(kit);
                const n = kit.length;
                applyTool(kit[i < 0 ? (dir > 0 ? 0 : n - 1) : (i + dir + n) % n]);
            }

            // The second dial: what varies within the current tool.
            function dialItems() {
                const m = B.getMode();
                if (m.mode === 'combi') {
                    // Within the kit's Composite tools first; all of them only when the kit has none to turn.
                    const ks = kit.filter(function(t) {
                        return t.combi;
                    });
                    const list = ks.length > 1 ? ks.map(function(t) {
                        return {name: t.combi};
                    }) : comps;
                    return list.map(function(c) {
                        return {key: c.name, apply: function() {
                            B.setComposite(c.name);
                        }};
                    });
                }
                if (m.mode === 'special') {
                    return B.listSubmodes('special').map(function(s) {
                        return {key: s.value, apply: function() {
                            B.setSubmode(s.value);
                        }};
                    });
                }
                return B.listStyles(m.mode).map(function(s) {
                    return {key: String(s.value), apply: function() {
                        B.setStyle(s.value);
                    }};
                });
            }

            function dialKey() {
                const m = B.getMode();
                return m.mode === 'combi' || m.mode === 'special' ? m.submode : String(m.style);
            }

            function rotateDial(dir) {
                const items = dialItems();
                if (!items.length) {
                    return;
                }
                const i = items.findIndex(function(it) {
                    return it.key === dialKey();
                });
                items[((i < 0 ? 0 : i) + dir + items.length) % items.length].apply();
            }

            // ---- Names and colours for display, always read back from the engine's actual state ---------------
            function toolName(mode, submode) {
                if (mode === 'combi') {
                    const name2 = submode !== undefined ? submode : ctx.pu.mode[ctx.pu.mode.qa].combi[0];
                    const c = comps.find(function(x) {
                        return x.name === name2;
                    });
                    return c ? c.label : 'Composite';
                }
                const ml = B.listModes({all: true}).find(function(x) {
                    return x.mode === mode;
                });
                let name = ml ? ml.label : mode;
                const subs = B.listSubmodes(mode);
                if (subs.length > 1 && submode !== undefined) {
                    const s = subs.find(function(x) {
                        return x.value === submode;
                    });
                    if (s && s.label) {
                        name += ' · ' + s.label;
                    }
                }
                return name;
            }

            function nameOf(t) {
                return t.combi ? toolName('combi', t.combi) : toolName(t.mode, t.sub);
            }

            function lookOf(t) {
                return t.combi ? lookFor('combi', t.combi) : lookFor(t.mode, t.sub);
            }

            function swatchColor() {
                const m = B.getMode();
                if (m.mode !== 'surface' && m.mode !== 'multicolor') {
                    return null;
                }
                const sw = document.getElementById('st_surface' + m.style + '_lb');
                if (!sw) {
                    return null;
                }
                const c = getComputedStyle(sw).backgroundColor;
                return c && c !== 'rgba(0, 0, 0, 0)' ? c : null;
            }

            function styleLabel() {
                const m = B.getMode();
                if (m.mode === 'combi' || m.mode === 'special') {
                    return '';
                }
                const s = B.listStyles(m.mode).find(function(x) {
                    return x.value === m.style;
                });
                return s ? s.label.replace(/\d+$/, '') : '';
            }

            function iconSpan(lk, extra) {
                return el('span', {class: 'proto-c-car-icon proto-c-icon-' + (lk.cls || 'plain') + (extra || '')}, [lk.icon]);
            }

            // ---- The ring ------------------------------------------------------------------------------------
            const ringIcon = el('span', {class: 'proto-c-icon'});
            const ringRIcon = el('span', {class: 'proto-c-icon'});
            const ringDot = el('span', {class: 'proto-c-dot'});
            const labelName = el('div', {class: 'proto-c-label-name'});
            const labelHint = el('div', {class: 'proto-c-label-hint'});
            const ringLabel = el('div', {class: 'proto-c-label'}, [labelName, labelHint]);
            const ringToast = el('div', {class: 'proto-c-toast'});
            const ringCircle = el('div', {class: 'proto-c-circle'}, [ringDot]);
            const ringBadge = el('div', {class: 'proto-c-badge', title: 'left button'}, [ringIcon]);
            const ringRBadge = el('div', {class: 'proto-c-rbadge', title: 'right button'}, [ringRIcon]);
            const ring = el('div', {class: 'proto-c-ring proto-c-hidden'},
                [ringCircle, ringBadge, ringRBadge, ringLabel, ringToast]);
            document.body.appendChild(ring);

            // The caret pip: the same badge on the selection, for keyboard solving.
            const pipIcon = el('span', {class: 'proto-c-icon'});
            const pip = el('div', {class: 'proto-c-pip proto-c-hidden'}, [pipIcon]);
            document.body.appendChild(pip);

            const pointer = {x: -100, y: -100, inside: false, lastMove: 0};
            let lastKeyboard = 0;
            let heldMod = false;
            let labelAt = null; // where the pointer was when the label appeared

            function placeRing() {
                ring.style.transform = 'translate(' + pointer.x + 'px,' + pointer.y + 'px)';
            }

            function hideLabel() {
                labelAt = null;
                ring.classList.remove('proto-c-show-label');
            }

            window.addEventListener('mousemove', function(e) {
                pointer.x = e.clientX;
                pointer.y = e.clientY;
                pointer.lastMove = Date.now();
                const overChrome = e.target.closest &&
                    e.target.closest('.proto-c-tab, #proto-switcher, .swal2-container, .modal, .proto-c-pie');
                pointer.inside = !overChrome;
                ring.classList.toggle('proto-c-hidden', !pointer.inside || pie.open);
                placeRing();
                renderPip();
                // The label gets out of the way as soon as the pointer moves on to work.
                if (labelAt && Math.hypot(e.clientX - labelAt.x, e.clientY - labelAt.y) > 36) {
                    hideLabel();
                }
                if (pie.open) {
                    pieHover();
                }
            }, true);
            document.addEventListener('mouseleave', function() {
                ring.classList.add('proto-c-hidden');
            });
            window.addEventListener('mousedown', function(e) {
                if (e.button !== 1) {
                    hideLabel();
                }
            }, true);

            let labelTimer = null;
            function flash() {
                ring.classList.remove('proto-c-flash');
                void ring.offsetWidth; // restart the animation
                ring.classList.add('proto-c-flash');
                pip.classList.remove('proto-c-flash');
                void pip.offsetWidth;
                pip.classList.add('proto-c-flash');
                ring.classList.add('proto-c-show-label');
                labelAt = {x: pointer.x, y: pointer.y};
                clearTimeout(labelTimer);
                labelTimer = setTimeout(hideLabel, 1800);
            }

            let toastTimer = null;
            function toast(text, kind) {
                ringToast.textContent = text;
                ringToast.className = 'proto-c-toast proto-c-toast-on' + (kind ? ' proto-c-toast-' + kind : '');
                clearTimeout(toastTimer);
                toastTimer = setTimeout(function() {
                    ringToast.className = 'proto-c-toast';
                }, kind === 'solved' ? 4000 : 1100);
            }

            function selectionMode(mode) {
                return mode === 'sudoku' || mode === 'number' || mode === 'multicolor' || mode === 'symbol';
            }

            function renderPip() {
                const m = B.getMode();
                const sel = selectionMode(m.mode) ? B.getSelection() : null;
                if (!sel || !sel.rect || !sel.cells.length) {
                    pip.classList.add('proto-c-hidden');
                    return;
                }
                const r = sel.rect;
                pip.classList.remove('proto-c-hidden');
                pip.style.left = (r.right - window.scrollX) + 'px';
                pip.style.top = (r.top - window.scrollY) + 'px';
                // Dim it while the mouse is the thing being used; the ring is already where the eye is.
                pip.classList.toggle('proto-c-pip-dim', !(lastKeyboard > pointer.lastMove));
            }

            // ---- Previous tool, for the Space-tap swap ----------------------------------------------------------
            let curTool = null;
            let prevTool = null;
            function snapshotTool() {
                const m = B.getMode();
                return m.mode === 'combi' ? {combi: m.submode} : {mode: m.mode, sub: m.submode === '' ? undefined : m.submode};
            }

            let lastKey = null;
            let lastSolved = false;
            function render() {
                const st = B.getState();
                const lk = lookFor(st.mode, st.submode);
                const key = [st.mode, st.submode, st.style].join('|');
                ring.style.setProperty('--c', lk.color);
                pip.style.setProperty('--c', lk.color);
                ringIcon.textContent = lk.icon;
                ringIcon.className = 'proto-c-icon proto-c-icon-' + (lk.cls || 'plain');
                ringRIcon.textContent = lk.ricon || '';
                ringRBadge.classList.toggle('proto-c-hidden', !lk.ricon);
                pipIcon.textContent = lk.icon;
                pipIcon.className = 'proto-c-icon proto-c-icon-' + (lk.cls || 'plain');
                const sw = swatchColor();
                ringDot.style.background = sw || 'transparent';
                ringDot.classList.toggle('proto-c-hidden', !sw);
                const styleOnly = lastKey !== null && key !== lastKey && lastKey.indexOf(st.mode + '|' + st.submode + '|') === 0;
                const sl = styleOnly && !sw ? styleLabel() : '';
                labelName.textContent = toolName(st.mode, st.submode) + (sl ? ' · style ' + sl : '') + (heldMod ? '  (held)' : '');
                labelHint.textContent = lk.hint || '';
                ring.classList.toggle('proto-c-temp', heldMod);
                ring.classList.toggle('proto-c-solved', st.solved);
                renderPip();
                if (!heldMod) {
                    const snap = snapshotTool();
                    if (curTool && toolKey(snap) !== toolKey(curTool)) {
                        prevTool = curTool;
                    }
                    curTool = snap;
                }
                if (lastKey !== null && key !== lastKey) {
                    flash();
                }
                lastKey = key;
                if (st.solved && !lastSolved) {
                    toast('Solved!', 'solved');
                }
                lastSolved = st.solved;
                tabRender(st);
            }

            // ---- The pie: a direct jump to any kit tool -------------------------------------------------------
            const pieRoot = el('div', {class: 'proto-c-pie proto-c-hidden'});
            const pieCentre = el('div', {class: 'proto-c-pie-centre'});
            pieRoot.appendChild(pieCentre);
            document.body.appendChild(pieRoot);
            const pie = {open: false, full: false, items: [], chips: [], grid: null, cx: 0, cy: 0, hot: -1, via: null, at: 0, moved: false};

            function pieItems(full) {
                const list = full ? allTools : kit.slice();
                const items = list.map(function(t) {
                    return {tool: t};
                });
                if (!full && allTools.length > kit.length) {
                    items.push({more: true});
                }
                return items;
            }

            function openPie(full, via) {
                if (!pie.open) {
                    pie.cx = Math.max(190, Math.min(window.innerWidth - 190, pointer.x));
                    pie.cy = Math.max(170, Math.min(window.innerHeight - 170, pointer.y));
                    pie.at = Date.now();
                    pie.moved = false;
                    pie.via = via;
                }
                pie.open = true;
                pie.full = full;
                pie.items = pieItems(full);
                pie.hot = -1;
                pie.chips.forEach(function(c) {
                    c.remove();
                });
                if (pie.grid) {
                    pie.grid.remove();
                    pie.grid = null;
                }
                const n = pie.items.length;
                const radius = Math.max(64, n * 16);
                const cur = indexIn(pie.items.map(function(it) {
                    return it.tool || {mode: '-'};
                }));
                function makeChip(it, i, style) {
                    const lk = it.more ? {color: '#9aa0aa', icon: '⋯'} : lookOf(it.tool);
                    return el('div', {class: 'proto-c-chip' + (i === cur ? ' proto-c-chip-cur' : '') +
                        (it.more ? ' proto-c-chip-more' : ''), style: '--c:' + lk.color + (style || ''),
                    title: it.tool ? (lookOf(it.tool).hint || '') : '',
                    onmousedown: function(e) {
                        e.preventDefault();
                        e.stopPropagation();
                        choose(i);
                    }}, [
                        (!full && i < 9) ? el('span', {class: 'proto-c-chip-num'}, [String(i + 1)]) : null,
                        iconSpan(lk),
                        it.more ? 'All tools' : nameOf(it.tool)
                    ].filter(Boolean));
                }
                if (full) {
                    // Every tool is too many for a ring: a two-column sheet at the pointer, picked by click.
                    const modesCol = el('div', {class: 'proto-c-allcol'}, [el('div', {class: 'proto-c-allhead'}, ['Modes'])]);
                    const combiCol = el('div', {class: 'proto-c-allcol'}, [el('div', {class: 'proto-c-allhead'}, ['Composite'])]);
                    pie.chips = pie.items.map(function(it, i) {
                        const chip = makeChip(it, i);
                        (it.tool && it.tool.combi ? combiCol : modesCol).appendChild(chip);
                        return chip;
                    });
                    pie.grid = el('div', {class: 'proto-c-allgrid'}, [modesCol, combiCol]);
                    pieRoot.appendChild(pie.grid);
                } else {
                    pie.chips = pie.items.map(function(it, i) {
                        // Start at the top and go clockwise.
                        const a = -Math.PI / 2 + i * 2 * Math.PI / n;
                        it.angle = a;
                        const chip = makeChip(it, i, ';left:' + Math.round(Math.cos(a) * radius) + 'px;top:' +
                            Math.round(Math.sin(a) * radius) + 'px');
                        // Anchor a chip on its inner end, so a long name grows away from the centre.
                        const cos = Math.cos(a);
                        chip.classList.add(cos > 0.3 ? 'proto-c-chip-r' : cos < -0.3 ? 'proto-c-chip-l' : 'proto-c-chip-c');
                        pieRoot.appendChild(chip);
                        return chip;
                    });
                }
                pieRoot.style.left = pie.cx + 'px';
                pieRoot.style.top = pie.cy + 'px';
                pieRoot.classList.toggle('proto-c-pie-full', !!full);
                pieRoot.classList.remove('proto-c-hidden');
                pieCentre.textContent = full ? '' : kitInfo.genre;
                if (pie.grid) {
                    // Keep the sheet inside the window.
                    const r = pie.grid.getBoundingClientRect();
                    const dx = Math.max(8 - r.left, Math.min(0, window.innerWidth - 8 - r.right));
                    const dy = Math.max(8 - r.top, Math.min(0, window.innerHeight - 64 - r.bottom));
                    pie.grid.style.marginLeft = dx + 'px';
                    pie.grid.style.marginTop = dy + 'px';
                }
                ring.classList.add('proto-c-hidden');
                hideLabel();
            }

            function closePie() {
                pie.open = false;
                pieRoot.classList.add('proto-c-hidden');
                ring.classList.toggle('proto-c-hidden', !pointer.inside);
            }

            function pieHover() {
                const dx = pointer.x - pie.cx;
                const dy = pointer.y - pie.cy;
                const d = Math.hypot(dx, dy);
                if (d > 8) {
                    pie.moved = true;
                }
                let hot = -1;
                if (d > 26 && !pie.full) {
                    const a = Math.atan2(dy, dx);
                    let best = Infinity;
                    pie.items.forEach(function(it, i) {
                        let diff = Math.abs(a - it.angle) % (2 * Math.PI);
                        diff = Math.min(diff, 2 * Math.PI - diff);
                        if (diff < best) {
                            best = diff;
                            hot = i;
                        }
                    });
                }
                pie.hot = hot;
                pie.chips.forEach(function(c, i) {
                    c.classList.toggle('proto-c-chip-hot', i === hot);
                });
            }

            function choose(i) {
                const it = pie.items[i];
                if (!it) {
                    return;
                }
                if (it.more) {
                    openPie(true, pie.via);
                    return;
                }
                closePie();
                applyTool(it.tool);
            }

            function swapPrevious() {
                if (prevTool) {
                    applyTool(prevTool);
                } else {
                    toast('No previous tool yet');
                }
            }

            // ---- Input: wheel, keys, middle button --------------------------------------------------------------
            let wheelAcc = 0;
            let wheelAt = 0;
            window.addEventListener('wheel', function(e) {
                if (e.ctrlKey || (e.target.closest && e.target.closest('.proto-c-tab, #proto-switcher, .swal2-container, .modal'))) {
                    return;
                }
                e.preventDefault();
                const d = e.deltaY || e.deltaX;
                const now = Date.now();
                if (now - wheelAt > 250) {
                    wheelAcc = 0;
                }
                wheelAcc += d;
                // One notch is ~100 on a mouse; a trackpad sends many small deltas. One step per 150 ms at most.
                if (Math.abs(wheelAcc) >= 60 && now - wheelAt > 150) {
                    const dir = wheelAcc > 0 ? 1 : -1;
                    wheelAcc = 0;
                    wheelAt = now;
                    if (e.shiftKey) {
                        rotateDial(dir);
                    } else {
                        rotateTool(dir);
                    }
                } else if (Math.abs(wheelAcc) < 60) {
                    wheelAt = wheelAt || now;
                }
            }, {passive: false, capture: true});

            function typing(e) {
                const tag = e.target && e.target.tagName;
                return tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' ||
                    !!document.querySelector('.swal2-container') ||
                    Array.from(document.querySelectorAll('.modal')).some(function(m) {
                        return m.offsetParent !== null;
                    });
            }

            const ROTATE = {']': [rotateTool, 1], '[': [rotateTool, -1], '}': [rotateDial, 1], '{': [rotateDial, -1]};
            window.addEventListener('keydown', function(e) {
                if (typing(e)) {
                    return;
                }
                if (e.key === ' ' || e.code === 'Space') {
                    e.preventDefault();
                    e.stopImmediatePropagation();
                    if (!e.repeat && !pie.open) {
                        openPie(false, 'space');
                    }
                    return;
                }
                if (pie.open) {
                    if (/^[1-9]$/.test(e.key) && !pie.full) {
                        e.preventDefault();
                        e.stopImmediatePropagation();
                        choose(parseInt(e.key, 10) - 1);
                        return;
                    }
                    if (e.key === 'Escape') {
                        e.preventDefault();
                        e.stopImmediatePropagation();
                        closePie();
                        return;
                    }
                }
                if (ROTATE[e.key] && !e.ctrlKey && !e.altKey && !e.metaKey) {
                    e.preventDefault();
                    e.stopImmediatePropagation(); // keep Penpa+ from typing the bracket
                    ROTATE[e.key][0](ROTATE[e.key][1]);
                    return;
                }
                if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
                    e.preventDefault();
                    e.stopImmediatePropagation();
                    doCheck();
                    return;
                }
                if (e.key === 'Shift' || e.key === 'Control') {
                    if (B.getMode().mode === 'sudoku') {
                        heldMod = true;
                    }
                } else {
                    lastKeyboard = Date.now();
                }
                if ((e.ctrlKey || e.metaKey) && !e.altKey) {
                    const k = e.key.toLowerCase();
                    if (k === 'z' && !e.shiftKey) {
                        toast('↶ Undo');
                    } else if (k === 'y' || (k === 'z' && e.shiftKey)) {
                        toast('↷ Redo');
                    }
                }
            }, true);
            window.addEventListener('keyup', function(e) {
                if (e.key === ' ' || e.code === 'Space') {
                    if (typing(e)) {
                        return;
                    }
                    e.preventDefault();
                    e.stopImmediatePropagation();
                    if (pie.open && pie.via === 'space' && !pie.full) { // the All tools sheet stays until a click or Esc
                        if (pie.hot >= 0) {
                            choose(pie.hot);
                        } else if (!pie.moved && Date.now() - pie.at < 300 && !pie.full) {
                            closePie();
                            swapPrevious(); // a quick tap: back to the previous tool
                        } else {
                            closePie();
                        }
                    }
                    return;
                }
                if (e.key === 'Shift' || e.key === 'Control') {
                    heldMod = false;
                    requestAnimationFrame(render);
                }
            }, true);
            window.addEventListener('blur', function() {
                heldMod = false;
                if (pie.open) {
                    closePie();
                }
            });

            // Middle button: press-drag-release onto a slice, or click to open and click a slice.
            window.addEventListener('mousedown', function(e) {
                if (e.button === 1 && !(e.target.closest && e.target.closest('.proto-c-tab, #proto-switcher'))) {
                    e.preventDefault();
                    e.stopImmediatePropagation();
                    if (pie.open) {
                        closePie();
                    } else {
                        openPie(false, 'middle');
                    }
                } else if (pie.open && e.button !== 1 && !(e.target.closest && e.target.closest('.proto-c-pie'))) {
                    // A click outside the pie closes it and does not reach the board.
                    e.preventDefault();
                    e.stopImmediatePropagation();
                    closePie();
                }
            }, true);
            window.addEventListener('mouseup', function(e) {
                if (e.button === 1 && pie.open && pie.via === 'middle' && pie.hot >= 0 && Date.now() - pie.at > 150) {
                    e.preventDefault();
                    choose(pie.hot);
                }
            }, true);
            window.addEventListener('auxclick', function(e) {
                if (e.button === 1) {
                    e.preventDefault();
                }
            }, true);

            // ---- The corner tab: rules, timer, undo/redo/check, keys -------------------------------------------
            const info = B.getInfo();
            const tabTimer = el('span', {class: 'proto-c-timer'});
            const tabVerdict = el('div', {class: 'proto-c-verdict'});
            const tabKit = el('div', {class: 'proto-c-toollist'});
            const rules = el('div', {class: 'proto-c-rules'});
            rules.innerHTML = info.rules || '<i>No rules given.</i>';

            function btn(label, title, fn) {
                return el('button', {class: 'proto-c-btn', type: 'button', title: title, onclick: fn}, [label]);
            }
            function doUndo() {
                B.undo();
                toast('↶ Undo');
            }
            function doRedo() {
                B.redo();
                toast('↷ Redo');
            }
            function doCheck() {
                const v = B.check();
                let text;
                let kind;
                if (!v.hasAnswerCheck) {
                    text = 'This puzzle has no answer check';
                    kind = 'none';
                } else if (v.solved) {
                    text = 'Solved!';
                    kind = 'solved';
                } else {
                    text = 'Not solved yet';
                    kind = 'wrong';
                }
                tabVerdict.textContent = text;
                tabVerdict.className = 'proto-c-verdict proto-c-verdict-' + kind;
                toast(text, kind);
            }
            const undoBtn = btn('↶ Undo', 'Ctrl+Z', doUndo);
            const redoBtn = btn('↷ Redo', 'Ctrl+Y', doRedo);
            const checkBtn = btn('✓ Check', 'Ctrl+Enter', doCheck);

            const panel = el('div', {class: 'proto-c-panel'}, [
                el('div', {class: 'proto-c-title'}, [info.title || 'Untitled']),
                el('div', {class: 'proto-c-author'}, [info.author ? 'by ' + info.author : '']),
                rules,
                el('div', {class: 'proto-c-row'}, [undoBtn, redoBtn, checkBtn,
                    btn('⚙', 'Settings', function() {
                        B.openSettings();
                    })]),
                tabVerdict,
                el('div', {class: 'proto-c-sub'}, ['Tools for ' + kitInfo.genre]),
                tabKit,
                el('div', {class: 'proto-c-keys'}, [
                    el('div', {}, [el('kbd', {}, ['hold Space']), ' pie: flick + release, or its digit']),
                    el('div', {}, [el('kbd', {}, ['tap Space']), ' back to the previous tool']),
                    el('div', {}, [el('kbd', {}, ['wheel']), ' or ', el('kbd', {}, ['[']), el('kbd', {}, [']']), ' next tool']),
                    el('div', {}, [el('kbd', {}, ['Shift+wheel']), ' or ', el('kbd', {}, ['{']), el('kbd', {}, ['}']),
                        ' colour / variant']),
                    el('div', {}, [el('kbd', {}, ['middle click']), ' pie']),
                    el('div', {}, [el('kbd', {}, ['Ctrl+Z']), ' undo  ', el('kbd', {}, ['Ctrl+Y']), ' redo  ',
                        el('kbd', {}, ['Ctrl+Enter']), ' check'])
                ])
            ]);
            const tab = el('div', {class: 'proto-c-tab'}, [
                el('div', {class: 'proto-c-handle'}, [el('span', {class: 'proto-c-handle-q'}, ['?']), tabTimer]),
                panel
            ]);
            document.body.appendChild(tab);
            // Open on a deliberate hover of the handle (not a pass-through); close soon after the pointer leaves.
            const handle = tab.firstChild;
            let openTimer = null;
            handle.addEventListener('mouseenter', function() {
                clearTimeout(openTimer);
                openTimer = setTimeout(function() {
                    tab.classList.add('proto-c-open');
                }, 250);
            });
            tab.addEventListener('mouseenter', function() {
                if (tab.classList.contains('proto-c-open')) {
                    clearTimeout(openTimer);
                }
            });
            tab.addEventListener('mouseleave', function() {
                clearTimeout(openTimer);
                openTimer = setTimeout(function() {
                    tab.classList.remove('proto-c-open');
                }, 200);
            });

            function tabRender(st) {
                undoBtn.disabled = !st.canUndo;
                redoBtn.disabled = !st.canRedo;
                checkBtn.classList.toggle('proto-c-hidden', !st.hasAnswerCheck);
                tab.classList.toggle('proto-c-tab-solved', st.solved);
                tabKit.textContent = '';
                const cur = indexIn(kit);
                kit.forEach(function(t, i) {
                    const lk = lookOf(t);
                    tabKit.appendChild(el('div', {class: 'proto-c-tool' + (i === cur ? ' proto-c-tool-cur' : ''),
                        style: '--c:' + lk.color, onclick: function() {
                            applyTool(t);
                        }}, [el('span', {class: 'proto-c-tool-num'}, [String(i + 1)]), iconSpan(lk),
                        el('span', {}, [nameOf(t), el('small', {}, [lk.hint || ''])])]));
                });
            }
            B.onTimer(function(t) {
                tabTimer.textContent = t.text;
            });
            tabTimer.textContent = B.getTimer().text;

            // ---- Wire up ---------------------------------------------------------------------------------------
            B.onChange(function(state, reason) {
                if (reason === 'resize') {
                    requestAnimationFrame(renderPip);
                }
                render();
            });
            window.addEventListener('resize', fitBoard);
            fitBoard();
            requestAnimationFrame(function() {
                allTools = buildAll();
                // Start on the kit's first tool unless the link already starts on one of the kit's tools.
                if (indexIn(kit) < 0 && kit.length) {
                    applyTool(kit[0]);
                }
                render();
                // Introduce the ring once, at the board's centre, until the mouse moves.
                const r = ctx.canvas.getBoundingClientRect();
                if (pointer.x < 0) {
                    pointer.x = r.left + r.width / 2;
                    pointer.y = r.top + r.height / 2;
                    placeRing();
                    ring.classList.remove('proto-c-hidden');
                }
                toast(kitInfo.genre + ': hold Space for tools');
                flash();
            });
        }
    };
})();
