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

test('production analysis and payroll expose no line UI or line recalculation route', () => {
  const productionAnalysis = read('frontend/src/pages/App/work/WorkMonthlyBoard.jsx');
  const payrollBoard = read('frontend/src/pages/App/payroll/PayrollBoard.jsx');
  const payrollRoutes = read('backend/src/payroll/payroll.routes.ts');
  assert.doesNotMatch(productionAnalysis, /lineView|value="line"|TEXT\.line|row\.lineName/);
  assert.doesNotMatch(payrollBoard, /rowHint:|noLines:|\bline:/);
  assert.doesNotMatch(payrollRoutes, /recalculate-line/);
});

test('assignment capacity derives factory staffing from employee employment dates', () => {
  const start = backend.indexOf('const buildLineMonthCapacityRows = async');
  const end = backend.indexOf('app.get("/line-month-capacity"', start);
  const capacitySource = backend.slice(start, end);
  assert.match(capacitySource, /const capacityEmployees = await prisma\.employee\.findMany/);
  assert.match(capacitySource, /factoryId: \{ in: Array\.from\(new Set\(factoryIdByLegacyLineId\.values\(\)\)\) \}/);
  assert.match(capacitySource, /joinedAt[\s\S]*leftAt/);
  assert.doesNotMatch(capacitySource, /const lineAssignmentRows = await prisma\.lineAssignment\.findMany/);
});

test('assignment board headcount counts active factory employees without LineAssignment', () => {
  const lineRoutes = read('backend/src/lines/line.routes.ts');
  const summaryStart = lineRoutes.indexOf('if (summaryOnly) {', lineRoutes.indexOf('const assignmentWhere'));
  const summaryEnd = lineRoutes.indexOf('const [workers, assignments]', summaryStart);
  const summarySource = lineRoutes.slice(summaryStart, summaryEnd);
  assert.match(summarySource, /await prisma\.employee\.findMany/);
  assert.match(summarySource, /factoryId: \{ in: factoryIds \}/);
  assert.doesNotMatch(summarySource, /prisma\.lineAssignment\.findMany/);
});

test('unassigned work panel defaults from content and provides an explicit toggle button', () => {
  assert.match(assignBoard, /unassignedPanelExpandedOverride \?\? unassignedCards\.length > 0/);
  assert.match(assignBoard, /setUnassignedPanelExpandedOverride\(!unassignedPanelExpanded\)/);
  assert.match(assignBoard, /aria-expanded=\{expanded\}/);
  assert.match(assignBoard, /expanded \? 'assign\.collapseUnassignedWork' : 'assign\.expandUnassignedWork'/);
  assert.match(assignBoard, /\{expanded \? <Stack[\s\S]*<\/Stack> : null\}/);
});

test('historical planned load includes remaining assigned backlog without changing actual output', () => {
  const capacityUtils = read('frontend/src/pages/App/assign/utils/lineMonthCapacity.js');
  assert.match(
    backend,
    /target\.totalEstimatedLoadStSeconds\s*=\s*target\.lineMonthlyActualOutputStSeconds \+ remainingBacklog/
  );
  assert.match(
    capacityUtils,
    /lineMonthlyActualOutputStSeconds \+ currentBoardRemainingBacklogStSeconds/
  );
  assert.match(capacityUtils, /actualOutputPercent: resolvedActualOutputPercent/);
  assert.doesNotMatch(
    capacityUtils,
    /inferredMonthType === 'historical'[\s\S]{0,120}Math\.min\(100, resolvedActualOutputPercent\)/
  );
});
