// The recorder: with `?record=1` in the page's query, writes the solver's inputs as the steps of a recording
// (GLOSSARY.md) and offers them as a download, with the engine state they reached as its final board. Without the
// flag it does nothing. The format is `live/replay.mjs`'s, and so is the check that a replay reaches that board: a
// recording whose board did not start from its link (saved progress, settings cookies, a second board) or that holds an
// input the recorder does not see (Escape, Ctrl+A) fails it.
// The engine fields canonical state (`live/canonical-state.mjs`) is written from, as plain JSON data, so a state read
// from a live page and one read back from a recording file are the same. The timer and the progress kept in storage
// under `md5(pu.url)` are never read. Global, so the live tests read the page with the same function.
function readEngineState() {
    const plain = (board) => Object.fromEntries(Object.entries(pu[board]).map(([k, v]) => [k, v instanceof Stack ? v.__a : v]));
    const editMode = pu.mode[pu.mode.qa].edit_mode;
    // The third element, the input orientation `set_orientation` stores, exists only once a mode has set one.
    const [submode, style, orientation = null] = pu.mode[pu.mode.qa][editMode];
    return JSON.parse(JSON.stringify({
        pu_a: plain('pu_a'),
        pu_a_col: plain('pu_a_col'),
        mode: { qa: pu.mode.qa, edit_mode: editMode, submode, style, orientation },
        selection: pu.selection,
        conflict_cells: pu.conflict_cells,
        sol_flag: pu.sol_flag
    }));
}

(function () {
    if (!/(^|&)record=1(&|$)/.test(location.search.slice(1))) return;

    const RECORDER_VERSION = 1;
    const FILE_NAME = 'recording.steps.json';
    const KEY_CALLS = ['key_number', 'key_space', 'key_shiftspace', 'key_backspace', 'key_arrow'];
    // `subsymbolmode` and `subcombimode` keep the Shape or Composite tool where other modes keep their sub-mode.
    const MODE_CALLS = ['mode_set', 'submode_check', 'stylemode_check', 'subsymbolmode', 'subcombimode', 'set_orientation'];
    // The modes in which Alt starts a rectangle selection on a square grid (`handle_rect_mousedown` in class_p.js).
    const RECT_SELECT_MODES = ['sudoku', 'number', 'surface', 'multicolor'];
    // A solver's input arrives by one of these. Listening in the capture phase on `window` wraps a new `pu` before
    // `main.js`'s own handlers call it.
    const INPUT_EVENTS = ['mousedown', 'mousemove', 'mouseup', 'mouseout', 'dblclick', 'keydown', 'click'];

    const otherParams = location.search.slice(1).split('&').filter((p) => p && p !== 'record=1');
    const source = (otherParams.length ? '?' + otherParams.join('&') : '') + location.hash;
    const steps = [];
    let hookedPu = null;
    // Nonzero inside a wrapped call, so a call the engine makes from inside another (mode_set's submode_check) is not
    // a step of its own.
    let depth = 0;
    let button = null;

    // The engine reads the gesture from `mouse_mode` and `mouse_click`, which main.js sets just before the call.
    function pointerStep(p, [x, y, num, ctrl = false, e = null]) {
        if (e && e.altKey && p.grid_is_square() && RECT_SELECT_MODES.includes(p.mode[p.mode.qa].edit_mode)) {
            return { kind: 'unsupported', what: 'alt-drag rectangle selection' };
        }
        const action = p.mouse_mode.startsWith('down_') ? 'down' : p.mouse_mode;
        const right = p.mouse_mode === 'down_right' || (action === 'move' && p.mouse_click === 2);
        const buttonName = p.mouse_mode === 'down_left' ? 'left' : right ? 'right' : null;
        return { kind: 'pointer', action, button: buttonName, ctrl, x, y, num };
    }

    // Only Number's third element is an orientation; other modes keep a custom colour there.
    function modeStep(p) {
        const mode = p.mode[p.mode.qa].edit_mode;
        const [submode, style, orientation] = p.mode[p.mode.qa][mode];
        return mode === 'number' ? { kind: 'mode', mode, submode, style, orientation } : { kind: 'mode', mode, submode, style };
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
        if (typeof pu === 'undefined' || !pu || pu === hookedPu) return;
        hookedPu = pu;
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
        if (button) button.textContent = 'Download recording (' + steps.length + ' steps)';
    }

    // One step per line, so a reviewer reads a recording's diff step by step.
    function recordingText() {
        const header = { source, gridtype: pu.gridtype, genre: pu.user_tags, recorder: RECORDER_VERSION };
        return '{"header": ' + JSON.stringify(header) + ',\n"final": ' + JSON.stringify(readEngineState()) +
            ',\n"steps": [\n' + steps.map((s) => JSON.stringify(s)).join(',\n') + '\n]}\n';
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
