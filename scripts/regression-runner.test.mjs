import assert from 'node:assert/strict';
import test from 'node:test';
import fs from 'node:fs';
import { runSuites, selectSuites } from './run-regression.mjs';

test('failures and launch errors do not hide later suites and return a failing exit', async () => {
  const visited = [], reports = [];
  const code = await runSuites(['first', 'broken', 'last'], async (name) => {
    visited.push(name);
    if (name === 'broken') throw new Error('launch failed');
    return name === 'first' ? 1 : 0;
  }, (message) => reports.push(message));
  assert.deepEqual(visited, ['first', 'broken', 'last']);
  assert.equal(code, 1);
  assert.ok(reports.some((message) => message.includes('1/3 suites passed')));
  assert.equal(await runSuites(['ok'], async () => 0, () => {}), 0);
});

test('all registered suites are included except the aggregate and nested line check', () => {
  const { scripts } = JSON.parse(fs.readFileSync(new URL('../package.json', import.meta.url)));
  const selected = selectSuites(scripts);
  for (const name of ['at-shared-prior', 'attendance-import', 'month-selector', 'order-item-identity', 'relationship-bucket-integration', 'salary-system']) {
    assert.ok(selected.includes(`test:${name}`), name);
  }
  assert.ok(!selected.includes('test:regression'));
  assert.ok(!selected.includes('test:line-removal-transition'));
  assert.match(scripts['test:factory-domain'], /line-removal-transition-regression\.test\.mjs/);
});
