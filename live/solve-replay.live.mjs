// The UI driver on `solve.html` (#102): a recording replays on the solve page through real mouse and keyboard, mode
// changes through the Mode card (the recordings do, in `live/ui-replay-<k>.live.mjs`), and a planted wrong tool in
// the Mode card fails it. The solve page is checked against the engine driver on Penpa+'s page, so a difference is the
// new page's.
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { describe, it } from 'node:test'
import { fileURLToPath } from 'node:url'
import { useBrowser } from './page.mjs'
import { compareDrivers, readRecording } from './replay.mjs'

const browser = useBrowser()

const TOOL_CARDS = fileURLToPath(new URL('../docs/ui/tool-cards.js', import.meta.url))
// The line of the Mode card that applies the tool a pick chose.
const APPLY_PICK = /applyTool\(\{ mode: entry\.tool\.mode, submode: entry\.tool\.submode \}\)/
// A recording that picks Sudoku's first sub-mode and then enters digits.
const SUDOKU_ID = 'value/audit-c7-alphabet-digit'

describe('the UI driver on solve.html', () => {
  describe('with a planted wrong tool in the Mode card', () => {
    it('fails the replay: a pick that switches to Sudoku\'s second sub-mode', async () => {
      const source = await readFile(TOOL_CARDS, 'utf8')
      const planted = source.replace(APPLY_PICK, "applyTool({ mode: entry.tool.mode, submode: entry.tool.submode === '1' ? '2' : entry.tool.submode })")
      assert.notEqual(planted, source, 'the line to plant in is in tool-cards.js')
      await assert.rejects(
        compareDrivers(browser(), await readRecording(SUDOKU_ID), {
          id: SUDOKU_ID,
          solve: true,
          served: true,
          setup: (context) => context.route(/\/ui\/tool-cards\.js(\?|$)/, (route) => route.fulfill({ contentType: 'text/javascript', body: planted }))
        }),
        /sudoku has no sub-mode 1 and style 9 to switch to/
      )
    })
  })
})
