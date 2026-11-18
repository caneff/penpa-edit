// The pin toggle on each tool row of the Mode card's picker (#307): a click or `P` pins or unpins that row's tool without picking it or
// closing the picker. Driven by role, name and the real mouse and keys; the tool by `engine.getTool()`.
import assert from 'node:assert/strict'
import { after, before, describe, it } from 'node:test'
import { pinChipTexts, pinnedCard } from './pin-card.mjs'
import { currentTool, newBoardSolveLink, openSolvePage, setTool, useBrowser, waitForTool } from './page.mjs'
import { settle } from './settle.mjs'

const browser = useBrowser()

describe('the picker pin toggles', () => {
  let opened
  before(async () => { opened = await openSolvePage(browser(), await newBoardSolveLink(browser(), [])) })
  after(async () => { await opened?.context.close() })

  const page = () => opened.page
  const mode = () => page().getByRole('region', { name: 'Mode' })
  const search = () => mode().getByRole('combobox', { name: 'Tool' })
  const tree = () => mode().getByRole('tree', { name: 'Tools' })
  const row = (selector) => tree().locator(`.ui-trow${selector}`)
  const WALL = '[data-mode="wall"]'
  const SURFACE = '[data-mode="surface"]'
  const LINE_NORMAL = '[data-mode="line"][data-submode="1"]'
  const toggleOf = (selector) => row(selector).locator('.ui-pin-toggle')
  const pinned = () => pinChipTexts(page())

  async function openPicker () {
    await search().click()
    await mode().getByRole('button', { name: 'Everything', exact: true }).click()
  }
  const pickerIsOpen = () => search().getAttribute('aria-expanded')

  it('starts with nothing pinned and a toggle on every tool row and none on a group row', async () => {
    assert.deepEqual(await pinned(), [])
    await setTool(page(), { mode: 'sudoku', submode: '1' })
    await waitForTool(page(), { mode: 'sudoku', submode: '1' })
    await openPicker()
    const tools = await page().evaluate(() => engine.listTools().length)
    assert.equal(await tree().locator('.ui-trow[data-mode] .ui-pin-toggle').count(), tools, 'one toggle per tool row')
    assert.equal(await tree().locator('.ui-trow[aria-expanded] .ui-pin-toggle').count(), 0, 'none on a group row')
    assert.equal(await toggleOf(WALL).getAttribute('aria-pressed'), 'false')
    assert.equal(await toggleOf(WALL).getAttribute('title'), 'Pin Wall')
  })

  it('pins two tools by click, in order, without picking them or closing the picker', async () => {
    await toggleOf(WALL).click()
    await toggleOf(SURFACE).click()
    assert.deepEqual(await settle(pinned, ['Wall', 'Surface']), ['Wall', 'Surface'])
    assert.deepEqual(await currentTool(page()).then(({ mode: m, submode }) => ({ mode: m, submode })), { mode: 'sudoku', submode: '1' }, 'the current tool did not change')
    assert.equal(await pickerIsOpen(), 'true', 'the picker stayed open')
    assert.equal(await toggleOf(WALL).getAttribute('aria-pressed'), 'true')
    assert.equal(await toggleOf(WALL).getAttribute('title'), 'Unpin Wall')
  })

  it('pins a third by P on the focused row, and a row for P is not searched', async () => {
    await row(LINE_NORMAL).focus()
    await page().keyboard.press('p')
    assert.deepEqual(await settle(pinned, ['Wall', 'Surface', 'Line > Normal']), ['Wall', 'Surface', 'Line > Normal'])
    assert.equal(await search().inputValue(), '', 'P did not go to the search field')
    assert.equal((await currentTool(page())).mode, 'sudoku', 'the current tool did not change')
    assert.equal(await pickerIsOpen(), 'true')
    assert.equal(await row(LINE_NORMAL).getAttribute('aria-selected'), 'false', 'P did not pick the row')
  })

  it('unpins from the picker by click and by P, and the chip goes', async () => {
    await toggleOf(SURFACE).click()
    assert.deepEqual(await settle(pinned, ['Wall', 'Line > Normal']), ['Wall', 'Line > Normal'])
    await row(WALL).focus()
    await page().keyboard.press('P')
    assert.deepEqual(await settle(pinned, ['Line > Normal']), ['Line > Normal'])
    assert.equal(await pickerIsOpen(), 'true')
    assert.equal(await pinnedCard(page()).getByRole('button', { name: /^Unpin Wall/ }).count(), 0)
  })

  it('shows the toggle on search results too', async () => {
    await search().fill('surface')
    assert.equal(await toggleOf(SURFACE).isVisible(), true)
    await toggleOf(SURFACE).click()
    assert.deepEqual(await settle(pinned, ['Line > Normal', 'Surface']), ['Line > Normal', 'Surface'])
    assert.equal(await pickerIsOpen(), 'true')
  })

  it('still picks the tool on a click on the row itself', async () => {
    await search().fill('')
    await row(WALL).click()
    await waitForTool(page(), { mode: 'wall', submode: null })
    assert.deepEqual(await pinned(), ['Line > Normal', 'Surface'], 'picking pins nothing')
  })
})
