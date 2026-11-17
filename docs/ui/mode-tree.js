// The Mode card's tool tree: groups, modes and sub-modes (Symbols and marks one level deeper), each branch opening and closing on
// its own, with the ARIA tree keys. The rows are built once and only shown, hidden and marked afterwards, so a rebuild never
// lands between a mouse press and its release. Knows no `engine`.
(function () {
    'use strict';

    const { TOOL_GROUPS, placeTool, looseText, searchWords, looseWords, matchesSearch, toolKey } = window.toolGuide;
    const { el } = window.uiKit;

    const TREE_ID = 'tool-tree';

    const MODE_ATTRS = (tool) => ({ 'data-mode': tool.mode, 'data-submode': tool.submode ?? '' });

    const depth = (node) => 1 + Math.max(0, ...node.children.map(depth));
    const rootOf = (node) => (node.parent ? rootOf(node.parent) : node);

    // The "Open to" buttons, each with the branches it opens. Modes opens down to the level of the modes: the second, or the third
    // in Symbols and marks, whose subgroups sit above its symbols.
    const OPEN_TO = [
        ['Groups', () => false],
        ['Modes', (node) => node.level < (depth(rootOf(node)) === 4 ? 3 : 2)],
        ['Everything', () => true]
    ];

    // The tree's nodes: a branch has `children`, a leaf has its `tool`, the Penpa+ names it also answers to (`oldNames`) and the text it is searched by.
    // `labelText` holds only the names on the leaf's path, so a search matching it ranks above one that needs a description.
    function buildNodes(tools) {
        const node = (parent, label, level, tool = null, place = null) => {
            const made = { key: parent ? `${parent.key}/${label}` : label, label, level, parent, children: [], tool, description: place?.description };
            if (tool) {
                const ancestors = [];
                for (let at = parent; at; at = at.parent) {
                    ancestors.push(at.label);
                }
                made.oldNames = [...tool.labels, tool.mode, /^\d*$/.test(tool.submode ?? '') ? null : tool.submode].filter(Boolean);
                const fields = [...ancestors, label, place.name, place.description, tool.modeName, ...made.oldNames];
                made.text = fields.join(' ').toLowerCase();
                made.looseText = looseText(fields);
                made.labelText = [...ancestors, label].join(' ').toLowerCase();
                made.looseLabelText = looseText([...ancestors, label]);
            }
            parent?.children.push(made);
            return made;
        };
        const roots = TOOL_GROUPS.map(([id, title]) => ({ ...node(null, id, 1), label: title }));
        tools.map((tool) => ({ tool, place: placeTool(tool) })).sort((a, b) => a.place.rank - b.place.rank).forEach(({ tool, place }) => {
            const parent = place.trail.reduce((at, label) => at.children.find((c) => c.label === label && !c.tool) ?? node(at, label, at.level + 1),
                roots.find((root) => root.key === place.group));
            node(parent, place.label, parent.level + 1, tool, place);
        });
        return roots.filter((root) => root.children.length);
    }

    // `onBest(id)` hears the id of the row Enter would pick, or null.
    function createModeTree(tools, onPick, onBest) {
        const roots = buildNodes(tools);
        const all = [];
        const open = new Set();
        let words = [];
        let loose = false;
        let selectedKey = null;
        let focusable = null;
        let best = null;
        const selectedRow = () => visibleRows().find((n) => n.tool && toolKey(n.tool) === selectedKey);

        const tree = el('div', { role: 'tree', 'aria-label': 'Tools', id: TREE_ID, class: 'ui-tree' });

        function render(node) {
            const isLeaf = Boolean(node.tool);
            const row = el('div', {
                role: 'treeitem', 'aria-level': String(node.level), tabindex: '-1', class: 'ui-trow',
                ...(isLeaf ? { 'aria-selected': 'false', title: node.description, ...MODE_ATTRS(node.tool) } : { 'aria-expanded': 'false' })
            }, [
                el('span', { class: 'ui-tchev', 'aria-hidden': 'true' }, [isLeaf ? '' : '▸']),
                el('span', { class: 'ui-tname' }, [node.label]),
                el('span', { class: 'ui-tmatch', 'aria-hidden': 'true', hidden: '' }),
                el('span', { class: 'ui-tcount', 'aria-hidden': 'true' })
            ]);
            node.row = row;
            node.wrap = el('div', { role: 'none', class: `ui-tnode ui-tl${node.level}` }, [row]);
            all.push(node);
            if (!isLeaf) {
                const id = `tool-tree-${all.length}`;
                node.group = el('div', { role: 'group', id, class: 'ui-tgroup', hidden: '' }, node.children.map(render));
                row.setAttribute('aria-owns', id);
                node.wrap.append(node.group);
            }
            if (isLeaf) {
                row.id = `tool-tree-leaf-${all.length}`;
            }
            row.addEventListener('click', () => (isLeaf ? onPick(node.tool) : toggle(node)));
            return node.wrap;
        }
        tree.append(...roots.map(render));
        // The mouse press keeps the focus where it is, so the click that follows is a pick or a fold.
        tree.addEventListener('mousedown', (e) => e.preventDefault());

        // A radio's sub-mode value is a bare digit nobody saw in Penpa+, so it is neither searched nor shown. The hint names the
        // old name that holds the whole search, so it appears only when the row's own label does not.
        function showOldName(node, matched) {
            const hint = node.row.querySelector('.ui-tmatch');
            const holds = (name) => matchesSearch(loose ? looseText([name]) : name.toLowerCase(), words);
            const name = matched && !holds(node.label) ? node.oldNames.find(holds) : undefined;
            hint.textContent = name ? `Penpa+: ${name}` : '';
            hint.hidden = !name;
        }

        // Shows what the open set and the search say: a leaf shows when it matches; a branch shows when a leaf below does,
        // and is open while searching, so every match shows under its ancestors.
        function refresh() {
            const searching = words.length > 0;
            let shown = 0;
            const matches = [];
            const count = (node) => {
                const matching = node.tool ? [node].filter((leaf) => !searching || matchesSearch(searched(leaf, 'text'), words)) : node.children.flatMap(count);
                if (node.tool) {
                    showOldName(node, matching.length > 0 && searching);
                    matches.push(...matching);
                }
                const expanded = searching || open.has(node.key);
                node.wrap.hidden = matching.length === 0;
                if (!node.tool) {
                    node.row.setAttribute('aria-expanded', String(expanded));
                    node.group.hidden = !expanded;
                    node.row.querySelector('.ui-tcount').textContent = String(matching.length);
                }
                return matching;
            };
            roots.forEach((root) => { shown += count(root).length; });
            levels.hidden = searching;
            tree.classList.toggle('ui-searching', searching);
            markBest(searching ? matches : []);
            if (focusable?.row.closest('[hidden]')) {
                setFocusable(null);
            }
            if (!focusable) {
                setFocusable(visibleRows()[0] ?? null);
            }
            return shown;
        }

        function markBest(matches) {
            const labelled = matches.find((leaf) => matchesSearch(searched(leaf, 'labelText'), words));
            best = labelled ?? matches[0] ?? null;
            all.filter((n) => n.tool).forEach((n) => n.row.classList.toggle('ui-tbest', n === best));
            onBest(best?.row.id ?? null);
        }

        // A leaf's `text` or `labelText`, in the spelling the search is matched in.
        const searched = (leaf, field) => (loose ? leaf[field === 'text' ? 'looseText' : 'looseLabelText'] : leaf[field]);

        const visibleRows = () => all.filter((node) => !node.row.closest('[hidden]'));

        function setFocusable(node) {
            focusable?.row.setAttribute('tabindex', '-1');
            focusable = node;
            focusable?.row.setAttribute('tabindex', '0');
        }

        function toggle(node) {
            // A search holds every branch with a match open, so a fold would show nothing.
            if (words.length) {
                return;
            }
            if (!open.delete(node.key)) {
                open.add(node.key);
            }
            refresh();
        }

        function focusNode(node) {
            if (node) {
                setFocusable(node);
                node.row.focus();
                node.row.scrollIntoView({ block: 'nearest' });
            }
        }

        function onKey(e) {
            const node = all.find((n) => n.row === e.target);
            if (!node) {
                return;
            }
            const rows = visibleRows();
            const at = rows.indexOf(node);
            const isOpen = !node.tool && node.row.getAttribute('aria-expanded') === 'true';
            if (e.key === 'ArrowDown') {
                focusNode(rows[at + 1]);
            } else if (e.key === 'ArrowUp') {
                focusNode(rows[at - 1]);
            } else if (e.key === 'Home') {
                focusNode(rows[0]);
            } else if (e.key === 'End') {
                focusNode(rows[rows.length - 1]);
            } else if (e.key === 'ArrowRight' && !node.tool) {
                if (!isOpen) {
                    open.add(node.key);
                    refresh();
                } else {
                    focusNode(node.children.find((child) => !child.wrap.hidden));
                }
            } else if (e.key === 'ArrowLeft') {
                if (isOpen && !words.length) {
                    open.delete(node.key);
                    refresh();
                } else {
                    focusNode(node.parent);
                }
            } else if (e.key === 'Enter' || e.key === ' ') {
                node.row.click();
            } else {
                return;
            }
            e.preventDefault();
        }
        tree.addEventListener('keydown', onKey);

        const levels = el('div', { class: 'ui-levels' }, [
            el('span', { class: 'ui-levels-label', 'aria-hidden': 'true' }, ['Open to:']),
            el('div', { role: 'group', 'aria-label': 'Open to', class: 'ui-levels-buttons' }, OPEN_TO.map(([name, opens]) => {
                const button = el('button', { type: 'button', class: 'ui-levelbtn' }, [name]);
                button.addEventListener('click', () => {
                    open.clear();
                    all.filter((n) => !n.tool && opens(n)).forEach((n) => open.add(n.key));
                    refresh();
                });
                return button;
            }))
        ]);
        levels.addEventListener('mousedown', (e) => e.preventDefault());

        refresh();

        return {
            tree,
            levels,
            // Filters to the tools whose search text holds every word of `text`, loosely when none does; returns how many match.
            search(text) {
                loose = false;
                words = searchWords(text);
                const shown = refresh();
                if (shown > 0 || !words.length) {
                    return shown;
                }
                loose = true;
                words = looseWords(text);
                return refresh();
            },
            // Opens the branch holding `tool`, and keeps the rest of the open state.
            openBranchOf(tool) {
                const leaf = all.find((n) => n.tool && toolKey(n.tool) === toolKey(tool));
                for (let at = leaf?.parent; at; at = at.parent) {
                    open.add(at.key);
                }
                refresh();
            },
            select(tool) {
                selectedKey = toolKey(tool);
                all.filter((n) => n.tool).forEach((n) => n.row.setAttribute('aria-selected', String(toolKey(n.tool) === selectedKey)));
            },
            bestMatch() {
                return best?.tool ?? null;
            },
            focusSelected() {
                focusNode(selectedRow() ?? visibleRows()[0]);
            },
            scrollToSelected() {
                selectedRow()?.row.scrollIntoView({ block: 'nearest' });
            }
        };
    }

    window.modeTree = { createModeTree, TREE_ID };
})();
