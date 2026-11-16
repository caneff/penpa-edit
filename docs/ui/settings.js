// The Settings dialog: the settings that matter for solving, in four groups, each change saved at once, and the desk's own
// (theme, layout, pins and saved presets). Conflict detection off for this puzzle only is kept here, per puzzle, because
// Penpa+ forgets it on the next puzzle. Reaches Penpa+ only through `engine` (test/ui-boundary.test.mjs fails otherwise).
(function () {
    'use strict';

    const { el, iconButton, onDeskReady } = window.uiKit;
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

    // The row that holds the Clear saved progress button, in the group its rows are listed in.
    const CLEAR_PROGRESS_ROW = ['clear saved progress'];

    const capitalised = (text) => text.charAt(0).toUpperCase() + text.slice(1);

    // A select is `[name, label, [[value, option label], ...]]` and a switch `[name, label]`.
    const GROUPS = [
        ['Board look', [
            ['sudoku_centre_size', 'Sudoku centre marks', [[1, 'Dynamic'], [2, 'Large'], [3, 'Small']]],
            ['sudoku_normal_size', 'Sudoku digits', [[1, 'Centred'], [2, 'Bottom']]],
            ['outline_text', 'Outline on text'],
            ['secondcolor', 'Surface second colour', engine.SURFACE_COLOURS.map(([style, name]) => [style, capitalised(name)])],
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
            ['reload_button', 'Ask before leaving the page'],
            CLEAR_PROGRESS_ROW
        ]],
        ['Keys', [
            ['shortcuts_enabled', 'Z, X, C and V shortcuts']
        ]]
    ];

    const THEMES = [['light', 'Light'], ['dark', 'Dark']];

    const perPuzzleKey = () => PER_PUZZLE_PREFIX + puzzleHash();

    onDeskReady(({ bar, resetLayout }) => {
        // Penpa+ turns "off for this puzzle" back on whenever it loads a puzzle, so each visit puts it back for the puzzle that has it.
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

        const clearRow = el('div', { class: 'ui-setting' }, [clear, cleared]);

        // ---- The desk's own settings, kept by the UI in localStorage --------------------------------------------------

        const theme = el('wa-select', { label: 'Theme', size: 'small' },
            THEMES.map(([value, text]) => el('wa-option', { value }, [text])));
        theme.addEventListener('change', () => engine.setTheme(theme.value));

        const resetLayoutButton = el('wa-button', { size: 'small' }, ['Reset layout']);
        resetLayoutButton.addEventListener('click', resetLayout);

        const resetPins = el('wa-button', { size: 'small' }, ['Reset pins to the link\'s Tab set']);
        resetPins.addEventListener('click', () => window.pinBoard.reseed());

        const presets = el('wa-select', { label: 'Your presets', size: 'small', placeholder: 'None saved' });
        const deletePreset = el('wa-button', { size: 'small' }, ['Delete preset']);
        function showPresets() {
            presets.replaceChildren(...window.pinPresets.savedNames().map((name) => el('wa-option', { value: name }, [name])));
            presets.value = '';
            deletePreset.toggleAttribute('disabled', true);
        }
        presets.addEventListener('change', () => deletePreset.toggleAttribute('disabled', presets.value === ''));
        deletePreset.addEventListener('click', () => {
            window.pinPresets.remove(presets.value);
            showPresets();
        });

        const deskGroup = el('fieldset', { class: 'ui-settings-group' }, [el('legend', {}, ['Desk']),
            el('div', { class: 'ui-setting' }, [theme]),
            el('div', { class: 'ui-setting' }, [resetLayoutButton, resetPins]),
            el('div', { class: 'ui-setting' }, [presets, deletePreset])]);

        const dialog = el('wa-dialog', { label: 'Settings' }, [...GROUPS.map(([title, rows]) => el('fieldset', { class: 'ui-settings-group' },
            [el('legend', {}, [title]), ...rows.map((row) => (row === CLEAR_PROGRESS_ROW ? clearRow : control(row)))])), deskGroup]);
        // The controls show what the engine and the UI hold each time the dialog opens, so they never go stale. Done before
        // the dialog opens, not on its `wa-show`, which can come after the visitor's first click.
        function openDialog() {
            const current = engine.getSettings();
            controls.forEach((show, name) => show(current[name]));
            tag.hidden = current[CONFLICT_SETTING] !== CONFLICT_OFF_THIS_PUZZLE;
            cleared.textContent = '';
            theme.value = current.theme;
            showPresets();
            dialog.open = true;
        }

        bar.append(iconButton(GEAR_ICON, 'Settings', openDialog).node);
        document.querySelector('.ui-root').append(dialog);
    });
})();
