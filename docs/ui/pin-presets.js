// Pin presets: ready-made sets of pins, one per puzzle genre and filed by family, and the sets the solver saves. A searchable list on
// the Pinned card loads one, replacing the puzzle's pins; the solver stars favourites, which are listed first, and saves or deletes
// sets of their own. The saved sets and the stars are kept in localStorage for every puzzle. Reaches Penpa+ only through `engine`
// (test/ui-boundary.test.mjs fails otherwise).
(function () {
    'use strict';

    const { el, onDeskReady } = window.uiKit;
    const { toolKey } = window.toolGuide;

    const STORAGE_KEY = 'chinstrap.pinPresets';
    const STARS_KEY = 'chinstrap.pinPresetStars';
    const SAVE_LABEL = 'Save pins…';
    // Keys that act on the highlighted preset, with Shift held; the buttons' hints name the same chords.
    const STAR_KEY = 'Enter';
    const DELETE_KEY = 'Delete';
    const FAVOURITES = 'Favourites';
    const YOUR_PRESETS = 'Your presets';
    // How long the line offering an Undo stays, when nothing else clears it.
    const UNDO_VISIBLE_MS = 8000;

    const STAR_ICON = '<path d="M8 1.8l1.9 4 4.3.6-3.1 3 .8 4.3L8 11.6l-3.9 2.1.8-4.3-3.1-3 4.3-.6z"/>';
    const TRASH_ICON = '<path d="M2.5 4h11M6 4V2.5h4V4M4 4l.7 9.5h6.6L12 4M6.5 6.5v4.5M9.5 6.5v4.5"/>';
    const ICON_ATTRS = 'width="14" height="14" viewBox="0 0 16 16" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linejoin="round" stroke-linecap="round"';

    const SUDOKU = ['sudoku/1', 'sudoku/2', 'sudoku/3'];
    const NUMBERS = ['number/1', 'number/5', 'number/7'];
    const BLOCKS = ['combi/blpo'];

    // [family, genre, tools as 'mode/submode' ('mode/' for a mode with none)], the families in the order the list shows them. A
    // preset holds the tools a solver uses while solving, not the ones a setter draws a Sudoku's clues with (thermometers, cages,
    // dots, arrows): a Sudoku variant needs only the entry modes, so it is Classic sudoku. A tool a puzzle's grid lacks is left out on load.
    const BUILT_IN = [
        ['Number placement', 'Classic sudoku', SUDOKU],
        ['Number placement', 'Sudoku with lines and marks', [...SUDOKU, 'line/1', 'line/4']],
        ['Number placement', 'Kakuro', NUMBERS],
        ['Number placement', 'Skyscrapers', NUMBERS],
        ['Number placement', 'Nonogram', ['surface/', 'combi/blpo', 'number/5']],
        ['Loops and paths', 'Slitherlink', ['combi/edgex', 'combi/edgexoi']],
        ['Loops and paths', 'Masyu', ['combi/linex', 'combi/lineox']],
        ['Loops and paths', 'Yajilin', ['combi/yajilin', 'line/4']],
        ['Loops and paths', 'Hashi', ['combi/hashi', 'line/4']],
        ['Loops and paths', 'Hotaru beam', ['combi/linedir', 'line/1', 'line/4']],
        ['Loops and paths', 'Anglers', ['line/1', 'line/4', 'number/1']],
        ['Loops and paths', 'Paths with walls', ['line/1', 'line/4', 'wall/']],
        ['Shading', 'Nurikabe', ['combi/blpo', 'surface/']],
        ['Shading', 'Heyawake', BLOCKS],
        ['Shading', 'LITS', BLOCKS],
        ['Shading', 'Tapa', [...BLOCKS, 'number/5']],
        ['Shading', 'Kurotto', [...BLOCKS, 'number/5']],
        ['Shading', 'Statue park', [...BLOCKS, 'symbol/square_L']],
        ['Regions', 'Fillomino', ['number/1', 'number/5', 'lineE/1', 'lineE/4']],
        ['Regions', 'Pentominous', ['number/1', 'lineE/1', 'lineE/4', 'surface/']],
        ['Objects and placement', 'Star battle', ['combi/star', 'surface/']],
        ['Objects and placement', 'Tents', ['combi/tents', 'surface/']],
        ['Objects and placement', 'Battleships', ['combi/battleship', 'surface/']],
        ['Objects and placement', 'Minesweeper', ['combi/mines', 'number/1']],
        ['Objects and placement', 'Akari', ['combi/akari', 'surface/']],
        ['Objects and placement', 'Sun and moon', ['symbol/sun_moon', 'surface/']],
        ['Objects and placement', 'Pencils', ['symbol/pencils', 'line/4']],
        ['Objects and placement', 'Darts', ['symbol/darts', 'number/1']]
    ];
    // The families, in the order BUILT_IN lists them.
    const FAMILIES = [...new Set(BUILT_IN.map(([family]) => family))];

    const toolOfKey = (key) => {
        const [mode, submode] = key.split('/');
        return { mode, submode: submode === '' ? null : submode, style: null };
    };

    // What an earlier visit stored under `key`: the array it wrote, or [] for none. A stored value that is unreadable, or that this
    // code did not write, offers nothing; the next write replaces it, which the console says, so the loss is never silent.
    function storedList(key, isValid, what) {
        const raw = localStorage.getItem(key);
        if (raw === null) {
            return [];
        }
        let stored;
        try {
            stored = JSON.parse(raw);
        } catch (e) {
            console.warn(`${key} is unreadable (${e.message}); no ${what} is offered, and the next write replaces it.`);
            return [];
        }
        if (!Array.isArray(stored) || !stored.every(isValid)) {
            console.warn(`${key} does not hold ${what} as this page saves them; none is offered, and the next write replaces it.`);
            return [];
        }
        return stored;
    }

    // `{ name, tools }` entries.
    const savedPresets = () => storedList(STORAGE_KEY, (p) => typeof p?.name === 'string' && Array.isArray(p.tools), 'saved preset');
    const writePresets = (presets) => localStorage.setItem(STORAGE_KEY, JSON.stringify(presets));
    // Preset keys: `builtInKey(name)` or `savedKey(name)`.
    // A star on a built-in preset this page no longer lists is left out, so the next write drops it from storage.
    const starredKeys = () => storedList(STARS_KEY, (key) => typeof key === 'string', 'favourite')
        .filter((key) => !key.startsWith(BUILT_IN_PREFIX) || BUILT_IN.some(([, name]) => builtInKey(name) === key));
    const writeStars = (keys) => localStorage.setItem(STARS_KEY, JSON.stringify(keys));
    const BUILT_IN_PREFIX = 'built-in:';
    const builtInKey = (name) => `${BUILT_IN_PREFIX}${name}`;
    const savedKey = (name) => `saved:${name}`;

    // Every preset: built-ins first, then the saved ones. `tools` are `{ mode, submode, style }` objects.
    function allPresets() {
        return [
            ...BUILT_IN.map(([group, name, keys]) => ({ key: builtInKey(name), group, name, tools: keys.map(toolOfKey), saved: false })),
            ...savedPresets().map((p) => ({ key: savedKey(p.name), group: YOUR_PRESETS, name: p.name, tools: p.tools, saved: true }))
        ];
    }

    // A 14 px line icon for a button.
    const icon = (inner) => `<svg ${ICON_ATTRS}>${inner}</svg>`;

    function entryButton(cls, label, key, svg, onClick) {
        const chord = `Shift+${key}`;
        // Not in the Tab order: Tab leaves the field, which closes the list; the chord is the keyboard's way to it.
        const button = el('button', {
            type: 'button', class: `ui-entry-btn ${cls}`, 'aria-label': label, title: `${label} (${chord})`, 'aria-keyshortcuts': chord, tabindex: '-1'
        });
        button.innerHTML = svg;
        button.addEventListener('click', onClick);
        return button;
    }

    onDeskReady(({ cards }) => {
        // The name form is closed on the resting card; the Save pins… button opens it.
        const nameInput = el('wa-input', { class: 'ui-preset-name', label: 'Preset name', placeholder: 'Name this pin set', size: 'small' });
        const saveName = el('wa-button', { appearance: 'filled', variant: 'brand', size: 's' }, ['Save']);
        const cancelName = el('wa-button', { appearance: 'plain', variant: 'neutral', size: 's' }, ['Cancel']);
        const nameForm = el('div', { class: 'ui-preset-row', hidden: '' }, [nameInput, saveName, cancelName]);
        // A text button, so saving your own pins is not mistaken for saving the preset in the field; small, to sit level with it.
        const save = el('wa-button', { class: 'ui-preset-save', appearance: 'outlined', variant: 'neutral', size: 'small' }, [SAVE_LABEL]);
        save.addEventListener('click', openForm);

        function openForm() {
            // Another click on the button while the form is open keeps what was typed.
            if (nameForm.hidden) {
                nameForm.hidden = false;
                nameInput.value = '';
            }
            nameInput.focus();
        }

        // However it closes, the focus leaves the form (a hidden control can keep it), so the next key goes to the board and not to the save icon.
        function closeForm() {
            nameForm.hidden = true;
            if (nameForm.contains(document.activeElement)) {
                document.activeElement.blur();
            }
        }

        function saveFromForm() {
            const name = nameInput.value.trim();
            if (!name) {
                return;
            }
            const all = savedPresets();
            const index = all.findIndex((p) => p.name === name);
            writePresets([...all.filter((p) => p.name !== name), { name, tools: window.pinBoard.snapshot() }]);
            // An undo for an earlier delete would put the older preset of that name over this one.
            clearUndo();
            if (index >= 0) {
                showUndo(`Replaced “${name}”.`, `Undo replace of ${name}`, () => {
                    restoreSaved(all[index], index);
                    picker.redraw();
                });
            }
            closeForm();
        }

        saveName.addEventListener('click', saveFromForm);
        cancelName.addEventListener('click', closeForm);
        // Enter in the name field saves, unless it confirms an input method's composition; a half-typed name is not a name.
        nameInput.addEventListener('keydown', (e) => {
            if (e.key === 'Enter' && !e.isComposing) {
                e.preventDefault();
                saveFromForm();
            }
        });
        // Escape anywhere in the form closes it; stopPropagation keeps it from also reaching the key handlers that treat Escape as a board key.
        nameForm.addEventListener('keydown', (e) => {
            if (e.key === 'Escape') {
                e.preventDefault();
                e.stopPropagation();
                closeForm();
            }
        });
        // The line offering to undo the last load, delete or replacing save, until the next one, a few seconds, or (for a delete) the
        // list closing.
        const undoRow = el('div', { class: 'ui-preset-undo', role: 'status' });
        let undoTimer = null;
        let clearOnListClose = false;
        // What Ctrl+Z in the preset field does: undoes a delete, whose line goes when the list closes and so cannot be reached by Tab.
        let undoDeleteByKey = null;

        function clearUndo() {
            clearTimeout(undoTimer);
            clearOnListClose = false;
            undoDeleteByKey = null;
            undoRow.replaceChildren();
        }

        function showUndo(message, label, action, { untilListCloses = false } = {}) {
            clearUndo();
            const undo = el('button', { type: 'button', class: 'ui-preset-undo-btn', 'aria-label': label }, ['Undo']);
            // The press keeps the focus where it is: taking it from the preset field would close the list and clear this line before the click.
            undo.addEventListener('mousedown', (e) => e.preventDefault());
            undo.addEventListener('click', () => {
                action();
                clearUndo();
            });
            undoRow.replaceChildren(el('span', {}, [message]), undo);
            clearOnListClose = untilListCloses;
            undoDeleteByKey = untilListCloses ? () => undo.click() : null;
            undoTimer = setTimeout(clearUndo, UNDO_VISIBLE_MS);
        }

        function toggleStar(preset) {
            const starred = starredKeys();
            writeStars(starred.includes(preset.key) ? starred.filter((key) => key !== preset.key) : [...starred, preset.key]);
            picker.redraw();
        }

        // Takes a saved preset out of storage, with its star; returns what undo needs: the preset, where it stood and whether it was starred.
        function removeSaved(name) {
            const all = savedPresets();
            const index = all.findIndex((p) => p.name === name);
            const key = savedKey(name);
            const starred = starredKeys();
            writePresets(all.filter((p) => p.name !== name));
            writeStars(starred.filter((k) => k !== key));
            return { preset: all[index], index, wasStarred: starred.includes(key) };
        }

        // Puts `preset` back among the saved ones at `index`, in place of one of its name.
        function restoreSaved(preset, index) {
            const others = savedPresets().filter((p) => p.name !== preset.name);
            others.splice(index, 0, preset);
            writePresets(others);
        }

        function deleteSaved(preset) {
            const { preset: removed, index, wasStarred } = removeSaved(preset.name);
            showUndo(`Deleted “${preset.name}”.`, `Undo delete of ${preset.name}`, () => {
                restoreSaved(removed, index);
                if (wasStarred) {
                    writeStars([...starredKeys(), savedKey(preset.name)]);
                }
                picker.redraw();
            }, { untilListCloses: true });
            picker.redraw();
        }

        function groups() {
            const presets = allPresets();
            const starred = new Set(starredKeys());
            const entries = (inGroup) => inGroup.map((preset) => ({
                key: preset.key,
                preset,
                haystack: `${preset.name} ${preset.group}`.toLowerCase(),
                attrs: { 'data-tools': preset.tools.map(toolKey).join(',') }
            }));
            const unstarred = (group) => entries(presets.filter((p) => p.group === group && !starred.has(p.key)));
            return [
                { title: FAVOURITES, entries: entries(presets.filter((p) => starred.has(p.key))) },
                ...FAMILIES.map((title) => ({ title, entries: unstarred(title) })),
                { title: YOUR_PRESETS, entries: unstarred(YOUR_PRESETS) }
            ];
        }

        const picker = window.combobox.create({
            idPrefix: 'preset', label: 'Pin presets', listLabel: 'Presets', placeholder: 'Load a preset…', noMatch: 'No preset matches.',
            groups,
            renderEntry: ({ preset }) => [preset.name],
            rowButtons: ({ preset }) => {
                const isStarred = starredKeys().includes(preset.key);
                const star = entryButton('ui-entry-star', `Favourite ${preset.name}`, STAR_KEY, icon(STAR_ICON), () => toggleStar(preset));
                star.setAttribute('aria-pressed', String(isStarred));
                return preset.saved
                    ? [star, entryButton('ui-entry-delete', `Delete preset ${preset.name}`, DELETE_KEY, icon(TRASH_ICON), () => deleteSaved(preset))]
                    : [star];
            },
            currentText: () => '',
            onPick: ({ preset }) => {
                const earlier = window.pinBoard.snapshot();
                window.pinBoard.replace(preset.tools);
                showUndo(`Loaded “${preset.name}”.`, `Undo load of ${preset.name}`, () => window.pinBoard.replace(earlier));
            },
            onClose: () => {
                if (clearOnListClose) {
                    clearUndo();
                }
            },
            onKey: (e, entry) => {
                if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z' && undoDeleteByKey) {
                    undoDeleteByKey();
                    return true;
                }
                if (!e.shiftKey) {
                    return false;
                }
                // With nothing highlighted Shift+Enter does nothing, rather than picking the first match.
                if (e.key === STAR_KEY) {
                    if (entry) {
                        toggleStar(entry.preset);
                    }
                    return true;
                }
                if (e.key === DELETE_KEY && entry?.preset.saved) {
                    deleteSaved(entry.preset);
                    return true;
                }
                return false;
            }
        });

        cards.pins.body.append(el('div', { class: 'ui-preset-row' }, [picker.node, save]), nameForm, undoRow);

        // The solver's saved presets, for the Settings dialog to list and delete.
        window.pinPresets = {
            savedNames: () => savedPresets().map((p) => p.name),
            remove: removeSaved
        };
    });
})();
