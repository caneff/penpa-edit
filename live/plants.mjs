// Planted bugs that measure the recordings (#32): each plant is a one-line change to a file of `docs/js/`, served in
// place of the real file while recordings replay, so the files on disk never hold a bug. A plant is caught when a
// replay of some recording fails on it. Not a check itself, so `live/**/*.live.mjs` skips it.
//
// Each plant has an `id`, the `bug` in words, its `file` under `docs/js/`, and a `find` and `replace` of one line's
// text. `handler`, when given, names the method of `class_p.js` the change is in, and `find` is searched for in that
// method alone. `audit` names the finding of `research/fork-audit-2026-11.md` whose fix the plant undoes.
import { readFile } from 'node:fs/promises'
import { readExpected, readRecording, replay } from './replay.mjs'

const JS = new URL('../docs/js/', import.meta.url)

// The ids of the recordings made for an audit finding start with this, as `audit-c1-or-empty-category` does.
const auditPrefix = (audit) => `audit-${audit.toLowerCase()}-`

export const PLANTS = [
  // One per handler a solve mode can reach.
  {
    id: 'surface-right-click-paints-left',
    bug: 'a right click in Surface paints the left button\'s colour',
    file: 'class_p.js',
    handler: 'mouse_surface',
    find: 'this.re_surfaceR(num);',
    replace: 'this.re_surface_twobutton(num);'
  },
  {
    id: 'line-drag-draws-nothing',
    bug: 'a drag in Line draws no segment',
    file: 'class_p.js',
    handler: 'mouse_line',
    find: 'this.re_linemove(num);',
    replace: ''
  },
  {
    id: 'line-free-release-draws-nothing',
    bug: 'releasing a Line Free drag draws no line',
    file: 'class_p.js',
    handler: 'mouse_linefree',
    find: 'this.re_lineup_free(num);',
    replace: ''
  },
  {
    id: 'line-helper-on-right-click',
    bug: 'Line Helper (x) marks on a right click instead of a left one',
    file: 'class_p.js',
    handler: 'mouse_lineX',
    find: 'if (this.mouse_mode === "down_left") {',
    replace: 'if (this.mouse_mode === "down_right") {'
  },
  {
    id: 'edge-drag-draws-nothing',
    bug: 'a drag in Edge draws no segment',
    file: 'class_p.js',
    handler: 'mouse_lineE',
    find: 'this.re_linemoveE(num);',
    replace: ''
  },
  {
    id: 'edge-free-release-draws-nothing',
    bug: 'releasing an Edge Free drag draws no line',
    file: 'class_p.js',
    handler: 'mouse_lineEfree',
    find: 'this.re_lineEup_free(num);',
    replace: ''
  },
  {
    id: 'edge-helper-on-right-click',
    bug: 'Edge Helper (x) marks on a right click instead of a left one',
    file: 'class_p.js',
    handler: 'mouse_lineEX',
    find: 'if (this.mouse_mode === "down_left") {',
    replace: 'if (this.mouse_mode === "down_right") {'
  },
  {
    id: 'wall-drag-draws-nothing',
    bug: 'a drag in Wall draws no wall',
    file: 'class_p.js',
    handler: 'mouse_wall',
    find: 'this.re_wallmove(num);',
    replace: ''
  },
  {
    id: 'number-cursor-off-by-one',
    bug: 'a left click in Number puts the cursor on the next point',
    file: 'class_p.js',
    handler: 'mouse_number',
    find: 'this.lasty = y;\n            this.cursol = num;',
    replace: 'this.lasty = y;\n            this.cursol = num + 1;'
  },
  {
    id: 'number-corner-cursor-off-by-one',
    bug: 'a left click in Number 1/4 or Side puts the cursor on the next corner or side',
    file: 'class_p.js',
    handler: 'mouse_numberS',
    find: 'this.cursolS = num;\n\n',
    replace: 'this.cursolS = num + 1;\n\n'
  },
  {
    id: 'sudoku-click-keeps-selection',
    bug: 'a click without Ctrl in Sudoku adds to the selection instead of replacing it',
    file: 'class_p.js',
    handler: 'mouse_sudoku',
    find: 'if (!ctrl_key) {\n                this.selection = [];',
    replace: 'if (ctrl_key) {\n                this.selection = [];'
  },
  {
    id: 'shape-cursor-off-by-one',
    bug: 'a left click in Shape puts the cursor on the next point',
    file: 'class_p.js',
    handler: 'mouse_symbol',
    find: 'if (this.mouse_mode === "down_left") {\n            this.cursol = num;',
    replace: 'if (this.mouse_mode === "down_left") {\n            this.cursol = num + 1;'
  },
  {
    id: 'cage-click-adds-no-cell',
    bug: 'a click in Cage Killer adds no cell to the cage',
    file: 'class_p.js',
    handler: 'mouse_cage',
    find: 'if (num_index === -1) {\n                    this.cageselection.push(num);',
    replace: 'if (num_index !== -1) {\n                    this.cageselection.push(num);'
  },
  {
    id: 'special-drag-extends-nothing',
    bug: 'a drag in Special does not extend the shape past its first cell',
    file: 'class_p.js',
    handler: 'mouse_special',
    find: 'this.re_special(num, this.mode[this.mode.qa][this.mode[this.mode.qa].edit_mode][0]);',
    replace: ''
  },
  {
    id: 'move-drag-moves-nothing',
    bug: 'a drag in Move moves nothing',
    file: 'class_p.js',
    handler: 'mouse_move',
    find: 'this.re_movemove(num);',
    replace: ''
  },
  {
    id: 'composite-black-dot-as-black-white',
    bug: 'the Composite Black/dot tool acts as Black/white',
    file: 'class_p.js',
    handler: 'mouse_combi',
    find: 'case "blpo":\n                    this.re_combi_blpo(num);',
    replace: 'case "blpo":\n                    this.re_combi_blwh(num);'
  },
  {
    id: 'multicolor-digit-keeps-colour',
    bug: 'a digit in Multicolor does not switch the colour it picks',
    file: 'class_p.js',
    handler: 'key_number',
    find: 'this.mode[this.mode.qa].multicolor[1] = key;',
    replace: ''
  },
  {
    id: 'number-nine-takes-no-second-digit',
    bug: 'a digit typed after a 9 in Number replaces it instead of making a two-digit number',
    file: 'class_p.js',
    handler: 'key_number',
    find: 'if (con >= 1 && con <= 9 && this[this.mode.qa].number[k][2] != "7") {',
    replace: 'if (con >= 1 && con <= 8 && this[this.mode.qa].number[k][2] != "7") {'
  },
  {
    id: 'multicolor-delete-keeps-colour',
    bug: 'Delete in Multicolor leaves the selection\'s colour',
    file: 'class_p.js',
    handler: 'key_space',
    find: 'this.remove_value("surface", k);',
    replace: ''
  },
  {
    id: 'ctrl-space-keeps-number',
    bug: 'Ctrl+Space in Number or Shape leaves the cell\'s number',
    file: 'class_p.js',
    handler: 'key_shiftspace',
    find: 'delete this[this.mode.qa].number[this.cursol];',
    replace: ''
  },
  {
    id: 'backspace-corner-drops-two',
    bug: 'Backspace in Number 1/4 or Side deletes two characters',
    file: 'class_p.js',
    handler: 'key_backspace',
    find: 'number = this[this.mode.qa].numberS[k][0].slice(0, -1);',
    replace: 'number = this[this.mode.qa].numberS[k][0].slice(0, -2);'
  },
  // The audit's engine bugs, each its fix undone in one line.
  {
    id: 'or-answer-empty-category-solves',
    bug: 'an empty OR answer category counts as solved',
    file: 'class_p.js',
    audit: 'C1',
    find: 'if (author_sol && this.solution[i].length > 0) {',
    replace: 'if (author_sol) {'
  },
  {
    id: 'tracking-parameter-hides-link',
    bug: 'a tracking parameter in the query hides the puzzle in the hash',
    file: 'general.js',
    audit: 'C4',
    find: 'if (!/(^|&)p=/.test(urlParam)) {',
    replace: 'if (!urlParam && location.hash) {'
  },
  {
    id: 'alphabet-box-check-throws-on-digit',
    bug: 'the box check of an alphabet sudoku throws on a digit',
    file: 'conflicts.js',
    audit: 'C7',
    find: 'if (String(el2).toLowerCase() === String(el).toLowerCase())',
    replace: 'if (el2.toLowerCase() === el.toLowerCase())'
  },
  {
    id: 'consecutive-every-symbol-a-bar',
    bug: 'the consecutive checker treats every edge symbol as a bar',
    file: 'conflicts.js',
    audit: 'C13',
    find: 'if (!Array.isArray(symbol) || (symbol[1] !== "bars_G" && symbol[1] !== "circle_SS")) {',
    replace: 'if (!Array.isArray(symbol) && (symbol[1] !== "bars_G" || symbol[1] !== "circle_SS")) {'
  },
  {
    id: 'sudoku-conflicts-only-on-9x9',
    bug: 'the sudoku conflict checker runs only on 9x9',
    file: 'conflicts.js',
    audit: 'C14',
    find: 'if (!box || data[0].length !== n) {',
    replace: 'if (n !== 9 || data[0].length !== n) {'
  }
]

// The text of `source` that `plant.find` is searched for in: the whole file, or the method `plant.handler`, from its
// first line to the closing brace at its indent.
function scopeOf (source, plant) {
  if (!plant.handler) return { start: 0, end: source.length }
  const start = source.search(new RegExp(`^ {4}${plant.handler}\\(`, 'm'))
  if (start === -1) throw new Error(`${plant.id}: no method ${plant.handler} in ${plant.file}`)
  const close = source.slice(start).search(/^ {4}\}\r?$/m)
  if (close === -1) throw new Error(`${plant.id}: ${plant.handler} has no closing brace`)
  return { start, end: start + close }
}

// `source`, the text of `plant.file`, with the plant's change made. Throws unless `find` occurs exactly once in its
// scope, so a plant whose line upstream changed is refused rather than run as a plant that changes nothing.
export function plantIn (source, plant) {
  const { start, end } = scopeOf(source, plant)
  const scope = source.slice(start, end)
  // `find` and `replace` are written with `\n`; `class_p.js` and `general.js` end their lines with `\r\n`.
  const eol = source.includes('\r\n') ? '\r\n' : '\n'
  const [find, replace] = [plant.find, plant.replace].map((text) => text.replaceAll('\n', eol))
  const at = scope.indexOf(find)
  if (at === -1) throw new Error(`${plant.id}: its line is not in ${plant.handler ?? plant.file}`)
  if (scope.indexOf(find, at + 1) !== -1) throw new Error(`${plant.id}: its line is in ${plant.handler ?? plant.file} more than once`)
  return source.slice(0, start + at) + replace + source.slice(start + at + find.length)
}

// The `setup` that serves `plant.file` with the plant in it, for `replay` with `served: true`.
export async function plantSetup (plant) {
  const body = plantIn(await readFile(new URL(plant.file, JS), 'utf8'), plant)
  const url = new RegExp(`/js/${plant.file.replace(/\./g, '\\.')}(\\?|$)`)
  return (context) => context.route(url, (route) => route.fulfill({ contentType: 'text/javascript', body }))
}

// The recordings of `ids` made for the audit finding `plant` undoes the fix of; none for a plant of no finding.
export function auditRecordings (plant, ids) {
  return plant.audit ? ids.filter((id) => id.split('/').pop().startsWith(auditPrefix(plant.audit))) : []
}

// `ids` in the order a hunt replays them: an audit plant's own recordings first.
function huntOrder (plant, ids) {
  const own = auditRecordings(plant, ids)
  return [...own, ...ids.filter((id) => !own.includes(id))]
}

// Replays the recordings `ids` with `plant` in, in `huntOrder`, until one fails against its expected file, in `lanes`
// replays at once. Returns `caught`, the id of the recording that failed (null when none did), `why`, the first line of its report, the page
// error it raised or the error its replay threw, and `replayed`, how many replays ran.
export async function hunt (browser, plant, ids, { lanes = 1 } = {}) {
  const setup = await plantSetup(plant)
  const queue = huntOrder(plant, ids)
  let next = 0
  let replayed = 0
  let caught = null
  let why = null
  const lane = async () => {
    while (!caught && next < queue.length) {
      const id = queue[next++]
      replayed++
      let failure
      const errors = []
      // Read outside the `try`: a recording with no expected file is an error of the hunt, not a catch.
      const [recording, expected] = await Promise.all([readRecording(id), readExpected(id)])
      try {
        const { report } = await replay(browser, recording, {
          id,
          expected,
          served: true,
          setup: async (context) => {
            context.on('page', (page) => {
              page.on('pageerror', (e) => errors.push(String(e)))
              page.on('console', (m) => { if (m.type() === 'error') errors.push(`console.error: ${m.text()}`) })
            })
            await setup(context)
          }
        })
        failure = report ?? errors[0]
      } catch (e) {
        failure = e.message
      }
      if (failure && !caught) {
        caught = id
        why = failure.split('\n')[0]
      }
    }
  }
  await Promise.all(Array.from({ length: lanes }, lane))
  return { caught, why, replayed }
}
