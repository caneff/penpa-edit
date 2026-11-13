// caneff: how a link's header carries the text of Title, Author, Source and Rules (#21).
// The header is comma separated, so a comma becomes `%2C`; `%` becomes `%25` so a `%2C` typed in the text survives.
const HEADER_ESCAPES = { '%': '%25', ',': '%2C', '\n': '%2D', '&': '%2E', '=': '%2F' };

// Title, Author and Source carry only the characters that break the header; Rules also carries newline, `&` and `=`.
const HEADER_ESCAPED_CHARS = { line: '%,', rules: '%,\n&=' };

// One pass, so the `%` an escape adds is never escaped again.
function encode_header_text(text, escaped) {
    return text.replace(new RegExp('[' + escaped.replace('\n', '\\n') + ']', 'g'), (c) => HEADER_ESCAPES[c]);
}

function decode_header_text(text, escaped) {
    const codes = {};
    for (const c of escaped) {
        codes[HEADER_ESCAPES[c]] = c;
    }
    return text.replace(/%2[5CDEF]/g, (code) => codes[code] ?? code);
}

// The characters of `text` as HTML, with each newline a line break.
function header_text_to_html(text) {
    const entities = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };
    return text.replace(/[&<>"']/g, (c) => entities[c]).replace(/\n/g, '<br>');
}
