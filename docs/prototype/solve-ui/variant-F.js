/*
 * PROTOTYPE (throwaway, branch prototype/solve-ui): solve-UI variant F, "Live rules".
 *
 * Idea: the rules are a living document beside the board, and the document is the primary chrome. The rules text is
 * parsed and its phrases are linked to the board: hovering "killer cages", "thermometers", "arrows", "black dots",
 * "rows", "islands", a clue type or a number spotlights every matching element on the board; clicking a phrase pins
 * the spotlight while you solve. The link runs both ways: hovering the board lights up the phrases (and the sentence)
 * that talk about what is under the cursor. Elements found on the board that the rules never name are listed under
 * "On this board" (the fallback by clue-type layer). Some phrases are live: the loop, shaded cells, islands, 2x2
 * blocks and digit values are recomputed from the solver's own marks after every change. Modes are a compact row
 * under the document.
 *
 * Claim tested: solvers constantly cross-reference rules and board, so the rules deserve to be the main chrome and
 * should point at the board.
 *
 * Bridge gaps worked around here (reads `pu` directly): the board's clue model (pu.pu_q: number, symbol, thermo,
 * arrows, killercages, line, lineE, surface), the solver's marks (pu.pu_a), the cell list (pu.centerlist) and cell
 * geometry (pu.point[i].surround / .adjacent / .x / .y), and the legacy style swatch colours (`<id>_lb`).
 * Test hook: window.ProtoF.setRules(html) swaps the rules text in memory (no such call in the bridge).
 */
(function() {
    'use strict';

    const SVGNS = 'http://www.w3.org/2000/svg';
    const SHADED_STYLES = new Set([1, 4, 8]); // Surface DG, BK, GR count as shaded; LG and colours do not
    const COLOR_NAMES = {1: 'white', 2: 'black', 3: 'grey'};

    // ---- Board model: kinds of elements a phrase can point at ---------------------------------------------------

    /** All the board's cells, in the grid. */
    function cells() {
        return pu.centerlist.slice();
    }

    function sharedEdgeKey(a, b) {
        const sa = pu.point[a].surround;
        const sb = new Set(pu.point[b].surround);
        const both = sa.filter(function(v) {
            return sb.has(v);
        });
        if (both.length !== 2) {
            return null;
        }
        return Math.min(both[0], both[1]) + ',' + Math.max(both[0], both[1]);
    }

    function isShaded(c) {
        const a = pu.pu_a.surface[c];
        const q = pu.pu_q.surface[c];
        return SHADED_STYLES.has(a) || SHADED_STYLES.has(q);
    }

    /** Connected components of `set` (cells) through adjacency, stopping at `blocked(a, b)`. */
    function components(set, blocked) {
        const seen = new Set();
        const out = [];
        set.forEach(function(start) {
            if (seen.has(start)) {
                return;
            }
            const comp = [];
            const stack = [start];
            seen.add(start);
            while (stack.length) {
                const c = stack.pop();
                comp.push(c);
                pu.point[c].adjacent.forEach(function(n) {
                    if (set.has(n) && !seen.has(n) && !(blocked && blocked(c, n))) {
                        seen.add(n);
                        stack.push(n);
                    }
                });
            }
            out.push(comp);
        });
        return out;
    }

    /** The value shown in a cell as a full digit (given or solver's), or null. */
    function cellValue(c) {
        const q = pu.pu_q.number[c];
        if (q && q[2] === '1' && q[0] !== '') {
            return {v: String(q[0]), given: true};
        }
        const a = pu.pu_a.number[c];
        if (a && a[2] === '1' && a[0] !== '') {
            return {v: String(a[0]), given: false};
        }
        return null;
    }

    /** A cell's k-th corner sub-point (where numberS keeps corner marks and killer sums; square grids). */
    function subIndex(c, k) {
        return 4 * pu.nx0 * pu.ny0 + 4 * c + k;
    }

    /** Pencil marks in a cell (centre marks stored as a digit string, corner marks in numberS), as one string. */
    function cellMarks(c) {
        let s = '';
        const a = pu.pu_a.number[c];
        if (a && a[2] !== '1') {
            s += String(a[0]);
        }
        for (let k = 0; k < 4; k++) {
            const m = pu.pu_a.numberS[subIndex(c, k)];
            if (m) {
                s += String(m[0]);
            }
        }
        return s;
    }

    function symbolFamily(name) {
        const m = /^([a-z]+)/.exec(name || '');
        return m ? m[1] : 'symbol';
    }

    /**
     * Build the catalog of kinds. A kind: {id, label, live, items()} where items() returns
     * [{cells, pts, path, label, tone}] in board point indices.
     */
    function buildCatalog() {
        const q = pu.pu_q;
        const kinds = {};
        const add = function(k) {
            kinds[k.id] = k;
        };
        const cellSet = new Set(cells());
        const isSquare = pu.gridtype === 'square' || pu.gridtype === 'sudoku' || pu.gridtype === 'kakuro';

        // Givens: full-size numbers in the clue layer.
        const givens = Object.keys(q.number).map(Number).filter(function(c) {
            return cellSet.has(c) && q.number[c][0] !== '';
        });
        if (givens.length) {
            add({id: 'givens', label: 'given numbers', items: function() {
                return givens.map(function(c) {
                    return {cells: [c]};
                });
            }});
        }

        // Shapes in the clue layer, grouped by family, colour and whether they sit in cells or on edges/vertices.
        const groups = {};
        Object.keys(q.symbol).forEach(function(k) {
            const idx = Number(k);
            const s = q.symbol[k];
            const fam = symbolFamily(s[1]);
            const onCell = cellSet.has(idx);
            const color = COLOR_NAMES[s[0]] || ('style ' + s[0]);
            const id = 'sym:' + fam + ':' + color + ':' + (onCell ? 'cell' : 'edge');
            if (!groups[id]) {
                const word = fam === 'circle' ? (onCell ? 'circles' : 'dots') : fam + 's';
                groups[id] = {id: id, fam: fam, color: color, onCell: onCell, label: color + ' ' + word, idx: []};
            }
            groups[id].idx.push(idx);
        });
        Object.keys(groups).forEach(function(id) {
            const g = groups[id];
            add({id: id, label: g.label, fam: g.fam, color: g.color, onCell: g.onCell, items: function() {
                return g.idx.map(function(i) {
                    return g.onCell ? {cells: [i]} : {pts: [i]};
                });
            }});
        });

        const lineKinds = [['thermo', 'thermometers'], ['nobulbthermo', 'bulbless thermometers'], ['arrows', 'arrows']];
        lineKinds.forEach(function(pair) {
            const list = (q[pair[0]] || []).filter(function(a) {
                return a && a.length;
            });
            if (!list.length) {
                return;
            }
            add({id: pair[0], label: pair[1], items: function() {
                return list.map(function(a) {
                    return {cells: a.slice(), path: a.slice()};
                });
            }});
            if (pair[0] !== 'nobulbthermo') {
                add({id: pair[0] + 'Bulb', label: pair[0] === 'arrows' ? 'arrow circles' : 'thermometer bulbs',
                    items: function() {
                        return list.map(function(a) {
                            return {cells: [a[0]]};
                        });
                    }});
            }
        });

        const cages = (q.killercages || []).filter(function(a) {
            return a && a.length;
        });
        if (cages.length) {
            add({id: 'cages', label: 'cages', items: function() {
                return cages.map(function(a) {
                    return {cells: a.slice()};
                });
            }});
        }

        const givenLines = Object.keys(q.line);
        if (givenLines.length) {
            add({id: 'givenLines', label: 'drawn lines', items: function() {
                return lineGroups(q.line);
            }});
        }

        const givenShade = Object.keys(q.surface).map(Number).filter(function(c) {
            return cellSet.has(c);
        });
        if (givenShade.length) {
            add({id: 'givenShade', label: 'shaded clue cells', items: function() {
                return givenShade.map(function(c) {
                    return {cells: [c]};
                });
            }});
        }

        // Regions: flood fill through thick borders (lineE) in the clue layer; only when it splits the grid.
        if (Object.keys(q.lineE).length) {
            const regions = components(cellSet, function(a, b) {
                const key = sharedEdgeKey(a, b);
                return key && q.lineE[key];
            });
            if (regions.length > 1 && regions.length < cellSet.size) {
                add({id: 'regions', label: 'regions', scoped: true, items: function() {
                    return regions.map(function(r, i) {
                        return {cells: r, tone: i % 2};
                    });
                }});
            }
        }

        if (isSquare) {
            const byKey = function(axis) {
                const m = new Map();
                cellSet.forEach(function(c) {
                    const k = Math.round(pu.point[c][axis] * 100);
                    if (!m.has(k)) {
                        m.set(k, []);
                    }
                    m.get(k).push(c);
                });
                return Array.from(m.keys()).sort(function(a, b) {
                    return a - b;
                }).map(function(k, i) {
                    return {cells: m.get(k), tone: i % 2};
                });
            };
            add({id: 'rows', label: 'rows', scoped: true, items: function() {
                return byKey('y');
            }});
            add({id: 'cols', label: 'columns', scoped: true, items: function() {
                return byKey('x');
            }});
        }

        // Live kinds, from the solver's own marks.
        add({id: 'loop', label: 'your lines', live: true, items: function() {
            return lineGroups(pu.pu_a.line);
        }});
        add({id: 'shaded', label: 'shaded cells', live: true, items: function() {
            return Array.from(cellSet).filter(isShaded).map(function(c) {
                return {cells: [c]};
            });
        }});
        // Islands: cells known to be unshaded (a clue, or a solver's dot/mark) joined through each other. Unknown
        // cells do not join islands, so the count reads "known so far" while solving.
        add({id: 'islands', label: 'unshaded islands', live: true, items: function() {
            const open = new Set(Array.from(cellSet).filter(function(c) {
                return !isShaded(c) && ((q.number[c] && q.number[c][0] !== '') || pu.pu_a.symbol[c]);
            }));
            return components(open).map(function(comp, i) {
                const clue = comp.map(function(c) {
                    return q.number[c] && q.number[c][0];
                }).filter(function(v) {
                    return v !== undefined && v !== '';
                });
                const target = clue.length === 1 ? Number(clue[0]) : null;
                return {cells: comp, tone: i % 2, corner: comp.length + (target !== null ? '/' + target : ''),
                    ok: target === comp.length, bad: clue.length > 1 || (target !== null && comp.length > target)};
            });
        }});
        if (isSquare) {
            add({id: 'block2', label: '2x2 all-shaded blocks', live: true, items: function() {
                const out = [];
                cellSet.forEach(function(c) {
                    const right = find(c, 1, 0);
                    const down = find(c, 0, 1);
                    const diag = down != null ? find(down, 1, 0) : null;
                    if (right != null && down != null && diag != null &&
                        [c, right, down, diag].every(isShaded)) {
                        out.push({cells: [c, right, down, diag], bad: true});
                    }
                });
                return out;
            }});
        }

        /** The cell next to c at offset (dx, dy) in cell steps, through adjacency (square grids). */
        function find(c, dx, dy) {
            const p = pu.point[c];
            const hit = pu.point[c].adjacent.filter(function(n) {
                const q2 = pu.point[n];
                return cellSet.has(n) && Math.sign(q2.x - p.x) === dx && Math.sign(q2.y - p.y) === dy;
            });
            return hit.length ? hit[0] : null;
        }

        return kinds;
    }

    /** Given lines or the solver's lines ("a,b" keys between points) as connected paths. */
    function lineGroups(lines) {
        const segs = Object.keys(lines).map(function(k) {
            return k.split(',').map(Number);
        });
        if (!segs.length) {
            return [];
        }
        // Union-find on the segments' end points: one item per connected line.
        const parent = {};
        const root = function(a) {
            while (parent[a] !== a) {
                parent[a] = parent[parent[a]];
                a = parent[a];
            }
            return a;
        };
        segs.forEach(function(s) {
            s.forEach(function(p) {
                if (parent[p] === undefined) {
                    parent[p] = p;
                }
            });
            parent[root(s[0])] = root(s[1]);
        });
        const groups = new Map();
        segs.forEach(function(s) {
            const r = root(s[0]);
            if (!groups.has(r)) {
                groups.set(r, {segs: [], cells: new Set()});
            }
            const g = groups.get(r);
            g.segs.push(s);
            s.forEach(function(p) {
                if (pu.point[p] && pu.point[p].type === 0) {
                    g.cells.add(p);
                }
            });
        });
        return Array.from(groups.values()).map(function(g) {
            return {segs: g.segs, cells: Array.from(g.cells), noFill: true};
        });
    }

    // ---- Phrase matcher -----------------------------------------------------------------------------------------

    /**
     * Phrase rules: [regex source, resolver(match, catalog, subject) -> kind ids]. At each text position the longest
     * match wins. A phrase is linked only if it resolves to at least one kind on this board (live kinds always exist).
     * `subject` is the last clue type named earlier in the same paragraph (cages, arrows, thermo, givenLines), so
     * generic words ("sum", "clue", "circle") point at that paragraph's clue type.
     */
    const PHRASES = [
        ['killer cages?|cages?', function() {
            return ['cages'];
        }],
        ['cage sums?', function() {
            return ['cages'];
        }],
        ['sums?|totals?', function(m, cat, subject) {
            return subject === 'arrows' || subject === 'givenLines' ? [subject] : ['cages'];
        }],
        ['thermo(?:meter)?s?', function() {
            return ['thermo', 'nobulbthermo'];
        }],
        ['bulbs?', function(m, cat, subject) {
            return subject === 'arrows' ? ['arrowsBulb'] : ['thermoBulb'];
        }],
        ['arrows?', function() {
            return ['arrows'];
        }],
        ['kropki(?: dots?)?', function(m, cat) {
            return symbolKinds(cat, null, 'circle', false);
        }],
        ['(?:(black|white|grey|gray|filled|shaded|open|hollow)\\s+)?(circles?|pearls?|dots?|discs?)', function(m, cat,
            subject) {
            const color = colorWord(m[1]);
            if (!color && /circle/i.test(m[2]) && (subject === 'arrows' || subject === 'thermo')) {
                return [subject === 'arrows' ? 'arrowsBulb' : 'thermoBulb'];
            }
            const onCell = /dot/i.test(m[2]) ? false : true;
            let ids = symbolKinds(cat, color, 'circle', onCell);
            if (!ids.length) {
                ids = symbolKinds(cat, color, 'circle', null);
            }
            if (!ids.length && !color) {
                ids = cat.arrowsBulb ? ['arrowsBulb'] : ['thermoBulb'];
            }
            return ids;
        }],
        ['(?:(black|white|grey|gray)\\s+)?(squares?|stars?|triangles?|crosses?)', function(m, cat) {
            const fam = m[2].toLowerCase().replace(/e?s$/, '').replace(/cross$/, 'cross');
            return symbolKinds(cat, colorWord(m[1]), fam, null);
        }],
        ['given (?:digits?|numbers?)|givens|clues?|clue numbers?|numbered cells?|numbers?', function(m, cat, subject) {
            return subject === 'cages' && /clue/i.test(m[0]) ? ['cages'] : ['givens'];
        }],
        ['digits?', function() {
            return ['givens', 'digits'];
        }],
        ['rows?', function() {
            return ['rows'];
        }],
        ['columns?|cols?', function() {
            return ['cols'];
        }],
        ['(?:\\d+\\s*[x×]\\s*\\d+\\s+)?(?:boxe?s?|regions?|blocks?|nonets?|outlined areas?)', function() {
            return ['regions'];
        }],
        ['2\\s*[x×]\\s*2', function() {
            return ['block2'];
        }],
        ['(?:(?:green|purple|pink|blue|red|orange|yellow|grey|gray|black|teal)\\s+)?(?:loops?|paths?|lines?)', function() {
            return ['givenLines', 'loop'];
        }],
        ['whispers?|renbans?|palindromes?|region sum lines?|between lines?|lockout lines?', function() {
            return ['givenLines'];
        }],
        ['unshaded (?:islands?|areas?|regions?|cells?)|islands?', function() {
            return ['islands'];
        }],
        ['shaded cells?|shade(?:d)?|black cells?|blackened cells?|walls?', function() {
            return ['shaded'];
        }],
        ['\\d+', function(m) {
            return ['v:' + m[0]];
        }]
    ];
    const COMPILED = PHRASES.map(function(p) {
        return {re: new RegExp('(?:' + p[0] + ')(?![A-Za-z0-9])', 'iy'), resolve: p[1]};
    });

    function colorWord(w) {
        if (!w) {
            return null;
        }
        w = w.toLowerCase();
        if (w === 'filled' || w === 'shaded') {
            return 'black';
        }
        if (w === 'open' || w === 'hollow') {
            return 'white';
        }
        return w === 'gray' ? 'grey' : w;
    }

    function symbolKinds(cat, color, fam, onCell) {
        return Object.keys(cat).filter(function(id) {
            const k = cat[id];
            return id.indexOf('sym:') === 0 && k.fam === fam && (!color || k.color === color) &&
                (onCell === null || k.onCell === onCell);
        });
    }

    /** Value kinds ("v:5") are made on demand: every cell showing that digit, and pencil marks holding it. */
    function valueKind(n) {
        return {id: 'v:' + n, label: 'every ' + n, live: true, items: function() {
            const out = [];
            cells().forEach(function(c) {
                const v = cellValue(c);
                if (v && v.v === n) {
                    out.push({cells: [c]});
                } else if (n.length === 1 && cellMarks(c).indexOf(n) >= 0) {
                    out.push({cells: [c], faint: true});
                }
            });
            return out;
        }};
    }

    function digitsKind() {
        return {id: 'digits', label: 'your digits', live: true, items: function() {
            return cells().filter(function(c) {
                const v = cellValue(c);
                return v && !v.given;
            }).map(function(c) {
                return {cells: [c]};
            });
        }};
    }

    const SUBJECTS = new Set(['cages', 'arrows', 'thermo', 'givenLines']);

    /** Split text into [{text}|{text, kinds}] tokens using the phrase rules. */
    function tokenize(text, cat, para) {
        const out = [];
        let plain = '';
        let i = 0;
        while (i < text.length) {
            const prev = i > 0 ? text[i - 1] : ' ';
            let best = null;
            if (!/[A-Za-z0-9]/.test(prev)) {
                COMPILED.forEach(function(p) {
                    p.re.lastIndex = i;
                    const m = p.re.exec(text);
                    if (m && m[0].length && (!best || m[0].length > best.m[0].length)) {
                        best = {m: m, p: p};
                    }
                });
            }
            let ids = null;
            if (best) {
                ids = best.p.resolve(best.m, cat, para.subject).filter(function(id) {
                    if (id.indexOf('v:') === 0 && !cat[id]) {
                        cat[id] = valueKind(id.slice(2));
                    }
                    if (id === 'digits' && !cat[id]) {
                        cat[id] = digitsKind();
                    }
                    return !!cat[id];
                });
            }
            if (ids && ids.length) {
                if (plain) {
                    out.push({text: plain});
                    plain = '';
                }
                out.push({text: best.m[0], kinds: ids});
                ids.forEach(function(id) {
                    if (SUBJECTS.has(id)) {
                        para.subject = id;
                    }
                });
                i += best.m[0].length;
            } else {
                plain += text[i];
                i++;
            }
        }
        if (plain) {
            out.push({text: plain});
        }
        return out;
    }

    // ---- The variant --------------------------------------------------------------------------------------------

    window.PrototypeVariants = window.PrototypeVariants || {};
    window.PrototypeVariants.F = {
        name: 'Live rules',

        /** @param {object} ctx see README.md, "The variant contract" */
        mount(ctx) {
            const bridge = ctx.bridge;
            const el = ctx.helpers.el;
            let catalog = buildCatalog();
            let hoverKinds = null;   // kinds under the mouse in the document
            let pinned = [];         // kinds pinned by click
            let boardHover = [];     // kinds under the mouse on the board

            // Layout: the document on the left (rules, legend, check), the mode strip under it, the board right.
            const docBody = el('div', {class: 'proto-f-doc-body'});
            const rulesBox = el('div', {class: 'proto-f-rules'});
            const legendBox = el('div', {class: 'proto-f-legend'});
            const statusBox = el('div', {class: 'proto-f-status'});
            const underCursor = el('div', {class: 'proto-f-under'}, ['Hover the board to see which rule talks about it.']);
            const titleEl = el('div', {class: 'proto-f-title'});
            const bylineEl = el('div', {class: 'proto-f-byline'});
            const modeRow = el('div', {class: 'proto-f-modes'});
            const subRow = el('div', {class: 'proto-f-subs'});
            const toolRow = el('div', {class: 'proto-f-tools'});
            const doc = el('div', {class: 'proto-f-doc'}, [
                el('div', {class: 'proto-f-doc-head'}, [titleEl, bylineEl]),
                docBody,
                el('div', {class: 'proto-f-strip'}, [modeRow, subRow, toolRow])
            ]);
            docBody.appendChild(el('div', {class: 'proto-f-h2'}, ['Rules']));
            docBody.appendChild(rulesBox);
            docBody.appendChild(underCursor);
            docBody.appendChild(el('div', {class: 'proto-f-h2'}, ['On this board']));
            docBody.appendChild(legendBox);
            docBody.appendChild(el('div', {class: 'proto-f-h2'}, ['Answer check']));
            docBody.appendChild(statusBox);

            const stage = el('div', {class: 'proto-f-stage'});
            const boardWrap = el('div', {class: 'proto-f-board'});
            stage.appendChild(boardWrap);
            const root = el('div', {class: 'proto-f-root'}, [doc, stage]);
            document.body.appendChild(root);
            ctx.helpers.adoptBoard(boardWrap);
            ctx.helpers.hideLegacy();

            const svg = document.createElementNS(SVGNS, 'svg');
            svg.setAttribute('class', 'proto-f-overlay');
            document.body.appendChild(svg);

            // ---- Board size ----
            function fitBoard() {
                const s0 = UserSettings.displaysize;
                const r = ctx.canvas.getBoundingClientRect();
                const avail = stage.getBoundingClientRect();
                if (!r.width || !avail.width) {
                    return;
                }
                const unitsX = r.width / s0;
                const unitsY = r.height / s0;
                const px = Math.max(12, Math.min(90, Math.floor(Math.min((avail.width - 90) / unitsX,
                    (avail.height - 60 - 60) / unitsY))));
                if (px !== s0) {
                    bridge.setCellSize(px);
                }
            }

            // ---- Rules document ----
            function renderInfo() {
                const info = bridge.getInfo();
                titleEl.textContent = info.title || 'Untitled puzzle';
                const tags = bridge.genreTags();
                bylineEl.textContent = [info.author ? 'by ' + info.author : '', tags.length ? tags.join(', ') : '']
                    .filter(Boolean).join(' · ');
                rulesBox.innerHTML = '';
                const rules = info.rules || '';
                if (!rules.trim()) {
                    rulesBox.appendChild(el('p', {class: 'proto-f-empty'},
                        ['This puzzle has no rules text. The board’s clue types are listed below.']));
                }
                // Paragraphs split on <br>; each sentence is its own span so a board hover can light it.
                const tpl = document.createElement('template');
                tpl.innerHTML = rules.replace(/<br\s*\/?>/gi, '\n');
                const text = tpl.content.textContent;
                text.split(/\n+/).forEach(function(para) {
                    if (!para.trim()) {
                        return;
                    }
                    const p = el('p');
                    const paraCtx = {subject: null};
                    (para.match(/[^.!?;:]+[.!?;:]*\s*/g) || [para]).forEach(function(sentence) {
                        const sEl = el('span', {class: 'proto-f-sentence'});
                        tokenize(sentence, catalog, paraCtx).forEach(function(tok) {
                            if (!tok.kinds) {
                                sEl.appendChild(document.createTextNode(tok.text));
                                return;
                            }
                            const link = el('span', {class: 'proto-f-link', tabindex: '0',
                                'data-kinds': tok.kinds.join(' ')}, [tok.text]);
                            const badge = el('sup', {class: 'proto-f-count'});
                            link.appendChild(badge);
                            link.addEventListener('mouseenter', function() {
                                setHover(tok.kinds);
                            });
                            link.addEventListener('mouseleave', function() {
                                setHover(null);
                            });
                            link.addEventListener('click', function() {
                                togglePin(tok.kinds);
                            });
                            sEl.appendChild(link);
                        });
                        p.appendChild(sEl);
                    });
                    rulesBox.appendChild(p);
                });
            }

            function mentioned() {
                const set = new Set();
                rulesBox.querySelectorAll('.proto-f-link').forEach(function(l) {
                    l.dataset.kinds.split(' ').forEach(function(k) {
                        set.add(k);
                    });
                });
                return set;
            }

            function renderLegend() {
                legendBox.innerHTML = '';
                const said = mentioned();
                const ids = Object.keys(catalog).filter(function(id) {
                    const k = catalog[id];
                    if (id.indexOf('v:') === 0 || id === 'digits') {
                        return false;
                    }
                    // Live kinds and row/column scaffolding are listed only when the rules use them.
                    if ((k.live || k.scoped) && !said.has(id)) {
                        return false;
                    }
                    return true;
                });
                if (!ids.length) {
                    legendBox.appendChild(el('p', {class: 'proto-f-empty'}, ['No clue layer found.']));
                }
                ids.forEach(function(id) {
                    const k = catalog[id];
                    const chip = el('button', {class: 'proto-f-chip' + (said.has(id) ? '' : ' is-unmentioned'),
                        type: 'button', 'data-kinds': id,
                        title: said.has(id) ? 'Named in the rules' : 'On the board, but the rules never name it'}, [
                        el('span', {class: 'proto-f-chip-label'}, [k.label]),
                        el('span', {class: 'proto-f-chip-count'})
                    ]);
                    if (!said.has(id)) {
                        chip.appendChild(el('span', {class: 'proto-f-chip-flag'}, ['not in rules']));
                    }
                    chip.addEventListener('mouseenter', function() {
                        setHover([id]);
                    });
                    chip.addEventListener('mouseleave', function() {
                        setHover(null);
                    });
                    chip.addEventListener('click', function() {
                        togglePin([id]);
                    });
                    legendBox.appendChild(chip);
                });
            }

            function updateCounts() {
                document.querySelectorAll('.proto-f-root [data-kinds]').forEach(function(node) {
                    let n = 0;
                    node.dataset.kinds.split(' ').forEach(function(id) {
                        if (catalog[id]) {
                            // Pencil-mark hits are drawn faintly but not counted.
                            n += catalog[id].items().filter(function(it) {
                                return !it.faint;
                            }).length;
                        }
                    });
                    const live = node.dataset.kinds.split(' ').some(function(id) {
                        return catalog[id] && catalog[id].live;
                    });
                    const badge = node.querySelector('.proto-f-count, .proto-f-chip-count');
                    // Digit phrases ("1", "digits") are everywhere in sudoku rules; a count on each is noise.
                    const quiet = node.dataset.kinds.split(' ').every(function(id) {
                        return id.indexOf('v:') === 0 || id === 'digits' || id === 'givens';
                    }) && node.classList.contains('proto-f-link');
                    if (badge) {
                        badge.textContent = quiet ? '' : String(n);
                    }
                    node.classList.toggle('is-live', live);
                    node.classList.toggle('is-zero', n === 0);
                    const bad = node.dataset.kinds.split(' ').some(function(id) {
                        return catalog[id] && catalog[id].items().some(function(it) {
                            return it.bad;
                        });
                    });
                    node.classList.toggle('is-bad', bad);
                });
            }

            // ---- Highlight state ----
            function setHover(kinds) {
                hoverKinds = kinds;
                drawOverlay();
                markActive();
            }

            function togglePin(kinds) {
                const key = kinds.join(' ');
                pinned = pinned.join(' ') === key ? [] : kinds.slice();
                drawOverlay();
                markActive();
            }

            function markActive() {
                const active = new Set(hoverKinds || pinned);
                const under = new Set(boardHover);
                document.querySelectorAll('.proto-f-root [data-kinds]').forEach(function(node) {
                    const ids = node.dataset.kinds.split(' ');
                    node.classList.toggle('is-active', ids.some(function(i) {
                        return active.has(i);
                    }));
                    node.classList.toggle('is-pinned', pinned.length > 0 && ids.join(' ') === pinned.join(' '));
                    node.classList.toggle('is-under', ids.some(function(i) {
                        return under.has(i);
                    }));
                });
                rulesBox.querySelectorAll('.proto-f-sentence').forEach(function(s) {
                    s.classList.toggle('is-under', !!s.querySelector('.proto-f-link.is-under'));
                });
            }

            // ---- Overlay drawing (SVG in page coordinates, pointer-events: none) ----
            function pagePt(i) {
                const p = bridge.pointToPage(i);
                return {x: p.x - window.scrollX, y: p.y - window.scrollY};
            }

            function cellPoly(c) {
                return pu.point[c].surround.map(function(v) {
                    const p = pagePt(v);
                    return p.x.toFixed(1) + ',' + p.y.toFixed(1);
                }).join(' ');
            }

            function svgEl(tag, attrs) {
                const n = document.createElementNS(SVGNS, tag);
                Object.keys(attrs).forEach(function(k) {
                    n.setAttribute(k, attrs[k]);
                });
                return n;
            }

            /** Scope row/column/region kinds to the selection when there is one. */
            function scopeItems(kind, items) {
                if (!kind.scoped) {
                    return items;
                }
                const sel = bridge.getSelection().cells || [];
                if (!sel.length) {
                    return items;
                }
                const set = new Set(sel);
                const hit = items.filter(function(it) {
                    return it.cells.some(function(c) {
                        return set.has(c);
                    });
                });
                return hit.length ? hit : items;
            }

            function drawOverlay() {
                svg.innerHTML = '';
                const ids = hoverKinds || pinned;
                if (!ids || !ids.length) {
                    return;
                }
                const cr = ctx.canvas.getBoundingClientRect();
                const cellPx = UserSettings.displaysize;
                const defs = svgEl('defs', {});
                const mask = svgEl('mask', {id: 'proto-f-mask'});
                mask.appendChild(svgEl('rect', {x: cr.left, y: cr.top, width: cr.width, height: cr.height,
                    fill: 'white'}));
                defs.appendChild(mask);
                svg.appendChild(defs);
                // Hovering dims the rest of the board; a pinned spotlight only outlines, so solving under it stays legible.
                if (hoverKinds) {
                    svg.appendChild(svgEl('rect', {x: cr.left, y: cr.top, width: cr.width, height: cr.height,
                        class: 'proto-f-dim', mask: 'url(#proto-f-mask)'}));
                }
                const marks = svgEl('g', {class: hoverKinds ? 'is-hover' : 'is-pin'});
                svg.appendChild(marks);
                ids.forEach(function(id) {
                    const kind = catalog[id];
                    if (!kind) {
                        return;
                    }
                    scopeItems(kind, kind.items()).forEach(function(it) {
                        const cls = 'proto-f-item' + (it.tone ? ' tone' : '') + (it.bad ? ' bad' : '') +
                            (it.ok ? ' ok' : '') + (it.faint ? ' faint' : '');
                        (it.cells || []).forEach(function(c) {
                            if (!pu.point[c] || pu.point[c].type !== 0) {
                                return;
                            }
                            const poly = cellPoly(c);
                            mask.appendChild(svgEl('polygon', {points: poly, fill: 'black'}));
                            if (!it.noFill) {
                                marks.appendChild(svgEl('polygon', {points: poly, class: cls + ' cell'}));
                            }
                        });
                        (it.pts || []).forEach(function(i) {
                            const p = pagePt(i);
                            const r = Math.max(6, cellPx * 0.28);
                            mask.appendChild(svgEl('circle', {cx: p.x, cy: p.y, r: r, fill: 'black'}));
                            marks.appendChild(svgEl('circle', {cx: p.x, cy: p.y, r: r, class: cls + ' pt'}));
                        });
                        if (it.path && it.path.length > 1) {
                            marks.appendChild(svgEl('polyline', {points: it.path.map(function(i) {
                                const p = pagePt(i);
                                return p.x + ',' + p.y;
                            }).join(' '), class: cls + ' path'}));
                        }
                        (it.segs || []).forEach(function(s) {
                            const a = pagePt(s[0]);
                            const b = pagePt(s[1]);
                            marks.appendChild(svgEl('line', {x1: a.x, y1: a.y, x2: b.x, y2: b.y,
                                class: cls + ' seg'}));
                        });
                        if (it.corner && it.cells && it.cells.length) {
                            const p = pagePt(it.cells[0]);
                            const t = svgEl('text', {x: p.x + cellPx * 0.3, y: p.y - cellPx * 0.26,
                                class: 'proto-f-tag small'});
                            t.textContent = it.corner;
                            marks.appendChild(t);
                        }
                        if (it.label && it.cells && it.cells.length) {
                            const p = pagePt(it.cells[0]);
                            const t = svgEl('text', {x: p.x, y: p.y - cellPx * 0.22, class: 'proto-f-tag'});
                            t.textContent = it.label;
                            marks.appendChild(t);
                        }
                    });
                });
            }

            // ---- Board -> rules: what is under the cursor ----
            const cellKinds = new Map();
            function indexBoard() {
                cellKinds.clear();
                const said = mentioned();
                Object.keys(catalog).forEach(function(id) {
                    const k = catalog[id];
                    if (k.scoped || id.indexOf('v:') === 0 || id === 'digits' || (k.live && !said.has(id))) {
                        return;
                    }
                    k.items().forEach(function(it) {
                        (it.cells || []).concat(it.pts || []).forEach(function(c) {
                            if (!cellKinds.has(c)) {
                                cellKinds.set(c, new Set());
                            }
                            cellKinds.get(c).add(id);
                        });
                    });
                });
            }

            boardWrap.addEventListener('mousemove', function(e) {
                const ids = new Set();
                const cell = bridge.pageToPoint(e.pageX, e.pageY, [0]);
                const near = bridge.pageToPoint(e.pageX, e.pageY, [0, 1, 2, 3]);
                [cell, near].forEach(function(i) {
                    if (i != null && cellKinds.has(i)) {
                        cellKinds.get(i).forEach(function(k) {
                            ids.add(k);
                        });
                    }
                });
                if (cell != null) {
                    const v = cellValue(cell);
                    if (v && catalog['v:' + v.v]) {
                        ids.add('v:' + v.v);
                    }
                }
                // A clue type under the cursor (thermo, cage, dot) outranks the generic digit phrases.
                const specific = Array.from(ids).filter(function(id) {
                    return id !== 'givens' && id.indexOf('v:') !== 0;
                });
                const list = specific.length ? specific : Array.from(ids);
                if (list.join(' ') === boardHover.join(' ')) {
                    return;
                }
                boardHover = list;
                markActive();
                const labels = list.filter(function(id) {
                    return catalog[id];
                }).map(function(id) {
                    return catalog[id].label;
                });
                const said = mentioned();
                underCursor.textContent = labels.length ?
                    'Under the cursor: ' + labels.join(', ') +
                    (list.some(function(i) {
                        return said.has(i);
                    }) ? ' (lit above)' : ' (not named in the rules)') :
                    'Under the cursor: nothing the rules name.';
            });
            boardWrap.addEventListener('mouseleave', function() {
                boardHover = [];
                markActive();
                underCursor.textContent = 'Hover the board to see which rule talks about it.';
            });

            // ---- Mode strip ----
            function btn(label, cls, onclick, title) {
                return el('button', {type: 'button', class: 'proto-f-btn ' + (cls || ''), title: title || label,
                    onclick: onclick}, [label]);
            }

            function swatchColor(id) {
                const lb = document.getElementById(id + '_lb') || document.querySelector('label[for="' + id + '"]');
                if (!lb) {
                    return '';
                }
                const cs = getComputedStyle(lb);
                const bg = cs.backgroundColor;
                return bg && bg !== 'rgba(0, 0, 0, 0)' && bg !== 'transparent' ? bg : cs.color;
            }

            function renderModes() {
                const st = bridge.getState();
                modeRow.innerHTML = '';
                let modes = bridge.listModes().filter(function(m) {
                    return !m.hidden;
                });
                modes.forEach(function(m) {
                    modeRow.appendChild(btn(m.label, m.mode === st.mode ? 'is-on' : '', function() {
                        bridge.setMode(m.mode);
                    }, m.label + ' mode'));
                });
                subRow.innerHTML = '';
                if (st.mode === 'combi') {
                    const sel = el('select', {class: 'proto-f-select', title: 'Composite tool',
                        onchange: function(e) {
                            bridge.setComposite(e.target.value);
                        }});
                    bridge.listComposite().forEach(function(c) {
                        const o = el('option', {value: c.name}, [c.label]);
                        if (c.name === st.submode) {
                            o.selected = true;
                        }
                        sel.appendChild(o);
                    });
                    subRow.appendChild(sel);
                }
                bridge.listSubmodes(st.mode).forEach(function(s) {
                    if (!s.label) {
                        return;
                    }
                    subRow.appendChild(btn(s.label, String(s.value) === String(st.submode) ? 'is-on' : '',
                        function() {
                            bridge.setSubmode(s.value);
                        }));
                });
                const styles = bridge.listStyles(st.mode);
                if (styles.length) {
                    subRow.appendChild(el('span', {class: 'proto-f-gap'}));
                }
                styles.forEach(function(s) {
                    const color = swatchColor(s.id);
                    const b = btn('', 'proto-f-swatch' + (Number(s.value) === Number(st.style) ? ' is-on' : ''),
                        function() {
                            bridge.setStyle(s.value);
                        }, 'Style ' + s.label);
                    b.style.setProperty('--sw', color || '#888');
                    if (/[a-z]{3}/i.test(s.label) && !/^[A-Z]{2}\d+$/.test(s.label)) {
                        b.textContent = s.label;
                        b.classList.add('has-text');
                    }
                    subRow.appendChild(b);
                });
            }

            const undoBtn = btn('Undo', '', function() {
                bridge.undo();
            }, 'Undo (Ctrl+Z)');
            const redoBtn = btn('Redo', '', function() {
                bridge.redo();
            }, 'Redo (Ctrl+Y)');
            const checkBtn = btn('Check', 'is-accent', function() {
                renderStatus(true);
            }, 'Run the answer check');
            const timerEl = el('span', {class: 'proto-f-timer'});
            const pauseBtn = btn('Pause', '', function() {
                const t = bridge.getTimer();
                if (t.running) {
                    bridge.pauseTimer();
                } else {
                    bridge.startTimer();
                }
            });
            const histEl = el('span', {class: 'proto-f-hist'});
            toolRow.appendChild(undoBtn);
            toolRow.appendChild(redoBtn);
            toolRow.appendChild(histEl);
            toolRow.appendChild(checkBtn);
            toolRow.appendChild(el('span', {class: 'proto-f-gap'}));
            toolRow.appendChild(timerEl);
            toolRow.appendChild(pauseBtn);
            toolRow.appendChild(btn('Settings', '', function() {
                bridge.openSettings();
            }));

            let lastVerdict = null;
            function renderStatus(ran) {
                const res = bridge.check();
                statusBox.innerHTML = '';
                if (!res.hasAnswerCheck) {
                    statusBox.appendChild(el('p', {class: 'proto-f-empty'},
                        ['This link has no answer check. Use the live counts above to check your work.']));
                    checkBtn.disabled = true;
                    return;
                }
                checkBtn.disabled = false;
                if (ran) {
                    lastVerdict = res.solved;
                }
                const verdict = lastVerdict === null ? null : res.solved;
                statusBox.appendChild(el('p', {class: 'proto-f-verdict' + (verdict === true ? ' ok' :
                    verdict === false ? ' no' : '')}, [
                    verdict === null ? 'Not run yet. Press Check.' :
                        verdict ? 'Solved. The answer check accepts the grid.' :
                            'Not solved yet: the grid does not match the answer check.'
                ]));
                const info = bridge.answerCheckInfo();
                if (info) {
                    const d = el('div', {class: 'proto-f-acinfo'});
                    d.innerHTML = info;
                    statusBox.appendChild(d);
                }
            }

            function renderTools(st) {
                const h = bridge.history();
                undoBtn.disabled = !st.canUndo;
                redoBtn.disabled = !st.canRedo;
                histEl.textContent = h.position + '/' + h.length;
                const t = bridge.getTimer();
                timerEl.textContent = t.text;
                pauseBtn.textContent = t.running ? 'Pause' : 'Start';
            }

            // ---- Wiring ----
            function refreshAll() {
                catalog = buildCatalog();
                renderInfo();
                renderLegend();
                indexBoard();
                updateCounts();
                markActive();
                drawOverlay();
            }

            renderModes();
            renderStatus(false);
            renderTools(bridge.getState());
            refreshAll();
            fitBoard();

            bridge.onChange(function(st) {
                // Notifications are coalesced per frame and carry only the first trigger, so always re-render.
                renderModes();
                renderTools(st);
                indexBoard();
                updateCounts();
                drawOverlay();
                if (lastVerdict !== null) {
                    renderStatus(false);
                }
            });
            bridge.onTimer(function(t) {
                timerEl.textContent = t.text;
                pauseBtn.textContent = t.running ? 'Pause' : 'Start';
            });
            window.addEventListener('resize', function() {
                fitBoard();
                drawOverlay();
            });
            document.addEventListener('keydown', function(e) {
                if (e.key === 'Escape' && pinned.length) {
                    pinned = [];
                    drawOverlay();
                    markActive();
                }
            });
            // Selection changes (scoped kinds) do not always fire onChange; redraw on board mouseup.
            boardWrap.addEventListener('mouseup', function() {
                requestAnimationFrame(drawOverlay);
            });

            window.ProtoF = {
                refresh: refreshAll,
                setRules: function(html) {
                    pu.rules = html;
                    refreshAll();
                },
                catalog: function() {
                    return catalog;
                }
            };
        }
    };
})();
