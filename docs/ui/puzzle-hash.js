// The key the UI's per-puzzle storage uses: the same puzzle, the same key.
(function () {
    'use strict';

    const FNV_OFFSET_BASIS = 0x811c9dc5;
    const FNV_PRIME = 0x01000193;

    // FNV-1a over the link's `#` part.
    window.puzzleHash = function puzzleHash() {
        let hash = FNV_OFFSET_BASIS;
        for (const char of location.hash) {
            hash = Math.imul(hash ^ char.codePointAt(0), FNV_PRIME) >>> 0;
        }
        return hash.toString(16);
    };
})();
