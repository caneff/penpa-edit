// The solve page: the top bar and the desk of cards, built once `engine` has the puzzle loaded. Every card moves by its
// title bar and resizes by its right edge, bottom edge or corner; one layout for every puzzle is kept in localStorage.
// Reaches Penpa only through `engine` (test/ui-boundary.test.mjs fails otherwise).
(function () {
    'use strict';

    const BAR_HEIGHT_PX = 44;
    const CARD_GAP_PX = 10;
    const DESK_MARGIN_PX = 14;
    const COLUMN_WIDTH_PX = 380;
    const MIN_COLUMN_WIDTH_PX = 240;
    const MIN_BOARD_WIDTH_PX = 300;
    const TOP_MARGIN_PX = 12;
    // The board card's body pads the board by this much on every side.
    const BOARD_PADDING_PX = 8;
    // Below this a card body is a layout in progress, not a box to fit the board to.
    const MIN_FIT_BOX_PX = 40;
    // A card never reaches closer than this to the desk's edge once it has to shrink to stay inside.
    const EDGE_MARGIN_PX = 8;
    const LAYOUT_KEY = 'chinstrap-solve-layout-v1';
    // The engine's cell sizes (engine.setCellSize) and the step of the board card's - and + buttons.
    const MIN_CELL_PX = 12;
    const MAX_CELL_PX = 90;
    const ZOOM_STEP_PX = 4;
    // Cards raised by a click stack above the others, below the top bar (z-index 950).
    const FIRST_Z = 20;
    const LAST_Z = 900;
    // The smallest a card is dragged to, [width, height].
    const MIN_SIZE = { board: [240, 200], mouse: [260, 140], pins: [240, 110], mode: [280, 100], recent: [240, 80], rules: [200, 80] };
    const RESIZE_EDGES = { right: 'resize-right', bottom: 'resize-bottom', corner: 'resize-corner' };

    // Variant L's default layout: Mouse and Rules on the left, the Board between, Pinned, Mode and Recent on the right.
    const LEFT_COLUMN = ['mouse', 'rules'];
    const RIGHT_COLUMN = ['pins', 'mode', 'recent'];
    const CARD_TITLES = { board: 'Board', mouse: 'Mouse', rules: 'Rules', pins: 'Pinned', mode: 'Mode', recent: 'Recent' };

    function el(tag, attrs = {}, children = []) {
        const node = document.createElement(tag);
        Object.entries(attrs).forEach(([name, value]) => node.setAttribute(name, value));
        node.append(...children);
        return node;
    }

    const ICONS = {
        undo: '<path d="M3.5 6.5h6.5a3.5 3.5 0 0 1 0 7H7"/><path d="M6.5 3.5l-3 3 3 3"/>',
        redo: '<path d="M12.5 6.5H6a3.5 3.5 0 0 0 0 7h3"/><path d="M9.5 3.5l3 3-3 3"/>'
    };

    // An icon-only Web Awesome button whose accessible name is `label`. Disabled until the ticket that wires it lands.
    function iconButton(icon, label) {
        const button = el('wa-button', { appearance: 'filled', variant: 'neutral', size: 's', disabled: '' });
        button.innerHTML = '<svg width="16" height="16" viewBox="0 0 16 16" aria-hidden="true" fill="none" stroke="currentColor" ' +
            `stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">${ICONS[icon]}</svg>`;
        button.append(el('span', { class: 'ui-sr-only' }, [label]));
        return button;
    }

    function build(info) {
        const resetButton = el('wa-button', { appearance: 'filled', variant: 'neutral', size: 's' }, ['Reset layout']);
        const bar = el('header', { class: 'ui-bar' }, [
            el('span', { class: 'ui-brand' }, ['ChinStrap']),
            el('h1', { class: 'ui-title' }, [info.title || 'Untitled']),
            el('span', { class: 'ui-author' }, [info.author ? `by ${info.author}` : '']),
            el('span', { class: 'ui-spacer' }),
            iconButton('undo', 'Undo'),
            iconButton('redo', 'Redo'),
            resetButton
        ]);
        const desk = el('div', { class: 'ui-desk' });
        const cards = {};
        Object.entries(CARD_TITLES).forEach(([id, title]) => {
            const body = el('div', { class: 'ui-body' });
            const head = el('div', { class: 'ui-head' }, [el('h2', {}, [title])]);
            const handles = Object.entries(RESIZE_EDGES).map(([edge, testId]) =>
                el('div', { class: `ui-resize ui-resize-${edge}`, 'data-testid': testId }));
            cards[id] = {
                body,
                head,
                handles,
                node: el('section', { class: `ui-card ui-card-${id}`, 'aria-label': title }, [head, body, ...handles])
            };
            desk.append(cards[id].node);
        });
        const zoomButton = (symbol, label) => {
            return el('wa-button', { appearance: 'filled', variant: 'neutral', size: 's' },
                [el('span', { 'aria-hidden': 'true' }, [symbol]), el('span', { class: 'ui-sr-only' }, [label])]);
        };
        const zoom = {
            out: zoomButton('\u2212', 'Zoom out'),
            in: zoomButton('+', 'Zoom in'),
            fit: el('wa-button', { appearance: 'filled', variant: 'neutral', size: 's' }, ['Fit'])
        };
        cards.board.head.append(el('span', { class: 'ui-zoom' }, [zoom.out, zoom.in, zoom.fit]));
        // textContent, and pre-wrap in the CSS: the rules are text, never HTML.
        cards.rules.body.textContent = info.rules || 'No rules in this link.';
        const root = el('div', { class: 'ui-root' }, [bar, desk]);
        document.body.append(root);
        return { desk, cards, zoom, resetButton };
    }

    // ---- The kept layout --------------------------------------------------------------------------------------------

    // Per card id: `w`, `h` (set once the card was resized; `h` only when its height was set) and `x`, `y`, `vw`, `vh` (set
    // once it was dragged: where it sat, in a desk of `vw` x `vh`). A moved card keeps its gap to the nearer edges when the
    // desk changes size, so zooming the browser out and back in returns the same layout.
    function readLayout() {
        let saved;
        try {
            saved = JSON.parse(localStorage.getItem(LAYOUT_KEY));
        } catch (e) {
            return {};
        }
        // A value this code did not write (another version's, or edited by hand) is the same as none.
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

    function setHeight(node, px) {
        node.style.height = `${px}px`;
        node.classList.add('is-sized');
    }

    // ---- Placing the cards ------------------------------------------------------------------------------------------

    // Puts every card at its place for the desk's current size: the default for one never touched, else its kept size
    // and, if it was moved, its kept place. Every card ends inside the desk, shrunk (to its minimum at most) if need be.
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
        const columnWidth = Math.max(MIN_COLUMN_WIDTH_PX,
            Math.min(COLUMN_WIDTH_PX, Math.floor((width - 4 * DESK_MARGIN_PX - MIN_BOARD_WIDTH_PX) / 2)));
        const leftX = DESK_MARGIN_PX;
        const boardX = leftX + columnWidth + DESK_MARGIN_PX;
        const rightX = width - DESK_MARGIN_PX - columnWidth;
        const position = (id, x, y, w) => {
            const style = cards[id].node.style;
            style.left = `${x}px`;
            style.top = `${y}px`;
            style.width = `${saved[id]?.w ?? Math.max(MIN_SIZE[id][0], w)}px`;
        };
        // Share i of n starts at an even fraction of the column's height; a card never starts closer than CARD_GAP_PX
        // below the card above it, so one that outgrows its share pushes the next down.
        const stack = (ids, x) => {
            const columnHeight = height - TOP_MARGIN_PX - CARD_GAP_PX;
            let nextFree = TOP_MARGIN_PX;
            ids.forEach((id, i) => {
                const y = Math.max(TOP_MARGIN_PX + Math.round(i * (columnHeight + CARD_GAP_PX) / ids.length), nextFree);
                position(id, x, y, columnWidth);
                nextFree = y + cards[id].node.offsetHeight + CARD_GAP_PX;
            });
        };
        stack(LEFT_COLUMN, leftX);
        stack(RIGHT_COLUMN, rightX);
        position('board', boardX, TOP_MARGIN_PX, rightX - DESK_MARGIN_PX - boardX);
        if (!saved.board?.h) {
            setHeight(cards.board.node, Math.max(MIN_SIZE.board[1], height - 2 * TOP_MARGIN_PX));
        }
        Object.entries(cards).forEach(([id, { node }]) => keepInside(id, node, width, height));
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

    function makeMovable(desk, cards) {
        let topZ = FIRST_Z;
        Object.entries(cards).forEach(([id, { node, head, handles }]) => {
            const [minWidth, minHeight] = MIN_SIZE[id];
            node.addEventListener('pointerdown', () => {
                topZ = topZ >= LAST_Z ? FIRST_Z : topZ + 1;
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
                        saved[id] = { ...saved[id], x: node.offsetLeft, y: node.offsetTop };
                        saveCard(desk, id, node);
                    }
                });
            });
            handles.forEach((handle, i) => {
                const edge = Object.keys(RESIZE_EDGES)[i];
                handle.addEventListener('pointerdown', (e) => {
                    if (e.button !== 0) {
                        return;
                    }
                    const from = { w: node.offsetWidth, h: node.offsetHeight };
                    trackPointer(e, handle, (dx, dy) => {
                        if (edge !== 'bottom') {
                            node.style.width = `${Math.max(minWidth, from.w + dx)}px`;
                        }
                        if (edge !== 'right') {
                            setHeight(node, Math.max(minHeight, from.h + dy));
                        }
                    }, (didMove) => {
                        if (didMove) {
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

    function fitBoard(boardBody) {
        const w = boardBody.clientWidth - 2 * BOARD_PADDING_PX;
        const h = boardBody.clientHeight - 2 * BOARD_PADDING_PX;
        if (w >= MIN_FIT_BOX_PX && h >= MIN_FIT_BOX_PX) {
            cellPx = engine.fitBoard(w, h);
        }
    }

    function zoomBoard(steps) {
        if (cellPx === null) {
            return;
        }
        cellPx = Math.max(MIN_CELL_PX, Math.min(MAX_CELL_PX, cellPx + steps * ZOOM_STEP_PX));
        engine.setCellSize(cellPx);
    }

    // Resolves to `{ cards, relayout }` once the desk is built, for the files that fill the cards. A failed load shows its
    // own error dialog (main.js), so a rejected `ready` needs no second report.
    window.deskReady = engine.ready.then(() => {
        const desk = build(engine.getInfo());
        engine.mount(desk.cards.board.body);
        layout(desk);
        const relayout = () => layout(desk);
        window.addEventListener('resize', relayout);
        makeMovable(desk.desk, desk.cards);
        desk.resetButton.addEventListener('click', () => {
            saved = {};
            localStorage.removeItem(LAYOUT_KEY);
            relayout();
        });
        desk.zoom.out.addEventListener('click', () => zoomBoard(-1));
        desk.zoom.in.addEventListener('click', () => zoomBoard(1));
        desk.zoom.fit.addEventListener('click', () => fitBoard(desk.cards.board.body));
        // Fires once on observe, which is the first fit, and again whenever the card changes size: a refit drops any zoom.
        // The card is watched, not its body, since a scrollbar appearing narrows the body and would undo the zoom at once.
        new ResizeObserver(() => fitBoard(desk.cards.board.body)).observe(desk.cards.board.node);
        return { cards: desk.cards, relayout };
    });
    window.deskReady.catch(() => {});
})();
