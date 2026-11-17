// The Recent card of `solve.html` (#97): the last five tools the solver used that are not pinned, newest first, as pin chips without a shortcut key or ×,
// outside the Tab cycle; a click on one makes it current and gives the keys back to the board. The UI is found by role and
// accessible name, the tool by `engine.getTool()`; the keys and clicks are real.
import assert from 'node:assert/strict'
import { before, after, describe, it } from 'node:test'
import { afterChange, newBoardSolveLink, openSolvePage, setTool, useBrowser, waitForTool } from './page.mjs'
import { settle } from './settle.mjs'

const browser = useBrowser()

// Uses a tool of TOOLS and waits for the change it makes.
const use = async (page, { tool }) => {
  await setTool(page, tool)
  await waitForTool(page, tool)
  await afterChange(page)
}

const openSolve = async (tabSet) => openSolvePage(browser(), await newBoardSolveLink(browser(), tabSet))

// Two tools picked inside one frame make one change, so each pick below waits for it with `afterChange`.

const recentCard = (page) => page.getByRole('region', { name: 'Recent' })
const recentChips = (page) => recentCard(page).getByRole('button', { name: /^(?!Pin |Unpin )/ })
const recentNames = async (page) => (await recentChips(page).allInnerTexts()).map((text) => text.trim())

// Tools of the tests, with the name Recent gives each: six to overflow five, and one more.
const TOOLS = [
  { tool: { mode: 'line', submode: '1' }, name: 'Line > Normal' },
  { tool: { mode: 'line', submode: '2' }, name: 'Line > Diagonal' },
  { tool: { mode: 'sudoku', submode: '1' }, name: 'Sudoku > Normal' },
  { tool: { mode: 'number', submode: '1' }, name: 'Number > Normal' },
  { tool: { mode: 'wall', submode: null }, name: 'Wall' },
  { tool: { mode: 'surface', submode: null }, name: 'Surface' },
  { tool: { mode: 'line', submode: '4' }, name: 'Line > Helper ×' }
]

describe('the Recent card', () => {
  let opened
  before(async () => { opened = await openSolve(['Sudoku Corner']) })
  after(async () => { await opened?.context.close() })

  it('leaves the five newest tools in order, newest first, when six are used', async () => {
    const { page } = opened
    for (const entry of TOOLS.slice(0, 6)) {
      await use(page, entry)
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
    await waitForTool(page, { mode: 'sudoku', submode: '1' })
    await afterChange(page)
    await setTool(page, TOOLS[6].tool)
    await waitForTool(page, { mode: 'line', submode: '4' })
    await afterChange(page)
    await recentChips(page).filter({ hasText: 'Sudoku > Normal' }).click()
    await waitForTool(page, { mode: 'sudoku', submode: '1' })
    const boardHasFocus = () => page.evaluate(() => document.activeElement === document.body)
    assert.equal(await boardHasFocus(), true, 'focus is on the board, not the chip')
    // The current tool's chip is not redrawn by the click, so only an explicit blur takes focus off it.
    await recentChips(page).filter({ hasText: 'Sudoku > Normal' }).click()
    assert.equal(await boardHasFocus(), true, 'focus is on the board after a click on the current tool')
  })
})

describe('the Recent card and the pins', () => {
  let opened
  before(async () => { opened = await openSolve(['Sudoku Corner']) })
  after(async () => { await opened?.context.close() })

  // The names Recent lists after clicking `button`, in the same task, before the engine's next-frame `change` could redraw it.
  const recentNamesAfter = (page, button) => recentCard(page).elementHandle().then((card) => button.evaluate((node, recent) => {
    node.click()
    return [...recent.querySelectorAll('.ui-chip-main')].map((chip) => chip.textContent.trim())
  }, card))

  it('leaves out a pinned tool, fills the five from older unpinned ones, and brings it back when unpinned', async () => {
    const { page } = opened
    for (const entry of TOOLS) {
      await use(page, entry)
    }
    // The page opened on Surface, so Recent holds Line > Helper ×, Surface, Wall, Number, Sudoku now.
    const names = (list) => list.map((t) => t.name)
    const full = names([TOOLS[6], TOOLS[5], TOOLS[4], TOOLS[3], TOOLS[2]])
    assert.deepEqual(await settle(() => recentNames(page), full), full)
    // Pinning a Recent chip removes it at once, and the sixth most recent tool takes its place.
    const withoutWall = names([TOOLS[6], TOOLS[5], TOOLS[3], TOOLS[2], TOOLS[1]])
    assert.deepEqual(await recentNamesAfter(page, recentCard(page).getByRole('button', { name: 'Pin Wall' })), withoutWall)
    // A pinned tool that is used stays out, and is still the history's newest when it is unpinned later.
    await use(page, TOOLS[4])
    await use(page, TOOLS[1])
    const whilePinned = names([TOOLS[1], TOOLS[6], TOOLS[5], TOOLS[3], TOOLS[2]])
    assert.deepEqual(await settle(() => recentNames(page), whilePinned), whilePinned)
    const wallBack = names([TOOLS[1], TOOLS[4], TOOLS[6], TOOLS[5], TOOLS[3]])
    const unpinWall = page.getByRole('region', { name: 'Pinned' }).getByRole('button', { name: 'Unpin Wall' })
    assert.deepEqual(await recentNamesAfter(page, unpinWall), wallBack)
  })
})

// The key, and the Sudoku sub-mode Penpa+ lends while it is held.
const HOLDS = [
  { key: 'Shift', lent: '2' },
  { key: 'Control', lent: '3' },
  { key: 'Meta', lent: '3' }
]

describe('a held key in Sudoku', () => {
  let opened
  before(async () => { opened = await openSolve(['Sudoku Corner']) })
  after(async () => { await opened?.context.close() })

  for (const { key, lent } of HOLDS) {
    it(`never enters Recent: ${key}`, async () => {
      const { page } = opened
      await setTool(page, { mode: 'line', submode: '1' })
      await afterChange(page)
      await setTool(page, { mode: 'sudoku', submode: '1' })
      // Surface, the tool the page opens on, is a tool of the link whatever its Tab set, so Recent lists it.
      const before = await settle(() => recentNames(page), ['Sudoku > Normal', 'Line > Normal', 'Surface'])
      assert.deepEqual(before, ['Sudoku > Normal', 'Line > Normal', 'Surface'], 'before the hold')
      await page.keyboard.down(key)
      await waitForTool(page, { mode: 'sudoku', submode: lent })
      // A change shows on the next frame; two frames after the hold began, a recorded hold would be drawn.
      await afterChange(page)
      assert.deepEqual(await recentNames(page), before, 'during the hold')
      await page.keyboard.up(key)
      await waitForTool(page, { mode: 'sudoku', submode: '1' })
      await afterChange(page)
      assert.deepEqual(await recentNames(page), before, 'after the hold')
    })
  }

  it('still records tools after Shift is let go while a dialog has the keys', async () => {
    const { page } = opened
    await setTool(page, { mode: 'sudoku', submode: '1' })
    await page.keyboard.down('Shift')
    await waitForTool(page, { mode: 'sudoku', submode: '2' })
    await page.getByRole('button', { name: 'Restart', exact: true }).click()
    const dialog = page.getByRole('dialog', { name: 'Restart the puzzle?' })
    await dialog.waitFor()
    await page.keyboard.up('Shift')
    await page.keyboard.press('Escape')
    await dialog.waitFor({ state: 'hidden' })
    await setTool(page, { mode: 'line', submode: '1' })
    const expected = ['Line > Normal', 'Sudoku > Normal', 'Surface']
    assert.deepEqual(await settle(() => recentNames(page), expected), expected)
  })
})
