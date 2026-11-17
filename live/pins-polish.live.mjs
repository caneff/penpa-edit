// Pins and presets made safe, stable and self-explaining (#202): a preset load and a same-name save can be undone, a tool keeps
// its pin colour, the first four chips are labelled with their keys, the controls say what they do, and the pins reorder by
// dragging. The UI is found by role and accessible name; colours and storage are read as the page holds them.
import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { chipName, newBoardSolveLink, openSolvePage, setTool, useBrowser, waitForDesk, waitForTool } from './page.mjs'
import { settle } from './settle.mjs'

const browser = useBrowser()

const pinned = (page) => page.getByRole('region', { name: 'Pinned' })
const modeCard = (page) => page.getByRole('region', { name: 'Mode' })
const recentCard = (page) => page.getByRole('region', { name: 'Recent' })
const chips = (page) => pinned(page).locator('.ui-chip')
const chipTexts = async (page) => (await chips(page).locator('.ui-chip-main').allInnerTexts()).map(chipName)
const chipColours = (page) => chips(page).evaluateAll((nodes) => nodes.map((n) => n.style.getPropertyValue('--ui-pin-colour')))
const colourOfChip = async (page, name) => {
  const texts = await chipTexts(page)
  return (await chipColours(page))[texts.indexOf(name)]
}
const presetField = (page) => pinned(page).getByRole('combobox', { name: 'Pin presets' })
const presetList = (page) => pinned(page).getByRole('listbox', { name: 'Presets' })
const undoLine = (page) => pinned(page).locator('.ui-preset-undo')
const openList = async (page) => {
  await presetList(page).waitFor({ state: 'hidden' })
  await presetField(page).click()
  await presetList(page).waitFor()
}
const savePreset = async (page, name) => {
  await pinned(page).getByRole('button', { name: 'Save pins as a preset', exact: true }).click()
  await pinned(page).getByRole('textbox', { name: 'Preset name' }).fill(name)
  await pinned(page).getByRole('button', { name: 'Save', exact: true }).click()
}
const loadPreset = async (page, name) => {
  await openList(page)
  await presetList(page).getByRole('option', { name, exact: true }).click()
  await presetList(page).waitFor({ state: 'hidden' })
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
  it('give nine pins nine different colours, and a tool keeps its colour when pinned again', withPage(async (page) => {
    await page.evaluate(() => window.pinBoard.replace(engine.listTools().slice(0, 9)))
    const colours = await settle(async () => (await chipColours(page)).length, 9).then(() => chipColours(page))
    assert.equal(new Set(colours).size, 9, `nine different colours: ${colours}`)
    const names = await chipTexts(page)
    const before = await colourOfChip(page, names[2])
    await pinned(page).getByRole('button', { name: `Unpin ${names[2]}` }).click()
    await settle(async () => (await chipTexts(page)).length, 8)
    await setTool(page, await page.evaluate((n) => {
      const tool = engine.listTools().find((t) => window.toolGuide.chipLabel(t) === n)
      return { mode: tool.mode, submode: tool.submode }
    }, names[2]))
    await modeCard(page).getByRole('button', { name: new RegExp(`^Pin `) }).click()
    await settle(async () => (await chipTexts(page)).length, 9)
    assert.equal(await colourOfChip(page, names[2]), before)
  }))

  it('survive a preset load and Reset pins', withPage(async (page) => {
    const names = await chipTexts(page)
    const before = await chipColours(page)
    await loadPreset(page, 'Slitherlink')
    await undoLine(page).getByRole('button', { name: /^Undo/ }).click()
    assert.deepEqual(await settle(() => chipColours(page), before), before)
    await page.evaluate(() => window.pinBoard.reseed())
    assert.deepEqual(await settle(() => chipTexts(page), names), names)
    assert.deepEqual(await chipColours(page), before)
  }))
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
  it('names the pin reset in plain words', withPage(async (page) => {
    await page.getByRole('button', { name: 'Settings' }).click()
    await page.getByRole('button', { name: 'Reset pins to the puzzle\'s default pins' }).waitFor()
  }))
})

describe('swatches', () => {
  it('show their digit, and twelve split six and six', withPage(async (page) => {
    await setTool(page, { mode: 'multicolor', submode: null })
    await waitForTool(page, { mode: 'multicolor', submode: null })
    const buttons = modeCard(page).getByRole('group', { name: 'Style' }).getByRole('button')
    await buttons.first().waitFor()
    const swatches = await buttons.evaluateAll((nodes) => nodes.map((n) => ({ text: n.textContent.trim(), top: Math.round(n.getBoundingClientRect().top) })))
    assert.equal(swatches.length, 12)
    assert.deepEqual(swatches.map((s) => Number(s.text)).sort((a, b) => a - b).map(String), ['1', '2', '3', '4', '5', '6', '7', '8', '9', '10', '11', '12'])
    assert.deepEqual(swatches.reduce((rows, s) => ({ ...rows, [s.top]: (rows[s.top] ?? 0) + 1 }), {}), Object.fromEntries([[swatches[0].top, 6], [swatches[11].top, 6]]))
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
    const moved = await page.evaluate((name) => {
      const tool = engine.listTools().find((t) => window.toolGuide.chipLabel(t) === name)
      return { mode: tool.mode, submode: tool.submode }
    }, before[2])
    await waitForTool(page, moved)
    assert.equal((await pinsSaved(page)).length, 3)
    await page.reload()
    await waitForDesk(page)
    assert.deepEqual(await settle(() => chipTexts(page), after), after)
  }))
})
