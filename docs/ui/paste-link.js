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
    // Parameters with a puzzle in them, as boot reads them: `p=` among them.
    const HAS_PUZZLE = /(^|&)p=/;

    // The `#...` that opens `text`'s puzzle on this page, or null when `text` is no URL, no Penpa+ link,
    // or has no `p=` in its `?` or its `#`. The `?` wins when it has `p=`, then the `#`, as boot reads them.
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

    const { el } = window.uiKit;
    const input = el('input', { type: 'text', id: 'paste-link-input', class: 'ui-paste-input', autocomplete: 'off', spellcheck: 'false' });
    const error = el('p', { class: 'ui-paste-error', role: 'alert', hidden: '' }, [
        'That is not a Penpa+ link with its puzzle after the ? or the #. Paste the whole link, such as one ending in ?m=solve&p=… or #m=solve&p=…'
    ]);
    const form = el('form', { class: 'ui-paste' }, [
        el('h1', {}, ['Paste a Penpa+ link']),
        el('label', { for: 'paste-link-input' }, ['Penpa+ link']),
        input,
        el('button', { type: 'submit' }, ['Open']),
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
    document.body.append(el('div', { class: 'ui-paste-page' }, [form]));
})();
