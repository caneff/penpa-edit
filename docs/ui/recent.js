// The Recent card: the last five tools the solver used that are not pinned, newest first, as pin chips without a shortcut key or ×, each with a pin toggle from `window.pinBoard` (pins.js). Kept for this visit
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

        // Each entry is a tool and the style it was last used with, the newest first: every tool used, since a pinned one comes
        // back here when unpinned.
        let entries = [];
        let drawn = '';

        // A tool a hold lends is not one the solver chose.
        function noteCurrentTool() {
            const current = engine.getTool();
            if (engine.getState().held || !toolOf(current)) {
                return;
            }
            const { mode, submode, style } = current;
            entries = [{ mode, submode, style }, ...entries.filter((entry) => toolKey(entry) !== toolKey(current))];
        }

        function chip(entry, current) {
            const main = el('button', {
                type: 'button', class: 'ui-chip-main', 'aria-pressed': String(current), ...OUT_OF_TAB_ORDER
            }, [chipLabel(toolOf(entry))]);
            main.addEventListener('click', () => {
                engine.setTool({ mode: entry.mode, submode: entry.submode, ...(entry.style === null ? {} : { style: entry.style }) });
                main.blur();
            });
            const pin = window.pinBoard.toggleButton(() => entry).node;
            pin.setAttribute('tabindex', OUT_OF_TAB_ORDER.tabindex);
            return el('div', { class: `ui-chip${current ? ' is-current' : ''}` }, [main, pin]);
        }

        const strip = el('div', { class: 'ui-recent' });
        cards.recent.body.replaceChildren(strip);

        function render() {
            noteCurrentTool();
            const currentKey = toolKey(engine.getTool());
            // Pinned by `isPinned`'s identity, the mode and sub-mode, so a pin on `Surface` hides it whatever style it was used with.
            const shown = entries.filter((entry) => !window.pinBoard.isPinned(entry)).slice(0, MAX_ENTRIES);
            const signature = JSON.stringify([shown, currentKey]);
            if (signature !== drawn) {
                drawn = signature;
                strip.replaceChildren(...shown.map((entry) => chip(entry, toolKey(entry) === currentKey)));
            }
        }

        render();
        engine.on('change', render);
        window.pinBoard.onChange(render);
    });
})();
