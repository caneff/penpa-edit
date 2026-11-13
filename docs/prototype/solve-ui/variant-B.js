/*
 * PROTOTYPE (throwaway, branch prototype/solve-ui): solve-UI variant B.
 * Owned by variant B's builder: this file and variant-B.css only. See README.md for the contract.
 * Stub: a placeholder banner over the unchanged legacy page.
 */
(function() {
    'use strict';

    window.PrototypeVariants = window.PrototypeVariants || {};
    window.PrototypeVariants.B = {
        name: 'placeholder',

        /** @param {object} ctx see README.md, "The variant contract" */
        mount(ctx) {
            const banner = ctx.helpers.el('div', {id: 'proto-b-banner', class: 'proto-b-banner'}, [
                'Variant B placeholder'
            ]);
            document.body.appendChild(banner);
        }
    };
})();
