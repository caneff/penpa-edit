// The top bar's controls: undo, redo, Restart, the timer, Pause and Open in Penpa+, and the cover a paused board wears. The theme
// is chosen in the Settings dialog (#181); this file still applies it to the page.
// Reaches Penpa+ only through `engine` (test/ui-boundary.test.mjs fails otherwise).
(function () {
    'use strict';

    const { confirmDialog, iconButton, onDeskReady } = window.uiKit;

    // Penpa+'s pause toggle (main.js), which a paused board still answers.
    const PAUSE_KEY = 'F4';
    const SECONDS_PER_MINUTE = 60;
    const SECONDS_PER_HOUR = 3600;

    // 16x16 line icons in currentColor, from variant L of the prototype.
    const ICONS = {
        undo: '<path d="M3.5 6.5h6.5a3.5 3.5 0 0 1 0 7H7"/><path d="M6.5 3.5l-3 3 3 3"/>',
        redo: '<path d="M12.5 6.5H6a3.5 3.5 0 0 0 0 7h3"/><path d="M9.5 3.5l3 3-3 3"/>',
        restart: '<path d="M2.9 8.6a5.2 5.2 0 1 0 1.5-4.3"/><path d="M2.6 1.9v3.2h3.2"/>',
        pause: '<path d="M5.5 3.5v9M10.5 3.5v9" stroke-width="2.4"/>',
        resume: '<path d="M5 3l8 5-8 5z" fill="currentColor"/>',
        openInPenpa: '<path d="M2.5 5.5h10.5"/><path d="M10.5 3l2.5 2.5-2.5 2.5"/><path d="M13.5 10.5H3"/><path d="M5.5 8L3 10.5 5.5 13"/>'
    };

    const twoDigits = (n) => String(n).padStart(2, '0');

    // 83 seconds is "01:23"; an hour or more adds the hours.
    function clockText(seconds) {
        const whole = Math.floor(seconds);
        const hours = Math.floor(whole / SECONDS_PER_HOUR);
        const minutes = twoDigits(Math.floor(whole / SECONDS_PER_MINUTE) % SECONDS_PER_MINUTE);
        const rest = twoDigits(whole % SECONDS_PER_MINUTE);
        return hours ? `${hours}:${minutes}:${rest}` : `${minutes}:${rest}`;
    }

    onDeskReady(({ bar, cards }) => {
        // The shortcuts are Penpa+'s own keys (main.js), which the solve page passes on.
        const undo = iconButton(ICONS.undo, 'Undo', () => engine.undo(), 'Ctrl+Z');
        const redo = iconButton(ICONS.redo, 'Redo', () => engine.redo(), 'Ctrl+Y');
        const restartButton = iconButton(ICONS.restart, 'Restart', () => { restartDialog.open = true; });
        const pause = iconButton(ICONS.pause, 'Pause', () => (engine.getTimer().covered ? engine.startTimer() : engine.pauseTimer()), PAUSE_KEY);

        // index.html reads the progress back from the store by the same link, so the link and a finished save carry it. Saving on
        // unload alone loses the race with the navigation, and with no save the progress would be gone from both pages.
        const goToPenpa = () => { location.href = `index.html${location.search}${location.hash}`; };
        const openInPenpa = iconButton(ICONS.openInPenpa, 'Open in Penpa+', async () => {
            if (await engine.saveProgress()) {
                goToPenpa();
            } else {
                notSavedDialog.open = true;
            }
        });

        const notSavedDialog = confirmDialog({
            label: 'Progress is not being saved',
            text: 'Saving in this browser is off or was cleared, so Penpa+ would open the puzzle without what you entered here.',
            cancel: 'Stay here',
            confirm: 'Open anyway',
            onConfirm: goToPenpa
        });

        const clock = document.createElement('span');
        clock.className = 'ui-timer';
        clock.setAttribute('role', 'timer');
        clock.setAttribute('aria-label', 'Time');

        // The Restart question is the UI's own dialog; Penpa+'s popup library stays out of the solve page.
        const restartDialog = confirmDialog({
            label: 'Restart the puzzle?',
            text: 'This clears everything you entered and the undo history, and restarts the timer. The givens stay.',
            cancel: 'Cancel',
            confirm: 'Restart puzzle',
            onConfirm: () => engine.restart()
        });

        // Over the whole Board card while paused, so no click reaches the board; it is opaque so a pause hides the puzzle.
        const cover = document.createElement('section');
        cover.className = 'ui-paused';
        cover.setAttribute('aria-label', 'Paused');
        cover.hidden = true;
        cover.innerHTML = `<div>Paused</div><div class="ui-paused-hint">Press ${PAUSE_KEY} or Resume to continue</div>`;
        cards.board.node.append(cover);

        bar.append(undo.node, redo.node, restartButton.node, clock, pause.node, openInPenpa.node);
        bar.after(restartDialog, notSavedDialog);

        function renderTimer() {
            // Only the solver's own pause covers the board: a solve stops the clock and leaves the board usable (#119).
            const { seconds, covered } = engine.getTimer();
            clock.textContent = clockText(seconds);
            if (cover.hidden === covered) {
                cover.hidden = !covered;
                renderHistory();
            }
            pause.show(covered ? ICONS.resume : ICONS.pause, covered ? 'Resume' : 'Pause');
        }

        // The board cannot change while paused, so neither can the history.
        function renderHistory() {
            const { canUndo, canRedo } = engine.getState();
            const { covered } = engine.getTimer();
            undo.node.toggleAttribute('disabled', !canUndo || covered);
            redo.node.toggleAttribute('disabled', !canRedo || covered);
        }

        function renderState() {
            renderHistory();
            const dark = engine.getSettings().theme === 'dark';
            document.documentElement.classList.toggle('wa-dark', dark);
            bar.parentElement.classList.toggle('ui-dark', dark);
        }

        engine.on('timer', renderTimer);
        engine.on('change', renderState);
        renderTimer();
        renderState();
    });
})();
