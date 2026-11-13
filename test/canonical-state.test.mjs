// Canonical state (`live/canonical-state.mjs`) written from hand-built engine states: its ordering and its scrubbers.
import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { canonicalState } from '../live/canonical-state.mjs'

// A hand-built engine state as `readEngineState` returns it, with `pu_a` and `pu_a_col` given by the caller.
function engineState ({ pu_a = {}, pu_a_col = {} } = {}) {
  const board = (props) => ({ command_undo: [], command_redo: [], command_replay: [], ...props })
  return {
    pu_a: board(pu_a),
    pu_a_col: board(pu_a_col),
    mode: { qa: 'pu_a', edit_mode: 'number', submode: '1', style: 2 },
    selection: [],
    conflict_cells: [],
    sol_flag: 0
  }
}

describe('canonicalState', () => {
  it('writes one entry per line, keys sorted, whatever order they were added in', () => {
    const forward = engineState({ pu_a: { line: { '12,13': 3, '5,6': 3 }, number: { 5: [3, 2, '1'] } } })
    const backward = engineState({ pu_a: { number: { 5: [3, 2, '1'] }, line: { '5,6': 3, '12,13': 3 } } })
    assert.equal(canonicalState(backward), canonicalState(forward))
    assert.deepEqual(canonicalState(forward).split('\n').filter((l) => /^pu_a\.(line|number)\./.test(l)), [
      'pu_a.line.12,13 = 3',
      'pu_a.line.5,6 = 3',
      'pu_a.number.5 = [3,2,"1"]'
    ])
  })

  it('writes the undo and redo stacks as their depth', () => {
    const state = engineState({
      pu_a: { command_undo: [['surface', 12, 1, 'pu_a', 1], ['surface', 13, 1, 'pu_a', 2]], command_redo: [['surface', 14, 1, 'pu_a', 3]] }
    })
    assert.deepEqual(canonicalState(state).split('\n').filter((l) => l.startsWith('pu_a.command_')), [
      'pu_a.command_redo.length = 1',
      'pu_a.command_undo.length = 2'
    ])
  })

  it('scrubs the replay timestamps, keeping the rest of each replay entry', () => {
    const at = (ms) => engineState({ pu_a: { command_replay: [['surface', 12, null, 'pu_a', 1, ms]] } })
    assert.equal(canonicalState(at(4300)), canonicalState(at(91200)))
    assert.match(canonicalState(at(4300)), /^pu_a\.command_replay\.0 = \["surface",12,null,"pu_a",1,"\[timestamp\]"\]$/m)
  })

  it('keeps an array\'s entries in index order', () => {
    const thermo = Array.from({ length: 11 }, (_, i) => [i])
    const lines = canonicalState(engineState({ pu_a: { thermo } })).split('\n').filter((l) => l.startsWith('pu_a.thermo.'))
    assert.deepEqual(lines.map((l) => l.split(' = ')[0]), thermo.map((_, i) => `pu_a.thermo.${i}`))
  })

  it('writes the mode, sub-mode, style, selection, conflicts and answer-check verdict', () => {
    const state = { ...engineState(), selection: [40, 41], conflict_cells: [12, 30], sol_flag: 1 }
    assert.deepEqual(canonicalState(state).split('\n').filter((l) => !l.startsWith('pu_a')), [
      'mode.qa = "pu_a"',
      'mode.edit_mode = "number"',
      'mode.submode = "1"',
      'mode.style = 2',
      'selection = [40,41]',
      'conflict_cells = [12,30]',
      'sol_flag = 1',
      ''
    ])
  })
})
