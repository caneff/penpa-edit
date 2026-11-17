// The tool in use, and a Restart, survive a reload of solve.html whatever the timing of Penpa+'s unload save (#263). Penpa+'s own
// save as the page unloads is not awaited, so it is switched off here: only the progress autosave can have stored the change.
import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { makeNumberSolveLink, openSolvePage, setTool, typedDigits, useBrowser, waitForDesk, waitForTool } from './page.mjs'
import { clickCell } from './replay.mjs'
import { settle } from './settle.mjs'

const browser = useBrowser()

const NUMBER_TOOL = { mode: 'number', submode: '1' }
// Index in `pu.centerlist` of a cell clear of the board's edges.
const FREE_CELL = 12

// Each change goes through a different tool trigger of the autosave: `mode_set` with `submode_check`, `mode_set` alone,
// `submode_check` alone, `subsymbolmode` and `stylemode_check`.
const TOOL_CHANGES = [
  ['a mode and its sub-mode', NUMBER_TOOL, { mode: 'line', submode: '3' }],
  ['a mode with no sub-mode', NUMBER_TOOL, { mode: 'multicolor', submode: null }],
  ['a sub-mode of the same mode', NUMBER_TOOL, { mode: 'number', submode: '10' }],
  ['a symbol shape', { mode: 'symbol', submode: 'circle_L' }, { mode: 'symbol', submode: 'circle_M' }],
  ['a style of the same tool', { ...NUMBER_TOOL, style: 1 }, { ...NUMBER_TOOL, style: 2 }]
]

// Opens solve.html on `link` with the unload save switched off, after `before` was chosen and saved.
async function openWithUnloadSaveOff (link, before) {
  const opened = await openSolvePage(browser(), link)
  await setTool(opened.page, before)
  await settle(() => opened.page.evaluate(() => engine.saveProgress()), true)
  await opened.page.evaluate(() => { PenpaProgress.save = async () => {} })
  return opened
}

describe('the tool across a reload', () => {
  for (const [what, before, after] of TOOL_CHANGES) {
    it(`keeps ${what} changed last when the unload save is held back`, async () => {
      const link = await makeNumberSolveLink(browser())
      const { context, page } = await openWithUnloadSaveOff(link, before)
      try {
        const saved = await page.evaluate(() => engine.getTool())
        await setTool(page, after)
        const want = await page.evaluate(() => engine.getTool())
        assert.notDeepEqual(want, saved, 'the tool changed')

        await page.reload()
        await waitForDesk(page)
        await waitForTool(page, { mode: want.mode, submode: want.submode }, 'the tool is the one chosen last after the reload')
        assert.equal((await page.evaluate(() => engine.getTool())).style, want.style, 'its style is kept')
      } finally {
        await context.close()
      }
    })
  }
})

describe('a Restart across a reload', () => {
  it('stays restarted when the unload save is held back', async () => {
    const link = await makeNumberSolveLink(browser())
    const { context, page } = await openWithUnloadSaveOff(link, NUMBER_TOOL)
    try {
      await clickCell(page, FREE_CELL)
      await page.keyboard.press('7')
      assert.deepEqual(await settle(() => typedDigits(page), ['7']), ['7'], 'a digit is on the board before the Restart')
      await page.evaluate(() => engine.restart())

      await page.reload()
      await waitForDesk(page)
      assert.deepEqual(await settle(() => typedDigits(page), []), [], 'the digit is not back after the reload')
    } finally {
      await context.close()
    }
  })
})
