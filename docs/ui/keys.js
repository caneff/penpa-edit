// Where each key goes: the board (Penpa+), the browser or the UI. Answers `engine.onKey`, returns focus to the board after
// a board click, a menu choice, a dialog closing and a mouse click on a bar or card-head button, and keeps Tab inside an open dialog. Reaches Penpa+ only through `engine` (test/ui-boundary.test.mjs fails otherwise).
(function () {
    'use strict';

    // Keys the browser keeps in every mode. Penpa+'s own Ctrl+D (clone) is dropped for the same reason.
    const BROWSER_KEYS = ['F1', 'F2', 'F3', 'F5', 'F11', 'F12', 'PageDown', 'Home', 'Alt'];
    const BROWSER_ALT_KEYS = ['ArrowLeft', 'ArrowRight'];
    // The browser's tab switch, kept except where the Centre tool is in use: Ctrl lends it in Sudoku and Ctrl + digit then writes a mark.
    const BROWSER_CTRL_DIGIT = /^Digit[1-9]$/;
    const CENTRE_TOOL = { mode: 'sudoku', submode: '3' };
    // Penpa+'s pause toggle, the one key a paused board answers.
    const RESUME_KEY = 'F4';

    const TEXT_ENTRY = 'input, textarea, select, [contenteditable], wa-input, wa-select';
    const OPEN_MENU = 'wa-dropdown[open], wa-select[open]';
    const OPEN_DIALOG = 'wa-dialog[open]';
    // The Mode card's tool tree takes its own arrows, Enter, Space and Home; none of them is a board key.
    const TOOL_TREE = '[role=tree]';
    // A control the board still takes keys from while it has focus.
    const PLAIN_CONTROL = 'button, wa-button, .ui-card';
    const BOARD = '.ui-card-board canvas';
    const HAND_BACK_BUTTON = '.ui-bar wa-button, .ui-head wa-button';
    const DIALOG_CONTROL = 'wa-button, wa-input, wa-select, wa-switch, wa-checkbox, button, input, select, textarea, [tabindex]:not([tabindex="-1"])';

    function elementsOf(path) {
        return path.filter((node) => node instanceof Element);
    }

    function isBrowserKey(e) {
        const ctrl = e.ctrlKey || e.metaKey;
        return BROWSER_KEYS.includes(e.key) ||
            (e.altKey && BROWSER_ALT_KEYS.includes(e.key)) ||
            (ctrl && e.key.toLowerCase() === 'd') ||
            (ctrl && BROWSER_CTRL_DIGIT.test(e.code) && !centreToolInUse());
    }

    function centreToolInUse() {
        const { mode, submode } = engine.getTool();
        return mode === CENTRE_TOOL.mode && submode === CENTRE_TOOL.submode;
    }

    // Walks the event's path, so it sees inside Web Awesome's shadow DOM.
    function boardHasFocus(path) {
        const nodes = elementsOf(path);
        // A dialog is open for the whole page, whatever the event's path holds: focus that fell out of it must not reach the board.
        if (document.querySelector(OPEN_DIALOG) || nodes.some((node) => node.matches(`${TEXT_ENTRY}, ${TOOL_TREE}, ${OPEN_MENU}`))) {
            return false;
        }
        return isBodyOrBoard(nodes) || nodes.some((node) => node.matches(PLAIN_CONTROL));
    }

    // Focus is on the page itself or on the board, not on a control.
    function isBodyOrBoard(nodes) {
        const origin = nodes[0];
        return !origin || origin === document.body || origin === document.documentElement || nodes.some((node) => node.matches(BOARD));
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

    // Where focus lands after Tab (`fromEnd` false) or Shift+Tab left the dialog.
    function keepFocusIn(dialog, fromEnd) {
        if (dialog.contains(document.activeElement)) {
            return;
        }
        const controls = [...dialog.querySelectorAll(DIALOG_CONTROL)].filter((control) => !control.disabled && control.checkVisibility());
        (fromEnd ? controls.at(-1) : controls[0])?.focus();
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
            // From a control Tab is the browser's, so the bar, the card buttons and the chips can be reached.
            if (e.key === 'Tab' && !isBodyOrBoard(elementsOf(e.composedPath()))) {
                return 'browser';
            }
            return answerOfHandlers(e) ?? (e.key === '?' ? 'ui' : undefined);
        });

        // The browser's Tab may leave an open dialog (headless Chromium lets it reach the body): bring it back to the dialog's
        // first control, or its last after Shift+Tab. Runs after the browser has moved focus.
        document.addEventListener('keydown', (e) => {
            const dialog = document.querySelector(OPEN_DIALOG);
            if (e.key === 'Tab' && dialog) {
                setTimeout(() => keepFocusIn(dialog, e.shiftKey));
            }
        }, true);

        // A mouse click on a button of the bar or of a card's head hands the keyboard back, so Enter does not click it again.
        // A key press that clicks it (`detail` 0) keeps focus: the keyboard user is still on it.
        document.addEventListener('click', (e) => {
            if (e.detail > 0 && elementsOf(e.composedPath()).some((node) => node.matches(HAND_BACK_BUTTON))) {
                focusBoardAfterWebAwesome();
            }
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
        // A pick in a select on the desk hands the keyboard back too: Web Awesome has closed the list by the time it announces
        // `change`. A select in a dialog leaves it to the dialog's own close rule; typing in a text field fires no `change`
        // from a select, so it keeps focus.
        document.addEventListener('change', (e) => {
            const select = e.target.closest?.('wa-select');
            if (select && !select.closest('wa-dialog')) {
                focusBoardAfterWebAwesome();
            }
        });
        // A failed load leaves no board to route keys to, and main.js shows its error dialog already.
    }, () => {});
})();
