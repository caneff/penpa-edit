// The Pinned card, the Tab cycle and the colour that says which tool is current. A pin is a mode, a sub-mode and the last
// style used on it; the pins are seeded once per puzzle from the link's Tab set and kept per puzzle in localStorage.
// Reaches Penpa only through `engine` (test/ui-boundary.test.mjs fails otherwise).
(function () {
    'use strict';

    const { toolKey } = window.toolGuide;

    const STORAGE_PREFIX = 'chinstrap.pins:';
    // Z, X, C and V jump to pins 1 to 4.
    const SHORTCUT_SLOT_BY_CODE = { KeyZ: 0, KeyX: 1, KeyC: 2, KeyV: 3 };
    const NUMBER_MODE = 'number';
    // A sub-mode that names its tool on its own stands alone in a chip; a generic one ("Normal") gets its mode first.
    const SELF_NAMING_MODES = ['combi', 'special', 'symbol'];
    // A pin's colour is the golden angle times its id around the hue wheel, so each new pin lands in the widest gap left and
    // no count of pins runs out; the lightness keeps white text readable on it.
    const GOLDEN_ANGLE_DEG = 137.508;
    const PIN_HUE_OFFSET_DEG = 220;
    const PIN_SATURATION_PERCENT = 62;
    const PIN_LIGHTNESS_PERCENT = 38;
    const NEUTRAL_COLOUR = '#7d828c';
    const BUTTON = 'button, wa-button';

    function el(tag, attrs = {}, children = []) {
        const node = document.createElement(tag);
        Object.entries(attrs).forEach(([name, value]) => node.setAttribute(name, value));
        node.append(...children);
        return node;
    }

    const pinColour = (pin) => `hsl(${(PIN_HUE_OFFSET_DEG + pin.id * GOLDEN_ANGLE_DEG) % 360} ${PIN_SATURATION_PERCENT}% ${PIN_LIGHTNESS_PERCENT}%)`;

    // FNV-1a over the link's `#` part: the same puzzle, the same key.
    function puzzleHash() {
        let hash = 0x811c9dc5;
        for (const char of location.hash) {
            hash = Math.imul(hash ^ char.codePointAt(0), 0x01000193) >>> 0;
        }
        return hash.toString(16);
    }

    // Penpa tells Caps Lock by the letter's case against Shift, so a keyboard with it on is read the same here.
    function capsLockIsOn(e) {
        const isLetter = e.key.length === 1 && e.key.toLowerCase() !== e.key.toUpperCase();
        return e.getModifierState('CapsLock') || (isLetter && (e.key === e.key.toUpperCase()) !== e.shiftKey);
    }

    window.deskReady.then(({ cards }) => {
        const tools = engine.listTools();
        const storageKey = STORAGE_PREFIX + puzzleHash();
        const toolOf = (pin) => tools.find((t) => toolKey(t) === toolKey(pin));

        // ---- The pins, kept ---------------------------------------------------------------------------------------------

        // What an earlier visit saved: pins in the shape `save` writes, or null for none. A saved value this code did not
        // write (another version's, or edited by hand) is the same as none: the Tab set seeds again.
        function savedState() {
            const raw = localStorage.getItem(storageKey);
            let saved;
            try {
                saved = JSON.parse(raw);
            } catch (e) {
                return null;
            }
            const valid = Array.isArray(saved?.pins) && Number.isInteger(saved.nextId) &&
                saved.pins.every((p) => Number.isInteger(p.id) && typeof p.mode === 'string');
            return valid ? saved : null;
        }

        function seededState() {
            const pins = engine.tabSet().map((tool, id) => ({ id, mode: tool.mode, submode: tool.submode, style: null }));
            return { nextId: pins.length, pins };
        }

        // A pin for a tool the link no longer offers is dropped.
        let { nextId, pins } = savedState() ?? seededState();
        pins = pins.filter(toolOf);

        function save() {
            localStorage.setItem(storageKey, JSON.stringify({ nextId, pins }));
        }
        save();

        const pinIndexOf = (tool) => pins.findIndex((p) => toolKey(p) === toolKey(tool));

        // ---- Moving between pins ----------------------------------------------------------------------------------------

        // The last pin the solver was on, for stepping from a tool that is not one.
        let cursor = -1;

        // The engine's `change` comes a frame after the style button, so the style of the tool being left is taken now.
        function applyPin(pin) {
            followTool();
            engine.setTool({ mode: pin.mode, submode: pin.submode, ...(pin.style === null ? {} : { style: pin.style }) });
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

        // Enter does what Tab does unless a button has focus: then the button takes it, and Penpa never sees it, since Penpa
        // would step its own Tab set. With no pins neither key is ours, so the browser keeps them.
        window.uiKeys.add((e) => {
            if (e.type !== 'keydown' || e.ctrlKey || e.metaKey || e.altKey) {
                return;
            }
            if (e.key === 'Tab' || e.key === 'Enter') {
                if (!pins.length || (e.key === 'Enter' && originIsButton(e))) {
                    return 'browser';
                }
                e.preventDefault();
                applyPin(pins[stepTarget(e.shiftKey ? -1 : 1)]);
                return 'ui';
            }
            const slot = SHORTCUT_SLOT_BY_CODE[e.code];
            if (slot !== undefined && engine.getTool().mode !== NUMBER_MODE && !capsLockIsOn(e) && engine.getSettings().shortcuts_enabled) {
                e.preventDefault();
                if (pins[slot]) {
                    applyPin(pins[slot]);
                }
                return 'ui';
            }
        });

        // ---- The Pinned card --------------------------------------------------------------------------------------------

        const capitalised = (text) => text.charAt(0).toUpperCase() + text.slice(1);

        function chipLabel(pin) {
            const tool = toolOf(pin);
            if (!tool.submodeName) {
                return tool.modeName;
            }
            return SELF_NAMING_MODES.includes(tool.mode) ? tool.submodeName : `${tool.modeName} > ${capitalised(tool.submodeName)}`;
        }

        const strip = el('div', { class: 'ui-pins' });
        const pinCurrent = el('wa-button', { appearance: 'filled', variant: 'neutral', size: 's', class: 'ui-pin-current' }, ['Pin current tool']);
        cards.pins.body.replaceChildren(strip, pinCurrent);

        function chip(pin, number, current) {
            const label = chipLabel(pin);
            const main = el('button', {
                type: 'button', class: 'ui-chip-main', 'aria-pressed': String(current), title: toolOf(pin).name
            }, [el('span', { class: 'ui-chip-num' }, [String(number)]), label]);
            const unpin = el('button', { type: 'button', class: 'ui-chip-unpin', 'aria-label': `Unpin ${label}` }, ['×']);
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
            return el('div', { class: `ui-chip${current ? ' is-current' : ''}`, style: `--ui-pin-colour:${pinColour(pin)}` }, [main, unpin]);
        }

        pinCurrent.addEventListener('click', () => {
            const { mode, submode, style } = engine.getTool();
            pins.push({ id: nextId++, mode, submode, style });
            save();
            render();
            pinCurrent.blur();
        });

        // ---- The cue: frame, title bar and flash ------------------------------------------------------------------------

        const flash = el('div', { class: 'ui-flash', 'aria-hidden': 'true' });
        cards.board.node.append(flash);

        // Restarts the CSS animation, which fades the name out on its own.
        function flashTool(tool, colour) {
            flash.replaceChildren(el('i', { class: 'ui-flash-dot', style: `background:${colour}` }), tool.name);
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
            if (landed && pin.style !== null && pin.style !== current.style) {
                applyPin(pin);
            } else if (pin.style !== current.style) {
                pin.style = current.style;
                save();
            }
        }

        function render() {
            followTool();
            const index = pinIndexOf(engine.getTool());
            const signature = JSON.stringify([pins, index]);
            if (signature === drawn) {
                return;
            }
            drawn = signature;
            strip.replaceChildren(...pins.map((pin, i) => chip(pin, i + 1, i === index)));
            pinCurrent.toggleAttribute('disabled', index >= 0);
            cards.board.node.style.setProperty('--ui-tool-colour', index >= 0 ? pinColour(pins[index]) : NEUTRAL_COLOUR);
        }

        render();
        engine.on('change', render);
    });
    window.deskReady.catch(() => {});
})();
