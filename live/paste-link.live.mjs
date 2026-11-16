// A bare `solve.html` (no puzzle data) asks for a Penpa+ link and opens `solve.html` on that link's `#` data.
// The box is read by role and accessible name; the board it opens is read through `engine`.
import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { AKARI_SOLVE, openSolvePage, useBrowser } from './page.mjs'
import { settle } from './settle.mjs'

const browser = useBrowser()

const UPSTREAM = 'https://swaroopg92.github.io/penpa-edit/'
const FORK = 'https://caneff.github.io/penpa-edit/'

// Opens bare solve.html: the paste box shows, no desk is built.
async function openBare () {
  const { context, page } = await openSolvePage(browser(), '', { skipDesk: true })
  const box = page.getByRole('textbox', { name: 'Penpa+ link' })
  await box.waitFor()
  return { context, page, box, open: page.getByRole('button', { name: 'Open' }), error: page.getByRole('alert') }
}

const pasteAndOpen = async ({ box, open }, link) => {
  await box.fill(link)
  await open.click()
}

describe('solve.html with no puzzle data', () => {
  it('shows a paste box and no error', async () => {
    const bare = await openBare()
    try {
      assert.equal(await bare.error.isVisible(), false)
      assert.equal(await bare.page.getByRole('region', { name: 'Board' }).count(), 0, 'no desk is built')
    } finally { await bare.context.close() }
  })

  for (const [host, link] of [
    ['upstream host', `${UPSTREAM}${AKARI_SOLVE}`],
    ['upstream host, with a query', `${UPSTREAM}?foo=1${AKARI_SOLVE}`],
    ['fork host, solve.html', `${FORK}solve.html${AKARI_SOLVE}`]
  ]) {
    it(`opens a pasted solve link from the ${host}, with the board loaded and no error`, async () => {
      const bare = await openBare()
      try {
        await pasteAndOpen(bare, link)
        await bare.page.getByRole('region', { name: 'Board' }).waitFor()
        await bare.page.evaluate(() => engine.ready)
        assert.equal(await bare.page.evaluate(() => location.hash), AKARI_SOLVE)
        assert.equal(await settle(() => bare.page.evaluate(() => engine.getInfo().title !== undefined), true), true)
        assert.equal(await bare.page.getByRole('alert').count(), 0, 'the box is gone with no error')
      } finally { await bare.context.close() }
    })
  }

  for (const [why, link] of [
    ['a Penpa+ link with no # part', `${UPSTREAM}?m=solve`],
    ['a link that is not a Penpa+ link', `https://example.com/page${AKARI_SOLVE}`],
    ['text that is not a link', 'hello']
  ]) {
    it(`shows an error and opens nothing for ${why}`, async () => {
      const bare = await openBare()
      try {
        await pasteAndOpen(bare, link)
        assert.equal(await bare.error.isVisible(), true)
        assert.equal(await bare.page.evaluate(() => location.hash), '')
        assert.equal(await bare.page.getByRole('region', { name: 'Board' }).count(), 0)
      } finally { await bare.context.close() }
    })
  }

  it('clears the error when the next pasted link is good', async () => {
    const bare = await openBare()
    try {
      await pasteAndOpen(bare, 'hello')
      assert.equal(await bare.error.isVisible(), true)
      await pasteAndOpen(bare, `${UPSTREAM}${AKARI_SOLVE}`)
      await bare.page.getByRole('region', { name: 'Board' }).waitFor()
    } finally { await bare.context.close() }
  })
})
