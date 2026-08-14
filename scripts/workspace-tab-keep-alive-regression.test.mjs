import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const layout = await readFile(
  new URL('../frontend/src/layouts/MainLayout.jsx', import.meta.url),
  'utf8'
);

test('returning to an open workspace tab preserves its mounted page instance', () => {
  const cacheEffect = layout.slice(
    layout.indexOf('if (!isKeepAliveCandidatePath(currentPath)) return;'),
    layout.indexOf('const keepAlivePaths = new Set')
  );
  assert.match(cacheEffect, /if \(prev\.has\(currentPath\)\) return prev/);
  assert.doesNotMatch(cacheEffect, /prev\.get\(currentPath\) === routeOutlet/);
});

test('only tabs no longer open are removed from the keep-alive cache', () => {
  assert.match(layout, /if \(keepAlivePaths\.has\(path\)\) return;[\s\S]*next\.delete\(path\)/);
  assert.match(layout, /display: currentPath === path \? 'flex' : 'none'/);
});
