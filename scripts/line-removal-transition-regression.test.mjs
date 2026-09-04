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

test('unassigned work panel defaults from content and collapses its desktop column horizontally', () => {
  assert.match(assignBoard, /unassignedPanelExpandedOverride \?\? unassignedCards\.length > 0/);
  assert.match(assignBoard, /setUnassignedPanelExpandedOverride\(!unassignedPanelExpanded\)/);
  assert.match(assignBoard, /aria-expanded=\{expanded\}/);
  assert.match(assignBoard, /KeyboardArrowLeftIcon/);
  assert.match(assignBoard, /KeyboardArrowRightIcon/);
  assert.match(assignBoard, /width: \{ lg: collapsed \? 48 : 'clamp\(340px, 28vw, 400px\)' \}/);
  assert.match(assignBoard, /width 0\.32s cubic-bezier\(0\.4, 0, 0\.2, 1\)/);
  assert.match(assignBoard, /backgroundColor: isOver \? [^\n]+ : '#F6F7F9'/);
  assert.doesNotMatch(assignBoard, /borderLeft: \{ xs: 0, lg: '1px solid' \}/);
  assert.match(assignBoard, /collapsed=\{!unassignedPanelExpanded\}/);
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

test('live QC review is factory-scoped and exposes no line selector or column', () => {
  const qcReview = read('frontend/src/pages/App/QcReview.jsx');
  assert.match(qcReview, /buildQueryString\(\{\s*orgId: activeOrgId,\s*factoryId,/);
  assert.doesNotMatch(qcReview, /setSelectedLineId|selectedLineId|\/lines\$\{query\}/);
  assert.doesNotMatch(qcReview, /<TableCell>라인<\/TableCell>|label="라인"/);
  assert.doesNotMatch(qcReview, /조직 관리\s*>?\s*라인/);
});

test('orphan line pages and hidden legacy production-plan route are removed', () => {
  [
    'frontend/src/pages/App/Line.jsx',
    'frontend/src/pages/App/line/LineBoard.jsx',
    'frontend/src/pages/App/line/LineDetail.jsx',
    'frontend/src/pages/App/ProductionPlan.jsx',
    'frontend/src/pages/App/production/ProductionPlanBoard.jsx',
  ].forEach((relativePath) => {
    assert.equal(fs.existsSync(path.join(root, relativePath)), false, relativePath);
  });
  const router = read('frontend/src/router.jsx');
  assert.doesNotMatch(router, /path:\s*['"]production-plan['"]|pages\/App\/ProductionPlan/);
});

test('work import no longer handles retired cross-line warnings', () => {
  const workList = read('frontend/src/pages/App/work/WorkList.jsx');
  assert.doesNotMatch(workList, /crossLineRowCount|getCrossLineAssignmentWarning|crossLineAssignment/);
});
