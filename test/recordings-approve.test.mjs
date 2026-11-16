// `npm run recordings:approve -- <id> ...` (#33): the ids it refuses, which it refuses before a browser is launched, so
// these run with none. The replay it writes from is checked by the replay tests.
import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { readFileSync } from 'node:fs'
import { describe, it } from 'node:test'
import { fileURLToPath } from 'node:url'

const ROOT = fileURLToPath(new URL('..', import.meta.url))

function approve (...ids) {
  const { status, stderr } = spawnSync('npm', ['run', '--silent', 'recordings:approve', '--', ...ids], { cwd: ROOT, encoding: 'utf8' })
  return { status, stderr }
}

describe('npm run recordings:approve', () => {
  it('refuses to run with no id', () => {
    const { status, stderr } = approve()
    assert.notEqual(status, 0)
    assert.match(stderr, /usage: npm run recordings:approve -- <id> \.\.\./)
  })

  for (const [what, id] of [['"all"', 'all'], ['a glob', 'genre/*'], ['a family', 'genre'], ['an unknown id', 'genre/no-such-puzzle']]) {
    it(`refuses ${what}, naming it, and writes nothing`, () => {
      const known = 'genre/box'
      const before = readFileSync(new URL(`../live/recordings/${known}.expected.json`, import.meta.url), 'utf8')
      const { status, stderr } = approve(known, id)
      assert.notEqual(status, 0)
      assert.match(stderr, new RegExp(`^no recording ${id.replace(/[*]/g, '\\*')}:`, 'm'))
      assert.equal(readFileSync(new URL(`../live/recordings/${known}.expected.json`, import.meta.url), 'utf8'), before)
    })
  }
})
