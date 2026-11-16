// The Recent card of `solve.html` (#97): the last five tools the solver used, newest first, as pin chips without number or ×,
// outside the Tab cycle; a click on one makes it current and gives the keys back to the board. The UI is found by role and
// accessible name, the tool by `engine.getTool()`; the keys and clicks are real.
import assert from 'node:assert/strict'
import { before, after, describe, it } from 'node:test'
import { linkFromNewBoard, openPenpa, useBrowser } from './page.mjs'
import { settle } from './settle.mjs'

const browser = useBrowser()

const DESK_SIZE = { viewport: { width: 1400, height: 900 } }

// Runs in the page. A 6x6 board whose Tab set is `names` (Penpa's own names for them), as a solve link's `#` part.
function solveLinkWithTabSetInPage (names) {
  document.getElementById('nb_size1').value = 6
  document.getElementById('nb_size2').value = 6
  create_newboard()
  UserSettings.tab_settings = names
  const url = pu.maketext_solve()
  return url.slice(url.indexOf('#'))
}

const links = new Map()
async function openSolve (tabSet) {
  const key = tabSet.join('|')
  if (!links.has(key)) {
    links.set(key, await linkFromNewBoard(browser(), solveLinkWithTabSetInPage, tabSet))
  }
  const opened = await openPenpa(browser(), links.get(key), { solve: true, contextOptions: DESK_SIZE })
  await opened.page.getByRole('region', { name: 'Board' }).waitFor()
  await opened.page.evaluate(() => engine.ready)
  return opened
}

const currentTool = (page) => page.evaluate(() => engine.getTool())
const setTool = (page, tool) => page.evaluate((t) => engine.setTool(t), tool)

async function waitForTool (page, mode, submode) {
  const read = async () => {
    const { mode: m, submode: s } = await currentTool(page)
    return { mode: m, submode: s }
  }
  return settle(read, { mode, submode })
}

// Two animation frames: the bridge's `change` fires in the first, and the UI has drawn it by the second. Two tools picked
// inside one frame make one change, so each pick below waits for it.
const afterChange = (page) => page.evaluate(() => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve))))

const recentCard = (page) => page.getByRole('region', { name: 'Recent' })
const recentChips = (page) => recentCard(page).getByRole('button')
const recentNames = async (page) => (await recentChips(page).allInnerTexts()).map((text) => text.trim())

// Tools of the tests, with the name Recent gives each: six to overflow five, and one more.
const TOOLS = [
  { tool: { mode: 'line', submode: '1' }, name: 'Line > Normal' },
  { tool: { mode: 'line', submode: '2' }, name: 'Line > Diagonal' },
  { tool: { mode: 'sudoku', submode: '1' }, name: 'Sudoku > Normal' },
  { tool: { mode: 'number', submode: '1' }, name: 'Number > Normal' },
  { tool: { mode: 'wall', submode: null }, name: 'Wall' },
  { tool: { mode: 'surface', submode: null }, name: 'Surface' },
  { tool: { mode: 'line', submode: '4' }, name: 'Line > Helper' }
]

describe('the Recent card', () => {
  let opened
  before(async () => { opened = await openSolve(['Line Normal', 'Line Diagonal', 'Sudoku Normal', 'Number Normal', 'Wall', 'Surface']) })
  after(async () => { await opened?.context.close() })

  it('leaves the five newest tools in order, newest first, when six are used', async () => {
    const { page } = opened
    for (const { tool } of TOOLS.slice(0, 6)) {
      await setTool(page, tool)
      await waitForTool(page, tool.mode, tool.submode)
      await afterChange(page)
    }
    const expected = TOOLS.slice(1, 6).map((t) => t.name).reverse()
    assert.deepEqual(await settle(() => recentNames(page), expected), expected)
  })

  it('puts a tool used again first and keeps it once', async () => {
    const { page } = opened
    await setTool(page, TOOLS[3].tool)
    const expected = [TOOLS[3], TOOLS[5], TOOLS[4], TOOLS[2], TOOLS[1]].map((t) => t.name)
    assert.deepEqual(await settle(() => recentNames(page), expected), expected)
  })

  it('never lands Tab on an entry, with pins or without', async () => {
    const { page } = opened
    assert.notEqual(await recentChips(page).count(), 0, 'there are entries to land on')
    for (let i = 0; i < 3; i++) {
      await page.keyboard.press('Tab')
    }
    assert.equal(await recentCard(page).locator(':focus').count(), 0, 'Tab with pins')
    const pinned = page.getByRole('region', { name: 'Pinned' })
    while (await pinned.getByRole('button', { name: /^Unpin/ }).count()) {
      await pinned.getByRole('button', { name: /^Unpin/ }).first().click()
    }
    // With no pin the browser keeps Tab, and moves focus along the page.
    await page.evaluate(() => document.activeElement?.blur())
    for (let i = 0; i < 40; i++) {
      await page.keyboard.press('Tab')
      assert.equal(await recentCard(page).locator(':focus').count(), 0, `Tab press ${i + 1} without pins`)
    }
  })

  it('sets the tool on a click and gives focus back to the board', async () => {
    const { page } = opened
    await setTool(page, TOOLS[2].tool)
    await waitForTool(page, 'sudoku', '1')
    await afterChange(page)
    await setTool(page, TOOLS[6].tool)
    await waitForTool(page, 'line', '4')
    await afterChange(page)
    await recentChips(page).filter({ hasText: 'Sudoku > Normal' }).click()
    assert.deepEqual(await waitForTool(page, 'sudoku', '1'), { mode: 'sudoku', submode: '1' })
    assert.equal(await page.evaluate(() => document.activeElement === document.body), true, 'focus is on the board, not the chip')
  })
})

describe('a held Shift in Sudoku', () => {
  let opened
  before(async () => { opened = await openSolve(['Sudoku Normal', 'Line Normal']) })
  after(async () => { await opened?.context.close() })

  it('never enters Recent', async () => {
    const { page } = opened
    await setTool(page, { mode: 'line', submode: '1' })
    await setTool(page, { mode: 'sudoku', submode: '1' })
    const before = await settle(() => recentNames(page), ['Sudoku > Normal', 'Line > Normal'])
    assert.deepEqual(before, ['Sudoku > Normal', 'Line > Normal'], 'before the hold')
    await page.keyboard.down('Shift')
    await waitForTool(page, 'sudoku', '2')
    // A change shows on the next frame; two frames after the hold began, a recorded hold would be drawn.
    await afterChange(page)
    assert.deepEqual(await recentNames(page), before, 'during the hold')
    await page.keyboard.up('Shift')
    await waitForTool(page, 'sudoku', '1')
    await afterChange(page)
    assert.deepEqual(await recentNames(page), before, 'after the hold')
  })
})
