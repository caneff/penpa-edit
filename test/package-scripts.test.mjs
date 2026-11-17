// The npm test scripts cap node's test concurrency (#76): without the flag node
// runs one file per core, and a Chromium per live file hangs the shared box.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { NODE_TEST_FLAGS } from '../live/run-live.mjs';

const { scripts } = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8'));
const caps = (words) => words.filter((w) => w.startsWith('--test-concurrency'));

test('npm test caps concurrency at 4, once, before the file glob', () => {
  const words = scripts.test.split(/\s+/);
  assert.deepEqual(caps(words), ['--test-concurrency=4'], 'exactly one cap, set to 4');
  // node reads a flag after the first file argument as a file argument, not a flag
  const glob = words.findIndex((w) => w.startsWith('"'));
  assert.ok(glob > words.indexOf(caps(words)[0]), 'the cap comes before the quoted file glob');
});

// `live/run-live.mjs` puts its flags before the files it passes node.
for (const name of ['test:live', 'test:live:changed']) {
  test(`npm run ${name} runs the live files through live/run-live.mjs, which caps concurrency at 4, once`, () => {
    assert.match(scripts[name], /^node live\/run-live\.mjs\b/);
    assert.deepEqual(caps(NODE_TEST_FLAGS), ['--test-concurrency=4']);
  });
}
