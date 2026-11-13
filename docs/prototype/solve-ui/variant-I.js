/*
 * PROTOTYPE (throwaway, branch prototype/solve-ui): solve-UI variant I.
 * Owned by variant I's builder: this file and variant-I.css only. See README.md for the contract.
 * Stub: a placeholder banner over the unchanged legacy page.
 */
(function() {
    'use strict';

    window.PrototypeVariants = window.PrototypeVariants || {};
    window.PrototypeVariants.I = {
        name: 'placeholder',

        /** @param {object} ctx see README.md, "The variant contract" */
        mount(ctx) {
            const banner = ctx.helpers.el('div', {id: 'proto-i-banner', class: 'proto-i-banner'}, [
                'Variant I placeholder'
            ]);
            document.body.appendChild(banner);
        }
    };
})();
