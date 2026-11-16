// The round trip's pages (`openReloader` in `live/page.mjs`, `roundTrips` in `live/replay.mjs`): a page reused for
// load after load boots each link as a fresh page would, and a link already loaded for the same board is not loaded again.
import assert from 'node:assert/strict'
import { afterEach, before, beforeEach, describe, it } from 'node:test'
import { canonicalState, readEngineState } from './canonical-state.mjs'
import { AKARI_SOLVE, openPenpa, openReloader, useBrowser } from './page.mjs'
import { duplicateLinkInPage, linkHash, roundTrips } from './replay.mjs'

const browser = useBrowser()

const readPage = (page) => page.evaluate(readEngineState).then(canonicalState)

// Runs in the page: leaves an entry in every store Penpa+ keeps between visits, and a JS global.
async function leaveEntriesInPage () {
  window.leftover = 'global'
  localStorage.setItem('leftover', 'local')
  sessionStorage.setItem('leftover', 'session')
  await localforage.setItem('leftover', 'localforage')
  document.cookie = 'leftover=cookie;path=/'
}

// Runs in the page: what the page finds of `leaveEntriesInPage`'s entries.
async function entriesInPage () {
  return {
    global: window.leftover ?? null,
    local: localStorage.getItem('leftover'),
    session: sessionStorage.getItem('leftover'),
    localforage: await localforage.getItem('leftover'),
    cookie: document.cookie.match(/(?:^|; )leftover=([^;]*)/)?.[1] ?? null
  }
}

describe('openReloader', () => {
  // Chromium keeps no cookie for `file://`, so only the served page shows one.
  for (const served of [false, true]) {
    it(`boots each load with none of what the page before it left${served ? ', served' : ', over file://'}`, async () => {
      const reloader = await openReloader(browser(), { served })
      try {
        const first = await reloader.load(AKARI_SOLVE)
        await first.page.evaluate(leaveEntriesInPage)
        assert.deepEqual(await first.page.evaluate(entriesInPage), {
          global: 'global', local: 'local', session: 'session', localforage: 'localforage', cookie: served ? 'cookie' : null
        })
        const second = await reloader.load(AKARI_SOLVE)
        assert.deepEqual(await second.page.evaluate(entriesInPage), {
          global: null, local: null, session: null, localforage: null, cookie: null
        })
      } finally {
        await reloader.close()
      }
    })
  }
})

describe('roundTrips', () => {
  let source, links, want, otherWant
  before(async () => {
    const { context, page } = await openPenpa(browser(), AKARI_SOLVE)
    try {
      // The solve mode's duplicate link carries the timer's reading on a line of its own.
      const linkAt = async (seconds) => {
        await page.evaluate((seconds) => {
          sw_timer.stop()
          sw_timer.start({ precision: 'secondTenths', startValues: { seconds } })
          sw_timer.pause()
        }, seconds)
        return linkHash(await page.evaluate(duplicateLinkInPage))
      }
      source = await readPage(page)
      links = { early: await linkAt(5), late: await linkAt(9) }
      await page.evaluate(() => {
        pu.mode_set('surface')
        pu.undoredo_counter++
        pu.set_surface(pu.centerlist[0], 1)
        pu.redraw()
      })
      links.shaded = await linkAt(9)
      want = source
      otherWant = await readPage(page)
    } finally {
      await context.close()
    }
  })

  // Each test starts with no link loaded.
  let trips
  beforeEach(() => { trips = roundTrips(browser()) })
  afterEach(async () => { await trips.close() })

  const load = (link, board) => trips.load(link, board, readPage)

  it('loads a link, and not again when only its timer reading differs and the board is the same', async () => {
    assert.notEqual(links.early, links.late, 'the two links differ, in the timer line')
    const first = await load(links.early, want)
    assert.equal(first.got, want)
    assert.deepEqual(first.errors, [])
    assert.equal(await load(links.late, want), null)
  })

  it('loads a link whose timer-blind text was loaded before when the board it must give differs', async () => {
    assert.notEqual(await load(links.early, want), null)
    const loaded = await load(links.late, otherWant)
    assert.notEqual(loaded, null)
    assert.equal(loaded.got, want)
  })

  it('loads a link that differs from an earlier one outside the timer line', async () => {
    assert.notEqual(await load(links.early, want), null)
    const loaded = await load(links.shaded, want)
    assert.notEqual(loaded, null)
    assert.equal(loaded.got, otherWant)
  })
})
