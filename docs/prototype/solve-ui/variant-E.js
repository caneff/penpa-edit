/*
 * PROTOTYPE (throwaway, branch prototype/solve-ui): solve-UI variant E.
 * Owned by variant E's builder: this file and variant-E.css only. See README.md for the contract.
 * Stub: a placeholder banner over the unchanged legacy page.
 */
(function() {
    'use strict';

    window.PrototypeVariants = window.PrototypeVariants || {};
    window.PrototypeVariants.E = {
        name: 'placeholder',

        /** @param {object} ctx see README.md, "The variant contract" */
        mount(ctx) {
            const banner = ctx.helpers.el('div', {id: 'proto-e-banner', class: 'proto-e-banner'}, [
                'Variant E placeholder'
            ]);
            document.body.appendChild(banner);
        }
    };
})();
