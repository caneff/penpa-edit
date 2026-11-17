// What each tool is for, in words: the group the Mode card files it under, its picker name and description, and what the
// mouse does with it. The Mouse rows are `research/mouse-card-wording-2026-11.md`, each checked against the board by performing its gesture. Plain data and text, so it needs no `engine`. A tool the table does not know falls back to the engine's name.
(function () {
    'use strict';

    // The dash a Mouse row shows for nothing.
    const NOTHING = '—';

    // The tool groups the Mode card files tools under, by what they put on the board (GLOSSARY.md).
    const TOOL_GROUPS = [
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
        'number/1': ['numbers', 'Number', 'Select cells, then type.'],
        'number/10': ['numbers', 'Large number', 'Type a large number.'],
        'number/6': ['numbers', 'Medium number', 'Type a medium number.'],
        'number/5': ['numbers', 'Small number', 'Type a small number.'],
        'number/7': ['numbers', 'Candidates', 'Type candidate digits into a cell.'],
        'number/3': ['numbers', 'Quarter numbers', 'A number in a quarter of the cell (1/4).'],
        'number/9': ['numbers', 'Side numbers', 'A number on a side of the cell.'],
        'number/8': ['numbers', 'Long number', 'A long number across the cell.'],
        'sudoku/1': ['numbers', 'Digits', 'Select cells, type a digit. Shift: corner mark.'],
        'sudoku/2': ['numbers', 'Corner marks', 'Pencil marks in the corners.'],
        'sudoku/3': ['numbers', 'Centre marks', 'Pencil marks in the centre.'],
        'special/thermo': ['objects', 'Thermometer', 'Drag a thermometer through cells.'],
        'special/nobulbthermo': ['objects', 'Thermometer, no bulb', 'Drag a bulbless thermometer.'],
        'special/arrows': ['objects', 'Arrow with circle', 'Drag an arrow from a circled cell.'],
        'special/direction': ['objects', 'Arrow', 'Drag an arrow.'],
        'special/squareframe': ['objects', 'Rectangle frame', 'Drag a rectangle frame.'],
        'special/polygon': ['objects', 'Polygon', 'Click corner by corner to draw a polygon.'],
        'cage/1': ['objects', 'Cage', 'Drag a cage around cells.'],
        'cage/2': ['objects', 'Free cage lines', 'Drag cage lines along corners.'],
        'move/1': ['move', 'Move anything', 'Drag a number or shape elsewhere.'],
        'move/2': ['move', 'Move numbers', 'Drag a number elsewhere.'],
        'move/3': ['move', 'Move shapes', 'Drag a shape elsewhere.']
    };

    // Composite sub-mode -> [group, description]. Its picker name is the engine's name for the sub-mode.
    const COMPOSITE_ENTRIES = {
        blpo: ['shade', 'Left shades a cell, right puts a dot (unshaded).'],
        shaka: ['shade', 'Click places a dot; drag toward a corner, a half-cell triangle.'],
        linex: ['lines', 'Drag a line through cell centres; right on an edge: ×.'],
        lineox: ['lines', 'Drag a line; click a cell: ○, again ×.'],
        linedir: ['lines', 'Drag a line; marks its direction.'],
        yajilin: ['lines', 'Click shades a cell, drag draws a line; right: dot or edge ×.'],
        hashi: ['lines', 'Drag between cells: a bridge, again: double.'],
        rassisillai: ['lines', 'Drag a line through cells; clicks mark cells.'],
        edgex: ['edges', 'Drag along grid lines; right on an edge: ×.'],
        edgexoi: ['edges', 'Drag along grid lines; click a cell: inside / outside colour.'],
        edgesub: ['edges', 'Drag along grid lines; a second helper line.'],
        numfl: ['numbers', 'Drag from a cell in a direction to enter a number.'],
        alfl: ['numbers', 'Drag from a cell in a direction to enter a letter.'],
        blwh: ['symbols', 'Left: white ○, again black ●; right: black ●.'],
        star: ['symbols', 'Left: star; right: ×; right on a corner: dot.'],
        akari: ['symbols', 'Left: bulb; right: dot (no bulb); right on an edge: ×.'],
        battleship: ['symbols', 'Left cycles ship pieces; drag points a ship end; right: water.'],
        tents: ['symbols', 'Left: tent; right: ×; drag links a tent to its tree.'],
        mines: ['symbols', 'Left: mine; right: ×.'],
        doublemines: ['symbols', 'Left: 1 mine, again 2; right: ×.'],
        magnets: ['symbols', 'Places + and − poles.'],
        arrowS: ['symbols', 'Places an arrow in a cell.']
    };

    // One tool's identity, for a lookup: its mode and sub-mode.
    const toolKey = (tool) => `${tool.mode}/${tool.submode ?? ''}`;

    // The picker's entry for a tool: where it is filed, what it is called and what it does.
    function describeTool(tool) {
        const known = ENTRIES[toolKey(tool)];
        if (known) {
            return { group: known[0], name: known[1], description: known[2] };
        }
        const composite = tool.mode === 'combi' && COMPOSITE_ENTRIES[tool.submode];
        if (composite) {
            return { group: composite[0], name: tool.submodeName, description: composite[1] };
        }
        if (tool.mode === 'symbol') {
            const name = capitalised(submodeLabel(tool));
            const description = ON_OFF_SHAPES.includes(tool.submode) ? 'Shape at the cursor; digits switch its parts on and off.'
                : 'Shape at the cursor; digits pick its variant.';
            return { group: 'symbols', name, description };
        }
        return { group: 'symbols', name: tool.name, description: '' };
    }

    // ---- Where the tree files each tool -----------------------------------------------------------------------------

    // Symbols and marks has a level of subgroups, and a symbol that comes in sizes or colours is one entry whose sizes or
    // colours sit under it (Chris, 2026-11-16). A tool listed under no subgroup goes to the last one.
    const SIZE_NAMES = { LL: 'XL', L: 'L', M: 'M', S: 'S', SS: 'XS' };
    const sizes = (name, prefix, suffixes) => [name, suffixes.map((suffix) => [`symbol/${prefix}_${suffix}`, SIZE_NAMES[suffix]])];
    const blackGreyWhite = (name, prefix) => [name, [['B', 'Black'], ['G', 'Grey'], ['W', 'White']].map(([suffix, colour]) => [`symbol/${prefix}_${suffix}`, colour])];
    const alone = (...keys) => keys.map((key) => [null, [[key, null]]]);
    const symbols = (...ids) => alone(...ids.map((id) => `symbol/${id}`));
    const combis = (...ids) => alone(...ids.map((id) => `combi/${id}`));
    const SYMBOL_SUBGROUPS = [
        ['Solving marks', combis('blwh', 'battleship', 'star', 'tents', 'magnets', 'mines', 'doublemines', 'akari')],
        ['Shapes', [
            sizes('Circle', 'circle', ['L', 'M', 'S', 'SS']), sizes('Square', 'square', ['LL', 'L', 'M', 'S', 'SS']),
            sizes('Diamond', 'diamond', ['L', 'M', 'S', 'SS']), sizes('Triangle up', 'triup', ['L', 'M', 'S', 'SS']),
            sizes('Triangle down', 'tridown', ['L', 'M', 'S', 'SS']), sizes('Triangle left', 'trileft', ['L', 'M', 'S', 'SS']),
            sizes('Triangle right', 'triright', ['L', 'M', 'S', 'SS']), sizes('Hexagon, point up', 'hexpoint', ['LL', 'L', 'M', 'S', 'SS']),
            sizes('Hexagon, flat', 'hexflat', ['LL', 'L', 'M', 'S', 'SS'])
        ]],
        ['Arrows', [
            blackGreyWhite('Arrow', 'arrow_B'), blackGreyWhite('Arrow, notched', 'arrow_N'), blackGreyWhite('Arrow, triangle', 'arrow_tri'),
            ['Edge arrows', [['symbol/arrow_fouredge_B', 'Black'], ['symbol/arrow_fouredge_G', 'Grey'], ['symbol/arrow_fouredge_E', 'Green']]],
            ...symbols('arrow_GP', 'arrow_GP_C', 'arrow_Short', 'arrow_S', 'arrow_cross', 'arrow_eight', 'arrow_fourtip'), ...combis('arrowS')
        ]],
        ['Signs and small marks', [
            ['○ △ □ ×', [['symbol/ox_B', 'Black'], ['symbol/ox_E', 'Green'], ['symbol/ox_G', 'Grey']]],
            ...symbols('cross', 'line', 'frameline'),
            blackGreyWhite('Bars', 'bars'),
            ...symbols('tri'),
            ['Maths signs', [['symbol/math', 'Black'], ['symbol/math_G', 'Green']]],
            ...symbols('inequality'),
            ['Segment digit', [['symbol/degital_B', 'Black'], ['symbol/degital_E', 'Green'], ['symbol/degital_G', 'Grey'], ['symbol/degital_f', 'Outline']]]
        ]],
        ['Genre symbols', [
            ['Ship', [['symbol/battleship_B', 'Black'], ['symbol/battleship_G', 'Grey'], ['symbol/battleship_W', 'White'],
                ['symbol/battleship_B+', 'Curvy, black'], ['symbol/battleship_G+', 'Curvy, grey'], ['symbol/battleship_W+', 'Curvy, white']]],
            ...symbols('kakuro', 'tents', 'star', 'compass', 'sun_moon', 'dice', 'pills', 'polyomino', 'polyhex', 'firefly', 'pencils', 'slovak',
                'arc', 'darts', 'spans', 'neighbors', 'angleloop', 'sudokuetc', 'sudokumore')
        ]]
    ];

    // 'mode/sub-mode' -> where the tree puts a symbol: [subgroup, symbol entry (null: the tool stands alone), variant, rank].
    const SYMBOL_PLACES = new Map();
    SYMBOL_SUBGROUPS.forEach(([subgroup, entries]) => entries.forEach(([entry, variants]) => variants.forEach(([key, variant]) => {
        SYMBOL_PLACES.set(key, [subgroup, entry, variant, SYMBOL_PLACES.size]);
    })));
    const LAST_SUBGROUP = SYMBOL_SUBGROUPS[SYMBOL_SUBGROUPS.length - 1][0];

    // The tree's place for a tool: its group, the branches between the group and the tool (a mode, or a subgroup and a
    // symbol), its own label, and a rank that orders tools within their group. Modes that name each tool on their own
    // stand alone one level under their group, and so does a mode with no sub-modes.
    function placeTool(tool) {
        const { group, name, description } = describeTool(tool);
        const place = SYMBOL_PLACES.get(toolKey(tool));
        if (place) {
            const [subgroup, entry, variant, rank] = place;
            return { group, trail: [subgroup, entry].filter(Boolean), label: variant ?? name, name, description, rank };
        }
        if (group === 'symbols') {
            return { group, trail: [LAST_SUBGROUP], label: name, name, description, rank: SYMBOL_PLACES.size };
        }
        if (SELF_NAMING_MODES.includes(tool.mode) || !tool.submodeName) {
            return { group, trail: [], label: name, name, description, rank: 0 };
        }
        return { group, trail: [tool.modeName], label: capitalised(tool.submodeName), name, description, rank: 0 };
    }

    // A search first matches each typed word as typed, case aside. Only when that finds nothing does it match loosely, ignoring
    // spaces and punctuation, so "linex" finds Penpa+'s "Line x" and "Helper (x)" is not widened to every "x". Each field is
    // squashed alone and the fields are joined by a space, which a squashed word never holds, so a loose word cannot match
    // across two fields. A word of only symbols ("×") squashes to nothing and stays as typed.
    const squash = (text) => text.toLowerCase().replace(/[^\p{L}\p{N}]/gu, '');
    const looseText = (fields) => fields.map(squash).join(' ');
    const searchWords = (text) => text.trim().toLowerCase().split(/\s+/).filter(Boolean);
    const looseWords = (text) => searchWords(text).map((word) => squash(word) || word);
    const matchesSearch = (haystack, words) => words.every((word) => haystack.includes(word));

    // Left click, Right click, Drag and extra rows as [gesture, effect], for each tool. The words are
    // `research/mouse-card-wording-2026-11.md`, every row checked on the board; a click that cycles reads `A → B → clear`.
    const CYCLE_END = 'clear';
    const ERASE = 'starting on it: erase';
    // Rows the number, digit and colour-selection tools share: they select cells, and a digit types into the selection.
    const SQUARE_ONLY = 'square grids only';
    const REMOVE_DRAG = ['Ctrl / Shift + drag from a selected cell', 'remove cells'];
    const selectRows = (what, digit, double) => [
        ['Ctrl / Shift + click', 'add or remove the cell'],
        ['Alt + drag', `select a rectangle (${SQUARE_ONLY})`],
        ['Double click', `select every cell with the same ${what}${double ? `; ${double}` : ''}`],
        ['Digit', digit]
    ];
    // `extra` rows go before the shared ones and `after` rows after them; `double` adds what a double click does on a cell
    // holding this tool's own marks, when they are not what it matches.
    const selecting = (what, digit, { extra = [], after = [], double } = {}) => ({
        left: 'select the cell (drops the rest)', right: NOTHING, drag: 'select many cells', more: [...extra, ...selectRows(what, digit, double), ...after]
    });
    const line = (drag, more = []) => ({ left: NOTHING, right: NOTHING, drag: `${drag}; ${ERASE}`, more });
    const clearMany = (mark) => `${mark} on many cells (starting on one: clear many)`;
    // Penpa+ starts the marking only when the press lands on an edge.
    const crossEdges = [['Right drag from an edge', '× on each edge it passes (starting on a ×: clear them)']];
    const AS_A_CLICK = 'as a click where it starts';
    const alsoClears = ', also clears dots on the cell\'s corners and edges';
    const cornerOrEdgeDot = 'corner or edge: green dot → clear';
    const mineRows = (left, drag = 'starting on a marked cell: clear many') => ({ left: `${left}${alsoClears}`,
        right: `cell: × → ${CYCLE_END}; ${cornerOrEdgeDot}`, drag, more: [['Right drag', clearMany('×')]] });
    const thermoRows = (click, drag) => ({ left: click, right: NOTHING, drag: `${drag}; drag back to undo a step`, more: [] });
    const move = (what) => ({ left: NOTHING, right: NOTHING, drag: `move ${what} you entered to an empty cell`, more: [] });
    const flick = (centre, layout) => ({ left: `${centre} in the cell → ${CYCLE_END}`, right: NOTHING,
        drag: `from a cell: ${layout[0]} by direction, ${layout[1]}`, more: [] });

    const ROWS = {
        'surface/': { left: `paint the cell → ${CYCLE_END}`, right: `paint the 2nd colour → ${CYCLE_END}`,
            drag: 'paint many cells; starting on a painted cell: clear many',
            more: [['Right drag', '2nd colour on many cells (starting on it: clear many)'],
                ['Alt + drag', `paint a rectangle (starting on the colour: clear it; ${SQUARE_ONLY})`],
                ['Alt + right drag', `rectangle in the 2nd colour (${SQUARE_ONLY})`], ['Digit', 'pick colour n']] },
        'multicolor/': selecting('colour', 'add or remove colour n in the selected cells', { extra: [REMOVE_DRAG] }),
        'combi/blpo': { left: `shade → dot · → ${CYCLE_END}`, right: `dot · → shade → ${CYCLE_END}`,
            drag: 'repeat the first cell\'s change on each cell (shade, dot or clear)', more: [] },
        'combi/shaka': { left: `dot · → ${CYCLE_END}`, right: NOTHING,
            drag: `from a cell toward a corner: black triangle filling that corner's half → ${CYCLE_END} (same way)`, more: [] },

        'line/1': line('line through cell centres'),
        'line/2': line('line through cell centres, diagonals too'),
        'line/3': { left: NOTHING, right: NOTHING,
            drag: 'straight line from one cell centre to another, any angle, drawn on release; over the same line: erase', more: [] },
        'line/5': line('line in half steps, cell centre to edge middle, so it can stop at an edge'),
        'line/4': { left: `× on the edge between two cells → ${CYCLE_END}`, right: NOTHING, drag: AS_A_CLICK, more: [] },
        'combi/linex': { left: NOTHING, right: `× on the edge → ${CYCLE_END}`, drag: `line through cell centres; ${ERASE}`, more: crossEdges },
        'combi/lineox': { left: `○ in the cell → × → ${CYCLE_END}`, right: `× in the cell → ○ → ${CYCLE_END}`,
            drag: `line through cell centres; ${ERASE}`, more: [] },
        'combi/linedir': { left: NOTHING, right: `edge: × → arrowhead one way → the other way → ${CYCLE_END}`,
            drag: `line through cell centres; ${ERASE}`,
            more: [['Right drag from a cell toward an edge', `arrowhead on that edge pointing that way → ${CYCLE_END} (same way)`],
                ['Right drag from an edge', '× on each edge it passes (starting on a mark: as a right click there; starting on the last arrowhead: clear the marks it passes)']] },
        'combi/yajilin': { left: `shade the cell → ${CYCLE_END}`, right: `cell: dot · → ${CYCLE_END}; edge: × → ${CYCLE_END}`,
            drag: `line through cell centres; ${ERASE}`, more: [['Right drag', clearMany('dot ·')]] },
        'combi/hashi': { left: `× in the cell → ${CYCLE_END}`, right: `× in the cell → ${CYCLE_END}`,
            drag: `bridge between cells → double → ${CYCLE_END}`, more: [] },
        'combi/rassisillai': { left: `○ in the cell → ${CYCLE_END}`, right: `shade the cell → ${CYCLE_END}`,
            drag: `line through cell centres; ${ERASE}`, more: [['Right drag', 'shade many cells (starting on a shaded cell: clear many)']] },

        'lineE/1': line('line along grid lines'),
        'lineE/2': line('line along grid lines, and across cells corner to corner'),
        'lineE/3': { left: NOTHING, right: NOTHING,
            drag: 'straight line from one corner to another, any angle, drawn on release; over the same line: erase', more: [] },
        'lineE/6': line('line along grid lines in half steps, corner to edge middle, so it can stop mid-edge'),
        'lineE/4': { left: `× on the grid line → ${CYCLE_END}`, right: NOTHING, drag: AS_A_CLICK, more: [] },
        'lineE/5': { left: NOTHING, right: NOTHING,
            drag: 'erase the grid lines it runs along; starting on an erased one: restore them', more: [] },
        'wall/': line('from the middle of an edge, across cells: a straight wall through their centres (from a cell centre: nothing); it does not turn within a drag'),
        'combi/edgex': { left: NOTHING, right: `× on the edge, if no edge line is there → ${CYCLE_END}`,
            drag: `line along grid lines; ${ERASE}`, more: crossEdges },
        'combi/edgexoi': { left: `cell: yellow → 2nd colour → ${CYCLE_END}`,
            right: `edge: × → ${CYCLE_END}; cell: 2nd colour → yellow → ${CYCLE_END}`, drag: `line along grid lines; ${ERASE}`, more: [] },
        'combi/edgesub': { left: NOTHING, right: NOTHING,
            drag: 'from a corner: line along grid lines; from a cell: grey helper line through cell centres; starting on either: erase',
            more: [] },

        'number/1': selecting('number', 'write it in the selected cells'),
        'number/10': selecting('number', 'large number in the selected cells'),
        'number/6': selecting('number', 'medium number in the selected cells'),
        'number/5': selecting('number', 'small number in the selected cells'),
        'number/7': selecting('number', 'add or remove that candidate in the selected cells', { double: 'on candidates: just that cell' }),
        'number/8': selecting('number', 'add it to the long number in the selected cells'),
        'number/3': { left: 'cursor to the nearest cell corner spot; selects the cell', right: 'cursor to the nearest cell corner spot',
            drag: AS_A_CLICK, more: [['Digit', 'number at the cursor']] },
        'number/9': { left: 'cursor to the nearest cell side spot; selects the cell', right: 'cursor to the nearest cell side spot',
            drag: AS_A_CLICK, more: [['Digit', 'number at the cursor']] },
        'sudoku/1': selecting('digit', 'digit in the selected cells', { extra: [REMOVE_DRAG], after: [
            ['Shift held', `corner marks (${SQUARE_ONLY})`], ['Ctrl + digit', `${NOTHING} (the browser keeps it)`]] }),
        'sudoku/2': selecting('digit', 'corner mark in the selected cells', { extra: [REMOVE_DRAG], double: 'on corner marks only: clear the selection' }),
        'sudoku/3': selecting('digit', 'centre mark in the selected cells', { extra: [REMOVE_DRAG] }),
        'combi/numfl': flick('5', ['a digit', 'laid out like a phone keypad around 5 (↖1 ↑2 ↗3 ←4 →6 ↙7 ↓8 ↘9)']),
        'combi/alfl': flick('E', ['a letter', 'around E (↖A ↑B ↗C ←D →F ↙G ↓H ↘ -)']),

        'combi/blwh': { left: `white ○ → black ● → ${CYCLE_END}`, right: `black ● → white ○ → ${CYCLE_END}`,
            drag: 'repeat the first cell\'s change on each cell', more: [['Given circles', 'left alone']] },
        'combi/star': { left: `star ★ → ${CYCLE_END}${alsoClears}; on a ×: clear`, right: `cell: × → ${CYCLE_END}; ${cornerOrEdgeDot}`,
            drag: 'starting on a marked cell: clear many', more: [['Right drag', clearMany('×')]] },
        'combi/akari': { left: `bulb 💡 → ${CYCLE_END}; on a dot: bulb`, right: `cell: dot · → ${CYCLE_END}; on a bulb: dot; edge: × → ${CYCLE_END}`,
            drag: `dashed helper line through cell centres; ${ERASE}`, more: [['Right drag', clearMany('dot ·')]] },
        'combi/battleship': { left: `ship middle ■ → ● → · → water ≈ → ${CYCLE_END}; on a ship end: clear`, right: `water ≈ → ${CYCLE_END}`,
            drag: 'from an empty cell: ship end, its body toward where you drag (round side away); starting on · or ≈: that mark on each cell',
            more: [['Right drag', 'water on many cells (starting on water: clear many)'], ['Given ship pieces', 'left alone']] },
        'combi/tents': { left: `tent ▲ → dot · → ${CYCLE_END}`, right: `cell: dot · → ▲ → ${CYCLE_END}; edge: × → ${CYCLE_END}`,
            drag: `line between cell centres, to link a tent to its tree; ${ERASE}`, more: [] },
        'combi/mines': mineRows(`mine 💣 → ${CYCLE_END}`),
        'combi/doublemines': mineRows(`mine 💣 → two 💣💣 → ${CYCLE_END}`, 'starting on 💣💣 or ×: clear many'),
        'combi/magnets': { left: `+ → − → shade → ${CYCLE_END}`, right: `shade → − → + → ${CYCLE_END}`, drag: AS_A_CLICK, more: [] },
        'combi/arrowS': { left: 'on an arrow: clear it', right: NOTHING, drag: 'from a cell: arrow pointing the way you drag (8 directions)', more: [] },

        'special/thermo': thermoRows('on a thermometer\'s bulb: erase it', 'thermometer from the bulb cell through cells, diagonals too'),
        'special/nobulbthermo': thermoRows('on its first cell: erase it', 'thermometer through cells, diagonals too'),
        'special/arrows': thermoRows('on its circle: erase it', 'arrow from the circled cell through cells, diagonals too'),
        'special/direction': thermoRows('on its tail cell: erase it', 'arrow through cells, head at the last cell, diagonals too'),
        'special/squareframe': thermoRows('on its first cell: erase it', 'grey band through the cells, following the path (an L stays an L)'),
        'special/polygon': { left: 'first click starts at a grid corner; each click adds a corner; click the first or the last corner again to finish (closed, filled shape either way)',
            right: NOTHING, drag: `${AS_A_CLICK} (the next corner follows the pointer until you finish)`, more: [] },
        'cage/1': { left: `free cell: 1-cell cage → ${CYCLE_END}; caged cell: erase its whole cage (a cage in another style: restyle it to this one → erase)`,
            right: NOTHING, drag: 'cage around the cells; nothing if any of them is already caged', more: [] },
        'cage/2': line('cage line through points a quarter cell in from the corners'),
        'move/1': move('a number or shape'),
        'move/2': move('a number'),
        'move/3': move('a shape')
    };

    // The two row sets of the Shape tools. Which one a shape gets is Penpa+'s `onoff_symbolmode_list`.
    const ON_OFF_SHAPES = ['cross', 'arrow_cross', 'arrow_fourtip', 'arrow_eight', 'arrow_fouredge_B', 'arrow_fouredge_G', 'arrow_fouredge_E',
        'degital_B', 'degital_G', 'degital_E', 'degital_f', 'dice', 'polyomino', 'polyhex'];
    const SHAPE_ROWS = {
        variants: { left: `the shape's first variant → ${CYCLE_END}; on another variant: the first variant`, right: 'cursor to the cell',
            drag: AS_A_CLICK, more: [['Digit', `shape variant n at the cursor → ${CYCLE_END} (same digit)`]] },
        onOff: { left: 'cursor to the cell', right: 'cursor to the cell', drag: AS_A_CLICK,
            more: [['Digit', 'add or remove part n of the shape at the cursor']] }
    };

    // Picker names for Shape tools whose Penpa+ name reads badly (`research/mouse-card-wording-2026-11.md`).
    const SHAPE_NAMES = {
        cross: 'Cross arms', arrow_cross: 'Arrow cross', arrow_Short: 'Arrow, short and fat', arrow_S: 'Arrow, small',
        arrow_eight: 'Arrows, 8-way', arrow_fouredge_B: 'Edge arrows, black', arrow_fouredge_G: 'Edge arrows, grey',
        arrow_fouredge_E: 'Edge arrows, green', arrow_GP: 'Arrow, graphic', arrow_GP_C: 'Arrow, graphic, in a circle',
        degital_B: 'Segment digit, black', degital_G: 'Segment digit, grey', degital_E: 'Segment digit, green',
        degital_f: 'Segment digit, outline', ox_B: '○ △ □ ×, black', ox_G: '○ △ □ ×, grey', ox_E: '○ △ □ ×, green',
        math: 'Maths signs, black', math_G: 'Maths signs, green', inequality: 'Inequality signs', tri: 'Corner triangles',
        dice: 'Dice pips', tents: 'Trees, tents, water, fish', star: 'Stars', sun_moon: 'Sun, moon, bulb, bomb', line: 'Lines in a cell',
        frameline: 'Frame lines', kakuro: 'Kakuro clue box', 'battleship_B+': 'Ship, curvy, black', 'battleship_G+': 'Ship, curvy, grey',
        'battleship_W+': 'Ship, curvy, white', slovak: 'Slovak sums', angleloop: 'Angle loop'
    };

    // The name every card gives the tool's sub-mode.
    const submodeLabel = (tool) => (tool.mode === 'symbol' && SHAPE_NAMES[tool.submode]) || tool.submodeName;

    // What Left click, Right click and Drag do with the tool, plus extra rows as [gesture, effect].
    function mouseRows(tool) {
        if (tool.mode === 'symbol') {
            return ON_OFF_SHAPES.includes(tool.submode) ? SHAPE_ROWS.onOff : SHAPE_ROWS.variants;
        }
        return ROWS[toolKey(tool)] ?? { left: NOTHING, right: NOTHING, drag: NOTHING, more: [] };
    }

    // A sub-mode that names its tool on its own stands alone in a chip; a generic one ("Normal") gets its mode first.
    const SELF_NAMING_MODES = ['combi', 'special', 'symbol'];

    const capitalised = (text) => text.charAt(0).toUpperCase() + text.slice(1);

    // The one name every card gives a tool of `listTools()`: the Mode field, the Board label, the Mouse headline, the chips and the flash.
    function chipLabel(tool) {
        if (!tool.submodeName) {
            return tool.modeName;
        }
        return SELF_NAMING_MODES.includes(tool.mode) ? submodeLabel(tool) : `${tool.modeName} > ${capitalised(tool.submodeName)}`;
    }

    window.toolGuide = { TOOL_GROUPS, NOTHING, placeTool, looseText, searchWords, looseWords, matchesSearch, mouseRows, toolKey, chipLabel };
})();
