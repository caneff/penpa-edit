// The pins and the Tab cycle of `solve.html` (#96): the engine reports the link's Tab set, the Pinned card seeds from it once
// per puzzle and keeps it across reloads, Tab, Shift+Tab, Enter and Z/X/C/V step or jump between pins, a pin remembers its
// style, and the board's frame tells the pins apart. The UI is found by role and accessible name, the board by what Penpa+
// would save (`readEngineState`, defined by recorder.js); the keys are real key presses.
import assert from 'node:assert/strict'
import { before, after, describe, it } from 'node:test'
import { afterChange, currentTool, newBoardSolveLink, openSolvePage, setTool, storedEntries, typedDigits, useBrowser, waitForDesk, waitForTool } from './page.mjs'
import { clickCell } from './replay.mjs'
import { settle } from './settle.mjs'

const browser = useBrowser()

// Index in `pu.centerlist` of a cell clear of the board's edges.
const CELL = 12

const openSolve = async (tabSet) => openSolvePage(browser(), await newBoardSolveLink(browser(), tabSet))

const pinnedChips = (page) => page.getByRole('region', { name: 'Pinned' }).getByRole('button', { name: /^(?!Unpin|Save pins as a preset)/ })
const chipNames = async (page) => (await pinnedChips(page).allInnerTexts()).map((text) => text.replace(/^\d+\s*/, '').trim())

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

  it('gives a mode that Penpa+ keeps a sub-mode for the sub-mode listed first', async () => {
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
    await waitForDesk(page)
    assert.deepEqual(await settle(() => chipNames(page), ['Sudoku > Corner']), ['Sudoku > Corner'], 'a pin removed stays removed, so the Tab set seeds once')
  })

  // Penpa+'s history copy rewrites the link's `#` part on every save, with the solver's progress in it; the pins are the
  // puzzle's, so they hold across it.
  it('survive a reload of a link the history copy rewrote', async () => {
    const { page } = opened
    await setTool(page, { mode: 'line', submode: '1' })
    await page.getByRole('region', { name: 'Mode' }).getByRole('button', { name: 'Pin Line > Normal' }).click()
    const pinned = ['Sudoku > Corner', 'Line > Normal']
    assert.deepEqual(await settle(() => chipNames(page), pinned), pinned)
    await page.evaluate(() => engine.setSetting('auto_save_history', true))
    const before = await page.evaluate(() => location.hash)
    await page.evaluate(() => PenpaProgress.save())
    assert.notEqual(await page.evaluate(() => location.hash), before, 'the save rewrote the link')
    await page.reload()
    await waitForDesk(page)
    assert.deepEqual(await settle(() => chipNames(page), pinned), pinned)
  })
})

describe('a saved value the Pinned card did not write', () => {
  let opened
  before(async () => { opened = await openSolve(['Line Normal', 'Sudoku Corner']) })
  after(async () => { await opened?.context.close() })

  // Each is short of what the card writes: a `nextId`, a whole number id, a mode, a list of pins.
  const BAD_VALUES = [
    { pins: [{ id: 0, mode: 'line', submode: '1', style: null }] },
    { nextId: 1, pins: [{ id: 'a', mode: 'line', submode: '1', style: null }] },
    { nextId: 1, pins: [{ id: 0, submode: '1', style: null }] },
    { nextId: 1, pins: 'line' }
  ]
  for (const value of BAD_VALUES) {
    it(`is read as none, so the Tab set seeds again, and the console says so: ${JSON.stringify(value)}`, async () => {
      const { page } = opened
      const seeded = ['Line > Normal', 'Sudoku > Corner']
      assert.deepEqual(await settle(() => chipNames(page), seeded), seeded)
      await page.evaluate((saved) => {
        const keys = Object.keys(localStorage).filter((key) => localStorage.getItem(key).includes('"pins"'))
        if (keys.length !== 1) throw new Error(`expected one saved pin set, found ${keys.length}`)
        localStorage.setItem(keys[0], JSON.stringify(saved))
      }, value)
      const warnings = []
      const onConsole = (m) => { if (m.type() === 'warning') warnings.push(m.text()) }
      page.on('console', onConsole)
      try {
        await page.reload()
        await waitForDesk(page)
        assert.deepEqual(await settle(() => chipNames(page), seeded), seeded)
        assert.equal(warnings.some((w) => /does not hold pins/.test(w)), true, `a warning names the replaced value: ${warnings}`)
      } finally {
        page.off('console', onConsole)
      }
    })
  }
})

// Pins outside Sudoku, so no Shift starts a hold; holds.live.mjs covers Tab during a hold.
describe('Tab, Shift+Tab and Enter', () => {
  let opened
  before(async () => { opened = await openSolve(['Line Normal', 'Surface']) })
  after(async () => { await opened?.context.close() })

  it('steps forward, back and around the pins', async () => {
    const { page } = opened
    await setTool(page, { mode: 'line', submode: '1' })
    await page.keyboard.press('Tab')
    await waitForTool(page, { mode: 'surface', submode: null }, 'Tab lands on pin 2')
    await page.keyboard.press('Shift+Tab')
    await waitForTool(page, { mode: 'line', submode: '1' }, 'Shift+Tab lands on pin 1')
    await page.keyboard.press('Shift+Tab')
    await waitForTool(page, { mode: 'surface', submode: null }, 'Shift+Tab wraps back to the last pin')
    await page.keyboard.press('Tab')
    await waitForTool(page, { mode: 'line', submode: '1' }, 'Tab wraps to pin 1')
  })

  it('does the same on Enter, unless a button has focus', async () => {
    const { page } = opened
    await setTool(page, { mode: 'line', submode: '1' })
    await page.keyboard.press('Enter')
    await waitForTool(page, { mode: 'surface', submode: null })
    await page.getByRole('region', { name: 'Pinned' }).getByRole('button', { name: 'Unpin Surface' }).focus()
    await page.keyboard.press('Enter')
    // The focused button took the Enter: it unpinned, and the tool did not step.
    assert.deepEqual(await settle(() => chipNames(page), ['Line > Normal']), ['Line > Normal'])
    assert.deepEqual(await currentTool(page).then(({ mode, submode }) => ({ mode, submode })), { mode: 'surface', submode: null })
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
    assert.deepEqual(await settle(() => typedDigits(page), ['z']), ['z'])
    assert.equal((await currentTool(page)).mode, 'number')
  })

  it('jumps to pins 1 to 4 from Line mode', async () => {
    const { page } = opened
    await setTool(page, { mode: 'line', submode: '1' })
    await page.keyboard.press('z')
    await waitForTool(page, { mode: 'sudoku', submode: '1' })
    await page.keyboard.press('x')
    await waitForTool(page, { mode: 'line', submode: '1' })
    await page.keyboard.press('c')
    await waitForTool(page, { mode: 'wall', submode: null })
    await page.keyboard.press('v')
    await waitForTool(page, { mode: 'number', submode: '1' })
  })

  it('types the letter with Caps Lock on, and does not jump', async () => {
    const { page } = opened
    await setTool(page, { mode: 'line', submode: '1' })
    // An upper-case letter without Shift is how a keyboard with Caps Lock on sends it, and how Penpa+ tells.
    await page.keyboard.press('Z')
    assert.equal((await currentTool(page)).mode, 'line')
    await setTool(page, { mode: 'number', submode: '1' })
    await clickCell(page, CELL)
    await page.keyboard.press('Z')
    assert.deepEqual(await settle(() => typedDigits(page), ['Z']), ['Z'])
  })

  it('ends a held Shift on a jump, so the next Shift hold still lends Corner', async () => {
    const { page } = opened
    const held = () => page.evaluate(() => engine.getState().held)
    await setTool(page, { mode: 'sudoku', submode: '1' })
    await page.keyboard.down('Shift')
    try {
      await waitForTool(page, { mode: 'sudoku', submode: '2' })
      await page.keyboard.press('KeyX')
      await waitForTool(page, { mode: 'line', submode: '1' }, 'Shift+X jumps to pin 2')
      assert.equal(await settle(held, false), false, 'the hold ended')
    } finally {
      await page.keyboard.up('Shift')
    }
    await setTool(page, { mode: 'sudoku', submode: '1' })
    await page.keyboard.down('Shift')
    try {
      await waitForTool(page, { mode: 'sudoku', submode: '2' }, 'the next hold lends Corner')
      assert.equal(await settle(held, true), true)
    } finally {
      await page.keyboard.up('Shift')
    }
    await waitForTool(page, { mode: 'sudoku', submode: '1' }, 'and its key-up gives Normal back')
  })

  it('does not jump when Penpa+\'s shortcuts setting is off', async () => {
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
    await waitForTool(page, { mode: 'line', submode: '2' })
    await styleButton('blue').click()
    await settle(async () => (await currentTool(page)).style, 9)
    await page.keyboard.press('Shift+Tab')
    await waitForTool(page, { mode: 'line', submode: '1' })
    assert.equal((await currentTool(page)).style, 8, 'pin 1 is red again')
    await page.keyboard.press('Tab')
    await waitForTool(page, { mode: 'line', submode: '2' })
    assert.equal((await currentTool(page)).style, 9, 'pin 2 is blue again')
  })

  it('returns a pin with its style when the Mode card lands on it', async () => {
    const { page } = opened
    // From pin 2, blue: Penpa+ keeps one style for all of Line, so the pick alone would come back blue.
    assert.equal((await currentTool(page)).style, 9)
    await page.getByRole('combobox', { name: 'Tool' }).fill('Drag through cell centres.')
    await page.getByRole('treeitem', { name: 'Normal', exact: true }).click()
    await waitForTool(page, { mode: 'line', submode: '1' })
    assert.equal(await settle(async () => (await currentTool(page)).style, 8), 8, 'pin 1 is red again')
    const saved = await page.evaluate(() => window.pinBoard.snapshot())
    assert.equal(saved.find((pin) => pin.mode === 'line' && pin.submode === '1').style, 8, 'and still remembers red')
  })

  it('leaves every pin unchanged when a tool outside the pins is picked in the Mode card', async () => {
    const { page } = opened
    const before = await storedEntries(page)
    const chipsBefore = await chipNames(page)
    const combobox = page.getByRole('combobox', { name: 'Tool' })
    await combobox.fill('Line helper')
    await page.locator('[role=treeitem][data-mode="line"][data-submode="4"]').click()
    await waitForTool(page, { mode: 'line', submode: '4' })
    assert.deepEqual(await chipNames(page), chipsBefore)
    assert.equal(await storedEntries(page), before, 'nothing of the pins was saved again')
  })
})

describe('the board frame', () => {
  let opened
  before(async () => { opened = await openSolve(['Line Normal', 'Line Diagonal']) })
  after(async () => { await opened?.context.close() })

  // The Pinned card marks the current pin's chip in the same draw that colours the frame.
  const pressedChip = (page) => page.getByRole('region', { name: 'Pinned' }).locator('[aria-pressed="true"]').allInnerTexts()
    .then((texts) => texts.map((text) => text.replace(/^\d+\s*/, '').trim()))
  const frameOnce = async (page, chips) => {
    assert.deepEqual(await settle(() => pressedChip(page), chips), chips)
    return frameColour(page)
  }

  it('gives two pins on one mode different colours, and a tool outside the pins its own', async () => {
    const { page } = opened
    await setTool(page, { mode: 'line', submode: '1' })
    const first = await frameOnce(page, ['Line > Normal'])
    await page.keyboard.press('Tab')
    const second = await frameOnce(page, ['Line > Diagonal'])
    assert.notEqual(second, first, 'two pins on Line differ')
    await setTool(page, { mode: 'line', submode: '4' })
    const neutral = await frameOnce(page, [])
    assert.notEqual(neutral, first)
    assert.notEqual(neutral, second)
  })
})

describe('the pin toggles', () => {
  let opened
  before(async () => {
    opened = await openSolve(['Line Normal', 'Sudoku Corner', 'Surface', 'Wall'])
    for (const name of ['Unpin Surface', 'Unpin Wall']) {
      await opened.page.getByRole('region', { name: 'Pinned' }).getByRole('button', { name }).click()
    }
  })
  after(async () => { await opened?.context.close() })

  const modeCard = (page) => page.getByRole('region', { name: 'Mode' })
  const recentCard = (page) => page.getByRole('region', { name: 'Recent' })

  it('has no Pin current tool button', async () => {
    assert.equal(await opened.page.getByRole('button', { name: 'Pin current tool' }).count(), 0)
  })

  it('leaves the engine quiet while nobody touches the page', async () => {
    const { page } = opened
    await afterChange(page)
    const changes = await page.evaluate(() => new Promise((resolve) => {
      let count = 0
      engine.on('change', () => { count += 1 })
      setTimeout(() => resolve(count), 1000)
    }))
    assert.ok(changes < 5, `${changes} engine changes in one idle second: a redraw keeps triggering the next`)
  })

  it('shows the Mode card\'s pin pressed exactly when the current tool is pinned, and toggles it', async () => {
    const { page } = opened
    await setTool(page, { mode: 'line', submode: '1' })
    await modeCard(page).getByRole('button', { name: 'Unpin Line > Normal' }).waitFor()
    assert.equal(await modeCard(page).getByRole('button', { name: 'Unpin Line > Normal' }).getAttribute('aria-pressed'), 'true')
    await setTool(page, { mode: 'surface', submode: null })
    const pin = modeCard(page).getByRole('button', { name: 'Pin Surface' })
    await pin.waitFor()
    assert.equal(await pin.getAttribute('aria-pressed'), 'false')
    await pin.click()
    assert.deepEqual(await settle(() => chipNames(page), ['Line > Normal', 'Sudoku > Corner', 'Surface']), ['Line > Normal', 'Sudoku > Corner', 'Surface'])
    assert.equal(await modeCard(page).getByRole('button', { name: 'Unpin Surface' }).getAttribute('aria-pressed'), 'true')
    // The Tab cycle follows: Surface is the last pin, so Tab from it wraps to the first.
    await page.keyboard.press('Tab')
    await waitForTool(page, { mode: 'line', submode: '1' })
    await setTool(page, { mode: 'surface', submode: null })
    await waitForTool(page, { mode: 'surface', submode: null })
    await modeCard(page).getByRole('button', { name: 'Unpin Surface' }).click()
    assert.deepEqual(await settle(() => chipNames(page), ['Line > Normal', 'Sudoku > Corner']), ['Line > Normal', 'Sudoku > Corner'])
    assert.equal(await modeCard(page).getByRole('button', { name: 'Pin Surface' }).getAttribute('aria-pressed'), 'false')
  })

  it('gives each Recent chip a pin that pins its tool and leaves the current tool alone', async () => {
    const { page } = opened
    await setTool(page, { mode: 'wall', submode: null })
    await afterChange(page)
    await setTool(page, { mode: 'surface', submode: null })
    await waitForTool(page, { mode: 'surface', submode: null })
    const wall = recentCard(page).getByRole('button', { name: 'Pin Wall' })
    await wall.waitFor()
    assert.equal(await wall.getAttribute('aria-pressed'), 'false')
    await wall.click()
    assert.deepEqual(await settle(() => chipNames(page), ['Line > Normal', 'Sudoku > Corner', 'Wall']), ['Line > Normal', 'Sudoku > Corner', 'Wall'])
    // A pinned mode leaves Recent (#182).
    assert.equal(await recentCard(page).getByRole('button', { name: /Wall/ }).count(), 0)
    assert.equal((await currentTool(page)).mode, 'surface', 'the tool did not change')
    await page.getByRole('region', { name: 'Pinned' }).getByRole('button', { name: 'Unpin Wall' }).click()
    assert.deepEqual(await settle(() => chipNames(page), ['Line > Normal', 'Sudoku > Corner']), ['Line > Normal', 'Sudoku > Corner'])
    assert.equal((await currentTool(page)).mode, 'surface')
  })
})
