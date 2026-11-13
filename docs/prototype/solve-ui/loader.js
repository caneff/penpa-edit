/*
 * PROTOTYPE (throwaway, branch prototype/solve-ui): solve-UI variant loader.
 *
 * Loaded last by docs/index.html. With no `?variant=` search param it does nothing, so the page is unchanged.
 * With `?variant=K` (K in A-K) it:
 *   1. hides the `variant` param from Penpa+'s boot() for the moment boot reads the URL, because boot() treats any
 *      search string as the puzzle link and only falls back to the `#` hash when the search is empty
 *      (general.js:29-32). The address bar keeps `?variant=K` and the puzzle's `#...` unchanged;
 *   2. waits for boot() and its async load() (general.js:19-64, 1969) to finish;
 *   3. loads engine-bridge.js, switcher.js, samples.js, then variant-K.css and variant-K.js;
 *   4. calls window.PrototypeVariants[K].mount(ctx).
 *
 * Runs before main.js's `onload` (index.html injects it with async = false, after general.js), so the wrappers
 * below are in place when onload calls boot() (main.js:69).
 */
(function() {
    'use strict';

    const VARIANTS = 'ABCDEFGHIJK'.split('');
    const params = new URLSearchParams(location.search);
    const key = (params.get('variant') || '').toUpperCase();
    if (!key) {
        return; // No param: the page stays exactly as Penpa+ ships it.
    }

    const base = document.currentScript.src.replace(/loader\.js(\?.*)?$/, '');
    window.PrototypeVariants = window.PrototypeVariants || {};
    window.PrototypeLoader = {
        key: VARIANTS.includes(key) ? key : null,
        requestedKey: key,
        keys: VARIANTS,
        base: base,
        errors: []
    };

    /** Inject a classic script and resolve when it has run. */
    function loadScript(src) {
        return new Promise(function(resolve, reject) {
            const s = document.createElement('script');
            s.src = src;
            s.async = false;
            s.onload = resolve;
            s.onerror = function() {
                reject(new Error('Failed to load ' + src));
            };
            document.head.appendChild(s);
        });
    }

    /** Inject a stylesheet and resolve when it has loaded (or failed: a missing CSS file is not fatal). */
    function loadStyle(href) {
        return new Promise(function(resolve) {
            const l = document.createElement('link');
            l.rel = 'stylesheet';
            l.href = href;
            l.onload = resolve;
            l.onerror = resolve;
            document.head.appendChild(l);
        });
    }

    // Cache-bust on every page load: the four builders edit these files while the server runs.
    const bust = '?t=' + Date.now();
    const helpersLoaded = Promise.all([
        loadScript(base + 'engine-bridge.js' + bust),
        loadScript(base + 'samples.js' + bust),
        loadScript(base + 'switcher.js' + bust)
    ]);

    // Track load(): boot() calls it without awaiting (general.js:57-60), and load() itself awaits localforage
    // (general.js:2516), so boot()'s own promise settles before the puzzle is on the board.
    let loadPromise = null;
    const originalLoad = window.load;
    window.load = function() {
        loadPromise = originalLoad.apply(this, arguments);
        return loadPromise;
    };

    let bootPromise = null;
    const originalBoot = window.boot;
    window.boot = function() {
        const fullUrl = location.href;
        const url = new URL(fullUrl);
        url.searchParams.delete('variant');
        // boot() reads location.search synchronously before its first await (general.js:29-32).
        history.replaceState(history.state, '', url.pathname + url.search + url.hash);
        try {
            bootPromise = originalBoot.apply(this, arguments);
        } finally {
            history.replaceState(history.state, '', fullUrl);
        }
        return bootPromise;
    };

    function nextFrame() {
        return new Promise(function(resolve) {
            requestAnimationFrame(function() {
                requestAnimationFrame(resolve);
            });
        });
    }

    function waitForBoot() {
        return new Promise(function(resolve) {
            window.addEventListener('load', resolve);
        }).then(function() {
            return bootPromise;
        }).then(function() {
            return loadPromise;
        }).catch(function(err) {
            window.PrototypeLoader.errors.push(String(err));
            console.error('[prototype] boot failed', err);
        }).then(nextFrame);
    }

    function mount() {
        const loader = window.PrototypeLoader;
        const bridge = window.PrototypeBridge;
        bridge.install();
        window.PrototypeSwitcher.mount();
        if (!loader.key) {
            console.error('[prototype] unknown variant ' + loader.requestedKey + '; use one of ' + VARIANTS.join(', '));
            return;
        }
        const variant = window.PrototypeVariants[loader.key];
        if (!variant || typeof variant.mount !== 'function') {
            console.error('[prototype] variant-' + loader.key + '.js did not register window.PrototypeVariants.' + loader.key);
            return;
        }
        window.PrototypeSwitcher.setName(variant.name || '');
        document.documentElement.classList.add('proto-variant-' + loader.key);
        variant.mount(bridge.makeContext(loader.key));
        loader.mounted = true;
        document.dispatchEvent(new CustomEvent('prototype:mounted', {detail: {key: loader.key}}));
    }

    Promise.all([helpersLoaded, waitForBoot()]).then(function() {
        if (!window.PrototypeLoader.key) {
            return null;
        }
        const k = window.PrototypeLoader.key;
        return Promise.all([
            loadStyle(base + 'variant-' + k + '.css' + bust),
            loadScript(base + 'variant-' + k + '.js' + bust)
        ]);
    }).then(mount).catch(function(err) {
        window.PrototypeLoader.errors.push(String(err));
        console.error('[prototype] mount failed', err);
    });
})();
