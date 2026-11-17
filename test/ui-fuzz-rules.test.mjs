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
    presetUndo: false,
    tool: { mode: 'sudoku', submode: '1', style: 9 },
    shortcutsEnabled: true,
    theme: 'light',
    dialogs: [],
    canUndo: false,
    board: '[{"number":{}}]',
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
    describe('on a layout the solver made by dragging or resizing a card, until Reset layout', () => {
      const apart = [card('Board', 0, 0, 100, 100), card('Mode', 100, 50, 50, 100)]
      const over = [card('Board', 0, 0, 100, 100), card('Mode', 80, 50, 50, 100)]
      it('holds when the solver places a card over another', () => {
        for (const placing of ['card drag', 'card resize', 'interrupted drag']) {
          assert.deepEqual(check('cards-do-not-overlap', { cards: over }, { before: { cards: apart }, action: action(placing), history: ['click', placing] }), [], placing)
        }
      })
      it('holds while an overlap the solver made stays', () => {
        for (const placing of ['card drag', 'card resize', 'interrupted drag']) {
          assert.deepEqual(check('cards-do-not-overlap', { cards: over }, { before: { cards: over }, action: action('resize', 0), history: ['click', placing, 'resize'] }), [], placing)
        }
      })
      it('fails for a pair a later step makes overlap, such as a smaller window', () => {
        const cards = [...apart, card('Pinned', 200, 0, 100, 100)]
        const squeezed = [over[0], over[1], card('Pinned', 200, 0, 100, 100)]
        assert.deepEqual(check('cards-do-not-overlap', { cards: squeezed }, { before: { cards }, action: action('resize', 0), history: ['card drag', 'resize'] }),
          ['Board and Mode overlap by 20x50 px, after a step that placed no card'])
      })
      it('fails for a pair that newly overlaps when checked after the last step', () => {
        assert.deepEqual(check('cards-do-not-overlap', { cards: over }, { before: { cards: apart }, action: null, history: ['card resize', 'click'] }),
          ['Board and Mode overlap by 20x50 px, after a step that placed no card'])
      })
      it('asks for the page\'s own layout again after Reset layout', () => {
        assert.deepEqual(check('cards-do-not-overlap', { cards: over }, { before: { cards: over }, action: action('click', 0), history: ['card drag', 'reset layout', 'click'] }),
          ['Board and Mode overlap by 20x50 px'])
      })
    })
  })

  describe('cards-inside-window', () => {
    it('holds for a card flush with the window\'s edges', () => {
      assert.deepEqual(check('cards-inside-window', { cards: [card('Board', 0, 0, 1400, 900)] }), [])
    })
    it('fails for a card past any of the window\'s edges', () => {
      for (const [x, y, width, height] of [[1005, 72, 420, 96], [-5, 72, 260, 96], [15, -5, 260, 96], [15, 820, 260, 96]]) {
        assert.deepEqual(check('cards-inside-window', { cards: [card('Pinned', x, y, width, height)] }),
          [`Pinned (${x},${y} ${width}x${height}) is not inside the 1400x900 window`])
      }
    })
    it('holds for a card over an edge by no more than rounding', () => {
      assert.deepEqual(check('cards-inside-window', { cards: [card('Pinned', -0.5, -0.5, 1400.5, 900.5)] }), [])
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
    describe('when Pinned showed a preset\'s undo line, which a reload drops', () => {
      const column = (pinnedHeight, modeY) => [card('Pinned', 1006, 72, 380, pinnedHeight), card('Mode', 1006, modeY, 380, 98)]
      it('holds when Pinned gets shorter and the cards under it move up by as much', () => {
        assert.deepEqual(check('reload-keeps-layout-and-pins', { cards: column(96.1875, 178) }, { action: action('reload'), before: { presetUndo: true, cards: column(124.375, 206) } }), [])
      })
      it('fails when a card under Pinned moves by another amount', () => {
        assert.deepEqual(check('reload-keeps-layout-and-pins', { cards: column(96.1875, 190) }, { action: action('reload'), before: { presetUndo: true, cards: column(124.375, 206) } }),
          ['the reload moved Mode from 1006,206 380x98 to 1006,190 380x98'])
      })
      it('fails when Pinned changes height with no undo line shown', () => {
        assert.deepEqual(check('reload-keeps-layout-and-pins', { cards: column(96.1875, 178) }, { action: action('reload'), before: { cards: column(124.375, 206) } }),
          ['the reload moved Pinned from 1006,72 380x124.375 to 1006,72 380x96.1875', 'the reload moved Mode from 1006,206 380x98 to 1006,178 380x98'])
      })
    })
    describe('when the reload changes the tool (#263), which sets the Mode card\'s height (#252)', () => {
      const LINE = { mode: 'lineE', submode: '3', style: 3 }
      const SURFACE = { mode: 'surface', submode: null, style: 1 }
      const column = (modeHeight, recentY) => [card('Pinned', 969, 72, 380, 120), card('Mode', 969, 202, 380, modeHeight), card('Recent', 969, recentY, 380, 98)]
      const before = { tool: LINE, cards: column(137.71875, 350) }
      it('holds when Mode changes height and the cards under it move by as much', () => {
        assert.deepEqual(check('reload-keeps-layout-and-pins', { tool: SURFACE, cards: column(168.71875, 381) }, { action: action('reload'), before }), [])
      })
      it('fails when a card under Mode moves by another amount', () => {
        assert.deepEqual(check('reload-keeps-layout-and-pins', { tool: SURFACE, cards: column(168.71875, 400) }, { action: action('reload'), before }),
          ['the reload moved Recent from 969,350 380x98 to 969,400 380x98'])
      })
      it('fails when Mode changes height and the tool did not change', () => {
        assert.deepEqual(check('reload-keeps-layout-and-pins', { tool: LINE, cards: column(168.71875, 381) }, { action: action('reload'), before }),
          ['the reload moved Mode from 969,202 380x137.71875 to 969,202 380x168.71875', 'the reload moved Recent from 969,350 380x98 to 969,381 380x98'])
      })
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
    it('holds when every card and dialog is drawn in the theme', () => {
      assert.deepEqual(check('theme-reaches-everything', { dialogs: [{ label: 'Settings', background: 'rgb(255, 255, 255)' }] }), [])
      const dark = quietPage().cards.map((c) => ({ ...c, background: DARK }))
      assert.deepEqual(check('theme-reaches-everything', { theme: 'dark', cards: dark, dialogs: [{ label: 'Settings', background: 'rgb(27, 29, 38)' }] }), [])
    })
    it('fails for a card left light in the dark theme', () => {
      const cards = quietPage().cards.map((c) => c.name === 'Pinned' ? c : { ...c, background: DARK })
      assert.deepEqual(check('theme-reaches-everything', { theme: 'dark', cards }), [`the Pinned card is ${LIGHT} in the dark theme`])
    })
    it('fails for a dialog left dark in the light theme', () => {
      assert.deepEqual(check('theme-reaches-everything', { dialogs: [{ label: 'Settings', background: 'rgb(27, 29, 38)' }] }),
        ['the Settings dialog is rgb(27, 29, 38) in the light theme'])
    })
    it('reads oklch(), oklab() and color(srgb) backgrounds by their lightness', () => {
      const dialogs = (background) => ({ dialogs: [{ label: 'Settings', background }] })
      for (const light of ['oklch(0.97 0.01 90)', 'oklab(0.97 0 0)', 'color(srgb 0.98 0.98 0.97)', 'rgba(251, 250, 247, 0.9)']) {
        assert.deepEqual(check('theme-reaches-everything', dialogs(light)), [], light)
        assert.deepEqual(check('theme-reaches-everything', { theme: 'dark', cards: [], ...dialogs(light) }), [`the Settings dialog is ${light} in the dark theme`], light)
      }
      for (const dark of ['oklch(0.25 0.02 260)', 'oklab(25% 0 0)', 'color(srgb 0.13 0.15 0.17)']) {
        assert.deepEqual(check('theme-reaches-everything', dialogs(dark)), [`the Settings dialog is ${dark} in the light theme`], dark)
      }
    })
    it('fails for a transparent background, or one it cannot read, in either theme', () => {
      for (const theme of ['light', 'dark']) {
        for (const colour of ['rgba(0, 0, 0, 0)', 'oklch(0.97 0.01 90 / 0)', 'lab(97 0 0)']) {
          assert.deepEqual(check('theme-reaches-everything', { theme, cards: [], dialogs: [{ label: 'Settings', background: colour }] }),
            [`the Settings dialog is ${colour}, which reads as neither light nor dark, in the ${theme} theme`], colour)
        }
      }
    })
  })
})
