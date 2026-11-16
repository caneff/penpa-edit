// The top bar of `solve.html` (#94): undo, redo, Restart, Pause, the timer and the light/dark toggle. The UI is found by role
// and accessible name and the state by `engine.getState()`; what the solver has entered is read as Penpa would save it
// (`readEngineState`, defined by recorder.js); the keys and clicks are real.
import assert from 'node:assert/strict'
import { setTimeout as sleep } from 'node:timers/promises'
import { describe, it } from 'node:test'
import { makeNumberSolveLink, openPenpa, useBrowser } from './page.mjs'
import { settle } from './settle.mjs'

const browser = useBrowser()

const DESK_SIZE = { viewport: { width: 1400, height: 900 } }

// Index in `pu.centerlist` of a cell clear of the board's edges.
const CELL = 12

// How long a "the timer held" check watches a paused timer; a held clock cannot be waited for, only watched.
const HOLD_WATCH_MS = 1500

let numberLink
async function openSolve () {
  numberLink ??= await makeNumberSolveLink(browser())
  const opened = await openPenpa(browser(), numberLink, { solve: true, contextOptions: DESK_SIZE })
  await opened.page.getByRole('region', { name: 'Board' }).waitFor()
  await opened.page.evaluate(() => engine.ready)
  // The Number tool takes a digit in a selected cell.
  await opened.page.evaluate(() => engine.setTool({ mode: 'number', submode: '1' }))
  return opened
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

// The digits the solver has entered, in cell order.
const typedDigits = (page) => page.evaluate(() => Object.values(readEngineState().pu_a.number ?? {}).map(([digit]) => digit))

const canUndo = (page) => page.evaluate(() => engine.getState().canUndo)
const canRedo = (page) => page.evaluate(() => engine.getState().canRedo)
const timer = (page) => page.evaluate(() => engine.getTimer())

const button = (page, name) => page.getByRole('button', { name, exact: true })
const timerText = (page) => page.getByRole('timer').textContent()
const boardCard = (page) => page.getByRole('region', { name: 'Board' })
// The drawn board alone, not the card's title bar, whose buttons show the pointer's hover. Without animations, so the
// tool-name flash that follows a tool change is not in the picture.
const boardPicture = (page) => boardCard(page).locator('canvas:visible').screenshot({ animations: 'disabled' })

// Waits for the button to be (or not be) disabled: the bar follows the engine on the next frame.
async function assertDisabled (page, name, expected, message) {
  assert.equal(await settle(() => button(page, name).isDisabled(), expected), expected, message)
}

async function enterDigit (page, digit = '1') {
  await clickCell(page, CELL)
  await page.keyboard.press(digit)
  assert.deepEqual(await settle(() => typedDigits(page), [digit]), [digit], 'the digit is on the board')
}

describe('undo and redo', () => {
  it('Undo is disabled on a fresh puzzle, enabled after an entry, and Undo and Redo change the board', async () => {
    const { context, page } = await openSolve()
    try {
      await assertDisabled(page, 'Undo', true, 'undo on a fresh puzzle')
      await assertDisabled(page, 'Redo', true, 'redo on a fresh puzzle')
      await enterDigit(page)
      await assertDisabled(page, 'Undo', false, 'undo after an entry')

      await button(page, 'Undo').click()
      assert.deepEqual(await settle(() => typedDigits(page), []), [], 'undo removes the entry')
      assert.equal(await settle(() => canUndo(page), false), false)
      assert.equal(await settle(() => canRedo(page), true), true)
      await assertDisabled(page, 'Redo', false, 'redo after an undo')

      await button(page, 'Redo').click()
      assert.deepEqual(await settle(() => typedDigits(page), ['1']), ['1'], 'redo brings the entry back')
      assert.equal(await settle(() => canRedo(page), false), false)
    } finally {
      await context.close()
    }
  })
})

describe('Restart', () => {
  it('after confirming keeps the givens, clears the entries, disables undo and resets the timer', async () => {
    const fresh = await openSolve()
    const freshBoard = await boardPicture(fresh.page)
    await fresh.context.close()
    const { context, page } = await openSolve()
    try {
      await enterDigit(page)
      await page.waitForFunction(() => engine.getTimer().seconds >= 1)
      await button(page, 'Restart').click()
      await button(page, 'Restart puzzle').click()

      assert.deepEqual(await settle(() => typedDigits(page), []), [], 'the entries are gone')
      assert.equal(await settle(() => canUndo(page), false), false, 'the undo history is gone')
      await assertDisabled(page, 'Undo', true, 'and the button says so')
      const { seconds, paused } = await timer(page)
      assert.equal(seconds < 1, true, `the timer restarted from zero, got ${seconds}`)
      assert.equal(paused, false, 'and runs')
      assert.deepEqual(await boardPicture(page), freshBoard, 'the board looks as a fresh one: the givens stayed')
    } finally {
      await context.close()
    }
  })

  it('after cancelling changes nothing', async () => {
    const { context, page } = await openSolve()
    try {
      await enterDigit(page)
      await button(page, 'Restart').click()
      const dialog = page.getByRole('dialog', { name: 'Restart the puzzle?' })
      await button(page, 'Cancel').click()
      await dialog.waitFor({ state: 'hidden' })
      assert.deepEqual(await typedDigits(page), ['1'])
      assert.equal(await canUndo(page), true)
      assert.equal((await timer(page)).seconds >= 0, true)
    } finally {
      await context.close()
    }
  })
})

describe('Pause', () => {
  it('covers the board; a click and a digit change nothing; F4 resumes', async () => {
    const { context, page } = await openSolve()
    try {
      // A cell selected before the pause is where a digit would go.
      await clickCell(page, CELL)
      assert.equal(await page.evaluate(() => readEngineState().selection.length), 1)
      await button(page, 'Pause').click()
      const covered = page.getByRole('region', { name: 'Paused' })
      await covered.waitFor()
      assert.equal((await timer(page)).paused, true)

      await page.keyboard.press('1')
      await clickCell(page, CELL + 1)
      assert.deepEqual(await typedDigits(page), [], 'nothing was entered')
      assert.equal(await page.evaluate(() => readEngineState().selection.length), 1, 'and the click moved no selection')

      await page.keyboard.press('F4')
      await covered.waitFor({ state: 'hidden' })
      assert.equal((await timer(page)).paused, false)
      await page.keyboard.press('1')
      assert.deepEqual(await settle(() => typedDigits(page), ['1']), ['1'], 'after F4 the board takes the digit')
    } finally {
      await context.close()
    }
  })

  it('the pause button resumes too', async () => {
    const { context, page } = await openSolve()
    try {
      await button(page, 'Pause').click()
      await page.getByRole('region', { name: 'Paused' }).waitFor()
      await button(page, 'Resume').click()
      await page.getByRole('region', { name: 'Paused' }).waitFor({ state: 'hidden' })
      assert.equal((await timer(page)).paused, false)
    } finally {
      await context.close()
    }
  })
})

describe('the timer', () => {
  it('advances while running and holds while paused', async () => {
    const { context, page } = await openSolve()
    try {
      assert.notEqual(await settle(() => timerText(page), '00:01'), '00:00', 'the shown time advanced')
      assert.equal((await timer(page)).seconds >= 1, true, 'and so did the engine\'s')

      await button(page, 'Pause').click()
      await page.getByRole('region', { name: 'Paused' }).waitFor()
      const held = await timer(page)
      const heldText = await timerText(page)
      // A "nothing happened in N ms" check.
      await sleep(HOLD_WATCH_MS)
      assert.deepEqual(await timer(page), held)
      assert.equal(await timerText(page), heldText)
    } finally {
      await context.close()
    }
  })
})

describe('light and dark', () => {
  it('toggles the page and the board', async () => {
    const { context, page } = await openSolve()
    try {
      const desk = page.locator('.ui-desk')
      const ground = () => desk.evaluate((node) => getComputedStyle(node).backgroundColor)
      const light = await ground()
      assert.equal(await page.evaluate(() => engine.getSettings().theme), 'light')

      await button(page, 'Dark theme').click()
      assert.equal(await settle(() => page.evaluate(() => engine.getSettings().theme), 'dark'), 'dark', 'the board is in the dark theme')
      assert.notEqual(await ground(), light, 'the page changed')

      await button(page, 'Light theme').click()
      assert.equal(await settle(() => page.evaluate(() => engine.getSettings().theme), 'light'), 'light')
      assert.equal(await ground(), light, 'and back')
    } finally {
      await context.close()
    }
  })
})
