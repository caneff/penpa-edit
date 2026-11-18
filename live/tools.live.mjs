// The tool catalog and the Mode and Mouse cards of `solve.html` (#95): the engine lists every tool a link offers and
// applies a whole one, the Mode card's tree picks any of them, and the Mouse card and the board's title bar say what
// the current one does. The UI is found by role and accessible name or test id, the board by what Penpa+ would save
// (`readEngineState`, defined by recorder.js).
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { after, before, describe, it } from 'node:test'
import { afterChange, cardBodyButtons, chipName, currentTool, linkFromNewBoard, newBoardSolveLink, openSolvePage, setTool, useBrowser } from './page.mjs'
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
    assert.equal(surface.styles.find((s) => s.style === 2).swatch, '#b3ffb3', 'green is the colour Penpa+ fills it with')
    const blpo = list.find((t) => t.submode === 'blpo')
    assert.ok(blpo.labels.includes('Black / dot'), 'a Composite tool carries Penpa+\'s label')
    assert.deepEqual(list.find((t) => t.submode === 'akari').styles, [], 'Akari has no style')
  })

  it('says "line", not "loop", for the Composite tools that draw one; only the Angle loop shape keeps the word (#186)', async () => {
    const loops = await opened.page.evaluate(() => engine.listTools().filter((t) => t.submode !== 'angleloop').flatMap((t) => {
      const { left, right, drag, digit, more } = toolGuide.mouseRows(t)
      const words = [t.submodeName, toolGuide.placeTool(t).plainName, toolGuide.placeTool(t).description, left, right, drag, digit, ...more.flat()]
      return words.filter((w) => /loop/i.test(w ?? '')).map((w) => `${t.mode}/${t.submode}: ${w}`)
    }))
    assert.deepEqual(loops, [])
    const names = await opened.page.evaluate(() => Object.fromEntries(engine.listTools()
      .filter((t) => ['linex', 'lineox', 'yajilin', 'angleloop'].includes(t.submode)).map((t) => [t.submode, toolGuide.placeTool(t).plainName])))
    assert.deepEqual(names, { linex: 'Line + edge ×', lineox: 'Line + cell ○ ×', yajilin: 'Shade + line', angleloop: 'Angle loop' })
  })
})

// Runs in the page: draws one edge of the cell at `cell` in pen style `style` into `mode`'s layer and returns the pixel
// beside the edge's middle as [r, g, b], then takes the edge off again. Penpa+ draws the grid line over a wall, so the
// pixel is a little off the grid line, still inside the 3 px pen. On solve.html both lines grow with the cell (#330), so the
// offset grows as the pen does: its width on the board over its width on a canvas of its own.
function penPixelInPage ({ mode, style, cell }) {
  const corners = pu.point[pu.centerlist[cell]].surround
  const scratch = document.createElement('canvas').getContext('2d')
  set_line_style(scratch, style)
  set_line_style(pu.ctx, style)
  const OFF_GRID = 0.9 * pu.ctx.lineWidth / scratch.lineWidth
  const key = `${corners[0]},${corners[1]}`
  const [a, b] = [pu.point[corners[0]], pu.point[corners[1]]]
  pu[pu.mode.qa][mode][key] = style
  pu.redraw()
  const { data } = pu.ctx.getImageData(Math.floor(((a.x + b.x) / 2 + OFF_GRID) * pu.resol), Math.floor(((a.y + b.y) / 2 + OFF_GRID) * pu.resol), 1, 1)
  delete pu[pu.mode.qa][mode][key]
  pu.redraw()
  return [data[0], data[1], data[2]]
}

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
        assert.deepEqual(await rgbOfColour(opened.page, s.swatch), pixel, `${mode} ${s.name}: swatch ${s.swatch} against the drawn pixel`)
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

// Runs in the page: puts a "1" in `style` into the cell at `cell` of Number mode's normal sub-mode and returns the pixels at
// each of `dxs` cell-widths right of the cell's centre as [r, g, b] (0.3 is inside the disc some styles draw, clear of the
// digit; 0.41 to 0.43 is its ring), then takes the digit off again.
function numberPixelsInPage ({ style, cell, dxs }) {
  const index = pu.centerlist[cell]
  pu[pu.mode.qa].number[index] = ['1', style, '1']
  pu.redraw()
  const { x, y } = pu.point[index]
  const pixels = dxs.map((dx) => {
    const { data } = pu.ctx.getImageData(Math.floor((x + dx * pu.size) * pu.resol), Math.floor(y * pu.resol), 1, 1)
    return [data[0], data[1], data[2]]
  })
  delete pu[pu.mode.qa].number[index]
  pu.redraw()
  return pixels
}

// A CSS colour as [r, g, b], read through a canvas.
const rgbOfColour = (page, colour) => page.evaluate((c) => {
  const ctx = document.createElement('canvas').getContext('2d')
  ctx.fillStyle = c
  ctx.fillRect(0, 0, 1, 1)
  return [...ctx.getImageData(0, 0, 1, 1).data].slice(0, 3)
}, colour)

const distance = (a, b) => Math.max(...a.map((v, i) => Math.abs(v - b[i])))

// Runs in the page: draws the SVG of a button at 4x and counts the pixels in its middle (clear of the disc's ring) that are
// near black, near white and near red, so what the button shows is read, not the attributes that make it.
async function middleInkInPage (svgMarkup) {
  const image = new Image()
  image.src = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svgMarkup)}`
  await image.decode()
  const canvas = document.createElement('canvas')
  canvas.width = canvas.height = 80
  const ctx = canvas.getContext('2d')
  ctx.drawImage(image, 0, 0, 80, 80)
  const { data } = ctx.getImageData(0, 0, 80, 80)
  const count = { black: 0, white: 0, red: 0 }
  for (let y = 16; y < 64; y++) {
    for (let x = 16; x < 64; x++) {
      const [r, g, b, a] = data.slice((y * 80 + x) * 4, (y * 80 + x) * 4 + 4)
      if (a < 200) continue
      if (r < 60 && g < 60 && b < 60) count.black++
      else if (r > 215 && g > 215 && b > 215) count.white++
      else if (r > 200 && g < 60 && b < 60) count.red++
    }
  }
  return count
}

describe('the text styles of Number as samples (#166)', () => {
  let opened
  before(async () => { opened = await openSolve() })
  after(async () => { await opened?.context.close() })

  const NUMBER_SUBMODES = ['1', '10', '6', '5', '7', '3', '9', '8']
  const SAMPLE_STYLES = { 0: 'outline', 6: 'black on white circle', 7: 'white on black circle', 11: 'white on red circle' }
  const styleGroup = () => opened.page.getByRole('region', { name: 'Mode' }).getByRole('group', { name: 'Style' })
  const styleButton = (name) => styleGroup().getByRole('button', { name, exact: true })

  for (const submode of NUMBER_SUBMODES) {
    it(`labels no Style button of Number sub-mode ${submode} with a #n code, and names each in words`, async () => {
      await setTool(opened.page, { mode: 'number', submode, style: 1 })
      const buttons = styleGroup().getByRole('button')
      const count = await buttons.count()
      assert.ok(count >= 10, `Number lists its styles, got ${count}`)
      for (let i = 0; i < count; i++) {
        const name = await buttons.nth(i).getAttribute('aria-label')
        assert.doesNotMatch(await buttons.nth(i).innerText(), /#\d/, `button ${i} shows no code`)
        assert.doesNotMatch(name, /#|\d/, `button ${i}'s name ${name} is words`)
        assert.equal(await buttons.nth(i).getAttribute('title'), name, `button ${i}'s tooltip is its name`)
      }
      for (const name of Object.values(SAMPLE_STYLES)) {
        assert.equal(await styleButton(name).count(), 1, `${name} button`)
        assert.equal(await styleButton(name).locator('svg text').textContent(), '1', `${name} shows a sample digit`)
      }
    })
  }

  it('shows the digit of every sample, in the colours the style has', async () => {
    await setTool(opened.page, { mode: 'number', submode: '1', style: 1 })
    const inked = async (name) => opened.page.evaluate(middleInkInPage, await styleButton(name).locator('svg').evaluate((node) => node.outerHTML.replace('<svg', '<svg xmlns="http://www.w3.org/2000/svg"')))
    const onWhite = await inked(SAMPLE_STYLES[6])
    assert.ok(onWhite.black > 20 && onWhite.white > 20, `black on white circle shows a black digit on white, got ${JSON.stringify(onWhite)}`)
    const onBlack = await inked(SAMPLE_STYLES[7])
    assert.ok(onBlack.black > 20 && onBlack.white > 20, `white on black circle shows a white digit on black, got ${JSON.stringify(onBlack)}`)
    const onRed = await inked(SAMPLE_STYLES[11])
    assert.ok(onRed.red > 20 && onRed.white > 20, `white on red circle shows a white digit on red, got ${JSON.stringify(onRed)}`)
    const outline = await inked(SAMPLE_STYLES[0])
    assert.ok(outline.black > 0 && outline.white === 0 && outline.red === 0, `outline shows a black stroke only, got ${JSON.stringify(outline)}`)
  })

  it('gives each disc style\'s sample the fill and ring the board draws it with', async () => {
    const tool = (await tools(opened.page)).find((t) => t.mode === 'number' && t.submode === '1')
    const RING_DXS = [0.4, 0.41, 0.42, 0.43, 0.44]
    for (const style of [6, 7, 11]) {
      const name = SAMPLE_STYLES[style]
      assert.equal(tool.styles.find((s) => s.style === style).name, name)
      const [fillPixel, ...ringPixels] = await opened.page.evaluate(numberPixelsInPage, { style, cell: CELL, dxs: [0.3, ...RING_DXS] })
      const circle = styleButton(name).locator('svg circle')
      assert.deepEqual(await rgbOfColour(opened.page, await circle.getAttribute('fill')), fillPixel, `${name}: sample fill against the board's pixel`)
      const ring = await rgbOfColour(opened.page, await circle.getAttribute('stroke'))
      assert.ok(ringPixels.some((pixel) => distance(pixel, ring) < 60), `${name}: sample ring ${ring} is among the board's ring pixels ${JSON.stringify(ringPixels)}`)
    }
  })

  it('draws the outline sample hollow with a black stroke, as Penpa+ paints style 0', async () => {
    await setTool(opened.page, { mode: 'number', submode: '1', style: 1 })
    const text = styleButton(SAMPLE_STYLES[0]).locator('svg text')
    assert.equal(await text.getAttribute('stroke'), '#000000')
    assert.equal(await text.getAttribute('fill'), 'rgba(255, 255, 255, 0)')
  })

  it('hands out a sample the caller can change without changing the next listing', async () => {
    await opened.page.evaluate(() => { engine.listTools().find((t) => t.mode === 'number').styles.find((s) => s.style === 6).sample.disc.fill = 'red' })
    const tool = (await tools(opened.page)).find((t) => t.mode === 'number')
    assert.equal(tool.styles.find((s) => s.style === 6).sample.disc.fill, '#ffffff')
  })
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
    const chips = async ({ page }) => (await cardBodyButtons(page, 'Pinned', { name: /^(?!Unpin|Pin current|Save pins)/ }).allInnerTexts())
      .map(chipName)
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
    await opened.page.getByRole('treeitem', { name: 'Shade + dot (Black / dot)', exact: true }).click()
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
    assert.equal(await settle(read, 'Number > Candidates'), 'Number > Candidates')
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

  it('gives the tool one name, in the card and in the title bar', async () => {
    await setTool(opened.page, { mode: 'line', submode: '4', style: 3 })
    assert.equal(await settle(() => headline().textContent(), 'Line > Helper (x)'), 'Line > Helper (x)')
    assert.equal(await settle(() => titleBarTool().textContent(), 'Line > Helper (x)'), 'Line > Helper (x)')
    await setTool(opened.page, { mode: 'combi', submode: 'akari' })
    assert.equal(await settle(() => headline().textContent(), 'Akari'), 'Akari')
    assert.equal(await settle(() => titleBarTool().textContent(), 'Akari'), 'Akari')
  })

  // The card's rows as [gesture, effect] pairs.
  const rows = () => opened.page.getByRole('region', { name: 'Mouse' }).locator('.ui-mrow')
    .evaluateAll((els) => els.map((el) => [...el.children].map((c) => c.textContent)))

  // One tool of each mode family, with the rows its agreed wording gives (research/mouse-card-wording-2026-11.md).
  const WORDING = [
    [{ mode: 'surface', style: 2 }, 'Surface', [
      ['Left click', 'colour in the cell → clear'], ['Right click', '2nd colour in the cell → clear'],
      ['Drag', 'colour on many cells; starting on a coloured cell: clear many'], ['Digit', 'pick that colour (0–9)'],
      ['Right drag', '2nd colour on many cells; starting on one: clear many'],
      ['Alt + drag', 'colour in a rectangle; starting on the colour: clear it (square grids only)'],
      ['Alt + right drag', '2nd colour in a rectangle (square grids only)']]],
    [{ mode: 'line', submode: '1' }, 'Line > Normal', [['Drag', 'line through cell centres; starting on a line: clear it']]],
    [{ mode: 'lineE', submode: '4' }, 'Edge > Helper (x)', [['Left click', '× on the grid line → clear']]],
    [{ mode: 'wall' }, 'Wall', [['Drag', 'from the middle of an edge, across cells: a straight wall through their centres; it does not turn within a drag; starting on a wall: clear it']]],
    [{ mode: 'number', submode: '3' }, 'Number > Quarter', [['Left click', 'cursor on the nearest cell corner spot; cell selected'],
      ['Right click', 'cursor on the nearest cell corner spot'], ['Digit', 'number at the cursor']]],
    [{ mode: 'combi', submode: 'blwh' }, 'Yin-Yang', [['Left click', 'white ○ → black ● → clear'],
      ['Right click', 'black ● → white ○ → clear'], ['Drag', 'the first cell\'s change repeated on each cell'], ['Given circles', 'left alone']]],
    [{ mode: 'special', submode: 'thermo' }, 'Thermo', [['Left click', 'on the bulb: clear the thermometer'],
      ['Drag', 'thermometer from the bulb cell through cells, diagonals too; drag back to undo a step']]],
    [{ mode: 'cage', submode: '2' }, 'Cage > Free', [['Drag', 'cage line through points a quarter cell in from the corners; starting on a cage line: clear it']]],
    [{ mode: 'move', submode: '2' }, 'Move > Numbers', [['Drag', 'a number you entered, moved to an empty cell']]],
    [{ mode: 'symbol', submode: 'circle_L' }, 'Circle L', [['Left click', 'the shape\'s first variant → clear; on another variant: the first variant'],
      ['Right click', 'cursor on the cell'], ['Digit', 'that variant (1–9) at the cursor → clear (same digit)']]],
    [{ mode: 'symbol', submode: 'cross' }, 'Cross arms', [['Left click', 'cursor on the cell'], ['Right click', 'cursor on the cell'],
      ['Digit', 'that part (1–9) of the shape added at the cursor, again: removed']]],
    // The rows past Left click, Right click and Drag that #186 corrected, which the agreed table's check does not read.
    [{ mode: 'combi', submode: 'linex' }, 'Line x', [['Right click', '× on the edge → clear'],
      ['Drag', 'line through cell centres; starting on a line: clear it'], ['Right drag', 'from an edge: × on each edge it passes; starting on a ×: clear them']]],
    [{ mode: 'combi', submode: 'linedir' }, 'Line x<>', [['Right click', 'edge: × → arrowhead one way → the other way → clear'], ['Drag', 'line through cell centres; starting on a line: clear it'],
      ['Right drag', 'from a cell toward an edge: arrowhead on that edge pointing that way → clear (same way); '
        + 'from an edge: × on each edge it passes (starting on a mark: as a right click there; starting on the last arrowhead: clear the marks it passes)']]],
    [{ mode: 'number', submode: '7' }, 'Number > Candidates', [['Left click', 'only that cell selected'],
      ['Drag', 'many cells selected'], ['Digit', 'candidate in the selected cells, again: removed'], ['Ctrl/Shift + click', 'cell added to the selection, again: removed'],
      ['Alt + drag', 'rectangle of cells selected (square grids only)'],
      ['Double click', 'every cell with the same number selected; on candidates: only that cell selected']]],
    [{ mode: 'sudoku', submode: '1' }, 'Sudoku > Normal', [['Left click', 'only that cell selected'],
      ['Drag', 'many cells selected'], ['Digit', 'digit in the selected cells'], ['Ctrl/Shift + click', 'cell added to the selection, again: removed'],
      ['Ctrl/Shift + drag', 'from a selected cell: those cells leave the selection'],
      ['Alt + drag', 'rectangle of cells selected (square grids only)'], ['Double click', 'every cell with the same digit selected'],
      ['Shift + digit', 'corner mark in the selected cells (square grids only)'], ['Ctrl + digit', 'centre mark in the selected cells']]],
    [{ mode: 'sudoku', submode: '2' }, 'Sudoku > Corner', [['Left click', 'only that cell selected'],
      ['Drag', 'many cells selected'], ['Digit', 'corner mark in the selected cells'], ['Ctrl/Shift + click', 'cell added to the selection, again: removed'],
      ['Ctrl/Shift + drag', 'from a selected cell: those cells leave the selection'],
      ['Alt + drag', 'rectangle of cells selected (square grids only)'], ['Double click', 'every cell with the same digit selected; on corner marks only: selection cleared']]]
  ]

  for (const [tool, name, expected] of WORDING) {
    it(`words ${tool.mode}/${tool.submode ?? ''} as agreed`, async () => {
      await setTool(opened.page, tool)
      assert.equal(await settle(() => headline().textContent(), name), name)
      assert.deepEqual(await rows(), expected)
    })
  }

  it('says Left click, Right click and Drag first for every tool, and has no row for the style', async () => {
    await setTool(opened.page, { mode: 'surface', style: 2 })
    await settle(() => headline().textContent(), 'Surface')
    assert.deepEqual((await rows()).slice(0, 3).map(([gesture]) => gesture), ['Left click', 'Right click', 'Drag'])
    assert.doesNotMatch(await opened.page.getByRole('region', { name: 'Mouse' }).locator('.ui-mrows').textContent(), /green/)
  })

  // The names of the Mouse card's rows, for every tool, whose words are `text`.
  const rowsReading = (text) => opened.page.evaluate(async (wanted) => {
    const bad = []
    for (const t of engine.listTools()) {
      engine.setTool({ mode: t.mode, submode: t.submode, style: t.styles[0]?.style ?? null })
      await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)))
      for (const row of document.querySelectorAll('section[aria-label="Mouse"] .ui-mrow')) {
        if (row.children[1].textContent === wanted) bad.push(`${t.mode}/${t.submode}: ${row.children[0].textContent}`)
      }
    }
    return bad
  }, text)

  it('shows no row whose action is nothing, for any tool (#191)', async () => {
    assert.deepEqual(await rowsReading('—'), [])
  })

  // The words of a Drag that only repeats its click, written out here and not read from `toolGuide.AS_A_CLICK`, so a lost export fails the test.
  const AS_A_CLICK = 'as a click where it starts'

  it('shows no row that only repeats its click row, for any tool (#253)', async () => {
    assert.deepEqual(await rowsReading(AS_A_CLICK), [])
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
    for (const [key, agreedWords] of agreed) {
      if (!offered.has(key)) continue
      const tool = tools.find((t) => `${t.mode}/${t.submode ?? ''}` === key)
      // The card draws on the engine's change, a frame or two after `setTool`.
      const shown = await opened.page.evaluate(async (t) => {
        engine.setTool(t)
        await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)))
        // A row that does nothing is not drawn: the agreed table's `—` is a missing row.
        // The flick tools' keypad is the drag row's extra, not its words.
        const wordsOf = (cell) => { const copy = cell.cloneNode(true); copy.querySelector('.ui-keypad')?.remove(); return copy.textContent }
        const shown = Object.fromEntries([...document.querySelectorAll('section[aria-label="Mouse"] .ui-mrow')].map((r) => [r.children[0].textContent, wordsOf(r.children[1])]))
        return ['Left click', 'Right click', 'Drag'].map((gesture) => shown[gesture] ?? '—')
      }, tool)
      // A Drag row that only repeats its click row is not drawn either (#253): the agreed table's words for it are a missing row.
      const words = agreedWords[2] === AS_A_CLICK ? [...agreedWords.slice(0, 2), '—'] : agreedWords
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

// The Mouse card's wording over every tool (#203), on a laptop screen.
describe('the Mouse card reads at a glance (#203)', () => {
  let opened
  before(async () => {
    opened = await openSolvePage(browser(), await newBoardSolveLink(browser()), { contextOptions: { viewport: { width: 1366, height: 768 } } })
  })
  after(async () => { await opened?.context.close() })

  // Every tool's card: headline, then each row as { gesture, effect, isMore, gestureLines, keypad }.
  const sweep = () => opened.page.evaluate(async () => {
    const card = document.querySelector('section[aria-label="Mouse"]')
    const seen = {}
    for (const t of engine.listTools()) {
      engine.setTool({ mode: t.mode, submode: t.submode, style: t.styles[0]?.style ?? null })
      await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)))
      seen[`${t.mode}/${t.submode ?? ''}`] = {
        headline: card.querySelector('h3').textContent,
        rows: [...card.querySelectorAll('.ui-mrow')].map((row) => {
          const gesture = row.children[0]
          return {
            gesture: gesture.textContent, effect: row.children[1].textContent, isMore: row.classList.contains('is-more'),
            gestureLines: Math.round(gesture.getBoundingClientRect().height / parseFloat(getComputedStyle(gesture).lineHeight === 'normal'
              ? parseFloat(getComputedStyle(gesture).fontSize) * 1.2 : getComputedStyle(gesture).lineHeight)),
            keypad: [...row.querySelectorAll('.ui-keypad > *')].map((k) => k.textContent)
          }
        })
      }
    }
    return seen
  })
  let cards
  before(async () => { cards = await sweep() })

  it('words no tool with "erase" (bar Penpa+\'s own Edge > Erase) or a bare "n"', () => {
    const bad = Object.entries(cards).flatMap(([key, { headline, rows }]) => [headline, ...rows.flatMap((r) => [r.gesture, r.effect])]
      .filter((text) => (/erase/i.test(text) && !text.endsWith(' > Erase')) || /\bn\b/.test(text)).map((text) => `${key}: ${text}`))
    assert.deepEqual(bad, [])
  })

  it('makes Digit a main row for every tool that has one, Sudoku Normal included', () => {
    assert.equal(cards['sudoku/1'].rows.find((r) => r.gesture === 'Digit')?.isMore, false)
    const bad = Object.entries(cards).filter(([, { rows }]) => rows.some((r) => r.gesture === 'Digit' && r.isMore)).map(([key]) => key)
    assert.deepEqual(bad, [])
  })

  it('puts the main rows before the extra rows', () => {
    const bad = Object.entries(cards).filter(([, { rows }]) => rows.some((r, i) => !r.isMore && rows.slice(0, i).some((p) => p.isMore))).map(([key]) => key)
    assert.deepEqual(bad, [])
  })

  it('keeps every gesture name to 2 lines', () => {
    const bad = Object.entries(cards).flatMap(([key, { rows }]) => rows.filter((r) => r.gestureLines > 2).map((r) => `${key}: ${r.gesture} (${r.gestureLines})`))
    assert.deepEqual(bad, [])
  })

  it('shows the flick tools\' keys as a 3×3 grid, the 9th saying what it gives', () => {
    assert.deepEqual(cards['combi/numfl'].rows.find((r) => r.gesture === 'Drag').keypad, ['↖1', '↑2', '↗3', '←4', '5', '→6', '↙7', '↓8', '↘9'])
    assert.deepEqual(cards['combi/alfl'].rows.find((r) => r.gesture === 'Drag').keypad, ['↖A', '↑B', '↗C', '←D', 'E', '→F', '↙G', '↓H', '↘dash'])
  })

  it('splits the Polygon\'s Left click from its closing click, and draws no Drag row (it only repeats the click)', () => {
    const polygon = Object.fromEntries(cards['special/polygon'].rows.map((r) => [r.gesture, r.effect]))
    assert.deepEqual(Object.keys(polygon), ['Left click', 'Closing click'])
    assert.doesNotMatch(polygon['Left click'], /finish/)
    assert.match(polygon['Closing click'], /finishes the polygon/)
  })

  // The dots in the card's rows as [gesture, background colour]; `swatchOf` is Surface's style `style` colour as the browser writes it.
  const dotsOf = () => opened.page.evaluate(async () => {
    await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)))
    return [...document.querySelectorAll('section[aria-label="Mouse"] .ui-mrow')].filter((r) => r.querySelector('.ui-dot'))
      .map((r) => [r.children[0].textContent, getComputedStyle(r.querySelector('.ui-dot')).backgroundColor])
  })
  const swatchOf = (style) => opened.page.evaluate((style) => {
    const colour = engine.listTools().find((t) => t.mode === 'surface').styles.find((s) => s.style === style).swatch
    const ctx = document.createElement('canvas').getContext('2d')
    ctx.fillStyle = colour
    return [1, 3, 5].map((i) => parseInt(ctx.fillStyle.slice(i, i + 2), 16))
  }, style).then((rgb) => `rgb(${rgb.join(', ')})`)

  it('names the 2nd colour with a dot in its own colour, and redraws it when the setting changes', async () => {
    await setTool(opened.page, { mode: 'surface', style: 1 })
    for (const style of [2, 5]) {
      await opened.page.evaluate((style) => engine.setSetting('secondcolor', style), style)
      const colour = await swatchOf(style)
      const expected = [['Right click', colour], ['Right drag', colour], ['Alt + right drag', colour]]
      assert.deepEqual(await settle(dotsOf, expected), expected)
    }
  })

  it('draws the 2nd colour dot for Edges + inside / outside too', async () => {
    await opened.page.evaluate(() => engine.setSetting('secondcolor', 5))
    await setTool(opened.page, { mode: 'combi', submode: 'edgexoi' })
    const expected = await swatchOf(5)
    assert.deepEqual(await settle(dotsOf, [['Left click', expected], ['Right click', expected]]), [['Left click', expected], ['Right click', expected]])
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
