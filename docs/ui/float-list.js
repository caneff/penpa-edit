// Floats a picker's list over the page: below its field when there is room, else above it, with its height capped to the room
// and scrolling inside, so opening it never resizes the card it belongs to. Knows no `engine`.
(function () {
    'use strict';

    // How far the list keeps from its field, and from the window's edges and the top bar.
    const FIELD_GAP = 4;
    const EDGE_GAP = 8;

    function floatList(field, list) {
        const barBottom = () => document.querySelector('.ui-bar')?.getBoundingClientRect().bottom ?? 0;

        function place() {
            if (list.hidden) {
                return;
            }
            // The cap is lifted to measure, so a list that shrank can grow back; the clamp that follows would otherwise cut the scroll.
            const scrolled = list.scrollTop;
            list.style.maxHeight = '';
            const at = field.getBoundingClientRect();
            const natural = list.scrollHeight + list.offsetHeight - list.clientHeight;
            const topLimit = barBottom() + EDGE_GAP;
            const bottomLimit = window.innerHeight - EDGE_GAP;
            const below = bottomLimit - at.bottom - FIELD_GAP;
            const above = at.top - FIELD_GAP - topLimit;
            const goesBelow = natural <= below || below >= above;
            // A field scrolled out of the window still gets a list inside it.
            const height = Math.max(0, Math.min(natural, goesBelow ? below : above, bottomLimit - topLimit));
            const top = goesBelow ? at.bottom + FIELD_GAP : at.top - FIELD_GAP - height;
            const width = Math.min(at.width, window.innerWidth - 2 * EDGE_GAP);
            list.style.maxHeight = `${height}px`;
            list.style.width = `${width}px`;
            list.style.left = `${Math.max(EDGE_GAP, Math.min(window.innerWidth - EDGE_GAP - width, at.left))}px`;
            list.style.top = `${Math.max(topLimit, Math.min(bottomLimit - height, top))}px`;
            list.scrollTop = scrolled;
        }

        new MutationObserver(place).observe(list, { subtree: true, childList: true, attributes: true, attributeFilter: ['hidden'] });
        window.addEventListener('resize', place);
        // Capturing, since a scroll inside a card does not bubble; the list's own scroll moves nothing.
        window.addEventListener('scroll', (e) => { if (!list.contains(e.target)) { place(); } }, true);
    }

    window.floatList = floatList;
})();
