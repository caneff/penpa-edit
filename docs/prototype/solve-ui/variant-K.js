/*
 * PROTOTYPE (throwaway, branch prototype/solve-ui): solve-UI variant K, "Live key map".
 * Owned by variant K's builder: this file and variant-K.css only. See README.md for the contract.
 *
 * The idea: a faint on-screen keyboard along the bottom of the window shows what every key does in the current mode,
 * sub-mode and held modifier, and changes live: switch mode, or hold Shift / Ctrl / Alt (or click them on the diagram
 * to latch them), and every label is recomputed. Keys light up when pressed. Clicking a key on the diagram sends that
 * key (with the latched modifiers) through Penpa+'s own key handler, so it does exactly what the real key does. A mouse
 * card beside the keyboard says what left, right, drag and Alt+drag do in the mode. Keys are coloured by what they do:
 * enter or erase, switch mode or tool, move the cursor, a command (undo, dialog, timer), swallowed by the page (the
 * browser never sees it and nothing happens), or left to the browser. Above the board, a conventional compact mode bar.
 *
 * The claim it tests: the hidden key map is why Penpa feels unlearnable. If the map is always on screen, a solver
 * should learn Penpa+'s keyboard without a help page.
 *
 * Where the map comes from: research/penpa-mode-key-map.md and research/solve-input-and-settings-inventory.md, re-read
 * against docs/js/main.js onKeyDown (294-745), onKeyUp (872-917), checkShortcutKeys (747-793) and class_p.js
 * key_number / key_space / key_backspace / key_shiftspace (7689-8620). Checked LIVE in headless Chromium on 2026-11-13
 * (see describeKey for the cases). Where the research and the code disagree, the code wins: Backspace in Shape does
 * nothing (key_backspace has no Shape branch; LIVE), not "clears shape"; Alt+digit in Multicolor reaches only Alt+0,
 * Alt+1, Alt+2 (colours 10, 11, 12; MULTICOLOR_REMAP has 13 entries), not "10+n" for every digit; Ctrl+digit in
 * Multicolor applies colour n un-remapped (Ctrl+2 is GN, plain 2 is GR; LIVE).
 *
 * Round 2 (genres other than sudoku): for these genres the mouse is primary, so the map teaches the MOUSE too. A tool
 * kit read from the answer check, title and rules (inferKit) gives each puzzle its 1-3 genre tools (mostly one Penpa+
 * Composite tool each: left = main mark, right = helper); Tab / Shift+Tab cycles them. A mouse card beside the board
 * lists what left, right, left drag and right drag do with the current tool, dims the rows that do not apply where
 * the pointer is (cell, edge, corner) and flashes the row a real press just did; while the pointer is on the board the
 * hint strip lists only what applies there. The full keyboard is now an F1 toggle (it cost ~260px); a one-line strip
 * of only the keys that do something in the current mode stays on screen instead.
 *
 * Bridge gaps worked around here:
 *   - No answer-check option list in the bridge (answerCheckInfo() is HTML for people): inferKit reads
 *     pu.get_answercheck_settings().answercheck_opt.
 *   - No "what is under the pointer" call: targetAt() uses bridge.pageToPoint with all point types and reads
 *     pu.point[i].type (0 cell, 1 corner, 2/3 edge).
 *   - Composite stays usable when the link's Penpa Lite hides it (Galaxies 000EUI shows only Surface, Line, Edge,
 *     Sudoku): bridge.setMode('combi') works on a hidden mode, so the kit uses it anyway.
 *   - bridge.sendKey cannot drive Penpa+'s handler for keys it reads by keyCode (Delete 46, Backspace-as-Delete in
 *     Sudoku, Shift+letter in Sudoku, Alt+digit in Multicolor): `new KeyboardEvent` leaves keyCode 0. This file sends
 *     its own events with keyCode/which defined on them, and sends a held modifier as a real sequence (Shift down,
 *     key down/up, Shift up) so Sudoku's temporary Corner/Centre switch happens as it does with real keys.
 *   - No read of "is this modifier held" from the engine: tracked here from window key events (and reset on blur,
 *     which Penpa+ itself does not do: research I5).
 *   - Style swatch colours read from the legacy labels (`st_surface<n>_lb` computed background); Shapes read from
 *     #mode_symbolul1; Number sub-modes 3 and 9 have empty legacy labels (named here 1/4 and Side).
 *   - Shape mode re-shows the legacy floating panel through an inline style (class_p.js:1616-1619); hidden here with
 *     an !important rule in variant-K.css.
 *   - The Tab-set cycle position lives in a main.js closure (counter_index), so the map says "next in Tab set", not
 *     which mode comes next.
 *   - UserSettings.shortcuts_enabled (Z/X/C/V on or off) is read directly; getSettings().shortcutsEnabled has it too.
 */
(function() {
    'use strict';

    // ---- Keyboard model ---------------------------------------------------------------------------------------------

    /** [code, cap, width (u), key, shifted key, keyCode]. code is KeyboardEvent.code; key/shifted are KeyboardEvent.key. */
    function k(code, cap, w, key, shifted, keyCode) {
        return {code: code, cap: cap, w: w || 1, key: key, shifted: shifted == null ? key : shifted, keyCode: keyCode};
    }

    function letters(str) {
        return str.split('').map(function(c) {
            return k('Key' + c.toUpperCase(), c.toUpperCase(), 1, c, c.toUpperCase(), c.toUpperCase().charCodeAt(0));
        });
    }

    const DIGIT_SHIFT = {'1': '!', '2': '@', '3': '#', '4': '$', '5': '%', '6': '^', '7': '&', '8': '*', '9': '(', '0': ')'};

    const F_ROW = [k('Escape', 'Esc', 1, 'Escape', 'Escape', 27), {gap: 0.5}]
        .concat([1, 2, 3, 4].map(function(n) {
            return k('F' + n, 'F' + n, 1, 'F' + n, 'F' + n, 111 + n);
        }), [{gap: 0.25}], [5, 6, 7, 8].map(function(n) {
            return k('F' + n, 'F' + n, 1, 'F' + n, 'F' + n, 111 + n);
        }), [{gap: 0.25}], [9, 10, 11, 12].map(function(n) {
            return k('F' + n, 'F' + n, 1, 'F' + n, 'F' + n, 111 + n);
        }));

    const MAIN_ROWS = [
        [k('Backquote', '`', 1, '`', '~', 192)]
            .concat('1234567890'.split('').map(function(d) {
                return k('Digit' + d, d, 1, d, DIGIT_SHIFT[d], 48 + parseInt(d, 10));
            }))
            .concat([k('Minus', '-', 1, '-', '_', 189), k('Equal', '=', 1, '=', '+', 187),
                k('Backspace', 'Backspace', 2, 'Backspace', 'Backspace', 8)]),
        [k('Tab', 'Tab', 1.5, 'Tab', 'Tab', 9)].concat(letters('qwertyuiop'),
            [k('BracketLeft', '[', 1, '[', '{', 219), k('BracketRight', ']', 1, ']', '}', 221),
                k('Backslash', '\\', 1.5, '\\', '|', 220)]),
        [k('CapsLock', 'Caps', 1.75, 'CapsLock', 'CapsLock', 20)].concat(letters('asdfghjkl'),
            [k('Semicolon', ';', 1, ';', ':', 186), k('Quote', '\'', 1, '\'', '"', 222),
                k('Enter', 'Enter', 2.25, 'Enter', 'Enter', 13)]),
        [k('ShiftLeft', 'Shift', 2.25, 'Shift', 'Shift', 16)].concat(letters('zxcvbnm'),
            [k('Comma', ',', 1, ',', '<', 188), k('Period', '.', 1, '.', '>', 190), k('Slash', '/', 1, '/', '?', 191),
                k('ShiftRight', 'Shift', 2.75, 'Shift', 'Shift', 16)]),
        [k('ControlLeft', 'Ctrl', 1.5, 'Control', 'Control', 17), {gap: 1}, k('AltLeft', 'Alt', 1.5, 'Alt', 'Alt', 18),
            k('Space', 'Space', 6.5, ' ', ' ', 32), k('AltRight', 'Alt', 1.5, 'Alt', 'Alt', 18), {gap: 1},
            k('ControlRight', 'Ctrl', 1.5, 'Control', 'Control', 17)]
    ];

    const NAV_ROWS = [
        [k('Insert', 'Ins', 1, 'Insert', 'Insert', 45), k('Home', 'Home', 1, 'Home', 'Home', 36),
            k('PageUp', 'PgUp', 1, 'PageUp', 'PageUp', 33)],
        [k('Delete', 'Del', 1, 'Delete', 'Delete', 46), k('End', 'End', 1, 'End', 'End', 35),
            k('PageDown', 'PgDn', 1, 'PageDown', 'PageDown', 34)],
        [],
        [{gap: 1}, k('ArrowUp', '↑', 1, 'ArrowUp', 'ArrowUp', 38)],
        [k('ArrowLeft', '←', 1, 'ArrowLeft', 'ArrowLeft', 37), k('ArrowDown', '↓', 1, 'ArrowDown', 'ArrowDown', 40),
            k('ArrowRight', '→', 1, 'ArrowRight', 'ArrowRight', 39)]
    ];

    /** What Chrome does with a key the page leaves alone (only for the labels; nothing here sends it to Chrome). */
    const BROWSER = {
        F1: 'help', F3: 'find next', F5: 'reload', F6: 'address bar', F7: 'caret browse', F10: 'menu',
        F11: 'full screen', F12: 'dev tools', Tab: 'move focus', Enter: 'activate', Home: 'scroll top',
        End: 'scroll end', PageUp: 'scroll up', PageDown: 'scroll down', CapsLock: 'caps lock', Insert: '—'
    };
    const BROWSER_CTRL = {
        KeyF: 'find', KeyL: 'address bar', KeyP: 'print', KeyS: 'save page', KeyT: 'new tab', KeyW: 'close tab',
        KeyR: 'reload', KeyN: 'new window', KeyH: 'history', KeyJ: 'downloads', KeyU: 'view source',
        KeyO: 'open file', KeyG: 'find next', KeyE: 'search', KeyK: 'search', KeyB: 'bookmarks bar',
        Equal: 'zoom in', Minus: 'zoom out', Tab: 'next tab', F5: 'hard reload', Backquote: '—'
    };

    /** Surface brush per digit key (main.js:666-679). The label's trailing digit is the key: GR2 is st_surface8. */
    const SURFACE_KEYS = {'1': 1, '2': 8, '3': 3, '4': 4, '5': 2, '6': 5, '7': 6, '8': 7, '9': 9, '0': 10};
    /** main.js:9 */
    const MULTICOLOR_REMAP = [10, 1, 8, 3, 4, 2, 5, 6, 7, 9, 0, 11, 12];
    /** main.js:310 str_sym, the symbols the handler passes to key_number. */
    const STR_SYM = '!"#$%&\'()-=^~|@[];+:*,.<>/?_£§¤\\{}';

    const KIND_LEGEND = [
        ['enter', 'enters or erases'],
        ['mode', 'switches mode / tool'],
        ['nav', 'moves cursor / selection'],
        ['cmd', 'command'],
        ['blocked', 'swallowed: nothing happens'],
        ['browser', 'left to the browser']
    ];

    /**
     * One mouse row: gesture g ('left', 'right', 'ldrag', 'rdrag', 'dbl'), what it does, where (at: 'cell', 'edge',
     * 'corner', or null for anywhere the tool accepts) and a held modifier. The rows teach the MOUSE the way the key
     * caps teach the keys; the card highlights the row a real press just did and, while the pointer is on the board,
     * the hint strip lists the rows for what the pointer is over.
     */
    function m(g, does, at, mod) {
        return {g: g, does: does, at: at || null, mod: mod || null};
    }

    /** Mouse grammar per mode (Penpa+ README lines 126, 217-247; research/penpa-mode-key-map.md § clicks). */
    const MOUSE = {
        sudoku: [m('left', 'select a cell'), m('ldrag', 'select many'), m('left', 'add to the selection', null, 'Ctrl'),
            m('dbl', 'select every cell like it'), m('ldrag', 'select a rectangle', null, 'Alt')],
        number: [m('left', 'put the cursor on the cell, then type'), m('ldrag', 'select many'),
            m('dbl', 'select similar'), m('ldrag', 'select a rectangle', null, 'Alt')],
        multicolor: [m('left', 'select a cell, then type a digit'), m('ldrag', 'select many'),
            m('ldrag', 'select a rectangle', null, 'Alt')],
        surface: [m('left', 'paint the brush (again: erase)'), m('right', 'paint the 2nd colour'), m('ldrag', 'paint many'),
            m('ldrag', 'paint a rectangle', null, 'Alt')],
        line: [m('ldrag', 'line through cell centres (again: erase)')],
        lineE: [m('ldrag', 'line along the grid lines (again: erase)')],
        wall: [m('ldrag', 'wall (again: erase)')],
        symbol: [m('left', 'cursor + shape (again: next variant)')],
        special: [m('ldrag', 'draw the object')],
        cage: [m('ldrag', 'draw a cage')],
        move: [m('ldrag', 'move a number or shape')],
        combi: [m('left', 'the tool\'s mark'), m('right', 'its helper mark')]
    };
    /** Composite tools, checked LIVE 2026-11-13 with real Playwright clicks on the Masyu sample (see the r2 report). */
    const COMBI_MOUSE = {
        blpo: [m('left', 'shade (again: dot; again: clear)'), m('right', 'dot = unshaded (again: shade)'),
            m('ldrag', 'shade many'), m('rdrag', 'dot many')],
        blwh: [m('left', 'white ○ (again: black ●; again: clear)'), m('right', 'black ● (again: white ○)'),
            m('rdrag', 'black ● many')],
        linex: [m('ldrag', 'loop through cell centres (again: erase)'), m('right', '× on the edge', 'edge')],
        lineox: [m('ldrag', 'loop through cell centres'), m('left', '○ in the cell (again: ×; again: clear)', 'cell'),
            m('right', '× in the cell (again: ○)', 'cell')],
        edgex: [m('ldrag', 'line along the grid lines (again: erase)'), m('right', '× on the edge', 'edge')],
        edgexoi: [m('ldrag', 'line along the grid lines'), m('right', '× on the edge', 'edge'),
            m('left', 'inside: yellow (again: green; again: clear)', 'cell'), m('right', 'outside: green (again: yellow)', 'cell')],
        yajilin: [m('left', 'shade (again: clear)', 'cell'), m('ldrag', 'loop through cell centres'),
            m('right', 'dot in the cell', 'cell'), m('rdrag', 'dot many'), m('right', '× on the edge', 'edge')],
        hashi: [m('ldrag', 'bridge (again: double)')],
        star: [m('left', 'star (again: clear)', 'cell'), m('right', '× (again: clear)', 'cell'), m('rdrag', '× many'),
            m('right', 'green dot', 'corner')],
        tents: [m('left', 'tent'), m('ldrag', 'link a tent to its tree'), m('right', '×')],
        mines: [m('left', 'mine'), m('right', '×'), m('rdrag', '× many')],
        akari: [m('left', 'bulb (again: clear)', 'cell'), m('right', 'dot = no bulb', 'cell'), m('rdrag', 'dot many'),
            m('right', '× on the edge', 'edge'), m('ldrag', 'dotted helper line')],
        battleship: [m('left', 'ship cell ■, again: ● (one-cell ship), again: ·, again: clear'), m('ldrag', 'ship end, pointing the way you drag'),
            m('right', 'water (again: clear)'), m('rdrag', 'water many')],
        doublemines: [m('left', '1 mine (again: 2)'), m('right', '×'), m('rdrag', '× many')]
    };

    /**
     * Genre tools: what a solver of the genre reaches for, as one Penpa+ mode + sub-mode. A puzzle's kit is 1-4 of these,
     * main tool first; Tab / Shift+Tab cycles them.
     */
    const TOOLS = {
        shade: {label: 'Shade / dot', mode: 'combi', sub: 'blpo'},
        circles: {label: 'Black / white ○', mode: 'combi', sub: 'blwh'},
        bulbs: {label: 'Bulbs / dots', mode: 'combi', sub: 'akari'},
        stars: {label: 'Stars / ×', mode: 'combi', sub: 'star'},
        ships: {label: 'Ships / water', mode: 'combi', sub: 'battleship'},
        yajilin: {label: 'Shade + loop', mode: 'combi', sub: 'yajilin'},
        loop: {label: 'Loop / edge ×', mode: 'combi', sub: 'linex'},
        loopox: {label: 'Loop / cell ○ ×', mode: 'combi', sub: 'lineox'},
        edges: {label: 'Edges / ×', mode: 'combi', sub: 'edgex'},
        edgesio: {label: 'Edges / in-out', mode: 'combi', sub: 'edgexoi'},
        numbers: {label: 'Numbers', mode: 'number', sub: '1'},
        digits: {label: 'Digits', mode: 'sudoku', sub: '1'}
    };

    /**
     * The puzzle's kit, from the answer check's options (pu.get_answercheck_settings().answercheck_opt: the one reliable
     * signal; genre tags are absent on most links), then title and rules for what the check does not say (Yajilin vs
     * Masyu, Fillomino's numbers, Slitherlink vs region borders). Bridge gap: the bridge has answerCheckInfo() (HTML for
     * people) but not the option list, so this reads pu directly.
     */
    function inferKit(B) {
        let opts = [];
        try {
            opts = (pu.get_answercheck_settings().answercheck_opt || []).map(String);
        } catch (err) {
            opts = [];
        }
        const info = B.getInfo();
        const text = [info.title, info.rules, B.genreTags().join(' ')].join(' ').replace(/<[^>]+>/g, ' ');
        const says = function(re) {
            return re.test(text);
        };
        const has = function(o) {
            return opts.indexOf(o) !== -1;
        };
        const ids = [];
        const genres = [];
        const add = function(id) {
            if (ids.indexOf(id) === -1) {
                ids.push(id);
            }
        };
        if (has('akari')) {
            genres.push('Akari');
            add('bulbs');
        }
        if (has('star battle')) {
            genres.push('Star Battle');
            add('stars');
        }
        if (has('circle')) {
            genres.push('Yin-Yang');
            add('circles');
        }
        if (has('battleship')) {
            genres.push('Battleships');
            add('ships');
        }
        if (has('cell loop')) {
            if (says(/yajilin/i)) {
                genres.push('Yajilin');
                add('yajilin');
                add('loop');
            } else {
                genres.push(says(/masyu|maysu/i) ? 'Masyu' : 'Loop');
                add('loop');
                add('loopox');
            }
        }
        if (has('edge loop')) {
            if (says(/fillomino/i)) {
                genres.push('Fillomino');
                add('numbers');
                add('edges');
            } else if (says(/slither/i)) {
                genres.push('Slitherlink');
                add('edges');
                add('edgesio');
            } else {
                genres.push(says(/galax|tentaisho/i) ? 'Galaxies' : 'Regions');
                add('edges');
            }
        }
        // Battleships links add "shading" for the ship cells; ship pieces already satisfy it (checked LIVE on 000IFY).
        if (has('shading') && !has('battleship')) {
            const g = says(/nurikabe/i) ? 'Nurikabe' : says(/statue/i) ? 'Statue Park' : says(/aquarium/i) ? 'Aquarium' : null;
            if (g || !genres.length) {
                genres.push(g || 'Shading');
            }
            add('shade');
        }
        if (has('number')) {
            if (pu.gridtype === 'sudoku' || says(/sudoku/i)) {
                genres.push('Sudoku');
                add('digits');
            } else {
                add('numbers');
            }
        }
        const comp = {};
        B.listComposite().forEach(function(c) {
            comp[c.name] = true;
        });
        return {
            genre: genres.join(' + '),
            tools: ids.map(function(id) {
                return Object.assign({id: id}, TOOLS[id]);
            }).filter(function(t) {
                return t.mode !== 'combi' || comp[t.sub];
            })
        };
    }

    /** Mouse rows of a mode + sub-mode. */
    function mouseRows(mode, sub) {
        return (mode === 'combi' && COMBI_MOUSE[sub]) || MOUSE[mode] || [];
    }

    const GESTURE = {left: 'Left', right: 'Right', ldrag: 'Left drag', rdrag: 'Right drag', dbl: 'Double'};
    const AT = {cell: 'in a cell', edge: 'on an edge', corner: 'on a corner or edge'};
    const AT_SHORT = {cell: 'cell', edge: 'edge', corner: 'corner, edge'};

    const SUBMODE_FALLBACK = {number: {'3': '1/4', '9': 'Side'}};
    const SUDOKU_SUB = {'1': 'Normal', '2': 'Corner', '3': 'Centre'};

    // ---- Key semantics ----------------------------------------------------------------------------------------------

    /** Surface/Multicolor swatch colour of style n, from the legacy label (bridge gap). */
    function swatch(n) {
        const lb = document.getElementById('st_surface' + n + '_lb');
        return lb ? getComputedStyle(lb).backgroundColor : null;
    }

    function swatchName(n) {
        const lb = document.getElementById('st_surface' + n + '_lb');
        return lb ? lb.textContent.trim().replace(/\d+$/, '') : String(n);
    }

    /**
     * What one key does now: {text, kind, swatch?, tip}. kind is one of enter, mode, nav, cmd, blocked, browser, none,
     * modifier. Follows main.js onKeyDown top to bottom. `st` = {mode, sub, shift, ctrl, alt, tab, zxcv, panel}.
     * LIVE-checked on 2026-11-13: Sudoku digits in all three sub-modes, Shift/Ctrl hold, Delete, Z/X/C/V, Surface
     * digit brushes, Multicolor digits / Alt+0-2 / Ctrl+digit, Shape digit and Backspace, Number Shift+1 ("!") and
     * Shift+Space (" "), Shift/Ctrl+arrow extending the Sudoku selection, arrows doing nothing in Line.
     */
    function describeKey(def, st) {
        const code = def.code;
        const mode = st.mode;
        const shift = st.shift;
        const ctrl = st.ctrl;
        const alt = st.alt;
        const key = shift ? def.shifted : def.key;
        const surface = mode === 'surface';
        const value = mode === 'sudoku' || mode === 'number';
        const cursorModes = value || mode === 'multicolor' || mode === 'symbol';
        const isDigit = /^Digit\d$/.test(code);
        const isLetter = /^Key[A-Z]$/.test(code);
        const d = isDigit ? code.slice(5) : null;

        function r(text, kind, tip, sw) {
            return {text: text, kind: kind, tip: tip || text, swatch: sw || null};
        }
        // A key Penpa+ cancels without doing anything; Surface cancels every key without Ctrl (main.js:681-693).
        function blocked(what) {
            return r('blocked', 'blocked', (what ? 'Browser\'s "' + what + '" is ' : 'This key is ') +
                'swallowed by the page and does nothing here.');
        }
        function browser(table) {
            const what = (table || BROWSER)[code];
            return r(what || 'browser', 'browser', 'Penpa+ leaves this key to the browser' +
                (what ? ' (' + what + ').' : '.'));
        }

        // Modifier keys themselves.
        if (/^Shift/.test(code)) {
            if (mode === 'sudoku' && !ctrl) {
                return r('hold: Corner', 'modifier', 'Hold Shift for Corner marks; release to go back (main.js:411-420, 883-893).');
            }
            return r(mode === 'number' ? 'capitals, symbols' : 'Shift', 'modifier', 'Shift layer. Click to latch it on the diagram.');
        }
        if (/^Control/.test(code)) {
            if (mode === 'sudoku' && !shift) {
                return r('hold: Centre', 'modifier', 'Hold Ctrl for Centre marks; release to go back (main.js:422-431, 894-903).');
            }
            return r('undo, redo, …', 'modifier', 'Ctrl layer: undo, redo, select all. Click to latch it on the diagram.');
        }
        if (/^Alt/.test(code)) {
            if (mode === 'multicolor') {
                return r('colours 10-12', 'modifier', 'Alt+0/1/2: colours 10, 11, 12 (main.js:509-520).');
            }
            if (surface && !ctrl) {
                return r('rect drag', 'modifier', 'Alt+drag paints a rectangle. The Alt key alone is swallowed in Surface.');
            }
            return r(value ? 'rect drag' : 'Alt', 'modifier', 'Alt layer. Alt+drag draws a rectangle in Surface, Multicolor, Number and Sudoku.');
        }

        // 2. Function keys (checkFunctionKeys, main.js:795-870).
        if (code === 'F1' && !ctrl && !alt) {
            return r('keyboard map', 'cmd', 'Variant K: shows or hides this full keyboard map (the compact strip stays).');
        }
        if (code === 'F2') {
            return r('Problem?', 'cmd', 'Asks to switch to the Problem layer (solve mode, main.js:796-822).');
        }
        if (code === 'F3') {
            return r('Solution?', 'cmd', 'Asks to switch to the Solution layer (main.js:823-853).');
        }
        if (code === 'F4') {
            return r('timer', 'cmd', 'Pauses or starts the timer (main.js:854-866).');
        }
        if (code === 'F12') {
            return browser();
        }
        // 4. "?" opens Keyboard Shortcuts outside Number and Sudoku.
        if (key === '?' && !ctrl && !alt && mode !== 'number' && mode !== 'sudoku') {
            return r('shortcuts', 'cmd', '"?" opens the Keyboard Shortcuts dialog (main.js:335-341).');
        }
        // 5. Arrows: key_arrow in every mode, always cancelled.
        if (/^Arrow/.test(code)) {
            if (cursorModes) {
                if ((shift || ctrl) && (mode === 'sudoku' || mode === 'multicolor' || mode === 'number')) {
                    return r('extend sel.', 'nav', 'Shift/Ctrl+arrow adds the next cell to the selection.');
                }
                return r('move', 'nav', 'Moves the cursor / selection (key_arrow).');
            }
            return blocked(alt && (code === 'ArrowLeft' || code === 'ArrowRight') ? (code === 'ArrowLeft' ? 'back' : 'forward') : 'scroll');
        }
        // 6. Z/X/C/V by code, Surface and Sudoku only, no Ctrl (checkShortcutKeys, main.js:747-793).
        const zxcv = {KeyZ: ['sudoku', '1'], KeyX: ['sudoku', '2'], KeyC: ['sudoku', '3'], KeyV: ['surface', null]};
        if (!ctrl && st.zxcv && zxcv[code] && (surface || mode === 'sudoku')) {
            const t = zxcv[code];
            if (t[0] !== mode || (t[1] && t[1] !== st.sub)) {
                const name = t[0] === 'surface' ? 'Surface' : (mode === 'sudoku' ? SUDOKU_SUB[t[1]] : 'Sudoku ' + SUDOKU_SUB[t[1]]);
                return r('→ ' + name, 'mode', 'Switches to ' + (t[0] === 'surface' ? 'Surface mode' : 'Sudoku, ' + SUDOKU_SUB[t[1]]) +
                    ' (Settings: "Sudoku Z/Y & XCV Keys").');
            }
            // Already there: falls through to key_number, where z/x/c/v are not entered (str_all, class_p.js:7698-7703).
            return surface ? blocked() : r('·', 'none', 'Already in this sub-mode; the letter is not entered while Z/X/C/V shortcuts are on.');
        }
        // 7. Escape.
        if (code === 'Escape') {
            return r('clear sel.', 'cmd', 'Closes an open dialog, else clears the selection (main.js:359-379).');
        }
        // 8. Sudoku Ctrl+Delete / Backspace clears centre marks.
        if (mode === 'sudoku' && ctrl && !shift && (code === 'Delete' || code === 'Backspace')) {
            return r('clear centre', 'enter', 'Ctrl+Delete clears the selection\'s centre marks (main.js:433-435, class_p.js:8428).');
        }
        // 9. No Ctrl, no Alt: characters, Space, Delete, Backspace.
        if (!ctrl && !alt) {
            if (shift && code === 'Space') {
                return mode === 'number' ? r('enter space', 'enter', 'Shift+Space enters a space character (key_number(" ")).')
                    : (surface ? blocked() : r('·', 'none', 'Shift+Space: nothing in this mode.'));
            }
            const isChar = isDigit || isLetter || (key.length === 1 && STR_SYM.indexOf(key) !== -1);
            if (isChar) {
                return charKey();
            }
            if (code === 'Space' || code === 'Delete' || (code === 'Backspace' && mode === 'sudoku')) {
                return spaceKey();
            }
            if (code === 'Backspace') {
                if (mode === 'number') {
                    return r('delete char', 'enter', 'Deletes the last character in the cell (key_backspace).');
                }
                if (mode === 'multicolor') {
                    return r('clear colour', 'enter', 'Clears the selection\'s colour (key_backspace).');
                }
                return blocked();
            }
        }
        // 10. Alt+digit in Multicolor (main.js:509-520): only 0, 1, 2 land inside MULTICOLOR_REMAP.
        if (alt && !ctrl && !shift && isDigit) {
            if (mode === 'multicolor' && parseInt(d, 10) <= 2) {
                const n = d === '0' ? 10 : 10 + parseInt(d, 10);
                return r(swatchName(n), 'enter', 'Alt+' + d + ' colours the selection with colour ' + n + '.', swatch(n));
            }
            return surface ? blocked() : r('·', 'none', 'Alt+' + d + ': nothing in this mode.');
        }
        // 11. Ctrl+Shift+Z.
        if (ctrl && shift && !alt && code === 'KeyZ') {
            return r('redo', 'cmd', 'Ctrl+Shift+Z redoes (main.js:522-529).');
        }
        // 12. Ctrl without Shift/Alt.
        if (ctrl && !shift && !alt) {
            const c = {KeyA: ['select all', 'Selects every cell.'], KeyD: ['clone (new tab)', 'Opens a copy of the puzzle in a new window.'],
                KeyY: ['redo', 'Redo.'], KeyZ: ['undo', 'Undo.']}[code];
            if (c) {
                return r(c[0], 'cmd', 'Ctrl+' + def.cap + ': ' + c[1] + ' (main.js:568-600).');
            }
            if (code === 'Space') {
                return (mode === 'number' || mode === 'symbol') ? r('clear cell', 'enter', 'Ctrl+Space clears the cursor cell\'s number and shape (key_shiftspace).')
                    : r('·', 'none', 'Ctrl+Space: nothing in this mode.');
            }
            if (code === 'KeyI') {
                return st.panel ? r('panel insert', 'enter', 'Ctrl+I enters the floating panel\'s pick.') : r('·', 'none', 'Ctrl+I: only with the floating panel on.');
            }
            if (isDigit) {
                // Ctrl+digit goes to key_number(d) in every mode, without Surface's brush map or Multicolor's remap.
                if (mode === 'sudoku') {
                    return r('centre', 'enter', 'Ctrl+' + d + ': centre mark ' + d + '.');
                }
                if (mode === 'number') {
                    return r(d, 'enter', 'Ctrl+' + d + ' enters ' + d + ', as ' + d + ' does.');
                }
                if (mode === 'multicolor') {
                    const n = d === '0' ? 10 : parseInt(d, 10);
                    return r(swatchName(n), 'enter', 'Ctrl+' + d + ' colours with colour ' + n + ', not the remapped one plain ' + d + ' gives.', swatch(n));
                }
                if (mode === 'symbol') {
                    return r('variant', 'enter', 'Ctrl+' + d + ' places shape variant ' + d + ' at the cursor.');
                }
                return blocked();
            }
            if (code === 'KeyC' || code === 'KeyX' || code === 'KeyV') {
                const w = {KeyC: 'copy', KeyX: 'cut', KeyV: 'paste'}[code];
                return r(w + ' cells', 'cmd', 'Ctrl+' + def.cap + ': the board\'s ' + w + ' of the selection (class_p.js:230-232).');
            }
            if (code === 'Backspace' || code === 'Delete') {
                return r('·', 'none', 'Nothing in this mode.');
            }
            return browser(BROWSER_CTRL);
        }
        // Variant K's own: Tab / Shift+Tab cycles this puzzle's tool kit (caught before Penpa+'s handler).
        if (code === 'Tab' && !ctrl && !alt && st.kit.length > 1) {
            const n = st.kit.length;
            const next = st.kit[((st.toolIdx < 0 ? (shift ? 0 : -1) : st.toolIdx) + (shift ? n - 1 : 1)) % n];
            return r('→ ' + next, 'mode', (shift ? 'Previous' : 'Next') + ' tool for this puzzle: ' + next + ' (tools: ' + st.kit.join(', ') + ').');
        }
        // 14. Tab / Enter with a Tab set.
        if ((code === 'Tab' || code === 'Enter') && st.tab.length && !ctrl) {
            return r(shift ? 'prev. mode' : 'next mode', 'mode', (shift ? 'Previous' : 'Next') + ' mode in this link\'s Tab set: ' + st.tab.join(', ') + '.');
        }
        // 13. Surface without Ctrl cancels everything left.
        if (surface && !ctrl) {
            return blocked(BROWSER[code]);
        }
        if (alt) {
            return r('·', 'none', 'Nothing.');
        }
        return browser();

        function charKey() {
            if (mode === 'sudoku') {
                const sub = shift ? '2' : st.sub;
                const shown = isDigit ? d : (shift ? def.key : key);
                if (!isDigit && !isLetter) {
                    return r('·', 'none', 'Symbols are not entered in Sudoku.');
                }
                if (isLetter && 'zxcv'.indexOf(def.key) !== -1 && st.zxcv) {
                    return r('·', 'none', 'z/x/c/v are not entered while the Z/X/C/V shortcuts are on.');
                }
                const pre = {'1': '', '2': 'corner ', '3': 'centre '}[sub];
                return r(pre ? pre.trim() + (isLetter ? ' ' + shown : '') : (isLetter ? shown : 'value'), 'enter', (pre ? pre.trim() + ' mark ' : 'Value ') + shown + ' in the selected cells' +
                    (shift ? ' (Shift held = Corner).' : '.'));
            }
            if (mode === 'number') {
                const sub = st.sub;
                const pre = {'3': '¼ ', '9': 'side ', '7': 'cand. '}[sub] || '';
                return r(pre + (key === def.cap ? (pre ? '' : 'enter') : key), 'enter', 'Enters "' + key + '" at the cursor' + (sub === '1' && isDigit ? '; a second digit makes a two-digit number.' : '.'));
            }
            if (surface) {
                if (isDigit) {
                    const n = SURFACE_KEYS[d];
                    return r(swatchName(n), 'mode', 'Picks the ' + swatchName(n) + ' brush; paints nothing. Type 1 then 1/2 fast for colours 11/12.', swatch(n));
                }
                return blocked();
            }
            if (mode === 'multicolor') {
                if (isDigit) {
                    const n = MULTICOLOR_REMAP[parseInt(d, 10)];
                    const nn = n === 0 ? 10 : n;
                    return r(swatchName(nn), 'enter', 'Picks colour ' + swatchName(nn) + ' and paints the selection with it.', swatch(nn));
                }
                return r('·', 'none', 'Nothing in Multicolor.');
            }
            if (mode === 'symbol') {
                if (isDigit) {
                    return r('variant', 'enter', 'Places shape variant ' + d + ' at the cursor; the same digit again removes it.');
                }
                return r('·', 'none', 'Nothing in Shape.');
            }
            return r('·', 'none', 'Characters do nothing in this mode (the page still cancels them).');
        }

        function spaceKey() {
            if (mode === 'sudoku') {
                if (code === 'Space') {
                    const sub = shift ? '2' : st.sub;
                    return r('clear ' + SUDOKU_SUB[sub].toLowerCase(), 'enter', 'Space clears only this sub-mode\'s marks (key_space).');
                }
                if (shift) {
                    return r('clear corner', 'enter', 'Shift+Delete clears corner marks (class_p.js:8438).');
                }
                return r('clear all', 'enter', 'Delete clears values and every mark in the selection (class_p.js:8401).');
            }
            if (mode === 'number') {
                return r('clear', 'enter', 'Clears the cursor cell (key_space).');
            }
            if (mode === 'multicolor') {
                return r('clear colour', 'enter', 'Clears the selection\'s colour.');
            }
            if (mode === 'symbol') {
                return r('clear shape', 'enter', 'Removes the shape at the cursor.');
            }
            if (surface) {
                return blocked(code === 'Space' ? 'scroll' : null);
            }
            return code === 'Space' ? blocked('scroll') : r('·', 'none', 'Nothing in this mode.');
        }
    }

    // ---- Sending keys -----------------------------------------------------------------------------------------------

    let sending = false;

    /** Dispatch one keyboard event with keyCode/which set (the bridge's KeyboardEvent leaves them 0). */
    function fire(type, def, key, mods) {
        const ev = new KeyboardEvent(type, {
            key: key, code: def.code, shiftKey: !!mods.shift, ctrlKey: !!mods.ctrl, altKey: !!mods.alt,
            bubbles: true, cancelable: true
        });
        Object.defineProperty(ev, 'keyCode', {get: function() {
            return def.keyCode;
        }});
        Object.defineProperty(ev, 'which', {get: function() {
            return def.keyCode;
        }});
        document.body.dispatchEvent(ev);
    }

    const MOD_DEFS = {
        shift: k('ShiftLeft', 'Shift', 1, 'Shift', 'Shift', 16),
        ctrl: k('ControlLeft', 'Ctrl', 1, 'Control', 'Control', 17),
        alt: k('AltLeft', 'Alt', 1, 'Alt', 'Alt', 18)
    };

    /** Send def as a real typist would: modifiers down, the key down and up, modifiers up. */
    function pressKey(def, mods) {
        sending = true;
        try {
            const held = {shift: false, ctrl: false, alt: false};
            ['shift', 'ctrl', 'alt'].forEach(function(m) {
                if (mods[m]) {
                    held[m] = true;
                    fire('keydown', MOD_DEFS[m], MOD_DEFS[m].key, held);
                }
            });
            const key = mods.shift ? def.shifted : def.key;
            fire('keydown', def, key, held);
            fire('keyup', def, key, held);
            ['alt', 'ctrl', 'shift'].forEach(function(m) {
                if (mods[m]) {
                    held[m] = false;
                    fire('keyup', MOD_DEFS[m], MOD_DEFS[m].key, held);
                }
            });
        } finally {
            sending = false;
        }
    }

    // ---- Mount ------------------------------------------------------------------------------------------------------

    window.PrototypeVariants = window.PrototypeVariants || {};
    window.PrototypeVariants.K = {
        name: 'Live key map',

        /** @param {object} ctx see README.md, "The variant contract" */
        mount(ctx) {
            const B = ctx.bridge;
            const el = ctx.helpers.el;

            function btn(cls, label, onClick, title) {
                const b = el('button', {class: 'proto-k-btn ' + (cls || ''), type: 'button', tabindex: '-1'}, [label]);
                if (title) {
                    b.title = title;
                }
                b.addEventListener('mousedown', function(e) {
                    e.preventDefault();
                });
                b.addEventListener('click', function(e) {
                    e.preventDefault();
                    onClick(e);
                });
                return b;
            }

            // ---- Skeleton ---------------------------------------------------------------------------------------------
            const modeBar = el('div', {class: 'proto-k-modes'});
            const actions = el('div', {class: 'proto-k-actions'});
            const top = el('div', {class: 'proto-k-top'}, [
                el('div', {class: 'proto-k-brand'}, ['Penpa+']), modeBar, actions
            ]);
            const toolRow = el('div', {class: 'proto-k-tools'});
            const boardCard = el('div', {class: 'proto-k-boardcard'});
            const boardSlot = el('div', {class: 'proto-k-boardslot'}, [boardCard]);
            const title = el('div', {class: 'proto-k-title'});
            const byline = el('div', {class: 'proto-k-byline'});
            const rules = el('div', {class: 'proto-k-rules'});
            const status = el('div', {class: 'proto-k-status'});
            const timerText = el('span', {class: 'proto-k-timer'}, ['00:00']);
            const mouseCard = el('div', {class: 'proto-k-mouse'});
            const side = el('div', {class: 'proto-k-side'}, [mouseCard, status, title, byline, rules]);
            const main = el('div', {class: 'proto-k-main'}, [boardSlot, side]);
            const hint = el('div', {class: 'proto-k-hint'});
            const kbd = el('div', {class: 'proto-k-kbd'});
            const nav = el('div', {class: 'proto-k-nav'});
            const legend = el('div', {class: 'proto-k-legend'});
            const compact = el('div', {class: 'proto-k-compact'});
            const kbdToggle = btn('proto-k-kbdtoggle', '', function() {
                setKeyboardOpen(!keyboardOpen);
            }, 'Show / hide the full keyboard map (F1)');
            const deck = el('div', {class: 'proto-k-deck'}, [
                el('div', {class: 'proto-k-deckhead'}, [hint, kbdToggle]),
                compact,
                el('div', {class: 'proto-k-deckrow'}, [kbd, nav, el('div', {class: 'proto-k-deckside'}, [legend])])
            ]);
            let keyboardOpen = false;
            function setKeyboardOpen(on) {
                keyboardOpen = on;
                deck.classList.toggle('is-open', on);
                kbdToggle.textContent = on ? 'Hide keyboard  F1' : 'Full keyboard  F1';
                requestAnimationFrame(fitBoard);
            }
            const app = el('div', {class: 'proto-k-app'}, [top, toolRow, main, deck]);
            document.body.appendChild(app);
            ctx.helpers.adoptBoard(boardCard);
            ctx.helpers.hideLegacy();

            // ---- Puzzle info ------------------------------------------------------------------------------------------
            const info = B.getInfo();
            title.textContent = info.title || 'Untitled puzzle';
            byline.textContent = info.author ? 'by ' + info.author : '';
            rules.innerHTML = info.rules || '<em>No rules given.</em>';

            // ---- Actions ----------------------------------------------------------------------------------------------
            const undoBtn = btn('', 'Undo', function() {
                B.undo();
            }, 'Undo (Ctrl+Z)');
            const redoBtn = btn('', 'Redo', function() {
                B.redo();
            }, 'Redo (Ctrl+Y)');
            const checkBtn = btn('proto-k-check', 'Check', runCheck, 'Check the answer');
            const pauseBtn = btn('', 'Pause', function() {
                if (B.getTimer().paused) {
                    B.startTimer();
                } else {
                    B.pauseTimer();
                }
            }, 'Pause / start the timer (F4)');
            const rulesBtn = btn('', 'Rules', function() {
                B.showRules();
            });
            const clearBtn = btn('', 'Clear', function() {
                B.clear('all');
            }, 'Delete all entries (asks first)');
            const setBtn = btn('', '⚙', function() {
                B.openSettings();
            }, 'Settings');
            [undoBtn, redoBtn, el('span', {class: 'proto-k-sep'}), checkBtn, clearBtn, el('span', {class: 'proto-k-sep'}),
                timerText, pauseBtn, rulesBtn, setBtn].forEach(function(n) {
                actions.appendChild(n);
            });

            // ---- Mode bar ---------------------------------------------------------------------------------------------
            let showAll = false;
            const MODE_KEYS = {sudoku: 'Z X C', surface: 'V'};
            function renderModeBar(m) {
                modeBar.textContent = '';
                const modes = B.listModes({all: showAll}).filter(function(x) {
                    return x.mode !== 'board';
                });
                const zxcv = UserSettings.shortcuts_enabled && (m.mode === 'surface' || m.mode === 'sudoku');
                // With a tool kit of two or more, Tab is the kit's; Enter still walks the link's Tab set.
                const cycleKey = kit.tools.length > 1 ? 'Enter' : 'Tab';
                modes.forEach(function(x) {
                    const b = btn('proto-k-mode' + (x.mode === m.mode ? ' is-on' : '') + (x.hidden ? ' is-extra' : ''), x.label, function() {
                        B.setMode(x.mode);
                    }, x.inTabSet ? 'In this link\'s Tab set: ' + cycleKey + ' cycles it' : '');
                    if (zxcv && MODE_KEYS[x.mode]) {
                        b.appendChild(el('kbd', {}, [MODE_KEYS[x.mode]]));
                    } else if (x.inTabSet) {
                        b.appendChild(el('kbd', {}, [cycleKey]));
                    }
                    modeBar.appendChild(b);
                });
                modeBar.appendChild(btn('proto-k-more', showAll ? 'fewer' : 'all modes', function() {
                    showAll = !showAll;
                    renderModeBar(B.getMode());
                }, 'Show the modes this link hides (Penpa Lite)'));
            }

            // ---- Tool row ---------------------------------------------------------------------------------------------
            function chip(label, on, onClick, opts) {
                const b = btn('proto-k-chip' + (on ? ' is-on' : ''), '', onClick, opts && opts.title);
                if (opts && opts.color) {
                    b.appendChild(el('span', {class: 'proto-k-dot', style: 'background:' + opts.color}));
                }
                b.appendChild(document.createTextNode(label));
                if (opts && opts.kbd) {
                    b.appendChild(el('kbd', {}, [opts.kbd]));
                }
                return b;
            }

            function shapeOptions() {
                const out = [];
                document.querySelectorAll('#mode_symbolul1 > li').forEach(function(li) {
                    if (li.classList.contains('is_hidden') || li.style.display === 'none') {
                        return;
                    }
                    const head = li.querySelector(':scope > span[id^="ms1_"]') || li.querySelector(':scope > span[id^="ms_"]');
                    const group = head ? head.textContent.trim().split(/\s+/).slice(0, 2).join(' ') : '';
                    li.querySelectorAll('span[id^="ms_"]').forEach(function(s) {
                        const lab = s.textContent.trim();
                        out.push({value: s.id.slice(3), label: lab && lab !== group ? group + ' · ' + lab : group || s.id.slice(3)});
                    });
                });
                return out;
            }

            function selectBox(items, current, onPick) {
                const sel = el('select', {class: 'proto-k-select', tabindex: '-1'});
                items.forEach(function(it) {
                    const o = el('option', {value: it.value}, [it.label]);
                    if (String(it.value) === String(current)) {
                        o.selected = true;
                    }
                    sel.appendChild(o);
                });
                sel.addEventListener('change', function() {
                    onPick(sel.value);
                    sel.blur();
                });
                return sel;
            }

            // ---- This puzzle's tool kit ------------------------------------------------------------------------------
            const kit = inferKit(B);

            /** Index of the kit tool the board is in now, or -1. */
            function toolIndex() {
                const cur = B.getMode();
                for (let i = 0; i < kit.tools.length; i++) {
                    const t = kit.tools[i];
                    if (t.mode === cur.mode && (t.sub == null || String(t.sub) === String(cur.submode))) {
                        return i;
                    }
                }
                return -1;
            }

            function setTool(i) {
                const t = kit.tools[i];
                if (!t) {
                    return;
                }
                B.setMode(t.mode);
                if (t.mode === 'combi') {
                    B.setComposite(t.sub);
                } else if (t.sub != null) {
                    B.setSubmode(t.sub);
                }
            }

            function cycleTool(dir) {
                const n = kit.tools.length;
                const i = toolIndex();
                setTool(i < 0 ? (dir > 0 ? 0 : n - 1) : (i + dir + n) % n);
            }

            function renderTools(m) {
                toolRow.textContent = '';
                const mode = m.mode;
                const label = function(t) {
                    toolRow.appendChild(el('span', {class: 'proto-k-toollabel'}, [t]));
                };
                if (kit.tools.length) {
                    const cur = toolIndex();
                    toolRow.appendChild(el('span', {class: 'proto-k-genre'}, [kit.genre || 'This puzzle']));
                    kit.tools.forEach(function(t, i) {
                        const isNext = kit.tools.length > 1 && i === (cur < 0 ? 0 : (cur + 1) % kit.tools.length);
                        const b = chip(t.label, i === cur, function() {
                            setTool(i);
                        }, {kbd: isNext ? 'Tab' : null, title: 'Tool ' + (i + 1) + ' of ' + kit.tools.length + ' for this puzzle. Tab / Shift+Tab cycles them.'});
                        b.classList.add('proto-k-kit');
                        toolRow.appendChild(b);
                    });
                    toolRow.appendChild(el('span', {class: 'proto-k-sep'}));
                }
                if (mode === 'combi') {
                    label('Tool');
                    toolRow.appendChild(selectBox(B.listComposite().map(function(c) {
                        return {value: c.name, label: c.label};
                    }), m.submode, B.setComposite));
                } else if (mode === 'symbol') {
                    label('Shape');
                    toolRow.appendChild(selectBox(shapeOptions(), m.submode, B.setShape));
                } else if (mode !== 'surface' && mode !== 'multicolor') {
                    const fb = SUBMODE_FALLBACK[mode] || {};
                    const subs = B.listSubmodes(mode);
                    if (subs.length) {
                        label(mode === 'sudoku' ? 'Marks' : 'Kind');
                    }
                    subs.forEach(function(s) {
                        const kb = mode === 'sudoku' && UserSettings.shortcuts_enabled ? {'1': 'Z', '2': 'X · Shift', '3': 'C · Ctrl'}[s.value] : null;
                        toolRow.appendChild(chip(s.label || fb[s.value] || s.value, String(s.value) === String(m.submode), function() {
                            B.setSubmode(s.value);
                        }, {kbd: kb}));
                    });
                }
                // Styles (colours). For Surface/Multicolor the digit keys pick them; show the key on each chip.
                const styles = B.listStyles(mode);
                if (styles.length) {
                    label(mode === 'surface' ? 'Brush' : mode === 'multicolor' ? 'Colour' : 'Style');
                    styles.forEach(function(s) {
                        const lb = document.getElementById(s.id + '_lb');
                        const bg = lb ? getComputedStyle(lb).backgroundColor : '';
                        const isColour = bg && bg !== 'rgba(0, 0, 0, 0)' && bg !== 'transparent' && s.label.length <= 4;
                        const paint = mode === 'surface' || mode === 'multicolor';
                        const name = paint ? s.label.replace(/\d+$/, '') : s.label;
                        const keyHint = paint ? (s.label.match(/\d+$/) || [''])[0] : '';
                        toolRow.appendChild(chip(name || String(s.value), String(s.value) === String(m.style), function() {
                            B.setStyle(s.value);
                        }, {color: isColour ? bg : null, kbd: keyHint && keyHint.length === 1 ? keyHint : (keyHint ? '1,' + keyHint.slice(1) : null)}));
                    });
                }
            }

            // ---- Keyboard diagram -------------------------------------------------------------------------------------
            const latched = {shift: false, ctrl: false, alt: false};
            const physical = {shift: false, ctrl: false, alt: false};
            const keyEls = {};    // code -> [elements]
            const defs = {};      // code -> def

            function modOf(code) {
                return /^Shift/.test(code) ? 'shift' : /^Control/.test(code) ? 'ctrl' : /^Alt/.test(code) ? 'alt' : null;
            }

            function buildKey(def, parent) {
                if (def.gap != null) {
                    parent.appendChild(el('span', {class: 'proto-k-gap', style: '--w:' + def.gap}));
                    return;
                }
                const cap = el('span', {class: 'proto-k-cap'}, [def.cap]);
                const text = el('span', {class: 'proto-k-txt'});
                const node = el('div', {class: 'proto-k-key', style: '--w:' + def.w, 'data-code': def.code}, [cap, text]);
                node._cap = cap;
                node._txt = text;
                node.addEventListener('mousedown', function(e) {
                    e.preventDefault();
                });
                node.addEventListener('click', function(e) {
                    e.preventDefault();
                    clickKey(def);
                });
                node.addEventListener('mouseenter', function() {
                    hovered = def;
                    renderHint();
                });
                node.addEventListener('mouseleave', function() {
                    hovered = null;
                    renderHint();
                });
                (keyEls[def.code] = keyEls[def.code] || []).push(node);
                defs[def.code] = def;
                parent.appendChild(node);
            }

            const fRow = el('div', {class: 'proto-k-row proto-k-frow'});
            F_ROW.forEach(function(d) {
                buildKey(d, fRow);
            });
            kbd.appendChild(fRow);
            MAIN_ROWS.forEach(function(row) {
                const r = el('div', {class: 'proto-k-row'});
                row.forEach(function(d) {
                    buildKey(d, r);
                });
                kbd.appendChild(r);
            });
            nav.appendChild(el('div', {class: 'proto-k-row proto-k-frow proto-k-navhead'}, ['']));
            NAV_ROWS.forEach(function(row) {
                const r = el('div', {class: 'proto-k-row'});
                row.forEach(function(d) {
                    buildKey(d, r);
                });
                nav.appendChild(r);
            });
            KIND_LEGEND.forEach(function(l) {
                legend.appendChild(el('span', {class: 'proto-k-leg proto-k-kind-' + l[0]}, [el('i'), l[1]]));
            });

            function mods() {
                return {
                    shift: latched.shift || physical.shift,
                    ctrl: latched.ctrl || physical.ctrl,
                    alt: latched.alt || physical.alt
                };
            }

            let hovered = null;
            let lastSt = null;

            function keyState() {
                const m = B.getMode();
                const mo = mods();
                return {
                    mode: m.mode, sub: String(m.submode), shift: mo.shift, ctrl: mo.ctrl, alt: mo.alt,
                    tab: B.tabSet(), zxcv: !!UserSettings.shortcuts_enabled,
                    panel: (document.getElementById('panel_button') || {}).value === '1',
                    kit: kit.tools.map(function(t) {
                        return t.label;
                    }),
                    toolIdx: toolIndex()
                };
            }

            function renderKeys() {
                const st = keyState();
                lastSt = st;
                Object.keys(keyEls).forEach(function(code) {
                    const def = defs[code];
                    const d = describeKey(def, st);
                    const capText = (st.shift && st.mode === 'number' && def.shifted !== def.key && def.shifted.length === 1) ? def.shifted : def.cap;
                    keyEls[code].forEach(function(node) {
                        node.className = 'proto-k-key proto-k-kind-' + d.kind;
                        const mod = modOf(code);
                        if (mod && latched[mod]) {
                            node.classList.add('is-latched');
                        }
                        if (mod && physical[mod]) {
                            node.classList.add('is-down');
                        }
                        node._cap.textContent = capText;
                        node._txt.textContent = d.kind === 'none' ? '' : d.text;
                        node._txt.style.setProperty('--sw', d.swatch || 'transparent');
                        node.classList.toggle('has-swatch', !!d.swatch);
                        node.title = d.tip;
                    });
                });
                const layer = ['ctrl', 'shift', 'alt'].filter(function(x) {
                    return st[x];
                }).map(function(x) {
                    return {ctrl: 'Ctrl', shift: 'Shift', alt: 'Alt'}[x];
                }).join('+');
                kbd.dataset.layer = layer;
                renderCompact(st);
                renderHint();
                renderMouse(st);
            }

            // ---- Compact key strip: only the keys that do something here, always on screen ---------------------------
            const USEFUL = {enter: 1, mode: 1, nav: 1, cmd: 1};

            function compactItems(st) {
                const items = [];
                const desc = function(code) {
                    return describeKey(defs[code], st);
                };
                const digits = '1234567890'.split('').map(function(c) {
                    return {k: c, d: desc('Digit' + c)};
                }).filter(function(x) {
                    return USEFUL[x.d.kind];
                });
                if (digits.length && digits.every(function(x) {
                    return x.d.text === digits[0].d.text && !x.d.swatch;
                })) {
                    items.push({k: digits.length === 10 ? '0-9' : digits.map(function(x) {
                        return x.k;
                    }).join(' '), d: digits[0].d});
                } else {
                    items.push.apply(items, digits);
                }
                const byText = {};
                'ABCDEFGHIJKLMNOPQRSTUVWXYZ'.split('').forEach(function(c) {
                    const d = desc('Key' + c);
                    if (USEFUL[d.kind]) {
                        (byText[d.text] = byText[d.text] || {d: d, ks: []}).ks.push(c);
                    }
                });
                Object.keys(byText).forEach(function(t) {
                    const g = byText[t];
                    if (g.ks.length > 5) {
                        items.push({k: 'A-Z', d: g.d});
                    } else {
                        g.ks.forEach(function(c) {
                            items.push({k: c, d: desc('Key' + c)});
                        });
                    }
                });
                const arrow = desc('ArrowUp');
                if (USEFUL[arrow.kind]) {
                    items.push({k: '← ↑ → ↓', d: arrow});
                }
                ['Tab', 'Space', 'Delete', 'Backspace', 'Escape', 'Enter', 'F4'].forEach(function(code) {
                    const d = desc(code);
                    if (USEFUL[d.kind]) {
                        items.push({k: defs[code].cap, d: d});
                    }
                });
                ['ShiftLeft', 'ControlLeft'].forEach(function(code) {
                    const d = desc(code);
                    if (/^hold/.test(d.text)) {
                        items.push({k: defs[code].cap, d: {text: d.text, kind: 'modifier', tip: d.tip}});
                    }
                });
                if (!st.ctrl && !st.shift && !st.alt) {
                    const cst = Object.assign({}, st, {ctrl: true});
                    ['KeyZ', 'KeyY'].forEach(function(code) {
                        items.push({k: 'Ctrl+' + defs[code].cap, d: describeKey(defs[code], cst)});
                    });
                }
                return items;
            }

            function renderCompact(st) {
                compact.textContent = '';
                compact.appendChild(el('span', {class: 'proto-k-compacthead'}, ['Keys']));
                compactItems(st).forEach(function(it) {
                    const node = el('span', {class: 'proto-k-ci proto-k-kind-' + it.d.kind, title: it.d.tip}, [
                        el('kbd', {}, [it.k]), el('span', {class: 'proto-k-citxt'}, [it.d.text])
                    ]);
                    if (it.d.swatch) {
                        node.querySelector('.proto-k-citxt').prepend(el('i', {class: 'proto-k-ciswatch', style: 'background:' + it.d.swatch}));
                    }
                    compact.appendChild(node);
                });
                if (st.mode === 'surface') {
                    compact.appendChild(el('span', {class: 'proto-k-ci proto-k-kind-blocked'}, [el('span', {class: 'proto-k-citxt'}, ['every other key is swallowed here'])]));
                }
            }

            function modeName(st) {
                const ms = B.listModes({all: true}).find(function(x) {
                    return x.mode === st.mode;
                });
                let name = ms ? ms.label : st.mode;
                if (st.mode === 'sudoku') {
                    name += ' › ' + SUDOKU_SUB[st.sub];
                } else if (st.mode === 'combi') {
                    const t = B.listComposite().find(function(c) {
                        return c.name === st.sub;
                    });
                    name += ' › ' + (t ? t.label : st.sub);
                } else if (st.mode !== 'symbol' && st.mode !== 'surface' && st.mode !== 'multicolor') {
                    const s = B.listSubmodes(st.mode).find(function(x) {
                        return String(x.value) === st.sub;
                    });
                    const fb = SUBMODE_FALLBACK[st.mode] || {};
                    const lab = s ? (s.label || fb[s.value]) : '';
                    if (lab) {
                        name += ' › ' + lab;
                    }
                }
                return name;
            }

            // ---- Mouse: what the pointer is over, and the last real press ------------------------------------------
            let boardTarget = null;   // 'cell' | 'edge' | 'corner' | null (pointer off the board)
            const TARGET_OF_TYPE = {0: 'cell', 1: 'corner', 2: 'edge', 3: 'edge'};

            function targetAt(pageX, pageY) {
                const i = B.pageToPoint(pageX, pageY, [0, 1, 2, 3]);
                return i == null ? null : (TARGET_OF_TYPE[pu.point[i].type] || 'cell');
            }

            function rowMatches(row, target) {
                return !row.at || !target || row.at === target || (row.at === 'corner' && target === 'edge');
            }

            function glyph(g) {
                return el('span', {class: 'proto-k-ms proto-k-ms-' + g}, [el('i'), el('i')]);
            }

            function gestureText(row) {
                return el('b', {}, [(row.mod ? row.mod + '+' : '') + GESTURE[row.g]].concat(row.at ? [el('small', {}, [AT_SHORT[row.at]])] : []));
            }

            function renderHint() {
                const st = lastSt || keyState();
                hint.textContent = '';
                const layer = kbd.dataset.layer;
                hint.appendChild(el('span', {class: 'proto-k-hintmode'}, [modeName(st)]));
                if (layer) {
                    hint.appendChild(el('span', {class: 'proto-k-hintlayer'}, ['holding ' + layer]));
                }
                if (hovered) {
                    const d = describeKey(hovered, st);
                    const combo = (layer && !modOf(hovered.code) ? layer + '+' : '') + hovered.cap;
                    hint.appendChild(el('span', {class: 'proto-k-hinttip'}, [el('b', {}, [combo]), ' ' + d.tip]));
                } else if (boardTarget) {
                    const rows = mouseRows(st.mode, st.sub).filter(function(r) {
                        return !r.mod && rowMatches(r, boardTarget) && r.g !== 'dbl';
                    });
                    hint.appendChild(el('span', {class: 'proto-k-hintat'}, ['pointer ' + AT[boardTarget]]));
                    rows.forEach(function(r) {
                        hint.appendChild(el('span', {class: 'proto-k-hintrow'}, [glyph(r.g), el('b', {}, [GESTURE[r.g]]), ' ' + r.does]));
                    });
                } else {
                    hint.appendChild(el('span', {class: 'proto-k-hinttip proto-k-dim'}, [
                        'Point at the board to see what each button does there. Hover a key for details; click it to press it.'
                    ]));
                }
            }

            let mouseRowEls = [];
            function renderMouse(st) {
                mouseCard.textContent = '';
                const i = toolIndex();
                const head = el('div', {class: 'proto-k-mousehead'}, [
                    el('span', {}, ['Mouse']),
                    el('b', {}, [i >= 0 ? kit.tools[i].label : modeName(st)])
                ]);
                mouseCard.appendChild(head);
                mouseRowEls = mouseRows(st.mode, st.sub).map(function(r) {
                    const row = el('div', {class: 'proto-k-mouserow'}, [
                        glyph(r.g), gestureText(r), el('span', {}, [r.does])
                    ]);
                    row._r = r;
                    mouseCard.appendChild(row);
                    return row;
                });
                markTarget();
                if (kit.tools.length > 1) {
                    mouseCard.appendChild(el('div', {class: 'proto-k-mousefoot'}, [el('kbd', {}, ['Tab']), ' next tool: ' +
                        kit.tools[(i < 0 ? 0 : i + 1) % kit.tools.length].label]));
                }
            }

            function markTarget() {
                mouseRowEls.forEach(function(row) {
                    row.classList.toggle('is-off', !rowMatches(row._r, boardTarget));
                });
            }

            let press = null;
            ctx.canvas.addEventListener('mousemove', function(e) {
                const t = targetAt(e.pageX, e.pageY);
                if (t !== boardTarget) {
                    boardTarget = t;
                    markTarget();
                    renderHint();
                }
            });
            ctx.canvas.addEventListener('mouseleave', function() {
                boardTarget = null;
                markTarget();
                renderHint();
            });
            ctx.canvas.addEventListener('mousedown', function(e) {
                press = {button: e.button, x: e.pageX, y: e.pageY, at: targetAt(e.pageX, e.pageY), moved: false};
            });
            window.addEventListener('mousemove', function(e) {
                if (press && Math.abs(e.pageX - press.x) + Math.abs(e.pageY - press.y) > 8) {
                    press.moved = true;
                }
            });
            window.addEventListener('mouseup', function() {
                if (!press) {
                    return;
                }
                const g = (press.button === 2 ? 'r' : 'l') + (press.moved ? 'drag' : '');
                const gg = {l: 'left', r: 'right', ldrag: 'ldrag', rdrag: 'rdrag'}[g];
                const at = press.at;
                press = null;
                mouseRowEls.forEach(function(row) {
                    if (row._r.g === gg && !row._r.mod && rowMatches(row._r, at)) {
                        row.classList.remove('is-flash');
                        void row.offsetWidth;
                        row.classList.add('is-flash');
                    }
                });
            });

            function flash(code) {
                (keyEls[code] || []).forEach(function(node) {
                    node.classList.remove('is-flash');
                    void node.offsetWidth;
                    node.classList.add('is-flash');
                });
            }

            function clickKey(def) {
                const mod = modOf(def.code);
                if (mod) {
                    latched[mod] = !latched[mod];
                    renderKeys();
                    return;
                }
                flash(def.code);
                const mo = mods();
                if (def.code === 'Tab' && !mo.ctrl && !mo.alt && kit.tools.length > 1) {
                    // Our own key: pressKey would skip our listener (it ignores what we send), so act directly.
                    cycleTool(mo.shift ? -1 : 1);
                    return;
                }
                if (def.code === 'F1') {
                    setKeyboardOpen(!keyboardOpen);
                    return;
                }
                pressKey(def, mo);
                // Penpa+ redraws itself; refresh the labels next frame (sub-mode may have changed).
                requestAnimationFrame(renderKeys);
            }

            function typing(e) {
                const t = e.target;
                return t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.tagName === 'SELECT' || t.isContentEditable);
            }

            // Physical keys: light up and track held modifiers. Capture on window, before Penpa+'s document listener.
            // Two keys are ours: Tab cycles the tool kit, F1 shows / hides the full keyboard. They stop here; the
            // `sending` guard keeps the events pressKey dispatches from re-entering this listener.
            window.addEventListener('keydown', function(e) {
                if (sending) {
                    return;
                }
                const mod = modOf(e.code);
                if (mod && !physical[mod]) {
                    physical[mod] = true;
                    renderKeys();
                }
                flash(e.code);
                (keyEls[e.code] || []).forEach(function(n) {
                    n.classList.add('is-down');
                });
                const legacyDialog = document.querySelector('.swal2-container, #modal[style*="block"]');
                if (!typing(e) && !legacyDialog && !e.ctrlKey && !e.altKey &&
                    ((e.code === 'Tab' && kit.tools.length > 1) || e.code === 'F1')) {
                    e.preventDefault();
                    e.stopImmediatePropagation();
                    if (e.code === 'Tab') {
                        cycleTool(e.shiftKey ? -1 : 1);
                    } else {
                        setKeyboardOpen(!keyboardOpen);
                    }
                }
            }, true);
            window.addEventListener('keyup', function(e) {
                if (sending) {
                    return;
                }
                (keyEls[e.code] || []).forEach(function(n) {
                    n.classList.remove('is-down');
                });
                const mod = modOf(e.code);
                if (mod && physical[mod]) {
                    physical[mod] = false;
                    // Penpa+ restores the Sudoku sub-mode in its own keyup listener, after this one.
                    requestAnimationFrame(renderKeys);
                    renderKeys();
                }
            }, true);
            window.addEventListener('blur', function() {
                physical.shift = physical.ctrl = physical.alt = false;
                document.querySelectorAll('.proto-k-key.is-down').forEach(function(n) {
                    n.classList.remove('is-down');
                });
                renderKeys();
            });

            // ---- Board fit --------------------------------------------------------------------------------------------
            function fitBoard() {
                const r = ctx.canvas.getBoundingClientRect();
                if (!r.width || !pu.size) {
                    return;
                }
                const availW = boardSlot.clientWidth - 16;
                const availH = boardSlot.clientHeight - 16;
                const px = Math.max(12, Math.min(90, Math.floor(Math.min(availW / (r.width / pu.size), availH / (r.height / pu.size)))));
                if (Math.abs(px - pu.size) >= 1) {
                    B.setCellSize(px);
                }
            }
            let fitTimer = null;
            window.addEventListener('resize', function() {
                clearTimeout(fitTimer);
                fitTimer = setTimeout(fitBoard, 120);
            });
            requestAnimationFrame(function() {
                fitBoard();
                requestAnimationFrame(function() {
                    requestAnimationFrame(fitBoard);
                });
            });

            // ---- Answer check -----------------------------------------------------------------------------------------
            let checkPos = -1;
            function runCheck() {
                const res = B.check();
                checkPos = B.history().position;
                setStatus(!res.hasAnswerCheck ? 'none' : res.solved ? 'solved' : 'wrong');
            }
            function setStatus(kind) {
                status.className = 'proto-k-status' + (kind ? ' is-' + kind : '');
                status.textContent = kind ? {
                    solved: 'Solved: the board matches the answer.',
                    wrong: 'Not solved yet: the board does not match the answer.',
                    none: 'This link has no answer check.'
                }[kind] : '';
            }

            // ---- Render ----------------------------------------------------------------------------------------------
            let lastKey = '';
            function render(state) {
                const m = B.getMode();
                const key = m.mode + '|' + m.submode + '|' + m.style;
                if (key !== lastKey) {
                    lastKey = key;
                    renderModeBar(m);
                    renderTools(m);
                    renderKeys();
                }
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
            // Start on the main tool, whatever mode the link opened in (Galaxies opens on Sudoku, Nurikabe on Surface).
            if (kit.tools.length && toolIndex() !== 0) {
                setTool(0);
            }
            setKeyboardOpen(false);
            B.onChange(render);
            B.onTimer(function(t) {
                timerText.textContent = t.text;
            });
            render(B.getState());
        }
    };
})();
