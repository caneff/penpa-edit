// The key the UI's per-puzzle storage uses: the same puzzle, the same key, whatever link opened it, and whatever Change size did to its size.
(function () {
    'use strict';

    window.puzzleHash = () => engine.getOriginalPuzzleId();
})();
