// What must always be true on the solve page in a UI fuzz run (#195), as pure functions over page snapshots. The engine
// (`engine.mjs`) checks every rule after every action and once more after the last; a broken rule fails the run as a
// crash does. A rule tracks the page as master had it when the rule was written, not an older layout. Not a check itself.
//
// A rule is `{ name, check({ now, before, action, opened }) }`: `now` is the snapshot after the action and `before` the one
// before it; `action` is the step's `{ kind, arg }` (`actions.mjs`), null for the check after the last step; `opened` is the
// snapshot read before the first step, null once a reload has run. It returns one readable line per violation; none means
// the rule holds. A snapshot (`page-state.mjs`) holds:
//   window            the window's { width, height }
//   cards             one { name, shown, rect: { x, y, width, height }, heading: { text, lines }, background } per card,
//                     `lines` the rows the heading's text takes and `background` the card's computed colour
//   boardLabel        the Board card's tool label as { text, lines }
//   toolName          the name the solve page gives the engine's current tool
//   boardScroll       the Board card body's { width, clientWidth, height, clientHeight }: scroll sizes and visible sizes
//   pins, recent      the Pinned and Recent chips in order, each { shortcut, label, current }, `shortcut` null with no key
//   tool              the engine's { mode, submode, style }
//   shortcutsEnabled  whether the pin keys are on (the engine's `shortcuts_enabled` setting)
//   theme             'light' or 'dark'
//   dialogs           one { label, background } per open dialog, `background` its panel's computed colour
//   canUndo           whether the solver has something to undo
//   board             the solver's entries as text, the undo, redo and replay stacks left out

// The keys the first pins show, in order (`SHORTCUT_SLOT_BY_CODE` in docs/ui/pins.js).
const PIN_KEYS = ['Z', 'X', 'C', 'V']
// The mode in which a pin key types a letter instead (pins.js).
const NUMBER_MODE = 'number'
// Layout sizes are fractional pixels; this much of an overlap or an overhang is rounding, not a broken layout.
const SLACK_PX = 1
// A colour this light or lighter (WCAG relative luminance, 0 black to 1 white) is drawn in the light theme; darker is dark.
// The solve page's light cards are about 0.95 and its dark ones under 0.03.
const LIGHT_MIN_LUMINANCE = 0.4

const shownCards = (page) => page.cards.filter((c) => c.shown)
const box = ({ x, y, width, height }) => `${x},${y} ${width}x${height}`

// WCAG relative luminance of a computed `rgb(...)` or `rgba(...)` colour.
function luminance (colour) {
  const [r, g, b] = colour.match(/[\d.]+/g).slice(0, 3).map((c) => {
    const s = Number(c) / 255
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4
  })
  return 0.2126 * r + 0.7152 * g + 0.0722 * b
}
const themeOf = (colour) => luminance(colour) >= LIGHT_MIN_LUMINANCE ? 'light' : 'dark'

export const RULES = [
  {
    name: 'cards-do-not-overlap',
    check: ({ now }) => {
      const cards = shownCards(now)
      return cards.flatMap((a, i) => cards.slice(i + 1).flatMap((b) => {
        const w = Math.min(a.rect.x + a.rect.width, b.rect.x + b.rect.width) - Math.max(a.rect.x, b.rect.x)
        const h = Math.min(a.rect.y + a.rect.height, b.rect.y + b.rect.height) - Math.max(a.rect.y, b.rect.y)
        return w > SLACK_PX && h > SLACK_PX ? [`${a.name} and ${b.name} overlap by ${Math.round(w)}x${Math.round(h)} px`] : []
      }))
    }
  },
  {
    name: 'cards-inside-window',
    check: ({ now }) => shownCards(now).filter(({ rect }) => rect.x < -SLACK_PX || rect.y < -SLACK_PX ||
      rect.x + rect.width > now.window.width + SLACK_PX || rect.y + rect.height > now.window.height + SLACK_PX)
      .map((c) => `${c.name} (${box(c.rect)}) is not inside the ${now.window.width}x${now.window.height} window`)
  },
  {
    // The fuzz has no zoom action, so the board is always at Fit: an action that zooms needs this rule to skip after it.
    name: 'board-fits-card',
    check: ({ now }) => {
      const { width, clientWidth, height, clientHeight } = now.boardScroll
      return width > clientWidth + SLACK_PX || height > clientHeight + SLACK_PX
        ? [`the board at Fit scrolls its card: ${width}x${height} px in ${clientWidth}x${clientHeight} px`]
        : []
    }
  },
  {
    name: 'headings-on-one-line',
    check: ({ now }) => [
      ...(now.boardLabel.lines > 1 ? [`the Board label "${now.boardLabel.text}" takes ${now.boardLabel.lines} lines`] : []),
      ...shownCards(now).filter((c) => c.heading.lines > 1).map((c) => `the ${c.name} heading takes ${c.heading.lines} lines`)
    ]
  },
  {
    name: 'recent-lists-no-pin',
    check: ({ now }) => {
      const pinned = new Set(now.pins.map((p) => p.label))
      return now.recent.filter((r) => pinned.has(r.label)).map((r) => `Recent lists ${r.label}, which is pinned`)
    }
  },
  {
    name: 'pin-keys-select-their-pin',
    check: ({ now, before, action }) => {
      const labels = now.pins.flatMap((p, i) => p.shortcut === (PIN_KEYS[i] ?? null)
        ? []
        : [`pin ${i + 1} (${p.label}) shows ${p.shortcut ? `key ${p.shortcut}` : 'no key'}, not ${PIN_KEYS[i] ?? 'none'}`])
      if (action?.kind !== 'pin key' || before.tool.mode === NUMBER_MODE || !before.shortcutsEnabled) return labels
      // The action presses the key as typed (`z`); a chip shows it in capitals (`Z`).
      const key = action.arg.toUpperCase()
      const target = before.pins.find((p) => p.shortcut === key)
      if (!target || now.pins.some((p) => p.label === target.label && p.current)) return labels
      const current = now.pins.find((p) => p.current)
      return [...labels, `pressing ${key} left ${current ? `${current.label} current` : 'no pin current'}, not the pin it labels, ${target.label}`]
    }
  },
  {
    name: 'board-label-names-tool',
    check: ({ now }) => now.boardLabel.text === now.toolName ? [] : [`the Board label reads "${now.boardLabel.text}" but the tool is ${now.toolName}`]
  },
  {
    name: 'undo-to-start',
    check: ({ now, opened }) => !opened || opened.canUndo || now.canUndo || now.board === opened.board
      ? []
      : ['nothing is left to undo but the board is not as the page opened it']
  },
  {
    name: 'reload-keeps-layout-and-pins',
    check: ({ now, before, action }) => {
      if (action?.kind !== 'reload') return []
      const moved = before.cards.flatMap((was) => {
        const is = now.cards.find((c) => c.name === was.name)
        if (!is || is.shown !== was.shown) return [`the reload ${was.shown ? 'closed' : 'opened'} ${was.name}`]
        return was.shown && box(is.rect) !== box(was.rect) ? [`the reload moved ${was.name} from ${box(was.rect)} to ${box(is.rect)}`] : []
      })
      const pins = (page) => page.pins.map((p) => p.label).join(', ')
      return [...moved, ...(pins(now) === pins(before) ? [] : [`the reload changed the pins from ${pins(before)} to ${pins(now)}`])]
    }
  },
  {
    name: 'theme-reaches-everything',
    check: ({ now }) => [
      ...shownCards(now).filter((c) => themeOf(c.background) !== now.theme).map((c) => `the ${c.name} card is ${c.background} in the ${now.theme} theme`),
      ...now.dialogs.filter((d) => themeOf(d.background) !== now.theme).map((d) => `the ${d.label} dialog is ${d.background} in the ${now.theme} theme`)
    ]
  }
]

// Every broken rule's lines, each led by its rule's name; none means every rule holds.
export const ruleViolations = (context) => RULES.flatMap((r) => r.check(context).map((line) => `${r.name}: ${line}`))
