// The redirect userscript, run as Tampermonkey runs it: the whole file in a page whose `location` is the link opened.
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { describe, it } from 'node:test'
import vm from 'node:vm'

const USERSCRIPT = new URL('../userscript/penpa-redirect.user.js', import.meta.url)

const UPSTREAM = 'https://swaroopg92.github.io/penpa-edit/'
const FORK = 'https://caneff.github.io/penpa-edit/'

// Where the script sends a page opened at `href`; null when it leaves the page alone.
function redirectOf (href) {
  let target = null
  vm.runInNewContext(readFileSync(USERSCRIPT, 'utf8'), { location: { href, replace: (url) => { target = url } } })
  return target
}

describe('the redirect userscript', () => {
  it('keeps the # data of a hash link', () => {
    assert.equal(redirectOf(UPSTREAM + '#m=solve&p=abc%2Fdef'), FORK + '#m=solve&p=abc%2Fdef')
  })

  it('keeps the query of a ?-style link', () => {
    assert.equal(redirectOf(UPSTREAM + '?m=solve&p=abc'), FORK + '?m=solve&p=abc')
  })

  it('sends the bare page to the bare fork page', () => {
    assert.equal(redirectOf(UPSTREAM), FORK)
  })

  it('keeps a path tail with its query and # data', () => {
    assert.equal(redirectOf(UPSTREAM + 'index.html?x=1#m=edit'), FORK + 'index.html?x=1#m=edit')
  })

  it('leaves the fork alone', () => {
    assert.equal(redirectOf(FORK + '#m=solve&p=abc'), null)
  })
})
