// The UI fuzz's rules (`live/ui-fuzz/rules.mjs`, #195) on hand-made snapshots: each rule fires on a bad page and holds on a
// good one, without a browser.
import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { RULES, ruleViolations } from '../live/ui-fuzz/rules.mjs'

const LIGHT = 'rgb(251, 250, 247)'
const DARK = 'rgb(34, 37, 44)'
const card = (name, x, y, width, height, extra = {}) => ({ name, shown: true, rect: { x, y, width, height }, heading: { text: name, lines: 1 }, background: LIGHT, ...extra })
const pin = (shortcut, label, current = false) => ({ shortcut, label, current })

// A snapshot of a quiet solve page at 1400x900, as `page-state.mjs` reads one: each field a test leaves alone holds.
function quietPage (overrides = {}) {
  return {
    window: { width: 1400, height: 900 },
    cards: [card('Board', 290, 72, 700, 816), card('Rules', 15, 72, 260, 61), card('Mouse', 15, 143, 260, 745), card('Pinned', 1005, 72, 380, 96)],
    boardLabel: { text: 'Sudoku > Normal', lines: 1 },
    toolName: 'Sudoku > Normal',
    boardScroll: { width: 698, clientWidth: 698, height: 786, clientHeight: 786 },
    pins: [pin('Z', 'Surface'), pin('X', 'Sudoku > Normal', true)],
    recent: [],
    tool: { mode: 'sudoku', submode: '1', style: 9 },
    shortcutsEnabled: true,
    theme: 'light',
    dialogs: [],
    canUndo: false,
    board: '[{"number":{}}]',
    storage: {},
    errors: [],
    ...overrides
  }
}

const rule = (name) => RULES.find((r) => r.name === name)
// `now` and `before` are overrides of a quiet page; `opened` is one too, or null. `history` is the kinds run so far.
const check = (name, now, { before = {}, action = null, opened = {}, history = [] } = {}) =>
  rule(name).check({ now: quietPage(now), before: quietPage(before), action, opened: opened && quietPage(opened), history })
const action = (kind, arg) => ({ kind, arg })

describe('the UI fuzz rules', () => {
  it('the rule names are unique', () => {
    const names = RULES.map((r) => r.name)
    assert.equal(new Set(names).size, names.length)
  })

  it('a quiet page breaks none, and a violation is reported with its rule name', () => {
    assert.deepEqual(ruleViolations({ now: quietPage(), before: quietPage(), action: null, opened: quietPage(), history: [] }), [])
    assert.deepEqual(ruleViolations({ now: quietPage({ toolName: 'Surface' }), before: quietPage(), action: null, opened: quietPage(), history: [] }),
      ['board-label-names-tool: the Board label reads "Sudoku > Normal" but the tool is Surface'])
  })

  describe('cards-do-not-overlap', () => {
    it('holds for cards that only touch', () => {
      assert.deepEqual(check('cards-do-not-overlap', { cards: [card('Board', 0, 0, 100, 100), card('Mode', 100, 0, 50, 100)] }), [])
    })
    it('fails for two cards that overlap', () => {
      assert.deepEqual(check('cards-do-not-overlap', { cards: [card('Board', 0, 0, 100, 100), card('Mode', 80, 50, 50, 100)] }),
        ['Board and Mode overlap by 20x50 px'])
    })
    it('leaves a closed card out', () => {
      assert.deepEqual(check('cards-do-not-overlap', { cards: [card('Board', 0, 0, 100, 100), card('Mouse', 50, 50, 100, 100, { shown: false })] }), [])
    })
    it('asks nothing of a layout the solver made by dragging or resizing a card, until Reset layout', () => {
      const cards = [card('Board', 0, 0, 100, 100), card('Mode', 80, 50, 50, 100)]
      for (const placing of ['card drag', 'card resize', 'interrupted drag']) {
        assert.deepEqual(check('cards-do-not-overlap', { cards }, { history: ['click', placing, 'reload'] }), [], placing)
      }
      assert.deepEqual(check('cards-do-not-overlap', { cards }, { history: ['card drag', 'reset layout', 'click'] }), ['Board and Mode overlap by 20x50 px'])
    })
  })

  describe('cards-inside-window', () => {
    it('holds for a card flush with the window\'s edges', () => {
      assert.deepEqual(check('cards-inside-window', { cards: [card('Board', 0, 0, 1400, 900)] }), [])
    })
    it('fails for a card past the window\'s right edge', () => {
      assert.deepEqual(check('cards-inside-window', { cards: [card('Pinned', 1005, 72, 420, 96)] }),
        ['Pinned (1005,72 420x96) is not inside the 1400x900 window'])
    })
    it('leaves a closed card out', () => {
      assert.deepEqual(check('cards-inside-window', { cards: [card('Mouse', -50, 0, 100, 100, { shown: false })] }), [])
    })
  })

  describe('board-fits-card', () => {
    it('holds when the board fills its card without scrolling', () => {
      assert.deepEqual(check('board-fits-card', {}), [])
    })
    it('fails when the Board card scrolls', () => {
      assert.deepEqual(check('board-fits-card', { boardScroll: { width: 698, clientWidth: 698, height: 820, clientHeight: 786 } }),
        ['the board at Fit scrolls its card: 698x820 px in 698x786 px'])
    })
  })

  describe('headings-on-one-line', () => {
    it('holds when the Board label and every heading take one line', () => {
      assert.deepEqual(check('headings-on-one-line', {}), [])
    })
    it('fails for a Board label on two lines', () => {
      assert.deepEqual(check('headings-on-one-line', { boardLabel: { text: 'Sudoku > Normal', lines: 2 } }),
        ['the Board label "Sudoku > Normal" takes 2 lines'])
    })
    it('fails for a card heading on two lines, and leaves a closed card out', () => {
      const cards = [card('Pinned', 0, 0, 10, 10, { heading: { text: 'Pinned', lines: 2 } }), card('Mouse', 0, 0, 10, 10, { shown: false, heading: { text: 'Mouse', lines: 0 } })]
      assert.deepEqual(check('headings-on-one-line', { cards }), ['the Pinned heading takes 2 lines'])
    })
  })

  describe('recent-lists-no-pin', () => {
    it('holds when Recent and the pins share no tool', () => {
      assert.deepEqual(check('recent-lists-no-pin', { recent: [pin(null, 'Line > Normal')] }), [])
    })
    it('fails when Recent lists a pinned tool', () => {
      assert.deepEqual(check('recent-lists-no-pin', { recent: [pin(null, 'Line > Normal'), pin(null, 'Surface')] }),
        ['Recent lists Surface, which is pinned'])
    })
  })

  describe('pin-keys-select-their-pin', () => {
    it('holds for keys Z X C V on the first four pins and none after', () => {
      const pins = [pin('Z', 'a'), pin('X', 'b'), pin('C', 'c'), pin('V', 'd'), pin(null, 'e')]
      assert.deepEqual(check('pin-keys-select-their-pin', { pins }), [])
    })
    it('fails for a pin labelled with the wrong key', () => {
      assert.deepEqual(check('pin-keys-select-their-pin', { pins: [pin('X', 'Surface'), pin('Z', 'Sudoku > Normal', true)] }),
        ['pin 1 (Surface) shows key X, not Z', 'pin 2 (Sudoku > Normal) shows key Z, not X'])
    })
    it('holds when pressing a pin\'s key makes that pin current', () => {
      assert.deepEqual(check('pin-keys-select-their-pin', { pins: [pin('Z', 'Surface', true), pin('X', 'Sudoku > Normal')] }, { action: action('pin key', 'z') }), [])
    })
    it('fails when pressing a pin\'s key leaves another pin current', () => {
      assert.deepEqual(check('pin-keys-select-their-pin', {}, { action: action('pin key', 'z') }),
        ['pressing Z left Sudoku > Normal current, not the pin it labels, Surface'])
    })
    it('asks nothing of a key no pin shows, a key pressed in Number mode, or one pressed with the shortcuts off', () => {
      assert.deepEqual(check('pin-keys-select-their-pin', {}, { action: action('pin key', 'c') }), [])
      assert.deepEqual(check('pin-keys-select-their-pin', {}, { action: action('pin key', 'z'), before: { tool: { mode: 'number', submode: '1', style: 1 } } }), [])
      assert.deepEqual(check('pin-keys-select-their-pin', {}, { action: action('pin key', 'z'), before: { shortcutsEnabled: false } }), [])
    })
  })

  describe('board-label-names-tool', () => {
    it('holds when the label names the engine\'s tool', () => {
      assert.deepEqual(check('board-label-names-tool', {}), [])
    })
    it('fails when the label names another tool', () => {
      assert.deepEqual(check('board-label-names-tool', { boardLabel: { text: 'Surface', lines: 1 } }),
        ['the Board label reads "Surface" but the tool is Sudoku > Normal'])
    })
  })

  describe('undo-to-start', () => {
    it('holds while there is something to undo, whatever the board holds', () => {
      assert.deepEqual(check('undo-to-start', { canUndo: true, board: '[{"number":{"5":1}}]' }), [])
    })
    it('holds when nothing is left to undo and the board is as it opened', () => {
      assert.deepEqual(check('undo-to-start', {}), [])
    })
    it('fails when nothing is left to undo and the board is not as it opened', () => {
      assert.deepEqual(check('undo-to-start', { board: '[{"number":{"5":1}}]' }),
        ['nothing is left to undo but the board is not as the page opened it'])
    })
    it('asks nothing after a reload, or of a page that opened with something to undo', () => {
      assert.deepEqual(check('undo-to-start', { board: '[{"number":{"5":1}}]' }, { opened: null }), [])
      assert.deepEqual(check('undo-to-start', { board: '[{"number":{"5":1}}]' }, { opened: { canUndo: true } }), [])
    })
  })

  describe('reload-keeps-layout-and-pins', () => {
    it('holds when a reload leaves the cards and pins as they were', () => {
      assert.deepEqual(check('reload-keeps-layout-and-pins', {}, { action: action('reload') }), [])
    })
    it('holds when a reload changes a card by under a pixel', () => {
      const cards = quietPage().cards.map((c) => c.name === 'Rules' ? card('Rules', 15, 72, 260, 60.890625) : c)
      assert.deepEqual(check('reload-keeps-layout-and-pins', { cards }, { action: action('reload') }), [])
    })
    it('fails when a reload moves a card', () => {
      const cards = quietPage().cards.map((c) => c.name === 'Pinned' ? card('Pinned', 1005, 300, 380, 96) : c)
      assert.deepEqual(check('reload-keeps-layout-and-pins', { cards }, { action: action('reload') }),
        ['the reload moved Pinned from 1005,72 380x96 to 1005,300 380x96'])
    })
    it('holds when a reload empties Recent and its card gets shorter, but fails when it moves', () => {
      const before = { cards: [card('Recent', 1005, 326, 380, 136)], recent: [pin(null, 'Line > Normal')] }
      assert.deepEqual(check('reload-keeps-layout-and-pins', { cards: [card('Recent', 1005, 326, 380, 98)] }, { action: action('reload'), before }), [])
      assert.deepEqual(check('reload-keeps-layout-and-pins', { cards: [card('Recent', 1005, 300, 380, 98)] }, { action: action('reload'), before }),
        ['the reload moved Recent from 1005,326 380x136 to 1005,300 380x98'])
    })
    it('fails when a reload drops a pin', () => {
      assert.deepEqual(check('reload-keeps-layout-and-pins', { pins: [pin('Z', 'Surface')] }, { action: action('reload') }),
        ['the reload changed the pins from Surface, Sudoku > Normal to Surface'])
    })
    it('asks nothing of a step that is not a reload', () => {
      assert.deepEqual(check('reload-keeps-layout-and-pins', { pins: [] }, { action: action('click') }), [])
    })
  })

  describe('theme-reaches-everything', () => {
    it('holds when every card and open dialog is drawn in the theme', () => {
      assert.deepEqual(check('theme-reaches-everything', { dialogs: [{ label: 'Settings', background: 'rgb(255, 255, 255)' }] }), [])
      const dark = quietPage().cards.map((c) => ({ ...c, background: DARK }))
      assert.deepEqual(check('theme-reaches-everything', { theme: 'dark', cards: dark, dialogs: [{ label: 'Settings', background: 'rgb(27, 29, 38)' }] }), [])
    })
    it('fails for a card left light in the dark theme', () => {
      const cards = quietPage().cards.map((c) => c.name === 'Pinned' ? c : { ...c, background: DARK })
      assert.deepEqual(check('theme-reaches-everything', { theme: 'dark', cards }), [`the Pinned card is ${LIGHT} in the dark theme`])
    })
    it('fails for an open dialog left dark in the light theme', () => {
      assert.deepEqual(check('theme-reaches-everything', { dialogs: [{ label: 'Settings', background: 'rgb(27, 29, 38)' }] }),
        ['the Settings dialog is rgb(27, 29, 38) in the light theme'])
    })
  })
})
