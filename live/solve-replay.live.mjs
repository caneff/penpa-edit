// The UI driver on `solve.html` (#102): every recording the UI driver replays on Penpa+'s page replays on the solve page
// through real mouse and keyboard, mode changes through the Mode card, and reaches the engine driver's states at every
// checkpoint. The solve page is checked against the engine driver on Penpa+'s page, so a difference is the new page's.
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { describe, it } from 'node:test'
import { fileURLToPath } from 'node:url'
import { useBrowser } from './page.mjs'
import { compareDrivers, listRecordings, readRecording } from './replay.mjs'

const browser = useBrowser()

const TOOL_CARDS = fileURLToPath(new URL('../docs/ui/tool-cards.js', import.meta.url))
// The line of the Mode card that applies the tool a pick chose.
const APPLY_PICK = /applyTool\(\{ mode: entry\.tool\.mode, submode: entry\.tool\.submode \}\);/
// A recording that picks Sudoku's first sub-mode and then enters digits.
const SUDOKU_ID = 'value/audit-c7-alphabet-digit'

// Recordings whose replay on solve.html fails on a bug of the page, with its ticket: a solved board is covered by the
// Paused cover and ignores input, so the click after the solve does nothing. Each stays red, marked `todo`, until its fix lands.
const TODO = {
  'paint/surface-shade-undo-redo': '#119',
  'value/audit-c14-small-sudoku-conflict': '#119'
}

const ids = await listRecordings()
// The generated corpus (a header `tier`) is left out here as it is for the UI driver on Penpa+'s page
// (`replay.live.mjs`; controller, 2026-11-13, #31).
const handMadeIds = []
for (const id of ids) if (!(await readRecording(id)).header.tier) handMadeIds.push(id)

describe('the UI driver on solve.html', () => {
  for (const id of handMadeIds) {
    it(`replays ${id} through the Mode card, mouse and keyboard to the engine driver's states`, { todo: TODO[id] }, async () => {
      assert.equal(await compareDrivers(browser(), await readRecording(id), { id, solve: true }), null)
    })
  }

  describe('with a planted wrong tool in the Mode card', () => {
    it('fails the replay: a pick that switches to Sudoku\'s second sub-mode', async () => {
      const source = await readFile(TOOL_CARDS, 'utf8')
      const planted = source.replace(APPLY_PICK, "applyTool({ mode: entry.tool.mode, submode: entry.tool.submode === '1' ? '2' : entry.tool.submode });")
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
