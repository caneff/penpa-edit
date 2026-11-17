// The key front door of `solve.html` (#93): browser keys stay the browser's, a text field keeps its digits, Escape closes
// one thing at a time, Penpa+'s popups block the board, and the keys the board keeps work as on the old page.
// The pages are driven with real keys and clicks; the UI is found by role and accessible name, the board by what Penpa+
// would save (`readEngineState`, defined by recorder.js).
import assert from 'node:assert/strict'
import { after, before, beforeEach, describe, it } from 'node:test'
import {
  AKARI_SOLVE, ANSWER_CELL, DESK_SIZE, board, makeNumberSolveLink, openPenpa, openSolvePage, typeDigitInPage, typedDigits, useBrowser, waitForDesk
} from './page.mjs'
import { clickCell } from './replay.mjs'
import { settle } from './settle.mjs'

const browser = useBrowser()

const DIALOG_NAME = 'Test dialog'

// Index in `pu.centerlist` of a cell clear of the board's edges.
const CELL = 12
const OTHER_CELL = 13

const openSolve = (query = AKARI_SOLVE) => openSolvePage(browser(), query)

// Puts Penpa+ in `mode`, as a click on a mode button would.
const setMode = (page, mode) => page.evaluate((m) => pu.mode_set(m), mode)

const selected = async (page) => (await board(page)).selection.length

// Runs in the page. Adds a Web Awesome dialog holding a menu, a text field and a select to the UI, closed.
function addDialogInPage (label) {
  document.querySelector('.ui-root').insertAdjacentHTML('beforeend', `
    <wa-dialog label="${label}">
      <wa-dropdown><wa-button slot="trigger">Menu</wa-button><wa-dropdown-item value="a">Choice A</wa-dropdown-item></wa-dropdown>
      <wa-input label="Dialog text"></wa-input>
    </wa-dialog>`)
}

// Runs in the page. Adds a text field, a Web Awesome select and a native select to the UI, outside any dialog.
function addFieldsInPage () {
  document.querySelector('.ui-root').insertAdjacentHTML('beforeend', `
    <div style="position:absolute;right:0;bottom:0;z-index:2000;background:#fff">
      <wa-input label="Search tools"></wa-input>
      <wa-select label="Pick one"><wa-option value="1">One</wa-option><wa-option value="2">Two</wa-option></wa-select>
      <select aria-label="Native pick"><option>One</option><option>Two</option></select>
    </div>`)
}

// Runs in the page. Records `defaultPrevented` of each keydown after every other handler has run.
function recordPreventionInPage () {
  window.preventedKeys = {}
  window.addEventListener('keydown', (e) => { window.preventedKeys[`${e.ctrlKey ? 'Ctrl+' : ''}${e.altKey ? 'Alt+' : ''}${e.key}`] = e.defaultPrevented })
}

describe('browser keys', () => {
  for (const mode of ['sudoku', 'line']) {
    it(`F5 and Alt+Left are not prevented in ${mode} mode`, async () => {
      const { context, page } = await openSolve()
      try {
        await setMode(page, mode)
        await page.evaluate(recordPreventionInPage)
        await page.keyboard.press('F5')
        await page.keyboard.press('Alt+ArrowLeft')
        const prevented = await page.evaluate(() => window.preventedKeys)
        assert.deepEqual([prevented.F5, prevented['Alt+ArrowLeft']], [false, false])
      } finally {
        await context.close()
      }
    })
  }

  it('Ctrl+D, Ctrl+digit, PageDown, Home and a bare Alt are not prevented', async () => {
    const { context, page } = await openSolve()
    try {
      await setMode(page, 'sudoku')
      await clickCell(page, CELL)
      const before = await board(page)
      await page.evaluate(recordPreventionInPage)
      const keys = ['Ctrl+d', 'Ctrl+1', 'Ctrl+9', 'PageDown', 'Home', 'F1', 'F11', 'F12', 'Alt+Alt']
      for (const key of keys) {
        await page.keyboard.press(key.replace('Ctrl', 'Control').replace('Alt+Alt', 'Alt'))
      }
      const prevented = await page.evaluate((names) => names.filter((k) => window.preventedKeys[k] !== false), keys)
      assert.deepEqual(prevented, [], 'each key was seen and left alone')
      assert.deepEqual(await board(page), before, 'none of them touched the board')
    } finally {
      await context.close()
    }
  })

  it('F2 and F3 do not open Penpa+\'s setter-mode question', async () => {
    const { context, page } = await openSolve()
    try {
      await page.keyboard.press('F2')
      await page.keyboard.press('F3')
      assert.equal(await page.evaluate(() => engine.getState().penpaDialogOpen), false)
    } finally {
      await context.close()
    }
  })
})

describe('typing in a field', () => {
  let opened
  before(async () => {
    opened = await openSolve()
    await opened.page.evaluate(addFieldsInPage)
  })
  after(async () => { await opened?.context.close() })
  beforeEach(async () => {
    await setMode(opened.page, 'number')
    await clickCell(opened.page, CELL)
  })

  const fields = [
    { name: 'a text field', focus: (page) => page.getByRole('textbox', { name: 'Search tools' }).click() },
    { name: 'a Web Awesome select', focus: (page) => page.getByRole('combobox', { name: 'Pick one' }).focus() },
    { name: 'a native select', focus: (page) => page.getByRole('combobox', { name: 'Native pick' }).focus() }
  ]
  for (const { name, focus } of fields) {
    it(`does not change the board: ${name}`, async () => {
      const { page } = opened
      const before = await board(page)
      assert.equal(before.selection.length, 1, 'a cell is selected, so a digit would be entered')
      await focus(page)
      await page.keyboard.press('7')
      await page.keyboard.press('ArrowRight')
      await page.keyboard.press('Backspace')
      assert.deepEqual(await board(page), before)
    })
  }
})

describe('Escape', () => {
  it('closes a menu first, then the dialog, then clears the selection', async () => {
    const { context, page } = await openSolve()
    try {
      await setMode(page, 'number')
      await clickCell(page, CELL)
      assert.equal(await selected(page), 1)
      await page.evaluate(addDialogInPage, DIALOG_NAME)
      await page.evaluate((label) => { document.querySelector(`wa-dialog[label="${label}"]`).open = true }, DIALOG_NAME)
      const dialog = page.getByRole('dialog', { name: DIALOG_NAME })
      await dialog.waitFor()
      await page.getByRole('button', { name: 'Menu' }).click()
      const menu = page.getByRole('menu')
      await menu.waitFor()

      await page.keyboard.press('Escape')
      await menu.waitFor({ state: 'hidden' })
      assert.equal(await dialog.isVisible(), true, 'the dialog is still open')
      assert.equal(await selected(page), 1, 'the selection stays')

      await page.keyboard.press('Escape')
      await dialog.waitFor({ state: 'hidden' })
      assert.equal(await selected(page), 1, 'the selection stays')

      await page.keyboard.press('Escape')
      assert.equal(await settle(() => selected(page), 0), 0, 'with nothing else open Escape reaches Penpa+')
    } finally {
      await context.close()
    }
  })
})

describe('the solved dialog', () => {
  it('is the desk\'s own, not a Penpa+ popup, and a digit typed while it is open does not change the board', async () => {
    const link = await makeNumberSolveLink(browser())
    const { context, page } = await openSolve(link)
    try {
      // The author's answer is a 2 in the cell at ANSWER_CELL of the center list.
      await page.evaluate(typeDigitInPage, { index: ANSWER_CELL, digit: '2' })
      await page.getByRole('dialog', { name: 'Puzzle solved' }).waitFor()
      assert.equal(await page.evaluate(() => engine.getState().penpaDialogOpen), false, 'no Penpa+ popup')
      const before = await board(page)
      await page.keyboard.press('5')
      await page.keyboard.press('Backspace')
      assert.deepEqual(await board(page), before)
    } finally {
      await context.close()
    }
  })
})

describe('Penpa+\'s own modal dialogs', () => {
  it('block the board\'s keys while one is open, and stop blocking when it closes', async () => {
    const { context, page } = await openSolve()
    try {
      await setMode(page, 'number')
      await clickCell(page, CELL)
      const before = await board(page)
      assert.equal(before.selection.length, 1, 'a cell is selected, so a digit would be entered')
      const showModal = (display) => page.evaluate((d) => { document.querySelector('.modal').style.display = d }, display)
      await showModal('block')
      assert.equal(await settle(() => page.evaluate(() => engine.getState().penpaDialogOpen), true), true)
      await page.keyboard.press('5')
      assert.deepEqual(await board(page), before)
      await showModal('none')
      assert.equal(await settle(() => page.evaluate(() => engine.getState().penpaDialogOpen), false), false)
      await page.keyboard.press('5')
      assert.deepEqual(await typedDigits(page), ['5'])
    } finally {
      await context.close()
    }
  })
})

describe('?', () => {
  for (const mode of ['number', 'surface']) {
    it(`changes nothing in ${mode} mode`, async () => {
      const { context, page } = await openSolve()
      try {
        await setMode(page, mode)
        await clickCell(page, CELL)
        const before = await board(page)
        await page.keyboard.press('?')
        assert.deepEqual(await board(page), before)
        assert.equal(await page.evaluate(() => engine.getState().penpaDialogOpen), false, 'no shortcuts sheet opens')
      } finally {
        await context.close()
      }
    })
  }
})

describe('focus returns to the board', () => {
  it('after a board click', async () => {
    const { context, page } = await openSolve()
    try {
      await setMode(page, 'number')
      await page.evaluate(addFieldsInPage)
      await page.getByRole('combobox', { name: 'Native pick' }).focus()
      await clickCell(page, OTHER_CELL)
      await page.keyboard.press('4')
      assert.deepEqual(await typedDigits(page), ['4'])
    } finally {
      await context.close()
    }
  })

  it('after a dialog closes', async () => {
    const { context, page } = await openSolve()
    try {
      await setMode(page, 'number')
      await page.evaluate(addFieldsInPage)
      await page.evaluate(addDialogInPage, DIALOG_NAME)
      await clickCell(page, CELL)
      await page.getByRole('combobox', { name: 'Native pick' }).focus()
      await page.evaluate((label) => { document.querySelector(`wa-dialog[label="${label}"]`).open = true }, DIALOG_NAME)
      const dialog = page.getByRole('dialog', { name: DIALOG_NAME })
      await dialog.waitFor()
      await page.keyboard.press('Escape')
      await dialog.waitFor({ state: 'hidden' })
      // The UI blurs the control Web Awesome handed focus back to in a later timeout, so a key pressed at once can land first.
      assert.equal(await settle(() => page.evaluate(() => document.activeElement === document.body), true), true)
      await page.keyboard.press('6')
      assert.deepEqual(await typedDigits(page), ['6'])
    } finally {
      await context.close()
    }
  })

  it('after a menu choice', async () => {
    const { context, page } = await openSolve()
    try {
      await setMode(page, 'number')
      await page.evaluate(addDialogInPage, DIALOG_NAME)
      // The menu sits in the UI itself here, outside the dialog.
      await page.evaluate(() => {
        const menu = document.querySelector('wa-dialog wa-dropdown')
        const holder = document.createElement('div')
        holder.style.cssText = 'position:absolute;right:0;bottom:0;z-index:2000'
        holder.append(menu)
        document.querySelector('.ui-root').append(holder)
      })
      await clickCell(page, CELL)
      await page.getByRole('button', { name: 'Menu' }).click()
      await page.getByRole('menuitem', { name: 'Choice A' }).click()
      await settle(() => page.evaluate(() => document.querySelector('wa-dropdown').open), false)
      await page.keyboard.press('8')
      assert.deepEqual(await typedDigits(page), ['8'])
    } finally {
      await context.close()
    }
  })
})

describe('content keys', () => {
  // The same keys on both pages, from the same board: what the old page does is the reference.
  const KEYS = ['5', 'ArrowRight', '7', 'Backspace', 'ArrowDown', '3', 'Delete', 'ArrowLeft', ' ', 'ArrowUp', '1']
  for (const mode of ['number', 'sudoku']) {
    it(`do on solve.html what they do on the old page: ${mode} mode`, async () => {
      const runs = []
      for (const solve of [false, true]) {
        const { context, page } = await openPenpa(browser(), AKARI_SOLVE, { solve, contextOptions: DESK_SIZE })
        try {
          if (solve) await waitForDesk(page)
          await setMode(page, mode)
          await page.evaluate((i) => { pu.selection = [pu.centerlist[i]]; pu.cursol = pu.centerlist[i] }, CELL)
          for (const key of KEYS) await page.keyboard.press(key)
          runs.push(await board(page))
        } finally {
          await context.close()
        }
      }
      assert.deepEqual(runs[1], runs[0])
      assert.notEqual(JSON.stringify(runs[0].entered.number ?? runs[0].entered), '{}', 'the keys entered something')
    })
  }
})
