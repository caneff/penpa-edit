// The top bar's controls: undo, redo, Restart, the timer, Pause and the light/dark toggle, and the cover a paused board wears.
// Reaches Penpa only through `engine` (test/ui-boundary.test.mjs fails otherwise).
(function () {
    'use strict';

    const SECONDS_PER_MINUTE = 60;
    const SECONDS_PER_HOUR = 3600;
    // The one key a paused board still answers: Penpa's own pause toggle.
    const RESUME_KEY = 'F4';

    // 16x16 line icons in currentColor, from variant L of the prototype.
    const ICONS = {
        undo: '<path d="M3.5 6.5h6.5a3.5 3.5 0 0 1 0 7H7"/><path d="M6.5 3.5l-3 3 3 3"/>',
        redo: '<path d="M12.5 6.5H6a3.5 3.5 0 0 0 0 7h3"/><path d="M9.5 3.5l3 3-3 3"/>',
        restart: '<path d="M2.9 8.6a5.2 5.2 0 1 0 1.5-4.3"/><path d="M2.6 1.9v3.2h3.2"/>',
        pause: '<path d="M5.5 3.5v9M10.5 3.5v9" stroke-width="2.4"/>',
        resume: '<path d="M5 3l8 5-8 5z" fill="currentColor"/>',
        darkTheme: '<path d="M13.2 9.6A5.6 5.6 0 0 1 6.4 2.8a5.6 5.6 0 1 0 6.8 6.8z" fill="currentColor" stroke="none"/>',
        lightTheme: '<circle cx="8" cy="8" r="3"/><path d="M8 1.5v2M8 12.5v2M1.5 8h2M12.5 8h2M3.4 3.4l1.4 1.4M11.2 11.2l1.4 1.4M3.4 12.6l1.4-1.4M11.2 4.8l1.4-1.4"/>'
    };

    // The cover is a gate for keys as well: a paused board answers F4 and nothing else. Added now, before the Pinned card's
    // handler, because the first answer wins.
    window.uiKeys.add((e) => (e.key !== RESUME_KEY && engine.getTimer().paused ? 'ui' : undefined));

    function iconButton(icon, label, onClick) {
        const button = document.createElement('wa-button');
        button.setAttribute('appearance', 'filled');
        button.setAttribute('variant', 'neutral');
        button.setAttribute('size', 's');
        button.addEventListener('click', onClick);
        const text = document.createElement('span');
        text.className = 'ui-sr-only';
        button.append(text);
        button.setIcon = (name, newLabel) => {
            button.querySelector('svg')?.remove();
            button.insertAdjacentHTML('afterbegin', '<svg width="16" height="16" viewBox="0 0 16 16" aria-hidden="true" fill="none" ' +
                `stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">${ICONS[name]}</svg>`);
            text.textContent = newLabel;
        };
        button.setIcon(icon, label);
        return button;
    }

    const twoDigits = (n) => String(n).padStart(2, '0');

    // 83 seconds is "01:23"; an hour or more adds the hours.
    function clockText(seconds) {
        const whole = Math.floor(seconds);
        const hours = Math.floor(whole / SECONDS_PER_HOUR);
        const minutes = twoDigits(Math.floor(whole / SECONDS_PER_MINUTE) % SECONDS_PER_MINUTE);
        const rest = twoDigits(whole % SECONDS_PER_MINUTE);
        return hours ? `${hours}:${minutes}:${rest}` : `${minutes}:${rest}`;
    }

    window.deskReady.then(({ bar, cards }) => {
        const undo = iconButton('undo', 'Undo', () => engine.undo());
        const redo = iconButton('redo', 'Redo', () => engine.redo());
        const restartButton = iconButton('restart', 'Restart', () => { restartDialog.open = true; });
        const pause = iconButton('pause', 'Pause', () => (engine.getTimer().paused ? engine.startTimer() : engine.pauseTimer()));
        const themeButton = iconButton('darkTheme', 'Dark theme', () => engine.setTheme(engine.getSettings().theme === 'dark' ? 'light' : 'dark'));

        const clock = document.createElement('span');
        clock.className = 'ui-timer';
        clock.setAttribute('role', 'timer');
        clock.setAttribute('aria-label', 'Time');

        // The Restart question is the UI's own dialog; Penpa's popup library stays out of the solve page.
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

        bar.append(undo, redo, restartButton, clock, pause, themeButton);
        bar.after(restartDialog);

        function renderTimer() {
            const { seconds, paused } = engine.getTimer();
            clock.textContent = clockText(seconds);
            cover.hidden = !paused;
            const label = paused ? 'Resume' : 'Pause';
            if (pause.querySelector('.ui-sr-only').textContent !== label) {
                pause.setIcon(paused ? 'resume' : 'pause', label);
            }
        }

        function renderState() {
            const { canUndo, canRedo } = engine.getState();
            undo.toggleAttribute('disabled', !canUndo);
            redo.toggleAttribute('disabled', !canRedo);
            const dark = engine.getSettings().theme === 'dark';
            document.documentElement.classList.toggle('wa-dark', dark);
            bar.parentElement.classList.toggle('ui-dark', dark);
            const next = dark ? 'Light theme' : 'Dark theme';
            if (themeButton.querySelector('.ui-sr-only').textContent !== next) {
                themeButton.setIcon(dark ? 'lightTheme' : 'darkTheme', next);
            }
        }

        engine.on('timer', renderTimer);
        engine.on('change', renderState);
        renderTimer();
        renderState();
    }, () => {});
})();
