// The solve page: the top bar and the desk of cards, built once `engine` has the puzzle loaded. Reaches Penpa only
// through `engine` (test/ui-boundary.test.mjs fails otherwise).
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

    function build(info) {
        const bar = el('header', { class: 'ui-bar' }, [
            el('span', { class: 'ui-brand' }, ['ChinStrap']),
            el('h1', { class: 'ui-title' }, [info.title || 'Untitled']),
            el('span', { class: 'ui-author' }, [info.author ? `by ${info.author}` : '']),
            el('span', { class: 'ui-spacer' })
        ]);
        const desk = el('div', { class: 'ui-desk' });
        const cards = {};
        Object.entries(CARD_TITLES).forEach(([id, title]) => {
            const body = el('div', { class: 'ui-body' });
            const head = el('div', { class: 'ui-head' }, [el('h2', {}, [title])]);
            cards[id] = {
                body,
                head,
                node: el('section', { class: `ui-card ui-card-${id}`, 'aria-label': title }, [head, body])
            };
            desk.append(cards[id].node);
        });
        // textContent, and pre-wrap in the CSS: the rules are text, never HTML.
        cards.rules.body.textContent = info.rules || 'No rules in this link.';
        const root = el('div', { class: 'ui-root' }, [bar, desk]);
        document.body.append(root);
        return { bar, desk, cards };
    }

    // Puts every card at its default place for the desk's current size.
    function layout({ desk, cards }) {
        const width = desk.clientWidth;
        const height = desk.clientHeight;
        const columnWidth = Math.max(MIN_COLUMN_WIDTH_PX,
            Math.min(COLUMN_WIDTH_PX, Math.floor((width - 4 * DESK_MARGIN_PX - MIN_BOARD_WIDTH_PX) / 2)));
        const leftX = DESK_MARGIN_PX;
        const boardX = leftX + columnWidth + DESK_MARGIN_PX;
        const rightX = width - DESK_MARGIN_PX - columnWidth;
        const position = (id, x, y, w) => {
            const style = cards[id].node.style;
            style.left = `${x}px`;
            style.top = `${y}px`;
            style.width = `${w}px`;
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
        cards.board.node.style.height = `${Math.max(MIN_BOARD_WIDTH_PX, height - 2 * TOP_MARGIN_PX)}px`;
    }

    function fitBoard(boardBody) {
        const w = boardBody.clientWidth - 2 * BOARD_PADDING_PX;
        const h = boardBody.clientHeight - 2 * BOARD_PADDING_PX;
        if (w >= MIN_FIT_BOX_PX && h >= MIN_FIT_BOX_PX) {
            engine.fitBoard(w, h);
        }
    }

    // Resolves to `{ bar, cards, relayout }` once the desk is built, for the files that fill the bar and the cards. A failed load shows its
    // own error dialog (main.js), so a rejected `ready` needs no second report.
    window.deskReady = engine.ready.then(() => {
        const desk = build(engine.getInfo());
        engine.mount(desk.cards.board.body);
        layout(desk);
        window.addEventListener('resize', () => layout(desk));
        // Fires once on observe, which is the first fit, and again whenever the card's body changes size.
        new ResizeObserver(() => fitBoard(desk.cards.board.body)).observe(desk.cards.board.body);
        return { bar: desk.bar, cards: desk.cards, relayout: () => layout(desk) };
    });
    window.deskReady.catch(() => {});
})();
