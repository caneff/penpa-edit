// Penpa+ settings are cookies; they must outlive the browser, so each needs an expiry in the future.
import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { openPenpa, useBrowser } from './page.mjs'
import { settle } from './settle.mjs'

const browser = useBrowser()

// Chromium drops a session cookie (`expires: -1`) when it closes; any cookie without a future expiry counts as one.
const outlivesRestart = (cookie) => cookie.expires > Date.now() / 1000
const survivingCookies = (context) => context.cookies().then((cookies) => cookies.filter(outlivesRestart))

describe('a changed setting', () => {
  it('is saved in cookies that expire in the future', async () => {
    const { context, page } = await openPenpa(browser(), '', { served: true })
    await page.evaluate(() => { UserSettings.color_theme = THEME_DARK })
    const cookies = await context.cookies()
    assert.ok(cookies.length > 0, 'saving the setting wrote cookies')
    const session = cookies.filter((c) => !outlivesRestart(c)).map((c) => c.name)
    assert.deepEqual(session, [], 'every cookie has a future expiry')
    await context.close()
  })

  it('reads back after the browser restarts', async () => {
    const first = await openPenpa(browser(), '', { served: true })
    await first.page.evaluate(() => { UserSettings.color_theme = THEME_DARK })
    const kept = await survivingCookies(first.context)
    await first.context.close()

    const second = await openPenpa(browser(), '', { served: true, cookies: kept })
    const dark = await second.page.evaluate(() => THEME_DARK)
    const read = () => second.page.evaluate(() => UserSettings.color_theme)
    assert.equal(await settle(read, dark), dark)
    await second.context.close()
  })
})

describe('conflict detection', () => {
  const OFF_THIS_PUZZLE = 2
  const OFF_ALL_PUZZLES = 3
  // Read once Penpa+ has loaded its cookies, so the default is not read before a saved value lands.
  const read = async (page) => {
    await page.waitForFunction(() => typeof UserSettings !== 'undefined' && UserSettings._settingsLoaded)
    return page.evaluate(() => UserSettings.conflict_detection)
  }

  // Setting another setting afterwards makes Penpa+ save every can_save setting, conflict_detection included.
  const setThenSaveOthers = (page, value) => page.evaluate((v) => {
    UserSettings.conflict_detection = v
    UserSettings.color_theme = THEME_DARK
  }, value)

  it('"off for this puzzle" is on again after the browser restarts', async () => {
    const first = await openPenpa(browser(), '', { served: true })
    await setThenSaveOthers(first.page, OFF_THIS_PUZZLE)
    const kept = await survivingCookies(first.context)
    await first.context.close()

    const second = await openPenpa(browser(), '', { served: true, cookies: kept })
    assert.equal(await read(second.page), 1)
    await second.context.close()
  })

  it('"off for this puzzle" is on again in a second puzzle of the same browser', async () => {
    const { context, page } = await openPenpa(browser(), '', { served: true })
    await setThenSaveOthers(page, OFF_THIS_PUZZLE)
    const next = await context.newPage()
    await next.goto(page.url())
    assert.equal(await read(next), 1)
    await context.close()
  })

  it('"off for every puzzle" survives a restart', async () => {
    const first = await openPenpa(browser(), '', { served: true })
    await setThenSaveOthers(first.page, OFF_ALL_PUZZLES)
    const kept = await survivingCookies(first.context)
    await first.context.close()

    const second = await openPenpa(browser(), '', { served: true, cookies: kept })
    assert.equal(await read(second.page), OFF_ALL_PUZZLES)
    await second.context.close()
  })
})
