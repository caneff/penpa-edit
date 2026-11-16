// The Settings dialog of `solve.html` (#100): `engine.getSettings` / `setSetting` over the fixed list, the dialog's four
// groups, every change saved at once, conflict detection off for one puzzle only, Clear saved progress, and the keys.
// The UI is found by role and accessible name, the board by what Penpa would save (`readEngineState`, defined by
// recorder.js); the keys and clicks are real. Settings live in cookies, so every page is served over `https://penpa.test/`.
import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { AKARI_SOLVE, makeNumberSolveLink, openPenpa, useBrowser } from './page.mjs'
import { settle } from './settle.mjs'

const browser = useBrowser()

const DESK_SIZE = { viewport: { width: 1400, height: 900 } }
const SOLVE_PAGE = 'https://penpa.test/solve.html'

// Index in `pu.centerlist` of a cell clear of the board's edges.
const CELL = 12

const SETTING_NAMES = [
  'sudoku_centre_size', 'sudoku_normal_size', 'outline_text', 'secondcolor', 'custom_colors_on',
  'conflict_detection', 'check_pencil_marks', 'ignore_line_style', 'starbattle_dots',
  'local_storage', 'auto_save_history', 'reload_button', 'shortcuts_enabled'
]

// One control per setting: how the dialog shows it, what a fresh browser holds, and the value a click on the UI gives it.
const CONTROLS = [
  { name: 'sudoku_centre_size', group: 'Board look', select: 'Sudoku centre marks', choose: 'Large', from: 1, to: 2 },
  { name: 'sudoku_normal_size', group: 'Board look', select: 'Sudoku digits', choose: 'Bottom', from: 1, to: 2 },
  { name: 'outline_text', group: 'Board look', toggle: 'Outline on text', from: false, to: true },
  { name: 'secondcolor', group: 'Board look', select: 'Surface second colour', choose: 'Blue', from: 2, to: 5 },
  { name: 'custom_colors_on', group: 'Board look', toggle: 'Custom colours', from: false, to: true },
  { name: 'conflict_detection', group: 'Checking', select: 'Conflict detection', choose: 'Off for every puzzle', from: 1, to: 3 },
  { name: 'check_pencil_marks', group: 'Checking', toggle: 'Check pencil marks', from: false, to: true },
  { name: 'ignore_line_style', group: 'Checking', toggle: 'Any colour matches a green line', from: false, to: true },
  { name: 'starbattle_dots', group: 'Checking', select: 'Star Battle dots', choose: 'Low range', from: 1, to: 2 },
  { name: 'local_storage', group: 'Progress', toggle: 'Save progress in this browser', from: true, to: false },
  { name: 'auto_save_history', group: 'Progress', toggle: 'Save a copy to the browser history on every save', from: false, to: true },
  { name: 'reload_button', group: 'Progress', toggle: 'Ask before leaving the page', from: false, to: true },
  { name: 'shortcuts_enabled', group: 'Keys', toggle: 'Z, X, C and V shortcuts', from: true, to: false }
]

// Opens `solve.html` on `query` in a context of its own, served so that cookies work, and returns once the desk is built.
async function openSolve (query = AKARI_SOLVE, options = {}) {
  const opened = await openPenpa(browser(), query, { solve: true, served: true, contextOptions: DESK_SIZE, ...options })
  await waitForDesk(opened.page)
  return opened
}

async function waitForDesk (page) {
  await page.getByRole('region', { name: 'Board' }).waitFor()
  await page.evaluate(() => engine.ready)
}

// A page that asks "leave this page?" (the reload protection setting) is left as a visitor who says yes leaves it.
function acceptLeaving (page) {
  page.removeAllListeners('dialog')
  page.on('dialog', (d) => d.accept())
}

// Reloads the page as a visitor would.
async function reload (page) {
  acceptLeaving(page)
  await page.reload()
  await waitForDesk(page)
}

// Goes to `query` on the same page and context, which keep their cookies and storage.
async function openLink (page, query) {
  acceptLeaving(page)
  await page.goto('about:blank')
  await page.goto(SOLVE_PAGE + query)
  await waitForDesk(page)
}

// A puzzle other than AKARI_SOLVE: a setting that is global holds there too, and is not just part of the first puzzle's saved progress.
let otherPuzzle
const otherLink = async () => (otherPuzzle ??= await makeNumberSolveLink(browser()))

const settings = (page) => page.evaluate(() => engine.getSettings())

async function openDialog (page) {
  await page.getByRole('button', { name: 'Settings' }).click()
  await page.getByRole('dialog', { name: 'Settings' }).waitFor()
  // The settings are the open dialog's own children, outside the shadow DOM's inner `dialog` that holds the role.
  return page.locator('wa-dialog[open]')
}

const closeDialog = async (page) => {
  await page.keyboard.press('Escape')
  await page.getByRole('dialog', { name: 'Settings' }).waitFor({ state: 'hidden' })
}

// Web Awesome's switch hides its input under the visible track, so Playwright's check for a covered target never passes on the
// input. The click goes to the switch element holding it, which waits for the dialog's opening animation to settle first.
const flipSwitch = (page, name) => page.locator('wa-switch').filter({ has: page.getByRole('switch', { name }) }).click()

// Changes one control as a visitor would. A select is looked for in `group`, the control's group of the dialog.
async function useControl (page, group, control) {
  if (control.toggle) {
    await flipSwitch(page, control.toggle)
  } else {
    await group.getByRole('combobox', { name: control.select }).click()
    await group.getByRole('option', { name: control.choose }).click()
  }
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

const setTool = (page, tool) => page.evaluate((t) => engine.setTool(t), tool)

// What the solver has entered, the selection and the mode: what a key could change on the board.
const board = (page) => page.evaluate(() => {
  const state = readEngineState()
  // The undo and replay logs carry the time between keys, which differs between runs.
  const { command_undo: undo, command_redo: redo, command_replay: replay, ...entered } = state.pu_a
  return { entered, selection: state.selection, mode: state.mode }
})

// The digits the solver has typed into Number mode cells.
const typedDigits = async (page) => Object.values((await board(page)).entered.number ?? {}).map(([digit]) => digit)

describe('engine.getSettings and engine.setSetting', () => {
  it('lists the fixed settings and the theme, and no other', async () => {
    const { context, page } = await openSolve()
    try {
      assert.deepEqual(Object.keys(await settings(page)).sort(), [...SETTING_NAMES, 'theme'].sort(), 'the fixed list, and the theme the top bar reads')
    } finally {
      await context.close()
    }
  })

  it('throws on an unknown name and on a value the setting does not take, and changes nothing', async () => {
    const { context, page } = await openSolve()
    try {
      const before = await settings(page)
      const failure = (name, value) => page.evaluate(([n, v]) => {
        try {
          engine.setSetting(n, v)
          return null
        } catch (e) {
          return `${e.name}: ${e.message}`
        }
      }, [name, value])
      assert.match(await failure('no_such_setting', true), /^RangeError: .*no_such_setting/)
      assert.match(await failure('color_theme', 2), /^RangeError/, 'a Penpa setting outside the list is unknown')
      assert.match(await failure('outline_text', 1), /^TypeError: .*outline_text/)
      assert.match(await failure('sudoku_centre_size', 9), /^RangeError: .*sudoku_centre_size/)
      assert.match(await failure('sudoku_centre_size', '2'), /^RangeError/)
      assert.deepEqual(await settings(page), before)
    } finally {
      await context.close()
    }
  })

  for (const control of CONTROLS) {
    it(`sets ${control.name} and saves it at once`, async () => {
      const { context, page } = await openSolve()
      try {
        assert.equal((await settings(page))[control.name], control.from, 'a fresh browser holds the default')
        await page.evaluate(([n, v]) => engine.setSetting(n, v), [control.name, control.to])
        assert.equal((await settings(page))[control.name], control.to)
        await reload(page)
        assert.equal((await settings(page))[control.name], control.to, 'the value is back after a reload')
        await openLink(page, await otherLink())
        assert.equal((await settings(page))[control.name], control.to, 'the value holds on another puzzle')
      } finally {
        await context.close()
      }
    })
  }
})

describe('the Settings dialog', () => {
  it('shows the four groups', async () => {
    const { context, page } = await openSolve()
    try {
      const dialog = await openDialog(page)
      for (const group of ['Board look', 'Checking', 'Progress', 'Keys']) {
        assert.equal(await dialog.getByRole('group', { name: group }).isVisible(), true, `${group} is a group`)
      }
    } finally {
      await context.close()
    }
  })

  for (const control of CONTROLS) {
    it(`changes ${control.name} from ${control.group}, and shows it again after a reload`, async () => {
      const { context, page } = await openSolve()
      try {
        const dialog = await openDialog(page)
        const group = dialog.getByRole('group', { name: control.group })
        await useControl(page, group, control)
        assert.equal(await settle(async () => (await settings(page))[control.name], control.to), control.to)
        await closeDialog(page)
        await reload(page)
        assert.equal((await settings(page))[control.name], control.to, 'the value is back after a reload')
        const again = await openDialog(page)
        if (control.toggle) {
          assert.equal(await again.getByRole('switch', { name: control.toggle }).isChecked(), control.to)
        } else {
          assert.equal(await again.getByRole('combobox', { name: control.select }).inputValue(), control.choose)
        }
        await closeDialog(page)
        await openLink(page, await otherLink())
        assert.equal((await settings(page))[control.name], control.to, 'the value holds on another puzzle')
      } finally {
        await context.close()
      }
    })
  }
})

describe('conflict detection off for this puzzle only', () => {
  it('is off again on reopening puzzle A and on for puzzle B', async () => {
    const linkB = await makeNumberSolveLink(browser())
    const { context, page } = await openSolve(AKARI_SOLVE)
    try {
      const dialog = await openDialog(page)
      await dialog.getByRole('combobox', { name: 'Conflict detection' }).click()
      await page.getByRole('option', { name: 'Off for this puzzle' }).click()
      assert.equal(await settle(async () => (await settings(page)).conflict_detection, 2), 2)
      assert.equal(await dialog.getByText('This puzzle only').isVisible(), true, 'the setting is tagged')
      await closeDialog(page)

      await reload(page)
      assert.equal((await settings(page)).conflict_detection, 2, 'A: off again after a reload')
      assert.equal(await (await openDialog(page)).getByText('This puzzle only').isVisible(), true, 'A: tagged again')
      await closeDialog(page)

      await openLink(page, linkB)
      assert.equal((await settings(page)).conflict_detection, 1, 'B: on')
      assert.equal(await (await openDialog(page)).getByText('This puzzle only').isVisible(), false, 'B: not tagged')
      await closeDialog(page)

      await openLink(page, AKARI_SOLVE)
      assert.equal((await settings(page)).conflict_detection, 2, 'A: off when opened again later')
    } finally {
      await context.close()
    }
  })

  it('is on again once the visitor turns it back on', async () => {
    const { context, page } = await openSolve(AKARI_SOLVE)
    try {
      const dialog = await openDialog(page)
      await dialog.getByRole('combobox', { name: 'Conflict detection' }).click()
      await page.getByRole('option', { name: 'Off for this puzzle' }).click()
      // A click on the select while its list is still closing toggles it shut again.
      await page.getByRole('option', { name: 'On', exact: true }).waitFor({ state: 'hidden' })
      await dialog.getByRole('combobox', { name: 'Conflict detection' }).click()
      await page.getByRole('option', { name: 'On', exact: true }).click()
      assert.equal(await settle(async () => (await settings(page)).conflict_detection, 1), 1)
      await closeDialog(page)
      await reload(page)
      assert.equal((await settings(page)).conflict_detection, 1)
    } finally {
      await context.close()
    }
  })
})

describe('Clear saved progress', () => {
  it('removes the puzzle\'s saved progress, and the progress was there before', async () => {
    const link = await makeNumberSolveLink(browser())
    const { context, page } = await openSolve(link)
    try {
      await setTool(page, { mode: 'number', submode: '1' })
      await clickCell(page, CELL)
      await page.keyboard.press('7')
      assert.deepEqual(await settle(() => typedDigits(page), ['7']), ['7'], 'the digit is on the board')

      await reload(page)
      assert.deepEqual(await settle(() => typedDigits(page), ['7']), ['7'], 'the digit came back from the saved progress')

      const dialog = await openDialog(page)
      await dialog.getByRole('button', { name: 'Clear saved progress' }).click()
      await closeDialog(page)
      await reload(page)
      assert.deepEqual(await settle(() => typedDigits(page), []), [], 'the saved progress is gone')
    } finally {
      await context.close()
    }
  })
})

describe('the keys', () => {
  it('never reach the board from the dialog, and Escape returns focus to the board', async () => {
    const link = await makeNumberSolveLink(browser())
    const { context, page } = await openSolve(link)
    try {
      await setTool(page, { mode: 'number', submode: '1' })
      await clickCell(page, CELL)
      const before = await board(page)
      assert.equal(before.selection.length, 1, 'a cell is selected, so a digit would be entered')

      const dialog = await openDialog(page)
      await dialog.getByRole('combobox', { name: 'Sudoku centre marks' }).focus()
      await page.keyboard.press('7')
      await dialog.getByRole('switch', { name: 'Outline on text' }).focus()
      await page.keyboard.press('7')
      await page.keyboard.press('Backspace')
      assert.deepEqual(await board(page), before, 'the board is as it was')

      await closeDialog(page)
      await page.keyboard.press('5')
      assert.deepEqual(await settle(() => typedDigits(page), ['5']), ['5'], 'a digit after Escape reaches the board')
    } finally {
      await context.close()
    }
  })

  it('make Z jump to the first pin with the shortcuts setting on, and do nothing with it off', async () => {
    const { context, page } = await openSolve(AKARI_SOLVE)
    try {
      // The tool Z jumps to, and a tool of another mode to start from.
      const [firstPin] = await page.evaluate(() => engine.tabSet())
      const { mode, submode } = (await page.evaluate(() => engine.listTools())).find((t) => t.mode !== firstPin.mode)
      const start = { mode, submode }
      const modeNow = () => page.evaluate(() => engine.getTool().mode)

      await openDialog(page)
      await flipSwitch(page, 'Z, X, C and V shortcuts')
      await closeDialog(page)
      await setTool(page, start)
      await page.keyboard.press('z')
      assert.equal(await modeNow(), start.mode, 'Z does nothing with shortcuts off')

      await openDialog(page)
      await flipSwitch(page, 'Z, X, C and V shortcuts')
      await closeDialog(page)
      await page.keyboard.press('z')
      assert.equal(await settle(modeNow, firstPin.mode), firstPin.mode, 'Z jumps to the first pin with shortcuts on')
    } finally {
      await context.close()
    }
  })
})
