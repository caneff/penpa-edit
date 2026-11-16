// The Recent card: the last five tools the solver used, newest first, as pin chips without number or ×. Kept for this visit
// only, and outside the Tab cycle. Reaches Penpa+ only through `engine` (test/ui-boundary.test.mjs fails otherwise).
(function () {
    'use strict';

    const { chipLabel, toolKey } = window.toolGuide;
    const { el, onDeskReady } = window.uiKit;

    const MAX_ENTRIES = 5;
    // A button the mouse reaches and Tab does not.
    const OUT_OF_TAB_ORDER = { tabindex: '-1' };

    onDeskReady(({ cards }) => {
        const tools = engine.listTools();
        const toolOf = (entry) => tools.find((t) => toolKey(t) === toolKey(entry));

        // Each entry is a tool and the style it was last used with, the newest first.
        let entries = [];
        let drawn = '';

        // A tool a hold lends is not one the solver chose.
        function noteCurrentTool() {
            const current = engine.getTool();
            if (engine.getState().held || !toolOf(current)) {
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
})();
