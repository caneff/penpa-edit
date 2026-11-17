// The Mode card (a searchable tree of every tool, then the current tool's styles and, for Number, its orientation), the Mouse card (what the mouse does with
// the current tool) and the board's title-bar tool name. Reaches Penpa+ only through `engine` (test/ui-boundary.test.mjs
// fails otherwise).
(function () {
    'use strict';

    const MULTICOLOR_MODE = 'multicolor';
    const { NOTHING, mouseRows, toolKey, chipLabel } = window.toolGuide;
    const { el, onDeskReady } = window.uiKit;

    // Space the Mouse card's body keeps below the tallest content, for the borders.
    const MOUSE_BODY_SLACK_PX = 2;

    // ---- The tool in words ------------------------------------------------------------------------------------------

    function styleOf(tool, style) {
        return tool.styles.find((s) => s.style === style) ?? null;
    }

    // The label's text is the style's colour, so its pill is white or black, whichever shows that colour better: no one pill holds a mid
    // tone at 4.5:1, and the better of these two never falls under it. The canvas reads any CSS colour back as #rrggbb.
    const channelLinear = (c) => { const s = c / 255; return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4; };
    function pillFor(colour) {
        const ctx = document.createElement('canvas').getContext('2d');
        ctx.fillStyle = colour;
        const [r, g, b] = [1, 3, 5].map((i) => channelLinear(parseInt(ctx.fillStyle.slice(i, i + 2), 16)));
        const luminance = 0.2126 * r + 0.7152 * g + 0.0722 * b;
        // Contrast with white is 1.05 / (L + .05); with black, (L + .05) / .05.
        return 1.05 / (luminance + 0.05) >= (luminance + 0.05) / 0.05 ? '#ffffff' : '#000000';
    }

    // The colour a tool's selected style paints, or null for a tool with no colour style.
    const styleColour = (tool, style) => styleOf(tool, style)?.swatch ?? null;

    // ---- The Mouse card ---------------------------------------------------------------------------------------------

    // The tool's one name, with a dot in the selected style's colour; the full name is the tooltip when a narrow card cuts it.
    function headline(tool, style, held) {
        const name = chipLabel(tool);
        const colour = styleColour(tool, style);
        const h3 = el('h3', { class: 'ui-headline', title: name }, [
            ...(colour ? [el('i', { class: 'ui-dot', style: `background:${colour}` })] : []),
            el('span', { class: 'ui-hname' }, [name])
        ]);
        if (held) {
            h3.append(el('span', { class: 'ui-held' }, ['held']));
        }
        return h3;
    }

    function renderMouse(target, tool, style, held = false) {
        const rows = mouseRows(tool);
        const row = (gesture, effect, cls) => el('div', { class: `ui-mrow ${cls}` }, [
            el('span', { class: 'ui-mg' }, [gesture]), el('span', { class: 'ui-md' }, [effect])
        ]);
        target.replaceChildren(headline(tool, style, held), el('div', { class: 'ui-mrows' }, [
            // A gesture that does nothing gets no row (#191), so a tool with few actions takes little of a short screen.
            ...[['Left click', rows.left], ['Right click', rows.right], ['Drag', rows.drag]]
                .filter(([, effect]) => effect !== NOTHING)
                .map(([gesture, effect]) => row(gesture, effect, '')),
            ...rows.more.map(([gesture, effect]) => row(gesture, effect, 'is-more'))
        ]));
    }

    // The contents that can set the Mouse card's height, as markup: one per distinct set of rows, since the headline is one
    // line whatever the tool. Found once per set of tools, so measuring at a new width costs one layout per set of rows, not
    // one render per tool and style.
    const mouseContents = { key: null, contents: null };
    function allMouseContents(probe, tools) {
        const bySetOfRows = new Map();
        tools.forEach((tool) => {
            renderMouse(probe, tool, tool.styles[0]?.style ?? null, true);
            const rows = probe.querySelector('.ui-mrows').innerHTML;
            if (!bySetOfRows.has(rows)) {
                bySetOfRows.set(rows, probe.innerHTML);
            }
        });
        return [...bySetOfRows.values()];
    }

    // The Mouse card keeps one height: the tallest content any of `tools` needs, measured in a hidden copy of its body at
    // `width` (the card's own by default). Shorter content sits at the top.
    function measureMouseBody(body, tools, width = body.clientWidth) {
        const probe = el('div', { class: 'ui-body ui-mouse-probe' });
        probe.style.cssText = `position:absolute;visibility:hidden;left:0;top:0;width:${width}px;box-sizing:border-box;height:auto;`;
        body.parentElement.append(probe);
        const key = tools.map(toolKey).join(' ');
        if (mouseContents.key !== key) {
            Object.assign(mouseContents, { key, contents: allMouseContents(probe, tools) });
        }
        let tallest = 0;
        mouseContents.contents.forEach((html) => {
            probe.innerHTML = html;
            tallest = Math.max(tallest, probe.offsetHeight);
        });
        probe.remove();
        return tallest;
    }

    // ---- The Mode card ----------------------------------------------------------------------------------------------

    const STYLE_ICON_PX = 20;

    const svg = (inner) => `<svg width="${STYLE_ICON_PX}" height="${STYLE_ICON_PX}" viewBox="0 0 20 20" aria-hidden="true">${inner}</svg>`;

    // A 20 px sample of a style for its button: a swatch for a colour, Penpa+'s own paint for a text style that has a `sample`, a tiny drawing for the rest.
    function styleSample(name, swatch, sample) {
        const line = (attrs) => `<line x1="3" y1="10" x2="17" y2="10" stroke-linecap="round" ${attrs}/>`;
        const ink = 'stroke="currentColor"';
        if (swatch) {
            return svg(`<rect class="ui-swatch" x="1" y="1" width="18" height="18" rx="3" fill="${swatch}" stroke="rgba(0,0,0,.3)"/>`);
        }
        const text = (label, extra = '', fill = 'currentColor') => svg(`${extra}<text x="10" y="14" text-anchor="middle" font-size="10" ` +
            `font-weight="700" font-family="system-ui,sans-serif" fill="${fill}">${label}</text>`);
        if (sample) {
            const { fontSize, text: digit, disc } = sample;
            const drawnPx = 14;
            // Penpa+ strokes the digit first and fills it on top, so the outline only shows outside the glyph.
            return svg(`${disc ? `<circle cx="10" cy="10" r="9" fill="${disc.fill}" stroke="${disc.stroke}" stroke-width="${disc.lineWidth}"/>` : ''}` +
                `<text x="10" y="14.5" text-anchor="middle" font-size="${drawnPx}" font-family="Helvetica,Arial,sans-serif" paint-order="stroke" ` +
                `stroke-linejoin="round" fill="${digit.fill}" stroke="${digit.stroke}" stroke-width="${digit.lineWidth * drawnPx / fontSize}">1</text>`);
        }
        switch (name) {
        case 'thin': return svg(line(`${ink} stroke-width="1"`));
        case 'thicker': return svg(line(`${ink} stroke-width="4.5"`));
        case 'dotted': return svg(line(`${ink} stroke-width="2.2" stroke-dasharray="0.1 3.6"`));
        case 'fat dots': return svg(line(`${ink} stroke-width="4.5" stroke-dasharray="0.1 6.5"`));
        case 'short': return svg(`<line x1="7" y1="10" x2="13" y2="10" ${ink} stroke-width="3" stroke-linecap="round"/>`);
        case 'double': return svg(`<line x1="3" y1="7" x2="17" y2="7" ${ink} stroke-width="1.5"/><line x1="3" y1="13" x2="17" y2="13" ${ink} stroke-width="1.5"/>`);
        case 'grey dot': return svg('<circle cx="10" cy="10" r="3.5" fill="#999"/>');
        case 'dotted line': return svg(line(`${ink} stroke-width="1.5" stroke-dasharray="2 2.5"`));
        case 'grey line': return svg(line('stroke="#999" stroke-width="2"'));
        case 'grey dots': return svg(line('stroke="#999" stroke-width="3" stroke-dasharray="0.1 4"'));
        case 'solid line': return svg(line(`${ink} stroke-width="2"`));
        case 'white': return text('1', '<rect x="2" y="2" width="16" height="16" rx="3" fill="#555"/>', '#fff');
        case 'white background': return text('1', '<rect x="2" y="2" width="16" height="16" rx="2" fill="#fff" stroke="#999"/>', '#222');
        case 'behind lines': return svg(`<circle cx="10" cy="10" r="5" fill="#bbb"/>${line(`${ink} stroke-width="2"`)}`);
        case 'in front of lines': return svg(`${line(`${ink} stroke-width="2"`)}<circle cx="10" cy="10" r="5" fill="#bbb"/>`);
        }
        return text(String(name).replace(/^style /, '#'));
    }

    // Number mode's directions as the degrees Penpa+'s Orientation buttons turn their "A" by.
    const ORIENTATION_TURN = { R: 0, UR: -45, U: -90, UL: -135, L: 180, DL: 135, D: 90, DR: 45 };
    const ORIENTATION_NAMES = {
        R: 'right', UR: 'up and right', U: 'up', UL: 'up and left', L: 'left', DL: 'down and left', D: 'down', DR: 'down and right'
    };

    // `applyTool(tool)` picks a tool; `colourSelection(style)` is a Multicolor swatch's press; `orientations.list()` and
    // `orientations.apply(direction)` are Number mode's directions and the pick of one.
    function buildModeCard(body, tools, applyTool, colourSelection, orientations) {
        const input = el('input', {
            type: 'text', role: 'combobox', 'aria-label': 'Tool', 'aria-autocomplete': 'list', 'aria-haspopup': 'tree', 'aria-expanded': 'false',
            'aria-controls': window.modeTree.TREE_ID, spellcheck: 'false', autocomplete: 'off', class: 'ui-search', placeholder: 'Search tools…'
        });
        const none = el('div', { class: 'ui-none', hidden: '' }, ['No tool matches.']);
        const toolTree = window.modeTree.createModeTree(tools, (tool) => pick(tool), (id) => {
            if (id) {
                input.setAttribute('aria-activedescendant', id);
            } else {
                input.removeAttribute('aria-activedescendant');
            }
        });
        const list = el('div', { class: 'ui-list', hidden: '' }, [toolTree.levels, toolTree.tree, none]);
        const toolOptions = el('div', { class: 'ui-toolopts' });
        const picker = el('div', { class: 'ui-picker' }, [input, list]);
        window.floatList(input, list);
        // pins.js adds the pin toggle to the row.
        body.replaceChildren(el('div', { class: 'ui-picker-row' }, [picker]), toolOptions);

        let open = false;

        function showCurrent() {
            const current = tools.find((t) => toolKey(t) === toolKey(engine.getTool()));
            input.value = current ? chipLabel(current) : '';
        }

        // The focus returns to the board by leaving the picker: nothing else on the page takes keys.
        function close() {
            if (!open) {
                return;
            }
            open = false;
            list.hidden = true;
            input.setAttribute('aria-expanded', 'false');
            input.removeAttribute('aria-activedescendant');
            showCurrent();
        }

        function pick(tool) {
            applyTool({ mode: tool.mode, submode: tool.submode });
            document.activeElement?.blur();
        }

        function filter() {
            none.hidden = toolTree.search(input.value) > 0;
        }

        function openList() {
            if (open) {
                return;
            }
            open = true;
            list.hidden = false;
            input.setAttribute('aria-expanded', 'true');
            input.value = '';
            filter();
            toolTree.openBranchOf(engine.getTool());
            toolTree.scrollToSelected();
        }

        input.addEventListener('focus', openList);
        input.addEventListener('input', filter);
        picker.addEventListener('focusout', (e) => {
            if (!picker.contains(e.relatedTarget)) {
                close();
            }
        });
        picker.addEventListener('keydown', (e) => {
            if (e.key === 'Escape') {
                e.preventDefault();
                document.activeElement?.blur();
            } else if (e.target === input && (e.key === 'ArrowDown' || e.key === 'ArrowUp')) {
                e.preventDefault();
                toolTree.focusSelected();
            } else if (e.target !== input && e.target.closest('[role=treeitem]') && (e.key === 'Backspace' || (e.key.length === 1 && e.key !== ' ' && !e.ctrlKey && !e.metaKey && !e.altKey))) {
                // A letter typed with the focus in the tree is a search the field would have taken.
                e.preventDefault();
                input.focus();
                input.value = e.key === 'Backspace' ? input.value.slice(0, -1) : input.value + e.key;
                filter();
            } else if (e.target === input && e.key === 'Enter') {
                e.preventDefault();
                const best = input.value.trim() ? toolTree.bestMatch() : null;
                if (best) {
                    pick(best);
                }
            }
        });

        function styleGroup(tool, style) {
            const group = el('div', { role: 'group', 'aria-label': 'Style', class: 'ui-styles' });
            tool.styles.forEach((s) => {
                const button = el('button', { type: 'button', class: 'ui-stylebtn', 'aria-pressed': String(s.style === style), 'aria-label': s.name, title: s.name });
                button.innerHTML = styleSample(s.name, s.swatch, s.sample);
                button.addEventListener('click', () => {
                    // A Multicolor swatch colours the selected cells, as a digit key does; any other style is only picked.
                    if (tool.mode === MULTICOLOR_MODE) {
                        colourSelection(s.style);
                    } else {
                        applyTool({ mode: tool.mode, submode: tool.submode, style: s.style });
                    }
                    button.blur();
                });
                group.append(button);
            });
            return [el('div', { class: 'ui-sub' }, [tool.mode === 'surface' || tool.mode === MULTICOLOR_MODE ? 'Colour' : 'Style']), group];
        }

        function orientationGroup(current) {
            const group = el('div', { role: 'group', 'aria-label': 'Orientation', class: 'ui-styles' });
            orientations.list().forEach((direction) => {
                const name = ORIENTATION_NAMES[direction];
                const button = el('button', { type: 'button', class: 'ui-stylebtn', 'aria-pressed': String(direction === current), 'aria-label': name, title: name });
                button.innerHTML = svg(`<text x="10" y="10" text-anchor="middle" dominant-baseline="central" font-size="13" font-weight="700" ` +
                    `font-family="system-ui,sans-serif" fill="currentColor" transform="rotate(${ORIENTATION_TURN[direction]} 10 10)">A</text>`);
                button.addEventListener('click', () => {
                    orientations.apply(direction);
                    button.blur();
                });
                group.append(button);
            });
            return [el('div', { class: 'ui-sub' }, ['Orientation']), group];
        }

        function renderToolOptions(tool, style, orientation) {
            const parts = [...(tool.styles.length ? styleGroup(tool, style) : []), ...(orientation ? orientationGroup(orientation) : [])];
            toolOptions.replaceChildren(...parts);
            toolOptions.hidden = parts.length === 0;
        }

        return {
            render(tool, style, orientation) {
                toolTree.select(tool);
                if (!open) {
                    showCurrent();
                }
                renderToolOptions(tool, style, orientation);
            }
        };
    }

    // ---- Wiring -----------------------------------------------------------------------------------------------------

    onDeskReady(({ cards, relayout, fit }) => {
        const tools = engine.listTools();
        // A tool the link does not list (Penpa+ was put in a hidden mode) is drawn with its mode's name alone.
        const toolFor = (current) => tools.find((t) => toolKey(t) === toolKey(current)) ??
            { mode: current.mode, modeName: current.mode, submode: current.submode, submodeName: null, name: current.mode, labels: [], styles: [] };

        const titleBarName = el('span', { class: 'ui-tool-name', 'data-testid': 'board-tool-name' });
        cards.board.head.append(titleBarName);

        const mode = buildModeCard(cards.mode.body, tools, (tool) => engine.setTool(tool), (style) => engine.colourSelection(style),
            { list: () => engine.listOrientations(), apply: (direction) => engine.setOrientation(direction) });

        // The tools the Mouse card is sized for: the link's Tab set and the pins (#199), which the solver mostly moves between;
        // another tool's rows may scroll. Every tool when the puzzle names none. Read from the fit on, after pins.js is up.
        function puzzleTools() {
            const keys = new Set([...engine.tabSet(), ...window.pinBoard.snapshot()].map(toolKey));
            const named = tools.filter((tool) => keys.has(toolKey(tool)));
            return named.length ? named : tools;
        }

        function sizeMouseCard() {
            // A closed card has no width to measure at; the desk sizes it again when it opens.
            if (cards.mouse.node.hidden) {
                return;
            }
            cards.mouse.body.style.height = '';
            cards.mouse.body.style.height = `${measureMouseBody(cards.mouse.body, puzzleTools()) + MOUSE_BODY_SLACK_PX}px`;
        }

        // The engine's `change` also fires for this file's own DOM changes, so a render that would draw the same tool
        // again does nothing: drawing it would fire `change` again.
        let drawn = '';
        function render() {
            const current = engine.getTool();
            const held = engine.getState().held;
            const orientation = engine.getOrientation();
            const now = `${toolKey(current)}/${current.style}/${orientation}/${held}`;
            if (now === drawn) {
                return;
            }
            drawn = now;
            const tool = toolFor(current);
            renderMouse(cards.mouse.body, tool, current.style, held);
            titleBarName.textContent = chipLabel(tool);
            // The label keeps to one line and may be cut short (desk.css), so its whole text is its tooltip.
            titleBarName.title = titleBarName.textContent;
            const colour = styleColour(tool, current.style);
            if (colour) {
                cards.board.node.style.setProperty('--ui-style-colour', colour);
                cards.board.node.style.setProperty('--ui-style-pill', pillFor(colour));
            } else {
                cards.board.node.style.removeProperty('--ui-style-colour');
                cards.board.node.style.removeProperty('--ui-style-pill');
            }
            mode.render(tool, current.style, orientation);
        }

        render();
        engine.on('change', render);
        // pins.js builds `window.pinBoard` in its own deskReady callback, which runs after this one: the fit waits for it.
        onDeskReady(() => {
            // The whole card's height for a card `cardWidth` wide, for the desk's fitted layout.
            fit.mouseCardHeight = (cardWidth) => {
                const { node, body } = cards.mouse;
                const bodyWidth = cardWidth - (node.offsetWidth - body.offsetWidth);
                return node.offsetHeight - body.offsetHeight + measureMouseBody(body, puzzleTools(), bodyWidth) + MOUSE_BODY_SLACK_PX;
            };
            fit.sizeMouseBody = sizeMouseCard;
            sizeMouseCard();
            relayout();
        });
        // The desk relays itself out on every resize; only a change in the Mouse card's height needs another pass.
        window.addEventListener('resize', () => {
            const before = cards.mouse.node.offsetHeight;
            sizeMouseCard();
            if (!cards.mouse.node.hidden && cards.mouse.node.offsetHeight !== before) {
                relayout();
            }
        });
    });
})();
