// The UI fuzz's actions (#195): what a solver does on `solve.html`, as weighted kinds fast-check draws lists of. Each kind
// names the area of the page it exercises, and `--focus <area>` draws that area's kinds more often. Each action is one step
// that leaves the mouse up, no key held and no list or dialog open, so a shrunk list reads as plain steps and replays from
// its numbers. A list names its puzzle first, so its path replays on the same one. Not a check itself.
import fc from 'fast-check'
import { DRAG_REACH, pointsInPage } from '../fuzz.mjs'
import { waitForDesk } from '../page.mjs'
import { choosePreset, closed, openList, pinnedCard, presetField, presetList, savePreset } from '../pin-card.mjs'
import { pickInModeCard, pointPixel } from '../replay.mjs'

// The windows a resize picks from, laptop to desktop.
export const WINDOW_SIZES = [
  { width: 1366, height: 768 }, { width: 1440, height: 900 }, { width: 1536, height: 864 }, { width: 1600, height: 900 }, { width: 1920, height: 1080 }
]
// A tool or a board point is drawn as a number the run wraps to what the page offers then (the puzzle's tools, the points
// the current mode takes), so a list replays from its numbers on any puzzle.
const PICK = fc.nat({ max: 999 })
const DIGITS = ['1', '2', '3', '4', '5', '6', '7', '8', '9']
// A drag passes through at most this many board points.
const MAX_DRAG_POINTS = 3
const DRAG = fc.array(PICK, { minLength: 2, maxLength: MAX_DRAG_POINTS })
const UNDO_KEY = 'Control+z'
const REDO_KEY = 'Control+y'
// The areas `--focus` names, each a card or a part of the page a kind declares it exercises.
export const AREAS = ['bar', 'board', 'mouse-rules', 'pinned', 'mode', 'recent', 'layout', 'theme']
// How many times more often a focused area's kinds are drawn.
const FOCUS_FACTOR = 5
// The cards a card action picks from, by name, and the resize handles by their `data-testid` suffix (desk.js).
const CARDS = ['Board', 'Mouse', 'Rules', 'Pinned', 'Mode', 'Recent']
const HANDLES = ['top', 'right', 'bottom', 'left', 'top-left', 'top-right', 'bottom-right', 'bottom-left']
// The moves a card drag or resize picks from, in pixels, each way.
const MOVES = [-240, -80, -20, 0, 20, 80, 240]
const MOVE = fc.nat({ max: MOVES.length - 1 })
const PIN_KEYS = ['z', 'x', 'c', 'v']
// A drag is let go in this many mouse moves, so the page sees it travel.
const DRAG_MOVES = 5
// What breaks off a card drag halfway: a key, a window resize, or the window losing focus.
const INTERRUPTIONS = ['Escape', 'resize', 'blur']
// A reload waits this long for the page: a navigation on a busy box takes longer than an action's click.
const RELOAD_TIMEOUT_MS = 30000
const PAUSE_KEY = 'F4'

// The points the current mode takes, each `{ x, y, num }`, and the cell size.
async function boardPoints (page) {
  const offered = await page.evaluate(pointsInPage)
  if (!offered.points.length) throw new Error('the board offers no point in the current mode')
  return offered
}

// Presses `button` at board point `first` (wrapped to the points the current mode takes), moves through `rest` and lets go;
// each of `rest` is wrapped to the points near the one before, as a hand's drag goes. The button is let go even when a
// move throws.
async function drag (page, [first, ...rest], button) {
  const { points, size } = await boardPoints(page)
  let at = points[first % points.length]
  const start = await pointPixel(page, at.num)
  await page.mouse.move(start.x, start.y)
  await page.mouse.down({ button })
  try {
    for (const pick of rest) {
      const from = at
      const near = points.filter((p) => p.num !== from.num && Math.hypot(p.x - from.x, p.y - from.y) <= DRAG_REACH * size)
      at = near.length ? near[pick % near.length] : from
      const { x, y } = await pointPixel(page, at.num)
      await page.mouse.move(x, y)
    }
  } finally {
    await page.mouse.up({ button })
  }
}

// The viewport pixel of board point `pick`, wrapped to the points the current mode takes.
async function boardPixel (page, pick) {
  const { points } = await boardPoints(page)
  return pointPixel(page, points[pick % points.length].num)
}

// Undo or Redo through the top bar's button, or through its key. A disabled button is a click that does nothing, as for a solver.
async function history (page, name, key, via) {
  if (via === 'key') return page.keyboard.press(key)
  const button = page.getByRole('button', { name, exact: true })
  if (!await button.evaluate((node) => node.hasAttribute('disabled'))) await button.click()
}

const button = (scope, name) => scope.getByRole('button', { name, exact: true })
const card = (page, name) => page.getByRole('region', { name, exact: true })
const settingsDialog = (page) => page.getByRole('dialog', { name: 'Settings' })
const isDisabled = (locator) => locator.evaluate((node) => node.hasAttribute('disabled') || node.getAttribute('aria-disabled') === 'true')

// What a step that found its control under another card resolves to: a solver may drag a card over another (desk.js keeps
// only the fitted cards apart), and a click there reaches the card on top, so the step does nothing.
const COVERED = 'covered by another card'

// Whether a click at the centre of `locator`'s element reaches it, and not a card dragged over it. Scrolls it into view first.
async function reachable (locator) {
  await locator.scrollIntoViewIfNeeded()
  const box = await locator.boundingBox()
  if (!box) return false
  return locator.evaluate((node, { x, y }) => {
    const hit = document.elementFromPoint(x, y)
    // The hit is inside the element, or inside the Web Awesome control whose shadow DOM holds it (a slotted label).
    for (let n = node; n; n = n.getRootNode().host) if (n.contains(hit)) return true
    return false
  }, { x: box.x + box.width / 2, y: box.y + box.height / 2 })
}

// Clicks `locator`'s element when a click reaches it; resolves to COVERED when one would not.
async function clickReachable (locator) {
  if (!await reachable(locator)) return COVERED
  await locator.click()
}

// Clicks the `pick`-th of what `locator` finds, wrapped to how many there are; resolves to its accessible name or text, to
// `none` when there is nothing to click, or to COVERED.
async function clickNth (locator, pick, none) {
  const count = await locator.count()
  if (!count) return none
  const target = locator.nth(pick % count)
  const name = (await target.getAttribute('aria-label')) ?? (await target.innerText()).replace(/\s+/g, ' ').trim()
  return (await clickReachable(target)) ?? name
}

// The centre of a card's heading, where a drag takes hold of the card; null when the card is closed.
async function headingCentre (page, name) {
  const section = card(page, name)
  if (!await section.isVisible()) return null
  const box = await section.locator('.ui-head h2').boundingBox()
  return { x: box.x + box.width / 2, y: box.y + box.height / 2 }
}

// Presses at `from`, moves by `dx`, `dy` in steps and lets go; `midway()`, when given, runs halfway, with the button down.
async function mouseDrag (page, from, dx, dy, midway) {
  await page.mouse.move(from.x, from.y)
  await page.mouse.down()
  try {
    await page.mouse.move(from.x + dx / 2, from.y + dy / 2, { steps: DRAG_MOVES })
    await midway?.()
    await page.mouse.move(from.x + dx, from.y + dy, { steps: DRAG_MOVES })
  } finally {
    await page.mouse.up()
  }
}

// Opens the Settings dialog, runs `inDialog(dialog)` and, unless `inDialog` closed it, closes it with Escape.
async function inSettings (page, inDialog) {
  await button(page, 'Settings').click()
  await settingsDialog(page).waitFor()
  // The settings are the open dialog's own children, outside the shadow DOM's inner `dialog` that holds the role.
  const result = await inDialog(page.locator('wa-dialog[open]'))
  if (await settingsDialog(page).isVisible()) await page.keyboard.press('Escape')
  await settingsDialog(page).waitFor({ state: 'hidden' })
  return result
}

// The other end of the window sizes from the current one: a resize that always changes the window.
const otherSize = (page) => WINDOW_SIZES[page.viewportSize().width === WINDOW_SIZES[0].width ? WINDOW_SIZES.length - 1 : 0]

// Runs `inList()` with the preset list open, then closes it with Escape in its field; resolves to COVERED, running nothing,
// when the field is under another card.
async function inPresetList (page, inList) {
  if (!await reachable(presetField(page))) return COVERED
  await openList(page)
  const result = await inList(presetList(page))
  await presetField(page).press('Escape')
  await closed(page)
  return result
}

// Each kind: `kind` its name, `area` the one of AREAS it exercises, `weight` how often it is drawn against the others, `arg` the
// arbitrary of its argument, `label(arg)` the step as a list prints it (no comma: a printed list is joined by commas), and
// `run(page, arg)` the step, resolving to words for what the wrapped numbers picked, or nothing.
export const KINDS = [
  {
    kind: 'mode pick',
    area: 'mode',
    weight: 3,
    arg: PICK,
    label: (pick) => `pick tool ${pick} in the Mode card`,
    run: async (page, pick) => {
      const tools = await page.evaluate(() => engine.listTools())
      const tool = tools[pick % tools.length]
      if (!await reachable(card(page, 'Mode').getByRole('combobox', { name: 'Tool' }))) return COVERED
      await pickInModeCard(page, tool)
      return tool.name
    }
  },
  {
    kind: 'click',
    area: 'board',
    weight: 5,
    arg: PICK,
    label: (pick) => `click board point ${pick}`,
    run: async (page, pick) => {
      const { x, y } = await boardPixel(page, pick)
      await page.mouse.click(x, y)
    }
  },
  {
    kind: 'digit',
    area: 'board',
    weight: 4,
    arg: fc.tuple(PICK, fc.constantFrom(...DIGITS)),
    label: ([pick, digit]) => `click board point ${pick} and type ${digit}`,
    run: async (page, [pick, digit]) => {
      const { x, y } = await boardPixel(page, pick)
      await page.mouse.click(x, y)
      await page.keyboard.press(digit)
    }
  },
  {
    kind: 'drag',
    area: 'board',
    weight: 3,
    arg: DRAG,
    label: ([first, ...rest]) => `drag from board point ${first} through neighbours ${rest.join(' ')}`,
    run: (page, picks) => drag(page, picks, 'left')
  },
  {
    kind: 'right drag',
    area: 'board',
    weight: 2,
    arg: DRAG,
    label: ([first, ...rest]) => `right-drag from board point ${first} through neighbours ${rest.join(' ')}`,
    run: (page, picks) => drag(page, picks, 'right')
  },
  {
    kind: 'undo',
    area: 'bar',
    weight: 2,
    arg: fc.constantFrom('button', 'key'),
    label: (via) => `undo by ${via}`,
    run: (page, via) => history(page, 'Undo', UNDO_KEY, via)
  },
  {
    kind: 'redo',
    area: 'bar',
    weight: 2,
    arg: fc.constantFrom('button', 'key'),
    label: (via) => `redo by ${via}`,
    run: (page, via) => history(page, 'Redo', REDO_KEY, via)
  },
  {
    kind: 'resize',
    area: 'layout',
    weight: 1,
    arg: fc.nat({ max: WINDOW_SIZES.length - 1 }),
    label: (i) => `resize to ${WINDOW_SIZES[i].width}x${WINDOW_SIZES[i].height}`,
    run: (page, i) => page.setViewportSize(WINDOW_SIZES[i])
  },
  {
    kind: 'mode search',
    area: 'mode',
    weight: 2,
    arg: fc.tuple(PICK, PICK),
    label: ([tool, word]) => `search the Mode card for word ${word} of tool ${tool} and press Enter`,
    run: async (page, [pick, wordPick]) => {
      const tools = await page.evaluate(() => engine.listTools())
      const words = tools[pick % tools.length].name.split(/[^\p{L}\p{N}]+/u).filter((w) => w !== '')
      const word = words[wordPick % words.length]
      const field = card(page, 'Mode').getByRole('combobox', { name: 'Tool' })
      if (!await reachable(field)) return COVERED
      await field.click()
      await field.fill(word)
      await field.press('Enter')
      // Enter with no match keeps the list open; Escape leaves the field either way.
      await field.press('Escape')
      return word
    }
  },
  {
    kind: 'pin toggle',
    area: 'pinned',
    weight: 2,
    arg: fc.constant(null),
    label: () => 'pin or unpin the current tool in the Mode card',
    run: async (page) => {
      const toggle = card(page, 'Mode').getByRole('button', { name: /^(Pin|Unpin) / })
      if (!await toggle.count() || await isDisabled(toggle.first())) return 'no pin button'
      return clickNth(toggle, 0)
    }
  },
  {
    kind: 'unpin',
    area: 'pinned',
    weight: 1,
    arg: PICK,
    label: (pick) => `unpin pin ${pick} in the Pinned card`,
    run: (page, pick) => clickNth(card(page, 'Pinned').getByRole('button', { name: /^Unpin / }), pick, 'no pin')
  },
  {
    kind: 'pin pick',
    area: 'pinned',
    weight: 2,
    arg: PICK,
    label: (pick) => `pick pin ${pick} in the Pinned card`,
    run: (page, pick) => clickNth(card(page, 'Pinned').locator('.ui-pins .ui-chip-main'), pick, 'no pin')
  },
  {
    kind: 'pin key',
    area: 'pinned',
    weight: 2,
    arg: fc.constantFrom(...PIN_KEYS),
    label: (key) => `press pin key ${key.toUpperCase()}`,
    run: (page, key) => page.keyboard.press(key)
  },
  {
    kind: 'pin drag',
    area: 'pinned',
    weight: 1,
    arg: fc.tuple(PICK, PICK),
    label: ([from, to]) => `drag pin ${from} onto pin ${to}`,
    run: async (page, [from, to]) => {
      const chips = card(page, 'Pinned').locator('.ui-pins .ui-chip')
      const count = await chips.count()
      if (count < 2) return 'fewer than two pins'
      const target = chips.nth(to % count)
      if (!await reachable(chips.nth(from % count)) || !await reachable(target)) return COVERED
      const box = await target.boundingBox()
      // Dropped on the target's left edge, so the dragged pin goes before it.
      await chips.nth(from % count).dragTo(target, { targetPosition: { x: 2, y: box.height / 2 } })
    }
  },
  {
    kind: 'recent pick',
    area: 'recent',
    weight: 2,
    arg: PICK,
    label: (pick) => `pick tool ${pick} in the Recent card`,
    run: (page, pick) => clickNth(card(page, 'Recent').locator('.ui-recent .ui-chip-main'), pick, 'nothing recent')
  },
  {
    kind: 'recent pin',
    area: 'recent',
    weight: 1,
    arg: PICK,
    label: (pick) => `pin tool ${pick} from the Recent card`,
    run: (page, pick) => clickNth(card(page, 'Recent').getByRole('button', { name: /^Pin / }), pick, 'nothing recent')
  },
  {
    kind: 'preset load',
    area: 'pinned',
    weight: 1,
    arg: PICK,
    label: (pick) => `load preset ${pick}`,
    run: async (page, pick) => {
      const name = await inPresetList(page, async (list) => {
        const options = list.getByRole('option')
        return (await options.nth(pick % await options.count()).innerText()).trim()
      })
      if (name === COVERED) return name
      await choosePreset(page, name)
      return name
    }
  },
  {
    kind: 'preset save',
    area: 'pinned',
    weight: 1,
    arg: fc.nat({ max: 3 }),
    label: (n) => `save the pins as preset Fuzz ${n}`,
    run: async (page, n) => {
      const save = pinnedCard(page).getByRole('button', { name: 'Save pins…', exact: true })
      if (await isDisabled(save)) return 'save is off'
      if (!await reachable(save)) return COVERED
      await savePreset(page, `Fuzz ${n}`)
    }
  },
  {
    kind: 'preset star',
    area: 'pinned',
    weight: 1,
    arg: PICK,
    label: (pick) => `star or unstar preset ${pick}`,
    run: (page, pick) => inPresetList(page, (list) => clickNth(list.getByRole('button', { name: /^Favourite / }), pick, 'no preset'))
  },
  {
    kind: 'preset delete',
    area: 'pinned',
    weight: 1,
    arg: fc.tuple(PICK, fc.boolean()),
    label: ([pick, undo]) => `delete saved preset ${pick}${undo ? ' and undo it' : ''}`,
    run: (page, [pick, undo]) => inPresetList(page, async (list) => {
      const deleted = await clickNth(list.getByRole('button', { name: /^Delete preset / }), pick, 'no saved preset')
      if (undo && deleted.startsWith('Delete preset ')) await pinnedCard(page).getByRole('button', { name: /^Undo delete of / }).click()
      return deleted
    })
  },
  {
    kind: 'card drag',
    area: 'layout',
    weight: 2,
    arg: fc.tuple(fc.nat({ max: CARDS.length - 1 }), MOVE, MOVE),
    label: ([c, dx, dy]) => `drag the ${CARDS[c]} card by ${MOVES[dx]} ${MOVES[dy]}`,
    run: async (page, [c, dx, dy]) => {
      const from = await headingCentre(page, CARDS[c])
      if (!from) return 'card closed'
      await mouseDrag(page, from, MOVES[dx], MOVES[dy])
    }
  },
  {
    kind: 'card resize',
    area: 'layout',
    weight: 2,
    arg: fc.tuple(fc.nat({ max: CARDS.length - 1 }), fc.nat({ max: HANDLES.length - 1 }), MOVE, MOVE),
    label: ([c, h, dx, dy]) => `resize the ${CARDS[c]} card from its ${HANDLES[h]} edge by ${MOVES[dx]} ${MOVES[dy]}`,
    run: async (page, [c, h, dx, dy]) => {
      if (!await card(page, CARDS[c]).isVisible()) return 'card closed'
      const box = await card(page, CARDS[c]).getByTestId(`resize-${HANDLES[h]}`).boundingBox()
      await mouseDrag(page, { x: box.x + box.width / 2, y: box.y + box.height / 2 }, MOVES[dx], MOVES[dy])
    }
  },
  {
    kind: 'interrupted drag',
    area: 'layout',
    weight: 1,
    arg: fc.tuple(fc.nat({ max: CARDS.length - 1 }), fc.constantFrom(...INTERRUPTIONS)),
    label: ([c, how]) => `drag the ${CARDS[c]} card and ${how === 'Escape' ? 'press Escape' : how === 'resize' ? 'resize the window' : 'leave the window'} halfway`,
    run: async (page, [c, how]) => {
      const from = await headingCentre(page, CARDS[c])
      if (!from) return 'card closed'
      const midway = {
        Escape: () => page.keyboard.press('Escape'),
        resize: () => page.setViewportSize(otherSize(page)),
        // Headless Chromium keeps its page focused, so the window losing focus is the event the page would hear.
        blur: () => page.evaluate(() => window.dispatchEvent(new Event('blur')))
      }[how]
      await mouseDrag(page, from, MOVES[MOVES.length - 2], MOVES[MOVES.length - 2], midway)
    }
  },
  {
    kind: 'close Mouse card',
    area: 'mouse-rules',
    weight: 1,
    arg: fc.constant(null),
    label: () => 'close the Mouse card',
    run: async (page) => {
      const close = button(page, 'Close Mouse card')
      if (!await close.isVisible()) return 'already closed'
      return clickReachable(close)
    }
  },
  {
    kind: 'reopen Mouse card',
    area: 'mouse-rules',
    weight: 1,
    arg: fc.constant(null),
    label: () => 'reopen the Mouse card in Settings',
    run: (page) => inSettings(page, async (dialog) => {
      if (await dialog.getByRole('switch', { name: 'Show Mouse card' }).isChecked()) return 'already shown'
      // Web Awesome's switch hides its input under the track, so the click goes to the switch element.
      await dialog.locator('wa-switch').filter({ has: page.getByRole('switch', { name: 'Show Mouse card' }) }).click()
    })
  },
  {
    kind: 'reset layout',
    area: 'layout',
    weight: 1,
    arg: fc.constantFrom('bar', 'Settings'),
    label: (where) => `Reset layout from the ${where === 'bar' ? 'top bar' : 'Settings dialog'}`,
    run: (page, where) => where === 'bar'
      ? button(page, 'Reset layout').click()
      : inSettings(page, (dialog) => dialog.getByRole('group', { name: 'Desk' }).getByRole('button', { name: 'Reset layout' }).click())
  },
  {
    kind: 'theme',
    area: 'theme',
    weight: 1,
    arg: fc.constantFrom('light', 'dark'),
    label: (theme) => `switch to the ${theme} theme in Settings`,
    run: (page, theme) => inSettings(page, async (dialog) => {
      await dialog.getByRole('combobox', { name: 'Theme' }).click()
      await page.getByRole('option', { name: theme === 'dark' ? 'Dark' : 'Light', exact: true }).click()
    })
  },
  {
    kind: 'restart',
    area: 'bar',
    weight: 1,
    arg: fc.boolean(),
    label: (confirm) => `Restart and ${confirm ? 'confirm' : 'cancel'}`,
    run: async (page, confirm) => {
      await button(page, 'Restart').click()
      const dialog = page.getByRole('dialog', { name: 'Restart the puzzle?' })
      await dialog.waitFor()
      await button(page, confirm ? 'Restart puzzle' : 'Cancel').click()
      await dialog.waitFor({ state: 'hidden' })
    }
  },
  {
    kind: 'pause and resume',
    area: 'bar',
    weight: 1,
    arg: fc.tuple(fc.constantFrom('button', PAUSE_KEY), fc.constantFrom('button', 'cover', PAUSE_KEY)),
    label: ([pause, resume]) => `pause by ${pause} and resume by ${resume}`,
    run: async (page, [pause, resume]) => {
      const cover = card(page, 'Paused')
      if (pause === PAUSE_KEY) await page.keyboard.press(PAUSE_KEY)
      else await button(page, 'Pause').click()
      await cover.waitFor()
      if (resume === PAUSE_KEY) await page.keyboard.press(PAUSE_KEY)
      else if (resume === 'cover') await button(cover, 'Resume').click()
      else await button(page.locator('.ui-bar'), 'Resume').click()
      await cover.waitFor({ state: 'hidden' })
    }
  },
  {
    kind: 'reload',
    area: 'layout',
    weight: 1,
    arg: fc.constant(null),
    label: () => 'reload the page',
    run: async (page) => {
      await page.reload({ timeout: RELOAD_TIMEOUT_MS })
      await waitForDesk(page)
    }
  }
]

// One step of kind `k` with `arg`, in the shape fast-check runs a command in; `real.page` is the page it runs on. `kind` and
// `arg` are what the rules read of the step (`rules.mjs`).
function commandOf (k, arg) {
  let picked = null
  return {
    kind: k.kind,
    area: k.area,
    arg,
    check: () => true,
    run: async (model, real) => { picked = (await k.run(real.page, arg)) ?? null },
    toString: () => k.label(arg) + (picked ? ` (${picked.replaceAll(',', ' ')})` : '')
  }
}

// The replay path fast-check prints after a list of commands (`/*replayPath="..."*/`).
export const REPLAY_PATH = /\/\*replayPath="([^"]*)"\*\//

export const DEFAULT_MAX_COMMANDS = 20

// The generator of whole lists, each `{ puzzle, commands }`: a puzzle of `puzzles`, then at most `maxCommands` actions, the
// kinds of each area in `focus` drawn FOCUS_FACTOR times as often. `replayPath` replays a shrunk list (fast-check's own,
// read from a failure's printed list); the weights shape the lists, so a replay needs the focus it was found with.
export const actionList = (puzzles, { maxCommands = DEFAULT_MAX_COMMANDS, replayPath, focus = [] } = {}) => fc.constantFrom(...puzzles).chain((puzzle) => {
  const weight = (k) => k.weight * (focus.includes(k.area) ? FOCUS_FACTOR : 1)
  const action = fc.oneof(...KINDS.map((k) => ({ weight: weight(k), arbitrary: k.arg.map((arg) => commandOf(k, arg)) })))
  return fc.commands([action], { maxCommands, size: 'max', replayPath }).map((commands) => ({ puzzle, commands, toString: () => String(commands) }))
})

// A list written out by hand: `steps` are `[kind, arg]` of the kinds above.
export function scriptedList (steps) {
  return steps.map(([kind, arg]) => {
    const k = KINDS.find((x) => x.kind === kind)
    if (!k) throw new Error(`no action kind "${kind}"`)
    return commandOf(k, arg)
  })
}
