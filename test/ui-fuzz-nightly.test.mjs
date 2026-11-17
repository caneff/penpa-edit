// The nightly UI fuzz's failure title, its output reader and its night loop (live/ui-fuzz/nightly.mjs, #234), on sample
// output lines and fake runners: no page, no `gh`.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { TITLE_MAX, didNotRunIssue, failureTitle, fileIssue, filerFor, nightly, parseFuzzOutput } from '../live/ui-fuzz/nightly.mjs'

const rule = (when, ...lines) => `${lines.length === 1 ? 'rule broken' : 'rules broken'} ${when}: ${lines.join('; ')}`

test('a broken rule is titled by its name, whatever the step, numbers or seed', () => {
  const a = failureTitle(rule('after step 3 (click the Pinned card)', 'cards-do-not-overlap: Pinned and Recent overlap by 12x40 px'))
  const b = failureTitle(rule('after the last step', 'cards-do-not-overlap: Pinned and Board overlap by 90x7 px'))
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
  assert.ok(failureTitle(`boom ${'x'.repeat(300)}`).length <= TITLE_MAX)
})

test('a step that threw is titled by its error alone, whatever the step, action or tool', () => {
  const a = failureTitle('step 3 (pick tool 40 in the Mode card (Sudoku > Normal)) threw: locator.click: Timeout 5000ms exceeded.')
  const b = failureTitle('step 11 (Reset layout from the top bar) threw: locator.click: Timeout 30000ms exceeded.')
  assert.equal(a, 'UI fuzz: error: locator.click: Timeout Nms exceeded.')
  assert.equal(b, a)
})

const FAILED = [
  'fuzz:ui FAILED on the Classic puzzle (seed 77) after 41 s',
  'error: rule broken after step 2 (pin key): pin-keys-select-their-pin: pressing Z left no pin current',
  '2 steps:',
  '  1. open the Pinned card',
  '  2. pin key Z',
  'replay: npm run fuzz:ui -- --seed 77 --path 3:4@abc'
].join('\n')

test('a failure is read as its puzzle, seed, error, steps and replay command', () => {
  assert.deepEqual(parseFuzzOutput(FAILED), {
    failed: true,
    puzzle: 'Classic',
    seed: 77,
    error: 'rule broken after step 2 (pin key): pin-keys-select-their-pin: pressing Z left no pin current',
    steps: ['open the Pinned card', 'pin key Z'],
    replay: 'npm run fuzz:ui -- --seed 77 --path 3:4@abc'
  })
})

test('a pass is a verdict only when it ran an action list; no output is none', () => {
  assert.deepEqual(parseFuzzOutput('fuzz:ui passed: 120 action lists over 5 puzzles in 1800 s (seed 1)'), { passed: true })
  assert.equal(parseFuzzOutput('fuzz:ui passed: 0 action lists over 5 puzzles in 1800 s (seed 1)'), null)
  assert.equal(parseFuzzOutput('browserType.launch: Executable does not exist'), null)
})

// A fake night: `outputs` are the runs' printed output in order, each a string (its exit read from it), an
// `{ ok, output }` or an Error the start throws; every filing is kept.
async function night (outputs) {
  const filed = []
  const seeds = [1, 2, 3, 4, 5]
  let clock = 0
  const outcome = await nightly({
    runFuzz: async () => {
      clock += 60000
      const o = outputs.shift()
      if (o instanceof Error) throw o
      return typeof o === 'string' ? { ok: !o.includes('FAILED') && !o.includes('Error'), output: o } : o
    },
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
  assert.match(filed[0].body, /1\. open the Pinned card/)
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

test('a pass line from a run that exited non-zero is no verdict', async () => {
  const { outcome, filed } = await night([{ ok: false, output: 'fuzz:ui passed: 5 action lists over 1 puzzles in 1 s (seed 3)' }])
  assert.equal(outcome, 'did-not-run')
  assert.match(filed[0].body, /exit non-zero/)
})

test('a night whose run passed with no action list did not run', async () => {
  const { outcome, filed } = await night(['fuzz:ui passed: 0 action lists over 5 puzzles in 1800 s (seed 1)'])
  assert.equal(outcome, 'did-not-run')
  assert.deepEqual(filed.map((i) => i.title), [didNotRunIssue('x').title])
})

test('a filed issue body ends with a Blocked by section', async () => {
  const { filed } = await night([FAILED, 'fuzz:ui passed: 5 action lists over 1 puzzles in 1 s (seed 3)'])
  assert.match(filed[0].body, /\n## Blocked by\n\n- None — can start immediately\.$/)
})

// A fake runner for the filer script: every call is kept, and each answers `ok`.
const fakeFiler = (ok = true) => {
  const calls = []
  return { calls, run: async (command, args) => { calls.push({ command, args, body: readFileSync(args[2], 'utf8') }); return { ok, output: '' } } }
}
const issue = { title: 'UI fuzz: rule broken: a', body: 'the body' }

test('an issue is filed through the repo\'s file-issue-once script, the body in a file it reads', async () => {
  const filer = fakeFiler()
  await fileIssue(issue, filer.run)
  assert.equal(filer.calls.length, 1)
  const { command, args, body } = filer.calls[0]
  assert.deepEqual([command, ...args.slice(0, 2)], ['bash', '.github/scripts/file-issue-once.sh', 'UI fuzz: rule broken: a'])
  assert.equal(body, 'the body')
})

test('a failed filing rejects', async () => {
  await assert.rejects(fileIssue(issue, fakeFiler(false).run), /file-issue-once\.sh failed/)
})

test('a night files for real unless FUZZ_DRY_RUN is 1', async () => {
  const real = fakeFiler()
  await filerFor({}, real.run)(issue)
  assert.equal(real.calls.length, 1)
  const dry = fakeFiler()
  await filerFor({ FUZZ_DRY_RUN: '1' }, dry.run)(issue)
  assert.equal(dry.calls.length, 0)
})
