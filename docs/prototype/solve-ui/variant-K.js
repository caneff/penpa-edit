/*
 * PROTOTYPE (throwaway, branch prototype/solve-ui): solve-UI variant K.
 * Owned by variant K's builder: this file and variant-K.css only. See README.md for the contract.
 * Stub: a placeholder banner over the unchanged legacy page.
 */
(function() {
    'use strict';

    window.PrototypeVariants = window.PrototypeVariants || {};
    window.PrototypeVariants.K = {
        name: 'placeholder',

        /** @param {object} ctx see README.md, "The variant contract" */
        mount(ctx) {
            const banner = ctx.helpers.el('div', {id: 'proto-k-banner', class: 'proto-k-banner'}, [
                'Variant K placeholder'
            ]);
            document.body.appendChild(banner);
        }
    };
})();
