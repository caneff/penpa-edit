// One snapshot of the solve page (#195), what the UI fuzz's crash signals and rules (`rules.mjs`) read after every action:
// the window, each card's rectangle, heading and background, the Board label and the name of the engine's tool, the Board
// card's scroll, the pins, Recent, the theme, the dialogs, the undo state and the board, and the page's errors so far.
// `rules.mjs` says what each field holds. Not a check itself.

// Runs in the page: the snapshot's page half. A heading or label line is `{ text, lines }`, `lines` the count of rows its
// text is drawn on; a chip is `{ shortcut, label, current }`, `shortcut` null on a chip with no key.
function pageStateInPage () {
  const rect = (node) => {
    const { x, y, width, height } = node.getBoundingClientRect()
    return { x, y, width, height }
  }
  // The rows a node's text sits on: the distinct tops of its text's line boxes, a pixel apart or more.
  const line = (node) => {
    if (!node) return null
    const range = document.createRange()
    range.selectNodeContents(node)
    const tops = [...range.getClientRects()].filter((r) => r.width > 0).map((r) => Math.round(r.top))
    return { text: node.textContent.trim(), lines: new Set(tops).size }
  }
  const chips = (strip) => [...document.querySelectorAll(`${strip} .ui-chip-main`)].map((chip) => {
    const shortcut = chip.querySelector('.ui-chip-num')
    return {
      shortcut: shortcut?.textContent.trim() ?? null,
      label: [...chip.childNodes].filter((n) => n !== shortcut).map((n) => n.textContent).join('').trim(),
      current: chip.getAttribute('aria-pressed') === 'true'
    }
  })
  // The name the solve page gives the engine's tool, as `tool-cards.js` names it: a tool the link does not list by its mode.
  const { chipLabel, toolKey } = window.toolGuide
  const tool = engine.getTool()
  const listed = engine.listTools().find((t) => toolKey(t) === toolKey(tool))
  const boardBody = document.querySelector('section.ui-card-board .ui-body')
  const { canUndo } = engine.getState()
  // The board as the solver changed it: Penpa+'s answer boards less the undo, redo and replay stacks, which an undo does
  // not take back.
  const { pu_a: answers, pu_a_col: colours } = window.readEngineState()
  const board = JSON.stringify([answers, colours], (key, value) => ['command_undo', 'command_redo', 'command_replay'].includes(key) ? undefined : value)
  return {
    window: { width: innerWidth, height: innerHeight },
    cards: [...document.querySelectorAll('section.ui-card')].map((card) => ({
      name: card.getAttribute('aria-label'),
      shown: !card.hidden,
      rect: rect(card),
      heading: line(card.querySelector('.ui-head h2')),
      background: getComputedStyle(card).backgroundColor
    })),
    boardLabel: line(document.querySelector('[data-testid="board-tool-name"]')),
    toolName: listed ? chipLabel(listed) : tool.mode,
    boardScroll: { width: boardBody.scrollWidth, clientWidth: boardBody.clientWidth, height: boardBody.scrollHeight, clientHeight: boardBody.clientHeight },
    pins: chips('.ui-pins'),
    recent: chips('.ui-recent'),
    tool,
    shortcutsEnabled: engine.getSettings().shortcuts_enabled,
    theme: engine.getSettings().theme,
    // Every dialog, open or closed: a step closes what it opens before the snapshot is read.
    dialogs: [...document.querySelectorAll('wa-dialog')].map((dialog) => ({
      label: dialog.getAttribute('label'),
      background: getComputedStyle(dialog.shadowRoot.querySelector('[part~="dialog"]')).backgroundColor
    })),
    canUndo,
    board
  }
}

// The snapshot of `page`, whose page errors and `console.error` lines so far are `errors` (as `openPenpa` collects them).
export async function readPageState (page, errors) {
  return { ...await page.evaluate(pageStateInPage), errors: [...errors] }
}
