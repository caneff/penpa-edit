// The expected-file gate (#33, `.github/scripts/expected-gate.mjs`) on hand-built inputs: which changed expected files a
// PR's tickets listed in advance, and the plain-words diff its PR comment carries. The GitHub and git calls that feed
// it are proven by the PR runs of `.github/workflows/ci.yml`.
import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { DIFF_LINES, commentBody, gateVerdict, listedIds } from '../.github/scripts/expected-gate.mjs'
import { expectedDiff } from '../live/expected-diff.mjs'

const LISTING = (...lines) => `Fix the thing.\n\n## Expected changes\n\n${lines.join('\n')}\n\n## Acceptance\n\n- \`genre/not-a-listing\`: no\n`

describe('listedIds', () => {
  it('reads the first backticked id of each bullet under "## Expected changes", and nothing outside it', () => {
    const body = LISTING('- `genre/box`: the cage loses its sum', '- `paint/surface-drag` keeps its shading')
    assert.deepEqual([...listedIds(body)].sort(), ['genre/box', 'paint/surface-drag'])
  })

  it('reads nothing from a body with no such section', () => {
    assert.deepEqual([...listedIds('- `genre/box`: changed\n')], [])
  })
})

const T0 = '2026-11-10T00:00:00Z'
const T1 = '2026-11-11T00:00:00Z'
const T2 = '2026-11-12T00:00:00Z'

describe('gateVerdict', () => {
  const ticket = (number, ...versions) => ({ number, versions: versions.map(([at, body]) => ({ at, body })) })

  it('approves a changed expected file its ticket listed before the fix started', () => {
    const verdict = gateVerdict({
      changes: [{ id: 'genre/box', status: 'modified' }],
      fixStartedAt: T1,
      tickets: [ticket(40, [T0, LISTING('- `genre/box`: x')])]
    })
    assert.deepEqual(verdict, { approved: [{ id: 'genre/box', ticket: 40 }], added: [], unlisted: [] })
  })

  it('fails a changed expected file no ticket lists', () => {
    const verdict = gateVerdict({
      changes: [{ id: 'genre/box', status: 'modified' }],
      fixStartedAt: T1,
      tickets: [ticket(40, [T0, LISTING('- `genre/nanro`: x')])]
    })
    assert.deepEqual(verdict.unlisted, [{ id: 'genre/box', reason: 'no ticket this PR closes lists it' }])
    assert.deepEqual(verdict.approved, [])
  })

  it('fails a change whose id was added to the ticket only after the fix started', () => {
    const verdict = gateVerdict({
      changes: [{ id: 'genre/box', status: 'modified' }],
      fixStartedAt: T1,
      tickets: [ticket(40, [T0, LISTING('- `genre/nanro`: x')], [T2, LISTING('- `genre/nanro`: x', '- `genre/box`: y')])]
    })
    assert.deepEqual(verdict.unlisted, [{ id: 'genre/box', reason: `#40 listed it at ${T2}, after the fix started at ${T1}` }])
  })

  it('fails a change whose id the ticket listed in advance but no longer lists', () => {
    const verdict = gateVerdict({
      changes: [{ id: 'genre/box', status: 'modified' }],
      fixStartedAt: T1,
      tickets: [ticket(40, [T0, LISTING('- `genre/box`: x')], [T2, LISTING('- `genre/nanro`: x')])]
    })
    assert.deepEqual(verdict.unlisted, [{ id: 'genre/box', reason: 'no ticket this PR closes lists it' }])
  })

  it('counts a deleted expected file as a change to list', () => {
    const verdict = gateVerdict({ changes: [{ id: 'genre/box', status: 'deleted' }], fixStartedAt: T1, tickets: [] })
    assert.deepEqual(verdict.unlisted, [{ id: 'genre/box', reason: 'no ticket this PR closes lists it' }])
  })

  it('passes a new expected file unlisted, as an added one, not a re-approval', () => {
    const verdict = gateVerdict({ changes: [{ id: 'genre/new-one', status: 'added' }], fixStartedAt: T1, tickets: [] })
    assert.deepEqual(verdict, { approved: [], added: ['genre/new-one'], unlisted: [] })
  })

  it('reads the listing from any ticket the PR closes', () => {
    const verdict = gateVerdict({
      changes: [{ id: 'genre/box', status: 'modified' }],
      fixStartedAt: T1,
      tickets: [ticket(40, [T0, 'no listing']), ticket(41, [T0, LISTING('- `genre/box`: x')])]
    })
    assert.deepEqual(verdict.approved, [{ id: 'genre/box', ticket: 41 }])
  })
})

describe('commentBody', () => {
  const verdict = {
    unlisted: [{ id: 'genre/box', reason: 'no ticket this PR closes lists it' }],
    approved: [{ id: 'genre/nanro', ticket: 40 }],
    added: ['genre/new-one']
  }
  const sections = new Map([
    ['genre/box', ['step 2 (left up at point 12): pu_q.surface: {} → {"12":1}']],
    ['genre/nanro', Array.from({ length: DIFF_LINES + 3 }, (_, i) => `line ${i + 1}`)],
    ['genre/new-one', ['a new expected file of 4 checkpoints']]
  ])
  const body = commentBody({ head: 'abc123', verdict, sections })

  it('puts each recording under its verdict, with its reason or ticket and its diff lines', () => {
    assert.match(body, /^## Expected-file gate at abc123$/m)
    assert.match(body, /### Not listed in advance: this check fails\n\n#### `genre\/box` — no ticket this PR closes lists it\n\n- step 2 \(left up at point 12\): pu_q\.surface: \{\} → \{"12":1\}\n/)
    assert.match(body, /### Approved\n\n#### `genre\/nanro` — listed in #40\n/)
    assert.match(body, /### New recordings\n\n#### `genre\/new-one`\n\n- a new expected file of 4 checkpoints\n/)
  })

  it('cuts a long diff and says how many lines it left out', () => {
    assert.match(body, new RegExp(`^- line ${DIFF_LINES}$`, 'm'))
    assert.doesNotMatch(body, new RegExp(`^- line ${DIFF_LINES + 1}$`, 'm'))
    assert.match(body, /^- … and 3 more lines: `git diff` the file to see them all$/m)
  })
})

describe('expectedDiff', () => {
  const steps = [
    { kind: 'pointer', action: 'down', button: 'left', ctrl: false, x: 1, y: 1, num: 12 },
    { kind: 'pointer', action: 'up', button: 'left', ctrl: false, x: 1, y: 1, num: 12 },
    { kind: 'key', call: 'key_number', args: ['3'] }
  ]
  const file = (...checkpoints) => ({ checkpoints: checkpoints.map(([step, state]) => ({ step, state })) })

  it('says per checkpoint which keys changed, from what to what, with the step in words', () => {
    const before = file([0, ['pu_q.surface = {}', 'sol_flag = 0']], [2, ['pu_q.surface = {}', 'sol_flag = 0']])
    const after = file([0, ['pu_q.surface = {}', 'sol_flag = 0']], [2, ['pu_q.surface = {"12":1}', 'sol_flag = 0']])
    assert.deepEqual(expectedDiff({ steps, before, after }), [
      'step 2 (left up at point 12): pu_q.surface: {} → {"12":1}'
    ])
  })

  it('names a checkpoint only one file has, and a key only one side has as absent', () => {
    const before = file([0, ['a = 1']], [3, ['a = 1']])
    const after = file([0, ['a = 1', 'b = 2']], [2, ['a = 1']])
    assert.deepEqual(expectedDiff({ steps, before, after }), [
      'step 0 (the board the link loads): b: absent → 2',
      'step 2 (left up at point 12): a checkpoint only the new file has',
      'step 3 (key_number("3")): a checkpoint only the old file has'
    ])
  })

  it('reads a new or deleted file as all of its checkpoints added or removed', () => {
    assert.deepEqual(expectedDiff({ steps, before: null, after: file([0, ['a = 1']]) }), [
      'step 0 (the board the link loads): a checkpoint only the new file has'
    ])
  })
})
