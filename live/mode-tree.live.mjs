// The Mode card's picker as a collapsible tree of `solve.html` (#160): groups, modes and sub-modes (Symbols and marks one level
// deeper), each branch folding on its own. Driven by role and accessible name, with the mouse and with the keyboard.
import assert from 'node:assert/strict'
import { after, before, describe, it } from 'node:test'
import { afterChange, currentTool, newBoardSolveLink, openSolvePage, setTool, useBrowser } from './page.mjs'
import { settle } from './settle.mjs'

const browser = useBrowser()

describe('the Mode card tree', () => {
  let opened
  before(async () => { opened = await openSolvePage(browser(), await newBoardSolveLink(browser())) })
  after(async () => { await opened?.context.close() })

  const mode = () => opened.page.getByRole('region', { name: 'Mode' })
  const search = () => mode().getByRole('combobox', { name: 'Tool' })
  const tree = () => mode().getByRole('tree', { name: 'Tools' })
  const item = (name, level) => tree().getByRole('treeitem', { name, exact: true, ...(level ? { level } : {}) })
  const openTo = (name) => mode().getByRole('button', { name, exact: true }).click()

  // Every treeitem on the page as [name, level, expanded], whether or not a folded branch hides it.
  const outline = () => tree().locator('[role=treeitem]').evaluateAll((rows) => rows.map((row) => ({
    name: [...row.querySelectorAll('.ui-tname, .ui-tpenpa')].map((part) => part.textContent).join(' '),
    level: Number(row.getAttribute('aria-level')),
    expanded: row.getAttribute('aria-expanded'),
    hidden: row.closest('[hidden]') !== null
  })))
  const visibleNames = async () => (await outline()).filter((row) => !row.hidden).map((row) => row.name)

  // Opens the picker with every branch folded except the one holding `tool`: the open state outlives one opening, so the
  // folds of an earlier test are cleared first.
  async function reopen (tool = { mode: 'surface' }) {
    await opened.page.keyboard.press('Escape')
    await search().click()
    await openTo('Groups')
    await opened.page.keyboard.press('Escape')
    await setTool(opened.page, tool)
    await search().click()
  }

  it('shows groups, modes and sub-modes as a tree, every engine tool a leaf', async () => {
    await reopen()
    await openTo('Everything')
    const rows = await outline()
    const tools = await opened.page.evaluate(() => engine.listTools().length)
    const leaves = rows.filter((row) => row.expanded === null)
    assert.equal(leaves.length, tools, 'one leaf per tool')
    assert.deepEqual(rows.filter((row) => row.level === 1).map((row) => row.name), [
      'Shading and colour', 'Lines through cells', 'Edges and walls', 'Numbers and letters', 'Symbols and marks', 'Objects and cages', 'Moving things'
    ])
    for (const row of rows.filter((r) => r.expanded !== null)) assert.equal(row.expanded, 'true', `${row.name} is open after Open to Everything`)
    const levelsOf = (from, to) => rows.slice(rows.findIndex((r) => r.name === from), rows.findIndex((r) => r.name === to)).map((r) => r.level)
    assert.equal(Math.max(...levelsOf('Symbols and marks', 'Objects and cages')), 4, 'Symbols and marks is four levels deep')
    assert.equal(Math.max(...levelsOf('Shading and colour', 'Symbols and marks')), 3, 'the groups before it keep three')
    assert.equal(Math.max(...levelsOf('Objects and cages', 'Moving things')), 3, 'the groups after it keep three')
    await opened.page.keyboard.press('Escape')
  })

  it('opens the current tool\'s branch and nothing else', async () => {
    await reopen({ mode: 'line', submode: '2' })
    assert.equal(await item('Lines through cells').getAttribute('aria-expanded'), 'true')
    assert.equal(await item('Line', 2).getAttribute('aria-expanded'), 'true')
    assert.equal(await item('Diagonal line (Diagonal)').getAttribute('aria-selected'), 'true')
    assert.equal(await item('Edges and walls').getAttribute('aria-expanded'), 'false')
    assert.equal(await item('Shading and colour').getAttribute('aria-expanded'), 'false')
    await opened.page.keyboard.press('Escape')
  })

  it('opens and closes a group and a mode on a click', async () => {
    await reopen()
    await item('Edges and walls').click()
    assert.equal(await item('Edges and walls').getAttribute('aria-expanded'), 'true')
    await item('Edge', 2).click()
    assert.equal(await item('Edge', 2).getAttribute('aria-expanded'), 'true')
    assert.equal((await visibleNames()).includes('Clear grid lines (Erase)'), true, 'the Edge mode shows its sub-modes')
    await item('Edge', 2).click()
    assert.equal(await item('Edge', 2).getAttribute('aria-expanded'), 'false')
    assert.equal((await visibleNames()).includes('Clear grid lines (Erase)'), false)
    await item('Edges and walls').click()
    assert.equal(await item('Edges and walls').getAttribute('aria-expanded'), 'false')
    assert.equal((await currentTool(opened.page)).mode, 'surface', 'folding picks nothing')
    await opened.page.keyboard.press('Escape')
  })

  it('opens and closes with Right and Left, and moves with Up, Down, Home and Left to the parent', async () => {
    const { page } = opened
    const focused = () => page.evaluate(() => [...document.activeElement.querySelectorAll('.ui-tname, .ui-tpenpa')].map((part) => part.textContent).join(' '))
    await reopen()
    await search().press('ArrowDown')
    assert.equal(await focused(), 'Shade cells (Surface)', 'Down from the field enters the tree at the current tool')
    await page.keyboard.press('Home')
    assert.equal(await focused(), 'Shading and colour')
    await page.keyboard.press('ArrowLeft')
    assert.equal(await item('Shading and colour').getAttribute('aria-expanded'), 'false')
    await page.keyboard.press('ArrowDown')
    assert.equal(await focused(), 'Lines through cells')
    await page.keyboard.press('ArrowRight')
    assert.equal(await item('Lines through cells').getAttribute('aria-expanded'), 'true')
    await page.keyboard.press('ArrowRight')
    assert.equal(await focused(), 'Line', 'Right on an open group enters it')
    await page.keyboard.press('ArrowRight')
    assert.equal(await item('Line', 2).getAttribute('aria-expanded'), 'true')
    await page.keyboard.press('ArrowLeft')
    assert.equal(await item('Line', 2).getAttribute('aria-expanded'), 'false')
    await page.keyboard.press('ArrowLeft')
    assert.equal(await focused(), 'Lines through cells', 'Left on a closed mode goes to its group')
    await page.keyboard.press('ArrowLeft')
    assert.equal(await item('Lines through cells').getAttribute('aria-expanded'), 'false')
    await page.keyboard.press('ArrowUp')
    assert.equal(await focused(), 'Shading and colour')
    await page.keyboard.press('Escape')
  })

  it('folds the whole tree to a level with the Open to buttons', async () => {
    await reopen()
    await openTo('Groups')
    assert.equal((await outline()).filter((r) => r.expanded === 'true').length, 0)
    assert.equal((await visibleNames()).length, 7, 'seven groups show')
    await openTo('Modes')
    const rows = await outline()
    assert.equal(rows.filter((r) => r.level === 1 && r.expanded !== 'true').length, 0, 'every group is open')
    const modesShown = await visibleNames()
    assert.ok(modesShown.includes('Line'), `Line shows: ${modesShown}`)
    assert.equal(modesShown.includes('Diagonal line (Diagonal)'), false, 'its sub-modes stay folded')
    assert.ok(modesShown.includes('Shapes') && modesShown.includes('Circle') && modesShown.includes('Bulbs + dots (Akari)'), `Symbols and marks shows its subgroups and their symbols: ${modesShown}`)
    assert.equal(modesShown.includes('Circle XS'), false, 'the sizes stay folded')
    await openTo('Everything')
    assert.ok((await visibleNames()).includes('Circle XS'), 'Everything shows the sizes')
    await opened.page.keyboard.press('Escape')
  })

  it('filters to matching leaves with their ancestors open, and clearing restores the open state', async () => {
    const { page } = opened
    await reopen({ mode: 'number', submode: '1' })
    await item('Edges and walls').click()
    const before = await outline()
    await search().fill('Diagonal')
    const names = await visibleNames()
    assert.deepEqual(['Lines through cells', 'Line', 'Diagonal line (Diagonal)', 'Edges and walls', 'Edge', 'Diagonal edge line (Diagonal)'].filter((n) => !names.includes(n)), [], `ancestors and leaves show: ${names}`)
    assert.equal(names.includes('Wall'), false, 'a non-matching sibling is hidden')
    assert.equal(names.includes('Numbers and letters'), false, 'a group with no match is hidden')
    assert.equal(await item('Line', 2).getAttribute('aria-expanded'), 'true')
    assert.equal(await tree().getByRole('treeitem', { name: /\(Diagonal\)$/ }).count(), 2, 'Line and Edge each have one')
    await search().fill('')
    assert.deepEqual(await outline(), before, 'the open and closed branches come back as before')
    await search().fill('zzzz')
    assert.equal(await tree().getByRole('treeitem').count(), 0, 'nothing matches')
    assert.equal(await mode().getByText('No tool matches.').count(), 1)
    await page.keyboard.press('Escape')
  })

  it('keeps a click on a branch from changing the open state while a search holds the tree open, and the Open to row steps aside', async () => {
    const { page } = opened
    await reopen()
    await search().fill('Diagonal')
    await item('Lines through cells').click()
    assert.equal(await item('Lines through cells').getAttribute('aria-expanded'), 'true', 'a search keeps its matches open')
    for (const name of ['Groups', 'Modes', 'Everything']) {
      assert.equal(await mode().getByRole('button', { name, exact: true }).isVisible(), false, `${name} steps aside for the search`)
    }
    await search().fill('')
    assert.equal(await item('Lines through cells').getAttribute('aria-expanded'), 'false', 'the click during the search folded nothing, opened nothing')
    await page.keyboard.press('Escape')
  })

  it('keeps the focus in the search field when a row is pressed with the mouse', async () => {
    await reopen()
    await item('Lines through cells').click()
    assert.equal(await opened.page.evaluate(() => document.activeElement.getAttribute('role')), 'combobox')
    await opened.page.keyboard.press('Escape')
  })

  it('picks the best match with Enter in the field, and nothing from an empty one', async () => {
    await reopen()
    await search().fill('Helper (x)')
    await search().press('Enter')
    assert.deepEqual([(await currentTool(opened.page)).mode, (await currentTool(opened.page)).submode], ['line', '4'], 'Line comes before Edge')
    await reopen({ mode: 'number', submode: '7' })
    await search().press('Enter')
    assert.equal((await currentTool(opened.page)).mode, 'number', 'an empty field picks nothing')
    await opened.page.keyboard.press('Escape')
  })

  it('finds a tool by what Penpa+ calls it and by its description, and a symbol by its size', async () => {
    await reopen()
    await search().fill('Black / dot')
    assert.deepEqual(await visibleNames(), ['Shading and colour', 'Shade + dot (Black / dot)'])
    await search().fill('circle xs')
    assert.equal((await visibleNames()).includes('Circle XS'), true)
    await search().fill('genre kakuro')
    assert.equal((await visibleNames()).includes('Kakuro clue box'), true, 'a group or subgroup name finds the tools under it')
    await opened.page.keyboard.press('Escape')
  })

  it('lists Surface as "Shade cells (Surface)", finds it by "shade" as well as by "Surface", and Enter picks it', async () => {
    await reopen({ mode: 'line', submode: '1' })
    for (const typed of ['shade', 'Surface']) {
      await search().fill(typed)
      assert.equal(await item('Shade cells (Surface)').count(), 1, `"${typed}" finds Surface under its plain name and Penpa+'s`)
      assert.equal(await tree().locator('[role=treeitem][data-mode=surface]:visible').locator('.ui-tname, .ui-tpenpa').allTextContents().then((parts) => parts.join(' ')), 'Shade cells (Surface)')
    }
    for (const typed of ['shade', 'Shade cells']) {
      await reopen({ mode: 'line', submode: '1' })
      await search().fill(typed)
      await search().press('Enter')
      assert.equal((await currentTool(opened.page)).mode, 'surface', `Enter on "${typed}" picks Surface`)
    }
    await opened.page.keyboard.press('Escape')
  })

  it('finds the row under Line, which reads without "Line >", by the full name "line > normal", which only the full Penpa+ name holds', async () => {
    await reopen()
    await search().fill('line > normal')
    const row = tree().locator('[role=treeitem][data-mode=line][data-submode="1"]:visible')
    assert.equal(await row.count(), 1)
    assert.equal(await row.locator('.ui-tname').textContent(), 'Normal', 'the plain name "Line" is the branch\'s own, so the row shows only Normal')
    assert.equal(await row.locator('.ui-tpenpa').count(), 0)
    await opened.page.keyboard.press('Escape')
  })

  it('ranks a match on a tool\'s own label above a match on its description, and "center" and "pencil" find tools', async () => {
    const picked = async (typed) => {
      await reopen()
      await search().fill(typed)
      await search().press('Enter')
      const tool = await currentTool(opened.page)
      return [tool.mode, tool.submode]
    }
    assert.deepEqual(await picked('sudoku corner'), ['sudoku', '2'], '"sudoku corner" picks Sudoku > Corner marks')
    assert.deepEqual(await picked('centre'), ['sudoku', '3'], '"centre" picks Sudoku > Centre marks, not a tool that only mentions centres')
    assert.deepEqual(await picked('center'), ['sudoku', '3'], '"center" is "centre"')
    await reopen()
    await search().fill('pencil')
    const found = await tree().locator('[role=treeitem][data-mode=sudoku]:visible').evaluateAll((rows) => rows.map((row) => row.getAttribute('data-submode')))
    assert.deepEqual(found, ['2', '3'], '"pencil" finds both pencil-mark tools')
    await opened.page.keyboard.press('Escape')
  })

  it('highlights the row Enter picks while a search is typed, and the current tool is only bold', async () => {
    await reopen({ mode: 'line', submode: '1' })
    await search().fill('e')
    const best = tree().locator('[role=treeitem].ui-tbest')
    assert.equal(await best.count(), 1, 'exactly one row is highlighted')
    assert.equal(await search().getAttribute('aria-activedescendant'), await best.getAttribute('id'), 'the field names the highlighted row')
    const expected = [await best.getAttribute('data-mode'), await best.getAttribute('data-submode')]
    await search().press('Enter')
    const tool = await currentTool(opened.page)
    assert.deepEqual([tool.mode, tool.submode ?? ''], expected, 'Enter picks the highlighted row')
    const look = (row) => row.evaluate((r) => ({ fill: getComputedStyle(r).backgroundColor, weight: getComputedStyle(r).fontWeight }))
    const current = tree().locator('[role=treeitem][aria-selected=true]')
    await reopen({ mode: 'line', submode: '2' })
    await search().fill('line')
    assert.notEqual(await current.getAttribute('data-submode'), await best.getAttribute('data-submode'), 'the current tool is not the highlighted one here')
    assert.deepEqual(await look(current), { fill: 'rgba(0, 0, 0, 0)', weight: '700' }, 'the current tool is bold with no fill while searching')
    await reopen({ mode: 'line', submode: '1' })
    await search().fill('sudoku corner')
    assert.equal(await best.getAttribute('data-submode'), '2', 'the highlight is the best match, not the first')
    await search().press('Enter')
    assert.equal((await currentTool(opened.page)).submode, '2', 'Enter follows the highlight')
    await reopen({ mode: 'line', submode: '1' })
    assert.equal(await tree().locator('.ui-tbest').count(), 0, 'no highlight without a search')
    await search().fill('e')
    await opened.page.keyboard.press('Escape')
    assert.equal(await search().getAttribute('aria-activedescendant'), null, 'a closed list is not pointed at')
  })

  it('sends a letter typed in the tree back to the search field', async () => {
    await reopen()
    await search().fill('e')
    await search().press('ArrowDown')
    await opened.page.keyboard.press('Backspace')
    assert.equal(await search().inputValue(), '', 'Backspace in the tree edits the field')
    await search().fill('e')
    await search().press('ArrowDown')
    await opened.page.keyboard.type('x')
    assert.equal(await search().inputValue(), 'ex')
    await opened.page.keyboard.press('Escape')
  })

  it('hides the Open to row while a search is typed', async () => {
    await reopen()
    assert.equal(await mode().getByRole('button', { name: 'Modes', exact: true }).isVisible(), true)
    await search().fill('line')
    assert.equal(await mode().getByRole('button', { name: 'Modes', exact: true }).isVisible(), false)
    await search().fill('')
    assert.equal(await mode().getByRole('button', { name: 'Modes', exact: true }).isVisible(), true)
    await opened.page.keyboard.press('Escape')
  })

  it('finds a tool by an old Penpa+ name typed without spaces, and says which name matched', async () => {
    await reopen()
    const hint = (name) => item(name).locator('.ui-tmatch')
    for (const typed of ['linex', 'line x', 'Line X', 'LineX']) {
      await search().fill(typed)
      assert.equal(await item('Line + edge × (Line x)').count(), 1, `"${typed}" finds the Line x composite tool`)
    }
    await search().fill('linex')
    assert.equal(await hint('Line + edge × (Line x)').textContent(), 'Penpa+: linex', 'the row says which old name matched, here the internal one')
    await search().fill('line x')
    assert.equal(await hint('Line + edge × (Line x)').isVisible(), false, 'the row\'s own label holds the typed name, so it needs no hint')
    await search().fill('edgeauxline')
    assert.equal(await tree().locator('[role=treeitem][data-submode=edgesub]:visible').count(), 1, 'a loose match finds the label')
    assert.equal(await tree().locator('[role=treeitem][data-submode=edgesub]:visible .ui-tmatch').isVisible(), false, 'its own label holds it')
    await search().fill('shade')
    assert.equal(await tree().locator('[role=treeitem][data-submode=blpo]:visible').count(), 1, '"shade" still finds the tool Penpa+ labels Black / dot')
    await search().fill('bridges')
    assert.equal(await tree().locator('[role=treeitem][data-submode=hashi]:visible').count(), 1, 'the plain name "Bridges" finds the tool Penpa+ labels Hashi')
    await search().fill('c(o)m-bi')
    assert.equal(await item('Line + edge × (Line x)').count(), 1, 'punctuation inside a typed word is ignored')
    await search().fill('combi')
    assert.equal(await item('Line + edge × (Line x)').count(), 1, 'the internal mode name finds its sub-modes')
    await search().fill('helperx')
    await search().press('Enter')
    assert.deepEqual([(await currentTool(opened.page)).mode, (await currentTool(opened.page)).submode], ['line', '4'], 'the sub-mode label "Helper (x)" is found without its space and brackets')
    await reopen()
    await search().fill('edgesub')
    assert.equal(await tree().locator('[role=treeitem][data-submode=edgesub]:visible').count(), 1, 'an internal sub-mode name (label "Edge/Aux line") finds its tool')
    assert.equal(await tree().locator('[role=treeitem][data-submode=edgesub]:visible').locator('.ui-tmatch').textContent(), 'Penpa+: edgesub')
    await search().fill('compositelinex')
    assert.equal(await tree().getByRole('treeitem').count(), 0, 'a word does not match across two names')
    await search().fill('3')
    assert.equal(await tree().getByRole('treeitem').count(), 0, 'a radio\'s bare digit value is not a name')
    await search().fill('×')
    assert.equal(await item('Line + edge × (Line x)').count(), 1, 'a word of symbols still searches as typed')
    const shown = await tree().locator('[role=treeitem][data-mode]').evaluateAll((rows) => rows.filter((row) => !row.closest('[hidden]')).length)
    assert.equal(shown < 40, true, 'a word of symbols filters instead of showing every tool')
    await search().fill('Diagonal')
    assert.equal(await tree().locator('.ui-tmatch:not([hidden])').count(), 0, 'a match the row already shows adds no hint')
    await search().fill('')
    assert.equal(await tree().locator('.ui-tmatch:not([hidden])').count(), 0, 'no hint without a search')
    await opened.page.keyboard.press('Escape')
  })

  it('picks a leaf with a click, sets the tool and returns focus to the board', async () => {
    const { page } = opened
    await reopen()
    await item('Lines through cells').click()
    await item('Line', 2).click()
    await item('Free line (Free)').click()
    assert.equal((await currentTool(page)).submode, '3')
    assert.equal(await settle(() => page.evaluate(() => document.activeElement === document.body), true), true)
    assert.equal(await search().getAttribute('aria-expanded'), 'false')
    assert.equal(await search().inputValue(), 'Line > Free', 'the field names the tool again')
  })

  it('picks with the keyboard: Enter on a row, and Enter in the field picks the best match', async () => {
    const { page } = opened
    await reopen()
    await search().fill('Diagonal line')
    await search().press('Enter')
    assert.equal((await currentTool(page)).submode, '2')
    await reopen({ mode: 'surface' })
    await search().press('ArrowDown')
    await page.keyboard.press('ArrowDown')
    await page.keyboard.press('Enter')
    assert.equal((await currentTool(page)).mode, 'multicolor', 'Down from Shade cells, then Enter, picks Colour selected cells')
  })

  it('leaves its rows in place when the engine changes, so a click lands', async () => {
    const { page } = opened
    await reopen()
    await item('Lines through cells').click()
    await item('Line', 2).click()
    await item('Lines through cells').evaluate((row) => { row.dataset.kept = 'yes' })
    await setTool(page, { mode: 'line', submode: '3' })
    await afterChange(page)
    await afterChange(page)
    assert.equal(await item('Free line (Free)').getAttribute('aria-selected'), 'true', 'the tree followed the change')
    assert.equal(await item('Lines through cells').getAttribute('data-kept'), 'yes')
    await page.keyboard.press('Escape')
  })

  it('marks the tool set from outside as selected', async () => {
    await setTool(opened.page, { mode: 'number', submode: '7' })
    await search().click()
    assert.equal(await item('Candidates').getAttribute('aria-selected'), 'true')
    assert.equal(await item('Normal').first().getAttribute('aria-selected'), 'false')
    await opened.page.keyboard.press('Escape')
  })
})

describe('Symbols and marks in the tree', () => {
  let opened
  before(async () => { opened = await openSolvePage(browser(), await newBoardSolveLink(browser())) })
  after(async () => { await opened?.context.close() })

  const mode = () => opened.page.getByRole('region', { name: 'Mode' })
  const tree = () => mode().getByRole('tree', { name: 'Tools' })
  // The names of the treeitems directly under `name`, read from the open outline.
  const childrenOf = (name) => tree().locator('[role=treeitem]').evaluateAll((rows, parent) => {
    const names = rows.map((row) => ({ name: [...row.querySelectorAll('.ui-tname, .ui-tpenpa')].map((part) => part.textContent).join(' '), level: Number(row.getAttribute('aria-level')) }))
    const at = names.findIndex((row) => row.name === parent)
    const out = []
    for (const row of names.slice(at + 1)) {
      if (row.level <= names[at].level) break
      if (row.level === names[at].level + 1) out.push(row.name)
    }
    return out
  }, name)

  before(async () => {
    await mode().getByRole('combobox', { name: 'Tool' }).click()
    await mode().getByRole('button', { name: 'Everything', exact: true }).click()
  })

  it('has the five subgroups in order', async () => {
    assert.deepEqual(await childrenOf('Symbols and marks'), ['Solving marks', 'Shapes', 'Arrows', 'Signs and small marks', 'Genre symbols'])
  })

  it('files each subgroup\'s symbols, with sizes and colours a level below', async () => {
    assert.deepEqual(await childrenOf('Solving marks'), [
      'Black + white circles (Yin-Yang)', 'Ship pieces + water (Battleship)', 'Stars + × (Star Battle)', 'Tents + × (Tent)', 'Magnet poles + − (Magnets)',
      'Mines + × (Minesweeper)', 'One or two mines + × (DoubleMines)', 'Bulbs + dots (Akari)'
    ])
    assert.deepEqual(await childrenOf('Shapes'), [
      'Circle', 'Square', 'Diamond', 'Triangle up', 'Triangle down', 'Triangle left', 'Triangle right', 'Hexagon, point up', 'Hexagon, flat'
    ])
    assert.deepEqual(await childrenOf('Circle'), ['Circle L', 'Circle M', 'Circle S', 'Circle XS'])
    assert.deepEqual(await childrenOf('Square'), ['Square XL', 'Square L', 'Square M', 'Square S', 'Square XS'])
    assert.deepEqual(await childrenOf('Arrows'), [
      'Arrow', 'Arrow, notched', 'Arrow, triangle', 'Edge arrows', 'Arrow, graphic', 'Arrow, graphic, in a circle', 'Arrow, short and fat',
      'Arrow, small', 'Arrow cross', 'Arrows, 8-way', 'Arrow tips', 'Arrows in cells (Arrows)'
    ])
    assert.deepEqual(await childrenOf('Arrow'), ['Fat Black', 'Fat Grey', 'Fat White'])
    assert.deepEqual(await childrenOf('Edge arrows'), ['Edge arrows, black', 'Edge arrows, grey', 'Edge arrows, green'])
    assert.deepEqual(await childrenOf('Signs and small marks'), [
      '○ △ □ ×', 'Cross arms', 'Lines in a cell', 'Frame lines', 'Bars', 'Corner triangles', 'Maths signs', 'Inequality signs', 'Segment digit'
    ])
    assert.deepEqual(await childrenOf('Segment digit'), ['Segment digit, black', 'Segment digit, green', 'Segment digit, grey', 'Segment digit, outline'])
    assert.deepEqual(await childrenOf('Ship'), ['Battleship Black', 'Battleship Grey', 'Battleship White', 'Ship, curvy, black', 'Ship, curvy, grey', 'Ship, curvy, white'])
    assert.deepEqual((await childrenOf('Genre symbols')).slice(0, 3), ['Ship', 'Kakuro clue box', 'Trees, tents, water, fish'])
  })

  it('picks a size from the fourth level', async () => {
    const sizes = tree().getByRole('treeitem', { level: 4 })
    await sizes.filter({ hasText: /^Circle XS$/ }).first().click()
    assert.deepEqual((await currentTool(opened.page)).submode, 'circle_SS')
  })
})

describe('the tree on a board with pins', () => {
  let opened
  before(async () => { opened = await openSolvePage(browser(), await newBoardSolveLink(browser(), ['Line Normal', 'Sudoku Corner'])) })
  after(async () => { await opened?.context.close() })

  it('keeps its keys from the board: Enter on a row picks that row, not the next pin', async () => {
    const { page } = opened
    const search = page.getByRole('region', { name: 'Mode' }).getByRole('combobox', { name: 'Tool' })
    await setTool(page, { mode: 'surface' })
    await search.press('ArrowDown')
    await page.keyboard.press('ArrowDown')
    await page.keyboard.press('Enter')
    assert.equal(await settle(async () => (await currentTool(page)).mode, 'multicolor'), 'multicolor')
  })
})
