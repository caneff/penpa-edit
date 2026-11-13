/*
 * PROTOTYPE (throwaway, branch prototype/solve-ui): the floating variant switcher. NOT part of any design.
 *
 * A pill fixed at bottom centre: [PROTOTYPE] <- "K (name)" -> [puzzle picker].
 * Arrows (or Alt+Left / Alt+Right on the keyboard) cycle the variant A-K with wrap by rewriting `?variant=` and
 * reloading; the puzzle's `#...` hash is kept. The picker loads a sample puzzle and keeps the variant.
 * Plain arrows are left alone: they move the board's selection (main.js:346-353).
 */
(function() {
    'use strict';

    const css = `
#proto-switcher {
    position: fixed; left: 50%; bottom: 14px; transform: translateX(-50%);
    z-index: 2147483000;
    display: flex; align-items: center; gap: 8px;
    padding: 6px 10px 6px 6px;
    background: #111; color: #fff;
    border: 3px dashed #ffd400; border-radius: 999px;
    box-shadow: 0 4px 18px rgba(0,0,0,.45);
    font: 600 14px/1.2 system-ui, -apple-system, "Segoe UI", sans-serif;
    user-select: none;
}
#proto-switcher .proto-tag {
    background: #ffd400; color: #111; border-radius: 999px; padding: 3px 9px;
    font-size: 11px; letter-spacing: .08em;
}
#proto-switcher button {
    all: unset; cursor: pointer; width: 30px; height: 30px; border-radius: 50%;
    display: inline-flex; align-items: center; justify-content: center;
    background: #fff; color: #111; font-size: 18px; font-weight: 700;
}
#proto-switcher button:hover, #proto-switcher button:focus-visible { background: #ffd400; }
#proto-switcher .proto-label { min-width: 130px; text-align: center; white-space: nowrap; }
#proto-switcher select {
    font: inherit; font-weight: 500; font-size: 13px; color: #111; background: #fff;
    border: 0; border-radius: 6px; padding: 4px 6px; max-width: 260px;
}
#proto-switcher .proto-hint { color: #aaa; font-weight: 400; font-size: 11px; }
`;

    const loader = window.PrototypeLoader;
    const keys = loader.keys;
    let labelEl = null;

    /** Reload the page at `url`. A hash-only change does not reload by itself, so always reload explicitly. */
    function go(url) {
        history.replaceState(null, '', url);
        location.reload();
    }

    /** Move to the variant `step` places away (wrapping), keeping the puzzle hash. */
    function cycle(step) {
        const current = loader.key ? keys.indexOf(loader.key) : -1;
        const next = keys[(current + step + keys.length) % keys.length];
        const url = new URL(location.href);
        url.searchParams.set('variant', next);
        go(url.toString());
    }

    /** Load a sample puzzle, keeping the variant. */
    function pick(hash) {
        const url = new URL(location.href);
        url.hash = hash;
        go(url.toString());
    }

    function isTyping(el) {
        if (!el) {
            return false;
        }
        const tag = el.tagName;
        return tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || el.isContentEditable;
    }

    function onKey(e) {
        if (!e.altKey || e.ctrlKey || e.metaKey || e.shiftKey) {
            return;
        }
        if (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight') {
            return;
        }
        if (isTyping(document.activeElement) || isTyping(e.target)) {
            return;
        }
        // Window capture runs before main.js's document listener (main.js:84), which would move the selection.
        e.preventDefault();
        e.stopImmediatePropagation();
        cycle(e.key === 'ArrowLeft' ? -1 : 1);
    }

    function button(text, title, onClick) {
        const b = document.createElement('button');
        b.type = 'button';
        b.textContent = text;
        b.title = title;
        b.setAttribute('aria-label', title);
        // mousedown, not click: main.js acts on document mousedown (main.js:1058); stopping it here keeps the
        // legacy switch out of it.
        b.addEventListener('mousedown', function(e) {
            e.stopPropagation();
        });
        b.addEventListener('click', onClick);
        return b;
    }

    window.PrototypeSwitcher = {
        mount() {
            if (document.getElementById('proto-switcher')) {
                return;
            }
            const style = document.createElement('style');
            style.id = 'proto-switcher-css';
            style.textContent = css;
            document.head.appendChild(style);

            const bar = document.createElement('div');
            bar.id = 'proto-switcher';
            bar.setAttribute('role', 'toolbar');
            bar.setAttribute('aria-label', 'Prototype variant switcher (not part of the design)');
            bar.title = 'Prototype switcher, not part of the design. Alt+Left / Alt+Right cycle variants.';

            const tag = document.createElement('span');
            tag.className = 'proto-tag';
            tag.textContent = 'PROTOTYPE';

            labelEl = document.createElement('span');
            labelEl.className = 'proto-label';
            labelEl.textContent = loader.key ? loader.key : '? (' + loader.requestedKey + ')';

            const select = document.createElement('select');
            select.id = 'proto-sample';
            select.title = 'Sample puzzle (keeps the variant)';
            const samples = window.PrototypeSamples || [];
            let matched = false;
            samples.forEach(function(s, i) {
                const opt = document.createElement('option');
                opt.value = String(i);
                opt.textContent = s.name;
                if (location.hash === s.hash) {
                    opt.selected = true;
                    matched = true;
                }
                select.appendChild(opt);
            });
            if (!matched) {
                const opt = document.createElement('option');
                opt.value = '';
                opt.textContent = 'Other puzzle';
                opt.selected = true;
                select.insertBefore(opt, select.firstChild);
            }
            select.addEventListener('mousedown', function(e) {
                e.stopPropagation();
            });
            select.addEventListener('change', function() {
                if (select.value !== '') {
                    pick(samples[parseInt(select.value, 10)].hash);
                }
            });

            const hint = document.createElement('span');
            hint.className = 'proto-hint';
            hint.textContent = 'Alt+←/→';

            bar.append(tag, button('←', 'Previous variant (Alt+Left)', function() {
                cycle(-1);
            }), labelEl, button('→', 'Next variant (Alt+Right)', function() {
                cycle(1);
            }), select, hint);
            document.body.appendChild(bar);

            window.addEventListener('keydown', onKey, true);
        },

        /** Show "K (name)" once the variant has registered. */
        setName(name) {
            if (labelEl && loader.key) {
                labelEl.textContent = name ? loader.key + ' (' + name + ')' : loader.key;
            }
        }
    };
})();
