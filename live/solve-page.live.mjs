// `solve.html` opens a Penpa+ link on the desk: the board fits its card, and the title, author and rules show in the UI.
// The engine API holds what it promises: its state, its theme kept apart from Penpa+'s, its key gate and its boot.
// The UI is read by role and accessible name and the state through `engine`; Penpa+'s own state and DOM are read only
// where the check is about Penpa+ (the mode a link opened in, its hidden toolbar, its theme cookie).
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { after, before, describe, it } from 'node:test'
import {
  AKARI_SOLVE, ANSWER_CELL, boardAgainstCard, boardCanvasInPage, jsRequest, linkFromNewBoard, makeNumberSolveLink, openPenpa,
  openSolvePage, takePageErrors, typeDigitInPage, useBrowser
} from './page.mjs'
import { clickCell } from './replay.mjs'
import { settle } from './settle.mjs'

const browser = useBrowser()

const TITLE = 'Desk test: <b>one</b>'
const AUTHOR = 'Setter & Co'
const RULES = 'Shade a<b cells.\nSecond line.'

// Runs in the page. Builds a 6x6 board with a title, author and rules, and returns its edit link's and solve link's `#` parts.
function linksInPage ({ title, author, rules }) {
  document.getElementById('nb_size1').value = 6
  document.getElementById('nb_size2').value = 6
  create_newboard()
  document.getElementById('saveinfotitle').value = title
  document.getElementById('saveinfoauthor').value = author
  document.getElementById('saveinforules').value = rules
  const hash = (url) => url.slice(url.indexOf('#'))
  return { edit: hash(pu.maketext()), solve: hash(pu.maketext_solve()) }
}

describe('solve.html on a solve link', () => {
  let opened
  let links
  before(async () => {
    links = await linkFromNewBoard(browser(), linksInPage, { title: TITLE, author: AUTHOR, rules: RULES })
    opened = await openSolvePage(browser(), links.solve)
  })
  after(async () => { await opened?.context.close() })

  it('shows the board inside the Board card, fitted, with no Penpa+ chrome', async () => {
    const { page } = opened
    const read = async () => (await boardAgainstCard(page)).inside
    assert.equal(await settle(read, true), true)
    const { w, h, cardW, cardH } = await boardAgainstCard(page)
    assert.ok(w > cardW / 2 || h > cardH / 2, `the board fills its card (canvas ${w}x${h} in ${cardW}x${cardH})`)
    assert.equal(await page.getByText('New Grid / Update').isVisible(), false, 'Penpa+\'s toolbar is hidden')
    assert.equal(await page.getByRole('button', { name: 'Undo' }).count(), 1, 'only the UI\'s Undo is on the page')
  })

  it('shows the title and author in the top bar and the rules in the Rules card, as text', async () => {
    const { page } = opened
    assert.equal(await page.getByRole('heading', { name: TITLE, level: 1 }).textContent(), TITLE)
    assert.equal(await page.getByText(AUTHOR, { exact: false }).first().textContent().then((t) => t.includes(AUTHOR)), true)
    const rules = page.getByRole('region', { name: 'Rules' })
    assert.equal(await rules.getByText('Shade a<b cells.').count(), 1)
    assert.equal(await rules.locator('b').count(), 0, 'no element is made from the text')
  })

  it('has a Mode, Mouse, Pinned and Recent card on the desk', async () => {
    for (const name of ['Mode', 'Mouse', 'Pinned', 'Recent']) {
      assert.equal(await opened.page.getByRole('region', { name }).count(), 1, name)
    }
  })

  it('refits the board when the window resizes', async () => {
    const { page } = opened
    // Read once the board has stopped changing: the fitted layout refits it a moment after the desk opens.
    const before = await settle(() => boardAgainstCard(page), null)
    await page.setViewportSize({ width: 900, height: 600 })
    const read = async () => { const r = await boardAgainstCard(page); return r.inside && r.w < before.w }
    assert.equal(await settle(read, true), true, 'smaller window, smaller board that still fits')
    const small = await boardAgainstCard(page)
    await page.setViewportSize({ width: 1400, height: 900 })
    // A resize fits an untouched desk again, so the board grows back with the window.
    const grown = async () => { const r = await boardAgainstCard(page); return r.inside && r.w > small.w }
    assert.equal(await settle(grown, true), true, 'larger window, the board grows')
  })
})

describe('solve.html on an edit link', () => {
  it('opens it in solve mode, with the board in its card', async () => {
    const links = await linkFromNewBoard(browser(), linksInPage, { title: TITLE, author: AUTHOR, rules: RULES })
    const { context, page } = await openPenpa(browser(), links.edit, { solve: true })
    try {
      await page.getByRole('region', { name: 'Board' }).waitFor()
      assert.equal(await page.getByRole('heading', { name: TITLE, level: 1 }).textContent(), TITLE)
      const read = async () => (await boardAgainstCard(page)).inside
      assert.equal(await settle(read, true), true)
      assert.equal(await page.evaluate(() => engine.getInfo().title), TITLE)
      // The engine API does not say which mode Penpa+ opened the link in, so Penpa+ is asked.
      assert.equal(await page.evaluate(() => pu.mmode), 'solve')
    } finally {
      await context.close()
    }
  })
})

describe('solve.html on the sample puzzle link', () => {
  it('opens a real puzzle link without a page error', async () => {
    const { context, page } = await openPenpa(browser(), AKARI_SOLVE, { solve: true })
    try {
      await page.getByRole('region', { name: 'Board' }).waitFor()
      const read = async () => (await boardAgainstCard(page)).inside
      assert.equal(await settle(read, true), true)
    } finally {
      await context.close()
    }
  })
})

describe('the engine', () => {
  let opened
  before(async () => { opened = await openPenpa(browser(), AKARI_SOLVE, { solve: true }) })
  after(async () => { await opened?.context.close() })

  it('throws on a bad argument', async () => {
    const results = await opened.page.evaluate(async () => {
      await engine.ready
      const throws = (f) => { try { f(); return false } catch { return true } }
      return {
        mount: throws(() => engine.mount(null)),
        fitBoardZero: throws(() => engine.fitBoard(0, 100)),
        fitBoardText: throws(() => engine.fitBoard('a', 100)),
        sizeLow: throws(() => engine.setCellSize(5)),
        sizeHigh: throws(() => engine.setCellSize(500)),
        sizeText: throws(() => engine.setCellSize('x'))
      }
    })
    assert.deepEqual(results, { mount: true, fitBoardZero: true, fitBoardText: true, sizeLow: true, sizeHigh: true, sizeText: true })
  })

  it('zooms the board with setCellSize and fits it with fitBoard', async () => {
    await opened.page.evaluate(() => engine.ready)
    const boardCanvas = await opened.page.evaluateHandle(boardCanvasInPage)
    const sizes = await boardCanvas.evaluate((canvas) => {
      engine.setCellSize(20)
      const small = canvas.getBoundingClientRect().width
      engine.setCellSize(40)
      const big = canvas.getBoundingClientRect().width
      const fitted = engine.fitBoard(300, 300)
      return { small, big, fitted, max: engine.CELL_SIZE_RANGE.max, fits: canvas.getBoundingClientRect().width <= 300 }
    })
    await boardCanvas.dispose()
    assert.ok(sizes.big > sizes.small * 1.5, `setCellSize 40 draws a bigger board than 20 (${sizes.small} -> ${sizes.big})`)
    assert.equal(sizes.fits, true)
    assert.ok(Number.isInteger(sizes.fitted) && sizes.fitted >= 12 && sizes.fitted <= sizes.max)
  })
  it('reports the tool, the cell size and whether the board is solved in getState', async () => {
    const state = await opened.page.evaluate(async () => {
      await engine.ready
      engine.setCellSize(20)
      const { tool, cellSize, solved } = engine.getState()
      return { tool, cellSize, solved, current: engine.getTool() }
    })
    assert.deepEqual(state.tool, state.current)
    assert.equal(state.cellSize, 20)
    assert.equal(state.solved, false)
  })
})

describe('getState\'s historyLength', () => {
  it('grows with each entry, falls back with an undo, rises with a redo and is 0 after a restart', async () => {
    const link = await makeNumberSolveLink(browser())
    const { context, page } = await openPenpa(browser(), link, { solve: true })
    try {
      await page.evaluate(() => engine.ready)
      const length = () => page.evaluate(() => engine.getState().historyLength)
      assert.equal(await length(), 0, 'a fresh puzzle has no history')
      await page.evaluate(typeDigitInPage, { index: ANSWER_CELL, digit: '3' })
      const one = await length()
      await page.evaluate(typeDigitInPage, { index: ANSWER_CELL + 1, digit: '4' })
      const two = await length()
      assert.ok(one > 0 && two > one, `each entry lengthens the history (${one}, then ${two})`)
      await page.evaluate(() => engine.undo())
      assert.equal(await length(), one, 'an undo takes back the second entry only')
      await page.evaluate(() => engine.redo())
      assert.equal(await length(), two, 'a redo brings it back')
      await page.evaluate(() => engine.restart())
      assert.equal(await length(), 0, 'a restart clears the history')
    } finally {
      await context.close()
    }
  })
})

describe('getState on a solved board', () => {
  it('says solved', async () => {
    const link = await makeNumberSolveLink(browser())
    const { context, page } = await openPenpa(browser(), link, { solve: true })
    try {
      await page.evaluate(() => engine.ready)
      await page.evaluate(typeDigitInPage, { index: ANSWER_CELL, digit: '2' })
      assert.equal(await settle(() => page.evaluate(() => engine.getState().solved), true), true)
    } finally {
      await context.close()
    }
  })
})

describe('Multicolor', () => {
  const CELL = 12
  let opened
  before(async () => {
    const links = await linkFromNewBoard(browser(), linksInPage, { title: TITLE, author: AUTHOR, rules: RULES })
    opened = await openPenpa(browser(), links.solve, { solve: true })
    await opened.page.evaluate((index) => engine.ready.then(() => {
      engine.setTool({ mode: 'sudoku', submode: '1' })
      pu.selection = [pu.centerlist[index]]
      pu.cursol = pu.centerlist[index]
    }), CELL)
  })
  after(async () => { await opened?.context.close() })

  // The selected cell's colours (Penpa+ saves one colour bare and several as a list), and whether there is anything to undo.
  const cellAndUndo = () => opened.page.evaluate((index) => ({
    colours: [].concat(pu[pu.mode.qa].surface[pu.centerlist[index]] ?? []),
    canUndo: engine.getState().canUndo
  }), CELL)

  it('landed on with a colour picks the colour and leaves the selected cells alone', async () => {
    await opened.page.evaluate(() => engine.setTool({ mode: 'multicolor', submode: null, style: 5 }))
    assert.equal((await opened.page.evaluate(() => engine.getTool())).style, 5)
    assert.deepEqual(await cellAndUndo(), { colours: [], canUndo: false })
  })

  it('colours the selected cells on colourSelection, and takes the colour off on the next', async () => {
    await opened.page.evaluate(() => engine.colourSelection(5))
    assert.deepEqual(await cellAndUndo(), { colours: [5], canUndo: true })
    await opened.page.evaluate(() => engine.colourSelection(5))
    assert.deepEqual((await cellAndUndo()).colours, [])
  })

  const swatch = (name) => opened.page.getByRole('region', { name: 'Mode' }).getByRole('group', { name: 'Style' }).getByRole('button', { name })

  it('colours the selected cells on a swatch press in the Mode card, as colourSelection does', async () => {
    await opened.page.evaluate(() => engine.setTool({ mode: 'multicolor', submode: null }))
    await swatch('red').click()
    assert.deepEqual((await cellAndUndo()).colours, [6], 'the press coloured the selected cell')
    await swatch('red').click()
    assert.deepEqual((await cellAndUndo()).colours, [], 'a second press took the colour off')
  })

  it('changes nothing on a swatch press or colourSelection while the board is paused', async () => {
    const { page } = opened
    await page.evaluate(() => engine.setTool({ mode: 'multicolor', submode: null }))
    await page.evaluate(() => engine.pauseTimer())
    try {
      assert.equal(await settle(() => page.evaluate(() => engine.getTimer().covered), true), true, 'the board is covered')
      // The Mode card is inert while paused, so even a forced press reaches nothing.
      await swatch('red').click({ force: true })
      assert.equal(await page.evaluate(() => engine.colourSelection(6)), false, 'colourSelection says it did nothing')
      assert.deepEqual((await cellAndUndo()).colours, [], 'the selected cell is not coloured')
    } finally {
      await page.evaluate(() => engine.startTimer())
    }
    await swatch('red').click()
    assert.deepEqual((await cellAndUndo()).colours, [6], 'resumed, the press colours again')
  })
})

// Penpa+'s own page keeps its theme in the `color_theme` cookie; solve.html keeps the UI's own choice, light by default.
describe('the theme', () => {
  const PENPA_DARK = { name: 'color_theme', value: '2', url: 'https://penpa.test/' }
  const themeCookie = async (context) => (await context.cookies()).find((c) => c.name === 'color_theme')?.value ?? null
  const theme = (page) => page.evaluate(() => engine.ready.then(() => engine.getSettings().theme))

  it('opens light whatever Penpa+\'s own theme is', async () => {
    const { context, page } = await openPenpa(browser(), AKARI_SOLVE, { solve: true, served: true, cookies: [PENPA_DARK] })
    try {
      assert.equal(await theme(page), 'light')
      assert.equal(await themeCookie(context), '2', 'Penpa+\'s theme is left as it was')
    } finally {
      await context.close()
    }
  })

  it('keeps a dark choice for the next visit without touching Penpa+\'s theme', async () => {
    const { context, page } = await openPenpa(browser(), AKARI_SOLVE, { solve: true, served: true })
    try {
      await page.evaluate(() => engine.ready.then(() => {
        engine.setTheme('dark')
        // Any setting makes Penpa+ save every setting on its cookie list.
        engine.setSetting('outline_text', !engine.getSettings().outline_text)
      }))
      assert.equal(await themeCookie(context), null, 'no theme cookie is written')
      await page.reload()
      assert.equal(await theme(page), 'dark')
    } finally {
      await context.close()
    }
  })
})

// An upstream rename of main.js's key handler would leave the gate unable to wrap it; onKey refuses then, so the UI
// fails loudly instead of leaving every key ungated.
describe('the key gate with one of Penpa+\'s key handlers renamed', () => {
  it('makes engine.onKey throw', async () => {
    const renamed = readFileSync(new URL('../docs/js/main.js', import.meta.url), 'utf8').replaceAll('onKeyUp', 'onKeyRelease')
    const setup = (context) => context.route(jsRequest('main.js'), (route) => route.fulfill({ contentType: 'text/javascript', body: renamed }))
    const { context, page, errors } = await openPenpa(browser(), AKARI_SOLVE, { solve: true, setup })
    try {
      const message = await page.evaluate(() => engine.ready.then(() => {
        try {
          engine.onKey(() => {})
          return null
        } catch (e) {
          return e.message
        }
      }))
      assert.match(String(message), /missed main\.js's key handlers/)
      // keys.js made the same call at boot, and its throw is a page error.
      assert.equal(await settle(() => errors.length > 0, true), true, 'a page error')
      const raised = takePageErrors()
      assert.ok(raised.every((e) => /missed main\.js's key handlers/.test(e)), raised.join('\n'))
    } finally {
      await context.close()
    }
  })
})

// A link that should have opened in solve mode but did not would reload forever; the bridge stops and says so.
describe('a solve link that opens in another mode', () => {
  it('rejects engine.ready and shows the error', async () => {
    const general = readFileSync(new URL('../docs/js/general.js', import.meta.url), 'utf8')
    const forced = general.replace('await load(urlParam);', 'await load(urlParam); pu.mmode = \'edit\';')
    assert.notEqual(forced, general, 'the planted line found its place')
    const setup = (context) => context.route(jsRequest('general.js'), (route) => route.fulfill({ contentType: 'text/javascript', body: forced }))
    const { context, page } = await openPenpa(browser(), AKARI_SOLVE, { solve: true, setup })
    try {
      // The popup first: a `ready` that never settles would hang the test, and Playwright's wait for the popup ends.
      assert.match(await page.locator('.swal2-html-container').textContent({ timeout: 10000 }), /did not open in solve mode/)
      // The popup came with the rejection, so `ready` has settled by the next task unless the rejection never came.
      const outcome = await page.evaluate(() => Promise.race([
        engine.ready.then(() => 'resolved', (e) => e.message),
        new Promise((resolve) => setTimeout(() => resolve('pending'), 0))
      ]))
      assert.match(outcome, /did not open in solve mode/)
      takePageErrors()
    } finally {
      await context.close()
    }
  })
})

describe('Penpa+\'s CSS and the top bar', () => {
  it('does not restyle a Web Awesome button', async () => {
    const { context, page } = await openPenpa(browser(), AKARI_SOLVE, { solve: true })
    try {
      await page.getByRole('region', { name: 'Board' }).waitFor()
      const styles = await page.evaluate(async () => {
        await customElements.whenDefined('wa-button')
        const read = (el) => { const s = getComputedStyle(el); return { padding: s.paddingLeft, radius: s.borderTopLeftRadius } }
        // Penpa+ styles its own `.button` with a 5px padding and a 4px radius. A control outside the UI shows its sheets are on.
        const outside = document.createElement('a')
        outside.className = 'button'
        document.body.append(outside)
        const control = read(outside)
        // The same rule aimed at a top-bar Web Awesome button: the class Penpa+'s selector needs, planted on a clone.
        const topBar = document.querySelector('header wa-button')
        const planted = topBar.cloneNode(true)
        planted.classList.add('button')
        topBar.after(planted)
        return { control, planted: read(planted) }
      })
      assert.deepEqual(styles.control, { padding: '5px', radius: '4px' }, 'Penpa+\'s stylesheet is active on the page')
      assert.deepEqual(styles.planted, { padding: '0px', radius: '0px' })
    } finally {
      await context.close()
    }
  })
})
