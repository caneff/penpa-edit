// Floats a picker's list over the page: below its field when there is room, else above it, with its height capped to the room
// and scrolling inside, so opening it never resizes the card it belongs to. Knows no `engine`.
(function () {
    'use strict';

    // The gap kept to the field and to the window's edge.
    const GAP = 4;
    const EDGE = 8;

    // `list` is placed whenever it is shown, or its content changes while it is shown, or the window resizes or something scrolls.
    function floatList(field, list) {
        function place() {
            if (list.hidden) {
                return;
            }
            // Measured at the CSS height cap, so a list that shrank can grow back.
            list.style.maxHeight = '';
            const at = field.getBoundingClientRect();
            const border = list.offsetHeight - list.clientHeight;
            const natural = Math.min(list.scrollHeight + border, list.offsetHeight + (list.scrollHeight - list.clientHeight));
            const below = window.innerHeight - at.bottom - GAP - EDGE;
            const above = at.top - GAP - EDGE;
            const goesBelow = natural <= below || below >= above;
            const height = Math.max(0, Math.min(natural, goesBelow ? below : above));
            const width = Math.min(at.width, window.innerWidth - 2 * EDGE);
            list.style.maxHeight = `${height}px`;
            list.style.width = `${width}px`;
            list.style.left = `${Math.max(EDGE, Math.min(window.innerWidth - EDGE - width, at.left))}px`;
            list.style.top = `${goesBelow ? at.bottom + GAP : at.top - GAP - height}px`;
        }

        new MutationObserver(place).observe(list, { subtree: true, childList: true, attributes: true, attributeFilter: ['hidden'] });
        window.addEventListener('resize', place);
        // Capturing, since a scroll inside a card does not bubble.
        window.addEventListener('scroll', place, true);
    }

    window.floatList = floatList;
})();
