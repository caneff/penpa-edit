// The UI fuzz's actions (#195): what a solver does on `solve.html`, as weighted kinds fast-check draws lists of. Each action is
// one step that leaves the mouse up and no key held, so a shrunk list reads as plain steps and replays from its numbers. A
// list names its puzzle first, so its path replays on the same one. Not a check itself.
import fc from 'fast-check'
import { DRAG_REACH, pointsInPage } from '../fuzz.mjs'
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

// Each kind: `kind` its name, `weight` how often it is drawn against the others, `arg` the
// arbitrary of its argument, `label(arg)` the step as a list prints it (no comma: a printed list is joined by commas), and
// `run(page, arg)` the step, resolving to words for what the wrapped numbers picked, or nothing.
export const KINDS = [
  {
    kind: 'mode pick',
    weight: 3,
    arg: PICK,
    label: (pick) => `pick tool ${pick} in the Mode card`,
    run: async (page, pick) => {
      const tools = await page.evaluate(() => engine.listTools())
      const tool = tools[pick % tools.length]
      await pickInModeCard(page, tool)
      return tool.name
    }
  },
  {
    kind: 'click',
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
    weight: 3,
    arg: DRAG,
    label: ([first, ...rest]) => `drag from board point ${first} through neighbours ${rest.join(' ')}`,
    run: (page, picks) => drag(page, picks, 'left')
  },
  {
    kind: 'right drag',
    weight: 2,
    arg: DRAG,
    label: ([first, ...rest]) => `right-drag from board point ${first} through neighbours ${rest.join(' ')}`,
    run: (page, picks) => drag(page, picks, 'right')
  },
  {
    kind: 'undo',
    weight: 2,
    arg: fc.constantFrom('button', 'key'),
    label: (via) => `undo by ${via}`,
    run: (page, via) => history(page, 'Undo', UNDO_KEY, via)
  },
  {
    kind: 'redo',
    weight: 2,
    arg: fc.constantFrom('button', 'key'),
    label: (via) => `redo by ${via}`,
    run: (page, via) => history(page, 'Redo', REDO_KEY, via)
  },
  {
    kind: 'resize',
    weight: 1,
    arg: fc.nat({ max: WINDOW_SIZES.length - 1 }),
    label: (i) => `resize to ${WINDOW_SIZES[i].width}x${WINDOW_SIZES[i].height}`,
    run: (page, i) => page.setViewportSize(WINDOW_SIZES[i])
  }
]

// One step of kind `k` with `arg`, in the shape fast-check runs a command in; `real.page` is the page it runs on.
function commandOf (k, arg) {
  let picked = null
  return {
    kind: k.kind,
    check: () => true,
    run: async (model, real) => { picked = (await k.run(real.page, arg)) ?? null },
    toString: () => k.label(arg) + (picked ? ` (${picked.replaceAll(',', ' ')})` : '')
  }
}

// The replay path fast-check prints after a list of commands (`/*replayPath="..."*/`).
export const REPLAY_PATH = /\/\*replayPath="([^"]*)"\*\//

export const DEFAULT_MAX_COMMANDS = 20

// The generator of whole lists, each `{ puzzle, commands }`: a puzzle of `puzzles`, then at most `maxCommands` actions.
// `replayPath` replays a shrunk list (fast-check's own, read from a failure's printed list).
export const actionList = (puzzles, { maxCommands = DEFAULT_MAX_COMMANDS, replayPath } = {}) => fc.constantFrom(...puzzles).chain((puzzle) => {
  const action = fc.oneof(...KINDS.map((k) => ({ weight: k.weight, arbitrary: k.arg.map((arg) => commandOf(k, arg)) })))
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
