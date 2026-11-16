// The Settings dialog: the settings that matter for solving, in four groups, each change saved at once. Conflict detection off
// for this puzzle only is kept here, per puzzle, because Penpa forgets it on the next puzzle. Reaches Penpa only through
// `engine` (test/ui-boundary.test.mjs fails otherwise).
(function () {
    'use strict';

    const { puzzleHash } = window;

    const CONFLICT_ON = 1;
    const CONFLICT_OFF_THIS_PUZZLE = 2;
    const CONFLICT_OFF_ALL = 3;
    const CONFLICT_SETTING = 'conflict_detection';
    const PER_PUZZLE_PREFIX = 'chinstrap.conflict-off:';
    const PER_PUZZLE_FLAG = '1';
    const PER_PUZZLE_TAG = 'This puzzle only';

    const GEAR_ICON = '<circle cx="8" cy="8" r="2.3"/><path d="M6.9 1.5h2.2l.4 1.9 1.3.6 1.7-1 1.5 1.5-1 1.7.6 1.3 1.9.4v2.2l-1.9.4-.6 1.3 1 1.7' +
        '-1.5 1.5-1.7-1-1.3.6-.4 1.9H6.9l-.4-1.9-1.3-.6-1.7 1-1.5-1.5 1-1.7-.6-1.3-1.9-.4V6.9l1.9-.4.6-1.3-1-1.7 1.5-1.5 1.7 1 1.3-.6z"/>';

    // A select is `[name, label, [[value, option label], ...]]` and a switch `[name, label]`.
    const GROUPS = [
        ['Board look', [
            ['sudoku_centre_size', 'Sudoku centre marks', [[1, 'Dynamic'], [2, 'Large'], [3, 'Small']]],
            ['sudoku_normal_size', 'Sudoku digits', [[1, 'Centred'], [2, 'Bottom']]],
            ['outline_text', 'Outline on text'],
            ['secondcolor', 'Surface second colour', [[1, 'Dark grey'], [8, 'Grey'], [3, 'Light grey'], [4, 'Black'], [2, 'Green'], [5, 'Blue'],
                [6, 'Red'], [7, 'Yellow'], [9, 'Pink'], [10, 'Orange'], [11, 'Purple'], [12, 'Brown']]],
            ['custom_colors_on', 'Custom colours']
        ]],
        ['Checking', [
            [CONFLICT_SETTING, 'Conflict detection', [[CONFLICT_ON, 'On'], [CONFLICT_OFF_THIS_PUZZLE, 'Off for this puzzle'],
                [CONFLICT_OFF_ALL, 'Off for every puzzle']]],
            ['check_pencil_marks', 'Check pencil marks'],
            ['ignore_line_style', 'Any colour matches a green line'],
            ['starbattle_dots', 'Star Battle dots', [[1, 'High range'], [2, 'Low range'], [3, 'Off']]]
        ]],
        ['Progress', [
            ['local_storage', 'Save progress in this browser'],
            ['auto_save_history', 'Save a copy to the browser history on every save'],
            ['reload_button', 'Ask before leaving the page']
        ]],
        ['Keys', [
            ['shortcuts_enabled', 'Z, X, C and V shortcuts']
        ]]
    ];

    function el(tag, attrs = {}, children = []) {
        const node = document.createElement(tag);
        Object.entries(attrs).forEach(([name, value]) => node.setAttribute(name, value));
        node.append(...children);
        return node;
    }

    const perPuzzleKey = () => PER_PUZZLE_PREFIX + puzzleHash();

    window.deskReady.then(({ bar }) => {
        // Penpa turns "off for this puzzle" back on whenever it loads a puzzle, so each visit puts it back for the puzzle that has it.
        if (localStorage.getItem(perPuzzleKey()) === PER_PUZZLE_FLAG && engine.getSettings()[CONFLICT_SETTING] === CONFLICT_ON) {
            engine.setSetting(CONFLICT_SETTING, CONFLICT_OFF_THIS_PUZZLE);
        }

        const controls = new Map();
        const tag = el('span', { class: 'ui-tag', hidden: '' }, [PER_PUZZLE_TAG]);
        const cleared = el('span', { class: 'ui-settings-note', role: 'status' });

        function save(name, value) {
            engine.setSetting(name, value);
            if (name === CONFLICT_SETTING) {
                if (value === CONFLICT_OFF_THIS_PUZZLE) {
                    localStorage.setItem(perPuzzleKey(), PER_PUZZLE_FLAG);
                } else {
                    localStorage.removeItem(perPuzzleKey());
                }
                tag.hidden = value !== CONFLICT_OFF_THIS_PUZZLE;
            }
        }

        function control([name, label, options]) {
            if (!options) {
                const toggle = el('wa-switch', {}, [label]);
                toggle.addEventListener('change', () => save(name, toggle.checked));
                controls.set(name, (value) => { toggle.checked = value; });
                return el('div', { class: 'ui-setting' }, [toggle]);
            }
            const select = el('wa-select', { label, size: 'small' },
                options.map(([value, text]) => el('wa-option', { value: String(value) }, [text])));
            select.addEventListener('change', () => save(name, Number(select.value)));
            controls.set(name, (value) => { select.value = String(value); });
            return el('div', { class: 'ui-setting' }, name === CONFLICT_SETTING ? [select, tag] : [select]);
        }

        const clear = el('wa-button', { size: 'small' }, ['Clear saved progress']);
        clear.addEventListener('click', async () => {
            await engine.clearSavedProgress();
            cleared.textContent = 'Cleared. This puzzle is not saved again until the page reloads.';
        });

        const dialog = el('wa-dialog', { label: 'Settings' }, GROUPS.map(([title, rows]) => {
            const children = [el('legend', {}, [title]), ...rows.map(control)];
            if (title === 'Progress') {
                children.push(el('div', { class: 'ui-setting' }, [clear, cleared]));
            }
            return el('fieldset', { class: 'ui-settings-group' }, children);
        }));
        // The controls show what the engine holds each time the dialog opens, so they never go stale. Done before the dialog
        // opens, not on its `wa-show`, which can come after the visitor's first click.
        function openDialog() {
            const current = engine.getSettings();
            controls.forEach((show, name) => show(current[name]));
            tag.hidden = current[CONFLICT_SETTING] !== CONFLICT_OFF_THIS_PUZZLE;
            cleared.textContent = '';
            dialog.open = true;
        }

        const button = el('wa-button', { appearance: 'filled', variant: 'neutral', size: 's' });
        button.innerHTML = '<svg width="16" height="16" viewBox="0 0 16 16" aria-hidden="true" fill="none" stroke="currentColor" ' +
            `stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">${GEAR_ICON}</svg>`;
        button.append(el('span', { class: 'ui-sr-only' }, ['Settings']));
        button.addEventListener('click', openDialog);

        bar.append(button);
        document.querySelector('.ui-root').append(dialog);
    });
})();
