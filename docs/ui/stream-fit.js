// The stream fit (#314): a stream userscript asks the desk, by window messages, to put the board's ink in a box and the Mode,
// Pinned and Mouse cards in another, and the desk answers with the ink's rect. The contract is STREAM-FIT.md. Reaches
// Penpa+ only through `engine` (test/ui-boundary.test.mjs fails otherwise).
(function () {
    'use strict';

    const { onDeskReady } = window.uiKit;

    const READY_TYPE = 'chinstrap:stream-fit-ready';
    const REQUEST_TYPE = 'chinstrap:stream-fit';
    const REPLY_TYPE = 'chinstrap:stream-fit-rect';
    // `data-stream-fit` on the page's root, once the desk answers requests.
    const READY_MARKER = 'ready';
    // The ink moving by less than this (CSS px) is no change.
    const INK_MOVE_PX = 0.5;
    const BOX_KEYS = ['left', 'top', 'width', 'height'];

    // Why `value` is not a box `{ left, top, width, height }` of numbers with a size, or null.
    function boxProblem(name, value) {
        const isBox = value && typeof value === 'object' && BOX_KEYS.every((key) => Number.isFinite(value[key]));
        if (!isBox) {
            return `${name} must be an object with the numbers ${BOX_KEYS.join(', ')}`;
        }
        return value.width > 0 && value.height > 0 ? null : `${name} must have a width and a height over 0`;
    }

    // The part of the viewport box `box` that lies on the desk `deskBox`, in whole pixels inside it.
    function clipToDesk(box, deskBox) {
        const left = Math.max(Math.ceil(box.left), Math.ceil(deskBox.left));
        const top = Math.max(Math.ceil(box.top), Math.ceil(deskBox.top));
        const right = Math.min(Math.floor(box.left + box.width), Math.floor(deskBox.right));
        const bottom = Math.min(Math.floor(box.top + box.height), Math.floor(deskBox.bottom));
        return { left, top, width: right - left, height: bottom - top };
    }

    onDeskReady(({ desk, cards, stream }) => {
        const boardFrame = cards.board.body.firstElementChild;
        let boxes = null;
        // The ink as the last reply gave it.
        let sent = null;
        let isFrameQueued = false;
        // Whether the last layout had the side cards running past their box, so that is said once and not at every change.
        let wasSideShort = false;

        const sameInk = (a, b) => BOX_KEYS.every((key) => Math.abs(a[key] - b[key]) < INK_MOVE_PX);
        const inkNow = () => {
            const ink = engine.getInkRect();
            return { left: ink.left, top: ink.top, width: ink.right - ink.left, height: ink.bottom - ink.top };
        };

        // The ink centred in the board box, and sent.
        function fitBoardInBox(board) {
            boardFrame.style.translate = '';
            engine.fitInk(board.width, board.height);
            const ink = inkNow();
            // Whole pixels, so the canvas is never resampled and stays crisp.
            const dx = Math.round(board.left + (board.width - ink.width) / 2 - ink.left);
            const dy = Math.round(board.top + (board.height - ink.height) / 2 - ink.top);
            boardFrame.style.translate = `${dx}px ${dy}px`;
            sent = { ...ink, left: ink.left + dx, top: ink.top + dy };
            window.postMessage({ type: REPLY_TYPE, rect: sent }, '*');
        }

        // The requested `wanted` boxes cut to the desk and in the desk's own coordinates, or null (said in the console) when one lies outside the window.
        function boxesOnDesk(wanted) {
            const deskBox = desk.getBoundingClientRect();
            const board = clipToDesk(wanted.board, deskBox);
            const side = clipToDesk(wanted.side, deskBox);
            if ([board, side].some((box) => box.width < 1 || box.height < 1)) {
                console.warn('The stream fit boxes lie outside the window; the desk stays as it was.');
                return null;
            }
            const onDesk = (box) => ({ ...box, left: box.left - Math.ceil(deskBox.left), top: box.top - Math.ceil(deskBox.top) });
            return { board, side, boardOnDesk: onDesk(board), sideOnDesk: onDesk(side) };
        }

        // Lays the desk out for the last request: the side cards always, the board when asked to or when its ink has changed.
        function refit({ board: refitBoard = false } = {}) {
            const placed = boxesOnDesk(boxes);
            if (placed === null) {
                return;
            }
            stream.placeBoard(placed.boardOnDesk);
            const fits = stream.placeSide(placed.sideOnDesk);
            if (!fits && !wasSideShort) {
                console.warn('The side box is smaller than the Pinned, Mode and Mouse cards at their least size; they run past it.');
            }
            wasSideShort = !fits;
            if (refitBoard || sent === null || !sameInk(inkNow(), sent)) {
                fitBoardInBox(placed.board);
            }
        }

        // A change to the board (a digit, a tool, a puzzle that grew a column) is looked at once the frame is drawn.
        const queueRefit = () => {
            if (boxes === null || isFrameQueued) {
                return;
            }
            isFrameQueued = true;
            requestAnimationFrame(() => {
                isFrameQueued = false;
                refit();
            });
        };
        engine.on('change', queueRefit);

        window.addEventListener('message', (event) => {
            // Only this page's own scripts, such as the userscript, are listened to.
            if (event.source !== window || event.data?.type !== REQUEST_TYPE) {
                return;
            }
            const problem = boxProblem('board', event.data.board) ?? boxProblem('side', event.data.side);
            if (problem !== null) {
                console.warn(`Stream fit request ignored: ${problem}.`);
                return;
            }
            const asked = { board: event.data.board, side: event.data.side };
            // The desk is taken over only by a request it can place.
            if (boxesOnDesk(asked) === null) {
                return;
            }
            const first = boxes === null;
            boxes = asked;
            if (first) {
                stream.begin(refit);
            }
            refit({ board: true });
        });

        document.documentElement.dataset.streamFit = READY_MARKER;
        window.postMessage({ type: READY_TYPE }, '*');
    });
})();
