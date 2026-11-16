// What each tool is for, in words: the group the Mode card files it under, its picker name and description, and what the
// mouse does with it. Read from the prototype's variant L (`a023d8a`), whose rows were checked against Penpa's mouse handlers
// on 2026-11-13. Plain data and text, so it needs no `engine`. A tool the table does not know falls back to the engine's name.
(function () {
    'use strict';

    // The dash a Mouse row shows for nothing.
    const NOTHING = '—';

    const GROUPS = [
        ['shade', 'Shading and colour'],
        ['lines', 'Lines through cells'],
        ['edges', 'Edges and walls'],
        ['numbers', 'Numbers and letters'],
        ['symbols', 'Symbols and marks'],
        ['objects', 'Objects and cages'],
        ['move', 'Moving things']
    ];

    // 'mode/sub-mode' (a mode with none: 'mode/') -> [group, picker name, description].
    const ENTRIES = {
        'surface/': ['shade', 'Shade cells', 'Click paints the chosen colour, right the 2nd colour; drag paints many.'],
        'multicolor/': ['shade', 'Colour selected cells', 'Select cells, then type a digit or pick a colour.'],
        'line/1': ['lines', 'Line', 'Drag through cell centres.'],
        'line/2': ['lines', 'Diagonal line', 'Drag through centres, diagonals allowed.'],
        'line/3': ['lines', 'Free line', 'Drag point to point, any angle.'],
        'line/5': ['lines', 'Midpoint line', 'Drag through edge midpoints.'],
        'line/4': ['lines', 'Line helper ×', 'Click the edge between two cells: ×.'],
        'lineE/1': ['edges', 'Edge line', 'Drag along the grid lines.'],
        'lineE/2': ['edges', 'Diagonal edge line', 'Along grid lines and cell diagonals.'],
        'lineE/3': ['edges', 'Free edge line', 'Corner to corner, any angle.'],
        'lineE/6': ['edges', 'Midpoint edge line', 'Through midpoints.'],
        'lineE/4': ['edges', 'Edge helper ×', 'Click a grid line: ×.'],
        'lineE/5': ['edges', 'Erase grid lines', 'Drag to erase grid lines.'],
        'wall/': ['edges', 'Wall', 'Drag a wall segment.'],
        'number/1': ['numbers', 'Number', 'Cursor on a cell, then type.'],
        'number/10': ['numbers', 'Large number', 'Type a large number.'],
        'number/6': ['numbers', 'Medium number', 'Type a medium number.'],
        'number/5': ['numbers', 'Small number', 'Type a small number.'],
        'number/7': ['numbers', 'Candidates', 'Type candidate digits into a cell.'],
        'number/3': ['numbers', 'Quarter numbers', 'A number in a quarter of the cell (1/4).'],
        'number/9': ['numbers', 'Side numbers', 'A number on a side of the cell.'],
        'number/8': ['numbers', 'Long number', 'A long number across the cell.'],
        'sudoku/1': ['numbers', 'Digits', 'Select cells, type a digit. Shift: corner, Ctrl: centre.'],
        'sudoku/2': ['numbers', 'Corner marks', 'Pencil marks in the corners.'],
        'sudoku/3': ['numbers', 'Centre marks', 'Pencil marks in the centre.'],
        'special/thermo': ['objects', 'Thermometer', 'Drag a thermometer through cells.'],
        'special/nobulbthermo': ['objects', 'Thermometer, no bulb', 'Drag a bulbless thermometer.'],
        'special/arrows': ['objects', 'Arrow with circle', 'Drag an arrow from a circled cell.'],
        'special/direction': ['objects', 'Arrow', 'Drag an arrow.'],
        'special/squareframe': ['objects', 'Rectangle frame', 'Drag a rectangle frame.'],
        'special/polygon': ['objects', 'Polygon', 'Drag a polygon outline.'],
        'cage/1': ['objects', 'Cage', 'Drag a cage around cells.'],
        'cage/2': ['objects', 'Free cage lines', 'Drag cage lines along corners.'],
        'move/1': ['move', 'Move anything', 'Drag a number or shape elsewhere.'],
        'move/2': ['move', 'Move numbers', 'Drag a number elsewhere.'],
        'move/3': ['move', 'Move shapes', 'Drag a shape elsewhere.'],
        'combi/blpo': ['shade', 'Shade + dot', 'Left shades a cell, right puts a dot (unshaded).'],
        'combi/shaka': ['shade', 'Corner triangles + dot', 'Click places a half-cell triangle; right a dot.'],
        'combi/linex': ['lines', 'Loop + edge ×', 'Drag a loop through cell centres; right on an edge: ×.'],
        'combi/lineox': ['lines', 'Loop + cell ○ ×', 'Drag a loop; click a cell: ○, again ×.'],
        'combi/linedir': ['lines', 'Line + direction marks', 'Drag a line; marks its direction.'],
        'combi/yajilin': ['lines', 'Shade + loop', 'Click shades a cell, drag draws a loop; right: dot or edge ×.'],
        'combi/hashi': ['lines', 'Bridges', 'Drag between cells: a bridge, again: double.'],
        'combi/rassisillai': ['lines', 'Line + cell marks', 'Drag a line through cells; clicks mark cells.'],
        'combi/edgex': ['edges', 'Edges + ×', 'Drag along grid lines; right on an edge: ×.'],
        'combi/edgexoi': ['edges', 'Edges + inside / outside', 'Drag along grid lines; click a cell: inside / outside colour.'],
        'combi/edgesub': ['edges', 'Edges + helper line', 'Drag along grid lines; a second helper line.'],
        'combi/numfl': ['numbers', 'Numbers by flick', 'Drag from a cell in a direction to enter a number.'],
        'combi/alfl': ['numbers', 'Letters by flick', 'Drag from a cell in a direction to enter a letter.'],
        'combi/blwh': ['symbols', 'Black + white circles', 'Left: white ○, again black ●; right: black ●.'],
        'combi/star': ['symbols', 'Stars + ×', 'Left: star; right: ×; right on a corner: dot.'],
        'combi/akari': ['symbols', 'Bulbs + dots', 'Left: bulb; right: dot (no bulb); right on an edge: ×.'],
        'combi/battleship': ['symbols', 'Ship pieces + water', 'Left cycles ship pieces; drag points a ship end; right: water.'],
        'combi/tents': ['symbols', 'Tents + ×', 'Left: tent; right: ×; drag links a tent to its tree.'],
        'combi/mines': ['symbols', 'Mines + ×', 'Left: mine; right: ×.'],
        'combi/doublemines': ['symbols', 'One or two mines + ×', 'Left: 1 mine, again 2; right: ×.'],
        'combi/magnets': ['symbols', 'Magnet poles + −', 'Places + and − poles.'],
        'combi/arrowS': ['symbols', 'Arrows in cells', 'Places an arrow in a cell.']
    };

    const key = (tool) => `${tool.mode}/${tool.submode ?? ''}`;

    // The picker's entry for a tool: where it is filed, what it is called and what it does.
    function describeTool(tool) {
        const known = ENTRIES[key(tool)];
        if (known) {
            return { group: known[0], name: known[1], description: known[2] };
        }
        if (tool.mode === 'symbol') {
            const name = tool.submodeName.charAt(0).toUpperCase() + tool.submodeName.slice(1);
            return { group: 'symbols', name, description: 'Shape at the cursor; digits pick its variant.' };
        }
        return { group: 'symbols', name: tool.name, description: '' };
    }

    const COMPOSITE_ROWS = {
        blpo: ['shade (again: dot, again: clear)', 'dot = unshaded (again: shade)', 'shade many', [['Right drag', 'dot many']]],
        blwh: ['white ○ (again: black ●, again: clear)', 'black ● (again: white ○)', NOTHING, [['Right drag', 'black ● many']]],
        linex: [NOTHING, '× on the edge', 'loop through cell centres (again: erase)', []],
        lineox: ['○ in the cell (again: ×, again: clear)', '× in the cell (again: ○)', 'loop through cell centres', []],
        edgex: [NOTHING, '× on the edge', 'line along grid lines (again: erase)', []],
        edgexoi: ['cell: inside, yellow (again: green)', 'edge: ×; cell: outside, green', 'line along grid lines', []],
        yajilin: ['shade the cell (again: clear)', 'cell: dot; edge: ×', 'loop through cell centres', [['Right drag', 'dot many']]],
        hashi: [NOTHING, NOTHING, 'bridge (again: double)', []],
        star: ['star (again: clear)', 'cell: × ; corner: green dot', NOTHING, [['Right drag', '× many']]],
        tents: ['tent', '×', 'link a tent to its tree', []],
        mines: ['mine', '×', NOTHING, [['Right drag', '× many']]],
        akari: ['bulb (again: clear)', 'cell: dot = no bulb; edge: ×', 'dotted helper line', [['Right drag', 'dot many']]],
        battleship: ['ship cell ■ (again: ●, ·, clear)', 'water (again: clear)', 'ship end, pointing the way you drag',
            [['Right drag', 'water many']]],
        doublemines: ['1 mine (again: 2)', '×', NOTHING, [['Right drag', '× many']]]
    };

    function compositeRows(submode) {
        const row = COMPOSITE_ROWS[submode];
        return row
            ? { left: row[0], right: row[1], drag: row[2], more: row[3] }
            : { left: 'the tool\'s main mark', right: 'its helper mark', drag: NOTHING, more: [] };
    }

    // What Left click, Right click and Drag do with the tool, plus extra rows as [gesture, effect]. `styleName` is the
    // style's display name or ''.
    function mouseRows(tool, styleName) {
        const s = styleName;
        const sub = tool.submode;
        let rows = { left: NOTHING, right: NOTHING, drag: NOTHING, more: [] };
        switch (tool.mode) {
        case 'surface':
            rows = { left: `paint ${s} (again: erase)`, right: 'paint the 2nd colour', drag: `paint ${s} on many cells`,
                more: [['Alt + drag', 'paint a rectangle'], ['Digit', 'pick a colour']] };
            break;
        case 'multicolor':
            rows = { left: 'select a cell', right: 'select a cell', drag: 'select many cells',
                more: [['Digit', 'colour the selection'], ['Colour chip', `${s} now`]] };
            break;
        case 'line':
            if (sub === '4') {
                rows.left = '× on the edge between two cells (again: clear)';
            } else {
                rows.drag = `${s} line ${{ 1: 'through cell centres', 2: 'through centres, diagonals too', 3: 'freely, point to point',
                    5: 'through edge midpoints' }[sub]} (over a line: erase)`;
            }
            break;
        case 'lineE':
            if (sub === '4') {
                rows.left = '× on a grid line (again: clear)';
            } else if (sub === '5') {
                rows.drag = 'erase the grid lines it crosses';
            } else {
                rows.drag = `${s} line ${{ 1: 'along grid lines', 2: 'along grid lines and diagonals', 3: 'freely, corner to corner',
                    6: 'through midpoints' }[sub]} (over a line: erase)`;
            }
            break;
        case 'wall':
            rows.drag = `${s} wall (again: erase)`;
            break;
        case 'number': {
            const what = { 1: 'a number', 10: 'a large number', 6: 'a medium number', 5: 'a small number', 7: 'candidates',
                3: 'a number in a quarter', 9: 'a number on a side', 8: 'a long number' }[sub] || 'a number';
            const edge = sub === '3' || sub === '9';
            rows = { left: `${edge ? 'cursor on a quarter / side of the cell' : 'cursor on the cell'}; type ${what} in ${s}`,
                right: 'cursor on the cell', drag: edge ? NOTHING : 'select many cells', more: [['Alt + drag', 'select a rectangle']] };
            break;
        }
        case 'sudoku':
            rows = { left: `select a cell; type ${{ 1: 'a digit', 2: 'corner marks', 3: 'centre marks' }[sub]} in ${s}`,
                right: 'select a cell', drag: 'select many cells',
                more: [['Ctrl + click', 'add to the selection'], ['Double', 'select every cell like it'],
                    ['Shift / Ctrl held', 'corner / centre while held']] };
            break;
        case 'symbol':
            rows = { left: `cursor + ${tool.submodeName} ${s} (again: next variant)`, right: 'move the cursor', drag: NOTHING,
                more: [['Digit', 'variant n at the cursor']] };
            break;
        case 'special':
            rows.drag = `draw a ${tool.submodeName} through the cells`;
            break;
        case 'cage':
            rows.drag = sub === '2' ? `${s} cage line along corners` : `${s} cage around the cells`;
            break;
        case 'move':
            rows.drag = `move ${{ 1: 'any item', 2: 'a number', 3: 'a shape' }[sub] || 'an item'}`;
            break;
        case 'combi':
            rows = compositeRows(sub);
            break;
        }
        return rows;
    }

    // One tool's identity, for a lookup: its mode and sub-mode.
    const toolKey = (tool) => `${tool.mode}/${tool.submode ?? ''}`;

    // A sub-mode that names its tool on its own stands alone in a chip; a generic one ("Normal") gets its mode first.
    const SELF_NAMING_MODES = ['combi', 'special', 'symbol'];

    const capitalised = (text) => text.charAt(0).toUpperCase() + text.slice(1);

    // The one-line name a pin chip and a Recent chip give a tool of `listTools()`.
    function chipLabel(tool) {
        if (!tool.submodeName) {
            return tool.modeName;
        }
        return SELF_NAMING_MODES.includes(tool.mode) ? tool.submodeName : `${tool.modeName} > ${capitalised(tool.submodeName)}`;
    }

    window.toolGuide = { GROUPS, NOTHING, describeTool, mouseRows, toolKey, chipLabel };
})();
