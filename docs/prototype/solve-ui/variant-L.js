/*
 * PROTOTYPE (throwaway, branch prototype/solve-ui): solve-UI variant L, "Desk + pins".
 * Owned by variant L's builder: this file and variant-L.css. See README.md for the contract.
 *
 * Built to Chris's rulings of 2026-11-13 (research/solve-ui-prototype-verdicts.md, last section), on the kept ideas of
 * I (the desk) and K (the mouse card):
 *   1. Desk: the board and five cards lie on one desk; round 4 default: Mouse and Rules on the left, Pinned modes,
 *      Mode and Recent on the right, the Board card filling the space between. Every card is dragged by its header
 *      and resized by its right edge, bottom edge or corner (minimum sizes in MIN_SIZE); cards stack 10px apart in a
 *      column until the solver moves or resizes one there. One layout for every puzzle, kept in localStorage
 *      (PROTOTYPE key `proto-L-layout-v4`; older keys are ignored); "Reset layout" restores the default. On every
 *      window resize (browser zoom fires one) the default cards re-run the layout for the new viewport and the moved
 *      or resized ones keep their gap to the nearer edges, clamped and shrunk to stay inside (see place()).
 *      The board always fits its card (setCellSize, 12-90 px); − / + step from the fitted size and scroll inside.
 *      Round 5: a resize keeps a card in its column stack (the cards below move down); only a drag frees it.
 *   2. Mouse card: fixed on the desk, large, with one fixed height (round 4: the tallest any tool needs). Its headline names the whole tool, mode · sub-mode · style
 *      ("Line · helper × · green"); rows below say what Left, Right and Drag do with it. Re-rendered on every
 *      bridge onChange, so legacy keys (Z/X/C/V, Shift/Ctrl in Sudoku, Surface digits) update it too.
 *   3. Pinned tools (round 3, Chris: "we are pinning a sub mode"): a pin is a mode plus one sub-mode (for Shape,
 *      Special and Composite the tool from the list), with its own remembered style; one mode can be pinned twice
 *      (Line normal + Line helper ×). Tab / Shift+Tab (and Enter, which Penpa+ treats as Tab) land on a pin's mode and
 *      sub-mode with its style. A style change while on a pin updates that pin's style; nothing else changes a pin:
 *      a pick or a sub-mode change in the Tool card lights a pin only when it matches one exactly. Pins are seeded
 *      from the link's Tab set (an entry naming a sub-mode keeps it; a mode-only entry takes the mode's current
 *      sub-mode); with an empty Tab set (9 of the 12 samples) the tool the link opened on. Edited per puzzle (remove
 *      ×, drag to reorder, Pin current, Pin in the picker, the Recent pin icon) and stored per puzzle under
 *      `proto-L-pins-v2:<hash of the link's p=>` (v1 held bare modes and is ignored).
 *      Held Shift / Ctrl in Sudoku (#69): the temporary sub-mode never enters Recent and never changes or unlights a
 *      pin; the Mouse card tags it "held". Tab during a hold drops the hold first; blur, a hidden page and a legacy
 *      dialog drop it too (see the comment above `hold`). A picker pick that exactly matches a pin lands on it.
 *   4. Presets: round 4 (Chris), built-ins titled by puzzle genre under genre-family headings (Loops, Shading,
 *      Objects, Regions, Sudoku), each with its pins as a muted line; the solver's own under "Saved"
 *      (`proto-L-presets-v1`); all in one "Presets" pulldown on the Pinned modes card (save field at its foot). Each
 *      preset pin is [mode, sub-mode or null, style or null]; null takes the mode's current value. A preset none of
 *      whose pins the grid offers is dimmed.
 *   5. Mode card (round 4: renamed from Tool; round 2: the old Tool settings and All modes cards merged): a field showing the current mode entry;
 *      focusing, clicking or typing in it opens the picker (every solve mode and sub-mode, Composite tools and Special
 *      objects included, in seven groups by what it puts on the board, filtered by the typed words, a Pin toggle per
 *      entry); picking closes it. Under the field: the sub-mode (or Composite tool / Shape) and style pulldowns.
 *      Round 2 rule for one-of-N rows: more than 3 choices -> a pulldown (style keeps its swatch); 3 or fewer stay a
 *      one-click segmented row (Sudoku normal / corner / centre, Cage, Move).
 *      Round 3: styles are back to one button each (colour swatch, or a drawn sample for thin / dotted / fat dots /
 *      ...; the name is the title); the open picker list sits in the card's flow and pushes the sub-mode and style
 *      controls down; the Mouse card is as tall as its content, and the Tool card follows it while neither was moved.
 *      Recent (round 4: its own desk card, left column under Pinned modes; Chris: "Recent tools should be its own
 *      window"): up to 5 recently used tools (mode + sub-mode, with their last style), most recent first, without the
 *      current tool or one matching a pin, as full-width rows; a row goes to its tool, its pin icon pins it; not in
 *      the Tab cycle; kept per puzzle under `proto-L-recent-v2:<hash of p=>`. Empty, it shows one muted line.
 *      Layout key `proto-L-layout-v3` (v2 had no Recent card).
 *      Chris: "if a sub mode has no style options we should just show the pulldown of other sub modes": a tool with
 *      no style shows only the sub-mode pulldown (any count of 2+), and no options area at all when it has neither.
 *      Composite tools get the line / edge styles Penpa shows for them (class_p.js subcombimode).
 *      Round 4: the card is the picker field plus style buttons only (24px squares); every sub-mode, every Shape
 *      included, is a picker entry; no sub-mode control.
 *   6. Genre names: Chris ruled them fine as searchable tags, not groups (presets, round 4, are titled by genre). Each Composite entry carries Penpa+'s own label
 *      as a tag chip ("Bulbs + dots" tagged "Akari"). Not here: genre grouping, loupes, per-genre kits, a pointer badge.
 *   7. Round 5, mode cues and dark mode (see the comment above renderCues): the Board frame in the mode family's
 *      colour with a style-colour inner edge, the tool in the Board title, a flash of the tool name on every mode or
 *      sub-mode change, a cursor per family; each its own toggle in the top bar's "Mode cues" pulldown. A Light / Dark
 *      toggle restyles the desk and puts the board in Penpa's own dark theme (which keeps the cells white).
 *   8. Round 6 (Chris, 2026-11-14, on round 5):
 *      - Cursors: removed (code, CSS and the "Cursor per mode" toggle); Penpa's own cursor stays.
 *      - Window colour by pin, not by mode: each pin owns one of 8 colour slots (PIN_COLOR, light and dark sets), kept
 *        through reorders and reloads, so every pin differs, two pins on one mode included. A tool that is not a pin
 *        (picked in the Mode card or from Recent) takes the lowest slot no pin holds, so it never wears a pin's colour;
 *        with all 8 held it is neutral grey. Each chip shows its colour as a 6px left edge, and the lit chip is filled
 *        with it, so chip and Board frame match.
 *      - Flash: a small (14px) translucent tag near the top of the board with a dot in the window colour, the tool's
 *        mode and sub-mode only (no style), on screen about 350ms and fading in 0.2s (was 32px, centred, 500ms).
 *      - Chips: one line each, number + label + ×; no bold mode name, no style or setting. The label is the sub-mode
 *        alone where it names its tool (Composite, Special, Shape), else "Mode > Sub-mode" ("Line > Normal"), else the
 *        mode ("Surface"). The full tool name is the chip's tooltip.
 *
 * Scaffold change (the only edit outside this file and variant-L.css): loader.js's VARIANTS string 'ABCDEFGHIJK' ->
 * 'ABCDEFGHIJKL', so the loader accepts ?variant=L and the switcher's arrows reach it.
 *
 * Bridge gaps worked around here (reading `pu` / the legacy DOM directly):
 *   - A mode's remembered sub-mode / style (default sub-mode for a new pin, Tab-set seeding, presets with null):
 *     pu.mode[pu.mode.qa][mode].
 *   - Composite tools with Penpa's line / edge style box: bridge.setStyle builds st_combi<n>, which does not exist; L
 *     calls pu.stylemode_check('st_line<n>' / 'st_lineE<n>'). Landing on a Multicolor pin uses the same call for
 *     st_surface<n>, because bridge.setStyle also presses the digit and would colour the selected cells.
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

    const LS_LAYOUT = 'proto-L-layout-v4'; // v1: six cards; v2: five; v3: Recent card; v4: columns swapped, sizes
    const LS_PRESETS = 'proto-L-presets-v1';
    const LS_PINS = 'proto-L-pins-v2:'; // v2: a pin is {mode, sub, style}; v1 held bare modes
    const LS_RECENT = 'proto-L-recent-v2:';
    const LS_CUES = 'proto-L-cues-v1'; // round 5
    const LS_THEME = 'proto-L-theme-v1';
    const TOP = 44;

    const MODE_NAME = {
        surface: 'Surface', multicolor: 'Multicolor', line: 'Line', lineE: 'Edge', wall: 'Wall', number: 'Number',
        symbol: 'Shape', special: 'Special', cage: 'Cage', combi: 'Composite', sudoku: 'Sudoku', move: 'Move'
    };

    /**
     * Round 6: window colours, one slot per pin (see the comment above renderCues). Light-theme colours carry white
     * title text, dark-theme ones dark text, each at 4.5:1 or better; none is a pure puzzle blue, green, red or grey.
     */
    const PIN_COLOR = {
        light: ['#2f5fc4', '#b0560a', '#66750f', '#7a3fc0', '#0f7f84', '#9c2a62', '#8a5a2b', '#4f5d75'],
        dark: ['#6f9cf5', '#f29a4a', '#b3c94a', '#b386f0', '#3cc4c9', '#f07ab0', '#d2a06a', '#9fb0cc']
    };
    const NEUTRAL_COLOR = {light: '#5f6673', dark: '#a0a8b6'};

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

    /** Composite tools that show Penpa's line / edge style box (class_p.js subcombimode). */
    const COMBI_LINE_STYLE = ['linex', 'lineox', 'linedir', 'yajilin', 'rassisillai', 'tents'];
    const COMBI_EDGE_STYLE = ['edgex', 'edgexoi'];

    /** The legacy style box a tool uses: its own mode, Surface's for Multicolor, line / lineE or none for Composite. */
    function styleBox(mode, sub) {
        if (mode === 'combi') {
            return COMBI_LINE_STYLE.indexOf(sub) !== -1 ? 'line' : COMBI_EDGE_STYLE.indexOf(sub) !== -1 ? 'lineE' : null;
        }
        return mode === 'multicolor' ? 'surface' : mode;
    }

    function styleName(mode, style, sub) {
        const box = styleBox(mode, sub);
        const t = box && STYLE_TABLE[box];
        if (!t || style === '' || style == null || isNaN(style)) {
            return '';
        }
        return t[style] || ('style ' + style);
    }

    /** Readable names for the legacy shape groups (ms1_ / ms3_ / ms4_ ids in index.html). */
    const SHAPE_GROUP = {
        circle: 'Circle', square: 'Square', triup: 'Triangle up', tridown: 'Triangle down', triright: 'Triangle right',
        trileft: 'Triangle left', diamond: 'Diamond', hexpoint: 'Hexagon, point up', hexflat: 'Hexagon, flat',
        ox: '○ △ □ ×', bars: 'Bars', math: 'Math', degital: 'Digital digits', arrow_B: 'Arrow', arrow_N: 'Arrow, notched',
        arrow_tri: 'Arrow, triangle', arrow_fouredge: 'Arrows, four edges', arrow_GP: 'Arrow, graphic', battleship: 'Ship'
    };

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
        return [MODE_NAME[mode] || mode, subName(mode, sub), styleName(mode, style, sub)].filter(Boolean).join(' · ');
    }

    // ---- Mouse grammar ------------------------------------------------------------------------------------------

    /**
     * What Left click, Right click and Drag do with a tool, plus extra rows. Read from class_p.js mouseevent
     * (8663-8770), mouse_line / mouse_lineX / mouse_lineEX (9014, 9210, 9346), mouse_number (9417) and K's
     * Composite table (checked LIVE by K's builder on 2026-11-13). '—' = nothing.
     */
    function mouseRows(mode, sub, style) {
        const s = styleName(mode, style, sub);
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

    /**
     * Built-in presets (round 4, Chris: "Presets should not be named as types but grouped as puzzle genres and titled
     * as such. I only didnt want the modes themselves titled by genre."): titled by genre, grouped by genre family.
     * Pins are the genre kits the round-2 variants found (variant-E.js GENRES / KINDS, variant-K.js inferKit; a kit's
     * "swap" kind such as Dot or Cross is the same Composite tool, so one pin). Each pin: [mode, sub-mode or null (the
     * mode's current one)]. Modes, pins, the picker and Recent stay named by what they do.
     */
    const BUILTIN_PRESETS = [
        {group: 'Loops', name: 'Masyu', pins: [['combi', 'linex'], ['combi', 'lineox']]},
        {group: 'Loops', name: 'Slitherlink', pins: [['combi', 'edgex'], ['combi', 'edgexoi']]},
        {group: 'Loops', name: 'Yajilin', pins: [['combi', 'yajilin'], ['combi', 'linex']]},
        {group: 'Shading', name: 'Nurikabe', pins: [['combi', 'blpo']]},
        {group: 'Shading', name: 'Yin-Yang', pins: [['combi', 'blwh']]},
        {group: 'Shading', name: 'Heyawake / LITS', pins: [['combi', 'blpo']]},
        {group: 'Objects', name: 'Star Battle', pins: [['combi', 'star']]},
        {group: 'Objects', name: 'Akari', pins: [['combi', 'akari']]},
        {group: 'Objects', name: 'Battleships', pins: [['combi', 'battleship']]},
        {group: 'Objects', name: 'Tents', pins: [['combi', 'tents']]},
        {group: 'Regions', name: 'Fillomino', pins: [['number', '1'], ['combi', 'edgex']]},
        {group: 'Regions', name: 'Galaxies', pins: [['combi', 'edgex']]},
        {group: 'Sudoku', name: 'Classic sudoku', pins: [['sudoku', '1'], ['sudoku', '2'], ['sudoku', '3']]},
        {group: 'Sudoku', name: 'Sudoku with colours', pins: [['sudoku', '1'], ['sudoku', '2'], ['sudoku', '3'], ['multicolor', null]]}
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
            let mouseDefaultH = 0; // round 4: the Mouse card's fixed default height (measureMouse)
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
                // Round 4 (Chris: "windows should be resizeable"): right edge, bottom edge and corner handles.
                ['r', 'b', 'c'].forEach(function(dir) {
                    const hnd = el('div', {class: 'proto-l-rs proto-l-rs-' + dir, title: 'Drag to resize'});
                    hnd.addEventListener('mousedown', function(e) {
                        if (e.button === 0) {
                            startResize(cards[id], dir, e);
                        }
                    });
                    card.appendChild(hnd);
                });
                return cards[id];
            }

            /** Smallest size a card can be dragged to, [width, height] in px. */
            const MIN_SIZE = {board: [240, 200], mouse: [260, 140], pins: [240, 110], mode: [280, 100], recent: [240, 80],
                rules: [200, 80]};

            let resize = null;
            function startResize(c, dir, e) {
                e.preventDefault();
                e.stopPropagation();
                raise(c);
                resize = {c: c, dir: dir, sx: e.clientX, sy: e.clientY, w: c.card.offsetWidth, h: c.card.offsetHeight};
                c.card.classList.add('is-resizing');
            }
            document.addEventListener('mousemove', function(e) {
                if (!resize) {
                    return;
                }
                const min = MIN_SIZE[resize.c.id] || [160, 80];
                if (resize.dir !== 'b') {
                    resize.c.card.style.width = Math.max(min[0], resize.w + e.clientX - resize.sx) + 'px';
                }
                if (resize.dir !== 'r') {
                    resize.c.card.style.height = Math.max(min[1], resize.h + e.clientY - resize.sy) + 'px';
                    resize.c.card.classList.add('is-sized');
                }
            });
            document.addEventListener('mouseup', function() {
                if (!resize) {
                    return;
                }
                const c = resize.c;
                c.card.classList.remove('is-resizing');
                resize = null;
                // Round 5 ruling (team lead): a resized card keeps pushing the cards below it in its column, so a
                // resize saves the size only. A card keeps a saved position only once it has been dragged (x set).
                const p = layout[c.id] || {};
                p.w = c.card.offsetWidth;
                if (c.card.style.height) {
                    p.h = c.card.offsetHeight;
                }
                if (p.x != null) {
                    p.vw = desk.clientWidth;
                    p.vh = desk.clientHeight;
                    p.cw = c.card.offsetWidth;
                    p.ch = c.card.offsetHeight;
                }
                layout[c.id] = p;
                writeJSON(LS_LAYOUT, layout);
                afterResize(c);
            });

            /** Content that follows a card's size: the board refits, the picker list re-sizes, Rules caps its height. */
            function afterResize(c) {
                if (c.id === 'board') {
                    fitBoard(); // a Board resize drops any manual zoom
                } else if (c.id === 'mode' && pickOpen) {
                    sizePicker();
                }
                renderAll(true);
            }

            function raise(c) {
                zTop = zTop >= 900 ? 20 : zTop + 1;
                c.card.style.zIndex = zTop;
            }

            // Default layout (round 4, Chris: "the pinned modes and mode and recent mode should all be on the right side,
            // mouse and rules on the left"): left column Mouse, Rules; board in the middle; right column Pinned modes,
            // Mode, Recent. Each column stacks by measured height, 10px apart.
            // Column width: 380px, narrower on a small viewport (browser zoom) so the board keeps at least 300px.
            const COL_W = 380;
            function columns() {
                const W = desk.clientWidth || window.innerWidth;
                const colW = Math.max(240, Math.min(COL_W, Math.floor((W - 4 * 14 - 300) / 2)));
                return {left: 14, colW: colW, board: 14 + colW + 14, right: W - 14 - colW};
            }
            function defaults() {
                const c = columns();
                const gap = 10;
                const h = function(id) {
                    return cards[id] ? cards[id].card.offsetHeight : 200;
                };
                // The Board card fills the space between the columns, above the prototype switcher pill (about 64px).
                return {
                    mouse: {x: c.left, y: 12, w: c.colW},
                    rules: {x: c.left, y: 12 + h('mouse') + gap, w: c.colW},
                    board: {x: c.board, y: 12, w: c.right - 14 - c.board, h: Math.max(200, desk.clientHeight - 12 - 64)},
                    pins: {x: c.right, y: 12, w: c.colW},
                    mode: {x: c.right, y: 12 + h('pins') + gap, w: c.colW},
                    recent: {x: c.right, y: 12 + h('pins') + h('mode') + 2 * gap, w: c.colW}
                };
            }

            // ---- Pulldown: a button showing the current choice; its list opens below it, one open at a time.
            // Custom, not <select>: Penpa's keydown handler does not exempt <select> (main.js:279-298), and an
            // <option> cannot show a colour swatch.
            let openPd = null;
            function closePd() {
                if (openPd) {
                    // The open pulldown may have been re-rendered away (Save rebuilds the Pinned modes card while the
                    // Presets list is open); a detached one has no card, so clear the flag on every card instead.
                    openPd.classList.remove('is-open');
                    document.querySelectorAll('.proto-l-card.has-open').forEach(function(c) {
                        if (!c.querySelector('.proto-l-picker.is-open')) {
                            c.classList.remove('has-open');
                        }
                    });
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
                if (it.note) {
                    node.classList.add('has-note');
                    node.appendChild(el('span', {class: 'proto-l-pdnote'}, [it.note]));
                }
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
                    if (it.disabled) {
                        row.classList.add('is-disabled');
                    }
                    row.addEventListener('click', function(e) {
                        if (e.target.closest('.proto-l-pdx')) {
                            return;
                        }
                        if (it.disabled) {
                            closePd();
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
                        // Keep the list inside the window: right-column cards open it leftwards.
                        list.style.left = '';
                        list.style.right = '';
                        if (list.getBoundingClientRect().right > window.innerWidth - 8) {
                            list.style.left = 'auto';
                            list.style.right = '0';
                        }
                    }
                });
                return wrap;
            }

            let layout = readJSON(LS_LAYOUT, null) || {};

            /**
             * Place a card for the current viewport (round 4, Chris on browser zoom: "only some cards stayed in, others
             * scrolled out"). A card still in its default place takes the automatic layout for this viewport (the
             * bottom card of a column shrinks, content scrolling, rather than leave the desk). A card the solver moved
             * or resized keeps its distance from the nearer edges of the viewport it was saved in (so zooming out and
             * back in returns the same layout), is shrunk (to its minimum at most) if it is larger than the desk, and
             * is clamped inside it. The saved layout itself is never rewritten here.
             */
            function place(c) {
                const dw = desk.clientWidth;
                const dh = desk.clientHeight;
                const saved = layout[c.id];
                const min = MIN_SIZE[c.id] || [160, 80];
                const d = defaults()[c.id] || {x: 20, y: 20};
                let x, y, w, h;
                const moved = !!saved && saved.x != null;
                if (saved) {
                    w = saved.w || d.w || null;
                    h = saved.h || (c.id === 'mouse' ? mouseDefaultH : d.h) || null;
                    x = moved ? saved.x : d.x;
                    y = moved ? saved.y : d.y;
                } else {
                    x = d.x;
                    y = d.y;
                    w = d.w || null;
                    h = (c.id === 'mouse' ? mouseDefaultH : d.h) || null;
                }
                c.card.style.width = w ? w + 'px' : '';
                c.card.style.height = h ? h + 'px' : '';
                c.card.classList.toggle('is-sized', !!h);
                if (moved && saved.vw) {
                    // Anchor to the nearer edge of the viewport it was saved in, keeping that edge's gap (the right gap
                    // for a right-column card, so it does not slide into the board when the column narrows).
                    const sw = saved.cw || c.card.offsetWidth;
                    const sh = saved.ch || c.card.offsetHeight;
                    if (saved.x + sw / 2 > saved.vw / 2) {
                        x = dw - (saved.vw - saved.x - sw) - c.card.offsetWidth;
                    }
                    if (saved.y + sh / 2 > saved.vh / 2) {
                        y = dh - (saved.vh - saved.y - sh) - c.card.offsetHeight;
                    }
                }
                const shrinkH = function(to) {
                    c.card.style.height = Math.max(min[1], to) + 'px';
                    c.card.classList.add('is-sized');
                };
                if (c.card.offsetWidth > dw - 8) {
                    c.card.style.width = Math.max(min[0], dw - 8) + 'px';
                }
                if (!moved && y + c.card.offsetHeight > dh - 8) {
                    shrinkH(dh - 8 - y);
                }
                if (c.card.offsetHeight > dh - 8) {
                    shrinkH(dh - 8);
                }
                x = Math.max(0, Math.min(x, dw - c.card.offsetWidth));
                y = Math.max(0, Math.min(y, dh - c.card.offsetHeight));
                c.card.style.left = x + 'px';
                c.card.style.top = y + 'px';
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
                // The whole card stays on the desk, the same rule place() applies after a reload or a window resize.
                const x = Math.max(0, Math.min(dw - drag.c.card.offsetWidth, drag.x + e.clientX - drag.sx));
                const y = Math.max(0, Math.min(dh - drag.c.card.offsetHeight, drag.y + e.clientY - drag.sy));
                drag.c.card.style.left = x + 'px';
                drag.c.card.style.top = y + 'px';
            });
            document.addEventListener('mouseup', function() {
                if (!drag) {
                    return;
                }
                drag.c.card.classList.remove('is-dragging');
                layout[drag.c.id] = Object.assign(layout[drag.c.id] || {}, {x: drag.c.card.offsetLeft, y: drag.c.card.offsetTop,
                    vw: desk.clientWidth, vh: desk.clientHeight, cw: drag.c.card.offsetWidth, ch: drag.c.card.offsetHeight});
                writeJSON(LS_LAYOUT, layout);
                drag = null;
            });

            function resetLayout() {
                localStorage.removeItem(LS_LAYOUT);
                layout = {};
                placeAll();
                fitBoard();
                requestAnimationFrame(function() {
                    placeAll(); // again once the board has its default size
                });
            }

            // Board card: the board is moved like any card; zoom buttons change the cell size (never CSS scale).
            const zoomOut = btn('proto-l-mini', '−', function() {
                zoomStep--;
                applyZoom();
            }, 'Smaller board');
            const zoomIn = btn('proto-l-mini', '+', function() {
                zoomStep++;
                applyZoom();
            }, 'Larger board (the card scrolls)');
            const zoomFit = btn('proto-l-mini', 'Fit', function() {
                fitBoard();
            }, 'Fit the board to its card');
            const boardCard = makeCard('board', 'Board', [el('span', {class: 'proto-l-spacer'}), zoomOut, zoomIn, zoomFit]);
            ctx.helpers.adoptBoard(boardCard.body);
            ctx.helpers.hideLegacy();

            const mouseCard = makeCard('mouse', 'Mouse');
            const pinsCard = makeCard('pins', 'Pinned modes');
            // Round 4: the Tool card is called "Mode" (Chris).
            const modeCard = makeCard('mode', 'Mode');
            // Round 4 (Chris: "Recent tools should be its own window i think"): Recent is a desk card of its own.
            const recentCard = makeCard('recent', 'Recent');
            const rulesCard = makeCard('rules', 'Rules');
            rulesCard.body.innerHTML = info.rules || '<em>No rules in this link.</em>';
            placeAll();

            /*
             * The board always fits its card (round 4, Chris approved): Fit runs on load, on every window resize or
             * zoom, and on every Board card resize, taking the largest cell size (12-90 px) whose canvas fits the card's
             * body; always bridge.setCellSize, never CSS scale. − and + step 4px from that fitted size; a larger board
             * scrolls inside the card (the bridge's pointer-offset fix reads the canvas's live page box, so clicks stay
             * right while scrolled). The manual step survives a window resize (keepZoom) and is dropped by Fit or a
             * Board card resize.
             */
            let zoomStep = 0;
            let fittedPx = 0;

            function applyZoom() {
                const px = Math.max(12, Math.min(90, (fittedPx || pu.size) + 4 * zoomStep));
                if (px !== pu.size) {
                    B.setCellSize(px);
                }
            }

            function fitBoard(keepZoom) {
                if (!keepZoom) {
                    zoomStep = 0;
                }
                const r = ctx.canvas.getBoundingClientRect();
                const boxW = boardCard.body.clientWidth - 16;
                const boxH = boardCard.body.clientHeight - 16;
                if (!r.width || !pu.size || boxW < 40 || boxH < 40) {
                    return;
                }
                const px = Math.max(12, Math.min(90, Math.floor(Math.min(boxW / (r.width / pu.size), boxH / (r.height / pu.size)))));
                if (px !== pu.size) {
                    B.setCellSize(px);
                }
                // The canvas is not exactly proportional to the cell size (fixed margins): step down until it fits.
                const shrink = function(n) {
                    const c2 = ctx.canvas.getBoundingClientRect();
                    if (n > 0 && pu.size > 12 && (c2.width > boxW + 0.5 || c2.height > boxH + 0.5)) {
                        B.setCellSize(pu.size - 1);
                        requestAnimationFrame(function() {
                            shrink(n - 1);
                        });
                        return;
                    }
                    fittedPx = pu.size;
                    if (zoomStep) {
                        applyZoom();
                    }
                };
                requestAnimationFrame(function() {
                    shrink(10);
                });
            }

            // ---- Pins -------------------------------------------------------------------------------------------
            /*
             * Chris's ruling (2026-11-13), replacing "a pin is a mode": "we are pinning a sub mode. style can change and
             * be remembered but we are pinning a specific sub mode."
             *   - A pin is {mode, sub, style}: one mode plus one sub-mode (for Shape, Special and Composite the tool from
             *     the list; '' for modes without sub-modes). The same mode can be pinned twice with different sub-modes.
             *   - Landing on a pin (Tab, chip click, preset) goes to its mode and sub-mode with the pin's own style.
             *   - While on a pin, a style change updates that pin's style; nothing else about any pin ever changes.
             *   - Any other change (a pick or a sub-mode in the Tool card, a key, Recent) never changes a pin; a pin
             *     lights up only when the current mode and sub-mode match it exactly.
             *   - Tab from a tool that is on no pin goes to the pin after the last pin used.
             * Stored per puzzle under `proto-L-pins-v2:` (v1 held bare modes).
             */
            const pinKey = LS_PINS + puzzleKey();

            function curPair() {
                const m = B.getMode();
                return {mode: m.mode, sub: m.submode, style: m.style};
            }

            function same(a, b) {
                return a.mode === b.mode && String(a.sub) === String(b.sub);
            }

            function pinIndexOf(pair) {
                for (let i = 0; i < pins.length; i++) {
                    if (same(pins[i], pair)) {
                        return i;
                    }
                }
                return -1;
            }

            /** True if this grid offers the pair (mode available, sub-mode or Composite tool listed). */
            function validPair(pair) {
                if (!available[pair.mode]) {
                    return false;
                }
                if (pair.mode === 'combi') {
                    return !!composites[pair.sub];
                }
                if (pair.mode === 'symbol' || pair.sub === '' || pair.sub == null) {
                    return true;
                }
                const subs = B.listSubmodes(pair.mode).map(function(s) {
                    return String(s.value);
                });
                return !subs.length || subs.indexOf(String(pair.sub)) !== -1;
            }

            /** Styles the tool offers (Composite: the line / edge box some tools show, class_p.js subcombimode). */
            function stylesOf(mode, sub) {
                const box = styleBox(mode, sub);
                return box ? B.listStyles(box) : [];
            }

            /**
             * Set a style as the solver's click would. Composite tools that show a line / edge style use st_line<n> /
             * st_lineE<n> (bridge gap: setStyle builds st_combi<n>). `quiet`: Multicolor without applying the colour to
             * the selection (bridge.setStyle also presses the digit, main.js:1852-1856), used when landing on a pin.
             */
            function setStyleFor(mode, sub, style, quiet) {
                if (mode === 'combi' || (quiet && mode === 'multicolor')) {
                    pu.stylemode_check('st_' + styleBox(mode, sub) + style);
                } else {
                    B.setStyle(style);
                }
            }

            /** Go to a {mode, sub, style}: Penpa's mode_set, then the sub-mode, then the style if the tool has styles. */
            function goTo(pair) {
                if (B.getMode().mode !== pair.mode) {
                    B.setMode(pair.mode);
                }
                if (pair.sub !== '' && pair.sub != null && B.getMode().submode !== String(pair.sub)) {
                    applySub(pair.mode, pair.sub);
                }
                const st = pair.style;
                if (st !== '' && st != null && B.getMode().style !== st && stylesOf(pair.mode, pair.sub).some(function(s) {
                    return s.value === st;
                })) {
                    setStyleFor(pair.mode, pair.sub, st, true);
                }
            }

            /** Pins from the link's Tab set: an entry naming a sub-mode keeps it; a mode-only entry gets the default. */
            function seedPins() {
                const names = PenpaText.modes.EN;
                const mapping = PenpaText.modes.mapping;
                const out = [];
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
                    if (!available[mode]) {
                        return;
                    }
                    const r = remembered(mode);
                    const pair = {mode: mode, sub: sub != null ? sub : r.sub, style: r.style};
                    if (validPair(pair) && !out.some(function(p) {
                        return same(p, pair);
                    })) {
                        out.push(pair);
                    }
                });
                return {pins: out.length ? out : [curPair()], fromTabSet: out.length > 0};
            }

            function clonePins(list) {
                return list.map(function(p) {
                    return {mode: p.mode, sub: String(p.sub), style: p.style, hue: p.hue};
                });
            }

            /**
             * Round 6: every pin owns a colour slot (PIN_COLOR index), kept through reorders and reloads. A pin without
             * one, or sharing one with an earlier pin, takes the lowest slot no other pin holds; past 8 pins slots repeat.
             */
            function fixHues() {
                const n = PIN_COLOR.light.length;
                const used = [];
                pins.forEach(function(p) {
                    if (typeof p.hue === 'number' && p.hue >= 0 && p.hue < n && used.indexOf(p.hue) === -1) {
                        used.push(p.hue);
                    } else {
                        p.hue = -1;
                    }
                });
                pins.forEach(function(p) {
                    if (p.hue === -1) {
                        let h = 0;
                        while (h < n && used.indexOf(h) !== -1) {
                            h++;
                        }
                        p.hue = h < n ? h : used.length % n;
                        used.push(p.hue);
                    }
                });
            }

            /** The slot a tool that is not a pin shows: the lowest one no pin holds, or -1 (neutral) when all are held. */
            function freeHue() {
                for (let h = 0; h < PIN_COLOR.light.length; h++) {
                    if (!pins.some(function(p) {
                        return p.hue === h;
                    })) {
                        return h;
                    }
                }
                return -1;
            }

            function hueColor(h, theme) {
                return h >= 0 ? PIN_COLOR[theme][h] : NEUTRAL_COLOR[theme];
            }

            const seed = seedPins();
            let pins = clonePins(readJSON(pinKey, null) || seed.pins);
            fixHues();
            let onPin = pinIndexOf(curPair());
            let lastPinIdx = onPin;
            let seenStyle = B.getMode().style;

            function savePins() {
                fixHues();
                writeJSON(pinKey, pins);
            }

            function landOnPin(i) {
                onPin = lastPinIdx = i;
                goTo(pins[i]);
                seenStyle = B.getMode().style;
            }

            /** On every bridge change, before rendering: which pin is lit, and the lit pin's style. */
            function trackPin(m) {
                if (hold) {
                    return; // a held Shift/Ctrl sub-mode never changes, unlights or relights a pin (#69)
                }
                const pair = {mode: m.mode, sub: m.submode};
                if (onPin >= 0 && pins[onPin] && same(pins[onPin], pair)) {
                    if (m.style !== seenStyle && stylesOf(m.mode, m.submode).length && pins[onPin].style !== m.style) {
                        pins[onPin].style = m.style;
                        savePins();
                    }
                } else {
                    onPin = pinIndexOf(pair);
                }
                seenStyle = m.style;
                if (onPin >= 0) {
                    lastPinIdx = onPin;
                }
            }

            function pinPair(pair) {
                if (pinIndexOf(pair) === -1) {
                    pins.push({mode: pair.mode, sub: String(pair.sub), style: pair.style});
                    savePins();
                }
                onPin = pinIndexOf(curPair());
                renderAll(true);
            }

            function unpinAt(i) {
                pins.splice(i, 1);
                onPin = pinIndexOf(curPair());
                lastPinIdx = onPin >= 0 ? onPin : Math.min(lastPinIdx >= i ? lastPinIdx - 1 : lastPinIdx, pins.length - 1);
                savePins();
                renderAll(true);
            }

            function cyclePins(dir) {
                if (!pins.length) {
                    return;
                }
                const from = onPin >= 0 ? onPin : lastPinIdx;
                const next = from < 0 ? (dir > 0 ? 0 : pins.length - 1) : (from + dir + pins.length) % pins.length;
                landOnPin(next);
            }

            /** A preset's pins are [mode, sub or null, style or null]; null takes the mode's remembered value. */
            function applyPreset(p) {
                const list = [];
                p.pins.forEach(function(pin) {
                    if (!available[pin[0]]) {
                        return;
                    }
                    const r = remembered(pin[0]);
                    const pair = {mode: pin[0], sub: pin[1] != null ? String(pin[1]) : r.sub, style: pin[2] != null ? pin[2] : r.style};
                    if (validPair(pair) && !list.some(function(q) {
                        return same(q, pair);
                    })) {
                        list.push(pair);
                    }
                });
                if (!list.length) {
                    return;
                }
                pins = list;
                savePins();
                landOnPin(0);
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
                list.push({name: name, pins: pins.map(function(p) {
                    return [p.mode, p.sub, p.style];
                })});
                writeJSON(LS_PRESETS, list);
                presetName.value = '';
                presetName.blur();
                renderPins();
            }

            function pairDetail(p) {
                return [subName(p.mode, p.sub), styleName(p.mode, p.style, p.sub)].filter(Boolean).join(' · ');
            }

            /**
             * Round 6 (Chris): a chip is one line, no bold mode name, no style or setting. A sub-mode that names its tool
             * on its own (a Composite tool, a Special object, a shape) stands alone; a generic one ("normal", "corner")
             * gets its mode first, "Line > Normal"; a mode with no sub-mode is its mode name.
             */
            function chipLabel(p) {
                const sub = subName(p.mode, p.sub);
                const cap = sub ? sub.charAt(0).toUpperCase() + sub.slice(1) : '';
                if (!sub) {
                    return MODE_NAME[p.mode] || p.mode;
                }
                if (p.mode === 'combi' || p.mode === 'special' || p.mode === 'symbol') {
                    return cap;
                }
                return (MODE_NAME[p.mode] || p.mode) + ' > ' + cap;
            }

            let dragPin = -1;
            function renderPins() {
                const b = pinsCard.body;
                b.textContent = '';
                const strip = el('div', {class: 'proto-l-pins'});
                pins.forEach(function(pin, i) {
                    const chip = el('div', {class: 'proto-l-pin' + (i === onPin ? ' is-on' : ''), draggable: 'true',
                        'data-mode': pin.mode, 'data-sub': pin.sub, 'data-hue': String(pin.hue),
                        style: '--proto-l-pc:' + hueColor(pin.hue, 'light') + ';--proto-l-pcd:' + hueColor(pin.hue, 'dark'),
                        title: toolName(pin.mode, pin.sub, pin.style) + '. Click: switch. Drag: reorder.'}, [
                        el('span', {class: 'proto-l-pinnum'}, [String(i + 1)]),
                        el('span', {class: 'proto-l-pinlabel'}, [chipLabel(pin)])
                    ]);
                    chip.appendChild(btn('proto-l-unpin', '×', function() {
                        unpinAt(i);
                    }, 'Unpin'));
                    chip.addEventListener('mousedown', function(e) {
                        if (!e.target.closest('button')) {
                            e.stopPropagation();
                        }
                    });
                    chip.addEventListener('click', function(e) {
                        if (!e.target.closest('button')) {
                            landOnPin(i);
                        }
                    });
                    chip.addEventListener('dragstart', function(e) {
                        dragPin = i;
                        e.dataTransfer.effectAllowed = 'move';
                        e.dataTransfer.setData('text/plain', String(i));
                    });
                    chip.addEventListener('dragover', function(e) {
                        e.preventDefault();
                    });
                    chip.addEventListener('drop', function(e) {
                        e.preventDefault();
                        const from = dragPin >= 0 ? dragPin : +e.dataTransfer.getData('text/plain');
                        dragPin = -1;
                        if (isNaN(from) || from === i) {
                            return;
                        }
                        pins.splice(i, 0, pins.splice(from, 1)[0]);
                        onPin = pinIndexOf(curPair());
                        lastPinIdx = onPin;
                        savePins();
                        renderAll(true);
                    });
                    strip.appendChild(chip);
                });
                b.appendChild(strip);
                b.appendChild(el('div', {class: 'proto-l-note'}, [
                    pins.length > 1 ? 'Tab / Shift+Tab cycle these; each pin comes back with its own sub-mode and style.' :
                        'Pin more modes to Tab between them.',
                    seed.fromTabSet ? '' : ' (This link has no Tab set; seeded with the mode it opened on.)'
                ]));
                // Presets: one pulldown. Built-ins under genre-family headings, each with its pins as a muted line;
                // then the solver's own under "Saved" (with a delete ×); then "save these pins as".
                const contents = function(p) {
                    return p.pins.map(function(x) {
                        const sub = x[1] != null ? String(x[1]) : remembered(x[0]).sub;
                        return x[0] === 'combi' ? subName('combi', sub) : toolName(x[0], sub, '');
                    }).join(' · ');
                };
                const items = [];
                let lastGroup = null;
                BUILTIN_PRESETS.forEach(function(p, i) {
                    if (p.group !== lastGroup) {
                        items.push({header: true, label: p.group});
                        lastGroup = p.group;
                    }
                    // A preset none of whose pins this grid offers (Battleships on the hex sample) is shown dimmed.
                    const usable = p.pins.some(function(x) {
                        return validPair({mode: x[0], sub: x[1] != null ? String(x[1]) : remembered(x[0]).sub});
                    });
                    items.push({value: 'b' + i, label: p.name, note: contents(p) + (usable ? '' : ' (not on this grid)'),
                        disabled: !usable});
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
                    items.push({value: 's' + i, label: p.name, note: contents(p), extra: el('span', {class: 'proto-l-pdextra'}, [del])});
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
                        pinPair(curPair());
                    }, 'Pin the current mode and sub-mode'),
                    btn('', 'Reset', function() {
                        pins = clonePins(seed.pins);
                        onPin = pinIndexOf(curPair());
                        lastPinIdx = onPin;
                        savePins();
                        renderAll(true);
                    }, 'Back to the link\'s own pins')
                ]));
            }

            // ---- Mouse card -------------------------------------------------------------------------------------
            function renderMouse(m, target, forceHeld) {
                const r = mouseRows(m.mode, m.submode, m.style);
                const b = target || mouseCard.body;
                b.textContent = '';
                const headline = el('div', {class: 'proto-l-headline'});
                headline.appendChild(el('span', {class: 'proto-l-hmode'}, [MODE_NAME[m.mode] || m.mode]));
                const sn = subName(m.mode, m.submode);
                if (sn) {
                    headline.appendChild(el('span', {class: 'proto-l-hsep'}, [' · ']));
                    headline.appendChild(el('span', {class: 'proto-l-hsub'}, [sn]));
                }
                const st = styleName(m.mode, m.style, m.submode);
                if (st) {
                    headline.appendChild(el('span', {class: 'proto-l-hsep'}, [' · ']));
                    const sw = el('span', {class: 'proto-l-hstyle'}, [st]);
                    const col = swatchColor(m.mode, m.style, m.submode);
                    if (col) {
                        sw.prepend(el('i', {class: 'proto-l-dot', style: 'background:' + col}));
                    }
                    headline.appendChild(sw);
                }
                if (hold || forceHeld) {
                    headline.appendChild(el('span', {class: 'proto-l-heldtag', title: 'While ' + (hold ? hold.key : 'Shift') +
                        ' is held'}, ['held']));
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
                const pinned = onPin >= 0;
                b.appendChild(el('div', {class: 'proto-l-note'}, [pinned ? 'Pinned: Tab moves on to the next pin.' :
                    'Not pinned: Tab returns to the pins.']));
            }

            /**
             * Round 4 (Chris: "size of mouse window should be fixed not change based on mode"): the Mouse card's default
             * height is the tallest content any picker entry needs, measured once in an off-screen copy of the card's
             * body at the card's width, with the held tag shown. Shorter content sits at the top. A size the solver
             * drags wins; content taller than it scrolls.
             */
            function measureMouse() {
                const probe = el('div', {class: 'proto-l-body proto-l-mouse-probe'});
                probe.style.cssText = 'position:absolute;visibility:hidden;left:0;top:0;width:' + mouseCard.body.clientWidth +
                    'px;box-sizing:border-box;height:auto;';
                mouseCard.card.appendChild(probe);
                let max = 0;
                allEntries.forEach(function(e) {
                    const pair = entryPair(e);
                    [false, true].forEach(function(held) {
                        renderMouse({mode: pair.mode, submode: pair.sub, style: pair.style}, probe, held);
                        max = Math.max(max, probe.offsetHeight);
                    });
                });
                probe.remove();
                mouseDefaultH = max + mouseCard.head.offsetHeight + 4; // + borders
            }

            /**
             * Colour of a colour style, from its legacy label. Non-colour styles get null: a checked legacy label has a
             * grey background of its own, which is not the style's colour.
             */
            function swatchColor(mode, style, sub) {
                const name = styleName(mode, style, sub);
                const colours = Object.values(SURFACE_STYLE).concat(['green', 'black', 'grey', 'red', 'blue', 'dark blue']);
                if (colours.indexOf(name) === -1) {
                    return null;
                }
                const lb = document.getElementById('st_' + styleBox(mode, sub) + style + '_lb');
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
                // Round 4: all five shape lists (Shape, Number, Arrow, Special 1, Special 2: index.html 283-480), since every
                // Shape sub-mode is now chosen in the picker. ms<N> are section labels, ms<N>_<x> groups, ms_<x> shapes.
                document.querySelectorAll('[id^="mode_symbolul"] [id^="ms"]').forEach(function(n) {
                    if (/^ms\d+$/.test(n.id)) {
                        group = '';
                        return;
                    }
                    if (/^ms\d+_/.test(n.id)) {
                        group = n.id.replace(/^ms\d+_/, '');
                        return;
                    }
                    if (n.id.indexOf('ms_') !== 0) {
                        return;
                    }
                    // Shapes the legacy menu hides for this grid type (hex: side triangles, bars, ◢): picking one makes
                    // Penpa throw (class_hex.js draw_tri calls an undefined draw_square), so the picker leaves them out.
                    const li = n.closest('li');
                    if (n.style.display === 'none' || n.closest('.is_hidden') || (li && li.style.display === 'none')) {
                        return;
                    }
                    const name = n.id.slice(3);
                    const size = n.textContent.trim();
                    const inGroup = group && (name === group || name.indexOf(group + '_') === 0);
                    const label = inGroup ? (SHAPE_GROUP[group] || group.replace(/_/g, ' ')) + ' ' + size : size || name;
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
                if (available.symbol) {
                    shapeItems(null).forEach(function(sh) {
                        out.push({group: 'symbols', mode: 'symbol', sub: sh.value, name: sh.label.charAt(0).toUpperCase() +
                            sh.label.slice(1), desc: 'Shape at the cursor; digits pick its variant.', tags: []});
                    });
                }
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
            modeCard.body.appendChild(el('div', {class: 'proto-l-sub'}, ['Mode: ', pickMode]));
            modeCard.body.appendChild(picker);
            modeCard.body.appendChild(toolOpts);

            // ---- Recent: the last tools used, each a {mode, sub, style} like a pin, most recent first, without the
            // current tool or a tool that matches a pin. A button goes to that mode and sub-mode with its last style; its
            // pin icon pins it. Not in the Tab cycle. Kept per puzzle under `proto-L-recent-v2:` (v1 held bare modes).
            const recentKey = LS_RECENT + puzzleKey();
            let recents = clonePins(readJSON(recentKey, []).filter(function(r) {
                return r && typeof r === 'object';
            }));
            let lastPair = curPair();

            /** Called on every render: when the tool changed, the tool just left (with its last style) goes first. */
            function noteRecent(m) {
                if (hold) {
                    return; // a held sub-mode never enters Recent (#69)
                }
                const now = {mode: m.mode, sub: m.submode, style: m.style};
                if (same(now, lastPair)) {
                    lastPair.style = now.style;
                    return;
                }
                const left = lastPair;
                recents = [left].concat(recents.filter(function(r) {
                    return !same(r, left) && !same(r, now);
                })).slice(0, 12);
                lastPair = now;
                writeJSON(recentKey, recents);
            }

            const PIN_ICON = '<svg width="12" height="12" viewBox="0 0 16 16" aria-hidden="true"><path fill="currentColor" ' +
                'd="M10.5 1.5l4 4-1.6.6-2.6 2.6.3 3.5-1.1 1.1-2.9-2.9-3.7 3.7-.7-.7 3.7-3.7-2.9-2.9 1.1-1.1 3.5.3 2.6-2.6z"/></svg>';

            function renderRecent(m) {
                const body = recentCard.body;
                body.textContent = '';
                const cur = {mode: m.mode, sub: m.submode};
                const shown = recents.filter(function(r) {
                    return !same(r, cur) && pinIndexOf(r) === -1 && validPair(r);
                }).slice(0, 5);
                if (!shown.length) {
                    // The card stays, so the layout does not jump.
                    body.appendChild(el('div', {class: 'proto-l-note proto-l-recentempty'}, ['Modes you use appear here']));
                    return;
                }
                const list = el('div', {class: 'proto-l-recentlist'});
                shown.forEach(function(r) {
                    const b = btn('proto-l-recentbtn', '', function(e) {
                        if (e.target.closest('.proto-l-recentpin')) {
                            pinPair(r);
                        } else {
                            goTo(r);
                        }
                    }, toolName(r.mode, r.sub, r.style));
                    b.setAttribute('data-mode', r.mode);
                    b.setAttribute('data-sub', r.sub);
                    b.appendChild(el('span', {class: 'proto-l-pinname'}, [MODE_NAME[r.mode] || r.mode]));
                    b.appendChild(el('span', {class: 'proto-l-pindetail'}, [pairDetail(r)]));
                    const pin = el('span', {class: 'proto-l-recentpin', title: 'Pin ' + toolName(r.mode, r.sub, '')});
                    pin.innerHTML = PIN_ICON;
                    b.appendChild(pin);
                    list.appendChild(b);
                });
                body.appendChild(list);
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
                modeCard.card.classList.add('has-open');
                raise(modeCard);
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
                let room = window.innerHeight - top - toolOpts.offsetHeight - 40;
                if (layout.mode && layout.mode.h) {
                    room = modeCard.card.getBoundingClientRect().bottom - top - toolOpts.offsetHeight - 30;
                    pickList.style.maxHeight = Math.max(80, room) + 'px';
                    return;
                }
                pickList.style.maxHeight = Math.max(160, Math.min(470, room)) + 'px';
            }

            function closePicker() {
                if (!pickOpen) {
                    return;
                }
                pickOpen = false;
                picker.classList.remove('is-open');
                modeCard.card.classList.remove('has-open');
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

            /** A pick never changes any pin; trackPin lights a pin only if the pick matches its mode and sub-mode. */
            function pickEntry(e) {
                if (B.getMode().mode !== e.mode) {
                    B.setMode(e.mode);
                }
                if (e.sub != null) {
                    applySub(e.mode, e.sub);
                }
                // Team lead's call (reversible): a pick that exactly matches a pin counts as landing on it, so it takes
                // the pin's style, as Tab or a chip click does.
                const idx = pinIndexOf(curPair());
                if (idx >= 0) {
                    landOnPin(idx);
                }
                pickInput.blur();
                renderAll(true);
            }

            /** The {mode, sub} a picker entry pins: its own sub-mode, or (Shape, Surface, ...) the mode's current one. */
            function entryPair(e) {
                const cur = B.getMode();
                const sub = e.sub != null ? e.sub : (cur.mode === e.mode ? cur.submode : remembered(e.mode).sub);
                const style = cur.mode === e.mode ? cur.style : remembered(e.mode).style;
                return {mode: e.mode, sub: String(sub), style: style};
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
                        const pair = entryPair(e);
                        const pinIdx = pinIndexOf(pair);
                        const pinned = pinIdx !== -1;
                        const name = el('div', {class: 'proto-l-ename'}, [e.name, el('span', {class: 'proto-l-emode'}, [MODE_NAME[e.mode]])]);
                        e.tags.forEach(function(t) {
                            name.appendChild(el('span', {class: 'proto-l-tag'}, [t]));
                        });
                        const row = el('div', {class: 'proto-l-entry' + (current ? ' is-on' : ''), 'data-mode': e.mode,
                            'data-sub': e.sub == null ? '' : e.sub}, [name, el('div', {class: 'proto-l-edesc'}, [e.desc])]);
                        const pinBtn = btn('proto-l-pinbtn' + (pinned ? ' is-pinned' : ''), pinned ? 'Pinned' : 'Pin', function() {
                            if (pinned) {
                                unpinAt(pinIdx);
                            } else {
                                pinPair(pair);
                            }
                        }, (pinned ? 'Unpin ' : 'Pin ') + toolName(pair.mode, pair.sub, '') + (pinned ? '' : ' (Tab lands on it)'));
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

            function renderTool(m) {
                if (pickOpen) {
                    renderPicker();
                } else {
                    showCurrent();
                }
                toolOpts.textContent = '';
                // Round 4 (Chris: "we should not show a sub-mode picker. that is only in the mode pulldown. After the
                // pulldown all that we should see are style things."): no sub-mode control here; every mode + sub-mode
                // is a picker entry. A tool without styles shows the picker field alone.
                const styles = stylesOf(m.mode, m.submode);
                if (styles.length) {
                    const row = el('div', {class: 'proto-l-styles'});
                    styles.forEach(function(s) {
                        const name = styleName(m.mode, s.value, m.submode) || s.label;
                        const b = btn('proto-l-stylebtn' + (s.value === m.style ? ' is-on' : ''), '', function() {
                            setStyleFor(m.mode, m.submode, s.value, false);
                        }, name);
                        b.setAttribute('data-name', name);
                        b.innerHTML = styleSample(name, swatchColor(m.mode, s.value, m.submode));
                        row.appendChild(b);
                    });
                    toolOpts.appendChild(el('div', {class: 'proto-l-sub'}, [m.mode === 'surface' || m.mode === 'multicolor' ?
                        'Colour' : 'Style']));
                    toolOpts.appendChild(row);
                }
                toolOpts.hidden = !toolOpts.children.length;
                if (pickOpen) {
                    sizePicker();
                }
            }

            /**
             * A 20x20 SVG sample of a style for a 24px button (round 4, Chris: "make the buttons for types more
             * compact"): a plain swatch for colours, a tiny drawing for the rest. Black strokes use currentColor.
             */
            function styleSample(name, color) {
                const svg = function(inner) {
                    return '<svg width="20" height="20" viewBox="0 0 20 20" aria-hidden="true">' + inner + '</svg>';
                };
                const line = function(attrs) {
                    return '<line x1="3" y1="10" x2="17" y2="10" stroke-linecap="round" ' + attrs + '/>';
                };
                const ink = 'stroke="currentColor"';
                if (color) {
                    return svg('<rect x="1" y="1" width="18" height="18" rx="3" fill="' + color + '" stroke="rgba(0,0,0,.3)"/>');
                }
                const t = function(txt, extra, fill) {
                    return svg((extra || '') + '<text x="10" y="14" text-anchor="middle" font-size="10" font-weight="700" ' +
                        'font-family="system-ui,sans-serif" fill="' + (fill || 'currentColor') + '">' + txt + '</text>');
                };
                switch (name) {
                case 'thin': return svg(line(ink + ' stroke-width="1"'));
                case 'thicker': return svg(line(ink + ' stroke-width="4.5"'));
                case 'dotted': return svg(line(ink + ' stroke-width="2.2" stroke-dasharray="0.1 3.6"'));
                case 'fat dots': return svg(line(ink + ' stroke-width="4.5" stroke-dasharray="0.1 6.5"'));
                case 'short': return svg('<line x1="7" y1="10" x2="13" y2="10" ' + ink + ' stroke-width="3" stroke-linecap="round"/>');
                case 'double': return svg('<line x1="3" y1="7" x2="17" y2="7" ' + ink + ' stroke-width="1.5"/>' +
                    '<line x1="3" y1="13" x2="17" y2="13" ' + ink + ' stroke-width="1.5"/>');
                case 'grey dot': return svg('<circle cx="10" cy="10" r="3.5" fill="#999"/>');
                case 'dotted line': return svg(line(ink + ' stroke-width="1.5" stroke-dasharray="2 2.5"'));
                case 'grey line': return svg(line('stroke="#999" stroke-width="2"'));
                case 'grey dots': return svg(line('stroke="#999" stroke-width="3" stroke-dasharray="0.1 4"'));
                case 'solid line': return svg(line(ink + ' stroke-width="2"'));
                case 'white': return t('1', '<rect x="2" y="2" width="16" height="16" rx="3" fill="#555"/>', '#fff');
                case 'white background': return t('1', '<rect x="2" y="2" width="16" height="16" rx="2" fill="#fff" stroke="#999"/>', '#222');
                case 'behind lines': return svg('<circle cx="10" cy="10" r="5" fill="#bbb"/>' + line(ink + ' stroke-width="2"'));
                case 'in front of lines': return svg(line(ink + ' stroke-width="2"') + '<circle cx="10" cy="10" r="5" fill="#bbb"/>');
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

            /*
             * Held Shift / Ctrl in Sudoku (Chris's rulings, ticket #69). Penpa switches to Corner / Centre on the key-down
             * and back on the key-up (main.js:405-426, 883-905), keeping the pre-hold sub-mode in a private variable
             * (main.js:267). L lets that happen but ignores it: while `hold` is set, trackPin and noteRecent do nothing,
             * and the Mouse card tags the tool "held".
             *   - Tab / Shift+Tab during a hold: the hold is dropped first, then L steps from the pre-hold tool.
             *   - Window blur, the page going hidden, or a legacy dialog opening also drop the hold.
             * Dropping a hold dispatches a synthetic key-up of the held key to document, so Penpa's own key-up restores
             * its saved sub-mode. The real key-up and key-repeats that follow are then swallowed before Penpa sees them,
             * or Penpa would restore again (undoing a landed pin) or start a new hold on the next repeat.
             */
            let hold = null; // {key: 'Shift' | 'Control'}
            let swallowKey = null;
            let sendingUp = false;

            function dropHold() {
                if (!hold) {
                    return;
                }
                const key = hold.key;
                sendingUp = true;
                document.dispatchEvent(new KeyboardEvent('keyup', {key: key, code: key === 'Shift' ? 'ShiftLeft' : 'ControlLeft',
                    bubbles: true, cancelable: true}));
                sendingUp = false;
                hold = null;
                swallowKey = key;
                renderAll(true);
            }

            window.addEventListener('keydown', function(e) {
                if (e.key !== 'Shift' && e.key !== 'Control') {
                    return;
                }
                if (swallowKey === e.key) {
                    if (e.repeat) {
                        e.stopImmediatePropagation(); // a key-repeat after a dropped hold must not start a new one
                        return;
                    }
                    swallowKey = null; // a fresh press
                }
                if (!hold && !e.repeat && !typing(e) && B.getMode().mode === 'sudoku' && !e.altKey &&
                    !(e.key === 'Shift' ? e.ctrlKey : e.shiftKey)) {
                    hold = {key: e.key};
                }
            }, true);

            window.addEventListener('keyup', function(e) {
                if (sendingUp || (e.key !== 'Shift' && e.key !== 'Control')) {
                    return;
                }
                if (swallowKey === e.key) {
                    swallowKey = null;
                    e.stopImmediatePropagation(); // Penpa already restored on the synthetic key-up
                }
            }, true);
            // After Penpa's own key-up (document) has restored the sub-mode: the hold is over.
            window.addEventListener('keyup', function(e) {
                if (!sendingUp && hold && e.key === hold.key) {
                    hold = null;
                    renderAll(true);
                }
            });
            window.addEventListener('blur', dropHold);
            document.addEventListener('visibilitychange', function() {
                if (document.hidden) {
                    dropHold();
                }
            });
            new MutationObserver(function() {
                if (hold && legacyDialogOpen()) {
                    dropHold();
                }
            }).observe(document.body, {subtree: true, childList: true, attributes: true, attributeFilter: ['style']});

            // Tab / Shift+Tab (and Enter, Penpa's Tab twin) cycle L's pins, before Penpa's own Tab-set cycle. During a
            // hold, the hold is dropped first, so the step starts from the pre-hold tool.
            window.addEventListener('keydown', function(e) {
                if ((e.key !== 'Tab' && e.key !== 'Enter') || (e.ctrlKey && !hold) || e.altKey || e.metaKey || typing(e) ||
                    legacyDialogOpen()) {
                    return;
                }
                e.preventDefault();
                e.stopImmediatePropagation();
                dropHold();
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

            // ---- Round 5: mode cues and dark mode -----------------------------------------------------------------
            /*
             * Chris asked to see the current mode made clearer four ways, each its own toggle in the top bar's "Mode
             * cues" pulldown (localStorage `proto-L-cues-v1`, all on by default):
             *   frame:  the Board card's border and title strip in the window colour (round 6, below), with a 2px
             *           inner edge in the style's colour when the style is a colour;
             *   title:  the tool's name in the Board title bar, as the Mouse card's headline (held tag included);
             *   flash:  the tool's name over the board on every mode or sub-mode change, from any source; not on a
             *           style-only change, not for a held Shift / Ctrl; pointer-events none.
             * And a Light / Dark toggle (localStorage `proto-L-theme-v1`, light by default). Dark restyles the desk
             * (variant-L.css, html.proto-l-dark) and puts the board in Penpa's own dark theme through
             * UserSettings.color_theme (2 dark, 1 light), whose setter redraws and also writes Penpa's color_theme
             * cookie (accepted in the prototype).
             * Round 6 (Chris): no custom cursor (Penpa's own stays). The window colour is no longer a fixed colour per
             * mode family: each pin owns a colour slot (fixHues), so two pins on one mode still differ, and a tool that
             * is not a pin shows freeHue(), the lowest slot no pin holds (neutral grey once all 8 are held). During a
             * held Shift / Ctrl the colour stays the lit pin's. The flash is a small translucent tag near the top of the
             * board, shown about 350ms.
             */
            const CUE_NAMES = [['frame', 'Board frame in the pin colour'], ['title', 'Tool in the Board title'],
                ['flash', 'Flash on mode change']];
            const savedCues = readJSON(LS_CUES, {});
            let cues = {frame: savedCues.frame !== false, title: savedCues.title !== false, flash: savedCues.flash !== false};
            let dark = readJSON(LS_THEME, 'light') === 'dark';

            const boardTool = el('span', {class: 'proto-l-boardtool'});
            boardCard.head.insertBefore(boardTool, boardCard.head.querySelector('.proto-l-spacer'));
            const flashEl = el('div', {class: 'proto-l-flash', 'aria-hidden': 'true'});
            boardCard.card.appendChild(flashEl);
            let flashKey = null;
            let flashTimer = null;
            let flashes = 0;
            let cueHue = -1;

            /** The window colour slot for the current tool: the lit pin's, else the first slot no pin holds. */
            function currentHue() {
                if (hold) {
                    return cueHue; // a held sub-mode keeps the lit pin's colour, as it keeps the pin lit
                }
                return onPin >= 0 && pins[onPin] ? pins[onPin].hue : freeHue();
            }

            function renderCues(m) {
                cueHue = currentHue();
                const winColor = hueColor(cueHue, dark ? 'dark' : 'light');
                const styleColor = swatchColor(m.mode, m.style, m.submode);
                document.documentElement.classList.toggle('proto-l-cue-frame', cues.frame);
                boardCard.card.setAttribute('data-hue', String(cueHue));
                if (cues.frame) {
                    boardCard.card.style.setProperty('--proto-l-fam', winColor);
                    // A 3px gap in the card's own colour, then the 2px style edge, so it reads even when the hues are close.
                    boardCard.body.style.boxShadow = styleColor ? 'inset 0 0 0 3px var(--proto-l-cardbg), inset 0 0 0 5px ' + styleColor : '';
                } else {
                    boardCard.card.style.removeProperty('--proto-l-fam');
                    boardCard.body.style.boxShadow = '';
                }
                boardTool.textContent = '';
                if (cues.title) {
                    boardTool.appendChild(document.createTextNode(' · ' + toolName(m.mode, m.submode, m.style)));
                    if (hold) {
                        boardTool.appendChild(el('span', {class: 'proto-l-heldtag'}, ['held']));
                    }
                }
                // Flash: only when the mode or sub-mode changed, never while a Shift / Ctrl hold is on (the held
                // sub-mode and the return from it are both ignored, as pins and Recent ignore them).
                const key = m.mode + '|' + m.submode;
                if (!hold) {
                    if (flashKey !== null && key !== flashKey && cues.flash) {
                        flash(toolName(m.mode, m.submode, ''), winColor);
                    }
                    flashKey = key;
                }
            }

            function flash(text, color) {
                flashes++;
                flashEl.textContent = '';
                flashEl.appendChild(el('i', {class: 'proto-l-flashdot', style: 'background:' + color}));
                flashEl.appendChild(document.createTextNode(text));
                flashEl.classList.remove('is-fading');
                flashEl.classList.add('is-on');
                clearTimeout(flashTimer);
                flashTimer = setTimeout(function() {
                    flashEl.classList.add('is-fading');
                    flashEl.classList.remove('is-on');
                }, 350);
            }

            // Top bar: the "Mode cues" pulldown and the Light / Dark toggle, before Reset layout.
            const resetBtn = bar.querySelector('.proto-l-reset');
            const cuesPanel = el('div', {class: 'proto-l-cuespanel'});
            CUE_NAMES.forEach(function(c) {
                const box = el('input', {type: 'checkbox', 'data-cue': c[0]});
                box.checked = cues[c[0]];
                box.addEventListener('change', function() {
                    cues[c[0]] = box.checked;
                    writeJSON(LS_CUES, cues);
                    renderAll(true);
                });
                cuesPanel.appendChild(el('label', {class: 'proto-l-cuerow'}, [box, ' ' + c[1]]));
            });
            const cuesWrap = el('div', {class: 'proto-l-cues'}, [
                btn('proto-l-cuesbtn', 'Mode cues ▾', function() {
                    cuesWrap.classList.toggle('is-open');
                }, 'Choose how the current mode is shown'),
                cuesPanel
            ]);
            document.addEventListener('mousedown', function(e) {
                if (!cuesWrap.contains(e.target)) {
                    cuesWrap.classList.remove('is-open');
                }
            }, true);
            const themeBtn = btn('proto-l-themebtn', '', function() {
                applyTheme(!dark);
            }, 'Light or dark desk and board');
            bar.insertBefore(cuesWrap, resetBtn);
            bar.insertBefore(themeBtn, resetBtn);

            function applyTheme(on) {
                dark = on;
                writeJSON(LS_THEME, dark ? 'dark' : 'light');
                document.documentElement.classList.toggle('proto-l-dark', dark);
                themeBtn.textContent = dark ? 'Light' : 'Dark';
                UserSettings.color_theme = dark ? THEME_DARK : THEME_LIGHT; // setter redraws the board
                renderAll(true);
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
                noteRecent(m);
                renderMouse(m);
                renderPins();
                renderTool(m);
                renderRecent(m);
                renderCues(m);
                reflow();
            }

            /**
             * Round 3: cards size to their content. While the solver has moved neither of two stacked cards, the lower
             * one follows the upper (Tool under Mouse; Recent under Pins; Rules under Recent).
             */
            function reflow() {
                // Columns: Mouse > Rules on the left; Pinned modes > Mode > Recent on the right. Every card not
                // dragged by the solver sits under the one above it, whatever their sizes (round 5 ruling).
                ['rules', 'mode', 'recent'].forEach(function(id) {
                    if (!(layout[id] && layout[id].x != null)) {
                        place(cards[id]);
                    }
                });
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
            // Window resize, which browser zoom fires too: re-place every card and refit the board, debounced.
            let resizeTimer = null;
            window.addEventListener('resize', function() {
                clearTimeout(resizeTimer);
                resizeTimer = setTimeout(function() {
                    placeAll();
                    fitBoard(true);
                }, 100);
            });
            requestAnimationFrame(function() {
                fitBoard();
                requestAnimationFrame(function() {
                    requestAnimationFrame(fitBoard);
                });
            });
            // Expose for the prototype's own checks (not an API).
            window.ProtoL = {pins: function() { // "mode:sub" keys
                return pins.map(function(p) {
                    return p.mode + ":" + p.sub;
                });
            }, setPins: function(keys) { // test hook: apply a pin set as a preset would, e.g. ["line:1", "line:4"]
                applyPreset({pins: keys.map(function(k) {
                    const i = k.indexOf(":");
                    return [k.slice(0, i), k.slice(i + 1) === "" ? null : k.slice(i + 1)];
                })});
            }, pinStyles: function() {
                return pins.map(function(p) {
                    return p.style;
                });
            }, flashes: function() { // round 5: how many tool-name flashes have fired
                return flashes;
            }, cards: cards, resetLayout: resetLayout};
            // Round 5: the saved theme, applied before the first render (and Penpa's board put to match it).
            document.documentElement.classList.toggle('proto-l-dark', dark);
            themeBtn.textContent = dark ? 'Light' : 'Dark';
            UserSettings.color_theme = dark ? THEME_DARK : THEME_LIGHT;
            renderAll(true);
            measureMouse();
            placeAll(); // again, now that cards have content: default columns stack by measured height
            render(B.getState());
        }
    };
})();
