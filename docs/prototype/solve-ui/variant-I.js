/*
 * PROTOTYPE (throwaway, branch prototype/solve-ui): solve-UI variant I, "Desk".
 * Owned by variant I's builder: this file and variant-I.css only. See README.md for the contract.
 *
 * The idea: no fixed layout. The board lies on an infinite desk that pans (Space-drag, middle-drag, left-drag on bare
 * desk, or the plain wheel) and zooms (Ctrl+wheel, the bar's - / + / Fit). Around it sit movable cards: the rules card,
 * a notes card the solver types into (kept in memory only), any number of loupe cards that each pin a magnified live
 * view of one region of the board (and take clicks and drags, forwarded to the board), and a small Tools card with
 * modes, sub-modes, styles and a pad. Every card can be dragged by its header, collapsed, closed (the bar's Cards
 * menu brings it back) and pinned: a pinned card floats over the screen and ignores pan and zoom; an unpinned card lies
 * on the desk and moves with the board. "Arrange" re-runs the automatic first layout for the puzzle's size.
 *
 * The claim it tests: one fixed layout cannot serve a 6x6 and a 20x20 with a page of rules; letting the solver place
 * the pieces (with a sensible automatic first layout) serves both.
 *
 * Zoom: the canvas must not be scaled with CSS, so zoom is the board's cell size (bridge.setCellSize, 12-90 px) and the
 * desk's card positions scale with it about the cursor; cards themselves keep their size. Loupes are separate canvases
 * redrawn from #canvas (drawn by Penpa+ at 2.5x, class_p.js:98, so a loupe up to 2.5x stays sharp) on every onChange.
 *
 * Bridge gaps worked around here (reading `pu` / the legacy DOM directly):
 *   - Shapes: no listShapes(); read from the legacy menu (#mode_symbolul1, ms1_* / ms_* spans), as variant A does.
 *   - Style swatch colours: read from the legacy label's computed background (`<id>_lb`).
 *   - Board px per cell: canvas width / pu.size, to fit the board and to map loupe regions in cell units.
 *   - Loupe input: a live drag is forwarded as raw MouseEvents on #canvas, since bridge.pointer() takes a finished path.
 *   - Penpa+'s keydown handler on document only skips <input type=text|number> (main.js:279-298), so the notes
 *     <textarea> stops its own key events from reaching it.
 *   - Space is Penpa+'s "clear cell" key; here a Space press with no drag is forwarded to the board after release.
 */
(function() {
    'use strict';

    const BASE_CELL = 40;        // zoom 100% = 40 px cells
    const MIN_CELL = 12;
    const MAX_CELL = 90;
    const BAR_H = 44;
    const GAP = 18;
    const BOTTOM = 64;           // room for the prototype switcher pill at the bottom

    const HINTS = {
        sudoku: 'Click or drag cells, then type. Shift: Corner, Ctrl: Centre.',
        number: 'Click a cell, then type.',
        surface: 'Click or drag to paint; right-click paints the second colour.',
        multicolor: 'Select cells, then pick a colour.',
        line: 'Drag through cell centres to draw; right-click marks x.',
        lineE: 'Drag along edges to draw.',
        wall: 'Drag to draw walls.',
        symbol: 'Click a cell to place the shape.',
        special: 'Drag across cells.',
        cage: 'Drag across cells to draw a cage.',
        combi: 'Left and right click place the tool\'s marks.',
        move: 'Drag an item to move it.'
    };
    const SUBMODE_FALLBACK = {number: {'3': '1/4', '9': 'Side'}};

    window.PrototypeVariants = window.PrototypeVariants || {};
    window.PrototypeVariants.I = {
        name: 'Desk',

        /** @param {object} ctx see README.md, "The variant contract" */
        mount(ctx) {
            const B = ctx.bridge;
            const el = ctx.helpers.el;
            const canvas = ctx.canvas;

            // ---- Desk state -----------------------------------------------------------------------------------
            const view = {panX: 0, panY: 0, cell: pu.size || 38};
            function zoom() {
                return view.cell / BASE_CELL;
            }
            /** Canvas px per cell unit (the canvas is width_c * size wide, class_p.js:1051). */
            function canvasCells() {
                return {w: canvas.width / pu.resol / pu.size, h: canvas.height / pu.resol / pu.size};
            }

            /** A button that never takes focus, so the board keeps the keyboard. */
            function btn(cls, label, onClick, title) {
                const b = el('button', {class: 'proto-i-btn ' + (cls || ''), type: 'button', tabindex: '-1'}, [label]);
                if (title) {
                    b.title = title;
                }
                b.addEventListener('mousedown', function(e) {
                    e.preventDefault();
                    e.stopPropagation();
                });
                b.addEventListener('click', function(e) {
                    e.preventDefault();
                    onClick(e, b);
                });
                return b;
            }

            // ---- Skeleton -------------------------------------------------------------------------------------
            const world = el('div', {class: 'proto-i-world'});
            const desk = el('div', {class: 'proto-i-desk'}, [world]);
            const hud = el('div', {class: 'proto-i-hud'});
            const bar = el('div', {class: 'proto-i-bar'});
            const root = el('div', {class: 'proto-i-root'}, [desk, hud, bar]);
            document.body.appendChild(root);

            // ---- Items (board and cards) ----------------------------------------------------------------------
            const items = [];
            let topZ = 10;

            /**
             * A desk item. wx/wy are desk units (px at 100% zoom); sx/sy are screen px when pinned.
             * opts: {kind, title, body, pinned, closable, onClose, cls, width}
             */
            function makeCard(opts) {
                const titleEl = el('span', {class: 'proto-i-cardtitle'}, [opts.title]);
                const tools = el('span', {class: 'proto-i-cardtools'});
                const head = el('div', {class: 'proto-i-cardhead'}, [titleEl, tools]);
                const body = el('div', {class: 'proto-i-cardbody'}, opts.body ? [opts.body] : []);
                const card = el('div', {class: 'proto-i-card proto-i-card-' + opts.kind + ' ' + (opts.cls || '')}, [head, body]);
                if (opts.width) {
                    card.style.width = opts.width + 'px';
                }
                const item = {kind: opts.kind, el: card, head: head, body: body, titleEl: titleEl, tools: tools,
                    wx: 0, wy: 0, sx: 0, sy: 0, pinned: !!opts.pinned, closed: false, onClose: opts.onClose};
                if (opts.extraTools) {
                    opts.extraTools.forEach(function(t) {
                        tools.appendChild(t);
                    });
                }
                if (opts.pinnable !== false) {
                    item.pinBtn = btn('proto-i-cardbtn', '', function() {
                        setPinned(item, !item.pinned);
                    });
                    tools.appendChild(item.pinBtn);
                }
                if (opts.collapsible !== false) {
                    item.colBtn = btn('proto-i-cardbtn', '−', function() {
                        card.classList.toggle('is-collapsed');
                        item.colBtn.textContent = card.classList.contains('is-collapsed') ? '+' : '−';
                    }, 'Collapse / expand');
                    tools.appendChild(item.colBtn);
                }
                if (opts.closable !== false) {
                    tools.appendChild(btn('proto-i-cardbtn', '×', function() {
                        closeItem(item);
                    }, 'Close'));
                }
                head.addEventListener('dblclick', function(e) {
                    if (item.colBtn && !e.target.closest('button')) {
                        item.colBtn.click();
                    }
                });
                card.addEventListener('mousedown', function() {
                    raise(item);
                }, true);
                head.addEventListener('mousedown', function(e) {
                    if (e.button !== 0 || e.target.closest('button') || spaceHeld) {
                        return;
                    }
                    e.preventDefault();
                    e.stopPropagation();
                    startDrag(item, e);
                });
                items.push(item);
                updatePinLabel(item);
                return item;
            }

            function updatePinLabel(item) {
                if (item.pinBtn) {
                    item.pinBtn.textContent = item.pinned ? 'unpin' : 'pin';
                    item.pinBtn.title = item.pinned
                        ? 'Pinned to the screen: ignores pan and zoom. Click to lay it on the desk.'
                        : 'On the desk: moves with pan and zoom. Click to pin it to the screen.';
                }
            }

            function raise(item) {
                topZ++;
                if (topZ > 900) {
                    items.slice().sort(function(a, b) {
                        return (+a.el.style.zIndex || 0) - (+b.el.style.zIndex || 0);
                    }).forEach(function(it, i) {
                        it.el.style.zIndex = 10 + i;
                    });
                    topZ = 10 + items.length;
                }
                item.el.style.zIndex = topZ;
            }

            function place(item) {
                const z = zoom();
                if (item.pinned) {
                    if (item.el.parentNode !== hud) {
                        hud.appendChild(item.el);
                    }
                    item.el.style.left = item.sx + 'px';
                    item.el.style.top = item.sy + 'px';
                } else {
                    if (item.el.parentNode !== world) {
                        world.appendChild(item.el);
                    }
                    item.el.style.left = Math.round(item.wx * z) + 'px';
                    item.el.style.top = Math.round(item.wy * z) + 'px';
                }
                item.el.classList.toggle('is-pinned', item.pinned);
                item.el.hidden = item.closed;
            }

            function placeAll() {
                world.style.transform = 'translate(' + Math.round(view.panX) + 'px,' + Math.round(view.panY) + 'px)';
                const z = zoom();
                const grid = 24 * z;
                desk.style.backgroundSize = grid + 'px ' + grid + 'px';
                desk.style.backgroundPosition = view.panX + 'px ' + view.panY + 'px';
                items.forEach(place);
                placeRegionMarks();
                zoomLabel.textContent = Math.round(z * 100) + '%';
            }

            function screenToWorld(sx, sy) {
                return {x: (sx - view.panX) / zoom(), y: (sy - view.panY) / zoom()};
            }

            function setPinned(item, pinned) {
                const r = item.el.getBoundingClientRect();
                item.pinned = pinned;
                if (pinned) {
                    item.sx = r.left;
                    item.sy = r.top;
                } else {
                    const w = screenToWorld(r.left, r.top);
                    item.wx = w.x;
                    item.wy = w.y;
                }
                updatePinLabel(item);
                place(item);
                raise(item);
            }

            function closeItem(item) {
                item.closed = true;
                place(item);
                if (item.onClose) {
                    item.onClose(item);
                }
                renderCardsMenu();
            }

            function openItem(item) {
                item.closed = false;
                place(item);
                raise(item);
                // Bring a desk card back into view if it is off-screen.
                const r = item.el.getBoundingClientRect();
                if (!item.pinned && (r.right < 40 || r.left > innerWidth - 40 || r.bottom < BAR_H + 20 || r.top > innerHeight - 40)) {
                    view.panX += innerWidth / 2 - (r.left + r.width / 2);
                    view.panY += innerHeight / 2 - (r.top + r.height / 2);
                    placeAll();
                }
                renderCardsMenu();
            }

            // ---- Dragging cards -------------------------------------------------------------------------------
            let drag = null;
            function startDrag(item, e) {
                drag = {item: item, x: e.clientX, y: e.clientY, wx: item.wx, wy: item.wy, sx: item.sx, sy: item.sy};
                document.documentElement.classList.add('proto-i-dragging');
            }
            function moveDrag(e) {
                const dx = e.clientX - drag.x;
                const dy = e.clientY - drag.y;
                const it = drag.item;
                if (it.pinned) {
                    it.sx = Math.max(-it.el.offsetWidth + 60, Math.min(innerWidth - 60, drag.sx + dx));
                    it.sy = Math.max(BAR_H, Math.min(innerHeight - 30, drag.sy + dy));
                } else {
                    it.wx = drag.wx + dx / zoom();
                    it.wy = drag.wy + dy / zoom();
                }
                place(it);
                if (it.kind === 'board') {
                    placeRegionMarks();
                }
            }

            // ---- Board item -----------------------------------------------------------------------------------
            const boardSlot = el('div', {class: 'proto-i-boardslot'});
            const marks = el('div', {class: 'proto-i-marks'});
            boardSlot.appendChild(marks);
            const boardItem = makeCard({kind: 'board', title: 'Board', body: boardSlot, closable: false,
                collapsible: false, pinnable: false});
            ctx.helpers.adoptBoard(boardSlot);
            boardSlot.appendChild(marks); // keep the region marks above the canvas
            ctx.helpers.hideLegacy();

            // ---- Tools card -----------------------------------------------------------------------------------
            const toolsBody = el('div', {class: 'proto-i-tools'});
            const toolsItem = makeCard({kind: 'tools', title: 'Tools', body: toolsBody, pinned: true, width: 236,
                onClose: function() {}});

            // ---- Rules card -----------------------------------------------------------------------------------
            const info = B.getInfo();
            const st0 = B.getState();
            const rulesBody = el('div', {class: 'proto-i-rules'});
            rulesBody.appendChild(el('div', {class: 'proto-i-ptitle'}, [info.title || 'Untitled puzzle']));
            if (info.author) {
                rulesBody.appendChild(el('div', {class: 'proto-i-byline'}, ['by ' + info.author]));
            }
            const chips = el('div', {class: 'proto-i-chips'}, [
                el('span', {class: 'proto-i-chip' + (st0.hasAnswerCheck ? ' is-on' : '')},
                    [st0.hasAnswerCheck ? 'Answer check on' : 'No answer check'])
            ]);
            B.genreTags().forEach(function(t) {
                chips.appendChild(el('span', {class: 'proto-i-chip'}, [t]));
            });
            rulesBody.appendChild(chips);
            const rulesText = el('div', {class: 'proto-i-rulestext'});
            rulesText.innerHTML = info.rules || '<em>No rules given.</em>';
            rulesBody.appendChild(rulesText);
            const rulesItem = makeCard({kind: 'rules', title: 'Rules', body: rulesBody, width: 320});

            // ---- Notes card -----------------------------------------------------------------------------------
            const notesArea = el('textarea', {class: 'proto-i-notes', spellcheck: 'false',
                placeholder: 'Your notes. Kept in memory only: a reload loses them.'});
            ['keydown', 'keyup', 'keypress'].forEach(function(t) {
                notesArea.addEventListener(t, function(e) {
                    e.stopPropagation();
                    if (t === 'keydown' && e.key === 'Escape') {
                        notesArea.blur();
                    }
                });
            });
            const notesItem = makeCard({kind: 'notes', title: 'Notes', body: notesArea, width: 320});
            // Clicking anywhere else gives the keyboard back to the board.
            document.addEventListener('mousedown', function(e) {
                if (document.activeElement === notesArea && e.target !== notesArea) {
                    notesArea.blur();
                }
            }, true);

            // ---- Loupes ---------------------------------------------------------------------------------------
            const loupes = [];
            let loupeSeq = 0;

            /** region: {x, y, w, h} in cell units of the canvas (canvas px / pu.size). */
            function makeLoupe(region, wx, wy) {
                const n = ++loupeSeq;
                const out = el('canvas', {class: 'proto-i-loupecanvas'});
                const loupe = {n: n, region: region, mag: 0, out: out};
                const magLabel = el('span', {class: 'proto-i-maglabel'});
                const minus = btn('proto-i-cardbtn', '−', function() {
                    setLoupeSize(loupe, loupe.mag / 1.25);
                }, 'Smaller');
                const plus = btn('proto-i-cardbtn', '+', function() {
                    setLoupeSize(loupe, loupe.mag * 1.25);
                }, 'Larger');
                const item = makeCard({kind: 'loupe', title: 'Loupe ' + n, body: out,
                    extraTools: [minus, magLabel, plus],
                    onClose: function() {
                        loupes.splice(loupes.indexOf(loupe), 1);
                        items.splice(items.indexOf(item), 1);
                        item.el.remove();
                        loupe.mark.remove();
                    }});
                loupe.item = item;
                loupe.magLabel = magLabel;
                loupe.mark = el('div', {class: 'proto-i-mark'}, [el('span', {}, [String(n)])]);
                marks.appendChild(loupe.mark);
                item.wx = wx;
                item.wy = wy;
                loupes.push(loupe);
                // Start at about 2.5 times the board's 100% size, capped to a comfortable card.
                const fit = Math.min(380 / (region.w * BASE_CELL), 300 / (region.h * BASE_CELL));
                setLoupeSize(loupe, Math.max(Math.min(2.5, fit), 160 / (region.w * BASE_CELL)));
                wireLoupeInput(loupe);
                place(item);
                raise(item);
                // Keep the new card on screen.
                const r = item.el.getBoundingClientRect();
                const dx = Math.min(0, innerWidth - GAP - r.right) + Math.max(0, GAP - r.left);
                const dy = Math.min(0, innerHeight - 70 - r.bottom) + Math.max(0, BAR_H + GAP - r.top);
                item.wx += dx / zoom();
                item.wy += dy / zoom();
                place(item);
                placeRegionMarks();
                renderCardsMenu();
                return loupe;
            }

            /** mag: loupe px per board px at 100% zoom. The loupe's size does not follow the desk zoom. */
            function setLoupeSize(loupe, mag) {
                const r = loupe.region;
                mag = Math.max(0.5, Math.min(6, mag));
                loupe.mag = mag;
                const w = Math.round(r.w * BASE_CELL * mag);
                const h = Math.round(r.h * BASE_CELL * mag);
                loupe.out.style.width = w + 'px';
                loupe.out.style.height = h + 'px';
                const dpr = window.devicePixelRatio || 1;
                loupe.out.width = Math.round(w * dpr);
                loupe.out.height = Math.round(h * dpr);
                loupe.magLabel.textContent = Math.round(mag * BASE_CELL / view.cell * 100) / 100 + '×';
                drawLoupe(loupe);
            }

            function drawLoupe(loupe) {
                const c = loupe.out.getContext('2d');
                const r = loupe.region;
                const k = pu.size * pu.resol; // backing px per cell unit
                c.fillStyle = '#fff';
                c.fillRect(0, 0, loupe.out.width, loupe.out.height);
                c.imageSmoothingQuality = 'high';
                try {
                    c.drawImage(canvas, r.x * k, r.y * k, r.w * k, r.h * k, 0, 0, loupe.out.width, loupe.out.height);
                } catch (err) {
                    // A zero-sized source while the board is resizing; the next onChange redraws.
                }
            }

            function placeRegionMarks() {
                loupes.forEach(function(l) {
                    const r = l.region;
                    const s = pu.size;
                    const cr = canvas.getBoundingClientRect();
                    const sr = boardSlot.getBoundingClientRect();
                    Object.assign(l.mark.style, {left: cr.left - sr.left + r.x * s + 'px', top: cr.top - sr.top + r.y * s + 'px',
                        width: r.w * s + 'px', height: r.h * s + 'px'});
                    l.magLabel.textContent = (Math.round(l.mag * BASE_CELL / view.cell * 10) / 10) + '×';
                });
            }

            /** Forward mouse input on a loupe to the board, as a real mouse on #canvas at the mapped point. */
            function wireLoupeInput(loupe) {
                const out = loupe.out;
                function toPage(e) {
                    const lr = out.getBoundingClientRect();
                    const cr = canvas.getBoundingClientRect();
                    const r = loupe.region;
                    const fx = (e.clientX - lr.left) / lr.width;
                    const fy = (e.clientY - lr.top) / lr.height;
                    return {x: cr.left + (r.x + fx * r.w) * pu.size, y: cr.top + (r.y + fy * r.h) * pu.size};
                }
                function fire(type, e, buttons) {
                    const p = toPage(e);
                    canvas.dispatchEvent(new MouseEvent(type, {bubbles: true, cancelable: true, view: window,
                        clientX: p.x, clientY: p.y, button: e.button, buttons: buttons,
                        ctrlKey: e.ctrlKey, shiftKey: e.shiftKey, altKey: e.altKey, metaKey: e.metaKey}));
                }
                out.addEventListener('contextmenu', function(e) {
                    e.preventDefault();
                });
                out.addEventListener('mousedown', function(e) {
                    if (e.button === 1 || spaceHeld) {
                        return; // pan
                    }
                    e.preventDefault();
                    e.stopPropagation();
                    const held = e.button === 2 ? 2 : 1;
                    fire('mousedown', e, held);
                    // The forwarded events bubble back through window; skip them (they target #canvas).
                    function move(ev) {
                        if (ev.target !== canvas) {
                            fire('mousemove', ev, held);
                        }
                    }
                    function up(ev) {
                        if (ev.target === canvas) {
                            return;
                        }
                        fire('mouseup', ev, 0);
                        window.removeEventListener('mousemove', move, true);
                        window.removeEventListener('mouseup', up, true);
                    }
                    window.addEventListener('mousemove', move, true);
                    window.addEventListener('mouseup', up, true);
                });
                out.addEventListener('dblclick', function(e) {
                    fire('dblclick', e, 0);
                });
            }

            // Picking a loupe region: a full-screen overlay; drag a rectangle over the board (a click takes 3x3).
            const picker = el('div', {class: 'proto-i-picker', hidden: ''}, [
                el('div', {class: 'proto-i-pickerhint'}, ['Drag a rectangle on the board for the loupe (Esc cancels)'])
            ]);
            const pickRect = el('div', {class: 'proto-i-pickrect'});
            picker.appendChild(pickRect);
            root.appendChild(picker);
            let pick = null;
            function startPicking() {
                picker.hidden = false;
            }
            function stopPicking() {
                picker.hidden = true;
                pickRect.style.display = 'none';
                pick = null;
            }
            picker.addEventListener('mousedown', function(e) {
                e.preventDefault();
                e.stopPropagation();
                if (e.button !== 0) {
                    stopPicking();
                    return;
                }
                pick = {x: e.clientX, y: e.clientY};
                pickRect.style.display = 'block';
                updatePickRect(e);
            });
            picker.addEventListener('mousemove', function(e) {
                if (pick) {
                    updatePickRect(e);
                }
            });
            picker.addEventListener('mouseup', function(e) {
                if (!pick) {
                    return;
                }
                const cr = canvas.getBoundingClientRect();
                const s = pu.size;
                const cc = canvasCells();
                let x0 = (Math.min(pick.x, e.clientX) - cr.left) / s;
                let y0 = (Math.min(pick.y, e.clientY) - cr.top) / s;
                let x1 = (Math.max(pick.x, e.clientX) - cr.left) / s;
                let y1 = (Math.max(pick.y, e.clientY) - cr.top) / s;
                if (x1 - x0 < 0.5 && y1 - y0 < 0.5) {
                    x0 -= 1.5;
                    x1 += 1.5;
                    y0 -= 1.5;
                    y1 += 1.5;
                }
                x0 = Math.max(0, x0);
                y0 = Math.max(0, y0);
                x1 = Math.min(cc.w, x1);
                y1 = Math.min(cc.h, y1);
                stopPicking();
                if (x1 - x0 < 0.3 || y1 - y0 < 0.3) {
                    return; // off the board
                }
                // Lay the loupe on the desk just right of the board, stacked by number.
                const br = boardItem.el.getBoundingClientRect();
                const w = screenToWorld(br.right + GAP, Math.max(BAR_H + GAP, cr.top + y0 * s));
                makeLoupe({x: x0, y: y0, w: x1 - x0, h: y1 - y0}, w.x, w.y);
            });
            function updatePickRect(e) {
                Object.assign(pickRect.style, {left: Math.min(pick.x, e.clientX) + 'px', top: Math.min(pick.y, e.clientY) + 'px',
                    width: Math.abs(e.clientX - pick.x) + 'px', height: Math.abs(e.clientY - pick.y) + 'px'});
            }

            // ---- Top bar --------------------------------------------------------------------------------------
            const timerText = el('span', {class: 'proto-i-timer'}, ['00:00']);
            const pauseBtn = btn('', 'Pause', function() {
                if (B.getTimer().paused) {
                    B.startTimer();
                } else {
                    B.pauseTimer();
                }
            }, 'Pause or resume (pausing covers the board)');
            const undoBtn = btn('', 'Undo', function() {
                B.undo();
            }, 'Undo (Ctrl+Z)');
            const redoBtn = btn('', 'Redo', function() {
                B.redo();
            }, 'Redo (Ctrl+Y)');
            const histText = el('span', {class: 'proto-i-hist'});
            const checkBtn = btn('proto-i-btn-check', 'Check', runCheck, 'Check the answer');
            const status = el('span', {class: 'proto-i-status'});
            const zoomLabel = el('span', {class: 'proto-i-zoom'}, ['100%']);
            const cardsMenu = el('div', {class: 'proto-i-menu', hidden: ''});
            const cardsBtn = btn('', 'Cards ▾', function() {
                renderCardsMenu();
                cardsMenu.hidden = !cardsMenu.hidden;
            }, 'Show, hide and add cards');
            const clearMenu = el('div', {class: 'proto-i-menu', hidden: ''}, [
                btn('proto-i-menuitem', 'Clear this mode\'s entries', function() {
                    clearMenu.hidden = true;
                    B.clear('mode');
                }),
                btn('proto-i-menuitem proto-i-danger', 'Clear everything', function() {
                    clearMenu.hidden = true;
                    B.clear('all');
                })
            ]);
            const clearBtn = btn('', 'Clear ▾', function() {
                clearMenu.hidden = !clearMenu.hidden;
            });
            bar.append(
                el('span', {class: 'proto-i-brand'}, [info.title || 'Untitled puzzle']),
                el('span', {class: 'proto-i-group'}, [timerText, pauseBtn]),
                el('span', {class: 'proto-i-group'}, [undoBtn, redoBtn, histText]),
                el('span', {class: 'proto-i-group'}, [el('span', {class: 'proto-i-wrap'}, [clearBtn, clearMenu]), checkBtn, status]),
                el('span', {class: 'proto-i-spacer'}),
                el('span', {class: 'proto-i-group'}, [
                    btn('', '−', function() {
                        zoomAt(view.cell / 1.15, innerWidth / 2, innerHeight / 2);
                    }, 'Zoom out (Ctrl+wheel)'),
                    zoomLabel,
                    btn('', '+', function() {
                        zoomAt(view.cell * 1.15, innerWidth / 2, innerHeight / 2);
                    }, 'Zoom in (Ctrl+wheel)'),
                    btn('', 'Fit', fitBoard, 'Fit the board to the free screen space'),
                    btn('', 'Arrange', arrange, 'Re-run the automatic layout for this puzzle')
                ]),
                el('span', {class: 'proto-i-group'}, [
                    btn('proto-i-btn-accent', '+ Loupe', startPicking, 'Pin a magnified live view of a board region'),
                    el('span', {class: 'proto-i-wrap'}, [cardsBtn, cardsMenu]),
                    btn('', '⚙', function() {
                        B.openSettings();
                    }, 'Settings')
                ])
            );
            document.addEventListener('mousedown', function(e) {
                [cardsMenu, clearMenu].forEach(function(m) {
                    if (!m.hidden && !m.parentNode.contains(e.target)) {
                        m.hidden = true;
                    }
                });
            }, true);

            function renderCardsMenu() {
                cardsMenu.textContent = '';
                [[toolsItem, 'Tools'], [rulesItem, 'Rules'], [notesItem, 'Notes']].forEach(function(pair) {
                    const it = pair[0];
                    cardsMenu.appendChild(btn('proto-i-menuitem' + (it.closed ? '' : ' is-on'),
                        (it.closed ? '☐ ' : '☑ ') + pair[1], function() {
                            if (it.closed) {
                                openItem(it);
                            } else {
                                closeItem(it);
                            }
                        }));
                });
                loupes.forEach(function(l) {
                    cardsMenu.appendChild(btn('proto-i-menuitem is-on', '☑ Loupe ' + l.n + ' (close)', function() {
                        closeItem(l.item);
                    }));
                });
                cardsMenu.appendChild(btn('proto-i-menuitem', '+ New loupe…', function() {
                    cardsMenu.hidden = true;
                    startPicking();
                }));
            }

            // ---- Zoom, fit and arrange ------------------------------------------------------------------------
            function setCell(px) {
                px = Math.round(Math.max(MIN_CELL, Math.min(MAX_CELL, px)));
                if (px !== pu.size) {
                    B.setCellSize(px);
                }
                view.cell = px;
            }

            /** Zoom the desk about a screen point: that point stays put; cards keep their size. */
            function zoomAt(px, sx, sy) {
                const w = screenToWorld(sx, sy);
                setCell(px);
                view.panX = sx - w.x * zoom();
                view.panY = sy - w.y * zoom();
                placeAll();
                loupes.forEach(drawLoupe);
            }

            /** The screen area not covered by pinned cards (the Tools card on the left, usually). */
            function freeArea() {
                let left = GAP;
                items.forEach(function(it) {
                    if (it.pinned && !it.closed && it.sx < innerWidth / 3) {
                        left = Math.max(left, it.sx + it.el.offsetWidth + GAP);
                    }
                });
                return {left: left, top: BAR_H + GAP, right: innerWidth - GAP, bottom: innerHeight - BOTTOM};
            }

            /** Largest cell size at which the board (plus its card frame) fits w x h px. */
            function cellToFit(w, h) {
                const cc = canvasCells();
                const frameW = boardItem.el.offsetWidth - canvas.getBoundingClientRect().width;
                const frameH = boardItem.el.offsetHeight - canvas.getBoundingClientRect().height;
                return Math.floor(Math.min((w - frameW) / cc.w, (h - frameH) / cc.h));
            }

            /** Fit the board into the free area and centre it there, keeping the cards where they are on screen. */
            function fitBoard() {
                const a = freeArea();
                const before = items.filter(function(it) {
                    return !it.pinned && it !== boardItem;
                }).map(function(it) {
                    const r = it.el.getBoundingClientRect();
                    return {it: it, x: r.left, y: r.top};
                });
                setCell(cellToFit(a.right - a.left, a.bottom - a.top));
                const bw = boardItem.el.offsetWidth;
                const bh = boardItem.el.offsetHeight;
                view.panX = 0;
                view.panY = 0;
                const w = screenToWorld(a.left + (a.right - a.left - bw) / 2, a.top + (a.bottom - a.top - bh) / 2);
                boardItem.wx = w.x;
                boardItem.wy = w.y;
                before.forEach(function(b) {
                    const p = screenToWorld(b.x, b.y);
                    b.it.wx = p.x;
                    b.it.wy = p.y;
                });
                placeAll();
                loupes.forEach(drawLoupe);
            }

            /**
             * The automatic first layout. Tools pinned top-left; the board as large as fits beside it; rules and notes
             * stacked to the board's right when there is room for a 320 px column, otherwise below the board on the desk.
             */
            function arrange() {
                [toolsItem, rulesItem, notesItem].forEach(function(it) {
                    it.closed = false;
                    it.el.classList.remove('is-collapsed');
                    if (it.colBtn) {
                        it.colBtn.textContent = '−';
                    }
                });
                toolsItem.pinned = true;
                toolsItem.sx = GAP;
                toolsItem.sy = BAR_H + GAP;
                rulesItem.pinned = false;
                notesItem.pinned = false;
                [toolsItem, rulesItem, notesItem].forEach(updatePinLabel);
                view.panX = 0;
                view.panY = 0;
                place(toolsItem);
                const left = GAP + toolsItem.el.offsetWidth + GAP;
                const colW = 320;
                const top = BAR_H + GAP;
                const availW = innerWidth - left - colW - 2 * GAP;
                const availH = innerHeight - top - BOTTOM;
                setCell(Math.min(cellToFit(availW, availH), 64));
                placeAll();
                const bw = boardItem.el.offsetWidth;
                const bh = boardItem.el.offsetHeight;
                const bx = left + Math.max(0, (availW - bw) / 2);
                const by = top + Math.max(0, (availH - bh) / 2);
                const z = zoom();
                boardItem.wx = bx / z;
                boardItem.wy = by / z;
                const cx = bx + bw + GAP;
                rulesItem.wx = cx / z;
                rulesItem.wy = top / z;
                placeAll();
                const rh = Math.min(rulesItem.el.offsetHeight, innerHeight * 0.55);
                notesItem.wx = cx / z;
                notesItem.wy = (top + rh + GAP) / z;
                placeAll();
                loupes.forEach(drawLoupe);
                renderCardsMenu();
            }

            // ---- Pan: Space-drag, middle-drag, left-drag on bare desk, plain wheel -----------------------------
            let spaceHeld = false;
            let spaceUsed = false;
            let forwarding = false;
            let pan = null;
            function editable(t) {
                return t && (t.tagName === 'TEXTAREA' || (t.tagName === 'INPUT' && /^(text|number|search)$/.test(t.type)) ||
                    t.isContentEditable);
            }
            window.addEventListener('keydown', function(e) {
                if (forwarding || e.key !== ' ' || editable(e.target) || e.ctrlKey || e.shiftKey || e.altKey) {
                    if (e.key === 'Escape' && !picker.hidden) {
                        stopPicking();
                    }
                    return;
                }
                e.preventDefault();
                e.stopImmediatePropagation();
                if (!e.repeat) {
                    spaceHeld = true;
                    spaceUsed = false;
                    root.classList.add('is-panready');
                }
            }, true);
            window.addEventListener('keyup', function(e) {
                if (forwarding || e.key !== ' ' || !spaceHeld) {
                    return;
                }
                e.preventDefault();
                e.stopImmediatePropagation();
                spaceHeld = false;
                root.classList.remove('is-panready');
                if (!spaceUsed) {
                    // A tap of Space with no drag: Penpa+'s own Space (clear the cell).
                    forwarding = true;
                    B.sendKey(' ', {code: 'Space'});
                    forwarding = false;
                }
            }, true);
            window.addEventListener('blur', function() {
                spaceHeld = false;
                root.classList.remove('is-panready');
            });

            window.addEventListener('mousedown', function(e) {
                if (!picker.hidden) {
                    return;
                }
                const bare = e.button === 0 && (e.target === desk || e.target === world);
                if (e.button === 1 || (e.button === 0 && spaceHeld) || bare) {
                    e.preventDefault();
                    e.stopPropagation();
                    spaceUsed = true;
                    pan = {x: e.clientX, y: e.clientY, px: view.panX, py: view.panY};
                    root.classList.add('is-panning');
                }
            }, true);
            window.addEventListener('mousemove', function(e) {
                if (pan) {
                    view.panX = pan.px + e.clientX - pan.x;
                    view.panY = pan.py + e.clientY - pan.y;
                    placeAll();
                    e.stopPropagation();
                } else if (drag) {
                    moveDrag(e);
                }
            }, true);
            window.addEventListener('mouseup', function(e) {
                if (pan) {
                    pan = null;
                    root.classList.remove('is-panning');
                    e.stopPropagation();
                }
                if (drag) {
                    drag = null;
                    document.documentElement.classList.remove('proto-i-dragging');
                }
            }, true);
            // Middle-click on Linux pastes / autoscrolls; keep it for panning.
            window.addEventListener('auxclick', function(e) {
                if (e.button === 1) {
                    e.preventDefault();
                }
            }, true);

            window.addEventListener('wheel', function(e) {
                if (!picker.hidden) {
                    e.preventDefault();
                    return;
                }
                if (e.ctrlKey || e.metaKey) {
                    e.preventDefault();
                    const factor = Math.exp(-e.deltaY * (e.deltaMode === 1 ? 0.05 : 0.0015));
                    zoomAt(view.cell * factor, e.clientX, e.clientY);
                    return;
                }
                // A scrollable card body keeps its own wheel.
                const scroller = e.target.closest && e.target.closest('.proto-i-cardbody, .proto-i-notes, .proto-i-menu');
                if (scroller && scroller.scrollHeight > scroller.clientHeight + 1) {
                    return;
                }
                if (e.target.closest && e.target.closest('.proto-i-bar')) {
                    return;
                }
                e.preventDefault();
                const k = e.deltaMode === 1 ? 20 : 1;
                view.panX -= (e.shiftKey ? e.deltaY : e.deltaX) * k;
                view.panY -= (e.shiftKey ? 0 : e.deltaY) * k;
                placeAll();
            }, {passive: false, capture: true});

            window.addEventListener('resize', function() {
                items.forEach(function(it) {
                    if (it.pinned) {
                        it.sx = Math.min(it.sx, innerWidth - 80);
                        it.sy = Math.min(it.sy, innerHeight - 40);
                    }
                });
                placeAll();
            });

            // ---- Tools card contents --------------------------------------------------------------------------
            const available = B.listModes();
            const availableSet = {};
            available.forEach(function(m) {
                availableSet[m.mode] = m;
            });

            function swatchColor(style) {
                const lb = document.getElementById(style.id + '_lb');
                if (!lb) {
                    return null;
                }
                const bg = getComputedStyle(lb).backgroundColor;
                return bg && bg !== 'rgba(0, 0, 0, 0)' && bg !== 'transparent' ? bg : null;
            }

            function choiceRow(label, items, current, onPick, extraCls) {
                const row = el('div', {class: 'proto-i-row ' + (extraCls || '')});
                if (label) {
                    row.appendChild(el('div', {class: 'proto-i-rowlabel'}, [label]));
                }
                const wrap = el('div', {class: 'proto-i-choices'});
                items.forEach(function(it) {
                    const b = btn(it.color ? 'proto-i-swatch' : 'proto-i-choice', it.color ? (it.key || '') : it.label, function() {
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
                    const c = s.label.length <= 4 ? swatchColor(s) : null;
                    return {value: s.value, label: s.label, color: c, title: s.label,
                        key: (s.label.match(/\d+$/) || [''])[0]};
                });
            }

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
                toolsBody.textContent = '';
                const mode = m.mode;
                toolsBody.appendChild(choiceRow(null, available.map(function(x) {
                    return {value: x.mode, label: x.label};
                }), mode, B.setMode, 'proto-i-modes'));

                if (mode === 'combi') {
                    toolsBody.appendChild(choiceRow('Tool', B.listComposite().map(function(c) {
                        return {value: c.name, label: c.label};
                    }), m.submode, B.setComposite, 'proto-i-grid2'));
                } else if (mode === 'symbol') {
                    const groups = shapeGroups();
                    const curGroup = groups.find(function(g) {
                        return g.sizes.some(function(s) {
                            return s.value === m.submode;
                        });
                    }) || groups[0];
                    toolsBody.appendChild(choiceRow('Shape', groups.map(function(g, i) {
                        return {value: i, label: g.label};
                    }), groups.indexOf(curGroup), function(i) {
                        B.setShape(groups[i].sizes[0].value);
                    }, 'proto-i-grid2 proto-i-scrollrow'));
                    if (curGroup && curGroup.sizes.length > 1) {
                        toolsBody.appendChild(choiceRow('Size', curGroup.sizes, m.submode, B.setShape));
                    }
                } else if (mode !== 'surface' && mode !== 'multicolor') {
                    const subs = submodeItems(mode);
                    if (subs.length > 1) {
                        toolsBody.appendChild(choiceRow(mode === 'sudoku' ? 'Enter as' : 'Kind', subs, m.submode, B.setSubmode));
                    }
                }
                const styles = styleItems(mode);
                const colours = styles.filter(function(s) {
                    return s.color;
                });
                const looks = styles.filter(function(s) {
                    return !s.color;
                });
                if (colours.length) {
                    toolsBody.appendChild(choiceRow(mode === 'surface' || mode === 'multicolor' ? 'Colour' : 'Colour',
                        colours, m.style, B.setStyle, 'proto-i-swatches'));
                }
                if (looks.length && mode !== 'symbol') {
                    toolsBody.appendChild(choiceRow('Style', looks, m.style, B.setStyle));
                }
                if (mode === 'sudoku' || mode === 'number' || mode === 'symbol') {
                    const pad = el('div', {class: 'proto-i-pad'});
                    '1234567890'.split('').forEach(function(d) {
                        pad.appendChild(btn('proto-i-key', d, function() {
                            B.sendKey(d);
                        }));
                    });
                    pad.appendChild(btn('proto-i-key proto-i-key-wide', 'Del', function() {
                        B.sendKey('Delete');
                    }, 'Clear the selected cells'));
                    toolsBody.appendChild(pad);
                }
                toolsBody.appendChild(el('div', {class: 'proto-i-hint'}, [HINTS[mode] || '']));
                const lb = availableSet[mode] ? availableSet[mode].label : mode;
                toolsItem.titleEl.textContent = 'Tools · ' + lb;
            }

            // ---- Answer check ---------------------------------------------------------------------------------
            let checkedAt = -1;
            function runCheck() {
                const r = B.check();
                showStatus(!r.hasAnswerCheck ? 'none' : r.solved ? 'solved' : 'wrong');
                checkedAt = B.history().position;
            }
            function showStatus(kind) {
                status.className = 'proto-i-status is-' + kind;
                status.textContent = kind ? {solved: 'Solved', wrong: 'Not solved yet', none: 'No answer check in this link'}[kind] : '';
                status.dataset.kind = kind || '';
            }

            // ---- Render on change -----------------------------------------------------------------------------
            let lastKey = '';
            function render(state, reason) {
                const m = B.getMode();
                const key = m.mode + '|' + m.submode + '|' + m.style;
                if (key !== lastKey) {
                    lastKey = key;
                    renderTools(m);
                }
                undoBtn.disabled = !state.canUndo;
                redoBtn.disabled = !state.canRedo;
                const h = B.history();
                histText.textContent = h.position + '/' + h.length;
                pauseBtn.textContent = state.timer.paused ? 'Resume' : 'Pause';
                timerText.textContent = state.timer.text;
                if (state.solved && status.dataset.kind !== 'solved') {
                    showStatus('solved');
                } else if (status.dataset.kind && status.dataset.kind !== 'solved' && h.position !== checkedAt) {
                    showStatus('');
                }
                if (pu.size !== view.cell) {
                    view.cell = pu.size; // resized elsewhere (the legacy Settings dialog)
                }
                boardItem.titleEl.textContent = 'Board · ' + pu.gridtype + ' · ' + Math.round(zoom() * 100) + '%';
                if (reason === 'resize') {
                    placeAll();
                } else {
                    placeRegionMarks();
                }
                loupes.forEach(drawLoupe);
            }

            B.onChange(render);
            B.onTimer(function(t) {
                timerText.textContent = t.text;
            });
            render(B.getState(), 'init');
            requestAnimationFrame(function() {
                arrange();
            });

            // Test hook for the prototype's headless checks: read-only view of the desk.
            window.__protoDeskI = {view: view, items: items, loupes: loupes, arrange: arrange, fitBoard: fitBoard};
        }
    };
})();
