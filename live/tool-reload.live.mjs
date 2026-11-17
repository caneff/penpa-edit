// The tool in use survives a reload of solve.html whatever the timing of Penpa+'s unload save (#263). Penpa+'s own save as the
// page unloads is not awaited, so it is switched off here: only the progress autosave can have stored the tool.
import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { makeNumberSolveLink, openSolvePage, setTool, useBrowser, waitForDesk, waitForTool } from './page.mjs'

const browser = useBrowser()

const LINE_TOOL = { mode: 'line', submode: '3' }
const NUMBER_TOOL = { mode: 'number', submode: '1' }

describe('the tool across a reload', () => {
  it('stays the tool picked last when the unload save is held back', async () => {
    const link = await makeNumberSolveLink(browser())
    const { context, page } = await openSolvePage(browser(), link)
    await setTool(page, NUMBER_TOOL)
    await page.evaluate(() => { PenpaProgress.save = async () => {} })
    await setTool(page, LINE_TOOL)
    await waitForTool(page, LINE_TOOL, 'the tool is Line before the reload')

    await page.reload()
    await waitForDesk(page)
    await waitForTool(page, LINE_TOOL, 'the tool is still Line after the reload')
    await context.close()
  })
})
