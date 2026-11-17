// Planted bugs that measure the recordings (#32): each plant is a one-line change to a file of `docs/js/`, served in
// place of the real file while recordings replay, so the files on disk never hold a bug. A plant is caught when a
// replay of some recording fails on it. Not a check itself, so `live/**/*.live.mjs` skips it.
//
// Each plant has an `id`, the `bug` in words, its `file` under `docs/js/`, and a `find` and `replace` of one line's
// text. `handler`, when given, names the method of `class_p.js` the change is in, and `find` is searched for in that
// method alone. `audit` names the finding of `research/fork-audit-2026-11.md` whose fix the plant undoes.
//
// `UI_PLANTS` are the same for the solve UI, a `file` under `docs/ui/`, caught by the UI fuzz
// rather than by a recording, so `npm run measure` does not hunt them.
import { readFile } from 'node:fs/promises'
import { Script } from 'node:vm'
import { jsRequest } from './page.mjs'
import { methodStart, readExpected, readRecording, replay } from './replay.mjs'

const DOCS = new URL('../docs/', import.meta.url)

// The ids of the recordings made for an audit finding start with this, as `audit-c1-or-empty-category` does.
const auditPrefix = (audit) => `audit-${audit.toLowerCase()}-`

export const PLANTS = [
  // One per handler a solve mode can reach, and a second in `key_number`, whose modes take digits in different ways.
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
    bug: 'a left click in Number Arrow puts the cursor on the next point',
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
    id: 'multicolor-digit-paints-nothing',
    bug: 'a digit in Multicolor adds its colour to no cell',
    file: 'class_p.js',
    handler: 'key_number',
    find: 'if (!remove)',
    replace: 'if (remove)'
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
    find: 'if (this[this.mode.qa].surface[k])',
    replace: 'if (false)'
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

// Solve-UI bugs, each with the UI fuzz's hunt for it: the `focus` it draws more of, the error that names the rule it breaks
// (`caughtBy`) and the step its shrunk list ends on (`last`).
export const UI_PLANTS = [
  {
    id: 'pin-keys-x-and-c-swapped',
    bug: 'pin keys X and C select each other\'s pin, each chip still showing its own key',
    file: 'pins.js',
    find: 'const SHORTCUT_SLOT_BY_CODE = { KeyZ: 0, KeyX: 1, KeyC: 2, KeyV: 3 };',
    replace: 'const SHORTCUT_SLOT_BY_CODE = { KeyZ: 0, KeyX: 2, KeyC: 1, KeyV: 3 };',
    focus: ['pinned'],
    caughtBy: /^rules? broken after step \d+ \(.*\): pin-keys-select-their-pin: pressing [XC] left /,
    last: /^press pin key [XC]/
  }
]

// The text of `source` that `plant.find` is searched for in: the whole file, or the method `plant.handler`, from its
// first line to the closing brace at its indent.
function scopeOf (source, plant) {
  if (!plant.handler) return { start: 0, end: source.length }
  const start = source.search(methodStart(plant.handler))
  if (start === -1) throw new Error(`${plant.id}: no method ${plant.handler} in ${plant.file}`)
  const close = source.slice(start).search(/^ {4}\}\r?$/m)
  if (close === -1) throw new Error(`${plant.id}: ${plant.handler} has no closing brace`)
  return { start, end: start + close }
}

// `source`, the text of `plant.file`, with the plant's change made. Throws unless `find` occurs exactly once in its
// scope, so a plant whose line upstream changed is refused rather than run as a plant that changes nothing, and unless
// the planted file still parses, since a file that does not parse fails every replay whatever the plant meant.
export function plantIn (source, plant) {
  const { start, end } = scopeOf(source, plant)
  const scope = source.slice(start, end)
  // `find` and `replace` are written with `\n`; `class_p.js` and `general.js` end their lines with `\r\n`.
  const eol = source.includes('\r\n') ? '\r\n' : '\n'
  const [find, replace] = [plant.find, plant.replace].map((text) => text.replaceAll('\n', eol))
  const at = scope.indexOf(find)
  if (at === -1) throw new Error(`${plant.id}: its line is not in ${plant.handler ?? plant.file}`)
  if (scope.indexOf(find, at + 1) !== -1) throw new Error(`${plant.id}: its line is in ${plant.handler ?? plant.file} more than once`)
  const planted = source.slice(0, start + at) + replace + source.slice(start + at + find.length)
  try {
    new Script(planted, { filename: plant.file })
  } catch (e) {
    throw new Error(`${plant.id}: ${plant.file} does not parse with it in: ${e.message}`)
  }
  return planted
}

// The `setup` that serves `docs/<dir>/<plant.file>` with the plant in it, for a page opened with `served: true`;
// `request` matches the page's requests for that file.
async function plantSetup (plant, dir = 'js', request = jsRequest(plant.file)) {
  const body = plantIn(await readFile(new URL(`${dir}/${plant.file}`, DOCS), 'utf8'), plant)
  return (context) => context.route(request, (route) => route.fulfill({ contentType: 'text/javascript', body }))
}

// `plantSetup` for one of `UI_PLANTS`: served from `docs/ui/`, so a page opened with it needs its files served.
export const uiPlantSetup = (plant) => plantSetup(plant, 'ui', new RegExp(`/ui/${plant.file.replace(/\./g, '\\.')}(\\?|$)`))

// The recordings of `ids` made for the audit finding `plant` undoes the fix of; none for a plant of no finding.
export function auditRecordings (plant, ids) {
  return plant.audit ? ids.filter((id) => id.split('/').pop().startsWith(auditPrefix(plant.audit))) : []
}

// `ids` in the order a hunt replays them: an audit plant's own recordings first.
function huntOrder (plant, ids) {
  const own = auditRecordings(plant, ids)
  return [...own, ...ids.filter((id) => !own.includes(id))]
}

// Runs `work(item)` for each of `items` in order, `lanes` at once, starting no more once `stop()` is true.
export async function inLanes (items, lanes, work, stop = () => false) {
  let next = 0
  const lane = async () => {
    while (!stop() && next < items.length) await work(items[next++])
  }
  await Promise.all(Array.from({ length: lanes }, lane))
}

// The first line of the error `replay` throws for a step the page threw at, which a plant can cause; any other throw
// (a page that never loaded, a closed browser) is the harness's.
const STEP_THREW = /^.*: step \d+ \(.*\) could not be replayed: /

// Replays the recordings `ids` with `plant` in, in `huntOrder`, `lanes` at once, until one is caught: its replay
// differs from its expected file, fails its round trip or its final board, throws at a step, or raises a page error.
// Returns `caught`, that recording's id (null when none was caught), `why`, the first line of its report, page error
// or throw, `error`, the first line of a harness error that stopped the hunt (null when none did), and `replayed`, how
// many replays ran. A recording with no expected file rejects the hunt, never counts as a catch. `read` swaps the two file
// reads, so a test can make one settle before the other.
export async function hunt (browser, plant, ids, { lanes = 1, read = { recording: readRecording, expected: readExpected } } = {}) {
  const setup = await plantSetup(plant)
  let replayed = 0
  let caught = null
  let why = null
  let error = null
  await inLanes(huntOrder(plant, ids), lanes, async (id) => {
    replayed++
    // In order, not Promise.all: for an id with neither file both reads reject, and the first to settle would be thrown.
    const recording = await read.recording(id)
    const expected = await read.expected(id)
    let failure
    try {
      const { report, errors } = await replay(browser, recording, { id, expected, served: true, setup })
      failure = report ?? errors[0]
    } catch (e) {
      if (!STEP_THREW.test(e.message.split('\n')[0])) {
        error ??= `${id}: ${e.message.split('\n')[0]}`
        return
      }
      failure = e.message
    }
    if (failure && !caught) {
      caught = id
      why = failure.split('\n')[0]
    }
  }, () => caught || error)
  return { caught, why, error, replayed }
}
