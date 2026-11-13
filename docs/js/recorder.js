// The recorder: with `?record=1` in the page's query, writes the solver's inputs as the steps of a recording
// (GLOSSARY.md) and offers them as a download. Without the flag it does nothing. The step format is `live/replay.mjs`'s.
(function () {
    if (!/(^|&)record=1(&|$)/.test(location.search.slice(1))) return;

    const RECORDER_VERSION = 1;
    const FILE_NAME = 'recording.steps.json';
    const KEY_CALLS = ['key_number', 'key_space', 'key_shiftspace', 'key_backspace', 'key_arrow'];
    const MODE_CALLS = ['mode_set', 'submode_check', 'stylemode_check'];
    // A solver's input arrives by one of these. Listening in the capture phase on `window` wraps a new `pu` before
    // `main.js`'s own handlers call it.
    const INPUT_EVENTS = ['mousedown', 'mousemove', 'mouseup', 'mouseout', 'dblclick', 'keydown', 'click'];

    const otherParams = location.search.slice(1).split('&').filter((p) => p && p !== 'record=1');
    const source = (otherParams.length ? '?' + otherParams.join('&') : '') + location.hash;
    const steps = [];
    const hooked = new WeakSet();
    // Nonzero inside a wrapped call, so a call the engine makes from inside another (mode_set's submode_check) is not
    // a step of its own.
    let depth = 0;
    let restored = false;
    let button = null;

    // The engine reads the gesture from `mouse_mode` and `mouse_click`, which main.js sets just before the call.
    function pointerStep(p, [x, y, num, ctrl = false, e = null]) {
        if (e && e.altKey) return { kind: 'unsupported', what: 'alt-drag rectangle selection' };
        const action = p.mouse_mode.startsWith('down_') ? 'down' : p.mouse_mode;
        const right = p.mouse_mode === 'down_right' || (action === 'move' && p.mouse_click === 2);
        const buttonName = p.mouse_mode === 'down_left' ? 'left' : right ? 'right' : null;
        return { kind: 'pointer', action, button: buttonName, ctrl, x, y, num };
    }

    function modeStep(p) {
        const mode = p.mode[p.mode.qa].edit_mode;
        const [submode, style] = p.mode[p.mode.qa][mode];
        return { kind: 'mode', mode, submode, style };
    }

    // `before` makes the step from the state at the call, `after` from the state the call left.
    function wrap(p, name, { before, after }) {
        const original = p[name];
        p[name] = function (...args) {
            const outermost = depth === 0 && !p.replay;
            if (outermost && before) record(before(p, args));
            depth++;
            try {
                return original.apply(this, args);
            } finally {
                depth--;
                if (outermost && after) record(after(p, args));
            }
        };
    }

    function hook() {
        if (typeof pu === 'undefined' || !pu || hooked.has(pu)) return;
        hooked.add(pu);
        // A page that restored saved progress starts from a board a fresh replay of `source` does not have.
        if (pu.pu_a.command_undo.__a.length > 0) restored = true;
        wrap(pu, 'mouseevent', { before: pointerStep });
        wrap(pu, 'dblmouseevent', {
            before: (p, [x, y, num, ctrl = false]) => ({ kind: 'pointer', action: 'double', button: 'left', ctrl, x, y, num })
        });
        for (const call of KEY_CALLS) wrap(pu, call, { before: (p, args) => ({ kind: 'key', call, args }) });
        for (const call of MODE_CALLS) wrap(pu, call, { after: modeStep });
        // `undo(true)` and `redo(true)` are Penpa+'s own replay stepping through the log.
        wrap(pu, 'undo', { before: (p, [replay]) => replay ? null : { kind: 'undo' } });
        wrap(pu, 'redo', { before: (p, [replay]) => replay ? null : { kind: 'redo' } });
        showCount();
    }

    function record(step) {
        if (!step) return;
        steps.push(step);
        showCount();
    }

    function showCount() {
        if (!button) return;
        if (restored) {
            button.textContent = 'Saved progress was restored, so a replay would not start from this board: ' +
                'open the link in a private window to record';
            button.disabled = true;
        } else {
            button.textContent = 'Download recording (' + steps.length + ' steps)';
        }
    }

    // One step per line, so a reviewer reads a recording's diff step by step.
    function recordingText() {
        const header = { source, gridtype: pu.gridtype, genre: pu.user_tags, recorder: RECORDER_VERSION };
        return '{"header": ' + JSON.stringify(header) + ',\n"steps": [\n' +
            steps.map((s) => JSON.stringify(s)).join(',\n') + '\n]}\n';
    }

    function download() {
        const link = document.createElement('a');
        link.href = URL.createObjectURL(new Blob([recordingText()], { type: 'application/json' }));
        link.download = FILE_NAME;
        link.click();
        URL.revokeObjectURL(link.href);
    }

    function addButton() {
        button = document.createElement('button');
        button.id = 'recorder_download';
        button.style.cssText = 'position: fixed; right: 8px; bottom: 8px; z-index: 10000;';
        button.addEventListener('click', download);
        document.body.appendChild(button);
        showCount();
    }

    for (const type of INPUT_EVENTS) window.addEventListener(type, hook, true);
    if (document.body) {
        addButton();
    } else {
        document.addEventListener('DOMContentLoaded', addButton);
    }
})();
