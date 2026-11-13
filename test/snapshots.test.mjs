// Upstream's puzz.link import snapshots, run once in headless Chromium over file://. The puzzle list and the
// snapshot's shape are upstream's (`test/public/puzz_link_parser.js`), read from that file so an upstream merge that
// adds a puzzle adds its test here. A snapshot is never written: a missing file fails its test.
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { before, describe, it } from 'node:test'
import { openPenpa, useBrowser } from '../live/page.mjs'

const parser = readFileSync(new URL('./public/puzz_link_parser.js', import.meta.url), 'utf8')
const cases = [...parser.matchAll(/^\s+\["([^"]+)", "([^"]+)"\],?$/mg)].map(([, name, url]) => ({ name, url }))

// Upstream's filename rule, from `puzz_link_parser.js`.
const snapshotFile = (name) => new URL(`./snapshots/puzzlink_${name.toLowerCase().replace(/[^\w]/g, '_')}.json`, import.meta.url)

const browser = useBrowser()

describe('puzz.link import snapshots', () => {
  let page, errors
  before(async () => { ({ page, errors } = await openPenpa(browser())) })

  // Runs before any import, which clears `errors`.
  it('boots with no page error or console.error', () => {
    assert.deepEqual(errors, [])
  })

  it('reads the puzzle list from puzz_link_parser.js', () => {
    assert.notEqual(cases.length, 0, 'no puzzle found in test/public/puzz_link_parser.js')
  })

  for (const { name, url } of cases) {
    it(`${name} (${url})`, async () => {
      errors.length = 0
      const actual = await page.evaluate((u) => {
        import_url(u)
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
      assert.deepEqual(errors, [], 'the import raised no page error or console.error')
      assert.deepEqual(actual, JSON.parse(readFileSync(snapshotFile(name), 'utf8')))
    })
  }
})
