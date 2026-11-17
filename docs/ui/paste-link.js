// The page a bare solve.html shows: a box for a Penpa+ link, which opens solve.html on that link's puzzle data (from its `?` or its `#`), kept in the `#`.
// Reaches Penpa+ only through `engine` (test/ui-boundary.test.mjs fails otherwise).
(function () {
    'use strict';

    if (engine.hasPuzzle) {
        return;
    }

    // Both hosts serve Penpa+ under /penpa-edit/; the userscript sends the first to the second.
    const PENPA_ORIGINS = ['https://swaroopg92.github.io', 'https://caneff.github.io'];
    const PENPA_PATH = '/penpa-edit/';
    // Parameters with a puzzle in them: `p=` among them, the test boot applies to a query.
    const HAS_PUZZLE = /(^|&)p=/;

    // The `#...` that opens `text`'s puzzle on this page, or null. The `?` wins when it has `p=`, then the `#`: boot's order.
    function puzzleDataOf(text) {
        let url;
        try {
            url = new URL(text.trim());
        } catch (error) {
            return null; // not a URL at all: the caller shows the error
        }
        const isPenpa = PENPA_ORIGINS.includes(url.origin) && url.pathname.startsWith(PENPA_PATH);
        if (!isPenpa) {
            return null;
        }
        for (const part of [url.search.substring(1), url.hash.substring(1)]) {
            if (HAS_PUZZLE.test(part)) {
                return '#' + part;
            }
        }
        return null;
    }

    const { el, setDark } = window.uiKit;
    const EXAMPLE_LINK = 'https://caneff.github.io/penpa-edit/solve.html?m=solve&p=…';
    const input = el('wa-input', { id: 'paste-link-input', label: 'Penpa+ link', placeholder: EXAMPLE_LINK, autocomplete: 'off', spellcheck: 'false' });
    const error = el('p', { class: 'ui-paste-error', role: 'alert', hidden: '' }, [
        'That is not a Penpa+ link with its puzzle after the ? or the #. Paste the whole link, such as one ending in ?m=solve&p=… or #m=solve&p=…'
    ]);
    const form = el('form', { class: 'ui-paste' }, [
        el('h1', {}, ['ChinStrap solve page']),
        el('p', { class: 'ui-help' }, ['Paste a Penpa+ link to solve its puzzle here, such as ', el('code', {}, [EXAMPLE_LINK]), '.']),
        input,
        el('wa-button', { type: 'submit', variant: 'brand', class: 'ui-paste-open' }, ['Open']),
        error
    ]);
    form.addEventListener('submit', (event) => {
        event.preventDefault();
        const data = puzzleDataOf(input.value);
        error.hidden = data !== null;
        if (data !== null) {
            location.hash = data;
            location.reload();
        }
    });
    const page = el('div', { class: 'ui-paste-page' }, [form]);
    setDark(page, engine.savedTheme === 'dark');
    document.body.append(page);
    // Web Awesome upgrades the box after this script runs; the focus waits for it.
    customElements.whenDefined('wa-input').then(() => input.focus());
})();
