// The key the UI's per-puzzle storage uses: the same puzzle, the same key, whatever link opened it.
(function () {
    'use strict';

    window.puzzleHash = () => engine.getPuzzleId();
})();
