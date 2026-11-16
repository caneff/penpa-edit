// Where each key goes: the board (Penpa+), the browser or the UI. Answers `engine.onKey`, and returns focus to the board after
// a board click, a menu choice and a dialog closing. Reaches Penpa+ only through `engine` (test/ui-boundary.test.mjs fails otherwise).
(function () {
    'use strict';

    // Keys the browser keeps in every mode. Penpa+'s own Ctrl+D (clone) and Ctrl+digit are dropped for the same reason.
    const BROWSER_KEYS = ['F1', 'F2', 'F3', 'F5', 'F11', 'F12', 'PageDown', 'Home', 'Alt'];
    const BROWSER_ALT_KEYS = ['ArrowLeft', 'ArrowRight'];
    const BROWSER_CTRL_DIGIT = /^Digit[1-9]$/;
    // Penpa+'s pause toggle, the one key a paused board answers.
    const RESUME_KEY = 'F4';

    const TEXT_ENTRY = 'input, textarea, select, [contenteditable], wa-input, wa-select';
    const OPEN_MENU = 'wa-dropdown[open], wa-select[open]';
    const OPEN_DIALOG = 'wa-dialog[open]';
    // A control the board still takes keys from while it has focus.
    const PLAIN_CONTROL = 'button, wa-button, .ui-card';
    const BOARD = '.ui-card-board canvas';

    function elementsOf(path) {
        return path.filter((node) => node instanceof Element);
    }

    function isBrowserKey(e) {
        const ctrl = e.ctrlKey || e.metaKey;
        return BROWSER_KEYS.includes(e.key) ||
            (e.altKey && BROWSER_ALT_KEYS.includes(e.key)) ||
            (ctrl && e.key.toLowerCase() === 'd') ||
            (ctrl && BROWSER_CTRL_DIGIT.test(e.code));
    }

    // Walks the event's path, so it sees inside Web Awesome's shadow DOM.
    function boardHasFocus(path) {
        const nodes = elementsOf(path);
        if (nodes.some((node) => node.matches(`${TEXT_ENTRY}, ${OPEN_MENU}, ${OPEN_DIALOG}`))) {
            return false;
        }
        const origin = nodes[0];
        return !origin || origin === document.body || origin === document.documentElement ||
            nodes.some((node) => node.matches(`${PLAIN_CONTROL}, ${BOARD}`));
    }

    // Web Awesome closes an open menu or dialog on Escape itself, only the top-most one per press, so the UI only keeps
    // the press from Penpa+ while one is open.
    function popupIsOpen() {
        return document.querySelector(`${OPEN_MENU}, ${OPEN_DIALOG}`) !== null;
    }

    // The deepest focused element, through shadow roots.
    function focusedElement() {
        let focused = document.activeElement;
        while (focused?.shadowRoot?.activeElement) {
            focused = focused.shadowRoot.activeElement;
        }
        return focused;
    }

    // The board takes keys from the body, and nothing else on the page is focusable by default: blurring is returning focus.
    function focusBoard() {
        if (!document.querySelector(OPEN_DIALOG)) {
            focusedElement()?.blur();
        }
    }

    // Web Awesome hands focus back to what had it, in a timeout queued before it announces `wa-after-hide`; a timeout queued
    // from the announcement runs after that one.
    function focusBoardAfterWebAwesome() {
        setTimeout(focusBoard);
    }

    // The files that own keys of their own add a handler: it answers 'ui', 'browser' or nothing for a key the board would
    // otherwise get, and the first answer wins. It runs only for a key the board may have (pause, popups, focus and browser
    // keys first).
    const keyHandlers = [];
    window.uiKeys = { add: (handler) => keyHandlers.push(handler) };

    function answerOfHandlers(e) {
        for (const handler of keyHandlers) {
            const answer = handler(e);
            if (answer) {
                return answer;
            }
        }
    }

    engine.ready.then(() => {
        engine.onKey((e) => {
            // A paused board answers F4 alone, wherever the focus is: Penpa+ ignores a key typed in a text field, so the UI
            // resumes the clock itself.
            if (engine.getTimer().covered) {
                if (e.type === 'keydown' && e.key === RESUME_KEY && !e.repeat) {
                    engine.startTimer();
                }
                return 'ui';
            }
            if (engine.getState().penpaDialogOpen) {
                return 'browser';
            }
            if (e.key === 'Escape' && popupIsOpen()) {
                return 'ui';
            }
            if (!boardHasFocus(e.composedPath()) || isBrowserKey(e)) {
                return 'browser';
            }
            return answerOfHandlers(e) ?? (e.key === '?' ? 'ui' : undefined);
        });

        // Capture, because Penpa+ may stop a click's default before focus would move.
        document.addEventListener('mousedown', (e) => {
            if (elementsOf(e.composedPath()).some((node) => node.matches(BOARD))) {
                focusBoard();
            }
        }, true);
        // A dialog takes the keyboard, so a key held when it opens would never be seen let go.
        document.addEventListener('wa-show', (e) => {
            if (e.target.matches('wa-dialog')) {
                engine.releaseHolds();
            }
        });
        engine.on('change', () => {
            if (engine.getState().penpaDialogOpen) {
                engine.releaseHolds();
            }
        });
        document.addEventListener('wa-after-hide', (e) => {
            if (e.target.matches('wa-dialog')) {
                focusBoardAfterWebAwesome();
            }
        });
        // The dropdown hands focus back to its trigger as it closes, so the board takes it after that.
        document.addEventListener('wa-select', (e) => {
            const dropdown = e.target.closest('wa-dropdown');
            dropdown?.addEventListener('wa-after-hide', focusBoardAfterWebAwesome, { once: true });
        });
        // A failed load leaves no board to route keys to, and main.js shows its error dialog already.
    }, () => {});
})();
