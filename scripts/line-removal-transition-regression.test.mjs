import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import { retiredLineReferences } from './helpers/retired-line-references.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = (relativePath) => fs.readFileSync(path.join(root, relativePath), 'utf8');

const backend = read('backend/src/index.ts');
const assignBoard = read('frontend/src/pages/App/assign/AssignBoard.jsx');

test('assignment schema and responses contain only canonical factory scope', () => {
  assert.match(backend, /factoryId: String\(plan\.factoryId\)/);
  assert.deepEqual(retiredLineReferences(backend), []);
  const schema = read('backend/prisma/schema.prisma');
  assert.doesNotMatch(schema, /model Line\b|model LineAssignment\b|\blineId\b/);
  assert.match(schema, /factoryId\s+Int\s/);
});

test('retired-domain guard ignores prose but catches identifiers and quoted property access', () => {
  assert.deepEqual(retiredLineReferences('// lineId\nconst description = "LineAssignment was removed";'), []);
  for (const code of ['const lineId = 1', 'type X = { lineId: number }', 'const x = { "lineId": 1 }', 'x["lineId"]', 'prisma.line.findMany()', 'prisma["lineAssignment"].findMany()']) {
    assert.ok(retiredLineReferences(code).length > 0, code);
  }
});

test('retired domain has no identifiers in active backend or frontend source', () => {
  const scan = (directory) => {
    for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
      const filename = path.join(directory, entry.name);
      if (entry.isDirectory()) scan(filename);
      else if (/\.[cm]?[jt]sx?$/.test(entry.name)) assert.deepEqual(retiredLineReferences(fs.readFileSync(filename, 'utf8'), filename), [], filename);
    }
  };
  scan(path.join(root, 'backend/src'));
  scan(path.join(root, 'frontend/src'));
});

test('PostgreSQL integration fixtures use factory ownership without retired models', () => {
  const fixture = read('scripts/relationship-time-bucket-integration.test.mjs');
  assert.deepEqual(retiredLineReferences(fixture), []);
  assert.ok(retiredLineReferences('db.line.create({})').length > 0);
  assert.ok(retiredLineReferences('tx["lineAssignment"].findMany()').length > 0);
  assert.match(fixture, /factoryId: factory\.id/);
});

test('board loads and saves canonical factory IDs without a compatibility mapping', () => {
  assert.doesNotMatch(assignBoard, /legacyLine|legacyFactory|\/lines['"]/);
  assert.match(assignBoard, /normalizeKey\(item\?\.factoryId\)/);
  assert.match(assignBoard, /factoryId: Number\(assignment\.factoryId\)/);
});

test('server validates assignment factory IDs against organization factories', () => {
  assert.match(backend, /scopeMaps\.byFactoryId\.has\(resolvedFactoryId\)/);
  assert.match(backend, /assignment factoryId is invalid/);
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
  const start = backend.indexOf('const buildFactoryMonthCapacityRows = async');
  const end = backend.indexOf('app.get("/factory-month-capacity"', start);
  const capacitySource = backend.slice(start, end);
  assert.match(capacitySource, /const capacityEmployees = await prisma\.employee\.findMany/);
  assert.match(capacitySource, /factoryId: \{ in: requestedFactoryIds \}/);
  assert.match(capacitySource, /joinedAt[\s\S]*leftAt/);
  assert.doesNotMatch(capacitySource, /const lineAssignmentRows = await prisma\.lineAssignment\.findMany/);
});

test('assignment board headcount counts active factory employees without LineAssignment', () => {
  const summaryStart = backend.indexOf('app.get("/factory-workers"');
  const summaryEnd = backend.indexOf('app.get("/assignment-plans"', summaryStart);
  const summarySource = backend.slice(summaryStart, summaryEnd);
  assert.match(summarySource, /await prisma\.employee\.findMany/);
  assert.match(summarySource, /factoryId: \{ in: factories\.map\(factory => factory\.id\) \}/);
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
  const capacityUtils = read('frontend/src/pages/App/assign/utils/factoryMonthCapacity.js');
  assert.match(
    backend,
    /target\.totalEstimatedLoadStSeconds\s*=\s*target\.factoryMonthlyActualOutputStSeconds \+ remainingBacklog/
  );
  assert.match(
    capacityUtils,
    /factoryMonthlyActualOutputStSeconds \+ currentBoardRemainingBacklogStSeconds/
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
