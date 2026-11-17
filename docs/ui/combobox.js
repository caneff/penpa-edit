// A searchable list: a text field that opens a grouped list on focus, filters it as you type, and picks by mouse or by Arrow keys
// and Enter. Escape closes it. The pick leaves the field, which is how focus returns to the board: nothing else on the page takes
// keys. Plain DOM, so it needs no `engine`.
(function () {
    'use strict';

    const { el } = window.uiKit;

    // `groups()` gives the groups in display order as `{ title, entries }`, an entry being `{ key, haystack, attrs? }` with a `key`
    // that is stable between calls and a lowercase `haystack` the typed words are looked for in. `renderEntry(entry)` gives the
    // nodes inside an entry's option, and `rowButtons(entry)` the buttons beside it (none when absent). `currentText()` is what the
    // closed field shows. `onPick(entry)` is a pick; `onKey(e, entry)` may answer a key for the highlighted entry (`entry` is
    // undefined when none is) and returns true when it did. `onClose()` runs each time the list closes.
    function createCombobox({ idPrefix, label, listLabel, placeholder, noMatch, groups, renderEntry, rowButtons, currentText, onPick, onKey, onClose }) {
        const listId = `${idPrefix}-listbox`;
        const input = el('input', {
            type: 'text', role: 'combobox', 'aria-label': label, 'aria-autocomplete': 'list', 'aria-expanded': 'false',
            'aria-controls': listId, spellcheck: 'false', autocomplete: 'off', class: 'ui-search', placeholder
        });
        const list = el('div', { role: 'listbox', id: listId, 'aria-label': listLabel, class: 'ui-list', hidden: '' });
        const node = el('div', { class: 'ui-picker' }, [input, list]);
        window.floatList(input, list);

        let open = false;
        let shown = [];
        let active = -1;

        function showCurrent() {
            input.value = currentText();
        }

        function markActive() {
            list.querySelectorAll('[role=option]').forEach((option, i) => {
                option.setAttribute('aria-selected', String(i === active));
                if (i === active) {
                    option.scrollIntoView({ block: 'nearest' });
                }
            });
            if (active >= 0) {
                input.setAttribute('aria-activedescendant', `${idPrefix}-option-${active}`);
            } else {
                input.removeAttribute('aria-activedescendant');
            }
        }

        function close() {
            if (!open) {
                return;
            }
            open = false;
            list.hidden = true;
            input.setAttribute('aria-expanded', 'false');
            input.removeAttribute('aria-activedescendant');
            showCurrent();
            onClose?.();
        }

        function pick(entry) {
            onPick(entry);
            input.blur();
        }

        // The options are numbered in the order they show, which is the groups' order, not the filter's. `activeKey` is the entry
        // that stays highlighted through the redraw, when it is still listed.
        function renderList(activeKey) {
            const words = input.value.trim().toLowerCase().split(/\s+/).filter(Boolean);
            list.replaceChildren();
            shown = [];
            groups().forEach(({ title, entries }) => {
                const matching = entries.filter((e) => words.every((w) => e.haystack.includes(w)));
                if (!matching.length) {
                    return;
                }
                const group = el('div', { role: 'group', 'aria-label': title, class: 'ui-group' }, [el('div', { class: 'ui-group-title', 'aria-hidden': 'true' }, [title])]);
                matching.forEach((entry) => {
                    const option = el('div', { role: 'option', 'aria-selected': 'false', class: 'ui-entry', ...entry.attrs }, renderEntry(entry));
                    // The mouse press keeps the focus in the field, so the click that follows is a pick.
                    option.addEventListener('mousedown', (e) => e.preventDefault());
                    option.addEventListener('click', () => pick(entry));
                    const buttons = rowButtons?.(entry) ?? [];
                    buttons.forEach((button) => button.addEventListener('mousedown', (e) => e.preventDefault()));
                    shown.push(entry);
                    group.append(buttons.length ? el('div', { role: 'presentation', class: 'ui-entry-row' }, [option, ...buttons]) : option);
                });
                list.append(group);
            });
            list.querySelectorAll('[role=option]').forEach((option, i) => { option.id = `${idPrefix}-option-${i}`; });
            if (!shown.length) {
                list.append(el('div', { class: 'ui-none' }, [noMatch]));
            }
            active = shown.findIndex((e) => e.key === activeKey);
            markActive();
        }

        function openList() {
            if (open) {
                return;
            }
            open = true;
            list.hidden = false;
            input.setAttribute('aria-expanded', 'true');
            input.value = '';
            renderList(null);
        }

        input.addEventListener('focus', openList);
        input.addEventListener('mousedown', () => { if (document.activeElement === input) { openList(); } });
        input.addEventListener('blur', close);
        input.addEventListener('input', () => { openList(); renderList(null); });
        input.addEventListener('keydown', (e) => {
            if (onKey?.(e, shown[active])) {
                e.preventDefault();
            } else if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
                e.preventDefault();
                openList();
                active = Math.max(0, Math.min(shown.length - 1, active + (e.key === 'ArrowDown' ? 1 : -1)));
                markActive();
            } else if (e.key === 'Enter') {
                e.preventDefault();
                const entry = shown[Math.max(active, 0)];
                if (entry) {
                    pick(entry);
                }
            } else if (e.key === 'Escape') {
                e.preventDefault();
                input.blur();
            }
        });

        return {
            node,
            // Shows `currentText()` in the field while the list is closed.
            showCurrent() {
                if (!open) {
                    showCurrent();
                }
            },
            // Draws the open list again, keeping the highlighted entry.
            redraw() {
                if (open) {
                    renderList(shown[active]?.key);
                }
            }
        };
    }

    window.combobox = { create: createCombobox };
})();
