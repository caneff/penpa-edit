// The Settings dialog: the settings that matter for solving, in four groups, each change saved at once, and the desk's own
// (theme, layout, pins and saved presets). Conflict detection off for this puzzle only is kept here, per puzzle, because
// Penpa+ forgets it on the next puzzle. Reaches Penpa+ only through `engine` (test/ui-boundary.test.mjs fails otherwise).
(function () {
    'use strict';

    const { confirmDialog, el, iconButton, newTabLink, onDeskReady, PENPA_URL } = window.uiKit;
    const { puzzleHash } = window;

    const CONFLICT_ON = 1;
    const CONFLICT_OFF_THIS_PUZZLE = 2;
    const CONFLICT_OFF_ALL = 3;
    const CONFLICT_SETTING = 'conflict_detection';
    const PER_PUZZLE_PREFIX = 'chinstrap.conflict-off:';
    const PER_PUZZLE_FLAG = '1';
    const PER_PUZZLE_TAG = 'This puzzle only';

    // An evenly spaced 8-tooth gear around a hub, generated (8 teeth, radii 4.9 and 6.5) so no tooth sits off the circle.
    const GEAR_ICON = '<circle cx="8" cy="8" r="2.1"/><path d="M6.27 3.41 L6.58 1.66 L9.42 1.66 L9.73 3.41 L10.02 3.54 L11.48 2.51 L13.49 4.52 L12.46 5.98 L12.59 6.27 L14.34 6.58 L14.34 9.42 L12.59 9.73 L12.46 10.02 L13.49 11.48 L11.48 13.49 L10.02 12.46 L9.73 12.59 L9.42 14.34 L6.58 14.34 L6.27 12.59 L5.98 12.46 L4.52 13.49 L2.51 11.48 L3.54 10.02 L3.41 9.73 L1.66 9.42 L1.66 6.58 L3.41 6.27 L3.54 5.98 L2.51 4.52 L4.52 2.51 L5.98 3.54Z"/>';

    // The row that holds the Clear saved progress button, in the group its rows are listed in.
    const CLEAR_PROGRESS_ROW = ['clear saved progress'];

    // One line under a setting whose name is Penpa+'s own jargon.
    const HELP = {
        secondcolor: 'The colour Surface uses for its second shading style.',
        custom_colors_on: 'Adds your own colours to the colour pickers.',
        ignore_line_style: 'A line of any colour counts as the answer\'s green line when the puzzle is checked.',
        auto_save_history: 'Keeps the puzzle in the browser\'s history list each time it is saved.'
    };

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

    const FORK_URL = 'https://github.com/caneff/penpa-edit';

    const THEMES = [['light', 'Light'], ['dark', 'Dark']];

    const perPuzzleKey = () => PER_PUZZLE_PREFIX + puzzleHash();

    onDeskReady(({ bar, resetLayout, isMouseClosed, setMouseClosed }) => {
        // Penpa+ turns "off for this puzzle" back on whenever it loads a puzzle, so each visit puts it back for the puzzle that has it.
        if (localStorage.getItem(perPuzzleKey()) === PER_PUZZLE_FLAG && engine.getSettings()[CONFLICT_SETTING] === CONFLICT_ON) {
            engine.setSetting(CONFLICT_SETTING, CONFLICT_OFF_THIS_PUZZLE);
        }

        const controls = new Map();
        const settingRows = new Map();
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

        const helpLine = (name) => (HELP[name] ? [el('span', { class: 'ui-help' }, [HELP[name]])] : []);

        function control([name, label, options]) {
            const row = (children) => {
                const node = el('div', { class: 'ui-setting' }, [...children, ...helpLine(name)]);
                settingRows.set(name, node);
                return node;
            };
            if (!options) {
                const toggle = el('wa-switch', {}, [label]);
                toggle.addEventListener('change', () => save(name, toggle.checked));
                controls.set(name, (value) => { toggle.checked = value; });
                return row([toggle]);
            }
            const select = el('wa-select', { label, size: 's' },
                options.map(([value, text]) => el('wa-option', { value: String(value) }, [text])));
            select.addEventListener('change', () => save(name, Number(select.value)));
            controls.set(name, (value) => { select.value = String(value); });
            return row(name === CONFLICT_SETTING ? [select, tag] : [select]);
        }

        const clear = el('wa-button', { size: 's', variant: 'danger', appearance: 'outlined' }, ['Clear this puzzle\'s saved progress']);
        const clearDialog = confirmDialog({
            label: 'Clear this puzzle\'s saved progress?',
            text: 'This removes what this browser saved for this puzzle only, and stops saving it. Other puzzles keep theirs.',
            cancel: 'Cancel',
            confirm: 'Clear progress',
            onConfirm: async () => {
                await engine.clearSavedProgress();
                cleared.textContent = 'This puzzle\'s saved progress was cleared. It is not saved again until the page reloads.';
            }
        });
        clear.addEventListener('click', () => { clearDialog.open = true; });

        const clearRow = el('div', { class: 'ui-setting' }, [clear, cleared]);

        // ---- The desk's own settings, kept by the UI in localStorage --------------------------------------------------

        const theme = el('wa-select', { label: 'Theme', size: 's' },
            THEMES.map(([value, text]) => el('wa-option', { value }, [text])));
        theme.addEventListener('change', () => engine.setTheme(theme.value));

        const showMouse = el('wa-switch', {}, ['Show Mouse card']);
        showMouse.addEventListener('change', () => setMouseClosed(!showMouse.checked));

        const resetLayoutButton = el('wa-button', { size: 's' }, ['Reset layout']);
        resetLayoutButton.addEventListener('click', () => {
            dialog.open = false;
            resetLayout();
        });

        const resetPins = el('wa-button', { size: 's' }, ['Reset pins to the puzzle\'s default pins']);
        resetPins.addEventListener('click', () => window.pinBoard.reseed());

        const presets = el('wa-select', { label: 'Your presets', size: 's', placeholder: 'None saved' });
        const deletePreset = el('wa-button', { size: 's' }, ['Delete preset']);
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
            el('div', { class: 'ui-setting' }, [presets, deletePreset]),
            el('div', { class: 'ui-setting' }, [showMouse])]);

        const aboutGroup = el('fieldset', { class: 'ui-settings-group' }, [el('legend', {}, ['About']),
            el('div', { class: 'ui-settings-about' }, [
                el('p', {}, ['This page is a solving-focused UI fork of ', newTabLink(PENPA_URL, 'Penpa+'), ' by swaroopg92. The puzzle engine is Penpa+\'s.']),
                el('p', {}, ['Penpa+ is MIT licensed. Copyright (c) 2019 Opt-Pan. Copyright (c) 2020 Swaroop Guggilam.']),
                el('p', {}, ['This fork\'s source: ', newTabLink(FORK_URL, 'caneff/penpa-edit')])])]);

        const dialog = el('wa-dialog', { label: 'Settings' }, [...GROUPS.map(([title, rows]) => el('fieldset', { class: 'ui-settings-group' },
            [el('legend', {}, [title]), ...rows.map((row) => (row === CLEAR_PROGRESS_ROW ? clearRow : control(row)))])), deskGroup, aboutGroup]);
        // The controls show what the engine and the UI hold each time the dialog opens, so they never go stale. Done before
        // the dialog opens, not on its `wa-show`, which can come after the visitor's first click.
        function openDialog() {
            const current = engine.getSettings();
            controls.forEach((show, name) => show(current[name]));
            const applies = engine.getPuzzleSettings();
            settingRows.forEach((row, name) => { row.hidden = !applies.includes(name); });
            tag.hidden = current[CONFLICT_SETTING] !== CONFLICT_OFF_THIS_PUZZLE;
            cleared.textContent = '';
            theme.value = current.theme;
            showMouse.checked = !isMouseClosed();
            showPresets();
            dialog.open = true;
        }

        bar.append(iconButton(GEAR_ICON, 'Settings', openDialog).node);
        document.querySelector('.ui-root').append(dialog, clearDialog);
    });
})();
