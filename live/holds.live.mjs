// The Shift and Ctrl holds of `solve.html` (#99): a held Shift borrows Sudoku's Corner tool and a held Ctrl its Centre tool,
// the Mouse card says so, and the hold always ends: on key-up, on a lost window, on a hidden tab, on a dialog opening and on
// Tab, whose later key-up then changes nothing. The UI is found by role and accessible name, the tool through `engine`; the
// keys are real key presses, and a lost window is the `blur` event Chromium fires on it.
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
  return settle(read, want)
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
    await page.keyboard.down('Control')
    await waitForTool(page, CENTRE)
    await page.keyboard.up('Control')
    await waitForTool(page, NORMAL)
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
