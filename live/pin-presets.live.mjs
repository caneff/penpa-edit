// Pin presets of `solve.html` (#98): the Pinned card's "Pin presets" pulldown loads a built-in set or one the solver saved,
// replacing the puzzle's pins; a saved set is kept in localStorage and offered on every puzzle. The UI is found by role and
// accessible name; the pins are read by walking them with Tab and by `engine.getTool()`.
import assert from 'node:assert/strict'
import { after, before, describe, it } from 'node:test'
import { currentTool, newBoardSolveLink, openSolvePage, useBrowser, waitForDesk } from './page.mjs'
import { settle } from './settle.mjs'

const browser = useBrowser()

// A Tab set that names the modes the built-in presets pin.
const BROAD_TAB_SET = ['Sudoku Normal', 'Line Normal', 'Wall', 'Number Normal', 'Surface']

const link = (tabSet) => newBoardSolveLink(browser(), tabSet)
const openSolve = (hash) => openSolvePage(browser(), hash)

const toolKeyOf = ({ mode, submode }) => `${mode}/${submode ?? ''}`

const presetPulldown = (page) => page.getByRole('region', { name: 'Pinned' }).getByRole('combobox', { name: 'Pin presets' })
// The pulldown closes with an animation; a click while it still shows would close it again.
const closed = (page) => page.getByRole('option').first().waitFor({ state: 'hidden' })
const choosePreset = async (page, name) => {
  await closed(page)
  await presetPulldown(page).click()
  await page.getByRole('option', { name, exact: true }).click()
}

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
  await page.getByRole('region', { name: 'Pinned' }).getByRole('button', { name: /^1/ }).click()
  keys.push(toolKeyOf(await currentTool(page)))
  for (let i = 1; i < count; i++) {
    keys.push(await tabToNextTool(page))
  }
  return keys
}

const chipCount = (page) => page.getByRole('region', { name: 'Pinned' }).getByRole('button', { name: /^Unpin / }).count()

describe('loading a built-in preset', () => {
  let opened
  before(async () => { opened = await openSolve(await link(BROAD_TAB_SET)) })
  after(async () => { await opened?.context.close() })

  it('replaces the pins with its set', async () => {
    const { page } = opened
    assert.equal(await settle(() => chipCount(page), 5), 5)
    await choosePreset(page, 'Sudoku')
    assert.equal(await settle(() => chipCount(page), 3), 3)
    assert.deepEqual(await walkPins(page, 3), ['sudoku/1', 'sudoku/2', 'sudoku/3'])
  })

  it('offers every built-in preset under its genre, and each loads only tools the puzzle lists', async () => {
    const { page } = opened
    const listed = await page.evaluate(() => engine.listTools().map((t) => `${t.mode}/${t.submode ?? ''}`))
    await presetPulldown(page).click()
    const names = await page.getByRole('option').allInnerTexts()
    await page.keyboard.press('Escape')
    await closed(page)
    assert.ok(names.length >= 3, `at least three presets, got ${names}`)
    for (const name of names) {
      await choosePreset(page, name)
      await settle(() => chipCount(page).then((n) => n > 0), true)
      const pinned = await walkPins(page, await chipCount(page))
      for (const key of pinned) {
        assert.equal(listed.includes(key), true, `${name}: ${key} is a listed tool`)
      }
    }
  })
})

// A pick hands the keyboard back to the puzzle (#157): Tab then cycles the newly pinned tools, not the Pinned card's fields.
describe('after picking a preset', () => {
  let opened
  before(async () => { opened = await openSolve(await link(BROAD_TAB_SET)) })
  after(async () => { await opened?.context.close() })

  const focusInPinnedCard = (page) => page.evaluate(() => document.activeElement?.closest('.ui-card-pins') !== null)

  // Focus is off the Pinned card, the preset's pins are loaded, and Tab lands on one of them.
  const assertTabCyclesPins = async (page, keys) => {
    assert.equal(await settle(() => focusInPinnedCard(page), false), false, 'focus left the Pinned card')
    assert.equal(await settle(() => chipCount(page), keys.length), keys.length)
    assert.ok(keys.includes(await tabToNextTool(page)), `Tab lands on one of ${keys}`)
    assert.equal(await focusInPinnedCard(page), false, 'focus is still off the Pinned card after Tab')
  }

  it('with the mouse, Tab switches to the next pinned tool', async () => {
    const { page } = opened
    await choosePreset(page, 'Sudoku')
    await assertTabCyclesPins(page, ['sudoku/1', 'sudoku/2', 'sudoku/3'])
  })

  it('with the keyboard, Tab switches to the next pinned tool', async () => {
    const { page } = opened
    await closed(page)
    await presetPulldown(page).focus()
    await page.keyboard.press('Enter')
    const target = 'Sudoku with lines and marks'
    const highlighted = () => page.evaluate(() => [...document.querySelectorAll('wa-select.ui-presets wa-option')].find((o) => o.current)?.textContent.trim())
    for (let presses = 0; presses < 12 && (await highlighted()) !== target; presses++) {
      await page.keyboard.press('ArrowDown')
    }
    assert.equal(await highlighted(), target)
    await page.keyboard.press('Enter')
    await assertTabCyclesPins(page, ['sudoku/1', 'sudoku/2', 'sudoku/3', 'line/1', 'line/4'])
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

describe('saving a preset', () => {
  let opened
  before(async () => { opened = await openSolve(await link(['Line Normal', 'Sudoku Corner'])) })
  after(async () => { await opened?.context.close() })

  it('survives a reload and appears on another puzzle', async () => {
    const { page } = opened
    const pinned = page.getByRole('region', { name: 'Pinned' })
    await pinned.getByRole('textbox', { name: 'Preset name' }).fill('My pair')
    await pinned.getByRole('button', { name: 'Save pins as preset' }).click()
    await page.reload()
    await waitForDesk(page)
    await page.getByRole('button', { name: 'Unpin Line > Normal' }).click()
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
