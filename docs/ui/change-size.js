// The Board card's Change size dialog (#274): + and - on each side of a small board add or remove a blank row or column there,
// and the board is fitted to its card again after each. Reaches Penpa+ only through `engine` (test/ui-boundary.test.mjs fails
// otherwise).
(function () {
    'use strict';

    const { el, textButton, onDeskReady } = window.uiKit;

    // Each side's buttons, named for screen readers and the tests.
    const SIDE_LABELS = {
        top: { add: 'Add a row above', remove: 'Remove the row above' },
        bottom: { add: 'Add a row below', remove: 'Remove the row below' },
        left: { add: 'Add a column on the left', remove: 'Remove the column on the left' },
        right: { add: 'Add a column on the right', remove: 'Remove the column on the right' }
    };

    const refusalOf = (changes, side, change) => changes.sides[side][change > 0 ? 'add' : 'remove'];

    onDeskReady(({ cards, fitBoard }) => {
        const size = el('div', { class: 'ui-size-board' });
        const status = el('p', { class: 'ui-size-note', role: 'status' });
        const buttons = [];

        // A refused button stays pressable, so pressing it can say why; it is dimmed (`data-refused`) and its name to screen
        // readers ends with the reason, since wa-button keeps `aria-disabled` off the button inside it.
        function sideButton(side, change, content) {
            const name = el('span', { class: 'ui-sr-only' });
            const node = el('wa-button', { appearance: 'filled', variant: 'neutral', size: 's' }, [el('span', { 'aria-hidden': 'true' }, [content]), name]);
            node.addEventListener('click', () => press(side, change));
            buttons.push({ node, name, label: SIDE_LABELS[side][change > 0 ? 'add' : 'remove'], side, change });
            return node;
        }
        const sideGroup = (side) => el('div', { class: `ui-size-side ui-size-${side}` }, [sideButton(side, -1, '\u2212'), sideButton(side, 1, '+')]);

        const dialog = el('wa-dialog', { label: 'Change size' }, [
            el('div', { class: 'ui-size-grid' }, [sideGroup('top'), sideGroup('left'), size, sideGroup('right'), sideGroup('bottom')]),
            status
        ]);
        document.body.append(dialog);

        // Shows the board's size and which buttons are refused; the status line says `message`, or why no side can change.
        function show(message = '') {
            const changes = engine.getSizeChanges();
            size.textContent = changes.unavailable ? '' : `${changes.columns} \u00d7 ${changes.rows}`;
            buttons.forEach(({ node, name, label, side, change }) => {
                const refusal = refusalOf(changes, side, change);
                node.toggleAttribute('data-refused', refusal !== null);
                name.textContent = refusal === null ? label : `${label}: ${refusal}`;
            });
            status.textContent = changes.unavailable ?? message;
        }

        function press(side, change) {
            const refusal = refusalOf(engine.getSizeChanges(), side, change);
            if (refusal !== null) {
                show(refusal);
                return;
            }
            engine.changeSize(side, change);
            fitBoard();
            show();
        }

        const open = textButton('Change size\u2026', 'Add or remove blank rows and columns around the board', () => {
            show();
            dialog.open = true;
        });
        open.node.classList.add('ui-change-size');
        cards.board.head.append(open.node);
    });
})();
