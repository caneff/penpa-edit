// The top bar's controls: undo, redo, Restart, the timer, Pause, the light/dark toggle and Open in Penpa+, and the cover a paused board wears.
// Reaches Penpa+ only through `engine` (test/ui-boundary.test.mjs fails otherwise).
(function () {
    'use strict';

    const { iconButton, onDeskReady } = window.uiKit;

    const SECONDS_PER_MINUTE = 60;
    const SECONDS_PER_HOUR = 3600;

    // 16x16 line icons in currentColor, from variant L of the prototype.
    const ICONS = {
        undo: '<path d="M3.5 6.5h6.5a3.5 3.5 0 0 1 0 7H7"/><path d="M6.5 3.5l-3 3 3 3"/>',
        redo: '<path d="M12.5 6.5H6a3.5 3.5 0 0 0 0 7h3"/><path d="M9.5 3.5l3 3-3 3"/>',
        restart: '<path d="M2.9 8.6a5.2 5.2 0 1 0 1.5-4.3"/><path d="M2.6 1.9v3.2h3.2"/>',
        pause: '<path d="M5.5 3.5v9M10.5 3.5v9" stroke-width="2.4"/>',
        resume: '<path d="M5 3l8 5-8 5z" fill="currentColor"/>',
        darkTheme: '<path d="M13.2 9.6A5.6 5.6 0 0 1 6.4 2.8a5.6 5.6 0 1 0 6.8 6.8z" fill="currentColor" stroke="none"/>',
        openInPenpa: '<path d="M2.5 5.5h10.5"/><path d="M10.5 3l2.5 2.5-2.5 2.5"/><path d="M13.5 10.5H3"/><path d="M5.5 8L3 10.5 5.5 13"/>',
        lightTheme: '<circle cx="8" cy="8" r="3"/><path d="M8 1.5v2M8 12.5v2M1.5 8h2M12.5 8h2M3.4 3.4l1.4 1.4M11.2 11.2l1.4 1.4M3.4 12.6l1.4-1.4M11.2 4.8l1.4-1.4"/>'
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
        const undo = iconButton(ICONS.undo, 'Undo', () => engine.undo());
        const redo = iconButton(ICONS.redo, 'Redo', () => engine.redo());
        const restartButton = iconButton(ICONS.restart, 'Restart', () => { restartDialog.open = true; });
        const pause = iconButton(ICONS.pause, 'Pause', () => (engine.getTimer().covered ? engine.startTimer() : engine.pauseTimer()));
        const themeButton = iconButton(ICONS.darkTheme, 'Dark theme', () => engine.setTheme(engine.getSettings().theme === 'dark' ? 'light' : 'dark'));

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

        const notSavedDialog = document.createElement('wa-dialog');
        notSavedDialog.setAttribute('label', 'Progress is not being saved');
        notSavedDialog.innerHTML = 'Saving in this browser is off or was cleared, so Penpa+ would open the puzzle without what you entered here.' +
            '<wa-button slot="footer" appearance="plain" data-dialog="close">Stay here</wa-button>' +
            '<wa-button slot="footer" variant="danger" data-dialog="close" data-open-anyway>Open anyway</wa-button>';
        notSavedDialog.querySelector('[data-open-anyway]').addEventListener('click', goToPenpa);

        const clock = document.createElement('span');
        clock.className = 'ui-timer';
        clock.setAttribute('role', 'timer');
        clock.setAttribute('aria-label', 'Time');

        // The Restart question is the UI's own dialog; Penpa+'s popup library stays out of the solve page.
        const restartDialog = document.createElement('wa-dialog');
        restartDialog.setAttribute('label', 'Restart the puzzle?');
        restartDialog.innerHTML = 'This clears everything you entered and the undo history, and restarts the timer. The givens stay.' +
            '<wa-button slot="footer" appearance="plain" data-dialog="close">Cancel</wa-button>' +
            '<wa-button slot="footer" variant="danger" data-dialog="close" data-restart>Restart puzzle</wa-button>';
        restartDialog.querySelector('[data-restart]').addEventListener('click', () => engine.restart());

        // Over the whole Board card while paused, so no click reaches the board; it is opaque so a pause hides the puzzle.
        const cover = document.createElement('section');
        cover.className = 'ui-paused';
        cover.setAttribute('aria-label', 'Paused');
        cover.hidden = true;
        cover.innerHTML = '<div>Paused</div><div class="ui-paused-hint">Press F4 or Resume to continue</div>';
        cards.board.node.append(cover);

        bar.append(undo.node, redo.node, restartButton.node, clock, pause.node, themeButton.node, openInPenpa.node);
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
            themeButton.show(dark ? ICONS.lightTheme : ICONS.darkTheme, dark ? 'Light theme' : 'Dark theme');
        }

        engine.on('timer', renderTimer);
        engine.on('change', renderState);
        renderTimer();
        renderState();
    });
})();
