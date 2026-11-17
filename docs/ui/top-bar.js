// The top bar's controls: undo, redo, the trial buttons, Restart, the timer, Pause and the Penpa+ button, the cover a paused board wears (and what it
// switches off), and the dialog that says the puzzle is solved. The theme is chosen in the Settings dialog (#181); this file
// still applies it to the page.
// Reaches Penpa+ only through `engine` (test/ui-boundary.test.mjs fails otherwise).
(function () {
    'use strict';

    const { confirmDialog, el, iconButton, onDeskReady, setDark, textButton } = window.uiKit;

    // Penpa+'s pause toggle (main.js), which a paused board still answers.
    const PAUSE_KEY = 'F4';
    const UNDO_KEY = 'Ctrl+Z';
    const REDO_KEY = 'Ctrl+Y';
    const SECONDS_PER_MINUTE = 60;
    const SECONDS_PER_HOUR = 3600;

    // 16x16 line icons in currentColor, from variant L of the prototype.
    const ICONS = {
        undo: '<path d="M3.5 6.5h6.5a3.5 3.5 0 0 1 0 7H7"/><path d="M6.5 3.5l-3 3 3 3"/>',
        redo: '<path d="M12.5 6.5H6a3.5 3.5 0 0 0 0 7h3"/><path d="M9.5 3.5l3 3-3 3"/>',
        restart: '<path d="M2.9 8.6a5.2 5.2 0 1 0 1.5-4.3"/><path d="M2.6 1.9v3.2h3.2"/>',
        pause: '<path d="M5.5 3.5v9M10.5 3.5v9" stroke-width="2.4"/>',
        resume: '<path d="M5 3l8 5-8 5z" fill="currentColor"/>'
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
        const undo = iconButton(ICONS.undo, 'Undo', () => engine.undo(), UNDO_KEY);
        const redo = iconButton(ICONS.redo, 'Redo', () => engine.redo(), REDO_KEY);

        // Trial mode (#258): each stage is the history's length when its Try was pressed, innermost last. Kept in memory only,
        // so a reload keeps the entries and drops the stages.
        const stages = [];
        const tryButton = textButton('Try', 'Start a trial: what you enter next can be kept or discarded in one click', () => {
            stages.push(engine.getState().historyLength);
            renderHistory();
        });
        const trialDepth = el('span', { class: 'ui-trial-depth' });
        const keep = textButton('Keep', 'End this trial and keep what you entered in it', () => keepStages(1));
        const discard = textButton('Discard', 'Undo everything entered since this trial began, and end it', () => discardStages(1));
        const keepAll = textButton('Keep all', 'End every trial and keep everything', () => keepStages(stages.length));
        const discardAll = textButton('Discard all', 'Undo everything entered since the first trial began, and end every trial',
            () => discardStages(stages.length));
        // Keep all and Discard all would repeat Keep and Discard with one stage on.
        const allButtons = el('span', { class: 'ui-trial-all' }, [keepAll.node, discardAll.node]);
        const trial = el('span', { class: 'ui-trial' }, [trialDepth, keep.node, discard.node, allButtons]);
        const trialButtons = [tryButton, keep, discard, keepAll, discardAll];

        // Ends the `count` innermost stages, keeping their entries.
        function keepStages(count) {
            stages.length -= count;
            renderHistory();
        }

        // Takes the history back to where the outermost of the `count` innermost stages began, then ends them. It undoes through
        // the engine's own undo, so what it takes back goes to the redo stack as a plain undo's would.
        function discardStages(count) {
            const start = stages[stages.length - count];
            while (engine.getState().historyLength > start) {
                if (!engine.undo()) {
                    break;
                }
            }
            keepStages(count);
        }

        // An undo by hand past a stage's start, to before its Try, ends that stage.
        function endStagesUndone() {
            const { historyLength } = engine.getState();
            while (stages.length && stages.at(-1) > historyLength) {
                stages.pop();
            }
        }

        const restartButton = iconButton(ICONS.restart, 'Restart', () => { restartDialog.open = true; });
        window.uiKeys.describe('Page', [
            { keys: UNDO_KEY, text: 'Undo' },
            { keys: REDO_KEY, text: 'Redo' },
            { keys: PAUSE_KEY, text: 'Pause or resume the clock' }
        ]);
        const pause = iconButton(ICONS.pause, 'Pause', () => (engine.getTimer().covered ? engine.startTimer() : engine.pauseTimer()), PAUSE_KEY);

        // index.html reads the progress back from the store by the same link, so the link and a finished save carry it. Saving on
        // unload alone loses the race with the navigation, and with no save the progress would be gone from both pages.
        const goToPenpa = () => { location.href = `index.html${location.search}${location.hash}`; };
        const openInPenpa = textButton('Penpa+', 'Open this puzzle in Penpa+', async () => {
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
            onConfirm: () => {
                stages.length = 0;
                engine.restart();
            }
        });

        // Over the whole Board card while paused, so no click reaches the board; it is opaque so a pause hides the puzzle.
        const cover = document.createElement('section');
        cover.className = 'ui-paused';
        cover.setAttribute('aria-label', 'Paused');
        cover.hidden = true;
        cover.innerHTML = `<div>Paused</div><div class="ui-paused-hint">Press ${PAUSE_KEY} or Resume to continue</div>`;
        // The top bar's Resume is an icon, so the cover that names "Resume" has a button of its own.
        const coverResume = document.createElement('wa-button');
        coverResume.setAttribute('variant', 'brand');
        coverResume.textContent = 'Resume';
        coverResume.addEventListener('click', () => engine.startTimer());
        cover.append(coverResume);
        cards.board.node.append(cover);

        // The solved message: the UI's own dialog, never Penpa+'s popup. Its words are the setter's, shown as text.
        const solvedDialog = document.createElement('wa-dialog');
        solvedDialog.setAttribute('label', 'Puzzle solved');
        const solvedTitle = document.createElement('div');
        solvedTitle.className = 'ui-solved-title';
        const solvedMessage = document.createElement('div');
        solvedMessage.className = 'ui-solved-message';
        const solvedClose = document.createElement('wa-button');
        solvedClose.setAttribute('slot', 'footer');
        solvedClose.setAttribute('variant', 'brand');
        solvedClose.setAttribute('data-dialog', 'close');
        solvedClose.textContent = 'Close';
        solvedDialog.append(solvedTitle, solvedMessage, solvedClose);
        engine.on('solved', ({ title, message }) => {
            solvedTitle.textContent = title;
            solvedTitle.hidden = !title;
            solvedMessage.textContent = message;
            solvedDialog.open = true;
        });

        // While the board is paused, only Resume, Settings and Penpa+ work: the pins, Mode and Recent are inert.
        const pausedOff = [cards.pins.body, cards.mode.body, cards.recent.body];

        bar.append(undo.node, redo.node, tryButton.node, trial, restartButton.node, clock, pause.node, openInPenpa.node);
        bar.after(restartDialog, notSavedDialog, solvedDialog);

        function renderTimer() {
            // Only the solver's own pause covers the board: a solve stops the clock and leaves the board usable (#119).
            const { seconds, covered, solved } = engine.getTimer();
            // A solved clock is stopped for good: a check mark and its own colour keep it from looking stuck.
            clock.textContent = solved ? `\u2713 ${clockText(seconds)}` : clockText(seconds);
            clock.classList.toggle('is-solved', solved);
            if (cover.hidden === covered) {
                cover.hidden = !covered;
                restartButton.node.toggleAttribute('disabled', covered);
                pausedOff.forEach((body) => body.toggleAttribute('inert', covered));
                renderHistory();
            }
            pause.show(covered ? ICONS.resume : ICONS.pause, covered ? 'Resume' : 'Pause');
            // A solved clock is stopped for good, so there is nothing to pause.
            pause.node.toggleAttribute('disabled', solved && !covered);
        }

        // The board cannot change while paused, so neither can the history nor the trials.
        function renderHistory() {
            const { canUndo, canRedo } = engine.getState();
            const { covered } = engine.getTimer();
            undo.node.toggleAttribute('disabled', !canUndo || covered);
            redo.node.toggleAttribute('disabled', !canRedo || covered);
            trial.hidden = !stages.length;
            allButtons.hidden = stages.length < 2;
            // Written only when it differs: a new text node is a page change, which would wake `change` again every frame.
            const depthText = `Trial ${stages.length}`;
            if (trialDepth.textContent !== depthText) {
                trialDepth.textContent = depthText;
            }
            trialButtons.forEach((button) => button.node.toggleAttribute('disabled', covered));
        }

        function renderState() {
            endStagesUndone();
            renderHistory();
            const dark = engine.getSettings().theme === 'dark';
            setDark(bar.parentElement, dark);
        }

        engine.on('timer', renderTimer);
        engine.on('change', renderState);
        renderTimer();
        renderState();
    });
})();
