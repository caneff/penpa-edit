// PROTOTYPE (throwaway, branch prototype/mode-tree, ticket #160): three ways to show the Mode card's tool picker as a
// collapsible tree (group -> mode -> sub-mode). Loaded only when solve.html has ?variant=A|B|C. Not production code.
(function () {
    'use strict';
    const variant = new URLSearchParams(location.search).get('variant');
    if (!variant) return;
    const css = `
    .pt-wrap{font-size:13px} .pt-search{width:100%;box-sizing:border-box;padding:6px 8px;border:1px solid #c9ccd3;border-radius:6px;margin-bottom:6px;font:inherit}
    .pt-levels{display:flex;gap:4px;margin-bottom:6px;align-items:center;color:#6b7180;font-size:11px} .pt-levels button{font:inherit;font-size:11px;padding:2px 8px;border:1px solid #c9ccd3;background:#f4f5f7;border-radius:999px;cursor:pointer}
    .pt-tree{max-height:420px;overflow:auto;border:1px solid #e1e3e8;border-radius:6px;padding:4px;background:#fff}
    .pt-row{display:flex;align-items:center;gap:4px;padding:3px 6px;border-radius:5px;cursor:pointer;user-select:none;outline:none}
    .pt-row:hover{background:#eef2fb} .pt-row:focus-visible{box-shadow:inset 0 0 0 2px #3b6fd4} .pt-row.cur{background:#dbe6ff;font-weight:700}
    .pt-chev{width:14px;display:inline-block;color:#6b7180;transition:transform .12s} .pt-open>.pt-row .pt-chev{transform:rotate(90deg)}
    .pt-l1>.pt-row{font-weight:700;color:#3b3e45;text-transform:uppercase;font-size:11px;letter-spacing:.04em;margin-top:2px}
    .pt-kids{margin-left:14px} .pt-closed>.pt-kids{display:none} .pt-count{margin-left:auto;color:#9aa0ac;font-size:11px}
    .pt-chips{display:flex;flex-wrap:wrap;gap:4px;margin:2px 0 6px 20px} .pt-chip{padding:2px 8px;border:1px solid #c9ccd3;border-radius:999px;background:#f7f8fa;cursor:pointer;font-size:12px}
    .pt-chip.cur{background:#3b6fd4;color:#fff;border-color:#3b6fd4}
    .pt-crumbs{display:flex;flex-wrap:wrap;gap:4px;align-items:center;margin-bottom:6px} .pt-crumbs button{font:inherit;border:0;background:none;color:#3b6fd4;cursor:pointer;padding:0}
    .pt-tiles{display:grid;grid-template-columns:1fr 1fr;gap:6px} .pt-tile{border:1px solid #d6d9df;border-radius:8px;padding:8px;cursor:pointer;background:#fafbfc}
    .pt-tile:hover{border-color:#3b6fd4} .pt-tile.cur{border-color:#3b6fd4;background:#eef3ff} .pt-tile b{display:block} .pt-tile small{color:#7a8090}
    .pt-bar{position:fixed;left:50%;bottom:14px;transform:translateX(-50%);z-index:3000;background:#1d1f25;color:#fff;border-radius:999px;padding:6px 10px;display:flex;gap:6px;align-items:center;font:13px system-ui;box-shadow:0 4px 18px rgba(0,0,0,.35)}
    .pt-bar a{color:#fff;text-decoration:none;padding:3px 10px;border-radius:999px} .pt-bar a.on{background:#3b6fd4}
    .ui-dark .pt-tree,.ui-dark .pt-tile,.ui-dark .pt-search{background:#22252c;color:#e3e6eb;border-color:#3a3f4b} .ui-dark .pt-row.cur{background:#2c3b5c}`;
    document.head.append(Object.assign(document.createElement('style'), { textContent: css }));
    const DESC = { A: 'A: classic tree, chevrons on every level, expand-to-level buttons', B: 'B: group accordions, modes as rows, sub-modes as chips', C: 'C: drill-down tiles with breadcrumbs, one level at a time' };
    const bar = document.createElement('div'); bar.className = 'pt-bar';
    bar.innerHTML = '<span>PROTOTYPE #160</span>' + ['A', 'B', 'C'].map((v) => { const u = new URL(location.href); u.searchParams.set('variant', v); return `<a href="${u}" class="${v === variant ? 'on' : ''}" title="${DESC[v]}">${v}</a>`; }).join('') + `<span style="opacity:.75">${DESC[variant] || ''}</span>`;
    document.body.append(bar);

    function data() {
        const { TOOL_GROUPS, describeTool } = window.toolGuide;
        const groups = TOOL_GROUPS.map(([id, title]) => ({ id, title, modes: [] }));
        for (const tool of engine.listTools()) {
            const g = groups.find((x) => x.id === describeTool(tool).group) || groups[groups.length - 1];
            let m = g.modes.find((x) => x.mode === tool.mode && (tool.mode !== 'combi' && tool.mode !== 'symbol' && tool.mode !== 'special'));
            if (!m) { m = { mode: tool.mode, name: ['combi', 'symbol', 'special'].includes(tool.mode) ? describeTool(tool).name : tool.modeName, tools: [] }; g.modes.push(m); }
            m.tools.push({ tool, name: ['combi', 'symbol', 'special'].includes(tool.mode) ? describeTool(tool).name : (tool.submodeName ? tool.submodeName[0].toUpperCase() + tool.submodeName.slice(1) : tool.modeName), desc: describeTool(tool).description });
        }
        return groups.filter((g) => g.modes.length);
    }
    const isCur = (t) => { const c = engine.getTool(); return c.mode === t.mode && (c.submode ?? null) === (t.submode ?? null); };
    const pick = (t) => { engine.setTool({ mode: t.mode, submode: t.submode, style: t.styles?.[0]?.style ?? null }); };
    const h = (tag, attrs = {}, kids = []) => { const n = document.createElement(tag); for (const [k, v] of Object.entries(attrs)) { if (k.startsWith('on')) n.addEventListener(k.slice(2), v); else n.setAttribute(k, v); } for (const c of [].concat(kids)) n.append(c); return n; };
    const matches = (q, ...s) => !q || s.join(' ').toLowerCase().includes(q.toLowerCase());

    function variantA(root) {
        const open = new Set(); let q = '';
        const tree = h('div', { class: 'pt-tree', role: 'tree', 'aria-label': 'Tools' });
        const search = h('input', { class: 'pt-search', placeholder: 'Search tools…', oninput: () => { q = search.value; render(); } });
        const lv = (n) => () => { open.clear(); for (const g of data()) { if (n >= 1) open.add(g.id); for (const m of g.modes) if (n >= 2 && m.tools.length > 1) open.add(g.id + '/' + m.name); } render(); };
        const levels = h('div', { class: 'pt-levels' }, ['Open to:', h('button', { onclick: lv(0) }, ['Groups']), h('button', { onclick: lv(1) }, ['Modes']), h('button', { onclick: lv(2) }, ['Everything'])]);
        root.append(search, levels, tree);
        for (const g of data()) for (const m of g.modes) for (const t of m.tools) if (isCur(t.tool)) { open.add(g.id); open.add(g.id + '/' + m.name); }
        function node(key, label, level, kids, count, leaf) {
            const isOpen = q ? true : open.has(key);
            const wrap = h('div', { class: `pt-l${level} ${leaf ? '' : isOpen ? 'pt-open' : 'pt-closed'}` });
            const row = h('div', { class: 'pt-row' + (leaf && isCur(leaf) ? ' cur' : ''), role: 'treeitem', tabindex: '-1', 'aria-level': String(level), ...(leaf ? {} : { 'aria-expanded': String(isOpen) }) },
                [h('span', { class: 'pt-chev' }, [leaf ? '' : '▸']), label, count ? h('span', { class: 'pt-count' }, [String(count)]) : '']);
            row.addEventListener('click', () => { if (leaf) pick(leaf); else { open.has(key) ? open.delete(key) : open.add(key); render(); } });
            row.addEventListener('keydown', (e) => {
                const rows = [...tree.querySelectorAll('.pt-row')].filter((r) => r.offsetParent); const i = rows.indexOf(row);
                if (e.key === 'ArrowDown') rows[i + 1]?.focus(); else if (e.key === 'ArrowUp') rows[i - 1]?.focus();
                else if (e.key === 'ArrowRight' && !leaf && !open.has(key)) { open.add(key); render(); }
                else if (e.key === 'ArrowLeft' && !leaf && open.has(key)) { open.delete(key); render(); }
                else if (e.key === 'Enter') row.click(); else return;
                e.preventDefault(); e.stopPropagation();
            });
            wrap.append(row); if (!leaf) wrap.append(h('div', { class: 'pt-kids', role: 'group' }, kids)); return wrap;
        }
        function render() {
            tree.replaceChildren(...data().map((g) => {
                const modes = g.modes.map((m) => {
                    const ts = m.tools.filter((t) => matches(q, g.title, m.name, t.name, t.desc));
                    if (!ts.length) return null;
                    if (m.tools.length === 1) return node('', m.name, 2, [], 0, ts[0].tool);
                    return node(g.id + '/' + m.name, m.name, 2, ts.map((t) => node('', t.name, 3, [], 0, t.tool)), ts.length);
                }).filter(Boolean);
                return modes.length ? node(g.id, g.title, 1, modes, modes.length) : null;
            }).filter(Boolean));
        }
        render(); engine.on('change', render);
    }

    function variantB(root) {
        const openG = new Set(), openM = new Set(); let q = '';
        const search = h('input', { class: 'pt-search', placeholder: 'Search tools…', oninput: () => { q = search.value; render(); } });
        const box = h('div', { class: 'pt-tree' });
        const levels = h('div', { class: 'pt-levels' }, ['Fold:', h('button', { onclick: () => { openG.clear(); openM.clear(); render(); } }, ['All groups']), h('button', { onclick: () => { data().forEach((g) => openG.add(g.id)); openM.clear(); render(); } }, ['Show modes']), h('button', { onclick: () => { data().forEach((g) => { openG.add(g.id); g.modes.forEach((m) => openM.add(g.id + m.name)); }); render(); } }, ['Show all'])]);
        root.append(search, levels, box);
        for (const g of data()) for (const m of g.modes) for (const t of m.tools) if (isCur(t.tool)) { openG.add(g.id); openM.add(g.id + m.name); }
        function render() {
            box.replaceChildren(...data().map((g) => {
                const ms = g.modes.filter((m) => m.tools.some((t) => matches(q, g.title, m.name, t.name, t.desc)));
                if (!ms.length) return '';
                const gOpen = q || openG.has(g.id);
                const head = h('div', { class: 'pt-row', style: 'font-weight:700;background:#f1f2f5;margin-top:3px', onclick: () => { openG.has(g.id) ? openG.delete(g.id) : openG.add(g.id); render(); } }, [h('span', { class: 'pt-chev', style: gOpen ? 'transform:rotate(90deg)' : '' }, ['▸']), g.title, h('span', { class: 'pt-count' }, [String(ms.length)])]);
                const body = !gOpen ? [] : ms.map((m) => {
                    const ts = m.tools.filter((t) => matches(q, g.title, m.name, t.name, t.desc));
                    const single = m.tools.length === 1; const mOpen = q || openM.has(g.id + m.name);
                    const row = h('div', { class: 'pt-row' + (single && isCur(m.tools[0].tool) ? ' cur' : '') + (!single && m.tools.some((t) => isCur(t.tool)) ? ' cur' : ''), style: 'margin-left:14px', onclick: () => { if (single) pick(m.tools[0].tool); else { openM.has(g.id + m.name) ? openM.delete(g.id + m.name) : openM.add(g.id + m.name); render(); } } },
                        [h('span', { class: 'pt-chev', style: !single && mOpen ? 'transform:rotate(90deg)' : '' }, [single ? '' : '▸']), m.name, single ? '' : h('span', { class: 'pt-count' }, [String(ts.length)])]);
                    const chips = !single && mOpen ? h('div', { class: 'pt-chips' }, ts.map((t) => h('span', { class: 'pt-chip' + (isCur(t.tool) ? ' cur' : ''), title: t.desc, onclick: () => pick(t.tool) }, [t.name]))) : '';
                    return h('div', {}, [row, chips]);
                });
                return h('div', {}, [head, ...body]);
            }));
        }
        render(); engine.on('change', render);
    }

    function variantC(root) {
        let path = []; let q = '';
        const search = h('input', { class: 'pt-search', placeholder: 'Search tools…', oninput: () => { q = search.value; render(); } });
        const crumbs = h('div', { class: 'pt-crumbs' }); const tiles = h('div', { class: 'pt-tiles' });
        root.append(search, crumbs, tiles);
        const tile = (title, sub, cur, onclick) => h('div', { class: 'pt-tile' + (cur ? ' cur' : ''), onclick }, [h('b', {}, [title]), h('small', {}, [sub])]);
        function render() {
            const gs = data();
            crumbs.replaceChildren(h('button', { onclick: () => { path = []; render(); } }, ['All']), ...path.map((p, i) => [' › ', h('button', { onclick: () => { path = path.slice(0, i + 1); render(); } }, [p.label])]).flat());
            if (q) { tiles.replaceChildren(...gs.flatMap((g) => g.modes.flatMap((m) => m.tools.filter((t) => matches(q, g.title, m.name, t.name, t.desc)).map((t) => tile(t.name, `${g.title} › ${m.name}`, isCur(t.tool), () => pick(t.tool)))))); return; }
            if (!path.length) { tiles.replaceChildren(...gs.map((g) => tile(g.title, `${g.modes.length} modes`, g.modes.some((m) => m.tools.some((t) => isCur(t.tool))), () => { path = [{ label: g.title, g }]; render(); }))); return; }
            const g = path[0].g;
            if (path.length === 1) { tiles.replaceChildren(...g.modes.map((m) => tile(m.name, m.tools.length > 1 ? `${m.tools.length} kinds` : m.tools[0].desc, m.tools.some((t) => isCur(t.tool)), () => { if (m.tools.length === 1) pick(m.tools[0].tool); else { path = [path[0], { label: m.name, m }]; render(); } }))); return; }
            tiles.replaceChildren(...path[1].m.tools.map((t) => tile(t.name, t.desc, isCur(t.tool), () => pick(t.tool))));
        }
        for (const g of data()) for (const m of g.modes) if (m.tools.some((t) => isCur(t.tool))) path = m.tools.length > 1 ? [{ label: g.title, g }, { label: m.name, m }] : [{ label: g.title, g }];
        render(); engine.on('change', render);
    }

    window.uiKit.onDeskReady(() => setTimeout(() => {
        const picker = document.querySelector('.ui-card-mode .ui-picker');
        if (!picker) return;
        picker.style.display = 'none';
        const root = h('div', { class: 'pt-wrap' }); picker.after(root);
        ({ A: variantA, B: variantB, C: variantC })[variant]?.(root);
    }, 50));
})();
