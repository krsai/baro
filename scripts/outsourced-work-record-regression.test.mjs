import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const [
  schema,
  migrationFix,
  backend,
  payroll,
  workRecordShared,
  page,
  workList,
  workEntry,
  partnerPage,
  router,
  layout,
  partnerDialog,
  accessControl,
  roleAccessPolicyCore,
] = await Promise.all([
  readFile(new URL('../backend/prisma/schema.prisma', import.meta.url), 'utf8'),
  readFile(new URL('../backend/migration_fix.sql', import.meta.url), 'utf8'),
  readFile(new URL('../backend/src/index.ts', import.meta.url), 'utf8'),
  readFile(new URL('../backend/src/payroll/payroll.service.ts', import.meta.url), 'utf8'),
  readFile(new URL('../backend/src/work-records/workRecord.shared.ts', import.meta.url), 'utf8'),
  readFile(new URL('../frontend/src/pages/App/work/WorkDetail.jsx', import.meta.url), 'utf8'),
  readFile(new URL('../frontend/src/pages/App/work/WorkList.jsx', import.meta.url), 'utf8'),
  readFile(new URL('../frontend/src/pages/App/work/WorkEntry.jsx', import.meta.url), 'utf8'),
  readFile(new URL('../frontend/src/pages/App/BusinessPartners.jsx', import.meta.url), 'utf8'),
  readFile(new URL('../frontend/src/router.jsx', import.meta.url), 'utf8'),
  readFile(new URL('../frontend/src/layouts/MainLayout.jsx', import.meta.url), 'utf8'),
  readFile(new URL('../frontend/src/components/BusinessPartnerDialog.jsx', import.meta.url), 'utf8'),
  readFile(new URL('../frontend/src/utils/accessControl.js', import.meta.url), 'utf8'),
  readFile(new URL('../frontend/src/utils/roleAccessPolicyCore.mjs', import.meta.url), 'utf8'),
]);

test('WorkRecord is employee-only: no outsourcing columns remain', () => {
  const workRecordModel = schema.match(/model WorkRecord \{[\s\S]*?\n\}/)?.[0] || '';
  assert.doesNotMatch(workRecordModel, /isOutsourced/);
  assert.doesNotMatch(workRecordModel, /outsourceVendorName/);
  assert.doesNotMatch(workRecordModel, /outsourceUnitPrice/);
  assert.doesNotMatch(workRecordModel, /outsourcingPartnerId/);
  assert.match(backend, /\{ tableName: "WorkRecord", columnName: "isOutsourced" \}/);
  assert.match(backend, /\{ tableName: "WorkRecord", columnName: "outsourceVendorName" \}/);
  assert.match(backend, /\{ tableName: "WorkRecord", columnName: "outsourceUnitPrice" \}/);
  assert.match(backend, /\{ tableName: "WorkRecord", columnName: "outsourcingPartnerId" \}/);
});

test('OutsourcedWorkRecord is a separate table with required vendor/price fields', () => {
  const outsourcedModel = schema.match(/model OutsourcedWorkRecord \{[\s\S]*?\n\}/)?.[0] || '';
  assert.match(outsourcedModel, /outsourcingPartnerId\s+Int\s/);
  assert.match(outsourcedModel, /outsourceVendorName\s+String\s/);
  assert.match(outsourcedModel, /outsourceUnitPrice\s+Decimal\s/);
  assert.doesNotMatch(outsourcedModel, /workerId/);
  assert.doesNotMatch(outsourcedModel, /ctSeconds/);
  assert.match(schema, /enum WorkLogRecordKind/);
  assert.match(schema, /recordKind\s+WorkLogRecordKind/);
  assert.match(migrationFix, /CREATE TABLE IF NOT EXISTS "OutsourcedWorkRecord"/);
  assert.match(migrationFix, /"WorkLogRecordKind" AS ENUM/);
  assert.match(backend, /\{ tableName: "OutsourcedWorkRecord", columnName: "outsourcingPartnerId" \}/);
});

test('progress/completion calculations union WorkRecord and OutsourcedWorkRecord', () => {
  assert.match(backend, /const loadAssignmentPlanProgressWorkRows/);
  assert.match(backend, /prisma\.outsourcedWorkRecord\.findMany/);
  assert.match(backend, /\.\.\.employeeRows, \.\.\.outsourcedRows/);
});

test('AT training and payroll read only WorkRecord (structural exclusion, no isOutsourced filter)', () => {
  assert.match(backend, /must never enter AT training allocation/);
  assert.doesNotMatch(backend, /where:\s*\{\s*quantity:\s*\{\s*gt:\s*0\s*\},\s*isOutsourced/);
  assert.doesNotMatch(payroll, /isOutsourced/);
});

test('WORK_RECORD_WITH_REFS_INCLUDE has an OutsourcedWorkRecord counterpart', () => {
  assert.match(workRecordShared, /export const OUTSOURCED_WORK_RECORD_WITH_REFS_INCLUDE/);
  assert.match(workRecordShared, /outsourcingPartner:/);
});

test('business partner history reads OutsourcedWorkRecord', () => {
  assert.match(backend, /app\.get\("\/business-partners\/:id\/history"/);
  assert.match(backend, /prisma\.outsourcedWorkRecord\.findMany/);
});

test('WorkDetail supports a recordKind prop that gates the worker/vendor picker', () => {
  assert.match(page, /recordKind = 'EMPLOYEE'/);
  assert.match(page, /isOutsourcingMode/);
  assert.match(page, /name: LABELS\.addOutsourcePartnerOption, isOutsourceAction: true/);
  assert.doesNotMatch(page, /window\.prompt/);
  assert.match(page, /<BusinessPartnerDialog/);
});

test('outsourcing menu reuses WorkList/WorkEntry via recordKind, not a duplicated page', () => {
  assert.match(workList, /recordKind = 'EMPLOYEE'/);
  assert.match(workEntry, /recordKind = 'EMPLOYEE'/);
  assert.match(workEntry, /recordKind=\{recordKind\}/);
});

test('outsourcing-record routes and menu entry are registered', () => {
  assert.match(router, /path: 'outsourcing-record'/);
  assert.match(router, /path: 'outsourcing-record\/new'/);
  assert.match(router, /path: 'outsourcing-record\/:workLogId'/);
  assert.match(router, /recordKind="OUTSOURCING"/);
  assert.match(layout, /menu\.outsourcingRecord/);
  assert.match(layout, /path: '\/outsourcing-record'/);
});

test('OUTSOURCING_RECORD is its own access-control feature, independent of WORK_HISTORY', () => {
  assert.match(accessControl, /OUTSOURCING_RECORD: 'OUTSOURCING_RECORD'/);
  assert.match(accessControl, /path\.startsWith\('\/outsourcing-record'\)\) return FEATURE_KEYS\.OUTSOURCING_RECORD/);
  assert.match(roleAccessPolicyCore, /OUTSOURCING_RECORD: 'OUTSOURCING_RECORD'/);
  assert.match(roleAccessPolicyCore, /applyLegacyOutsourcingRecordDefault/);
});

test('sales partner screen lists both localized partner types and exposes history', () => {
  assert.match(partnerPage, /title=\{labels\.title\}/);
  assert.match(partnerPage, /getBusinessPartnerTypeLabel/);
  assert.match(partnerPage, /record\.unitPrice/);
  assert.match(partnerPage, /record\.quantity/);
  assert.match(partnerDialog, /contactName/);
  assert.match(partnerDialog, /contactPhone/);
  assert.match(partnerDialog, /PROCESS_OUTSOURCING/);
  assert.match(partnerDialog, /MATERIAL_SUPPLIER/);
});

test('work detail truncates worker names with a tooltip and hides the wage display', () => {
  assert.match(page, /<Tooltip title=\{toText\(row\?\.worker\?\.name\) \|\| '-'\}/);
  assert.match(page, /textOverflow: 'ellipsis'/);
  assert.doesNotMatch(page, /<TextField label=\{LABELS\.wagePerSecond\}/);
});
