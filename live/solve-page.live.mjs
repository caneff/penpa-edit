// `solve.html` opens a Penpa+ link on the dark desk: the board fits its card, and the title, author and rules show in the UI.
// The UI is read by role and accessible name, never through `pu` or Penpa's DOM.
import assert from 'node:assert/strict'
import { after, before, describe, it } from 'node:test'
import { AKARI_SOLVE, boardAgainstCard, boardCanvasInPage, linkFromNewBoard, openPenpa, useBrowser } from './page.mjs'
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
    opened = await openPenpa(browser(), links.solve, { solve: true, contextOptions: { viewport: { width: 1400, height: 900 } } })
    await opened.page.getByRole('region', { name: 'Board' }).waitFor()
  })
  after(async () => { await opened?.context.close() })

  it('shows the board inside the Board card, fitted, with no Penpa chrome', async () => {
    const { page } = opened
    const read = async () => (await boardAgainstCard(page)).inside
    assert.equal(await settle(read, true), true)
    const { w, h, cardW, cardH } = await boardAgainstCard(page)
    assert.ok(w > cardW / 2 || h > cardH / 2, `the board fills its card (canvas ${w}x${h} in ${cardW}x${cardH})`)
    assert.equal(await page.getByText('New Grid / Update').isVisible(), false, 'Penpa\'s toolbar is hidden')
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

  it('has the empty Mode, Mouse, Pinned and Recent cards on the desk', async () => {
    for (const name of ['Mode', 'Mouse', 'Pinned', 'Recent']) {
      assert.equal(await opened.page.getByRole('region', { name }).count(), 1, name)
    }
  })

  it('refits the board when the window resizes', async () => {
    const { page } = opened
    const before = await boardAgainstCard(page)
    await page.setViewportSize({ width: 900, height: 600 })
    const read = async () => { const r = await boardAgainstCard(page); return r.inside && r.w < before.w }
    assert.equal(await settle(read, true), true, 'smaller window, smaller board that still fits')
    await page.setViewportSize({ width: 1400, height: 900 })
    const grown = async () => { const r = await boardAgainstCard(page); return r.inside && r.w >= before.w - 1 }
    assert.equal(await settle(grown, true), true, 'larger window, the board grows back')
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
      // The engine API is what the UI sees: solve mode shows the answer-check dialog on a solved board, edit mode would not.
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
    const sizes = await opened.page.evaluate(async (boardCanvas) => {
      await engine.ready
      const canvas = new Function(`return (${boardCanvas})()`)()
      engine.setCellSize(20)
      const small = canvas.getBoundingClientRect().width
      engine.setCellSize(40)
      const big = canvas.getBoundingClientRect().width
      const fitted = engine.fitBoard(300, 300)
      return { small, big, fitted, fits: canvas.getBoundingClientRect().width <= 300 }
    }, boardCanvasInPage.toString())
    assert.ok(sizes.big > sizes.small * 1.5, `setCellSize 40 draws a bigger board than 20 (${sizes.small} -> ${sizes.big})`)
    assert.equal(sizes.fits, true)
    assert.ok(Number.isInteger(sizes.fitted) && sizes.fitted >= 12 && sizes.fitted <= 90)
  })
})

describe('Penpa\'s CSS and the top bar', () => {
  it('does not restyle a Web Awesome button', async () => {
    const { context, page } = await openPenpa(browser(), AKARI_SOLVE, { solve: true })
    try {
      await page.getByRole('region', { name: 'Board' }).waitFor()
      const styles = await page.evaluate(async () => {
        await customElements.whenDefined('wa-button')
        const read = (el) => { const s = getComputedStyle(el); return { padding: s.paddingLeft, radius: s.borderTopLeftRadius } }
        // Penpa styles its own `.button` with a 5px padding and a 4px radius. A control outside the UI shows its sheets are on.
        const outside = document.createElement('a')
        outside.className = 'button'
        document.body.append(outside)
        const control = read(outside)
        // The same rule aimed at a top-bar Web Awesome button: the class Penpa's selector needs, planted on a clone.
        const topBar = document.querySelector('header wa-button')
        const planted = topBar.cloneNode(true)
        planted.classList.add('button')
        topBar.after(planted)
        return { control, planted: read(planted) }
      })
      assert.deepEqual(styles.control, { padding: '5px', radius: '4px' }, 'Penpa\'s stylesheet is active on the page')
      assert.deepEqual(styles.planted, { padding: '0px', radius: '0px' })
    } finally {
      await context.close()
    }
  })
})
