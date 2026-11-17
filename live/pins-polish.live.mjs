// Pins and presets made safe, stable and self-explaining (#202): a preset load and a same-name save can be undone, a tool keeps
// its pin colour, the first four chips are labelled with their keys, the controls say what they do, and the pins reorder by
// dragging. The UI is found by role and accessible name; colours and storage are read as the page holds them.
import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { chipName, newBoardSolveLink, openSolvePage, setTool, useBrowser, waitForDesk, waitForTool } from './page.mjs'
import { choosePreset, openList, pinnedCard, presetField, presetList, savePreset } from './pin-card.mjs'
import { settle } from './settle.mjs'

const browser = useBrowser()

const pinned = pinnedCard
const modeCard = (page) => page.getByRole('region', { name: 'Mode' })
const recentCard = (page) => page.getByRole('region', { name: 'Recent' })
const chips = (page) => pinned(page).locator('.ui-chip')
const chipTexts = async (page) => (await chips(page).locator('.ui-chip-main').allInnerTexts()).map(chipName)
const chipColours = (page) => chips(page).evaluateAll((nodes) => nodes.map((n) => n.style.getPropertyValue('--ui-pin-colour')))
const colourOfChip = async (page, name) => {
  const texts = await chipTexts(page)
  return (await chipColours(page))[texts.indexOf(name)]
}
const undoLine = (page) => pinned(page).locator('.ui-preset-undo')
const loadPreset = choosePreset
// The `{ mode, submode }` of the tool a chip's name stands for.
const toolNamed = (page, name) => page.evaluate((n) => {
  const tool = engine.listTools().find((t) => window.toolGuide.chipLabel(t) === n)
  return { mode: tool.mode, submode: tool.submode }
}, name)
// Pins the tool at `index` of the tool list, through the Mode card's pin button.
const pinToolAt = async (page, index) => {
  const tool = await page.evaluate((i) => { const t = engine.listTools()[i]; return { mode: t.mode, submode: t.submode, name: window.toolGuide.chipLabel(t) } }, index)
  await setTool(page, { mode: tool.mode, submode: tool.submode })
  await modeCard(page).getByRole('button', { name: `Pin ${tool.name}`, exact: true }).click()
  return tool.name
}
const pinsSaved = (page) => page.evaluate(() => {
  const key = Object.keys(localStorage).find((k) => k.startsWith('chinstrap.pins:'))
  return JSON.parse(localStorage.getItem(key)).pins.map((p) => `${p.mode}/${p.submode ?? ''}`)
})

const TAB_SET = ['Line Normal', 'Sudoku Corner', 'Surface']
const linkHash = () => newBoardSolveLink(browser(), TAB_SET)

const withPage = (body) => async () => {
  const opened = await openSolvePage(browser(), await linkHash())
  try {
    await body(opened.page)
  } finally {
    await opened.context.close()
  }
}

describe('preset undo', () => {
  it('Undo after a load brings the earlier pins back', withPage(async (page) => {
    const earlier = await chipTexts(page)
    assert.equal(earlier.length, 3)
    await loadPreset(page, 'Slitherlink')
    assert.notDeepEqual(await settle(() => chipTexts(page), earlier), earlier, 'the preset replaced the pins')
    await undoLine(page).getByRole('button', { name: /^Undo/ }).click()
    assert.deepEqual(await settle(() => chipTexts(page), earlier), earlier)
  }))

  it('saving under an existing name offers an Undo that brings the earlier preset back', withPage(async (page) => {
    await savePreset(page, 'Mine')
    await pinned(page).getByRole('button', { name: 'Unpin Surface' }).click()
    await savePreset(page, 'Mine')
    await undoLine(page).getByText(/Replaced/).waitFor()
    await undoLine(page).getByRole('button', { name: /^Undo/ }).click()
    await loadPreset(page, 'Mine')
    assert.deepEqual(await settle(() => chipTexts(page), ['Line > Normal', 'Sudoku > Corner', 'Surface']), ['Line > Normal', 'Sudoku > Corner', 'Surface'])
  }))

  it('the Deleted line clears when the list closes', withPage(async (page) => {
    await savePreset(page, 'Mine')
    await openList(page)
    await presetList(page).getByRole('button', { name: 'Delete preset Mine' }).click()
    await undoLine(page).getByText(/Deleted/).waitFor()
    await page.keyboard.press('Escape')
    await presetList(page).waitFor({ state: 'hidden' })
    assert.equal(await settle(() => undoLine(page).textContent(), ''), '')
  }))

  it('Ctrl+Z in the preset field undoes a delete, for a keyboard that cannot reach the Undo button', withPage(async (page) => {
    await savePreset(page, 'Mine')
    await openList(page)
    await presetField(page).fill('mine your')
    await page.keyboard.press('ArrowDown')
    await page.keyboard.press('Shift+Delete')
    await undoLine(page).getByText(/Deleted/).waitFor()
    await page.keyboard.press('Control+z')
    await undoLine(page).getByText(/Deleted/).waitFor({ state: 'detached' })
    assert.equal(await presetList(page).getByRole('option', { name: 'Mine', exact: true }).count(), 1)
  }))

  it('an Undo line goes away after a few seconds', async () => {
    const opened = await openSolvePage(browser(), await linkHash())
    try {
      const { page } = opened
      await page.clock.install()
      await loadPreset(page, 'Slitherlink')
      await undoLine(page).getByRole('button', { name: /^Undo/ }).waitFor()
      await page.clock.runFor(60000)
      assert.equal(await settle(() => undoLine(page).textContent(), ''), '')
    } finally {
      await opened.context.close()
    }
  })
})

describe('pin colours', () => {
  // Every tool the grid offers, far past any fixed list of colours.
  it('give every pin its own colour, however many there are', withPage(async (page) => {
    const count = await page.evaluate(() => { window.pinBoard.replace(engine.listTools()); return engine.listTools().length })
    assert.ok(count > 30, `${count} pins, well past a short palette`)
    await settle(async () => (await chipColours(page)).length, count)
    const colours = await chipColours(page)
    assert.equal(new Set(colours).size, count, `${count} pins, ${new Set(colours).size} different colours`)
  }))

  it('keep a tool\'s colour when it is pinned again, though another tool was pinned meanwhile', withPage(async (page) => {
    await page.evaluate(() => window.pinBoard.replace(engine.listTools().slice(0, 8)))
    await settle(async () => (await chipColours(page)).length, 8)
    const names = await chipTexts(page)
    const before = await colourOfChip(page, names[2])
    await pinned(page).getByRole('button', { name: `Unpin ${names[2]}` }).click()
    await settle(async () => (await chipTexts(page)).length, 7)
    await pinToolAt(page, 8)
    await settle(async () => (await chipTexts(page)).length, 8)
    await setTool(page, await toolNamed(page, names[2]))
    await modeCard(page).getByRole('button', { name: `Pin ${names[2]}`, exact: true }).click()
    await settle(async () => (await chipTexts(page)).length, 9)
    assert.equal(await colourOfChip(page, names[2]), before)
    const colours = await chipColours(page)
    assert.equal(new Set(colours).size, 9, `still nine different colours: ${colours}`)
  }))

  it('survive a preset load and the Puzzle defaults entry', withPage(async (page) => {
    const names = await chipTexts(page)
    const before = await chipColours(page)
    await loadPreset(page, 'Slitherlink')
    await undoLine(page).getByRole('button', { name: /^Undo/ }).click()
    assert.deepEqual(await settle(() => chipColours(page), before), before)
    await loadPreset(page, 'Slitherlink')
    assert.notDeepEqual(await settle(() => chipTexts(page), names), names, 'other pins are showing')
    await loadPreset(page, 'Puzzle defaults')
    assert.deepEqual(await settle(() => chipTexts(page), names), names)
    assert.deepEqual(await chipColours(page), before)
  }))

  // A stored value this code did not write must not reach a chip's colour: each of these is read as no colour for the tool.
  for (const colours of [null, 'red', { 'line/1': 1.5, 'sudoku/2': 'x', 'surface/': -1 }]) {
    it(`are real colours whatever a stored value holds: ${JSON.stringify(colours)}`, withPage(async (page) => {
      await page.evaluate((bad) => {
        const key = Object.keys(localStorage).find((k) => k.startsWith('chinstrap.pins:'))
        localStorage.setItem(key, JSON.stringify({ ...JSON.parse(localStorage.getItem(key)), colours: bad }))
      }, colours)
      await page.reload()
      await waitForDesk(page)
      await settle(async () => (await chipColours(page)).length, 3)
      const drawn = await chipColours(page)
      assert.equal(drawn.every((c) => /^hsl\(\d/.test(c)), true, `colours: ${drawn}`)
      assert.equal(new Set(drawn).size, 3)
    }))
  }
})

describe('the chips', () => {
  it('label the first four Z, X, C and V and later ones with no key', withPage(async (page) => {
    await page.evaluate(() => window.pinBoard.replace(engine.listTools().slice(0, 6)))
    await settle(async () => (await chips(page).count()), 6)
    const keys = await chips(page).locator('.ui-chip-num').allInnerTexts()
    assert.deepEqual(keys, ['Z', 'X', 'C', 'V'])
  }))

  it('say Pin or Unpin in a title, and the × is a bigger target', withPage(async (page) => {
    assert.equal(await pinned(page).getByRole('button', { name: 'Unpin Surface' }).getAttribute('title'), 'Unpin Surface')
    await setTool(page, { mode: 'wall', submode: null })
    assert.equal(await modeCard(page).getByRole('button', { name: 'Pin Wall' }).getAttribute('title'), 'Pin Wall')
    const box = await pinned(page).getByRole('button', { name: 'Unpin Surface' }).boundingBox()
    assert.ok(box.width >= 22 && box.height >= 22, `the × is ${box.width} x ${box.height}, at least 22 x 22`)
  }))

  it('Recent chips have no tan bar', withPage(async (page) => {
    await setTool(page, { mode: 'wall', submode: null })
    await recentCard(page).getByRole('button', { name: 'Pin Wall' }).waitFor()
    const bar = await recentCard(page).locator('.ui-chip').first().evaluate((n) => getComputedStyle(n).borderLeftWidth)
    assert.equal(bar, '1px')
  }))

  it('have a hover state', withPage(async (page) => {
    const chip = chips(page).nth(1)
    const rest = await chip.evaluate((n) => getComputedStyle(n).backgroundColor)
    await chip.hover()
    assert.notEqual(await settle(() => chip.evaluate((n) => getComputedStyle(n).backgroundColor), rest), rest)
  }))

  it('an empty Pinned card says how to pin', withPage(async (page) => {
    await page.evaluate(() => window.pinBoard.replace([]))
    await pinned(page).getByText(/pin button/i).waitFor()
  }))
})

describe('Settings', () => {
  it('has no Reset pins button', withPage(async (page) => {
    await page.getByRole('button', { name: 'Settings' }).click()
    await page.getByRole('button', { name: 'Reset layout' }).first().waitFor()
    assert.equal(await page.getByRole('button', { name: /Reset pins/ }).count(), 0)
  }))
})

describe('swatches', () => {
  const swatchGroup = (page) => modeCard(page).getByRole('group', { name: 'Style' }).getByRole('button')

  it('show the key that picks each, and twelve split six and six', withPage(async (page) => {
    await setTool(page, { mode: 'multicolor', submode: null })
    await waitForTool(page, { mode: 'multicolor', submode: null })
    await swatchGroup(page).first().waitFor()
    const swatches = await swatchGroup(page).evaluateAll((nodes) => nodes.map((n) => ({ text: n.textContent.trim(), top: Math.round(n.getBoundingClientRect().top) })))
    assert.deepEqual(swatches.map((s) => s.text), ['1', '2', '3', '4', '5', '6', '7', '8', '9', '0', '11', '12'])
    assert.deepEqual(swatches.reduce((rows, s) => ({ ...rows, [s.top]: (rows[s.top] ?? 0) + 1 }), {}), Object.fromEntries([[swatches[0].top, 6], [swatches[11].top, 6]]))
  }))

  it('are picked by the key they show', withPage(async (page) => {
    await setTool(page, { mode: 'surface', submode: null })
    await waitForTool(page, { mode: 'surface', submode: null })
    await swatchGroup(page).first().waitFor()
    const labels = await swatchGroup(page).evaluateAll((nodes) => nodes.map((n) => n.textContent.trim()))
    // Descending, and without 1: Penpa+ reads 1 then 2 pressed together as the twelfth colour.
    for (const key of labels.filter((l) => l.length === 1 && l !== '1').reverse()) {
      await page.keyboard.press(`Digit${key}`)
      const pressed = swatchGroup(page).and(page.locator('[aria-pressed="true"]'))
      assert.equal(await settle(async () => (await pressed.allInnerTexts()).map((t) => t.trim()), [key]).then((t) => t[0]), key, `key ${key} presses the swatch labelled ${key}`)
    }
  }))
})

describe('dragging a chip', () => {
  it('moves it, Z selects the moved tool, and the order survives a reload', withPage(async (page) => {
    const before = await chipTexts(page)
    const third = chips(page).nth(2)
    const first = chips(page).nth(0)
    const box = await first.boundingBox()
    await third.dragTo(first, { targetPosition: { x: 2, y: box.height / 2 } })
    const after = [before[2], before[0], before[1]]
    assert.deepEqual(await settle(() => chipTexts(page), after), after)
    await page.keyboard.press('KeyZ')
    await waitForTool(page, await toolNamed(page, before[2]))
    assert.equal((await pinsSaved(page)).length, 3)
    await page.reload()
    await waitForDesk(page)
    assert.deepEqual(await settle(() => chipTexts(page), after), after)
  }))
})
