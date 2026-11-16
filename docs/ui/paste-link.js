// The page a bare solve.html shows: a box for a Penpa+ link, which opens solve.html on that link's `#` data.
// Reaches Penpa+ only through `engine` (test/ui-boundary.test.mjs fails otherwise).
(function () {
    'use strict';

    if (engine.hasPuzzle) {
        return;
    }

    // Both hosts serve Penpa+ under /penpa-edit/; the userscript sends the first to the second.
    const PENPA_ORIGINS = ['https://swaroopg92.github.io', 'https://caneff.github.io'];
    const PENPA_PATH = '/penpa-edit/';

    // The `#` data of `text`, a link to Penpa+ on either host; null when it is no such link or has no `#` data.
    function puzzleDataOf(text) {
        let url;
        try {
            url = new URL(text.trim());
        } catch (error) {
            return null; // not a URL at all: the caller shows the error
        }
        const isPenpa = PENPA_ORIGINS.includes(url.origin) && url.pathname.startsWith(PENPA_PATH);
        return isPenpa && url.hash.length > 1 ? url.hash : null;
    }

    const { el } = window.uiKit;
    const input = el('input', { type: 'text', id: 'paste-link-input', class: 'ui-paste-input', autocomplete: 'off', spellcheck: 'false' });
    const error = el('p', { class: 'ui-paste-error', role: 'alert', hidden: '' }, [
        'That is not a Penpa+ link with a puzzle in it. Paste a full link, such as one ending in #m=solve&p=…'
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
