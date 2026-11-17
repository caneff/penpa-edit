// The solve page: the top bar and the desk of cards, built once `engine` has the puzzle loaded. Every card moves by its
// title bar and resizes by any edge or corner; one layout is kept in localStorage, with the Rules card's text size beside
// it: the places of the cards the solver moved hold for every puzzle, the cards' sizes only for the puzzle they were set on.
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
    // A press moves or resizes a card only once the pointer has gone this far, so a click on a header changes nothing.
    const DRAG_THRESHOLD_PX = 4;
    // While the window keeps changing size, a fitted layout is fitted again only once it has stopped for this long.
    const REFIT_DELAY_MS = 150;
    // Rules takes at most this share of the left column when Mouse needs the rest for its rows (Chris, 2026-11-17).
    const RULES_SHARE = 0.55;
    // The widest a side column grows to with the desk's spare width.
    const SIDE_COLUMN_MAX_PX = 640;
    // The side cards' text grows with a desk wider and taller than this, in step with the tighter of the two, up to
    // TEXT_SCALE_MAX times its size; a wide but short desk has no height for bigger text.
    const TEXT_SCALE_FROM = { w: 1600, h: 900 };
    const TEXT_SCALE_MAX = 1.5;
    // The least room between the top bar's heading and its first control.
    const HEADING_GAP_PX = 12;
    // The step of the board card's - and + buttons, in pixels per cell.
    const ZOOM_STEP_PX = 4;
    // The smallest a card is dragged to, [width, height].
    const MIN_SIZE = { board: [240, 200], mouse: [260, 140], pins: [240, 110], mode: [280, 170], recent: [240, 80], rules: [200, 80] };
    // The Rules card's own text size, kept beside the layout and cleared with it. Pixels; the - and + buttons step it.
    const RULES_TEXT_KEY = 'chinstrap-solve-rules-text-v1';
    const RULES_TEXT_RANGE_PX = { min: 10, max: 28, step: 2 };
    // Set to MOUSE_CLOSED when the solver closed the Mouse card. Kept apart from the layout, so Reset layout leaves it closed.
    const MOUSE_CLOSED_KEY = 'chinstrap-solve-mouse-closed-v1';
    const MOUSE_CLOSED = '1';
    // Each resize handle by name, with the edges of the card it moves. `desk.css` places and styles each by the same name.
    const RESIZE_HANDLES = {
        top: ['top'], right: ['right'], bottom: ['bottom'], left: ['left'],
        'top-left': ['top', 'left'], 'top-right': ['top', 'right'], 'bottom-right': ['bottom', 'right'], 'bottom-left': ['bottom', 'left']
    };

    // Variant L's arrangement, which the fitted layout sizes: Rules over Mouse on the left (#181), the Board between,
    // Pinned, Mode and Recent on the right.
    const LEFT_COLUMN = ['rules', 'mouse'];
    const RIGHT_COLUMN = ['pins', 'mode', 'recent'];
    const CARD_TITLES = { board: 'Board', mouse: 'Mouse', rules: 'Rules', pins: 'Pinned', mode: 'Mode', recent: 'Recent' };
    // Reset layout's icon: a desk of three panes, unlike Restart's circular arrow beside it.
    const RESET_LAYOUT_ICON = '<rect x="1.5" y="2.5" width="13" height="11" rx="1.5"/><path d="M6.5 2.5v11M6.5 8h8"/>';

    function el(tag, attrs = {}, children = []) {
        const node = document.createElement(tag);
        Object.entries(attrs).forEach(([name, value]) => node.setAttribute(name, value));
        node.append(...children);
        return node;
    }

    let tooltipCount = 0;

    // Shows `text` while the pointer is over `node`; returns the tooltip, whose text can be changed. Web Awesome finds the
    // node by id, so the tooltip lives in the body and the node stays the one element its callers append.
    function addTooltip(node, text) {
        node.id ||= `ui-tooltip-target-${++tooltipCount}`;
        const tooltip = el('wa-tooltip', { for: node.id }, [text]);
        document.body.append(tooltip);
        return tooltip;
    }

    // A button showing a 16x16 line icon (`icon` is its SVG markup, drawn in currentColor), naming itself `label` to
    // screen readers and on hover, the hover label with its keyboard `shortcut` when it has one. `show(icon, label)`
    // swaps the icon and both labels, and does nothing when that icon is already shown.
    function iconButton(icon, label, onClick, shortcut = null) {
        const node = el('wa-button', { appearance: 'filled', variant: 'neutral', size: 's' });
        const text = el('span', { class: 'ui-sr-only' });
        node.append(text);
        node.addEventListener('click', onClick);
        const tooltip = addTooltip(node, '');
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
            tooltip.textContent = shortcut ? `${nextLabel} (${shortcut})` : nextLabel;
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
        const bar = el('header', { class: 'ui-bar' }, [
            el('div', { class: 'ui-heading' }, [
                el('h1', { class: 'ui-title' }, [info.title || 'Untitled']),
                el('span', { class: 'ui-author' }, [info.author ? `by ${info.author}` : ''])
            ]),
            el('span', { class: 'ui-spacer' })
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
        // A card header's button: `content` is what it shows, `label` its name to screen readers when it differs, and
        // `hoverLabel` what it shows on hover, the label unless given.
        const headButton = (content, label, hoverLabel = label) => {
            const node = el('wa-button', { appearance: 'filled', variant: 'neutral', size: 's' },
                label ? [el('span', { 'aria-hidden': 'true' }, [content]), el('span', { class: 'ui-sr-only' }, [label])] : [content]);
            addTooltip(node, hoverLabel);
            return node;
        };
        const zoom = {
            out: headButton('\u2212', 'Zoom out'),
            in: headButton('+', 'Zoom in'),
            fit: headButton('Fit', null, 'Fit board')
        };
        cards.board.head.append(el('span', { class: 'ui-zoom' }, [zoom.out, zoom.in, zoom.fit]));
        const rulesText = { smaller: headButton('\u2212', 'Smaller rules text'), bigger: headButton('+', 'Bigger rules text') };
        const closeMouse = headButton('\u00d7', 'Close Mouse card');
        closeMouse.classList.add('ui-close');
        cards.mouse.head.append(closeMouse);
        cards.rules.head.append(el('span', { class: 'ui-rules-text' }, [rulesText.smaller, rulesText.bigger]));
        // textContent, and pre-wrap in the CSS: the rules are text, never HTML.
        cards.rules.body.textContent = info.rules || 'No rules in this link.';
        const root = el('div', { class: 'ui-root' }, [bar, desk]);
        document.body.append(root);
        return { bar, desk, cards, zoom, rulesText, closeMouse };
    }

    // ---- The kept layout --------------------------------------------------------------------------------------------

    // Per card id: `w`, `h` (set once the card was resized; `h` only when its height was set) and `x`, `y`, `vw`, `vh` (set
    // once it was dragged, or by the fitted layout: where it sat, in a desk of `vw` x `vh`). A card with a place keeps its
    // gap to the nearer edges when the desk changes size, so zooming the browser out and back in returns the same layout.
    // `puzzle` beside the cards names the puzzle the sizes were set on (`engine.getPuzzleId()`).
    function readLayout() {
        let saved;
        try {
            saved = JSON.parse(localStorage.getItem(LAYOUT_KEY));
        } catch (e) {
            // An unreadable layout is only card places, cheap to redo: the desk opens on the fitted one, and the next card
            // moved or resized replaces it. Said in the console, so the loss is never silent.
            console.warn(`${LAYOUT_KEY} is unreadable (${e.message}); the fitted layout is used, and the next change replaces it.`);
            return { layout: {}, puzzle: undefined };
        }
        // A card entry this code did not write (another version's, or edited by hand) is left out, as is any other key.
        const isNumbers = (entry) => entry && typeof entry === 'object' && Object.values(entry).every(Number.isFinite);
        const layout = {};
        Object.keys(CARD_TITLES).forEach((id) => {
            if (isNumbers(saved?.[id])) {
                layout[id] = saved[id];
            }
        });
        return { layout, puzzle: saved?.puzzle };
    }

    let saved = {};
    // The places of the cards the solver moved on another puzzle, put back once the fit has sized the cards for this one.
    let placesKept = null;

    // The kept layout as this puzzle opens it: whole when its sizes were set on this puzzle, else only the places the solver
    // gave cards, the sizes left to the fit.
    function openLayout() {
        const { layout, puzzle } = readLayout();
        if (puzzle === engine.getPuzzleId()) {
            saved = layout;
            return;
        }
        const places = Object.entries(layout).filter(([, entry]) => entry.x !== undefined && !entry.fitted)
            .map(([id, { x, y, vw, vh }]) => [id, { x, y, vw, vh }]);
        placesKept = places.length ? Object.fromEntries(places) : null;
    }

    function writeLayout() {
        localStorage.setItem(LAYOUT_KEY, JSON.stringify({ ...saved, puzzle: engine.getPuzzleId() }));
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

    // `mouseCardHeight`: the Mouse card's whole height that fits every tool's rows at a card width. `sizeMouseBody`: sizes its body
    // again, for when it opens. Both set by whoever knows its content. Until `mouseCardHeight` is set the desk keeps variant L's fixed layout.
    const fit = { mouseCardHeight: null, sizeMouseBody: null };
    // True until the fit pass has run for the desk as it was opened or last reset.
    let fitPending = true;
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

    const isShown = (cards, id) => !cards[id].node.hidden;
    const shownIds = (cards, ids = Object.keys(cards)) => ids.filter((id) => isShown(cards, id));

    // The cards from the top of the column down, each CARD_GAP_PX below the one above it. A closed card takes no room.
    function stack(cards, ids, x, width) {
        let y = TOP_MARGIN_PX;
        shownIds(cards, ids).forEach((id) => {
            position(cards, id, x, y, width);
            y += cards[id].node.offsetHeight + CARD_GAP_PX;
        });
    }

    // Puts every card at its place for the desk's current size: the fitted layout for a desk with none kept, else each
    // card's kept size and, if it was moved, its kept place, the default for one never touched. Every card ends inside
    // the desk, shrunk (to its minimum at most) if need be.
    function layout({ desk, cards }) {
        const width = desk.clientWidth;
        const height = desk.clientHeight;
        desk.style.setProperty('--ui-text-scale', clamp(Math.min(width / TEXT_SCALE_FROM.w, height / TEXT_SCALE_FROM.h), 1, TEXT_SCALE_MAX));
        // Heights first, so a card the solver made taller pushes the ones below it in its column.
        shownIds(cards).forEach((id) => {
            const { node } = cards[id];
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
            if (placesKept) {
                const places = placesKept;
                placesKept = null;
                putBack(desk, cards, places);
            }
            return;
        }
        const columnWidth = columnWidthFor(width);
        const rightX = width - DESK_MARGIN_PX - columnWidth;
        const boardX = DESK_MARGIN_PX + columnWidth + DESK_MARGIN_PX;
        stack(cards, LEFT_COLUMN, DESK_MARGIN_PX, columnWidth);
        stack(cards, RIGHT_COLUMN, rightX, columnWidth);
        position(cards, 'board', boardX, TOP_MARGIN_PX, rightX - DESK_MARGIN_PX - boardX);
        if (!saved.board?.h) {
            setHeight(cards.board.node, Math.max(MIN_SIZE.board[1], height - 2 * TOP_MARGIN_PX));
        }
        keepShownInside(cards, width, height);
    }

    function keepShownInside(cards, width, height) {
        shownIds(cards).forEach((id) => keepInside(id, cards[id].node, width, height));
    }

    // The cards that overlap, each pair as `a/b`.
    function overlappingPairs(cards) {
        const ids = shownIds(cards);
        const box = (id) => cards[id].node.getBoundingClientRect();
        const pairs = new Set();
        ids.forEach((a, i) => ids.slice(i + 1).forEach((b) => {
            const [p, q] = [box(a), box(b)];
            if (p.left < q.right && q.left < p.right && p.top < q.bottom && q.top < p.bottom) {
                pairs.add(`${a}/${b}`);
            }
        }));
        return pairs;
    }

    // Cards put over each other by a smaller window or by places kept from another puzzle, not by the solver: the Board card
    // narrows into the room between the cards beside it, and when that leaves an overlap, or too narrow a board, the desk
    // is fitted again. `before` holds the pairs that already overlapped, which stay.
    function repairOverlaps(desk, cards, before) {
        const isNew = () => [...overlappingPairs(cards)].filter((pair) => !before.has(pair));
        if (!isNew().length) {
            return;
        }
        const board = cards.board.node;
        let left = board.offsetLeft;
        let right = left + board.offsetWidth;
        isNew().filter((pair) => pair.split('/').includes('board')).forEach((pair) => {
            const other = cards[pair.split('/').find((id) => id !== 'board')].node;
            if (other.offsetLeft + other.offsetWidth / 2 < (left + right) / 2) {
                left = Math.max(left, other.offsetLeft + other.offsetWidth + DESK_MARGIN_PX);
            } else {
                right = Math.min(right, other.offsetLeft - DESK_MARGIN_PX);
            }
        });
        if (right - left >= MIN_SIZE.board[0]) {
            Object.assign(board.style, { left: `${left}px`, width: `${right - left}px` });
        }
        if (isNew().length) {
            saved = {};
            fitPending = true;
            layout({ desk, cards });
        }
    }

    // The places in `places` (card id to `x`, `y`, `vw`, `vh`) given to the fitted cards they name, as places of the solver's.
    function putBack(desk, cards, places) {
        isFitted = false;
        shownIds(cards, Object.keys(places)).forEach((id) => {
            const { fitted, ...size } = saved[id];
            saved[id] = { ...size, ...places[id] };
            keepInside(id, cards[id].node, desk.clientWidth, desk.clientHeight);
        });
        repairOverlaps(desk, cards, new Set());
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

    // Unlike `position`, which gives a card its kept width, this sets every size itself.
    function place(cards, id, x, y, w, h) {
        Object.assign(cards[id].node.style, { left: `${x}px`, top: `${y}px`, width: `${w}px` });
        setHeight(cards[id].node, h);
    }

    // The Rules card's height in a left column `width` wide: its whole text, unless Mouse then could not show its rows (the
    // tallest of the puzzle's tools); then the room Mouse leaves, but never less than RULES_SHARE of the column. Mouse keeps at
    // least its minimum. With Mouse closed, the whole column.
    function rulesHeightFor(cards, width, columnHeight) {
        if (!isShown(cards, 'mouse')) {
            return columnHeight;
        }
        const room = columnHeight - CARD_GAP_PX;
        const most = Math.max(room - fit.mouseCardHeight(width), Math.floor(RULES_SHARE * columnHeight));
        return clamp(Math.min(rulesCardHeight(cards.rules, width), most), MIN_SIZE.rules[1], room - MIN_SIZE.mouse[1]);
    }

    // Rules over Mouse in the left column, Mouse taking what Rules leaves; Rules alone takes the whole column.
    function placeLeftColumn(cards, x, width, rulesHeight, columnHeight) {
        place(cards, 'rules', x, TOP_MARGIN_PX, width, rulesHeight);
        if (isShown(cards, 'mouse')) {
            place(cards, 'mouse', x, TOP_MARGIN_PX + rulesHeight + CARD_GAP_PX, width, columnHeight - CARD_GAP_PX - rulesHeight);
        }
    }

    // Closing or opening Mouse after the solver changed another card: Rules and Mouse, if neither was moved or resized
    // themselves, share the left column again, at the fitted layout's width and place.
    function refitLeftColumn(desk, cards) {
        const rules = saved.rules;
        if (!rules?.fitted || (saved.mouse && !saved.mouse.fitted)) {
            return;
        }
        const columnHeight = desk.clientHeight - 2 * TOP_MARGIN_PX;
        placeLeftColumn(cards, rules.x, rules.w, rulesHeightFor(cards, rules.w, columnHeight), columnHeight);
        keepFitted(desk, cards, shownIds(cards, LEFT_COLUMN));
    }

    // The layout that suits the puzzle on screen (#156). The cap on the Board card leaves the left column its minimum and the
    // right column its default width, which the ruling keeps; width the board does not need widens the side columns (#199).
    // Kept in memory, and written only when a card is moved or resized. A zoom the solver set is kept.
    function fitCards(desk, cards) {
        const width = desk.clientWidth;
        const height = desk.clientHeight;
        const columnHeight = height - 2 * TOP_MARGIN_PX;
        const leftMin = columnMinWidth(LEFT_COLUMN);
        let rightWidth = Math.max(columnWidthFor(width), columnMinWidth(RIGHT_COLUMN));

        const boardMax = Math.max(MIN_SIZE.board[0], width - 4 * DESK_MARGIN_PX - leftMin - rightWidth);
        const board = cards.board;
        board.node.style.width = `${boardMax}px`;
        setHeight(board.node, Math.max(MIN_SIZE.board[1], columnHeight));
        const zoomedTo = isZoomed ? cellPx : null;
        fitBoard(board.body);
        const drawnWidth = board.body.firstElementChild.getBoundingClientRect().width;
        const boardWidth = clamp(Math.ceil(drawnWidth) + board.node.offsetWidth - bodyRoom(board.body).w, MIN_SIZE.board[0], boardMax);
        if (zoomedTo !== null) {
            zoomBoardTo(zoomedTo);
        }

        const leftMax = Math.max(leftMin, width - 4 * DESK_MARGIN_PX - boardWidth - rightWidth);
        const hasMouse = isShown(cards, 'mouse');
        const neededHeight = (w) => (hasMouse ? fit.mouseCardHeight(w) + CARD_GAP_PX : 0) + rulesCardHeight(cards.rules, w);
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
        // Width left beside the board widens both side columns alike, up to SIDE_COLUMN_MAX_PX, before it becomes gaps.
        const sideRoom = width - 4 * DESK_MARGIN_PX - boardWidth;
        const widest = (w) => Math.max(w, SIDE_COLUMN_MAX_PX);
        const halfRoom = Math.floor(sideRoom / 2);
        rightWidth = clamp(sideRoom - clamp(halfRoom, leftWidth, widest(leftWidth)), rightWidth, widest(rightWidth));
        leftWidth = clamp(sideRoom - rightWidth, leftWidth, widest(leftWidth));
        const rulesHeight = rulesHeightFor(cards, leftWidth, columnHeight);

        // The spare width in four gaps a pixel apart at most, none under DESK_MARGIN_PX.
        const spare = width - boardWidth - leftWidth - rightWidth;
        const gapsUpTo = (n) => Math.max(n * DESK_MARGIN_PX, Math.round(n * spare / 4));
        const leftX = gapsUpTo(1);
        const boardX = leftWidth + gapsUpTo(2);
        const rightX = leftWidth + boardWidth + gapsUpTo(3);
        stack(cards, RIGHT_COLUMN, rightX, rightWidth);
        place(cards, 'board', boardX, TOP_MARGIN_PX, boardWidth, Math.max(MIN_SIZE.board[1], columnHeight));
        placeLeftColumn(cards, leftX, leftWidth, rulesHeight, columnHeight);
        keepShownInside(cards, width, height);
        keepFitted(desk, cards, shownIds(cards));
    }

    // Records the cards `ids` where the fitted layout has them, as places of their own marked `fitted`, which the solver's
    // first move or resize of that card clears (saveCard writes a new entry).
    function keepFitted(desk, cards, ids) {
        ids.forEach((id) => {
            const node = cards[id].node;
            saved[id] = { w: node.offsetWidth, x: node.offsetLeft, y: node.offsetTop, vw: desk.clientWidth, vh: desk.clientHeight, fitted: 1 };
            if (node.classList.contains('is-sized')) {
                saved[id].h = node.offsetHeight;
            }
        });
    }

    // A right-column card that changes height after the layout (its controls rendering, a tool with more options) moves
    // the cards below it, while the solver has moved or resized none of the column's cards: they stay stacked top-down,
    // none over another (#181). Never while the solver drags, which would undo the drag's resize.
    function restackRight(desk, cards) {
        if (isDragging) {
            return;
        }
        if (RIGHT_COLUMN.every((id) => saved[id]?.fitted)) {
            const x = cards[RIGHT_COLUMN[0]].node.offsetLeft;
            stack(cards, RIGHT_COLUMN, x, cards[RIGHT_COLUMN[0]].node.offsetWidth);
            // keepInside reads each card's kept place, so the new one is kept first and again once it has been clamped.
            keepFitted(desk, cards, RIGHT_COLUMN);
            RIGHT_COLUMN.forEach((id) => keepInside(id, cards[id].node, desk.clientWidth, desk.clientHeight));
            keepFitted(desk, cards, RIGHT_COLUMN);
        } else if (RIGHT_COLUMN.every((id) => !isMoved(id))) {
            layout({ desk, cards });
        }
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

    // ---- The top bar's heading ----------------------------------------------------------------------------------------

    // The title and author sit at the bar's centre; where that would reach the controls, at the bar's left end; and where
    // they still reach them there, the controls are made smaller (#181). The title is never cut short.
    function placeHeading(bar) {
        const heading = bar.querySelector('.ui-heading');
        const controls = [...bar.children].filter((node) => node !== heading && !node.matches('.ui-spacer') && node.offsetWidth > 0);
        const isClear = () => heading.getBoundingClientRect().right + HEADING_GAP_PX <=
            Math.min(...controls.map((node) => node.getBoundingClientRect().left));
        bar.classList.remove('is-heading-left', 'is-compact');
        if (isClear()) {
            return;
        }
        bar.classList.add('is-heading-left');
        if (!isClear()) {
            bar.classList.add('is-compact');
        }
    }

    // Places the heading again whenever the bar, the heading or the controls change size. The spacer takes the room the
    // controls leave, so it changes size with any control, one added later included.
    function watchHeading(bar) {
        const resized = new ResizeObserver(() => placeHeading(bar));
        [bar, bar.querySelector('.ui-heading'), bar.querySelector('.ui-spacer')].forEach((node) => resized.observe(node));
    }

    // ---- Moving, resizing and raising ---------------------------------------------------------------------------------

    // True while the solver moves or resizes a card.
    let isDragging = false;

    // Runs `onMove(dx, dy)` for a pointer drag begun by `event` on `target`, once it has gone DRAG_THRESHOLD_PX, and
    // `onEnd(didMove)` when it ends.
    function trackPointer(event, target, onMove, onEnd) {
        isDragging = true;
        event.preventDefault();
        event.stopPropagation();
        const startX = event.clientX;
        const startY = event.clientY;
        let didMove = false;
        target.setPointerCapture(event.pointerId);
        const move = (e) => {
            const [dx, dy] = [e.clientX - startX, e.clientY - startY];
            didMove ||= Math.hypot(dx, dy) >= DRAG_THRESHOLD_PX;
            if (didMove) {
                onMove(dx, dy);
            }
        };
        const end = () => {
            target.removeEventListener('pointermove', move);
            target.removeEventListener('pointerup', end);
            target.removeEventListener('pointercancel', end);
            isDragging = false;
            onEnd(didMove);
        };
        target.addEventListener('pointermove', move);
        target.addEventListener('pointerup', end);
        target.addEventListener('pointercancel', end);
    }

    // Cards raised by a press (on the body, the header or a resize handle) stack above the others, from the cards' own z-index
    // up to two below the top bar's, one short of a card with an open picker list (desk.css).
    function makeMovable(bar, desk, cards) {
        const firstZ = Number(getComputedStyle(cards.board.node).zIndex);
        const lastZ = Number(getComputedStyle(bar).zIndex) - 2;
        let topZ = firstZ;
        Object.entries(cards).forEach(([id, { node, head, handles }]) => {
            const [minWidth, minHeight] = MIN_SIZE[id];
            // In the capture phase, since a drag's own handler stops the press from bubbling.
            node.addEventListener('pointerdown', () => {
                topZ = topZ >= lastZ ? firstZ : topZ + 1;
                node.style.zIndex = topZ;
            }, { capture: true });
            head.addEventListener('pointerdown', (e) => {
                if (e.button !== 0 || e.target.closest('wa-button, button, input')) {
                    return;
                }
                const from = { x: node.offsetLeft, y: node.offsetTop };
                trackPointer(e, head, (dx, dy) => {
                    node.classList.add('is-dragging');
                    // The whole card stays on the desk, EDGE_MARGIN_PX in from its edges where the card leaves room for that.
                    const within = (value, room) => Math.max(0, Math.min(Math.max(EDGE_MARGIN_PX, value), room - EDGE_MARGIN_PX));
                    node.style.left = `${within(from.x + dx, desk.clientWidth - node.offsetWidth)}px`;
                    node.style.top = `${within(from.y + dy, desk.clientHeight - node.offsetHeight)}px`;
                }, (didMove) => {
                    node.classList.remove('is-dragging');
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
                        // Every edge stops at the desk's edge; a moving left or top edge keeps the opposite edge where it was.
                        if (edges.includes('right')) {
                            node.style.width = `${Math.max(minWidth, Math.min(desk.clientWidth - from.x, from.w + dx))}px`;
                        }
                        if (edges.includes('bottom')) {
                            setHeight(node, Math.max(minHeight, Math.min(desk.clientHeight - from.y, from.h + dy)));
                        }
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
    // True from the solver's first - or + until Fit (or a layout reset) refits the board.
    let isZoomed = false;
    // The Board card's - and + buttons, which are disabled at the cell-size limits.
    let zoomButtons = null;
    // The cursor's cell as the last change saw it (read when the desk opens, so the starting cell is not a move), and
    // whether it has moved since (until it has, the cursor is Penpa+'s starting cell, not a place the solver chose).
    let cursorCell = null;
    let hasCursorMoved = false;

    // The box inside the body's padding (desk.css), which is the room the board has.
    function bodyRoom(body) {
        const style = getComputedStyle(body);
        return {
            w: body.clientWidth - parseFloat(style.paddingLeft) - parseFloat(style.paddingRight),
            h: body.clientHeight - parseFloat(style.paddingTop) - parseFloat(style.paddingBottom)
        };
    }

    function showZoomLimits() {
        const { min, max } = engine.CELL_SIZE_RANGE;
        zoomButtons.out.disabled = cellPx <= min;
        zoomButtons.in.disabled = cellPx >= max;
    }

    // Redrawing the board can change the room it has (a scrollbar going, the layout settling), so the fit repeats until
    // the room it was made for is the room that is left, at most FIT_PASSES times.
    function fitBoard(boardBody) {
        isZoomed = false;
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
                break;
            }
        }
        showZoomLimits();
    }

    // Scrolls the Board card's body so the cursor's cell is in view: only when it is not, or always (centred) with `centre`.
    function showCursor(boardBody, centre) {
        const focus = engine.getFocusRect();
        if (!focus) {
            return;
        }
        const box = boardBody.getBoundingClientRect();
        const left = box.left + boardBody.clientLeft;
        const top = box.top + boardBody.clientTop;
        const visible = { left, top, right: left + boardBody.clientWidth, bottom: top + boardBody.clientHeight };
        const isInside = focus.left >= visible.left && focus.right <= visible.right && focus.top >= visible.top && focus.bottom <= visible.bottom;
        if (isInside && !centre) {
            return;
        }
        boardBody.scrollLeft += (focus.left + focus.right - visible.left - visible.right) / 2;
        boardBody.scrollTop += (focus.top + focus.bottom - visible.top - visible.bottom) / 2;
    }

    // Follows the cursor when it moves to a cell the card does not show.
    function followCursor(boardBody) {
        const focus = engine.getFocusRect();
        const cell = focus ? focus.cell : null;
        if (cell === cursorCell) {
            return;
        }
        cursorCell = cell;
        hasCursorMoved = true;
        showCursor(boardBody, false);
    }

    function zoomBoardTo(px) {
        const { min, max } = engine.CELL_SIZE_RANGE;
        cellPx = clamp(px, min, max);
        isZoomed = true;
        engine.setCellSize(cellPx);
        showZoomLimits();
    }

    function zoomBoard(boardBody, steps) {
        if (cellPx === null) {
            return;
        }
        zoomBoardTo(cellPx + steps * ZOOM_STEP_PX);
        if (hasCursorMoved) {
            showCursor(boardBody, true);
        }
    }

    // ---- The Rules card's text size ---------------------------------------------------------------------------------

    const clamp = (value, min, max) => Math.max(min, Math.min(max, value));

    // The size before the desk's text scale (desk.css's --ui-rules-text). The default lives in the stylesheet, so the buttons
    // read it back from the page rather than from a constant.
    const rulesTextSize = (body) => parseFloat(getComputedStyle(body).getPropertyValue('--ui-rules-text'));

    // A kept size this code did not write is said in the console and the default is used.
    function showRulesText({ cards, rulesText }) {
        const { min, max } = RULES_TEXT_RANGE_PX;
        const raw = localStorage.getItem(RULES_TEXT_KEY);
        const kept = raw === null ? null : Number(raw);
        const isUsable = kept !== null && Number.isFinite(kept) && kept >= min && kept <= max;
        if (raw !== null && !isUsable) {
            console.warn(`${RULES_TEXT_KEY} is ${JSON.stringify(raw)}, not a size from ${min} to ${max}; the default size is used.`);
        }
        cards.rules.body.style.setProperty('--ui-rules-text', isUsable ? `${kept}px` : '');
        const shown = rulesTextSize(cards.rules.body);
        rulesText.smaller.disabled = shown <= min;
        rulesText.bigger.disabled = shown >= max;
    }

    function stepRulesText(desk, steps) {
        const { min, max, step } = RULES_TEXT_RANGE_PX;
        const shown = rulesTextSize(desk.cards.rules.body);
        localStorage.setItem(RULES_TEXT_KEY, String(clamp(shown + steps * step, min, max)));
        showRulesText(desk);
    }

    // Resolves to `{ bar, cards, relayout, resetLayout, fit, isMouseClosed, setMouseClosed }` once the desk is built, for the files that fill the bar and the
    // cards.
    window.deskReady = engine.ready.then(() => {
        const desk = build(engine.getInfo());
        desk.cards.mouse.node.hidden = localStorage.getItem(MOUSE_CLOSED_KEY) === MOUSE_CLOSED;
        engine.mount(desk.cards.board.body);
        openLayout();
        fitPending = Object.keys(saved).length === 0;
        layout(desk);
        const relayout = () => layout(desk);
        // A fitted layout nobody has changed is fitted again, so a window resized and back gets the layout a reload would: at
        // the first resize, and while the window keeps changing only kept inside it, once more when it stops. A layout the
        // solver made keeps its cards, each by its nearer edges, and is mended where the smaller window put cards over each other.
        let refitTimer = null;
        let isRefitOwed = false;
        const refit = () => {
            saved = {};
            fitPending = true;
            relayout();
        };
        window.addEventListener('resize', () => {
            if (isFitted) {
                if (refitTimer === null) {
                    refit();
                } else {
                    relayout();
                    isRefitOwed = true;
                }
                clearTimeout(refitTimer);
                refitTimer = setTimeout(() => {
                    refitTimer = null;
                    if (isRefitOwed && isFitted) {
                        refit();
                    }
                    isRefitOwed = false;
                }, REFIT_DELAY_MS);
                return;
            }
            const before = overlappingPairs(desk.cards);
            relayout();
            repairOverlaps(desk.desk, desk.cards, before);
        });
        makeMovable(desk.bar, desk.desk, desk.cards);
        watchHeading(desk.bar);
        const restack = new ResizeObserver(() => restackRight(desk.desk, desk.cards));
        RIGHT_COLUMN.forEach((id) => restack.observe(desk.cards[id].node));
        // Every card back to the layout fitted to the window and puzzle, and the Rules text to its default size.
        const resetLayout = () => {
            saved = {};
            placesKept = null;
            isZoomed = false;
            fitPending = true;
            localStorage.removeItem(LAYOUT_KEY);
            localStorage.removeItem(RULES_TEXT_KEY);
            showRulesText(desk);
            relayout();
        };
        const isMouseClosed = () => desk.cards.mouse.node.hidden;
        // Closing or opening Mouse refits a layout nobody has changed, so Rules takes the column or gives Mouse its split back.
        const setMouseClosed = (closed) => {
            if (closed) {
                localStorage.setItem(MOUSE_CLOSED_KEY, MOUSE_CLOSED);
            } else {
                localStorage.removeItem(MOUSE_CLOSED_KEY);
            }
            desk.cards.mouse.node.hidden = closed;
            if (!closed) {
                fit.sizeMouseBody?.();
            }
            // A full refit fits the board again, which drops a zoom the solver set; the left column alone leaves the board be.
            if (isFitted && !isZoomed) {
                isFitted = false;
                saved = {};
                fitPending = true;
            } else {
                refitLeftColumn(desk.desk, desk.cards);
            }
            relayout();
        };
        desk.closeMouse.addEventListener('click', (e) => {
            setMouseClosed(true);
            // A key press closed it, so the keyboard user keeps a control to stand on; a mouse click hands the keyboard back (keys.js).
            if (e.detail === 0) {
                (desk.rulesText.smaller.disabled ? desk.rulesText.bigger : desk.rulesText.smaller).focus();
            }
        });
        const resetButton = iconButton(RESET_LAYOUT_ICON, 'Reset layout', resetLayout).node;
        resetButton.classList.add('ui-reset');
        desk.bar.append(resetButton);
        showRulesText(desk);
        desk.rulesText.smaller.addEventListener('click', () => stepRulesText(desk, -1));
        desk.rulesText.bigger.addEventListener('click', () => stepRulesText(desk, 1));
        const boardBody = desk.cards.board.body;
        zoomButtons = desk.zoom;
        desk.zoom.out.addEventListener('click', () => zoomBoard(boardBody, -1));
        desk.zoom.in.addEventListener('click', () => zoomBoard(boardBody, 1));
        desk.zoom.fit.addEventListener('click', () => fitBoard(boardBody));
        cursorCell = engine.getFocusRect()?.cell ?? null;
        engine.on('change', () => followCursor(boardBody));
        // Fires once on observe, which is the first fit, and again whenever the card changes size: a refit, unless the solver
        // zoomed, which only Fit or a layout reset drops. The card is watched, not its body, since a scrollbar appearing
        // narrows the body and would undo the zoom at once.
        new ResizeObserver(() => {
            if (!isZoomed) {
                fitBoard(boardBody);
            }
        }).observe(desk.cards.board.node);
        return { bar: desk.bar, cards: desk.cards, relayout, resetLayout, fit, isMouseClosed, setMouseClosed };
    });
    // A failed load needs no second report: main.js shows its error dialog. Anything else that stopped the desk is thrown
    // again, so it shows as a page error.
    window.deskReady.catch((error) => engine.ready.then(() => { throw error; }, () => {}));
})();
