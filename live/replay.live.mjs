// The engine driver (`live/replay.mjs`): a recording replays through `pu`'s own calls to the states it was recorded
// at, every checked-in recording still does, a planted change in the Surface handler fails at the step it breaks, and
// a recording whose replay cannot reach the board it was recorded on is refused.
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { before, describe, it } from 'node:test'
import { fileURLToPath } from 'node:url'
import { canonicalState, readEngineState } from './canonical-state.mjs'
import { useBrowser } from './page.mjs'
import {
  ANSWER_CELLS, cellPixel, clickCell, downloadRecording, listRecordings, makeSurfaceSolveLink, openRecordingPage,
  readExpected, readRecording, replay
} from './replay.mjs'

const browser = useBrowser()

const CLASS_P = fileURLToPath(new URL('../docs/js/class_p.js', import.meta.url))
// The tracer recording.
const SURFACE_ID = 'paint/surface-shade-undo-redo'
// The branch of `maketext_duplicate` that keeps the answer's undo stack in a solve-mode duplicate link.
const KEEP_UNDO = /(maketext_duplicate\(\) \{[\s\S]*?)\/\/ Retain undo in solve mode/
// The colour argument of the `set_surface` call in `re_surface_twobutton` that a left click on an empty cell runs.
const SHADE_COLOR = /(re_surface_twobutton\(num\) \{[^}]*\} else \{\s*let cc = this\.get_surface_color\(color\);\s*this\.set_surface\(num, )color(, cc\);)/
// Indices in `pu.centerlist` of the cells the recorded solve right-clicks, Ctrl-clicks and drags across.
const RIGHT_CELL = 6
const CTRL_CELL = 10
const DRAG_FROM = 0
const DRAG_TO = 2
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

  it('checks the board the link loads before the first step', async () => {
    const { context, page } = await openRecordingPage(browser(), query)
    let loaded
    try {
      loaded = await page.evaluate(readEngineState).then(canonicalState)
    } finally {
      await context.close()
    }
    const { checkpoints } = await replay(browser(), { header: { source: query }, steps: [{ kind: 'undo' }] })
    assert.deepEqual(checkpoints[0], { step: 0, state: loaded })
  })

  it('replays a Shape and a Composite tool choice and a number orientation', async () => {
    const { state, recording } = await record(query, async (page) => {
      await page.click('#mo_symbol_lb')
      await page.dispatchEvent('#ms_star', 'mousedown')
      await clickCell(page, ANSWER_CELLS[0])
      await page.keyboard.press('2')
      await page.click('#mo_combi_lb')
      await page.dispatchEvent('#combisub_akari', 'mousedown')
      await clickCell(page, RIGHT_CELL)
      await page.click('#mo_number_lb')
      await page.click('#rot_D_lb')
      await clickCell(page, CTRL_CELL)
      await page.keyboard.press('3')
    })
    assert.match(state, /^pu_a\.symbol\.\d+ = \[\d+,"star",\d+\]$/m, 'the recording page placed a star (the premise)')
    assert.match(state, /^pu_a\.number\.\d+ = \["3",\d+,"1","D"\]$/m, 'the digit is turned down (the premise)')
    const { checkpoints, report } = await replay(browser(), recording)
    assert.equal(report, null)
    assert.equal(checkpoints.at(-1).state, state)
  })

  // `re_combi_akari_up_reduced` runs only once `main.js` has copied the mouse's `ondown_key` onto `pu` on a mousedown.
  it('replays a Composite click that behaves one way for a mouse and another for touch', async () => {
    const { state, recording } = await record(query, async (page) => {
      await page.click('#mo_combi_lb')
      await page.dispatchEvent('#combisub_akari', 'mousedown')
      await clickCell(page, RIGHT_CELL)
      await clickCell(page, RIGHT_CELL)
    })
    assert.doesNotMatch(state, /^pu_a\.symbol\.\d+ = /m, 'the second click took the bulb away and left no dot (the premise)')
    const { checkpoints, report } = await replay(browser(), recording)
    assert.equal(report, null)
    assert.equal(checkpoints.at(-1).state, state)
  })

  it('replays Escape and Ctrl+A', async () => {
    const { state, recording } = await record(query, async (page) => {
      await page.click('#mo_number_lb')
      await clickCell(page, CTRL_CELL)
      await page.keyboard.press('Escape')
      await page.keyboard.press('3')
      await page.keyboard.press('Control+a')
      await page.keyboard.press('4')
    })
    assert.doesNotMatch(state, /^pu_a\.number\.\d+ = \["3"/m, 'the 3 went nowhere on the recording page (the premise)')
    assert.match(state, /^selection = \[(\d+,){15}\d+\]$/m, 'Ctrl+A selected all 16 cells (the premise)')
    const { checkpoints, report } = await replay(browser(), recording)
    assert.equal(report, null)
    assert.equal(checkpoints.at(-1).state, state)
  })

  // A script's write to `pu` stands in for an input the recorder does not see.
  it('refuses a recording whose replay ends on a board the recording page did not reach', async () => {
    const { state, recording } = await record(query, async (page) => {
      await page.click('#mo_number_lb')
      await clickCell(page, CTRL_CELL)
      await page.evaluate(() => { pu.selection = [] })
      await page.keyboard.press('3')
    })
    assert.doesNotMatch(state, /^pu_a\.number\.\d+ = /m, 'the digit went nowhere on the recording page (the premise)')
    const { report } = await replay(browser(), recording, { id: 'unseen' })
    assert.notEqual(report, null, 'the replay is refused')
    assert.match(report, /^unseen: the replay ends on a board the recording page did not reach/)
    assert.match(report, /^ {2}pu_a\.number\.\d+: absent → \["3",2,"1"/m)
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
      ['a key step naming a call that is not a key call', { kind: 'key', call: 'mode_set', args: ['line'] }, 'no key call mode_set']
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

  // `main.js`'s `onload` boots the page; the duplicate's page never runs it, so `pu` never exists there.
  it('reports a duplicate link whose page never loads', { timeout: 90000 }, async () => {
    const { report } = await replay(browser(), { header: { source: query }, steps: [] }, {
      id: 'noload',
      setup: (context) => context.addInitScript(() => {
        if (location.hash.includes('l=solvedup')) Object.defineProperty(window, 'onload', { set () {}, get () { return null } })
      })
    })
    assert.match(report ?? '', /^noload: step 0 \(the board the link loads\): its duplicate link did not load: /)
  })

  describe('with a duplicate link that drops the undo stack', () => {
    let planted
    before(async () => {
      const source = await readFile(CLASS_P, 'utf8')
      planted = source.replace(KEEP_UNDO, '$1this.pu_a.command_undo.__a = [];')
      assert.notEqual(planted, source, 'the line to plant in is in class_p.js')
    })

    it('reports the first checkpoint whose duplicate link loads a different board', async () => {
      const { report } = await replay(browser(), await readRecording(SURFACE_ID), {
        id: SURFACE_ID,
        expected: await readExpected(SURFACE_ID),
        served: true,
        setup: (context) => context.route(/\/js\/class_p\.js(\?|$)/, (route) => route.fulfill({
          contentType: 'text/javascript', body: planted
        }))
      })
      assert.notEqual(report, null, 'the planted loss fails the replay')
      const lines = report.split('\n')
      assert.match(lines[0], new RegExp(`^${SURFACE_ID}: step \\d+ \\(up at point \\d+\\): its duplicate link loads a different board$`))
      assert.ok(lines.includes('  pu_a.command_undo.length: 1 → 0'), report)
    })
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
