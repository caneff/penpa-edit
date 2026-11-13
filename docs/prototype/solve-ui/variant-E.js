/*
 * PROTOTYPE (throwaway, branch prototype/solve-ui): solve-UI variant E, "Genre tools".
 * Owned by variant E's builder: this file and variant-E.css only. See README.md for the contract.
 *
 * The idea: read the puzzle's genre (the link's genre tags, else infer it from the mode the setter left the puzzle
 * in and the link's Tab set) and show only the 2-3 tools that genre needs, as large buttons named in the genre's
 * own words (Shade, Dot, Loop, Cross, Star, Digit, Corner, ...). Keys 1-3 pick a tool (Alt+1-3 where digits are
 * content, i.e. Sudoku and Number). Penpa+'s full mode list sits behind a "More" disclosure.
 *
 * Penpa+'s Composite tools put two marks on one tool, split by mouse button (Black/dot: left shade, right dot).
 * Here each mark is its own tool: a "swap" tool turns a left click into Penpa+'s right click (and the reverse), the
 * way pzprjs's Shift swaps buttons. That swap is done in this file by re-dispatching canvas mouse events.
 *
 * Claim tested: Penpa+'s mode list is the setter's vocabulary, not the solver's. A solver of a known genre needs
 * 2-3 tools named for what they put on the board, never the list of 12 modes.
 *
 * Reads `pu` directly (bridge gaps, see the report): pu.nx/ny for the inferred genre's description, and the
 * mouse-button swap hooks the canvas's events itself.
 */
(function() {
    'use strict';

    // ---- Tool vocabulary ------------------------------------------------------------------------------------------
    // A tool: {name, glyph, how, spec}. spec is what the engine is set to: {mode, sub?, style?, combi?, swap?}.

    function T(name, glyph, how, spec) {
        return {name: name, glyph: glyph, how: how, spec: spec};
    }

    const SUDOKU_TOOLS = [
        T('Digit', '5', 'Select cells, type 1-9', {mode: 'sudoku', sub: '1'}),
        T('Corner', 'corner', 'Small digits in the corners', {mode: 'sudoku', sub: '2'}),
        T('Centre', '123', 'Small digits in the middle', {mode: 'sudoku', sub: '3'})
    ];
    const NUMBER_TOOLS = [
        T('Digit', '5', 'Click a cell, type a number', {mode: 'number', sub: '1'}),
        T('Candidate', 'corner', 'Pencil marks in the cell', {mode: 'number', sub: '7'})
    ];

    // Each Composite tool's left- and right-button marks, in the solver's words.
    const COMBI_WORDS = {
        blpo: [['Shade', '■', 'Click or drag cells to shade'], ['Dot', '•', 'Mark cells that stay white']],
        blwh: [['White', '○', 'Click or drag: white stones'], ['Black', '●', 'Click or drag: black stones']],
        linex: [['Loop', '➰', 'Drag through cell centres'], ['Cross', '✕', 'Click an edge the loop avoids']],
        lineox: [['Loop', '➰', 'Drag through cells; click for O'], ['Cross', '✕', 'Click a cell: X']],
        linedir: [['Loop', '➰', 'Drag through cell centres'], ['Mark', '✕', 'Edges: x < >']],
        edgex: [['Edge', '⬚', 'Drag along grid lines'], ['Cross', '✕', 'Click an edge the loop avoids']],
        edgexoi: [['Edge', '⬚', 'Drag along grid lines'], ['Cross', '✕', 'Click an edge the loop avoids']],
        yajilin: [['Shade / loop', '■', 'Click to shade, drag for the loop'], ['Dot', '•', 'Dot a cell, cross an edge']],
        hashi: [['Bridge', '═', 'Drag island to island; again for double'], null],
        rassisillai: [['Path', '➰', 'Drag the path; click a grey circle'], ['Box', '□', 'Yellow square']],
        edgesub: [['Border', '│', 'Drag along grid lines'], ['Link', '┄', 'Join cells of one region']],
        battleship: [['Ship', '▮', 'Click to cycle, drag for a segment'], ['Water', '≈', 'Click or drag: water']],
        star: [['Star', '★', 'Click a cell'], ['Cross', '✕', 'Click or drag: no star']],
        tents: [['Tent', '▲', 'Click a cell; drag tent to tree'], ['Cross', '✕', 'Click or drag: no tent']],
        magnets: [['Pole', '±', 'Click to cycle + / -'], ['Block', '■', 'Neutral cell']],
        mines: [['Mine', '✹', 'Click a cell'], ['Cross', '✕', 'Click or drag: safe']],
        doublemines: [['Mine', '✹', 'Click once or twice'], ['Cross', '✕', 'Click or drag: safe']],
        akari: [['Bulb', '☀', 'Click a cell'], ['Dot', '•', 'Dot a cell that is lit or empty']],
        shaka: [['Triangle', '◢', 'Drag a cell corner'], ['Dot', '•', 'Click: no triangle']],
        arrowS: [['Arrow', '→', 'Drag in a direction'], null],
        numfl: [['Digit flick', '5', 'Flick 1-9 in a cell'], null],
        alfl: [['Letter flick', 'A', 'Flick A-H in a cell'], null]
    };

    function combiTools(name) {
        const w = COMBI_WORDS[name];
        if (!w) {
            return [T(name, '✱', 'Left and right click', {mode: 'combi', combi: name})];
        }
        const out = [T(w[0][0], w[0][1], w[0][2], {mode: 'combi', combi: name})];
        if (w[1]) {
            out.push(T(w[1][0], w[1][1], w[1][2], {mode: 'combi', combi: name, swap: true}));
        }
        return out;
    }

    const SHADE_SURFACE = [
        T('Shade', '■', 'Click or drag cells to shade', {mode: 'surface', style: 1}),
        T('Unshaded', '□', 'Mark cells that stay white', {mode: 'surface', style: 1, swap: true})
    ];

    // Genre tags (penpa_tags in genre_tags.js; puzz.link type names) -> tools. Unlisted tags fall back to inference.
    const SUDOKU_TAGS = ['classic', 'latin', 'irregular', 'alphabet', 'arrow', 'thermo', 'tightfit', 'evenodd',
        'consecutivepairs', 'killer', 'isodoku', 'consecutive', 'nonconsecutive', 'sudokurve', 'tile', 'deficit',
        'surplus', 'outside', 'sudoku', 'skyscrapers', 'kakuro', 'tomtom'];
    const BY_TAG = {
        masyu: 'linex', 'all or nothing': 'linex', 'moon or sun': 'linex', 'country road': 'linex', balanceloop: 'linex',
        castlewall: 'linex', 'double back': 'linex', geradeweg: 'linex', haisu: 'linex', 'tapalikeloop': 'lineox',
        slitherlink: 'edgex', lither: 'edgex', cave: 'edgexoi',
        nurikabe: 'blpo', kurodoko: 'blpo', kurotto: 'blpo', tapa: 'blpo', lits: 'blpo', heyawake: 'blpo',
        hitori: 'blpo', 'cross the streams': 'blpo', crossthestreams: 'blpo', nonogram: 'blpo', aqre: 'blpo',
        chocona: 'blpo', kuromasu: 'blpo', 'statuepark': 'blpo', yinyang: 'blwh', 'yin-yang': 'blwh',
        yajilin: 'yajilin', starbattle: 'star', 'star battle': 'star', akari: 'akari', 'light up': 'akari',
        minesweeper: 'mines', battleships: 'battleship', tents: 'tents', magnets: 'magnets',
        'hashiwokakero (hashi/bridges)': 'hashi', hashi: 'hashi', shakashaka: 'shaka', araf: 'edgesub',
        fillomino: 'number', 'spiralgalaxies': 'edgesub', pentominous: 'number'
    };

    function title(s) {
        return s.replace(/\b\w/g, function(c) {
            return c.toUpperCase();
        });
    }

    /**
     * Work out the genre and its tools.
     * @returns {{genre:string, source:string, tools:Array, digitsAreContent:boolean}}
     */
    function readGenre(bridge, startMode) {
        const tags = bridge.genreTags().map(function(t) {
            return String(t).toLowerCase();
        });
        const comboAvail = bridge.listComposite().map(function(c) {
            return c.name;
        });
        function fromTool(key) {
            if (key === 'sudoku') {
                return SUDOKU_TOOLS;
            }
            if (key === 'number') {
                return NUMBER_TOOLS;
            }
            if (comboAvail.indexOf(key) !== -1) {
                return combiTools(key);
            }
            return null;
        }
        for (let i = 0; i < tags.length; i++) {
            const t = tags[i];
            const key = SUDOKU_TAGS.indexOf(t) !== -1 ? 'sudoku' : BY_TAG[t];
            const tools = key && fromTool(key);
            if (tools) {
                return {genre: t === 'classic' ? 'Sudoku' : title(t.replace(/\s*\(.*\)/, '')),
                    source: 'from the link’s genre tag “' + t + '”', tools: tools};
            }
        }
        // No known tag: infer from the mode the setter left the puzzle in.
        const tagNote = tags.length ? ' (tag “' + tags[0] + '” not in the table)' : '';
        const name = tags.length ? title(tags[0]) : null;
        const m = startMode;
        if (m.mode === 'sudoku') {
            return {genre: name || 'Sudoku', source: 'guessed: the puzzle opens in Sudoku mode' + tagNote, tools: SUDOKU_TOOLS};
        }
        if (m.mode === 'number') {
            return {genre: name || 'Number placement', source: 'guessed: the puzzle opens in Number mode' + tagNote,
                tools: NUMBER_TOOLS};
        }
        if (m.mode === 'combi' && fromTool(m.submode)) {
            return {genre: name || 'Composite: ' + m.submode, source: 'guessed from the setter’s Composite tool “' +
                m.submode + '”' + tagNote, tools: fromTool(m.submode)};
        }
        if (m.mode === 'surface' && bridge.tabSet().length) {
            return {genre: name || 'Shading', source: 'guessed: the puzzle opens in Surface mode' + tagNote,
                tools: SHADE_SURFACE};
        }
        // Nothing to go on: a generic belt, one tool per common family.
        return {genre: name || 'Unknown genre', generic: true,
            source: 'no genre tag and no mode set by the setter: generic tools' + tagNote,
            tools: [
                T('Shade', '■', 'Click or drag cells', {mode: 'surface', style: 1}),
                T('Line', '➰', 'Drag between cells', {mode: 'line', sub: '1'}),
                T('Number', '5', 'Click a cell, type', {mode: 'number', sub: '1'})
            ]};
    }

    const SHAPES = ['circle_L', 'square_L', 'triup_L', 'diamond_L', 'ox_B', 'cross', 'tri', 'arrow_B_B', 'degital_B'];

    function takesDigits(tool) {
        return !!tool && (tool.spec.mode === 'sudoku' || tool.spec.mode === 'number');
    }

    // ---- Mouse-button swap ----------------------------------------------------------------------------------------

    const swapped = new WeakSet();
    let swapOn = false;

    /** Re-dispatch canvas mouse events with left and right exchanged while a "swap" tool is active. */
    function installSwap(canvas) {
        function handler(e) {
            if (!swapOn || e.target !== canvas || swapped.has(e)) {
                return;
            }
            let button = e.button;
            let buttons = e.buttons;
            if (e.type === 'mousedown' || e.type === 'mouseup') {
                if (button === 0) {
                    button = 2;
                } else if (button === 2) {
                    button = 0;
                } else {
                    return;
                }
            }
            if (e.type !== 'mouseup') {
                const l = buttons & 1;
                const r = buttons & 2;
                buttons = (buttons & ~3) | (l ? 2 : 0) | (r ? 1 : 0);
            }
            e.stopImmediatePropagation();
            e.preventDefault();
            const ev = new MouseEvent(e.type, {
                bubbles: true, cancelable: true, view: window,
                clientX: e.clientX, clientY: e.clientY, screenX: e.screenX, screenY: e.screenY,
                button: button, buttons: buttons,
                ctrlKey: e.ctrlKey, shiftKey: e.shiftKey, altKey: e.altKey, metaKey: e.metaKey
            });
            swapped.add(ev);
            canvas.dispatchEvent(ev);
        }
        ['mousedown', 'mousemove', 'mouseup'].forEach(function(t) {
            window.addEventListener(t, handler, true);
        });
    }

    // ---- Mount ----------------------------------------------------------------------------------------------------

    window.PrototypeVariants = window.PrototypeVariants || {};
    window.PrototypeVariants.E = {
        name: 'Genre tools',

        /** @param {object} ctx see README.md, "The variant contract" */
        mount(ctx) {
            const B = ctx.bridge;
            const el = ctx.helpers.el;
            const startMode = B.getMode();
            const g = readGenre(B, startMode);
            const tools = g.tools;
            let active = -1;           // index into tools, or -1 when a More choice is in use
            let moreOpen = false;
            let moreMode = null;       // the mode whose options the More panel shows
            let verdict = null;

            // Layout -------------------------------------------------------------------------------------------
            const genreName = el('div', {class: 'proto-e-genre'}, [g.genre]);
            const genreSrc = el('div', {class: 'proto-e-genre-src'}, [g.source]);
            const timerText = el('span', {class: 'proto-e-timer-text'}, ['00:00:00']);
            const pauseBtn = el('button', {class: 'proto-e-btn proto-e-small', type: 'button', onclick: function() {
                if (B.getTimer().paused) {
                    B.startTimer();
                } else {
                    B.pauseTimer();
                }
            }}, ['Pause']);
            const header = el('div', {class: 'proto-e-header'}, [
                el('div', {class: 'proto-e-brand'}, ['Solve']),
                el('div', {class: 'proto-e-genre-box'}, [genreName, genreSrc]),
                el('div', {class: 'proto-e-timer'}, [timerText, pauseBtn])
            ]);

            const belt = el('div', {class: 'proto-e-belt', role: 'toolbar', 'aria-label': 'Tools'});
            const offBelt = el('div', {class: 'proto-e-offbelt'});
            const moreBtn = el('button', {class: 'proto-e-more-btn', type: 'button', 'aria-expanded': 'false',
                onclick: function() {
                    moreOpen = !moreOpen;
                    render();
                }}, ['More: every Penpa+ mode']);
            const morePanel = el('div', {class: 'proto-e-more'});
            const keyHint = el('div', {class: 'proto-e-keyhint'});
            const left = el('div', {class: 'proto-e-left'}, [
                el('div', {class: 'proto-e-section'}, ['Tools']), belt, offBelt, keyHint, moreBtn, morePanel
            ]);

            const boardWrap = el('div', {class: 'proto-e-boardwrap'});
            const center = el('div', {class: 'proto-e-center'}, [boardWrap]);

            const undoBtn = el('button', {class: 'proto-e-btn', type: 'button', title: 'Undo (Ctrl+Z)',
                onclick: function() {
                    B.undo();
                }}, ['↶ Undo']);
            const redoBtn = el('button', {class: 'proto-e-btn', type: 'button', title: 'Redo (Ctrl+Y)',
                onclick: function() {
                    B.redo();
                }}, ['Redo ↷']);
            const histText = el('div', {class: 'proto-e-hist'});
            const checkBtn = el('button', {class: 'proto-e-btn proto-e-check', type: 'button', onclick: function() {
                verdict = B.check();
                render();
            }}, ['Check answer']);
            const verdictEl = el('div', {class: 'proto-e-verdict'});
            const info = B.getInfo();
            const rules = el('div', {class: 'proto-e-rules'});
            rules.innerHTML = info.rules || '<i>No rules in the link.</i>';
            const right = el('div', {class: 'proto-e-right'}, [
                el('div', {class: 'proto-e-title'}, [info.title || 'Untitled']),
                el('div', {class: 'proto-e-author'}, [info.author ? 'by ' + info.author : '']),
                el('div', {class: 'proto-e-section'}, ['Rules']),
                rules,
                el('div', {class: 'proto-e-section'}, ['History']),
                el('div', {class: 'proto-e-row'}, [undoBtn, redoBtn]),
                histText,
                el('div', {class: 'proto-e-section'}, ['Answer']),
                checkBtn,
                verdictEl,
                el('div', {class: 'proto-e-row proto-e-foot'}, [
                    el('button', {class: 'proto-e-btn proto-e-small', type: 'button', onclick: function() {
                        B.clear('all');
                    }}, ['Clear all']),
                    el('button', {class: 'proto-e-btn proto-e-small', type: 'button', onclick: function() {
                        B.openSettings();
                    }}, ['Settings'])
                ])
            ]);

            const root = el('div', {class: 'proto-e-root'}, [header, left, center, right]);
            document.body.appendChild(root);
            ctx.helpers.adoptBoard(boardWrap);
            ctx.helpers.hideLegacy();
            installSwap(ctx.canvas);

            // Tools --------------------------------------------------------------------------------------------
            function applySpec(spec) {
                if (spec.combi) {
                    B.setComposite(spec.combi);
                } else {
                    if (B.getMode().mode !== spec.mode) {
                        B.setMode(spec.mode);
                    }
                    if (spec.sub !== undefined) {
                        B.setSubmode(spec.sub);
                    }
                    if (spec.style !== undefined) {
                        B.setStyle(spec.style);
                    }
                }
                swapOn = !!spec.swap;
            }

            function pick(i) {
                if (!tools[i]) {
                    return;
                }
                active = i;
                applySpec(tools[i].spec);
                render();
            }

            function specMatches(spec, m) {
                if (spec.mode !== m.mode) {
                    return false;
                }
                if (spec.combi) {
                    return m.submode === spec.combi;
                }
                if (spec.sub !== undefined && String(spec.sub) !== m.submode) {
                    return false;
                }
                return true;
            }

            /** Keep `active` in step with the engine when the mode changes outside the belt (Tab key, More). */
            function sync() {
                const m = B.getMode();
                if (active >= 0 && specMatches(tools[active].spec, m)) {
                    return;
                }
                active = -1;
                for (let i = 0; i < tools.length; i++) {
                    if (!tools[i].spec.swap && specMatches(tools[i].spec, m)) {
                        active = i;
                        break;
                    }
                }
                swapOn = active >= 0 && !!tools[active].spec.swap;
            }

            const digitsTool = tools.some(takesDigits);
            function keyLabel(i) {
                return (digitsTool ? 'Alt+' : '') + (i + 1);
            }

            function glyph(g) {
                if (g === 'corner') {
                    return el('span', {class: 'proto-e-glyph is-corner'}, ['1', '2', '3', '4'].map(function(d) {
                        return el('i', {}, [d]);
                    }));
                }
                return el('span', {class: 'proto-e-glyph' + (g.length > 2 ? ' is-long' : '')}, [g]);
            }

            function renderBelt() {
                belt.textContent = '';
                tools.forEach(function(t, i) {
                    const b = el('button', {class: 'proto-e-tool' + (i === active ? ' is-active' : ''), type: 'button',
                        'aria-pressed': String(i === active), title: t.how,
                        onmousedown: function(e) {
                            e.preventDefault();
                        },
                        onclick: function() {
                            pick(i);
                        }}, [
                        glyph(t.glyph),
                        el('span', {class: 'proto-e-tname'}, [t.name]),
                        el('span', {class: 'proto-e-key'}, [keyLabel(i)]),
                        el('span', {class: 'proto-e-how'}, [t.how])
                    ]);
                    belt.appendChild(b);
                });
                const m = B.getMode();
                if (active < 0) {
                    const sub = m.mode === 'combi' ? m.submode : (B.listSubmodes(m.mode).find(function(s) {
                        return s.value === m.submode;
                    }) || {}).label;
                    offBelt.textContent = '';
                    offBelt.appendChild(el('div', {class: 'proto-e-offbelt-box'}, [
                        el('span', {}, ['Using a Penpa+ mode: ']),
                        el('b', {}, [modeLabel(m.mode) + (sub ? ' · ' + sub : '')]),
                        el('button', {class: 'proto-e-link', type: 'button', onclick: function() {
                            pick(0);
                        }}, ['back to ' + tools[0].name])
                    ]));
                    offBelt.hidden = false;
                } else {
                    offBelt.hidden = true;
                }
                keyHint.textContent = digitsTool ?
                    'Alt+1-' + tools.length + ' picks a tool (plain digits are entries). Shift / Ctrl held: Corner / Centre.' :
                    '1-' + tools.length + ' picks a tool. Right click does the other tool’s mark.';
            }

            const allModes = B.listModes({all: true}).filter(function(m) {
                return m.mode !== 'board';
            });
            function modeLabel(mode) {
                const m = allModes.find(function(x) {
                    return x.mode === mode;
                });
                return m ? m.label : mode;
            }

            function smallBtn(label, on, onclick, extraClass) {
                return el('button', {class: 'proto-e-chip' + (on ? ' is-on' : '') + (extraClass ? ' ' + extraClass : ''),
                    type: 'button', onclick: onclick}, [label]);
            }

            function leaveBelt() {
                active = -1;
                swapOn = false;
            }

            function renderMore() {
                moreBtn.setAttribute('aria-expanded', String(moreOpen));
                moreBtn.classList.toggle('is-open', moreOpen);
                morePanel.hidden = !moreOpen;
                if (!moreOpen) {
                    return;
                }
                const m = B.getMode();
                const shown = moreMode || m.mode;
                morePanel.textContent = '';
                morePanel.appendChild(el('div', {class: 'proto-e-more-note'}, [
                    'Penpa+’s modes for this grid. • = in the setter’s Tab set.'
                ]));
                const modes = el('div', {class: 'proto-e-chips'});
                allModes.forEach(function(x) {
                    modes.appendChild(smallBtn((x.inTabSet ? '• ' : '') + x.label, x.mode === shown, function() {
                        moreMode = x.mode;
                        if (x.mode !== 'combi') {
                            leaveBelt();
                            B.setMode(x.mode);
                        }
                        render();
                    }, x.mode === m.mode ? 'is-current' : ''));
                });
                morePanel.appendChild(modes);
                const opts = el('div', {class: 'proto-e-chips proto-e-opts'});
                if (shown === 'combi') {
                    B.listComposite().forEach(function(c) {
                        opts.appendChild(smallBtn(c.label, m.mode === 'combi' && m.submode === c.name, function() {
                            leaveBelt();
                            B.setComposite(c.name);
                            render();
                        }));
                    });
                } else if (shown === 'symbol' && m.mode === 'symbol') {
                    // Bridge gap: no listShapes(). A short hand-picked list of the legacy ms_<name> shapes.
                    opts.appendChild(el('div', {class: 'proto-e-optlabel'}, ['Shape (digits pick a variant)']));
                    SHAPES.forEach(function(name) {
                        opts.appendChild(smallBtn(name.replace(/_/g, ' '), m.submode === name, function() {
                            leaveBelt();
                            B.setShape(name);
                            render();
                        }));
                    });
                }
                if (shown === m.mode && shown !== 'combi') {
                    const subs = B.listSubmodes(shown);
                    if (subs.length) {
                        opts.appendChild(el('div', {class: 'proto-e-optlabel'}, ['Sub-mode']));
                        subs.forEach(function(s) {
                            opts.appendChild(smallBtn(s.label || s.value, s.value === m.submode, function() {
                                leaveBelt();
                                B.setSubmode(s.value);
                                render();
                            }));
                        });
                    }
                    const styles = B.listStyles(shown);
                    if (styles.length) {
                        opts.appendChild(el('div', {class: 'proto-e-optlabel'}, ['Style']));
                        styles.forEach(function(s) {
                            opts.appendChild(smallBtn(s.label || String(s.value), s.value === m.style, function() {
                                leaveBelt();
                                B.setStyle(s.value);
                                render();
                            }));
                        });
                    }
                }
                morePanel.appendChild(opts);
            }

            function renderRight() {
                const st = B.getState();
                undoBtn.disabled = !st.canUndo;
                redoBtn.disabled = !st.canRedo;
                const h = B.history();
                histText.textContent = 'Step ' + h.position + ' of ' + h.length;
                checkBtn.disabled = !st.hasAnswerCheck;
                if (!st.hasAnswerCheck) {
                    verdictEl.textContent = 'This link has no answer check.';
                    verdictEl.className = 'proto-e-verdict is-none';
                } else if (verdict) {
                    verdictEl.textContent = verdict.solved ? 'Solved. Well done.' : 'Not solved yet.';
                    verdictEl.className = 'proto-e-verdict ' + (verdict.solved ? 'is-ok' : 'is-no');
                } else {
                    verdictEl.textContent = '';
                    verdictEl.className = 'proto-e-verdict';
                }
                pauseBtn.textContent = st.timer.paused ? 'Resume' : 'Pause';
                timerText.textContent = st.timer.text;
            }

            function render() {
                sync();
                renderBelt();
                renderMore();
                renderRight();
            }

            // Board size ---------------------------------------------------------------------------------------
            function fit() {
                const box = boardWrap.getBoundingClientRect();
                for (let k = 0; k < 3; k++) {
                    const c = ctx.canvas.getBoundingClientRect();
                    const size = B.getSettings().displaySize;
                    const f = Math.min((box.width - 24) / c.width, (box.height - 24) / c.height);
                    const next = Math.max(12, Math.min(90, Math.floor(size * f)));
                    if (next === size) {
                        break;
                    }
                    B.setCellSize(next);
                }
            }

            // Keys ---------------------------------------------------------------------------------------------
            window.addEventListener('keydown', function(e) {
                const t = e.target;
                if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.tagName === 'SELECT' || t.isContentEditable)) {
                    return;
                }
                if (document.querySelector('.swal2-container') || document.querySelector('.modal[style*="block"]')) {
                    return;
                }
                const n = /^Digit([1-9])$/.exec(e.code || '');
                if (!n || e.ctrlKey || e.metaKey) {
                    return;
                }
                const i = parseInt(n[1], 10) - 1;
                const wantAlt = digitsTool;
                if (!!e.altKey !== wantAlt || i >= tools.length) {
                    return;
                }
                // Plain digits in a tool that takes no digits, or Alt+digit anywhere in a digit genre.
                if (!wantAlt && active >= 0 && takesDigits(tools[active])) {
                    return;
                }
                e.preventDefault();
                e.stopImmediatePropagation();
                pick(i);
            }, true);

            B.onChange(function(state, reason) {
                if (reason !== 'redraw' || moreOpen) {
                    render();
                } else {
                    renderRight();
                    if (active >= 0 && !specMatches(tools[active].spec, B.getMode())) {
                        render();
                    }
                }
            });
            B.onTimer(function(t) {
                timerText.textContent = t.text;
            });
            window.addEventListener('resize', fit);

            // Start on the tool matching the setter's starting mode, else the first.
            sync();
            if (active < 0) {
                pick(0);
            }
            fit();
            render();
        }
    };
})();
