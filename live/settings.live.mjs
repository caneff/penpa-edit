// Penpa+ settings are cookies; they must outlive the browser, so each needs an expiry in the future.
import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { openPenpa, useBrowser } from './page.mjs'
import { settle } from './settle.mjs'

const browser = useBrowser()

// The cookies a browser restart keeps: Chromium drops session cookies (`expires: -1`) when it closes.
const survivingCookies = (context) => context.cookies().then((cookies) => cookies.filter((c) => c.expires !== -1))

describe('a changed setting', () => {
  it('is saved in cookies that expire in the future', async () => {
    const { context, page } = await openPenpa(browser(), '', { http: true })
    await page.evaluate(() => { UserSettings.color_theme = THEME_DARK })
    const cookies = await context.cookies()
    assert.ok(cookies.length > 0, 'saving the setting wrote cookies')
    const now = Date.now() / 1000
    const session = cookies.filter((c) => !(c.expires > now)).map((c) => c.name)
    assert.deepEqual(session, [], 'every cookie has a future expiry')
    await context.close()
  })

  it('reads back after the browser restarts', async () => {
    const first = await openPenpa(browser(), '', { http: true })
    await first.page.evaluate(() => { UserSettings.color_theme = THEME_DARK })
    const kept = await survivingCookies(first.context)
    await first.context.close()

    const second = await openPenpa(browser(), '', { http: true, cookies: kept })
    const read = () => second.page.evaluate(() => UserSettings.color_theme)
    assert.equal(await settle(read, 2), 2)
    await second.context.close()
  })
})
