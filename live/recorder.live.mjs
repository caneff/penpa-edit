// The recorder (`docs/js/recorder.js`) on a live page: with `?record=1` it writes a solver's real clicks, keys, mode
// changes, undo and redo as steps and downloads them; without the flag it does nothing.
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { before, describe, it } from 'node:test'
import { openPenpa, useBrowser } from './page.mjs'
import { settle } from './settle.mjs'
import { surfaceSolveLinkInPage } from './replay.mjs'

const browser = useBrowser()

// Indices in `pu.centerlist` of the cells the test clicks.
const LEFT_CELL = 5
const RIGHT_CELL = 6
const NUMBER_CELL = 10

// Runs in the page: the page pixel of the centre of the cell at `index`, as `coord_point` in `main.js` maps it back.
function cellPixelInPage (index) {
  const canvas = document.getElementById('canvas')
  const point = pu.point[pu.centerlist[index]]
  return { x: canvas.offsetLeft + point.x - window.scrollX, y: canvas.offsetTop + point.y - window.scrollY }
}

async function openRecording (query) {
  const opened = await openPenpa(browser(), '?record=1' + query)
  await settle(() => opened.page.evaluate(() => Boolean(pu.solution)), true)
  return opened
}

async function clickCell (page, index, options) {
  const { x, y } = await page.evaluate(cellPixelInPage, index)
  await page.mouse.click(x, y, options)
}

async function download (page) {
  const [file] = await Promise.all([page.waitForEvent('download'), page.click('#recorder_download')])
  return { name: file.suggestedFilename(), recording: JSON.parse(await readFile(await file.path(), 'utf8')) }
}

describe('the recorder', () => {
  let query
  before(async () => {
    const { context, page } = await openPenpa(browser())
    try {
      query = await page.evaluate(surfaceSolveLinkInPage)
    } finally {
      await context.close()
    }
  })

  it('writes the solver\'s clicks, keys, mode changes, undo and redo as steps and downloads them', async () => {
    const { context, page } = await openRecording(query)
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
      const { name, recording } = await download(page)

      assert.equal(name, 'recording.steps.json')
      assert.deepEqual(recording.header, { source: query, gridtype: 'square', genre: [], recorder: 1 })
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

  it('records nothing while Penpa+ plays back its own replay', async () => {
    const { context, page } = await openRecording(query)
    try {
      await page.evaluate(() => { pu.replay = true })
      await clickCell(page, LEFT_CELL)
      await page.evaluate(() => { pu.replay = false })
      // Moving off the board to the download button is an `out`, made after the replay ended.
      const steps = (await download(page)).recording.steps
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
