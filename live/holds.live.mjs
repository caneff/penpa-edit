// The Shift and Ctrl holds of `solve.html` (#99): a held Shift borrows Sudoku's Corner tool and a held Ctrl its Centre tool,
// the Mouse card says so, and the hold always ends: on key-up wherever focus is, on a lost window, on a hidden tab, on a dialog
// opening, on Tab and on any tool picked, whose later key-up then changes nothing. The UI is found by role and accessible
// name, the tool through `engine`; the keys are real key presses, and a lost window is the `blur` event Chromium fires on it.
import assert from 'node:assert/strict'
import { before, after, describe, it } from 'node:test'
import { linkFromNewBoard, openPenpa, useBrowser } from './page.mjs'
import { settle } from './settle.mjs'

const browser = useBrowser()

const DESK_SIZE = { viewport: { width: 1400, height: 900 } }

// Runs in the page. A 6x6 board whose Tab set is `names` (Penpa's own names for them), as a solve link's `#` part.
function solveLinkWithTabSetInPage (names) {
  document.getElementById('nb_size1').value = 6
  document.getElementById('nb_size2').value = 6
  create_newboard()
  UserSettings.tab_settings = names
  const url = pu.maketext_solve()
  return url.slice(url.indexOf('#'))
}

async function openSolve (tabSet) {
  const link = await linkFromNewBoard(browser(), solveLinkWithTabSetInPage, tabSet)
  const opened = await openPenpa(browser(), link, { solve: true, contextOptions: DESK_SIZE })
  await opened.page.getByRole('region', { name: 'Board' }).waitFor()
  await opened.page.evaluate(() => engine.ready)
  return opened
}

const NORMAL = { mode: 'sudoku', submode: '1' }
const CORNER = { mode: 'sudoku', submode: '2' }
const CENTRE = { mode: 'sudoku', submode: '3' }

const setTool = (page, tool) => page.evaluate((t) => engine.setTool(t), tool)

// Waits for the current tool to be `want` and returns it.
async function waitForTool (page, want) {
  const read = () => page.evaluate(() => {
    const { mode, submode } = engine.getTool()
    return { mode, submode }
  })
  assert.deepEqual(await settle(read, want), want, 'the tool settles')
  return want
}

const headline = (page) => page.getByRole('region', { name: 'Mouse' }).getByRole('heading', { level: 3 })
const headlineText = (page) => headline(page).textContent()

// What the page keeps in localStorage, whatever the UI calls its keys.
const storage = (page) => page.evaluate(() => JSON.stringify(Object.entries(localStorage).sort()))

// Settles on the Mouse card's headline reading `text`.
const waitForHeadline = (page, text) => settle(() => headlineText(page), text)

describe('a held Shift or Ctrl', () => {
  let opened
  before(async () => { opened = await openSolve(['Sudoku Normal', 'Sudoku Corner']) })
  after(async () => { await opened?.context.close() })

  it('shows the lent tool with the held tag, and key-up restores', async () => {
    const { page } = opened
    await setTool(page, NORMAL)
    await waitForHeadline(page, 'Sudoku · normal · dark blue')
    await page.keyboard.down('Shift')
    await waitForTool(page, CORNER)
    assert.equal(await waitForHeadline(page, 'Sudoku · corner · dark blueheld'), 'Sudoku · corner · dark blueheld')
    await page.keyboard.up('Shift')
    await waitForTool(page, NORMAL)
    assert.equal(await waitForHeadline(page, 'Sudoku · normal · dark blue'), 'Sudoku · normal · dark blue', 'the tag goes with the hold')
  })

  it('ends the hold when the window loses focus, and the next hold still works', async () => {
    const { page } = opened
    await setTool(page, NORMAL)
    await page.keyboard.down('Shift')
    await waitForTool(page, CORNER)
    await page.evaluate(() => window.dispatchEvent(new Event('blur')))
    await waitForTool(page, NORMAL)
    assert.equal(await waitForHeadline(page, 'Sudoku · normal · dark blue'), 'Sudoku · normal · dark blue')
    await page.keyboard.up('Shift')
    await page.keyboard.down('Shift')
    assert.deepEqual(await waitForTool(page, CORNER), CORNER, 'a hold after the lost one starts')
    await page.keyboard.up('Shift')
    await waitForTool(page, NORMAL)
  })

  it('ends the hold when the tab is hidden', async () => {
    const { page } = opened
    await setTool(page, NORMAL)
    await page.keyboard.down('Shift')
    await waitForTool(page, CORNER)
    await page.evaluate(() => {
      Object.defineProperty(document, 'hidden', { configurable: true, get: () => true })
      document.dispatchEvent(new Event('visibilitychange'))
    })
    await waitForTool(page, NORMAL)
    await page.evaluate(() => { delete document.hidden })
    await page.keyboard.up('Shift')
  })

  it('ends the hold when a dialog opens', async () => {
    const { page } = opened
    await setTool(page, NORMAL)
    await page.keyboard.down('Shift')
    await waitForTool(page, CORNER)
    await page.getByRole('button', { name: 'Restart' }).click()
    await page.getByRole('dialog').waitFor()
    await waitForTool(page, NORMAL)
    await page.keyboard.up('Shift')
    assert.deepEqual(await waitForTool(page, NORMAL), NORMAL, 'the key-up after it changes nothing')
    await page.keyboard.press('Escape')
    await page.getByRole('dialog').waitFor({ state: 'hidden' })
  })

  it('ends the hold when one of Penpa\'s own popups opens', async () => {
    const { page } = opened
    await setTool(page, NORMAL)
    await page.keyboard.down('Shift')
    await waitForTool(page, CORNER)
    await page.evaluate(() => { Swal.fire('A popup') })
    await waitForTool(page, NORMAL)
    await page.keyboard.up('Shift')
    assert.deepEqual(await waitForTool(page, NORMAL), NORMAL, 'the key-up after it changes nothing')
    await page.evaluate(() => Swal.close())
    // The popup still answers keys as Penpa's while it fades out.
    await page.locator('.swal2-container').waitFor({ state: 'detached' })
  })

  it('drops the hold on Tab, steps from the tool before it, and the key-up changes nothing', async () => {
    const { page } = opened
    await setTool(page, NORMAL)
    await page.keyboard.down('Shift')
    await waitForTool(page, CORNER)
    // Shift is down, so this is Shift+Tab: from Corner it would step back to Normal.
    await page.keyboard.press('Tab')
    assert.deepEqual(await waitForTool(page, CORNER), CORNER, 'Shift+Tab from Normal lands on the pin before it, Corner')
    await page.keyboard.up('Shift')
    // Penpa would give Normal back on the key-up.
    assert.equal(await page.evaluate(() => engine.getState().held), false)
    await settle(() => headlineText(page), 'Sudoku · corner · dark blue')
    assert.deepEqual(await waitForTool(page, CORNER), CORNER)
  })
})

// A page of its own, as below. Penpa resets its hold counters only on a key-up in Sudoku, so a tool picked away from Sudoku
// mid-hold must end the hold first, or the next hold starts nothing.
describe('a tool picked while Shift is held', () => {
  const LINE = { mode: 'line', submode: '1' }
  let opened
  before(async () => { opened = await openSolve(['Sudoku Normal', 'Sudoku Corner', 'Line Normal']) })
  after(async () => { await opened?.context.close() })

  it('ends the hold, and the next Shift hold in Sudoku still lends Corner', async () => {
    const { page } = opened
    await setTool(page, NORMAL)
    await page.keyboard.down('Shift')
    await waitForTool(page, CORNER)
    await setTool(page, LINE)
    assert.equal(await page.evaluate(() => engine.getState().held), false, 'the pick ends the hold')
    await page.keyboard.up('Shift')
    assert.deepEqual(await waitForTool(page, LINE), LINE, 'the key-up after it changes nothing')
    await setTool(page, NORMAL)
    await page.keyboard.down('Shift')
    assert.deepEqual(await waitForTool(page, CORNER), CORNER, 'the next hold lends Corner')
    await page.keyboard.up('Shift')
    await waitForTool(page, NORMAL)
  })

  it('gives Sudoku back the sub-mode from before the hold when the pick names none', async () => {
    const { page } = opened
    await setTool(page, NORMAL)
    await page.keyboard.down('Shift')
    await waitForTool(page, CORNER)
    await setTool(page, { mode: 'sudoku' })
    await page.keyboard.up('Shift')
    assert.deepEqual(await waitForTool(page, NORMAL), NORMAL)
  })
})

// A page of its own, as below. The UI answers a key-up for itself while focus is in a text field, and Penpa ignores one
// aimed at a field, yet the hold ends.
describe('a Shift let go while focus is in a text field', () => {
  let opened
  before(async () => { opened = await openSolve(['Sudoku Normal', 'Sudoku Corner']) })
  after(async () => { await opened?.context.close() })

  it('ends the hold, and the next Shift hold on the board still lends Corner', async () => {
    const { page } = opened
    await setTool(page, NORMAL)
    await page.keyboard.down('Shift')
    await waitForTool(page, CORNER)
    const search = page.getByRole('combobox', { name: 'Tool' })
    await search.focus()
    await page.keyboard.up('Shift')
    assert.deepEqual(await waitForTool(page, NORMAL), NORMAL, 'the key-up gives Normal back')
    assert.equal(await page.evaluate(() => engine.getState().held), false, 'no hold is on')
    await search.blur()
    await page.getByRole('region', { name: 'Board' }).click()
    await page.keyboard.down('Shift')
    assert.deepEqual(await waitForTool(page, CORNER), CORNER, 'the next hold lends Corner')
    await page.keyboard.up('Shift')
    await waitForTool(page, NORMAL)
  })
})

// A page of its own: Penpa treats a key pressed within 15 ms of a Shift release as a Shift press, which a Ctrl hold right after the
// Shift tests would trip.
describe('a held Ctrl', () => {
  let opened
  before(async () => { opened = await openSolve(['Sudoku Normal', 'Sudoku Corner']) })
  after(async () => { await opened?.context.close() })

  it('lends Centre, and key-up restores', async () => {
    const { page } = opened
    await setTool(page, NORMAL)
    await page.keyboard.down('Control')
    await waitForTool(page, CENTRE)
    assert.equal(await waitForHeadline(page, 'Sudoku · centre · dark blueheld'), 'Sudoku · centre · dark blueheld')
    await page.keyboard.up('Control')
    await waitForTool(page, NORMAL)
  })
})

// A page of its own: a pin's style is saved the first time the tool is on it, so an earlier visit would hide a hold doing it.
describe('after a hold', () => {
  let opened
  before(async () => { opened = await openSolve(['Sudoku Normal', 'Sudoku Corner']) })
  after(async () => { await opened?.context.close() })

  it('leaves the pins and what the page keeps unchanged', async () => {
    const { page } = opened
    await setTool(page, NORMAL)
    await waitForHeadline(page, 'Sudoku · normal · dark blue')
    const before = await storage(page)
    const chips = () => page.getByRole('region', { name: 'Pinned' }).getByRole('button', { name: /^(?!Unpin|Pin current)/ }).allInnerTexts()
    const chipsBefore = await chips()
    await page.keyboard.down('Shift')
    await waitForTool(page, CORNER)
    await waitForHeadline(page, 'Sudoku · corner · dark blueheld')
    await page.keyboard.up('Shift')
    await waitForTool(page, NORMAL)
    await waitForHeadline(page, 'Sudoku · normal · dark blue')
    assert.equal(await storage(page), before)
    assert.deepEqual(await chips(), chipsBefore)
  })
})

// Runs in the page. A hex board's solve link as the `#` part, with Digits in its Tab set.
function hexSolveLinkInPage (names) {
  UserSettings.gridtype = 'hex'
  document.getElementById('nb_size1').value = 3
  document.getElementById('nb_size2').value = 3
  document.getElementById('nb_size3').value = 3
  create_newboard()
  UserSettings.tab_settings = names
  const url = pu.maketext_solve()
  return url.slice(url.indexOf('#'))
}

// A page of its own, as above: Penpa treats a key pressed within 15 ms of a Shift release as a Shift press.
describe('a held Shift or Ctrl on a hex grid, which has centre marks but no corner marks', () => {
  let opened
  before(async () => {
    const link = await linkFromNewBoard(browser(), hexSolveLinkInPage, ['Sudoku Normal'])
    opened = await openPenpa(browser(), link, { solve: true, contextOptions: DESK_SIZE })
    await opened.page.getByRole('region', { name: 'Board' }).waitFor()
    await opened.page.evaluate(() => engine.ready)
  })
  after(async () => { await opened?.context.close() })

  // The tool in use and whether `listTools()` lists it, read in one call.
  const toolAndListed = (page) => page.evaluate(() => {
    const { mode, submode } = engine.getTool()
    return { mode, submode, listed: engine.listTools().some((t) => t.mode === mode && t.submode === submode) }
  })

  it('offers centre marks and not corner marks', async () => {
    const tools = await opened.page.evaluate(() => engine.listTools().map((t) => `${t.mode}/${t.submode}`))
    assert.equal(tools.includes('sudoku/1'), true, 'Digits is listed')
    assert.equal(tools.includes('sudoku/2'), false, 'corner marks are not')
    assert.equal(tools.includes('sudoku/3'), true, 'centre marks are')
  })

  it('leaves the tool on Digits while Shift is held, repeats and after it is let go', async () => {
    const { page } = opened
    await setTool(page, NORMAL)
    await page.keyboard.down('Shift')
    assert.deepEqual(await toolAndListed(page), { ...NORMAL, listed: true }, 'held')
    await page.keyboard.down('Shift') // auto-repeat
    assert.deepEqual(await toolAndListed(page), { ...NORMAL, listed: true }, 'repeating')
    await page.keyboard.up('Shift')
    assert.deepEqual(await toolAndListed(page), { ...NORMAL, listed: true }, 'released')
    assert.equal(await page.evaluate(() => engine.getState().held), false, 'no hold is on')
  })

  it('still lends centre marks to a held Ctrl, which the grid lists', async () => {
    const { page } = opened
    await setTool(page, NORMAL)
    await page.keyboard.down('Control')
    await waitForTool(page, CENTRE)
    assert.equal((await toolAndListed(page)).listed, true)
    await page.keyboard.up('Control')
    await waitForTool(page, NORMAL)
  })

  it('has the next Shift hold start nothing as well', async () => {
    const { page } = opened
    await page.keyboard.down('Shift')
    await page.keyboard.up('Shift')
    await page.keyboard.down('Shift')
    assert.deepEqual(await toolAndListed(page), { ...NORMAL, listed: true })
    await page.keyboard.up('Shift')
  })
})
