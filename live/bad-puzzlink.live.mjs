// A puzz.link import that fails (audit C10): the previous board stays, an error shows, and no clue is NaN or null.
import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { openPenpa, useBrowser } from './page.mjs'
import { settle } from './settle.mjs'

const browser = useBrowser()

const NURIKABE = 'https://puzz.link/p?nurikabe/5/5/1g2g3'

// A malformed link per way it fails: a size, a missing field, a decoder that throws, and truncated clue data per genre.
const MALFORMED = {
  'size 0x0': 'nurikabe/0/0/',
  'negative size': 'nurikabe/-3/5/',
  'non-numeric size': 'nurikabe/a/b/c',
  'missing rows': 'nurikabe/5/',
  'no puzzle data at all': 'nurikabe',
  'a decoder that throws': 'starbattle/10/10/',
  'castle, number cut off': 'castle/5/5/0',
  'castle, long number cut off': 'castle/5/5/-',
  'yajilin, number cut off': 'yajilin/5/5/0',
  'compass, clue cut off': 'compass/5/5/1',
  'mochikoro, number cut off': 'mochikoro/5/5/-',
  'nuribou, number cut off': 'nuribou/5/5/-',
  'nurikabe, number cut off': 'nurikabe/5/5/-'
}

// Types `link` into the Load URL dialog and presses its button, as a user does.
async function importLink (page, link) {
  await page.evaluate((l) => {
    document.getElementById('modal-load').style.display = 'block'
    document.getElementById('urlstring').value = l
  }, link)
  await page.click('#load_url')
}

const boardState = (page) => page.evaluate(() => ({
  numbers: Object.keys(pu.pu_q.number).length,
  nx: pu.nx,
  ny: pu.ny,
  importDialog: document.getElementById('modal-load').style.display,
  errorShown: Boolean(document.querySelector('.swal2-icon-error')),
  badClues: JSON.stringify([pu.pu_q.number, pu.pu_q.numberS]).match(/NaN|null/g)?.length ?? 0
}))

describe('a failed puzz.link import', () => {
  for (const [name, link] of Object.entries(MALFORMED)) {
    it(`keeps the board and shows an error: ${name}`, async () => {
      const { context, page } = await openPenpa(browser(), '')
      await importLink(page, NURIKABE)
      const before = await settle(async () => (await boardState(page)).numbers, 3)
      assert.equal(before, 3, 'the nurikabe loaded')
      await page.evaluate(() => { document.querySelector('.swal2-container')?.remove() })
      const kept = await boardState(page)

      await importLink(page, `https://puzz.link/p?${link}`)
      const expected = { ...kept, importDialog: 'block', errorShown: true, badClues: 0 }
      assert.deepEqual(await settle(() => boardState(page), expected), expected)
      await context.close()
    })
  }
})
