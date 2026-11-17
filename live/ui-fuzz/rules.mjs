// What must always be true on the solve page in a UI fuzz run (#195), as pure functions over page snapshots. The engine
// (`engine.mjs`) checks every rule after every action and once more after the last; a broken rule fails the run as a
// crash does. A rule tracks the page as master had it when the rule was written, not an older layout. Not a check itself.
//
// A rule is `{ name, check({ now, before, action, opened, history }) }`: `now` is the snapshot after the action and `before`
// the one before it; `action` is the step's `{ kind, arg }` (`actions.mjs`), null for the check after the last step; `opened`
// is the snapshot read before the first step, null once a reload has run; `history` is the kinds of the steps run so far, in
// order, this one last. It returns one readable line per violation; none means
// the rule holds. A snapshot (`page-state.mjs`) holds:
//   window            the window's { width, height }
//   cards             one { name, shown, rect: { x, y, width, height }, heading: { text, lines }, background } per card,
//                     `lines` the rows the heading's text takes and `background` the card's computed colour
//   boardLabel        the Board card's tool label as { text, lines }
//   toolName          the name the solve page gives the engine's current tool
//   boardScroll       the Board card body's { width, clientWidth, height, clientHeight }: scroll sizes and visible sizes
//   pins, recent      the Pinned and Recent chips in order, each { shortcut, label, current }, `shortcut` null with no key
//   presetUndo        whether the Pinned card shows the line that offers to undo a preset load, save or delete
//   tool              the engine's { mode, submode, style }
//   shortcutsEnabled  whether the pin keys are on (the engine's `shortcuts_enabled` setting)
//   theme             'light' or 'dark'
//   dialogs           one { label, background } per dialog on the page, open or closed, `background` its panel's computed
//                     colour: a step closes the dialogs it opens before the snapshot, and a closed panel's colour is the one it
//                     opens with
//   canUndo           whether the solver has something to undo
//   board             the solver's entries as text, the undo, redo and replay stacks left out
//   errors            the page errors and `console.error` lines so far, which the engine reads as crash signals (`engine.mjs`)

// The keys the first pins show, in order (`SHORTCUT_SLOT_BY_CODE` in docs/ui/pins.js).
export const PIN_KEYS = ['Z', 'X', 'C', 'V']
// The action kinds by which the solver places a card by hand, and the one that gives the page its own layout back.
// The desk lets the solver put a card anywhere on the desk (docs/ui/desk.js), over another one included; nothing else
// the page does makes a new overlap on the solver's layout (`repairOverlaps` in desk.js).
const PLACING_KINDS = ['card drag', 'card resize', 'interrupted drag']
const RESET_LAYOUT = 'reset layout'
// The card whose chips last for the visit only (docs/ui/recent.js): a reload empties it, so its height follows.
const RECENT_CARD = 'Recent'
// The card whose height follows the current tool's option rows (docs/ui/tool-cards.js) until #252 fixes it.
const MODE_CARD = 'Mode'
// The card that shows a preset's undo line for the visit only (docs/ui/pin-presets.js): a reload drops it.
const PINNED_CARD = 'Pinned'
// The mode in which a pin key types a letter instead (pins.js).
const NUMBER_MODE = 'number'
// Layout sizes are fractional pixels; this much of an overlap or an overhang is rounding, not a broken layout.
const SLACK_PX = 1
// A colour this light or lighter (WCAG relative luminance, 0 black to 1 white) is drawn in the light theme; darker is dark.
// The solve page's light cards are about 0.95 and its dark ones under 0.03.
const LIGHT_MIN_LUMINANCE = 0.4

const shownCards = (page) => page.cards.filter((c) => c.shown)
// Whether the layout is the solver's: a card placed by hand since the page's own layout was last given back.
const solverPlaced = (history) => history.findLastIndex((kind) => PLACING_KINDS.includes(kind)) > history.lastIndexOf(RESET_LAYOUT)
const box = ({ x, y, width, height }) => `${x},${y} ${width}x${height}`

// Each pair of shown cards of `page` that overlap, as `{ key, line }`: `key` names the pair, `line` the overlap in words.
function overlaps (page) {
  const cards = shownCards(page)
  return cards.flatMap((a, i) => cards.slice(i + 1).flatMap((b) => {
    const w = Math.min(a.rect.x + a.rect.width, b.rect.x + b.rect.width) - Math.max(a.rect.x, b.rect.x)
    const h = Math.min(a.rect.y + a.rect.height, b.rect.y + b.rect.height) - Math.max(a.rect.y, b.rect.y)
    return w > SLACK_PX && h > SLACK_PX ? [{ key: `${a.name}|${b.name}`, line: `${a.name} and ${b.name} overlap by ${Math.round(w)}x${Math.round(h)} px` }] : []
  }))
}

// The WCAG relative luminance (0 black to 1 white) of a computed colour: null when it is fully transparent, undefined when
// it is not one read here. Chromium computes a colour as `rgb()` or `rgba()`, as `color(srgb r g b)` (a `color-mix()`), or
// as the `oklch()` or `oklab()` the stylesheet wrote.
function luminance (colour) {
  const match = /^([a-z]+)\((.*)\)$/.exec(colour.trim())
  if (!match) return undefined
  const [, fn, inner] = match
  const [channels, alpha] = inner.split('/')
  const parts = channels.trim().split(/[\s,]+/)
  // A channel or alpha as a number, `scale` being what 100% means.
  const num = (part, scale) => part.endsWith('%') ? Number(part.slice(0, -1)) / 100 * scale : Number(part)
  const opacity = alpha !== undefined ? num(alpha.trim(), 1) : fn.startsWith('rgb') && parts.length === 4 ? num(parts[3], 1) : 1
  if (opacity === 0) return null
  const fromRgb = (rgb) => {
    const [r, g, b] = rgb.map((c) => c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4)
    return 0.2126 * r + 0.7152 * g + 0.0722 * b
  }
  if (fn === 'rgb' || fn === 'rgba') return fromRgb(parts.slice(0, 3).map((p) => num(p, 255) / 255))
  if (fn === 'color' && parts[0] === 'srgb') return fromRgb(parts.slice(1, 4).map((p) => num(p, 1)))
  // Oklab's lightness is near the cube root of luminance for a grey; the solve page's backgrounds are near grey.
  if (fn === 'oklch' || fn === 'oklab') return num(parts[0], 1) ** 3
  return undefined
}
// 'light' or 'dark' for a computed colour; null when it is transparent or not a colour `luminance` reads.
function themeOf (colour) {
  const y = luminance(colour)
  return y == null || Number.isNaN(y) ? null : y >= LIGHT_MIN_LUMINANCE ? 'light' : 'dark'
}
// What is wrong, in words, with `what` drawn in `colour` in `theme`; null when nothing is.
function offTheme (what, colour, theme) {
  const drawn = themeOf(colour)
  if (drawn === theme) return null
  return drawn ? `${what} is ${colour} in the ${theme} theme` : `${what} is ${colour}, which reads as neither light nor dark, in the ${theme} theme`
}

export const RULES = [
  {
    // On the page's own layout, no two cards overlap. A card the solver put over another stays there, so on the solver's
    // layout only a pair that overlaps after a step and not before it is broken, unless the step was the solver placing a card.
    name: 'cards-do-not-overlap',
    check: ({ now, before, action, history }) => {
      const found = overlaps(now)
      if (!solverPlaced(history)) return found.map((o) => o.line)
      if (PLACING_KINDS.includes(action?.kind)) return []
      const had = new Set(overlaps(before).map((o) => o.key))
      return found.filter((o) => !had.has(o.key)).map((o) => `${o.line}, after a step that placed no card`)
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
      // A card whose content lasts the visit only may change height on a reload, and each card stacked under it in its
      // column must move by exactly as much: Recent's chips go, and so does Pinned's undo line (`presetUndo`). A reload can
      // also bring back another tool than the one in use (#263: it is kept only when Penpa+'s unawaited save on unload wins),
      // and the Mode card's height follows the tool (#252). The tool is #263's to check, not this rule's: when it changed,
      // Mode may change height too.
      const toolChanged = before.tool.mode !== now.tool.mode || before.tool.submode !== now.tool.submode
      const mayChange = { [RECENT_CARD]: true, [PINNED_CARD]: before.presetUndo, [MODE_CARD]: toolChanged }
      const grew = (name) => {
        const [was, is] = [before, now].map((page) => page.cards.find((c) => c.name === name))
        return mayChange[name] && was?.shown && is?.shown ? is.rect.height - was.rect.height : 0
      }
      const above = (rect) => before.cards.filter((c) => c.shown && mayChange[c.name] && Math.abs(rect.x - c.rect.x) <= SLACK_PX &&
        rect.y >= c.rect.y + c.rect.height)
      const moved = before.cards.flatMap((was) => {
        const is = now.cards.find((c) => c.name === was.name)
        if (!is || is.shown !== was.shown) return [`the reload ${was.shown ? 'closed' : 'opened'} ${was.name}`]
        const expected = {
          ...was.rect,
          y: was.rect.y + above(was.rect).reduce((sum, c) => sum + grew(c.name), 0),
          height: was.rect.height + grew(was.name)
        }
        const moved = ['x', 'y', 'width', 'height'].some((side) => Math.abs(is.rect[side] - expected[side]) > SLACK_PX)
        return was.shown && moved ? [`the reload moved ${was.name} from ${box(was.rect)} to ${box(is.rect)}`] : []
      })
      const pins = (page) => page.pins.map((p) => p.label).join(', ')
      return [...moved, ...(pins(now) === pins(before) ? [] : [`the reload changed the pins from ${pins(before)} to ${pins(now)}`])]
    }
  },
  {
    name: 'theme-reaches-everything',
    check: ({ now }) => [
      ...shownCards(now).map((c) => offTheme(`the ${c.name} card`, c.background, now.theme)),
      ...now.dialogs.map((d) => offTheme(`the ${d.label} dialog`, d.background, now.theme))
    ].filter((line) => line !== null)
  }
]

// Every broken rule's lines, each led by its rule's name; none means every rule holds.
export const ruleViolations = (context) => RULES.flatMap((r) => r.check(context).map((line) => `${r.name}: ${line}`))
