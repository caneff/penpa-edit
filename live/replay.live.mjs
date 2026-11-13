// The two drivers (`live/replay.mjs`). The engine driver: a recording replays through `pu`'s own calls to the states it
// was recorded at, every checked-in recording still does, a planted change in the Surface handler fails at the step it
// breaks, and a recording whose replay cannot reach the board it was recorded on is refused. The UI driver: every
// recording replays through real mouse and keyboard to the engine driver's states, and a planted pixel offset in
// `main.js` makes the two disagree.
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { before, describe, it } from 'node:test'
import { fileURLToPath } from 'node:url'
import { canonicalState, readEngineState } from './canonical-state.mjs'
import { useBrowser } from './page.mjs'
import {
  ANSWER_CELLS, cellPixel, clickCell, compareDrivers, downloadRecording, listRecordings, makeSurfaceSolveLink,
  openRecordingPage, readExpected, readRecording, replay, uiDriver
} from './replay.mjs'

const browser = useBrowser()

const CLASS_P = fileURLToPath(new URL('../docs/js/class_p.js', import.meta.url))
const MAIN = fileURLToPath(new URL('../docs/js/main.js', import.meta.url))
// The tracer recording.
const SURFACE_ID = 'paint/surface-shade-undo-redo'
// The colour argument of the `set_surface` call in `re_surface_twobutton` that a left click on an empty cell runs.
const SHADE_COLOR = /(re_surface_twobutton\(num\) \{[^}]*\} else \{\s*let cc = this\.get_surface_color\(color\);\s*this\.set_surface\(num, )color(, cc\);)/
// Indices in `pu.centerlist` of the cells the recorded solve right-clicks, Ctrl-clicks and drags across.
const RIGHT_CELL = 6
const CTRL_CELL = 10
const DRAG_FROM = 0
const DRAG_TO = 2
// The board-unit x `coord_point` in `main.js` reads off a pointer event.
const COORD_X = /(function coord_point\(e, fittype = 'none', eventmode = 'none'\) \{\s*var x = e\.pageX - canvas\.offsetLeft)(;)/
// The planted offset: one cell of the 4x4 board, so a click lands on the next cell to the right.
const PIXEL_OFFSET = 38
// Longer than main.js's 300 ms window for a two-digit Surface colour.
const KEY_PAUSE_MS = 1000
const ids = await listRecordings()

// Records `act(page)` on a `?record=1` page and returns the recording and the page's last canonical state.
async function record (query, act) {
  const { context, page } = await openRecordingPage(browser(), query)
  try {
    await act(page)
    const state = await page.evaluate(readEngineState).then(canonicalState)
    return { state, recording: (await downloadRecording(page)).recording }
  } finally {
    await context.close()
  }
}

describe('the engine driver', () => {
  let query
  before(async () => { query = await makeSurfaceSolveLink(browser()) })

  it('replays a recorded solve to the state the recording page reached', async () => {
    const { state, recording } = await record(query, async (page) => {
      await page.click('#mo_surface_lb')
      await clickCell(page, ANSWER_CELLS[0])
      await clickCell(page, RIGHT_CELL, { button: 'right' })
      await page.keyboard.down('Control')
      await clickCell(page, CTRL_CELL)
      await page.keyboard.up('Control')
      const from = await cellPixel(page, DRAG_FROM)
      const to = await cellPixel(page, DRAG_TO)
      await page.mouse.move(from.x, from.y)
      await page.mouse.down()
      await page.mouse.move(to.x, to.y, { steps: 4 })
      await page.mouse.up()
      await page.keyboard.press('Control+z')
      await page.keyboard.press('Control+z')
      await page.keyboard.press('Control+y')
    })
    assert.match(state, /^pu_a\.surface\.\d+ = 1$/m, 'the recording page shaded a cell (the premise)')
    const { checkpoints, report } = await replay(browser(), recording)
    assert.equal(report, null)
    assert.equal(checkpoints.at(-1).state, state)
  })

  // Escape clears the selection in `main.js` without an engine call, so the recorder has no step for it.
  it('refuses a recording whose replay ends on a board the recording page did not reach', async () => {
    const { state, recording } = await record(query, async (page) => {
      await page.click('#mo_number_lb')
      await clickCell(page, CTRL_CELL)
      await page.keyboard.press('Escape')
      await page.keyboard.press('3')
    })
    assert.doesNotMatch(state, /^pu_a\.number\.\d+ = /m, 'the digit went nowhere on the recording page (the premise)')
    const { report } = await replay(browser(), recording, { id: 'escape' })
    assert.notEqual(report, null, 'the replay is refused')
    assert.match(report, /^escape: the replay ends on a board the recording page did not reach/)
    assert.match(report, /^ {2}pu_a\.number\.\d+: absent → \["3",2,"1"\]$/m)
  })

  for (const id of ids) {
    it(`replays ${id} to its expected states`, async () => {
      const { report } = await replay(browser(), await readRecording(id), { id, expected: await readExpected(id) })
      assert.equal(report, null)
    })

    it(`names the commit ${id} was recorded at`, async () => {
      assert.match((await readRecording(id)).header.commit ?? '', /^[0-9a-f]{7,40}$/)
    })
  }

  describe('against a recording or expected file that does not fit', () => {
    let recording, expected
    before(async () => {
      recording = await readRecording(SURFACE_ID)
      expected = await readExpected(SURFACE_ID)
    })

    it('reports a checkpoint the expected file has at another step', async () => {
      const shifted = expected.map((c, i) => i === 0 ? { ...c, step: c.step + 1 } : c)
      const { report } = await replay(browser(), recording, { id: SURFACE_ID, expected: shifted })
      assert.equal(report, `${SURFACE_ID}: step ${expected[0].step} is a checkpoint, where the expected file has step ${expected[0].step + 1}`)
    })

    it('reports a replay that ends before the expected file does', async () => {
      const longer = [...expected, { step: Infinity, state: '' }]
      const { report } = await replay(browser(), recording, { id: SURFACE_ID, expected: longer })
      assert.equal(report, `${SURFACE_ID}: the replay ended after ${expected.length} checkpoints, where the expected file has ${longer.length}`)
    })

    for (const [what, step, message] of [
      ['an unsupported step', { kind: 'unsupported', what: 'alt-drag rectangle selection' },
        'no engine call for a step of kind unsupported (alt-drag rectangle selection)'],
      ['a key step naming a call that is not a key call', { kind: 'key', call: 'mode_set', args: ['line'] }, 'no key call mode_set'],
      ['a mode with no such style', { kind: 'mode', mode: 'surface', submode: '', style: 99 },
        'mode surface has no sub-mode  and style 99 to switch to']
    ]) {
      it(`refuses ${what}`, async () => {
        const broken = { ...recording, steps: [step, ...recording.steps] }
        await assert.rejects(replay(browser(), broken, { id: SURFACE_ID }), (e) => {
          assert.equal(e.message.replace(/^.*could not be replayed: /, ''), message)
          assert.match(e.message, new RegExp(`^${SURFACE_ID}: step 1 `))
          return true
        })
      })
    }
  })

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

describe('the UI driver', () => {
  let query
  before(async () => { query = await makeSurfaceSolveLink(browser()) })

  for (const id of ids) {
    it(`replays ${id} through mouse and keyboard to the engine driver's states`, async () => {
      assert.equal(await compareDrivers(browser(), await readRecording(id), { id }), null)
    })
  }

  // Number mode's keys: digits, plain and Ctrl arrows, Backspace, Space, Shift+Space, Delete and Ctrl+Space.
  it('replays a recorded number entry through the keyboard to the engine driver\'s states', async () => {
    const { state, recording } = await record(query, async (page) => {
      await page.click('#mo_number_lb')
      await clickCell(page, DRAG_FROM)
      await page.keyboard.press('3')
      await page.keyboard.press('ArrowRight')
      await page.keyboard.press('4')
      await page.keyboard.press('ArrowRight')
      await page.keyboard.press('5')
      await page.keyboard.press('Backspace')
      await page.keyboard.press('ArrowDown')
      await page.keyboard.press('6')
      await page.keyboard.press('Space')
      await page.keyboard.press('ArrowLeft')
      await page.keyboard.press('Shift+Space')
      await page.keyboard.press('7')
      await page.keyboard.press('Delete')
      await page.keyboard.press('8')
      await page.keyboard.press('Control+Space')
      await page.keyboard.press('Control+ArrowDown')
      await page.keyboard.press('9')
    })
    assert.match(state, /^pu_a\.number\.\d+ = \["3",/m, 'the recording page entered a digit (the premise)')
    const has = (call, args) => recording.steps.some((s) => s.call === call && (!args || args(s.args)))
    for (const [what, call, args] of [
      ['a digit', 'key_number', ([k]) => k === '3'],
      ['Shift+Space', 'key_number', ([k]) => k === ' '],
      ['an arrow', 'key_arrow', ([, ctrl]) => !ctrl],
      ['a Ctrl arrow', 'key_arrow', ([, ctrl]) => ctrl],
      ['Backspace', 'key_backspace'],
      ['Space', 'key_space', ([code]) => code === 32],
      ['Delete', 'key_space', ([code]) => code === 46],
      ['Ctrl+Space', 'key_shiftspace']
    ]) {
      assert.ok(has(call, args), `the recording holds ${what} as ${call} (the premise)`)
    }
    assert.equal(await compareDrivers(browser(), recording, { id: 'number-keys' }), null)
  })

  // In Sudoku's normal sub-mode Delete clears a cell's corner marks and Space does not (`key_space` in class_p.js), so
  // the two keys' codes are told apart.
  it('replays a recorded Sudoku entry with Delete through the keyboard to the engine driver\'s states', async () => {
    const { state, recording } = await record(query, async (page) => {
      await page.click('#mo_sudoku_lb')
      await page.click('#sub_sudoku2_lb')
      await clickCell(page, DRAG_FROM)
      await page.keyboard.press('5')
      await page.click('#sub_sudoku1_lb')
      await page.keyboard.press('Delete')
    })
    assert.ok(recording.steps.some((s) => s.call === 'key_space' && s.args[0] === 46), 'the recording holds Delete (the premise)')
    assert.doesNotMatch(state, /^pu_a\.numberS\.\d+ = /m, 'Delete cleared the corner mark (the premise)')
    assert.ok(recording.steps.some((s) => s.call === 'key_number' && s.args[0] === '5'), 'the recording holds the mark (the premise)')
    assert.equal(await compareDrivers(browser(), recording, { id: 'sudoku-delete' }), null)
  })

  // A drag that leaves the canvas ends there, so the cell it comes back over is not shaded.
  it('replays a drag that leaves the canvas to the engine driver\'s states', async () => {
    const { state, recording } = await record(query, async (page) => {
      await page.click('#mo_surface_lb')
      const from = await cellPixel(page, DRAG_FROM)
      const to = await cellPixel(page, DRAG_TO)
      const box = await page.locator('#canvas').boundingBox()
      await page.mouse.move(from.x, from.y)
      await page.mouse.down()
      await page.mouse.move(from.x, box.y - 1)
      await page.mouse.move(to.x, to.y)
      await page.mouse.up()
    })
    assert.ok(recording.steps.some((s) => s.action === 'out'), 'the recording holds the drag leaving the canvas (the premise)')
    assert.equal(state.match(/^pu_a\.surface\.\d+ = /gm)?.length, 1, 'only the first cell is shaded (the premise)')
    assert.equal(await compareDrivers(browser(), recording, { id: 'drag-out' }), null)
  })

  // `z` and `v` are main.js's shortcuts to Sudoku and back to Surface; the press after them is made without a move.
  it('presses where the mouse last was after a mode change it made in the panel', async () => {
    const { recording } = await record(query, async (page) => {
      await page.click('#mo_surface_lb')
      await clickCell(page, DRAG_FROM)
      await page.keyboard.press('z')
      await page.keyboard.press('v')
      await page.mouse.down()
      await page.mouse.up()
    })
    const down = recording.steps.findLastIndex((s) => s.action === 'down')
    assert.equal(recording.steps[down - 1].kind, 'mode', 'the last press has no move before it (the premise)')
    assert.equal(await compareDrivers(browser(), recording, { id: 'press-after-panel' }), null)
  })

  // main.js reads `1` then a digit within 300 ms as a two-digit Surface colour; the recording page's clock passes the
  // window between them. Two 1s keep colour 1, so no mode step follows to set the colour either way.
  it('replays keys pressed further apart than main.js\'s key windows as separate keys', async () => {
    const { recording } = await record(query, async (page) => {
      await page.clock.install()
      await page.click('#mo_surface_lb')
      await page.keyboard.press('1')
      await page.clock.fastForward(KEY_PAUSE_MS)
      await page.keyboard.press('1')
    })
    assert.deepEqual(recording.steps.slice(-2), [1, 2].map(() => ({ kind: 'key', call: 'key_number', args: ['1'] })),
      'the two 1s were two keys, and the solve ends on them (the premise)')
    assert.equal(await compareDrivers(browser(), recording, { id: 'keys-apart' }), null)
  })

  describe('against a step it has no input for', () => {
    let recording
    before(async () => { recording = await readRecording(SURFACE_ID) })

    for (const [what, steps, message] of [
      ['a double-click', [{ kind: 'pointer', action: 'double', button: 'left', ctrl: false, x: 76, y: 76, num: 27 }],
        'no mouse input for a pointer step of action double'],
      ['a release with no button down', [{ kind: 'pointer', action: 'up', button: null, ctrl: false, x: 76, y: 76, num: 27 }],
        'no mouse button is down to release'],
      ['a key call no single key makes', [{ kind: 'key', call: 'key_number', args: ['12'] }], 'no key makes key_number("12")'],
      ['Sudoku\'s Backspace', [{ kind: 'key', call: 'key_space', args: [8, false, false] }], 'no key makes key_space(8, false, false)'],
      ['a Multicolor colour key', [{ kind: 'key', call: 'key_number', args: [3] }], 'no key makes key_number(3)'],
      ['a Multicolor style', [{ kind: 'mode', mode: 'multicolor', submode: '', style: 3 }],
        'no input for a Multicolor style alone: its button makes a key call too'],
      ['a mode with no such style', [{ kind: 'mode', mode: 'surface', submode: '', style: 99 }],
        'no button st_surface99_lb in the mode panel'],
      ['an unsupported step', [{ kind: 'unsupported', what: 'alt-drag rectangle selection' }],
        'no mouse or keyboard input for a step of kind unsupported (alt-drag rectangle selection)']
    ]) {
      it(`refuses ${what}`, async () => {
        const broken = { ...recording, steps: [...steps, ...recording.steps] }
        await assert.rejects(replay(browser(), broken, { id: SURFACE_ID, driver: uiDriver }), (e) => {
          assert.equal(e.message.replace(/^.*could not be replayed: /, ''), message)
          assert.match(e.message, new RegExp(`^${SURFACE_ID}: step ${steps.length} `))
          return true
        })
      })
    }
  })

  describe('with a planted pixel offset in main.js', () => {
    let planted
    before(async () => {
      const source = await readFile(MAIN, 'utf8')
      planted = source.replace(COORD_X, `$1 + ${PIXEL_OFFSET}$2`)
      assert.notEqual(planted, source, 'the line to plant in is in main.js')
    })

    it('disagrees with the engine driver at the first gesture it moves, and says so', async () => {
      const report = await compareDrivers(browser(), await readRecording(SURFACE_ID), {
        id: SURFACE_ID,
        served: true,
        setup: (context) => context.route(/\/js\/main\.js(\?|$)/, (route) => route.fulfill({
          contentType: 'text/javascript', body: planted
        }))
      })
      assert.notEqual(report, null, 'the planted offset fails the comparison')
      const lines = report.split('\n')
      assert.match(lines[0], new RegExp(`^${SURFACE_ID}: step \\d+ \\(up at point \\d+\\) differs from the engine driver$`))
      assert.ok(lines.includes('State, engine driver → UI driver:'), report)
      assert.ok(lines.some((l) => /^ {2}pu_a\.surface\.\d+: /.test(l)), `a semantic diff line:\n${report}`)
    })
  })
})
