/*
 * PROTOTYPE (throwaway, branch prototype/solve-ui): solve-UI variant F, "Live rules".
 *
 * Idea: the rules are a living document beside the board, and the document is the primary chrome. The rules text is
 * parsed and its phrases are linked to the board: hovering "black circles", "rows", "islands", "light bulbs", a clue
 * type or a number spotlights every matching element on the board; clicking a phrase pins the spotlight while you
 * solve. The link runs both ways: hovering the board lights up the phrases that talk about what is under the cursor,
 * and says what each live check makes of that cell ("row 4: 2 of 4 stars"). Elements the rules never name are listed
 * under "On this board".
 *
 * Round 2 (genres other than sudoku): the variant recognises the genre (tags, title, rules) and adds
 *  - rule verbs as tools: "Shade", "Draw", "Place", "Divide" in the rules arm the genre's tool (a Composite tool, Edge,
 *    Surface or Number); the same tools are buttons above a folded "All modes" list;
 *  - live checks, one row each, always in view: loop pieces/loose ends/branches (Slitherlink, Masyu, Yajilin), pearl
 *    turns (Masyu), cells neither shaded nor on the loop (Yajilin), island sizes, shaded connectivity and 2x2 (Nurikabe),
 *    black/white connectivity and 2x2 (Yin-Yang), stars per row/column/region and touching stars (Star Battle),
 *    regions with one centre and symmetry (Galaxies), region sizes vs numbers, same-size and common-factor neighbours
 *    (Fillomino), lit cells, bulbs seeing bulbs and numbered walls (Akari, square and hex), ship sizes, touching ships
 *    and ship cells per row/column vs the outside clues (Battleships), repeated digits (Sudoku). The rules' nouns point
 *    at these checks, so "row" in Star Battle shows each row's star count;
 *  - standard rules when the setter wrote none (Yin-Yang).
 *
 * Claim tested: solvers constantly cross-reference rules and board, so the rules deserve to be the main chrome and
 * should point at the board.
 *
 * Bridge gaps worked around here (reads `pu` directly): the board's clue model and the solver's marks (pu.pu_q,
 * pu.pu_a: number, symbol, surface, line, lineE, thermo, arrows, killercages), cell geometry (pu.centerlist,
 * pu.point[i].adjacent / adjacent_dia / surround / x / y, pu.size), pu.solution (only to read Star Battle's star count
 * when the rules give none), and the legacy style swatch colours (`<id>_lb`). Test hook: window.ProtoF.
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
    function buildCatalog(profile, info) {
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
        const box = gridBox(cellSet);
        Object.keys(q.symbol).forEach(function(k) {
            const idx = Number(k);
            const s = q.symbol[k];
            const fam = symbolFamily(s[1]);
            const onCell = cellSet.has(idx);
            const p = pu.point[idx];
            const outside = !onCell && p && (p.x < box.minX - 1 || p.x > box.maxX + 1 || p.y < box.minY - 1 ||
                p.y > box.maxY + 1);
            // Arrow styles are direction arrays; battleship styles are piece shapes: neither is a colour.
            let color = Array.isArray(s[0]) ? '' : (COLOR_NAMES[s[0]] || '');
            let word = fam === 'circle' ? (onCell ? 'circles' : 'dots') : fam === 'arrow' ? 'arrow clues' :
                fam === 'sun' ? 'bulbs' : fam + 's';
            if (fam === 'battleship') {
                color = '';
                word = s[0] === 7 ? 'water' : outside ? 'fleet pieces' : 'ship parts';
            }
            const id = fam === 'battleship' && s[0] === 7 && onCell ? 'water' :
                'sym:' + fam + ':' + (color || 'any') + ':' + (onCell ? 'cell' : outside ? 'out' : 'edge') +
                (fam === 'battleship' ? ':' + word.replace(/ /g, '-') : '');
            if (!groups[id]) {
                groups[id] = {id: id, fam: fam, color: color || null, onCell: onCell, outside: outside,
                    label: (onCell || outside ? 'given ' : '') + (color ? color + ' ' : '') + word +
                        (outside ? ' (outside the grid)' : !onCell && fam !== 'circle' ? ' (on lines)' : ''),
                    idx: []};
            }
            groups[id].idx.push(idx);
        });
        Object.keys(groups).forEach(function(id) {
            const g = groups[id];
            add({id: id, label: g.label, fam: g.fam, color: g.color, onCell: g.onCell, outside: g.outside, items: function() {
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

        // The genre's live checks (round 2).
        if (profile) {
            profile.checks(cellSet, info).forEach(add);
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

    function gridBox(set) {
        const xs = [];
        const ys = [];
        set.forEach(function(c) {
            xs.push(pu.point[c].x);
            ys.push(pu.point[c].y);
        });
        const half = pu.size / 2;
        return {minX: Math.min.apply(null, xs) - half, maxX: Math.max.apply(null, xs) + half,
            minY: Math.min.apply(null, ys) - half, maxY: Math.max.apply(null, ys) + half};
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

    // ---- Genres: the solver's tools and the live checks, per genre ----------------------------------------------
    //
    // Round 2. A genre profile names (1) the tools a solver of that genre uses, armed by clicking a rule's verb
    // ("Shade", "Draw", "Place", "Divide") or a tool button, and (2) live checks recomputed from the solver's marks
    // after every change. Each check is a catalog kind, so the rules' nouns ("row", "island", "light bulb") point at
    // it: hovering shows every item with its count, red where a rule is broken. All geometry goes through
    // pu.point[i].adjacent / adjacent_dia / surround and point coordinates, so the checks run on hex grids too.

    const SHADE_ANY = new Set([1, 3, 4, 8]); // DG, LG, BK, GR: the answer check's shading colours

    function cellSetNow() {
        return new Set(pu.centerlist);
    }

    function nbrs(c, set) {
        return pu.point[c].adjacent.filter(function(n) {
            return set.has(n);
        });
    }

    /** Cells sharing a vertex with c (orthogonal and diagonal neighbours), on any grid. */
    function touching(c, set) {
        const out = new Set(nbrs(c, set));
        (pu.point[c].adjacent_dia || []).forEach(function(n) {
            if (set.has(n)) {
                out.add(n);
            }
        });
        return Array.from(out);
    }

    /** The next cell after `n` going in the direction c -> n, or null (works on square and hex grids). */
    function stepOn(c, n, set) {
        const a = pu.point[c];
        const b = pu.point[n];
        const dx = b.x - a.x;
        const dy = b.y - a.y;
        const len = Math.hypot(dx, dy);
        let best = null;
        nbrs(n, set).forEach(function(m) {
            const p = pu.point[m];
            if (Math.abs(p.x - b.x - dx) < len * 0.2 && Math.abs(p.y - b.y - dy) < len * 0.2) {
                best = m;
            }
        });
        return best;
    }

    function sym(layer, c) {
        return pu[layer].symbol[c] || null;
    }

    function anySym(c) {
        return sym('pu_a', c) || sym('pu_q', c);
    }

    function shadedIn(layer, c) {
        return SHADE_ANY.has(pu[layer].surface[c]);
    }

    function isStar(c) {
        const s = anySym(c);
        return !!s && s[1] === 'star' && s[0] !== 0;
    }

    function isBulb(c) {
        const s = anySym(c);
        return !!s && s[1] === 'sun_moon';
    }

    function isShip(c) {
        const s = anySym(c);
        return !!s && /^battleship_B/.test(s[1]) && s[0] >= 1 && s[0] <= 6;
    }

    function yyColor(c) {
        const s = anySym(c);
        if (s && /^circle/.test(s[1]) && (s[0] === 1 || s[0] === 2)) {
            return s[0] === 2 ? 'black' : 'white';
        }
        return null;
    }

    /** A whole number written in a cell (the setter's clue, or the solver's full-size entry), or null. */
    function numIn(layer, c) {
        const n = pu[layer].number[c];
        if (!n || !/^\d+$/.test(String(n[0]))) {
            return null;
        }
        return layer === 'pu_q' || n[2] === '1' ? String(n[0]) : null;
    }

    /** Edges the solver or the setter drew (crosses, value 98, are not borders). */
    function borderBlocked(a, b) {
        const key = sharedEdgeKey(a, b);
        if (!key) {
            return false;
        }
        const qa = pu.pu_q.lineE[key];
        const aa = pu.pu_a.lineE[key];
        return (qa && qa !== 98) || (aa && aa !== 98);
    }

    function linesOf(dict) {
        return Object.keys(dict).filter(function(k) {
            return dict[k] !== 98;
        }).map(function(k) {
            return k.split(',').map(Number);
        });
    }

    function gcd(a, b) {
        return b ? gcd(b, a % b) : a;
    }

    /** Rows or columns of cells, by point coordinate (square grids). */
    function linesOfCells(set, axis) {
        const m = new Map();
        set.forEach(function(c) {
            const k = Math.round(pu.point[c][axis] * 100);
            if (!m.has(k)) {
                m.set(k, []);
            }
            m.get(k).push(c);
        });
        return Array.from(m.keys()).sort(function(a, b) {
            return a - b;
        }).map(function(k) {
            return m.get(k);
        });
    }

    function clueRegions(set) {
        if (!Object.keys(pu.pu_q.lineE).length) {
            return [];
        }
        const regs = components(set, function(a, b) {
            const key = sharedEdgeKey(a, b);
            return key && pu.pu_q.lineE[key];
        });
        return regs.length > 1 && regs.length < set.size ? regs : [];
    }

    /** One summary per check: {text, state: 'ok' | 'bad' | 'open'}. */
    function summarize(items, opts) {
        const bad = items.filter(function(it) {
            return it.bad;
        }).length;
        const ok = items.filter(function(it) {
            return it.ok;
        }).length;
        const total = opts.total !== undefined ? opts.total : items.length;
        let text = opts.text ? opts.text(ok, bad, total, items) : ok + ' of ' + total + ' done';
        if (bad && !opts.text) {
            text += ', ' + bad + ' broken';
        }
        return {text: text, state: bad ? 'bad' : (total && ok === total ? 'ok' : 'open')};
    }

    // -- Loop health: one loop, no dead ends, no branches (crossings allowed where `cross(point)` says so) --
    function loopCheck(getSegs, cross, label) {
        return {id: 'chk:loop', label: label || 'the loop', live: true, check: true, items: function() {
            const segs = getSegs();
            const deg = new Map();
            segs.forEach(function(s) {
                s.forEach(function(p) {
                    deg.set(p, (deg.get(p) || 0) + 1);
                });
            });
            const pieces = lineGroups(segs.reduce(function(o, s) {
                o[s[0] + ',' + s[1]] = 1;
                return o;
            }, {}));
            const out = pieces.map(function(g, i) {
                return {segs: g.segs, noFill: true, tone: i % 2, ok: pieces.length === 1,
                    label: 'piece ' + (i + 1) + ': ' + g.segs.length + ' segments'};
            });
            deg.forEach(function(d, p) {
                if (d === 1) {
                    out.push({pts: [p], bad: true, label: 'dead end'});
                } else if (d > 2 && !(d === 4 && cross && cross(p))) {
                    out.push({pts: [p], bad: true, label: 'branch'});
                }
            });
            out.summary = function() {
                const ends = out.filter(function(it) {
                    return it.label === 'dead end';
                }).length;
                const br = out.filter(function(it) {
                    return it.label === 'branch';
                }).length;
                if (!segs.length) {
                    return {text: 'nothing drawn yet', state: 'open'};
                }
                const closed = pieces.length === 1 && !ends && !br;
                return {text: pieces.length + (pieces.length === 1 ? ' piece' : ' pieces') + ', ' + ends +
                    ' loose ends' + (br ? ', ' + br + ' branches' : '') + (closed ? ': closed loop' : ''),
                state: br ? 'bad' : closed ? 'ok' : 'open'};
            };
            return out;
        }};
    }

    function lineDegree(c) {
        let d = 0;
        linesOf(pu.pu_a.line).forEach(function(s) {
            if (s[0] === c || s[1] === c) {
                d++;
            }
        });
        return d;
    }

    function lineTurns(c) {
        const ends = [];
        linesOf(pu.pu_a.line).forEach(function(s) {
            if (s[0] === c) {
                ends.push(s[1]);
            } else if (s[1] === c) {
                ends.push(s[0]);
            }
        });
        if (ends.length !== 2) {
            return null;
        }
        const p = pu.point[c];
        const a = pu.point[ends[0]];
        const b = pu.point[ends[1]];
        const cross = (a.x - p.x) * (b.y - p.y) - (a.y - p.y) * (b.x - p.x);
        return Math.abs(cross) > 1e-6;
    }

    /** Every genre check. Each returns a catalog kind; items carry `label` for the board hover. */
    const CHECKS = {
        slitherLoop: function() {
            return loopCheck(function() {
                return linesOf(pu.pu_a.lineE);
            }, null, 'your loop');
        },
        cellLoop: function() {
            const ice = new Set(Object.keys(pu.pu_q.surface).map(Number));
            return loopCheck(function() {
                return linesOf(pu.pu_a.line);
            }, function(p) {
                return ice.has(p);
            }, 'your loop');
        },
        pearls: function(set) {
            return {id: 'chk:pearls', label: 'circles on the loop', live: true, check: true, items: function() {
                const out = [];
                Object.keys(pu.pu_q.symbol).map(Number).filter(function(c) {
                    return set.has(c) && /^circle/.test(pu.pu_q.symbol[c][1]);
                }).forEach(function(c) {
                    const black = pu.pu_q.symbol[c][0] === 2;
                    const d = lineDegree(c);
                    const turn = lineTurns(c);
                    const it = {cells: [c], label: (black ? 'black' : 'white') + ' circle'};
                    if (d === 2 && turn !== null) {
                        it.bad = black ? !turn : turn;
                        it.ok = !it.bad;
                        it.label += it.bad ? (black ? ': must turn here' : ': must go straight here') : ': ok';
                    } else {
                        it.label += d ? ': loop half through' : ': not visited yet';
                    }
                    out.push(it);
                });
                return out;
            }, summary: function(items) {
                return summarize(items, {text: function(ok, bad, total) {
                    return ok + ' of ' + total + ' circles passed correctly' + (bad ? ', ' + bad + ' wrong' : '');
                }});
            }};
        },
        unvisited: function(set) {
            return {id: 'chk:unvisited', label: 'cells still empty', live: true, check: true, items: function() {
                const onLoop = new Set();
                linesOf(pu.pu_a.line).forEach(function(s) {
                    onLoop.add(s[0]);
                    onLoop.add(s[1]);
                });
                return Array.from(set).filter(function(c) {
                    return !onLoop.has(c) && pu.pu_q.surface[c] === undefined && !pu.pu_a.surface[c] &&
                        !pu.pu_q.symbol[c] && !pu.pu_q.number[c];
                }).map(function(c) {
                    return {cells: [c], label: 'neither shaded nor on the loop'};
                });
            }, summary: function(items) {
                return {text: items.length + ' cells neither shaded nor on the loop', state: items.length ? 'open' : 'ok'};
            }};
        },
        islands: function(set) {
            return {id: 'chk:islands', label: 'dry islands', live: true, check: true, items: function() {
                const shaded = function(c) {
                    return shadedIn('pu_a', c) || shadedIn('pu_q', c);
                };
                const known = new Set(Array.from(set).filter(function(c) {
                    return !shaded(c) && (pu.pu_q.number[c] || pu.pu_a.symbol[c]);
                }));
                return components(known).map(function(comp, i) {
                    const clues = comp.map(function(c) {
                        return pu.pu_q.number[c] && String(pu.pu_q.number[c][0]);
                    }).filter(Boolean);
                    const target = clues.length === 1 && /^\d+$/.test(clues[0]) ? Number(clues[0]) : null;
                    const closed = comp.every(function(c) {
                        return nbrs(c, set).every(function(n) {
                            return comp.indexOf(n) >= 0 || shaded(n);
                        });
                    });
                    const it = {cells: comp, tone: i % 2, corner: comp.length + (target !== null ? '/' + target :
                        clues.length ? '/' + clues[0] : '')};
                    it.bad = clues.length > 1 || (target !== null && comp.length > target) ||
                        (closed && clues.length === 0) || (closed && target !== null && comp.length < target);
                    it.ok = !it.bad && closed && clues.length === 1 && (target === null || comp.length === target);
                    it.label = 'island of ' + comp.length + (clues.length === 1 ? ' (clue ' + clues[0] + ')' :
                        clues.length ? ' with ' + clues.length + ' clues' : ', no clue') + (closed ? ', walled in' : '');
                    return it;
                });
            }, summary: function(items) {
                const clued = Object.keys(pu.pu_q.number).filter(function(c) {
                    return set.has(Number(c));
                }).length;
                return summarize(items, {total: clued, text: function(ok, bad, total) {
                    return ok + ' of ' + total + ' islands finished' + (bad ? ', ' + bad + ' broken' : '');
                }});
            }};
        },
        wet: function(set) {
            return {id: 'chk:wet', label: 'shaded groups', live: true, check: true, items: function() {
                const wet = new Set(Array.from(set).filter(function(c) {
                    return shadedIn('pu_a', c) || shadedIn('pu_q', c);
                }));
                const comps = components(wet);
                return comps.map(function(comp, i) {
                    return {cells: comp, tone: i % 2, ok: comps.length === 1,
                        label: 'shaded group ' + (i + 1) + ' of ' + comps.length + ' (' + comp.length + ' cells)'};
                });
            }, summary: function(items) {
                return {text: items.length ? items.length + (items.length === 1 ? ' connected group' :
                    ' separate groups (must join into one)') : 'nothing shaded yet', state: items.length === 1 ? 'ok' : 'open'};
            }};
        },
        block2: function(set, isFilled, id, label) {
            return {id: id || 'chk:block2', label: label || '2x2 all shaded', live: true, check: true, items: function() {
                const out = [];
                set.forEach(function(c) {
                    // A 2x2 block: c, a right neighbour r, a down neighbour d, and the cell diagonal to both.
                    const p = pu.point[c];
                    const right = nbrs(c, set).filter(function(n) {
                        return pu.point[n].x > p.x + 1e-6 && Math.abs(pu.point[n].y - p.y) < 1e-6;
                    })[0];
                    const down = nbrs(c, set).filter(function(n) {
                        return pu.point[n].y > p.y + 1e-6 && Math.abs(pu.point[n].x - p.x) < 1e-6;
                    })[0];
                    if (right === undefined || down === undefined) {
                        return;
                    }
                    const diag = nbrs(right, set).filter(function(n) {
                        return nbrs(down, set).indexOf(n) >= 0 && n !== c;
                    })[0];
                    if (diag === undefined) {
                        return;
                    }
                    const four = [c, right, down, diag];
                    const v = isFilled(c);
                    if (v && four.every(function(x) {
                        return isFilled(x) === v;
                    })) {
                        out.push({cells: four, bad: true, label: '2x2 block all ' + (v === true ? 'shaded' : v)});
                    }
                });
                return out;
            }, summary: function(items) {
                return {text: items.length ? items.length + ' 2x2 blocks broken' : 'none', state: items.length ? 'bad' : 'ok'};
            }};
        },
        yyGroups: function(set, color) {
            return {id: 'chk:yy' + color, label: color + ' groups', live: true, check: true, items: function() {
                const mine = new Set(Array.from(set).filter(function(c) {
                    return yyColor(c) === color;
                }));
                const comps = components(mine);
                return comps.map(function(comp, i) {
                    return {cells: comp, tone: i % 2, ok: comps.length === 1,
                        label: color + ' group ' + (i + 1) + ' of ' + comps.length};
                });
            }, summary: function(items) {
                return {text: items.length ? items.length + (items.length === 1 ? ' group: connected' :
                    ' separate groups') : 'none placed', state: items.length === 1 ? 'ok' : 'open'};
            }};
        },
        yyEmpty: function(set) {
            return {id: 'chk:yyempty', label: 'empty cells', live: true, check: true, items: function() {
                return Array.from(set).filter(function(c) {
                    return !yyColor(c);
                }).map(function(c) {
                    return {cells: [c], label: 'empty'};
                });
            }, summary: function(items) {
                return {text: items.length + ' cells without a circle', state: items.length ? 'open' : 'ok'};
            }};
        },
        countPer: function(id, label, groups, isIt, target, noun, side) {
            return {id: id, label: label, live: true, check: true, items: function() {
                return groups().map(function(g, i) {
                    const n = g.cells.filter(isIt).length;
                    const t = g.target !== undefined ? g.target : target;
                    return {cells: g.cells, tone: i % 2, corner: n + (t !== null ? '/' + t : ''), side: side,
                        ok: t !== null && n === t, bad: t !== null && n > t,
                        label: g.name + ': ' + n + (t !== null ? ' of ' + t : '') + ' ' + noun};
                });
            }, summary: function(items) {
                return summarize(items, {text: function(ok, bad, total) {
                    return ok + ' of ' + total + ' full' + (bad ? ', ' + bad + ' over' : '');
                }});
            }};
        },
        touchingPairs: function(id, label, set, isIt, noun) {
            return {id: id, label: label, live: true, check: true, items: function() {
                const out = [];
                set.forEach(function(c) {
                    if (!isIt(c)) {
                        return;
                    }
                    out.push({cells: [c], label: noun});
                    touching(c, set).forEach(function(n) {
                        if (n > c && isIt(n)) {
                            out.push({cells: [c, n], bad: true, label: 'two ' + noun + 's touch'});
                        }
                    });
                });
                return out;
            }, summary: function(items) {
                const bad = items.filter(function(it) {
                    return it.bad;
                }).length;
                return {text: (items.length - bad) + ' placed' + (bad ? ', ' + bad + ' touching pairs' : ', none touch'),
                    state: bad ? 'bad' : 'open'};
            }};
        },
        ships: function(set) {
            return {id: 'chk:ships', label: 'ships', live: true, check: true, items: function() {
                const ship = new Set(Array.from(set).filter(isShip));
                const comps = components(ship);
                const owner = new Map();
                comps.forEach(function(comp, i) {
                    comp.forEach(function(c) {
                        owner.set(c, i);
                    });
                });
                return comps.map(function(comp, i) {
                    const touch = comp.some(function(c) {
                        return touching(c, set).some(function(n) {
                            return owner.has(n) && owner.get(n) !== i;
                        });
                    });
                    return {cells: comp, tone: i % 2, corner: String(comp.length), bad: touch,
                        label: 'ship of ' + comp.length + (touch ? ', touching another ship' : '')};
                });
            }, summary: function(items) {
                const sizes = items.map(function(it) {
                    return it.cells.length;
                }).sort(function(a, b) {
                    return b - a;
                });
                const bad = items.filter(function(it) {
                    return it.bad;
                }).length;
                return {text: items.length ? 'sizes ' + sizes.join(' ') + (bad ? ', ' + bad + ' touching' : '') :
                    'none placed', state: bad ? 'bad' : 'open'};
            }};
        },
        lit: function(set) {
            const wall = function(c) {
                return shadedIn('pu_a', c) || pu.pu_q.surface[c] !== undefined;
            };
            const litBy = function() {
                const lit = new Map();
                set.forEach(function(c) {
                    if (!isBulb(c)) {
                        return;
                    }
                    lit.set(c, (lit.get(c) || []).concat([c]));
                    nbrs(c, set).forEach(function(n) {
                        let prev = c;
                        let cur = n;
                        while (cur !== null && !wall(cur)) {
                            lit.set(cur, (lit.get(cur) || []).concat([c]));
                            const next = stepOn(prev, cur, set);
                            prev = cur;
                            cur = next;
                        }
                    });
                });
                return lit;
            };
            return {id: 'chk:lit', label: 'lit cells', live: true, check: true, wall: wall, items: function() {
                const lit = litBy();
                const out = [];
                set.forEach(function(c) {
                    if (wall(c)) {
                        return;
                    }
                    const by = lit.get(c) || [];
                    if (isBulb(c) && by.length > 1) {
                        out.push({cells: [c], bad: true, label: 'bulb lit by another bulb'});
                    } else if (by.length) {
                        out.push({cells: [c], ok: true, faintOk: true, label: 'lit by ' + by.length + ' bulb' +
                            (by.length > 1 ? 's' : '')});
                    } else {
                        out.push({cells: [c], label: 'dark'});
                    }
                });
                return out;
            }, summary: function(items) {
                const dark = items.filter(function(it) {
                    return it.label === 'dark';
                }).length;
                const bad = items.filter(function(it) {
                    return it.bad;
                }).length;
                return {text: (items.length - dark) + ' of ' + items.length + ' lit' + (bad ? ', ' + bad +
                    ' bulbs see each other' : ''), state: bad ? 'bad' : dark ? 'open' : 'ok'};
            }};
        },
        bulbClues: function(set) {
            return {id: 'chk:bulbclues', label: 'numbered walls', live: true, check: true, items: function() {
                return Array.from(set).filter(function(c) {
                    return pu.pu_q.surface[c] !== undefined && pu.pu_q.number[c] && /^\d+$/.test(pu.pu_q.number[c][0]);
                }).map(function(c) {
                    const t = Number(pu.pu_q.number[c][0]);
                    const n = nbrs(c, set).filter(isBulb).length;
                    return {cells: [c], corner: n + '/' + t, ok: n === t, bad: n > t,
                        label: 'clue ' + t + ': ' + n + ' bulbs next to it'};
                });
            }, summary: function(items) {
                return summarize(items, {text: function(ok, bad, total) {
                    return ok + ' of ' + total + ' satisfied' + (bad ? ', ' + bad + ' over' : '');
                }});
            }};
        },
        borderRegions: function(set, mode) {
            // Regions cut by borders (setter's and solver's). Fillomino: numbers inside must equal the size.
            // Galaxies: exactly one circle inside, and the region symmetric around it.
            return {id: 'chk:bregions', label: 'your regions', live: true, check: true, items: function() {
                const regs = components(set, borderBlocked);
                if (regs.length === 1) {
                    return [];
                }
                const regionOf = new Map();
                regs.forEach(function(r, i) {
                    r.forEach(function(c) {
                        regionOf.set(c, i);
                    });
                });
                if (mode === 'galaxies') {
                    const dots = galaxyDots(set);
                    const count = regs.map(function() {
                        return [];
                    });
                    dots.forEach(function(d) {
                        const ids = new Set(d.cells.map(function(c) {
                            return regionOf.get(c);
                        }));
                        if (ids.size === 1) {
                            count[Array.from(ids)[0]].push(d);
                        }
                    });
                    return regs.map(function(r, i) {
                        const ds = count[i];
                        const sym = ds.length === 1 && r.every(function(c) {
                            const m = mirror(c, ds[0], set);
                            return m !== null && regionOf.get(m) === i;
                        });
                        return {cells: r, tone: i % 2, corner: ds.length + '●', bad: ds.length === 0,
                            ok: ds.length === 1 && sym,
                            label: 'region of ' + r.length + ': ' + ds.length + ' circles' +
                                (ds.length === 1 ? (sym ? ', symmetric' : ', not symmetric yet') : '')};
                    });
                }
                const sizes = regs.map(function(r) {
                    return r.length;
                });
                const numsOf = function(r) {
                    return Array.from(new Set(r.map(function(c) {
                        return numIn('pu_q', c) || numIn('pu_a', c);
                    }).filter(Boolean))).map(Number);
                };
                const done = regs.map(function(r) {
                    const nums = numsOf(r);
                    return nums.length === 1 && nums[0] === r.length;
                });
                return regs.map(function(r, i) {
                    const nums = numsOf(r);
                    const it = {cells: r, tone: i % 2, corner: String(r.length),
                        label: 'region of ' + r.length + (nums.length ? ' holding ' + nums.join(', ') : '')};
                    // Too small: a number bigger than its walled-in region can never fit.
                    it.bad = nums.some(function(n) {
                        return n > r.length;
                    });
                    if (it.bad) {
                        it.label += '; too small';
                    }
                    if (done[i]) {
                        // Neighbours of the same size, or (when the rules say so) sizes with no common factor.
                        const seen = new Set();
                        r.forEach(function(c) {
                            nbrs(c, set).forEach(function(n) {
                                const j = regionOf.get(n);
                                if (j === i || !done[j] || seen.has(j)) {
                                    return;
                                }
                                seen.add(j);
                                if (sizes[j] === r.length) {
                                    it.bad = true;
                                    it.label += '; touches another ' + r.length;
                                } else if (mode === 'fillomino-gcd' && gcd(sizes[j], r.length) === 1) {
                                    it.bad = true;
                                    it.label += '; touches a ' + sizes[j] + ' (no common factor)';
                                }
                            });
                        });
                    }
                    it.ok = done[i] && !it.bad;
                    return it;
                });
            }, summary: function(items) {
                if (!items.length) {
                    return {text: 'no borders drawn yet', state: 'open'};
                }
                return summarize(items, {text: function(ok, bad, total) {
                    return total + ' regions, ' + ok + ' finished' + (bad ? ', ' + bad + ' broken' : '');
                }});
            }};
        }
    };

    /** Sudoku: a digit twice in a row, column or box. */
    CHECKS.dupes = function(set) {
        return {id: 'chk:dupes', label: 'repeated digits', live: true, check: true, items: function() {
            const houses = [['row', linesOfCells(set, 'y')], ['column', linesOfCells(set, 'x')], ['box', clueRegions(set)]];
            const out = [];
            let full = 0;
            let total = 0;
            houses.forEach(function(h) {
                h[1].forEach(function(cells, i) {
                    total++;
                    const by = {};
                    cells.forEach(function(c) {
                        const v = cellValue(c);
                        if (v) {
                            (by[v.v] = by[v.v] || []).push(c);
                        }
                    });
                    if (Object.keys(by).length === cells.length) {
                        full++;
                    }
                    Object.keys(by).forEach(function(d) {
                        if (by[d].length > 1) {
                            out.push({cells: by[d], bad: true, label: d + ' twice in ' + h[0] + ' ' + (i + 1)});
                        }
                    });
                });
            });
            out.summary = function() {
                return {text: out.length ? out.length + ' repeats' : full + ' of ' + total + ' houses full, no repeats',
                    state: out.length ? 'bad' : full === total ? 'ok' : 'open'};
            };
            return out;
        }};
    };

    /** Galaxy centres: the clue circles, each with the cells it touches (1 in a cell, 2 on an edge, 4 on a vertex). */
    function galaxyDots(set) {
        const out = [];
        Object.keys(pu.pu_q.symbol).map(Number).forEach(function(i) {
            if (!/^circle/.test(pu.pu_q.symbol[i][1])) {
                return;
            }
            const p = pu.point[i];
            const near = [];
            let dmin = Infinity;
            set.forEach(function(c) {
                const d = Math.hypot(pu.point[c].x - p.x, pu.point[c].y - p.y);
                dmin = Math.min(dmin, d);
            });
            set.forEach(function(c) {
                const d = Math.hypot(pu.point[c].x - p.x, pu.point[c].y - p.y);
                if (d < dmin + 1) {
                    near.push(c);
                }
            });
            if (dmin < pu.size) {
                out.push({point: i, x: p.x, y: p.y, cells: near});
            }
        });
        return out;
    }

    function mirror(c, dot, set) {
        const p = pu.point[c];
        const x = 2 * dot.x - p.x;
        const y = 2 * dot.y - p.y;
        let hit = null;
        set.forEach(function(n) {
            if (Math.abs(pu.point[n].x - x) < 1 && Math.abs(pu.point[n].y - y) < 1) {
                hit = n;
            }
        });
        return hit;
    }

    /** Clue numbers outside the grid, matched to the row or column they sit in line with. */
    function outsideClues(set, rows, cols) {
        const xs = Array.from(set).map(function(c) {
            return pu.point[c].x;
        });
        const ys = Array.from(set).map(function(c) {
            return pu.point[c].y;
        });
        const minX = Math.min.apply(null, xs);
        const maxX = Math.max.apply(null, xs);
        const minY = Math.min.apply(null, ys);
        const maxY = Math.max.apply(null, ys);
        const rowT = rows.map(function() {
            return null;
        });
        const colT = cols.map(function() {
            return null;
        });
        Object.keys(pu.pu_q.number).map(Number).forEach(function(k) {
            if (set.has(k) || !pu.point[k]) {
                return;
            }
            const v = String(pu.pu_q.number[k][0]);
            if (!/^\d+$/.test(v)) {
                return;
            }
            const p = pu.point[k];
            if (p.x > maxX || p.x < minX) {
                rows.forEach(function(r, i) {
                    if (Math.abs(pu.point[r[0]].y - p.y) < 1) {
                        rowT[i] = Number(v);
                    }
                });
            } else if (p.y > maxY || p.y < minY) {
                cols.forEach(function(col, i) {
                    if (Math.abs(pu.point[col[0]].x - p.x) < 1) {
                        colT[i] = Number(v);
                    }
                });
            }
        });
        return {rows: rowT, cols: colT};
    }

    /** Tools a genre's solver uses: what to click, and which rule verbs arm them. */
    const T = {
        edgex: {id: 'edgex', label: 'Loop on edges', hint: 'drag along grid lines · right-click an edge: ✕',
            mode: 'combi', combi: 'edgex', roles: ['draw']},
        borders: {id: 'borders', label: 'Borders', hint: 'drag along grid lines · right-click an edge: ✕',
            mode: 'combi', combi: 'edgex', roles: ['border', 'draw']},
        linex: {id: 'linex', label: 'Loop + edge ✕', hint: 'drag through cells · right-click an edge: ✕',
            mode: 'combi', combi: 'linex', roles: ['draw']},
        lineox: {id: 'lineox', label: 'Loop + cell ○/✕', hint: 'drag through cells · click a cell: ○ then ✕ · right-click: ✕',
            mode: 'combi', combi: 'lineox', roles: []},
        yajilin: {id: 'yajilin', label: 'Shade + loop', hint: 'click: shade · drag: loop · right-click: dot (cell) or ✕ (edge)',
            mode: 'combi', combi: 'yajilin', roles: ['draw', 'shade']},
        blpo: {id: 'blpo', label: 'Shade + dot', hint: 'click: shade (again: dot) · right-click: dot · drag paints many',
            mode: 'combi', combi: 'blpo', roles: ['shade']},
        blwh: {id: 'blwh', label: 'Circles', hint: 'click: white (again: black) · right-click: black · drag paints many',
            mode: 'combi', combi: 'blwh', roles: ['place', 'shade']},
        star: {id: 'star', label: 'Stars', hint: 'click: star · right-click: ✕ · right-drag: many ✕',
            mode: 'combi', combi: 'star', roles: ['place']},
        akari: {id: 'akari', label: 'Bulbs', hint: 'click: bulb · right-click: dot (no bulb here)',
            mode: 'combi', combi: 'akari', roles: ['place']},
        surface: {id: 'surface', label: 'Shade', hint: 'click: shade · right-click: green · drag paints many',
            mode: 'surface', style: 1, roles: ['shade']},
        ships: {id: 'ships', label: 'Ships + water', hint: 'click cycles ○ end, ■ middle, • part, ≈ water · drag from a cell: ship end in that direction · right-drag: water',
            mode: 'combi', combi: 'battleship', roles: ['place']},
        numbers: {id: 'numbers', label: 'Numbers', hint: 'click a cell, type a number (two digits for 10+)',
            mode: 'number', sub: 1, roles: ['number']},
        rgb: {id: 'rgb', label: 'Colour letters', hint: 'click a cell, type R, G or B',
            mode: 'number', sub: 1, roles: ['colour']},
        sudoku: {id: 'sudoku', label: 'Digits', hint: 'select cells, type · Shift: corner · Ctrl: centre',
            mode: 'sudoku', sub: 1, roles: ['number', 'place']}
    };

    /** Rule verbs -> tool roles. */
    const VERBS = [
        ['draw(?:ing)?|connect(?:ing)?', 'draw'],
        ['shad(?:e|ing)|blacken|paint', 'shade'],
        ['place|placing|put', 'place'],
        ['divide|dividing|split', 'border'],
        ['write|enter|fill in', 'number']
    ];

    const STANDARD_RULES = {
        yinyang: 'Place a black or a white circle in every empty cell. All black circles form one orthogonally ' +
            'connected group, and so do all white circles. No 2x2 block holds four circles of one colour.'
    };

    /**
     * Genre profiles. `test` is matched against tags, title and rules. `phrases` link genre nouns to its checks and
     * win ties with the generic phrases. `checks(set, ctx)` builds the check kinds.
     */
    const GENRES = [
        {key: 'sudoku', name: 'Sudoku', test: /sudoku|classic/, tools: ['sudoku'],
            phrases: [['once each|no repeats?|repeat', ['chk:dupes']]],
            checks: function(set) {
                return [CHECKS.dupes(set)];
            }},
        {key: 'slitherlink', name: 'Slitherlink', test: /slither/, tools: ['edgex'],
            phrases: [['(?:single\\s+)?(?:non-branching\\s+)?(?:closed\\s+)?loop', ['chk:loop']]],
            checks: function() {
                return [CHECKS.slitherLoop()];
            }},
        {key: 'masyu', name: 'Masyu', test: /masyu|maysu|pearl/, tools: ['linex', 'lineox'],
            phrases: [['loop', ['chk:loop']], ['black circles?', ['chk:pearls', 'sym:circle:black:*']],
                ['white circles?', ['chk:pearls', 'sym:circle:white:*']], ['circles?', ['chk:pearls', 'sym:circle:*']],
                ['ice cells?|cells shaded blue', ['givenShade']]],
            checks: function(set) {
                return [CHECKS.cellLoop(), CHECKS.pearls(set)];
            }},
        {key: 'yajilin', name: 'Yajilin', test: /yajilin/, tools: ['yajilin'],
            phrases: [['loop', ['chk:loop']], ['(?:all\\s+)?remaining cells', ['chk:unvisited']],
                ['clue cells?|brown clue cells', ['givenShade']]],
            checks: function(set) {
                return [CHECKS.cellLoop(), CHECKS.unvisited(set)];
            }},
        {key: 'nurikabe', name: 'Nurikabe', test: /nurikabe/, tools: ['blpo', 'surface'],
            phrases: [['wet(?: cells?)?', ['chk:wet']], ['(?:connected\\s+)?groups? of unshaded cells|unshaded cells|dry(?: cells?| regions?)?|islands?',
                ['chk:islands']], ['2\\s*[x×]\\s*2(?: groups?(?: of cells)?)?', ['chk:block2']]],
            checks: function(set) {
                return [CHECKS.islands(set), CHECKS.wet(set), CHECKS.block2(set, function(c) {
                    return shadedIn('pu_a', c) || shadedIn('pu_q', c);
                })];
            }},
        {key: 'yinyang', name: 'Yin-Yang', test: /yin.?ya/, tools: ['blwh'],
            phrases: [['black circles?|black', ['chk:yyblack']], ['white circles?|white', ['chk:yywhite', 'sym:circle:white:*']],
                ['empty cells?', ['chk:yyempty']], ['2\\s*[x×]\\s*2(?: blocks?)?', ['chk:yy2x2']]],
            checks: function(set) {
                return [CHECKS.yyGroups(set, 'black'), CHECKS.yyGroups(set, 'white'), CHECKS.yyEmpty(set),
                    CHECKS.block2(set, yyColor, 'chk:yy2x2', '2x2 of one colour')];
            }},
        {key: 'starbattle', name: 'Star Battle', test: /star ?battle/, tools: ['star'],
            phrases: [['stars?', ['chk:stouch']], ['rows?', ['chk:srows']], ['columns?', ['chk:scols']],
                ['(?:outlined\\s+)?regions?', ['chk:sregions']], ['touch(?:es)?(?: each other)?', ['chk:stouch']]],
            checks: function(set, info) {
                const n = starsPer(info.rules, set);
                const rows = linesOfCells(set, 'y');
                const cols = linesOfCells(set, 'x');
                const regs = clueRegions(set);
                const named = function(list, word) {
                    return function() {
                        return list.map(function(cs, i) {
                            return {cells: cs, name: word + ' ' + (i + 1)};
                        });
                    };
                };
                return [
                    CHECKS.touchingPairs('chk:stouch', 'your stars', set, isStar, 'star'),
                    CHECKS.countPer('chk:srows', 'stars per row', named(rows, 'row'), isStar, n, 'stars', 'left'),
                    CHECKS.countPer('chk:scols', 'stars per column', named(cols, 'column'), isStar, n, 'stars', 'top'),
                    CHECKS.countPer('chk:sregions', 'stars per region', named(regs, 'region'), isStar, n, 'stars')
                ];
            }},
        {key: 'galaxies', name: 'Galaxies', test: /galax|tentaisho|spiral/, tools: ['borders', 'surface'],
            phrases: [['regions?|aquariums?', ['chk:bregions']], ['circles?', ['chk:bregions', 'sym:circle:*']],
                ['rotationally symmetric', ['chk:bregions']]],
            checks: function(set) {
                return [CHECKS.borderRegions(set, 'galaxies')];
            }},
        {key: 'fillomino', name: 'Fillomino', test: /fillomino/, tools: ['borders', 'numbers'],
            phrases: [['(?:orthogonally connected\\s+)?regions?', ['chk:bregions']],
                ['same size|common factor', ['chk:bregions']]],
            checks: function(set, info) {
                return [CHECKS.borderRegions(set, /common factor/i.test(info.rules) ? 'fillomino-gcd' : 'fillomino')];
            }},
        {key: 'battleships', name: 'Battleships', test: /battleship|ships/, tools: ['ships'],
            phrases: [['(?:given\\s+)?ships?', ['chk:ships']], ['touch(?:es)?', ['chk:ships']],
                ['rows?', ['chk:brows']], ['columns?', ['chk:bcols']], ['water(?: cells?)?', ['water']]],
            checks: function(set) {
                const rows = linesOfCells(set, 'y');
                const cols = linesOfCells(set, 'x');
                const t = outsideClues(set, rows, cols);
                const named = function(list, word, targets) {
                    return function() {
                        return list.map(function(cs, i) {
                            return {cells: cs, name: word + ' ' + (i + 1), target: targets[i]};
                        });
                    };
                };
                return [CHECKS.ships(set),
                    CHECKS.countPer('chk:brows', 'ship cells per row', named(rows, 'row', t.rows), isShip, null, 'ship cells', 'left'),
                    CHECKS.countPer('chk:bcols', 'ship cells per column', named(cols, 'column', t.cols), isShip, null, 'ship cells', 'top')];
            }},
        {key: 'akari', name: 'Akari', test: /akari|light ?up/, tools: ['akari', 'surface'],
            phrases: [['(?:light\\s+)?bulbs?|lights?|lamps?', ['chk:lit']], ['illuminat\\w*|lit', ['chk:lit']],
                ['unshaded(?: white)? cells?|white cells?', ['chk:lit']],
                ['numbered cells?|(?:a\\s+)?numbers? in a shaded cell|numbers?', ['chk:bulbclues']]],
            checks: function(set) {
                return [CHECKS.lit(set), CHECKS.bulbClues(set)];
            }}
    ];

    function starsPer(rules, set) {
        const m = /contains?\s+(\d+)\s+stars?/i.exec(rules) || /(\d+)\s+stars?\s+(?:in|per|each)/i.exec(rules) ||
            /(\d+)\s*★/.exec(rules);
        if (m) {
            return Number(m[1]);
        }
        try {
            const sol = typeof pu.solution === 'string' ? JSON.parse(pu.solution) : pu.solution;
            const list = sol.filter(function(a) {
                return a && a.length;
            })[0] || [];
            const rows = linesOfCells(set, 'y').length;
            return rows ? Math.round(list.length / rows) || null : null;
        } catch (e) {
            return null;
        }
    }

    function detectGenre(info, tags) {
        const hay = (tags.join(' ') + ' ' + (info.title || '') + ' ' + (info.rules || '').slice(0, 200)).toLowerCase();
        if (pu.gridtype === 'sudoku') {
            return GENRES[0];
        }
        // Akari before "light"; Yin-Yang before anything that says "circle".
        const order = ['yinyang', 'starbattle', 'slitherlink', 'masyu', 'yajilin', 'nurikabe', 'galaxies',
            'fillomino', 'battleships', 'akari', 'sudoku'];
        for (let i = 0; i < order.length; i++) {
            const g = GENRES.filter(function(x) {
                return x.key === order[i];
            })[0];
            if (g.test.test(hay)) {
                return g;
            }
        }
        return null;
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

    function compile(re, resolve) {
        return {re: new RegExp('(?:' + re + ')(?![A-Za-z0-9])', 'iy'), resolve: resolve};
    }

    /** The phrase list for a genre: rule verbs first (they arm tools), then the genre's nouns, then the generic ones. */
    function compilePhrases(profile) {
        const list = VERBS.map(function(v) {
            return compile(v[0], function() {
                return ['tool:' + v[1]];
            });
        });
        // Genre names are not clue types: "Star Battle" must not link "Star".
        list.push(compile('star battle|yin-?yang|light ?up|statue park|fillomino|nurikabe|masyu|yajilin|slitherlink|' +
            'battleships?(?= puzzle)|tentaisho|aquarium(?=:)', function() {
            return ['-'];
        }));
        (profile ? profile.phrases : []).forEach(function(p) {
            list.push(compile(p[0], function() {
                return p[1].slice();
            }));
        });
        return list.concat(COMPILED);
    }

    /** Memoize a kind's items per board generation: one computation per change, however many readers. */
    let GEN = 0;
    function memo(kind) {
        const raw = kind.items;
        let at = -1;
        let cache = null;
        kind.items = function() {
            if (at !== GEN) {
                cache = raw();
                at = GEN;
            }
            return cache;
        };
        return kind;
    }

    /**
     * Split text into [{text}|{text, kinds}] tokens. At each word start the longest phrase wins; ties go to the
     * earlier list entry. `roles` is the set of tool roles this genre has: verbs without a tool stay plain text.
     */
    function tokenize(text, cat, para, compiled, roles) {
        const out = [];
        let plain = '';
        let i = 0;
        while (i < text.length) {
            const prev = i > 0 ? text[i - 1] : ' ';
            let best = null;
            if (!/[A-Za-z0-9]/.test(prev)) {
                compiled.forEach(function(p) {
                    p.re.lastIndex = i;
                    const m = p.re.exec(text);
                    if (m && m[0].length && (!best || m[0].length > best.m[0].length)) {
                        // "sym:circle:*" stands for every clue-circle kind on this board.
                        const raw = [];
                        p.resolve(m, cat, para.subject).forEach(function(id) {
                            if (id.slice(-1) === '*') {
                                Object.keys(cat).forEach(function(k) {
                                    if (k.indexOf(id.slice(0, -1)) === 0) {
                                        raw.push(k);
                                    }
                                });
                            } else {
                                raw.push(id);
                            }
                        });
                        const ids = raw.filter(function(id) {
                            if (id === '-') {
                                return true;
                            }
                            if (id.indexOf('tool:') === 0) {
                                return roles.has(id.slice(5));
                            }
                            if (id.indexOf('v:') === 0 && !cat[id]) {
                                cat[id] = memo(valueKind(id.slice(2)));
                            }
                            if (id === 'digits' && !cat[id]) {
                                cat[id] = memo(digitsKind());
                            }
                            return !!cat[id];
                        });
                        if (ids.length) {
                            best = {m: m, ids: ids};
                        }
                    }
                });
            }
            if (best) {
                if (best.ids[0] === '-') {
                    plain += best.m[0];
                    i += best.m[0].length;
                    continue;
                }
                if (plain) {
                    out.push({text: plain});
                    plain = '';
                }
                out.push({text: best.m[0], kinds: best.ids});
                best.ids.forEach(function(id) {
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
            const info0 = bridge.getInfo();
            const profile = detectGenre(info0, bridge.genreTags());
            const standardRules = !(info0.rules || '').trim() && profile && STANDARD_RULES[profile.key];
            const ruleText = standardRules || info0.rules || '';
            const tools = profile ? profile.tools.map(function(id) {
                return T[id];
            }).filter(function(t) {
                // Composite tools differ per grid type (hex has no Battleships tool, for one).
                return !t.combi || bridge.listComposite().some(function(c) {
                    return c.name === t.combi;
                });
            }) : [];
            const roles = new Set();
            tools.forEach(function(t) {
                t.roles.forEach(function(r) {
                    roles.add(r);
                });
            });
            const compiled = compilePhrases(profile);
            let catalog = null;
            let hoverKinds = null;   // kinds under the mouse in the document
            let pinned = [];         // kinds pinned by click (several may be pinned at once)
            let boardHover = [];     // kinds under the mouse on the board

            function newCatalog() {
                const cat = buildCatalog(profile, {rules: ruleText, title: info0.title});
                Object.keys(cat).forEach(function(id) {
                    memo(cat[id]);
                });
                return cat;
            }
            catalog = newCatalog();

            // Layout: the document on the left (rules, live checks, legend, answer check), tools under it, board right.
            const docBody = el('div', {class: 'proto-f-doc-body'});
            const rulesBox = el('div', {class: 'proto-f-rules'});
            const checksBox = el('div', {class: 'proto-f-checks'});
            const legendBox = el('div', {class: 'proto-f-legend'});
            const statusBox = el('div', {class: 'proto-f-status'});
            const underCursor = el('div', {class: 'proto-f-under'}, ['Hover the board to see which rule talks about it.']);
            const titleEl = el('div', {class: 'proto-f-title'});
            const bylineEl = el('div', {class: 'proto-f-byline'});
            const genreTools = el('div', {class: 'proto-f-gtools'});
            const modeRow = el('div', {class: 'proto-f-modes'});
            const subRow = el('div', {class: 'proto-f-subs'});
            const toolRow = el('div', {class: 'proto-f-tools'});
            const modesWrap = el('div', {class: 'proto-f-modewrap' + (tools.length ? ' is-folded' : '')}, [modeRow]);
            const doc = el('div', {class: 'proto-f-doc'}, [
                el('div', {class: 'proto-f-doc-head'}, [titleEl, bylineEl]),
                docBody,
                // The live checks and the cursor's reverse lookup stay in view however long the rules are.
                el('div', {class: 'proto-f-live'}, [el('div', {class: 'proto-f-h2'}, ['Live checks']), checksBox,
                    underCursor]),
                el('div', {class: 'proto-f-strip'}, [genreTools, modesWrap, subRow, toolRow])
            ]);
            docBody.appendChild(el('div', {class: 'proto-f-h2'}, ['Rules']));
            docBody.appendChild(rulesBox);
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
            function linkFor(tok) {
                const toolIds = tok.kinds.filter(function(k) {
                    return k.indexOf('tool:') === 0;
                });
                if (toolIds.length) {
                    // A rule verb: clicking arms the genre's tool for it.
                    const role = toolIds[0].slice(5);
                    const tool = tools.filter(function(t) {
                        return t.roles.indexOf(role) >= 0;
                    })[0];
                    const v = el('span', {class: 'proto-f-verb', tabindex: '0', 'data-tool': tool.id,
                        title: 'Click to use ' + tool.label + ': ' + tool.hint}, [tok.text]);
                    v.addEventListener('click', function() {
                        armTool(tool);
                    });
                    return v;
                }
                const link = el('span', {class: 'proto-f-link', tabindex: '0', 'data-kinds': tok.kinds.join(' ')},
                    [tok.text]);
                link.appendChild(el('sup', {class: 'proto-f-count'}));
                link.addEventListener('mouseenter', function() {
                    setHover(tok.kinds);
                });
                link.addEventListener('mouseleave', function() {
                    setHover(null);
                });
                link.addEventListener('click', function() {
                    togglePin(tok.kinds);
                });
                return link;
            }

            function renderInfo() {
                titleEl.textContent = info0.title || 'Untitled puzzle';
                const tags = bridge.genreTags();
                bylineEl.textContent = [info0.author ? 'by ' + info0.author : '', profile ? profile.name :
                    tags.join(', ')].filter(Boolean).join(' · ');
                rulesBox.innerHTML = '';
                if (!ruleText.trim()) {
                    rulesBox.appendChild(el('p', {class: 'proto-f-empty'},
                        ['This puzzle has no rules text. The board’s clue types are listed below.']));
                }
                if (standardRules) {
                    rulesBox.appendChild(el('p', {class: 'proto-f-note'},
                        ['The setter wrote no rules. Standard ' + profile.name + ' rules:']));
                }
                // Paragraphs split on <br>; each sentence is its own span so a board hover can light it.
                const tpl = document.createElement('template');
                tpl.innerHTML = ruleText.replace(/<br\s*\/?>/gi, '\n');
                const text = tpl.content.textContent;
                text.split(/\n+/).forEach(function(para) {
                    if (!para.trim()) {
                        return;
                    }
                    const p = el('p');
                    const paraCtx = {subject: null};
                    (para.match(/[^.!?;:]+[.!?;:]*\s*/g) || [para]).forEach(function(sentence) {
                        const sEl = el('span', {class: 'proto-f-sentence'});
                        tokenize(sentence, catalog, paraCtx, compiled, roles).forEach(function(tok) {
                            sEl.appendChild(tok.kinds ? linkFor(tok) : document.createTextNode(tok.text));
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

            function hoverable(node, ids) {
                node.addEventListener('mouseenter', function() {
                    setHover(ids);
                });
                node.addEventListener('mouseleave', function() {
                    setHover(null);
                });
                node.addEventListener('click', function() {
                    togglePin(ids);
                });
            }

            function renderLegend() {
                legendBox.innerHTML = '';
                const said = mentioned();
                const ids = Object.keys(catalog).filter(function(id) {
                    const k = catalog[id];
                    if (id.indexOf('v:') === 0 || id === 'digits' || k.check) {
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
                    if (!said.has(id) && !k.outside) {
                        chip.appendChild(el('span', {class: 'proto-f-chip-flag'}, ['not in rules']));
                    }
                    hoverable(chip, [id]);
                    legendBox.appendChild(chip);
                });
            }

            // ---- Live checks: one row per genre check, its verdict recomputed after every change ----
            function checkIds() {
                return Object.keys(catalog).filter(function(id) {
                    return catalog[id].check;
                });
            }

            function renderChecks() {
                const ids = checkIds();
                if (!ids.length) {
                    checksBox.innerHTML = '';
                    checksBox.appendChild(el('p', {class: 'proto-f-empty'}, [profile ?
                        'No live checks for ' + profile.name + '; the rule links above still count.' :
                        'No genre recognised from the tags, title or rules, so no live checks.']));
                    return;
                }
                if (!checksBox.children.length || checksBox.firstChild.tagName === 'P') {
                    checksBox.innerHTML = '';
                    ids.forEach(function(id) {
                        const row = el('button', {type: 'button', class: 'proto-f-check', 'data-kinds': id,
                            title: 'Hover to see it on the board; click to keep it shown while you solve'}, [
                            el('span', {class: 'proto-f-check-dot'}),
                            el('span', {class: 'proto-f-check-label'}, [catalog[id].label]),
                            el('span', {class: 'proto-f-check-text'})
                        ]);
                        hoverable(row, [id]);
                        checksBox.appendChild(row);
                    });
                }
                checksBox.querySelectorAll('.proto-f-check').forEach(function(row) {
                    const k = catalog[row.dataset.kinds];
                    const items = k.items();
                    const sum = items.summary ? items.summary() : k.summary ? k.summary(items) : summarize(items, {});
                    row.querySelector('.proto-f-check-text').textContent = sum.text;
                    row.classList.remove('st-ok', 'st-bad', 'st-open');
                    row.classList.add('st-' + sum.state);
                });
            }

            function updateCounts() {
                document.querySelectorAll('.proto-f-root [data-kinds]').forEach(function(node) {
                    const ids = node.dataset.kinds.split(' ');
                    let n = 0;
                    ids.forEach(function(id) {
                        if (catalog[id]) {
                            // Pencil-mark hits and plain lit cells are drawn but not counted.
                            n += catalog[id].items().filter(function(it) {
                                return !it.faint && !it.faintOk && it.label !== 'dark';
                            }).length;
                        }
                    });
                    const live = ids.some(function(id) {
                        return catalog[id] && catalog[id].live;
                    });
                    const badge = node.querySelector('.proto-f-count, .proto-f-chip-count');
                    // Digit phrases ("1", "digits") are everywhere in sudoku rules; a count on each is noise.
                    const quiet = ids.every(function(id) {
                        return id.indexOf('v:') === 0 || id === 'digits' || id === 'givens';
                    }) && node.classList.contains('proto-f-link');
                    // A check's badge is its verdict, not an item count.
                    const chk = ids.filter(function(id) {
                        return catalog[id] && catalog[id].check;
                    })[0];
                    if (badge && chk && node.classList.contains('proto-f-link')) {
                        const row = checksBox.querySelector('[data-kinds="' + chk + '"]');
                        badge.textContent = !row ? '' : row.classList.contains('st-ok') ? '✓' :
                            row.classList.contains('st-bad') ? '✗' : '';
                    } else if (badge) {
                        badge.textContent = quiet ? '' : String(n);
                    }
                    node.classList.toggle('is-live', live);
                    node.classList.toggle('is-zero', n === 0);
                    node.classList.toggle('is-bad', ids.some(function(id) {
                        return catalog[id] && catalog[id].items().some(function(it) {
                            return it.bad;
                        });
                    }));
                });
            }

            // ---- Highlight state ----
            function setHover(kinds) {
                hoverKinds = kinds;
                drawOverlay();
                markActive();
            }

            function togglePin(kinds) {
                const all = kinds.every(function(k) {
                    return pinned.indexOf(k) >= 0;
                });
                pinned = all ? pinned.filter(function(k) {
                    return kinds.indexOf(k) < 0;
                }) : pinned.concat(kinds.filter(function(k) {
                    return pinned.indexOf(k) < 0;
                }));
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
                    node.classList.toggle('is-pinned', ids.every(function(i) {
                        return pinned.indexOf(i) >= 0;
                    }));
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
                const tags = svgEl('g', {});
                svg.appendChild(marks);
                svg.appendChild(tags);
                ids.forEach(function(id) {
                    const kind = catalog[id];
                    if (!kind) {
                        return;
                    }
                    scopeItems(kind, kind.items()).forEach(function(it) {
                        const cls = 'proto-f-item' + (it.tone ? ' tone' : '') + (it.bad ? ' bad' : '') +
                            (it.ok && !it.faintOk ? ' ok' : '') + (it.faint ? ' faint' : '') +
                            (it.faintOk ? ' lit' : '') + (it.label === 'dark' ? ' dark' : '');
                        // A pinned check shows only what matters while solving: broken items, finished ones, and
                        // its counts; plain members (every cell of every row) would cover the board.
                        const quietPin = !hoverKinds && kind.check && !it.bad && !it.ok && it.label !== 'dark';
                        (it.cells || []).forEach(function(c) {
                            if (!pu.point[c] || pu.point[c].type !== 0) {
                                return;
                            }
                            const poly = cellPoly(c);
                            mask.appendChild(svgEl('polygon', {points: poly, fill: 'black'}));
                            if (!it.noFill && !quietPin) {
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
                            // Row counts sit left of the grid, column counts above it, the rest in a corner.
                            const first = it.cells.slice().sort(function(a, b) {
                                return it.side === 'top' ? pu.point[a].y - pu.point[b].y : pu.point[a].x - pu.point[b].x;
                            })[0];
                            const p = pagePt(it.side ? first : it.cells[0]);
                            const at = it.side === 'left' ? {x: p.x - cellPx * 0.58, y: p.y + 5, a: 'end'} :
                                it.side === 'top' ? {x: p.x, y: p.y - cellPx * 0.58, a: 'middle'} :
                                    {x: p.x - cellPx * 0.47, y: p.y - cellPx * 0.2, a: 'start'};
                            const t = svgEl('text', {x: at.x, y: at.y, 'text-anchor': at.a,
                                class: 'proto-f-tag small' + (it.side ? ' side' : '') + (it.bad ? ' bad' : it.ok ? ' ok' : '')});
                            t.textContent = it.corner;
                            tags.appendChild(t);
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
                    if (k.check || k.scoped || id.indexOf('v:') === 0 || id === 'digits' || (k.live && !said.has(id))) {
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

            /** What each live check says about this cell, e.g. "row 4: 2 of 4 stars". */
            function checkNotes(cell) {
                const notes = [];
                const ids = [];
                checkIds().forEach(function(id) {
                    const hits = catalog[id].items().filter(function(it) {
                        return (it.cells || []).indexOf(cell) >= 0 && it.label;
                    });
                    hits.forEach(function(it) {
                        notes.push({text: it.label, bad: it.bad, ok: it.ok});
                    });
                    if (hits.length) {
                        ids.push(id);
                    }
                });
                return {notes: notes, ids: ids};
            }

            let lastCell = null;
            function describeCell(cell, ids) {
                underCursor.innerHTML = '';
                const said = mentioned();
                const labels = ids.filter(function(id) {
                    return catalog[id] && !catalog[id].check;
                }).map(function(id) {
                    return catalog[id].label;
                });
                const notes = cell === null ? [] : checkNotes(cell).notes;
                underCursor.appendChild(document.createTextNode(labels.length ?
                    'Under the cursor: ' + labels.join(', ') + (ids.some(function(i) {
                        return said.has(i) && !catalog[i].check;
                    }) ? ' (lit above)' : ' (not named in the rules)') :
                    notes.length ? 'Under the cursor, the live checks say:' : 'Under the cursor: nothing the rules name.'));
                notes.slice(0, 4).forEach(function(n) {
                    underCursor.appendChild(el('div', {class: 'proto-f-note-line' + (n.bad ? ' bad' : n.ok ? ' ok' : '')},
                        [n.text]));
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
                    checkNotes(cell).ids.forEach(function(id) {
                        ids.add(id);
                    });
                }
                // A clue type under the cursor (thermo, cage, dot) outranks the generic digit phrases.
                const specific = Array.from(ids).filter(function(id) {
                    return id !== 'givens' && id.indexOf('v:') !== 0;
                });
                const list = specific.length ? specific : Array.from(ids);
                if (list.join(' ') === boardHover.join(' ') && cell === lastCell) {
                    return;
                }
                boardHover = list;
                lastCell = cell;
                markActive();
                describeCell(cell, list);
            });
            boardWrap.addEventListener('mouseleave', function() {
                boardHover = [];
                lastCell = null;
                markActive();
                underCursor.textContent = 'Hover the board to see which rule talks about it.';
            });

            // ---- Tools: the genre's own, then every mode folded under "All modes" ----
            function btn(label, cls, onclick, title) {
                return el('button', {type: 'button', class: 'proto-f-btn ' + (cls || ''), title: title || label,
                    onclick: onclick}, [label]);
            }

            function armTool(t) {
                bridge.setMode(t.mode);
                if (t.combi) {
                    bridge.setComposite(t.combi);
                }
                if (t.sub !== undefined) {
                    bridge.setSubmode(t.sub);
                }
                if (t.style !== undefined) {
                    bridge.setStyle(t.style);
                }
                renderModes();
            }

            function toolIsOn(t, st) {
                return st.mode === t.mode && (!t.combi || st.submode === t.combi) &&
                    (t.sub === undefined || String(st.submode) === String(t.sub));
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

            const foldBtn = btn('All modes ▸', 'proto-f-fold', function() {
                modesWrap.classList.toggle('is-folded');
                renderModes();
            }, 'Show every Penpa+ mode');

            function renderModes() {
                const st = bridge.getState();
                genreTools.innerHTML = '';
                if (tools.length) {
                    genreTools.appendChild(el('span', {class: 'proto-f-gtools-h'}, [profile.name + ' tools']));
                    let onTool = null;
                    tools.forEach(function(t) {
                        const on = toolIsOn(t, st);
                        if (on) {
                            onTool = t;
                        }
                        const b = btn(t.label, 'proto-f-tool' + (on ? ' is-on' : ''), function() {
                            armTool(t);
                        }, t.hint);
                        b.dataset.tool = t.id;
                        genreTools.appendChild(b);
                    });
                    genreTools.appendChild(foldBtn);
                    foldBtn.textContent = modesWrap.classList.contains('is-folded') ? 'All modes ▸' : 'All modes ▾';
                    genreTools.appendChild(el('div', {class: 'proto-f-hint'}, [onTool ? onTool.hint :
                        'Another mode is on. Pick a tool above, or click a verb in the rules.']));
                }
                rulesBox.querySelectorAll('.proto-f-verb').forEach(function(v) {
                    const t = T[v.dataset.tool];
                    v.classList.toggle('is-on', !!t && toolIsOn(t, st));
                });
                modeRow.innerHTML = '';
                bridge.listModes().filter(function(m) {
                    return !m.hidden;
                }).forEach(function(m) {
                    modeRow.appendChild(btn(m.label, m.mode === st.mode ? 'is-on' : '', function() {
                        bridge.setMode(m.mode);
                    }, m.label + ' mode'));
                });
                subRow.innerHTML = '';
                // A genre tool sets mode, sub-mode and style itself: its knobs show only with "All modes" open.
                const quiet = tools.length && modesWrap.classList.contains('is-folded') && tools.some(function(t) {
                    return toolIsOn(t, st);
                });
                subRow.style.display = quiet ? 'none' : '';
                if (st.mode === 'combi' && !quiet) {
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
                        ['This link has no answer check. Use the live checks above.']));
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
                checkBtn.classList.toggle('is-solved', verdict === true);
                // The verdict also shows on the button: the document's Answer check section may be scrolled away.
                checkBtn.textContent = verdict === true ? 'Solved ✓' : verdict === false ? 'Check: not yet' : 'Check';
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
                GEN++;
                catalog = newCatalog();
                renderInfo();
                renderLegend();
                renderChecks();
                indexBoard();
                updateCounts();
                markActive();
                drawOverlay();
            }

            refreshAll();
            if (tools.length) {
                armTool(tools[0]);
            }
            renderModes();
            renderStatus(false);
            renderTools(bridge.getState());
            fitBoard();

            bridge.onChange(function(st) {
                // Notifications are coalesced per frame and carry only the first trigger, so always re-render.
                GEN++;
                renderModes();
                renderTools(st);
                renderChecks();
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
                profile: function() {
                    return profile ? profile.key : null;
                },
                catalog: function() {
                    return catalog;
                },
                checks: function() {
                    return checkIds().map(function(id) {
                        const k = catalog[id];
                        const items = k.items();
                        const sum = items.summary ? items.summary() : k.summary ? k.summary(items) : summarize(items, {});
                        return id + ': ' + sum.state + ' — ' + sum.text;
                    });
                }
            };
        }
    };
})();
