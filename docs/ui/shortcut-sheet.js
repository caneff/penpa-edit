// The keyboard shortcut sheet: `?` on the board, or the button in Settings > Keys, opens a dialog listing the keys the page answers.
// Its rows come from `window.uiKeys.describe`, which the files that own keys call, so no list is kept here.
// Reaches Penpa+ only through `engine` (test/ui-boundary.test.mjs fails otherwise).
(function () {
    'use strict';

    const { el, onDeskReady } = window.uiKit;

    const GROUPS = ['Board', 'Tools', 'Page'];
    const SHEET_KEY = '?';

    window.uiKeys.describe('Page', [{ keys: SHEET_KEY, text: 'Show this sheet' }]);

    const rowNode = ({ keys, text, state }) => el('li', { class: 'ui-shortcut' },
        [el('kbd', {}, [keys]), ' ', text, ...(state ? [' ', el('span', { class: 'ui-tag' }, [state])] : [])]);

    onDeskReady(() => {
        const dialog = el('wa-dialog', { label: 'Keyboard shortcuts' });
        document.querySelector('.ui-root').append(dialog);

        function open() {
            dialog.replaceChildren(...GROUPS.map((group) => el('fieldset', { class: 'ui-settings-group' },
                [el('legend', {}, [group]), el('ul', { class: 'ui-shortcuts' }, window.uiKeys.rowsOf(group).map(rowNode))])));
            dialog.open = true;
        }
        window.shortcutSheet = { open };

        // Answers `?` on the board, where Penpa+ would open a sheet of its own (or type a ? in Number mode); a text field never
        // gets here, so it types one.
        window.uiKeys.add((e) => {
            if (e.key !== SHEET_KEY || e.ctrlKey || e.metaKey || e.altKey) {
                return;
            }
            if (e.type === 'keydown' && !e.repeat) {
                e.preventDefault();
                open();
            }
            return 'ui';
        });
    });
})();
