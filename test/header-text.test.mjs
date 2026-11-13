// The header's text escapes round-trip any text. A link saved before `%` was escaped reads as before, except that a
// `%25` in its text now reads as `%`.
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { describe, it } from 'node:test'
import vm from 'node:vm'

const source = readFileSync(new URL('../docs/js/header_text.js', import.meta.url), 'utf8')
const header = vm.runInNewContext(`${source}; ({ HEADER_TEXT, header_text_to_html })`)

const LINE = 'a<b & c = d, e %2C f %2D %25 50%'
const RULES = `${LINE}\nend`

describe('the header text escapes', () => {
  it('line: text with , & = < %2C round-trips', () => {
    assert.equal(header.HEADER_TEXT.line.decode(header.HEADER_TEXT.line.encode(LINE)), LINE)
  })

  it('rules: text with , & = < %2C and a newline round-trips', () => {
    assert.equal(header.HEADER_TEXT.rules.decode(header.HEADER_TEXT.rules.encode(RULES)), RULES)
  })

  it('the encoded text holds no comma, and rules none either newline', () => {
    const encoded = { line: header.HEADER_TEXT.line.encode(LINE), rules: header.HEADER_TEXT.rules.encode(RULES) }
    assert.deepEqual(
      { line: encoded.line.includes(','), rules: encoded.rules.includes(',') || encoded.rules.includes('\n') },
      { line: false, rules: false }
    )
  })

  it('a Source keeps the `%2F` and `%2E` of its URL', () => {
    assert.equal(header.HEADER_TEXT.line.decode('https://x.test/a%2Fb%2Ec'), 'https://x.test/a%2Fb%2Ec')
  })

  it('reads the escapes of a rules text saved before `%` was escaped', () => {
    assert.equal(header.HEADER_TEXT.rules.decode('a%2Cb%2Dc%2Ed%2Fe 50%'), 'a,b\nc&d=e 50%')
  })

  it('reads a `%25` of a text saved before `%` was escaped as `%`', () => {
    assert.equal(header.HEADER_TEXT.line.decode('100%25 a%2Cb'), '100% a,b')
  })

  it('header_text_to_html shows markup as text and a newline as a line break', () => {
    assert.equal(header.header_text_to_html('a<b & "c"\nd'), 'a&lt;b &amp; "c"<br>d')
  })
})
