// The header's text escapes round-trip any text, and still read a link saved before `%` was escaped.
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { describe, it } from 'node:test'
import vm from 'node:vm'

const source = readFileSync(new URL('../docs/js/header_text.js', import.meta.url), 'utf8')
const header = vm.runInNewContext(`${source}; ({ encode_header_text, decode_header_text, header_text_to_html, HEADER_ESCAPED_CHARS })`)

const TEXT = 'a<b & c = d, e %2C f %2D %25 50%\nend'

describe('the header text escapes', () => {
  for (const kind of ['line', 'rules']) {
    it(`${kind}: text with , & = < %2C and a newline round-trips`, () => {
      const chars = header.HEADER_ESCAPED_CHARS[kind]
      const text = kind === 'line' ? TEXT.replace('\n', ' ') : TEXT
      assert.equal(header.decode_header_text(header.encode_header_text(text, chars), chars), text)
    })

    it(`${kind}: the encoded text holds no comma`, () => {
      assert.equal(header.encode_header_text(TEXT, header.HEADER_ESCAPED_CHARS[kind]).includes(','), false)
    })
  }

  it('rules: the encoded text holds no newline', () => {
    assert.equal(header.encode_header_text(TEXT, header.HEADER_ESCAPED_CHARS.rules).includes('\n'), false)
  })

  it('a Source keeps the `%2F` and `%2E` of its URL', () => {
    const chars = header.HEADER_ESCAPED_CHARS.line
    assert.equal(header.decode_header_text('https://x.test/a%2Fb%2Ec', chars), 'https://x.test/a%2Fb%2Ec')
  })

  it('reads the escapes of a link saved before `%` was escaped', () => {
    const chars = header.HEADER_ESCAPED_CHARS.rules
    assert.equal(header.decode_header_text('a%2Cb%2Dc%2Ed%2Fe 50%', chars), 'a,b\nc&d=e 50%')
  })

  it('header_text_to_html shows markup as text and a newline as a line break', () => {
    assert.equal(header.header_text_to_html('a<b & "c"\nd'), 'a&lt;b &amp; &quot;c&quot;<br>d')
  })
})
