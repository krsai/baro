import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const ts = require('../backend/node_modules/typescript');
const backend = readFileSync('backend/src/index.ts', 'utf8');
const work = readFileSync('frontend/src/pages/App/work/WorkDetail.jsx', 'utf8');
const order = readFileSync('frontend/src/pages/App/order/OrderList.jsx', 'utf8');
const positive = value => Number.isSafeInteger(Number(value)) && Number(value) > 0 ? Number(value) : null;
const text = value => value == null ? '' : String(value).trim();
// Execute the actual declarations, without starting the API or rendering React.
function load(source, names, deps = {}) {
  const ast = ts.createSourceFile('source.tsx', source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  const declarations = [];
  function visit(node) {
    if (ts.isVariableDeclaration(node) && names.includes(node.name.getText(ast))) {
      declarations.push(`const ${node.getText(ast)};`);
    }
    ts.forEachChild(node, visit);
  }
  visit(ast);
  assert.equal(declarations.length, names.length);
  const js = ts.transpileModule(declarations.join('\n'), { compilerOptions: { target: ts.ScriptTarget.ES2022 } }).outputText;
  return new Function(...Object.keys(deps), `${js}\nreturn {${names.join(',')}};`)(...Object.values(deps));
}
const common = { toPositiveIntOrNull: positive, toPositiveIdOrNull: positive, toText: text };

test('outsourcing duplicate lookup uses vendor FK across renames and distinguishes different vendors', async () => {
  let query;
  const existing = { outsourcingPartnerId: 7, outsourceVendorName: 'Old name', assignmentPlanId: 4, styleProcessId: 8 };
  const deps = { ...common, resolveWorkRecordProcessMetricFromRecord: row => ({ processMetricKey: `process:${row.styleProcessId}` }),
    prisma: { outsourcedWorkRecord: { findMany: async args => { query = args; return args.where.outsourcingPartnerId.in.includes(7) ? [existing] : []; } } },
    ensureArray: value => Array.isArray(value) ? value : [], normalizeDateKey: text,
    collectPositiveIntSet: (...values) => [...new Set(values.map(positive).filter(Boolean))],
    formatOutsourcedRecordIdentityLabel: row => row.outsourceVendorName,
    formatWorkerStyleProcessIdentityLabel: () => '', buildWorkRecordWorkerStyleProcessSignature: () => '',
  };
  const { validateWorkLogWorkerStyleProcessDuplicates: validate } = load(backend,
    ['buildWorkRecordActorProcessSignature', 'buildOutsourcedWorkRecordSignature', 'validateWorkLogWorkerStyleProcessDuplicates'], deps);
  const args = { orgId: 1, workDate: '2026-10-02', recordKind: 'OUTSOURCING', excludedWorkLogId: 22 };
  assert.equal((await validate({ ...args, records: [{ ...existing, outsourceVendorName: 'New name' }] })).status, 400);
  assert.deepEqual(query.where.outsourcingPartnerId.in, [7]);
  assert.equal(query.where.workLog.id.not, 22);
  assert.equal(query.select.outsourcingPartnerId, true);
  assert.equal((await validate({ ...args, records: [{ ...existing, outsourcingPartnerId: 9 }] })).status, 200);
});

test('process selection keeps FK identity despite identical names, codes and UI keys', () => {
  const { isSameProcess, resolveProcessOption, buildProcessIdentityKey } = load(work, ['isSameProcess', 'resolveProcessOption', 'buildProcessIdentityKey'], {
    ...common, mergeMatchedProcessOption: (row, match) => ({ ...row, ...match }),
  });
  const a = { styleProcessId: 1, code: 'P', name: 'Sew', processKey: 'same', ctSeconds: 10 };
  const b = { ...a, styleProcessId: 2, ctSeconds: 40 };
  assert.equal(isSameProcess(a, b), false);
  assert.notEqual(buildProcessIdentityKey(a), buildProcessIdentityKey(b));
  assert.equal(buildProcessIdentityKey({ name: 'Sew', code: 'P' }), '');
  assert.equal(isSameProcess({ name: 'Sew' }, { name: 'Sew' }), false);
  assert.equal(resolveProcessOption(b, { processes: [a, b] }).ctSeconds, 40);
  const broken = { ...a, styleProcessId: 99 };
  assert.equal(resolveProcessOption(broken, { processes: [a] }), broken);
});

test('worker and factory selection never replaces missing IDs by a matching name', () => {
  const { matchById: match } = load(work, ['matchById'], common);
  const options = [{ id: 1, name: 'Same' }, { id: 2, name: 'Same' }];
  assert.equal(match(options, { id: 2, name: 'Renamed' }).id, 2);
  assert.equal(match(options, { id: 3, name: 'Same' }), null);
  assert.equal(match(options, { name: 'Same' }), null);
});

test('outsourcing UI duplicate actor is stable across renames and distinct for different partner IDs', () => {
  const { buildWorkerMetric: metric } = load(work, ['buildWorkerMetric'], common);
  assert.equal(metric({ outsourcingPartnerId: 1, workerName: 'A' }).key, metric({ outsourcingPartnerId: 1, workerName: 'B' }).key);
  assert.notEqual(metric({ outsourcingPartnerId: 1, workerName: 'A' }).key, metric({ outsourcingPartnerId: 2, workerName: 'A' }).key);
});

test('order style candidates use customer ID, including duplicate and renamed customer names', () => {
  const styles = [{ id: 1, customerOrgId: 7, customer: 'Old' }, { id: 2, customerOrgId: 8, customer: 'New' }];
  const get = buyer => load(order, ['availableStyleOptions'], { useMemo: fn => fn(), styleOptions: styles, selectedBuyerOrgId: buyer }).availableStyleOptions;
  assert.deepEqual(get(7).map(row => row.id), [1]);
  assert.deepEqual(get(8).map(row => row.id), [2]);
  assert.deepEqual(get(NaN), []);
});

test('order buyer display is defined while selection readiness depends only on its FK', () => {
  const get = formData => load(order, ['selectedBuyerOrgId', 'hasSelectedBuyer', 'selectedBuyerName'], { formData });
  assert.deepEqual(get({ buyerOrgId: 7, buyerOrgName: 'Renamed' }), { selectedBuyerOrgId: 7, hasSelectedBuyer: true, selectedBuyerName: 'Renamed' });
  assert.equal(get({ buyerOrgId: 7 }).hasSelectedBuyer, true);
  assert.equal(get({ buyerOrgName: 'Same name' }).hasSelectedBuyer, false);
  assert.doesNotMatch(order, /if \(!selectedBuyerName\)|disabled=\{!selectedBuyerName\}/);
});

test('import refuses ambiguous processes inside one assignment instead of choosing the first', () => {
  const { resolveWorkLogImportMatchedProcess: match } = load(backend, ['resolveWorkLogImportMatchedProcess'], {
    resolveOptionalString: value => value || null, normalizeProcessCodeKey: text, normalizeProcessNameKey: text,
    buildWorkLogImportPlanProcessOptions: plan => plan.processes,
    buildWorkLogImportProcessCodeCandidates: row => [row.processCode],
    createHttpError: (status, message) => Object.assign(new Error(message), { status }),
  });
  const plan = { processes: [{ styleProcessId: 1, processCode: 'P1', processName: 'Sew' }, { styleProcessId: 2, processCode: 'P2', processName: 'Sew' }] };
  assert.throws(() => match({ plan, processCode: 'Sew' }), error => error.status === 409);
  assert.equal(match({ plan, processCode: 'P2' }).styleProcessId, 2);
  assert.equal(match({ plan, processCode: 'unknown' }), null);
});

test('assignment progress reads current outsourced vendor through the relation', () => {
  const query = backend.slice(backend.indexOf('const outsourcedRows: any[] = await prisma.outsourcedWorkRecord.findMany'), backend.indexOf('const outsourcedRows: any[] = await prisma.outsourcedWorkRecord.findMany') + 2000);
  assert.match(query, /outsourcingPartner: \{ select: \{ name: true \} \}/);
  assert.match(backend, /resolveOptionalString\(record\?\.outsourcingPartner\?\.name, "외주"\)/);
});
