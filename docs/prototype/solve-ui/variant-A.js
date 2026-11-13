/*
 * PROTOTYPE (throwaway, branch prototype/solve-ui): solve-UI variant A.
 * Owned by variant A's builder: this file and variant-A.css only. See README.md for the contract.
 * Stub: a placeholder banner over the unchanged legacy page.
 */
(function() {
    'use strict';

    window.PrototypeVariants = window.PrototypeVariants || {};
    window.PrototypeVariants.A = {
        name: 'placeholder',

        /** @param {object} ctx see README.md, "The variant contract" */
        mount(ctx) {
            const banner = ctx.helpers.el('div', {id: 'proto-a-banner', class: 'proto-a-banner'}, [
                'Variant A placeholder'
            ]);
            document.body.appendChild(banner);
        }
    };
})();
