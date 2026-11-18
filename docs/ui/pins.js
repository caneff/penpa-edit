// The Pinned card, the Tab cycle, the pin toggles (the Mode card's, the picker's rows', and `window.pinBoard.toggleButton` for the Recent chips) and
// the colour that says which tool is current. A pin is a mode, a sub-mode and the last
// style used on it; the pins are seeded once per puzzle from the link's Tab set and kept per puzzle in localStorage.
// Reaches Penpa+ only through `engine` (test/ui-boundary.test.mjs fails otherwise).
(function () {
    'use strict';

    const { chipLabel, tooltipAttrs, toolKey } = window.toolGuide;
    const { el, iconButton, luminance, onDeskReady, visibleBox } = window.uiKit;
    const { puzzleHash } = window;

    const STORAGE_PREFIX = 'chinstrap.pins:';
    // Z, X, C and V jump to pins 1 to 4, and label those chips.
    const SHORTCUT_SLOT_BY_CODE = { KeyZ: 0, KeyX: 1, KeyC: 2, KeyV: 3 };
    const SHORTCUT_LABELS = Object.keys(SHORTCUT_SLOT_BY_CODE).map((code) => code.slice('Key'.length));
    // Tab and Enter step to the next pin, and with Shift to the previous one.
    const STEP_KEYS = ['Tab', 'Enter'];
    const NUMBER_MODE = 'number';
    const EMPTY_NOTE_TEXT = 'Nothing pinned. Use the pin button beside the Mode picker, on a row of its list, or on a Recent chip, to pin a tool.';
    // Colour number `n` is the golden angle times `n` around the hue wheel, so each new colour lands in the widest gap left and no
    // count of pins runs out. Every hue is lit to one luminance: white on 0.16 is 5:1, past WCAG's 4.5:1 for a filled chip and the
    // Board label, while as light as that allows, so hues are told apart at chip size.
    const GOLDEN_ANGLE_DEG = 137.508;
    const PIN_HUE_OFFSET_DEG = 220;
    const PIN_SATURATION_PERCENT = 80;
    const PIN_LUMINANCE = 0.16;
    const LIGHTNESS_STEPS = 20;
    const NEUTRAL_COLOUR = 'var(--ui-neutral-colour)';
    const BUTTON = 'button, wa-button';
    // A pin seen from the side: the head and the needle.
    const PIN_SHAPE = '<path d="M5.5 1.5h5l-.8 4.2 2.3 2.8H4l2.3-2.8z"/><path d="M8 8.5v6"/>';
    const UNPIN_ALL_ICON = `${PIN_SHAPE}<path d="M2 2l12 12"/>`;
    // A circled minus, not a ×: a tool's name can end in one ("○ △ □ ×, black").
    const REMOVE_ICON = '<svg width="14" height="14" viewBox="0 0 16 16" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="1.5" ' +
        'stroke-linecap="round"><circle cx="8" cy="8" r="6.5"/><path d="M5 8h6"/></svg>';

    // The pin colour of hue `h`: the lightest, to a tenth of a percent, whose luminance stays under PIN_LUMINANCE. One lightness for
    // every hue would leave yellow too light for white text or blue darker than it need be.
    function pinColourOfHue(h) {
        const hsl = (lightness) => `hsl(${h} ${PIN_SATURATION_PERCENT}% ${lightness}%)`;
        let [dark, light] = [0, 100];
        for (let i = 0; i < LIGHTNESS_STEPS; i++) {
            const mid = (dark + light) / 2;
            [dark, light] = luminance(hsl(mid)) < PIN_LUMINANCE ? [mid, light] : [dark, mid];
        }
        return hsl(Math.floor(dark * 10) / 10);
    }

    // Penpa+ tells Caps Lock by the letter's case against Shift, so a keyboard with it on is read the same here.
    function capsLockIsOn(e) {
        const isLetter = e.key.length === 1 && e.key.toLowerCase() !== e.key.toUpperCase();
        return e.getModifierState('CapsLock') || (isLetter && (e.key === e.key.toUpperCase()) !== e.shiftKey);
    }

    onDeskReady(({ cards, fit }) => {
        const tools = engine.listTools();
        const storageKey = STORAGE_PREFIX + puzzleHash();
        const toolOf = (pin) => tools.find((t) => toolKey(t) === toolKey(pin));

        // ---- The pins, kept ---------------------------------------------------------------------------------------------

        // What an earlier visit saved: pins in the shape `save` writes, or null for none. A saved value that is unreadable,
        // or that this code did not write (another version's, or edited by hand), cannot be shown as pins: the Tab set seeds
        // them again and replaces it, which the console says, so the loss is never silent.
        function savedState() {
            const raw = localStorage.getItem(storageKey);
            if (raw === null) {
                return null;
            }
            let saved;
            try {
                saved = JSON.parse(raw);
            } catch (e) {
                console.warn(`${storageKey} is unreadable (${e.message}); the Tab set seeds the pins and replaces it.`);
                return null;
            }
            const valid = Array.isArray(saved?.pins) && Number.isInteger(saved.nextId) &&
                saved.pins.every((p) => Number.isInteger(p.id) && typeof p.mode === 'string');
            if (!valid) {
                console.warn(`${storageKey} does not hold pins as this page saves them; the Tab set seeds the pins and replaces it.`);
                return null;
            }
            return saved;
        }

        function seededState() {
            const pins = engine.tabSet().map((tool, id) => ({ id, mode: tool.mode, submode: tool.submode, style: null }));
            return { nextId: pins.length, pins };
        }

        // A pin for a tool the link no longer offers is dropped.
        let { nextId, pins, colours } = savedState() ?? seededState();
        pins = pins.filter(toolOf);
        // Each tool's colour number, kept with the pins and outliving them. A saved value that is not a whole number of 0 or more is dropped,
        // and the tool gets a colour number again.
        const validColours = Object.fromEntries(Object.entries(colours ?? {}).filter(([, n]) => Number.isInteger(n) && n >= 0));

        const pinIndexOf = (tool) => pins.findIndex((p) => toolKey(p) === toolKey(tool));

        // Gives each pin its tool's colour number, and a tool with none, or one a pin already wears, the next number nobody has had, so
        // no two pins share a colour and a tool unpinned for a while still finds its own.
        function assignColours() {
            const worn = new Set();
            pins.forEach((pin) => {
                const key = toolKey(pin);
                if (validColours[key] === undefined || worn.has(validColours[key])) {
                    validColours[key] = Math.max(-1, ...Object.values(validColours)) + 1;
                }
                worn.add(validColours[key]);
            });
        }

        const pinColour = (pin) => pinColourOfHue((PIN_HUE_OFFSET_DEG + validColours[toolKey(pin)] * GOLDEN_ANGLE_DEG) % 360);

        function save() {
            assignColours();
            localStorage.setItem(storageKey, JSON.stringify({ nextId, pins, colours: validColours }));
        }
        save();

        // ---- Moving between pins ----------------------------------------------------------------------------------------

        // With no pins the browser keeps Tab and Enter and Z, X, C and V do nothing, so no row says otherwise.
        window.uiKeys.describe('Tools', () => (pins.length ? [
            { keys: STEP_KEYS.join(', '), text: 'Next pinned tool' },
            { keys: STEP_KEYS.map((key) => `Shift+${key}`).join(', '), text: 'Previous pinned tool' },
            { keys: SHORTCUT_LABELS.join(' '), text: `Jump to pinned tool 1 to ${SHORTCUT_LABELS.length}, except in Number mode`,
                state: engine.getSettings().shortcuts_enabled ? 'On' : 'Off: turn it on in Settings > Keys' }
        ] : []));

        // The last pin the solver was on, for stepping from a tool that is not one.
        let cursor = -1;

        function setPinTool(pin) {
            engine.setTool({ mode: pin.mode, submode: pin.submode, ...(pin.style === null ? {} : { style: pin.style }) });
        }

        // The engine's `change` comes a frame after the style button, so the style of the tool being left is taken now.
        function applyPin(pin) {
            followTool();
            setPinTool(pin);
        }

        function stepTarget(delta) {
            const here = pinIndexOf(engine.getTool());
            const from = here >= 0 ? here : Math.min(cursor, pins.length - 1);
            if (from < 0) {
                return delta > 0 ? 0 : pins.length - 1;
            }
            return (from + delta + pins.length) % pins.length;
        }

        const originIsButton = (e) => e.composedPath().some((node) => node instanceof Element && node.matches(BUTTON));

        // Enter does what Tab does unless a button has focus: then the button takes it, and Penpa+ never sees it, since Penpa+
        // would step its own Tab set. With no pins neither key is ours, so the browser keeps them.
        window.uiKeys.add((e) => {
            if (e.type !== 'keydown' || e.ctrlKey || e.metaKey || e.altKey) {
                return;
            }
            if (STEP_KEYS.includes(e.key)) {
                if (!pins.length || (e.key === 'Enter' && originIsButton(e))) {
                    return 'browser';
                }
                e.preventDefault();
                // A hold lends the tool it shows; the step starts from the tool before it.
                engine.releaseHolds();
                applyPin(pins[stepTarget(e.shiftKey ? -1 : 1)]);
                return 'ui';
            }
            const slot = SHORTCUT_SLOT_BY_CODE[e.code];
            if (slot !== undefined && engine.getTool().mode !== NUMBER_MODE && !capsLockIsOn(e) && engine.getSettings().shortcuts_enabled) {
                e.preventDefault();
                if (pins[slot]) {
                    // As for Tab: a held Shift lends its tool no longer once the solver jumps away from it.
                    engine.releaseHolds();
                    applyPin(pins[slot]);
                }
                return 'ui';
            }
        });

        // ---- The Pinned card --------------------------------------------------------------------------------------------

        const strip = el('div', { class: 'ui-pins' });
        cards.pins.body.replaceChildren(strip);
        // The strip's rows are told apart by their tops; with no pin, its one row is the empty note.
        fit.pinsCardHeightAtTwoRows = () => {
            const items = [...strip.children];
            const rows = new Set(items.map((item) => item.offsetTop)).size;
            // A strip with no gap set reads `normal`, which is none.
            const rowHeight = Math.max(0, ...items.map((item) => item.offsetHeight)) + (parseFloat(getComputedStyle(strip).rowGap) || 0);
            return cards.pins.node.offsetHeight + Math.max(0, 2 - rows) * rowHeight;
        };

        // No confirm: "Puzzle defaults" or a saved preset brings pins back.
        const unpinAll = iconButton(UNPIN_ALL_ICON, 'Unpin all', () => window.pinBoard.replace([]));
        unpinAll.node.classList.add('ui-unpin-all');
        cards.pins.head.append(unpinAll.node);

        // The chip being dragged, for the drop to move.
        let dragged = null;

        // Moves `pin` to just before or after `target`, which Z, X, C and V and the Tab cycle then follow.
        function movePin(pin, target, before) {
            if (pin === target) {
                return;
            }
            const cursorPin = pins[cursor];
            pins = pins.filter((p) => p !== pin);
            pins.splice(pins.indexOf(target) + (before ? 0 : 1), 0, pin);
            cursor = pins.indexOf(cursorPin);
            save();
            render();
        }

        function chip(pin, slot, current) {
            const label = chipLabel(toolOf(pin));
            const shortcut = SHORTCUT_LABELS[slot];
            // The space is not drawn (flex items drop it); it keeps the chip's text and name readable as "Z Line > Normal".
            const main = el('button', { type: 'button', class: 'ui-chip-main', 'aria-pressed': String(current), ...tooltipAttrs(toolOf(pin)) },
                [...(shortcut ? [el('span', { class: 'ui-chip-num' }, [shortcut]), ' '] : []), label]);
            const unpin = el('button', { type: 'button', class: 'ui-chip-unpin', 'aria-label': `Unpin ${label}`, title: `Unpin ${label}` });
            unpin.innerHTML = REMOVE_ICON;
            main.addEventListener('click', () => {
                applyPin(pin);
                main.blur();
            });
            unpin.addEventListener('click', () => {
                pins = pins.filter((p) => p !== pin);
                save();
                render();
                unpin.blur();
            });
            const node = el('div', { class: `ui-chip${current ? ' is-current' : ''}`, style: `--ui-pin-colour:${pinColour(pin)}`, draggable: 'true' }, [main, unpin]);
            node.addEventListener('dragstart', (e) => {
                dragged = pin;
                e.dataTransfer.effectAllowed = 'move';
                // Firefox starts no drag without some data.
                e.dataTransfer.setData('text/plain', label);
            });
            node.addEventListener('dragend', () => { dragged = null; });
            node.addEventListener('dragover', (e) => {
                if (dragged) {
                    e.preventDefault();
                }
            });
            node.addEventListener('drop', (e) => {
                if (dragged) {
                    e.preventDefault();
                    const { left, width } = node.getBoundingClientRect();
                    movePin(dragged, pin, e.clientX < left + width / 2);
                }
            });
            return node;
        }

        // ---- The pin toggles --------------------------------------------------------------------------------------------

        // Pins or unpins a tool's mode and sub-mode; a new pin keeps the style the tool was used with.
        function togglePin(tool) {
            const index = pinIndexOf(tool);
            if (index >= 0) {
                pins.splice(index, 1);
            } else {
                pins.push({ id: nextId++, mode: tool.mode, submode: tool.submode, style: tool.style ?? null });
            }
            save();
            render();
        }

        const pinIcon = (filled) => '<svg width="14" height="14" viewBox="0 0 16 16" aria-hidden="true" stroke="currentColor" stroke-width="1.5" ' +
            `stroke-linejoin="round" stroke-linecap="round" fill="${filled ? 'currentColor' : 'none'}">${PIN_SHAPE}</svg>`;

        // A pin icon button for whatever tool `toolNow()` returns: pressed while that tool is pinned, hidden for a tool the link
        // does not list. `sync()` redraws it, and only touches the DOM when what it shows changed: a write to the DOM makes the
        // engine report a `change`, which would call `sync()` again, every frame. A `shortcut` names its key in the label, where the
        // tool's name would be.
        function pinToggle(toolNow, shortcut = null) {
            const button = el('button', { type: 'button', class: 'ui-pin-toggle' });
            let drawn = '';
            function sync() {
                const tool = toolNow();
                const known = toolOf(tool);
                const pinned = pinIndexOf(tool) >= 0;
                const now = `${known ? chipLabel(known) : ''}/${pinned}`;
                if (now === drawn) {
                    return;
                }
                drawn = now;
                button.hidden = !known;
                button.setAttribute('aria-pressed', String(pinned));
                const verb = pinned ? 'Unpin' : 'Pin';
                const label = shortcut ? `${verb} (${shortcut})` : `${verb} ${known ? chipLabel(known) : ''}`.trim();
                button.setAttribute('aria-label', label);
                button.setAttribute('title', label);
                button.innerHTML = pinIcon(pinned);
            }
            button.addEventListener('click', () => {
                togglePin(toolNow());
                button.blur();
            });
            sync();
            return { node: button, sync };
        }

        // The Mode card's pin sits beside its tool picker, in the row the card leaves for it.
        const modePin = pinToggle(() => engine.getTool());
        cards.mode.body.querySelector('.ui-picker-row').append(modePin.node);

        const { PIN_SHORTCUT, PIN_SLOT } = window.modeTree;
        const rowPins = [...cards.mode.body.querySelectorAll(`.ui-trow[data-mode] .${PIN_SLOT}`)].map((slot) => {
            const { mode, submode } = slot.parentElement.dataset;
            const toggle = pinToggle(() => ({ mode, submode: submode || null }), PIN_SHORTCUT);
            toggle.node.setAttribute('tabindex', '-1');
            slot.append(toggle.node);
            return toggle;
        });
        window.uiKeys.describe('Tools', [{ keys: PIN_SHORTCUT, text: 'With a tool focused in the Mode picker, pin or unpin it' }]);

        // ---- The cue: frame, title bar and flash ------------------------------------------------------------------------

        const flash = el('div', { class: 'ui-flash', 'aria-hidden': 'true' });
        cards.board.node.append(flash);

        // The flash sits at the top of the grid's visible part, centred: the board canvas's box cut to what the body shows, so a
        // zoomed or scrolled board keeps it in view. The canvas, not the board's wrapper, which also holds the coordinate bands.
        const FLASH_INSET_PX = 6;
        function placeFlash() {
            const card = cards.board.node.getBoundingClientRect();
            const view = visibleBox(cards.board.body);
            const canvas = [...cards.board.body.querySelectorAll('canvas')].find((c) => c.offsetWidth > 0).getBoundingClientRect();
            const left = Math.max(view.left, canvas.left);
            const right = Math.min(view.right, canvas.right);
            const top = Math.max(view.top, canvas.top);
            // A board scrolled out of the body's view leaves no overlap: the flash then sits on the body's own top edge.
            const box = left < right && top < view.bottom ? { left, right, top } : view;
            flash.style.left = `${(box.left + box.right) / 2 - card.left}px`;
            flash.style.top = `${box.top - card.top + FLASH_INSET_PX}px`;
        }

        // Restarts the CSS animation, which fades the name out on its own.
        function flashTool(tool, colour) {
            flash.replaceChildren(chipLabel(tool));
            flash.style.setProperty('--ui-flash-colour', colour);
            placeFlash();
            flash.classList.remove('is-flashing');
            void flash.offsetWidth;
            flash.classList.add('is-flashing');
        }

        // ---- Following the engine ---------------------------------------------------------------------------------------

        let lastKey = null;
        let drawn = '';

        // A tool that was just landed on, by a pin or by a pick that matches one, comes back with that pin's style; while it
        // stays current a style change is the pin's new one.
        function followTool() {
            // A tool a hold lends is no landing: it flashes nothing and changes no pin.
            if (engine.getState().held) {
                return;
            }
            const current = engine.getTool();
            const index = pinIndexOf(current);
            const landed = lastKey !== null && toolKey(current) !== lastKey;
            lastKey = toolKey(current);
            const tool = tools.find((t) => toolKey(t) === lastKey);
            if (landed && tool) {
                flashTool(tool, index >= 0 ? pinColour(pins[index]) : NEUTRAL_COLOUR);
            }
            if (index < 0) {
                return;
            }
            cursor = index;
            const pin = pins[index];
            // Straight to the engine: `applyPin` would first take the style just landed with as the pin's own.
            if (landed && pin.style !== null && pin.style !== current.style) {
                setPinTool(pin);
            } else if (pin.style !== current.style) {
                pin.style = current.style;
                save();
            }
        }

        const pinListeners = [];

        function render() {
            followTool();
            // Between two unpinned tools the signature holds, yet the Mode card's pin names the new one.
            modePin.sync();
            rowPins.forEach((toggle) => toggle.sync());
            const index = pinIndexOf(engine.getTool());
            const signature = JSON.stringify([pins, index]);
            if (signature === drawn) {
                return;
            }
            drawn = signature;
            unpinAll.node.disabled = !pins.length;
            pinListeners.forEach((listener) => listener());
            strip.replaceChildren(...(pins.length ? pins.map((pin, i) => chip(pin, i, i === index)) : [el('p', { class: 'ui-pins-empty' }, [EMPTY_NOTE_TEXT])]));
            cards.board.node.style.setProperty('--ui-tool-colour', index >= 0 ? pinColour(pins[index]) : NEUTRAL_COLOUR);
        }

        // What the presets read and replace. A pin for a tool the link lacks is left out, like a saved
        // pin the link no longer offers.
        window.pinBoard = {
            // `toggleButton(toolNow)` is a pin toggle for the tool `toolNow()` names; `isPinned(tool)` tells whether a tool is pinned.
            toggleButton: pinToggle,
            isPinned: (tool) => pinIndexOf(tool) >= 0,
            // `onChange(listener)` calls `listener` whenever the pins or the current pin change.
            onChange: (listener) => pinListeners.push(listener),
            snapshot: () => pins.map(({ mode, submode, style }) => ({ mode, submode, style })),
            replace(entries) {
                pins = entries.filter(toolOf).map(({ mode, submode, style }) => ({ id: nextId++, mode, submode, style: style ?? null }));
                save();
                render();
            },
            // The pins the link's Tab set seeds, as on the puzzle's first visit.
            reseed() {
                window.pinBoard.replace(engine.tabSet());
            }
        };

        render();
        engine.on('change', render);
    });
})();
