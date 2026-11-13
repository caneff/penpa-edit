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
 * Bridge gaps worked around here (read `pu` / the legacy DOM directly):
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

            const modeSec = section('Mode', 'proto-a-modes');
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
                el('div', {class: 'proto-a-dockscroll'}, [modeSec.root, toolSec.root, padSec.root]),
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
            const modeButtons = {};
            FAMILIES.forEach(function(f) {
                const modes = f.modes.filter(function(m) {
                    return availableSet[m];
                });
                if (!modes.length) {
                    return;
                }
                const row = el('div', {class: 'proto-a-famrow', style: '--fam:' + f.color}, [
                    el('span', {class: 'proto-a-famlabel'}, [f.label])
                ]);
                modes.forEach(function(m) {
                    const b = btn('proto-a-modebtn', availableSet[m].label, function() {
                        B.setMode(m);
                    });
                    modeButtons[m] = b;
                    row.appendChild(b);
                });
                modeSec.body.appendChild(row);
            });
            if (available.length > 1) {
                modeSec.head.appendChild(el('span', {class: 'proto-a-kbd-hint'}, ['Tab cycles']));
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

            function renderTools(m) {
                const body = toolSec.body;
                body.textContent = '';
                const mode = m.mode;
                toolSec.root.hidden = false;
                if (mode === 'sudoku') {
                    // Sub-modes live in the pad (Normal / Corner / Centre); here only the digit colour.
                    body.appendChild(choiceRow('Digit colour', styleItems(mode), m.style, B.setStyle, 'proto-a-swatchrow'));
                } else if (mode === 'surface' || mode === 'multicolor') {
                    body.appendChild(el('div', {class: 'proto-a-note'}, [mode === 'surface'
                        ? 'Brush colours are in the pad below. Right-click paints the second colour.'
                        : 'Pick cells on the board, then a colour below.']));
                } else if (mode === 'combi') {
                    const tools = B.listComposite().map(function(c) {
                        return {value: c.name, label: c.label};
                    });
                    body.appendChild(choiceRow(null, tools, m.submode, B.setComposite, 'proto-a-toolgrid'));
                } else if (mode === 'symbol') {
                    const groups = shapeGroups();
                    const cur = m.submode;
                    const curGroup = groups.find(function(g) {
                        return g.sizes.some(function(s) {
                            return s.value === cur;
                        });
                    }) || groups[0];
                    body.appendChild(choiceRow('Shape', groups.map(function(g, i) {
                        return {value: i, label: g.label};
                    }), groups.indexOf(curGroup), function(i) {
                        B.setShape(groups[i].sizes[0].value);
                    }, 'proto-a-toolgrid'));
                    if (curGroup && curGroup.sizes.length > 1) {
                        body.appendChild(choiceRow('Size', curGroup.sizes, cur, B.setShape));
                    }
                    body.appendChild(choiceRow('Layer', styleItems(mode), m.style, B.setStyle));
                } else {
                    const subs = submodeItems(mode);
                    if (subs.length) {
                        body.appendChild(choiceRow(mode === 'number' ? 'Type' : 'Kind', subs, m.submode, B.setSubmode));
                    }
                    const styles = styleItems(mode);
                    if (styles.length) {
                        const colours = styles.filter(function(s) {
                            return s.color;
                        });
                        const looks = styles.filter(function(s) {
                            return !s.color;
                        });
                        if (colours.length) {
                            body.appendChild(choiceRow('Colour', colours, m.style, B.setStyle, 'proto-a-swatchrow'));
                        }
                        if (looks.length) {
                            body.appendChild(choiceRow('Style', looks, m.style, B.setStyle));
                        }
                    }
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
                if (sudokuSubs.length) {
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
                    app.style.setProperty('--cur', fam.color);
                    pill.textContent = '';
                    pill.appendChild(el('span', {class: 'proto-a-pillfam'}, [fam.label]));
                    pill.appendChild(el('span', {class: 'proto-a-pillmode'}, [modeLabel(m)]));
                    hint.textContent = (m.mode === 'combi' && TOOL_HINTS[m.submode]) || HINTS[m.mode] || '';
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
