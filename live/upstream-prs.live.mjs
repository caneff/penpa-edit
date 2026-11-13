// The behaviour taken from upstream PRs 216 (delete a circle), 231 (sudoku import) and 229 (long links, load URL).
import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { openPenpa, useBrowser } from './page.mjs'
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
    await first.page.evaluate(() => { UserSettings.warn_long_links = false })
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
