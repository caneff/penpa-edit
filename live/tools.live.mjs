// The tool catalog and the Mode and Mouse cards of `solve.html` (#95): the engine lists every tool a link offers and
// applies a whole one, the Mode card's tree picks any of them, and the Mouse card and the board's title bar say what
// the current one does. The UI is found by role and accessible name or test id, the board by what Penpa+ would save
// (`readEngineState`, defined by recorder.js).
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { after, before, describe, it } from 'node:test'
import { afterChange, currentTool, linkFromNewBoard, newBoardSolveLink, openSolvePage, setTool, useBrowser } from './page.mjs'
import { clickCell } from './replay.mjs'
import { settle } from './settle.mjs'

const browser = useBrowser()

// The modes a solve link offers on a square grid: every Penpa+ mode but Box, which solve mode hides.
const SOLVE_MODES = ['surface', 'multicolor', 'line', 'lineE', 'wall', 'number', 'symbol', 'special', 'cage', 'combi', 'sudoku', 'move']

// Index in `pu.centerlist` of cells clear of the board's edges.
const CELL = 12
const OTHER_CELL = 18

// With no query, a new board's link.
const openSolve = async (query) => openSolvePage(browser(), query ?? await newBoardSolveLink(browser()))

// What the solver has shaded: cell index -> the style Penpa+ saved.
const shaded = (page) => page.evaluate(() => Object.fromEntries(Object.entries(readEngineState().pu_a.surface).map(([cell, style]) => [cell, style])))

const tools = (page) => page.evaluate(() => engine.listTools())

describe('engine.listTools', () => {
  let opened
  before(async () => { opened = await openSolve() })
  after(async () => { await opened?.context.close() })

  it('lists every mode the link offers and not Box', async () => {
    const modes = [...new Set((await tools(opened.page)).map((t) => t.mode))]
    assert.deepEqual(modes, SOLVE_MODES)
  })

  it('lists sub-modes, Composite tools and Shapes, each tool once', async () => {
    const list = await tools(opened.page)
    const ids = list.map((t) => `${t.mode}/${t.submode}`)
    assert.equal(new Set(ids).size, ids.length, 'no tool twice')
    for (const id of ['line/2', 'lineE/6', 'number/7', 'sudoku/3', 'special/thermo', 'cage/2', 'move/3', 'combi/akari', 'combi/blpo', 'symbol/circle_L']) {
      assert.ok(ids.includes(id), `${id} is listed`)
    }
    assert.deepEqual(list.find((t) => t.mode === 'surface').submode, null)
  })

  it('gives each tool a name, Penpa+\'s labels and its styles with a display name', async () => {
    const list = await tools(opened.page)
    for (const t of list) {
      assert.equal(typeof t.name, 'string', `${t.mode}/${t.submode} has a name`)
      assert.notEqual(t.name, '', `${t.mode}/${t.submode} has a name`)
      assert.ok(Array.isArray(t.labels) && t.labels.length > 0, `${t.mode}/${t.submode} has Penpa+ labels`)
      for (const s of t.styles) assert.ok(Number.isInteger(s.style) && s.name, `${t.mode}/${t.submode} style ${JSON.stringify(s)}`)
    }
    const surface = list.find((t) => t.mode === 'surface')
    assert.deepEqual(surface.styles.find((s) => s.style === 2).name, 'green')
    assert.match(surface.styles.find((s) => s.style === 2).swatch, /^rgb\(/)
    const blpo = list.find((t) => t.submode === 'blpo')
    assert.ok(blpo.labels.includes('Black / dot'), 'a Composite tool carries Penpa+\'s label')
    assert.deepEqual(list.find((t) => t.submode === 'akari').styles, [], 'Akari has no style')
  })
})

// Runs in the page: draws one edge of the cell at `cell` in pen style `style` into `mode`'s layer and returns the pixel
// beside the edge's middle as [r, g, b], then takes the edge off again. Penpa+ draws the grid line over a wall, so the
// pixel is a little off the grid line, still inside the 3 px pen.
function penPixelInPage ({ mode, style, cell }) {
  const corners = pu.point[pu.centerlist[cell]].surround
  const OFF_GRID = 0.9
  const key = `${corners[0]},${corners[1]}`
  const [a, b] = [pu.point[corners[0]], pu.point[corners[1]]]
  pu[pu.mode.qa][mode][key] = style
  pu.redraw()
  const { data } = pu.ctx.getImageData(Math.floor(((a.x + b.x) / 2 + OFF_GRID) * pu.resol), Math.floor(((a.y + b.y) / 2 + OFF_GRID) * pu.resol), 1, 1)
  delete pu[pu.mode.qa][mode][key]
  pu.redraw()
  return [data[0], data[1], data[2]]
}

// A pen swatch is `#rrggbb`, a canvas's own spelling of a colour.
const rgbOf = (swatch) => swatch.slice(1).match(/../g).map((h) => parseInt(h, 16))

describe('the pen styles of line, edge line and wall (#158)', () => {
  let opened
  before(async () => { opened = await openSolve() })
  after(async () => { await opened?.context.close() })

  const COLOUR_PENS = ['green', 'black', 'grey', 'red', 'blue']

  for (const mode of ['line', 'lineE', 'wall']) {
    it(`gives every colour style of ${mode} the colour Penpa+ draws it with`, async () => {
      const tool = (await tools(opened.page)).find((t) => t.mode === mode)
      const coloured = tool.styles.filter((s) => COLOUR_PENS.includes(s.name))
      assert.deepEqual(coloured.map((s) => s.name).sort(), [...COLOUR_PENS].sort(), `${mode} lists its five colours`)
      for (const s of coloured) {
        assert.equal(typeof s.swatch, 'string', `${mode} ${s.name} has a swatch`)
        const pixel = await opened.page.evaluate(penPixelInPage, { mode, style: s.style, cell: CELL })
        assert.deepEqual(rgbOf(s.swatch), pixel, `${mode} ${s.name}: swatch ${s.swatch} against the drawn pixel`)
      }
    })
  }

  for (const [mode, submode] of [['line', '2'], ['lineE', '6'], ['wall', null]]) {
    it(`shows ${mode}'s five colours as colour chips named for the colour, not as text`, async () => {
      await opened.page.evaluate((t) => engine.setTool(t), { mode, submode, style: 3 })
      const group = opened.page.getByRole('region', { name: 'Mode' }).getByRole('group', { name: 'Style' })
      for (const name of COLOUR_PENS) {
        const button = group.getByRole('button', { name, exact: true })
        assert.equal(await button.count(), 1, `${mode} ${name} button`)
        assert.equal(await button.getAttribute('title'), name)
        assert.equal(await button.innerText(), '', `${mode} ${name} shows no text`)
        assert.equal(await button.locator('svg rect').count(), 1, `${mode} ${name} shows a colour chip`)
      }
    })
  }
})

describe('engine.setTool and engine.getTool', () => {
  let opened
  before(async () => { opened = await openSolve() })
  after(async () => { await opened?.context.close() })

  it('applies a whole tool and reads it back', async () => {
    for (const tool of [
      { mode: 'line', submode: '2', style: 8 },
      { mode: 'surface', submode: null, style: 5 },
      { mode: 'sudoku', submode: '3', style: 2 },
      { mode: 'combi', submode: 'akari', style: null },
      { mode: 'symbol', submode: 'star', style: 1 },
      { mode: 'lineE', submode: '4', style: 9 }
    ]) {
      await setTool(opened.page, tool)
      assert.deepEqual(await currentTool(opened.page), tool)
    }
  })

  it('keeps Penpa+\'s remembered sub-mode and style for a part it is not given', async () => {
    await setTool(opened.page, { mode: 'number', submode: '6', style: 8 })
    await setTool(opened.page, { mode: 'line' })
    await setTool(opened.page, { mode: 'number' })
    assert.deepEqual(await currentTool(opened.page), { mode: 'number', submode: '6', style: 8 })
  })

  it('throws on a mode, sub-mode or style the catalog does not list', async () => {
    const before = await currentTool(opened.page)
    const results = await opened.page.evaluate(() => {
      const throws = (tool) => { try { engine.setTool(tool); return false } catch { return true } }
      return {
        mode: throws({ mode: 'nonsense' }),
        box: throws({ mode: 'board' }),
        submode: throws({ mode: 'line', submode: '99' }),
        submodeOfOtherMode: throws({ mode: 'line', submode: 'thermo' }),
        submodeWhereNone: throws({ mode: 'surface', submode: '1' }),
        style: throws({ mode: 'surface', style: 99 }),
        styleWhereNone: throws({ mode: 'combi', submode: 'akari', style: 3 }),
        notAnObject: throws('line'),
        nothing: throws()
      }
    })
    assert.deepEqual(results, Object.fromEntries(Object.keys(results).map((name) => [name, true])))
    assert.deepEqual(await currentTool(opened.page), before, 'a refused tool changes nothing')
  })

  it('changes what a board click places', async () => {
    await setTool(opened.page, { mode: 'surface', style: 2 })
    await clickCell(opened.page, CELL)
    await setTool(opened.page, { mode: 'surface', style: 5 })
    await clickCell(opened.page, OTHER_CELL)
    const cells = Object.values(await shaded(opened.page))
    assert.deepEqual(cells.sort(), [2, 5])
  })
})

// solve.html never turns Penpa Lite on (#145): importing a puzz.link sudoku sets the Tab set Surface and Sudoku, and the same
// puzzle with no Tab set shows what Penpa Lite would have hidden.
const SUDOKU_LINK = 'https://puzz.link/p?sudoku/4/4/g2j1h1j3g'

async function sudokuSolveLink (withTabSet) {
  return linkFromNewBoard(browser(), async ([url, keepTabSet]) => {
    await import_url(url)
    if (!keepTabSet) UserSettings.tab_settings = []
    const link = pu.maketext_solve()
    return link.slice(link.indexOf('#'))
  }, [SUDOKU_LINK, withTabSet])
}

describe('a link with a Tab set', () => {
  let withTabSet
  let withoutTabSet
  before(async () => {
    withTabSet = await openSolve(await sudokuSolveLink(true))
    withoutTabSet = await openSolve(await sudokuSolveLink(false))
  })
  after(async () => { await withTabSet?.context.close(); await withoutTabSet?.context.close() })

  it('still seeds the pins from the Tab set', async () => {
    const chips = async ({ page }) => (await page.getByRole('region', { name: 'Pinned' }).getByRole('button', { name: /^(?!Unpin|Pin current|Save these pins as a preset)/ }).allInnerTexts())
      .map((text) => text.replace(/^\d+\s*/, '').trim())
    assert.deepEqual((await withTabSet.page.evaluate(() => engine.tabSet())).map((t) => t.mode), ['surface', 'sudoku'])
    assert.deepEqual(await settle(() => chips(withTabSet), ['Surface', 'Sudoku > Normal']), ['Surface', 'Sudoku > Normal'])
    assert.deepEqual(await withoutTabSet.page.evaluate(() => engine.tabSet()), [])
    assert.deepEqual(await chips(withoutTabSet), [])
  })

  it('lists the same tools as the same puzzle with no Tab set', async () => {
    const withList = await tools(withTabSet.page)
    assert.ok(withList.length > 4, `${withList.length} tools, not the Tab set's 4`)
    assert.deepEqual(withList, await tools(withoutTabSet.page))
  })

  it('offers the same tools in the Mode card', async () => {
    const leafNames = async ({ page }) => {
      const mode = page.getByRole('region', { name: 'Mode' })
      await mode.getByRole('combobox', { name: 'Tool' }).click()
      await mode.getByRole('button', { name: 'Everything', exact: true }).click()
      const found = await mode.getByRole('treeitem').evaluateAll((rows) => rows.filter((row) => !row.hasAttribute('aria-expanded'))
        .map((row) => `${row.dataset.mode}/${row.dataset.submode}`))
      await page.keyboard.press('Escape')
      return found
    }
    const cardNames = await leafNames(withTabSet)
    assert.equal(cardNames.length, (await tools(withTabSet.page)).length)
    assert.deepEqual(cardNames, await leafNames(withoutTabSet))
  })

  it('still leaves out a mode Penpa+ hides for another reason', async () => {
    assert.equal((await tools(withTabSet.page)).some((t) => t.mode === 'board'), false, 'solve mode hides Box')
  })
})

describe('the Mode card', () => {
  let opened
  before(async () => { opened = await openSolve() })
  after(async () => { await opened?.context.close() })

  const combobox = () => opened.page.getByRole('region', { name: 'Mode' }).getByRole('combobox', { name: 'Tool' })
  it('finds a tool by the name Penpa+ gives it', async () => {
    await combobox().click()
    await combobox().fill('Black / dot')
    await opened.page.getByRole('treeitem', { name: 'Shade + dot', exact: true }).click()
    assert.deepEqual((await currentTool(opened.page)).submode, 'blpo')
    await combobox().click()
    await combobox().fill('Helper (x)')
    assert.deepEqual(await opened.page.getByRole('region', { name: 'Mode' }).locator('[role=treeitem][data-mode]:visible')
      .evaluateAll((nodes) => nodes.map((n) => `${n.dataset.mode}/${n.dataset.submode}`)), ['line/4', 'lineE/4'])
    await opened.page.keyboard.press('Escape')
  })

  it('picks with the keyboard alone: Enter picks the first match, and Escape leaves', async () => {
    const { page } = opened
    await setTool(page, { mode: 'surface' })
    await combobox().focus()
    await page.keyboard.press('ArrowDown')
    assert.equal(await combobox().getAttribute('aria-expanded'), 'true')
    await page.keyboard.press('Escape')
    await combobox().focus()
    await combobox().fill('Diagonal line')
    await page.keyboard.press('Enter')
    assert.deepEqual({ ...(await currentTool(page)), style: 0 }, { mode: 'line', submode: '2', style: 0 })
    assert.equal(await combobox().getAttribute('aria-expanded'), 'false')

    await combobox().focus()
    await page.keyboard.press('ArrowDown')
    await page.keyboard.press('Escape')
    assert.equal(await combobox().getAttribute('aria-expanded'), 'false')
    assert.deepEqual((await currentTool(page)).submode, '2', 'Escape picks nothing')
  })

  it('shows only style buttons after the picker, and a style button sets the style', async () => {
    const { page } = opened
    await setTool(page, { mode: 'surface', style: 1 })
    const styles = page.getByRole('region', { name: 'Mode' }).getByRole('group', { name: 'Style' })
    const green = styles.getByRole('button', { name: 'green' })
    assert.equal(await settle(() => green.getAttribute('aria-pressed'), 'false'), 'false')
    await green.click()
    await settle(async () => (await currentTool(page)).style, 2)
    assert.equal((await currentTool(page)).style, 2)
    assert.equal(await settle(() => green.getAttribute('aria-pressed'), 'true'), 'true')
    await setTool(page, { mode: 'combi', submode: 'akari' })
    await settle(() => styles.count(), 0)
    assert.equal(await styles.count(), 0, 'a tool without styles shows none')
  })

  it('follows a tool set from outside', async () => {
    await setTool(opened.page, { mode: 'number', submode: '7' })
    const read = () => combobox().inputValue()
    assert.equal(await settle(read, 'Candidates'), 'Candidates')
  })
})

describe('Number orientation', () => {
  let opened
  before(async () => { opened = await openSolve() })
  after(async () => { await opened?.context.close() })

  const group = () => opened.page.getByRole('region', { name: 'Mode' }).getByRole('group', { name: 'Orientation' })
  const orientation = () => opened.page.evaluate(() => engine.getOrientation())
  const DIRECTIONS = ['R', 'UR', 'U', 'UL', 'L', 'DL', 'D', 'DR']

  it('offers the eight directions of a square grid, to the mouse, in Number mode only', async () => {
    await setTool(opened.page, { mode: 'number', submode: '1' })
    assert.deepEqual(await opened.page.evaluate(() => engine.listOrientations()), DIRECTIONS)
    assert.equal(await settle(() => group().getByRole('button').count(), DIRECTIONS.length), DIRECTIONS.length)
    const names = ['right', 'up and right', 'up', 'up and left', 'left', 'down and left', 'down', 'down and right']
    for (const [i, direction] of DIRECTIONS.entries()) {
      await group().getByRole('button', { name: names[i], exact: true }).click()
      assert.equal(await settle(orientation, direction), direction)
      const pressed = group().getByRole('button', { name: names[i], exact: true })
      assert.equal(await settle(() => pressed.getAttribute('aria-pressed'), 'true'), 'true')
    }
    await setTool(opened.page, { mode: 'surface', style: 1 })
    assert.equal(await settle(() => group().count(), 0), 0)
    assert.equal(await orientation(), null)
  })

  it('is set with the keyboard, on the Number sub-modes 1 and 7', async () => {
    for (const submode of ['1', '7']) {
      await setTool(opened.page, { mode: 'number', submode })
      await settle(() => group().count(), 1)
      // The card redraws in the frame after a change, and a redraw between focus and key press drops the focus.
      await afterChange(opened.page)
      await group().getByRole('button', { name: 'up', exact: true }).focus()
      await opened.page.keyboard.press('Enter')
      assert.equal(await settle(orientation, 'U'), 'U')
      await afterChange(opened.page)
      await group().getByRole('button', { name: 'right', exact: true }).focus()
      await opened.page.keyboard.press('Enter')
      assert.equal(await settle(orientation, 'R'), 'R')
    }
  })

  it('offers nothing, and no empty group, on a grid with no directions', async () => {
    const link = await linkFromNewBoard(browser(), () => {
      document.getElementById('nb_size1').value = 3
      document.getElementById('nb_size2').value = 3
      UserSettings.gridtype = 'hex'
      create_newboard()
      const url = pu.maketext_solve()
      return url.slice(url.indexOf('#'))
    })
    const hex = await openSolvePage(browser(), link)
    try {
      await setTool(hex.page, { mode: 'number', submode: '1' })
      assert.deepEqual(await hex.page.evaluate(() => engine.listOrientations()), [])
      assert.equal(await hex.page.evaluate(() => engine.getOrientation()), null)
      await hex.page.getByRole('region', { name: 'Mode' }).getByRole('combobox', { name: 'Tool' }).waitFor()
      assert.equal(await hex.page.getByRole('region', { name: 'Mode' }).getByText('Orientation', { exact: true }).count(), 0)
    } finally {
      await hex.context.close()
    }
  })

  it('follows an orientation set from outside, and the engine refuses a bad one', async () => {
    await setTool(opened.page, { mode: 'number', submode: '1' })
    await opened.page.evaluate(() => engine.setOrientation('DL'))
    assert.equal(await settle(() => group().getByRole('button', { name: 'down and left', exact: true }).getAttribute('aria-pressed'), 'true'), 'true')
    const bad = (d) => opened.page.evaluate((d) => { try { engine.setOrientation(d); return 'no throw' } catch (e) { return e.message } }, d)
    assert.match(await bad('X'), /no direction "X"/)
    await setTool(opened.page, { mode: 'surface', style: 1 })
    assert.match(await bad('U'), /not number/)
  })
})

describe('the Mouse card and the title bar', () => {
  let opened
  before(async () => { opened = await openSolve() })
  after(async () => { await opened?.context.close() })

  const headline = () => opened.page.getByRole('region', { name: 'Mouse' }).getByRole('heading', { level: 3 })
  const titleBarTool = () => opened.page.getByTestId('board-tool-name')

  it('names mode, sub-mode and style, in the card and in the title bar', async () => {
    await setTool(opened.page, { mode: 'line', submode: '4', style: 3 })
    assert.equal(await settle(() => headline().textContent(), 'Line · helper × · green'), 'Line · helper × · green')
    assert.equal(await settle(() => titleBarTool().textContent(), 'Line · helper × · green'), 'Line · helper × · green')
    await setTool(opened.page, { mode: 'combi', submode: 'akari' })
    assert.equal(await settle(() => headline().textContent(), 'Composite · Bulbs + dots'), 'Composite · Bulbs + dots')
    assert.equal(await settle(() => titleBarTool().textContent(), 'Composite · Bulbs + dots'), 'Composite · Bulbs + dots')
  })

  // The card's rows as [gesture, effect] pairs.
  const rows = () => opened.page.getByRole('region', { name: 'Mouse' }).locator('.ui-mrow')
    .evaluateAll((els) => els.map((el) => [...el.children].map((c) => c.textContent)))

  // One tool of each mode family, with the rows its agreed wording gives (research/mouse-card-wording-2026-11.md).
  const WORDING = [
    [{ mode: 'surface', style: 2 }, 'Surface · green', [
      ['Left click', 'paint the cell → clear'], ['Right click', 'paint the 2nd colour → clear'],
      ['Drag', 'paint many cells; starting on a painted cell: clear many'],
      ['Right drag', '2nd colour on many cells (starting on it: clear many)'],
      ['Alt + drag', 'paint a rectangle (starting on the colour: clear it; square grids only)'],
      ['Alt + right drag', 'rectangle in the 2nd colour (square grids only)'], ['Digit', 'pick colour n']]],
    [{ mode: 'line', submode: '1' }, 'Line · Normal', [['Left click', '—'], ['Right click', '—'],
      ['Drag', 'line through cell centres; starting on it: erase']]],
    [{ mode: 'lineE', submode: '4' }, 'Edge · helper ×', [['Left click', '× on the grid line → clear'], ['Right click', '—'], ['Drag', '—']]],
    [{ mode: 'wall' }, 'Wall', [['Left click', '—'], ['Right click', '—'], ['Drag', 'straight wall through cell centres, from edge middle to edge middle; it does not turn within a drag; starting on it: erase']]],
    [{ mode: 'number', submode: '3' }, 'Number · quarter', [['Left click', 'cursor to the nearest cell corner spot'],
      ['Right click', 'cursor to the nearest cell corner spot'], ['Drag', '—'], ['Digit', 'number at the cursor']]],
    [{ mode: 'combi', submode: 'blwh' }, 'Composite · Black + white circles', [['Left click', 'white ○ → black ● → clear'],
      ['Right click', 'black ● → white ○ → clear'], ['Drag', 'repeat the first cell\'s change on each cell'], ['Given circles', 'left alone']]],
    [{ mode: 'special', submode: 'thermo' }, 'Special · Thermometer', [['Left click', 'on a thermometer\'s bulb: erase it'], ['Right click', '—'],
      ['Drag', 'thermometer from the bulb cell through cells, diagonals too; drag back to undo a step']]],
    [{ mode: 'cage', submode: '2' }, 'Cage · free lines', [['Left click', '—'], ['Right click', '—'],
      ['Drag', 'cage line through points a quarter cell in from the corners; starting on it: erase']]],
    [{ mode: 'move', submode: '2' }, 'Move · numbers', [['Left click', '—'], ['Right click', '—'],
      ['Drag', 'move a number you entered to an empty cell']]],
    [{ mode: 'symbol', submode: 'circle_L' }, 'Shape · Circle L', [['Left click', 'the shape\'s first variant → clear; on another variant: the first variant'],
      ['Right click', 'cursor to the cell'], ['Drag', '—'], ['Digit', 'shape variant n at the cursor → clear (same digit)']]],
    [{ mode: 'symbol', submode: 'cross' }, 'Shape · Cross arms', [['Left click', 'cursor to the cell'], ['Right click', 'cursor to the cell'],
      ['Drag', '—'], ['Digit', 'add or remove part n of the shape at the cursor']]]
  ]

  for (const [tool, name, expected] of WORDING) {
    it(`words ${tool.mode}/${tool.submode ?? ''} as agreed`, async () => {
      await setTool(opened.page, tool)
      await settle(() => headline().textContent(), name)
      assert.deepEqual(await rows(), expected)
    })
  }

  it('says Left click, Right click and Drag first for every tool, and has no row for the style', async () => {
    await setTool(opened.page, { mode: 'surface', style: 2 })
    await settle(() => headline().textContent(), 'Surface · green')
    assert.deepEqual((await rows()).slice(0, 3).map(([gesture]) => gesture), ['Left click', 'Right click', 'Drag'])
    assert.doesNotMatch(await opened.page.getByRole('region', { name: 'Mouse' }).locator('.ui-mrows').textContent(), /green/)
  })

  it('words Left click, Right click and Drag as the agreed table says, for every tool in it', async () => {
    // `research/mouse-card-wording-2026-11.md`: rows `| mode/submode | name | Left click | Right click | Drag | ...`.
    const agreed = readFileSync(new URL('../research/mouse-card-wording-2026-11.md', import.meta.url), 'utf8').split('\n')
      .map((line) => line.split('|').map((cell) => cell.trim()))
      .filter((cells) => /^[a-zA-Z]+\/[\w+]*$/.test(cells[1] ?? '') && cells.length > 6)
      .map((cells) => [cells[1], cells.slice(3, 6)])
    assert.ok(agreed.length > 40, `read ${agreed.length} agreed rows`)
    const tools = await opened.page.evaluate(() => engine.listTools().map(({ mode, submode, styles }) => ({ mode, submode, style: styles[0]?.style ?? null })))
    const offered = new Set(tools.map((t) => `${t.mode}/${t.submode ?? ''}`))
    const differ = []
    let checked = 0
    for (const [key, words] of agreed) {
      if (!offered.has(key)) continue
      const tool = tools.find((t) => `${t.mode}/${t.submode ?? ''}` === key)
      // The card draws on the engine's change, a frame or two after `setTool`.
      const shown = await opened.page.evaluate(async (t) => {
        engine.setTool(t)
        await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)))
        return [...document.querySelectorAll('section[aria-label="Mouse"] .ui-mrow')].slice(0, 3).map((r) => r.children[1].textContent)
      }, tool)
      checked++
      if (shown.join(' | ') !== words.join(' | ')) differ.push(`${key}: card ${shown.join(' | ')} vs agreed ${words.join(' | ')}`)
    }
    assert.ok(checked > 40, `checked ${checked} tools against the table`)
    assert.deepEqual(differ, [])
  })

  it('keeps the card\'s height the same for every tool', async () => {
    const heights = await opened.page.evaluate(async () => {
      const card = document.querySelector('section[aria-label="Mouse"]')
      const seen = {}
      for (const t of engine.listTools()) {
        for (const style of t.styles.length ? [t.styles[0].style, t.styles.at(-1).style] : [null]) {
          engine.setTool({ mode: t.mode, submode: t.submode, style })
          await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)))
          const name = card.querySelector('h3').textContent
          if (!name) throw new Error(`no headline for ${t.mode}/${t.submode}`)
          seen[card.getBoundingClientRect().height] = (seen[card.getBoundingClientRect().height] ?? 0) + 1
        }
      }
      return seen
    })
    assert.equal(Object.keys(heights).length, 1, `one height, saw ${JSON.stringify(heights)}`)
  })
})

describe('a mode solve mode hides', () => {
  it('is still the tool in use, and the cards draw it without an error', async () => {
    const opened = await openSolve()
    try {
      await opened.page.evaluate(() => pu.mode_set('board'))
      assert.equal((await currentTool(opened.page)).mode, 'board')
      const headline = opened.page.getByRole('region', { name: 'Mouse' }).getByRole('heading', { level: 3 })
      assert.equal(await settle(() => headline.textContent(), 'board'), 'board')
    } finally {
      await opened.context.close()
    }
  })
})
