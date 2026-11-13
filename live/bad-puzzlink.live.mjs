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
  'castle, arrow clue cut off': 'castle/5/5/01',
  'yajilin, number cut off': 'yajilin/5/5/0',
  'yajilin, arrow clue cut off': 'yajilin/5/5/1',
  'easyasabc, clue cut off': 'easyasabc/5/5//g',
  'a grid over the size limit': 'nurikabe/101/5/',
  'a genre Penpa+ lacks': 'nosuchgenre/5/5/x',
  'compass, clue cut off': 'compass/5/5/1',
  'mochikoro, number cut off': 'mochikoro/5/5/-',
  'nuribou, number cut off': 'nuribou/5/5/-',
  'nurikabe, number cut off': 'nurikabe/5/5/-'
}

// Opens the Load URL dialog, fills in `link` and presses its button.
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
  badClues: JSON.stringify([pu.pu_q.number, pu.pu_q.numberS]).match(/NaN|null/g)?.length ?? 0,
  gridSpace: ['nb_space1', 'nb_space2', 'nb_space3', 'nb_space4'].map((id) => document.getElementById(id).value),
  canvas: [pu.canvas.width, pu.canvas.height],
  tabSettings: UserSettings.tab_settings,
  source: document.getElementById('saveinfosource').value
}))

describe('a failed puzz.link import', () => {
  for (const [name, link] of Object.entries(MALFORMED)) {
    it(`keeps the board and shows an error: ${name}`, async () => {
      const { context, page } = await openPenpa(browser(), '')
      await importLink(page, NURIKABE)
      const before = await settle(async () => (await boardState(page)).numbers, 3)
      assert.equal(before, 3, 'the nurikabe loaded')
      // A non-default grid-size input, so a failed import that zeroes them shows.
      await page.evaluate(() => {
        document.querySelector('.swal2-container')?.remove()
        for (const id of ['nb_space1', 'nb_space2', 'nb_space3', 'nb_space4']) document.getElementById(id).value = 1
      })
      const kept = await boardState(page)

      await importLink(page, `https://puzz.link/p?${link}`)
      const expected = { ...kept, importDialog: 'block', errorShown: true, badClues: 0 }
      assert.deepEqual(await settle(() => boardState(page), expected), expected)
      await context.close()
    })
  }
})
