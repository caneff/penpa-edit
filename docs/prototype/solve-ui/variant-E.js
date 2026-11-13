/*
 * PROTOTYPE (throwaway, branch prototype/solve-ui): solve-UI variant E, "Genre tools".
 * Owned by variant E's builder: this file and variant-E.css only. See README.md for the contract.
 *
 * The idea: work out the puzzle's genre (or genres, for a combination such as Statue Park + Akari) and show only the
 * tools those genres need, as large buttons named in the genre's own words (Shade, Dot, Loop, Cross, Star, Bulb,
 * Border, Digit, ...). Keys Z X C V A S pick a tool (never digits or Alt: those are entries in digit genres). Penpa+'s
 * full mode list sits behind a "More" disclosure. The genres are shown as chips the solver can remove or add to.
 *
 * Where the genre comes from, in order, all combined (round 2: only 3 of the 12 samples carry genre tags):
 *   1. the link's genre tags (pu.user_tags);
 *   2. genre names in the title and in the rules text;
 *   3. what the answer check compares (shading, cell loop, edge loop, stars, bulbs, circles, fleet, numbers):
 *      every checked kind of mark gets a tool if no detected genre already gave one, so a puzzle with no tag and
 *      no genre word still gets the right belt (Masyu on Ice: "Line must be green" -> Loop + Cross).
 * A combined genre's belt is the union of its genres' tools, without duplicates, at most six.
 *
 * Penpa+'s Composite tools put two marks on one tool, split by mouse button (Black/dot: left shade, right dot).
 * Here each mark is its own tool: a "swap" tool turns a left click into Penpa+'s right click (and the reverse), the
 * way pzprjs's Shift swaps buttons. That swap is done in this file by re-dispatching canvas mouse events. Right click
 * on any tool still gives its partner mark.
 *
 * Claim tested: Penpa+'s mode list is the setter's vocabulary, not the solver's. A solver of a known genre needs
 * 2-4 tools named for what they put on the board, never the list of 12 modes.
 *
 * Reads `pu` directly (bridge gaps, see the report): the answer check's structured option list
 * (pu.get_answercheck_settings, and the legacy #answersetting checkboxes for ALL vs ONE-OF), and the mouse-button
 * swap hooks the canvas's events itself.
 */
(function() {
    'use strict';

    // ---- Tool vocabulary ------------------------------------------------------------------------------------------
    // A tool kind: {name, glyph, how, spec}. spec is what the engine is set to: {mode, sub?, style?, combi?, swap?}.

    function T(name, glyph, how, spec) {
        return {name: name, glyph: glyph, how: how, spec: spec};
    }

    const KINDS = {
        shade: T('Shade', '■', 'Click or drag cells. Right click: dot', {mode: 'combi', combi: 'blpo'}),
        dot: T('Dot', '•', 'Click or drag: cell stays unshaded', {mode: 'combi', combi: 'blpo', swap: true, same: 'litdot'}),
        loop: T('Loop', '➰', 'Drag through cell centres. Right click an edge: cross', {mode: 'combi', combi: 'linex'}),
        linecross: T('Cross', '✕', 'Click an edge the loop does not cross', {mode: 'combi', combi: 'linex', swap: true}),
        edgeloop: T('Loop', '⬚', 'Drag along grid lines. Right click an edge: cross', {mode: 'combi', combi: 'edgex'}),
        border: T('Border', '┃', 'Drag along grid lines between regions. Right click: cross',
            {mode: 'combi', combi: 'edgex'}),
        edgecross: T('Cross', '✕', 'Click a grid line that is not used', {mode: 'combi', combi: 'edgex', swap: true}),
        white: T('White', '○', 'Click or drag: white circles. Right click: black', {mode: 'combi', combi: 'blwh'}),
        black: T('Black', '●', 'Click or drag: black circles', {mode: 'combi', combi: 'blwh', swap: true}),
        star: T('Star', '★', 'Click a cell. Right click: no star', {mode: 'combi', combi: 'star'}),
        nostar: T('No star', '✕', 'Click or drag: cells without a star', {mode: 'combi', combi: 'star', swap: true}),
        bulb: T('Bulb', '☀', 'Click a cell. Right click: dot', {mode: 'combi', combi: 'akari'}),
        litdot: T('Dot', '•', 'Click or drag: no bulb here', {mode: 'combi', combi: 'akari', swap: true, same: 'dot'}),
        ship: T('Ship', '▮', 'Click: ship cell, again to cycle the end shape. Right click: water',
            {mode: 'combi', combi: 'battleship'}),
        water: T('Water', '≈', 'Click or drag: water', {mode: 'combi', combi: 'battleship', swap: true}),
        tent: T('Tent', '▲', 'Click a cell. Right click: no tent', {mode: 'combi', combi: 'tents'}),
        notent: T('No tent', '✕', 'Click or drag: no tent', {mode: 'combi', combi: 'tents', swap: true}),
        mine: T('Mine', '✹', 'Click a cell. Right click: safe', {mode: 'combi', combi: 'mines'}),
        safe: T('Safe', '✕', 'Click or drag: no mine', {mode: 'combi', combi: 'mines', swap: true}),
        bridge: T('Bridge', '═', 'Drag island to island; again for a double', {mode: 'combi', combi: 'hashi'}),
        triangle: T('Triangle', '◢', 'Drag from a cell corner. Right click: dot', {mode: 'combi', combi: 'shaka'}),
        digit: T('Digit', '5', 'Click a cell, type a number', {mode: 'number', sub: '1', same: 'sdigit'}),
        candidate: T('Candidate', 'corner', 'Small pencil marks in the cell', {mode: 'number', sub: '7'}),
        letter: T('Colour', 'RGB', 'Click a cell, type R, G or B', {mode: 'number', sub: '1'}),
        sdigit: T('Digit', '5', 'Select cells, type 1-9', {mode: 'sudoku', sub: '1'}),
        scorner: T('Corner', 'corner', 'Small digits in the corners', {mode: 'sudoku', sub: '2'}),
        scentre: T('Centre', '123', 'Small digits in the middle', {mode: 'sudoku', sub: '3'})
    };

    // ---- Genre table ----------------------------------------------------------------------------------------------
    // id: shown name; tags: Penpa+ genre tags (genre_tags.js) that mean it; re: matched in the title and rules text;
    // kinds: its tools, most used first. Hand-made, from each genre's rules and Penpa+'s Composite tools.

    function G(name, tags, re, kinds) {
        return {name: name, tags: tags, re: re, kinds: kinds};
    }

    const SHADING = ['shade', 'dot'];
    const GENRES = [
        G('Sudoku', ['classic', 'latin', 'irregular', 'alphabet', 'arrow', 'thermo', 'tightfit', 'evenodd',
            'consecutivepairs', 'killer', 'isodoku', 'consecutive', 'nonconsecutive', 'sudokurve', 'tile', 'deficit',
            'surplus', 'outside', 'sudoku'], /sudoku/i, ['sdigit', 'scorner', 'scentre']),
        G('Slitherlink', ['slitherlink', 'lither'], /slither|\blither/i, ['edgeloop', 'edgecross']),
        G('Masyu', ['masyu', 'moon or sun', 'balanceloop', 'geradeweg', 'country road', 'castlewall', 'double back',
            'haisu', 'all or nothing'], /\bma(sy|ys)u\b|pearl puzzle/i, ['loop', 'linecross']),
        G('Yajilin', ['yajilin'], /yajilin|yajikazu/i, ['shade', 'loop', 'dot', 'linecross']),
        G('Nurikabe', ['nurikabe'], /nurikabe/i, SHADING),
        G('Heyawake', ['heyawake'], /heyawake/i, SHADING),
        G('LITS', ['lits'], /\bLITS\b/, SHADING),
        G('Hitori', ['hitori'], /hitori/i, SHADING),
        G('Tapa', ['tapa'], /\btapa\b/i, SHADING),
        G('Statue Park', ['statuepark', 'statue park'], /statue ?park/i, SHADING),
        G('Aquarium', ['aquarium'], /aquarium/i, SHADING),
        G('Kurodoko', ['kurodoko', 'kurotto', 'kuromasu'], /kurodoko|kuromasu|kurotto/i, SHADING),
        G('Nonogram', ['nonogram'], /nonogram|picross/i, SHADING),
        G('Yin-Yang', ['yinyang', 'yin-yang'], /\byin\b|yin-?yang/i, ['white', 'black']),
        G('Star Battle', ['starbattle', 'star battle'], /star ?battle/i, ['star', 'nostar']),
        G('Galaxies', ['spiralgalaxies', 'galaxies', 'tentaisho'], /galax|tentaisho/i, ['border', 'edgecross']),
        G('Fillomino', ['fillomino'], /fillomino/i, ['digit', 'border', 'edgecross']),
        G('Akari', ['akari', 'light up'], /akari|light ?up/i, ['bulb', 'litdot']),
        G('RGB colours', [], /\bRGB\b/, ['letter']),
        // Rules that ask for written digits on top of another genre (Kyklos's Yajilin clue cells).
        G('Digits', [], /\b(place|write|enter) (the )?(digits|numbers)\b/i, ['digit']),
        G('Battleships', ['battleships', 'battleship'], /battleship|\bships?\b|\bfleet\b/i, ['ship', 'water']),
        G('Tents', ['tents'], /\btents?\b.*\btrees?\b/i, ['tent', 'notent']),
        G('Minesweeper', ['minesweeper'], /minesweeper/i, ['mine', 'safe']),
        G('Hashi', ['hashiwokakero (hashi/bridges)', 'hashi'], /hashi|bridges puzzle/i, ['bridge']),
        G('Shakashaka', ['shakashaka'], /shakashaka/i, ['triangle'])
    ];

    // What each answer-check option needs on the board (answercheck_opt_conversion in conversion.js), and the
    // genre-free tools that make it. Used when no detected genre already has a tool for it.
    const CHECK_NEEDS = {
        'shading': {label: 'shading', kinds: ['shade', 'dot']},
        'shading exact color': {label: 'shading', kinds: ['shade', 'dot']},
        'cell loop': {label: 'a loop through cells', kinds: ['loop', 'linecross']},
        'cell loop exact': {label: 'a loop through cells', kinds: ['loop', 'linecross']},
        'edge loop': {label: 'lines on the grid', kinds: ['border', 'edgecross']},
        'edge loop exact': {label: 'lines on the grid', kinds: ['border', 'edgecross']},
        'number': {label: 'numbers', kinds: ['digit']},
        'circle': {label: 'circles', kinds: ['white', 'black']},
        'star battle': {label: 'stars', kinds: ['star', 'nostar']},
        'akari': {label: 'bulbs', kinds: ['bulb', 'litdot']},
        'battleship': {label: 'a fleet', kinds: ['ship', 'water']},
        'tents': {label: 'tents', kinds: ['tent', 'notent']},
        'minesweeper': {label: 'mines', kinds: ['mine', 'safe']}
    };
    // Which tool kinds satisfy a check option (any one is enough).
    const CHECK_MADE_BY = {
        'shading': ['shade'], 'shading exact color': ['shade'], 'cell loop': ['loop'], 'cell loop exact': ['loop'],
        'edge loop': ['edgeloop', 'border'], 'edge loop exact': ['edgeloop', 'border'],
        'number': ['digit', 'letter', 'sdigit'], 'circle': ['white', 'black'], 'star battle': ['star'],
        'akari': ['bulb'], 'battleship': ['ship'], 'tents': ['tent'], 'minesweeper': ['mine']
    };

    const KEYS = ['z', 'x', 'c', 'v', 'a', 's'];
    const MAX_TOOLS = KEYS.length;

    /** The answer check's options and whether ALL or ONE of them must hold. Bridge gap: read from pu directly. */
    function readCheck(bridge) {
        if (!bridge.getState().hasAnswerCheck) {
            return {opts: [], any: false};
        }
        const opts = window.pu.get_answercheck_settings().answercheck_opt;
        const anyAnd = document.querySelector('#answersetting .solcheck:checked');
        return {opts: opts, any: !anyAnd};
    }

    /**
     * Detect genres from tags, title and rules text.
     * @returns {Array<{genre:object, why:string}>}
     */
    function detectGenres(bridge) {
        const tags = bridge.genreTags().map(function(t) {
            return String(t).toLowerCase();
        });
        const info = bridge.getInfo();
        const tmp = document.createElement('div');
        tmp.innerHTML = info.rules || '';
        const rulesText = tmp.textContent;
        const found = [];
        function add(g, why) {
            if (!found.some(function(f) {
                return f.genre === g;
            })) {
                found.push({genre: g, why: why});
            }
        }
        tags.forEach(function(t) {
            GENRES.forEach(function(g) {
                if (g.tags.indexOf(t) !== -1) {
                    add(g, 'tag “' + t + '”');
                }
            });
        });
        GENRES.forEach(function(g) {
            if (g.re.test(info.title || '')) {
                add(g, 'title');
            }
        });
        GENRES.forEach(function(g) {
            // Sudoku is only trusted from a tag or the title: other genres' rules mention it in passing.
            if (g.name !== 'Sudoku' && g.re.test(rulesText)) {
                add(g, 'rules');
            }
        });
        // Drop a genre that adds no tool of its own (Sudoku's rules say "place the digits": no extra Digits chip).
        const have = [];
        return found.filter(function(f) {
            const adds = f.genre.kinds.some(function(k) {
                return have.indexOf(k) === -1 && have.indexOf(KINDS[k].spec.same) === -1;
            });
            f.genre.kinds.forEach(function(k) {
                have.push(k);
            });
            return adds;
        });
    }

    /**
     * Build the belt from the chosen genres plus whatever the answer check still needs.
     * @returns {{tools:Array, checkAdded:Array<string>}}
     */
    function buildBelt(genres, check, comboAvail) {
        const kinds = [];
        function usable(k) {
            const spec = KINDS[k].spec;
            return !spec.combi || comboAvail.indexOf(spec.combi) !== -1;
        }
        function push(k) {
            // A kind marked `same` is dropped when its twin is already on the belt (Akari's dot and Shade's dot
            // are both "Dot"; the Bulb tool's right click still gives Akari's own).
            const twin = KINDS[k].spec.same;
            if (kinds.indexOf(k) === -1 && kinds.indexOf(twin) === -1 && usable(k) && kinds.length < MAX_TOOLS) {
                kinds.push(k);
            }
        }
        genres.forEach(function(g) {
            g.kinds.forEach(push);
        });
        // The answer check: make sure what it compares can be put on the board.
        const checkAdded = [];
        const covered = function(opt) {
            return (CHECK_MADE_BY[opt] || []).some(function(k) {
                return kinds.indexOf(k) !== -1;
            });
        };
        const needs = check.opts.filter(function(o) {
            return CHECK_NEEDS[o];
        });
        const missing = check.any ? (needs.some(covered) ? [] : needs.slice(0, 1)) : needs.filter(function(o) {
            return !covered(o);
        });
        missing.forEach(function(o) {
            CHECK_NEEDS[o].kinds.forEach(push);
            checkAdded.push(CHECK_NEEDS[o].label);
        });
        return {tools: kinds.map(function(k) {
            return Object.assign({kind: k}, KINDS[k]);
        }), checkAdded: checkAdded};
    }

    const SHAPES = ['circle_L', 'square_L', 'triup_L', 'diamond_L', 'ox_B', 'cross', 'tri', 'arrow_B_B', 'degital_B'];

    function takesText(tool) {
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
            const comboAvail = B.listComposite().map(function(c) {
                return c.name;
            });
            const check = readCheck(B);
            const detected = detectGenres(B);
            let chosen = detected.map(function(d) {
                return d.genre;
            });
            let tools = [];
            let checkAdded = [];
            let active = -1;           // index into tools, or -1 when a More choice is in use
            let moreOpen = false;
            let moreMode = null;       // the mode whose options the More panel shows
            let verdict = null;

            function rebuild() {
                const b = buildBelt(chosen, check, comboAvail);
                tools = b.tools;
                checkAdded = b.checkAdded;
                if (!tools.length) {
                    // No genre and no check to go on: a generic belt, one tool per common family.
                    tools = ['shade', 'loop', 'digit'].map(function(k) {
                        return Object.assign({kind: k}, KINDS[k]);
                    });
                }
            }

            // Layout -------------------------------------------------------------------------------------------
            const genreName = el('div', {class: 'proto-e-genre'});
            const genreSrc = el('div', {class: 'proto-e-genre-src'});
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

            const genreChips = el('div', {class: 'proto-e-gchips'});
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
                el('div', {class: 'proto-e-section'}, ['Genre']), genreChips,
                el('div', {class: 'proto-e-section proto-e-tools-h'}, ['Tools']), belt, offBelt, keyHint, moreBtn,
                morePanel
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
            const checkWhat = el('div', {class: 'proto-e-checkwhat'});
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
                checkWhat,
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
                if (active >= 0 && tools[active] && specMatches(tools[active].spec, m) &&
                    !!tools[active].spec.swap === swapOn) {
                    return;
                }
                active = -1;
                for (let i = 0; i < tools.length; i++) {
                    if (!!tools[i].spec.swap === swapOn && specMatches(tools[i].spec, m)) {
                        active = i;
                        break;
                    }
                }
                if (active < 0) {
                    swapOn = false;
                }
            }

            function glyph(g) {
                if (g === 'corner') {
                    return el('span', {class: 'proto-e-glyph is-corner'}, ['1', '2', '3', '4'].map(function(d) {
                        return el('i', {}, [d]);
                    }));
                }
                return el('span', {class: 'proto-e-glyph' + (g.length > 2 ? ' is-long' : '')}, [g]);
            }

            function renderGenre() {
                const names = chosen.map(function(g) {
                    return g.name;
                });
                genreName.textContent = names.length ? names.join(' + ') :
                    (checkAdded.length ? 'Genre not named' : 'Unknown genre');
                const why = detected.filter(function(d) {
                    return chosen.indexOf(d.genre) !== -1;
                }).map(function(d) {
                    return d.genre.name + ' from the ' + d.why;
                });
                if (checkAdded.length) {
                    why.push('the answer check wants ' + checkAdded.join(' and '));
                }
                genreSrc.textContent = why.length ? 'Tools from: ' + why.join('; ') :
                    'No genre found in tags, title, rules or answer check: generic tools';

                genreChips.textContent = '';
                chosen.forEach(function(g) {
                    genreChips.appendChild(el('span', {class: 'proto-e-gchip'}, [
                        g.name,
                        el('button', {class: 'proto-e-gx', type: 'button', title: 'Remove ' + g.name + '’s tools',
                            'aria-label': 'Remove ' + g.name, onclick: function() {
                                chosen = chosen.filter(function(x) {
                                    return x !== g;
                                });
                                retool();
                            }}, ['×'])
                    ]));
                });
                const sel = el('select', {class: 'proto-e-gadd', 'aria-label': 'Add a genre’s tools', onchange: function() {
                    const g = GENRES[parseInt(sel.value, 10)];
                    if (g && chosen.indexOf(g) === -1) {
                        chosen = chosen.concat([g]);
                        retool();
                    }
                }});
                sel.appendChild(el('option', {value: ''}, ['+ genre']));
                GENRES.forEach(function(g, i) {
                    if (chosen.indexOf(g) === -1) {
                        sel.appendChild(el('option', {value: String(i)}, [g.name]));
                    }
                });
                genreChips.appendChild(sel);
            }

            function retool() {
                const keep = active >= 0 && tools[active] ? tools[active].kind : null;
                rebuild();
                active = -1;
                const i = tools.findIndex(function(t) {
                    return t.kind === keep;
                });
                pick(i >= 0 ? i : 0);
            }

            function renderBelt() {
                belt.textContent = '';
                tools.forEach(function(t, i) {
                    const b = el('button', {class: 'proto-e-tool' + (i === active ? ' is-active' : ''), type: 'button',
                        'aria-pressed': String(i === active), title: t.how, 'data-kind': t.kind,
                        onmousedown: function(e) {
                            e.preventDefault();
                        },
                        onclick: function() {
                            pick(i);
                        }}, [
                        glyph(t.glyph),
                        el('span', {class: 'proto-e-tname'}, [t.name]),
                        el('span', {class: 'proto-e-key'}, [KEYS[i].toUpperCase()]),
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
                const keys = KEYS.slice(0, tools.length).join(' ').toUpperCase();
                keyHint.textContent = keys + ' pick a tool. Right click gives the tool’s partner mark.' +
                    (tools.some(takesText) ? ' Digits are entries.' : '');
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
                } else if (st.solved) {
                    verdictEl.textContent = 'Solved. Well done.';
                    verdictEl.className = 'proto-e-verdict is-ok';
                } else if (verdict) {
                    verdictEl.textContent = 'Not solved yet.';
                    verdictEl.className = 'proto-e-verdict is-no';
                } else {
                    verdictEl.textContent = '';
                    verdictEl.className = 'proto-e-verdict';
                }
                pauseBtn.textContent = st.timer.paused ? 'Resume' : 'Pause';
                timerText.textContent = st.timer.text;
            }

            function renderCheckWhat() {
                const labels = check.opts.filter(function(o) {
                    return CHECK_NEEDS[o];
                }).map(function(o) {
                    return CHECK_NEEDS[o].label;
                }).filter(function(l, i, a) {
                    return a.indexOf(l) === i;
                });
                checkWhat.textContent = labels.length ?
                    'The check compares ' + labels.join(check.any ? ' or ' : ' and ') + '.' : '';
            }

            function render() {
                sync();
                renderGenre();
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
            // Z X C V A S pick tools 1-6. Penpa+ itself uses Z/X/C/V only as Sudoku sub-mode keys, which the Sudoku
            // belt (Digit, Corner, Centre) repeats; no sample's answer uses those letters as entries.
            window.addEventListener('keydown', function(e) {
                const t = e.target;
                if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.tagName === 'SELECT' || t.isContentEditable)) {
                    return;
                }
                if (document.querySelector('.swal2-container') || document.querySelector('.modal[style*="block"]')) {
                    return;
                }
                if (e.ctrlKey || e.metaKey || e.altKey || e.shiftKey) {
                    return;
                }
                // The Colour tool: R, G, B go in as capitals, as the RGB answers are written.
                if (active >= 0 && tools[active].kind === 'letter' && /^[rgb]$/i.test(e.key)) {
                    e.preventDefault();
                    e.stopImmediatePropagation();
                    // Sent as Shift+letter, which this handler lets through (no re-entry), as a capital to Penpa+.
                    B.sendKey(e.key.toUpperCase(), {shift: true});
                    return;
                }
                const i = KEYS.indexOf(String(e.key).toLowerCase());
                if (i < 0 || i >= tools.length) {
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
            rebuild();
            renderCheckWhat();
            swapOn = false;
            sync();
            if (active < 0) {
                pick(0);
            }
            fit();
            render();
        }
    };
})();
