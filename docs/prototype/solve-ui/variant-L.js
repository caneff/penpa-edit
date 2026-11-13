/*
 * PROTOTYPE (throwaway, branch prototype/solve-ui): solve-UI variant L, "Desk + pins".
 * Owned by variant L's builder: this file and variant-L.css. See README.md for the contract.
 *
 * Built to Chris's rulings of 2026-11-13 (research/solve-ui-prototype-verdicts.md, last section), on the kept ideas of
 * I (the desk) and K (the mouse card):
 *   1. Desk: the board and four cards (Mouse, Pinned modes, Tool, Rules) lie on one desk. Every card, the board
 *      included, is dragged by its header. One layout for every puzzle, kept in localStorage (PROTOTYPE key
 *      `proto-L-layout-v2`; round 1's six-card layout under v1 is ignored); "Reset layout" restores the default.
 *   2. Mouse card: fixed on the desk, large. Its headline names the whole tool, mode · sub-mode · style
 *      ("Line · helper × · green"); rows below say what Left, Right and Drag do with it. Re-rendered on every
 *      bridge onChange, so legacy keys (Z/X/C/V, Shift/Ctrl in Sudoku, Surface digits) update it too.
 *   3. Pinned modes: a pin is a MODE. Tab / Shift+Tab (and Enter, which Penpa+ treats as Tab) cycle the pins; landing
 *      on a mode is bridge.setMode, and Penpa's own mode_set restores that mode's last sub-mode and style. Pins are
 *      seeded from the link's Tab set (each entry's mode, first entry per mode primes that mode's sub-mode); a link
 *      with an empty Tab set (9 of the 12 samples) seeds one pin, the mode it opened in. Pins are edited per puzzle
 *      (remove ×, drag to reorder, pin the current mode, pin from the browser) and stored per puzzle under
 *      `proto-L-pins-v1:<hash of the link's p=>`.
 *   4. Presets: built-in pin sets named by their contents, plus sets the solver saves under a typed name
 *      (`proto-L-presets-v1`), all in one "Presets" pulldown on the pins card (save field at its foot). A preset entry
 *      may prime its mode's sub-mode (e.g. Composite primed to Shade + dot).
 *   5. Tool card (round 2: the old Tool settings and All modes cards merged): a field showing the current mode entry;
 *      focusing, clicking or typing in it opens the picker (every solve mode and sub-mode, Composite tools and Special
 *      objects included, in seven groups by what it puts on the board, filtered by the typed words, a Pin toggle per
 *      entry); picking closes it. Under the field: the sub-mode (or Composite tool / Shape) and style pulldowns.
 *      Round 2 rule for one-of-N rows: more than 3 choices -> a pulldown (style keeps its swatch); 3 or fewer stay a
 *      one-click segmented row (Sudoku normal / corner / centre, Cage, Move).
 *      Round 3: styles are back to one button each (colour swatch, or a drawn sample for thin / dotted / fat dots /
 *      ...; the name is the title); the open picker list sits in the card's flow and pushes the sub-mode and style
 *      controls down; the Mouse card is as tall as its content, and the Tool card follows it while neither was moved.
 *      A "Recent" row under the mode field: up to 5 recently used modes, most recent first, without the current mode
 *      or pinned ones; a button lands on its mode as a pin does, its pin icon pins it; not in the Tab cycle; kept per
 *      puzzle under `proto-L-recent-v1:<hash of p=>`.
 *      Pins keep their own sub-mode (`proto-L-pinsub-v1:`): a pick in the Tool card picker never changes a pin
 *      (see the comment above pinSub).
 *   6. Genre names: Chris ruled them fine as searchable tags, not groups. Each Composite entry carries Penpa+'s own label
 *      as a tag chip ("Bulbs + dots" tagged "Akari"). Not here: genre grouping, loupes, per-genre kits, a pointer badge.
 *
 * Scaffold change (the only edit outside this file and variant-L.css): loader.js's VARIANTS string 'ABCDEFGHIJK' ->
 * 'ABCDEFGHIJKL', so the loader accepts ?variant=L and the switcher's arrows reach it.
 *
 * Bridge gaps worked around here (reading `pu` / the legacy DOM directly):
 *   - Priming a mode's last-used sub-mode without switching to it: writes pu.mode[pu.mode.qa][mode][0] (mode_set reads
 *     it back, class_p.js:1615-1634). Used when seeding pins from the Tab set, applying a preset, and "Pin" in the browser.
 *   - Reading a pinned mode's last-used sub-mode / style for its chip and for saved presets: pu.mode[pu.mode.qa][mode].
 *   - Tab-set entry -> mode: PenpaText.modes.EN / .mapping (translate.js:1236-1280); bridge.tabSet() gives names only.
 *   - Style names: the legacy labels are colour letters ("G" is green or grey); names come from a table here checked
 *     against the labels' computed backgrounds. Swatches read `<id>_lb`'s computed background.
 *   - Shapes: no listShapes(); read from #mode_symbolul1 (ms1_* group / ms_* items), as A, I and K do.
 *   - Penpa+ cycles its own Tab set on Tab/Enter (main.js:695-744): a capture-phase window keydown here takes Tab and
 *     Enter first and stops them.
 *   - Penpa's canvas mousedown calls preventDefault (main.js:1099), so a focused search box would keep focus and eat
 *     digits; a capture mousedown here blurs L's text fields when the canvas is pressed.
 *   - Shape mode re-shows the legacy floating panel inline (class_p.js:1616-1619); hidden by an !important rule in CSS.
 *   - Board cell size for fitting: canvas width / pu.size (as K).
 */
(function() {
    'use strict';

    const LS_LAYOUT = 'proto-L-layout-v2'; // v1 had six cards
    const LS_PRESETS = 'proto-L-presets-v1';
    const LS_PINS = 'proto-L-pins-v1:';
    const LS_RECENT = 'proto-L-recent-v1:';
    const LS_PINSUB = 'proto-L-pinsub-v1:';
    const TOP = 44;

    const MODE_NAME = {
        surface: 'Surface', multicolor: 'Multicolor', line: 'Line', lineE: 'Edge', wall: 'Wall', number: 'Number',
        symbol: 'Shape', special: 'Special', cage: 'Cage', combi: 'Composite', sudoku: 'Sudoku', move: 'Move'
    };

    // ---- Names --------------------------------------------------------------------------------------------------

    /** Style names, checked against the legacy labels' computed backgrounds (st_<mode><n>_lb) on 2026-11-13. */
    const PATH_STYLE = {3: 'green', 2: 'black', 5: 'grey', 8: 'red', 9: 'blue', 80: 'thin', 1: 'thin', 12: 'dotted',
        13: 'fat dots', 17: 'fat dots', 40: 'short', 30: 'double', 21: 'thicker', 14: 'grey dot'};
    const VALUE_STYLE = {1: 'black', 2: 'green', 8: 'blue', 3: 'grey', 9: 'dark blue', 10: 'red', 4: 'white',
        5: 'white background'};
    const SURFACE_STYLE = {1: 'dark grey', 8: 'grey', 3: 'light grey', 4: 'black', 2: 'green', 5: 'blue', 6: 'red',
        7: 'yellow', 9: 'pink', 10: 'orange', 11: 'purple', 12: 'brown'};
    const STYLE_TABLE = {
        line: PATH_STYLE, lineE: PATH_STYLE, wall: PATH_STYLE, number: VALUE_STYLE, sudoku: VALUE_STYLE,
        surface: SURFACE_STYLE, multicolor: SURFACE_STYLE,
        symbol: {1: 'behind lines', 2: 'in front of lines'},
        cage: {10: 'dotted line', 7: 'grey line', 15: 'grey dots', 16: 'solid line'}
    };

    const SUB_NAME = {
        line: {1: 'normal', 2: 'diagonal', 3: 'free', 5: 'middle', 4: 'helper ×'},
        lineE: {1: 'normal', 2: 'diagonal', 3: 'free', 6: 'middle', 4: 'helper ×', 5: 'erase'},
        number: {1: 'normal', 10: 'large', 6: 'medium', 5: 'small', 7: 'candidates', 3: 'quarter', 9: 'side', 8: 'long'},
        sudoku: {1: 'normal', 2: 'corner', 3: 'centre'},
        cage: {1: 'killer', 2: 'free'},
        move: {1: 'all', 2: 'numbers', 3: 'shapes'},
        special: {thermo: 'thermo', nobulbthermo: 'no-bulb thermo', arrows: 'sudoku arrow', direction: 'arrow',
            squareframe: 'rectangle frame', polygon: 'polygon'}
    };

    /** Composite tools named by what they put on the board: [name, browser group, description]. */
    const COMBI = {
        blpo: ['Shade + dot', 'shade', 'Left shades a cell, right puts a dot (unshaded).'],
        shaka: ['Corner triangles + dot', 'shade', 'Click places a half-cell triangle; right a dot.'],
        linex: ['Loop + edge ×', 'lines', 'Drag a loop through cell centres; right on an edge: ×.'],
        lineox: ['Loop + cell ○ ×', 'lines', 'Drag a loop; click a cell: ○, again ×.'],
        linedir: ['Line + direction marks', 'lines', 'Drag a line; marks its direction.'],
        yajilin: ['Shade + loop', 'lines', 'Click shades a cell, drag draws a loop; right: dot or edge ×.'],
        hashi: ['Bridges', 'lines', 'Drag between cells: a bridge, again: double.'],
        rassisillai: ['Line + cell marks', 'lines', 'Drag a line through cells; clicks mark cells.'],
        edgex: ['Edges + ×', 'edges', 'Drag along grid lines; right on an edge: ×.'],
        edgexoi: ['Edges + inside / outside', 'edges', 'Drag along grid lines; click a cell: inside / outside colour.'],
        edgesub: ['Edges + helper line', 'edges', 'Drag along grid lines; a second helper line.'],
        numfl: ['Numbers by flick', 'numbers', 'Drag from a cell in a direction to enter a number.'],
        alfl: ['Letters by flick', 'numbers', 'Drag from a cell in a direction to enter a letter.'],
        blwh: ['Black + white circles', 'symbols', 'Left: white ○, again black ●; right: black ●.'],
        star: ['Stars + ×', 'symbols', 'Left: star; right: ×; right on a corner: dot.'],
        akari: ['Bulbs + dots', 'symbols', 'Left: bulb; right: dot (no bulb); right on an edge: ×.'],
        battleship: ['Ship pieces + water', 'symbols', 'Left cycles ship pieces; drag points a ship end; right: water.'],
        tents: ['Tents + ×', 'symbols', 'Left: tent; right: ×; drag links a tent to its tree.'],
        mines: ['Mines + ×', 'symbols', 'Left: mine; right: ×.'],
        doublemines: ['One or two mines + ×', 'symbols', 'Left: 1 mine, again 2; right: ×.'],
        magnets: ['Magnet poles + −', 'symbols', 'Places + and − poles.'],
        arrowS: ['Arrows in cells', 'symbols', 'Places an arrow in a cell.']
    };

    function styleName(mode, style) {
        const t = STYLE_TABLE[mode];
        if (!t || style === '' || style == null || isNaN(style)) {
            return '';
        }
        return t[style] || ('style ' + style);
    }

    function shapeName(sub) {
        return String(sub || '').replace(/_/g, ' ');
    }

    function subName(mode, sub) {
        if (mode === 'combi') {
            return COMBI[sub] ? COMBI[sub][0] : sub;
        }
        if (mode === 'symbol') {
            return shapeName(sub);
        }
        const t = SUB_NAME[mode];
        return t ? (t[sub] || '') : '';
    }

    /** The whole tool in words: "Line · helper × · green". */
    function toolName(mode, sub, style) {
        return [MODE_NAME[mode] || mode, subName(mode, sub), styleName(mode, style)].filter(Boolean).join(' · ');
    }

    // ---- Mouse grammar ------------------------------------------------------------------------------------------

    /**
     * What Left click, Right click and Drag do with a tool, plus extra rows. Read from class_p.js mouseevent
     * (8663-8770), mouse_line / mouse_lineX / mouse_lineEX (9014, 9210, 9346), mouse_number (9417) and K's
     * Composite table (checked LIVE by K's builder on 2026-11-13). '—' = nothing.
     */
    function mouseRows(mode, sub, style) {
        const s = styleName(mode, style);
        const N = '—';
        let r = {left: N, right: N, drag: N, more: []};
        switch (mode) {
        case 'surface': {
            const second = SURFACE_STYLE[PrototypeBridge.getSettings().surfaceSecondColor] || '2nd colour';
            r = {left: 'paint ' + s + ' (again: erase)', right: 'paint ' + second + ' (the 2nd colour)',
                drag: 'paint ' + s + ' on many cells', more: [['Alt + drag', 'paint a rectangle'], ['Digit', 'pick a colour']]};
            break;
        }
        case 'multicolor':
            r = {left: 'select a cell', right: 'select a cell', drag: 'select many cells',
                more: [['Digit', 'colour the selection'], ['Colour chip', s + ' now']]};
            break;
        case 'line':
            if (sub === '4') {
                r.left = '× on the edge between two cells (again: clear)';
            } else {
                r.drag = s + ' line ' + {1: 'through cell centres', 2: 'through centres, diagonals too',
                    3: 'freely, point to point', 5: 'through edge midpoints'}[sub] + ' (over a line: erase)';
            }
            break;
        case 'lineE':
            if (sub === '4') {
                r.left = '× on a grid line (again: clear)';
            } else if (sub === '5') {
                r.drag = 'erase the grid lines it crosses';
            } else {
                r.drag = s + ' line ' + {1: 'along grid lines', 2: 'along grid lines and diagonals',
                    3: 'freely, corner to corner', 6: 'through midpoints'}[sub] + ' (over a line: erase)';
            }
            break;
        case 'wall':
            r.drag = s + ' wall (again: erase)';
            break;
        case 'number': {
            const what = {1: 'a number', 10: 'a large number', 6: 'a medium number', 5: 'a small number',
                7: 'candidates', 3: 'a number in a quarter', 9: 'a number on a side', 8: 'a long number'}[sub] || 'a number';
            r = {left: (sub === '3' || sub === '9' ? 'cursor on a quarter / side of the cell' : 'cursor on the cell') +
                    '; type ' + what + ' in ' + s,
                right: 'cursor on the cell', drag: sub === '3' || sub === '9' ? N : 'select many cells',
                more: [['Alt + drag', 'select a rectangle']]};
            break;
        }
        case 'sudoku':
            r = {left: 'select a cell; type ' + {1: 'a digit', 2: 'corner marks', 3: 'centre marks'}[sub] + ' in ' + s,
                right: 'select a cell', drag: 'select many cells',
                more: [['Ctrl + click', 'add to the selection'], ['Double', 'select every cell like it'],
                    ['Shift / Ctrl held', 'corner / centre while held']]};
            break;
        case 'symbol':
            r = {left: 'cursor + ' + shapeName(sub) + ' ' + s + ' (again: next variant)', right: 'move the cursor', drag: N,
                more: [['Digit', 'variant n at the cursor']]};
            break;
        case 'special':
            r.drag = 'draw a ' + subName(mode, sub) + ' through the cells';
            break;
        case 'cage':
            r.drag = sub === '2' ? s + ' cage line along corners' : s + ' cage around the cells';
            break;
        case 'move':
            r.drag = 'move ' + ({1: 'any item', 2: 'a number', 3: 'a shape'}[sub] || 'an item');
            break;
        case 'combi':
            r = combiRows(sub);
            break;
        }
        return r;
    }

    function combiRows(sub) {
        const N = '—';
        const t = {
            blpo: ['shade (again: dot, again: clear)', 'dot = unshaded (again: shade)', 'shade many', [['Right drag', 'dot many']]],
            blwh: ['white ○ (again: black ●, again: clear)', 'black ● (again: white ○)', N, [['Right drag', 'black ● many']]],
            linex: [N, '× on the edge', 'loop through cell centres (again: erase)', []],
            lineox: ['○ in the cell (again: ×, again: clear)', '× in the cell (again: ○)', 'loop through cell centres', []],
            edgex: [N, '× on the edge', 'line along grid lines (again: erase)', []],
            edgexoi: ['cell: inside, yellow (again: green)', 'edge: ×; cell: outside, green', 'line along grid lines', []],
            yajilin: ['shade the cell (again: clear)', 'cell: dot; edge: ×', 'loop through cell centres', [['Right drag', 'dot many']]],
            hashi: [N, N, 'bridge (again: double)', []],
            star: ['star (again: clear)', 'cell: × ; corner: green dot', N, [['Right drag', '× many']]],
            tents: ['tent', '×', 'link a tent to its tree', []],
            mines: ['mine', '×', N, [['Right drag', '× many']]],
            akari: ['bulb (again: clear)', 'cell: dot = no bulb; edge: ×', 'dotted helper line', [['Right drag', 'dot many']]],
            battleship: ['ship cell ■ (again: ●, ·, clear)', 'water (again: clear)', 'ship end, pointing the way you drag',
                [['Right drag', 'water many']]],
            doublemines: ['1 mine (again: 2)', '×', N, [['Right drag', '× many']]]
        }[sub];
        if (!t) {
            return {left: 'the tool\'s main mark', right: 'its helper mark', drag: N, more: []};
        }
        return {left: t[0], right: t[1], drag: t[2], more: t[3]};
    }

    // ---- Mode browser entries -----------------------------------------------------------------------------------

    const GROUPS = [
        ['shade', 'Shading and colour'],
        ['lines', 'Lines through cells'],
        ['edges', 'Edges and walls'],
        ['numbers', 'Numbers and letters'],
        ['symbols', 'Symbols and marks'],
        ['objects', 'Objects and cages'],
        ['move', 'Moving things']
    ];

    /** [group, mode, sub, name, description]. Composite entries come from COMBI. */
    const ENTRIES = [
        ['shade', 'surface', null, 'Shade cells', 'Click paints the chosen colour, right the 2nd colour; drag paints many.'],
        ['shade', 'multicolor', null, 'Colour selected cells', 'Select cells, then type a digit or pick a colour.'],
        ['lines', 'line', '1', 'Line', 'Drag through cell centres.'],
        ['lines', 'line', '2', 'Diagonal line', 'Drag through centres, diagonals allowed.'],
        ['lines', 'line', '3', 'Free line', 'Drag point to point, any angle.'],
        ['lines', 'line', '5', 'Midpoint line', 'Drag through edge midpoints.'],
        ['lines', 'line', '4', 'Line helper ×', 'Click the edge between two cells: ×.'],
        ['edges', 'lineE', '1', 'Edge line', 'Drag along the grid lines.'],
        ['edges', 'lineE', '2', 'Diagonal edge line', 'Along grid lines and cell diagonals.'],
        ['edges', 'lineE', '3', 'Free edge line', 'Corner to corner, any angle.'],
        ['edges', 'lineE', '6', 'Midpoint edge line', 'Through midpoints.'],
        ['edges', 'lineE', '4', 'Edge helper ×', 'Click a grid line: ×.'],
        ['edges', 'lineE', '5', 'Erase grid lines', 'Drag to erase grid lines.'],
        ['edges', 'wall', null, 'Wall', 'Drag a wall segment.'],
        ['numbers', 'number', '1', 'Number', 'Cursor on a cell, then type.'],
        ['numbers', 'number', '10', 'Large number', 'Type a large number.'],
        ['numbers', 'number', '6', 'Medium number', 'Type a medium number.'],
        ['numbers', 'number', '5', 'Small number', 'Type a small number.'],
        ['numbers', 'number', '7', 'Candidates', 'Type candidate digits into a cell.'],
        ['numbers', 'number', '3', 'Quarter numbers', 'A number in a quarter of the cell (1/4).'],
        ['numbers', 'number', '9', 'Side numbers', 'A number on a side of the cell.'],
        ['numbers', 'number', '8', 'Long number', 'A long number across the cell.'],
        ['numbers', 'sudoku', '1', 'Digits', 'Select cells, type a digit. Shift: corner, Ctrl: centre.'],
        ['numbers', 'sudoku', '2', 'Corner marks', 'Pencil marks in the corners.'],
        ['numbers', 'sudoku', '3', 'Centre marks', 'Pencil marks in the centre.'],
        ['symbols', 'symbol', null, 'Shape', 'Circles, squares, triangles, arrows, ... at the cursor.'],
        ['objects', 'special', 'thermo', 'Thermometer', 'Drag a thermometer through cells.'],
        ['objects', 'special', 'nobulbthermo', 'Thermometer, no bulb', 'Drag a bulbless thermometer.'],
        ['objects', 'special', 'arrows', 'Arrow with circle', 'Drag an arrow from a circled cell.'],
        ['objects', 'special', 'direction', 'Arrow', 'Drag an arrow.'],
        ['objects', 'special', 'squareframe', 'Rectangle frame', 'Drag a rectangle frame.'],
        ['objects', 'special', 'polygon', 'Polygon', 'Drag a polygon outline.'],
        ['objects', 'cage', '1', 'Cage', 'Drag a cage around cells.'],
        ['objects', 'cage', '2', 'Free cage lines', 'Drag cage lines along corners.'],
        ['move', 'move', '1', 'Move anything', 'Drag a number or shape elsewhere.'],
        ['move', 'move', '2', 'Move numbers', 'Drag a number elsewhere.'],
        ['move', 'move', '3', 'Move shapes', 'Drag a shape elsewhere.']
    ];

    /** Built-in presets, named by their contents only. Each pin: [mode, sub to prime or null]. */
    const BUILTIN_PRESETS = [
        {name: 'Shading + dots', pins: [['combi', 'blpo'], ['surface', null]]},
        {name: 'Loop + ×', pins: [['combi', 'linex'], ['line', '1']]},
        {name: 'Edges + ×', pins: [['combi', 'edgex'], ['lineE', '1']]},
        {name: 'Lines + edges + ×', pins: [['line', '1'], ['lineE', '1'], ['combi', 'linex']]},
        {name: 'Numbers + candidates', pins: [['number', '1'], ['sudoku', '3'], ['surface', null]]},
        {name: 'Digits + colours', pins: [['sudoku', '1'], ['multicolor', null]]}
    ];

    // ---- Storage ------------------------------------------------------------------------------------------------

    function readJSON(key, fallback) {
        try {
            const v = JSON.parse(localStorage.getItem(key));
            return v == null ? fallback : v;
        } catch (err) {
            return fallback;
        }
    }

    function writeJSON(key, value) {
        localStorage.setItem(key, JSON.stringify(value));
    }

    /** Per-puzzle key: a short hash of the link's p= data. */
    function puzzleKey() {
        const m = /(?:^|[#?&])p=([^&]*)/.exec(location.hash) || /(?:^|[?&])p=([^&]*)/.exec(location.search);
        const s = m ? m[1] : location.hash;
        let h = 5381;
        for (let i = 0; i < s.length; i++) {
            h = ((h * 33) ^ s.charCodeAt(i)) >>> 0;
        }
        return h.toString(36);
    }

    // ---- Mount ------------------------------------------------------------------------------------------------------

    window.PrototypeVariants = window.PrototypeVariants || {};
    window.PrototypeVariants.L = {
        name: 'Desk + pins',

        mount(ctx) {
            const B = ctx.bridge;
            const el = ctx.helpers.el;
            const qa = function() {
                return pu.mode.qa;
            };

            const available = {};
            B.listModes({all: true}).forEach(function(m) {
                if (m.mode !== 'board') {
                    available[m.mode] = true;
                }
            });
            const composites = {};
            B.listComposite().forEach(function(c) {
                composites[c.name] = c.label;
            });
            const openingMode = B.getMode().mode;

            function btn(cls, label, onClick, title) {
                const b = el('button', {class: 'proto-l-btn ' + (cls || ''), type: 'button', tabindex: '-1'}, [label]);
                if (title) {
                    b.title = title;
                }
                b.addEventListener('mousedown', function(e) {
                    e.preventDefault();
                    e.stopPropagation();
                });
                b.addEventListener('click', function(e) {
                    e.preventDefault();
                    onClick(e);
                });
                return b;
            }

            /** A mode's remembered [sub, style] (bridge gap: no per-mode read). */
            function remembered(mode) {
                const e = pu.mode[qa()][mode] || [];
                return {sub: String(e[0]), style: e[1]};
            }

            /** Set a mode's remembered sub-mode without switching to it (bridge gap). */
            function prime(mode, sub) {
                if (sub == null) {
                    return;
                }
                if (B.getMode().mode === mode) {
                    applySub(mode, sub);
                } else if (pu.mode[qa()][mode]) {
                    pu.mode[qa()][mode][0] = sub;
                }
            }

            function applySub(mode, sub) {
                if (mode === 'combi') {
                    B.setComposite(sub);
                } else if (mode === 'symbol') {
                    B.setShape(sub);
                } else {
                    B.setSubmode(sub);
                }
            }

            // ---- Skeleton ---------------------------------------------------------------------------------------
            const app = el('div', {class: 'proto-l-app'});
            const desk = el('div', {class: 'proto-l-desk'});
            const timerText = el('span', {class: 'proto-l-timer'}, ['00:00']);
            const status = el('span', {class: 'proto-l-status'});
            const undoBtn = btn('', 'Undo', function() {
                B.undo();
            }, 'Undo (Ctrl+Z)');
            const redoBtn = btn('', 'Redo', function() {
                B.redo();
            }, 'Redo (Ctrl+Y)');
            const checkBtn = btn('', 'Check', runCheck, 'Compare the board with the answer');
            const pauseBtn = btn('', 'Pause', function() {
                if (B.getTimer().paused) {
                    B.startTimer();
                } else {
                    B.pauseTimer();
                }
            });
            const info = B.getInfo();
            const bar = el('div', {class: 'proto-l-bar'}, [
                el('span', {class: 'proto-l-brand'}, ['Penpa+']),
                el('span', {class: 'proto-l-title'}, [info.title || 'Untitled']),
                el('span', {class: 'proto-l-author'}, [info.author ? 'by ' + info.author : '']),
                el('span', {class: 'proto-l-spacer'}),
                undoBtn, redoBtn, checkBtn, status, timerText, pauseBtn,
                btn('', 'Settings', function() {
                    B.openSettings();
                }),
                btn('proto-l-reset', 'Reset layout', resetLayout, 'Put every card back where it started (all puzzles share one layout)')
            ]);
            app.appendChild(bar);
            app.appendChild(desk);
            document.body.appendChild(app);

            // ---- Cards ------------------------------------------------------------------------------------------
            const cards = {};
            let zTop = 20;

            function makeCard(id, title, extraHead) {
                const head = el('div', {class: 'proto-l-head'}, [el('span', {class: 'proto-l-headtitle'}, [title])]);
                (extraHead || []).forEach(function(n) {
                    head.appendChild(n);
                });
                const body = el('div', {class: 'proto-l-body'});
                const card = el('div', {class: 'proto-l-card proto-l-card-' + id, 'data-card': id}, [head, body]);
                desk.appendChild(card);
                cards[id] = {id: id, card: card, head: head, body: body};
                head.addEventListener('mousedown', function(e) {
                    if (e.button !== 0 || e.target.closest('button, input')) {
                        return;
                    }
                    startDrag(cards[id], e);
                });
                card.addEventListener('mousedown', function() {
                    raise(cards[id]);
                });
                return cards[id];
            }

            function raise(c) {
                zTop = zTop >= 900 ? 20 : zTop + 1;
                c.card.style.zIndex = zTop;
            }

            // Default layout at 1600x900: a left column (pins, rules), the board in the middle, the mouse card and the
            // Tool card on the right. Columns stack by measured height.
            function defaults() {
                const W = window.innerWidth;
                const right = Math.max(W - 430, 900);
                const gap = 10;
                const h = function(id) {
                    return cards[id] ? cards[id].card.offsetHeight : 200;
                };
                return {
                    pins: {x: 14, y: 12},
                    rules: {x: 14, y: 12 + h('pins') + gap},
                    board: {x: 340, y: 12},
                    mouse: {x: right, y: 12},
                    tool: {x: right, y: 12 + h('mouse') + gap}
                };
            }

            // ---- Pulldown: a button showing the current choice; its list opens below it, one open at a time.
            // Custom, not <select>: Penpa's keydown handler does not exempt <select> (main.js:279-298), and an
            // <option> cannot show a colour swatch.
            let openPd = null;
            function closePd() {
                if (openPd) {
                    openPd.classList.remove('is-open');
                    openPd.closest('.proto-l-card').classList.remove('has-open');
                    openPd = null;
                }
            }
            document.addEventListener('mousedown', function(e) {
                if (openPd && !openPd.contains(e.target)) {
                    closePd();
                }
            }, true);

            function fillChoice(node, it) {
                if (it.color) {
                    node.appendChild(el('i', {class: 'proto-l-dot', style: 'background:' + it.color}));
                }
                node.appendChild(el('span', {class: 'proto-l-pdlabel'}, [it.label]));
                (it.tags || []).forEach(function(t) {
                    node.appendChild(el('span', {class: 'proto-l-tag'}, [t]));
                });
            }

            /**
             * items: [{value, label, color?, tags?, on?, header?, extra?}]; opts: {cls, fixed (button text), footer}.
             */
            function pulldown(items, onPick, opts) {
                opts = opts || {};
                const button = el('button', {class: 'proto-l-pdbtn', type: 'button', tabindex: '-1'});
                const cur = items.filter(function(i) {
                    return i.on;
                })[0];
                if (opts.fixed) {
                    button.appendChild(el('span', {class: 'proto-l-pdlabel'}, [opts.fixed]));
                } else {
                    fillChoice(button, cur || {label: '—'});
                }
                button.appendChild(el('span', {class: 'proto-l-caret'}, ['▾']));
                const list = el('div', {class: 'proto-l-pdlist'});
                items.forEach(function(it) {
                    if (it.header) {
                        list.appendChild(el('div', {class: 'proto-l-pdhead'}, [it.label]));
                        return;
                    }
                    const row = el('div', {class: 'proto-l-pditem' + (it.on ? ' is-on' : '')});
                    fillChoice(row, it);
                    if (it.extra) {
                        row.appendChild(it.extra);
                    }
                    row.addEventListener('mousedown', function(e) {
                        e.preventDefault();
                    });
                    row.addEventListener('click', function(e) {
                        if (e.target.closest('.proto-l-pdx')) {
                            return;
                        }
                        closePd();
                        onPick(it.value);
                    });
                    list.appendChild(row);
                });
                if (opts.footer) {
                    list.appendChild(opts.footer);
                }
                const wrap = el('div', {class: 'proto-l-pd ' + (opts.cls || '')}, [button, list]);
                button.addEventListener('mousedown', function(e) {
                    e.preventDefault();
                });
                button.addEventListener('click', function(e) {
                    e.preventDefault();
                    const was = openPd === wrap;
                    closePd();
                    if (!was) {
                        wrap.classList.add('is-open');
                        const card = wrap.closest('.proto-l-card');
                        card.classList.add('has-open');
                        raise(cards[card.dataset.card]);
                        openPd = wrap;
                    }
                });
                return wrap;
            }

            /** Up to 3 choices stay one click away as a segmented row; more become a pulldown. */
            function choice(items, onPick, cls) {
                if (items.length > 3) {
                    return pulldown(items, onPick, {cls: cls});
                }
                const row = el('div', {class: 'proto-l-seg ' + (cls || '')});
                items.forEach(function(it) {
                    const b = btn('proto-l-segbtn' + (it.on ? ' is-on' : ''), '', function() {
                        onPick(it.value);
                    }, it.label);
                    fillChoice(b, it);
                    row.appendChild(b);
                });
                return row;
            }

            let layout = readJSON(LS_LAYOUT, null) || {};

            function place(c) {
                const p = layout[c.id] || defaults()[c.id] || {x: 20, y: 20};
                c.card.style.left = p.x + 'px';
                c.card.style.top = p.y + 'px';
            }

            function placeAll() {
                Object.keys(cards).forEach(function(id) {
                    place(cards[id]);
                });
                B.fixPointerOffset && B.fixPointerOffset();
            }

            let drag = null;
            function startDrag(c, e) {
                e.preventDefault();
                raise(c);
                drag = {c: c, sx: e.clientX, sy: e.clientY, x: c.card.offsetLeft, y: c.card.offsetTop};
                c.card.classList.add('is-dragging');
            }
            document.addEventListener('mousemove', function(e) {
                if (!drag) {
                    return;
                }
                const dw = desk.clientWidth;
                const dh = desk.clientHeight;
                const x = Math.max(-drag.c.card.offsetWidth + 60, Math.min(dw - 60, drag.x + e.clientX - drag.sx));
                const y = Math.max(0, Math.min(dh - 30, drag.y + e.clientY - drag.sy));
                drag.c.card.style.left = x + 'px';
                drag.c.card.style.top = y + 'px';
            });
            document.addEventListener('mouseup', function() {
                if (!drag) {
                    return;
                }
                drag.c.card.classList.remove('is-dragging');
                layout[drag.c.id] = {x: drag.c.card.offsetLeft, y: drag.c.card.offsetTop};
                writeJSON(LS_LAYOUT, layout);
                drag = null;
            });

            function resetLayout() {
                localStorage.removeItem(LS_LAYOUT);
                layout = {};
                placeAll();
            }

            // Board card: the board is moved like any card; zoom buttons change the cell size (never CSS scale).
            const zoomOut = btn('proto-l-mini', '−', function() {
                B.setCellSize(Math.max(12, Math.round(cellPx()) - 4));
            }, 'Smaller board');
            const zoomIn = btn('proto-l-mini', '+', function() {
                B.setCellSize(Math.min(90, Math.round(cellPx()) + 4));
            }, 'Larger board');
            const zoomFit = btn('proto-l-mini', 'Fit', fitBoard, 'Fit the board to its default size');
            const boardCard = makeCard('board', 'Board', [el('span', {class: 'proto-l-spacer'}), zoomOut, zoomIn, zoomFit]);
            ctx.helpers.adoptBoard(boardCard.body);
            ctx.helpers.hideLegacy();

            const mouseCard = makeCard('mouse', 'Mouse');
            const pinsCard = makeCard('pins', 'Pinned modes');
            const toolCard = makeCard('tool', 'Tool');
            const rulesCard = makeCard('rules', 'Rules');
            rulesCard.body.innerHTML = info.rules || '<em>No rules in this link.</em>';
            placeAll();

            function cellPx() {
                const w = ctx.canvas.getBoundingClientRect().width;
                return pu.size || (w / 10);
            }

            /** Fit the board into its default box (820 x 820 at 1600x900), whatever the card's position. */
            function fitBoard() {
                const r = ctx.canvas.getBoundingClientRect();
                if (!r.width || !pu.size) {
                    return;
                }
                const boxW = Math.max(300, window.innerWidth - 340 - 440 - 20);
                const boxH = Math.max(300, desk.clientHeight - 40 - 24 - 56); // 56: room for the switcher pill
                const px = Math.max(12, Math.min(90, Math.floor(Math.min(boxW / (r.width / pu.size), boxH / (r.height / pu.size)))));
                if (Math.abs(px - pu.size) >= 1) {
                    B.setCellSize(px);
                }
            }

            // ---- Pins -------------------------------------------------------------------------------------------
            const pinKey = LS_PINS + puzzleKey();

            /** Pins from the link's Tab set; first entry per mode primes that mode's sub-mode. */
            function seedPins() {
                const names = PenpaText.modes.EN;
                const mapping = PenpaText.modes.mapping;
                const seen = [];
                B.tabSet().forEach(function(name) {
                    const m = mapping[names.indexOf(name)];
                    if (!m) {
                        return;
                    }
                    let mode = m;
                    let sub = null;
                    const mm = /^sub_(lineE|line|number|sudoku|move|special)(.*)$/.exec(m);
                    if (mm) {
                        mode = mm[1];
                        sub = mm[2];
                    }
                    if (available[mode] && seen.indexOf(mode) === -1) {
                        seen.push(mode);
                        prime(mode, sub);
                    }
                });
                return {pins: seen.length ? seen : [openingMode], fromTabSet: seen.length > 0};
            }

            const seed = seedPins();
            let pins = readJSON(pinKey, null) || seed.pins.slice();
            /*
             * Round 3 fix (Chris: "changing tool on the tool window shouldn't change a pin if selected"). Penpa keeps one
             * sub-mode per mode, so with Composite pinned, picking another Composite tool in the picker rewrote what the
             * pin lands on. Now each pin keeps its own sub-mode (pinSub), and `onPin` says which pin the solver is on:
             *   - landing on a pin (Tab, chip click, preset) sets onPin and restores the pin's sub-mode;
             *   - a pick in the Tool card's picker leaves onPin only if it picked exactly the pin's tool; the pin list
             *     and pinSub never change;
             *   - while on a pin, a sub-mode change by the sub-mode control or a key updates pinSub (a pin is a mode
             *     and follows its last use, as ruled); styles are Penpa's per-mode memory, so a pin always shows and
             *     lands on its mode's last style;
             *   - Tab from a tool that is not on a pin goes to the pin after the last pin used.
             */
            const pinSubKey = LS_PINSUB + puzzleKey();
            let pinSub = readJSON(pinSubKey, null) || {};
            pins.forEach(function(mode) {
                if (pinSub[mode] == null) {
                    pinSub[mode] = remembered(mode).sub;
                }
            });
            let onPin = pins.indexOf(B.getMode().mode) !== -1 ? B.getMode().mode : null;
            let lastPinMode = onPin;
            let trackedMode = B.getMode().mode;
            let picked = false;

            function savePins() {
                writeJSON(pinKey, pins);
                writeJSON(pinSubKey, pinSub);
            }

            function resetPinSubs() {
                pinSub = {};
                pins.forEach(function(mode) {
                    pinSub[mode] = remembered(mode).sub;
                });
            }

            function landOnPin(mode) {
                onPin = mode;
                lastPinMode = mode;
                if (B.getMode().mode !== mode) {
                    B.setMode(mode);
                }
                const s = pinSub[mode];
                if (s != null && s !== '' && remembered(mode).sub !== String(s)) {
                    applySub(mode, s);
                }
            }

            /** Called on every bridge change, before rendering: keeps onPin and the active pin's sub-mode current. */
            function trackPin(m) {
                if (m.mode !== trackedMode) {
                    if (!picked) {
                        onPin = pins.indexOf(m.mode) !== -1 ? m.mode : null; // legacy keys, Recent, ...
                    }
                    trackedMode = m.mode;
                }
                picked = false;
                if (onPin && onPin === m.mode && String(pinSub[onPin]) !== m.submode) {
                    pinSub[onPin] = m.submode;
                    savePins();
                }
                if (onPin) {
                    lastPinMode = onPin;
                }
            }

            function pinMode(mode, sub) {
                const cur = B.getMode();
                if (pins.indexOf(mode) === -1) {
                    pins.push(mode);
                }
                pinSub[mode] = sub != null ? sub : (cur.mode === mode ? cur.submode : remembered(mode).sub);
                if (cur.mode !== mode) {
                    prime(mode, sub); // pinning the current mode must not change its sub-mode
                } else if (String(pinSub[mode]) === cur.submode) {
                    onPin = lastPinMode = mode;
                }
                savePins();
                renderAll(true);
            }

            function unpin(mode) {
                pins = pins.filter(function(p) {
                    return p !== mode;
                });
                delete pinSub[mode];
                if (onPin === mode) {
                    onPin = null;
                }
                if (lastPinMode === mode) {
                    lastPinMode = null;
                }
                savePins();
                renderAll(true);
            }

            function cyclePins(dir) {
                if (!pins.length) {
                    return;
                }
                const from = pins.indexOf(onPin || lastPinMode);
                let next;
                if (from === -1) {
                    next = dir > 0 ? 0 : pins.length - 1;
                } else {
                    next = (from + dir + pins.length) % pins.length;
                }
                landOnPin(pins[next]);
            }

            function applyPreset(p) {
                const list = [];
                p.pins.forEach(function(pin) {
                    const mode = pin[0];
                    if (!available[mode] || list.indexOf(mode) !== -1 || (mode === 'combi' && pin[1] && !composites[pin[1]])) {
                        return;
                    }
                    list.push(mode);
                    prime(mode, pin[1]);
                });
                if (!list.length) {
                    return;
                }
                pins = list;
                resetPinSubs();
                p.pins.forEach(function(pin) {
                    if (pin[1] != null && pins.indexOf(pin[0]) !== -1) {
                        pinSub[pin[0]] = pin[1];
                    }
                });
                savePins();
                landOnPin(pins[0]);
                renderAll(true);
            }

            function savedPresets() {
                return readJSON(LS_PRESETS, []);
            }

            const presetName = el('input', {type: 'text', class: 'proto-l-input', placeholder: 'Name these pins…'});
            presetName.addEventListener('keydown', function(e) {
                if (e.key === 'Enter') {
                    e.preventDefault();
                    saveCurrentPreset();
                }
            });

            function saveCurrentPreset() {
                const name = presetName.value.trim();
                if (!name || !pins.length) {
                    return;
                }
                const list = savedPresets().filter(function(p) {
                    return p.name !== name;
                });
                list.push({name: name, pins: pins.map(function(m) {
                    return [m, m === 'surface' || m === 'multicolor' || m === 'wall' ? null : pinSub[m]];
                })});
                writeJSON(LS_PRESETS, list);
                presetName.value = '';
                presetName.blur();
                renderPins();
            }

            let dragPin = null;
            function renderPins() {
                const m = B.getMode();
                const b = pinsCard.body;
                b.textContent = '';
                const strip = el('div', {class: 'proto-l-pins'});
                pins.forEach(function(mode, i) {
                    const r = remembered(mode);
                    const detail = [subName(mode, pinSub[mode]), styleName(mode, r.style)].filter(Boolean).join(' · ');
                    const on = mode === m.mode && onPin === mode;
                    const chip = el('div', {class: 'proto-l-pin' + (on ? ' is-on' : ''), draggable: 'true',
                        'data-mode': mode, title: 'Click: switch. Drag: reorder.'}, [
                        el('span', {class: 'proto-l-pinnum'}, [String(i + 1)]),
                        el('span', {class: 'proto-l-pinname'}, [MODE_NAME[mode] || mode]),
                        el('span', {class: 'proto-l-pindetail'}, [detail])
                    ]);
                    const x = btn('proto-l-unpin', '×', function() {
                        unpin(mode);
                    }, 'Unpin');
                    chip.appendChild(x);
                    chip.addEventListener('mousedown', function(e) {
                        if (!e.target.closest('button')) {
                            e.stopPropagation();
                        }
                    });
                    chip.addEventListener('click', function(e) {
                        if (e.target.closest('button')) {
                            return;
                        }
                        landOnPin(mode);
                    });
                    chip.addEventListener('dragstart', function(e) {
                        dragPin = mode;
                        e.dataTransfer.effectAllowed = 'move';
                        e.dataTransfer.setData('text/plain', mode);
                    });
                    chip.addEventListener('dragover', function(e) {
                        e.preventDefault();
                    });
                    chip.addEventListener('drop', function(e) {
                        e.preventDefault();
                        const from = pins.indexOf(dragPin || e.dataTransfer.getData('text/plain'));
                        if (from === -1 || from === i) {
                            return;
                        }
                        const moved = pins.splice(from, 1)[0];
                        pins.splice(i, 0, moved);
                        dragPin = null;
                        savePins();
                        renderPins();
                    });
                    strip.appendChild(chip);
                });
                b.appendChild(strip);
                b.appendChild(el('div', {class: 'proto-l-note'}, [
                    pins.length > 1 ? 'Tab / Shift+Tab cycle these; each mode comes back with its last sub-mode and style.' :
                        'Pin more modes to Tab between them.',
                    seed.fromTabSet ? '' : ' (This link has no Tab set; seeded with the mode it opened in.)'
                ]));
                // Presets: one pulldown (built-ins, then saved ones with a delete ×, then "save these pins as").
                const contents = function(p) {
                    return el('span', {class: 'proto-l-pddetail'}, [p.pins.map(function(x) {
                        return toolName(x[0], x[1], '');
                    }).join(', ')]);
                };
                const items = [{header: true, label: 'Built-in'}];
                BUILTIN_PRESETS.forEach(function(p, i) {
                    items.push({value: 'b' + i, label: p.name, extra: contents(p)});
                });
                const saved = savedPresets();
                if (saved.length) {
                    items.push({header: true, label: 'Saved'});
                }
                saved.forEach(function(p, i) {
                    const del = btn('proto-l-pdx', '×', function() {
                        writeJSON(LS_PRESETS, savedPresets().filter(function(q) {
                            return q.name !== p.name;
                        }));
                        closePd();
                        renderPins();
                    }, 'Delete this preset');
                    const extra = el('span', {class: 'proto-l-pdextra'}, [contents(p), del]);
                    items.push({value: 's' + i, label: p.name, extra: extra});
                });
                const footer = el('div', {class: 'proto-l-pdfoot'}, [presetName, btn('', 'Save', saveCurrentPreset)]);
                footer.addEventListener('mousedown', function(e) {
                    e.stopPropagation();
                });
                const presets = pulldown(items, function(v) {
                    applyPreset(v[0] === 'b' ? BUILTIN_PRESETS[+v.slice(1)] : saved[+v.slice(1)]);
                }, {cls: 'proto-l-pd-presets', fixed: 'Presets', footer: footer});
                b.appendChild(el('div', {class: 'proto-l-row'}, [
                    presets,
                    btn('', 'Pin current', function() {
                        pinMode(B.getMode().mode, null);
                    }, 'Pin the current mode'),
                    btn('', 'Reset', function() {
                        pins = seed.pins.slice();
                        resetPinSubs();
                        onPin = pins.indexOf(B.getMode().mode) !== -1 ? B.getMode().mode : null;
                        savePins();
                        renderAll(true);
                    }, 'Back to the link\'s own pins')
                ]));
            }

            // ---- Mouse card -------------------------------------------------------------------------------------
            function renderMouse(m) {
                const r = mouseRows(m.mode, m.submode, m.style);
                const b = mouseCard.body;
                b.textContent = '';
                const headline = el('div', {class: 'proto-l-headline'});
                headline.appendChild(el('span', {class: 'proto-l-hmode'}, [MODE_NAME[m.mode] || m.mode]));
                const sn = subName(m.mode, m.submode);
                if (sn) {
                    headline.appendChild(el('span', {class: 'proto-l-hsep'}, [' · ']));
                    headline.appendChild(el('span', {class: 'proto-l-hsub'}, [sn]));
                }
                const st = styleName(m.mode, m.style);
                if (st) {
                    headline.appendChild(el('span', {class: 'proto-l-hsep'}, [' · ']));
                    const sw = el('span', {class: 'proto-l-hstyle'}, [st]);
                    const col = swatchColor(m.mode, m.style);
                    if (col) {
                        sw.prepend(el('i', {class: 'proto-l-dot', style: 'background:' + col}));
                    }
                    headline.appendChild(sw);
                }
                b.appendChild(headline);
                const rows = el('div', {class: 'proto-l-mrows'});
                [['Left', r.left], ['Right', r.right], ['Drag', r.drag]].forEach(function(row) {
                    rows.appendChild(el('div', {class: 'proto-l-mrow' + (row[1] === '—' ? ' is-none' : '')}, [
                        el('span', {class: 'proto-l-mg'}, [row[0]]), el('span', {class: 'proto-l-md'}, [row[1]])
                    ]));
                });
                r.more.forEach(function(row) {
                    rows.appendChild(el('div', {class: 'proto-l-mrow is-more'}, [
                        el('span', {class: 'proto-l-mg'}, [row[0]]), el('span', {class: 'proto-l-md'}, [row[1]])
                    ]));
                });
                b.appendChild(rows);
                const pinned = onPin === m.mode;
                b.appendChild(el('div', {class: 'proto-l-note'}, [pinned ? 'Pinned: Tab moves on to the next pin.' :
                    'Not pinned: Tab returns to the pins.']));
            }

            /**
             * Colour of a colour style, from its legacy label. Non-colour styles get null: a checked legacy label has a
             * grey background of its own, which is not the style's colour.
             */
            function swatchColor(mode, style) {
                const name = styleName(mode, style);
                const colours = Object.values(SURFACE_STYLE).concat(['green', 'black', 'grey', 'red', 'blue', 'dark blue']);
                if (colours.indexOf(name) === -1) {
                    return null;
                }
                const m = mode === 'multicolor' ? 'surface' : mode;
                const lb = document.getElementById('st_' + m + style + '_lb');
                if (!lb) {
                    return null;
                }
                const bg = getComputedStyle(lb).backgroundColor;
                return bg && bg !== 'rgba(0, 0, 0, 0)' ? bg : null;
            }

            // ---- Tool card: the current mode with a searchable picker, then its sub-mode and style ------------------
            function shapeItems(current) {
                const out = [];
                let group = '';
                document.querySelectorAll('#mode_symbolul1 [id^=ms]').forEach(function(n) {
                    if (n.id.indexOf('ms1_') === 0) {
                        group = n.id.slice(4);
                        return;
                    }
                    if (n.id.indexOf('ms_') !== 0) {
                        return;
                    }
                    const name = n.id.slice(3);
                    const size = n.textContent.trim();
                    const label = name.indexOf(group + '_') === 0 ? group + ' ' + size : size || name;
                    out.push({value: name, label: label, on: name === current});
                });
                return out;
            }

            /** Picker entries for this grid. Composite tools carry Penpa's own label (often a genre) as a tag. */
            function browserEntries() {
                const subsOf = {};
                const out = [];
                ENTRIES.forEach(function(e) {
                    const mode = e[1];
                    if (!available[mode]) {
                        return;
                    }
                    if (e[2] != null && mode !== 'special') {
                        if (!subsOf[mode]) {
                            subsOf[mode] = B.listSubmodes(mode).map(function(s) {
                                return String(s.value);
                            });
                        }
                        if (subsOf[mode].length && subsOf[mode].indexOf(e[2]) === -1) {
                            return;
                        }
                    }
                    out.push({group: e[0], mode: mode, sub: e[2], name: e[3], desc: e[4], tags: []});
                });
                if (available.combi) {
                    Object.keys(composites).forEach(function(name) {
                        const c = COMBI[name] || [composites[name], 'symbols', ''];
                        out.push({group: c[1], mode: 'combi', sub: name, name: c[0], desc: c[2], tags: [composites[name]]});
                    });
                }
                return out;
            }
            const allEntries = browserEntries();

            function currentEntry(m) {
                return allEntries.filter(function(e) {
                    return e.mode === m.mode && e.sub === m.submode;
                })[0] || allEntries.filter(function(e) {
                    return e.mode === m.mode && e.sub == null;
                })[0] || null;
            }

            const pickInput = el('input', {type: 'text', class: 'proto-l-input proto-l-search', spellcheck: 'false',
                placeholder: 'Search: name, what it does, or a tag…'});
            const pickList = el('div', {class: 'proto-l-list'});
            const picker = el('div', {class: 'proto-l-picker'}, [
                el('div', {class: 'proto-l-pickfield'}, [pickInput, el('span', {class: 'proto-l-caret'}, ['▾'])]), pickList
            ]);
            const pickMode = el('span', {class: 'proto-l-pickmode'});
            const toolOpts = el('div', {class: 'proto-l-toolopts'});
            toolCard.body.appendChild(el('div', {class: 'proto-l-sub'}, ['Mode: ', pickMode]));
            const recentRow = el('div', {class: 'proto-l-recent'});
            toolCard.body.appendChild(picker);
            toolCard.body.appendChild(recentRow);
            toolCard.body.appendChild(toolOpts);

            // ---- Recent modes: the last modes used, most recent first, without the current mode or pinned ones. A
            // button lands on its mode as a pin does (setMode restores the mode's last sub-mode and style); its pin icon
            // pins it. Not in the Tab cycle. Kept per puzzle next to the pins.
            const recentKey = LS_RECENT + puzzleKey();
            let recents = readJSON(recentKey, []);
            let lastMode = B.getMode().mode;

            /** Called on every render: when the mode changed, the mode just left goes to the front. */
            function noteRecent(mode) {
                if (mode === lastMode) {
                    return;
                }
                recents = [lastMode].concat(recents.filter(function(x) {
                    return x !== lastMode && x !== mode;
                })).slice(0, 12);
                lastMode = mode;
                writeJSON(recentKey, recents);
            }

            const PIN_ICON = '<svg width="12" height="12" viewBox="0 0 16 16" aria-hidden="true"><path fill="currentColor" ' +
                'd="M10.5 1.5l4 4-1.6.6-2.6 2.6.3 3.5-1.1 1.1-2.9-2.9-3.7 3.7-.7-.7 3.7-3.7-2.9-2.9 1.1-1.1 3.5.3 2.6-2.6z"/></svg>';

            function renderRecent(m) {
                recentRow.textContent = '';
                const shown = recents.filter(function(x) {
                    return x !== m.mode && pins.indexOf(x) === -1 && available[x];
                }).slice(0, 5);
                if (!shown.length) {
                    recentRow.hidden = true;
                    return;
                }
                recentRow.hidden = false;
                recentRow.appendChild(el('span', {class: 'proto-l-optlabel'}, ['Recent']));
                const list = el('div', {class: 'proto-l-recentlist'});
                shown.forEach(function(mode) {
                    const r = remembered(mode);
                    const detail = [subName(mode, r.sub), styleName(mode, r.style)].filter(Boolean).join(' · ');
                    const b = btn('proto-l-recentbtn', '', function(e) {
                        if (e.target.closest('.proto-l-recentpin')) {
                            pinMode(mode, null);
                        } else {
                            B.setMode(mode);
                        }
                    }, toolName(mode, r.sub, r.style));
                    b.setAttribute('data-mode', mode);
                    b.appendChild(el('span', {class: 'proto-l-pinname'}, [MODE_NAME[mode] || mode]));
                    b.appendChild(el('span', {class: 'proto-l-pindetail'}, [detail]));
                    const pin = el('span', {class: 'proto-l-recentpin', title: 'Pin ' + (MODE_NAME[mode] || mode)});
                    pin.innerHTML = PIN_ICON;
                    b.appendChild(pin);
                    list.appendChild(b);
                });
                recentRow.appendChild(list);
            }
            let pickOpen = false;
            let active = -1;

            function showCurrent() {
                const m = B.getMode();
                const e = currentEntry(m);
                pickInput.value = e ? e.name : (MODE_NAME[m.mode] || m.mode);
                pickMode.textContent = MODE_NAME[m.mode] || m.mode;
            }

            function openPicker() {
                if (pickOpen) {
                    return;
                }
                pickOpen = true;
                closePd();
                picker.classList.add('is-open');
                toolCard.card.classList.add('has-open');
                raise(toolCard);
                pickInput.value = '';
                active = -1;
                renderPicker();
                sizePicker();
            }

            /**
             * Round 3: the open list sits in the card's flow, between the field and the sub-mode / style controls, so it
             * pushes them down instead of covering them. Its height is what is left of the window below the field once
             * the controls are counted.
             */
            function sizePicker() {
                const top = pickInput.getBoundingClientRect().bottom;
                const room = window.innerHeight - top - recentRow.offsetHeight - toolOpts.offsetHeight - 40;
                pickList.style.maxHeight = Math.max(160, Math.min(470, room)) + 'px';
            }

            function closePicker() {
                if (!pickOpen) {
                    return;
                }
                pickOpen = false;
                picker.classList.remove('is-open');
                toolCard.card.classList.remove('has-open');
                showCurrent();
            }

            pickInput.addEventListener('focus', openPicker);
            pickInput.addEventListener('mousedown', function() {
                if (document.activeElement === pickInput) {
                    openPicker();
                }
            });
            pickInput.addEventListener('blur', closePicker);
            pickInput.addEventListener('input', function() {
                openPicker();
                active = -1;
                renderPicker();
            });
            pickInput.addEventListener('keydown', function(e) {
                const rows = pickList.querySelectorAll('.proto-l-entry');
                if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
                    e.preventDefault();
                    openPicker();
                    active = Math.max(0, Math.min(rows.length - 1, active + (e.key === 'ArrowDown' ? 1 : -1)));
                    markActive();
                } else if (e.key === 'Enter') {
                    e.preventDefault();
                    const r = rows[active >= 0 ? active : 0];
                    if (r) {
                        r.click();
                    }
                } else if (e.key === 'Escape') {
                    e.preventDefault();
                    pickInput.blur();
                } else {
                    openPicker();
                }
            });

            function markActive() {
                pickList.querySelectorAll('.proto-l-entry').forEach(function(r, i) {
                    r.classList.toggle('is-active', i === active);
                    if (i === active) {
                        r.scrollIntoView({block: 'nearest'});
                    }
                });
            }

            /** A pick never changes the pin list; it stays on a pin only if it picked exactly that pin's tool. */
            function pickEntry(e) {
                picked = true;
                if (B.getMode().mode !== e.mode) {
                    B.setMode(e.mode);
                }
                if (e.sub != null) {
                    applySub(e.mode, e.sub);
                }
                const now = B.getMode();
                onPin = pins.indexOf(now.mode) !== -1 && String(pinSub[now.mode]) === now.submode ? now.mode : null;
                if (onPin) {
                    lastPinMode = onPin;
                }
                pickInput.blur();
                renderAll(true);
            }

            function renderPicker() {
                const m = B.getMode();
                const q = pickOpen ? pickInput.value.trim().toLowerCase() : '';
                const words = q ? q.split(/\s+/) : [];
                pickList.textContent = '';
                let shown = 0;
                GROUPS.forEach(function(g) {
                    const items = allEntries.filter(function(e) {
                        if (e.group !== g[0]) {
                            return false;
                        }
                        const hay = [e.name, e.desc, MODE_NAME[e.mode], e.tags.join(' '), g[1]].join(' ').toLowerCase();
                        return words.every(function(w) {
                            return hay.indexOf(w) !== -1;
                        });
                    });
                    if (!items.length) {
                        return;
                    }
                    pickList.appendChild(el('div', {class: 'proto-l-group'}, [g[1]]));
                    items.forEach(function(e) {
                        shown++;
                        const current = e.mode === m.mode && (e.sub == null || e.sub === m.submode);
                        const pinned = pins.indexOf(e.mode) !== -1;
                        const name = el('div', {class: 'proto-l-ename'}, [e.name, el('span', {class: 'proto-l-emode'}, [MODE_NAME[e.mode]])]);
                        e.tags.forEach(function(t) {
                            name.appendChild(el('span', {class: 'proto-l-tag'}, [t]));
                        });
                        const row = el('div', {class: 'proto-l-entry' + (current ? ' is-on' : ''), 'data-mode': e.mode,
                            'data-sub': e.sub == null ? '' : e.sub}, [name, el('div', {class: 'proto-l-edesc'}, [e.desc])]);
                        const pinBtn = btn('proto-l-pinbtn' + (pinned ? ' is-pinned' : ''), pinned ? 'Pinned' : 'Pin', function() {
                            if (pinned) {
                                unpin(e.mode);
                            } else {
                                pinMode(e.mode, e.sub);
                            }
                        }, pinned ? 'Unpin ' + MODE_NAME[e.mode] : 'Pin the ' + MODE_NAME[e.mode] + ' mode (Tab lands on it)');
                        row.appendChild(pinBtn);
                        row.addEventListener('mousedown', function(ev) {
                            ev.preventDefault(); // keep focus in the search box
                        });
                        row.addEventListener('click', function(ev) {
                            if (!ev.target.closest('button')) {
                                pickEntry(e);
                            }
                        });
                        pickList.appendChild(row);
                    });
                });
                if (!shown) {
                    pickList.appendChild(el('div', {class: 'proto-l-note'}, ['No mode matches “' + q + '”.']));
                }
                markActive();
            }

            function optRow(label, control) {
                return el('div', {class: 'proto-l-opt'}, [el('span', {class: 'proto-l-optlabel'}, [label]), control]);
            }

            function renderTool(m) {
                if (pickOpen) {
                    renderPicker();
                } else {
                    showCurrent();
                }
                toolOpts.textContent = '';
                let subItems = null;
                let subLabel = 'Sub-mode';
                if (m.mode === 'combi') {
                    subLabel = 'Tool';
                    subItems = B.listComposite().map(function(c) {
                        return {value: c.name, label: COMBI[c.name] ? COMBI[c.name][0] : c.label, tags: [c.label],
                            on: c.name === m.submode};
                    });
                } else if (m.mode === 'symbol') {
                    subLabel = 'Shape';
                    subItems = shapeItems(m.submode);
                } else {
                    subItems = B.listSubmodes(m.mode).map(function(s) {
                        return {value: s.value, label: subName(m.mode, s.value) || s.label, on: String(s.value) === m.submode};
                    });
                }
                if (subItems.length) {
                    toolOpts.appendChild(optRow(subLabel, choice(subItems, function(v) {
                        applySub(m.mode, v);
                    }, 'proto-l-pd-sub')));
                }
                // Round 3: styles are one button each (colour swatch, or a drawn sample for non-colour styles); the
                // name is the button's title.
                const styles = m.mode === 'combi' ? [] : B.listStyles(m.mode);
                if (styles.length) {
                    const row = el('div', {class: 'proto-l-styles'});
                    styles.forEach(function(s) {
                        const name = styleName(m.mode, s.value) || s.label;
                        const b = btn('proto-l-stylebtn' + (s.value === m.style ? ' is-on' : ''), '', function() {
                            B.setStyle(s.value);
                        }, name);
                        b.setAttribute('data-name', name);
                        b.innerHTML = styleSample(name, swatchColor(m.mode, s.value));
                        row.appendChild(b);
                    });
                    toolOpts.appendChild(optRow(m.mode === 'surface' || m.mode === 'multicolor' ? 'Colour' : 'Style', row));
                }
                if (pickOpen) {
                    sizePicker();
                }
            }

            /** A 30x18 SVG sample of a style: a swatch for colours, a drawn line or mark for the rest. */
            function styleSample(name, color) {
                const svg = function(inner) {
                    return '<svg width="30" height="18" viewBox="0 0 30 18" aria-hidden="true">' + inner + '</svg>';
                };
                const line = function(attrs) {
                    return '<line x1="4" y1="9" x2="26" y2="9" stroke-linecap="round" ' + attrs + '/>';
                };
                if (color) {
                    return svg('<rect x="5" y="1.5" width="20" height="15" rx="3" fill="' + color +
                        '" stroke="rgba(0,0,0,.3)"/>');
                }
                const t = function(txt, extra) {
                    return svg((extra || '') + '<text x="15" y="13.5" text-anchor="middle" font-size="11" font-weight="700" ' +
                        'font-family="system-ui,sans-serif">' + txt + '</text>');
                };
                switch (name) {
                case 'thin': return svg(line('stroke="#222" stroke-width="1"'));
                case 'thicker': return svg(line('stroke="#222" stroke-width="5"'));
                case 'dotted': return svg(line('stroke="#222" stroke-width="2.5" stroke-dasharray="0.1 4.5"'));
                case 'fat dots': return svg(line('stroke="#222" stroke-width="5.5" stroke-dasharray="0.1 8"'));
                case 'short': return svg('<line x1="11" y1="9" x2="19" y2="9" stroke="#222" stroke-width="3" stroke-linecap="round"/>');
                case 'double': return svg('<line x1="4" y1="6" x2="26" y2="6" stroke="#222" stroke-width="1.5"/>' +
                    '<line x1="4" y1="12" x2="26" y2="12" stroke="#222" stroke-width="1.5"/>');
                case 'grey dot': return svg('<circle cx="15" cy="9" r="4" fill="#999"/>');
                case 'dotted line': return svg(line('stroke="#222" stroke-width="1.5" stroke-dasharray="2 3"'));
                case 'grey line': return svg(line('stroke="#999" stroke-width="2"'));
                case 'grey dots': return svg(line('stroke="#999" stroke-width="3" stroke-dasharray="0.1 4.5"'));
                case 'solid line': return svg(line('stroke="#222" stroke-width="2"'));
                case 'white': return t('1', '<rect x="5" y="1.5" width="20" height="15" rx="3" fill="#555"/>').replace('<text', '<text fill="#fff"');
                case 'white background': return t('1', '<rect x="5" y="1.5" width="20" height="15" rx="2" fill="#fff" stroke="#999"/>');
                case 'behind lines': return svg('<circle cx="15" cy="9" r="6" fill="#bbb"/>' + line('stroke="#222" stroke-width="2"'));
                case 'in front of lines': return svg(line('stroke="#222" stroke-width="2"') + '<circle cx="15" cy="9" r="6" fill="#bbb"/>');
                }
                return t(String(name).replace(/^style /, '#'));
            }

            // ---- Keys -------------------------------------------------------------------------------------------
            function typing(e) {
                const t = e.target;
                return t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.tagName === 'SELECT' || t.isContentEditable);
            }

            function legacyDialogOpen() {
                if (document.querySelector('.swal2-container')) {
                    return true;
                }
                return Array.from(document.querySelectorAll('.modal')).some(function(n) {
                    return n.style.display && n.style.display !== 'none';
                });
            }

            // Tab / Shift+Tab (and Enter, Penpa's Tab twin) cycle L's pins, before Penpa's own Tab-set cycle.
            window.addEventListener('keydown', function(e) {
                if ((e.key !== 'Tab' && e.key !== 'Enter') || e.ctrlKey || e.altKey || e.metaKey || typing(e) ||
                    legacyDialogOpen()) {
                    return;
                }
                e.preventDefault();
                e.stopImmediatePropagation();
                cyclePins(e.shiftKey ? -1 : 1);
            }, true);

            // Penpa's canvas mousedown keeps focus where it was (main.js:1099): drop focus from L's text fields.
            document.addEventListener('mousedown', function(e) {
                const a = document.activeElement;
                if (e.target === ctx.canvas && a && app.contains(a) && a.tagName === 'INPUT') {
                    a.blur();
                }
            }, true);

            // ---- Answer check -----------------------------------------------------------------------------------
            let checkPos = -1;
            function runCheck() {
                const res = B.check();
                checkPos = B.history().position;
                setStatus(!res.hasAnswerCheck ? 'none' : res.solved ? 'solved' : 'wrong');
            }
            function setStatus(kind) {
                status.className = 'proto-l-status' + (kind ? ' is-' + kind : '');
                status.textContent = kind ? {solved: 'Solved', wrong: 'Not solved yet', none: 'No answer check'}[kind] : '';
            }

            // ---- Render -----------------------------------------------------------------------------------------
            let lastKey = '';
            function renderAll(force) {
                const m = B.getMode();
                trackPin(m);
                const key = m.mode + '|' + m.submode + '|' + m.style;
                if (!force && key === lastKey) {
                    return;
                }
                lastKey = key;
                noteRecent(m.mode);
                renderMouse(m);
                renderPins();
                renderTool(m);
                renderRecent(m);
                reflow();
            }

            /**
             * Round 3: the Mouse and Pins cards size to their content. While the solver has moved neither card of a
             * column, the card below follows the one above it (Tool under Mouse, Rules under Pins).
             */
            function reflow() {
                if (!layout.mouse && !layout.tool) {
                    place(cards.tool);
                }
                if (!layout.pins && !layout.rules) {
                    place(cards.rules);
                }
            }

            function render(state) {
                renderAll(false);
                undoBtn.disabled = !state.canUndo;
                redoBtn.disabled = !state.canRedo;
                checkBtn.hidden = !state.hasAnswerCheck;
                pauseBtn.textContent = state.timer.paused ? 'Start' : 'Pause';
                timerText.textContent = state.timer.text;
                if (state.solved) {
                    setStatus('solved');
                } else if (checkPos !== -1 && B.history().position !== checkPos) {
                    checkPos = -1;
                    setStatus(null);
                }
            }

            B.onChange(render);
            B.onTimer(function(t) {
                timerText.textContent = t.text;
            });
            window.addEventListener('resize', function() {
                placeAll();
            });
            requestAnimationFrame(function() {
                fitBoard();
                requestAnimationFrame(function() {
                    requestAnimationFrame(fitBoard);
                });
            });
            // Expose for the prototype's own checks (not an API).
            window.ProtoL = {pins: function() {
                return pins.slice();
            }, cards: cards, resetLayout: resetLayout};
            renderAll(true);
            placeAll(); // again, now that cards have content: default columns stack by measured height
            render(B.getState());
        }
    };
})();
