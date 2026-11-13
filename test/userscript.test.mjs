// The Redirect script: its body run in a page whose `location` is the link opened, and its header read as Tampermonkey reads it.
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { describe, it } from 'node:test'
import vm from 'node:vm'
import { FORK_URL as FORK, RAW_SCRIPT_URL, REDIRECT_SCRIPT, UPSTREAM_URL as UPSTREAM } from './redirect-urls.mjs'

// Where the script sends a page opened at `href`; null when it leaves the page alone.
function redirectOf (href) {
  let target = null
  vm.runInNewContext(readFileSync(REDIRECT_SCRIPT, 'utf8'), { location: { href, replace: (url) => { target = url } } })
  return target
}

// The value of each `// @key value` line of the script's header.
function headerOf () {
  const header = readFileSync(REDIRECT_SCRIPT, 'utf8').match(/\/\/ ==UserScript==\n([\s\S]*?)\/\/ ==\/UserScript==/)[1]
  return Object.fromEntries([...header.matchAll(/^\/\/ @(\S+)\s+(.*)$/gm)].map(([, key, value]) => [key, value.trim()]))
}

describe('the Redirect script', () => {
  it('matches upstream\'s pages, runs at document start and updates from the raw file on master', () => {
    const header = headerOf()
    assert.equal(header.match, UPSTREAM + '*')
    assert.equal(header['run-at'], 'document-start')
    assert.equal(header.updateURL, RAW_SCRIPT_URL)
    assert.equal(header.downloadURL, RAW_SCRIPT_URL)
  })

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
