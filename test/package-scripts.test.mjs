// The npm test scripts cap node's test concurrency (#76): without the flag node
// runs one file per core, and a Chromium per live file hangs the shared box.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const { scripts } = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8'));

for (const name of ['test', 'test:live']) {
  test(`npm run ${name} caps concurrency at 4, once, before the file glob`, () => {
    const words = scripts[name].split(/\s+/);
    const caps = words.filter((w) => w.startsWith('--test-concurrency'));
    assert.deepEqual(caps, ['--test-concurrency=4'], 'exactly one cap, set to 4');
    // node reads a flag after the first file argument as a file argument, not a flag
    const glob = words.findIndex((w) => w.startsWith('"'));
    assert.ok(glob > words.indexOf(caps[0]), 'the cap comes before the quoted file glob');
  });
}
