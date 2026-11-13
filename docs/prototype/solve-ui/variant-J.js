/*
 * PROTOTYPE (throwaway, branch prototype/solve-ui): solve-UI variant J.
 * Owned by variant J's builder: this file and variant-J.css only. See README.md for the contract.
 * Stub: a placeholder banner over the unchanged legacy page.
 */
(function() {
    'use strict';

    window.PrototypeVariants = window.PrototypeVariants || {};
    window.PrototypeVariants.J = {
        name: 'placeholder',

        /** @param {object} ctx see README.md, "The variant contract" */
        mount(ctx) {
            const banner = ctx.helpers.el('div', {id: 'proto-j-banner', class: 'proto-j-banner'}, [
                'Variant J placeholder'
            ]);
            document.body.appendChild(banner);
        }
    };
})();
