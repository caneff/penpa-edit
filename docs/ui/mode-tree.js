// The Mode card's tool tree: groups, modes and sub-modes (Symbols and marks one level deeper), each branch opening and closing on
// its own, with the ARIA tree keys. The rows are built once and only shown, hidden and marked afterwards, so a rebuild never
// lands between a mouse press and its release. Knows no `engine`: tool-cards.js hands it the tools and takes the picks.
(function () {
    'use strict';

    const { TOOL_GROUPS, placeTool, searchWords, matchesSearch, toolKey } = window.toolGuide;
    const { el } = window.uiKit;

    // The "Open to" buttons: a branch opens when its level is below the number.
    const OPEN_TO = [['Groups', 1], ['Modes', 2], ['Everything', Infinity]];

    const MODE_ATTRS = (tool) => ({ 'data-mode': tool.mode, 'data-submode': tool.submode ?? '' });

    // The tree's nodes: a branch has `children`, a leaf has its `tool`.
    function buildNodes(tools) {
        const roots = TOOL_GROUPS.map(([id, title]) => ({ key: id, label: title, level: 1, parent: null, children: [], tool: null, text: title.toLowerCase() }));
        const add = (parent, label, tool = null) => {
            const node = { key: `${parent.key}/${label}`, label, level: parent.level + 1, parent, children: [], tool, text: '' };
            parent.children.push(node);
            return node;
        };
        tools.map((tool) => ({ tool, place: placeTool(tool) })).sort((a, b) => a.place.rank - b.place.rank).forEach(({ tool, place }) => {
            const parent = place.trail.reduce((at, label) => at.children.find((c) => c.label === label && !c.tool) ?? add(at, label),
                roots.find((root) => root.key === place.group));
            const leaf = add(parent, place.label, tool);
            leaf.description = place.description;
            const ancestors = [];
            for (let at = leaf.parent; at; at = at.parent) {
                ancestors.push(at.label);
            }
            leaf.text = [...ancestors, place.label, place.name, place.description, tool.modeName, ...tool.labels].join(' ').toLowerCase();
        });
        return roots.filter((root) => root.children.length);
    }

    // `onPick(tool)` is called with the tool of a clicked or entered leaf.
    function createModeTree(tools, onPick) {
        const roots = buildNodes(tools);
        const all = [];
        const open = new Set();
        let words = [];
        let selectedKey = null;
        let focusable = null;

        const tree = el('div', { role: 'tree', 'aria-label': 'Tools', id: 'tool-tree', class: 'ui-tree' });

        function render(node) {
            const isLeaf = Boolean(node.tool);
            const row = el('div', {
                role: 'treeitem', 'aria-level': String(node.level), tabindex: '-1', class: 'ui-trow',
                ...(isLeaf ? { 'aria-selected': 'false', title: node.description, ...MODE_ATTRS(node.tool) } : { 'aria-expanded': 'false' })
            }, [
                el('span', { class: 'ui-tchev', 'aria-hidden': 'true' }, [isLeaf ? '' : '▸']),
                el('span', { class: 'ui-tname' }, [node.label]),
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
            row.addEventListener('click', () => (isLeaf ? onPick(node.tool) : toggle(node)));
            return node.wrap;
        }
        tree.append(...roots.map(render));
        // The mouse press keeps the focus where it is, so the click that follows is a pick or a fold.
        tree.addEventListener('mousedown', (e) => e.preventDefault());

        // Shows what the open set and the search say: a leaf shows when it matches; a branch shows when a leaf below does,
        // and is open while searching, so every match shows under its ancestors.
        function refresh() {
            const searching = words.length > 0;
            let shown = 0;
            const count = (node) => {
                const matching = node.tool ? [node].filter((leaf) => !searching || matchesSearch(leaf.text, words)) : node.children.flatMap(count);
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
            if (focusable?.row.closest('[hidden]')) {
                setFocusable(null);
            }
            if (!focusable) {
                setFocusable(visibleRows()[0] ?? null);
            }
            return shown;
        }

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
            el('div', { role: 'group', 'aria-label': 'Open to', class: 'ui-levels-buttons' }, OPEN_TO.map(([name, depth]) => {
                const button = el('button', { type: 'button', class: 'ui-levelbtn' }, [name]);
                button.addEventListener('click', () => {
                    open.clear();
                    all.filter((n) => !n.tool && n.level < depth).forEach((n) => open.add(n.key));
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
            // Filters to the tools whose search text holds every word of `text`; returns how many match.
            search(text) {
                words = searchWords(text);
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
            // Marks `tool` as the picked one.
            select(tool) {
                selectedKey = toolKey(tool);
                all.filter((n) => n.tool).forEach((n) => n.row.setAttribute('aria-selected', String(toolKey(n.tool) === selectedKey)));
            },
            // The first tool the search shows, for Enter in the search box.
            firstMatch() {
                return visibleRows().find((n) => n.tool)?.tool ?? null;
            },
            // Puts the keyboard focus on the selected tool's row, or the first row shown.
            focusSelected() {
                const rows = visibleRows();
                focusNode(rows.find((n) => n.tool && toolKey(n.tool) === selectedKey) ?? rows[0]);
            },
            scrollToSelected() {
                visibleRows().find((n) => n.tool && toolKey(n.tool) === selectedKey)?.row.scrollIntoView({ block: 'nearest' });
            }
        };
    }

    window.modeTree = { createModeTree };
})();
