// The recorder (`docs/js/recorder.js`) on a live page: with `?record=1` it writes a solver's real clicks, keys, mode
// changes, undo and redo as steps and downloads them; without the flag it does nothing.
import assert from 'node:assert/strict'
import { before, describe, it } from 'node:test'
import { openPenpa, useBrowser } from './page.mjs'
import { clickCell, downloadRecording, makeSurfaceSolveLink, openRecordingPage } from './replay.mjs'

const browser = useBrowser()

// Indices in `pu.centerlist` of the cells the test clicks.
const LEFT_CELL = 5
const RIGHT_CELL = 6
const NUMBER_CELL = 10

describe('the recorder', () => {
  let query
  before(async () => { query = await makeSurfaceSolveLink(browser()) })

  it('writes the solver\'s clicks, keys, mode changes, undo and redo as steps and downloads them', async () => {
    const { context, page } = await openRecordingPage(browser(), query)
    try {
      const cells = await page.evaluate((list) => list.map((i) => pu.centerlist[i]), [LEFT_CELL, RIGHT_CELL, NUMBER_CELL])
      await page.click('#mo_surface_lb')
      await clickCell(page, LEFT_CELL)
      await clickCell(page, RIGHT_CELL, { button: 'right' })
      await page.keyboard.press('Control+z')
      await page.keyboard.press('Control+y')
      await page.click('#mo_number_lb')
      await clickCell(page, NUMBER_CELL)
      await page.keyboard.press('3')
      const { name, recording } = await downloadRecording(page)

      assert.equal(name, 'recording.steps.json')
      assert.deepEqual(recording.header, { source: query, gridtype: 'square', genre: [], recorder: 1 })
      assert.deepEqual(recording.final, await page.evaluate(() => readEngineState()), 'the final board is the page\'s state')
      const steps = recording.steps
      const moves = steps.filter((s) => s.kind === 'pointer' && s.action === 'move')
      assert.ok(moves.length > 0, 'hover moves are recorded')
      const pointer = (s) => ({ kind: s.kind, action: s.action, button: s.button, ctrl: s.ctrl, num: s.num })
      assert.deepEqual(steps.filter((s) => !(s.kind === 'pointer' && ['move', 'out'].includes(s.action)))
        .map((s) => s.kind === 'pointer' ? pointer(s) : s), [
        { kind: 'mode', mode: 'surface', submode: '', style: 1 },
        { kind: 'pointer', action: 'down', button: 'left', ctrl: false, num: cells[0] },
        { kind: 'pointer', action: 'up', button: null, ctrl: false, num: cells[0] },
        { kind: 'pointer', action: 'down', button: 'right', ctrl: false, num: cells[1] },
        { kind: 'pointer', action: 'up', button: null, ctrl: false, num: cells[1] },
        { kind: 'undo' },
        { kind: 'redo' },
        { kind: 'mode', mode: 'number', submode: '1', style: 2 },
        { kind: 'pointer', action: 'down', button: 'left', ctrl: false, num: cells[2] },
        { kind: 'pointer', action: 'up', button: null, ctrl: false, num: cells[2] },
        { kind: 'key', call: 'key_number', args: ['3'] }
      ])
      const down = steps.find((s) => s.kind === 'pointer' && s.action === 'down')
      const point = await page.evaluate((n) => [pu.point[n].x, pu.point[n].y], down.num)
      // The click lands on a whole page pixel, so its board position is within one unit of the cell's centre.
      assert.deepEqual([down.x, down.y].map((v, i) => Math.abs(v - point[i]) <= 1), [true, true],
        `a pointer step is in board units: ${[down.x, down.y]} near ${point}`)
    } finally {
      await context.close()
    }
  })

  // The tool lists are hidden until their dialog opens; `window_click` in `main.js` reads only the mousedown's target.
  it('writes a Shape or Composite tool choice and a number orientation as mode changes', async () => {
    const { context, page } = await openRecordingPage(browser(), query)
    try {
      await page.click('#mo_symbol_lb')
      await page.dispatchEvent('#ms_star', 'mousedown')
      await page.click('#mo_combi_lb')
      await page.dispatchEvent('#combisub_akari', 'mousedown')
      await page.click('#mo_number_lb')
      await page.click('#rot_D_lb')
      const steps = (await downloadRecording(page)).recording.steps
      assert.deepEqual(steps.filter((s) => s.kind === 'mode').map(({ mode, submode, orientation }) => [mode, submode, orientation]), [
        ['symbol', 'circle_L', undefined],
        ['symbol', 'star', undefined],
        ['combi', 'battleship', undefined],
        ['combi', 'akari', undefined],
        ['number', '1', 'R'],
        ['number', '1', 'D']
      ])
    } finally {
      await context.close()
    }
  })

  // `handle_rect_mousedown` starts a rectangle selection on Alt only in Sudoku, Number, Surface and Multicolor.
  it('refuses an Alt-click where it starts a rectangle selection and records it as a click elsewhere', async () => {
    const { context, page } = await openRecordingPage(browser(), query)
    try {
      await page.click('#mo_surface_lb')
      await page.keyboard.down('Alt')
      await clickCell(page, LEFT_CELL)
      await page.keyboard.up('Alt')
      await page.click('#mo_line_lb')
      await page.keyboard.down('Alt')
      await clickCell(page, RIGHT_CELL)
      await page.keyboard.up('Alt')
      const steps = (await downloadRecording(page)).recording.steps
      const downs = steps.filter((s) => s.kind === 'unsupported' || (s.kind === 'pointer' && s.action === 'down'))
      assert.deepEqual(downs.map((s) => s.kind === 'unsupported' ? s.kind : `${s.kind} ${s.action}`),
        ['unsupported', 'pointer down'])
    } finally {
      await context.close()
    }
  })

  it('records nothing while Penpa+ plays back its own replay', async () => {
    const { context, page } = await openRecordingPage(browser(), query)
    try {
      await page.evaluate(() => { pu.replay = true })
      await clickCell(page, LEFT_CELL)
      await page.evaluate(() => { pu.replay = false })
      // Moving off the board to the download button is an `out`, made after the replay ended.
      const steps = (await downloadRecording(page)).recording.steps
      assert.deepEqual(steps.filter((s) => s.action !== 'out'), [])
    } finally {
      await context.close()
    }
  })

  it('does nothing without the flag', async () => {
    const { context, page } = await openPenpa(browser(), query)
    try {
      await clickCell(page, LEFT_CELL)
      await page.keyboard.press('Control+z')
      assert.equal(await page.locator('#recorder_download').count(), 0, 'no download button')
      const hooked = await page.evaluate(() => ['mouseevent', 'undo', 'mode_set'].filter((m) => Object.hasOwn(pu, m)))
      assert.deepEqual(hooked, [], 'no engine method is wrapped')
    } finally {
      await context.close()
    }
  })
})
