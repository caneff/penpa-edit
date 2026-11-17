// Pin presets of `solve.html` (#98, #159): the Pinned card's "Pin presets" combobox loads a built-in set (one per genre, filed by
// family) or one the solver saved, replacing the puzzle's pins. Typing filters the list; a star files a preset under Favourites;
// a saved set can be deleted, with an undo. Saved sets and stars are kept in localStorage and offered on every puzzle. The UI is
// found by role and accessible name; the pins are read by walking them with Tab and by `engine.getTool()`.
import assert from 'node:assert/strict'
import { after, before, describe, it } from 'node:test'
import { currentTool, newBoardSolveLink, openPenpa, openSolvePage, useBrowser, waitForDesk } from './page.mjs'
import { choosePreset, closed, nameField, openList, pinnedCard, presetField, presetList, saveButton, savePreset } from './pin-card.mjs'
import { settle } from './settle.mjs'

const browser = useBrowser()

// A Tab set that names the modes the first built-in presets pin.
const BROAD_TAB_SET = ['Sudoku Normal', 'Line Normal', 'Wall', 'Number Normal', 'Surface']

// Every tab, so the link lists every tool a square grid has.
const allTabs = async () => {
  const { page, context } = await openPenpa(browser(), '')
  try {
    return await page.evaluate(() => PenpaText.modes.EN.slice())
  } finally {
    await context.close()
  }
}

const link = (tabSet) => newBoardSolveLink(browser(), tabSet)
const openSolve = (hash) => openSolvePage(browser(), hash)

const toolKeyOf = ({ mode, submode }) => `${mode}/${submode ?? ''}`

const offered = (page) => presetList(page).getByRole('option').allInnerTexts()
const groupTitles = (page) => presetList(page).getByRole('group').evaluateAll((groups) => groups.map((g) => g.getAttribute('aria-label')))
const optionsOfGroup = (page, title) => presetList(page).getByRole('group', { name: title }).getByRole('option').allInnerTexts()
const hasFavourites = (page) => groupTitles(page).then((titles) => titles.includes('Favourites'))
const star = (page, name) => presetList(page).getByRole('button', { name: `Favourite ${name}`, exact: true })

// Presses Tab and returns the tool it switched to.
async function tabToNextTool (page) {
  const before = toolKeyOf(await currentTool(page))
  await page.keyboard.press('Tab')
  await settle(async () => toolKeyOf(await currentTool(page)) !== before, true)
  return toolKeyOf(await currentTool(page))
}

// The tools the pins hold, in order: starts on the first pin and Tabs round once.
async function walkPins (page, count) {
  const keys = []
  await pinnedCard(page).getByRole('button', { name: /^Z/ }).click()
  keys.push(toolKeyOf(await currentTool(page)))
  for (let i = 1; i < count; i++) {
    keys.push(await tabToNextTool(page))
  }
  return keys
}

// Stores saved presets as an earlier visit would have, then reloads so the page starts from them.
const seedSavedPresets = async (page, presets) => {
  await page.evaluate((value) => localStorage.setItem('chinstrap.pinPresets', JSON.stringify(value)), presets)
  await page.reload()
  await waitForDesk(page)
}


const chipCount = (page) => pinnedCard(page).getByRole('button', { name: /^Unpin / }).count()

// A pick hands the keyboard back to the puzzle (#157): focus is off the Pinned card, the preset's pins are loaded, and Tab lands on
// one of them without the focus returning to the card.
const focusInPinnedCard = (page) => page.evaluate(() => document.activeElement?.closest('.ui-card-pins') !== null)
const assertTabCyclesPins = async (page, keys) => {
  assert.equal(await settle(() => focusInPinnedCard(page), false), false, 'focus left the Pinned card')
  assert.equal(await settle(() => chipCount(page), keys.length), keys.length)
  assert.equal(keys.includes(await tabToNextTool(page)), true, `Tab lands on one of ${keys}`)
  assert.equal(await focusInPinnedCard(page), false, 'focus is still off the Pinned card after Tab')
}

// The tools a setter draws Sudoku clues with; other genres may pin some of them to solve.
const CLUE_TOOLS = [
  'special/thermo', 'special/arrows', 'cage/1', 'symbol/circle_SS', 'symbol/circle_L', 'symbol/square_L', 'symbol/circle_M',
  'symbol/arrow_eight', 'symbol/sudokuetc', 'number/1', 'number/5'
]

// The genres with solving tools of their own; a Sudoku variant is Classic sudoku.
const EXPECTED_GENRES = [
  'Classic sudoku', 'Sudoku with lines and marks', 'Slitherlink', 'Tapa', 'Star battle', 'Tents', 'Heyawake', 'Nurikabe', 'LITS',
  'Battleships', 'Minesweeper', 'Akari', 'Sun and moon', 'Statue park', 'Kakuro', 'Kurotto', 'Pentominous', 'Yajilin', 'Pencils',
  'Darts', 'Anglers', 'Hotaru beam', 'Masyu', 'Fillomino', 'Nonogram', 'Hashi', 'Skyscrapers'
]

describe('the built-in presets', () => {
  let opened
  before(async () => {
    opened = await openSolve(await link(await allTabs()))
    // Every tab seeds a pin each, which would crowd the Pinned card's field under the Recent card.
    await opened.page.evaluate(() => window.pinBoard.replace([]))
  })
  after(async () => { await opened?.context.close() })

  it('cover every common genre, filed by family', async () => {
    const { page } = opened
    await openList(page)
    const names = await offered(page)
    const titles = await groupTitles(page)
    await page.keyboard.press('Escape')
    for (const genre of EXPECTED_GENRES) {
      assert.equal(names.includes(genre), true, `${genre} is offered`)
    }
    assert.deepEqual(titles, ['Number placement', 'Loops and paths', 'Shading', 'Regions', 'Objects and placement'])
    assert.equal(names.length, new Set(names).size, 'no name is offered twice')
  })

  it('pin no Sudoku clue-drawing tool, and every Sudoku preset pins the three entry modes first', async () => {
    const { page } = opened
    await openList(page)
    const presets = await presetList(page).getByRole('option').evaluateAll((options) =>
      options.map((o) => ({ name: o.textContent, tools: o.dataset.tools.split(',') })))
    await page.keyboard.press('Escape')
    for (const { name, tools } of presets) {
      if (tools.includes('sudoku/1')) {
        assert.deepEqual(tools.slice(0, 3), ['sudoku/1', 'sudoku/2', 'sudoku/3'], `${name} starts with the entry modes`)
        assert.deepEqual(tools.filter((key) => CLUE_TOOLS.includes(key)), [], `${name} pins a clue tool`)
      }
    }
  })

  it('each load every tool it names, in order, on a square grid with every tab', async () => {
    const { page } = opened
    await openList(page)
    const presets = await presetList(page).getByRole('option').evaluateAll((options) =>
      options.map((o) => ({ name: o.textContent, tools: o.dataset.tools.split(',') })))
    await page.keyboard.press('Escape')
    const listed = await page.evaluate(() => engine.listTools().map((t) => `${t.mode}/${t.submode ?? ''}`))
    for (const { name, tools } of presets) {
      for (const key of tools) {
        assert.equal(listed.includes(key), true, `${name}: ${key} is a listed tool`)
      }
      await choosePreset(page, name)
      assert.equal(await settle(() => chipCount(page), tools.length), tools.length, `${name}: one pin per tool`)
      assert.deepEqual(await walkPins(page, tools.length), tools, `${name}: the pins are its tools`)
    }
  })
})

describe('loading a built-in preset', () => {
  let opened
  before(async () => { opened = await openSolve(await link(BROAD_TAB_SET)) })
  after(async () => { await opened?.context.close() })

  it('replaces the pins with its set', async () => {
    const { page } = opened
    assert.equal(await settle(() => chipCount(page), 5), 5)
    await choosePreset(page, 'Classic sudoku')
    assert.equal(await settle(() => chipCount(page), 3), 3)
    assert.deepEqual(await walkPins(page, 3), ['sudoku/1', 'sudoku/2', 'sudoku/3'])
  })
})

describe('typing in the preset field', () => {
  let opened
  before(async () => { opened = await openSolve(await link(BROAD_TAB_SET)) })
  after(async () => { await opened?.context.close() })

  it('filters the list by name, and by family', async () => {
    const { page } = opened
    await presetField(page).fill('masyu')
    assert.deepEqual(await offered(page), ['Masyu'])
    await presetField(page).fill('loops')
    const loops = await optionsOfGroup(page, 'Loops and paths')
    assert.equal(loops.includes('Slitherlink'), true)
    assert.deepEqual(await groupTitles(page), ['Loops and paths'])
    await presetField(page).fill('zzzz')
    assert.deepEqual(await offered(page), [])
    assert.equal(await presetList(page).getByText('No preset matches.').count(), 1)
    await page.keyboard.press('Escape')
    await closed(page)
  })

  it('picks the highlighted preset with Arrow keys and Enter, and hands the keyboard back to the board', async () => {
    const { page } = opened
    await closed(page)
    await presetField(page).click()
    await presetField(page).fill('lines and marks')
    await page.keyboard.press('ArrowDown')
    await page.keyboard.press('Enter')
    await closed(page)
    await assertTabCyclesPins(page, ['sudoku/1', 'sudoku/2', 'sudoku/3', 'line/1', 'line/4'])
  })

  it('closes on Escape and loads nothing', async () => {
    const { page } = opened
    const before = await chipCount(page)
    await presetField(page).click()
    await presetField(page).fill('masyu')
    await page.keyboard.press('Escape')
    await closed(page)
    assert.equal(await chipCount(page), before)
  })

  it('Shift+Enter with nothing highlighted loads nothing', async () => {
    const { page } = opened
    const before = await chipCount(page)
    await presetField(page).click()
    await presetField(page).fill('masyu')
    await page.keyboard.press('Shift+Enter')
    await presetList(page).waitFor()
    assert.equal(await chipCount(page), before, 'no preset was loaded')
    assert.equal(await star(page, 'Masyu').getAttribute('aria-pressed'), 'false', 'and none was starred')
    await page.keyboard.press('Escape')
    await closed(page)
  })

  it('picks with the mouse and hands the keyboard back to the board', async () => {
    const { page } = opened
    await choosePreset(page, 'Classic sudoku')
    await assertTabCyclesPins(page, ['sudoku/1', 'sudoku/2', 'sudoku/3'])
  })
})

describe('favourites', () => {
  let opened
  before(async () => { opened = await openSolve(await link(BROAD_TAB_SET)) })
  after(async () => { await opened?.context.close() })

  it('a star files the preset first, under Favourites; it survives a reload; unstarring puts it back', async () => {
    const { page } = opened
    await openList(page)
    assert.equal(await hasFavourites(page), false, 'no favourites yet')
    assert.equal(await star(page, 'Masyu').getAttribute('aria-pressed'), 'false')
    await star(page, 'Masyu').click()
    assert.equal(await star(page, 'Masyu').getAttribute('aria-pressed'), 'true')
    assert.equal((await groupTitles(page))[0], 'Favourites')
    assert.deepEqual(await optionsOfGroup(page, 'Favourites'), ['Masyu'])
    assert.equal((await optionsOfGroup(page, 'Loops and paths')).includes('Masyu'), false, 'moved out of its family')
    await page.keyboard.press('Escape')

    await page.reload()
    await waitForDesk(page)
    await openList(page)
    assert.deepEqual(await optionsOfGroup(page, 'Favourites'), ['Masyu'])
    await star(page, 'Masyu').click()
    assert.equal(await hasFavourites(page), false, 'the group goes with its last star')
    assert.equal((await optionsOfGroup(page, 'Loops and paths')).includes('Masyu'), true, 'back in its family')
    await page.keyboard.press('Escape')
  })

  it('a star on a built-in preset that no longer exists is ignored, with no page error', async () => {
    const { page } = opened
    await page.evaluate(() => localStorage.setItem('chinstrap.pinPresetStars', JSON.stringify(['built-in:Kropki', 'built-in:Masyu'])))
    await page.reload()
    await waitForDesk(page)
    await openList(page)
    assert.deepEqual(await optionsOfGroup(page, 'Favourites'), ['Masyu'])
    assert.equal(await presetList(page).getByRole('option', { name: 'Kropki' }).count(), 0)
    await star(page, 'Masyu').click()
    assert.equal(await page.evaluate(() => localStorage.getItem('chinstrap.pinPresetStars')), '[]', 'the stale star left storage with the next write')
    await page.keyboard.press('Escape')
    await closed(page)
  })

  it('Shift+Enter stars the highlighted preset from the keyboard, and loading one still works from Favourites', async () => {
    const { page } = opened
    await closed(page)
    await presetField(page).click()
    await presetField(page).fill('lines and marks')
    await page.keyboard.press('ArrowDown')
    await page.keyboard.press('Shift+Enter')
    assert.equal(await star(page, 'Sudoku with lines and marks').getAttribute('aria-pressed'), 'true')
    assert.deepEqual(await optionsOfGroup(page, 'Favourites'), ['Sudoku with lines and marks'])
    await page.keyboard.press('Shift+Enter')
    assert.equal(await star(page, 'Sudoku with lines and marks').getAttribute('aria-pressed'), 'false')
    await page.keyboard.press('Shift+Enter')
    await page.keyboard.press('Enter')
    await closed(page)
    assert.equal(await settle(() => chipCount(page), 5), 5)
    await openList(page)
    await star(page, 'Sudoku with lines and marks').click()
    await page.keyboard.press('Escape')
  })
})

describe('the compact save flow', () => {
  let opened
  before(async () => { opened = await openSolve(await link(['Line Normal', 'Sudoku Corner', 'Wall'])) })
  after(async () => { await opened?.context.close() })

  const storedNames = (page) => page.evaluate(() => JSON.parse(localStorage.getItem('chinstrap.pinPresets') ?? '[]').map((p) => p.name))

  it('rests with no name field, at most 140 px tall with three pins', async () => {
    const { page } = opened
    await page.setViewportSize({ width: 1366, height: 768 })
    await page.evaluate(() => window.pinBoard.replace([{ mode: 'line', submode: '1' }, { mode: 'sudoku', submode: '2' }, { mode: 'sudoku', submode: '1' }]))
    assert.equal(await settle(() => chipCount(page), 3), 3)
    assert.equal(await nameField(page).count(), 0, 'no name field at rest')
    const height = await pinnedCard(page).evaluate((card) => card.getBoundingClientRect().height)
    assert.equal(height <= 140, true, `the Pinned card is ${height} px tall`)
  })

  it('opens a name field from the icon; Escape and Cancel close it storing nothing, Enter and Save store', async () => {
    const { page } = opened
    await saveButton(page).click()
    await nameField(page).fill('Never')
    await page.keyboard.press('Escape')
    assert.equal(await nameField(page).isVisible(), false)
    await saveButton(page).click()
    assert.equal(await nameField(page).inputValue(), '', 'it reopens empty')
    await nameField(page).fill('Never')
    await pinnedCard(page).getByRole('button', { name: 'Cancel', exact: true }).click()
    assert.equal(await nameField(page).isVisible(), false)
    assert.deepEqual(await storedNames(page), [])
    await saveButton(page).click()
    await nameField(page).fill('By enter')
    await page.keyboard.press('Enter')
    assert.equal(await nameField(page).isVisible(), false, 'it closes on save')
    assert.deepEqual(await storedNames(page), ['By enter'])
    await page.evaluate(() => window.pinBoard.replace([{ mode: 'wall', submode: null }]))
    assert.equal(await settle(() => chipCount(page), 1), 1)
    await choosePreset(page, 'By enter')
    assert.equal(await settle(() => chipCount(page), 3), 3, 'the saved preset loads back')
    assert.deepEqual(await walkPins(page, 3), ['line/1', 'sudoku/2', 'sudoku/1'])
  })

  it('keeps a typed name when the icon is clicked again, and Escape closes it from the Save button too', async () => {
    const { page } = opened
    await saveButton(page).click()
    await nameField(page).fill('Half')
    await saveButton(page).click()
    assert.equal(await nameField(page).inputValue(), 'Half')
    await pinnedCard(page).getByRole('button', { name: 'Save', exact: true }).focus()
    await page.keyboard.press('Escape')
    assert.equal(await nameField(page).isVisible(), false)
    assert.equal(await settle(() => focusInPinnedCard(page), false), false, 'the focus left the card')
  })
})

describe('saving a preset', () => {
  let opened
  before(async () => { opened = await openSolve(await link(['Line Normal', 'Sudoku Corner'])) })
  after(async () => { await opened?.context.close() })

  it('is an icon button with a tooltip, which opens a field that says what it is for', async () => {
    const { page } = opened
    assert.equal(await saveButton(page).getAttribute('title'), 'Save pins as a preset')
    await saveButton(page).click()
    assert.equal(await nameField(page).getAttribute('placeholder'), 'Name this pin set')
    await page.keyboard.press('Escape')
    const host = pinnedCard(page).locator('wa-button[title="Save pins as a preset"]')
    assert.equal(await host.locator('svg').count(), 1, 'it shows an icon')
    assert.equal(await host.evaluate((node) => [...node.childNodes].filter((n) => n.nodeType === 3 || (n.nodeType === 1 && !n.matches('svg, .ui-sr-only'))).length), 0, 'and no text')
  })

  it('survives a reload, is listed under Your presets and appears on another puzzle', async () => {
    const { page } = opened
    await savePreset(page, 'My pair')
    await page.reload()
    await waitForDesk(page)
    await page.getByRole('button', { name: 'Unpin Line > Normal' }).click()
    await openList(page)
    assert.deepEqual(await optionsOfGroup(page, 'Your presets'), ['My pair'])
    assert.equal((await groupTitles(page)).at(-1), 'Your presets')
    await page.keyboard.press('Escape')
    await choosePreset(page, 'My pair')
    assert.equal(await settle(() => chipCount(page), 2), 2)
    assert.deepEqual(await walkPins(page, 2), ['line/1', 'sudoku/2'])

    const other = await link(['Line Normal', 'Sudoku Corner', 'Wall'])
    const base = page.url().split('#')[0]
    await page.goto('about:blank')
    await page.goto(base + other)
    await waitForDesk(page)
    await choosePreset(page, 'My pair')
    assert.equal(await settle(() => chipCount(page), 2), 2)
    assert.deepEqual(await walkPins(page, 2), ['line/1', 'sudoku/2'])
  })
})

describe('deleting a saved preset', () => {
  let opened
  before(async () => {
    opened = await openSolve(await link(['Line Normal']))
    await seedSavedPresets(opened.page, [
      { name: 'First', tools: [{ mode: 'line', submode: '1' }] },
      { name: 'Second', tools: [{ mode: 'line', submode: '1' }] }
    ])
  })
  after(async () => { await opened?.context.close() })

  const deleteButton = (page, name) => presetList(page).getByRole('button', { name: `Delete preset ${name}`, exact: true })

  it('removes it from the list and from storage, and offers undo; built-ins have no delete control', async () => {
    const { page } = opened
    await openList(page)
    assert.equal(await presetList(page).getByRole('button', { name: /^Delete preset/ }).count(), 2, 'one per saved preset, none on a built-in')
    assert.equal(await presetList(page).locator('[role=option][data-tools]').filter({ hasText: /^Masyu$/ }).count(), 1)
    await deleteButton(page, 'First').click()
    assert.deepEqual(await optionsOfGroup(page, 'Your presets'), ['Second'])
    assert.equal(await page.evaluate(() => JSON.parse(localStorage.getItem('chinstrap.pinPresets')).map((p) => p.name).join()), 'Second')
    await pinnedCard(page).getByRole('button', { name: 'Undo delete of First' }).click()
    assert.deepEqual(await optionsOfGroup(page, 'Your presets'), ['First', 'Second'], 'undo puts it back where it was')
    await deleteButton(page, 'Second').click()
    assert.equal(await page.evaluate(() => JSON.parse(localStorage.getItem('chinstrap.pinPresets')).map((p) => p.name).join()), 'First')
    await page.keyboard.press('Escape')
    await closed(page)
  })

  it('stays gone after a reload', async () => {
    const { page } = opened
    await page.reload()
    await waitForDesk(page)
    await openList(page)
    assert.deepEqual(await optionsOfGroup(page, 'Your presets'), ['First'])
    await page.keyboard.press('Escape')
  })

  it('a starred preset that is deleted and brought back is starred again, and a deleted one is not left starred', async () => {
    const { page } = opened
    await openList(page)
    await star(page, 'First').click()
    assert.deepEqual(await optionsOfGroup(page, 'Favourites'), ['First'])
    await deleteButton(page, 'First').click()
    assert.equal(await hasFavourites(page), false)
    assert.equal(await page.evaluate(() => localStorage.getItem('chinstrap.pinPresetStars')), '[]', 'the deleted preset is no longer starred in storage')
    await pinnedCard(page).getByRole('button', { name: 'Undo delete of First' }).click()
    assert.deepEqual(await optionsOfGroup(page, 'Favourites'), ['First'])
    await star(page, 'First').click()
    await page.keyboard.press('Escape')
  })
})

describe('a preset naming a tool the link lacks', () => {
  let opened
  before(async () => {
    const hash = await link(['Line Normal'])
    opened = await openSolvePage(browser(), hash, {
      setup: (context) => context.addInitScript(() => {
        localStorage.setItem('chinstrap.pinPresets', JSON.stringify([
          { name: 'Odd set', tools: [{ mode: 'nosuchmode', submode: null }, { mode: 'line', submode: '1' }] }
        ]))
      })
    })
  })
  after(async () => { await opened?.context.close() })

  it('skips that tool and keeps the rest', async () => {
    const { page } = opened
    await choosePreset(page, 'Odd set')
    assert.equal(await settle(() => chipCount(page), 1), 1)
    assert.deepEqual(await walkPins(page, 1), ['line/1'])
  })
})

describe('undoing a delete', () => {
  let opened
  before(async () => {
    opened = await openSolve(await link(['Line Normal', 'Sudoku Corner']))
    await seedSavedPresets(opened.page, [{ name: 'A', tools: [{ mode: 'line', submode: '1' }] }])
  })
  after(async () => { await opened?.context.close() })

  it('is no longer offered once a preset of that name is saved, so it cannot replace the newer one', async () => {
    const { page } = opened
    await openList(page)
    await presetList(page).getByRole('button', { name: 'Delete preset A', exact: true }).click()
    await page.keyboard.press('Escape')
    await savePreset(page, 'A')
    assert.equal(await pinnedCard(page).getByRole('button', { name: 'Undo delete of A' }).count(), 0)
    assert.deepEqual(await page.evaluate(() => JSON.parse(localStorage.getItem('chinstrap.pinPresets')).map((p) => p.tools.length)), [2])
  })
})

describe('stored favourites this page did not write', () => {
  let opened
  before(async () => {
    opened = await openSolvePage(browser(), await link(['Line Normal']), {
      setup: (context) => context.addInitScript(() => localStorage.setItem('chinstrap.pinPresetStars', '{"a":1}'))
    })
  })
  after(async () => { await opened?.context.close() })

  it('offer no favourite, and the list still opens', async () => {
    const { page } = opened
    await openList(page)
    assert.equal(await hasFavourites(page), false)
    assert.equal((await offered(page)).includes('Classic sudoku'), true)
    await page.keyboard.press('Escape')
  })
})
