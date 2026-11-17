// The Settings dialog of `solve.html` (#100): `engine.getSettings` / `setSetting` over the fixed list, the dialog's four
// groups, every change saved at once, conflict detection off for one puzzle only, Clear saved progress, and the keys.
// The UI is found by role and accessible name, the board by what Penpa+ would save (`readEngineState`, defined by
// recorder.js); the keys and clicks are real. Settings live in cookies, so every page is served over `https://penpa.test/`.
import assert from 'node:assert/strict'
import { after, before, describe, it } from 'node:test'
import {
  AKARI_SOLVE, board, boardCanvasInPage, linkFromNewBoard, makeNumberSolveLink, NURIKABE_IMPORT, openSolvePage, solveLinkOfImport, setTool, typedDigits, useBrowser, waitForDesk
} from './page.mjs'
import { cellPixel, clickCell } from './replay.mjs'
import { IMPORTS } from './tier-c-puzzles.mjs'
import { choosePreset, pinChips } from './pin-card.mjs'
import { settle } from './settle.mjs'

const browser = useBrowser()

// Index in `pu.centerlist` of a cell clear of the board's edges.
const CELL = 12

const SETTING_NAMES = [
  'sudoku_centre_size', 'sudoku_normal_size', 'outline_text', 'secondcolor', 'custom_colors_on',
  'conflict_detection', 'check_pencil_marks', 'ignore_line_style', 'starbattle_dots',
  'local_storage', 'auto_save_history', 'reload_button', 'shortcuts_enabled'
]

// One control per setting: how the dialog shows it, what a fresh browser holds, and the value a click on the UI gives it.
const CONTROLS = [
  { name: 'sudoku_centre_size', group: 'Board look', on: 'sudoku-9x9', select: 'Sudoku centre marks', choose: 'Large', from: 1, to: 2 },
  { name: 'sudoku_normal_size', group: 'Board look', on: 'sudoku-9x9', select: 'Sudoku digits', choose: 'Bottom', from: 1, to: 2 },
  { name: 'outline_text', group: 'Board look', toggle: 'Outline on text', from: true, to: false },
  { name: 'secondcolor', group: 'Board look', select: 'Surface second colour', choose: 'Blue', from: 2, to: 5 },
  { name: 'custom_colors_on', group: 'Board look', toggle: 'Custom colours', from: false, to: true },
  { name: 'conflict_detection', group: 'Checking', select: 'Conflict detection', choose: 'Off for every puzzle', from: 1, to: 3 },
  { name: 'check_pencil_marks', group: 'Checking', toggle: 'Check pencil marks', from: false, to: true },
  { name: 'ignore_line_style', group: 'Checking', toggle: 'Any colour matches a green line', from: false, to: true },
  { name: 'starbattle_dots', group: 'Checking', on: 'starbattle', select: 'Star Battle dots', choose: 'Low range', from: 1, to: 2 },
  { name: 'local_storage', group: 'Progress', toggle: 'Save progress in this browser', from: true, to: false },
  { name: 'auto_save_history', group: 'Progress', toggle: 'Save a copy to the browser history on every save', from: false, to: true },
  { name: 'reload_button', group: 'Progress', toggle: 'Ask before leaving the page', from: false, to: true },
  { name: 'shortcuts_enabled', group: 'Keys', toggle: 'Z, X, C and V shortcuts', from: true, to: false }
]

// Opens `solve.html` on `query` in a context of its own, served so that cookies work, and returns once the desk is built.
const openSolve = (query = AKARI_SOLVE, options = {}) => openSolvePage(browser(), query, { served: true, ...options })

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
  const solvePage = page.url().split('#')[0]
  acceptLeaving(page)
  await page.goto('about:blank')
  await page.goto(solvePage + query)
  await waitForDesk(page)
}

// A puzzle other than AKARI_SOLVE: a setting that is global holds there too, and is not just part of the first puzzle's saved progress.
let otherPuzzle
const otherLink = async () => (otherPuzzle ??= await makeNumberSolveLink(browser()))

// The solve link of the puzzle `name` of `IMPORTS`, or of Nurikabe, whose genre tag is neither Sudoku nor Star Battle.
const importedLinks = new Map()
const importLink = (name) => {
  if (!importedLinks.has(name)) importedLinks.set(name, solveLinkOfImport(browser(), name === 'nurikabe' ? NURIKABE_IMPORT : IMPORTS[name]))
  return importedLinks.get(name)
}

const CLEAR_BUTTON = 'Clear this puzzle\'s saved progress'
const CONFIRM_CLEAR = 'Clear progress'

const pageGroup = (dialog) => dialog.getByRole('group', { name: 'Page' })
const pinsGroup = (dialog) => dialog.getByRole('group', { name: 'Pins' })
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

// Types `digit` into the cell at `index` in Number mode, as a visitor does, and waits until it is on the board.
async function typeDigit (page, index, digit) {
  await setTool(page, { mode: 'number', submode: '1' })
  await clickCell(page, index)
  await page.keyboard.press(digit)
  assert.deepEqual(await settle(() => typedDigits(page), [digit]), [digit], 'the digit is on the board')
}

// Runs Penpa+'s own save, as it does on leaving the page. Its storage write is issued, not awaited, but a later read of
// the same store waits for it.
const savePenpa = (page) => page.evaluate(() => PenpaProgress.save())

// The progress Penpa+ holds for the open puzzle, or null for none.
const storedProgress = (page) => page.evaluate(() => localforage.getItem(PenpaProgress.getHash(pu.url)))

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
      assert.match(await failure('color_theme', 2), /^RangeError/, 'a Penpa+ setting outside the list is unknown')
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
  it('shows the four groups of Penpa+ settings and the page\'s own', async () => {
    const { context, page } = await openSolve()
    try {
      const dialog = await openDialog(page)
      for (const group of ['Board look', 'Checking', 'Progress', 'Keys', 'Page', 'Pins']) {
        assert.equal(await dialog.getByRole('group', { name: group }).isVisible(), true, `${group} is a group`)
      }
    } finally {
      await context.close()
    }
  })

  for (const control of CONTROLS) {
    it(`changes ${control.name} from ${control.group}, and shows it again after a reload`, async () => {
      const { context, page } = await openSolve(control.on ? await importLink(control.on) : AKARI_SOLVE)
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

describe('the Settings dialog shows what the open puzzle uses', () => {
  const GENRE_CONTROLS = ['Sudoku centre marks', 'Sudoku digits', 'Star Battle dots']
  const shown = async (query) => {
    const { context, page } = await openSolve(query)
    try {
      const dialog = await openDialog(page)
      const names = []
      for (const name of GENRE_CONTROLS) {
        if (await dialog.getByRole('combobox', { name }).count() > 0) names.push(name)
      }
      return names
    } finally {
      await context.close()
    }
  }

  it('shows no Sudoku or Star Battle setting on a Nurikabe', async () => {
    assert.deepEqual(await shown(await importLink('nurikabe')), [])
  })

  it('shows every genre setting on a puzzle with no genre tag', async () => {
    assert.deepEqual(await shown(await makeNumberSolveLink(browser())), GENRE_CONTROLS)
  })

  it('shows the Sudoku settings on a Sudoku and no Star Battle one', async () => {
    assert.deepEqual(await shown(await importLink('sudoku-9x9')), ['Sudoku centre marks', 'Sudoku digits'])
  })

  it('shows the Star Battle setting on a Star Battle and no Sudoku one', async () => {
    assert.deepEqual(await shown(await importLink('starbattle')), ['Star Battle dots'])
  })
})

describe('the Settings dialog is readable', () => {
  // The Penpa+ words, and the one help line under each.
  const HELP = {
    'Surface second colour': ['combobox', 'The colour Surface uses for its second shading style.'],
    'Custom colours': ['switch', 'Adds your own colours to the colour pickers.'],
    'Any colour matches a green line': ['switch', 'A line of any colour counts as the answer\'s green line when the puzzle is checked.'],
    'Save a copy to the browser history on every save': ['switch', 'Keeps the puzzle in the browser\'s history list each time it is saved.']
  }

  it('gives each of the four Penpa+ words a help line under its control', async () => {
    const { context, page } = await openSolve()
    try {
      const dialog = await openDialog(page)
      for (const [label, [role, help]] of Object.entries(HELP)) {
        const row = dialog.locator('.ui-setting').filter({ has: page.getByRole(role, { name: label }) })
        assert.equal(await row.locator('.ui-help').textContent(), help, label)
      }
    } finally {
      await context.close()
    }
  })

  it('logs no Web Awesome deprecation warning while loading the page and opening the Settings dialog', async () => {
    const warnings = []
    const { context, page } = await openSolve(AKARI_SOLVE, { setup: (ctx) => ctx.on('page', (p) => p.on('console', (m) => { if (/deprecated/i.test(m.text())) warnings.push(m.text()) })) })
    try {
      await openDialog(page)
      assert.deepEqual(warnings, [])
    } finally {
      await context.close()
    }
  })

  it('closes the dialog on Reset layout, so the result is seen', async () => {
    const { context, page } = await openSolve()
    try {
      const dialog = await openDialog(page)
      await pageGroup(dialog).getByRole('button', { name: 'Reset layout' }).click()
      await page.getByRole('dialog', { name: 'Settings' }).waitFor({ state: 'hidden' })
    } finally {
      await context.close()
    }
  })
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

  // Penpa+'s history copy rewrites the link's `#` part on every save, with the solver's progress in it; the setting is the
  // puzzle's, so it holds across it.
  it('is off again after a reload of a link the history copy rewrote', async () => {
    const { context, page } = await openSolve(AKARI_SOLVE)
    try {
      const dialog = await openDialog(page)
      await dialog.getByRole('combobox', { name: 'Conflict detection' }).click()
      await page.getByRole('option', { name: 'Off for this puzzle' }).click()
      assert.equal(await settle(async () => (await settings(page)).conflict_detection, 2), 2)
      await closeDialog(page)
      await page.evaluate(() => engine.setSetting('auto_save_history', true))
      const before = await page.evaluate(() => location.hash)
      await savePenpa(page)
      assert.notEqual(await page.evaluate(() => location.hash), before, 'the save rewrote the link')
      await reload(page)
      assert.equal((await settings(page)).conflict_detection, 2, 'off again after the reload')
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

      // Penpa+ saves on unload, and a reload can cut that write short: save now and wait until it is stored.
      await page.evaluate(() => PenpaProgress.save())
      const stored = () => page.evaluate(async () => Boolean(await localforage.getItem(PenpaProgress.getHash(pu.url))))
      assert.equal(await settle(stored, true), true, 'the progress is stored before the reload')
      await reload(page)
      assert.deepEqual(await settle(() => typedDigits(page), ['7']), ['7'], 'the digit came back from the saved progress')

      const dialog = await openDialog(page)
      await dialog.getByRole('button', { name: CLEAR_BUTTON, exact: true }).click()
      await page.getByRole('button', { name: CONFIRM_CLEAR, exact: true }).click()
      await closeDialog(page)
      await reload(page)
      assert.deepEqual(await settle(() => typedDigits(page), []), [], 'the saved progress is gone')
    } finally {
      await context.close()
    }
  })

  it('asks first: Cancel leaves the saved progress, and the question says it is this puzzle only', async () => {
    const link = await makeNumberSolveLink(browser())
    const { context, page } = await openSolve(link)
    try {
      await typeDigit(page, CELL, '7')
      await savePenpa(page)
      assert.notEqual(await storedProgress(page), null, 'the progress is stored')
      const dialog = await openDialog(page)
      await dialog.getByRole('button', { name: CLEAR_BUTTON, exact: true }).click()
      assert.match(await page.locator('wa-dialog[label="Clear this puzzle\'s saved progress?"]').textContent(), /this puzzle only/)
      const cancel = page.getByRole('button', { name: 'Cancel' })
      await cancel.click()
      await cancel.waitFor({ state: 'hidden' })
      assert.notEqual(await storedProgress(page), null, 'Cancel leaves the saved progress')
      assert.equal(await page.getByRole('switch', { name: 'Save progress in this browser' }).isChecked(), true, 'saving is still on')
    } finally {
      await context.close()
    }
  })

  it('leaves the global Save progress switch as it was and notes that this puzzle was cleared', async () => {
    const link = await makeNumberSolveLink(browser())
    const { context, page } = await openSolve(link)
    try {
      await typeDigit(page, CELL, '7')
      await savePenpa(page)
      const dialog = await openDialog(page)
      await dialog.getByRole('button', { name: CLEAR_BUTTON, exact: true }).click()
      await page.getByRole('button', { name: CONFIRM_CLEAR, exact: true }).click()
      await dialog.getByRole('status').filter({ hasText: /^This puzzle's saved progress was cleared\./ }).waitFor()
      assert.equal(await storedProgress(page), null, 'the progress is gone')
      assert.equal(await page.getByRole('switch', { name: 'Save progress in this browser' }).isChecked(), true, 'the global switch still shows saving on')
      assert.equal((await settings(page)).local_storage, true, 'the setting is still on')
    } finally {
      await context.close()
    }
  })
})

describe('engine.clearSavedProgress', () => {
  it('resolves only once the progress is gone from storage', async () => {
    const link = await makeNumberSolveLink(browser())
    const { context, page } = await openSolve(link)
    try {
      await typeDigit(page, CELL, '7')
      await savePenpa(page)
      assert.notEqual(await storedProgress(page), null, 'the progress is stored')
      const left = await page.evaluate(async () => {
        // Slow storage: every removal starts a task later, so one nobody waits for is still pending when the call returns.
        const remove = localforage.removeItem.bind(localforage)
        localforage.removeItem = (key) => new Promise((resolve) => setTimeout(resolve)).then(() => remove(key))
        const hash = PenpaProgress.getHash(pu.url)
        await engine.clearSavedProgress()
        return localforage.getItem(hash)
      })
      assert.equal(left, null)
    } finally {
      await context.close()
    }
  })
})

describe('the Progress settings', () => {
  it('save progress in this browser: off, a save stores nothing and the digit is not back after a reload', async () => {
    const link = await makeNumberSolveLink(browser())
    const { context, page } = await openSolve(link)
    try {
      await openDialog(page)
      await flipSwitch(page, 'Save progress in this browser')
      assert.equal(await settle(async () => (await settings(page)).local_storage, false), false)
      await closeDialog(page)
      await typeDigit(page, CELL, '7')
      await savePenpa(page)
      assert.equal(await storedProgress(page), null, 'nothing is stored')
      await reload(page)
      assert.deepEqual(await typedDigits(page), [], 'the digit is not back')
    } finally {
      await context.close()
    }
  })

  it('save a copy to the browser history: a save adds a history entry only while it is on', async () => {
    const link = await makeNumberSolveLink(browser())
    const { context, page } = await openSolve(link)
    try {
      const where = () => page.evaluate(() => ({ hash: location.hash, entries: history.length }))
      await typeDigit(page, CELL, '7')
      const start = await where()
      await savePenpa(page)
      assert.deepEqual(await where(), start, 'off: the address and the history are as they were')

      await openDialog(page)
      await flipSwitch(page, 'Save a copy to the browser history on every save')
      assert.equal(await settle(async () => (await settings(page)).auto_save_history, true), true)
      await closeDialog(page)
      await savePenpa(page)
      const after = await where()
      assert.equal(after.entries, start.entries + 1, 'on: the save added a history entry')
      assert.notEqual(after.hash, start.hash, 'on: the address carries the copy')
      assert.match(after.hash, /[#&]l=solvedup(&|$)/, 'on: the copy is a solving copy')
    } finally {
      await context.close()
    }
  })

  it('ask before leaving the page: a reload asks only while it is on', async () => {
    const { context, page } = await openSolve(AKARI_SOLVE)
    try {
      const asked = []
      const reloadCounting = async () => {
        page.removeAllListeners('dialog')
        page.on('dialog', (d) => { asked.push(d.type()); d.accept() })
        // Chromium asks only on a page the visitor has used.
        await clickCell(page, CELL)
        await page.reload()
        await waitForDesk(page)
      }
      await reloadCounting()
      assert.deepEqual(asked, [], 'off: no question')

      await openDialog(page)
      await flipSwitch(page, 'Ask before leaving the page')
      assert.equal(await settle(async () => (await settings(page)).reload_button, true), true)
      await closeDialog(page)
      await reloadCounting()
      assert.deepEqual(asked, ['beforeunload'], 'on: the page asked once')
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
      await dialog.getByRole('combobox', { name: 'Conflict detection' }).focus()
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

// Runs in the page. A 4x4 board's solve link `#` part, built for one setting's effect to show:
// - `sudoku`: a classic sudoku, conflict checked, with two given 1s in its top row, a given 2 in its bottom right cell and
//   an author's answer, which Penpa+ needs before it checks for conflicts;
// - `colour`: a given shaded cell in a custom colour of its own;
// - `lineAnswer`: an author's answer of a green line between the two top-left cells, checked as a loop line.
function settingBoardInPage ({ sudoku, colour, lineAnswer }) {
  document.getElementById('nb_size1').value = 4
  document.getElementById('nb_size2').value = 4
  create_newboard()
  const cell = (x, y) => pu.centerlist[y * 4 + x]
  const solveLink = (checked) => {
    for (const box of [...document.getElementsByClassName('solcheck'), ...document.getElementsByClassName('solcheck_or')]) box.checked = false
    document.getElementById(checked).checked = true
    return pu.maketext_solve_solution()
  }
  let url = null
  if (sudoku) {
    set_genre_tags(['classic'])
    for (const [x, y, value] of [[0, 0, 1], [2, 0, 1], [3, 3, 2]]) pu.pu_q.number[cell(x, y)] = [String(value), 1, '1']
    pu.pu_a.number[cell(1, 1)] = ['3', 2, '1']
    url = solveLink('sol_number')
  } else if (colour) {
    pu.pu_q.surface[cell(1, 1)] = 1
    pu.pu_q_col.surface[cell(1, 1)] = 'rgba(255,0,0,1)'
    UserSettings.custom_colors_on = true
    url = pu.maketext_solve()
  } else if (lineAnswer) {
    pu.pu_a.line[[cell(0, 0), cell(1, 0)].join(',')] = 3
    url = solveLink('sol_loopline')
  }
  return url.slice(url.indexOf('#'))
}

const settingLinks = new Map()
const settingLink = (kind) => {
  if (!settingLinks.has(kind)) settingLinks.set(kind, linkFromNewBoard(browser(), settingBoardInPage, { [kind]: true }))
  return settingLinks.get(kind)
}

// The drawn board, as an image's data URL.
async function boardPicture (page) {
  const canvas = await page.evaluateHandle(boardCanvasInPage)
  try {
    return await canvas.evaluate((c) => c.toDataURL())
  } finally {
    await canvas.dispose()
  }
}

const setSetting = (page, name, value) => page.evaluate(([n, v]) => engine.setSetting(n, v), [name, value])

// Sets `name` to `to` and back to `from`: the board must look different at `to` and as it was at `from`. The bridge's
// setters draw before they return, so no wait is needed.
async function assertRedrawn (page, name, from, to) {
  await setSetting(page, name, from)
  const before = await boardPicture(page)
  await setSetting(page, name, to)
  assert.notEqual(await boardPicture(page), before, `${name} ${JSON.stringify(to)} changes the board`)
  await setSetting(page, name, from)
  assert.equal(await boardPicture(page), before, `${name} ${JSON.stringify(from)} draws it as before`)
}

// The symbols the solver has placed, by Penpa+'s point number.
const placedSymbols = (page) => page.evaluate(() => readEngineState().pu_a.symbol)

describe('each Board look and Checking setting, on a board where it applies', () => {
  describe('on a classic sudoku', () => {
    let opened
    before(async () => { opened = await openSolve(await settingLink('sudoku')) })
    after(async () => { await opened?.context.close() })

    it('sudoku_normal_size moves the digits', async () => {
      await assertRedrawn(opened.page, 'sudoku_normal_size', 1, 2)
    })

    it('conflict_detection shows the two given 1s in conflict only while it is on', async () => {
      await assertRedrawn(opened.page, 'conflict_detection', 1, 3)
    })

    it('check_pencil_marks marks a corner mark that conflicts with a given', async () => {
      const { page } = opened
      // A corner 2 beside the given 2 of the bottom row.
      await setTool(page, { mode: 'sudoku', submode: '2' })
      await clickCell(page, 14)
      await page.keyboard.press('2')
      await settle(async () => Object.keys((await board(page)).entered.numberS ?? {}).length, 1)
      await assertRedrawn(page, 'check_pencil_marks', false, true)
    })

    it('outline_text outlines a given on a shaded cell', async () => {
      const { page } = opened
      await setTool(page, { mode: 'surface', submode: null, style: 4 })
      await clickCell(page, 0)
      await settle(async () => Object.keys((await board(page)).entered.surface ?? {}).length, 1)
      await assertRedrawn(page, 'outline_text', true, false)
    })

    it('sudoku_centre_size sets the size a centre mark is entered at', async () => {
      const { page } = opened
      const sizeAt = (index) => page.evaluate((i) => readEngineState().pu_a.number[pu.centerlist[i]]?.[2] ?? null, index)
      await setTool(page, { mode: 'sudoku', submode: '3' })
      // Penpa+ keeps a centre mark as a number of size "6", large, or "5", small.
      await setSetting(page, 'sudoku_centre_size', 2)
      await clickCell(page, 5)
      await page.keyboard.press('4')
      assert.equal(await settle(() => sizeAt(5), '6'), '6', 'Large: a large mark')
      await setSetting(page, 'sudoku_centre_size', 3)
      await clickCell(page, 6)
      await page.keyboard.press('4')
      assert.equal(await settle(() => sizeAt(6), '5'), '5', 'Small: a small mark')
    })

    it('secondcolor is the colour a right click paints in Surface', async () => {
      const { page } = opened
      const shadeAt = (index) => page.evaluate((i) => readEngineState().pu_a.surface[pu.centerlist[i]] ?? null, index)
      await setTool(page, { mode: 'surface', submode: null })
      for (const [colour, index] of [[5, 9], [7, 10]]) {
        await setSetting(page, 'secondcolor', colour)
        await clickCell(page, index, { button: 'right' })
        assert.equal(await settle(() => shadeAt(index), colour), colour, `second colour ${colour}`)
      }
    })

    it('starbattle_dots decides whether a right click near a corner puts a dot there', async () => {
      const { page } = opened
      await setTool(page, { mode: 'combi', submode: 'star' })
      // A right click near the bottom-right corner of a cell, inside the cell.
      const nearCorner = async () => {
        const centre = await cellPixel(page, 6)
        const size = await page.evaluate(() => engine.getState().cellSize)
        return { x: centre.x + size * 0.42, y: centre.y + size * 0.42 }
      }
      const rightClickNearCorner = async () => {
        const before = JSON.stringify(await placedSymbols(page))
        const { x, y } = await nearCorner()
        await page.mouse.click(x, y, { button: 'right' })
        await settle(async () => JSON.stringify(await placedSymbols(page)) !== before, true)
        const placed = await placedSymbols(page)
        await page.evaluate(() => engine.undo())
        return placed
      }
      const cellPoint = String(await page.evaluate(() => pu.centerlist[6]))
      await setSetting(page, 'starbattle_dots', 1)
      const high = await rightClickNearCorner()
      assert.deepEqual(Object.entries(high).map(([point, [, shape]]) => [point === cellPoint, shape]), [[false, 'circle_SS']], 'High range: a dot on the corner')
      await setSetting(page, 'starbattle_dots', 3)
      const off = await rightClickNearCorner()
      assert.deepEqual(Object.keys(off), [cellPoint], 'Off: the mark goes in the cell')
    })
  })

  it('custom_colors_on draws a given\'s own colour only while it is on', async () => {
    const { context, page } = await openSolve(await settingLink('colour'))
    try {
      assert.equal((await settings(page)).custom_colors_on, true, 'a link with colours of its own turns it on')
      await assertRedrawn(page, 'custom_colors_on', true, false)
    } finally {
      await context.close()
    }
  })

  for (const on of [false, true]) {
    it(`ignore_line_style ${on ? 'on' : 'off'}: a red line ${on ? 'matches' : 'does not match'} the author's green line`, async () => {
      const { context, page } = await openSolve(await settingLink('lineAnswer'))
      try {
        await setSetting(page, 'ignore_line_style', on)
        await setTool(page, { mode: 'line', submode: '1', style: 8 })
        const [from, to] = [await cellPixel(page, 0), await cellPixel(page, 1)]
        await page.mouse.move(from.x, from.y)
        await page.mouse.down()
        await page.mouse.move(to.x, to.y, { steps: 5 })
        await page.mouse.up()
        await settle(async () => Object.keys((await board(page)).entered.line ?? {}).length, 1)
        const solved = () => page.evaluate(() => engine.getState().solved)
        assert.equal(await settle(solved, on), on)
      } finally {
        await context.close()
      }
    })
  }
})

describe('the desk\'s own settings in the dialog', () => {
  // The pins, by their unpin buttons' names.
  const pinNames = (page) => pinChips(page).getByRole('button', { name: /^Unpin / })
    .evaluateAll((buttons) => buttons.map((b) => b.getAttribute('aria-label')))

  it('switches the theme, and keeps it for the next visit', async () => {
    const { context, page } = await openSolve()
    try {
      const dialog = await openDialog(page)
      await pageGroup(dialog).getByRole('combobox', { name: 'Theme' }).click()
      await page.getByRole('option', { name: 'Dark' }).click()
      assert.equal(await settle(async () => (await settings(page)).theme, 'dark'), 'dark')
      await closeDialog(page)
      await reload(page)
      assert.equal((await settings(page)).theme, 'dark', 'dark after a reload')
      assert.equal(await pageGroup(await openDialog(page)).getByRole('combobox', { name: 'Theme' }).inputValue(), 'Dark')
    } finally {
      await context.close()
    }
  })

  it('resets the layout', async () => {
    const { context, page } = await openSolve()
    try {
      const rules = page.getByRole('region', { name: 'Rules' })
      const start = await rules.boundingBox()
      const head = await rules.getByRole('heading', { name: 'Rules' }).boundingBox()
      await page.mouse.move(head.x + head.width / 2, head.y + head.height / 2)
      await page.mouse.down()
      await page.mouse.move(head.x + head.width / 2 + 120, head.y + head.height / 2 + 70, { steps: 5 })
      await page.mouse.up()
      assert.notDeepEqual(await rules.boundingBox(), start, 'the card moved')
      const dialog = await openDialog(page)
      await pageGroup(dialog).getByRole('button', { name: 'Reset layout' }).click()
      assert.deepEqual(await settle(() => rules.boundingBox(), start), start)
    } finally {
      await context.close()
    }
  })

  it('the Puzzle defaults preset resets the pins to the link\'s Tab set', async () => {
    const { context, page } = await openSolve()
    try {
      assert.equal(await settle(async () => (await pinNames(page)).length > 1, true), true, 'the Tab set seeds two pins or more')
      const seeded = await pinNames(page)
      await page.getByRole('button', { name: seeded[0] }).click()
      assert.deepEqual(await settle(() => pinNames(page), seeded.slice(1)), seeded.slice(1), 'a pin is gone')
      await choosePreset(page, 'Puzzle defaults')
      assert.deepEqual(await settle(() => pinNames(page), seeded), seeded)
    } finally {
      await context.close()
    }
  })

  it('deletes a saved preset, which the Pinned card then no longer offers', async () => {
    const { context, page } = await openSolve()
    try {
      const pinned = page.getByRole('region', { name: 'Pinned' })
      await pinned.getByRole('button', { name: 'Save pins…' }).click()
      await pinned.getByRole('textbox', { name: 'Preset name' }).fill('Mine')
      await pinned.getByRole('button', { name: 'Save', exact: true }).click()
      const offered = async () => {
        await pinned.getByRole('combobox', { name: 'Pin presets' }).click()
        const names = await page.getByRole('option').allInnerTexts()
        await page.keyboard.press('Escape')
        await page.getByRole('option').first().waitFor({ state: 'hidden' })
        return names.includes('Mine')
      }
      assert.equal(await offered(), true, 'the saved preset is offered')

      const dialog = await openDialog(page)
      const deleteButton = pinsGroup(dialog).getByRole('button', { name: 'Delete preset' })
      assert.equal(await deleteButton.isDisabled(), true, 'nothing to delete until one is chosen')
      await pinsGroup(dialog).getByRole('combobox', { name: 'Your presets' }).click()
      await page.getByRole('option', { name: 'Mine' }).click()
      await deleteButton.click()
      await closeDialog(page)
      assert.equal(await offered(), false, 'the deleted preset is no longer offered')
    } finally {
      await context.close()
    }
  })
})
