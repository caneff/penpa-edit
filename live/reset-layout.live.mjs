// Reset layout (#156) arranges the desk for the window and the puzzle: the board as tall as the desk, its card only as
// wide as the board needs (capped so the side columns keep their minimum), and the spare width going to Mouse and Rules.
// Read through the cards' bounding boxes, the board canvas's drawn size and the bodies' scroll sizes.
import assert from 'node:assert/strict'
import { afterEach, describe, it } from 'node:test'
import { linkFromNewBoard, openSolvePage, useBrowser } from './page.mjs'
import { settle } from './settle.mjs'

const browser = useBrowser()

const FULL_HD = { viewport: { width: 1920, height: 1080 } }
const CARDS = ['Board', 'Mouse', 'Rules', 'Pinned', 'Mode', 'Recent']
// The smallest width a column's card may have (desk.js MIN_COLUMN_WIDTH_PX) and the pixels a drawn height may miss by.
const MIN_COLUMN_PX = 240
const FIT_SLACK_PX = 12
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

  async function open (puzzle) {
    const link = await linkFromNewBoard(browser(), solveLinkInPage, { ...puzzle, rules: RULES })
    opened = await openSolvePage(browser(), link, { contextOptions: FULL_HD })
    await settle(() => boardFills(opened.page), true)
    return opened.page
  }

  // The board refits in a ResizeObserver after the layout changes, so the checks wait on the board filling its room.
  const boardFills = async (page) => {
    const read = await page.evaluate(readDeskInPage, CARDS)
    return read.boardRoom.h - read.canvas.h <= FIT_SLACK_PX
  }

  const reset = async (page) => {
    await page.getByRole('button', { name: 'Reset layout' }).click()
    await settle(() => boardFills(page), true)
    return page.evaluate(readDeskInPage, CARDS)
  }

  it('fills the desk\'s height with a 9x9 board whose card is as wide as the board needs', async () => {
    const page = await open({ cols: 9, rows: 9 })
    const read = await reset(page)
    assert.equal(read.boardRoom.h - read.canvas.h <= FIT_SLACK_PX, true, `the board ${read.canvas.h}px high fills its room ${read.boardRoom.h}px`)
    assert.equal(read.cards.Board.h >= read.desk.h - 2 * 12 - 1, true, `the Board card is ${read.cards.Board.h}px of a ${read.desk.h}px desk`)
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
    const page = await open({ cols: 20, rows: 10 })
    const read = await reset(page)
    const right = read.cards.Pinned.w
    const cap = read.desk.w - 4 * 14 - MIN_COLUMN_PX - right
    assert.equal(Math.abs(read.cards.Board.w - cap) <= 2, true, `the Board card is ${read.cards.Board.w}px wide, the cap ${cap}px`)
    assert.equal(read.canvas.w <= read.boardRoom.w + FIT_SLACK_PX, true, `the board ${read.canvas.w}px fits its ${read.boardRoom.w}px room`)
    for (const name of CARDS) assert.equal(read.cards[name].w >= MIN_COLUMN_PX - 1, true, `${name} is ${read.cards[name].w}px wide`)
    assertCardsOnDesk(read)
  })

  it('leaves Mouse and Rules without a scrollbar when the room allows', async () => {
    const page = await open({ cols: 9, rows: 9 })
    const read = await reset(page)
    for (const name of ['Mouse', 'Rules']) {
      assert.deepEqual(read.scroll[name], { overflowY: 0, overflowX: 0 }, `${name} scrolls`)
    }
    assert.equal(read.cards.Mouse.w > 380, true, `Mouse widened past the old column (${read.cards.Mouse.w}px)`)
  })
})
