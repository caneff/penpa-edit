// The npm test scripts cap node's test concurrency (#76): without the flag node
// runs one file per core, and a Chromium per live file hangs the shared box.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const { scripts } = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8'));

for (const name of ['test', 'test:live']) {
  test(`npm run ${name} passes --test-concurrency=4`, () => {
    assert.match(scripts[name], /--test-concurrency=4(\s|$)/);
  });
}
