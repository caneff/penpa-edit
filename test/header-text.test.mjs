// The header's text escapes round-trip text without an escape code in it. As in upstream, `%` is not escaped, so a
// typed `%2C` reads back as a comma.
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { describe, it } from 'node:test'
import vm from 'node:vm'

const source = readFileSync(new URL('../docs/js/header_text.js', import.meta.url), 'utf8')
const header = vm.runInNewContext(`${source}; ({ HEADER_TEXT, header_text_to_html })`)

const LINE = 'a<b & c = d, e 50% %25'
const RULES = `${LINE}\nend`

describe('the header text escapes', () => {
  it('line: text with , & = < % round-trips', () => {
    assert.equal(header.HEADER_TEXT.line.decode(header.HEADER_TEXT.line.encode(LINE)), LINE)
  })

  it('rules: text with , & = < % and a newline round-trips', () => {
    assert.equal(header.HEADER_TEXT.rules.decode(header.HEADER_TEXT.rules.encode(RULES)), RULES)
  })

  it('the encoded text holds no comma, and rules none either newline', () => {
    const encoded = { line: header.HEADER_TEXT.line.encode(LINE), rules: header.HEADER_TEXT.rules.encode(RULES) }
    assert.deepEqual(
      { line: encoded.line.includes(','), rules: encoded.rules.includes(',') || encoded.rules.includes('\n') },
      { line: false, rules: false }
    )
  })

  it('a `%` is written as it is, as in upstream', () => {
    assert.equal(header.HEADER_TEXT.line.encode('50% %25'), '50% %25')
  })

  it('a literal `%2C` reads back as a comma, as in upstream', () => {
    assert.equal(header.HEADER_TEXT.line.decode(header.HEADER_TEXT.line.encode('ids=a%2Cb')), 'ids=a,b')
  })

  it('a Source keeps the `%2F` and `%2E` of its URL', () => {
    assert.equal(header.HEADER_TEXT.line.decode('https://x.test/a%2Fb%2Ec'), 'https://x.test/a%2Fb%2Ec')
  })

  it('reads the escapes of a rules text saved by upstream', () => {
    assert.equal(header.HEADER_TEXT.rules.decode('a%2Cb%2Dc%2Ed%2Fe 50%'), 'a,b\nc&d=e 50%')
  })

  it('header_text_to_html shows markup as text and a newline as a line break', () => {
    assert.equal(header.header_text_to_html('a<b & "c"\nd'), 'a&lt;b &amp; "c"<br>d')
  })
})
