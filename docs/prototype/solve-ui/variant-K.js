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
 * Bridge gaps worked around here:
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

    /** Mouse grammar per mode (Penpa+ README lines 126, 217-247; research/penpa-mode-key-map.md § clicks). */
    const MOUSE = {
        sudoku: [['Click', 'select a cell'], ['Drag', 'select many'], ['Ctrl/Shift+click', 'add to selection'],
            ['Double-click', 'select similar'], ['Alt+drag', 'select a rectangle']],
        number: [['Click', 'put the cursor'], ['Drag', 'select many'], ['Double-click', 'select similar'],
            ['Alt+drag', 'select a rectangle']],
        multicolor: [['Click', 'select a cell'], ['Drag', 'select many'], ['Alt+drag', 'select a rectangle'],
            ['then', 'type a digit to colour']],
        surface: [['Left', 'paint the brush'], ['Right', 'paint 2nd colour (green)'], ['Drag', 'paint many'],
            ['Click again', 'erase'], ['Alt+drag', 'paint a rectangle']],
        line: [['Drag', 'draw a line'], ['Drag again', 'erase it'], ['Helper: right', 'x on an edge']],
        lineE: [['Drag', 'draw on edges'], ['Drag again', 'erase it'], ['Helper: right', 'x on an edge']],
        wall: [['Drag', 'draw a wall'], ['Drag again', 'erase it']],
        symbol: [['Click', 'put the cursor, place shape'], ['Click again', 'cycle variant']],
        special: [['Drag', 'draw the object']],
        cage: [['Drag', 'draw a cage']],
        move: [['Drag', 'move an item']],
        combi: [['Left', 'the tool\'s mark'], ['Right', 'its auxiliary mark']]
    };
    const COMBI_MOUSE = {
        blpo: [['Left', 'black (twice: dot)'], ['Right', 'dot (twice: black)'], ['Drag', 'many']],
        blwh: [['Left', 'white (twice: black)'], ['Right', 'black (twice: white)'], ['Drag', 'many']],
        linex: [['Left drag', 'line'], ['Right', 'x on an edge'], ['Right drag', 'many x']],
        lineox: [['Left', 'O (twice: x)'], ['Left drag', 'line'], ['Right', 'x (twice: O)']],
        edgex: [['Left drag', 'edge'], ['Right', 'x on an edge'], ['Right drag', 'many x']],
        edgexoi: [['Left drag', 'edge'], ['Right', 'x on an edge']],
        yajilin: [['Left', 'black'], ['Left drag', 'loop'], ['Right', 'dot / x on edge']],
        hashi: [['Drag', 'bridge'], ['Drag again', 'double bridge']],
        star: [['Left', 'star'], ['Right', 'x'], ['Right drag', 'many x'], ['Right edge', 'dot']],
        tents: [['Left', 'tent'], ['Drag', 'link to tree'], ['Right', 'x']],
        mines: [['Left', 'mine'], ['Right', 'x'], ['Right drag', 'many x']],
        akari: [['Left', 'light'], ['Left drag', 'dotted line'], ['Right', 'dot / x on edge']],
        battleship: [['Left', 'cycle ship / water'], ['Drag', 'ship segment'], ['Right drag', 'water']],
        doublemines: [['Left', '1 mine (twice: 2)'], ['Right', 'x'], ['Right drag', 'many x']]
    };

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
            const side = el('div', {class: 'proto-k-side'}, [title, byline, rules, status]);
            const main = el('div', {class: 'proto-k-main'}, [boardSlot, side]);
            const hint = el('div', {class: 'proto-k-hint'});
            const kbd = el('div', {class: 'proto-k-kbd'});
            const nav = el('div', {class: 'proto-k-nav'});
            const mouseCard = el('div', {class: 'proto-k-mouse'});
            const legend = el('div', {class: 'proto-k-legend'});
            const deck = el('div', {class: 'proto-k-deck'}, [
                hint,
                el('div', {class: 'proto-k-deckrow'}, [kbd, nav, el('div', {class: 'proto-k-deckside'}, [mouseCard, legend])])
            ]);
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
                modes.forEach(function(x) {
                    const b = btn('proto-k-mode' + (x.mode === m.mode ? ' is-on' : '') + (x.hidden ? ' is-extra' : ''), x.label, function() {
                        B.setMode(x.mode);
                    }, x.inTabSet ? 'In this link\'s Tab set: Tab / Enter cycles it' : '');
                    if (zxcv && MODE_KEYS[x.mode]) {
                        b.appendChild(el('kbd', {}, [MODE_KEYS[x.mode]]));
                    } else if (x.inTabSet) {
                        b.appendChild(el('kbd', {}, ['Tab']));
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

            function renderTools(m) {
                toolRow.textContent = '';
                const mode = m.mode;
                const label = function(t) {
                    toolRow.appendChild(el('span', {class: 'proto-k-toollabel'}, [t]));
                };
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
                    panel: (document.getElementById('panel_button') || {}).value === '1'
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
                renderHint();
                renderMouse(st);
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
                } else {
                    hint.appendChild(el('span', {class: 'proto-k-hinttip proto-k-dim'}, [
                        'Click a key to press it. Click Shift, Ctrl or Alt to latch that layer. Hover for details.'
                    ]));
                }
            }

            function renderMouse(st) {
                mouseCard.textContent = '';
                mouseCard.appendChild(el('div', {class: 'proto-k-mousehead'}, ['Mouse']));
                const rows = (st.mode === 'combi' && COMBI_MOUSE[st.sub]) || MOUSE[st.mode] || [];
                rows.forEach(function(r) {
                    mouseCard.appendChild(el('div', {class: 'proto-k-mouserow'}, [el('b', {}, [r[0]]), el('span', {}, [r[1]])]));
                });
            }

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
                pressKey(def, mods());
                // Penpa+ redraws itself; refresh the labels next frame (sub-mode may have changed).
                requestAnimationFrame(renderKeys);
            }

            // Physical keys: light up and track held modifiers. Capture on window, before Penpa+'s document listener.
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
            B.onChange(render);
            B.onTimer(function(t) {
                timerText.textContent = t.text;
            });
            render(B.getState());
        }
    };
})();
