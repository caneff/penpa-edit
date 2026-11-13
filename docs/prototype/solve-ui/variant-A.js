/*
 * PROTOTYPE (throwaway, branch prototype/solve-ui): solve-UI variant A, "Dock (baseline)".
 * Owned by variant A's builder: this file and variant-A.css only. See README.md for the contract.
 *
 * The idea: the conventional, SudokuPad-shaped layout. The board as large as fits on the left; a right-hand dock with,
 * top to bottom, the puzzle (title, timer, rules), a mode palette grouped by the six mode families (GLOSSARY.md), the
 * current mode's tools (sub-modes, styles, Composite tools, shapes), a digit pad with Normal / Corner / Centre / Colour,
 * and an action row (undo, redo, delete, check, reset, settings). The current mode is shown three ways: a pill above
 * the board in the family's colour, the board's frame in that colour, and the lit buttons in the dock.
 *
 * The claim it tests: the familiar layout, done cleanly, is enough; Penpa+'s modes fit a SudokuPad-style dock without
 * a new interaction idea.
 *
 * Round 2 (judged on Logic Masters genres, not sudoku): with all 12 modes visible the round-1 dock became a long
 * scrolling sheet. Now the dock leads with "Solve with": two or three ready tools read from the puzzle (its answer check,
 * rules and visible modes), e.g. Masyu gets "Loop + edge x" and "Loop + cell marks", Fillomino "Numbers" and
 * "Borders + x". Tab cycles them. The twelve modes shrink to a 4x3 grid under them, the Composite list folds
 * behind the current tool, and each tool shows its mouse legend (left / right / drag) instead of a sentence.
 *
 * Bridge gaps worked around here (read `pu` / the legacy DOM directly):
 *   - No tool/genre hint: "Solve with" infers tools from answerCheckInfo() text, the rules and the title (keywords).
 *   - Tab: Penpa+ cycles only a link's Tab set; a capture-phase keydown here takes Tab for the "Solve with" tools.
 *   - Shapes: no listShapes(); the Shape list is read from the legacy menu (#mode_symbol, ms1_* / ms_* spans).
 *   - Number sub-modes 3 and 9 have empty legacy labels (they are images); named here "1/4" and "Side".
 *   - Style swatch colours: read from the legacy label's computed background (`<id>_lb`).
 *   - Board fit: setCellSize() takes px per cell, so the canvas's px-per-cell ratio is measured here (rect / pu.size).
 */
(function() {
    'use strict';

    /** The six mode families (research/penpa-mode-key-map.md), in palette order. */
    const FAMILIES = [
        {key: 'value', label: 'Value', modes: ['sudoku', 'number'], color: '#5aa9ff'},
        {key: 'paint', label: 'Paint', modes: ['surface', 'multicolor'], color: '#f2b84b'},
        {key: 'path', label: 'Path', modes: ['line', 'lineE', 'wall'], color: '#5fd68a'},
        {key: 'stamp', label: 'Stamp', modes: ['symbol', 'special', 'cage'], color: '#c48bff'},
        {key: 'genre', label: 'Genre', modes: ['combi'], color: '#ff7a8a'},
        {key: 'move', label: 'Move', modes: ['move'], color: '#9aa4b2'}
    ];

    /** One-line "how to use" per mode, shown under the mode pill. */
    const HINTS = {
        sudoku: 'Click or drag to select cells, then type. Hold Shift for Corner, Ctrl for Centre.',
        number: 'Click a cell, then type digits or letters. Arrows move the cursor.',
        surface: 'Click or drag to paint. Right-click paints the second colour. Digit keys pick the brush.',
        multicolor: 'Select cells, then pick a colour (or type its digit). Delete clears.',
        line: 'Drag through cell centres to draw. Helper puts x marks.',
        lineE: 'Drag along cell edges to draw.',
        wall: 'Drag to draw walls.',
        symbol: 'Click a cell to place the shape; click again to cycle. Digits pick the variant.',
        special: 'Drag across cells to draw the object.',
        cage: 'Drag across cells to draw a cage.',
        combi: 'Left click places the tool\'s mark; right click its auxiliary mark. Drag where the tool draws lines.',
        move: 'Drag an item to move it.'
    };

    /** Composite tools whose mouse grammar differs from the generic hint (Penpa+ README § Composite). */
    const TOOL_HINTS = {
        blpo: 'Left click shades (twice: dot); right click dots. Drag for many.',
        blwh: 'Left click a white circle (twice: black); right click a black one. Drag for many.',
        linex: 'Left drag draws the line; right click an edge for an x (drag for many).',
        lineox: 'Left click O (twice: x), left drag draws the line; right click x.',
        edgex: 'Left drag draws edges; right click an edge for an x (drag for many).',
        edgexoi: 'Left drag draws edges; right click an edge for an x.',
        yajilin: 'Left click shades, left drag draws the loop; right click dots a cell or crosses an edge.',
        hashi: 'Drag between islands for a bridge; draw it again for a double.',
        star: 'Left click a star; right click an x (drag for many); right click an edge or corner for a dot.',
        tents: 'Left click a tent, drag to link it to its tree; right click an x.',
        akari: 'Left click a light; right click dots a cell or crosses an edge.',
        mines: 'Left click a mine; right click an x (drag for many).'
    };

    /** Mouse legend per Composite tool: [gesture, effect] (Penpa+ README § Composite, checked by hand). */
    const TOOL_LEGEND = {
        blpo: [['Click', 'shade (again: dot)'], ['Right', 'dot'], ['Drag', 'many']],
        blwh: [['Click', 'white (again: black)'], ['Right', 'black'], ['Drag', 'many']],
        linex: [['Drag', 'loop through centres'], ['Right edge', '× on the edge'], ['Right drag', 'many ×']],
        lineox: [['Drag', 'loop through centres'], ['Click', '○ in cell (again: ×)'], ['Right', '× in cell']],
        edgex: [['Drag', 'line on edges'], ['Right edge', '× on the edge'], ['Right drag', 'many ×']],
        edgexoi: [['Drag', 'line on edges'], ['Right edge', '×'], ['Click cell', 'inside / outside']],
        yajilin: [['Click', 'shade'], ['Drag', 'loop'], ['Right', 'dot in cell, × on edge']],
        star: [['Click', 'star'], ['Right', '×'], ['Right drag', 'many ×'], ['Right edge', 'dot']],
        akari: [['Click', 'bulb'], ['Right', 'dot in cell, × on edge'], ['Drag', 'dotted line']],
        battleship: [['Click', 'cycle ● ■ · water'], ['Drag', 'ship end, toward the ship'], ['Right drag', 'water']],
        tents: [['Click', 'tent'], ['Drag', 'link tent to tree'], ['Right', '×']],
        mines: [['Click', 'mine'], ['Right', '×'], ['Right drag', 'many ×']],
        hashi: [['Drag', 'bridge (again: double)']]
    };

    /** Mouse / key legend per plain mode. */
    const MODE_LEGEND = {
        sudoku: [['Click/drag', 'select'], ['Type', 'digit'], ['Shift / Ctrl', 'corner / centre']],
        number: [['Click', 'select cell'], ['Type', 'digit or letter'], ['Delete', 'clear']],
        surface: [['Click/drag', 'paint'], ['Right', 'second colour'], ['Again', 'erase']],
        multicolor: [['Click/drag', 'select'], ['Pick', 'colour below']],
        line: [['Drag', 'line through centres'], ['Drag again', 'erase']],
        lineE: [['Drag', 'line on edges'], ['Drag again', 'erase']],
        wall: [['Drag', 'wall']],
        symbol: [['Click', 'place (again: cycle)'], ['Type', 'variant']],
        special: [['Drag', 'draw']],
        cage: [['Drag', 'cage']],
        move: [['Drag', 'move an item']]
    };

    /**
     * "Solve with": the tools this puzzle needs, read from its answer check (what it compares), its rules and title.
     * Each: {label, mode, sub (sub-mode or Composite tool), style?}. Order: the genre's main tool first.
     */
    function inferTools(B, availableSet) {
        const chk = (B.answerCheckInfo() || '').replace(/<[^>]+>/g, ' ');
        const info = B.getInfo();
        const text = [info.title, info.rules, B.genreTags().join(' ')].join(' ').replace(/<[^>]+>/g, ' ');
        const combi = !!availableSet.combi;
        const comp = {};
        B.listComposite().forEach(function(c) {
            comp[c.name] = true;
        });
        const out = [];
        function add(label, mode, sub, style) {
            if (!availableSet[mode] || (mode === 'combi' && !comp[sub])) {
                return;
            }
            if (out.some(function(t) {
                return t.mode === mode && t.sub === sub;
            })) {
                return;
            }
            out.push({label: label, mode: mode, sub: sub, style: style});
        }
        const has = function(re) {
            return re.test(chk);
        };
        const says = function(re) {
            return re.test(text);
        };
        const wantsNumbers = says(/fillomino|place (the )?digits|write (a )?(digit|number)|enter (a )?(digit|number)|each light has a colou?r/i);
        if (has(/Light bulbs/)) {
            add('Bulbs + dots', 'combi', 'akari');
        }
        if (has(/Stars/)) {
            add('Stars + ×', 'combi', 'star');
        }
        if (has(/White and Black circles/)) {
            add('Black / white', 'combi', 'blwh');
        }
        if (has(/Battleship fleet/)) {
            add('Ships + water', 'combi', 'battleship');
        }
        if (has(/Line must/)) {
            if (says(/yajilin|\bshade (some )?cells|shaded cells/i)) {
                add('Shade + loop', 'combi', 'yajilin');
            } else {
                add('Loop + edge ×', 'combi', 'linex');
                add('Loop + cell ○ ×', 'combi', 'lineox');
            }
            if (!combi) {
                add('Loop', 'line', '1');
            }
        }
        if (wantsNumbers && !has(/Line must/)) {
            add('Numbers', 'number', '1');
        }
        if (has(/Edge must/)) {
            add(says(/loop/i) ? 'Loop + edge ×' : 'Borders + ×', 'combi', 'edgex');
            if (!combi) {
                add('Borders', 'lineE', '1');
            }
        }
        if (has(/Shade cells/) && !has(/ONE of/)) {
            add('Shade + dot', 'combi', 'blpo');
            if (!combi) {
                add('Shade', 'surface', '', 1);
            }
        }
        if (wantsNumbers && has(/Line must/)) {
            add('Numbers', 'number', '1');
        }
        return out.slice(0, 4);
    }

    /** Labels the legacy UI leaves empty (they are images there). */
    const SUBMODE_FALLBACK = {number: {'3': '1/4', '9': 'Side'}};

    const DOCK_WIDTH = 420;
    const DIGITS = ['1', '2', '3', '4', '5', '6', '7', '8', '9'];

    /** True for an rgb() colour dark enough to need light text on it. */
    function isDark(rgb) {
        const n = (rgb.match(/\d+/g) || []).map(Number);
        return n.length >= 3 && (0.299 * n[0] + 0.587 * n[1] + 0.114 * n[2]) < 110;
    }

    function familyOf(mode) {
        return FAMILIES.find(function(f) {
            return f.modes.indexOf(mode) !== -1;
        }) || FAMILIES[5];
    }

    window.PrototypeVariants = window.PrototypeVariants || {};
    window.PrototypeVariants.A = {
        name: 'Dock (baseline)',

        /** @param {object} ctx see README.md, "The variant contract" */
        mount(ctx) {
            const B = ctx.bridge;
            const el = ctx.helpers.el;

            /** A dock button: acts on click, never takes focus (so Space/Enter stay with the board). */
            function btn(cls, label, onClick, title) {
                const b = el('button', {class: 'proto-a-btn ' + (cls || ''), type: 'button', tabindex: '-1'}, [label]);
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

            function section(title, extraCls) {
                const body = el('div', {class: 'proto-a-section-body'});
                const head = el('div', {class: 'proto-a-section-head'}, [title]);
                const root = el('div', {class: 'proto-a-section ' + (extraCls || '')}, [head, body]);
                return {root: root, head: head, body: body};
            }

            // ---- Skeleton -----------------------------------------------------------------------------------------
            const pill = el('div', {class: 'proto-a-pill'});
            const hint = el('div', {class: 'proto-a-hint'});
            const boardCard = el('div', {class: 'proto-a-boardcard'});
            const stage = el('div', {class: 'proto-a-stage'}, [
                el('div', {class: 'proto-a-stagehead'}, [pill, hint]),
                el('div', {class: 'proto-a-boardslot'}, [boardCard])
            ]);

            const title = el('div', {class: 'proto-a-title'});
            const byline = el('div', {class: 'proto-a-byline'});
            const timerText = el('span', {class: 'proto-a-timer-text'}, ['00:00']);
            const pauseBtn = btn('proto-a-timer-btn', 'Pause', function() {
                if (B.getTimer().paused) {
                    B.startTimer();
                } else {
                    B.pauseTimer();
                }
            }, 'Pause or resume the timer (pausing covers the board)');
            const rules = el('div', {class: 'proto-a-rules'});
            const checkChip = el('span', {class: 'proto-a-chip'});
            const tagChips = el('span', {class: 'proto-a-tags'});
            const head = el('div', {class: 'proto-a-head'}, [
                el('div', {class: 'proto-a-headrow'}, [
                    el('div', {class: 'proto-a-headtext'}, [title, byline]),
                    el('div', {class: 'proto-a-timer'}, [timerText, pauseBtn])
                ]),
                el('div', {class: 'proto-a-chiprow'}, [checkChip, tagChips]),
                rules
            ]);

            const presetSec = section('Solve with', 'proto-a-presets');
            const modeSec = section('All modes', 'proto-a-modes');
            const toolSec = section('Tool', 'proto-a-tools');
            const padSec = section('Enter', 'proto-a-padsec');

            const status = el('div', {class: 'proto-a-status'});
            const histText = el('span', {class: 'proto-a-hist'});
            const undoBtn = btn('proto-a-act', 'Undo', function() {
                B.undo();
            }, 'Undo (Ctrl+Z)');
            const redoBtn = btn('proto-a-act', 'Redo', function() {
                B.redo();
            }, 'Redo (Ctrl+Y)');
            const checkBtn = btn('proto-a-act proto-a-act-check', 'Check', runCheck, 'Check the answer');
            const resetMenu = el('div', {class: 'proto-a-menu', hidden: ''}, [
                btn('proto-a-menuitem', 'Clear this mode\'s entries', function() {
                    resetMenu.hidden = true;
                    B.clear('mode');
                }),
                btn('proto-a-menuitem proto-a-danger', 'Clear everything', function() {
                    resetMenu.hidden = true;
                    B.clear('all');
                })
            ]);
            const resetBtn = btn('proto-a-act', 'Reset', function() {
                resetMenu.hidden = !resetMenu.hidden;
            }, 'Clear entries');
            const settingsBtn = btn('proto-a-act proto-a-act-icon', '⚙', function() {
                B.openSettings();
            }, 'Settings');
            const actions = el('div', {class: 'proto-a-actions'}, [
                undoBtn, redoBtn,
                el('div', {class: 'proto-a-resetwrap'}, [resetBtn, resetMenu]),
                checkBtn, settingsBtn
            ]);
            const foot = el('div', {class: 'proto-a-foot'}, [status, el('div', {class: 'proto-a-footrow'}, [actions, histText])]);

            const dock = el('div', {class: 'proto-a-dock'}, [
                head,
                el('div', {class: 'proto-a-dockscroll'}, [presetSec.root, modeSec.root, toolSec.root, padSec.root]),
                foot
            ]);
            const app = el('div', {class: 'proto-a-app'}, [stage, dock]);
            document.body.appendChild(app);
            ctx.helpers.adoptBoard(boardCard);
            ctx.helpers.hideLegacy();

            document.addEventListener('mousedown', function(e) {
                if (!resetMenu.hidden && !resetMenu.parentNode.contains(e.target)) {
                    resetMenu.hidden = true;
                }
            });

            // ---- Puzzle info --------------------------------------------------------------------------------------
            const info = B.getInfo();
            title.textContent = info.title || 'Untitled puzzle';
            byline.textContent = [info.author && 'by ' + info.author].filter(Boolean).join(' ');
            rules.innerHTML = info.rules || '<em>No rules given.</em>';
            const st0 = B.getState();
            checkChip.textContent = st0.hasAnswerCheck ? 'Answer check on' : 'No answer check';
            checkChip.classList.toggle('proto-a-chip-on', st0.hasAnswerCheck);
            B.genreTags().forEach(function(t) {
                tagChips.appendChild(el('span', {class: 'proto-a-chip'}, [t]));
            });

            // ---- Board fit ----------------------------------------------------------------------------------------
            const slot = boardCard.parentNode;
            function fitBoard() {
                const canvas = ctx.canvas;
                const r = canvas.getBoundingClientRect();
                if (!r.width || !pu.size) {
                    return;
                }
                const perCellW = r.width / pu.size;
                const perCellH = r.height / pu.size;
                const availW = slot.clientWidth - 24;
                const availH = slot.clientHeight - 24;
                const px = Math.max(12, Math.min(90, Math.floor(Math.min(availW / perCellW, availH / perCellH))));
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
                // A second pass: the canvas's px-per-cell ratio can shift a little once the new size is drawn.
                requestAnimationFrame(function() {
                    requestAnimationFrame(fitBoard);
                });
            });

            // ---- Mode palette -------------------------------------------------------------------------------------
            const available = B.listModes();
            const availableSet = {};
            available.forEach(function(m) {
                availableSet[m.mode] = m;
            });
            // One compact grid, family order, each chip edged in its family's colour (12 modes = three rows of four).
            const modeButtons = {};
            const modeGrid = el('div', {class: 'proto-a-modegrid'});
            FAMILIES.forEach(function(f) {
                f.modes.filter(function(m) {
                    return availableSet[m];
                }).forEach(function(m) {
                    const b = btn('proto-a-modebtn', availableSet[m].label, function() {
                        B.setMode(m);
                    }, f.label + ' family');
                    b.style.setProperty('--fam', f.color);
                    modeButtons[m] = b;
                    modeGrid.appendChild(b);
                });
            });
            modeSec.body.appendChild(modeGrid);

            // ---- Solve with: the puzzle's own tools ---------------------------------------------------------------
            const tools = inferTools(B, availableSet);
            const toolButtons = [];
            function applyTool(t) {
                if (B.getMode().mode !== t.mode) {
                    B.setMode(t.mode);
                }
                if (t.mode === 'combi') {
                    B.setComposite(t.sub);
                } else if (t.sub) {
                    B.setSubmode(t.sub);
                }
                if (t.style !== undefined && ['1', '8', '3', '4'].indexOf(String(B.getMode().style)) === -1) {
                    B.setStyle(t.style);
                }
            }
            function isCurrent(t, m) {
                return t.mode === m.mode && (!t.sub || String(t.sub) === String(m.submode));
            }
            tools.forEach(function(t) {
                const fam = familyOf(t.mode);
                const legend = t.mode === 'combi' ? TOOL_LEGEND[t.sub] : MODE_LEGEND[t.mode];
                const b = btn('proto-a-preset', '', function() {
                    applyTool(t);
                }, legend ? legend.map(function(r) {
                    return r[0] + ': ' + r[1];
                }).join('\n') : t.label);
                b.style.setProperty('--fam', fam.color);
                b.appendChild(el('span', {class: 'proto-a-preset-label'}, [t.label]));
                (legend || []).slice(0, 2).forEach(function(r) {
                    b.appendChild(el('span', {class: 'proto-a-preset-sub'}, [r[0] + ': ' + r[1]]));
                });
                toolButtons.push(b);
                presetSec.body.appendChild(b);
            });
            presetSec.root.hidden = !tools.length;
            // Start on the puzzle's first tool unless the link already starts on one of them.
            if (tools.length && !tools.some(function(t) {
                return isCurrent(t, B.getMode());
            })) {
                applyTool(tools[0]);
            }
            if (tools.length > 1) {
                presetSec.head.appendChild(el('span', {class: 'proto-a-kbd-hint'}, ['Tab cycles']));
                // Penpa+ cycles only the link's Tab set (main.js:695); here Tab cycles the puzzle's tools instead.
                window.addEventListener('keydown', function(e) {
                    if (e.key !== 'Tab' || e.ctrlKey || e.altKey || e.metaKey) {
                        return;
                    }
                    const tag = (e.target && e.target.tagName) || '';
                    if (/INPUT|TEXTAREA|SELECT/.test(tag) || document.querySelector('.swal2-container')) {
                        return;
                    }
                    e.preventDefault();
                    e.stopImmediatePropagation();
                    const m = B.getMode();
                    const cur = tools.findIndex(function(t) {
                        return isCurrent(t, m);
                    });
                    const n = tools.length;
                    applyTool(tools[cur === -1 ? 0 : (cur + (e.shiftKey ? n - 1 : 1)) % n]);
                }, true);
            }

            // ---- Tool section (per mode) --------------------------------------------------------------------------
            function swatchColor(style) {
                const lb = document.getElementById(style.id + '_lb');
                if (!lb) {
                    return null;
                }
                const bg = getComputedStyle(lb).backgroundColor;
                return bg && bg !== 'rgba(0, 0, 0, 0)' && bg !== 'transparent' ? bg : null;
            }

            /** A row of segmented choices; `items` [{value, label, title?, color?}]. */
            function choiceRow(label, items, current, onPick, extraCls) {
                const row = el('div', {class: 'proto-a-choicerow ' + (extraCls || '')});
                if (label) {
                    row.appendChild(el('span', {class: 'proto-a-choicelabel'}, [label]));
                }
                const wrap = el('div', {class: 'proto-a-choices'});
                items.forEach(function(it) {
                    const b = btn(it.color ? 'proto-a-swatch' : 'proto-a-choice', it.color ? '' : it.label, function() {
                        onPick(it.value);
                    }, it.title || it.label);
                    if (it.color) {
                        b.style.setProperty('--sw', it.color);
                    }
                    if (String(it.value) === String(current)) {
                        b.classList.add('is-on');
                    }
                    wrap.appendChild(b);
                });
                row.appendChild(wrap);
                return row;
            }

            function submodeItems(mode) {
                const fb = SUBMODE_FALLBACK[mode] || {};
                return B.listSubmodes(mode).map(function(s) {
                    return {value: s.value, label: s.label || fb[s.value] || s.value};
                });
            }

            function styleItems(mode) {
                return B.listStyles(mode).filter(function(s) {
                    return s.label || swatchColor(s);
                }).map(function(s) {
                    // A colour style has a short code label ("G", "DG1"); a long label with a background is a
                    // legacy highlight (Shape's "In front of lines"), not a colour.
                    const c = s.label.length <= 4 ? swatchColor(s) : null;
                    return {value: s.value, label: s.label, color: c, title: s.label};
                });
            }

            /** The Shape menu, read from the legacy DOM: groups (ms1_*) with sizes (ms_*). */
            function shapeGroups() {
                const groups = [];
                document.querySelectorAll('#mode_symbolul1 > li').forEach(function(li) {
                    const head = li.querySelector(':scope > span[id^="ms1_"]') || li.querySelector(':scope > span[id^="ms_"]');
                    if (!head || li.classList.contains('is_hidden') || li.style.display === 'none') {
                        return;
                    }
                    const sizes = Array.from(li.querySelectorAll('span[id^="ms_"]')).map(function(s) {
                        return {value: s.id.slice(3), label: s.textContent.trim()};
                    });
                    groups.push({label: head.textContent.trim().split(/\s+/).slice(0, 2).join(' '), sizes: sizes});
                });
                return groups;
            }

            /** A gesture legend: one compact row per [gesture, effect]. */
            function legendBox(rows) {
                const box = el('div', {class: 'proto-a-legend'});
                rows.forEach(function(r) {
                    box.appendChild(el('span', {class: 'proto-a-legend-g'}, [r[0]]));
                    box.appendChild(el('span', {class: 'proto-a-legend-e'}, [r[1]]));
                });
                return box;
            }

            // Which modes have their long option lists unfolded (Composite tools, Shapes, colours and styles).
            const unfolded = {};
            /** A fold: a summary line with a toggle; `build(body)` fills it only while open. */
            function fold(mode, summary, build) {
                const open = !!unfolded[mode];
                const wrap = el('div', {class: 'proto-a-fold' + (open ? ' is-open' : '')});
                const toggle = btn('proto-a-foldbtn', open ? 'Hide' : 'Change', function() {
                    unfolded[mode] = !open;
                    lastModeKey = '';
                    render(B.getState());
                });
                wrap.appendChild(el('div', {class: 'proto-a-foldhead'}, [summary, toggle]));
                if (open) {
                    const body = el('div', {class: 'proto-a-foldbody'});
                    build(body);
                    wrap.appendChild(body);
                }
                return wrap;
            }

            function renderTools(m) {
                const body = toolSec.body;
                body.textContent = '';
                const mode = m.mode;
                toolSec.root.hidden = false;
                const legend = mode === 'combi' ? TOOL_LEGEND[m.submode] : MODE_LEGEND[mode];
                if (mode === 'sudoku') {
                    // Sub-modes live in the pad (Normal / Corner / Centre); here only the digit colour.
                    body.appendChild(choiceRow('Colour', styleItems(mode), m.style, B.setStyle, 'proto-a-swatchrow'));
                } else if (mode === 'surface' || mode === 'multicolor') {
                    // Colours are in the pad below.
                } else if (mode === 'combi') {
                    const list = B.listComposite().map(function(c) {
                        return {value: c.name, label: c.label};
                    });
                    const cur = list.find(function(c) {
                        return c.value === m.submode;
                    });
                    body.appendChild(fold(mode, el('span', {class: 'proto-a-foldtitle'}, [cur ? cur.label : m.submode]),
                        function(fb) {
                            fb.appendChild(choiceRow(null, list, m.submode, function(v) {
                                unfolded[mode] = false;
                                B.setComposite(v);
                            }, 'proto-a-toolgrid'));
                        }));
                } else if (mode === 'symbol') {
                    const groups = shapeGroups();
                    const cur = m.submode;
                    const curGroup = groups.find(function(g) {
                        return g.sizes.some(function(z) {
                            return z.value === cur;
                        });
                    }) || groups[0];
                    body.appendChild(fold(mode, el('span', {class: 'proto-a-foldtitle'}, [curGroup ? curGroup.label : cur]),
                        function(fb) {
                            fb.appendChild(choiceRow(null, groups.map(function(g, i) {
                                return {value: i, label: g.label};
                            }), groups.indexOf(curGroup), function(i) {
                                unfolded[mode] = false;
                                B.setShape(groups[i].sizes[0].value);
                            }, 'proto-a-toolgrid'));
                            fb.appendChild(choiceRow('Layer', styleItems(mode), m.style, B.setStyle));
                        }));
                    if (curGroup && curGroup.sizes.length > 1) {
                        body.appendChild(choiceRow('Size', curGroup.sizes, cur, B.setShape));
                    }
                } else {
                    const subs = submodeItems(mode);
                    if (subs.length) {
                        body.appendChild(choiceRow(mode === 'number' ? 'Type' : 'Kind', subs, m.submode, B.setSubmode));
                    }
                    const styles = styleItems(mode);
                    if (styles.length) {
                        const colours = styles.filter(function(z) {
                            return z.color;
                        });
                        const looks = styles.filter(function(z) {
                            return !z.color;
                        });
                        const curStyle = styles.find(function(z) {
                            return String(z.value) === String(m.style);
                        });
                        const sum = el('span', {class: 'proto-a-foldtitle'}, ['Look: ']);
                        if (curStyle && curStyle.color) {
                            const sw = el('span', {class: 'proto-a-miniswatch'});
                            sw.style.background = curStyle.color;
                            sum.appendChild(sw);
                        } else {
                            sum.appendChild(document.createTextNode(curStyle ? curStyle.label : String(m.style)));
                        }
                        body.appendChild(fold(mode, sum, function(fb) {
                            if (colours.length) {
                                fb.appendChild(choiceRow('Colour', colours, m.style, B.setStyle, 'proto-a-swatchrow'));
                            }
                            if (looks.length) {
                                fb.appendChild(choiceRow('Style', looks, m.style, B.setStyle));
                            }
                        }));
                    }
                }
                if (legend) {
                    body.appendChild(legendBox(legend));
                }
                if (!body.childNodes.length) {
                    toolSec.root.hidden = true;
                }
            }

            // ---- Pad ----------------------------------------------------------------------------------------------
            const sudokuSubs = availableSet.sudoku ? submodeItems('sudoku') : [];
            const colourMode = availableSet.multicolor ? 'multicolor' : (availableSet.surface ? 'surface' : null);

            function renderPad(m) {
                const body = padSec.body;
                body.textContent = '';
                const mode = m.mode;
                const fam = familyOf(mode).key;
                const isPaint = fam === 'paint';
                const takesDigits = mode === 'sudoku' || mode === 'number' || mode === 'symbol';
                padSec.root.hidden = !(takesDigits || isPaint);
                if (padSec.root.hidden) {
                    return;
                }
                padSec.head.firstChild.textContent = isPaint ? 'Colour' : (mode === 'symbol' ? 'Variant' : 'Enter');

                const keys = el('div', {class: 'proto-a-keys'});
                if (isPaint) {
                    B.listStyles(mode).forEach(function(s) {
                        const c = swatchColor(s) || '#888';
                        const hot = (s.label.match(/\d+$/) || [''])[0];
                        const b = btn('proto-a-key proto-a-colkey', hot, function() {
                            B.setStyle(s.value);
                        }, s.label);
                        b.style.setProperty('--sw', c);
                        if (isDark(c)) {
                            b.classList.add('is-dark');
                        }
                        if (String(s.value) === String(m.style)) {
                            b.classList.add('is-on');
                        }
                        keys.appendChild(b);
                    });
                } else {
                    DIGITS.forEach(function(d) {
                        keys.appendChild(btn('proto-a-key', d, function() {
                            B.sendKey(d);
                        }));
                    });
                    keys.appendChild(btn('proto-a-key', '0', function() {
                        B.sendKey('0');
                    }));
                    keys.appendChild(btn('proto-a-key proto-a-key-wide', 'Delete', function() {
                        B.sendKey('Delete');
                    }, 'Clear the selected cells (Delete)'));
                }
                const pad = el('div', {class: 'proto-a-pad'}, [keys]);

                // SudokuPad's right-hand column: Normal / Corner / Centre / Colour, when the puzzle has Sudoku mode.
                // Only for sudoku-type puzzles (no genre tools) or while in Sudoku mode: elsewhere it is noise.
                if (sudokuSubs.length && (mode === 'sudoku' || !tools.length)) {
                    const col = el('div', {class: 'proto-a-padcol'});
                    sudokuSubs.forEach(function(s) {
                        const b = btn('proto-a-padmode', s.label, function() {
                            if (B.getMode().mode !== 'sudoku') {
                                B.setMode('sudoku');
                            }
                            B.setSubmode(s.value);
                        }, s.label + (s.value === '2' ? ' (hold Shift)' : s.value === '3' ? ' (hold Ctrl)' : ''));
                        if (mode === 'sudoku' && m.submode === String(s.value)) {
                            b.classList.add('is-on');
                        }
                        col.appendChild(b);
                    });
                    if (colourMode) {
                        const b = btn('proto-a-padmode', 'Colour', function() {
                            B.setMode(colourMode);
                        }, colourMode === 'surface' ? 'Paint cells (Surface)' : 'Colour selected cells (Multicolor)');
                        if (isPaint) {
                            b.classList.add('is-on');
                        }
                        col.appendChild(b);
                    }
                    pad.appendChild(col);
                }
                body.appendChild(pad);
            }

            // ---- Render on change ---------------------------------------------------------------------------------
            let lastModeKey = '';
            let checkShown = null;
            function render(state) {
                const m = B.getMode();
                const fam = familyOf(m.mode);
                const key = m.mode + '|' + m.submode + '|' + m.style;
                if (key !== lastModeKey) {
                    lastModeKey = key;
                    Object.keys(modeButtons).forEach(function(k) {
                        modeButtons[k].classList.toggle('is-on', k === m.mode);
                    });
                    tools.forEach(function(t, i) {
                        toolButtons[i].classList.toggle('is-on', isCurrent(t, m));
                    });
                    app.style.setProperty('--cur', fam.color);
                    pill.textContent = '';
                    pill.appendChild(el('span', {class: 'proto-a-pillfam'}, [fam.label]));
                    pill.appendChild(el('span', {class: 'proto-a-pillmode'}, [modeLabel(m)]));
                    const lg = m.mode === 'combi' ? TOOL_LEGEND[m.submode] : MODE_LEGEND[m.mode];
                    hint.textContent = lg ? lg.map(function(r) {
                        return r[0] + ': ' + r[1];
                    }).join('   ·   ') : (m.mode === 'combi' && TOOL_HINTS[m.submode]) || HINTS[m.mode] || '';
                    renderTools(m);
                    renderPad(m);
                }
                undoBtn.disabled = !state.canUndo;
                redoBtn.disabled = !state.canRedo;
                const h = B.history();
                histText.textContent = 'Step ' + h.position + ' / ' + h.length;
                pauseBtn.textContent = state.timer.paused ? 'Resume' : 'Pause';
                timerText.textContent = state.timer.text;
                if (state.solved && checkShown !== 'solved') {
                    showStatus('solved');
                } else if (checkShown && checkShown !== 'solved') {
                    // Any edit after a check makes its verdict stale.
                    clearStatusSoon();
                }
            }

            function modeLabel(m) {
                const base = availableSet[m.mode] ? availableSet[m.mode].label : m.mode;
                let sub = '';
                if (m.mode === 'combi') {
                    const t = B.listComposite().find(function(c) {
                        return c.name === m.submode;
                    });
                    sub = t ? t.label : m.submode;
                } else if (m.mode === 'symbol') {
                    const g = shapeGroups().find(function(x) {
                        return x.sizes.some(function(z) {
                            return z.value === m.submode;
                        });
                    });
                    const z = g && g.sizes.find(function(x) {
                        return x.value === m.submode;
                    });
                    sub = g ? g.label + (g.sizes.length > 1 ? ' ' + z.label : '') : m.submode;
                } else {
                    const s = submodeItems(m.mode).find(function(x) {
                        return x.value === m.submode;
                    });
                    sub = s ? s.label : '';
                }
                return sub ? base + ' › ' + sub : base;
            }

            // ---- Answer check -------------------------------------------------------------------------------------
            let lastHistPos = -1;
            function runCheck() {
                const r = B.check();
                showStatus(!r.hasAnswerCheck ? 'none' : r.solved ? 'solved' : 'wrong');
                lastHistPos = B.history().position;
            }
            function showStatus(kind) {
                checkShown = kind;
                status.className = 'proto-a-status is-' + kind;
                status.textContent = {
                    solved: 'Solved. The answer matches.',
                    wrong: 'Not solved yet: the board does not match the answer.',
                    none: 'This puzzle link has no answer check.'
                }[kind];
            }
            function clearStatusSoon() {
                if (B.history().position !== lastHistPos) {
                    checkShown = null;
                    status.className = 'proto-a-status';
                    status.textContent = '';
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
