import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = (relativePath) => fs.readFileSync(path.join(root, relativePath), 'utf8');

const monthSelector = read('frontend/src/components/MonthSelector.jsx');

test('global month selector owns the preferred month input and stacked shift controls', () => {
  assert.match(monthSelector, /type="month"/);
  assert.match(monthSelector, />\s*M\+\s*<\/Button>/);
  assert.match(monthSelector, />\s*M-\s*<\/Button>/);
  assert.match(monthSelector, /min: minMonth \|\| undefined/);
  assert.match(monthSelector, /max: maxMonth \|\| undefined/);
});

test('single-month screens reuse the global month selector', () => {
  const screens = [
    'frontend/src/pages/App/assign/AssignBoard.jsx',
    'frontend/src/pages/App/ShipmentReview.jsx',
    'frontend/src/pages/App/work/WorkMonthlyBoard.jsx',
  ];

  screens.forEach((screen) => {
    const source = read(screen);
    assert.match(source, /import MonthSelector from/);
    assert.match(source, /<MonthSelector/);
    assert.doesNotMatch(source, /type="month"/);
  });
});
