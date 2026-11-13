// caneff: how a link's header carries the text of Title, Author, Source and Rules (#21).
// The header is comma separated, so a comma becomes `%2C`. `%` is not escaped, to keep upstream's link format, so a
// `%2C` typed in the text reads back as a comma, as in upstream (Chris, 2026-11-13).
const HEADER_ESCAPES = { ',': '%2C', '\n': '%2D', '&': '%2E', '=': '%2F' };

// The encoder and decoder for the characters `chars` escape, each one pass.
function header_codec(chars) {
    const code_of = Object.fromEntries([...chars].map((c) => [c, HEADER_ESCAPES[c]]));
    const char_of = Object.fromEntries(Object.entries(code_of).map(([c, code]) => [code, c]));
    const char_pattern = new RegExp('[' + [...chars].map((c) => '\\x' + c.charCodeAt(0).toString(16).padStart(2, '0')).join('') + ']', 'g');
    const code_pattern = new RegExp(Object.values(code_of).join('|'), 'g');
    return {
        encode: (text) => text.replace(char_pattern, (c) => code_of[c]),
        decode: (text) => text.replace(code_pattern, (code) => char_of[code])
    };
}

// Title, Author and Source carry only the characters that break the header; Rules also carries newline, `&` and `=`.
const HEADER_TEXT = { line: header_codec(','), rules: header_codec(',\n&=') };

// `text` as HTML element content, with each newline a line break.
function header_text_to_html(text) {
    const entities = { '&': '&amp;', '<': '&lt;', '>': '&gt;' };
    return text.replace(/[&<>]/g, (c) => entities[c]).replace(/\n/g, '<br>');
}
