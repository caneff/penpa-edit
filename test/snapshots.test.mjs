// Upstream's puzz.link import snapshots, run once in headless Chromium over file://. The puzzle list and the
// snapshot's shape are upstream's (`test/public/puzz_link_parser.js`), read from that file so an upstream merge that
// adds a puzzle adds its test here. A snapshot is never written: a missing file fails its test.
import assert from 'node:assert/strict'
import { readdirSync } from 'node:fs'
import { before, describe, it } from 'node:test'
import { openPenpa, useBrowser } from '../live/page.mjs'
import { SNAPSHOTS, cases, readSnapshot, snapshotName } from '../live/puzzlink-cases.mjs'

const browser = useBrowser()

describe('puzz.link import snapshots', () => {
  let page
  before(async () => { ({ page } = await openPenpa(browser())) })

  // `useBrowser` fails this test on an error raised while the page booted.
  it('boots with no page error or console.error', () => {})

  // A puzzle line the list's pattern misses would otherwise drop out of the suite unnoticed.
  it('reads a puzzle from puzz_link_parser.js for every snapshot file', () => {
    const files = readdirSync(SNAPSHOTS).filter((f) => f.startsWith('puzzlink_')).sort()
    assert.deepEqual(cases.map(({ name }) => snapshotName(name)).sort(), files)
  })

  for (const { name, url } of cases) {
    it(`${name} (${url})`, async () => {
      const actual = await page.evaluate(async (u) => {
        await import_url(u)
        const contents = { ...pu.pu_q }
        // Class instances, not data: upstream leaves them out of the snapshot.
        delete contents.command_undo
        delete contents.command_redo
        delete contents.command_replay
        return JSON.parse(JSON.stringify({
          contents,
          genre_tags: $('#genre_tags_opt').select2('val'),
          grid_size: [pu.nx0, pu.ny0],
          grid_type: pu.gridtype,
          mode: pu.mode,
          outside_spacing: pu.space
        }))
      }, url)
      assert.deepEqual(actual, readSnapshot(name))
    })
  }
})
