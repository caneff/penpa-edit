/*
 * PROTOTYPE (throwaway, branch prototype/solve-ui): solve-UI variant J, "Selection toolbar".
 * Owned by variant J's builder: this file and variant-J.css only. See README.md for the contract.
 *
 * The idea: there is no permanent mode bar. A compact palette pops up beside whatever you are working on, placed so it
 * does not cover it, follows it as it moves, fades out while you drag, and is reachable from the keyboard (` focuses
 * it, arrows / Tab move, Enter or Space presses, Esc goes back to the board). What it holds depends on the mode:
 *   - Value (Sudoku): Normal / Corner / Centre / Colour tabs, a 3x3 digit pad, erase; Colour switches to Multicolor and
 *     shows swatches that colour the selection.
 *   - Number / Shape: the mode's sub-modes and a digit pad.
 *   - Path and Paint genres (Composite tools such as masyu's line-x or nurikabe's shade-dot, Surface, Line, Edge,
 *     Wall, ...): Penpa+ has no cell selection there, so "the selection" here is THE LAST STROKE: the cells your last
 *     click or drag touched, outlined on the board. The palette sits beside it with the brush (primary / secondary, e.g.
 *     Line or x, Shade or Dot; the secondary brush makes a left drag act as Penpa+'s right drag), colour swatches,
 *     sub-modes, and "Undo stroke" (removes that whole gesture, however many history steps it made).
 *   - Always: the puzzle's KIT (round 2), its 2-5 tools on top (Alt+1..5), each one Penpa+ Composite tool or mode
 *     picked from what the answer check compares, the title and the rules (buildKit below): Slitherlink Loop (Edge x),
 *     Masyu Loop (Line x), Yajilin Shade + loop, Nurikabe Shade (Black / dot), Yin-Yang Circles, Star Battle Stars,
 *     Galaxies Borders + Shade, Fillomino Borders + Sizes, Akari Bulbs (+ Shade for Statue Park), Battleships Ships,
 *     hex Akari Bulbs + Letters (R G B pad); plus Colour. The page starts on the kit's first tool. "All modes" opens
 *     every mode and Composite tool. Alt+Q swaps the brush. Undo, Redo, Check.
 * With nothing selected the palette idles, shrunk to its header and footer, beside the board. Placement defaults to the
 * edge rail (just off the board at the work's height); the pin switches to beside-the-work.
 * Penpa+'s floating number panel is hidden (the palette's pad replaces it).
 *
 * The claim it tests: the palette should come to the work, not sit in a corner.
 *
 * Bridge gaps worked around here (read `pu` / the legacy DOM / raw events directly):
 *   - No "secondary button" input: the secondary brush intercepts trusted left mousedown/mousemove on #canvas in the
 *     capture phase and re-dispatches them as right-button events (button 2 / buttons 2).
 *   - No stroke notion: strokes are tracked here (cells under the pointer between mousedown and mouseup, via
 *     pageToPoint with cell-centre types, and history() before and after); "Undo stroke" is jumpTo(before).
 *   - No colour values for styles: read from the legacy `<id>_lb` computed background.
 *   - No list of what each Composite tool's left / right buttons do: a small table below (Penpa+ README § Composite).
 *   - Shape mode has no shape picker here (no listShapes()); digits pick the current shape's variants.
 *   - history() lags one frame; stroke bookkeeping reads it after a timeout.
 *   - No answer-check options in the bridge (answerCheckInfo() is HTML only): the kit reads
 *     pu.get_answercheck_settings().answercheck_opt; the hex Akari's letters come from parsing pu.solution.
 *   - No "what each Composite tool does" or genre-to-tool map in the bridge: the kit table lives here.
 *   - setMode() opens modes the link's Penpa Lite hides (Galaxies shows no Composite yet uses Edge x / Black dot).
 */
(function() {
    'use strict';

    /** Composite tools: what the primary (left) and secondary (right) button put down. */
    const COMBI_BRUSH = {
        linex: ['Line', '×'], lineox: ['Line / O', '×'], linedir: ['Line', '×'], edgex: ['Edge', '×'],
        edgexoi: ['Edge', '×'], edgesub: ['Edge', '×'], yajilin: ['Shade / Loop', 'Dot / ×'],
        blpo: ['Shade', 'Dot'], blwh: ['White', 'Black'], shaka: ['Shade', 'Dot'], star: ['Star', '×'],
        tents: ['Tent', '×'], mines: ['Mine', '×'], doublemines: ['Mine', '×'], akari: ['Bulb', 'Dot'],
        hashi: ['Bridge', '—'], battleship: ['Ship', 'Water'], magnets: ['+ / −', '×'], rassisillai: ['Line', '×']
    };

    /** Modes whose own selection or cursor is the selection; every other mode uses the last stroke. */
    const SELECT_MODES = ['sudoku', 'multicolor', 'number', 'symbol'];

    const SUDOKU_TABS = [
        {key: 'n', label: 'Value', mode: 'sudoku', sub: '1', hint: 'Z'},
        {key: 'c', label: 'Corner', mode: 'sudoku', sub: '2', hint: 'X'},
        {key: 'm', label: 'Centre', mode: 'sudoku', sub: '3', hint: 'C'},
        {key: 'k', label: 'Colour', mode: 'multicolor', hint: 'V'}
    ];

    /**
     * The puzzle's kit: the 2-5 tools a solver of this genre needs, read from what the answer check compares
     * (pu.get_answercheck_settings().answercheck_opt), the title and the rules; genre tags are absent on most links.
     * A tool is {label, mode, sub?, style?, tip}. Most genres are one Composite tool (left = main mark, right =
     * helper); combined gestures (Yajilin: click shades, drag draws the loop) stay one tool.
     */
    function buildKit(B) {
        const info = B.getInfo();
        const text = ((info.title || '') + ' ' + (info.rules || '')).toLowerCase();
        let ac = [];
        try {
            ac = pu.get_answercheck_settings().answercheck_opt || [];
        } catch (e) {
            ac = [];
        }
        const kit = [];
        const add = function(t) {
            if (!kit.some(function(k) {
                return k.mode === t.mode && String(k.sub) === String(t.sub);
            })) {
                kit.push(t);
            }
        };
        const regions = /fillomino|galax|tentaisho|divide the grid|regions?\b/.test(text);
        ac.forEach(function(opt) {
            if (opt === 'edge loop' || opt === 'edge loop exact') {
                add(regions ? {label: 'Borders', mode: 'combi', sub: 'edgex', tip: 'Drag along edges: border; × brush: not a border'} :
                    {label: 'Loop', mode: 'combi', sub: 'edgex', tip: 'Drag along edges: loop; × brush: crossed-out edge'});
            } else if (opt === 'cell loop' || opt === 'cell loop exact') {
                if (/yajilin/.test(text) || (/shade/.test(text) && !/masyu|circle/.test(text))) {
                    add({label: 'Shade + loop', mode: 'combi', sub: 'yajilin', tip: 'Click: shade; drag: loop. Dot brush: dot in cell, × on edges'});
                } else {
                    add({label: 'Loop', mode: 'combi', sub: 'linex', tip: 'Drag through cells: loop; × brush: crossed-out edge'});
                }
            } else if ((opt === 'shading' || opt === 'shading exact color') && ac.indexOf('battleship') === -1) {
                // (Battleships checks shading OR ships; the Ships tool's segments and water cover it.)
                add({label: 'Shade', mode: 'combi', sub: 'blpo', tip: 'Click / drag: shade; Dot brush: unshaded dot'});
            } else if (opt === 'circle') {
                add({label: 'Circles', mode: 'combi', sub: 'blwh', tip: 'White brush / Black brush; click again to swap'});
            } else if (opt === 'star battle') {
                add({label: 'Stars', mode: 'combi', sub: 'star', tip: 'Click: star; × brush: cross out (drag for many)'});
            } else if (opt === 'akari') {
                add({label: 'Bulbs', mode: 'combi', sub: 'akari', tip: 'Click: bulb; Dot brush: no bulb here'});
            } else if (opt === 'battleship') {
                add({label: 'Ships', mode: 'combi', sub: 'battleship', tip: 'Click cycles segment / water; drag out from a cell for an end piece; Water brush: drag for many'});
            } else if (opt === 'tents') {
                add({label: 'Tents', mode: 'combi', sub: 'tents', tip: 'Click: tent; × brush: no tent'});
            } else if (opt === 'minesweeper') {
                add({label: 'Mines', mode: 'combi', sub: 'mines', tip: 'Click: mine; × brush: safe'});
            } else if (opt === 'magnets') {
                add({label: 'Magnets', mode: 'combi', sub: 'magnets', tip: 'Click: + / −; × brush: empty'});
            } else if (opt === 'shakashaka') {
                add({label: 'Triangles', mode: 'combi', sub: 'shaka', tip: 'Drag from a corner: triangle; Dot brush: empty'});
            } else if (opt === 'wall') {
                add({label: 'Walls', mode: 'wall', sub: '1', tip: 'Drag along cell centres: wall'});
            } else if (opt === 'number') {
                add(pu.gridtype === 'sudoku' ? {label: 'Digits', mode: 'sudoku', sub: '1', tip: 'Select cells, type'} :
                    {label: letters(B).length ? 'Letters' : 'Numbers', mode: 'number', sub: '1', tip: 'Click a cell, type'});
            }
        });
        // Helpers a solver of the genre writes though the check ignores them.
        if (/fillomino/.test(text)) {
            add({label: 'Sizes', mode: 'number', sub: '1', tip: 'Click a cell, type its region size'});
        }
        if (/galax|tentaisho/.test(text) && !kit.some(function(k) {
            return k.sub === 'blpo';
        })) {
            add({label: 'Shade', mode: 'combi', sub: 'blpo', tip: 'Click / drag: shade; Dot brush: dot'});
        }
        if (!kit.length) {
            add({label: 'Digits', mode: 'sudoku', sub: '1', tip: 'Select cells, type'});
        }
        // The genre's own mark first (loop, borders, stars, bulbs, ships), then shading, then values.
        const rank = function(k) {
            return k.sub === 'blpo' ? 1 : (k.mode === 'number' || k.mode === 'sudoku') ? 2 : 0;
        };
        kit.sort(function(a, b) {
            return rank(a) - rank(b);
        });
        // Colour is the free-form helper every genre gets (pencil-colouring areas), last; Sudoku has its own tab.
        if (!kit.some(function(k) {
            return k.mode === 'sudoku';
        })) {
            add({label: 'Colour', mode: 'surface', helper: true, tip: 'Paint cells; the swatch picks the colour'});
        }
        return kit.slice(0, 5);
    }

    /** Letters the solution uses as values (e.g. R G B in the hex Akari), so the pad offers them. */
    function letters(B) {
        let out = [];
        try {
            const m = String(pu.solution).match(/(^|,)([A-Z])(?=,|$)/g) || [];
            out = m.map(function(x) {
                return x.replace(',', '');
            });
        } catch (e) {
            out = [];
        }
        out = out.filter(function(x, i) {
            return out.indexOf(x) === i;
        }).sort();
        // Colour letters read in RGB order, not alphabetically.
        return out.every(function(x) {
            return 'RGB'.indexOf(x) !== -1;
        }) ? ['R', 'G', 'B'].filter(function(x) {
                return out.indexOf(x) !== -1;
            }) : out;
    }

    const GAP = 14;         // px between the work and the palette
    const MARGIN = 8;       // px from the window edge
    const SNAP = 170;       // px: work this close to the board's edge puts the palette just off the board

    window.PrototypeVariants = window.PrototypeVariants || {};
    window.PrototypeVariants.J = {
        name: 'Selection toolbar',

        /** @param {object} ctx see README.md, "The variant contract" */
        mount(ctx) {
            const B = ctx.bridge;
            const el = ctx.helpers.el;
            const canvas = ctx.canvas;

            // ---- Skeleton -----------------------------------------------------------------------------------------
            const stage = el('div', {class: 'proto-j-stage'});
            const app = el('div', {class: 'proto-j-app'}, [stage]);
            document.body.appendChild(app);
            ctx.helpers.adoptBoard(stage);
            ctx.helpers.hideLegacy();

            const info = B.getInfo();
            const timerText = el('span', {class: 'proto-j-timer'}, ['00:00']);
            const rulesBox = el('div', {class: 'proto-j-rules', hidden: ''});
            rulesBox.innerHTML = info.rules || '<em>No rules given.</em>';
            const card = el('div', {class: 'proto-j-card'}, [
                el('div', {class: 'proto-j-title'}, [info.title || 'Untitled puzzle']),
                el('div', {class: 'proto-j-byline'}, [info.author ? 'by ' + info.author : '']),
                el('div', {class: 'proto-j-cardrow'}, [
                    timerText,
                    plainBtn('Pause', function(b) {
                        if (B.getTimer().paused) {
                            B.startTimer();
                        } else {
                            B.pauseTimer();
                        }
                        b.textContent = B.getTimer().paused ? 'Resume' : 'Pause';
                    }),
                    plainBtn('Rules', function() {
                        rulesBox.hidden = !rulesBox.hidden;
                    }),
                    plainBtn('Settings', function() {
                        B.openSettings();
                    })
                ]),
                rulesBox
            ]);
            const hint = el('div', {class: 'proto-j-hint'}, []);
            document.body.appendChild(card);
            document.body.appendChild(hint);

            const strokeBox = el('div', {class: 'proto-j-stroke', hidden: ''});
            document.body.appendChild(strokeBox);

            const pal = el('div', {class: 'proto-j-pal', role: 'toolbar', 'aria-label': 'Selection palette'});
            const palHead = el('div', {class: 'proto-j-head'});
            const palBody = el('div', {class: 'proto-j-body'});
            const palFoot = el('div', {class: 'proto-j-foot'});
            const toast = el('div', {class: 'proto-j-toast', hidden: ''});
            pal.appendChild(palHead);
            pal.appendChild(palBody);
            pal.appendChild(palFoot);
            pal.appendChild(toast);
            document.body.appendChild(pal);

            /** A card button (not in the palette). */
            function plainBtn(label, onClick) {
                const b = el('button', {class: 'proto-j-plain', type: 'button', tabindex: '-1'}, [label]);
                b.addEventListener('mousedown', function(e) {
                    e.preventDefault();
                });
                b.addEventListener('click', function() {
                    onClick(b);
                });
                return b;
            }

            /** A palette button: never steals focus on click, so keys keep going to the board. */
            function pbtn(cls, label, onClick, title) {
                const b = el('button', {class: 'proto-j-btn ' + (cls || ''), type: 'button', tabindex: '-1'}, [label]);
                if (title) {
                    b.title = title;
                }
                b.addEventListener('mousedown', function(e) {
                    e.preventDefault();
                });
                b.addEventListener('click', function(e) {
                    e.preventDefault();
                    onClick(e);
                    afterAction();
                });
                return b;
            }

            // ---- Board fit: as large as fits with room for the palette on one side --------------------------------
            function fitBoard() {
                const r = canvas.getBoundingClientRect();
                if (!r.width || !pu.size) {
                    return;
                }
                const availW = window.innerWidth - 2 * 300;
                const availH = window.innerHeight - 110;
                const px = Math.max(12, Math.min(90, Math.floor(Math.min(availW / (r.width / pu.size),
                    availH / (r.height / pu.size)))));
                if (Math.abs(px - pu.size) >= 1) {
                    B.setCellSize(px);
                }
            }
            let fitTimer = null;
            window.addEventListener('resize', function() {
                clearTimeout(fitTimer);
                fitTimer = setTimeout(function() {
                    fitBoard();
                    schedule();
                }, 120);
            });
            requestAnimationFrame(function() {
                fitBoard();
                requestAnimationFrame(function() {
                    requestAnimationFrame(function() {
                        fitBoard();
                        schedule();
                    });
                });
            });

            // ---- Colours and labels -------------------------------------------------------------------------------
            function swatchColor(style) {
                const lb = document.getElementById(style.id + '_lb');
                if (!lb) {
                    return null;
                }
                const bg = getComputedStyle(lb).backgroundColor;
                return bg && bg !== 'rgba(0, 0, 0, 0)' && bg !== 'transparent' ? bg : null;
            }

            function modeLabel(mode) {
                const m = B.listModes({all: true}).find(function(x) {
                    return x.mode === mode;
                });
                return m ? m.label : mode;
            }

            // ---- Strokes (the selection in modes without one) -----------------------------------------------------
            let stroke = null;      // {cells: number[], from: number, to: number}
            let live = null;        // the gesture in progress: {cells, from}
            let brush = 'primary';  // Composite: primary = left button, secondary = right button
            let emulating = false;  // a left drag being re-sent as a right drag
            let dragging = false;

            function usesStroke() {
                return SELECT_MODES.indexOf(B.getMode().mode) === -1;
            }

            /** The board point under the pointer that the current tool acts on (a cell, an edge or a vertex). */
            function cellAt(e) {
                const p = B.pageToPoint(e.pageX, e.pageY);
                return p === null ? B.pageToPoint(e.pageX, e.pageY, [0]) : p;
            }

            function resend(type, e, buttons) {
                canvas.dispatchEvent(new MouseEvent(type, {
                    bubbles: true, cancelable: true, view: window, clientX: e.clientX, clientY: e.clientY,
                    button: 2, buttons: buttons, ctrlKey: e.ctrlKey, shiftKey: e.shiftKey, altKey: e.altKey
                }));
            }

            window.addEventListener('mousedown', function(e) {
                if (e.target !== canvas || !e.isTrusted || e.button === 1) {
                    return;
                }
                dragging = true;
                pal.classList.add('is-dragging');
                if (usesStroke()) {
                    const c = cellAt(e);
                    live = {cells: c === null ? [] : [c], from: B.history().position};
                }
                if (e.button === 0 && brush === 'secondary' && B.getMode().mode === 'combi') {
                    e.stopImmediatePropagation();
                    e.preventDefault();
                    emulating = true;
                    resend('mousedown', e, 2);
                }
            }, true);

            window.addEventListener('mousemove', function(e) {
                if (!dragging || !e.isTrusted) {
                    return;
                }
                if (live) {
                    const c = cellAt(e);
                    if (c !== null && live.cells.indexOf(c) === -1) {
                        live.cells.push(c);
                    }
                }
                if (emulating && e.target === canvas) {
                    e.stopImmediatePropagation();
                    resend('mousemove', e, 2);
                }
            }, true);

            window.addEventListener('mouseup', function(e) {
                if (!dragging || !e.isTrusted) {
                    return;
                }
                dragging = false;
                emulating = false;
                pal.classList.remove('is-dragging');
                const g = live;
                live = null;
                if (g) {
                    // history() updates a frame late; read it once the engine has settled.
                    setTimeout(function() {
                        const pos = B.history().position;
                        if (pos !== g.from && g.cells.length) {
                            stroke = {cells: g.cells, from: g.from, to: pos};
                        }
                        schedule();
                    }, 60);
                }
                schedule();
            }, true);

            function undoStroke() {
                if (stroke && B.history().position === stroke.to) {
                    B.jumpTo(stroke.from);
                    stroke = null;
                } else {
                    flash('That stroke is no longer the last thing done');
                }
            }

            // ---- What the palette is anchored to ------------------------------------------------------------------
            function boardRect() {
                const r = canvas.getBoundingClientRect();
                return {left: r.left + scrollX, top: r.top + scrollY, right: r.right + scrollX,
                    bottom: r.bottom + scrollY, width: r.width, height: r.height};
            }

            function unionRect(cells) {
                let rect = null;
                cells.forEach(function(c) {
                    const pt = B.pointToPage(c);
                    const h = pu.size * 0.3;
                    const r = pt && pt.type !== 0 ? {left: pt.x - h, top: pt.y - h, right: pt.x + h, bottom: pt.y + h} :
                        B.cellRect(c);
                    rect = rect ? {left: Math.min(rect.left, r.left), top: Math.min(rect.top, r.top),
                        right: Math.max(rect.right, r.right), bottom: Math.max(rect.bottom, r.bottom)} : r;
                });
                if (rect) {
                    rect.width = rect.right - rect.left;
                    rect.height = rect.bottom - rect.top;
                }
                return rect;
            }

            /** The work: {kind: 'cells' | 'stroke' | 'idle', rect, count}. */
            function target() {
                if (usesStroke()) {
                    if (stroke && stroke.cells.length) {
                        return {kind: 'stroke', rect: unionRect(stroke.cells), count: stroke.cells.length,
                            unit: stroke.cells.every(function(c) {
                                return B.pointToPage(c).type === 0;
                            }) ? 'cell' : 'spot'};
                    }
                    return {kind: 'idle', rect: boardRect(), count: 0};
                }
                const mode = B.getMode().mode;
                const sel = B.getSelection();
                const multi = mode === 'sudoku' || mode === 'multicolor';
                if (multi ? (pu.selection && pu.selection.length) : sel.cells.length) {
                    return {kind: 'cells', rect: sel.rect, count: sel.cells.length};
                }
                return {kind: 'idle', rect: boardRect(), count: 0};
            }

            /** Put the palette beside rect, never over it: right, left, below, above; then clamp to the window. */
            function place(rect, idle) {
                const w = pal.offsetWidth;
                const h = pal.offsetHeight;
                const vw = window.innerWidth;
                const vh = window.innerHeight;
                const r = {left: rect.left - scrollX, top: rect.top - scrollY, right: rect.right - scrollX,
                    bottom: rect.bottom - scrollY};
                const clampY = function(y) {
                    return Math.max(MARGIN + 60, Math.min(vh - h - MARGIN - 44, y));
                };
                const clampX = function(x) {
                    return Math.max(MARGIN, Math.min(vw - w - MARGIN, x));
                };
                const midY = (r.top + r.bottom) / 2 - h / 2;
                const midX = (r.left + r.right) / 2 - w / 2;
                const tries = idle ? [
                    {x: r.right + GAP, y: clampY(r.top), ok: r.right + GAP + w <= vw - MARGIN}
                ] : [
                    {x: r.right + GAP, y: clampY(midY), ok: r.right + GAP + w <= vw - MARGIN},
                    {x: r.left - GAP - w, y: clampY(midY), ok: r.left - GAP - w >= MARGIN},
                    {x: clampX(midX), y: r.bottom + GAP, ok: r.bottom + GAP + h <= vh - MARGIN},
                    {x: clampX(midX), y: r.top - GAP - h, ok: r.top - GAP - h >= MARGIN}
                ];
                // Prefer a spot just off the board when the work is near its edge, so the palette covers no cells.
                const b = boardRect();
                const bl = b.left - scrollX;
                const br = b.right - scrollX;
                let offBoard = idle ? [] : [
                    {x: br + GAP, y: clampY(midY), ok: br - r.right <= SNAP && br + GAP + w <= vw - MARGIN},
                    {x: bl - GAP - w, y: clampY(midY), ok: r.left - bl <= SNAP && bl - GAP - w >= MARGIN}
                ];
                if (placement === 'rail' && !idle) {
                    // Edge rail: just off the board on the nearer side, at the work's height. Keep the current side
                    // until the work is well past the middle, so the palette does not flip back and forth.
                    const cx = (r.left + r.right) / 2;
                    const frac = (cx - bl) / Math.max(1, br - bl);
                    if (frac > 0.65) {
                        railSide = 'right';
                    } else if (frac < 0.35) {
                        railSide = 'left';
                    }
                    const right = {x: br + GAP, y: clampY(midY), ok: br + GAP + w <= vw - MARGIN};
                    const left = {x: bl - GAP - w, y: clampY(midY), ok: bl - GAP - w >= MARGIN};
                    offBoard = railSide === 'right' ? [right, left] : [left, right];
                }
                const pick = offBoard.concat(tries).find(function(t) {
                    return t.ok;
                }) || {x: clampX(r.right + GAP), y: clampY(midY)};
                // Glide for short moves; jump for long ones (a palette sliding across the board covers it en route).
                const prevX = parseFloat(pal.style.left) || 0;
                const prevY = parseFloat(pal.style.top) || 0;
                pal.classList.toggle('is-jump', Math.hypot(pick.x - prevX, pick.y - prevY) > 240);
                // Stay clear of the puzzle card in the top-left corner.
                const cardR = card.getBoundingClientRect();
                if (pick.x < cardR.right + 6 && pick.y < cardR.bottom + 8) {
                    pick.y = Math.min(vh - h - MARGIN - 44, cardR.bottom + 8);
                }
                pal.style.left = Math.round(pick.x) + 'px';
                pal.style.top = Math.round(pick.y) + 'px';
            }

            function placeStroke(t) {
                if (t.kind === 'stroke' && t.rect) {
                    strokeBox.hidden = false;
                    strokeBox.style.left = (t.rect.left - scrollX - 3) + 'px';
                    strokeBox.style.top = (t.rect.top - scrollY - 3) + 'px';
                    strokeBox.style.width = (t.rect.width + 6) + 'px';
                    strokeBox.style.height = (t.rect.height + 6) + 'px';
                } else {
                    strokeBox.hidden = true;
                }
            }

            // ---- Palette content ----------------------------------------------------------------------------------
            let menuOpen = false;
            // 'beside' = next to the work (the idea under test); 'rail' = off the board's edge at the work's height.
            // Rail is the default: round 1 measured beside-the-selection covering the next cell on 30 of 55 clicks.
            let placement = localStorage.getItem('proto-j-placement2') === 'beside' ? 'beside' : 'rail';
            let railSide = 'right';
            let lastKey = '';

            function row(cls, children) {
                return el('div', {class: 'proto-j-row ' + (cls || '')}, children);
            }

            function digitPad(digits, extra) {
                const pad = el('div', {class: 'proto-j-pad'});
                digits.forEach(function(d) {
                    pad.appendChild(pbtn('proto-j-digit', d, function() {
                        B.sendKey(d);
                    }, 'Type ' + d));
                });
                (extra || []).forEach(function(x) {
                    pad.appendChild(x);
                });
                return pad;
            }

            function eraseBtn(label) {
                return pbtn('proto-j-erase', label || 'Erase', function() {
                    B.sendKey(' ', {code: 'Space'});
                }, 'Clear (Space / Delete)');
            }

            function swatchGrid(mode, onPick) {
                const cur = B.getMode();
                const grid = el('div', {class: 'proto-j-swatches'});
                B.listStyles(mode).forEach(function(s) {
                    const c = s.label.length <= 4 ? swatchColor(s) : null;
                    const b = pbtn(c ? 'proto-j-swatch' : 'proto-j-chip', c ? '' : (s.label || String(s.value)),
                        function() {
                            onPick(s.value);
                        }, s.label);
                    if (c) {
                        b.style.setProperty('--sw', c);
                    }
                    if (String(s.value) === String(cur.style)) {
                        b.classList.add('is-on');
                    }
                    grid.appendChild(b);
                });
                return grid;
            }

            function submodeRow(mode) {
                const cur = B.getMode();
                const subs = B.listSubmodes(mode);
                if (subs.length < 2) {
                    return null;
                }
                return row('proto-j-segs', subs.map(function(s) {
                    const b = pbtn('proto-j-seg', s.label || ('#' + s.value), function() {
                        B.setSubmode(s.value);
                    });
                    if (String(s.value) === cur.submode) {
                        b.classList.add('is-on');
                    }
                    return b;
                }));
            }

            function sudokuTabs(mode, submode) {
                const tabs = SUDOKU_TABS.filter(function(t) {
                    return t.mode !== 'sudoku' || B.listSubmodes('sudoku').some(function(s) {
                        return s.value === t.sub;
                    });
                });
                return row('proto-j-tabs', tabs.map(function(t) {
                    const b = pbtn('proto-j-tab', t.label, function() {
                        if (t.mode === 'multicolor') {
                            B.setMode('multicolor');
                        } else {
                            if (B.getMode().mode !== 'sudoku') {
                                B.setMode('sudoku');
                            }
                            B.setSubmode(t.sub);
                        }
                    }, t.label + ' (' + t.hint + ')');
                    const on = t.mode === 'multicolor' ? mode === 'multicolor' : (mode === 'sudoku' && submode === t.sub);
                    if (on) {
                        b.classList.add('is-on');
                    }
                    return b;
                }));
            }

            function toolOn(k, st) {
                return k.mode === st.mode && (k.sub === undefined || String(k.sub) === String(st.submode));
            }

            function selectTool(k) {
                B.setMode(k.mode);
                if (k.mode === 'combi') {
                    B.setComposite(k.sub);
                } else if (k.sub !== undefined) {
                    B.setSubmode(k.sub);
                }
                if (k.style !== undefined) {
                    B.setStyle(k.style);
                }
                brush = 'primary';
                stroke = null;
                menuOpen = false;
                lastKey = '';
                schedule();
            }

            function buildHead(st, t) {
                palHead.textContent = '';
                const kitRow = el('div', {class: 'proto-j-kit', role: 'group', 'aria-label': 'Tools for this puzzle'});
                kit.forEach(function(k, i) {
                    const b = pbtn('proto-j-tool', k.label, function() {
                        selectTool(k);
                    }, k.tip + '  (Alt+' + (i + 1) + ')');
                    b.appendChild(el('kbd', {}, [String(i + 1)]));
                    if (toolOn(k, st)) {
                        b.classList.add('is-on');
                    }
                    kitRow.appendChild(b);
                });
                if (kit.length > 1) {
                    palHead.appendChild(kitRow);
                }
                const inKit = kit.some(function(k) {
                    return toolOn(k, st);
                });
                const chip = pbtn('proto-j-modechip' + (inKit ? '' : ' is-other'), inKit ? 'All modes ▾' :
                    (st.mode === 'combi' ? comboLabel(st.submode) : modeLabel(st.mode)) + ' ▾', function() {
                    menuOpen = !menuOpen;
                }, 'Every Penpa+ mode and Composite tool');
                const what = el('span', {class: 'proto-j-what'}, [
                    t.kind === 'cells' || t.kind === 'stroke' ? t.count + ' ' + (t.unit || 'cell') + (t.count === 1 ? '' : 's') : ''
                ]);
                const pin = pbtn('proto-j-pin', placement === 'rail' ? '⇥' : '◎', function() {
                    placement = placement === 'rail' ? 'beside' : 'rail';
                    localStorage.setItem('proto-j-placement2', placement);
                    lastKey = '';
                }, placement === 'rail' ? 'Palette at the board edge (click: beside the selection)' :
                    'Palette beside the selection (click: at the board edge)');
                what.title = t.kind === 'stroke' ? 'Cells your last stroke touched (outlined on the board)' : '';
                palHead.appendChild(el('div', {class: 'proto-j-headrow'}, [chip, what, pin]));
            }

            function comboLabel(name) {
                const c = B.listComposite().find(function(x) {
                    return x.name === name;
                });
                return c ? c.label : name;
            }

            function buildMenu(st) {
                palBody.appendChild(el('div', {class: 'proto-j-label'}, ['Mode']));
                const list = el('div', {class: 'proto-j-menu'});
                B.listModes().forEach(function(m) {
                    const b = pbtn('proto-j-menuitem', m.label, function() {
                        B.setMode(m.mode);
                        stroke = null;
                        menuOpen = m.mode === 'combi';
                    });
                    if (m.mode === st.mode) {
                        b.classList.add('is-on');
                    }
                    list.appendChild(b);
                });
                palBody.appendChild(list);
                if (st.mode === 'combi') {
                    palBody.appendChild(el('div', {class: 'proto-j-label'}, ['Composite tool']));
                    const tools = el('div', {class: 'proto-j-menu proto-j-menu-tools'});
                    B.listComposite().forEach(function(c) {
                        const b = pbtn('proto-j-menuitem', c.label || c.name, function() {
                            B.setComposite(c.name);
                            menuOpen = false;
                        });
                        if (c.name === st.submode) {
                            b.classList.add('is-on');
                        }
                        tools.appendChild(b);
                    });
                    palBody.appendChild(tools);
                }
            }

            function buildBody(st, t) {
                palBody.textContent = '';
                if (menuOpen) {
                    buildMenu(st);
                    return;
                }
                const idle = t.kind === 'idle';
                const mode = st.mode;
                const sudokuFamily = mode === 'sudoku' || (mode === 'multicolor' && sudokuSample);
                if (sudokuFamily) {
                    palBody.appendChild(sudokuTabs(mode, st.submode));
                }
                if (idle && SELECT_MODES.indexOf(mode) !== -1) {
                    palBody.appendChild(el('div', {class: 'proto-j-idle'}, [idleText(mode)]));
                    return;
                }
                if (mode === 'sudoku') {
                    palBody.appendChild(digitPad(['1', '2', '3', '4', '5', '6', '7', '8', '9'], [eraseBtn()]));
                } else if (mode === 'multicolor') {
                    palBody.appendChild(swatchGrid('multicolor', function(v) {
                        B.setStyle(v);
                    }));
                    palBody.appendChild(row('', [eraseBtn('Clear colour')]));
                } else if (mode === 'number') {
                    const seg = kit.some(function(k) {
                        return toolOn(k, st);
                    }) ? null : submodeRow('number');
                    if (seg) {
                        palBody.appendChild(seg);
                    }
                    palBody.appendChild(digitPad(kitLetters.length ? kitLetters :
                        ['1', '2', '3', '4', '5', '6', '7', '8', '9', '0'], [eraseBtn()]));
                } else if (mode === 'symbol') {
                    palBody.appendChild(el('div', {class: 'proto-j-note'}, ['Click a cell to place the shape; digits pick its variant.']));
                    palBody.appendChild(digitPad(['1', '2', '3', '4', '5', '6', '7', '8', '9'], [eraseBtn()]));
                } else {
                    buildStrokeBody(st, t);
                }
            }

            function idleText(mode) {
                if (SELECT_MODES.indexOf(mode) !== -1) {
                    return 'Select cells: click, drag, Ctrl+click to add. The palette comes to them.';
                }
                return 'Draw on the board. The palette follows your last stroke.';
            }

            function legend(st) {
                const k = kit.find(function(x) {
                    return toolOn(x, st);
                });
                return k ? el('div', {class: 'proto-j-legend'}, [k.tip]) : null;
            }

            function buildStrokeBody(st, t) {
                const mode = st.mode;
                const lg = legend(st);
                if (lg) {
                    palBody.appendChild(lg);
                }
                if (mode === 'combi') {
                    const names = COMBI_BRUSH[st.submode] || ['Primary', 'Secondary'];
                    palBody.appendChild(el('div', {class: 'proto-j-label'}, ['Brush']));
                    palBody.appendChild(row('proto-j-segs proto-j-brush', ['primary', 'secondary'].map(function(k, i) {
                        const b = pbtn('proto-j-seg', names[i], function() {
                            brush = k;
                        }, i === 0 ? 'Left button' : 'Acts as the right button');
                        if (brush === k) {
                            b.classList.add('is-on');
                        }
                        return b;
                    })));
                } else {
                    const seg = submodeRow(mode);
                    if (seg) {
                        palBody.appendChild(seg);
                    }
                    if (B.listStyles(mode).length) {
                        palBody.appendChild(el('div', {class: 'proto-j-label'}, [mode === 'surface' ? 'Paint' : 'Style']));
                        palBody.appendChild(swatchGrid(mode, function(v) {
                            B.setStyle(v);
                        }));
                    }
                }
                if (t.kind === 'stroke') {
                    palBody.appendChild(row('', [pbtn('proto-j-wide', 'Undo stroke', undoStroke,
                        'Remove everything the last stroke did')]));
                } else if (!lg) {
                    palBody.appendChild(el('div', {class: 'proto-j-idle'}, [idleText(mode)]));
                }
            }

            function buildFoot(st) {
                palFoot.textContent = '';
                palFoot.appendChild(pbtn('proto-j-act', '↶', function() {
                    B.undo();
                }, 'Undo (Ctrl+Z)'));
                palFoot.appendChild(pbtn('proto-j-act', '↷', function() {
                    B.redo();
                }, 'Redo (Ctrl+Y)'));
                palFoot.appendChild(pbtn('proto-j-act proto-j-check', st.hasAnswerCheck ? 'Check' : 'Check', runCheck,
                    st.hasAnswerCheck ? 'Check the answer' : 'This puzzle has no answer check'));
                const undoB = palFoot.children[0];
                const redoB = palFoot.children[1];
                undoB.disabled = !st.canUndo;
                redoB.disabled = !st.canRedo;
            }

            function runCheck() {
                const r = B.check();
                if (!r.hasAnswerCheck) {
                    flash('No answer check in this puzzle', 'warn');
                } else if (r.solved) {
                    flash('Solved!', 'ok');
                } else {
                    flash('Not solved yet', 'bad');
                }
            }

            let toastTimer = null;
            function flash(text, kind) {
                toast.textContent = text;
                toast.className = 'proto-j-toast ' + (kind ? 'is-' + kind : '');
                toast.hidden = false;
                clearTimeout(toastTimer);
                toastTimer = setTimeout(function() {
                    toast.hidden = true;
                    schedule();
                }, 2200);
                schedule();
            }

            const sudokuSample = B.listSubmodes('sudoku').length > 0 && B.listModes().some(function(m) {
                return m.mode === 'sudoku';
            }) && pu.gridtype === 'sudoku';

            const kit = buildKit(B);
            const kitLetters = letters(B);

            // ---- Render -------------------------------------------------------------------------------------------
            let queued = false;
            function schedule() {
                if (queued) {
                    return;
                }
                queued = true;
                requestAnimationFrame(function() {
                    queued = false;
                    render();
                });
            }

            function afterAction() {
                schedule();
            }

            function render() {
                const st = B.getState();
                const t = target();
                const focusedIdx = pal.contains(document.activeElement) ?
                    Array.from(pal.querySelectorAll('button')).indexOf(document.activeElement) : -1;
                // Rebuild only when something the palette shows changed (keeps keyboard focus stable).
                const key = [st.mode, st.submode, st.style, t.kind, t.count, menuOpen, brush, st.canUndo, st.canRedo,
                    stroke ? stroke.to : ''].join('|');
                if (key !== lastKey) {
                    lastKey = key;
                    buildHead(st, t);
                    buildBody(st, t);
                    buildFoot(st);
                    if (focusedIdx >= 0) {
                        const bs = pal.querySelectorAll('button');
                        (bs[Math.min(focusedIdx, bs.length - 1)] || bs[0]).focus();
                    }
                }
                pal.classList.toggle('is-idle', t.kind === 'idle' && !menuOpen);
                pal.classList.toggle('is-stroke', t.kind === 'stroke');
                if (t.rect) {
                    place(t.rect, t.kind === 'idle');
                }
                placeStroke(t);
                hint.textContent = (SELECT_MODES.indexOf(st.mode) !== -1 ?
                    'Select cells and the palette comes to them' : 'Draw; the palette follows your last stroke') +
                    '  ·  Alt+1-' + kit.length + ' tools  ·  Alt+Q swaps brush  ·  ` focuses the palette';
            }

            B.onChange(function(state, reason) {
                if (reason === 'mode_set') {
                    stroke = null;
                    brush = 'primary';
                }
                schedule();
            });
            B.onTimer(function(tm) {
                timerText.textContent = tm.text;
            });

            // ---- Keyboard: ` focuses the palette; inside it, arrows/Tab move, Enter/Space press, Esc leaves ------
            function buttons() {
                return Array.from(pal.querySelectorAll('button')).filter(function(b) {
                    return !b.disabled && b.offsetParent !== null;
                });
            }

            function moveFocus(dir) {
                const bs = buttons();
                const cur = document.activeElement;
                const i = bs.indexOf(cur);
                if (i === -1) {
                    (bs[0] || pal).focus();
                    return;
                }
                if (dir === 'next' || dir === 'prev') {
                    bs[(i + (dir === 'next' ? 1 : bs.length - 1)) % bs.length].focus();
                    return;
                }
                // Spatial: nearest button in the arrow's direction.
                const a = cur.getBoundingClientRect();
                const ax = a.left + a.width / 2;
                const ay = a.top + a.height / 2;
                let best = null;
                let bestD = Infinity;
                bs.forEach(function(b) {
                    if (b === cur) {
                        return;
                    }
                    const r = b.getBoundingClientRect();
                    const dx = r.left + r.width / 2 - ax;
                    const dy = r.top + r.height / 2 - ay;
                    const ok = dir === 'left' ? dx < -2 && Math.abs(dy) < r.height :
                        dir === 'right' ? dx > 2 && Math.abs(dy) < r.height :
                            dir === 'up' ? dy < -2 : dy > 2;
                    if (!ok) {
                        return;
                    }
                    const d = (dir === 'up' || dir === 'down') ? Math.abs(dy) * 1000 + Math.abs(dx) : Math.abs(dx);
                    if (d < bestD) {
                        bestD = d;
                        best = b;
                    }
                });
                if (best) {
                    best.focus();
                }
            }

            window.addEventListener('keydown', function(e) {
                const inPal = pal.contains(document.activeElement);
                // Alt+1..5 picks a kit tool; Alt+Q swaps the brush (main mark / helper mark).
                if (e.altKey && !e.ctrlKey && /^Digit[1-5]$/.test(e.code) && kit[+e.code.slice(5) - 1]) {
                    e.preventDefault();
                    e.stopImmediatePropagation();
                    selectTool(kit[+e.code.slice(5) - 1]);
                    return;
                }
                if (e.altKey && !e.ctrlKey && e.code === 'KeyQ' && B.getMode().mode === 'combi') {
                    e.preventDefault();
                    e.stopImmediatePropagation();
                    brush = brush === 'primary' ? 'secondary' : 'primary';
                    schedule();
                    return;
                }
                if (e.key === '`' && !e.ctrlKey && !e.altKey) {
                    e.preventDefault();
                    e.stopImmediatePropagation();
                    if (inPal) {
                        document.activeElement.blur();
                    } else {
                        const on = pal.querySelector('.proto-j-body .is-on') || buttons()[0];
                        if (on) {
                            on.focus();
                        }
                    }
                    pal.classList.toggle('is-kbd', !inPal);
                    return;
                }
                if (!inPal) {
                    return;
                }
                const map = {ArrowLeft: 'left', ArrowRight: 'right', ArrowUp: 'up', ArrowDown: 'down'};
                if (map[e.key] || e.key === 'Tab') {
                    e.preventDefault();
                    e.stopImmediatePropagation();
                    moveFocus(e.key === 'Tab' ? (e.shiftKey ? 'prev' : 'next') : map[e.key]);
                } else if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault();
                    e.stopImmediatePropagation();
                    document.activeElement.click();
                } else if (e.key === 'Escape') {
                    e.preventDefault();
                    e.stopImmediatePropagation();
                    if (menuOpen) {
                        menuOpen = false;
                        schedule();
                    } else {
                        document.activeElement.blur();
                        pal.classList.remove('is-kbd');
                    }
                }
            }, true);
            pal.addEventListener('focusout', function() {
                setTimeout(function() {
                    if (!pal.contains(document.activeElement)) {
                        pal.classList.remove('is-kbd');
                    }
                }, 0);
            });

            // Close the mode menu when the board is clicked.
            canvas.addEventListener('mousedown', function() {
                if (menuOpen) {
                    menuOpen = false;
                    schedule();
                }
            });

            // Start on the kit's first tool (the genre's own mark), whatever mode the link starts in.
            if (!toolOn(kit[0], B.getState())) {
                selectTool(kit[0]);
            }

            window.PrototypeJ = {
                state: function() {
                    return {stroke: stroke, brush: brush, menuOpen: menuOpen, target: target(), kit: kit};
                }
            };
            schedule();
        }
    };
})();
