// The pins and the Tab cycle of `solve.html` (#96): the engine reports the link's Tab set, the Pinned card seeds from it once
// per puzzle and keeps it across reloads, Tab, Shift+Tab, Enter and Z/X/C/V step or jump between pins, a pin remembers its
// style, and the board's frame tells the pins apart. The UI is found by role and accessible name, the board by what Penpa
// would save (`readEngineState`, defined by recorder.js); the keys are real key presses.
import assert from 'node:assert/strict'
import { before, after, describe, it } from 'node:test'
import { linkFromNewBoard, openPenpa, useBrowser } from './page.mjs'
import { settle } from './settle.mjs'

const browser = useBrowser()

const DESK_SIZE = { viewport: { width: 1400, height: 900 } }

// Index in `pu.centerlist` of a cell clear of the board's edges.
const CELL = 12

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

// Waits for the current tool to be `mode` / `submode` and returns it.
async function waitForTool (page, mode, submode) {
  const read = async () => {
    const { mode: m, submode: s } = await currentTool(page)
    return { mode: m, submode: s }
  }
  return settle(read, { mode, submode })
}

// Runs in the page. Where the cell at `index` of the center list lies on the screen.
function cellPositionInPage (index) {
  const canvas = [...document.querySelectorAll('canvas')].find((c) => c.getBoundingClientRect().width > 0)
  const rect = canvas.getBoundingClientRect()
  const point = pu.point[pu.centerlist[index]]
  return { x: rect.left + point.x, y: rect.top + point.y }
}

async function clickCell (page, index) {
  const { x, y } = await page.evaluate(cellPositionInPage, index)
  await page.mouse.click(x, y)
}

// The characters the solver has typed into Number mode cells.
const typed = (page) => page.evaluate(() => Object.values(readEngineState().pu_a.number ?? {}).map(([text]) => text))

const pinnedChips = (page) => page.getByRole('region', { name: 'Pinned' }).getByRole('button', { name: /^(?!Unpin|Pin current|Save pins as preset)/ })
const chipNames = async (page) => (await pinnedChips(page).allInnerTexts()).map((text) => text.replace(/^\d+\s*/, '').trim())

// What the page keeps in localStorage, whatever the UI calls its keys.
const storage = (page) => page.evaluate(() => JSON.stringify(Object.entries(localStorage).sort()))

// The colour of the board's frame, as the Board card draws it.
const frameColour = (page) => page.getByRole('region', { name: 'Board' }).evaluate((card) => getComputedStyle(card).outlineColor)

describe('engine.tabSet', () => {
  let opened
  before(async () => { opened = await openSolve(['Line Normal', 'Sudoku Corner', 'Surface', 'Special', 'Shape']) })
  after(async () => { await opened?.context.close() })

  it('lists the link\'s Tab set as modes and sub-modes', async () => {
    const set = await opened.page.evaluate(() => engine.tabSet())
    assert.deepEqual(set.slice(0, 3), [
      { mode: 'line', submode: '1' },
      { mode: 'sudoku', submode: '2' },
      { mode: 'surface', submode: null }
    ])
  })

  it('gives a mode that Penpa keeps a sub-mode for the sub-mode listed first', async () => {
    const [special, shape] = (await opened.page.evaluate(() => engine.tabSet())).slice(3)
    const listed = await opened.page.evaluate(() => engine.listTools())
    assert.equal(special.mode, 'special')
    assert.equal(shape.mode, 'symbol')
    for (const entry of [special, shape]) {
      assert.equal(listed.some((tool) => tool.mode === entry.mode && tool.submode === entry.submode), true, `${entry.mode} / ${entry.submode} is a listed tool`)
    }
  })
})

describe('the pins', () => {
  let opened
  before(async () => { opened = await openSolve(['Line Normal', 'Sudoku Corner']) })
  after(async () => { await opened?.context.close() })

  it('seeds from the link\'s Tab set and survives a reload', async () => {
    const { page } = opened
    assert.deepEqual(await settle(() => chipNames(page), ['Line > Normal', 'Sudoku > Corner']), ['Line > Normal', 'Sudoku > Corner'])
    await page.getByRole('button', { name: 'Unpin Line > Normal' }).click()
    assert.deepEqual(await settle(() => chipNames(page), ['Sudoku > Corner']), ['Sudoku > Corner'])
    await page.reload()
    await page.getByRole('region', { name: 'Board' }).waitFor()
    await page.evaluate(() => engine.ready)
    assert.deepEqual(await settle(() => chipNames(page), ['Sudoku > Corner']), ['Sudoku > Corner'], 'a pin removed stays removed, so the Tab set seeds once')
  })
})

describe('Tab, Shift+Tab and Enter', () => {
  let opened
  before(async () => { opened = await openSolve(['Line Normal', 'Sudoku Corner']) })
  after(async () => { await opened?.context.close() })

  it('steps forward, back and around the pins', async () => {
    const { page } = opened
    await setTool(page, { mode: 'line', submode: '1' })
    await page.keyboard.press('Tab')
    assert.deepEqual(await waitForTool(page, 'sudoku', '2'), { mode: 'sudoku', submode: '2' }, 'Tab lands on pin 2')
    await page.keyboard.press('Shift+Tab')
    assert.deepEqual(await waitForTool(page, 'line', '1'), { mode: 'line', submode: '1' }, 'Shift+Tab lands on pin 1')
    await page.keyboard.press('Shift+Tab')
    assert.deepEqual(await waitForTool(page, 'sudoku', '2'), { mode: 'sudoku', submode: '2' }, 'Shift+Tab wraps back to the last pin')
    await page.keyboard.press('Tab')
    assert.deepEqual(await waitForTool(page, 'line', '1'), { mode: 'line', submode: '1' }, 'Tab wraps to pin 1')
  })

  it('does the same on Enter, unless a button has focus', async () => {
    const { page } = opened
    await setTool(page, { mode: 'line', submode: '1' })
    await page.keyboard.press('Enter')
    await waitForTool(page, 'sudoku', '2')
    await page.getByRole('button', { name: 'Unpin Sudoku > Corner' }).focus()
    await page.keyboard.press('Enter')
    // The focused button took the Enter: it unpinned, and the tool did not step.
    assert.deepEqual(await settle(() => chipNames(page), ['Line > Normal']), ['Line > Normal'])
    assert.deepEqual(await currentTool(page).then(({ mode, submode }) => ({ mode, submode })), { mode: 'sudoku', submode: '2' })
  })
})

describe('Z, X, C and V', () => {
  let opened
  before(async () => { opened = await openSolve(['Sudoku Normal', 'Line Normal', 'Wall', 'Number Normal']) })
  after(async () => { await opened?.context.close() })

  it('types Z in Number mode', async () => {
    const { page } = opened
    await setTool(page, { mode: 'number', submode: '1' })
    await clickCell(page, CELL)
    await page.keyboard.press('z')
    assert.deepEqual(await settle(() => typed(page), ['z']), ['z'])
    assert.equal((await currentTool(page)).mode, 'number')
  })

  it('jumps to pins 1 to 4 from Line mode', async () => {
    const { page } = opened
    await setTool(page, { mode: 'line', submode: '1' })
    await page.keyboard.press('z')
    await waitForTool(page, 'sudoku', '1')
    await page.keyboard.press('x')
    await waitForTool(page, 'line', '1')
    await page.keyboard.press('c')
    await waitForTool(page, 'wall', null)
    await page.keyboard.press('v')
    await waitForTool(page, 'number', '1')
  })

  it('types the letter with Caps Lock on, and does not jump', async () => {
    const { page } = opened
    await setTool(page, { mode: 'line', submode: '1' })
    // An upper-case letter without Shift is how a keyboard with Caps Lock on sends it, and how Penpa tells.
    await page.keyboard.press('Z')
    assert.equal((await currentTool(page)).mode, 'line')
    await setTool(page, { mode: 'number', submode: '1' })
    await clickCell(page, CELL)
    await page.keyboard.press('Z')
    assert.deepEqual(await settle(() => typed(page), ['Z']), ['Z'])
  })

  it('does not jump when Penpa\'s shortcuts setting is off', async () => {
    const { page } = opened
    await page.evaluate(() => { UserSettings.shortcuts_enabled = false })
    await setTool(page, { mode: 'line', submode: '1' })
    await page.keyboard.press('z')
    assert.equal((await currentTool(page)).mode, 'line')
  })
})

describe('what a pin remembers', () => {
  let opened
  before(async () => { opened = await openSolve(['Line Normal', 'Line Diagonal', 'Number Normal']) })
  after(async () => { await opened?.context.close() })

  const styleButton = (name) => opened.page.getByRole('region', { name: 'Mode' }).getByRole('group', { name: 'Style' }).getByRole('button', { name })

  it('returns a pin with the last style used on it, though another pin of the mode used another', async () => {
    const { page } = opened
    await setTool(page, { mode: 'line', submode: '1' })
    await styleButton('red').click()
    await settle(async () => (await currentTool(page)).style, 8)
    await page.keyboard.press('Tab')
    await waitForTool(page, 'line', '2')
    await styleButton('blue').click()
    await settle(async () => (await currentTool(page)).style, 9)
    await page.keyboard.press('Shift+Tab')
    await waitForTool(page, 'line', '1')
    assert.equal((await currentTool(page)).style, 8, 'pin 1 is red again')
    await page.keyboard.press('Tab')
    await waitForTool(page, 'line', '2')
    assert.equal((await currentTool(page)).style, 9, 'pin 2 is blue again')
  })

  it('leaves every pin unchanged when a tool outside the pins is picked in the Mode card', async () => {
    const { page } = opened
    const before = await storage(page)
    const chipsBefore = await chipNames(page)
    const combobox = page.getByRole('combobox', { name: 'Tool' })
    await combobox.click()
    await page.getByRole('option', { name: /^Line helper/ }).click()
    await waitForTool(page, 'line', '4')
    assert.deepEqual(await chipNames(page), chipsBefore)
    assert.equal(await storage(page), before, 'nothing of the pins was saved again')
  })
})

describe('the board frame', () => {
  let opened
  before(async () => { opened = await openSolve(['Line Normal', 'Line Diagonal']) })
  after(async () => { await opened?.context.close() })

  // Two animation frames: the bridge's `change` fires in the first, and the UI has drawn it by the second.
  const afterChange = (page) => page.evaluate(() => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve))))

  it('gives two pins on one mode different colours, and a tool outside the pins its own', async () => {
    const { page } = opened
    await setTool(page, { mode: 'line', submode: '1' })
    await afterChange(page)
    const first = await frameColour(page)
    await page.keyboard.press('Tab')
    await waitForTool(page, 'line', '2')
    await afterChange(page)
    const second = await frameColour(page)
    assert.notEqual(second, first, 'two pins on Line differ')
    await setTool(page, { mode: 'line', submode: '4' })
    await afterChange(page)
    const neutral = await frameColour(page)
    assert.notEqual(neutral, first)
    assert.notEqual(neutral, second)
  })
})
