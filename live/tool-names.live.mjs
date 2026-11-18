// One name per tool across the Mode card, the Board card's label, the Mouse card's headline, the Pinned chips and the Recent chips
// (#190), the tool-change banner and the Board card's colour cue, which mirrors the current pin's chip (#243). The UI is found by role and accessible name where it has one, else by its class or test id; the tool is set through `engine`.
import assert from 'node:assert/strict'
import { before, after, describe, it } from 'node:test'
import { afterChange, chipName, listedTools, newBoardSolveLink, openSolvePage, setTool, shareOf, useBrowser, waitForTool } from './page.mjs'
import { settle } from './settle.mjs'

const browser = useBrowser()

const region = (page, name) => page.getByRole('region', { name })
const boardLabel = (page) => page.getByTestId('board-tool-name')
const mouseName = (page) => region(page, 'Mouse').getByRole('heading', { level: 3 }).locator('.ui-hname')
const modeName = (page) => region(page, 'Mode').getByRole('combobox', { name: 'Tool' }).inputValue()
const pickerRow = (page, { mode, submode }) => page.locator(`[role=tree] [role=treeitem][data-mode="${mode}"][data-submode="${submode ?? ''}"]`)
// The Penpa+ name a picker row shows: the part in parentheses, or the whole name when the row shows one name. It drops the "Mode > " the
// row's branch shows, so `shownName` gives it back.
const pickerPenpa = async (page, tool) => {
  const row = pickerRow(page, tool)
  const penpa = await row.locator('.ui-tpenpa').allTextContents()
  return penpa.length ? penpa[0].slice(1, -1) : row.locator('.ui-tname').textContent()
}
const pickerName = async (page, tool) => {
  const penpa = await pickerPenpa(page, tool)
  const branch = await pickerRow(page, tool).evaluate((row) => row.parentElement.parentElement.previousElementSibling?.querySelector('.ui-tname')?.textContent)
  return (await labelOf(page, tool)).startsWith(`${branch} > `) ? `${branch} > ${penpa}` : penpa
}
// The chip name the shared name gives `tool`.
const labelOf = (page, tool) => page.evaluate((t) => window.toolGuide.chipLabel(engine.listTools().find((x) => x.mode === t.mode && x.submode === t.submode)), tool)
// Waits until the first Recent chip is `tool`'s, not an earlier tool's still on show, and returns it.
const recentChipOf = async (page, tool) => {
  const label = await labelOf(page, tool)
  await settle(async () => (await chipTexts(region(page, 'Recent')))[0], label)
  return region(page, 'Recent').locator('.ui-chip-main').first()
}
const chipTexts = async (card) => (await card.locator('.ui-chip-main').allInnerTexts()).map(chipName)

const pin = (page, entries) => page.evaluate((e) => window.pinBoard.replace(e), entries)

// How many tests each loop over every tool splits into.
const BOARD_SHARES = 8
const RECENT_SHARES = 4

describe('one name per tool', () => {
  let opened
  before(async () => { opened = await openSolvePage(browser(), await newBoardSolveLink(browser(), ['Line Normal'])) })
  after(async () => { await opened?.context.close() })

  it('offers over a hundred tools, and the shares each loop is split into hold every one of them once', async () => {
    const tools = await listedTools(opened.page)
    assert.ok(tools.length > 100, `${tools.length} tools listed`)
    for (const count of [BOARD_SHARES, RECENT_SHARES]) {
      const shares = Array.from({ length: count }, (_, share) => shareOf(tools, share, count))
      assert.deepEqual(shares.flat().sort((a, b) => tools.indexOf(a) - tools.indexOf(b)), tools, `${count} shares hold every tool once`)
    }
  })

  // Each share of the tools is its own test, so the loop over every tool stays inside the seam's per-test timeout (#284).
  for (let share = 0; share < BOARD_SHARES; share++) {
    it(`reads the same on the Board label, the Mouse headline, the Mode card, the picker leaf and the Pinned chip, for every tool (share ${share + 1} of ${BOARD_SHARES})`, async () => {
      const { page } = opened
      const tools = shareOf(await listedTools(page), share, BOARD_SHARES)
      assert.ok(tools.length > 0, 'the share holds tools')
      await pin(page, tools.map(({ mode, submode }) => ({ mode, submode, style: null })))
      const chips = await settle(async () => (await chipTexts(region(page, 'Pinned'))).length, tools.length)
      assert.equal(chips, tools.length, 'a chip per tool')
      const names = await chipTexts(region(page, 'Pinned'))
      const unequal = []
      for (const [i, tool] of tools.entries()) {
        await setTool(page, tool)
        const seen = await settle(async () => [await boardLabel(page).textContent(), await mouseName(page).textContent(), await modeName(page), await pickerName(page, tool)],
          [names[i], names[i], names[i], names[i]])
        if (seen.some((text) => text !== names[i])) unequal.push({ tool, chip: names[i], board: seen[0], mouse: seen[1], mode: seen[2], picker: seen[3] })
      }
      assert.deepEqual(unequal, [])
    })
  }

  for (let share = 0; share < RECENT_SHARES; share++) {
    it(`reads the same on a Recent chip as the shared name gives, for every tool (share ${share + 1} of ${RECENT_SHARES})`, async () => {
      const { page } = opened
      await pin(page, [])
      const unequal = []
      for (const tool of shareOf(await listedTools(page), share, RECENT_SHARES)) {
        await setTool(page, tool)
        const label = await labelOf(page, tool)
        const first = await settle(async () => (await chipTexts(region(page, 'Recent')))[0], label)
        if (first !== label) unequal.push({ tool, name: label, recent: first })
      }
      assert.deepEqual(unequal, [])
    })
  }

  it('names each Composite tool by the text of its combisub_ span on the page, on the chip and the picker leaf, with the plain name as the chip\'s hover text', async () => {
    const { page } = opened
    const composites = await page.evaluate(() => engine.listTools().filter((t) => t.mode === 'combi')
      .map(({ submode }) => ({ submode, penpa: document.getElementById(`combisub_${submode}`).textContent.replace(/\s+/g, ' ').trim() })))
    assert.ok(composites.length > 15, `${composites.length} Composite tools listed`)
    await pin(page, composites.map(({ submode }) => ({ mode: 'combi', submode, style: null })))
    await settle(async () => (await chipTexts(region(page, 'Pinned'))).length, composites.length)
    assert.deepEqual(await chipTexts(region(page, 'Pinned')), composites.map((c) => c.penpa))
    const leaves = []
    for (const { submode, penpa } of composites) leaves.push([penpa, await pickerPenpa(page, { mode: 'combi', submode })])
    assert.deepEqual(leaves.filter(([want, got]) => want !== got), [])
    const blpo = composites.findIndex((c) => c.submode === 'blpo')
    assert.equal(composites[blpo].penpa, 'Black / dot')
    assert.equal(await region(page, 'Pinned').locator('.ui-chip-main').nth(blpo).getAttribute('title'), 'Shade + dot', 'the plain name is the chip\'s hover text')
  })

  it('shows a picker row as the plain name, then Penpa+\'s name in smaller parentheses, once when they match, without the mode its branch shows', async () => {
    const { page } = opened
    const rowOf = async (tool) => {
      const row = pickerRow(page, tool)
      return {
        plain: await row.locator('.ui-tname').textContent(),
        penpa: await row.locator('.ui-tpenpa').allTextContents(),
        smaller: await row.evaluate((r) => {
          const part = r.querySelector('.ui-tpenpa')
          return part ? parseFloat(getComputedStyle(part).fontSize) < parseFloat(getComputedStyle(r.querySelector('.ui-tname')).fontSize) : null
        })
      }
    }
    assert.deepEqual(await rowOf({ mode: 'surface' }), { plain: 'Shade cells', penpa: ['(Surface)'], smaller: true })
    assert.deepEqual(await rowOf({ mode: 'combi', submode: 'blpo' }), { plain: 'Shade + dot', penpa: ['(Black / dot)'], smaller: true })
    assert.deepEqual(await rowOf({ mode: 'line', submode: '1' }), { plain: 'Line', penpa: ['(Normal)'], smaller: true }, 'no "Line >" under the Line branch')
    assert.deepEqual(await rowOf({ mode: 'wall' }), { plain: 'Wall', penpa: [], smaller: null }, 'matching names show once')
    assert.equal(await pickerRow(page, { mode: 'surface' }).getAttribute('title'), 'Click paints the chosen colour, right the 2nd colour; drag paints many.')
  })

  it('keeps Penpa+\'s name alone on the Board label and the Pinned chip of a tool the picker shows by its plain name', async () => {
    const { page } = opened
    await pin(page, [{ mode: 'line', submode: '1', style: null }])
    await setTool(page, { mode: 'line', submode: '1' })
    assert.equal(await settle(async () => (await chipTexts(region(page, 'Pinned')))[0], 'Line > Normal'), 'Line > Normal')
    assert.equal(await settle(() => boardLabel(page).textContent(), 'Line > Normal'), 'Line > Normal')
  })

  it('keeps a hand name for the Number sub-modes whose Penpa+ label is an icon', async () => {
    const { page } = opened
    const names = await page.evaluate(() => engine.listTools().filter((t) => t.mode === 'number' && ['3', '9'].includes(t.submode)).map((t) => t.submodeName))
    assert.deepEqual(names, ['quarter', 'side'])
  })

  it('gives a chip the tool\'s plain name as its tooltip, and none when the plain names do not know the tool', async () => {
    const { page } = opened
    const [surface] = (await listedTools(page)).filter((t) => t.mode === 'surface')
    await pin(page, [{ ...surface, style: null }])
    await setTool(page, { mode: 'line', submode: '1' })
    await settle(async () => (await chipTexts(region(page, 'Pinned'))).length, 1)
    const lineChip = await recentChipOf(page, { mode: 'line', submode: '1' })
    assert.equal(await region(page, 'Pinned').locator('.ui-chip-main').getAttribute('title'), 'Shade cells')
    assert.equal(await lineChip.getAttribute('title'), 'Line', 'a Recent chip too')
    const unknown = await page.evaluate(() => engine.listTools().find((t) => !window.toolGuide.tooltipAttrs(t).title))
    assert.ok(unknown, 'some listed tool has no plain name')
    await pin(page, [{ mode: unknown.mode, submode: unknown.submode, style: null }])
    await settle(async () => (await chipTexts(region(page, 'Pinned'))).length, 1)
    assert.equal(await region(page, 'Pinned').locator('.ui-chip-main').getAttribute('title'), null)
    await pin(page, [])
    await setTool(page, { mode: unknown.mode, submode: unknown.submode })
    const unknownChip = await recentChipOf(page, unknown)
    assert.equal(await unknownChip.getAttribute('title'), null, 'a Recent chip too')
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
    await pin(page, [{ mode: 'symbol', submode: 'ox_B', style: null }])
    const chip = region(page, 'Pinned').locator('.ui-chip').first()
    assert.equal(await settle(async () => (await chip.locator('.ui-chip-main').innerText()).includes('×'), true), true, 'the chip\'s name holds a ×')
    assert.equal(await chip.getByRole('button', { name: /^Unpin/ }).innerText(), '', 'the remove button has no × text')
    assert.equal(await chip.getByRole('button', { name: /^Unpin/ }).locator('svg').count(), 1, 'the remove button is an icon')
  })
})

describe('the Board card\'s colour cue', () => {
  let opened
  before(async () => { opened = await openSolvePage(browser(), await newBoardSolveLink(browser(), ['Sudoku Normal', 'Sudoku Corner', 'Sudoku Centre'])) })
  after(async () => { await opened?.context.close() })

  // The label's text and pill and the card's frame, as computed colours.
  const cue = (page) => page.evaluate(() => {
    const label = document.querySelector('[data-testid="board-tool-name"]')
    return {
      text: getComputedStyle(label).color,
      pill: getComputedStyle(label).backgroundColor,
      frame: getComputedStyle(label.closest('section, [role=region]')).outlineColor
    }
  })
  // The dot before the label's name, as a computed colour, or null with none.
  const labelDot = (page) => boardLabel(page).evaluate((label) => {
    const dot = label.querySelector('.ui-dot')
    return dot && getComputedStyle(dot).backgroundColor
  })
  // The computed fill of the current chip, once it is the one `name` labels and its colours have eased in.
  const currentChipFill = async (page, name) => {
    const chip = region(page, 'Pinned').locator('.ui-chip.is-current', { hasText: name })
    await chip.waitFor()
    await page.evaluate(() => Promise.all(document.getAnimations().map((a) => a.finished)))
    return chip.evaluate((node) => getComputedStyle(node).backgroundColor)
  }
  const rgbOf = (page, css) => page.evaluate((c) => {
    const probe = document.createElement('i')
    probe.style.color = c
    document.body.append(probe)
    const rgb = getComputedStyle(probe).color
    probe.remove()
    return rgb
  }, css)

  it('takes the current pin\'s chip colour for the label\'s pill and the frame, with white text, for each of three Sudoku pins', async () => {
    const { page } = opened
    const seen = []
    for (const [submode, name] of [['1', 'Sudoku > Normal'], ['2', 'Sudoku > Corner'], ['3', 'Sudoku > Centre']]) {
      await setTool(page, { mode: 'sudoku', submode })
      const fill = await currentChipFill(page, name)
      const want = { text: 'rgb(255, 255, 255)', pill: fill, frame: fill }
      assert.deepEqual(await settle(() => cue(page), want), want, name)
      seen.push(fill)
    }
    assert.equal(new Set(seen).size, 3, `three pins, three colours: ${seen}`)
  })

  it('puts a dot in the selected style\'s colour before the name', async () => {
    const { page } = opened
    const green = await page.evaluate(() => engine.listTools().find((x) => x.mode === 'sudoku' && x.submode === '1').styles.find((s) => s.name === 'green'))
    // Landing on a pin restores the pin's style, so the style is chosen once the tool is current.
    await setTool(page, { mode: 'sudoku', submode: '1' })
    await waitForTool(page, { mode: 'sudoku', submode: '1' })
    await afterChange(page)
    await setTool(page, { mode: 'sudoku', submode: '1', style: green.style })
    const want = await rgbOf(page, green.swatch)
    assert.equal(await settle(() => labelDot(page), want), want)
  })

  it('shows a neutral grey pill and frame for a tool that is not pinned', async () => {
    const { page } = opened
    await setTool(page, { mode: 'line', submode: '1' })
    const grey = await rgbOf(page, '#585d68')
    const want = { text: 'rgb(255, 255, 255)', pill: grey, frame: grey }
    assert.deepEqual(await settle(() => cue(page), want), want)
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
