// Penpa+ opens a solve link: the page boots with no page error or console.error, in solve mode, with the puzzle's clues.
import assert from 'node:assert/strict'
import { after, before, describe, it } from 'node:test'
import { openPenpa, useBrowser } from './page.mjs'
import { settle } from './settle.mjs'

// `pu.maketext_solve()` after importing Akari 1 of `test/public/puzz_link_parser.js`, whose snapshot holds 13 numbers.
const AKARI_SOLVE = '#m=solve&p=1VTtb7pIEP7uX9Hs124QBC2SNBff2qRpvXq1P68SY1BRUHQtL63BtH97Z3bxcNE2l7vchwvszOwzy+zMss9Er4kTulRT8dVNChoeQzP5qJg1PtTs6ftx4FoXtJHEHgvB8OJ4G1nl8jZJh+lQCfzNqrz9zVk5oV/WVHwVZaF4iq8slZUSKLGqGfoE124p/f3mhs6dIHLp3cuy2V413juNP8vVoa4/d+eXy3bveTkb/NJ6ql8O1W5gbh4e283g8jYdPniNN7fj1h4jNvUC15k56XBwtws2N+bCm2utO69lzp2NGr2a/fpbs3d9XbKzGkYlm2iEkgoMjYw+yZStJz75tAnPmlB9VNqnf1j7dGzZow+aPuemmZtP1p7oKrEMSnRNKF2oGleGIVSdq6pQNeEzxawuPq+Lz+sVoTAKxO9m8W1yQegVT1XsJAOwWgZgBwnAPGQANpcAzE0CMEsJwHzh+A5TzNvW8ikmZeRTqMPW8ylmeFgMdWnWHuQLl304SprqXLa5VLmscnnP13S4HHDZ4tLgssbXXOHPKJVsXVxb+an+/zC8nE9JOHemLlzPFltvWeTHLoErSSIWjCPhG7s7ZxoTS5Dn2CNhm2Q9cUMJChjbAknPRTi4JNBfbFjonnUh6M4W34VC15lQExbOCjm9O0Eg18J7kgRN/XAayFAMZD2eO2HI3iVk7cSeBEycGPpX5PlbOZK7KRxm7MgpitYgxc6P46NEdoQPuPcVamD/qFtpg6a3wKOjXkPTHjSQBytrOdhEbELgr1OyToLYn7KAwb4ZBgTgX1fA7OTmgPvRaglQU8HuZjaYL2CK4xrfC+TRstM+JZhAk3+NJlmzN6hAJIhzkRQAR6cEzRDKTWZslWRLNSRx4x+UAZEOZaApykDrTBlY3b8u4692XqigPvoQf0z9m31edOP/qHftMmaz8Ady584ifIbigP7A8iPvOfwbQh95i/gJezHZUwIDeobDgBZpDNApkwE8ITNg3/AZoxYpjVkVWY1bnRAbtzrm9uEijUoc+AI='

const browser = useBrowser()

describe('a solve link', () => {
  let opened
  before(async () => { opened = await openPenpa(browser(), AKARI_SOLVE) })
  after(async () => { await opened?.context.close() })

  it('opens in solve mode with its clues and no error', async () => {
    const { page, errors } = opened
    const expected = { mode: 'solve', clues: 13 }
    const read = () => page.evaluate(() => ({ mode: pu.mmode, clues: Object.keys(pu.pu_q.number).length }))
    assert.deepEqual(await settle(read, expected), expected)
    assert.deepEqual(errors, [])
  })
})
