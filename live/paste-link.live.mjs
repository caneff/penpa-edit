// A bare `solve.html` (no puzzle data) asks for a Penpa+ link and opens `solve.html` on that link's puzzle data, from its `?` or its `#`.
// The box is read by role and accessible name; the board it opens is read through `engine`.
import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { AKARI_SOLVE, openPenpa, openSolvePage, THEME_KEY, useBrowser } from './page.mjs'
import { settle } from './settle.mjs'

const browser = useBrowser()

const UPSTREAM = 'https://swaroopg92.github.io/penpa-edit/'
const FORK = 'https://caneff.github.io/penpa-edit/'

// Opens bare solve.html: the paste box shows, no desk is built.
async function openBare () {
  const { context, page } = await openPenpa(browser(), '', { solve: true })
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
      assert.equal(await bare.page.getByText('New Grid / Update').isVisible(), false, 'Penpa+\'s own page is hidden')
    } finally { await bare.context.close() }
  })

  const ANSWER = '&a=VcIxDQAACANBLz8zsSDmU/82OpOcskfGJwU='
  for (const [host, link, hash] of [
    ['upstream host', `${UPSTREAM}${AKARI_SOLVE}`, AKARI_SOLVE],
    ['upstream host, with a query', `${UPSTREAM}?foo=1${AKARI_SOLVE}`, AKARI_SOLVE],
    ['fork host, solve.html', `${FORK}solve.html${AKARI_SOLVE}`, AKARI_SOLVE],
    ['upstream host, puzzle in the query', `${UPSTREAM}?${AKARI_SOLVE.slice(1)}`, AKARI_SOLVE],
    ['fork host, puzzle in the query', `${FORK}solve.html?${AKARI_SOLVE.slice(1)}`, AKARI_SOLVE],
    ['upstream host, puzzle and answer in the query', `${UPSTREAM}?${AKARI_SOLVE.slice(1)}${ANSWER}`, AKARI_SOLVE + ANSWER],
    ['upstream host, a query without p= and the puzzle in the #', `${UPSTREAM}?fbclid=abc${AKARI_SOLVE}`, AKARI_SOLVE],
    ['upstream host, a query whose parameter only ends in p=, and the puzzle in the #', `${UPSTREAM}?sp=1${AKARI_SOLVE}`, AKARI_SOLVE],
    ['upstream host, puzzle in both: the query wins', `${UPSTREAM}?${AKARI_SOLVE.slice(1)}#m=edit&p=other`, AKARI_SOLVE]
  ]) {
    it(`opens a pasted link from the ${host}, with the board loaded and no error`, async () => {
      const bare = await openBare()
      try {
        await pasteAndOpen(bare, link)
        await bare.page.getByRole('region', { name: 'Board' }).waitFor()
        await bare.page.evaluate(() => engine.ready)
        assert.equal(await bare.page.evaluate(() => location.hash), hash)
        assert.equal(await settle(() => bare.page.evaluate(() => engine.getInfo().title !== undefined), true), true)
        assert.equal(await bare.page.getByRole('textbox', { name: 'Penpa+ link' }).count(), 0, 'the box is gone')
      } finally { await bare.context.close() }
    })
  }

  it('names both places a puzzle can be in the error', async () => {
    const bare = await openBare()
    try {
      await pasteAndOpen(bare, 'hello')
      const text = await bare.error.textContent()
      assert.match(text, /\?m=solve&p=/)
      assert.match(text, /#m=solve&p=/)
    } finally { await bare.context.close() }
  })

  for (const [why, link] of [
    ['a Penpa+ link with no p= in its query or #', `${UPSTREAM}?m=solve`],
    ['a Penpa+ link whose # part holds no puzzle', `${UPSTREAM}#m=solve`],
    ['a Penpa+ link whose query has no p= and # has none', `${UPSTREAM}?fbclid=abc#m=solve`],
    ['a link on a Penpa+ host but another path', `https://swaroopg92.github.io/other/${AKARI_SOLVE}`],
    ['a link on another host with Penpa+\'s path', `https://example.com/penpa-edit/${AKARI_SOLVE}`],
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
})

describe('the paste page\'s look (#193)', () => {
  // Runs in the page: the paste page's own nodes by tag, with whether Web Awesome has upgraded them and the card's colours.
  const lookInPage = () => {
    const card = document.querySelector('.ui-paste')
    const parse = (css) => css.match(/[\d.]+/g).map(Number)
    return {
      inputTag: document.querySelector('#paste-link-input')?.tagName,
      buttonTag: card.querySelector('[type=submit]')?.tagName,
      upgraded: [...card.querySelectorAll('wa-input, wa-button')].every((n) => n.matches(':defined')),
      htmlDark: document.documentElement.classList.contains('wa-dark'),
      cardBackground: parse(getComputedStyle(card).backgroundColor),
      cardText: parse(getComputedStyle(card).color),
      pageBackground: parse(getComputedStyle(document.body).backgroundColor),
      pageText: card.innerText
    }
  }

  it('uses the desk\'s Web Awesome input and button, named and with one line of help and an example link', async () => {
    const bare = await openBare()
    try {
      const look = await bare.page.evaluate(lookInPage)
      assert.equal(look.inputTag, 'WA-INPUT')
      assert.equal(look.buttonTag, 'WA-BUTTON')
      assert.equal(look.upgraded, true)
      assert.equal(await bare.page.getByRole('heading', { name: 'ChinStrap solve page' }).count(), 1)
      assert.match(look.pageText, /https:\/\/caneff\.github\.io\/penpa-edit\/\S*[?#]\S*p=/, 'an example link')
    } finally { await bare.context.close() }
  })

  it('puts the focus in the box on load, and Enter in it opens the link', async () => {
    const bare = await openBare()
    try {
      assert.equal(await bare.page.evaluate(() => document.activeElement.id), 'paste-link-input')
      await bare.page.keyboard.type(`${UPSTREAM}${AKARI_SOLVE}`)
      await bare.page.keyboard.press('Enter')
      await bare.page.getByRole('region', { name: 'Board' }).waitFor()
      assert.equal(await bare.page.evaluate(() => location.hash), AKARI_SOLVE)
    } finally { await bare.context.close() }
  })

  // Runs in the page: the error's background against what the theme's danger token paints.
  const errorColoursInPage = () => {
    const probe = document.createElement('div')
    probe.style.background = 'var(--wa-color-danger-fill-quiet)'
    document.body.append(probe)
    const expected = getComputedStyle(probe).backgroundColor
    probe.remove()
    return { actual: getComputedStyle(document.querySelector('[role=alert]')).backgroundColor, expected }
  }

  for (const theme of ['light', 'dark']) {
    it(`shows the error below the box, in the ${theme} theme's danger colours`, async () => {
      const bare = await openBare()
      try {
        await bare.page.evaluate(([key, t]) => localStorage.setItem(key, t), [THEME_KEY, theme])
        await bare.page.reload()
        await bare.box.fill('hello')
        await bare.open.click()
        await bare.error.waitFor()
        const { actual, expected } = await bare.page.evaluate(errorColoursInPage)
        assert.equal(actual, expected)
        const [boxBottom, errorTop] = await bare.page.evaluate(() => [
          document.querySelector('#paste-link-input').getBoundingClientRect().bottom,
          document.querySelector('[role=alert]').getBoundingClientRect().top])
        assert.equal(errorTop >= boxBottom, true, `the error (top ${errorTop}) is below the box (bottom ${boxBottom})`)
      } finally { await bare.context.close() }
    })
  }

  for (const [theme, dark] of [['light', false], ['dark', true]]) {
    it(`follows the saved ${theme} theme: page, card and text`, async () => {
      const bare = await openBare()
      try {
        await bare.page.evaluate(([key, t]) => localStorage.setItem(key, t), [THEME_KEY, theme])
        await bare.page.reload()
        await bare.page.getByRole('textbox', { name: 'Penpa+ link' }).waitFor()
        const look = await bare.page.evaluate(lookInPage)
        assert.equal(look.htmlDark, dark)
        const mean = ([r, g, b]) => (r + g + b) / 3
        assert.equal(mean(look.cardBackground) < 100, dark, `card background ${look.cardBackground}`)
        assert.equal(mean(look.pageBackground) < 100, dark, `page background ${look.pageBackground}`)
        assert.equal(mean(look.cardText) > 150, dark, `card text ${look.cardText}`)
      } finally { await bare.context.close() }
    })
  }
})

describe('solve.html with a puzzle in its link', () => {
  it('shows no paste box', async () => {
    const { context, page } = await openSolvePage(browser(), AKARI_SOLVE)
    try {
      assert.equal(await page.getByRole('textbox', { name: 'Penpa+ link' }).count(), 0)
    } finally { await context.close() }
  })
})
