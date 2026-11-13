/*
 * PROTOTYPE (throwaway, branch prototype/solve-ui): solve-UI variant C, "Cursor ring".
 * Owned by variant C's builder: this file and variant-C.css only. See README.md for the contract.
 *
 * The idea: the mode lives on the pointer. A ring around the mouse cursor shows the current tool (mode, sub-mode)
 * by colour and icon, with the current colour/style as a dot in its centre. The scroll wheel (or [ and ]) rotates
 * through the tools this puzzle offers; Shift+wheel (or { and }) turns the second dial: the colour, Composite tool
 * or Special shape within the tool. Every change, from any source (wheel, Tab, Shift/Ctrl held in Sudoku, Z/X/C/V),
 * flashes the ring and shows the tool's name and its neighbours at the cursor. In selection modes a small pip sits
 * on the selection too, so keyboard-only solving has the indicator where the eye is. Undo, redo and the answer
 * check report at the cursor. No other chrome: rules, timer and the few buttons sit behind a corner tab on hover.
 *
 * Claim tested: mode errors come from the indicator being far from where you look.
 *
 * Bridge gaps worked around here: no list of Shape tools (the second dial uses Shape's styles instead); swatch
 * colours for styles are read from the legacy `<id>_lb` labels' computed background; the Penpa key handler is
 * pre-empted for [ ] { } by a capture-phase listener on window.
 */
(function() {
    'use strict';

    // Tool colours and icons, by mode or "mode:submode". Colours are chosen to be told apart at a glance.
    const LOOK = {
        'sudoku:1': {color: '#4aa3ff', icon: '7', cls: 'normal'},
        'sudoku:2': {color: '#c77dff', icon: '7', cls: 'corner'},
        'sudoku:3': {color: '#ffab40', icon: '7', cls: 'centre'},
        'number:1': {color: '#4aa3ff', icon: '#', cls: 'normal'},
        'number:7': {color: '#ffab40', icon: '#', cls: 'centre'},
        'line:1': {color: '#3ddc84', icon: '╱'},
        'line:4': {color: '#ff6b6b', icon: '×'},
        'lineE:1': {color: '#26c6da', icon: '┐'},
        'lineE:4': {color: '#ff8a80', icon: '×'},
        surface: {color: '#e0e0e0', icon: '■'},
        multicolor: {color: '#f06292', icon: '◩'},
        line: {color: '#3ddc84', icon: '╱'},
        lineE: {color: '#26c6da', icon: '┐'},
        wall: {color: '#8d6e63', icon: '┃'},
        number: {color: '#4aa3ff', icon: '#'},
        symbol: {color: '#ffd54f', icon: '●'},
        special: {color: '#ba68c8', icon: '⟿'},
        cage: {color: '#90a4ae', icon: '⬚'},
        combi: {color: '#ff7043', icon: '✦'},
        sudoku: {color: '#4aa3ff', icon: '7'},
        move: {color: '#bdbdbd', icon: '✥'}
    };

    function lookFor(mode, submode) {
        return LOOK[mode + ':' + submode] || LOOK[mode] || {color: '#ffffff', icon: '?'};
    }

    window.PrototypeVariants = window.PrototypeVariants || {};
    window.PrototypeVariants.C = {
        name: 'cursor ring',

        /** @param {object} ctx see README.md, "The variant contract" */
        mount(ctx) {
            const B = ctx.bridge;
            const el = ctx.helpers.el;

            // ---- Layout: a dark stage with only the board on it --------------------------------------------------
            const holder = el('div', {class: 'proto-c-board'});
            const stage = el('div', {class: 'proto-c-stage'}, [holder]);
            document.body.appendChild(stage);
            ctx.helpers.adoptBoard(holder);
            ctx.helpers.hideLegacy();

            function fitBoard() {
                const s0 = pu.size;
                const r = ctx.canvas.getBoundingClientRect();
                if (!r.width || !r.height) {
                    return;
                }
                const availW = window.innerWidth - 120;
                const availH = window.innerHeight - 110; // room for the scaffold's switcher at the bottom
                const px = Math.max(12, Math.min(90, Math.floor(s0 * Math.min(availW / r.width, availH / r.height))));
                if (Math.abs(px - s0) >= 1) {
                    B.setCellSize(px);
                }
            }

            // ---- The tool wheel: the tools this puzzle offers, in order -------------------------------------------
            function buildTools() {
                const tools = [];
                B.listModes().forEach(function(m) {
                    const subs = B.listSubmodes(m.mode);
                    const pick = function(values) {
                        subs.filter(function(s) {
                            return values.indexOf(s.value) !== -1;
                        }).forEach(function(s) {
                            tools.push({mode: m.mode, sub: s.value});
                        });
                    };
                    if (m.mode === 'sudoku') {
                        pick(['1', '2', '3']);
                    } else if (m.mode === 'number') {
                        pick(['1', '7']);
                    } else if (m.mode === 'line' || m.mode === 'lineE') {
                        pick(['1', '4']);
                    }
                    if (!tools.some(function(t) {
                        return t.mode === m.mode;
                    })) {
                        tools.push({mode: m.mode});
                    }
                });
                return tools;
            }
            let tools = buildTools();

            function currentIndex() {
                const m = B.getMode();
                let i = tools.findIndex(function(t) {
                    return t.mode === m.mode && t.sub === m.submode;
                });
                if (i < 0) {
                    i = tools.findIndex(function(t) {
                        return t.mode === m.mode;
                    });
                }
                return i;
            }

            function applyTool(t) {
                B.setMode(t.mode);
                if (t.sub !== undefined && B.getMode().submode !== t.sub) {
                    B.setSubmode(t.sub);
                }
            }

            function rotateTool(dir) {
                if (!tools.length) {
                    return;
                }
                const i = currentIndex();
                const next = tools[((i < 0 ? 0 : i) + dir + tools.length) % tools.length];
                applyTool(next);
            }

            // The second dial: what varies within the current tool.
            function dialItems() {
                const m = B.getMode();
                if (m.mode === 'combi') {
                    return B.listComposite().map(function(c) {
                        return {key: c.name, label: c.label, apply: function() {
                            B.setComposite(c.name);
                        }};
                    });
                }
                if (m.mode === 'special') {
                    return B.listSubmodes('special').map(function(s) {
                        return {key: s.value, label: s.label, apply: function() {
                            B.setSubmode(s.value);
                        }};
                    });
                }
                return B.listStyles(m.mode).map(function(s) {
                    return {key: String(s.value), label: s.label, id: s.id, apply: function() {
                        B.setStyle(s.value);
                    }};
                });
            }

            function dialKey() {
                const m = B.getMode();
                return m.mode === 'combi' || m.mode === 'special' ? m.submode : String(m.style);
            }

            function rotateDial(dir) {
                const items = dialItems();
                if (!items.length) {
                    return;
                }
                const i = items.findIndex(function(it) {
                    return it.key === dialKey();
                });
                items[((i < 0 ? 0 : i) + dir + items.length) % items.length].apply();
            }

            // ---- Names and colours for display, always read back from the engine's actual state ---------------
            function toolName(mode, submode) {
                const ml = B.listModes().find(function(x) {
                    return x.mode === mode;
                });
                let name = ml ? ml.label : mode;
                if (mode === 'combi') {
                    // The wheel's Composite entry has no sub-mode; name the tool Composite would restore.
                    const name2 = submode !== undefined ? submode : ctx.pu.mode[ctx.pu.mode.qa].combi[0];
                    const c = B.listComposite().find(function(x) {
                        return x.name === name2;
                    });
                    return c ? c.label : name;
                }
                const subs = B.listSubmodes(mode);
                if (subs.length > 1) {
                    const s = subs.find(function(x) {
                        return x.value === submode;
                    });
                    if (s && s.label) {
                        name += ' · ' + s.label;
                    }
                }
                return name;
            }

            function swatchColor() {
                const m = B.getMode();
                if (m.mode !== 'surface' && m.mode !== 'multicolor') {
                    return null;
                }
                const sw = document.getElementById('st_surface' + m.style + '_lb');
                if (!sw) {
                    return null;
                }
                const c = getComputedStyle(sw).backgroundColor;
                return c && c !== 'rgba(0, 0, 0, 0)' ? c : null;
            }

            function styleLabel() {
                const m = B.getMode();
                if (m.mode === 'combi' || m.mode === 'special') {
                    return '';
                }
                const s = B.listStyles(m.mode).find(function(x) {
                    return x.value === m.style;
                });
                return s ? s.label.replace(/\d+$/, '') : '';
            }

            // ---- The ring ------------------------------------------------------------------------------------
            const ringIcon = el('span', {class: 'proto-c-icon'});
            const ringDot = el('span', {class: 'proto-c-dot'});
            const ringLabel = el('div', {class: 'proto-c-label'});
            const ringCarousel = el('div', {class: 'proto-c-carousel'});
            const ringToast = el('div', {class: 'proto-c-toast'});
            const ringCircle = el('div', {class: 'proto-c-circle'}, [ringDot]);
            const ringBadge = el('div', {class: 'proto-c-badge'}, [ringIcon]);
            const ring = el('div', {class: 'proto-c-ring proto-c-hidden'},
                [ringCircle, ringBadge, ringLabel, ringCarousel, ringToast]);
            document.body.appendChild(ring);

            // The caret pip: the same badge on the selection, for keyboard solving.
            const pipIcon = el('span', {class: 'proto-c-icon'});
            const pip = el('div', {class: 'proto-c-pip proto-c-hidden'}, [pipIcon]);
            document.body.appendChild(pip);

            let pointer = {x: -100, y: -100, inside: false, lastMove: 0};
            let lastKeyboard = 0;
            let heldMod = false;

            function placeRing() {
                ring.style.transform = 'translate(' + pointer.x + 'px,' + pointer.y + 'px)';
            }

            window.addEventListener('mousemove', function(e) {
                pointer.x = e.clientX;
                pointer.y = e.clientY;
                pointer.lastMove = Date.now();
                const overChrome = e.target.closest && e.target.closest('.proto-c-tab, #proto-switcher, .swal2-container, .modal');
                pointer.inside = !overChrome;
                ring.classList.toggle('proto-c-hidden', !pointer.inside);
                placeRing();
                renderPip();
            }, true);
            document.addEventListener('mouseleave', function() {
                ring.classList.add('proto-c-hidden');
            });

            let labelTimer = null;
            function flash(showCarousel) {
                ring.classList.remove('proto-c-flash');
                void ring.offsetWidth; // restart the animation
                ring.classList.add('proto-c-flash');
                pip.classList.remove('proto-c-flash');
                void pip.offsetWidth;
                pip.classList.add('proto-c-flash');
                ring.classList.add('proto-c-show-label');
                ring.classList.toggle('proto-c-show-carousel', !!showCarousel);
                clearTimeout(labelTimer);
                labelTimer = setTimeout(function() {
                    ring.classList.remove('proto-c-show-label', 'proto-c-show-carousel');
                }, 1400);
            }

            let toastTimer = null;
            function toast(text, kind) {
                ringToast.textContent = text;
                ringToast.className = 'proto-c-toast proto-c-toast-on' + (kind ? ' proto-c-toast-' + kind : '');
                clearTimeout(toastTimer);
                toastTimer = setTimeout(function() {
                    ringToast.className = 'proto-c-toast';
                }, kind === 'solved' ? 4000 : 1100);
            }

            function renderCarousel() {
                ringCarousel.textContent = '';
                const i = currentIndex();
                if (tools.length < 2 || i < 0) {
                    return;
                }
                [-1, 0, 1].forEach(function(d) {
                    if (tools.length === 2 && d === 1) {
                        return;
                    }
                    const t = tools[(i + d + tools.length) % tools.length];
                    const lk = lookFor(t.mode, t.sub);
                    const name = d === 0 ? toolName(B.getMode().mode, B.getMode().submode) : toolName(t.mode, t.sub);
                    ringCarousel.appendChild(el('div', {class: 'proto-c-car-item' + (d === 0 ? ' proto-c-car-cur' : ''),
                        style: '--c:' + lk.color}, [el('span', {class: 'proto-c-car-icon proto-c-icon-' + (lk.cls || 'plain')},
                        [lk.icon]), name]));
                });
            }

            function selectionMode(mode) {
                return mode === 'sudoku' || mode === 'number' || mode === 'multicolor' || mode === 'symbol';
            }

            function renderPip() {
                const m = B.getMode();
                const sel = selectionMode(m.mode) ? B.getSelection() : null;
                if (!sel || !sel.rect || !sel.cells.length) {
                    pip.classList.add('proto-c-hidden');
                    return;
                }
                const r = sel.rect;
                pip.classList.remove('proto-c-hidden');
                pip.style.left = (r.right - window.scrollX) + 'px';
                pip.style.top = (r.top - window.scrollY) + 'px';
                // Dim it while the mouse is the thing being used; the ring is already where the eye is.
                const keyboardRecent = lastKeyboard > pointer.lastMove;
                pip.classList.toggle('proto-c-pip-dim', !keyboardRecent);
            }

            let lastKey = null;
            let lastSolved = false;
            function render(reason) {
                const st = B.getState();
                const lk = lookFor(st.mode, st.submode);
                const key = [st.mode, st.submode, st.style].join('|');
                ring.style.setProperty('--c', lk.color);
                pip.style.setProperty('--c', lk.color);
                ringIcon.textContent = lk.icon;
                ringIcon.className = 'proto-c-icon proto-c-icon-' + (lk.cls || 'plain');
                pipIcon.textContent = lk.icon;
                pipIcon.className = 'proto-c-icon proto-c-icon-' + (lk.cls || 'plain');
                const sw = swatchColor();
                ringDot.style.background = sw || 'transparent';
                ringDot.classList.toggle('proto-c-hidden', !sw);
                // Name the style only when it is what just changed (the second dial); else it is noise.
                const styleOnly = lastKey !== null && key !== lastKey && lastKey.indexOf(st.mode + '|' + st.submode + '|') === 0;
                const sl = styleOnly && !sw ? styleLabel() : '';
                ringLabel.textContent = toolName(st.mode, st.submode) + (sl ? ' · style ' + sl : '') +
                    (heldMod ? '  (held)' : '');
                ring.classList.toggle('proto-c-temp', heldMod);
                ring.classList.toggle('proto-c-solved', st.solved);
                renderCarousel();
                renderPip();
                if (lastKey !== null && key !== lastKey) {
                    const toolChanged = lastKey.split('|').slice(0, 2).join('|') !== key.split('|').slice(0, 2).join('|');
                    flash(toolChanged);
                }
                lastKey = key;
                if (st.solved && !lastSolved) {
                    toast('Solved!', 'solved');
                }
                lastSolved = st.solved;
                tabRender(st);
            }

            // ---- Input: wheel and bracket keys -----------------------------------------------------------------
            let wheelAcc = 0;
            let wheelAt = 0;
            window.addEventListener('wheel', function(e) {
                if (e.ctrlKey || (e.target.closest && e.target.closest('.proto-c-tab, #proto-switcher, .swal2-container, .modal'))) {
                    return;
                }
                e.preventDefault();
                const d = e.deltaY || e.deltaX;
                const now = Date.now();
                if (now - wheelAt > 250) {
                    wheelAcc = 0;
                }
                wheelAcc += d;
                // One notch is ~100 on a mouse; a trackpad sends many small deltas.
                if (Math.abs(wheelAcc) >= 60 && now - wheelAt > 90) {
                    const dir = wheelAcc > 0 ? 1 : -1;
                    wheelAcc = 0;
                    wheelAt = now;
                    if (e.shiftKey) {
                        rotateDial(dir);
                    } else {
                        rotateTool(dir);
                    }
                } else if (Math.abs(wheelAcc) < 60) {
                    wheelAt = wheelAt || now;
                }
            }, {passive: false, capture: true});

            const ROTATE = {']': [rotateTool, 1], '[': [rotateTool, -1], '}': [rotateDial, 1], '{': [rotateDial, -1]};
            window.addEventListener('keydown', function(e) {
                const tag = e.target && e.target.tagName;
                if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') {
                    return;
                }
                if (ROTATE[e.key] && !e.ctrlKey && !e.altKey && !e.metaKey) {
                    e.preventDefault();
                    e.stopImmediatePropagation(); // keep Penpa+ from typing the bracket
                    ROTATE[e.key][0](ROTATE[e.key][1]);
                    return;
                }
                if (e.key === 'Shift' || e.key === 'Control') {
                    if (B.getMode().mode === 'sudoku') {
                        heldMod = true;
                    }
                } else {
                    lastKeyboard = Date.now();
                }
                if ((e.ctrlKey || e.metaKey) && !e.altKey) {
                    const k = e.key.toLowerCase();
                    if (k === 'z' && !e.shiftKey) {
                        toast('↶ Undo');
                    } else if (k === 'y' || (k === 'z' && e.shiftKey)) {
                        toast('↷ Redo');
                    }
                }
            }, true);
            window.addEventListener('keyup', function(e) {
                if (e.key === 'Shift' || e.key === 'Control') {
                    heldMod = false;
                    requestAnimationFrame(function() {
                        render('keyup');
                    });
                }
            }, true);
            window.addEventListener('blur', function() {
                heldMod = false;
            });

            // ---- The corner tab: rules, timer, undo/redo/check, keys -------------------------------------------
            const info = B.getInfo();
            const tabTimer = el('span', {class: 'proto-c-timer'});
            const tabVerdict = el('div', {class: 'proto-c-verdict'});
            const tabTools = el('div', {class: 'proto-c-toollist'});
            const rules = el('div', {class: 'proto-c-rules'});
            rules.innerHTML = info.rules || '<i>No rules given.</i>';

            function btn(label, title, fn) {
                return el('button', {class: 'proto-c-btn', type: 'button', title: title, onclick: fn}, [label]);
            }
            function doUndo() {
                B.undo();
                toast('↶ Undo');
            }
            function doRedo() {
                B.redo();
                toast('↷ Redo');
            }
            function doCheck() {
                const v = B.check();
                let text;
                let kind;
                if (!v.hasAnswerCheck) {
                    text = 'This puzzle has no answer check';
                    kind = 'none';
                } else if (v.solved) {
                    text = 'Solved!';
                    kind = 'solved';
                } else {
                    text = 'Not solved yet';
                    kind = 'wrong';
                }
                tabVerdict.textContent = text;
                tabVerdict.className = 'proto-c-verdict proto-c-verdict-' + kind;
                toast(text, kind);
            }
            const undoBtn = btn('↶ Undo', 'Ctrl+Z', doUndo);
            const redoBtn = btn('↷ Redo', 'Ctrl+Y', doRedo);
            const checkBtn = btn('✓ Check', 'Run the answer check', doCheck);

            const panel = el('div', {class: 'proto-c-panel'}, [
                el('div', {class: 'proto-c-title'}, [info.title || 'Untitled']),
                el('div', {class: 'proto-c-author'}, [info.author ? 'by ' + info.author : '']),
                rules,
                el('div', {class: 'proto-c-row'}, [undoBtn, redoBtn, checkBtn,
                    btn('⚙', 'Settings', function() {
                        B.openSettings();
                    })]),
                tabVerdict,
                el('div', {class: 'proto-c-sub'}, ['Tools on the wheel']),
                tabTools,
                el('div', {class: 'proto-c-keys'}, [
                    el('div', {}, [el('kbd', {}, ['wheel']), ' or ', el('kbd', {}, ['[']), el('kbd', {}, [']']), ' change tool']),
                    el('div', {}, [el('kbd', {}, ['Shift+wheel']), ' or ', el('kbd', {}, ['{']), el('kbd', {}, ['}']),
                        ' change colour / tool variant']),
                    el('div', {}, [el('kbd', {}, ['Ctrl+Z']), ' undo  ', el('kbd', {}, ['Ctrl+Y']), ' redo'])
                ])
            ]);
            const tab = el('div', {class: 'proto-c-tab'}, [
                el('div', {class: 'proto-c-handle'}, [el('span', {class: 'proto-c-handle-q'}, ['?']), tabTimer]),
                panel
            ]);
            document.body.appendChild(tab);
            // Open on a deliberate hover of the handle (not a pass-through); close soon after the pointer leaves.
            const handle = tab.firstChild;
            let openTimer = null;
            handle.addEventListener('mouseenter', function() {
                clearTimeout(openTimer);
                openTimer = setTimeout(function() {
                    tab.classList.add('proto-c-open');
                }, 250);
            });
            tab.addEventListener('mouseenter', function() {
                if (tab.classList.contains('proto-c-open')) {
                    clearTimeout(openTimer);
                }
            });
            tab.addEventListener('mouseleave', function() {
                clearTimeout(openTimer);
                openTimer = setTimeout(function() {
                    tab.classList.remove('proto-c-open');
                }, 200);
            });

            function tabRender(st) {
                undoBtn.disabled = !st.canUndo;
                redoBtn.disabled = !st.canRedo;
                checkBtn.classList.toggle('proto-c-hidden', !st.hasAnswerCheck);
                tab.classList.toggle('proto-c-tab-solved', st.solved);
                tabTools.textContent = '';
                const cur = currentIndex();
                tools.forEach(function(t, i) {
                    const lk = lookFor(t.mode, t.sub);
                    tabTools.appendChild(el('div', {class: 'proto-c-tool' + (i === cur ? ' proto-c-tool-cur' : ''),
                        style: '--c:' + lk.color, onclick: function() {
                            applyTool(t);
                        }}, [el('span', {class: 'proto-c-car-icon proto-c-icon-' + (lk.cls || 'plain')}, [lk.icon]),
                        toolName(t.mode, t.sub)]));
                });
            }
            B.onTimer(function(t) {
                tabTimer.textContent = t.text;
            });
            tabTimer.textContent = B.getTimer().text;

            // ---- Wire up ---------------------------------------------------------------------------------------
            B.onChange(function(state, reason) {
                if (reason === 'resize') {
                    requestAnimationFrame(function() {
                        renderPip();
                    });
                }
                render(reason);
            });
            window.addEventListener('resize', fitBoard);
            fitBoard();
            requestAnimationFrame(function() {
                tools = buildTools();
                render('mount');
                // Introduce the ring once, at the board's centre, until the mouse moves.
                const r = ctx.canvas.getBoundingClientRect();
                if (pointer.x < 0) {
                    pointer.x = r.left + r.width / 2;
                    pointer.y = r.top + r.height / 2;
                    placeRing();
                    ring.classList.remove('proto-c-hidden');
                }
                toast('Scroll or [ ] to change tool');
                flash(true);
            });
        }
    };
})();
