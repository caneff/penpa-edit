// The nightly UI fuzz's failure title, its output reader and its night loop (live/ui-fuzz/nightly.mjs, #234), on sample
// output lines and fake runners: no page, no `gh`.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { didNotRunIssue, failureTitle, fileIssue, nightly, parseFuzzOutput } from '../live/ui-fuzz/nightly.mjs'

const rule = (when, ...lines) => `${lines.length === 1 ? 'rule broken' : 'rules broken'} ${when}: ${lines.join('; ')}`

test('a broken rule is titled by its name, whatever the step, numbers or seed', () => {
  const a = failureTitle(rule('after step 3 (click the Pins card)', 'cards-do-not-overlap: Pins and Recent overlap by 12x40 px'))
  const b = failureTitle(rule('after the last step', 'cards-do-not-overlap: Pins and Board overlap by 90x7 px'))
  assert.equal(a, 'UI fuzz: rule broken: cards-do-not-overlap')
  assert.equal(b, a)
})

test('several broken rules are named once each, in the order found', () => {
  const error = rule('after step 12 (reload)', 'board-fits-card: x', 'headings-on-one-line: y', 'board-fits-card: z')
  assert.equal(failureTitle(error), 'UI fuzz: rule broken: board-fits-card, headings-on-one-line')
})

test('a crash is titled by its first signal with the numbers folded', () => {
  const a = failureTitle('crash signal after step 4 (key z): page error: Cannot read properties of null (reading \'x\') at line 120')
  const b = failureTitle('crash signals after step 9 (undo): page error: Cannot read properties of null (reading \'x\') at line 98; page error: other')
  assert.equal(a, 'UI fuzz: crash: page error: Cannot read properties of null (reading \'x\') at line N')
  assert.equal(b, a)
})

test('an error that is neither is titled by its first line, and a long title is cut', () => {
  assert.equal(failureTitle('Timeout 30000ms exceeded\n  at foo'), 'UI fuzz: error: Timeout Nms exceeded')
  assert.ok(failureTitle(`boom ${'x'.repeat(300)}`).length <= 110)
})

const FAILED = [
  'fuzz:ui FAILED on the Classic puzzle (seed 77) after 41 s',
  'error: rule broken after step 2 (pin key): pin-keys-select-their-pin: pressing Z left no pin current',
  '2 steps:',
  '  1. open the Pins card',
  '  2. pin key Z',
  'replay: npm run fuzz:ui -- --seed 77 --path 3:4@abc'
].join('\n')

test('a failure is read as its puzzle, seed, error, steps and replay command', () => {
  assert.deepEqual(parseFuzzOutput(FAILED), {
    failed: true,
    puzzle: 'Classic',
    seed: 77,
    error: 'rule broken after step 2 (pin key): pin-keys-select-their-pin: pressing Z left no pin current',
    steps: ['open the Pins card', 'pin key Z'],
    replay: 'npm run fuzz:ui -- --seed 77 --path 3:4@abc'
  })
})

test('a pass is a verdict only when it ran an action list; no output is none', () => {
  assert.deepEqual(parseFuzzOutput('fuzz:ui passed: 120 action lists over 5 puzzles in 1800 s (seed 1)'), { passed: true })
  assert.equal(parseFuzzOutput('fuzz:ui passed: 0 action lists over 5 puzzles in 1800 s (seed 1)'), null)
  assert.equal(parseFuzzOutput('browserType.launch: Executable does not exist'), null)
})

// A fake night: `outputs` are the runs' printed output in order; every filing is kept.
async function night (outputs) {
  const filed = []
  const seeds = [1, 2, 3, 4, 5]
  let clock = 0
  const outcome = await nightly({
    runFuzz: async () => { clock += 60000; const o = outputs.shift(); if (o instanceof Error) throw o; return { ok: !o.includes('FAILED') && !o.includes('Error'), output: o } },
    fileIssue: async (issue) => { filed.push(issue) },
    newSeed: () => seeds.shift(),
    now: () => clock
  })
  return { outcome, filed }
}

test('the same failure on two runs of one night is filed once', async () => {
  const other = FAILED.replace('seed 77', 'seed 78').replace('after 41 s', 'after 90 s')
  const { outcome, filed } = await night([FAILED, other, 'fuzz:ui passed: 5 action lists over 1 puzzles in 1 s (seed 3)'])
  assert.equal(outcome, 'red')
  assert.equal(filed.length, 1)
  assert.equal(filed[0].title, 'UI fuzz: rule broken: pin-keys-select-their-pin')
  assert.match(filed[0].body, /seed 77/)
  assert.match(filed[0].body, /npm run fuzz:ui -- --seed 77 --path 3:4@abc/)
  assert.match(filed[0].body, /1\. open the Pins card/)
})

test('a clean night files nothing', async () => {
  const { outcome, filed } = await night(['fuzz:ui passed: 5 action lists over 1 puzzles in 1 s (seed 3)'])
  assert.equal(outcome, 'green')
  assert.deepEqual(filed, [])
})

test('a run that cannot start, or prints no verdict, files one did-not-run issue and ends the night', async () => {
  const a = await night([new Error('spawn node ENOENT'), FAILED])
  assert.equal(a.outcome, 'did-not-run')
  assert.deepEqual(a.filed.map((i) => i.title), [didNotRunIssue('x').title])
  const b = await night(['browserType.launch: Executable does not exist'])
  assert.equal(b.outcome, 'did-not-run')
  assert.match(b.filed[0].body, /Executable does not exist/)
})

test('a filed issue body ends with a Blocked by section', async () => {
  const { filed } = await night([FAILED, 'fuzz:ui passed: 5 action lists over 1 puzzles in 1 s (seed 3)'])
  assert.match(filed[0].body, /\n## Blocked by\n\n- None — can start immediately\.$/)
})

// A fake `gh`: `open` is the list output, `ok` whether each call succeeds; every call is kept.
const fakeGh = (open, ok = true) => {
  const calls = []
  return { calls, runGh: async (command, args, opts) => { calls.push({ args, input: opts?.input }); return { ok, output: args[1] === 'list' ? open : '' } } }
}
const issue = { title: 'UI fuzz: rule broken: a', body: 'the body', comment: 'the comment' }

test('a title with an open issue gets a comment on that issue, not a second issue', async () => {
  const gh = fakeGh('7\tother\n12\tUI fuzz: rule broken: a\n')
  await fileIssue(issue, gh.runGh)
  assert.deepEqual(gh.calls.map((c) => c.args.slice(0, 3)), [['issue', 'list', '--repo'], ['issue', 'comment', '12']])
  assert.equal(gh.calls[1].input, 'the comment')
})

test('a new title files a bug and needs-info issue', async () => {
  const gh = fakeGh('7\tother\n')
  await fileIssue(issue, gh.runGh)
  const create = gh.calls[1].args
  assert.deepEqual(create.slice(0, 2), ['issue', 'create'])
  assert.equal(create[create.indexOf('--label') + 1], 'bug,needs-info')
  assert.equal(gh.calls[1].input, 'the body')
})

test('a failed list files nothing', async () => {
  const gh = fakeGh('', false)
  await assert.rejects(fileIssue(issue, gh.runGh), /gh issue list failed/)
  assert.equal(gh.calls.length, 1)
})
