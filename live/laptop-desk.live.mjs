// solve.html on a laptop screen (#181): the top bar keeps its title clear of the controls (centred, else at the left end,
// else with smaller buttons, never cut short), every top-bar button names itself on hover, and the fitted desk puts Rules
// over Mouse with no card over another and the right column stacked top-down. Read through bounding boxes and scroll sizes.
import assert from 'node:assert/strict'
import { afterEach, describe, it } from 'node:test'
import { linkFromNewBoard, openSolvePage, useBrowser } from './page.mjs'
import { settle } from './settle.mjs'

const browser = useBrowser()

const LAPTOPS = [{ width: 1280, height: 720 }, { width: 1366, height: 768 }, { width: 1536, height: 864 }]
const WIDE = { width: 1920, height: 1080 }
const CARDS = ['Board', 'Mouse', 'Rules', 'Pinned', 'Mode', 'Recent']
// desk.js's margins: the top one above each column, the gap between two cards; and desk.css's --ui-bar-padding.
const TOP_MARGIN_PX = 12
const CARD_GAP_PX = 10
const BAR_PADDING_PX = 14
// The Mouse card's smallest height (desk.js's MIN_SIZE), which Rules leaves below itself.
const MOUSE_MIN_HEIGHT_PX = 140
// The Board card's smallest width (desk.js's MIN_SIZE).
const MIN_BOARD_WIDTH_PX = 240
// The tallest a card's header may be, controls and all.
const HEAD_MAX_PX = 30
// Box edges may differ by rounding.
const SLACK_PX = 1

// The puzzle Chris reviewed the page with: its title, author and rules, on a 10x10 board with pins.
const ICEBREAKER = {
  title: 'Icebreaker (Nurikabe + Icelom)',
  author: 'Agent',
  rules: 'Shade some cells so that the shaded cells form one connected area. Each number is part of an unshaded region of ' +
    'that size, and every unshaded region holds exactly one number. No 2x2 area is all shaded.\n\nIcelom: draw a path ' +
    'from the entrance to the exit that follows every arrow it passes and visits every ice cell; on ice it goes straight ' +
    'on. The path may cross itself only on ice.\n\nThe white circles must be visited by the path.',
  tabs: ['Surface', 'Line Normal', 'Composite']
}
// A title too long for the bar's left end beside full-size buttons at 1280 wide, short enough for it beside smaller ones.
const LONG_TITLE = { ...ICEBREAKER, title: 'Icebreaker (Nurikabe + Icelom), longer title' }

// The Icebreaker rules four times over: more than Rules can show at a laptop size.
const LONG_RULES = { ...ICEBREAKER, rules: Array(4).fill(ICEBREAKER.rules).join('\n\n') }

// Runs in the page: a new 10x10 board with `puzzle`'s title, author, rules and Tab set; returns its solve link's `#` part.
function solveLinkInPage ({ title, author, rules, tabs }) {
  document.getElementById('nb_size1').value = 10
  document.getElementById('nb_size2').value = 10
  create_newboard()
  document.getElementById('saveinfotitle').value = title
  document.getElementById('saveinfoauthor').value = author
  document.getElementById('saveinforules').value = rules
  UserSettings.tab_settings = tabs
  const url = pu.maketext_solve()
  return url.slice(url.indexOf('#'))
}

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

// Reads `inPage` until two reads in a row agree, and returns the last: the page lays out after it renders, so a read
// is taken once nothing moves.
async function steady (page, inPage, arg) {
  let last = null
  await settle(async () => {
    const now = JSON.stringify(await page.evaluate(inPage, arg))
    const same = now === last
    last = now
    return same
  }, true)
  return JSON.parse(last)
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
      it('puts no card over another, and stacks the right column top-down with the card gap', async () => {
        const read = await deskSettled(await open(viewport))
        assert.deepEqual(cardOverlaps(read), [])
        const { Pinned, Mode, Recent } = read.cards
        assert.equal(near(Pinned.y, read.desk.y + TOP_MARGIN_PX), true, `Pinned at ${Pinned.y}`)
        assert.equal(near(Mode.y, Pinned.y + Pinned.h + CARD_GAP_PX), true, `Mode at ${Mode.y}, Pinned ends at ${Pinned.y + Pinned.h}`)
        assert.equal(near(Recent.y, Mode.y + Mode.h + CARD_GAP_PX), true, `Recent at ${Recent.y}, Mode ends at ${Mode.y + Mode.h}`)
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

  it('gives Rules the larger share when its text cannot fit, leaving Mouse its minimum', async () => {
    const read = await deskSettled(await open(LAPTOPS[0], LONG_RULES))
    const { Rules, Mouse } = read.cards
    assert.equal(read.overflowY.Rules > 0, true, 'the long rules do not fit')
    assert.equal(Rules.h > Mouse.h, true, `Rules ${Rules.h}px, Mouse ${Mouse.h}px`)
    assert.equal(near(Mouse.h, MOUSE_MIN_HEIGHT_PX), true, `Mouse is ${Mouse.h}px`)
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
    assert.equal(near(Mode.y, Pinned.y + Pinned.h + CARD_GAP_PX), true, `Mode at ${Mode.y}, Pinned ends at ${Pinned.y + Pinned.h}`)
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

  // Chris's case (Loop + edge × at 1366) and the longest Composite name, at each laptop size.
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
        assert.match(text, /^Composite · /)
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
