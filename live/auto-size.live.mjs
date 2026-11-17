// The cards' automatic sizes on solve.html (#252): Mode and Mouse are as tall as the tallest of the pinned tools and the
// current tool, so stepping through the pins never changes their height; the Mouse and Recent cards end at the desk's
// bottom; and a double-click on an edge the solver dragged returns that axis to its automatic size. Read through the
// cards' bounding boxes and the bodies' scroll sizes.
import assert from 'node:assert/strict'
import { afterEach, describe, it } from 'node:test'
import { ICEBREAKER, solveLinkInPage, steady } from './desk-puzzles.mjs'
import { linkFromNewBoard, openSolvePage, solveLinkOfImport, useBrowser } from './page.mjs'
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
// Box edges may differ by rounding.
const SLACK_PX = 1
// The Mode card's smallest height (desk.js's MIN_SIZE).
const MODE_MIN_HEIGHT_PX = 170
// desk.js's Mouse body slack for its borders, and rounding.
const MOUSE_SLACK_PX = 3
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

// Runs in the page: pins the tools named `names` (chip names), in order.
function pinByNameInPage (names) {
  const label = window.toolGuide.chipLabel
  window.pinBoard.replace(names.map((name) => {
    const tool = engine.listTools().find((t) => label(t) === name)
    if (!tool) throw new Error(`no tool named ${name}`)
    return tool
  }))
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
    await page.evaluate(pinByNameInPage, ICEBREAKER_PINS)
    // Fitted while the pin with the fewest Mode rows is current, so a card sized for the current tool alone is too short.
    await page.evaluate(() => engine.setTool(engine.listTools().find((t) => window.toolGuide.chipLabel(t) === 'Line > Normal')))
    await page.getByRole('button', { name: 'Reset layout' }).click()
    const reads = await stepThroughPins(page)
    assert.deepEqual(reads.map(({ mode, recentTop }) => ({ mode, recentTop })), reads.map(() => ({ mode: { ...reads[0].mode, overflow: 0 }, recentTop: reads[0].recentTop })), JSON.stringify(reads))
  })

  it('is as tall as its tallest pin needs, though fitted while a shorter pin was current', async () => {
    const link = await linkFromNewBoard(browser(), solveLinkInPage, ICEBREAKER)
    opened = await openSolvePage(browser(), link, { contextOptions: { viewport: LAPTOP } })
    const { page } = opened
    // Line > Normal, and Number > Normal, whose Style and Orientation rows need more than the card's smallest height.
    await page.evaluate(() => {
      const named = (name) => engine.listTools().find((t) => window.toolGuide.chipLabel(t) === name)
      window.pinBoard.replace([named('Line > Normal'), named('Number > Normal')])
      engine.setTool(named('Line > Normal'))
    })
    await page.getByRole('button', { name: 'Reset layout' }).click()
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

describe('the Mode card on a tall desk', () => {
  let opened
  afterEach(async () => { await opened?.context.close() })

  it('sits at the column\'s middle, so pins wrapping to a second row move neither Mode nor Recent', async () => {
    const link = await linkFromNewBoard(browser(), solveLinkInPage, ICEBREAKER)
    opened = await openSolvePage(browser(), link, { contextOptions: { viewport: HUGE } })
    const { page } = opened
    const before = await steady(page, readCardsInPage, CARDS)
    const rowsOfChips = () => page.evaluate(() => new Set([...document.querySelectorAll('.ui-pins > *')].map((chip) => chip.offsetTop)).size)
    assert.equal(await rowsOfChips(), 1, 'Icebreaker\'s pins start in one row')
    // Pins from the tools not yet pinned, one at a time, until the chips wrap.
    while (await rowsOfChips() < 2) {
      await page.evaluate(() => {
        const pinned = window.pinBoard.snapshot()
        const key = (t) => `${t.mode}/${t.submode}`
        const others = engine.listTools().filter((t) => !pinned.some((p) => key(p) === key(t)))
        window.pinBoard.replace([...pinned, ...others.slice(0, 1)])
      })
    }
    const after = await steady(page, readCardsInPage, CARDS)
    assert.equal(after.Pinned.h > before.Pinned.h, true, `Pinned grew: ${before.Pinned.h} to ${after.Pinned.h}`)
    const box = ({ x, y, w, h }) => ({ x, y, w, h })
    assert.deepEqual({ Mode: box(after.Mode), Recent: box(after.Recent) }, { Mode: box(before.Mode), Recent: box(before.Recent) })
    const columnMiddle = (before.Pinned.y + before.Recent.bottom) / 2
    assert.equal(Math.abs(before.Mode.y + before.Mode.h / 2 - columnMiddle) <= SLACK_PX, true, `Mode's middle ${before.Mode.y + before.Mode.h / 2}, the column's ${columnMiddle}`)
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
    await opened.page.evaluate(pinByNameInPage, ICEBREAKER_PINS)
    return opened.page
  }
  const cards = (page) => steady(page, readCardsInPage, CARDS)
  const handleOf = (page, card, handle) => page.getByRole('region', { name: card }).getByTestId(`resize-${handle}`)
  async function drag (page, card, handle, dx, dy) {
    const box = await handleOf(page, card, handle).boundingBox()
    const [x, y] = [box.x + box.width / 2, box.y + box.height / 2]
    await page.mouse.move(x, y)
    await page.mouse.down()
    await page.mouse.move(x + dx, y + dy, { steps: 5 })
    await page.mouse.up()
  }
  // The tool not pinned whose Mode options are tallest: picked, it makes an automatic Mode card taller.
  const pickTallestUnpinned = (page) => page.evaluate(() => {
    const pinned = window.pinBoard.snapshot().map((t) => `${t.mode}/${t.submode}`)
    const tool = engine.listTools().filter((t) => !pinned.includes(`${t.mode}/${t.submode}`)).sort((a, b) => b.styles.length - a.styles.length)[0]
    engine.setTool({ mode: tool.mode, submode: tool.submode })
  })
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
    await pickTallestUnpinned(page)
    assert.equal((await cards(page)).Mode.h, dragged.h, 'a hand-set height ignores the current tool')
    await handleOf(page, 'Mode', 'bottom').dblclick()
    const fitted = (await cards(page)).Mode
    await resetLayout(page)
    const reset = (await cards(page)).Mode
    assert.deepEqual(fitted, reset, 'the double-click gives the height Reset layout gives')
    assert.notEqual(fitted.h, dragged.h)
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
