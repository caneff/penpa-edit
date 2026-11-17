// The solved state on `solve.html` (#198): the solved message is the desk's own dialog and shows once; the clock stops at
// the first solve and never runs again; a reload of a solved puzzle opens calm; a paused board disables what changes it.
// The UI is read by role and accessible name; the clock and the entries through `engine`.
import assert from 'node:assert/strict'
import { setTimeout as sleep } from 'node:timers/promises'
import { describe, it } from 'node:test'
import { ANSWER_CELL, makeNumberSolveLink, openSolvePage, setTool, typedDigits, useBrowser, waitForTool } from './page.mjs'
import { clickCell } from './replay.mjs'
import { settle } from './settle.mjs'

const browser = useBrowser()

// How long a "the clock held" check watches a stopped clock; a held clock cannot be waited for, only watched.
const HOLD_WATCH_MS = 1500
// Index in `pu.centerlist` of a cell clear of the board's edges.
const FREE_CELL = 12

let numberLink
async function openSolve () {
  numberLink ??= await makeNumberSolveLink(browser())
  const opened = await openSolvePage(browser(), numberLink)
  await setTool(opened.page, { mode: 'number', submode: '1' })
  return opened
}

const timer = (page) => page.evaluate(() => engine.getTimer())
const clockText = (page) => page.getByRole('timer').textContent()
const button = (page, name) => page.getByRole('button', { name, exact: true })
// True when the card's body is switched off (inert) by a pause.
const cardIsInert = (page, card) => page.getByRole('region', { name: card }).evaluate((node) => node.querySelector('.ui-body').closest('[inert]') !== null)
const solvedDialog = (page) => page.getByRole('dialog', { name: 'Puzzle solved' })
// Penpa+'s popup is SweetAlert2's container.
const swalCount = (page) => page.locator('.swal2-container').count()

// Counts every time the solved dialog opens, from now on.
const countSolvedDialogs = (page) => page.evaluate(() => {
  window.solvedDialogsShown = 0
  document.addEventListener('wa-show', (e) => {
    if (e.target.matches('wa-dialog') && e.target.getAttribute('label') === 'Puzzle solved') window.solvedDialogsShown++
  })
})
const solvedDialogsShown = (page) => page.evaluate(() => window.solvedDialogsShown)

async function enterAnswer (page) {
  await clickCell(page, ANSWER_CELL)
  await page.keyboard.press('2')
}

// Solves, closes the solved dialog, and returns the clock as it stopped.
async function solve (page) {
  await enterAnswer(page)
  await solvedDialog(page).waitFor()
  await button(page, 'Close').first().click()
  await solvedDialog(page).waitFor({ state: 'hidden' })
  assert.equal(await settle(async () => (await timer(page)).paused, true), true, 'the solve stopped the clock')
  return timer(page)
}

describe('the solved message', () => {
  it('is the desk\'s own dialog, with no SweetAlert2 popup', async () => {
    const { context, page } = await openSolve()
    try {
      await enterAnswer(page)
      await solvedDialog(page).waitFor()
      assert.notEqual((await page.locator('.ui-solved-message').textContent()).trim(), '', 'the dialog says something')
      assert.equal(await swalCount(page), 0, 'no Swal element')
      await button(page, 'Close').first().click()
      await solvedDialog(page).waitFor({ state: 'hidden' })
      assert.equal(await swalCount(page), 0, 'and none after it closes')
    } finally {
      await context.close()
    }
  })

  it('shows once: an undo and a redo back into the solved state show nothing more, and the clock stays stopped', async () => {
    const { context, page } = await openSolve()
    try {
      await countSolvedDialogs(page)
      const stopped = await solve(page)
      await button(page, 'Undo').click()
      assert.deepEqual(await settle(() => typedDigits(page), []), [], 'the undo took the answer out')
      await button(page, 'Redo').click()
      assert.deepEqual(await settle(() => typedDigits(page), ['2']), ['2'], 'the redo put it back')
      await sleep(HOLD_WATCH_MS)
      assert.equal(await solvedDialog(page).isVisible(), false, 'no second dialog')
      assert.equal(await solvedDialogsShown(page), 1, 'one dialog in total')
      assert.deepEqual(await timer(page), stopped, 'the clock never moved')
    } finally {
      await context.close()
    }
  })

  it('shows the timer as solved once the message is closed', async () => {
    const { context, page } = await openSolve()
    try {
      assert.doesNotMatch(await clockText(page), /✓/, 'a running clock has no check mark')
      await solve(page)
      assert.match(await clockText(page), /✓/, 'the solved clock has one')
    } finally {
      await context.close()
    }
  })
})

describe('the clock after a solve', () => {
  it('cannot be paused: Pause is disabled and a forced press covers nothing', async () => {
    const { context, page } = await openSolve()
    try {
      const stopped = await solve(page)
      assert.equal(await settle(() => button(page, 'Pause').isDisabled(), true), true, 'Pause is disabled')
      await button(page, 'Pause').click({ force: true })
      assert.equal(await page.evaluate(() => { engine.pauseTimer(); return engine.getTimer().covered }), false, 'engine.pauseTimer covers nothing either')
      await sleep(HOLD_WATCH_MS)
      assert.equal(await page.getByRole('region', { name: 'Paused' }).isVisible(), false, 'no cover')
      assert.deepEqual(await timer(page), stopped, 'the clock did not run')
    } finally {
      await context.close()
    }
  })

  it('stays stopped through F4, which resumes a stopped clock and so does nothing', async () => {
    const { context, page } = await openSolve()
    try {
      const stopped = await solve(page)
      await page.keyboard.press('F4')
      await page.keyboard.press('F4')
      await sleep(HOLD_WATCH_MS)
      assert.deepEqual(await timer(page), stopped)
      assert.equal(await page.getByRole('region', { name: 'Paused' }).isVisible(), false)
    } finally {
      await context.close()
    }
  })

  it('runs again after Restart', async () => {
    const { context, page } = await openSolve()
    try {
      await solve(page)
      await button(page, 'Restart').click()
      await button(page, 'Restart puzzle').click()
      assert.equal(await settle(async () => (await timer(page)).paused, false), false, 'the restart started the clock')
      assert.equal(await button(page, 'Pause').isDisabled(), false, 'and Pause works again')
      assert.doesNotMatch(await clockText(page), /✓/)
    } finally {
      await context.close()
    }
  })
})

describe('a solved puzzle reloaded', () => {
  it('opens with the board visible, the clock stopped at its solve time and no popup', async () => {
    const { context, page } = await openSolve()
    try {
      await page.waitForFunction(() => engine.getTimer().seconds >= 1)
      const stopped = await solve(page)
      // Penpa+ saves on unload without waiting for the write, so the reload would race it.
      assert.equal(await page.evaluate(() => engine.saveProgress()), true, 'the progress is saved')
      await page.reload()
      await page.getByRole('region', { name: 'Board' }).waitFor()
      await page.evaluate(() => engine.ready)
      await sleep(HOLD_WATCH_MS)
      assert.equal(await swalCount(page), 0, 'no Swal element')
      assert.equal(await solvedDialog(page).isVisible(), false, 'no dialog')
      const after = await timer(page)
      assert.equal(after.paused, true, 'the clock is stopped')
      assert.equal(after.covered, false, 'the board is not covered')
      assert.equal(await page.getByRole('region', { name: 'Paused' }).isVisible(), false, 'no pause cover')
      assert.equal(Math.floor(after.seconds), Math.floor(stopped.seconds), 'at its solve time')
      assert.match(await clockText(page), /✓/, 'and looks solved')
      await sleep(HOLD_WATCH_MS)
      assert.deepEqual(await timer(page), after, 'it holds')
    } finally {
      await context.close()
    }
  })
})

describe('a solved puzzle that was undone and reloaded', () => {
  it('keeps the clock stopped and shows no dialog when it is solved again', async () => {
    const { context, page } = await openSolve()
    try {
      await page.waitForFunction(() => engine.getTimer().seconds >= 1)
      const stopped = await solve(page)
      await button(page, 'Undo').click()
      assert.deepEqual(await settle(() => typedDigits(page), []), [], 'the undo took the answer out')
      // Penpa+ saves on unload without waiting for the write, so the reload would race it.
      assert.equal(await page.evaluate(() => engine.saveProgress()), true, 'the progress is saved')
      await page.reload()
      await page.getByRole('region', { name: 'Board' }).waitFor()
      await page.evaluate(() => engine.ready)
      await countSolvedDialogs(page)
      const after = await timer(page)
      assert.equal(after.paused, true, 'the clock is stopped')
      assert.equal(Math.floor(after.seconds), Math.floor(stopped.seconds), 'at the first solve time')
      await setTool(page, { mode: 'number', submode: '1' })
      await waitForTool(page, { mode: 'number', submode: '1' })
      await enterAnswer(page)
      assert.deepEqual(await settle(() => typedDigits(page), ['2']), ['2'], 'solved again')
      await sleep(HOLD_WATCH_MS)
      assert.equal(await solvedDialogsShown(page), 0, 'no dialog')
      assert.deepEqual(await timer(page), after, 'the clock held')
    } finally {
      await context.close()
    }
  })
})

describe('a paused board', () => {
  it('disables Restart, the pins, Mode and Recent; the cover\'s Resume button resumes', async () => {
    const { context, page } = await openSolve()
    try {
      await clickCell(page, FREE_CELL)
      await button(page, 'Pause').click()
      const cover = page.getByRole('region', { name: 'Paused' })
      await cover.waitFor()
      assert.equal(await settle(() => button(page, 'Restart').isDisabled(), true), true, 'Restart is disabled')
      for (const card of ['Pinned', 'Mode', 'Recent']) {
        assert.equal(await cardIsInert(page, card), true, `${card} is disabled`)
      }
      assert.equal(await button(page, 'Open in Penpa+').isDisabled(), false, 'Open in Penpa+ works')
      await cover.getByRole('button', { name: 'Resume' }).click()
      await cover.waitFor({ state: 'hidden' })
      assert.equal((await timer(page)).paused, false, 'the clock runs')
      assert.equal(await button(page, 'Restart').isDisabled(), false, 'Restart works again')
      assert.equal(await cardIsInert(page, 'Mode'), false, 'and so does Mode')
    } finally {
      await context.close()
    }
  })
})
