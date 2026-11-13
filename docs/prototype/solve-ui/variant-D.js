/*
 * PROTOTYPE (throwaway, branch prototype/solve-ui): solve-UI variant D.
 * Owned by variant D's builder: this file and variant-D.css only. See README.md for the contract.
 * Stub: a placeholder banner over the unchanged legacy page.
 */
(function() {
    'use strict';

    window.PrototypeVariants = window.PrototypeVariants || {};
    window.PrototypeVariants.D = {
        name: 'placeholder',

        /** @param {object} ctx see README.md, "The variant contract" */
        mount(ctx) {
            const banner = ctx.helpers.el('div', {id: 'proto-d-banner', class: 'proto-d-banner'}, [
                'Variant D placeholder'
            ]);
            document.body.appendChild(banner);
        }
    };
})();
