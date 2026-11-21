// The solve page: the top bar and the desk of cards, built once `engine` has the puzzle loaded. Every card moves by its
// title bar and resizes by any edge or corner; one layout is kept in localStorage, with the Rules card's text size beside
// it: the places of the cards the solver moved hold for every puzzle, the cards' sizes only for the puzzle they were set on.
// Also `window.uiKit`, the element builders and the colour helper the UI files share. Reaches Penpa+ only through `engine`
// (test/ui-boundary.test.mjs fails otherwise).
(function () {
    'use strict';

    const { puzzleHash } = window;

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
    const MIN_SIZE = { board: [240, 200], mouse: [260, 140], pins: [240, 110], mode: [280, 170], recent: [240, 56], rules: [200, 80] };
    // The Rules card's own text size, kept beside the layout and cleared with it. Pixels; the - and + buttons step it.
    const RULES_TEXT_KEY = 'chinstrap-solve-rules-text-v1';
    const RULES_TEXT_RANGE_PX = { min: 10, max: 20, step: 2 };
    // The cards the solver can close, in the Cards menu's order. Each is kept closed per browser in its own key, set to
    // CARD_CLOSED, apart from the layout, so Reset layout leaves it closed (#183, #334). Mouse's key is still #183's.
    const CLOSEABLE_CARDS = ['rules', 'mouse', 'pins', 'mode', 'recent'];
    const closedKey = (id) => `chinstrap-solve-${id}-closed-v1`;
    const CARD_CLOSED = '1';
    // Set to COORDINATES_SHOWN when the solver turned on the board coordinates (#249, #250). The key keeps #249's name, so a setting made then holds.
    const COORDINATES_KEY = 'chinstrap-solve-grid-numbers-v1';
    const COORDINATES_SHOWN = '1';
    // Set to GRID_NUMBERING_ALL when the solver turned "Number the grid only" off (#348); it is on until then.
    const GRID_NUMBERING_KEY = 'chinstrap-solve-number-grid-only-v1';
    const GRID_NUMBERING_ALL = 'all';
    // Each resize handle by name, with the edges of the card it moves. `desk.css` places and styles each by the same name.
    // What every resize handle says on hover: a double-click on it makes the axes it resizes automatic again (#252).
    const FIT_TOOLTIP = 'Double-click to fit automatically';
    const RESIZE_HANDLES = {
        top: ['top'], right: ['right'], bottom: ['bottom'], left: ['left'],
        'top-left': ['top', 'left'], 'top-right': ['top', 'right'], 'bottom-right': ['bottom', 'right'], 'bottom-left': ['bottom', 'left']
    };

    // Variant L's arrangement, which the fitted layout sizes: Rules over Mouse on the left (#181), the Board between,
    // Pinned, Mode and Recent on the right.
    const LEFT_COLUMN = ['rules', 'mouse'];
    // The cards a stream fit puts in the side box, top to bottom; Rules and Recent are not on the desk then.
    const STREAM_SIDE_CARDS = ['pins', 'mode', 'mouse'];
    const STREAM_HIDDEN_CARDS = ['rules', 'recent'];
    const RIGHT_COLUMN = ['pins', 'mode', 'recent'];
    const CARD_TITLES = { board: 'Board', mouse: 'Mouse', rules: 'Rules', pins: 'Pinned', mode: 'Mode', recent: 'Recent' };

    function el(tag, attrs = {}, children = []) {
        const node = document.createElement(tag);
        Object.entries(attrs).forEach(([name, value]) => node.setAttribute(name, value));
        node.append(...children);
        return node;
    }

    // A rules line that starts a list item: its marker, then the text. The marker is its own flex item so a wrapped line
    // hangs under the text and not under the marker, whatever the marker's width.
    const RULES_MARKER = /^(\s*(?:[-\u2022*]|\d{1,2}[.)])\s+)([\s\S]*)$/;
    const RULES_URL = /https?:\/\/[^\s<>"]+/g;
    // Sentence punctuation that ends a URL's surrounding text and not the URL.
    const URL_TRAILING = /[.,;:!?\]'"]+$/;
    const countOf = (text, char) => text.split(char).length - 1;

    // The URL without the punctuation after it; a closing ")" stays when the URL opened one.
    function trimUrl(url) {
        let trimmed = url;
        for (let previous = ''; previous !== trimmed;) {
            previous = trimmed;
            trimmed = trimmed.replace(URL_TRAILING, '');
            if (trimmed.endsWith(')') && countOf(trimmed, ')') > countOf(trimmed, '(')) {
                trimmed = trimmed.slice(0, -1);
            }
        }
        return trimmed;
    }

    // Appends `text` to `parent` with each http(s) URL as a link that opens in a new tab. Every node is made with
    // textContent and setAttribute, so the rules never become HTML.
    function appendWithLinks(parent, text) {
        let last = 0;
        for (const match of text.matchAll(RULES_URL)) {
            const url = trimUrl(match[0]);
            parent.append(text.slice(last, match.index));
            const link = el('a', { href: url, target: '_blank', rel: 'noopener noreferrer' });
            link.textContent = url;
            parent.append(link);
            last = match.index + url.length;
        }
        parent.append(text.slice(last));
    }

    const isRulesEmpty = (rulesCard) => rulesCard.querySelector('.ui-body').classList.contains('ui-rules-empty');

    // A card's height is kept when the solver sized it, except the Rules card of a link with no rules: its one-line height
    // belongs to that link, and the layout is shared by every puzzle.
    const keepsHeight = (id, node) => node.classList.contains('is-sized') && !(id === 'rules' && isRulesEmpty(node));

    // The Rules card's body: one block per line, and a note when the link carries no rules.
    function showRules(body, rules) {
        const isEmpty = !rules?.trim();
        body.classList.toggle('ui-rules-empty', isEmpty);
        if (isEmpty) {
            body.textContent = 'No rules in this link.';
            return;
        }
        body.replaceChildren(...rules.split('\n').map((text) => {
            const line = el('div', { class: 'ui-rules-line' });
            const [, marker, rest] = text.match(RULES_MARKER) || [];
            if (marker === undefined) {
                appendWithLinks(line, text);
            } else {
                line.classList.add('ui-rules-item');
                const markerNode = el('span', { class: 'ui-rules-marker' });
                markerNode.textContent = marker;
                const textNode = el('span', { class: 'ui-rules-item-text' });
                appendWithLinks(textNode, rest);
                line.append(markerNode, textNode);
            }
            return line;
        }));
    }

    let tooltipCount = 0;

    // Shows `text` while the pointer is over `node`; returns the tooltip, whose text can be changed. Web Awesome finds the
    // node by id, so the tooltip lives in the body and the node stays the one element its callers append.
    function addTooltip(node, text) {
        node.id ||= `ui-tooltip-target-${++tooltipCount}`;
        const tooltip = el('wa-tooltip', { for: node.id }, [text]);
        engine.ignoreChangesIn(tooltip);
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

    // A button showing `text`, with `tooltip` on hover.
    function textButton(text, tooltip, onClick) {
        const node = el('wa-button', { appearance: 'filled', variant: 'neutral', size: 's' }, [text]);
        node.addEventListener('click', onClick);
        addTooltip(node, tooltip);
        return { node };
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

    // The dark theme is a `wa-dark` class on the page, for Web Awesome, and a `ui-dark` class on the root of what the UI draws.
    function setDark(root, dark) {
        document.documentElement.classList.toggle('wa-dark', dark);
        root.classList.toggle('ui-dark', dark);
    }

    // WCAG's relative luminance of an opaque CSS colour. A canvas reads any such colour back as #rrggbb.
    const colourReader = document.createElement('canvas').getContext('2d');
    function luminance(colour) {
        colourReader.fillStyle = colour;
        const [r, g, b] = [1, 3, 5].map((i) => {
            const s = parseInt(colourReader.fillStyle.slice(i, i + 2), 16) / 255;
            return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
        });
        return 0.2126 * r + 0.7152 * g + 0.0722 * b;
    }

    // The part of a scrolling box that shows: its padding box, in viewport coordinates.
    function visibleBox(node) {
        const box = node.getBoundingClientRect();
        const left = box.left + node.clientLeft;
        const top = box.top + node.clientTop;
        return { left, top, right: left + node.clientWidth, bottom: top + node.clientHeight };
    }

    window.uiKit = { el, iconButton, textButton, onDeskReady, confirmDialog, setDark, luminance, visibleBox };

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
            // A native tooltip: a Web Awesome one on each of the 48 handles slowed every tool change, since each is laid out
            // again with the page.
            const handles = Object.keys(RESIZE_HANDLES).map((name) =>
                el('div', { class: `ui-resize ui-resize-${name}`, 'data-testid': `resize-${name}`, title: FIT_TOOLTIP }));
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
        const closeButtons = Object.fromEntries(CLOSEABLE_CARDS.map((id) => {
            const button = headButton('\u00d7', `Close ${CARD_TITLES[id]} card`);
            button.classList.add('ui-close');
            cards[id].head.append(button);
            return [id, button];
        }));
        cards.rules.head.append(el('span', { class: 'ui-rules-text' }, [rulesText.smaller, rulesText.bigger]));
        showRules(cards.rules.body, info.rules);
        const root = el('div', { class: 'ui-root' }, [bar, desk]);
        engine.ignoreChangesIn(root);
        document.body.append(root);
        return { bar, desk, cards, zoom, rulesText, closeButtons };
    }

    // ---- The kept layout --------------------------------------------------------------------------------------------

    // Per card id: `w`, `h` (set once the card was resized; `h` only when its height was set) and `x`, `y`, `vw`, `vh` (set
    // once it was dragged, or by the fitted layout: where it sat, in a desk of `vw` x `vh`). A card with a place keeps its
    // gap to the nearer edges when the desk changes size, so zooming the browser out and back in returns the same layout.
    // `fitted` marks an entry the fitted layout wrote. Otherwise `hw` and `hh` are 1 for the axes the solver resized and
    // `placed` 1 once the solver dragged the card by its header.
    // `puzzle` beside the cards names the puzzle the sizes were set on (`puzzleHash()`).
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
        if (puzzle === puzzleHash()) {
            saved = layout;
            return;
        }
        const places = Object.entries(layout).filter(([, entry]) => entry.x !== undefined && !entry.fitted)
            .map(([id, { x, y, vw, vh }]) => [id, { x, y, vw, vh }]);
        placesKept = places.length ? Object.fromEntries(places) : null;
    }

    // While a stream fit is on, the kept layout is the solver's alone: no write or removal reaches it (#314).
    function writeLayout() {
        if (!isStreaming()) {
            localStorage.setItem(LAYOUT_KEY, JSON.stringify({ ...saved, puzzle: puzzleHash() }));
        }
    }

    // Drops the kept layout, and with `withRulesText` the Rules text size kept beside it.
    function forgetLayout(withRulesText = false) {
        if (isStreaming()) {
            return;
        }
        localStorage.removeItem(LAYOUT_KEY);
        if (withRulesText) {
            localStorage.removeItem(RULES_TEXT_KEY);
        }
    }

    const isMoved = (id) => saved[id]?.x !== undefined;

    // The left edge on a desk `deskWidth` wide of a card `width` wide whose kept entry has a place: the kept left edge, or for
    // a card that sat in the desk's right half, the kept gap to the right edge.
    const anchoredLeft = (entry, deskWidth, width) =>
        (entry.x + entry.w / 2 > entry.vw / 2 ? deskWidth - (entry.vw - entry.x - entry.w) - width : entry.x);

    // Whether the solver set a card's width (`hw`), height (`hh`) or place (`placed`) by hand. An entry written before #252
    // carries no such flag: its size was the solver's, and its place too once it had one.
    const isByHand = (entry, flag) => Boolean(entry && !entry.fitted && (entry[flag] ?? (flag !== 'placed' || entry.x !== undefined)));
    const isAutomatic = (entry) => ['hw', 'hh', 'placed'].every((flag) => !isByHand(entry, flag));

    // Records the card's size, and its place when it was moved, as it is now; `resized` names the axes ('w', 'h') the
    // solver just dragged and `placed` whether the card itself was dragged.
    function saveCard(desk, id, node, { resized = [], placed = false } = {}) {
        isFitted = false;
        const before = saved[id];
        const entry = {
            w: node.offsetWidth,
            hw: Number(resized.includes('w') || isByHand(before, 'hw')),
            hh: Number(resized.includes('h') || isByHand(before, 'hh')),
            placed: Number(placed || isByHand(before, 'placed'))
        };
        if (keepsHeight(id, node)) {
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

    // `mouseCardHeight` and `modeCardHeight`: the Mouse and Mode cards' whole heights that fit every tool they are sized for at
    // a card width. `sizeMouseBody`: sizes the Mouse card's body again, for when it opens. `pinsCardHeightAtTwoRows`: the Pinned
    // card's height with its chips in two rows, or its own height when they already take more. Each set by whoever knows
    // the card's content. Until `mouseCardHeight` is set the desk keeps variant L's fixed layout.
    const fit = { mouseCardHeight: null, modeCardHeight: null, sizeMouseBody: null, pinsCardHeightAtTwoRows: null };
    // True until the fit pass has run for the desk as it was opened or last reset.
    let fitPending = true;
    // While a stream fit is on, `streamRefit({ board })` lays the desk out for the stream again, the board fitted again only with
    // `board`, and takes the place of every layout of the solver's. Nothing leaves a stream fit until the page is reloaded.
    let streamRefit = null;
    const isStreaming = () => streamRefit !== null;

    // Drops the layout in memory, so the next `layout` fits the desk to the window and puzzle.
    function startFit() {
        saved = {};
        fitPending = true;
    }
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
            if (saved[id]?.h && !(id === 'rules' && isRulesEmpty(node))) {
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

    // A card's box on the desk; and whether two boxes (these, or DOMRects) overlap.
    const boxOf = (node) => ({ left: node.offsetLeft, top: node.offsetTop, right: node.offsetLeft + node.offsetWidth, bottom: node.offsetTop + node.offsetHeight });
    const boxesMeet = (p, q) => p.left < q.right && q.left < p.right && p.top < q.bottom && q.top < p.bottom;

    // The cards that overlap: a map from a key naming the pair to the pair's two card ids.
    function overlappingPairs(cards) {
        const ids = shownIds(cards);
        const box = (id) => cards[id].node.getBoundingClientRect();
        const pairs = new Map();
        ids.forEach((a, i) => ids.slice(i + 1).forEach((b) => {
            if (boxesMeet(box(a), box(b))) {
                pairs.set(`${a}/${b}`, [a, b]);
            }
        }));
        return pairs;
    }

    // Cards put over each other by a smaller window or by places kept from another puzzle, not by the solver: the Board card
    // narrows into the room between the cards beside it, and when that leaves an overlap, or too narrow a board, the desk
    // is fitted again, as on a fresh desk: the kept layout goes too, so a reload opens on the same one. `before` holds the
    // pairs (`overlappingPairs`) that already overlapped, which stay.
    function repairOverlaps(desk, cards, before) {
        const isNew = () => [...overlappingPairs(cards)].filter(([key]) => !before.has(key)).map(([, pair]) => pair);
        if (!isNew().length) {
            return;
        }
        const board = cards.board.node;
        let left = board.offsetLeft;
        let right = left + board.offsetWidth;
        isNew().filter((pair) => pair.includes('board')).forEach((pair) => {
            const other = cards[pair.find((id) => id !== 'board')].node;
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
            startFit();
            forgetLayout();
            layout({ desk, cards });
        }
    }

    // The places in `places` (card id to `x`, `y`, `vw`, `vh`) given to the fitted cards they name, as places of the solver's.
    function putBack(desk, cards, places) {
        isFitted = false;
        shownIds(cards, Object.keys(places)).forEach((id) => {
            const { fitted, ...size } = saved[id];
            saved[id] = { ...size, ...places[id], hw: 0, hh: 0, placed: 1 };
            keepInside(id, cards[id].node, desk.clientWidth, desk.clientHeight);
        });
        repairOverlaps(desk, cards, new Map());
    }

    const columnMinWidth = (ids) => Math.max(MIN_COLUMN_WIDTH_PX, ...ids.map((id) => MIN_SIZE[id][0]));

    // The height the Rules card needs to show its whole text at `cardWidth`, measured in a hidden copy of its body.
    function rulesCardHeight({ node, body }, cardWidth) {
        const probe = el('div', { class: body.className });
        probe.append(...[...body.childNodes].map((child) => child.cloneNode(true)));
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

    // The Rules card's height in a left column `width` wide: all the room Mouse leaves when Mouse shows its rows (the tallest
    // of the tools it is sized for), so neither card leaves a gap at the bottom; where that is less than its text, Rules
    // keeps up to RULES_SHARE of the column (Chris, 2026-11-17). Mouse keeps at least its minimum. With Mouse closed, the
    // whole column. A link with no rules leaves Rules one line tall.
    function rulesHeightFor(cards, width, columnHeight) {
        if (isRulesEmpty(cards.rules.node)) {
            return rulesCardHeight(cards.rules, width);
        }
        if (!isShown(cards, 'mouse')) {
            return columnHeight;
        }
        const room = columnHeight - CARD_GAP_PX;
        const kept = Math.min(rulesCardHeight(cards.rules, width), Math.floor(RULES_SHARE * columnHeight));
        return clamp(Math.max(room - fit.mouseCardHeight(width), kept), MIN_SIZE.rules[1], room - MIN_SIZE.mouse[1]);
    }

    // A card's height with nothing set on it, read and put back in one task, so no ResizeObserver sees the change.
    function naturalHeight(node) {
        const { height } = node.style;
        const wasSized = node.classList.contains('is-sized');
        node.style.height = '';
        node.classList.remove('is-sized');
        const natural = node.offsetHeight;
        node.style.height = height;
        node.classList.toggle('is-sized', wasSized);
        return natural;
    }

    // Pinned at its own height at the top; Mode as tall as its tools need; Recent as tall as its chips (#306), its bottom on
    // the column's bottom, so the room between Mode and Recent stays empty. Where the column has room, Mode sits at its middle, never higher than under a Pinned card
    // whose chips take two rows, so a second row of pins moves neither Mode nor Recent (Chris, 2026-11-17); without the
    // room, the cards stack top-down and Mode gives up height so Recent keeps what it needs, its body scrolling. A closed
    // card takes no room, and with Pinned closed Mode sits at the column's top: the middle only kept room for Pinned's
    // second row (#334, ruled 2026-11-18).
    function placeRightColumn(cards, x, width, columnHeight) {
        const bottom = TOP_MARGIN_PX + columnHeight;
        const hasPins = isShown(cards, 'pins');
        let top = TOP_MARGIN_PX;
        if (hasPins) {
            const pins = cards.pins.node;
            Object.assign(pins.style, { left: `${x}px`, top: `${TOP_MARGIN_PX}px`, width: `${width}px` });
            top += pins.offsetHeight + CARD_GAP_PX;
        }
        const hasRecent = isShown(cards, 'recent');
        const recentNeeds = hasRecent ? Math.max(MIN_SIZE.recent[1], naturalHeight(cards.recent.node)) : 0;
        const recentRoom = hasRecent ? recentNeeds + CARD_GAP_PX : 0;
        if (isShown(cards, 'mode')) {
            const modeHeight = Math.max(MIN_SIZE.mode[1], Math.min(fit.modeCardHeight(width), bottom - top - recentRoom));
            const middle = TOP_MARGIN_PX + Math.round((columnHeight - modeHeight) / 2);
            const underTwoRows = TOP_MARGIN_PX + fit.pinsCardHeightAtTwoRows() + CARD_GAP_PX;
            const wanted = hasPins ? Math.max(middle, underTwoRows) : TOP_MARGIN_PX;
            const modeTop = Math.max(top, Math.min(wanted, bottom - recentRoom - modeHeight));
            place(cards, 'mode', x, modeTop, width, modeHeight);
            top = modeTop + modeHeight + CARD_GAP_PX;
        }
        if (hasRecent) {
            const recentHeight = Math.max(MIN_SIZE.recent[1], Math.min(recentNeeds, bottom - top));
            place(cards, 'recent', x, bottom - recentHeight, width, recentHeight);
        }
    }

    // Rules over Mouse in the left column, Mouse taking what Rules leaves; Rules alone or Mouse alone takes the whole column.
    function placeLeftColumn(cards, x, width, rulesHeight, columnHeight) {
        if (!isShown(cards, 'rules')) {
            place(cards, 'mouse', x, TOP_MARGIN_PX, width, columnHeight);
            return;
        }
        place(cards, 'rules', x, TOP_MARGIN_PX, width, rulesHeight);
        if (isShown(cards, 'mouse')) {
            place(cards, 'mouse', x, TOP_MARGIN_PX + rulesHeight + CARD_GAP_PX, width, columnHeight - CARD_GAP_PX - rulesHeight);
        }
    }

    // A column's cards the solver has moved or resized none of, one of them at least placed by the fitted layout; a card
    // closed when the desk was fitted has no entry, and counts as untouched.
    const isColumnFitted = (ids) => ids.some((id) => saved[id]) && ids.every((id) => !saved[id] || saved[id].fitted);

    // Where such a column sits on the desk as it is now: where a shown card of it is, other than `opening`, which still has the
    // place it had when it closed; else the place the fitted layout gave one of its cards, kept by its nearer edge as
    // `keepInside` keeps it.
    function columnPlace(desk, cards, ids, opening) {
        const live = shownIds(cards, ids).find((id) => id !== opening);
        if (live) {
            return { x: cards[live].node.offsetLeft, w: cards[live].node.offsetWidth };
        }
        const entry = saved[ids.find((id) => saved[id])];
        return { x: anchoredLeft(entry, desk.clientWidth, entry.w), w: entry.w };
    }

    // A card closed or opened (`opening`, when one is) after the solver changed another card: the left column, if the solver
    // moved or resized neither of its cards, is shared again at the fitted layout's width and place. True when it was.
    function refitLeftColumn(desk, cards, opening = null) {
        if (!isColumnFitted(LEFT_COLUMN) || !shownIds(cards, LEFT_COLUMN).length) {
            return false;
        }
        const columnHeight = desk.clientHeight - 2 * TOP_MARGIN_PX;
        const { x, w } = columnPlace(desk, cards, LEFT_COLUMN, opening);
        placeLeftColumn(cards, x, w, isShown(cards, 'rules') ? rulesHeightFor(cards, w, columnHeight) : 0, columnHeight);
        keepFitted(desk, cards, shownIds(cards, LEFT_COLUMN));
        return true;
    }

    // The right column laid out again where the solver has moved or resized none of its cards, `opening` the card just
    // opened, when one was. True when it was.
    function refitRightColumn(desk, cards, opening = null) {
        if (!isColumnFitted(RIGHT_COLUMN) || !shownIds(cards, RIGHT_COLUMN).length) {
            return false;
        }
        const { x, w } = columnPlace(desk, cards, RIGHT_COLUMN, opening);
        placeRightColumn(cards, x, w, desk.clientHeight - 2 * TOP_MARGIN_PX);
        keepFitted(desk, cards, shownIds(cards, RIGHT_COLUMN));
        return true;
    }

    // The resize handle's edges as the axes they resize: 'w' for a left or right edge, 'h' for a top or bottom one.
    const axesOf = (edges) => [...(edges.some((e) => e === 'left' || e === 'right') ? ['w'] : []), ...(edges.some((e) => e === 'top' || e === 'bottom') ? ['h'] : [])];

    // A card's automatic height where it sits, on its own: Mode and Mouse as tall as their tools need, Rules its text, and
    // Board down to the columns' bottom; never past that bottom, nor under the card's minimum. Pinned's
    // automatic height is no height set at all. A Rules card with no rules is one line tall, under its minimum, as
    // `rulesHeightFor` fits it (#288).
    function automaticHeight(desk, cards, id) {
        const { node } = cards[id];
        if (id === 'rules' && isRulesEmpty(node)) {
            return rulesCardHeight(cards.rules, node.offsetWidth);
        }
        const content = { mode: fit.modeCardHeight, mouse: fit.mouseCardHeight, rules: (w) => rulesCardHeight(cards.rules, w) }[id];
        const toBottom = desk.clientHeight - TOP_MARGIN_PX - node.offsetTop;
        return Math.max(minHeightOf(id, cards[id]), Math.min(content ? content(node.offsetWidth) : toBottom, toBottom));
    }

    // Recent off the fitted layout is as tall as its chips, growing upward from its bottom edge as far as the card above it
    // leaves room (#306), the way the fitted layout grows it.
    function setRecentHeight(cards) {
        const { node } = cards.recent;
        const box = boxOf(node);
        const roomTop = Math.max(TOP_MARGIN_PX, ...shownIds(cards, Object.keys(cards).filter((id) => id !== 'recent'))
            .map((id) => boxOf(cards[id].node)).filter((other) => other.bottom <= box.top && other.left < box.right && other.right > box.left)
            .map((other) => other.bottom + CARD_GAP_PX));
        const height = Math.max(MIN_SIZE.recent[1], Math.min(naturalHeight(node), box.bottom - roomTop));
        node.style.top = `${box.bottom - height}px`;
        setHeight(node, height);
    }

    function setAutomaticHeight(desk, cards, id) {
        const { node } = cards[id];
        if (id === 'recent') {
            setRecentHeight(cards);
        } else if (id === 'pins') {
            node.style.height = '';
            node.classList.remove('is-sized');
        } else {
            setHeight(node, automaticHeight(desk, cards, id));
        }
    }

    // A layout the solver changed, once the tools or the window changed: each column the solver left alone is laid out
    // again, and every other card whose height is automatic takes it where it sits (#252).
    function fitAutomatic(desk, cards) {
        const refitted = [...(refitLeftColumn(desk, cards) ? LEFT_COLUMN : []), ...(refitRightColumn(desk, cards) ? RIGHT_COLUMN : [])];
        shownIds(cards).filter((id) => !refitted.includes(id) && saved[id] && !isByHand(saved[id], 'hh')).forEach((id) => {
            setAutomaticHeight(desk, cards, id);
            if (saved[id].fitted) {
                keepFitted(desk, cards, [id]);
            } else {
                saveCard(desk, id, cards[id].node);
            }
        });
    }

    // Gives a card the axes and place the solver set by hand in `kept`, its saved entry, over the fitted layout's; the
    // rest stay as fitted.
    function putByHand(desk, cards, id, kept) {
        const { node } = cards[id];
        if (isByHand(kept, 'hw')) {
            node.style.width = `${kept.w}px`;
        }
        if (isByHand(kept, 'hh') && kept.h !== undefined) {
            setHeight(node, kept.h);
        }
        if (isByHand(kept, 'placed')) {
            saved[id] = kept;
        } else {
            saved[id] = { ...kept, x: node.offsetLeft, y: node.offsetTop, vw: desk.clientWidth, vh: desk.clientHeight };
        }
        keepInside(id, node, desk.clientWidth, desk.clientHeight);
        saveCard(desk, id, node);
    }

    // A double-click on a resize handle makes the axes it resizes automatic again (#252), the way Figma's "Hug contents"
    // returns (research/resize-back-to-auto-2026-11.md); once the card has no size the solver set, its place goes back
    // too. The desk is fitted afresh and only what the solver still holds by hand is put back over it, so a freed axis
    // takes what a fresh load would give it; with nothing held, the kept layout goes, as on Reset layout.
    function fitAxes(desk, cards, id, axes) {
        const entry = saved[id];
        if (!entry || entry.fitted) {
            return;
        }
        const hw = isByHand(entry, 'hw') && !axes.includes('w');
        const hh = isByHand(entry, 'hh') && !axes.includes('h');
        saved[id] = { ...entry, hw: Number(hw), hh: Number(hh), placed: Number(isByHand(entry, 'placed') && (hw || hh)) };
        const byHand = Object.entries(saved).filter(([cardId, other]) => isShown(cards, cardId) && !isAutomatic(other));
        startFit();
        layout({ desk, cards });
        if (!byHand.length) {
            forgetLayout();
            return;
        }
        byHand.forEach(([cardId, kept]) => putByHand(desk, cards, cardId, kept));
    }

    // The layout that suits the puzzle on screen (#156). The cap on the Board card leaves the left column its minimum and the
    // right column its default width, which the ruling keeps; width the board does not need widens the side columns (#199).
    // Kept in memory, and written only when a card is moved or resized. A zoom the solver set is kept.
    function fitCards(desk, cards) {
        const width = desk.clientWidth;
        const height = desk.clientHeight;
        const columnHeight = height - 2 * TOP_MARGIN_PX;
        // A column with every card closed takes no width, and no gap beside the board (#334).
        const hasLeft = shownIds(cards, LEFT_COLUMN).length > 0;
        const hasRight = shownIds(cards, RIGHT_COLUMN).length > 0;
        const gapCount = 2 + Number(hasLeft) + Number(hasRight);
        const leftMin = hasLeft ? columnMinWidth(LEFT_COLUMN) : 0;
        let rightWidth = hasRight ? Math.max(columnWidthFor(width), columnMinWidth(RIGHT_COLUMN)) : 0;

        const boardMax = Math.max(MIN_SIZE.board[0], width - gapCount * DESK_MARGIN_PX - leftMin - rightWidth);
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

        const leftMax = hasLeft ? Math.max(leftMin, width - gapCount * DESK_MARGIN_PX - boardWidth - rightWidth) : 0;
        const hasMouse = isShown(cards, 'mouse');
        const hasRules = isShown(cards, 'rules');
        const neededHeight = (w) => (hasMouse ? fit.mouseCardHeight(w) : 0) + (hasRules ? rulesCardHeight(cards.rules, w) : 0) +
            (hasMouse && hasRules ? CARD_GAP_PX : 0);
        // Both cards only get shorter as they widen, so the narrowest width that fits is found by halving; when none does,
        // the cards take all the width there is.
        let leftWidth = leftMax;
        if (hasLeft && neededHeight(leftMax) <= columnHeight) {
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
        // Width left beside the board widens both side columns alike, up to SIDE_COLUMN_MAX_PX, before it becomes gaps. A
        // column never narrows here; what the left one cannot take of its half goes to the right one, and back.
        const sideRoom = width - gapCount * DESK_MARGIN_PX - boardWidth;
        const widened = (has, current, target) => (has ? clamp(target, current, Math.max(current, SIDE_COLUMN_MAX_PX)) : 0);
        const leftShare = widened(hasLeft, leftWidth, Math.floor(sideRoom / 2));
        rightWidth = widened(hasRight, rightWidth, sideRoom - leftShare);
        leftWidth = widened(hasLeft, leftWidth, sideRoom - rightWidth);

        // The spare width in a gap on each side of every column, a pixel apart at most, none under DESK_MARGIN_PX.
        const spare = width - boardWidth - leftWidth - rightWidth;
        const gapsUpTo = (n) => Math.max(n * DESK_MARGIN_PX, Math.round(n * spare / gapCount));
        const boardGaps = 1 + Number(hasLeft);
        place(cards, 'board', leftWidth + gapsUpTo(boardGaps), TOP_MARGIN_PX, boardWidth, Math.max(MIN_SIZE.board[1], columnHeight));
        if (hasRight) {
            placeRightColumn(cards, leftWidth + boardWidth + gapsUpTo(boardGaps + 1), rightWidth, columnHeight);
        }
        if (hasLeft) {
            placeLeftColumn(cards, gapsUpTo(1), leftWidth, hasRules ? rulesHeightFor(cards, leftWidth, columnHeight) : 0, columnHeight);
        }
        keepShownInside(cards, width, height);
        keepFitted(desk, cards, shownIds(cards));
    }

    // Records the cards `ids` where the fitted layout has them, as places of their own marked `fitted`, which the solver's
    // first move or resize of that card clears (saveCard writes a new entry).
    function keepFitted(desk, cards, ids) {
        ids.forEach((id) => {
            const node = cards[id].node;
            saved[id] = { w: node.offsetWidth, x: node.offsetLeft, y: node.offsetTop, vw: desk.clientWidth, vh: desk.clientHeight, fitted: 1 };
            if (keepsHeight(id, node)) {
                saved[id].h = node.offsetHeight;
            }
        });
    }

    // A right-column card that changes height after the layout (Pinned with another row of chips) lays the column out
    // again, while the solver has moved or resized none of its cards (#181). In a column the solver changed, a card the
    // solver never touched moves down from under the card above it (#199). Never while the solver drags, which would undo
    // the drag's resize. While a stream fit is on, the stream lays the cards out instead.
    function restackRight(desk, cards) {
        if (isDragging) {
            return;
        }
        if (isStreaming()) {
            streamRefit();
            return;
        }
        if (refitRightColumn(desk, cards)) {
            // keepInside reads each card's kept place, which the refit kept, so the clamped place is kept again.
            const shown = shownIds(cards, RIGHT_COLUMN);
            shown.forEach((id) => keepInside(id, cards[id].node, desk.clientWidth, desk.clientHeight));
            keepFitted(desk, cards, shown);
        } else if (RIGHT_COLUMN.every((id) => !isMoved(id))) {
            layout({ desk, cards });
        } else {
            let above = null;
            shownIds(cards, RIGHT_COLUMN).forEach((id) => {
                const { node } = cards[id];
                const clear = above && above.offsetTop + above.offsetHeight + CARD_GAP_PX;
                if (saved[id]?.fitted && clear && node.offsetTop < clear) {
                    node.style.top = `${clear}px`;
                    // Setting `top` alone leaves the card's height running past the desk's bottom.
                    const room = desk.clientHeight - EDGE_MARGIN_PX - clear;
                    if (node.offsetHeight > room) {
                        setHeight(node, Math.max(minHeightOf(id, cards[id]), room));
                    }
                    keepFitted(desk, cards, [id]);
                }
                above = node;
            });
        }
    }

    // Each shown card's height when the cards last changed size, so a card that grows can tell which cards it newly covers.
    const heightsSeen = new Map();


    // A card the desk moved or sized, kept: as fitted while it was, else as the solver's, its flags as they were. One never
    // saved gets no place of its own, which would read as placed by the solver.
    function keepDeskChange(desk, cards, id) {
        const entry = saved[id];
        if (entry?.fitted) {
            keepFitted(desk, cards, [id]);
            return;
        }
        if (entry) {
            keepPlace(id, cards[id].node);
        }
        saveCard(desk, id, cards[id].node);
    }

    // Card `id` grew from the box `was`: each card below it that `was` left clear and that it covers now moves down out from
    // under it to CARD_GAP_PX below it, and in turn moves what it then covers (#288). That holds for a card the solver
    // moved or sized too, its size kept, since the growth, not the solver, closed the gap (an exception to #199's rule,
    // ruled 2026-11-17). A card shrinks only to the room above the desk's bottom; where even its least height has no room,
    // the grown card stops CARD_GAP_PX above it instead.
    function clearBelow(desk, cards, id, was) {
        const grown = cards[id].node;
        shownIds(cards).filter((other) => other !== id).forEach((other) => {
            const { node } = cards[other];
            const box = boxOf(node);
            const now = boxOf(grown);
            if (box.top < was.top || boxesMeet(box, was) || !boxesMeet(box, now)) {
                return;
            }
            const top = now.bottom + CARD_GAP_PX;
            const room = desk.clientHeight - EDGE_MARGIN_PX - top;
            if (room < minHeightOf(other, cards[other])) {
                // Never under its least height, unless it already sat under it (Pinned's natural height can).
                const least = Math.min(minHeightOf(id, cards[id]), was.bottom - was.top);
                setHeight(grown, Math.max(least, box.top - CARD_GAP_PX - now.top));
                heightsSeen.set(id, grown.offsetHeight);
                keepDeskChange(desk, cards, id);
                return;
            }
            if (node.offsetHeight > room) {
                setHeight(node, room);
            }
            node.style.top = `${top}px`;
            heightsSeen.set(other, node.offsetHeight);
            keepDeskChange(desk, cards, other);
            clearBelow(desk, cards, other, box);
        });
    }

    // The cards changed size: each that grew while the solver was not dragging (a pin, a preset's undo line, a tool's
    // option rows) moves the cards it newly covers out from under it. A card that was closed is placed by the layout as
    // it opens, so its first height is no growth.
    function keepGrowthClear(desk, cards) {
        const grown = shownIds(cards).filter((id) => heightsSeen.has(id) && cards[id].node.offsetHeight > heightsSeen.get(id))
            .map((id) => [id, heightsSeen.get(id)]);
        heightsSeen.clear();
        shownIds(cards).forEach((id) => heightsSeen.set(id, cards[id].node.offsetHeight));
        if (isDragging) {
            return;
        }
        grown.forEach(([id, height]) => {
            const { node } = cards[id];
            clearBelow(desk, cards, id, { ...boxOf(node), bottom: node.offsetTop + height });
        });
    }

    // A card's smallest height: MIN_SIZE's, and for Rules at least one line of its text at the size it shows, which the
    // text scale and its own - and + change.
    function minHeightOf(id, { node, body }) {
        if (id !== 'rules') {
            return MIN_SIZE[id][1];
        }
        const style = getComputedStyle(body);
        // A rules line's own least height (desk.css's .ui-rules-line) can exceed the line height.
        const line = Math.max(parseFloat(style.lineHeight), body.firstElementChild ? parseFloat(getComputedStyle(body.firstElementChild).minHeight) || 0 : 0);
        const oneLine = line + parseFloat(style.paddingTop) + parseFloat(style.paddingBottom);
        return Math.max(MIN_SIZE.rules[1], Math.ceil(node.offsetHeight - body.clientHeight + oneLine));
    }

    function keepInside(id, node, deskWidth, deskHeight) {
        const minWidth = MIN_SIZE[id][0];
        const minHeight = minHeightOf(id, { node, body: node.querySelector('.ui-body') });
        const entry = saved[id];
        let x = node.offsetLeft;
        let y = node.offsetTop;
        if (isMoved(id)) {
            // Anchored to the nearer edge of the desk it was saved in, keeping that edge's gap.
            x = anchoredLeft(entry, deskWidth, node.offsetWidth);
            y = entry.y;
            const savedHeight = entry.h ?? node.offsetHeight;
            if (entry.y + savedHeight / 2 > entry.vh / 2) {
                y = deskHeight - (entry.vh - entry.y - savedHeight) - node.offsetHeight;
            }
        }
        // A card may be as wide and as tall as the desk, not less its edge margins: a resize drag reaches the desk's edges,
        // and a card left there must come back from a reload at the same size (#264).
        if (node.offsetWidth > deskWidth) {
            node.style.width = `${Math.max(minWidth, deskWidth)}px`;
        }
        // A card never touched shrinks to the room below its default place; any card shrinks to the desk's size.
        if (!isMoved(id) && y + node.offsetHeight > deskHeight - EDGE_MARGIN_PX) {
            setHeight(node, Math.max(minHeight, deskHeight - EDGE_MARGIN_PX - y));
        }
        if (node.offsetHeight > deskHeight) {
            setHeight(node, Math.max(minHeight, deskHeight));
        }
        node.style.left = `${Math.max(0, Math.min(x, deskWidth - node.offsetWidth))}px`;
        node.style.top = `${Math.max(0, Math.min(y, deskHeight - node.offsetHeight))}px`;
    }

    // ---- The stream fit -----------------------------------------------------------------------------------------------

    // Starts the stream fit: the Rules and Recent cards leave the desk, and `refit` is called wherever the desk would lay
    // itself out.
    function beginStream(cards, refit) {
        streamRefit = refit;
        STREAM_HIDDEN_CARDS.forEach((id) => {
            cards[id].node.hidden = true;
        });
        cards.board.node.classList.add('is-stream');
        drawCoordinates();
    }

    // Pinned, Mode and Mouse stacked in the box `{ left, top, width, height }` of the desk, each at its own height, or all
    // shortened in step down to their least where the box is short. True when they fit the box; the cards never go under their
    // least size, so a box smaller than that has them run past its edge.
    function placeStreamSide(cards, box) {
        const ids = shownIds(cards, STREAM_SIDE_CARDS);
        const width = Math.max(columnMinWidth(ids), box.width);
        ids.forEach((id) => {
            Object.assign(cards[id].node.style, { left: `${box.left}px`, top: `${box.top}px`, width: `${width}px` });
        });
        const wanted = {
            pins: Math.max(MIN_SIZE.pins[1], naturalHeight(cards.pins.node)),
            mode: fit.modeCardHeight(width),
            mouse: fit.mouseCardHeight(width)
        };
        const excess = ids.reduce((sum, id) => sum + wanted[id], 0) + (ids.length - 1) * CARD_GAP_PX - box.height;
        const spare = ids.reduce((sum, id) => sum + wanted[id] - MIN_SIZE[id][1], 0);
        const share = excess > 0 && spare > 0 ? Math.min(1, excess / spare) : 0;
        let top = box.top;
        ids.forEach((id) => {
            const height = Math.round(wanted[id] - share * (wanted[id] - MIN_SIZE[id][1]));
            place(cards, id, box.left, top, width, height);
            top += height + CARD_GAP_PX;
        });
        return width <= box.width && top - CARD_GAP_PX <= box.top + box.height;
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
            const minWidth = MIN_SIZE[id][0];
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
                        saveCard(desk, id, node, { placed: true });
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
                    const minHeight = minHeightOf(id, cards[id]);
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
                            saveCard(desk, id, node, { resized: axesOf(edges) });
                        }
                    });
                });
                handle.addEventListener('dblclick', () => fitAxes(desk, cards, id, axesOf(edges)));
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

    // The Board card's box that holds the canvas, and the layer in it that carries the board coordinates (desk.css gives the
    // box the gutter they sit in, while `ui-coordinates-on` is set).
    let boardBox = null;
    let coordinatesLayer = null;

    const areCoordinatesWanted = () => localStorage.getItem(COORDINATES_KEY) === COORDINATES_SHOWN;
    // The coordinates are drawn when the solver wants them, except while a stream fit is on, which crops to the board.
    const areCoordinatesShown = () => areCoordinatesWanted() && !isStreaming();

    const isGridNumberedOnly = () => localStorage.getItem(GRID_NUMBERING_KEY) !== GRID_NUMBERING_ALL;

    // The width of one gutter the coordinates sit in.
    const coordinatesGutter = () => (boardBox.classList.contains('ui-coordinates-on') ? parseFloat(getComputedStyle(boardBox).paddingLeft) : 0);
    // The room the coordinates take on one axis, which the fit leaves out: a gutter on each side when the grid alone is numbered
    // (it is labelled on all four sides then), else one.
    const coordinatesRoom = () => coordinatesGutter() * (isGridNumberedOnly() ? 2 : 1);

    // A band is about this many cells wide (#250), so a band is one to two cells wide whatever the grid's shape.
    const BAND_CELLS = 1.5;
    const LETTERS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
    // A, B, ... Z, AA, AB, ...: a grid wider than 26 bands runs on as a spreadsheet's columns do.
    const bandName = (i) => (i < LETTERS.length ? '' : bandName(Math.floor(i / LETTERS.length) - 1)) + LETTERS[i % LETTERS.length];

    // 1, 2, 3... at each of `ats` (the labels of a numbered axis), and A, B, C... at each of `ats` (a band axis). A band label is approximate, so it is drawn lighter.
    const numbered = (ats) => ats.map((at, i) => ({ at, text: i + 1, band: false }));
    const lettered = (ats) => ats.map((at, i) => ({ at, text: bandName(i), band: true }));

    // The middles of the equal bands a grid that is not square (#250) is cut into across the grid's bounding box, along one axis.
    function bandMiddles(from, to, area) {
        const count = Math.round((to - from) / (BAND_CELLS * area.cellWidth));
        return Array.from({ length: count }, (_, i) => from + ((i + 0.5) * (to - from)) / count);
    }

    // The labels of a grid that is not square (#250): letters over equal bands across the grid's bounding box, numbers down it, each at its band's middle.
    function bandLabels(area) {
        return {
            columns: lettered(bandMiddles(area.left, area.right, area)),
            rows: bandMiddles(area.top, area.bottom, area).map((at, j) => ({ at, text: j + 1, band: true }))
        };
    }

    // The labels of a grid of horizontal rows (#350): numbers down, one at each row's y, and letters across as `bandLabels` draws them.
    function rowLabels(rows, area) {
        return { columns: lettered(bandMiddles(area.left, area.right, area)), rows: numbered(rows) };
    }

    // The labels of a square-cell grid: its own column and row numbers, on the centre lines of the cells.
    function numberLabels(axes) {
        return { columns: numbered(axes.columns), rows: numbered(axes.rows) };
    }

    // Puts one label per column and row in the gutter outside the canvas, outside any outside clue (a scrolled board slides them over its cells, see stickCoordinates): numbers on a square-cell grid, numbers down and letters across on a grid of horizontal rows, bands on any other.
    function drawCoordinates() {
        const wanted = areCoordinatesShown();
        boardBox.classList.toggle('ui-coordinates-on', wanted);
        boardBox.classList.toggle('ui-coordinates-four-sides', wanted && isGridNumberedOnly());
        coordinatesLayer.replaceChildren();
        if (!wanted) {
            return;
        }
        const axes = engine.getGridAxes({ framedOnly: isGridNumberedOnly() });
        const rows = axes ? null : engine.getGridRows();
        const labels = axes ? numberLabels(axes) : rows ? rowLabels(rows, engine.getGridArea()) : bandLabels(engine.getGridArea());
        const isNumbered = Boolean(axes || rows);
        const box = boardBox.getBoundingClientRect();
        const gutter = coordinatesGutter();
        const label = (axis, side, { text, band }, left, top) => el('span', {
            class: band ? 'ui-grid-coordinate ui-grid-band' : 'ui-grid-coordinate', 'data-axis': axis, 'data-side': side, style: `left:${left}px;top:${top}px`
        }, [String(text)]);
        const sides = [['start', 0]];
        // The far sides repeat the labels of a grid that is numbered alone, on a square-cell grid or a grid of rows; the bands of any other grid are not repeated.
        if (isNumbered && isGridNumberedOnly()) {
            sides.push(['end', 1]);
        }
        coordinatesLayer.append(
            ...sides.flatMap(([side, far]) => labels.columns.map((c) => label('column', side, c, c.at - box.left, gutter / 2 + far * (box.height - gutter)))),
            ...sides.flatMap(([side, far]) => labels.rows.map((r) => label('row', side, r, gutter / 2 + far * (box.width - gutter), r.at - box.top))));
        stickCoordinates();
    }

    // Slides the column labels down and the row labels right by how far the board has scrolled past the card's top and left
    // edges (desk.css reads the two variables), so they stay in view while the cells scroll under them.
    function stickCoordinates() {
        const view = window.uiKit.visibleBox(boardBox.parentElement);
        const box = boardBox.getBoundingClientRect();
        coordinatesLayer.style.setProperty('--ui-stick-x', `${Math.max(0, view.left - box.left)}px`);
        coordinatesLayer.style.setProperty('--ui-stick-y', `${Math.max(0, view.top - box.top)}px`);
        // The far labels slide the other way, up and left, when the board's right and bottom edges are past the card's.
        coordinatesLayer.style.setProperty('--ui-stick-end-x', `${Math.min(0, view.right - box.right)}px`);
        coordinatesLayer.style.setProperty('--ui-stick-end-y', `${Math.min(0, view.bottom - box.bottom)}px`);
    }

    function setGridNumberedOnly(boardBody, only) {
        if (only) {
            localStorage.removeItem(GRID_NUMBERING_KEY);
        } else {
            localStorage.setItem(GRID_NUMBERING_KEY, GRID_NUMBERING_ALL);
        }
        drawCoordinates();
        if (!isZoomed) {
            fitBoard(boardBody);
        }
    }

    function setCoordinatesWanted(boardBody, shown) {
        if (shown) {
            localStorage.setItem(COORDINATES_KEY, COORDINATES_SHOWN);
        } else {
            localStorage.removeItem(COORDINATES_KEY);
        }
        drawCoordinates();
        if (!isZoomed) {
            fitBoard(boardBody);
        }
    }

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
        if (isStreaming()) {
            streamRefit({ board: true });
            return;
        }
        isZoomed = false;
        drawCoordinates();
        for (let pass = 0; pass < FIT_PASSES; pass++) {
            const room = bodyRoom(boardBody);
            const w = room.w - BOARD_FRAME_PX - coordinatesRoom();
            const h = room.h - BOARD_FRAME_PX - coordinatesRoom();
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
        drawCoordinates();
    }

    // Scrolls the Board card's body so the cursor's cell is in view: only when it is not, or always (centred) with `centre`.
    function showCursor(boardBody, centre) {
        const focus = engine.getFocusRect();
        if (!focus) {
            return;
        }
        const visible = window.uiKit.visibleBox(boardBody);
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
        // The stream fit keeps the board where it put it.
        if (cell === cursorCell || isStreaming()) {
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
        drawCoordinates();
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
        const hasNoRules = isRulesEmpty(cards.rules.node);
        // Hidden, not just disabled: a link with no rules has no text to size, and a disabled button fails the contrast check.
        rulesText.smaller.parentElement.hidden = hasNoRules;
        rulesText.smaller.disabled = shown <= min;
        rulesText.bigger.disabled = shown >= max;
    }

    function stepRulesText(desk, steps) {
        const { min, max, step } = RULES_TEXT_RANGE_PX;
        const shown = rulesTextSize(desk.cards.rules.body);
        localStorage.setItem(RULES_TEXT_KEY, String(clamp(shown + steps * step, min, max)));
        showRulesText(desk);
    }

    const isCardClosed = (id) => localStorage.getItem(closedKey(id)) === CARD_CLOSED;

    // Resolves to `{ bar, cards, closeButtons, desk, stream, relayout, resetLayout, fit, fitToTools, closeableCards, isCardClosed, setCardClosed,
    // areCoordinatesWanted, setCoordinatesWanted: (shown) => setCoordinatesWanted(desk.cards.board.body, shown), isGridNumberedOnly,
    // setGridNumberedOnly: (only) => setGridNumberedOnly(desk.cards.board.body, only), fitBoard }` once
    // the desk is built, for the files that fill the bar and the cards. `closeableCards` is `[id, title]` per card the solver can
    // close, in the Cards menu's order, and `closeButtons` each one's header ×, by id. `fitBoard()` fits the board to its card, as Fit does.
    window.deskReady = engine.ready.then(() => {
        const desk = build(engine.getInfo());
        CLOSEABLE_CARDS.forEach((id) => {
            desk.cards[id].node.hidden = isCardClosed(id);
        });
        engine.mount(desk.cards.board.body);
        boardBox = desk.cards.board.body.firstElementChild;
        coordinatesLayer = el('div', { class: 'ui-grid-coordinates', 'aria-hidden': 'true' });
        boardBox.append(coordinatesLayer);
        boardBox.parentElement.addEventListener('scroll', stickCoordinates);
        openLayout();
        fitPending = Object.keys(saved).length === 0;
        layout(desk);
        const relayout = () => (isStreaming() ? streamRefit() : layout(desk));
        // A fitted layout nobody has changed is fitted again, so a window resized and back gets the layout a reload would: at
        // the first resize, and while the window keeps changing only kept inside it, once more when it stops. A layout the
        // solver made keeps its cards, each by its nearer edges, and is mended where the smaller window put cards over each other.
        let refitTimer = null;
        const refit = () => {
            startFit();
            relayout();
        };
        window.addEventListener('resize', () => {
            if (isStreaming()) {
                streamRefit({ board: true });
                return;
            }
            if (isFitted) {
                if (refitTimer === null) {
                    refit();
                } else {
                    relayout();
                }
                clearTimeout(refitTimer);
                refitTimer = setTimeout(() => {
                    refitTimer = null;
                    if (isFitted) {
                        refit();
                    }
                }, REFIT_DELAY_MS);
                return;
            }
            const before = overlappingPairs(desk.cards);
            relayout();
            repairOverlaps(desk.desk, desk.cards, before);
            if (!isFitted) {
                fitAutomatic(desk.desk, desk.cards);
            }
        });
        makeMovable(desk.bar, desk.desk, desk.cards);
        watchHeading(desk.bar);
        const restack = new ResizeObserver(() => restackRight(desk.desk, desk.cards));
        RIGHT_COLUMN.forEach((id) => restack.observe(desk.cards[id].node));
        const growth = new ResizeObserver(() => keepGrowthClear(desk.desk, desk.cards));
        Object.values(desk.cards).forEach(({ node }) => growth.observe(node));
        // Every card back to the layout fitted to the window and puzzle, and the Rules text to its default size.
        const resetLayout = () => {
            startFit();
            placesKept = null;
            isZoomed = false;
            forgetLayout(true);
            showRulesText(desk);
            relayout();
        };
        // The tools Mode and Mouse are sized for changed. Only the side columns' heights depend on them, so the board is not
        // fitted again: a solver stepping through tools outside the pins would redraw it at every step.
        const fitToTools = () => (isStreaming() ? streamRefit() : fitAutomatic(desk.desk, desk.cards));
        // Closing or opening a card refits a layout nobody has changed, so the cards left take its room or give it back. A
        // stream fit keeps Rules and Recent off the desk whatever the solver chose, and lays the desk out itself.
        const setCardClosed = (id, closed) => {
            if (closed) {
                localStorage.setItem(closedKey(id), CARD_CLOSED);
            } else {
                localStorage.removeItem(closedKey(id));
            }
            const before = overlappingPairs(desk.cards);
            desk.cards[id].node.hidden = closed || (isStreaming() && STREAM_HIDDEN_CARDS.includes(id));
            if (id === 'mouse' && !closed) {
                fit.sizeMouseBody?.();
            }
            // A layout the solver changed keeps its other cards: only the card's own column is fitted again, if the solver
            // left that column alone.
            if (!isStreaming()) {
                if (isFitted) {
                    isFitted = false;
                    startFit();
                } else {
                    const refitColumn = LEFT_COLUMN.includes(id) ? refitLeftColumn : refitRightColumn;
                    refitColumn(desk.desk, desk.cards, closed ? null : id);
                }
            }
            relayout();
            // A card opened into a column with no fitted place to give it (every card of it closed before the solver changed
            // the layout) comes back at the default place, which can be over the Board: mended as a window resize mends it.
            if (!isStreaming()) {
                repairOverlaps(desk.desk, desk.cards, before);
            }
        };
        showRulesText(desk);
        desk.rulesText.smaller.addEventListener('click', () => stepRulesText(desk, -1));
        desk.rulesText.bigger.addEventListener('click', () => stepRulesText(desk, 1));
        const boardBody = desk.cards.board.body;
        zoomButtons = desk.zoom;
        desk.zoom.out.addEventListener('click', () => zoomBoard(boardBody, -1));
        desk.zoom.in.addEventListener('click', () => zoomBoard(boardBody, 1));
        desk.zoom.fit.addEventListener('click', () => fitBoard(boardBody));
        cursorCell = engine.getFocusRect()?.cell ?? null;
        engine.on('change', () => {
            followCursor(boardBody);
            drawCoordinates();
        });
        // Fires once on observe, which is the first fit, and again whenever the card changes size: a refit, unless the solver
        // zoomed, which only Fit or a layout reset drops. The card is watched, not its body, since a scrollbar appearing
        // narrows the body and would undo the zoom at once.
        new ResizeObserver(() => {
            if (isStreaming()) {
                return;
            }
            if (!isZoomed) {
                fitBoard(boardBody);
            } else {
                drawCoordinates();
            }
        }).observe(desk.cards.board.node);
        const stream = {
            begin: (refit) => beginStream(desk.cards, refit),
            placeBoard: ({ left, top, width, height }) => place(desk.cards, 'board', left, top, width, height),
            placeSide: (box) => placeStreamSide(desk.cards, box)
        };
        return { bar: desk.bar, cards: desk.cards, closeButtons: desk.closeButtons, desk: desk.desk, stream, relayout, resetLayout, fit, fitToTools,
            closeableCards: CLOSEABLE_CARDS.map((id) => [id, CARD_TITLES[id]]), isCardClosed, setCardClosed, areCoordinatesWanted, setCoordinatesWanted: (shown) => setCoordinatesWanted(desk.cards.board.body, shown),
            isGridNumberedOnly, setGridNumberedOnly: (only) => setGridNumberedOnly(desk.cards.board.body, only), fitBoard: () => fitBoard(boardBody) };
    });
    // A failed load needs no second report: main.js shows its error dialog. Anything else that stopped the desk is thrown
    // again, so it shows as a page error.
    window.deskReady.catch((error) => engine.ready.then(() => { throw error; }, () => {}));
})();
