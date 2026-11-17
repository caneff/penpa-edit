// One snapshot of the solve page (#195), what the UI fuzz's crash signals and rules read after every action: the window,
// each card's rectangle and heading, the Board label, the pins, Recent, the engine's tool, the solve page's storage and the
// page's errors so far. Not a check itself.

// Runs in the page: the snapshot's page half. A heading or label line is `{ text, height, lineHeight }`, `lineHeight` null
// when the style gives none in pixels; a chip is `{ shortcut, label, current }`, `shortcut` null on a chip with no key.
function pageStateInPage () {
  const rect = (node) => {
    const { x, y, width, height } = node.getBoundingClientRect()
    return { x, y, width, height }
  }
  const line = (node) => node && {
    text: node.textContent.trim(),
    height: node.getBoundingClientRect().height,
    lineHeight: parseFloat(getComputedStyle(node).lineHeight) || null
  }
  const chips = (strip) => [...document.querySelectorAll(`${strip} .ui-chip-main`)].map((chip) => {
    const shortcut = chip.querySelector('.ui-chip-num')
    return {
      shortcut: shortcut?.textContent.trim() ?? null,
      label: [...chip.childNodes].filter((n) => n !== shortcut).map((n) => n.textContent).join('').trim(),
      current: chip.getAttribute('aria-pressed') === 'true'
    }
  })
  return {
    window: { width: innerWidth, height: innerHeight },
    cards: [...document.querySelectorAll('section.ui-card')].map((card) => ({
      name: card.getAttribute('aria-label'),
      shown: !card.hidden,
      rect: rect(card),
      heading: line(card.querySelector('.ui-head h2'))
    })),
    boardLabel: line(document.querySelector('[data-testid="board-tool-name"]')),
    pins: chips('.ui-pins'),
    recent: chips('.ui-recent'),
    tool: engine.getTool(),
    // The solve page's own keys (layout, pins, presets), whatever each is called.
    storage: Object.fromEntries(Object.keys(localStorage).filter((key) => key.startsWith('chinstrap')).sort().map((key) => [key, localStorage.getItem(key)]))
  }
}

// The snapshot of `page`, whose page errors and `console.error` lines so far are `errors` (as `openPenpa` collects them).
export async function readPageState (page, errors) {
  return { ...await page.evaluate(pageStateInPage), errors: [...errors] }
}
