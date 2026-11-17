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
// desk.js's margins: the top one above each column, the gap between two cards, the bar's own side padding (desk.css).
const TOP_MARGIN_PX = 12
const CARD_GAP_PX = 10
const BAR_PADDING_PX = 14
// The Mouse card's smallest height (desk.js's MIN_SIZE), which Rules leaves below itself.
const MOUSE_MIN_HEIGHT_PX = 140
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
    headButtonsFit: [...document.querySelectorAll('.ui-head')].every((head) => [...head.querySelectorAll('wa-button, .ui-tool-name')].every((node) => {
      const outer = head.getBoundingClientRect()
      const inner = node.getBoundingClientRect()
      return inner.top >= outer.top && inner.bottom <= outer.bottom
    })),
    zoomButtons: [...section('Board').querySelectorAll('.ui-head .ui-zoom wa-button')].map(rect),
    overflowY: Object.fromEntries(['Board', 'Rules', 'Mouse'].map((name) => [name, body(name).scrollHeight - body(name).clientHeight]))
  }
}

const overlaps = (a, b) => a.x < b.x + b.w - 0.5 && b.x < a.x + a.w - 0.5 && a.y < b.y + b.h - 0.5 && b.y < a.y + a.h - 0.5
const near = (a, b) => Math.abs(a - b) <= SLACK_PX

// The tooltips showing now, by text. A Web Awesome tooltip is marked `open` while it shows.
const shownTooltips = async (page) => (await page.locator('wa-tooltip[open]').allTextContents()).map((t) => t.trim())
// Runs in the page: a role locator finds the native button inside a `wa-button`'s shadow root; this is the `wa-button`.
const hostOf = (node) => node.getRootNode().host ?? node

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
    const link = await linkFromNewBoard(browser(), solveLinkInPage, puzzle)
    opened = await openSolvePage(browser(), link, { contextOptions: { viewport } })
    return opened.page
  }

  // The bar places its heading after its controls have rendered, so each read waits for it to stop moving.
  const barAt = async (page, viewport) => {
    await page.setViewportSize(viewport)
    let last = null
    await settle(async () => { const now = JSON.stringify(await page.evaluate(readBarInPage)); const same = now === last; last = now; return same }, true)
    return JSON.parse(last)
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
    const read = (name) => page.locator('.ui-bar').getByRole('button', { name, exact: true }).evaluate((node, hostOfSource) => {
      const host = eval(hostOfSource)(node)
      return { icons: host.querySelectorAll('svg').length, icon: host.querySelector('svg')?.innerHTML, text: host.textContent.trim(), label: host.querySelector('.ui-sr-only')?.textContent }
    }, hostOf.toString())
    const reset = await read('Reset layout')
    const restart = await read('Restart')
    assert.equal(reset.icons, 1, 'Reset layout shows an icon')
    assert.equal(reset.text, reset.label, 'and no visible text')
    assert.notEqual(reset.icon, restart.icon)
  })

  it('shows each top-bar button\'s label on hover, with its shortcut, and the current one after it changes', async () => {
    const page = await open(ICEBREAKER, LAPTOPS[1])
    const bar = page.locator('.ui-bar')
    const hoverLabel = async (name) => {
      // The `wa-button` itself, since a disabled one (Undo with nothing to undo) still shows its label.
      await bar.locator('wa-button').filter({ has: page.locator('.ui-sr-only').getByText(name, { exact: true }) }).hover()
      return settle(() => shownTooltips(page), [want[name] ?? `${name} (F4)`])
    }
    const want = { Undo: 'Undo (Ctrl+Z)', Redo: 'Redo (Ctrl+Y)', Restart: 'Restart', Pause: 'Pause (F4)', 'Open in Penpa+': 'Open in Penpa+', Settings: 'Settings', 'Reset layout': 'Reset layout' }
    const names = await bar.getByRole('button').evaluateAll((nodes, hostOfSource) => nodes.map((node) => {
      const host = eval(hostOfSource)(node)
      return host.querySelector('.ui-sr-only')?.textContent ?? host.textContent.trim()
    }), hostOf.toString())
    assert.deepEqual(names.sort(), Object.keys(want).sort(), 'every top-bar button is listed here')
    for (const [name, label] of Object.entries(want)) {
      assert.deepEqual(await hoverLabel(name), [label], `hovering ${name}`)
    }
    await bar.getByRole('button', { name: 'Pause', exact: true }).click()
    // The pointer is still on the button after the click, so the next hover starts off it.
    await page.mouse.move(0, 0)
    assert.deepEqual(await hoverLabel('Resume'), ['Resume (F4)'])
  })
})

describe('the desk on a laptop screen', () => {
  let opened
  afterEach(async () => { await opened?.context.close() })

  async function open (viewport) {
    const link = await linkFromNewBoard(browser(), solveLinkInPage, ICEBREAKER)
    opened = await openSolvePage(browser(), link, { contextOptions: { viewport } })
    return opened.page
  }

  // Cards render their controls after the desk is laid out, so the reads wait for the layout to stop moving.
  const deskSettled = async (page) => {
    let last = null
    await settle(async () => { const now = JSON.stringify(await page.evaluate(readDeskInPage, CARDS)); const same = now === last; last = now; return same }, true)
    return JSON.parse(last)
  }

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
        for (const buttons of [read.zoomButtons, read.rulesButtons]) {
          buttons.slice(1).forEach((button, i) => assert.equal(button.x - (buttons[i].x + buttons[i].w) <= SLACK_PX, true, `joined: ${JSON.stringify(buttons)}`))
        }
      })
    })
  }

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

  it('keeps the Board card\'s tool label on one line, so a Composite tool never makes the board scroll', async () => {
    const page = await open(LAPTOPS[1])
    const label = page.getByTestId('board-tool-name')
    await page.evaluate(() => engine.setTool(engine.listTools().find((tool) => tool.mode === 'surface')))
    const shortHeight = (await label.boundingBox()).height
    await page.evaluate(() => engine.setTool(engine.listTools().find((tool) => tool.mode === 'combi' && tool.submode === 'linex')))
    await settle(() => label.textContent(), null)
    const text = await label.textContent()
    assert.match(text, /^Composite · Loop \+ edge ×/)
    const read = await deskSettled(page)
    assert.equal(read.overflowY.Board, 0, 'the board body does not scroll')
    assert.equal(read.heads.Board.h, read.heads.Pinned.h, 'the Board header keeps the slim height')
    assert.equal((await label.boundingBox()).height, shortHeight, 'the label stays one line')
    assert.equal(await label.getAttribute('title'), text, 'the full text is its tooltip')
  })
})
