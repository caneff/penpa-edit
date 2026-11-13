/*
 * PROTOTYPE (throwaway, branch prototype/solve-ui): solve-UI variant H, "Vim".
 * Owned by variant H's builder: this file and variant-H.css only. See README.md for the contract.
 *
 * The idea: the board is driven by a vim-style keyboard grammar. A tool is one letter (v value, c corner, m centre,
 * p path, e edge, s shade, x cross; Esc returns to NORMAL); counts and motions move a block cursor (3j, w = next
 * empty cell, ] = next clue, gg / G, ^ / $); a capital motion (HJKL, Shift+arrows) moves *and acts*: it extends the
 * selection in the value tools, draws the line in p, paints in s, crosses in x and walls the cell's side in e.
 * Operators work on the selection (digits, d, r<digit>, Space, -, .), ':' opens a command line (check / undo N / set
 * size / settings / help ...) and '?' shows the whole grammar. A status line at the bottom shows tool, pending
 * command, selection, history and timer; a which-key panel on the right shows what the next key can do. The mouse
 * still works (Penpa's own handlers) and the cursor follows it, but nothing needs it.
 *
 * The claim it tests: Penpa's power users are keyboard users; one composable grammar over every mode family beats
 * buttons for them.
 *
 * Grammar notes that came out of building it:
 *   - The brief's "l = line" collides with vim's hjkl. hjkl wins (it is the vim muscle memory); the line tool is
 *     p ("path", the GLOSSARY family name).
 *   - Digits cannot be both values and counts. As in vim's Insert vs Normal: in v / c / m a digit is a value, in
 *     NORMAL (Esc) and in p / e / x it is a count. In s a digit picks the Surface brush (when the puzzle shades with
 *     Surface) and is a count otherwise.
 *
 * Keyboard capture: a capture-phase keydown/keyup listener on window. For every trusted key the grammar owns it calls
 * preventDefault + stopImmediatePropagation, so Penpa's document listener (main.js:84-85) never sees it, including
 * bare Shift / Ctrl (which would flip Sudoku's temporary Corner / Centre sub-mode). Synthetic keys from
 * bridge.sendKey (isTrusted = false) pass straight through to Penpa. Keys pass untouched while a legacy dialog or
 * SweetAlert popup is open, or focus is in another text field; F1-F12 and unhandled Ctrl/Meta combos also pass.
 *
 * Bridge gaps worked around here (read `pu` directly):
 *   - Cell list, adjacency and corner vertices: pu.centerlist, pu.point[c].adjacent / .surround (no bridge call).
 *   - "Empty cell" / "clue" for w and ]: pu.pu_q / pu.pu_a .number, .numberS, .surface, .symbol, .line (no bridge
 *     call for cell contents).
 *   - The link's Composite tool when Composite is not the current mode: pu.mode[qa].combi[0].
 *   - Edge midpoint between two cells (for crosses): nearest pu.point to the midpoint of two centres.
 *   - Keyboard drawing goes through bridge.pointer (point-index drags/clicks), one gesture per step.
 */
(function() {
    'use strict';

    let B = null; // the bridge
    let H = null; // ctx.helpers

    // ---- Tools ----------------------------------------------------------------------------------------------------

    /** The tool letters, in Tab order. */
    const TOOL_ORDER = ['n', 'v', 'c', 'm', 'p', 'e', 's', 'x'];
    const TOOL_NAME = {n: 'NORMAL', v: 'VALUE', c: 'CORNER', m: 'CENTRE', p: 'PATH', e: 'EDGE', s: 'SHADE', x: 'CROSS'};
    const VALUE_TOOLS = ['v', 'c', 'm'];

    /** Composite tools, by what they let each of our tools do (Penpa+ README § Composite). */
    const COMBI_PATH = ['linex', 'lineox', 'yajilin'];
    const COMBI_EDGE = ['edgex', 'edgexoi'];
    const COMBI_SHADE = ['blpo', 'blwh', 'yajilin', 'star', 'lineox', 'tents', 'akari', 'mines', 'doublemines'];
    const COMBI_CROSS = ['linex', 'lineox', 'yajilin', 'edgex', 'edgexoi'];

    /**
     * For each tool, how it reaches the engine on this puzzle: {mode, sub?, combi?, how}. Built once at mount from the
     * modes the link offers. A tool with no plan is shown greyed and refuses with a message.
     */
    let plans = {};

    function buildPlans() {
        const modes = B.listModes().filter(function(m) {
            return !m.hidden;
        }).map(function(m) {
            return m.mode;
        });
        const has = function(m) {
            return modes.indexOf(m) !== -1;
        };
        const qa = pu.mode.qa;
        const combi = has('combi') && pu.mode[qa].combi ? pu.mode[qa].combi[0] : null;
        const subs = function(mode) {
            return B.listSubmodes(mode).map(function(s) {
                return s.value;
            });
        };
        const p = {n: {how: 'none'}};
        if (has('sudoku')) {
            const s = subs('sudoku');
            p.v = {mode: 'sudoku', sub: '1', how: 'key'};
            p.c = {mode: 'sudoku', sub: s.indexOf('2') !== -1 ? '2' : '3', how: 'key'};
            p.m = {mode: 'sudoku', sub: '3', how: 'key'};
        } else if (has('number')) {
            p.v = {mode: 'number', sub: '1', how: 'key'};
            p.c = {mode: 'number', sub: '7', how: 'key'}; // Candidates
            p.m = {mode: 'number', sub: '7', how: 'key'};
        }
        if (has('line')) {
            p.p = {mode: 'line', sub: '1', how: 'drag'};
        } else if (combi && COMBI_PATH.indexOf(combi) !== -1) {
            p.p = {mode: 'combi', combi: combi, how: 'drag'};
        }
        if (has('lineE')) {
            p.e = {mode: 'lineE', sub: '1', how: 'side'};
        } else if (combi && COMBI_EDGE.indexOf(combi) !== -1) {
            p.e = {mode: 'combi', combi: combi, how: 'side'};
        }
        if (combi && COMBI_SHADE.indexOf(combi) !== -1) {
            p.s = {mode: 'combi', combi: combi, how: 'click'};
        } else if (has('surface')) {
            p.s = {mode: 'surface', how: 'click', brush: true};
        }
        if (has('line')) {
            p.x = {mode: 'line', sub: '4', how: 'edgeLeft'}; // Helper (x): a left click on an edge toggles an x
        } else if (combi && COMBI_CROSS.indexOf(combi) !== -1) {
            p.x = {mode: 'combi', combi: combi, how: 'edgeRight'};
        }
        plans = p;
    }

    /** Put the engine in the mode, sub-mode or Composite tool the tool's plan names (only if it is not already). */
    function engage(tool) {
        const plan = plans[tool];
        if (!plan || !plan.mode) {
            return;
        }
        const cur = B.getMode();
        if (cur.mode !== plan.mode) {
            B.setMode(plan.mode);
        }
        if (plan.sub && B.getMode().submode !== plan.sub) {
            B.setSubmode(plan.sub);
        }
        if (plan.combi && B.getMode().submode !== plan.combi) {
            B.setComposite(plan.combi);
        }
    }

    // ---- Board geometry -------------------------------------------------------------------------------------------

    let cells = [];       // pu.centerlist, in reading order
    let cellSet = null;

    function readCells() {
        cells = pu.centerlist.filter(function(c) {
            return pu.point[c] && pu.point[c].use === 1;
        });
        const tol = pu.size / 4;
        cells.sort(function(a, b) {
            const pa = pu.point[a];
            const pb = pu.point[b];
            return Math.abs(pa.y - pb.y) > tol ? pa.y - pb.y : pa.x - pb.x;
        });
        cellSet = new Set(cells);
    }

    const DIRS = {h: [-1, 0], l: [1, 0], k: [0, -1], j: [0, 1]};

    /** The neighbour of cell c in direction d ('h'|'j'|'k'|'l'), by geometry, so hex grids work too. */
    function neighbour(c, d) {
        const v = DIRS[d];
        const p = pu.point[c];
        let best = null;
        let bestDot = 0.3;
        (p.adjacent || []).forEach(function(a) {
            if (!cellSet.has(a)) {
                return;
            }
            const q = pu.point[a];
            const dx = q.x - p.x;
            const dy = q.y - p.y;
            const len = Math.hypot(dx, dy) || 1;
            const dot = (dx * v[0] + dy * v[1]) / len;
            if (dot > bestDot + 1e-6) {
                bestDot = dot;
                best = a;
            }
        });
        return best;
    }

    function sameRow(a, b) {
        return Math.abs(pu.point[a].y - pu.point[b].y) <= pu.size / 4;
    }
    function sameCol(a, b) {
        return Math.abs(pu.point[a].x - pu.point[b].x) <= pu.size / 4;
    }

    /** Row and column labels (r3c4) for square-ish grids: rank of y / x among distinct centre rows / columns. */
    function rc(c) {
        const ys = [];
        const xs = [];
        const tol = pu.size / 4;
        cells.forEach(function(k) {
            const p = pu.point[k];
            if (!ys.some(function(y) {
                return Math.abs(y - p.y) <= tol;
            })) {
                ys.push(p.y);
            }
            if (!xs.some(function(x) {
                return Math.abs(x - p.x) <= tol;
            })) {
                xs.push(p.x);
            }
        });
        ys.sort(function(a, b) {
            return a - b;
        });
        xs.sort(function(a, b) {
            return a - b;
        });
        const p = pu.point[c];
        const r = ys.findIndex(function(y) {
            return Math.abs(y - p.y) <= tol;
        }) + 1;
        const col = xs.findIndex(function(x) {
            return Math.abs(x - p.x) <= tol;
        }) + 1;
        return 'r' + r + 'c' + col;
    }

    /** The board point nearest the midpoint of two adjacent cells (their shared edge), any type but centre/vertex. */
    function edgeBetween(a, b) {
        const pa = pu.point[a];
        const pb = pu.point[b];
        const mx = (pa.x + pb.x) / 2;
        const my = (pa.y + pb.y) / 2;
        let best = null;
        let min = Infinity;
        pu.point.forEach(function(p, i) {
            if (!p || p.use !== 1 || p.type === 0 || p.type === 1) {
                return;
            }
            const d = (p.x - mx) ** 2 + (p.y - my) ** 2;
            if (d < min) {
                min = d;
                best = i;
            }
        });
        return best;
    }

    /** The two corner vertices of cell c on its side facing direction d. */
    function sideVertices(c, d) {
        const v = DIRS[d];
        const p = pu.point[c];
        const corners = (p.surround || []).filter(function(s) {
            return pu.point[s];
        }).map(function(s) {
            const q = pu.point[s];
            const dx = q.x - p.x;
            const dy = q.y - p.y;
            return {i: s, dot: (dx * v[0] + dy * v[1]) / (Math.hypot(dx, dy) || 1)};
        }).sort(function(a, b) {
            return b.dot - a.dot;
        });
        return corners.length >= 2 ? [corners[0].i, corners[1].i] : null;
    }

    // ---- Cell contents (for w / b / ] / [ and d) -----------------------------------------------------------------

    function nonEmpty(o, k) {
        return o && o[k] !== undefined && o[k] !== null && o[k] !== '' && !(Array.isArray(o[k]) && o[k][0] === '');
    }
    function isClue(c) {
        const q = pu.pu_q;
        return nonEmpty(q.number, c) || nonEmpty(q.symbol, c);
    }
    function hasLineThrough(c) {
        const keys = Object.keys(pu.pu_a.line || {});
        return keys.some(function(k) {
            return k.split(',').indexOf(String(c)) !== -1;
        });
    }
    function isShaded(c) {
        return nonEmpty(pu.pu_a.surface, c) || nonEmpty(pu.pu_a.symbol, c);
    }
    /** "Empty" depends on the tool: no value in v/c/m/n, no shade or dot in s, no line through it in p/x/e. */
    function isEmpty(c) {
        if (tool === 's') {
            return !isShaded(c) && !nonEmpty(pu.pu_q.number, c);
        }
        if (tool === 'p' || tool === 'x' || tool === 'e') {
            return !hasLineThrough(c) && !isClue(c);
        }
        return !nonEmpty(pu.pu_q.number, c) && !isValue(pu.pu_a.number && pu.pu_a.number[c]);
    }
    /** A solver's number entry that is a value, not Sudoku centre marks (sub-style "6"). */
    function isValue(entry) {
        return !!entry && entry[0] !== '' && entry[2] !== '6';
    }

    // ---- State ----------------------------------------------------------------------------------------------------

    let tool = 'n';
    let cursor = null;
    let sel = [];           // selected cells; always contains the cursor
    let count = '';         // pending count
    let pending = '';       // pending operator / prefix: 'g', 'r', 'd'
    let message = '';       // last status message
    let messageKind = '';   // '', 'ok', 'err'
    let lastChange = null;  // {label, run()} for '.'
    let ui = {};            // DOM refs

    function say(text, kind) {
        message = text;
        messageKind = kind || '';
        render();
    }

    function setTool(t) {
        if (t !== 'n' && !plans[t]) {
            say(TOOL_NAME[t] + ' does not apply to this puzzle', 'err');
            return;
        }
        tool = t;
        engage(t);
        if (VALUE_TOOLS.indexOf(t) === -1 && sel.length > 1) {
            sel = [cursor];
        }
        syncSelection();
        say('');
    }

    function moveTo(c, extend) {
        if (c === null || c === undefined) {
            return;
        }
        cursor = c;
        if (extend) {
            if (sel.indexOf(c) === -1) {
                sel.push(c);
            }
        } else {
            sel = [c];
        }
        syncSelection();
    }

    /** Mirror our selection into Penpa's (its own highlight, and what its key handler acts on). */
    function syncSelection() {
        if (VALUE_TOOLS.indexOf(tool) !== -1 || tool === 'n') {
            B.select(sel);
        } else {
            pu.cursol = cursor;
        }
        render();
    }

    // ---- Actions --------------------------------------------------------------------------------------------------

    function record(label, run) {
        lastChange = {label: label, run: run};
    }

    function enterValue(key, asTool) {
        const t = asTool || tool;
        engage(t);
        B.select(sel);
        B.sendKey(key);
        record(key + ' (' + TOOL_NAME[t].toLowerCase() + ')', function() {
            enterValue(key, t);
        });
    }

    /** Clear the selection's contents in the current tool's layer. */
    function deleteSel() {
        const t = tool;
        if (t === 'n' || VALUE_TOOLS.indexOf(t) !== -1) {
            engage(t === 'n' ? (plans.v ? 'v' : 'n') : t);
            B.select(sel);
            // Not 'Delete': Penpa tests e.keyCode === 46 (main.js:498) and a synthetic event's keyCode is 0. Space
            // reaches the same pu.key_space.
            B.sendKey(' ');
        } else if (t === 's') {
            engage('s');
            sel.forEach(function(c) {
                for (let i = 0; i < 3 && isShaded(c); i++) {
                    B.pointer([c]);
                }
            });
        } else if (t === 'p') {
            engage('p');
            sel.forEach(function(c) {
                ['h', 'j', 'k', 'l'].forEach(function(d) {
                    const n = neighbour(c, d);
                    const line = pu.pu_a.line || {};
                    if (n !== null && line[Math.min(c, n) + ',' + Math.max(c, n)]) {
                        B.pointer([c, n]);
                    }
                });
            });
        } else {
            say('d in ' + TOOL_NAME[t] + ': not supported; use u to undo', 'err');
            return;
        }
        record('delete', deleteSel);
    }

    /** Space / Enter: the tool's primary act on every selected cell. '-' is the secondary act. */
    function applyPrimary(secondary) {
        const t = tool;
        if (t === 's') {
            engage('s');
            sel.forEach(function(c) {
                B.pointer([c], secondary ? {button: 2} : {});
            });
            record(secondary ? 'secondary shade' : 'shade', function() {
                applyPrimary(secondary);
            });
        } else {
            say((secondary ? '-' : 'Space') + ' does nothing in ' + TOOL_NAME[t] + '; try a capital motion (HJKL)', 'err');
        }
    }

    /** One step of a capital motion: move to the neighbour and act on the way. Returns false if blocked. */
    function actStep(d) {
        const n = neighbour(cursor, d);
        const plan = plans[tool];
        if (tool === 'e') {
            const vs = sideVertices(cursor, d);
            if (vs) {
                engage('e');
                B.pointer(vs);
            }
            return false; // edges do not move the cursor: one wall per keypress
        }
        if (n === null) {
            return false;
        }
        if (tool === 'p') {
            engage('p');
            B.pointer([cursor, n]);
        } else if (tool === 'x') {
            engage('x');
            const e = edgeBetween(cursor, n);
            B.pointer([e], plan.how === 'edgeRight' ? {button: 2} : {});
            return false; // a cross does not move the cursor either: it marks "no line this way"
        } else if (tool === 's') {
            engage('s');
            B.pointer([n]);
        }
        moveTo(n, VALUE_TOOLS.indexOf(tool) !== -1 || tool === 'n');
        return true;
    }

    function motion(d, n, act) {
        if (act && tool !== 'n' && VALUE_TOOLS.indexOf(tool) === -1) {
            for (let i = 0; i < n; i++) {
                if (!actStep(d)) {
                    break;
                }
            }
            record(n + d.toUpperCase(), function() {
                motion(d, n, true);
            });
            render();
            return;
        }
        let c = cursor;
        for (let i = 0; i < n; i++) {
            const next = neighbour(c, d);
            if (next === null) {
                break;
            }
            c = next;
            if (act) {
                moveTo(c, true);
            }
        }
        if (!act) {
            moveTo(c, false);
        }
    }

    function nextWhere(pred, dir, n) {
        let i = cells.indexOf(cursor);
        let found = cursor;
        for (let k = 0; k < n; k++) {
            let j = i;
            for (let step = 0; step < cells.length; step++) {
                j = (j + dir + cells.length) % cells.length;
                if (pred(cells[j])) {
                    break;
                }
            }
            if (!pred(cells[j])) {
                say('no such cell', 'err');
                return;
            }
            i = j;
            found = cells[j];
        }
        moveTo(found, false);
    }

    function selectWhere(pred, label) {
        sel = cells.filter(pred);
        if (sel.indexOf(cursor) === -1) {
            sel.push(cursor);
        }
        if (VALUE_TOOLS.indexOf(tool) === -1 && tool !== 'n') {
            setTool(plans.v ? 'v' : 'n');
        }
        syncSelection();
        say(label + ': ' + sel.length + ' cells');
    }

    function boxOf(c) {
        // Sudoku 3x3 box by r/c rank; other grids: the 3x3 block around nothing, so just the row.
        const m = /r(\d+)c(\d+)/.exec(rc(c));
        const r = +m[1];
        const col = +m[2];
        return function(k) {
            const mk = /r(\d+)c(\d+)/.exec(rc(k));
            return Math.floor((+mk[1] - 1) / 3) === Math.floor((r - 1) / 3) &&
                Math.floor((+mk[2] - 1) / 3) === Math.floor((col - 1) / 3);
        };
    }

    function valueAt(c) {
        const a = pu.pu_a.number && pu.pu_a.number[c];
        const q = pu.pu_q.number && pu.pu_q.number[c];
        const v = (q && q[0] !== '') ? q : (isValue(a) ? a : null);
        return v ? String(v[0]) : null;
    }

    function undoN(n) {
        for (let i = 0; i < n; i++) {
            B.undo();
        }
        say('undo ' + n);
    }
    function redoN(n) {
        for (let i = 0; i < n; i++) {
            B.redo();
        }
        say('redo ' + n);
    }

    function runCheck() {
        const r = B.check();
        if (!r.hasAnswerCheck) {
            say('check: this link has no answer check', 'err');
        } else {
            say(r.solved ? 'check: SOLVED' : 'check: not solved yet', r.solved ? 'ok' : 'err');
        }
    }

    // ---- The grammar ----------------------------------------------------------------------------------------------

    function takeCount() {
        const n = count ? Math.max(1, parseInt(count, 10)) : 1;
        count = '';
        return n;
    }

    /** Feed one key (KeyboardEvent.key plus shift/ctrl). Returns true if the grammar consumed it. */
    function feed(key, ev) {
        message = '';
        const ctrl = ev.ctrlKey || ev.metaKey;

        if (ctrl) {
            const k = key.toLowerCase();
            if (k === 'z') {
                undoN(takeCount());
            } else if (k === 'y' || k === 'r') {
                redoN(takeCount());
            } else {
                return false;
            }
            return true;
        }

        if (key === 'Escape') {
            if (pending || count) {
                pending = '';
                count = '';
            } else if (sel.length > 1) {
                sel = [cursor];
                syncSelection();
            } else if (tool !== 'n') {
                setTool('n');
            }
            render();
            return true;
        }

        // Prefixes waiting for their second key.
        if (pending === 'g') {
            pending = '';
            if (key === 'g') {
                moveTo(cells[0], false);
            } else if (key === 'r') {
                selectWhere(function(k) {
                    return sameRow(k, cursor);
                }, 'row');
            } else if (key === 'c') {
                selectWhere(function(k) {
                    return sameCol(k, cursor);
                }, 'column');
            } else if (key === 'b') {
                selectWhere(boxOf(cursor), 'box');
            } else if (key === 'a') {
                selectWhere(function() {
                    return true;
                }, 'all');
            } else {
                say('g' + key + ': unknown', 'err');
            }
            render();
            return true;
        }
        if (pending === 'r') {
            pending = '';
            if (/^[0-9a-zA-Z]$/.test(key) && plans.v) {
                enterValue(key, 'v');
                engage(tool === 'n' ? 'v' : tool);
            } else {
                say('r' + key + ': needs a value tool and a digit', 'err');
            }
            render();
            return true;
        }
        if (pending === 'd') {
            pending = '';
            if (key === 'd') {
                deleteSel();
            } else if (DIRS[key] && tool === 'p') {
                const n = neighbour(cursor, key);
                const line = pu.pu_a.line || {};
                if (n !== null && line[Math.min(cursor, n) + ',' + Math.max(cursor, n)]) {
                    engage('p');
                    B.pointer([cursor, n]);
                }
            } else {
                say('d' + key + ': unknown (dd clears the selection)', 'err');
            }
            render();
            return true;
        }

        // Digits: values in v/c/m, brushes in s (Surface), counts elsewhere.
        if (/^[0-9]$/.test(key)) {
            if (VALUE_TOOLS.indexOf(tool) !== -1) {
                enterValue(key);
            } else if (tool === 's' && plans.s.brush && !count) {
                engage('s');
                B.sendKey(key);
                say('brush ' + key);
            } else if (key === '0' && !count) {
                nextRowEdge(-1);
            } else {
                count += key;
            }
            render();
            return true;
        }

        const lower = key.length === 1 ? key.toLowerCase() : key;
        const arrow = {ArrowLeft: 'h', ArrowRight: 'l', ArrowUp: 'k', ArrowDown: 'j'}[key];
        if (arrow || (key.length === 1 && DIRS[lower])) {
            const d = arrow || lower;
            const act = arrow ? ev.shiftKey : key !== lower;
            motion(d, takeCount(), act);
            return true;
        }

        switch (key) {
        case 'v': case 'c': case 'm': case 'p': case 'e': case 's': case 'x':
            setTool(key);
            break;
        case 'i':
            setTool('v');
            break;
        case 'Tab': {
            const avail = TOOL_ORDER.filter(function(t) {
                return t === 'n' || plans[t];
            });
            const i = avail.indexOf(tool);
            setTool(avail[(i + (ev.shiftKey ? -1 : 1) + avail.length) % avail.length]);
            break;
        }
        case 'w':
            nextWhere(isEmpty, 1, takeCount());
            break;
        case 'b':
            nextWhere(isEmpty, -1, takeCount());
            break;
        case ']':
            nextWhere(isClue, 1, takeCount());
            break;
        case '[':
            nextWhere(isClue, -1, takeCount());
            break;
        case '^':
            nextRowEdge(-1);
            break;
        case '$':
            nextRowEdge(1);
            break;
        case 'G':
            moveTo(count ? cells[Math.min(cells.length, takeCount()) - 1] : cells[cells.length - 1], false);
            break;
        case 'g':
        case 'r':
        case 'd':
            pending = key;
            break;
        case '*': {
            const v = valueAt(cursor);
            if (v === null) {
                say('* needs a value under the cursor', 'err');
            } else {
                selectWhere(function(k) {
                    return valueAt(k) === v;
                }, 'all ' + v + 's');
            }
            break;
        }
        case 'Delete':
        case 'Backspace':
            deleteSel();
            break;
        case ' ':
        case 'Enter':
            applyPrimary(false);
            break;
        case '-':
            applyPrimary(true);
            break;
        case '.':
            if (lastChange) {
                const n = takeCount();
                for (let i = 0; i < n; i++) {
                    lastChange.run();
                }
                say('repeated: ' + lastChange.label);
            } else {
                say('nothing to repeat', 'err');
            }
            break;
        case 'u':
            undoN(takeCount());
            break;
        case 'U':
            redoN(takeCount());
            break;
        case ':':
            openCommand('');
            break;
        case '?':
            toggleHelp();
            break;
        default:
            count = '';
            say('"' + key + '" is not in the grammar; ? shows it', 'err');
        }
        render();
        return true;
    }

    function nextRowEdge(dir) {
        const row = cells.filter(function(k) {
            return sameRow(k, cursor);
        });
        moveTo(dir < 0 ? row[0] : row[row.length - 1], false);
    }

    // ---- Command line ---------------------------------------------------------------------------------------------

    const COMMANDS = {
        'check': 'run the answer check (also :w)',
        'w': 'check',
        'undo': ':undo N, undo N steps (also :u N)',
        'redo': ':redo N, redo N steps (also :red N)',
        'goto': ':goto N, jump to history step N (0 = empty board)',
        'set': ':set size=N (cell px), :set fit',
        'color': ':color N, the Surface brush',
        'mode': ':mode NAME [SUB], any engine mode raw (surface, multicolor, line, lineE, wall, number, symbol, ' +
            'special, cage, combi, sudoku, move)',
        'clear': ':clear (this mode) or :clear! (everything)',
        'pause': 'pause the timer',
        'start': 'start the timer',
        'settings': 'the legacy Settings dialog',
        'rules': 'the rules popup',
        'help': 'the grammar (also ?)',
        'q': 'quit'
    };

    let cmdHistory = [];
    let cmdHistoryPos = 0;

    function openCommand(text) {
        ui.cmd.classList.add('is-open');
        ui.cmdInput.value = text;
        ui.cmdInput.focus();
        cmdHistoryPos = cmdHistory.length;
        render();
    }
    function closeCommand() {
        ui.cmd.classList.remove('is-open');
        ui.cmdInput.blur();
        render();
    }

    function runCommand(line) {
        line = line.trim();
        if (!line) {
            return;
        }
        cmdHistory.push(line);
        const m = /^(\d+)$/.exec(line);
        if (m) {
            // ':12' jumps the cursor to cell 12 in reading order, as vim's :N goes to a line.
            moveTo(cells[Math.min(cells.length, Math.max(1, +m[1])) - 1], false);
            return;
        }
        const parts = line.split(/\s+/);
        const cmd = parts[0];
        const arg = parts[1];
        const num = arg !== undefined ? parseInt(arg, 10) : 1;
        switch (cmd) {
        case 'check': case 'w': case 'wq': case 'x':
            runCheck();
            break;
        case 'u': case 'undo':
            undoN(num || 1);
            break;
        case 'red': case 'redo':
            redoN(num || 1);
            break;
        case 'goto':
            B.jumpTo(num || 0);
            say('history step ' + (num || 0));
            break;
        case 'set': {
            const a = parts.slice(1).join(' ');
            const sm = /^size\s*=?\s*(\d+)$/.exec(a);
            if (sm) {
                B.setCellSize(+sm[1]);
                requestAnimationFrame(render);
                say('size ' + sm[1]);
            } else if (a === 'fit') {
                fitBoard();
                say('fit');
            } else {
                say(':set size=N or :set fit', 'err');
            }
            break;
        }
        case 'color': case 'colour':
            if (plans.s && plans.s.brush) {
                engage('s');
                tool = 's';
                B.setStyle(num);
                say('brush ' + num);
            } else {
                say('this puzzle shades with a Composite tool, which has no brush', 'err');
            }
            break;
        case 'mode':
            try {
                B.setMode(arg);
                if (parts[2]) {
                    B.setSubmode(parts[2]);
                }
                say('engine mode ' + JSON.stringify(B.getMode()) + ' (raw; the tool letters will switch it back)');
            } catch (e) {
                say('mode ' + arg + ': ' + e.message, 'err');
            }
            break;
        case 'clear':
            B.clear('mode');
            break;
        case 'clear!':
            B.clear('all');
            break;
        case 'pause':
            B.pauseTimer();
            break;
        case 'start':
            B.startTimer();
            break;
        case 'settings': case 'se':
            B.openSettings();
            break;
        case 'rules':
            B.showRules();
            break;
        case 'help': case 'h':
            toggleHelp(true);
            break;
        case 'q': case 'q!':
            say('E37: nowhere to quit to; :w checks the answer', 'err');
            break;
        default:
            say('E492: not an editor command: ' + line, 'err');
        }
    }

    function completeCommand() {
        const v = ui.cmdInput.value;
        const names = Object.keys(COMMANDS).filter(function(k) {
            return k.indexOf(v) === 0;
        });
        if (names.length === 1) {
            ui.cmdInput.value = names[0] + ' ';
        } else if (names.length > 1) {
            say(names.join('  '));
        }
    }

    function onCommandKey(e) {
        if (e.key === 'Enter') {
            const v = ui.cmdInput.value;
            closeCommand();
            runCommand(v);
            render();
        } else if (e.key === 'Escape' || (e.key === 'Backspace' && !ui.cmdInput.value)) {
            closeCommand();
        } else if (e.key === 'Tab') {
            completeCommand();
        } else if (e.key === 'ArrowUp' || e.key === 'ArrowDown') {
            cmdHistoryPos = Math.max(0, Math.min(cmdHistory.length, cmdHistoryPos + (e.key === 'ArrowUp' ? -1 : 1)));
            ui.cmdInput.value = cmdHistory[cmdHistoryPos] || '';
        } else {
            return; // a typed character: let the input have it (Penpa still does not see it)
        }
        e.preventDefault();
    }

    // ---- Keyboard capture -----------------------------------------------------------------------------------------

    function dialogOpen() {
        if (document.querySelector('.swal2-container')) {
            return true;
        }
        const mods = document.querySelectorAll('.modal');
        for (let i = 0; i < mods.length; i++) {
            if (getComputedStyle(mods[i]).display !== 'none') {
                return true;
            }
        }
        return false;
    }

    function onKeyDown(e) {
        if (!e.isTrusted) {
            return; // bridge.sendKey: for Penpa
        }
        if (e.target === ui.cmdInput) {
            e.stopImmediatePropagation();
            onCommandKey(e);
            return;
        }
        if (dialogOpen() || (e.target && /^(INPUT|TEXTAREA|SELECT)$/.test(e.target.tagName))) {
            return;
        }
        if (/^F\d+$/.test(e.key) || (e.altKey && !e.ctrlKey)) {
            return; // browser keys, and Alt+arrows for the scaffold's switcher
        }
        if (e.key === 'Shift' || e.key === 'Control' || e.key === 'Alt' || e.key === 'Meta') {
            e.stopImmediatePropagation(); // Penpa would flip Sudoku's temporary Corner / Centre on these
            return;
        }
        if (helpOpen && e.key !== '?' && e.key !== 'Escape') {
            toggleHelp(false);
        } else if (helpOpen) {
            toggleHelp(false);
            e.preventDefault();
            e.stopImmediatePropagation();
            return;
        }
        if (feed(e.key, e)) {
            e.preventDefault();
            e.stopImmediatePropagation();
        }
    }

    function onKeyUp(e) {
        if (!e.isTrusted || dialogOpen()) {
            return;
        }
        if (e.target && /^(INPUT|TEXTAREA|SELECT)$/.test(e.target.tagName) && e.target !== ui.cmdInput) {
            return;
        }
        e.stopImmediatePropagation();
    }

    // ---- Help -----------------------------------------------------------------------------------------------------

    let helpOpen = false;

    const GRAMMAR = [
        ['Tools', [
            ['Esc', 'NORMAL: navigate; digits are counts'],
            ['v  i', 'VALUE: digits enter values'],
            ['c', 'CORNER marks (Candidates in Number)'],
            ['m', 'CENTRE marks'],
            ['p', 'PATH: lines between cell centres'],
            ['e', 'EDGE: lines on cell borders'],
            ['s', 'SHADE: paint cells (digits pick the brush)'],
            ['x', 'CROSS: x on the edge between two cells'],
            ['Tab', 'next tool (Shift+Tab previous)']
        ]],
        ['Motions (take a count: 3j)', [
            ['h j k l', 'left down up right (arrows too)'],
            ['w  b', 'next / previous empty cell'],
            [']  [', 'next / previous clue'],
            ['^ 0  $', 'row start / end'],
            ['gg  G  5G', 'first / last / 5th cell'],
            [':12', 'cell 12 in reading order']
        ]],
        ['Act while moving', [
            ['H J K L', 'Shift+motion: extend the selection (v c m n), draw the line (p), paint (s); ' +
                'x crosses and e walls that side without moving'],
            ['3L', 'three segments, three cells, ...']
        ]],
        ['Selection and operators', [
            ['gr gc gb ga', 'select row / column / box / all'],
            ['*', 'select every cell with the value under the cursor'],
            ['digit', 'enter it in every selected cell (v c m)'],
            ['r5', 'put a 5 as a value, from any tool'],
            ['dd  Del', 'clear the selection in this tool\'s layer'],
            ['dl', 'in p: erase the segment to the right'],
            ['Space  -', 'primary / secondary act on the selection (s: shade / dot or second colour)'],
            ['.', 'repeat the last change at the cursor (3. = three times)'],
            ['Esc', 'drop the pending command, then the selection, then the tool']
        ]],
        ['History', [
            ['u  3u', 'undo (three steps)'],
            ['U  Ctrl+R', 'redo'],
            [':goto N', 'jump to history step N']
        ]],
        ['Command line', [
            [':w  :check', 'answer check'],
            [':u N  :redo N', 'undo / redo N'],
            [':set size=48', 'cell size; :set fit'],
            [':color 4', 'Surface brush'],
            [':mode NAME', 'any engine mode, raw'],
            [':settings :rules', 'legacy dialogs'],
            [':pause :start', 'timer'],
            [':clear  :clear!', 'erase this mode / everything'],
            ['Tab  Up/Down', 'complete / history']
        ]]
    ];

    function buildHelp() {
        const el = H.el;
        const cols = GRAMMAR.map(function(group) {
            return el('section', {class: 'proto-h-help-group'}, [
                el('h3', {}, [group[0]]),
                el('table', {}, group[1].map(function(row) {
                    return el('tr', {}, [el('td', {class: 'proto-h-k'}, [row[0]]), el('td', {}, [row[1]])]);
                }))
            ]);
        });
        return el('div', {class: 'proto-h-help'}, [
            el('div', {class: 'proto-h-help-card'}, [
                el('div', {class: 'proto-h-help-title'}, ['The grammar   [count] [tool | motion | operator]   ? or Esc closes']),
                el('div', {class: 'proto-h-help-cols'}, cols)
            ])
        ]);
    }

    function toggleHelp(force) {
        helpOpen = force === undefined ? !helpOpen : force;
        ui.help.classList.toggle('is-open', helpOpen);
    }

    // ---- Which-key panel: what the next key does ------------------------------------------------------------------

    function whichKey() {
        if (pending === 'g') {
            return [['g', 'first cell'], ['r', 'select row'], ['c', 'select column'], ['b', 'select box'], ['a', 'select all']];
        }
        if (pending === 'r') {
            return [['0-9', 'put this value in the selection']];
        }
        if (pending === 'd') {
            return [['d', 'clear the selection'], ['hjkl', 'erase the segment that way (p)']];
        }
        const common = [['hjkl', 'move (count first: 3j)'], ['w b ] [', 'empty / clue'], ['u U', 'undo / redo']];
        const by = {
            n: [['1-9', 'count'], ['HJKL', 'extend selection'], ['v c m', 'enter values / marks'], ['p e s x', 'draw / shade / cross'], ['r5', 'value 5 here'], [':w', 'check']],
            v: [['1-9', 'value in selection'], ['HJKL', 'extend selection'], ['gr gc gb', 'row / col / box'], ['*', 'same value'], ['dd', 'clear'], ['.', 'repeat']],
            c: [['1-9', 'toggle corner mark'], ['HJKL', 'extend selection'], ['gb', 'box'], ['dd', 'clear']],
            m: [['1-9', 'toggle centre mark'], ['HJKL', 'extend selection'], ['gb', 'box'], ['dd', 'clear']],
            p: [['HJKL', 'draw a segment and move'], ['3L', 'three segments'], ['dl', 'erase segment right'], ['dd', 'erase lines at cursor']],
            e: [['HJKL', 'wall that side of the cell'], ['1-9', 'count']],
            s: [['Space', 'shade selection'], ['-', 'dot / second colour'], ['HJKL', 'paint as you move'], ['dd', 'clear'],
                (plans.s && plans.s.brush) ? ['1-9', 'brush'] : ['1-9', 'count']],
            x: [['HJKL', 'cross the edge that way'], ['1-9', 'count']]
        };
        return (by[tool] || []).concat(common);
    }

    // ---- Rendering ------------------------------------------------------------------------------------------------

    function render() {
        if (!ui.status) {
            return;
        }
        const st = B.getState();
        // Tabline: tools, greyed when this puzzle has no plan for them.
        TOOL_ORDER.forEach(function(t) {
            const b = ui.tabs[t];
            b.classList.toggle('is-on', t === tool);
            b.classList.toggle('is-off', t !== 'n' && !plans[t]);
        });
        ui.root.dataset.tool = tool;
        ui.mode.textContent = '-- ' + TOOL_NAME[tool] + ' --';
        ui.pending.textContent = count + pending;
        ui.selInfo.textContent = cursor === null ? '' : (sel.length > 1 ? sel.length + ' cells' : rc(cursor));
        const em = B.getMode();
        ui.engine.textContent = em.mode + (em.submode ? '/' + em.submode : '');
        const h = B.history();
        ui.hist.textContent = 'hist ' + h.position + '/' + h.length;
        ui.msg.textContent = message;
        ui.msg.className = 'proto-h-msg' + (messageKind ? ' is-' + messageKind : '');
        ui.timer.textContent = st.timer ? st.timer.text : '';
        if (st.solved) {
            ui.check.textContent = 'SOLVED';
        } else {
            ui.check.textContent = st.hasAnswerCheck ? ':w checks' : 'no check';
        }

        // Which-key
        ui.which.replaceChildren.apply(ui.which, whichKey().map(function(row) {
            return H.el('div', {class: 'proto-h-wk-row'}, [H.el('kbd', {}, [row[0]]), H.el('span', {}, [row[1]])]);
        }));
        ui.whichTitle.textContent = pending ? 'after ' + count + pending : (count ? 'count ' + count + ', then a motion' : TOOL_NAME[tool] + ' keys');

        drawOverlay();
    }

    function drawOverlay() {
        const wrap = ui.boardWrap.getBoundingClientRect();
        const ox = wrap.left + window.scrollX + ui.boardWrap.clientLeft;
        const oy = wrap.top + window.scrollY + ui.boardWrap.clientTop;
        const showSel = VALUE_TOOLS.indexOf(tool) === -1 && tool !== 'n';
        const boxes = [];
        if (showSel) {
            sel.forEach(function(c) {
                if (c !== cursor) {
                    boxes.push({c: c, cls: 'proto-h-selbox'});
                }
            });
        }
        if (cursor !== null) {
            boxes.push({c: cursor, cls: 'proto-h-cursor'});
        }
        while (ui.overlay.children.length > boxes.length) {
            ui.overlay.lastChild.remove();
        }
        while (ui.overlay.children.length < boxes.length) {
            ui.overlay.appendChild(document.createElement('div'));
        }
        boxes.forEach(function(b, i) {
            const r = B.cellRect(b.c);
            const d = ui.overlay.children[i];
            d.className = b.cls;
            d.style.left = (r.left - ox) + 'px';
            d.style.top = (r.top - oy) + 'px';
            d.style.width = r.width + 'px';
            d.style.height = r.height + 'px';
        });
    }

    // ---- Layout ---------------------------------------------------------------------------------------------------

    function fitBoard() {
        const canvas = document.getElementById('canvas');
        const main = ui.main.getBoundingClientRect();
        const probe = 40;
        B.setCellSize(probe);
        const r = canvas.getBoundingClientRect();
        if (!r.width || !r.height) {
            return;
        }
        const px = Math.max(12, Math.min(90, Math.floor(probe * Math.min((main.width - 40) / r.width,
            (main.height - 40) / r.height))));
        B.setCellSize(px);
        requestAnimationFrame(render);
    }

    function build(ctx) {
        const el = H.el;
        ui.tabs = {};
        const tabline = el('div', {class: 'proto-h-tabline'}, TOOL_ORDER.map(function(t) {
            const b = el('button', {class: 'proto-h-tab', type: 'button', title: TOOL_NAME[t] + ' (' + (t === 'n' ? 'Esc' : t) + ')',
                onclick: function() {
                    setTool(t);
                }}, [el('b', {}, [t === 'n' ? 'Esc' : t]), ' ' + TOOL_NAME[t].toLowerCase()]);
            ui.tabs[t] = b;
            return b;
        }));
        const info = B.getInfo();
        const title = el('div', {class: 'proto-h-title'}, [
            el('span', {}, [info.title || 'untitled']),
            info.author ? el('span', {class: 'proto-h-dim'}, ['  by ' + info.author]) : ''
        ]);

        ui.boardWrap = el('div', {class: 'proto-h-boardwrap'}, []);
        ui.overlay = el('div', {class: 'proto-h-overlay'}, []);
        ui.main = el('div', {class: 'proto-h-main'}, [ui.boardWrap]);

        ui.whichTitle = el('div', {class: 'proto-h-side-title'}, []);
        ui.which = el('div', {class: 'proto-h-wk'}, []);
        const rules = el('div', {class: 'proto-h-rules'}, []);
        rules.innerHTML = info.rules || '<i>No rules in this link.</i>';
        const side = el('div', {class: 'proto-h-side'}, [
            ui.whichTitle, ui.which,
            el('div', {class: 'proto-h-side-title'}, ['rules']), rules,
            el('div', {class: 'proto-h-hint'}, ['? the whole grammar     : commands'])
        ]);

        ui.mode = el('span', {class: 'proto-h-mode'}, []);
        ui.pending = el('span', {class: 'proto-h-pending'}, []);
        ui.selInfo = el('span', {class: 'proto-h-sel'}, []);
        ui.msg = el('span', {class: 'proto-h-msg'}, []);
        ui.engine = el('span', {class: 'proto-h-dim'}, []);
        ui.hist = el('span', {class: 'proto-h-dim'}, []);
        ui.check = el('span', {class: 'proto-h-checkst'}, []);
        ui.timer = el('span', {class: 'proto-h-timer'}, []);
        ui.status = el('div', {class: 'proto-h-status'}, [
            ui.mode, ui.pending, ui.msg,
            el('span', {class: 'proto-h-fill'}, []),
            ui.selInfo, ui.engine, ui.hist, ui.check, ui.timer
        ]);
        ui.cmdInput = el('input', {class: 'proto-h-cmdinput', type: 'text', spellcheck: 'false', autocomplete: 'off'}, []);
        ui.cmd = el('div', {class: 'proto-h-cmd'}, [el('span', {}, [':']), ui.cmdInput]);
        ui.cmdInput.addEventListener('blur', function() {
            ui.cmd.classList.remove('is-open');
        });
        ui.help = buildHelp();
        ui.help.addEventListener('mousedown', function() {
            toggleHelp(false);
        });

        ui.root = el('div', {class: 'proto-h-root'}, [
            el('div', {class: 'proto-h-top'}, [title, tabline]),
            ui.main, side,
            el('div', {class: 'proto-h-foot'}, [ui.status, ui.cmd]),
            ui.help
        ]);
        document.body.appendChild(ui.root);
        H.adoptBoard(ui.boardWrap);
        ui.boardWrap.appendChild(ui.overlay);
        H.hideLegacy();
    }

    function initCursor() {
        const s = B.getSelection();
        cursor = s.cells.length && cellSet.has(s.cells[0]) ? s.cells[0] : cells[0];
        sel = [cursor];
    }

    window.PrototypeVariants = window.PrototypeVariants || {};
    window.PrototypeVariants.H = {
        name: 'Vim',

        /** For the headless test only: the grammar's state. */
        debug() {
            return {tool: tool, cursor: cursor, sel: sel.slice(), index: cells.indexOf(cursor), message: message,
                pending: count + pending};
        },

        /** @param {object} ctx see README.md, "The variant contract" */
        mount(ctx) {
            B = ctx.bridge;
            H = ctx.helpers;
            buildPlans();
            readCells();
            build(ctx);
            fitBoard();
            initCursor();
            // Start in VALUE if the puzzle has values to enter, else NORMAL.
            tool = 'n';
            if (plans.v && B.getMode().mode === 'sudoku') {
                setTool('v');
            } else {
                syncSelection();
            }

            window.addEventListener('keydown', onKeyDown, true);
            window.addEventListener('keyup', onKeyUp, true);
            window.addEventListener('resize', fitBoard);

            // Mouse is secondary: Penpa's own handlers act; the cursor follows the click.
            ctx.canvas.addEventListener('mouseup', function(e) {
                requestAnimationFrame(function() {
                    if (VALUE_TOOLS.indexOf(tool) !== -1 || tool === 'n') {
                        const s = B.getSelection();
                        if (s.cells.length) {
                            sel = s.cells.filter(function(c) {
                                return cellSet.has(c);
                            });
                            cursor = cellSet.has(s.cursor) ? s.cursor : sel[sel.length - 1];
                        }
                    } else {
                        const c = B.pageToPoint(e.pageX, e.pageY, [0]);
                        if (c !== null && cellSet.has(c)) {
                            cursor = c;
                            sel = [c];
                        }
                    }
                    render();
                });
            });
            B.onChange(function() {
                render();
            });
            B.onTimer(function(t) {
                ui.timer.textContent = t.text;
            });
            render();
        }
    };
})();
