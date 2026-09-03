import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = (relativePath) => fs.readFileSync(path.join(root, relativePath), 'utf8');

const backend = read('backend/src/index.ts');
const assignBoard = read('frontend/src/pages/App/assign/AssignBoard.jsx');

test('assignment responses keep legacy lineId separate from factoryId', () => {
  assert.match(backend, /lineId: String\(plan\.lineId\),\s*factoryId: toPositiveIntOrNull\(plan\.factoryId \?\? plan\?\.line\?\.factoryId\)/);
  assert.doesNotMatch(backend, /lineId: String\(plan\.factoryId \?\?/);
});

test('board load maps persisted line ids to the factory-scoped lane', () => {
  assert.match(assignBoard, /factoryIdByLegacyLineId\.get\(normalizeKey\(item\?\.lineId\)\)/);
  assert.match(assignBoard, /normalizeKey\(item\?\.factoryId\)/);
  assert.match(assignBoard, /factoryId: Number\(assignment\.lineId\)/);
});

test('server distinguishes new factory ids from legacy line ids', () => {
  assert.match(backend, /explicitFactoryId != null[\s\S]*scopeMaps\.byFactoryId\.get\(explicitFactoryId\)/);
  assert.match(backend, /scopeMaps\.byLineId\.get\(legacyLineId\)/);
});

test('removed line page has no active route or navigation link', () => {
  const activeNavigationSources = [
    'frontend/src/router.jsx',
    'frontend/src/layouts/MainLayout.jsx',
    'frontend/src/pages/App/WorkspaceDashboard.jsx',
    'frontend/src/pages/App/employee/EmployeeBoard.jsx',
    'frontend/src/utils/accessControl.js',
  ].map(read).join('\n');
  assert.doesNotMatch(activeNavigationSources, /['"]\/line(?:\?|['"])/);
});
