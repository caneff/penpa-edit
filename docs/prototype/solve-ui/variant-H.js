/*
 * PROTOTYPE (throwaway, branch prototype/solve-ui): solve-UI variant H.
 * Owned by variant H's builder: this file and variant-H.css only. See README.md for the contract.
 * Stub: a placeholder banner over the unchanged legacy page.
 */
(function() {
    'use strict';

    window.PrototypeVariants = window.PrototypeVariants || {};
    window.PrototypeVariants.H = {
        name: 'placeholder',

        /** @param {object} ctx see README.md, "The variant contract" */
        mount(ctx) {
            const banner = ctx.helpers.el('div', {id: 'proto-h-banner', class: 'proto-h-banner'}, [
                'Variant H placeholder'
            ]);
            document.body.appendChild(banner);
        }
    };
})();
