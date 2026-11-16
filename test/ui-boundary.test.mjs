// The solve UI (docs/ui/) reaches Penpa+ only through `engine`: no UI file may name Penpa+'s puzzle object, its settings, its
// timer, its popup library or an element id of its page. A Node check, since only a grep can see a name that does nothing in silence.
import assert from 'node:assert/strict'
import { readdirSync, readFileSync } from 'node:fs'
import { join, relative } from 'node:path'
import { describe, it } from 'node:test'
import { fileURLToPath } from 'node:url'

const ROOT = fileURLToPath(new URL('..', import.meta.url))
const UI_DIR = join(ROOT, 'docs/ui')
const UI_EXTENSIONS = /\.(js|css|html)$/
// Web Awesome's bundle is not ours to check.
const VENDOR_DIR = 'vendor'

// Penpa+'s own names a UI file must not use, as whole words.
const INTERNAL_NAMES = ['pu', 'UserSettings', 'sw_timer', 'Swal']

// The element ids Penpa+'s page marks up.
function legacyIds (indexHtml) {
  return new Set([...indexHtml.matchAll(/\bid="([^"]+)"/g)].map((m) => m[1]))
}

const escapeForRegExp = (text) => text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')

// The forbidden names `text` uses, one `{ line, name }` each. An id counts when used as one: `getElementById`, a
// `#id` selector, an `id="..."` attribute or `[id=...]`, so a plain word that happens to equal an id is not flagged.
function findViolations (text, ids) {
  const found = []
  const idUse = new RegExp(`(^|[^\\w&])#(${[...ids].map(escapeForRegExp).join('|')})(?![\\w-])|\\bid\\s*=\\s*["']?(${[...ids].map(escapeForRegExp).join('|')})(?![\\w-])|getElementById\\(`)
  text.split('\n').forEach((lineText, i) => {
    for (const name of INTERNAL_NAMES) {
      if (new RegExp(`\\b${name}\\b`).test(lineText)) found.push({ line: i + 1, name })
    }
    if (idUse.test(lineText)) found.push({ line: i + 1, name: 'a legacy DOM id' })
  })
  return found
}

function uiFiles (dir) {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const path = join(dir, entry.name)
    if (entry.isDirectory()) return entry.name === VENDOR_DIR ? [] : uiFiles(path)
    return UI_EXTENSIONS.test(entry.name) ? [path] : []
  })
}

const ids = legacyIds(readFileSync(join(ROOT, 'docs/index.html'), 'utf8'))

describe('the solve UI files', () => {
  it('name none of Penpa+\'s internals', () => {
    const files = uiFiles(UI_DIR)
    assert.notEqual(files.length, 0, 'there are UI files to check')
    const violations = files.flatMap((file) =>
      findViolations(readFileSync(file, 'utf8'), ids).map((v) => `${relative(ROOT, file)}:${v.line} names ${v.name}`))
    assert.deepEqual(violations, [])
  })
})

describe('the check', () => {
  it('reads Penpa+\'s element ids off index.html', () => {
    assert.equal(ids.has('dvique'), true)
    assert.equal(ids.has('saveinfotitle'), true)
  })

  const planted = {
    pu: 'const size = pu.size',
    UserSettings: 'UserSettings.displaysize = 20',
    sw_timer: 'sw_timer.pause()',
    Swal: 'Swal.fire({ title: "x" })',
    'a legacy DOM id': 'document.querySelector("#dvique").remove()',
    'a legacy DOM id (getElementById)': 'document.getElementById(name)',
    'a legacy DOM id (CSS)': '#tb_undo { display: none }'
  }
  for (const [name, line] of Object.entries(planted)) {
    it(`finds ${name} on a planted line`, () => {
      const found = findViolations(`const fine = 1\n${line}\n`, ids)
      assert.deepEqual(found.map((v) => v.line), [2])
      assert.equal(found[0].name, name.replace(/ \(.*\)$/, ''))
    })
  }

  it('passes the words that only look like Penpa+\'s names', () => {
    const text = 'const published = 1 // Swallow, UserSettingsX, input_pu\nel.className = "ui-title"\nconst h = document.createElement("header")'
    assert.deepEqual(findViolations(text, ids), [])
  })
})
