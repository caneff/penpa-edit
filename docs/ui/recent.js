// The Recent card: the last five tools the solver used, newest first, as pin chips without number or ×. Kept for this visit
// only, and outside the Tab cycle. Reaches Penpa only through `engine` (test/ui-boundary.test.mjs fails otherwise).
(function () {
    'use strict';

    const { chipLabel, toolKey } = window.toolGuide;

    const MAX_ENTRIES = 5;
    // Penpa turns Shift into Corner and Ctrl into Centre in Sudoku for as long as the key is down.
    const HOLD_KEYS = ['Shift', 'Control'];
    const SUDOKU_MODE = 'sudoku';
    // A button the mouse reaches and Tab does not.
    const OUT_OF_TAB_ORDER = { tabindex: '-1' };

    function el(tag, attrs = {}, children = []) {
        const node = document.createElement(tag);
        Object.entries(attrs).forEach(([name, value]) => node.setAttribute(name, value));
        node.append(...children);
        return node;
    }

    window.deskReady.then(({ cards }) => {
        const tools = engine.listTools();
        const toolOf = (entry) => tools.find((t) => toolKey(t) === toolKey(entry));

        // Each entry is a tool and the style it was last used with, the newest first.
        let entries = [];
        // The key held down for a temporary sub-mode; the tool Penpa shows meanwhile is not one the solver chose.
        let heldKey = null;
        let drawn = '';

        window.uiKeys.add((e) => {
            if (e.type === 'keyup' && e.key === heldKey) {
                heldKey = null;
            } else if (e.type === 'keydown' && !e.repeat && heldKey === null && HOLD_KEYS.includes(e.key) &&
                engine.getTool().mode === SUDOKU_MODE && !e.altKey && !(e.key === 'Shift' ? e.ctrlKey : e.shiftKey)) {
                heldKey = e.key;
            }
        });
        // A key released while the window had no focus never reaches the page.
        window.addEventListener('blur', () => {
            heldKey = null;
        });

        function noteCurrentTool() {
            const current = engine.getTool();
            if (heldKey !== null || !toolOf(current)) {
                return;
            }
            const { mode, submode, style } = current;
            entries = [{ mode, submode, style }, ...entries.filter((entry) => toolKey(entry) !== toolKey(current))].slice(0, MAX_ENTRIES);
        }

        function chip(entry, current) {
            const main = el('button', {
                type: 'button', class: 'ui-chip-main', 'aria-pressed': String(current), title: toolOf(entry).name, ...OUT_OF_TAB_ORDER
            }, [chipLabel(toolOf(entry))]);
            main.addEventListener('click', () => {
                engine.setTool({ mode: entry.mode, submode: entry.submode, ...(entry.style === null ? {} : { style: entry.style }) });
                main.blur();
            });
            return el('div', { class: `ui-chip${current ? ' is-current' : ''}` }, [main]);
        }

        const strip = el('div', { class: 'ui-recent' });
        cards.recent.body.replaceChildren(strip);

        function render() {
            noteCurrentTool();
            const currentKey = toolKey(engine.getTool());
            const signature = JSON.stringify([entries, currentKey]);
            if (signature !== drawn) {
                drawn = signature;
                strip.replaceChildren(...entries.map((entry) => chip(entry, toolKey(entry) === currentKey)));
            }
        }

        render();
        engine.on('change', render);
    });
    window.deskReady.catch(() => {});
})();
