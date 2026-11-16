// Puts Penpa's stylesheets in the cascade layer `penpa`, below everything else, and reverts that layer for the UI root,
// so Penpa's broad selectors (`*`, `body`, `.button`) never reach the UI's controls (variant O of the prototype).
// A <style> first in <head> re-imports each of Penpa's <link>s into the layer, and the links are disabled once the
// imports have loaded, so the page is never unstyled. `@layer penpa;` comes first so every other layer, Web Awesome's
// included, ranks above it.
(function () {
    'use strict';

    const THEME_LINK_ID = 'color_theme';
    const PENPA_STYLE_LINK_IDS = ['font_awesome_css', THEME_LINK_ID, 'base_structure', 'tab_setting_css', 'custom_color_css',
        'constraints_settings_css'];
    const UI_ROOT = '.ui-root';

    const links = PENPA_STYLE_LINK_IDS.map((id) => document.getElementById(id));
    const style = document.createElement('style');

    // Rewritten after a theme switch, because Penpa swaps the theme link's href (settings.js) and the imports must follow it.
    function writeImports() {
        style.textContent = '@layer penpa;\n' +
            links.map((link) => `@import url("${link.href}") layer(penpa);`).join('\n') + '\n' +
            `@layer penpa { ${UI_ROOT}, ${UI_ROOT} * { all: revert-layer; } }\n`;
    }

    writeImports();
    style.onload = () => {
        // A rewrite reloads the imports, and this handler must run only for the first load.
        style.onload = null;
        links.forEach((link) => { link.disabled = true; });
        const themeLink = document.getElementById(THEME_LINK_ID);
        new MutationObserver(writeImports).observe(themeLink, { attributes: true, attributeFilter: ['href'] });
    };
    document.head.prepend(style);
})();
