// Reset layout (#156) arranges the desk for the window and the puzzle: the board as tall as the desk, its card only as
// wide as the board needs (capped so the side columns keep their minimum), and the spare width going to the side columns.
// Read through the cards' bounding boxes, the board canvas's drawn size and the bodies' scroll sizes.
import assert from 'node:assert/strict'
import { afterEach, describe, it } from 'node:test'
import { linkFromNewBoard, listedTools, openSolvePage, resetLayoutInSettings, shareOf, useBrowser } from './page.mjs'
import { settle } from './settle.mjs'

const browser = useBrowser()

const FULL_HD = { viewport: { width: 1920, height: 1080 } }
const SHORT = { viewport: { width: 1920, height: 800 } }
const CARDS = ['Board', 'Mouse', 'Rules', 'Pinned', 'Mode', 'Recent']
// desk.js's margins, and each card's smallest width (its MIN_SIZE); Mouse's is the left column's, which caps the Board card.
const TOP_MARGIN_PX = 12
const DESK_MARGIN_PX = 14
const MIN_WIDTH_PX = { Board: 240, Mouse: 260, Rules: 200, Pinned: 240, Mode: 280, Recent: 240 }
const LEFT_COLUMN_MIN_PX = 260
// The pixels a drawn height may miss its room by: the cell size is whole pixels, so a 9-row board comes up to 9 short.
const FIT_SLACK_PX = 12
// The same for the Board card's width on a 30-column board, which widens 30 px per cell-size step, with its frame and rounding.
const WIDE_BOARD_SLACK_PX = 50
// How far apart the equal gaps may be, for rounding.
const GAP_SLACK_PX = 2
// How many tests the loop over every tool splits into.
const MOUSE_SHARES = 8
const SHORT_RULES = 'Put a digit from 1 to 9 in every cell.'
const RULES = Array.from({ length: 6 }, (_, i) => `Paragraph ${i + 1}: put a digit from 1 to 9 in every cell so no row, column or box repeats one, and the clues around the grid hold.`).join('\n\n')

// Runs in the page. A new board of `cols` x `rows` cells with the rules `rules`; returns its solve link's `#` part.
function solveLinkInPage ({ cols, rows, rules }) {
  document.getElementById('nb_size1').value = cols
  document.getElementById('nb_size2').value = rows
  create_newboard()
  document.getElementById('saveinforules').value = rules
  const url = pu.maketext_solve()
  return url.slice(url.indexOf('#'))
}

// Runs in the page. Where every card sits, the desk's size, the drawn board and the Mouse and Rules bodies' scroll.
function readDeskInPage (names) {
  const rect = (node) => { const r = node.getBoundingClientRect(); return { x: r.x, y: r.y, w: r.width, h: r.height } }
  const section = (name) => document.querySelector(`section[aria-label="${name}"]`)
  const scroll = (name) => { const b = section(name).querySelector('.ui-body'); return { overflowY: b.scrollHeight - b.clientHeight, overflowX: b.scrollWidth - b.clientWidth } }
  // The drawn canvas: Penpa+ keeps a hidden pause canvas beside it.
  const canvas = [...section('Board').querySelectorAll('canvas')].find((c) => c.getBoundingClientRect().width > 0)
  const body = section('Board').querySelector('.ui-body')
  const style = getComputedStyle(body)
  return {
    desk: rect(document.querySelector('.ui-desk')),
    cards: Object.fromEntries(names.map((name) => [name, rect(section(name))])),
    canvas: rect(canvas),
    boardRoom: { w: body.clientWidth - parseFloat(style.paddingLeft) - parseFloat(style.paddingRight), h: body.clientHeight - parseFloat(style.paddingTop) - parseFloat(style.paddingBottom) },
    scroll: { Mouse: scroll('Mouse'), Rules: scroll('Rules') }
  }
}

const overlaps = (a, b) => a.x < b.x + b.w - 0.5 && b.x < a.x + a.w - 0.5 && a.y < b.y + b.h - 0.5 && b.y < a.y + a.h - 0.5

function assertCardsOnDesk (read) {
  for (const name of CARDS) {
    const c = read.cards[name]
    assert.equal(c.x >= read.desk.x - 1 && c.y >= read.desk.y - 1 && c.x + c.w <= read.desk.x + read.desk.w + 1 && c.y + c.h <= read.desk.y + read.desk.h + 1, true, `${name} inside the desk: ${JSON.stringify(c)}`)
  }
  for (const a of CARDS) for (const b of CARDS) if (a < b) assert.equal(overlaps(read.cards[a], read.cards[b]), false, `${a} and ${b} overlap`)
}

describe('Reset layout fits the desk to the puzzle', () => {
  let opened
  afterEach(async () => { await opened?.context.close() })

  async function open (puzzle, contextOptions = FULL_HD) {
    const link = await linkFromNewBoard(browser(), solveLinkInPage, { rules: RULES, ...puzzle })
    opened = await openSolvePage(browser(), link, { contextOptions })
    await settle(() => boardFills(opened.page), true)
    return opened.page
  }

  // The board refits in a ResizeObserver after the layout changes, so the checks wait on the board filling its room.
  const boardFills = async (page) => {
    const read = await page.evaluate(readDeskInPage, CARDS)
    return read.boardRoom.h - read.canvas.h <= FIT_SLACK_PX
  }

  const reset = async (page) => {
    await resetLayoutInSettings(page)
    await settle(() => boardFills(page), true)
    return page.evaluate(readDeskInPage, CARDS)
  }

  it('fills the desk\'s height with a 9x9 board whose card is as wide as the board needs', async () => {
    const page = await open({ cols: 9, rows: 9 })
    const read = await reset(page)
    assert.equal(read.boardRoom.h - read.canvas.h <= FIT_SLACK_PX, true, `the board ${read.canvas.h}px high fills its room ${read.boardRoom.h}px`)
    assert.equal(read.cards.Board.h >= read.desk.h - 2 * TOP_MARGIN_PX - 1, true, `the Board card is ${read.cards.Board.h}px of a ${read.desk.h}px desk`)
    assert.equal(read.boardRoom.w - read.canvas.w <= FIT_SLACK_PX, true, `the card is no wider than the board needs (${read.boardRoom.w}px for ${read.canvas.w}px)`)
    assertCardsOnDesk(read)
  })

  it('gives a fresh desk the same layout as Reset layout', async () => {
    const page = await open({ cols: 9, rows: 9 })
    const fresh = await page.evaluate(readDeskInPage, CARDS)
    const after = await reset(page)
    assert.deepEqual(fresh.cards, after.cards)
  })

  it('caps the Board card for a wide board and keeps every card at its minimum width', async () => {
    const page = await open({ cols: 30, rows: 10 })
    const read = await reset(page)
    const right = read.cards.Pinned.w
    const cap = read.desk.w - 4 * DESK_MARGIN_PX - LEFT_COLUMN_MIN_PX - right
    assert.equal(cap - read.cards.Board.w <= WIDE_BOARD_SLACK_PX && read.cards.Board.w <= cap, true, `the Board card is ${read.cards.Board.w}px wide, the cap ${cap}px`)
    assert.equal(read.canvas.w <= read.boardRoom.w + FIT_SLACK_PX, true, `the board ${read.canvas.w}px fits its ${read.boardRoom.w}px room`)
    for (const name of CARDS) assert.equal(read.cards[name].w >= MIN_WIDTH_PX[name] - 1, true, `${name} is ${read.cards[name].w}px wide`)
    assertCardsOnDesk(read)
  })

  it('leaves Mouse and Rules without a scrollbar when the room allows', async () => {
    const page = await open({ cols: 9, rows: 9 })
    const read = await reset(page)
    for (const name of ['Mouse', 'Rules']) {
      assert.deepEqual(read.scroll[name], { overflowY: 0, overflowX: 0 }, `${name} scrolls`)
    }
  })

  it('keeps Mouse and Rules scroll-free on a short desk', async () => {
    const page = await open({ cols: 9, rows: 9 }, SHORT)
    const read = await reset(page)
    for (const name of ['Mouse', 'Rules']) {
      assert.deepEqual(read.scroll[name], { overflowY: 0, overflowX: 0 }, `${name} scrolls`)
    }
    assertCardsOnDesk(read)
  })

  it('gives the width the board leaves to both side columns alike, with no gap past the margin', async () => {
    // Rules that fit, so the left column starts at its narrowest rather than taking the width for long rules.
    const page = await open({ cols: 9, rows: 9, rules: SHORT_RULES })
    const { cards, desk } = await reset(page)
    const gaps = [
      cards.Mouse.x - desk.x,
      cards.Board.x - (cards.Mouse.x + cards.Mouse.w),
      cards.Pinned.x - (cards.Board.x + cards.Board.w),
      desk.x + desk.w - (cards.Pinned.x + cards.Pinned.w)
    ]
    assert.equal(gaps.every((gap) => Math.abs(gap - DESK_MARGIN_PX) <= GAP_SLACK_PX), true, `the gaps are ${gaps}`)
    assert.equal(Math.abs(cards.Mouse.w - cards.Pinned.w) <= GAP_SLACK_PX, true, `the left column is ${cards.Mouse.w}px, the right ${cards.Pinned.w}px`)
  })

  it('keeps every card on the desk, none over another, when the window shrinks after Reset layout', async () => {
    const page = await open({ cols: 9, rows: 9 })
    await reset(page)
    await page.setViewportSize({ width: 1280, height: 720 })
    const clear = async () => {
      const read = await page.evaluate(readDeskInPage, CARDS)
      try {
        assertCardsOnDesk(read)
        return true
      } catch (e) {
        return e.message
      }
    }
    assert.equal(await settle(clear, true), true)
  })

  // Each share of the tools is its own test, so the loop over every tool and style stays inside the seam's per-test timeout (#284).
  for (let share = 0; share < MOUSE_SHARES; share++) {
    it(`shows every tool's Mouse rows without a scrollbar after Reset layout (share ${share + 1} of ${MOUSE_SHARES})`, async () => {
      // Rules that fit: long ones take 55% of the column, and Mouse then scrolls for its tallest tools.
      const page = await open({ cols: 9, rows: 9, rules: SHORT_RULES })
      await reset(page)
      const tools = shareOf(await listedTools(page), share, MOUSE_SHARES)
      assert.ok(tools.length > 0, 'the share holds tools')
      const scrolling = await page.evaluate(async (mine) => {
        const body = document.querySelector('section[aria-label="Mouse"] .ui-body')
        const frames = () => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)))
        const found = []
        for (const { mode, submode } of mine) {
          const tool = engine.listTools().find((t) => t.mode === mode && t.submode === submode)
          for (const { style } of tool.styles.length ? tool.styles : [{ style: undefined }]) {
            engine.setTool({ mode, submode, ...(style === undefined ? {} : { style }) })
            await frames()
            if (body.scrollHeight > body.clientHeight || body.scrollWidth > body.clientWidth) found.push(`${tool.name} ${style ?? ''}`)
          }
        }
        return found
      }, tools)
      assert.deepEqual(scrolling, [])
    })
  }
})
