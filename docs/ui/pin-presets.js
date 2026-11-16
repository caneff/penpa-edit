// Pin presets: ready-made sets of pins, titled by puzzle genre, and the sets the solver saves. A pulldown on the Pinned card
// loads one, replacing the puzzle's pins; the saved sets are kept in localStorage for every puzzle. Reaches Penpa only through
// `engine` (test/ui-boundary.test.mjs fails otherwise).
(function () {
    'use strict';

    const STORAGE_KEY = 'chinstrap.pinPresets';

    // [genre, name, tools as 'mode/submode' ('mode/' for a mode with none]. A tool a puzzle's grid lacks is left out on load.
    const BUILT_IN = [
        ['Number placement', 'Sudoku', ['sudoku/1', 'sudoku/2', 'sudoku/3']],
        ['Number placement', 'Sudoku with lines and marks', ['sudoku/1', 'sudoku/2', 'sudoku/3', 'line/1', 'line/4']],
        ['Number placement', 'Number grid (Kakuro, Futoshiki)', ['number/1', 'number/5', 'number/7']],
        ['Loops and paths', 'Loop (Slitherlink, Masyu)', ['line/1', 'line/4', 'lineE/1', 'lineE/4']],
        ['Loops and paths', 'Paths with walls', ['line/1', 'line/4', 'wall/']],
        ['Shading', 'Shading (Nurikabe, Akari)', ['surface/', 'combi/blpo', 'line/4']],
        ['Shading', 'Shading with numbers', ['surface/', 'number/1', 'number/5']],
        ['Sudoku variants', 'Thermo and cages', ['sudoku/1', 'sudoku/2', 'special/thermo', 'cage/1']]
    ];

    function el(tag, attrs = {}, children = []) {
        const node = document.createElement(tag);
        Object.entries(attrs).forEach(([name, value]) => node.setAttribute(name, value));
        node.append(...children);
        return node;
    }

    const toolOfKey = (key) => {
        const [mode, submode] = key.split('/');
        return { mode, submode: submode === '' ? null : submode, style: null };
    };

    // What an earlier visit saved: `{ name, tools }` entries, or [] for none. A value this code did not write is the same as none.
    function savedPresets() {
        let saved;
        try {
            saved = JSON.parse(localStorage.getItem(STORAGE_KEY));
        } catch (e) {
            return [];
        }
        const valid = Array.isArray(saved) && saved.every((p) => typeof p?.name === 'string' && Array.isArray(p.tools));
        return valid ? saved : [];
    }

    window.deskReady.then(({ cards }) => {
        const select = el('wa-select', { label: 'Pin presets', placeholder: 'Load a preset…', size: 'small', class: 'ui-presets' });
        const nameInput = el('wa-input', { label: 'Preset name', size: 'small' });
        const save = el('wa-button', { size: 'small' }, ['Save pins as preset']);

        // Each preset has one value; the options are rebuilt after a save so the new one is there at once.
        let presets = [];
        function fillOptions() {
            const saved = savedPresets();
            presets = [
                ...BUILT_IN.map(([group, name, keys]) => ({ group, name, tools: keys.map(toolOfKey) })),
                ...saved.map((p) => ({ group: 'Your presets', name: p.name, tools: p.tools }))
            ];
            const children = [];
            let group = null;
            presets.forEach((preset, i) => {
                if (preset.group !== group) {
                    group = preset.group;
                    children.push(el('small', {}, [group]));
                }
                children.push(el('wa-option', { value: String(i) }, [preset.name]));
            });
            select.replaceChildren(...children);
        }
        fillOptions();

        select.addEventListener('change', () => {
            if (select.value !== '') {
                window.pinBoard.replace(presets[Number(select.value)].tools);
                // Back to the placeholder, so the same preset can be loaded again.
                select.value = '';
            }
        });

        save.addEventListener('click', () => {
            const name = nameInput.value.trim();
            if (!name) {
                return;
            }
            const others = savedPresets().filter((p) => p.name !== name);
            localStorage.setItem(STORAGE_KEY, JSON.stringify([...others, { name, tools: window.pinBoard.snapshot() }]));
            nameInput.value = '';
            fillOptions();
            save.blur();
        });

        cards.pins.body.append(el('div', { class: 'ui-preset-row' }, [select]), el('div', { class: 'ui-preset-row' }, [nameInput, save]));
    });
    window.deskReady.catch(() => {});
})();
