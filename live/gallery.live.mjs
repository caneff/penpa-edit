// The review page (`docs/gallery.html`, #256): a list of representative puzzles, each opened in `solve.html` inside an
// iframe whose size the solver picks, with Previous / Next and the arrow keys stepping through the list and the puzzle and
// size kept in the page's address.
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { describe, it } from 'node:test'
import { galleryEntries, renderGalleryFile } from './gallery-puzzles.mjs'
import { openPenpa, openSolvePage, useBrowser } from './page.mjs'

const browser = useBrowser()

const GALLERY_FILE = new URL('../docs/gallery-puzzles.js', import.meta.url)
const GALLERY_URL = new URL('../docs/gallery.html', import.meta.url).href

// The puzzles the ticket lists, by id, in the order the list shows them.
const IDS = ['sudoku-9x9', 'sudoku-6x6', 'killer', 'starbattle', 'slitherlink', 'or-shading', 'icebreaker', 'rectangle', 'hex', 'triangle', 'no-rules']
const SIZES = { '1366x768': { width: 1366, height: 768 }, '1920x1080': { width: 1920, height: 1080 } }
// Longer than a board takes to draw on a loaded box.
const BOARD_MS = 15000
const WINDOW = { viewport: { width: 1600, height: 900 } }

// The entries the page lists, read from the file it loads.
const listed = () => {
  const source = readFileSync(GALLERY_FILE, 'utf8')
  return new Function(`${source}; return GALLERY_PUZZLES`)()
}

const open = (query = '') => openPenpa(browser(), query, {
  url: GALLERY_URL,
  contextOptions: WINDOW,
  ready: () => document.querySelectorAll('#puzzle-list [data-id]').length > 0
})

// The solve page the iframe holds, once its board is up; a board that does not come up fails naming `id`.
async function boardFrame (page, id) {
  const frame = await (await page.locator('#stage iframe').elementHandle()).contentFrame()
  try {
    await page.frameLocator('#stage iframe').getByRole('region', { name: 'Board' }).waitFor({ timeout: BOARD_MS })
    await frame.evaluate(() => engine.ready)
  } catch (e) {
    throw new Error(`${id}: its board did not load: ${e.message}`, { cause: e })
  }
  return frame
}

// The puzzle a solve page holds: its size and everything the setter put on it.
const puzzleOf = (frame) => frame.evaluate(() => ({ nx: pu.nx, ny: pu.ny, setter: JSON.stringify(pu.pu_q) }))

// The puzzle `entry`'s link opens on `solve.html` by itself, outside the review page, so a puzzle of the same grid type
// opened in its place does not pass.
async function directPuzzle (entry) {
  const { context, page } = await openSolvePage(browser(), entry.link)
  try {
    return await puzzleOf(page)
  } finally {
    await context.close()
  }
}

const selectedId = (page) => page.locator('#puzzle-list [aria-current="true"]').getAttribute('data-id')
const frameBox = (page) => page.locator('#stage iframe').evaluate((el) => ({ width: el.getBoundingClientRect().width, height: el.getBoundingClientRect().height }))

describe('the review page', () => {
  it('lists the puzzles the ticket names, from a file the generator writes', async () => {
    assert.deepEqual(listed().map((p) => p.id), IDS)
    assert.equal(readFileSync(GALLERY_FILE, 'utf8'), renderGalleryFile(await galleryEntries(browser())), 'run `node live/generate-gallery.mjs`')
  })

  it('opens the first puzzle and puts the puzzle and size in the address', async () => {
    const { page } = await open()
    assert.equal(await selectedId(page), IDS[0])
    assert.match((await boardFrame(page, IDS[0])).url(), /\/solve\.html#/)
    const params = new URL(page.url()).searchParams
    assert.deepEqual([params.get('puzzle'), params.get('size')], [IDS[0], 'fill'])
  })

  it('steps through every puzzle with Next, each loading its board, and back with Previous', async () => {
    const { page } = await open()
    const entries = listed()
    const next = page.getByRole('button', { name: 'Next', exact: true })
    const previous = page.getByRole('button', { name: 'Previous', exact: true })
    assert.equal(await previous.isDisabled(), true, 'nothing before the first')
    for (const [i, entry] of entries.entries()) {
      assert.equal(await selectedId(page), entry.id)
      const frame = await boardFrame(page, entry.id)
      assert.equal(await frame.evaluate(() => pu.gridtype), entry.gridtype, `${entry.id} loads a ${entry.gridtype} board`)
      assert.deepEqual(await puzzleOf(frame), await directPuzzle(entry), `${entry.id} loads its own board`)
      if (i < entries.length - 1) await next.click()
    }
    assert.equal(await next.isDisabled(), true, 'nothing after the last')
    for (const entry of entries.slice(0, -1).reverse()) {
      await previous.click()
      assert.equal(await selectedId(page), entry.id)
      await boardFrame(page, entry.id)
    }
    assert.equal(await previous.isDisabled(), true)
  })

  it('steps with the arrow keys while focus is in the list, and opens a clicked entry', async () => {
    const { page } = await open()
    await page.locator(`#puzzle-list [data-id="${IDS[0]}"]`).focus()
    await page.keyboard.press('ArrowDown')
    assert.equal(await selectedId(page), IDS[1])
    await page.keyboard.press('ArrowDown')
    await page.keyboard.press('ArrowUp')
    assert.equal(await selectedId(page), IDS[1])
    await page.locator(`#puzzle-list [data-id="killer"]`).click()
    assert.equal(await selectedId(page), 'killer')
    await boardFrame(page, 'killer')
  })

  it('lays the solve page out at the size picked', async () => {
    const { page } = await open()
    for (const [name, want] of Object.entries(SIZES)) {
      await page.getByRole('combobox', { name: 'Size' }).selectOption(name)
      assert.deepEqual(await frameBox(page), want, `${name} sets the iframe's size`)
      assert.equal(await (await boardFrame(page, name)).evaluate(() => innerWidth), want.width, `${name} is the solve page's window`)
      assert.equal(new URL(page.url()).searchParams.get('size'), name)
    }
    await page.getByRole('combobox', { name: 'Size' }).selectOption('fill')
    const stage = await page.locator('#stage').evaluate((el) => ({ width: el.clientWidth, height: el.clientHeight }))
    assert.deepEqual(await frameBox(page), stage, 'fill takes the whole stage')
  })

  it('reopens the puzzle and size its address names', async () => {
    const { page } = await open('?puzzle=killer&size=1920x1080')
    assert.equal(await selectedId(page), 'killer')
    assert.equal(await page.getByRole('combobox', { name: 'Size' }).inputValue(), '1920x1080')
    assert.deepEqual(await frameBox(page), SIZES['1920x1080'])
    await page.reload()
    assert.equal(await selectedId(page), 'killer')
    assert.deepEqual(await frameBox(page), SIZES['1920x1080'])
    await boardFrame(page, 'killer')
  })

  it('falls back to the first puzzle and fill for an address it does not know', async () => {
    const { page } = await open('?puzzle=nope&size=7x7')
    assert.equal(await selectedId(page), IDS[0])
    assert.equal(await page.getByRole('combobox', { name: 'Size' }).inputValue(), 'fill')
  })
})
