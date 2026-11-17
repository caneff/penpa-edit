// The solve page: the top bar and the desk of cards, built once `engine` has the puzzle loaded. Every card moves by its
// title bar and resizes by any edge or corner; one layout for every puzzle is kept in localStorage, with the Rules
// card's text size beside it.
// Also `window.uiKit`, the element builders the UI files share. Reaches Penpa+ only through `engine`
// (test/ui-boundary.test.mjs fails otherwise).
(function () {
    'use strict';

    const CARD_GAP_PX = 10;
    const DESK_MARGIN_PX = 14;
    const COLUMN_WIDTH_PX = 380;
    const MIN_COLUMN_WIDTH_PX = 240;
    const MIN_BOARD_WIDTH_PX = 300;
    const TOP_MARGIN_PX = 12;
    // Below this a card body is a layout in progress, not a box to fit the board to.
    const MIN_FIT_BOX_PX = 40;
    const FIT_PASSES = 3;
    // The board's container is 1 px wider than its canvas on every side, and it is the container that scrolls the card.
    const BOARD_FRAME_PX = 2;
    // The finest width the fit pass tells apart when it looks for the narrowest left column that needs no scroll.
    const LEFT_WIDTH_STEP_PX = 8;
    // A card never reaches closer than this to the desk's edge once it has to shrink to stay inside.
    const EDGE_MARGIN_PX = 8;
    const LAYOUT_KEY = 'chinstrap-solve-layout-v1';
    // The step of the board card's - and + buttons, in pixels per cell.
    const ZOOM_STEP_PX = 4;
    // The smallest a card is dragged to, [width, height].
    const MIN_SIZE = { board: [240, 200], mouse: [260, 140], pins: [240, 110], mode: [280, 100], recent: [240, 80], rules: [200, 80] };
    // The Rules card's own text size, kept beside the layout and cleared with it. Pixels; the - and + buttons step it.
    const RULES_TEXT_KEY = 'chinstrap-solve-rules-text-v1';
    const RULES_TEXT_RANGE_PX = { min: 10, max: 28, step: 2 };
    // Each resize handle by name, with the edges of the card it moves. `desk.css` places and styles each by the same name.
    const RESIZE_HANDLES = {
        top: ['top'], right: ['right'], bottom: ['bottom'], left: ['left'],
        'top-left': ['top', 'left'], 'top-right': ['top', 'right'], 'bottom-right': ['bottom', 'right'], 'bottom-left': ['bottom', 'left']
    };

    // Variant L's arrangement, which the fitted layout sizes: Mouse and Rules on the left, the Board between, Pinned, Mode and Recent on the right.
    const LEFT_COLUMN = ['mouse', 'rules'];
    const RIGHT_COLUMN = ['pins', 'mode', 'recent'];
    const CARD_TITLES = { board: 'Board', mouse: 'Mouse', rules: 'Rules', pins: 'Pinned', mode: 'Mode', recent: 'Recent' };

    function el(tag, attrs = {}, children = []) {
        const node = document.createElement(tag);
        Object.entries(attrs).forEach(([name, value]) => node.setAttribute(name, value));
        node.append(...children);
        return node;
    }

    // A button showing a 16x16 line icon (`icon` is its SVG markup, drawn in currentColor) and naming itself `label` to
    // screen readers only. `show(icon, label)` swaps both, and does nothing when that icon is already shown.
    function iconButton(icon, label, onClick) {
        const node = el('wa-button', { appearance: 'filled', variant: 'neutral', size: 's' });
        const text = el('span', { class: 'ui-sr-only' });
        node.append(text);
        node.addEventListener('click', onClick);
        let shown = null;
        function show(nextIcon, nextLabel) {
            if (nextIcon === shown) {
                return;
            }
            shown = nextIcon;
            node.querySelector('svg')?.remove();
            node.insertAdjacentHTML('afterbegin', '<svg width="16" height="16" viewBox="0 0 16 16" aria-hidden="true" fill="none" ' +
                `stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">${nextIcon}</svg>`);
            text.textContent = nextLabel;
        }
        show(icon, label);
        return { node, show };
    }

    // Runs `build(desk)` once the desk is built. A desk that never got built is reported once, where `deskReady` is made.
    function onDeskReady(build) {
        return window.deskReady.then(build, () => {});
    }

    // A wa-dialog asking `label` with `text` under it, a plain `cancel` button and a danger `confirm` one that runs `onConfirm`.
    // Both buttons close it. The caller adds the node to the page and opens it with `.open = true`.
    function confirmDialog({ label, text, cancel, confirm, onConfirm }) {
        const dialog = el('wa-dialog', { label }, [text,
            el('wa-button', { slot: 'footer', appearance: 'plain', 'data-dialog': 'close' }, [cancel]),
            el('wa-button', { slot: 'footer', variant: 'danger', 'data-dialog': 'close' }, [confirm])]);
        dialog.lastElementChild.addEventListener('click', onConfirm);
        return dialog;
    }

    window.uiKit = { el, iconButton, onDeskReady, confirmDialog };

    function build(info) {
        const resetButton = el('wa-button', { class: 'ui-reset', appearance: 'filled', variant: 'neutral', size: 's' }, ['Reset layout']);
        const bar = el('header', { class: 'ui-bar' }, [
            el('div', { class: 'ui-heading' }, [
                el('h1', { class: 'ui-title' }, [info.title || 'Untitled']),
                el('span', { class: 'ui-author' }, [info.author ? `by ${info.author}` : ''])
            ]),
            el('span', { class: 'ui-spacer' }),
            resetButton
        ]);
        const desk = el('div', { class: 'ui-desk' });
        const cards = {};
        Object.entries(CARD_TITLES).forEach(([id, title]) => {
            const body = el('div', { class: 'ui-body' });
            const head = el('div', { class: 'ui-head' }, [el('h2', {}, [title])]);
            const handles = Object.keys(RESIZE_HANDLES).map((name) =>
                el('div', { class: `ui-resize ui-resize-${name}`, 'data-testid': `resize-${name}` }));
            cards[id] = {
                body,
                head,
                handles,
                node: el('section', { class: `ui-card ui-card-${id}`, 'aria-label': title }, [head, body, ...handles])
            };
            desk.append(cards[id].node);
        });
        const symbolButton = (symbol, label) => {
            return el('wa-button', { appearance: 'filled', variant: 'neutral', size: 's' },
                [el('span', { 'aria-hidden': 'true' }, [symbol]), el('span', { class: 'ui-sr-only' }, [label])]);
        };
        const zoom = {
            out: symbolButton('\u2212', 'Zoom out'),
            in: symbolButton('+', 'Zoom in'),
            fit: el('wa-button', { appearance: 'filled', variant: 'neutral', size: 's' }, ['Fit'])
        };
        cards.board.head.append(el('span', { class: 'ui-zoom' }, [zoom.out, zoom.in, zoom.fit]));
        const rulesText = { smaller: symbolButton('\u2212', 'Smaller rules text'), bigger: symbolButton('+', 'Bigger rules text') };
        cards.rules.head.append(el('span', { class: 'ui-rules-text' }, [rulesText.smaller, rulesText.bigger]));
        // textContent, and pre-wrap in the CSS: the rules are text, never HTML.
        cards.rules.body.textContent = info.rules || 'No rules in this link.';
        const root = el('div', { class: 'ui-root' }, [bar, desk]);
        document.body.append(root);
        return { bar, desk, cards, zoom, rulesText, resetButton };
    }

    // ---- The kept layout --------------------------------------------------------------------------------------------

    // Per card id: `w`, `h` (set once the card was resized; `h` only when its height was set) and `x`, `y`, `vw`, `vh` (set
    // once it was dragged, or by the fitted layout: where it sat, in a desk of `vw` x `vh`). A card with a place keeps its
    // gap to the nearer edges when the desk changes size, so zooming the browser out and back in returns the same layout.
    function readLayout() {
        let saved;
        try {
            saved = JSON.parse(localStorage.getItem(LAYOUT_KEY));
        } catch (e) {
            // An unreadable layout is only card places, cheap to redo: the desk opens on the fitted one, and the next card
            // moved or resized replaces it. Said in the console, so the loss is never silent.
            console.warn(`${LAYOUT_KEY} is unreadable (${e.message}); the fitted layout is used, and the next change replaces it.`);
            return {};
        }
        // A card entry this code did not write (another version's, or edited by hand) is left out, as is any other key.
        const isNumbers = (entry) => entry && typeof entry === 'object' && Object.values(entry).every(Number.isFinite);
        const layout = {};
        Object.keys(CARD_TITLES).forEach((id) => {
            if (isNumbers(saved?.[id])) {
                layout[id] = saved[id];
            }
        });
        return layout;
    }

    let saved = readLayout();

    function writeLayout() {
        localStorage.setItem(LAYOUT_KEY, JSON.stringify(saved));
    }

    const isMoved = (id) => saved[id]?.x !== undefined;

    // Records the card's size, and its place when it was moved, as it is now.
    function saveCard(desk, id, node) {
        isFitted = false;
        const entry = { w: node.offsetWidth };
        if (node.classList.contains('is-sized')) {
            entry.h = node.offsetHeight;
        }
        if (isMoved(id)) {
            Object.assign(entry, { x: node.offsetLeft, y: node.offsetTop, vw: desk.clientWidth, vh: desk.clientHeight });
        }
        saved[id] = entry;
        writeLayout();
    }

    // A card with a place of its own: the layout keeps where it sits, and a window resize keeps its gap to the desk's edges.
    function keepPlace(id, node) {
        saved[id] = { ...saved[id], x: node.offsetLeft, y: node.offsetTop };
    }

    function setHeight(node, px) {
        node.style.height = `${px}px`;
        node.classList.add('is-sized');
    }

    // ---- Placing the cards ------------------------------------------------------------------------------------------

    // The Mouse card's whole height that fits every tool's rows at a card width, set by whoever knows its content. Until it
    // is set the desk keeps variant L's fixed layout.
    const fit = { mouseCardHeight: null };
    // True until the fit pass has run for the desk as it was opened or last reset.
    let fitPending = Object.keys(saved).length === 0;
    // True while the layout is the fitted one and no card has been moved or resized since.
    let isFitted = false;

    const columnWidthFor = (deskWidth) => Math.max(MIN_COLUMN_WIDTH_PX,
        Math.min(COLUMN_WIDTH_PX, Math.floor((deskWidth - 4 * DESK_MARGIN_PX - MIN_BOARD_WIDTH_PX) / 2)));

    const position = (cards, id, x, y, w) => {
        const style = cards[id].node.style;
        style.left = `${x}px`;
        style.top = `${y}px`;
        style.width = `${saved[id]?.w ?? Math.max(MIN_SIZE[id][0], w)}px`;
    };

    // Share i of n starts at an even fraction of the column's height; a card never starts closer than CARD_GAP_PX
    // below the card above it, so one that outgrows its share pushes the next down.
    function stack(cards, ids, x, width, deskHeight) {
        const columnHeight = deskHeight - TOP_MARGIN_PX - CARD_GAP_PX;
        let nextFree = TOP_MARGIN_PX;
        ids.forEach((id, i) => {
            const y = Math.max(TOP_MARGIN_PX + Math.round(i * (columnHeight + CARD_GAP_PX) / ids.length), nextFree);
            position(cards, id, x, y, width);
            nextFree = y + cards[id].node.offsetHeight + CARD_GAP_PX;
        });
    }

    // Puts every card at its place for the desk's current size: the fitted layout for a desk with none kept, else each
    // card's kept size and, if it was moved, its kept place, the default for one never touched. Every card ends inside
    // the desk, shrunk (to its minimum at most) if need be.
    function layout({ desk, cards }) {
        const width = desk.clientWidth;
        const height = desk.clientHeight;
        // Heights first, so a card the solver made taller pushes the ones below it in its column.
        Object.entries(cards).forEach(([id, { node }]) => {
            node.style.height = '';
            node.classList.remove('is-sized');
            if (saved[id]?.h) {
                setHeight(node, saved[id].h);
            }
        });
        if (fitPending && fit.mouseCardHeight) {
            fitPending = false;
            isFitted = true;
            fitCards(desk, cards);
            return;
        }
        const columnWidth = columnWidthFor(width);
        const rightX = width - DESK_MARGIN_PX - columnWidth;
        const boardX = DESK_MARGIN_PX + columnWidth + DESK_MARGIN_PX;
        stack(cards, LEFT_COLUMN, DESK_MARGIN_PX, columnWidth, height);
        stack(cards, RIGHT_COLUMN, rightX, columnWidth, height);
        position(cards, 'board', boardX, TOP_MARGIN_PX, rightX - DESK_MARGIN_PX - boardX);
        if (!saved.board?.h) {
            setHeight(cards.board.node, Math.max(MIN_SIZE.board[1], height - 2 * TOP_MARGIN_PX));
        }
        Object.entries(cards).forEach(([id, { node }]) => keepInside(id, node, width, height));
    }

    const columnMinWidth = (ids) => Math.max(MIN_COLUMN_WIDTH_PX, ...ids.map((id) => MIN_SIZE[id][0]));

    // The height the Rules card needs to show its whole text at `cardWidth`, measured in a hidden copy of its body.
    function rulesCardHeight({ node, body }, cardWidth) {
        const probe = el('div', { class: 'ui-body' });
        probe.textContent = body.textContent;
        probe.style.cssText = `position:absolute;visibility:hidden;left:0;top:0;box-sizing:border-box;height:auto;max-height:none;` +
            `width:${cardWidth - (node.offsetWidth - body.offsetWidth)}px;font-size:${getComputedStyle(body).fontSize};`;
        node.append(probe);
        const needed = probe.offsetHeight + node.offsetHeight - body.offsetHeight;
        probe.remove();
        return needed;
    }

    // The layout that suits the puzzle on screen (#156). The cap on the Board card leaves the left column its minimum and the
    // right column its default width, which the ruling keeps. Kept in memory, and written only when a card is moved or resized.
    function fitCards(desk, cards) {
        const width = desk.clientWidth;
        const height = desk.clientHeight;
        const columnHeight = height - 2 * TOP_MARGIN_PX;
        const leftMin = columnMinWidth(LEFT_COLUMN);
        const rightWidth = Math.max(columnWidthFor(width), columnMinWidth(RIGHT_COLUMN));

        const boardMax = Math.max(MIN_SIZE.board[0], width - 4 * DESK_MARGIN_PX - leftMin - rightWidth);
        const board = cards.board;
        board.node.style.width = `${boardMax}px`;
        setHeight(board.node, Math.max(MIN_SIZE.board[1], columnHeight));
        fitBoard(board.body);
        const drawnWidth = board.body.firstElementChild.getBoundingClientRect().width;
        const boardWidth = clamp(Math.ceil(drawnWidth) + board.node.offsetWidth - bodyRoom(board.body).w, MIN_SIZE.board[0], boardMax);

        const leftMax = Math.max(leftMin, width - 4 * DESK_MARGIN_PX - boardWidth - rightWidth);
        const neededHeight = (w) => fit.mouseCardHeight(w) + CARD_GAP_PX + rulesCardHeight(cards.rules, w);
        // Both cards only get shorter as they widen, so the narrowest width that fits is found by halving; when none does,
        // the cards take all the width there is.
        let leftWidth = leftMax;
        if (neededHeight(leftMax) <= columnHeight) {
            let [low, high] = [leftMin, leftMax];
            while (high - low > LEFT_WIDTH_STEP_PX) {
                const middle = Math.floor((low + high) / 2);
                if (neededHeight(middle) <= columnHeight) {
                    high = middle;
                } else {
                    low = middle;
                }
            }
            leftWidth = neededHeight(low) <= columnHeight ? low : high;
        }
        const mouseHeight = clamp(fit.mouseCardHeight(leftWidth), MIN_SIZE.mouse[1], columnHeight - CARD_GAP_PX - MIN_SIZE.rules[1]);

        const gap = Math.max(DESK_MARGIN_PX, Math.floor((width - boardWidth - leftWidth - rightWidth) / 4));
        const boardX = gap + leftWidth + gap;
        const rightX = boardX + boardWidth + gap;
        stack(cards, RIGHT_COLUMN, rightX, rightWidth, height);
        // Unlike `position`, which gives a card its kept width, the fit sets every size itself.
        const place = (id, x, y, w, h) => {
            Object.assign(cards[id].node.style, { left: `${x}px`, top: `${y}px`, width: `${w}px` });
            setHeight(cards[id].node, h);
        };
        place('board', boardX, TOP_MARGIN_PX, boardWidth, Math.max(MIN_SIZE.board[1], columnHeight));
        place('mouse', gap, TOP_MARGIN_PX, leftWidth, mouseHeight);
        place('rules', gap, TOP_MARGIN_PX + mouseHeight + CARD_GAP_PX, leftWidth, columnHeight - CARD_GAP_PX - mouseHeight);
        Object.entries(cards).forEach(([id, { node }]) => keepInside(id, node, width, height));
        Object.entries(cards).forEach(([id, { node }]) => {
            saved[id] = { w: node.offsetWidth, x: node.offsetLeft, y: node.offsetTop, vw: width, vh: height };
            if (node.classList.contains('is-sized')) {
                saved[id].h = node.offsetHeight;
            }
        });
    }

    function keepInside(id, node, deskWidth, deskHeight) {
        const [minWidth, minHeight] = MIN_SIZE[id];
        const entry = saved[id];
        let x = node.offsetLeft;
        let y = node.offsetTop;
        if (isMoved(id)) {
            x = entry.x;
            y = entry.y;
            // Anchored to the nearer edge of the desk it was saved in, keeping that edge's gap.
            const savedHeight = entry.h ?? node.offsetHeight;
            if (entry.x + entry.w / 2 > entry.vw / 2) {
                x = deskWidth - (entry.vw - entry.x - entry.w) - node.offsetWidth;
            }
            if (entry.y + savedHeight / 2 > entry.vh / 2) {
                y = deskHeight - (entry.vh - entry.y - savedHeight) - node.offsetHeight;
            }
        }
        if (node.offsetWidth > deskWidth - 2 * EDGE_MARGIN_PX) {
            node.style.width = `${Math.max(minWidth, deskWidth - 2 * EDGE_MARGIN_PX)}px`;
        }
        // A card never touched shrinks to the room below its default place; any card shrinks to the desk's height.
        if (!isMoved(id) && y + node.offsetHeight > deskHeight - EDGE_MARGIN_PX) {
            setHeight(node, Math.max(minHeight, deskHeight - EDGE_MARGIN_PX - y));
        }
        if (node.offsetHeight > deskHeight - 2 * EDGE_MARGIN_PX) {
            setHeight(node, Math.max(minHeight, deskHeight - 2 * EDGE_MARGIN_PX));
        }
        node.style.left = `${Math.max(0, Math.min(x, deskWidth - node.offsetWidth))}px`;
        node.style.top = `${Math.max(0, Math.min(y, deskHeight - node.offsetHeight))}px`;
    }

    // ---- Moving, resizing and raising ---------------------------------------------------------------------------------

    // Runs `onMove(dx, dy)` for a pointer drag begun by `event` on `target`, and `onEnd(didMove)` when it ends.
    function trackPointer(event, target, onMove, onEnd) {
        event.preventDefault();
        event.stopPropagation();
        const startX = event.clientX;
        const startY = event.clientY;
        let didMove = false;
        target.setPointerCapture(event.pointerId);
        const move = (e) => {
            didMove = true;
            onMove(e.clientX - startX, e.clientY - startY);
        };
        const end = () => {
            target.removeEventListener('pointermove', move);
            target.removeEventListener('pointerup', end);
            target.removeEventListener('pointercancel', end);
            onEnd(didMove);
        };
        target.addEventListener('pointermove', move);
        target.addEventListener('pointerup', end);
        target.addEventListener('pointercancel', end);
    }

    // Cards raised by a click stack above the others, from the cards' own z-index up to two below the top bar's, one short of a card with an open picker list (desk.css).
    function makeMovable(bar, desk, cards) {
        const firstZ = Number(getComputedStyle(cards.board.node).zIndex);
        const lastZ = Number(getComputedStyle(bar).zIndex) - 2;
        let topZ = firstZ;
        Object.entries(cards).forEach(([id, { node, head, handles }]) => {
            const [minWidth, minHeight] = MIN_SIZE[id];
            node.addEventListener('pointerdown', () => {
                topZ = topZ >= lastZ ? firstZ : topZ + 1;
                node.style.zIndex = topZ;
            });
            head.addEventListener('pointerdown', (e) => {
                if (e.button !== 0 || e.target.closest('wa-button, button, input')) {
                    return;
                }
                const from = { x: node.offsetLeft, y: node.offsetTop };
                trackPointer(e, head, (dx, dy) => {
                    // The whole card stays on the desk, the same rule `layout` applies after a reload or a window resize.
                    node.style.left = `${Math.max(0, Math.min(desk.clientWidth - node.offsetWidth, from.x + dx))}px`;
                    node.style.top = `${Math.max(0, Math.min(desk.clientHeight - node.offsetHeight, from.y + dy))}px`;
                }, (didMove) => {
                    if (didMove) {
                        keepPlace(id, node);
                        saveCard(desk, id, node);
                    }
                });
            });
            handles.forEach((handle, i) => {
                const edges = Object.values(RESIZE_HANDLES)[i];
                handle.addEventListener('pointerdown', (e) => {
                    if (e.button !== 0) {
                        return;
                    }
                    const from = { x: node.offsetLeft, y: node.offsetTop, w: node.offsetWidth, h: node.offsetHeight };
                    trackPointer(e, handle, (dx, dy) => {
                        if (edges.includes('right')) {
                            node.style.width = `${Math.max(minWidth, from.w + dx)}px`;
                        }
                        if (edges.includes('bottom')) {
                            setHeight(node, Math.max(minHeight, from.h + dy));
                        }
                        // The left and top edges move, and the opposite edge stays where it was; neither passes the desk's edge.
                        if (edges.includes('left')) {
                            const width = Math.min(from.x + from.w, Math.max(minWidth, from.w - dx));
                            node.style.width = `${width}px`;
                            node.style.left = `${from.x + from.w - width}px`;
                        }
                        if (edges.includes('top')) {
                            const height = Math.min(from.y + from.h, Math.max(minHeight, from.h - dy));
                            setHeight(node, height);
                            node.style.top = `${from.y + from.h - height}px`;
                        }
                    }, (didMove) => {
                        if (didMove) {
                            // A card resized from its left or top edge has a place of its own, kept like a moved card's.
                            if (edges.includes('left') || edges.includes('top')) {
                                keepPlace(id, node);
                            }
                            saveCard(desk, id, node);
                        }
                    });
                });
            });
        });
    }

    // ---- The board in its card ----------------------------------------------------------------------------------------

    // The cell size the board is drawn at; the - and + buttons step it from here.
    let cellPx = null;

    // The box inside the body's padding (desk.css), which is the room the board has.
    function bodyRoom(body) {
        const style = getComputedStyle(body);
        return {
            w: body.clientWidth - parseFloat(style.paddingLeft) - parseFloat(style.paddingRight),
            h: body.clientHeight - parseFloat(style.paddingTop) - parseFloat(style.paddingBottom)
        };
    }

    // Redrawing the board can change the room it has (a scrollbar going, the layout settling), so the fit repeats until
    // the room it was made for is the room that is left, at most FIT_PASSES times.
    function fitBoard(boardBody) {
        for (let pass = 0; pass < FIT_PASSES; pass++) {
            const room = bodyRoom(boardBody);
            const w = room.w - BOARD_FRAME_PX;
            const h = room.h - BOARD_FRAME_PX;
            if (w < MIN_FIT_BOX_PX || h < MIN_FIT_BOX_PX) {
                return;
            }
            cellPx = engine.fitBoard(w, h);
            const after = bodyRoom(boardBody);
            if (after.w === room.w && after.h === room.h) {
                return;
            }
        }
    }

    function zoomBoard(steps) {
        if (cellPx === null) {
            return;
        }
        const { min, max } = engine.CELL_SIZE_RANGE;
        cellPx = clamp(cellPx + steps * ZOOM_STEP_PX, min, max);
        engine.setCellSize(cellPx);
    }

    // ---- The Rules card's text size ---------------------------------------------------------------------------------

    const clamp = (value, min, max) => Math.max(min, Math.min(max, value));

    // The default size lives in the stylesheet, so the buttons read the size back from the page rather than from a
    // constant. A kept size this code did not write is said in the console and the default is used.
    function showRulesText({ cards, rulesText }) {
        const { min, max } = RULES_TEXT_RANGE_PX;
        const raw = localStorage.getItem(RULES_TEXT_KEY);
        const kept = raw === null ? null : Number(raw);
        const isUsable = kept !== null && Number.isFinite(kept) && kept >= min && kept <= max;
        if (raw !== null && !isUsable) {
            console.warn(`${RULES_TEXT_KEY} is ${JSON.stringify(raw)}, not a size from ${min} to ${max}; the default size is used.`);
        }
        cards.rules.body.style.fontSize = isUsable ? `${kept}px` : '';
        const shown = parseFloat(getComputedStyle(cards.rules.body).fontSize);
        rulesText.smaller.disabled = shown <= min;
        rulesText.bigger.disabled = shown >= max;
    }

    function stepRulesText(desk, steps) {
        const { min, max, step } = RULES_TEXT_RANGE_PX;
        const shown = parseFloat(getComputedStyle(desk.cards.rules.body).fontSize);
        localStorage.setItem(RULES_TEXT_KEY, String(clamp(shown + steps * step, min, max)));
        showRulesText(desk);
    }

    // Resolves to `{ bar, cards, relayout, resetLayout, fit }` once the desk is built, for the files that fill the bar and the
    // cards.
    window.deskReady = engine.ready.then(() => {
        const desk = build(engine.getInfo());
        engine.mount(desk.cards.board.body);
        layout(desk);
        const relayout = () => layout(desk);
        // A window resize never re-runs the fit. A fitted layout nobody has changed goes back to variant L's fixed layout,
        // which restacks for the new window; a layout the solver made keeps its cards, each by its nearer edges.
        window.addEventListener('resize', () => {
            if (isFitted) {
                isFitted = false;
                saved = {};
            }
            relayout();
        });
        makeMovable(desk.bar, desk.desk, desk.cards);
        // Every card back to the layout fitted to the window and puzzle, and the Rules text to its default size.
        const resetLayout = () => {
            saved = {};
            fitPending = true;
            localStorage.removeItem(LAYOUT_KEY);
            localStorage.removeItem(RULES_TEXT_KEY);
            showRulesText(desk);
            relayout();
        };
        desk.resetButton.addEventListener('click', resetLayout);
        showRulesText(desk);
        desk.rulesText.smaller.addEventListener('click', () => stepRulesText(desk, -1));
        desk.rulesText.bigger.addEventListener('click', () => stepRulesText(desk, 1));
        desk.zoom.out.addEventListener('click', () => zoomBoard(-1));
        desk.zoom.in.addEventListener('click', () => zoomBoard(1));
        desk.zoom.fit.addEventListener('click', () => fitBoard(desk.cards.board.body));
        // Fires once on observe, which is the first fit, and again whenever the card changes size: a refit drops any zoom.
        // The card is watched, not its body, since a scrollbar appearing narrows the body and would undo the zoom at once.
        new ResizeObserver(() => fitBoard(desk.cards.board.body)).observe(desk.cards.board.node);
        return { bar: desk.bar, cards: desk.cards, relayout, resetLayout, fit };
    });
    // A failed load needs no second report: main.js shows its error dialog. Anything else that stopped the desk is thrown
    // again, so it shows as a page error.
    window.deskReady.catch((error) => engine.ready.then(() => { throw error; }, () => {}));
})();
