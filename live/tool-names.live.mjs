// One name per tool across the Mode card, the Board card's label, the Mouse card's headline, the Pinned chips and the Recent chips
// (#190), the tool-change banner and the Board card's colour cue. The UI is found by role and accessible name where it has one, else by its class or test id; the tool is set through `engine`.
import assert from 'node:assert/strict'
import { before, after, describe, it } from 'node:test'
import { chipName, newBoardSolveLink, openSolvePage, setTool, useBrowser } from './page.mjs'
import { settle } from './settle.mjs'

const browser = useBrowser()

const region = (page, name) => page.getByRole('region', { name })
const boardLabel = (page) => page.getByTestId('board-tool-name')
const mouseName = (page) => region(page, 'Mouse').getByRole('heading', { level: 3 }).locator('.ui-hname')
const modeName = (page) => region(page, 'Mode').getByRole('combobox', { name: 'Tool' }).inputValue()
const chipTexts = async (card) => (await card.locator('.ui-chip-main').allInnerTexts()).map(chipName)

// Every tool the link lists, as `{ mode, submode }`.
const listed = (page) => page.evaluate(() => engine.listTools().map(({ mode, submode }) => ({ mode, submode })))
const pin = (page, entries) => page.evaluate((e) => window.pinBoard.replace(e), entries)

describe('one name per tool', () => {
  let opened
  before(async () => { opened = await openSolvePage(browser(), await newBoardSolveLink(browser(), ['Line Normal'])) })
  after(async () => { await opened?.context.close() })

  it('reads the same on the Board label, the Mouse headline, the Mode card and the Pinned chip, for every tool', async () => {
    const { page } = opened
    const tools = await listed(page)
    assert.ok(tools.length > 100, `${tools.length} tools listed`)
    await pin(page, tools.map(({ mode, submode }) => ({ mode, submode, style: null })))
    const chips = await settle(async () => (await chipTexts(region(page, 'Pinned'))).length, tools.length)
    assert.equal(chips, tools.length, 'a chip per tool')
    const names = await chipTexts(region(page, 'Pinned'))
    const unequal = []
    for (const [i, tool] of tools.entries()) {
      await setTool(page, tool)
      const seen = await settle(async () => [await boardLabel(page).textContent(), await mouseName(page).textContent(), await modeName(page)],
        [names[i], names[i], names[i]])
      if (seen.some((text) => text !== names[i])) unequal.push({ tool, chip: names[i], board: seen[0], mouse: seen[1], mode: seen[2] })
    }
    assert.deepEqual(unequal, [])
  })

  it('reads the same on a Recent chip as the shared name gives, for every tool', async () => {
    const { page } = opened
    await pin(page, [])
    const unequal = []
    for (const tool of await listed(page)) {
      await setTool(page, tool)
      const label = await page.evaluate((t) => window.toolGuide.chipLabel(engine.listTools().find((x) => x.mode === t.mode && x.submode === t.submode)), tool)
      const first = await settle(async () => (await chipTexts(region(page, 'Recent')))[0], label)
      if (first !== label) unequal.push({ tool, name: label, recent: first })
    }
    assert.deepEqual(unequal, [])
  })

  it('gives a chip no tooltip with a second name', async () => {
    const { page } = opened
    await pin(page, [{ mode: 'sudoku', submode: '1', style: null }])
    await setTool(page, { mode: 'line', submode: '1' })
    await settle(async () => (await chipTexts(region(page, 'Pinned'))).length, 1)
    await settle(async () => (await chipTexts(region(page, 'Recent'))).length > 0, true)
    assert.equal(await page.locator('.ui-chip-main[title]').count(), 0)
  })

  it('shows the same name in the tool-change banner', async () => {
    const { page } = opened
    await pin(page, [])
    await setTool(page, { mode: 'line', submode: '1' })
    await setTool(page, { mode: 'sudoku', submode: '2' })
    const banner = await settle(() => page.locator('.ui-flash').textContent(), 'Sudoku > Corner')
    assert.equal(banner, 'Sudoku > Corner')
  })

  it('keeps a name\'s × apart from the chip\'s remove button', async () => {
    const { page } = opened
    await pin(page, [{ mode: 'line', submode: '4', style: null }])
    const chip = region(page, 'Pinned').locator('.ui-chip').first()
    await settle(async () => (await chip.locator('.ui-chip-main').innerText()).includes('×'), true)
    assert.equal(await chip.getByRole('button', { name: /^Unpin/ }).innerText(), '', 'the remove button has no × text')
    assert.equal(await chip.getByRole('button', { name: /^Unpin/ }).locator('svg').count(), 1, 'the remove button is an icon')
  })
})

describe('the Board card\'s colour cue', () => {
  let opened
  before(async () => { opened = await openSolvePage(browser(), await newBoardSolveLink(browser(), ['Line Normal'])) })
  after(async () => { await opened?.context.close() })

  const colours = (page) => page.evaluate(() => {
    const card = document.querySelector('[data-testid="board-tool-name"]').closest('section, [role=region]')
    return { text: getComputedStyle(document.querySelector('[data-testid="board-tool-name"]')).color, border: getComputedStyle(card).outlineColor }
  })
  const swatchRgb = (page, tool, name) => page.evaluate(([t, n]) => {
    const swatch = engine.listTools().find((x) => x.mode === t.mode && x.submode === t.submode).styles.find((s) => s.name === n).swatch
    const probe = document.createElement('i')
    probe.style.color = swatch
    document.body.append(probe)
    const rgb = getComputedStyle(probe).color
    probe.remove()
    return rgb
  }, [tool, name])

  for (const [tool, name] of [[{ mode: 'number', submode: '1' }, 'green'], [{ mode: 'surface', submode: null }, 'blue']]) {
    it(`takes the ${tool.mode} tool's ${name} style's colour for the label and the border`, async () => {
      const { page } = opened
      const styleNumber = await page.evaluate(([t, n]) => engine.listTools().find((x) => x.mode === t.mode).styles.find((s) => s.name === n).style, [tool, name])
      await setTool(page, { ...tool, style: styleNumber })
      const want = await swatchRgb(page, tool, name)
      assert.deepEqual(await settle(() => colours(page), { text: want, border: want }), { text: want, border: want })
    })
  }

  it('puts a pale style colour on a dark pill so the label can be read', async () => {
    const { page } = opened
    const yellow = await page.evaluate(() => engine.listTools().find((x) => x.mode === 'surface').styles.find((s) => s.name === 'yellow').style)
    await setTool(page, { mode: 'surface', style: yellow })
    const pill = () => boardLabel(page).evaluate((label) => getComputedStyle(label).backgroundColor)
    assert.equal(await settle(pill, 'rgb(43, 47, 56)'), 'rgb(43, 47, 56)')
    await setTool(page, { mode: 'number', submode: '1', style: 1 })
    assert.notEqual(await settle(pill, 'rgb(246, 243, 236)'), 'rgb(43, 47, 56)')
  })
})

describe('the Mouse headline at 1366x768', () => {
  let opened
  before(async () => { opened = await openSolvePage(browser(), await newBoardSolveLink(browser(), ['Line Normal'])) })
  after(async () => { await opened?.context.close() })

  it('stays on one line for the longest tool name, and when the card is narrow', async () => {
    const { page } = opened
    await page.setViewportSize({ width: 1366, height: 768 })
    const longest = await page.evaluate(() => {
      const tools = engine.listTools()
      return tools.reduce((a, b) => (window.toolGuide.chipLabel(b).length > window.toolGuide.chipLabel(a).length ? b : a))
    })
    await setTool(page, { mode: longest.mode, submode: longest.submode })
    const heading = region(page, 'Mouse').getByRole('heading', { level: 3 })
    const lines = () => heading.evaluate((h) => Math.round(h.getBoundingClientRect().height / parseFloat(getComputedStyle(h).lineHeight)))
    assert.equal(await settle(lines, 1), 1)
    // A card narrower than the name cuts it short, with the whole name as the tooltip.
    await heading.evaluate((h) => { h.style.maxWidth = '60px' })
    assert.equal(await lines(), 1, 'a narrow headline stays on one line')
    assert.equal(await heading.getAttribute('title'), await heading.locator('.ui-hname').textContent())
  })
})
