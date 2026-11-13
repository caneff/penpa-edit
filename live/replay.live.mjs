// The engine driver (`live/replay.mjs`): a recording replays through `pu`'s own calls to the states it was recorded
// at, every checked-in recording still does, and a planted change in the Surface handler fails at the step it breaks.
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { before, describe, it } from 'node:test'
import { fileURLToPath } from 'node:url'
import { canonicalState, readEngineState } from './canonical-state.mjs'
import { openPenpa, useBrowser } from './page.mjs'
import {
  cellPixelInPage, downloadRecording, listRecordings, readExpected, readRecording, replay, surfaceSolveLinkInPage
} from './replay.mjs'
import { settle } from './settle.mjs'

const browser = useBrowser()

const CLASS_P = fileURLToPath(new URL('../docs/js/class_p.js', import.meta.url))
// The tracer recording.
const SURFACE_ID = 'paint/surface-shade-undo-redo'
// The colour argument of the `set_surface` call in `re_surface_twobutton` that a left click on an empty cell runs.
const SHADE_COLOR = /(re_surface_twobutton\(num\) \{[^}]*\} else \{\s*let cc = this\.get_surface_color\(color\);\s*this\.set_surface\(num, )color(, cc\);)/
const ids = await listRecordings()

async function clickCell (page, index, options) {
  const { x, y } = await page.evaluate(cellPixelInPage, index)
  await page.mouse.click(x, y, options)
}

describe('the engine driver', () => {
  it('replays a recorded solve to the state the recording page reached', async () => {
    const setup = await openPenpa(browser())
    let query
    try {
      query = await setup.page.evaluate(surfaceSolveLinkInPage)
    } finally {
      await setup.context.close()
    }
    const { context, page } = await openPenpa(browser(), '?record=1' + query)
    let recording, recorded
    try {
      await settle(() => page.evaluate(() => Boolean(pu.solution)), true)
      await page.click('#mo_surface_lb')
      await clickCell(page, 5)
      await clickCell(page, 6, { button: 'right' })
      await page.keyboard.down('Control')
      await clickCell(page, 9)
      await page.keyboard.up('Control')
      const from = await page.evaluate(cellPixelInPage, 0)
      const to = await page.evaluate(cellPixelInPage, 2)
      await page.mouse.move(from.x, from.y)
      await page.mouse.down()
      await page.mouse.move(to.x, to.y, { steps: 4 })
      await page.mouse.up()
      await page.keyboard.press('Control+z')
      await page.keyboard.press('Control+z')
      await page.keyboard.press('Control+y')
      recorded = await page.evaluate(readEngineState).then(canonicalState)
      recording = (await downloadRecording(page)).recording
    } finally {
      await context.close()
    }
    assert.match(recorded, /^pu_a\.surface\.\d+ = 1$/m, 'the recording page shaded a cell (the premise)')
    const { checkpoints, report } = await replay(browser(), recording)
    assert.equal(report, null)
    assert.equal(checkpoints.at(-1).state, recorded)
  })

  for (const id of ids) {
    it(`replays ${id} to its expected states`, async () => {
      const { report } = await replay(browser(), await readRecording(id), { id, expected: await readExpected(id) })
      assert.equal(report, null)
    })
  }

  describe('with a planted change in the Surface handler', () => {
    let planted
    before(async () => {
      const source = await readFile(CLASS_P, 'utf8')
      planted = source.replace(SHADE_COLOR, '$1color + 1$2')
      assert.notEqual(planted, source, 'the line to plant in is in class_p.js')
    })

    it('stops at the first step it breaks and reports it in words, with the state diff and the first replay write', async () => {
      const { report } = await replay(browser(), await readRecording(SURFACE_ID), {
        id: SURFACE_ID,
        expected: await readExpected(SURFACE_ID),
        served: true,
        setup: (context) => context.route(/\/js\/class_p\.js(\?|$)/, (route) => route.fulfill({
          contentType: 'text/javascript', body: planted
        }))
      })
      assert.notEqual(report, null, 'the planted change fails the replay')
      const lines = report.split('\n')
      assert.match(lines[0], new RegExp(`^${SURFACE_ID}: step \\d+ \\(up at point \\d+\\) differs from the recording$`))
      assert.match(lines[1], /^ {2}since the last checkpoint: (step \d+ move at point \d+; )*step \d+ left down at point \d+; step \d+ up at point \d+$/)
      assert.ok(lines.some((l) => /^ {2}pu_a\.surface\.\d+: 1 → 2$/.test(l)), `a semantic diff line:\n${report}`)
      assert.ok(lines.some((l) => /^First differing command_replay write: pu_a #0: expected .*"surface".* got .*"surface"/.test(l)),
        `the first differing replay write:\n${report}`)
      assert.ok(lines.includes('Page errors: none'), report)
    })
  })
})
