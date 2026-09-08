import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import { createRequire } from 'node:module';
const require = createRequire(new URL('../backend/package.json', import.meta.url));
const revision = require('../backend/dist/utils/editRevision.js');

function salaryHarness() {
  let data = {
    items: [{ id: 1, code: 'incentiveTotal', nameKo: '성과급', nameEn: 'Performance Pay', nameVi: 'Thưởng năng suất', category: 'INCENTIVE', payTypes: ['OUTPUT'], formula: ['PRODUCTION_ALLOWANCE'], payCycle: 'MONTHLY', paymentMonths: Array.from({ length: 12 }, (_, i) => i + 1), required: true, isActive: true }],
    rates: [], versions: [{ id: 1, versionNumber: 1, effectiveMonth: '1900-01', confirmedDate: new Date('2026-01-01'), snapshot: {} }], currency: 'VND',
  };
  let generation = 0;
  let failVersion = false;
  const client = (get) => ({
    factory: { findFirst: async () => ({ id: 1, salaryCurrency: { code: get().currency }, organization: {} }), update: async () => ({}) },
    employeeGrade: { findMany: async () => [] },
    currency: { findUnique: async () => ({ id: 1 }) },
    salaryItem: {
      findMany: async () => structuredClone(get().items),
      upsert: async ({ update }) => { Object.assign(get().items[0], update); return get().items[0]; },
      updateMany: async () => ({ count: 0 }),
    },
    salaryItemRate: { findMany: async () => structuredClone(get().rates), deleteMany: async () => { get().rates = []; }, createMany: async ({ data }) => { get().rates = data; } },
    salarySystemVersion: {
      findMany: async ({ orderBy }) => structuredClone([...get().versions].sort((a, b) => orderBy.versionNumber === 'asc' ? a.versionNumber - b.versionNumber : b.versionNumber - a.versionNumber)),
      create: async ({ data }) => {
        if (failVersion) throw new Error('simulated version failure');
        const row = { id: get().versions.length + 1, confirmedDate: new Date('2026-09-08'), ...data };
        get().versions.push(row); return row;
      },
      updateMany: async () => { get().versions.filter(v => v.versionNumber > 1).forEach(v => { v.effectiveMonth = null; }); },
      update: async ({ where, data }) => Object.assign(get().versions.find(v => v.id === where.id), data),
    },
  });
  const db = client(() => data);
  db.$transaction = async (run, options) => {
    assert.equal(options.isolationLevel, 'Serializable');
    const start = generation;
    const draft = structuredClone(data);
    const result = await run(client(() => draft));
    if (generation !== start) throw Object.assign(new Error('serialization conflict'), { code: 'P2034' });
    data = draft; generation++; return result;
  };
  const routes = new Map();
  const router = Object.fromEntries(['get', 'put', 'post'].map(method => [method, (path, fn) => routes.set(`${method} ${path}`, fn)]));
  const exports = {};
  const dependencies = {
    express: { Router: () => router }, '../db': { prisma: db },
    '../middleware/access': { getOrganizationByQuery: async () => ({ id: 1 }), getRequesterEmail: () => 'tester' },
    '../utils/editRevision': revision,
    '../utils/http': require('../backend/dist/utils/http.js'),
    './salaryFormula': require('../backend/dist/employees/salaryFormula.js'),
    '../currency': { normalizeCurrencyCode: code => code === 'VND' ? code : null },
  };
  vm.runInNewContext(readFileSync(new URL('../backend/dist/employees/salarySystem.routes.js', import.meta.url), 'utf8'), { exports, require: name => { assert.ok(dependencies[name], name); return dependencies[name]; } });
  exports.createSalarySystemRouter({ requireSalarySystemManager: async () => true });
  return {
    data: () => data,
    failVersion: () => { failVersion = true; },
    async call(method, path, body = {}) {
      const response = { status(code) { this.statusCode = code; return this; }, json(value) { this.body = value; } };
      await routes.get(`${method} ${path}`)({ query: { factoryId: 1 }, body }, response);
      return response.body;
    },
    payload(expectedRevision) { return { expectedRevision, createVersion: true, currencyCode: 'VND', items: structuredClone(data.items), rates: [] }; },
  };
}

test('second salary editor cannot overwrite first editor; reload permits next save', async () => {
  const app = salaryHarness();
  const first = await app.call('get', '/salary-system/revision');
  const saved = await app.call('put', '/salary-system', app.payload(first.editRevision));
  assert.equal(app.data().versions.length, 2);
  await assert.rejects(app.call('put', '/salary-system', app.payload(first.editRevision)), error => error.status === 409);
  assert.equal(app.data().versions.length, 2);
  await app.call('put', '/salary-system', app.payload(saved.editRevision));
  assert.equal(app.data().versions.length, 3);
});

test('simultaneous salary saves commit only one new version', async () => {
  const app = salaryHarness();
  const { editRevision } = await app.call('get', '/salary-system/revision');
  const results = await Promise.allSettled([app.call('put', '/salary-system', app.payload(editRevision)), app.call('put', '/salary-system', app.payload(editRevision))]);
  assert.equal(results.filter(r => r.status === 'fulfilled').length, 1);
  assert.equal(results.find(r => r.status === 'rejected').reason.status, 409);
  assert.equal(app.data().versions.length, 2);
});

test('boundary-only changes invalidate both draft and boundary editors', async () => {
  const app = salaryHarness();
  const first = await app.call('get', '/salary-system/revision');
  const saved = await app.call('put', '/salary-system', app.payload(first.editRevision));
  await app.call('put', '/salary-system/version-boundaries', { expectedRevision: saved.editRevision, boundaries: [{ versionId: 2, startMonth: '2026-09' }] });
  await assert.rejects(app.call('put', '/salary-system', app.payload(saved.editRevision)), error => error.status === 409);
  await assert.rejects(app.call('put', '/salary-system/version-boundaries', { expectedRevision: saved.editRevision, boundaries: [] }), error => error.status === 409);
  assert.equal(app.data().versions[1].effectiveMonth, '2026-09');
});

test('missing revision is rejected and failed version creation rolls back item changes', async () => {
  const app = salaryHarness();
  await assert.rejects(app.call('put', '/salary-system', app.payload()), error => error.status === 409);
  const before = structuredClone(app.data());
  const current = await app.call('get', '/salary-system/revision');
  app.failVersion();
  await assert.rejects(app.call('put', '/salary-system', app.payload(current.editRevision)), /simulated version failure/);
  assert.deepEqual(app.data(), before);
});

test('board revision detects updates, additions and deletions including an empty board', async () => {
  const rows = { plans: [], cards: [] };
  const db = {
    assignmentBoardState: { findUnique: async () => null },
    assignmentPlan: { findMany: async () => rows.plans },
    assignmentCard: { findMany: async () => rows.cards },
  };
  let previous = await revision.assignmentBoardRevision(db, 1);
  for (const change of [() => rows.plans.push({ id: 1, updatedAt: new Date(1000) }), () => { rows.plans[0].updatedAt = new Date(2000); }, () => rows.cards.push({ id: 1, updatedAt: new Date(1000) }), () => rows.plans.pop(), () => rows.cards.pop()]) {
    change();
    const current = await revision.assignmentBoardRevision(db, 1);
    assert.notEqual(current, previous);
    assert.throws(() => revision.assertEditRevision(previous, current), error => error.status === 409);
    previous = current;
  }
});

function revisionHookHarness() {
  const slots = [];
  let index = 0;
  let effects = [];
  const listeners = new Map();
  let poll;
  let request = async () => ({ editRevision: 'first' });
  const react = {
    useState(initial) { const slot = index++; if (!(slot in slots)) slots[slot] = initial; return [slots[slot], value => { slots[slot] = typeof value === 'function' ? value(slots[slot]) : value; }]; },
    useRef(initial) { const slot = index++; return slots[slot] ??= { current: initial }; },
    useCallback(fn) { index++; return fn; },
    useEffect(fn, deps) {
      const slot = index++; const old = slots[slot];
      if (!old || deps.some((value, i) => value !== old.deps[i])) {
        old?.cleanup?.(); effects.push(() => { slots[slot] = { deps, cleanup: fn() }; });
      }
    },
  };
  const browser = { visibilityState: 'visible', addEventListener: (event, fn) => listeners.set(event, fn), removeEventListener: event => listeners.delete(event) };
  const exports = {};
  const ts = require('typescript');
  const source = readFileSync(new URL('../frontend/src/hooks/useEditRevision.js', import.meta.url), 'utf8');
  vm.runInNewContext(ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS } }).outputText, {
    exports, require: name => name === 'react' ? react : { requestJSON: (...args) => request(...args) },
    window: browser, document: browser, setInterval: fn => { poll = fn; return 1; }, clearInterval: () => { poll = null; },
  });
  return {
    render(options = {}) { index = 0; effects = []; const result = exports.default({ scope: 'org1', url: '/revision', ...options }); effects.forEach(fn => fn()); return result; },
    request(fn) { request = fn; },
    async poll() { await poll?.(); },
    browser,
  };
}

test('polling marks the current screen stale without adopting the remote revision', async () => {
  const app = revisionHookHarness();
  app.render().accept('first');
  app.render();
  await new Promise(resolve => setImmediate(resolve));
  app.request(async () => ({ editRevision: 'second' }));
  await app.poll();
  const stale = app.render();
  assert.equal(stale.stale, true);
  assert.equal(stale.revision, 'first');
  stale.accept('second');
  assert.equal(app.render().stale, false);
});

test('poll failures, pending saves and a previous organization response cannot invalidate the new screen', async () => {
  const app = revisionHookHarness();
  app.render().accept('first');
  app.render({ busy: true });
  app.request(async () => { throw new Error('offline'); });
  await app.poll();
  assert.equal(app.render().stale, false);
  await app.poll();
  assert.equal(app.render().stale, false);
  const previous = app.render();
  const next = app.render({ scope: 'org2' });
  assert.equal(next.revision, null);
  previous.accept('old-response');
  assert.equal(app.render({ scope: 'org2' }).revision, null);
});
