// The behaviour taken from upstream PRs 216 (delete a circle), 231 (sudoku import) and 229 (long links, load URL).
import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { openPenpa, useBrowser, waitForSettingsLoaded } from './page.mjs'
import { settle } from './settle.mjs'

const browser = useBrowser()

describe('number mode, circle submode (PR 216)', () => {
  it('deletes an empty circle on one more backspace', async () => {
    const { context, page } = await openPenpa(browser())
    const remains = await page.evaluate(() => {
      const k = pu.nx0 * 2 + 3
      pu.mode.qa = 'pu_q'
      pu.mode.pu_q.edit_mode = 'number'
      pu.mode.pu_q.number = ['1']
      pu.selection = [k]
      pu.pu_q.number[k] = ['', 1, '1']
      pu.key_backspace()
      return k in pu.pu_q.number
    })
    assert.equal(remains, false)
    await context.close()
  })
})

describe('sudoku import (PR 231)', () => {
  // Fills the import dialog and runs it; returns the clue count and whether each error shows.
  const runImport = (page, text, { nonSquare }) => page.evaluate(({ text, nonSquare }) => {
    const el = (id) => document.getElementById(id)
    el('sudokuIgnoreSpaces').checked = true
    el('sudokuIgnoreNotSquare').checked = nonSquare
    pu.pu_q.number = {}
    el('iostring').value = text
    pu.load_clues()
    return {
      clues: Object.keys(pu.pu_q.number).length,
      nonAlphanumericShown: !el('sudokuIOFail').classList.contains('is_hidden'),
      notSquareShown: !el('sudokuIOFailNonPerfect').classList.contains('is_hidden'),
      input: el('iostring').value
    }
  }, { text, nonSquare })

  it('drops tabs and spaces between cells in non-square mode but keeps the line breaks', async () => {
    const { context, page } = await openPenpa(browser())
    assert.equal((await runImport(page, '1\t2 3\n4 \t5', { nonSquare: true })).clues, 5)
    await context.close()
  })

  // #37: a tab separates columns, so an empty tab-delimited field is a blank cell. Returns "row,col:char" for each clue,
  // read relative to the dialog's start cell.
  const placed = (page, text, { nonSquare = true } = {}) => page.evaluate(({ text, nonSquare }) => {
    const el = (id) => document.getElementById(id)
    el('sudokuIgnoreSpaces').checked = true
    el('sudokuIgnoreNotSquare').checked = nonSquare
    pu.pu_q.number = {}
    el('iostring').value = text
    pu.load_clues()
    const r0 = parseInt(el('nb_space1').value, 10)
    const c0 = parseInt(el('nb_space3').value, 10)
    return Object.entries(pu.pu_q.number)
      .map(([k, v]) => `${Math.floor(k / pu.nx0) - 2 - r0},${(k % pu.nx0) - 2 - c0}:${v[0]}`)
      .sort()
  }, { text, nonSquare })

  it('keeps a blank cell between two tabs (a Google Sheets paste) in non-square mode', async () => {
    const { context, page } = await openPenpa(browser())
    assert.deepEqual(await placed(page, '5\t\t3'), ['0,0:5', '0,2:3'])
    await context.close()
  })

  it('keeps blanks at the start, middle and end of each row of a multi-row paste', async () => {
    const { context, page } = await openPenpa(browser())
    const text = '\t1\t\t2\t\n3\t\t\t\t4\n\t\t5\t\t'
    assert.deepEqual(await placed(page, text), ['0,1:1', '0,3:2', '1,0:3', '1,4:4', '2,2:5'])
    await context.close()
  })

  it('imports 0 and . blanks as before', async () => {
    const { context, page } = await openPenpa(browser())
    assert.deepEqual(await placed(page, '5\t0\t3'), ['0,0:5', '0,1:0', '0,2:3'])
    assert.deepEqual(await placed(page, '5\t.\t3'), ['0,0:5', '0,1:0', '0,2:3'])
    await context.close()
  })

  it('imports space-padded text without tabs as before', async () => {
    const { context, page } = await openPenpa(browser())
    assert.deepEqual(await placed(page, '5 0 3\n 1 2 '), ['0,0:5', '0,1:0', '0,2:3', '1,0:1', '1,1:2'])
    await context.close()
  })

  it('reports a digit count that is no perfect square without replacing the input', async () => {
    const { context, page } = await openPenpa(browser())
    const result = await runImport(page, '12345', { nonSquare: false })
    assert.deepEqual([result.notSquareShown, result.input], [true, '12345'])
    await context.close()
  })

  it('hides a stale perfect-square error when the next import fails on a character', async () => {
    const { context, page } = await openPenpa(browser())
    await runImport(page, '12345', { nonSquare: false })
    const result = await runImport(page, '12!45', { nonSquare: false })
    assert.deepEqual([result.nonAlphanumericShown, result.notSquareShown], [true, false])
    await context.close()
  })
})

describe('long links and Load URL (PR 229)', () => {
  const LONG_LINK = 'x'.repeat(9000)

  it('warns about a very long link only while the setting is on', async () => {
    const { context, page } = await openPenpa(browser())
    const popup = () => page.evaluate(() => Boolean(document.querySelector('.swal2-popup.swal2-show')))
    await page.evaluate((text) => update_textarea(text), LONG_LINK)
    assert.equal(await settle(popup, true), true, 'popup with the setting on')
    await page.evaluate(() => { Swal.close(); UserSettings.warn_long_links = false })
    await settle(popup, false)
    await page.evaluate((text) => update_textarea(text), LONG_LINK)
    assert.equal(await settle(popup, true), false, 'no popup with the setting off')
    await context.close()
  })

  it('keeps the warning setting off after a restart', async () => {
    const first = await openPenpa(browser(), '', { served: true })
    // #171: this test once read `true` after the restart on a busy machine. Most likely the cookie had not reached the
    // browser's store when `context.cookies()` read it (not reproduced), so wait for the settings load and then the store.
    await waitForSettingsLoaded(first.page)
    await first.page.evaluate(() => { UserSettings.warn_long_links = false })
    const savedOff = async () => (await first.context.cookies()).some((c) => c.name === 'warn_long_links' && c.value === 'false')
    assert.equal(await settle(savedOff, true, { patient: true }), true, 'warn_long_links=false reached the cookie store')
    const kept = await first.context.cookies()
    await first.context.close()
    const second = await openPenpa(browser(), '', { served: true, cookies: kept })
    const read = () => second.page.evaluate(() => UserSettings.warn_long_links)
    assert.equal(await settle(read, false), false)
    await second.context.close()
  })

  it('reads back what the shorten-links setter was given', async () => {
    const { context, page } = await openPenpa(browser())
    const read = await page.evaluate(() => {
      UserSettings.shorten_links = true
      const on = UserSettings.shorten_links
      UserSettings.shorten_links = false
      return [on, UserSettings.shorten_links]
    })
    assert.deepEqual(read, [true, false])
    await context.close()
  })

  // Loads one number's link through Load URL, written `shape` ways, and returns the clue count it arrives with.
  const loadedClues = async (page, makeUrl) => {
    await page.evaluate(() => {
      pu.mode.qa = 'pu_q'
      pu.pu_q.number = {}
      pu.pu_q.number[pu.nx0 * 2 + 3] = ['7', 1, '1']
    })
    const data = await page.evaluate(() => pu.maketext().split('#').pop().split('?').pop())
    await page.evaluate(() => { pu.pu_q.number = {} })
    await page.evaluate((url) => import_url(url), makeUrl(data))
    return () => page.evaluate(() => Object.keys(pu.pu_q.number).length)
  }

  for (const [name, makeUrl] of [
    ['a URL with no penpa-edit in its path', (d) => `https://example.test/local/dev/?${d}`],
    ['a link pasted without https://', (d) => `caneff.github.io/penpa-edit/?${d}`]
  ]) {
    it(`loads ${name}`, async () => {
      const { context, page } = await openPenpa(browser())
      const read = await loadedClues(page, makeUrl)
      assert.equal(await settle(read, 1), 1)
      await context.close()
    })
  }
})
