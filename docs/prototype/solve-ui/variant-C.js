/*
 * PROTOTYPE (throwaway, branch prototype/solve-ui): solve-UI variant C.
 * Owned by variant C's builder: this file and variant-C.css only. See README.md for the contract.
 * Stub: a placeholder banner over the unchanged legacy page.
 */
(function() {
    'use strict';

    window.PrototypeVariants = window.PrototypeVariants || {};
    window.PrototypeVariants.C = {
        name: 'placeholder',

        /** @param {object} ctx see README.md, "The variant contract" */
        mount(ctx) {
            const banner = ctx.helpers.el('div', {id: 'proto-c-banner', class: 'proto-c-banner'}, [
                'Variant C placeholder'
            ]);
            document.body.appendChild(banner);
        }
    };
})();
