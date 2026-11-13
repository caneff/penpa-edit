/*
 * PROTOTYPE (throwaway, branch prototype/solve-ui): solve-UI variant G.
 * Owned by variant G's builder: this file and variant-G.css only. See README.md for the contract.
 * Stub: a placeholder banner over the unchanged legacy page.
 */
(function() {
    'use strict';

    window.PrototypeVariants = window.PrototypeVariants || {};
    window.PrototypeVariants.G = {
        name: 'placeholder',

        /** @param {object} ctx see README.md, "The variant contract" */
        mount(ctx) {
            const banner = ctx.helpers.el('div', {id: 'proto-g-banner', class: 'proto-g-banner'}, [
                'Variant G placeholder'
            ]);
            document.body.appendChild(banner);
        }
    };
})();
