/*
 * PROTOTYPE (throwaway, branch prototype/solve-ui): solve-UI variant F.
 * Owned by variant F's builder: this file and variant-F.css only. See README.md for the contract.
 * Stub: a placeholder banner over the unchanged legacy page.
 */
(function() {
    'use strict';

    window.PrototypeVariants = window.PrototypeVariants || {};
    window.PrototypeVariants.F = {
        name: 'placeholder',

        /** @param {object} ctx see README.md, "The variant contract" */
        mount(ctx) {
            const banner = ctx.helpers.el('div', {id: 'proto-f-banner', class: 'proto-f-banner'}, [
                'Variant F placeholder'
            ]);
            document.body.appendChild(banner);
        }
    };
})();
