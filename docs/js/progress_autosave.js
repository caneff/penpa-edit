// caneff: saves a solve's progress to the store after each change (#162), so index.html does not rely on Penpa+'s own save
// as the page unloads, which is not awaited.

// Writes the open puzzle's progress to the store where Penpa+ reads it back at boot, the way PenpaProgress.save does,
// and resolves true once the write has finished. Resolves false, writing nothing, when Penpa+ would not save it: the
// setting is off, progress was cleared, the page is not in solve mode or replaying, or the store is unavailable.
// PenpaProgress.save does not wait for its write, so this repeats its conditions and its stored text (the duplicate
// link with `&l=solvedup`) and awaits the write itself. A failed write rejects.
// MVP gap: a second copy of PenpaProgress.save's conditions, until the engine API owns saving.
async function saveProgressNow() {
    if (!pu.url || !UserSettings.save_current_puzzle || pu.mmode !== 'solve' || pu.replay ||
        !(await PenpaProgress.canSaveProgress())) {
        return false;
    }
    await localforage.setItem(PenpaProgress.getHash(pu.url), pu.maketext_duplicate() + '&l=solvedup');
    return true;
}

// MVP gap: patches Puzzle's methods until the engine API reports changes. Puzzle.record logs every edit; undo and redo move the log without calling it. The save waits one task so the edit's
// own call has finished, and several changes in that task make one save.
function startProgressAutosave() {
    let saveQueued = false;
    const saveSoon = () => {
        if (saveQueued) {
            return;
        }
        saveQueued = true;
        setTimeout(async () => {
            saveQueued = false;
            try {
                await saveProgressNow();
            } catch (err) {
                console.error("progress autosave: could not save to local storage:", err);
            }
        }, 0);
    };
    for (const name of ['record', 'undo', 'redo']) {
        const original = Puzzle.prototype[name];
        Puzzle.prototype[name] = function (...args) {
            const result = original.apply(this, args);
            saveSoon();
            return result;
        };
    }
}

// Only index.html autosaves: solve.html's engine bridge, which defines `engine`, loads first.
if (typeof engine === 'undefined') {
    startProgressAutosave();
}
