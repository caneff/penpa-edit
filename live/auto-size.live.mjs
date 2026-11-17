// The cards' automatic sizes on solve.html (#252): Mode and Mouse are as tall as the tallest of the pinned tools and the
// current tool, so stepping through the pins never changes their height; the Mouse and Recent cards end at the desk's
// bottom; and a double-click on an edge the solver dragged returns that axis to its automatic size. Read through the
// cards' bounding boxes and the bodies' scroll sizes.
import assert from 'node:assert/strict'
import { afterEach, describe, it } from 'node:test'
import { CARD_GAP_PX, ICEBREAKER, MODE_MIN_HEIGHT_PX, MOUSE_SLACK_PX, SLACK_PX, solveLinkInPage, steady } from './desk-puzzles.mjs'
import { linkFromNewBoard, openSolvePage, solveLinkOfImport, useBrowser, waitForDesk } from './page.mjs'
import { choosePreset } from './pin-card.mjs'
import { settle } from './settle.mjs'
import { IMPORTS } from './tier-c-puzzles.mjs'

const browser = useBrowser()

const LAPTOP = { width: 1366, height: 768 }
const FULL_HD = { width: 1920, height: 1080 }
const HUGE = { width: 2560, height: 1440 }
const CARDS = ['Board', 'Mouse', 'Rules', 'Pinned', 'Mode', 'Recent']
// The pins the ticket steps through on Icebreaker, by their chip names.
const ICEBREAKER_PINS = ['Surface', 'Line > Normal', 'Line + edge ×']
// Line > Normal, and Number > Normal, whose Style and Orientation rows need more than the Mode card's smallest height.
const TALL_PINS = ['Line > Normal', 'Number > Normal']
// A window too short for Mode at the right column's middle once Pinned holds one row: Mode sits under where two rows
// of pins would end.
const SHORT = { width: 1366, height: 500 }
// What every resize handle says on hover.
const FIT_TOOLTIP = 'Double-click to fit automatically'

// Runs in the page. Every card's box, rounded, and each body's hidden overflow.
function readCardsInPage (names) {
  const section = (name) => document.querySelector(`section[aria-label="${name}"]`)
  return Object.fromEntries(names.map((name) => {
    const r = section(name).getBoundingClientRect()
    const body = section(name).querySelector('.ui-body')
    return [name, { x: Math.round(r.x), y: Math.round(r.y), w: Math.round(r.width), h: Math.round(r.height), bottom: Math.round(r.bottom), overflow: body.scrollHeight - body.clientHeight }]
  }))
}

// Runs in the page: pins the tools named `names` (chip names), in order, then picks the tool named `current` when given.
function pinByNameInPage ({ names, current }) {
  const named = (name) => {
    const tool = engine.listTools().find((t) => window.toolGuide.chipLabel(t) === name)
    if (!tool) throw new Error(`no tool named ${name}`)
    return tool
  }
  window.pinBoard.replace(names.map(named))
  if (current) engine.setTool(named(current))
}

describe('the Mode card while stepping through the pins', () => {
  let opened
  afterEach(async () => { await opened?.context.close() })

  const cards = (page) => steady(page, readCardsInPage, CARDS)

  // Tab through every pin twice, reading the Mode card's box and Recent's top at the start and after each step.
  async function stepThroughPins (page) {
    const count = await page.evaluate(() => window.pinBoard.snapshot().length)
    const reads = []
    for (let step = 0; step <= 2 * count; step++) {
      if (step > 0) await page.keyboard.press('Tab')
      const read = await cards(page)
      reads.push({ tool: await page.evaluate(() => engine.getTool().mode), mode: { y: read.Mode.y, h: read.Mode.h, overflow: read.Mode.overflow }, recentTop: read.Recent.y })
    }
    return reads
  }

  it('keeps one height, and Recent one top, on Icebreaker at 1366x768', async () => {
    const link = await linkFromNewBoard(browser(), solveLinkInPage, ICEBREAKER)
    opened = await openSolvePage(browser(), link, { contextOptions: { viewport: LAPTOP } })
    const { page } = opened
    // Fitted while the pin with the fewest Mode rows is current, so a card sized for the current tool alone is too short.
    await page.evaluate(pinByNameInPage, { names: ICEBREAKER_PINS, current: 'Line > Normal' })
    await page.getByRole('button', { name: 'Reset layout' }).click()
    const reads = await stepThroughPins(page)
    assert.deepEqual(reads.map(({ mode, recentTop }) => ({ mode, recentTop })), reads.map(() => ({ mode: { ...reads[0].mode, overflow: 0 }, recentTop: reads[0].recentTop })), JSON.stringify(reads))
  })

  it('grows to its tallest pin as the pins change, and keeps that height on a shorter pin', async () => {
    const link = await linkFromNewBoard(browser(), solveLinkInPage, ICEBREAKER)
    opened = await openSolvePage(browser(), link, { contextOptions: { viewport: LAPTOP } })
    const { page } = opened
    // No Reset layout: the change of pins alone resizes the card.
    await page.evaluate(pinByNameInPage, { names: TALL_PINS, current: 'Line > Normal' })
    const reads = await stepThroughPins(page)
    assert.equal(reads[0].mode.h > MODE_MIN_HEIGHT_PX, true, `Mode is ${reads[0].mode.h}px, more than its smallest height`)
    assert.deepEqual(reads.map(({ mode }) => mode), reads.map(() => ({ ...reads[0].mode, overflow: 0 })), JSON.stringify(reads))
  })

  it('keeps one height, and Recent one top, with the Classic sudoku preset', async () => {
    opened = await openSolvePage(browser(), await solveLinkOfImport(browser(), IMPORTS['sudoku-9x9']), { contextOptions: { viewport: LAPTOP } })
    const { page } = opened
    await choosePreset(page, 'Classic sudoku')
    const reads = await stepThroughPins(page)
    assert.deepEqual(reads.map(({ mode, recentTop }) => ({ mode, recentTop })), reads.map(() => ({ mode: { ...reads[0].mode, overflow: 0 }, recentTop: reads[0].recentTop })), JSON.stringify(reads))
  })
})

describe('the side columns end at the desk\'s bottom', () => {
  let opened
  afterEach(async () => { await opened?.context.close() })

  const puzzles = {
    Icebreaker: (b) => linkFromNewBoard(b, solveLinkInPage, ICEBREAKER),
    'sudoku-9x9': (b) => solveLinkOfImport(b, IMPORTS['sudoku-9x9'])
  }
  for (const [name, linkOf] of Object.entries(puzzles)) {
    for (const viewport of [LAPTOP, FULL_HD, HUGE]) {
      it(`puts the Mouse and Recent cards' bottoms on the Board card's on ${name} at ${viewport.width}x${viewport.height}`, async () => {
        opened = await openSolvePage(browser(), await linkOf(browser()), { contextOptions: { viewport } })
        const read = await steady(opened.page, readCardsInPage, CARDS)
        assert.deepEqual({ Mouse: Math.abs(read.Mouse.bottom - read.Board.bottom) <= SLACK_PX, Recent: Math.abs(read.Recent.bottom - read.Board.bottom) <= SLACK_PX },
          { Mouse: true, Recent: true }, JSON.stringify(read))
      })
    }
  }
})

const rowsOfChips = (page) => page.evaluate(() => new Set([...document.querySelectorAll('.ui-pins > *')].map((chip) => chip.offsetTop)).size)

// Pins the tools not yet pinned, one at a time, from a single row of chips until the chips wrap to a second.
async function pinUntilTwoRows (page) {
  assert.equal(await rowsOfChips(page), 1, 'the pins start in one row')
  while (await rowsOfChips(page) < 2) {
    await page.evaluate(() => {
      const { toolKey } = window.toolGuide
      const pinned = new Set(window.pinBoard.snapshot().map(toolKey))
      window.pinBoard.replace([...window.pinBoard.snapshot(), engine.listTools().find((t) => !pinned.has(toolKey(t)))])
    })
  }
}

const box = ({ x, y, w, h }) => ({ x, y, w, h })

const handleOf = (page, card, handle) => page.getByRole('region', { name: card }).getByTestId(`resize-${handle}`)
const centre = (b) => ({ x: b.x + b.width / 2, y: b.y + b.height / 2 })
const handlePoint = async (page, card, handle) => centre(await handleOf(page, card, handle).boundingBox())
const headPoint = async (page, card) => centre(await page.getByRole('region', { name: card }).getByRole('heading', { name: card }).boundingBox())
async function dragFrom (page, point, dx, dy) {
  await page.mouse.move(point.x, point.y)
  await page.mouse.down()
  await page.mouse.move(point.x + dx, point.y + dy, { steps: 5 })
  await page.mouse.up()
}

describe('the Mode card on a tall desk', () => {
  let opened
  afterEach(async () => { await opened?.context.close() })

  it('sits at the column\'s middle, so pins wrapping to a second row move neither Mode nor Recent', async () => {
    const link = await linkFromNewBoard(browser(), solveLinkInPage, ICEBREAKER)
    opened = await openSolvePage(browser(), link, { contextOptions: { viewport: HUGE } })
    const { page } = opened
    const before = await steady(page, readCardsInPage, CARDS)
    await pinUntilTwoRows(page)
    const after = await steady(page, readCardsInPage, CARDS)
    assert.equal(after.Pinned.h > before.Pinned.h, true, `Pinned grew: ${before.Pinned.h} to ${after.Pinned.h}`)
    assert.deepEqual({ Mode: box(after.Mode), Recent: box(after.Recent) }, { Mode: box(before.Mode), Recent: box(before.Recent) })
    const columnMiddle = (before.Pinned.y + before.Recent.bottom) / 2
    assert.equal(Math.abs(before.Mode.y + before.Mode.h / 2 - columnMiddle) <= SLACK_PX, true, `Mode's middle ${before.Mode.y + before.Mode.h / 2}, the column's ${columnMiddle}`)
  })

  it('sits under where two rows of pins would end on a short desk, so the second row still moves nothing', async () => {
    const link = await linkFromNewBoard(browser(), solveLinkInPage, ICEBREAKER)
    opened = await openSolvePage(browser(), link, { contextOptions: { viewport: SHORT } })
    const { page } = opened
    await page.evaluate(pinByNameInPage, { names: ['Surface'] })
    const before = await steady(page, readCardsInPage, CARDS)
    const columnMiddle = (before.Pinned.y + before.Recent.bottom) / 2
    assert.equal(before.Mode.y + before.Mode.h / 2 > columnMiddle + SLACK_PX, true, `Mode's middle ${before.Mode.y + before.Mode.h / 2} is below the column's ${columnMiddle}`)
    await pinUntilTwoRows(page)
    const after = await steady(page, readCardsInPage, CARDS)
    assert.deepEqual({ Mode: box(after.Mode), Recent: box(after.Recent) }, { Mode: box(before.Mode), Recent: box(before.Recent) })
  })
})

describe('the Mouse card while stepping through the pins', () => {
  let opened
  afterEach(async () => { await opened?.context.close() })

  // Every pin in turn: the Mouse card's height, its body's hidden overflow, how far the last row ends below the body, and
  // the room left under it past the body's padding.
  async function mouseAtEachPin (page) {
    const count = await page.evaluate(() => window.pinBoard.snapshot().length)
    const reads = []
    for (let step = 0; step < count; step++) {
      if (step > 0) await page.keyboard.press('Tab')
      await steady(page, readCardsInPage, CARDS)
      reads.push(await page.evaluate(() => {
        const card = document.querySelector('section[aria-label="Mouse"]')
        const body = card.querySelector('.ui-body')
        return {
          h: Math.round(card.getBoundingClientRect().height),
          overflow: body.scrollHeight - body.clientHeight,
          lastRowBelow: Math.max(0, Math.round(body.querySelector('.ui-mrows').lastElementChild.getBoundingClientRect().bottom - body.getBoundingClientRect().bottom)),
          spare: body.getBoundingClientRect().bottom - body.querySelector('.ui-mrows').lastElementChild.getBoundingClientRect().bottom - parseFloat(getComputedStyle(body).paddingBottom)
        }
      }))
    }
    return reads
  }

  const cases = [
    { name: 'Icebreaker at 2560x1440', viewport: HUGE, link: (b) => linkFromNewBoard(b, solveLinkInPage, ICEBREAKER), hasRules: true },
    { name: 'the Classic sudoku preset at 1920x1080', viewport: FULL_HD, link: (b) => solveLinkOfImport(b, IMPORTS['sudoku-9x9']), preset: 'Classic sudoku' }
  ]
  for (const { name, viewport, link, preset, hasRules } of cases) {
    it(`shows every pin's rows in full, with no scrollbar and one height${hasRules ? ', leaving Rules the spare room,' : ''} on ${name}`, async () => {
      opened = await openSolvePage(browser(), await link(browser()), { contextOptions: { viewport } })
      const { page } = opened
      if (preset) await choosePreset(page, preset)
      const reads = await mouseAtEachPin(page)
      assert.deepEqual(reads.map(({ spare, ...read }) => read), reads.map(() => ({ h: reads[0].h, overflow: 0, lastRowBelow: 0 })))
      // Rules takes the room the tallest pin leaves (Chris, 2026-11-17); a link with no rules keeps Rules one line tall,
      // and Mouse takes the column.
      if (!hasRules) return
      const tightest = Math.min(...reads.map((read) => read.spare))
      assert.equal(tightest <= MOUSE_SLACK_PX, true, `Mouse keeps ${tightest}px below its tallest pin's last row`)
    })
  }
})

describe('a double-click on a dragged edge', () => {
  let opened
  afterEach(async () => { await opened?.context.close() })

  async function open () {
    const link = await linkFromNewBoard(browser(), solveLinkInPage, ICEBREAKER)
    opened = await openSolvePage(browser(), link, { contextOptions: { viewport: LAPTOP } })
    await opened.page.evaluate(pinByNameInPage, { names: ICEBREAKER_PINS })
    return opened.page
  }
  const cards = (page) => steady(page, readCardsInPage, CARDS)
  const drag = async (page, card, handle, dx, dy) => dragFrom(page, await handlePoint(page, card, handle), dx, dy)
  const resetLayout = (page) => page.getByRole('button', { name: 'Reset layout' }).click()

  it('names itself on every resize handle', async () => {
    const page = await open()
    await handleOf(page, 'Mode', 'bottom').hover()
    // A Web Awesome tooltip is marked `open` while it shows.
    const shown = async () => (await page.locator('wa-tooltip[open]').allTextContents()).map((t) => t.trim())
    assert.deepEqual(await settle(shown, [FIT_TOOLTIP]), [FIT_TOOLTIP])
    const texts = await page.evaluate(() => [...document.querySelectorAll('.ui-resize')].map((handle) =>
      document.querySelector(`wa-tooltip[for="${handle.id}"]`)?.textContent))
    assert.deepEqual(new Set(texts), new Set([FIT_TOOLTIP]))
  })

  it('returns a Mode card dragged taller to its automatic height, after it stopped following the current tool', async () => {
    const page = await open()
    const auto = (await cards(page)).Mode
    await drag(page, 'Mode', 'bottom', 0, 40)
    const dragged = (await cards(page)).Mode
    assert.equal(Math.abs(dragged.h - (auto.h + 40)) <= SLACK_PX, true, `dragged from ${auto.h} to ${dragged.h}`)
    // Number > Normal, not pinned, needs a taller card than the dragged one.
    await page.evaluate(pinByNameInPage, { names: ICEBREAKER_PINS, current: 'Number > Normal' })
    assert.equal((await cards(page)).Mode.h, dragged.h, 'a hand-set height ignores the current tool')
    await handleOf(page, 'Mode', 'bottom').dblclick()
    const fitted = (await cards(page)).Mode
    assert.equal(fitted.h > dragged.h, true, `automatic, Mode follows Number to ${fitted.h}px, past the dragged ${dragged.h}px`)
    await resetLayout(page)
    assert.deepEqual(fitted, (await cards(page)).Mode, 'the double-click gives the height Reset layout gives')
  })

  it('returns a card dragged by its header to its fitted place once no size of it is the solver\'s', async () => {
    const page = await open()
    await dragFrom(page, await headPoint(page, 'Mode'), -20, 30)
    await drag(page, 'Mode', 'bottom', 0, 40)
    await handleOf(page, 'Mode', 'bottom').dblclick()
    const fitted = await cards(page)
    await resetLayout(page)
    assert.deepEqual(fitted, await cards(page))
  })

  it('returns only the axis of the edge: a width set at the corner stays', async () => {
    const page = await open()
    const auto = (await cards(page)).Mode
    await drag(page, 'Mode', 'bottom-right', -30, 40)
    await handleOf(page, 'Mode', 'bottom').dblclick()
    const read = (await cards(page)).Mode
    assert.deepEqual({ w: read.w, h: read.h }, { w: auto.w - 30, h: auto.h })
  })

  it('returns a Mouse card dragged by its top edge to its automatic height', async () => {
    const page = await open()
    const auto = await cards(page)
    await drag(page, 'Mouse', 'top', 0, -40)
    assert.equal(Math.abs((await cards(page)).Mouse.h - (auto.Mouse.h + 40)) <= SLACK_PX, true, 'dragged 40 px taller')
    await handleOf(page, 'Mouse', 'top').dblclick()
    const read = await cards(page)
    assert.deepEqual({ Mouse: read.Mouse, Rules: read.Rules }, { Mouse: auto.Mouse, Rules: auto.Rules })
  })
})

describe('a layout the solver changed', () => {
  let opened
  afterEach(async () => { await opened?.context.close() })

  it('keeps the side columns down to the desk\'s bottom when the window grows taller', async () => {
    opened = await openSolvePage(browser(), await linkFromNewBoard(browser(), solveLinkInPage, ICEBREAKER), { contextOptions: { viewport: FULL_HD } })
    const { page } = opened
    await steady(page, readCardsInPage, CARDS)
    // Only the Board card's width is the solver's.
    await dragFrom(page, await handlePoint(page, 'Board', 'right'), -40, 0)
    await page.setViewportSize({ width: FULL_HD.width, height: 1300 })
    const read = await steady(page, readCardsInPage, CARDS)
    const bottom = read.Board.bottom
    assert.deepEqual({ Mouse: read.Mouse.bottom, Recent: read.Recent.bottom }, { Mouse: bottom, Recent: bottom })
    assert.equal(read.Mouse.y - read.Rules.bottom <= CARD_GAP_PX + SLACK_PX, true, `Rules ends at ${read.Rules.bottom}, Mouse starts at ${read.Mouse.y}`)
    assert.equal(bottom > 1200, true, `the Board card follows the window down to ${bottom}`)
  })

  it('sizes a Mode card placed on another puzzle for this puzzle\'s pins', async () => {
    opened = await openSolvePage(browser(), await linkFromNewBoard(browser(), solveLinkInPage, ICEBREAKER), { contextOptions: { viewport: LAPTOP } })
    await dragFrom(opened.page, await headPoint(opened.page, 'Mode'), -20, 20)
    // Another puzzle in the same browser, which keeps the Mode card's place.
    const page = await opened.context.newPage()
    await page.goto(opened.page.url().replace(/#.*/, '') + await linkFromNewBoard(browser(), solveLinkInPage, { ...ICEBREAKER, size: 8 }))
    await waitForDesk(page)
    await page.evaluate(pinByNameInPage, { names: TALL_PINS, current: 'Number > Normal' })
    const read = await steady(page, readCardsInPage, CARDS)
    assert.deepEqual({ taller: read.Mode.h > MODE_MIN_HEIGHT_PX, overflow: read.Mode.overflow }, { taller: true, overflow: 0 }, JSON.stringify(read.Mode))
  })
})
