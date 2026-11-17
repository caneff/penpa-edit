// solve.html on a laptop screen (#181): the top bar keeps its title clear of the controls (centred, else at the left end,
// else with smaller buttons, never cut short), every top-bar button names itself on hover, and the fitted desk puts Rules
// over Mouse with no card over another and the right column stacked top-down. Read through bounding boxes and scroll sizes.
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { afterEach, describe, it } from 'node:test'
import { CARD_GAP_PX, ICEBREAKER, MOUSE_MIN_HEIGHT_PX, MOUSE_SLACK_PX, SLACK_PX, solveLinkInPage, steady } from './desk-puzzles.mjs'
import { afterChange, linkFromNewBoard, openSolvePage, useBrowser, waitForDesk } from './page.mjs'
import { settle } from './settle.mjs'

const browser = useBrowser()

const LAPTOPS = [{ width: 1280, height: 720 }, { width: 1366, height: 768 }, { width: 1536, height: 864 }]
const WIDE = { width: 1920, height: 1080 }
const HUGE = { width: 2560, height: 1440 }
const CARDS = ['Board', 'Mouse', 'Rules', 'Pinned', 'Mode', 'Recent']
// desk.js's top margin above each column, and desk.css's --ui-bar-padding.
const TOP_MARGIN_PX = 12
const BAR_PADDING_PX = 14
// The Board card's smallest width (desk.js's MIN_SIZE).
const MIN_BOARD_WIDTH_PX = 240
// The tallest a card's header may be, controls and all.
const HEAD_MAX_PX = 30
// desk.js's EDGE_MARGIN_PX: the least room a dragged card keeps to the desk's edges.
const EDGE_MARGIN_PX = 8
// The share of the left column Rules stops at when Mouse needs the rest (Chris, 2026-11-17).
const RULES_SHARE = 0.55

// A title too long for the bar's left end beside full-size buttons at 1280 wide, short enough for it beside smaller ones.
const LONG_TITLE = { ...ICEBREAKER, title: 'Icebreaker (Nurikabe + Icelom), longer title' }

// The Icebreaker rules four times over: more than Rules can show at a laptop size.
const LONG_RULES = { ...ICEBREAKER, rules: Array(4).fill(ICEBREAKER.rules).join('\n\n') }
// The long rules with only Line's three Mouse rows to show.
const LONG_LINE_RULES = { ...LONG_RULES, tabs: ['Line Normal'] }
// The long rules on another puzzle: an 8x8 board.
const OTHER_PUZZLE = { ...LONG_RULES, size: 8 }
// One short line of rules.
const ONE_LINE_RULES = { ...ICEBREAKER, rules: 'Shade some cells.' }

// Runs in the page. The bar's box, the heading's, every visible control's, and whether the title is cut short.
function readBarInPage () {
  const rect = (node) => { const r = node.getBoundingClientRect(); return { x: r.x, y: r.y, w: r.width, h: r.height } }
  const bar = document.querySelector('.ui-bar')
  const heading = bar.querySelector('.ui-heading')
  const title = heading.querySelector('.ui-title')
  const controls = [...bar.children].filter((node) => node !== heading && !node.matches('.ui-spacer') && node.getBoundingClientRect().width > 0)
  return {
    bar: rect(bar),
    heading: rect(heading),
    titleCut: title.scrollWidth > title.clientWidth,
    controls: controls.map((node) => ({ name: node.textContent.trim(), ...rect(node) })),
    buttonHeight: Math.max(...controls.filter((node) => node.matches('wa-button')).map((node) => node.getBoundingClientRect().height))
  }
}

// Runs in the page. Every card's box, the desk's, the card heads' and their buttons', and the bodies' overflow.
function readDeskInPage (names) {
  const rect = (node) => { const r = node.getBoundingClientRect(); return { x: r.x, y: r.y, w: r.width, h: r.height } }
  const section = (name) => document.querySelector(`section[aria-label="${name}"]`)
  const body = (name) => section(name).querySelector('.ui-body')
  return {
    desk: rect(document.querySelector('.ui-desk')),
    cards: Object.fromEntries(names.map((name) => [name, rect(section(name))])),
    heads: Object.fromEntries(names.map((name) => [name, rect(section(name).querySelector('.ui-head'))])),
    rulesButtons: [...section('Rules').querySelectorAll('.ui-head wa-button')].map(rect),
    titleMargins: [...document.querySelectorAll('.ui-head h2')].map((h2) => getComputedStyle(h2).margin),
    headButtonsFit: [...document.querySelectorAll('.ui-head')].every((head) => [...head.querySelectorAll('wa-button, .ui-tool-name')].every((node) => {
      const outer = head.getBoundingClientRect()
      const inner = node.getBoundingClientRect()
      return inner.top >= outer.top && inner.bottom <= outer.bottom
    })),
    zoomButtons: [...section('Board').querySelectorAll('.ui-head .ui-zoom wa-button')].map(rect),
    // Each header group's buttons, by the corner radii of their drawn boxes [top-left, top-right]: a joined group rounds
    // only its outer corners.
    groupCorners: [...document.querySelectorAll('.ui-zoom, .ui-rules-text')].map((group) => [...group.querySelectorAll('wa-button')].map((button) => {
      const base = getComputedStyle(button.shadowRoot.querySelector('[part~="base"]'))
      return [parseFloat(base.borderTopLeftRadius) > 0, parseFloat(base.borderTopRightRadius) > 0]
    })),
    overflowY: Object.fromEntries(['Board', 'Rules', 'Mouse'].map((name) => [name, body(name).scrollHeight - body(name).clientHeight]))
  }
}

const overlaps = (a, b) => a.x < b.x + b.w - 0.5 && b.x < a.x + a.w - 0.5 && a.y < b.y + b.h - 0.5 && b.y < a.y + a.h - 0.5
const near = (a, b) => Math.abs(a - b) <= SLACK_PX

// The tooltips showing now, by text. A Web Awesome tooltip is marked `open` while it shows.
const shownTooltips = async (page) => (await page.locator('wa-tooltip[open]').allTextContents()).map((t) => t.trim())
// The top bar's `wa-button` named `name` to screen readers. Not a role locator, which finds the native button inside its
// shadow root, and which a disabled button (Undo with nothing to undo) does not let the pointer reach.
const barButton = (page, name) => page.locator('.ui-bar wa-button').filter({ has: page.locator('.ui-sr-only').getByText(name, { exact: true }) })

// One link per puzzle for the file, since each costs a page of its own to build.
const links = new Map()
function linkFor (puzzle) {
  const key = JSON.stringify(puzzle)
  if (!links.has(key)) links.set(key, linkFromNewBoard(browser(), solveLinkInPage, puzzle))
  return links.get(key)
}

// Each bar control the heading overlaps, by name; none when the bar is clear.
const overlapping = (read) => read.controls.filter((c) => overlaps(read.heading, c)).map((c) => c.name || `control at ${c.x}`)

// Each pair of cards that overlap; none when the desk is clear.
function cardOverlaps (read) {
  const found = []
  for (const a of CARDS) for (const b of CARDS) if (a < b && overlaps(read.cards[a], read.cards[b])) found.push(`${a}/${b}`)
  return found
}

describe('the top bar on a laptop screen', () => {
  let opened
  afterEach(async () => { await opened?.context.close() })

  async function open (puzzle, viewport) {
    opened = await openSolvePage(browser(), await linkFor(puzzle), { contextOptions: { viewport } })
    return opened.page
  }

  const barAt = async (page, viewport) => {
    await page.setViewportSize(viewport)
    return steady(page, readBarInPage)
  }

  it('centres the title and author when there is room, and moves them to the left end when centring would overlap', async () => {
    const page = await open(ICEBREAKER, WIDE)
    const wide = await barAt(page, WIDE)
    assert.equal(near(wide.heading.x + wide.heading.w / 2, wide.bar.x + wide.bar.w / 2), true, `centred at ${WIDE.width}: ${JSON.stringify(wide.heading)}`)
    assert.deepEqual(overlapping(wide), [])

    const laptop = await barAt(page, LAPTOPS[1])
    const centredRight = laptop.bar.x + (laptop.bar.w + laptop.heading.w) / 2
    assert.equal(centredRight > Math.min(...laptop.controls.map((c) => c.x)), true, 'centred, the heading would reach the controls at 1366')
    assert.equal(near(laptop.heading.x, laptop.bar.x + BAR_PADDING_PX), true, `at the left end: ${JSON.stringify(laptop.heading)}`)
    assert.deepEqual(overlapping(laptop), [])
    assert.equal(laptop.buttonHeight, wide.buttonHeight, 'the buttons keep their size while the left end has room')
    assert.equal(laptop.titleCut, false, 'the title is whole')
  })

  it('moves the heading clear of a control added to the bar after it was placed', async () => {
    const page = await open(ICEBREAKER, WIDE)
    const before = await barAt(page, WIDE)
    assert.equal(near(before.heading.x + before.heading.w / 2, before.bar.x + before.bar.w / 2), true, 'centred to start with')
    await page.evaluate(() => {
      const wide = document.createElement('span')
      Object.assign(wide.style, { display: 'inline-block', width: '600px', height: '20px' })
      document.querySelector('.ui-bar').append(wide)
    })
    const after = await steady(page, readBarInPage)
    assert.deepEqual(overlapping(after), [])
    assert.equal(near(after.heading.x, after.bar.x + BAR_PADDING_PX), true, `at the left end: ${JSON.stringify(after.heading)}`)
  })

  for (const viewport of LAPTOPS) {
    it(`keeps every control clear of the whole title and author at ${viewport.width}x${viewport.height}`, async () => {
      const page = await open(ICEBREAKER, viewport)
      const read = await barAt(page, viewport)
      assert.deepEqual(overlapping(read), [])
      assert.equal(read.titleCut, false, 'the title is whole')
    })
  }

  it('makes the buttons smaller only when the title still overlaps them at the left end', async () => {
    const page = await open(LONG_TITLE, WIDE)
    const full = await barAt(page, WIDE)
    const small = await barAt(page, LAPTOPS[0])
    assert.equal(small.buttonHeight < full.buttonHeight, true, `buttons ${small.buttonHeight}px at 1280, ${full.buttonHeight}px at ${WIDE.width}`)
    assert.equal(near(small.heading.x, small.bar.x + BAR_PADDING_PX), true, `at the left end: ${JSON.stringify(small.heading)}`)
    assert.deepEqual(overlapping(small), [])
    assert.equal(small.titleCut, false, 'the title is whole')
  })

  it('has no theme button, and Reset layout is an icon unlike Restart\'s', async () => {
    const page = await open(ICEBREAKER, LAPTOPS[1])
    assert.equal(await page.locator('.ui-bar').getByRole('button', { name: /theme/i }).count(), 0, 'the theme is chosen in Settings')
    const read = (name) => barButton(page, name).evaluate((host) =>
      ({ icons: host.querySelectorAll('svg').length, icon: host.querySelector('svg')?.innerHTML, text: host.textContent.trim(), label: host.querySelector('.ui-sr-only').textContent }))
    const reset = await read('Reset layout')
    const restart = await read('Restart')
    assert.equal(reset.icons, 1, 'Reset layout shows an icon')
    assert.equal(reset.text, reset.label, 'and no visible text')
    assert.notEqual(reset.icon, restart.icon)
  })

  it('shows each top-bar button\'s label on hover, with its shortcut, and the current one after it changes', async () => {
    const page = await open(ICEBREAKER, LAPTOPS[1])
    const hoverLabel = async (name, label) => {
      await barButton(page, name).hover()
      return settle(() => shownTooltips(page), [label])
    }
    const want = { Undo: 'Undo (Ctrl+Z)', Redo: 'Redo (Ctrl+Y)', Restart: 'Restart', Pause: 'Pause (F4)', 'Open in Penpa+': 'Open in Penpa+', Settings: 'Settings', 'Reset layout': 'Reset layout' }
    const buttons = page.locator('.ui-bar wa-button')
    const names = await buttons.locator('.ui-sr-only').allTextContents()
    assert.equal(names.length, await buttons.count(), 'every top-bar button has a name')
    assert.deepEqual(names.sort(), Object.keys(want).sort(), 'every top-bar button is listed here')
    for (const [name, label] of Object.entries(want)) {
      assert.deepEqual(await hoverLabel(name, label), [label], `hovering ${name}`)
    }
    await barButton(page, 'Pause').click()
    // The pointer is still on the button after the click, so the next hover starts off it.
    await page.mouse.move(0, 0)
    assert.deepEqual(await hoverLabel('Resume', 'Resume (F4)'), ['Resume (F4)'])
  })
})

describe('the desk on a laptop screen', () => {
  let opened
  afterEach(async () => { await opened?.context.close() })

  async function open (viewport, puzzle = ICEBREAKER) {
    opened = await openSolvePage(browser(), await linkFor(puzzle), { contextOptions: { viewport } })
    return opened.page
  }

  const deskSettled = (page) => steady(page, readDeskInPage, CARDS)

  for (const viewport of LAPTOPS) {
    describe(`at ${viewport.width}x${viewport.height}`, () => {
      it('puts no card over another, and keeps the right column in order down to the desk\'s bottom', async () => {
        const read = await deskSettled(await open(viewport))
        assert.deepEqual(cardOverlaps(read), [])
        const { Pinned, Mode, Recent } = read.cards
        assert.equal(near(Pinned.y, read.desk.y + TOP_MARGIN_PX), true, `Pinned at ${Pinned.y}`)
        assert.equal(Mode.y >= Pinned.y + Pinned.h + CARD_GAP_PX - SLACK_PX, true, `Mode at ${Mode.y}, Pinned ends at ${Pinned.y + Pinned.h}`)
        assert.equal(near(Recent.y, Mode.y + Mode.h + CARD_GAP_PX), true, `Recent at ${Recent.y}, Mode ends at ${Mode.y + Mode.h}`)
        assert.equal(near(Recent.y + Recent.h, read.desk.y + read.desk.h - TOP_MARGIN_PX), true, `Recent ends at ${Recent.y + Recent.h}`)
      })

      it('puts Rules over Mouse, Rules showing its whole text or taking the larger share', async () => {
        const read = await deskSettled(await open(viewport))
        const { Rules, Mouse } = read.cards
        assert.equal(Rules.y < Mouse.y, true, `Rules at ${Rules.y}, Mouse at ${Mouse.y}`)
        assert.equal(read.overflowY.Rules <= 0 || Rules.h > Mouse.h, true, `Rules ${Rules.h}px hides ${read.overflowY.Rules}px; Mouse ${Mouse.h}px`)
        assert.equal(Mouse.h >= MOUSE_MIN_HEIGHT_PX - SLACK_PX, true, `Mouse is ${Mouse.h}px`)
      })

      it('gives every card one slim header height, and the Rules card\'s - and + the Board card\'s header button size', async () => {
        const read = await deskSettled(await open(viewport))
        assert.equal(read.rulesButtons.length, 2)
        for (const button of read.rulesButtons) {
          assert.deepEqual({ w: button.w, h: button.h }, { w: read.zoomButtons[0].w, h: read.zoomButtons[0].h })
        }
        const heights = Object.values(read.heads).map((head) => head.h)
        assert.deepEqual(new Set(heights).size, 1, `header heights ${heights}`)
        assert.equal(heights[0] <= HEAD_MAX_PX, true, `headers ${heights[0]}px tall`)
        assert.equal(read.headButtonsFit, true, 'every header control fits inside its header')
        assert.deepEqual(new Set(read.titleMargins), new Set(['0px']), 'no card title has a margin')
        for (const buttons of [read.zoomButtons, read.rulesButtons]) {
          buttons.slice(1).forEach((button, i) => assert.equal(button.x - (buttons[i].x + buttons[i].w) <= SLACK_PX, true, `joined: ${JSON.stringify(buttons)}`))
        }
        for (const corners of read.groupCorners) {
          assert.deepEqual(corners, corners.map((_, i) => [i === 0, i === corners.length - 1]), 'rounded only at the group\'s outer corners')
        }
      })
    })
  }

  it('puts Rules over Mouse in the default layout too, after a window resize', async () => {
    const page = await open(LAPTOPS[1])
    await deskSettled(page)
    await page.setViewportSize(LAPTOPS[0])
    const read = await deskSettled(page)
    assert.equal(read.cards.Rules.y < read.cards.Mouse.y, true, `Rules at ${read.cards.Rules.y}, Mouse at ${read.cards.Mouse.y}`)
    assert.deepEqual(cardOverlaps(read), [])
  })

  it('gives Rules the larger share when its text cannot fit', async () => {
    const read = await deskSettled(await open(LAPTOPS[0], LONG_RULES))
    const { Rules, Mouse } = read.cards
    assert.equal(read.overflowY.Rules > 0, true, 'the long rules do not fit')
    assert.equal(Rules.h > Mouse.h, true, `Rules ${Rules.h}px, Mouse ${Mouse.h}px`)
  })

  // A right-column card resized by its corner, in the fitted layout and in the default one a window resize leaves: the
  // restack that follows a card's change of height must not undo the solver's own resize.
  for (const after of ['the fitted layout', 'a window resize']) {
    it(`keeps a right-column card's resize in ${after}`, async () => {
      const page = await open(LAPTOPS[1])
      await deskSettled(page)
      if (after === 'a window resize') {
        await page.setViewportSize(LAPTOPS[2])
        await deskSettled(page)
      }
      const before = (await deskSettled(page)).cards.Pinned
      const handle = await page.getByRole('region', { name: 'Pinned' }).getByTestId('resize-bottom-right').boundingBox()
      await page.mouse.move(handle.x + handle.width / 2, handle.y + handle.height / 2)
      await page.mouse.down()
      await page.mouse.move(handle.x + handle.width / 2 - 30, handle.y + handle.height / 2 + 40, { steps: 5 })
      await page.mouse.up()
      const read = await deskSettled(page)
      assert.deepEqual({ w: Math.round(read.cards.Pinned.w), h: Math.round(read.cards.Pinned.h) }, { w: Math.round(before.w) - 30, h: Math.round(before.h) + 40 })
    })
  }

  it('restacks the right column when a card grows after the solver moved a card of another column', async () => {
    const page = await open(LAPTOPS[1])
    await deskSettled(page)
    const head = await page.getByRole('region', { name: 'Board' }).getByRole('heading', { name: 'Board' }).boundingBox()
    await page.mouse.move(head.x + head.width / 2, head.y + head.height / 2)
    await page.mouse.down()
    await page.mouse.move(head.x + head.width / 2 + 20, head.y + head.height / 2 + 20, { steps: 5 })
    await page.mouse.up()
    await page.evaluate(() => {
      const taller = document.createElement('div')
      taller.style.height = '120px'
      document.querySelector('section[aria-label="Pinned"] .ui-body').append(taller)
    })
    const read = await deskSettled(page)
    const { Pinned, Mode } = read.cards
    assert.equal(Mode.y >= Pinned.y + Pinned.h + CARD_GAP_PX - SLACK_PX, true, `Mode at ${Mode.y}, Pinned ends at ${Pinned.y + Pinned.h}`)
    assert.deepEqual(cardOverlaps(read).filter((pair) => !pair.includes('Board')), [])
  })

  it('names each header button of the Board and Rules cards on hover', async () => {
    const page = await open(LAPTOPS[1])
    const want = { Board: { 'Zoom out': 'Zoom out', 'Zoom in': 'Zoom in', Fit: 'Fit board' }, Rules: { 'Smaller rules text': 'Smaller rules text', 'Bigger rules text': 'Bigger rules text' } }
    for (const [card, labels] of Object.entries(want)) {
      for (const [name, label] of Object.entries(labels)) {
        await page.getByRole('region', { name: card }).getByRole('button', { name, exact: true }).hover()
        const shown = await settle(() => shownTooltips(page), [label])
        assert.deepEqual(shown, [label], `hovering ${card}'s ${name}`)
      }
    }
  })

  it('keeps the tool label on one line, cut short with its whole text as its tooltip, in a Board card dragged to its narrowest', async () => {
    const page = await open(LAPTOPS[0])
    const board = page.getByRole('region', { name: 'Board' })
    const label = page.getByTestId('board-tool-name')
    await page.evaluate(() => engine.setTool(engine.listTools().find((tool) => tool.mode === 'surface')))
    const oneLine = (await label.boundingBox()).height
    await page.evaluate(() => engine.setTool(engine.listTools().find((tool) => tool.mode === 'combi' && tool.submode === 'linex')))
    const handle = await board.getByTestId('resize-right').boundingBox()
    await page.mouse.move(handle.x + handle.width / 2, handle.y + handle.height / 2)
    await page.mouse.down()
    await page.mouse.move(handle.x - 1000, handle.y + handle.height / 2, { steps: 5 })
    await page.mouse.up()
    const read = await deskSettled(page)
    assert.equal(read.cards.Board.w <= MIN_BOARD_WIDTH_PX + SLACK_PX, true, `the Board card is ${read.cards.Board.w}px wide`)
    assert.equal((await label.boundingBox()).height, oneLine, 'the label stays one line')
    assert.equal(await label.evaluate((node) => node.scrollWidth > node.clientWidth), true, 'and is cut short')
    assert.equal(await label.getAttribute('title'), await label.textContent(), 'its whole text is its tooltip')
    assert.equal(read.overflowY.Board, 0, 'the board body does not scroll')
  })

  // Chris's case (Line + edge × at 1366) and the longest Composite name, at each laptop size.
  for (const viewport of LAPTOPS) {
    it(`keeps the Board card's tool label on one line at ${viewport.width}x${viewport.height}, so a Composite tool never makes the board scroll`, async () => {
      const page = await open(viewport)
      const label = page.getByTestId('board-tool-name')
      await page.evaluate(() => engine.setTool(engine.listTools().find((tool) => tool.mode === 'surface')))
      const oneLine = (await label.boundingBox()).height
      const composites = await page.evaluate(() => {
        const all = engine.listTools().filter((tool) => tool.mode === 'combi')
        const longest = all.reduce((a, b) => (b.submodeName.length > a.submodeName.length ? b : a))
        return [...new Set(['linex', longest.submode])]
      })
      for (const submode of composites) {
        await page.evaluate((sub) => engine.setTool(engine.listTools().find((tool) => tool.mode === 'combi' && tool.submode === sub)), submode)
        const read = await deskSettled(page)
        const text = await label.textContent()
        const want = await page.evaluate((sub) => toolGuide.chipLabel(engine.listTools().find((tool) => tool.mode === 'combi' && tool.submode === sub)), submode)
        assert.equal(text, want, 'the label names the Composite tool')
        assert.equal(read.overflowY.Board, 0, `${text}: the board body does not scroll`)
        assert.equal((await label.boundingBox()).height, oneLine, `${text}: the label stays one line`)
        const zoom = await page.getByRole('region', { name: 'Board' }).locator('.ui-zoom').boundingBox()
        const box = await label.boundingBox()
        assert.equal(box.x + box.width <= zoom.x + SLACK_PX, true, `${text}: the label ends before the zoom buttons`)
        assert.equal(await label.getAttribute('title'), text, `${text}: the full text is its tooltip`)
      }
    })
  }
})

// #199: the layout holds together through drags, resizes, window changes and puzzle changes.
describe('the desk holds together', () => {
  let opened
  afterEach(async () => { await opened?.context.close() })

  async function open (viewport, puzzle = ICEBREAKER) {
    opened = await openSolvePage(browser(), await linkFor(puzzle), { contextOptions: { viewport } })
    return opened.page
  }

  // `puzzle` in a second page of the opened page's context, which shares its localStorage.
  async function openBeside (puzzle) {
    const page = await opened.context.newPage()
    await page.goto(opened.page.url().replace(/#.*/, '') + await linkFor(puzzle))
    await waitForDesk(page)
    return page
  }

  const deskSettled = (page) => steady(page, readDeskInPage, CARDS)
  // The layout the desk keeps in localStorage, as text, or null when none is kept.
  const keptLayout = (page) => page.evaluate(() => localStorage.getItem('chinstrap-solve-layout-v1'))
  const cardsOf = async (page) => (await page.evaluate(readDeskInPage, CARDS)).cards

  async function dragFrom (page, point, dx, dy) {
    await page.mouse.move(point.x, point.y)
    await page.mouse.down()
    await page.mouse.move(point.x + dx, point.y + dy, { steps: 5 })
    await page.mouse.up()
  }
  async function headPoint (page, name) {
    const box = await page.getByRole('region', { name }).getByRole('heading', { name }).boundingBox()
    return { x: box.x + box.width / 2, y: box.y + box.height / 2 }
  }
  async function handlePoint (page, name, handle) {
    const box = await page.getByRole('region', { name }).getByTestId(`resize-${handle}`).boundingBox()
    return { x: box.x + box.width / 2, y: box.y + box.height / 2 }
  }
  // The card drawn on top at the middle of where cards `a` and `b` overlap, by name.
  const topAt = (page, a, b) => page.evaluate(([na, nb]) => {
    const r = (n) => document.querySelector(`section[aria-label="${n}"]`).getBoundingClientRect()
    const [ra, rb] = [r(na), r(nb)]
    const x = (Math.max(ra.left, rb.left) + Math.min(ra.right, rb.right)) / 2
    const y = (Math.max(ra.top, rb.top) + Math.min(ra.bottom, rb.bottom)) / 2
    return document.elementFromPoint(x, y)?.closest('section')?.getAttribute('aria-label')
  }, [a, b])

  it('brings a card dragged by its header above the cards it now overlaps', async () => {
    const page = await open(LAPTOPS[1])
    await deskSettled(page)
    await dragFrom(page, await headPoint(page, 'Board'), -200, 0)
    assert.equal(await topAt(page, 'Board', 'Rules'), 'Board')
  })

  it('brings a card resized by a handle above the cards it now overlaps', async () => {
    const page = await open(LAPTOPS[1])
    await deskSettled(page)
    await dragFrom(page, await handlePoint(page, 'Board', 'left'), -200, 0)
    assert.equal(await topAt(page, 'Board', 'Mouse'), 'Board')
  })

  it('treats a header press that moves a pixel or three as a click: nothing is kept', async () => {
    const page = await open(LAPTOPS[1])
    const before = (await deskSettled(page)).cards
    await dragFrom(page, await headPoint(page, 'Recent'), 1, 0)
    await dragFrom(page, await headPoint(page, 'Rules'), 2, 2)
    assert.equal(await keptLayout(page), null)
    assert.deepEqual((await deskSettled(page)).cards, before)
  })

  it('stops a right-edge and a bottom-edge resize at the window', async () => {
    const page = await open(LAPTOPS[1])
    await deskSettled(page)
    await dragFrom(page, await handlePoint(page, 'Pinned', 'right'), 600, 0)
    await dragFrom(page, await handlePoint(page, 'Recent', 'bottom'), 0, 600)
    const read = await deskSettled(page)
    assert.equal(read.cards.Pinned.x + read.cards.Pinned.w <= LAPTOPS[1].width + SLACK_PX, true, `Pinned ends at ${read.cards.Pinned.x + read.cards.Pinned.w}`)
    assert.equal(read.cards.Recent.y + read.cards.Recent.h <= LAPTOPS[1].height + SLACK_PX, true, `Recent ends at ${read.cards.Recent.y + read.cards.Recent.h}`)
  })

  it('keeps a dragged card the edge margin away from the desk\'s edges', async () => {
    const page = await open(LAPTOPS[1])
    await deskSettled(page)
    await dragFrom(page, await headPoint(page, 'Rules'), -2000, -2000)
    const read = await deskSettled(page)
    assert.deepEqual({ x: read.cards.Rules.x - read.desk.x, y: read.cards.Rules.y - read.desk.y }, { x: EDGE_MARGIN_PX, y: EDGE_MARGIN_PX })
  })

  it('shows a card as picked up while it is dragged', async () => {
    const page = await open(LAPTOPS[1])
    await deskSettled(page)
    const look = () => page.evaluate(() => {
      const card = document.querySelector('section[aria-label="Rules"]')
      return { cursor: getComputedStyle(card.querySelector('.ui-head')).cursor, shadow: getComputedStyle(card).boxShadow }
    })
    const still = await look()
    const from = await headPoint(page, 'Rules')
    await page.mouse.move(from.x, from.y)
    await page.mouse.down()
    await page.mouse.move(from.x + 30, from.y + 30, { steps: 3 })
    const moving = await look()
    await page.mouse.up()
    assert.equal(moving.cursor, 'grabbing')
    assert.notEqual(moving.shadow, still.shadow, 'a deeper shadow')
    assert.deepEqual(await look(), still, 'and back once dropped')
  })

  it('refits an untouched layout after the window is resized and back: the same as a fresh load at each size', async () => {
    const small = await openSolvePage(browser(), await linkFor(ICEBREAKER), { contextOptions: { viewport: LAPTOPS[0] } })
    const freshSmall = (await deskSettled(small.page)).cards
    await small.context.close()
    const page = await open(LAPTOPS[1])
    const fresh = (await deskSettled(page)).cards
    await page.setViewportSize(LAPTOPS[0])
    assert.deepEqual(await settle(() => cardsOf(page), freshSmall), freshSmall)
    await page.setViewportSize(LAPTOPS[1])
    assert.deepEqual(await settle(() => cardsOf(page), fresh), fresh)
  })

  it('keeps a zoom the solver set through the refit a window resize brings', async () => {
    const page = await open(LAPTOPS[1])
    const fresh = (await deskSettled(page)).cards
    const cell = () => page.evaluate(() => engine.getState().cellSize)
    await page.getByRole('region', { name: 'Board' }).getByRole('button', { name: 'Zoom in' }).click()
    const zoomed = await cell()
    await page.setViewportSize(LAPTOPS[0])
    await settle(async () => (await cardsOf(page)).Board.w < fresh.Board.w, true)
    assert.equal(await cell(), zoomed)
  })

  // The killer recording's puzzle, the one the layout hunt shrank the window on.
  const KILLER = JSON.parse(readFileSync(new URL('./recordings/solve/killer.steps.json', import.meta.url))).header.source

  // Each card with a move that puts it over no other card.
  for (const [card, dx, dy] of [['Recent', 0, 20], ['Board', 0, 20], ['Rules', -10, 0]]) {
    it(`puts no card over another after ${card} is moved at 1920x1080 and the window shrinks to 1366x768`, async () => {
      opened = await openSolvePage(browser(), KILLER, { contextOptions: { viewport: WIDE } })
      const { page } = opened
      await deskSettled(page)
      await dragFrom(page, await headPoint(page, card), dx, dy)
      assert.deepEqual(cardOverlaps(await deskSettled(page)), [], 'the move puts the card over none')
      await page.setViewportSize(LAPTOPS[1])
      // The resize event comes before the next frame.
      await afterChange(page)
      assert.deepEqual(await settle(async () => cardOverlaps(await page.evaluate(readDeskInPage, CARDS)), []), [])
    })
  }

  it('opens on the mended layout after a reload, once a smaller window had it fitted again', async () => {
    opened = await openSolvePage(browser(), KILLER, { contextOptions: { viewport: WIDE } })
    const { page } = opened
    await deskSettled(page)
    await dragFrom(page, await headPoint(page, 'Recent'), 0, 20)
    await page.setViewportSize(LAPTOPS[1])
    await afterChange(page)
    const mended = (await deskSettled(page)).cards
    await page.reload()
    await waitForDesk(page)
    assert.deepEqual(await settle(() => cardsOf(page), mended), mended)
  })

  // This and the one-line Rules test held before #199 too (#181's restack and minimums); they keep its acceptance checks.
  it('lays the right column out again when nine pins make Pinned taller', async () => {
    const page = await open(LAPTOPS[1])
    await deskSettled(page)
    await page.evaluate(() => window.pinBoard.replace(engine.listTools().slice(0, 9)))
    const pinnedMode = async () => cardOverlaps(await page.evaluate(readDeskInPage, CARDS)).filter((pair) => pair === 'Mode/Pinned')
    assert.deepEqual(await settle(pinnedMode, []), [])
    const read = await deskSettled(page)
    assert.equal(read.cards.Mode.y >= read.cards.Pinned.y + read.cards.Pinned.h + CARD_GAP_PX - SLACK_PX, true, `Mode at ${read.cards.Mode.y}, Pinned ends at ${read.cards.Pinned.y + read.cards.Pinned.h}`)
  })

  it('moves an untouched card down from under Pinned when Pinned grows in a column the solver changed', async () => {
    const page = await open(LAPTOPS[1])
    await deskSettled(page)
    await dragFrom(page, await headPoint(page, 'Pinned'), -10, 0)
    await page.evaluate(() => window.pinBoard.replace(engine.listTools().slice(0, 9)))
    const pinnedMode = async () => cardOverlaps(await page.evaluate(readDeskInPage, CARDS)).filter((pair) => pair === 'Mode/Pinned' || pair === 'Mode/Recent')
    assert.deepEqual(await settle(pinnedMode, []), [])
  })

  it('shows the Mode card\'s Style row at its smallest size', async () => {
    const page = await open(LAPTOPS[1])
    await deskSettled(page)
    await page.evaluate(() => engine.setTool(engine.listTools().find((tool) => tool.mode === 'surface')))
    await dragFrom(page, await handlePoint(page, 'Mode', 'bottom-right'), -2000, -2000)
    const hidden = await page.evaluate(() => {
      const body = document.querySelector('section[aria-label="Mode"] .ui-body')
      return body.querySelector('.ui-styles').getBoundingClientRect().bottom - body.getBoundingClientRect().bottom
    })
    assert.equal(hidden <= 0, true, `the Style row ends ${hidden}px below the body`)
  })

  it('shows one line of rules without a scrollbar at the Rules card\'s smallest size', async () => {
    const page = await open(LAPTOPS[1], ONE_LINE_RULES)
    await deskSettled(page)
    await dragFrom(page, await handlePoint(page, 'Rules', 'bottom-right'), -2000, -2000)
    assert.equal((await deskSettled(page)).overflowY.Rules, 0)
  })

  it('shows one line of rules without a scrollbar at the Rules card\'s smallest size on a wide desk with its largest text', async () => {
    const page = await open(HUGE, ONE_LINE_RULES)
    await deskSettled(page)
    const bigger = page.getByRole('button', { name: 'Bigger rules text' })
    while (await bigger.isEnabled()) await bigger.click()
    // Only the height: at the narrowest width this text is more than one line.
    await dragFrom(page, await handlePoint(page, 'Rules', 'bottom'), 0, -3000)
    assert.equal((await deskSettled(page)).overflowY.Rules, 0)
  })

  // The Mouse card's room below the lowest last row of any pinned tool, and its body's padding.
  const mouseSpare = (page) => page.evaluate(async () => {
    const body = document.querySelector('section[aria-label="Mouse"] .ui-body')
    const frames = () => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)))
    let lowest = 0
    for (const tool of window.pinBoard.snapshot()) {
      engine.setTool({ mode: tool.mode, submode: tool.submode })
      await frames()
      lowest = Math.max(lowest, body.querySelector('.ui-mrows').lastElementChild.getBoundingClientRect().bottom)
    }
    return { spare: body.getBoundingClientRect().bottom - lowest, padding: parseFloat(getComputedStyle(body).paddingBottom) }
  })

  it('sizes Mouse to the puzzle\'s own tools, with no room to spare, and gives Rules the rest when its text cannot fit', async () => {
    const page = await open(LAPTOPS[1], LONG_LINE_RULES)
    const read = await deskSettled(page)
    assert.equal(read.overflowY.Rules > 0, true, 'the long rules scroll')
    const { spare, padding } = await mouseSpare(page)
    assert.equal(Math.abs(spare - padding) <= MOUSE_SLACK_PX, true, `Mouse has ${spare}px below the tallest tool's last row, its padding ${padding}px`)
  })

  // Icebreaker's tools need more than 45% of the column, so Rules stops at 55% and Mouse takes the rest (the controller's
  // reading of Chris's ruling: the cap guarantees Mouse the lesser of its tallest tool and 45%).
  it('stops Rules at 55% of the column on Icebreaker, whose tools need the rest', async () => {
    const page = await open(LAPTOPS[1], LONG_RULES)
    const read = await deskSettled(page)
    const column = read.desk.h - 2 * TOP_MARGIN_PX
    assert.equal(Math.abs(read.cards.Rules.h - Math.floor(RULES_SHARE * column)) <= SLACK_PX, true, `Rules is ${read.cards.Rules.h}px of a ${column}px column`)
    assert.equal(read.overflowY.Rules > 0, true, 'and scrolls')
    const { spare, padding } = await mouseSpare(page)
    assert.equal(spare <= padding + MOUSE_SLACK_PX, true, `Mouse has ${spare}px below the tallest tool's last row`)
  })

  it('sizes Mouse for a pin added before a reload, the same as after a refit', async () => {
    const page = await open(LAPTOPS[1], LONG_LINE_RULES)
    // The page opens on Surface, outside the pins; on the Line pin, Mouse is sized for Line alone.
    await page.keyboard.press('Tab')
    const lineOnly = (await deskSettled(page)).cards
    // A pin with more Mouse rows than Line's, kept for the puzzle across the reload.
    await page.evaluate(() => {
      const rows = (tool) => window.toolGuide.mouseRows(tool).more.length
      window.pinBoard.replace([...window.pinBoard.snapshot(), [...engine.listTools()].sort((a, b) => rows(b) - rows(a))[0]])
    })
    await page.reload()
    await waitForDesk(page)
    const fresh = (await deskSettled(page)).cards
    assert.equal(fresh.Mouse.h > lineOnly.Mouse.h, true, `Mouse is ${fresh.Mouse.h}px with the pin, ${lineOnly.Mouse.h}px without`)
    await page.setViewportSize(LAPTOPS[0])
    await settle(async () => (await cardsOf(page)).Board.w < fresh.Board.w, true)
    await page.setViewportSize(LAPTOPS[1])
    assert.deepEqual(await settle(() => cardsOf(page), fresh), fresh)
  })

  it('keeps Mouse about 45% of the column when its tools need it, Rules scrolling past about 55%', async () => {
    const page = await open(LAPTOPS[1], LONG_RULES)
    await deskSettled(page)
    // A Tab set of the tools with the most Mouse rows, which need more than the column's lower 45%.
    await page.evaluate(() => {
      const rows = (tool) => window.toolGuide.mouseRows(tool).more.length
      window.pinBoard.replace([...engine.listTools()].sort((a, b) => rows(b) - rows(a)).slice(0, 6))
    })
    await page.getByRole('button', { name: 'Reset layout' }).click()
    const read = await deskSettled(page)
    const column = read.desk.h - 2 * TOP_MARGIN_PX
    assert.equal(read.cards.Rules.h <= RULES_SHARE * column + SLACK_PX, true, `Rules is ${read.cards.Rules.h}px of a ${column}px column`)
    assert.equal(read.overflowY.Rules > 0, true, 'and scrolls')
  })

  it('keeps a card the solver moved where it was on another puzzle, and fits the sizes to that puzzle', async () => {
    const page = await open(LAPTOPS[1])
    await deskSettled(page)
    await dragFrom(page, await headPoint(page, 'Recent'), 0, 40)
    const moved = (await deskSettled(page)).cards.Recent
    const other = await openBeside(OTHER_PUZZLE)
    const there = (await deskSettled(other)).cards
    await other.close()
    const fresh = await openSolvePage(browser(), await linkFor(OTHER_PUZZLE), { contextOptions: { viewport: LAPTOPS[1] } })
    const fitted = (await deskSettled(fresh.page)).cards
    await fresh.context.close()
    assert.deepEqual({ x: there.Recent.x, y: there.Recent.y }, { x: moved.x, y: moved.y }, 'Recent keeps its place')
    assert.deepEqual(there.Rules, fitted.Rules, 'Rules is sized for the long rules, as on a fresh desk')
  })

  it('mends a card kept from another puzzle that would sit over that puzzle\'s fitted cards', async () => {
    const page = await open(LAPTOPS[1])
    await deskSettled(page)
    // Mouse just under Icebreaker's short Rules, where the long rules' taller Rules card reaches.
    await dragFrom(page, await headPoint(page, 'Mouse'), 0, 10)
    const other = await openBeside(OTHER_PUZZLE)
    assert.deepEqual(cardOverlaps(await deskSettled(other)), [])
  })

  it('gives a wide desk\'s spare width to the side columns, and their text grows with the desk', async () => {
    const sizes = {}
    for (const viewport of [LAPTOPS[1], WIDE, HUGE]) {
      const page = await open(viewport)
      const read = await deskSettled(page)
      const { Rules, Board, Pinned } = read.cards
      const fonts = await page.evaluate(() => ['Rules', 'Mouse'].map((n) => parseFloat(getComputedStyle(document.querySelector(`section[aria-label="${n}"] ${n === 'Rules' ? '.ui-body' : '.ui-mrow'}`)).fontSize)))
      sizes[viewport.width] = { gaps: [Board.x - (Rules.x + Rules.w), Pinned.x - (Board.x + Board.w)], fonts }
      await opened.context.close()
      opened = null
    }
    const small = sizes[LAPTOPS[1].width]
    const huge = sizes[HUGE.width]
    assert.equal(Math.max(...huge.gaps) <= Math.max(...small.gaps) + SLACK_PX, true, `gaps ${huge.gaps} at ${HUGE.width}, ${small.gaps} at ${LAPTOPS[1].width}`)
    huge.fonts.forEach((px, i) => assert.equal(px > small.fonts[i], true, `${['Rules', 'Mouse'][i]} text ${px}px at ${HUGE.width}, ${small.fonts[i]}px at ${LAPTOPS[1].width}`))
  })
})
