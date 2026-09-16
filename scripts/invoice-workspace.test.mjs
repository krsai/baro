import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import vm from 'node:vm';
const require = createRequire(import.meta.url);
const ts = require('../backend/node_modules/typescript');
const flush = () => new Promise(resolve => setImmediate(resolve));

function harness() {
  let index = 0;
  let effects = [];
  const slots = [];
  const timers = new Set();
  const requests = [];
  const react = {
    createElement: (type, props, ...children) => ({ type, props: { ...props, children } }), Fragment: 'Fragment',
    useState(initial) {
      const slot = index++;
      if (!(slot in slots)) slots[slot] = initial;
      return [slots[slot], value => { slots[slot] = typeof value === 'function' ? value(slots[slot]) : value; }];
    },
    useEffect(run, deps) {
      const slot = index++;
      const previous = slots[slot];
      if (!previous || deps.some((value, i) => value !== previous.deps[i])) {
        previous?.cleanup?.();
        effects.push(() => { slots[slot] = { deps, cleanup: run() }; });
      }
    },
  };
  const exports = {};
  const component = readFileSync(new URL('../frontend/src/pages/App/invoice/InvoiceWorkspace.jsx', import.meta.url), 'utf8');
  const messages = readFileSync(new URL('../frontend/src/constants/invoiceMessages.js', import.meta.url), 'utf8');
  const messageExports = {};
  vm.runInNewContext(ts.transpileModule(messages, { compilerOptions: { module: ts.ModuleKind.CommonJS } }).outputText, { exports: messageExports });
  const dependencies = {
    react: { ...react, default: react },
    '@mui/material': Object.fromEntries(['Alert', 'Box', 'Button', 'CircularProgress', 'Stack', 'Table', 'TableBody', 'TableCell', 'TableHead', 'TableRow', 'TextField', 'Typography'].map(name => [name, name])),
    '../../../components/AppPageContainer': { default: 'Container' },
    '../../../components/SearchableSelect': { default: 'CustomerSelect' },
    '../../../context/AuthContext': { useAuth: () => ({ activeOrgId: 7 }) },
    '../../../context/LanguageContext': { useLanguage: () => ({ languageCode: 'ko' }) },
    '../../../utils/apiClient': {
      buildQueryString: value => `?${new URLSearchParams(value)}`,
      requestJSON: url => new Promise((resolve, reject) => requests.push({ url, resolve, reject })),
    },
    '../../../constants/invoiceMessages': messageExports,
    '../order/InvoiceDraftDialog': { default: 'DraftDialog' },
    '../../../hooks/useWorkspaceRefreshOnEvent': { default: () => {} },
  };
  vm.runInNewContext(ts.transpileModule(`${component}\nexport { InvoiceCustomerWorkspace, InvoiceMenuWorkspace };`, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.React, target: ts.ScriptTarget.ES2022 },
  }).outputText, { exports, require: name => { assert.ok(dependencies[name], name); return dependencies[name]; },
    URLSearchParams, setTimeout: run => { timers.add(run); return run; }, clearTimeout: run => timers.delete(run) });
  const all = node => !node || typeof node !== 'object' ? [] : Array.isArray(node) ? node.flatMap(all) : [node, ...all(node.props?.children)];
  return {
    requests,
    render() { index = 0; effects = []; const tree = exports.InvoiceCustomerWorkspace({ activeOrgId: 7 }); effects.forEach(run => run()); return tree; },
    find: (tree, type) => all(tree).filter(node => node.type === type),
    tick() { for (const run of [...timers]) { timers.delete(run); run(); } },
    root: () => exports.default(),
    menu: () => { index = 0; return exports.InvoiceMenuWorkspace({ activeOrgId: 7 }); },
  };
}

test('invoice menu opens on issued history and enters a separate creation screen only on request', () => {
  const app = harness();
  let tree = app.menu();
  assert.equal(app.find(tree, 'CustomerSelect').length, 0);
  assert.equal(app.requests.length, 0);
  assert.equal(app.find(tree, 'Table')[0].props['aria-label'], '발행된 청구서');
  const create = app.find(tree, 'Button').find(node => node.props.children.includes('청구서 작성'));
  create.props.onClick();
  tree = app.menu();
  assert.equal(typeof tree.type, 'function');
  tree.props.onBack();
  assert.equal(app.find(app.menu(), 'Table').length, 1);
});

test('customer selection is required before listing orders; draft receives the selected customer', async () => {
  const app = harness();
  let tree = app.render();
  app.tick();
  assert.equal(app.requests.length, 1);
  assert.match(app.requests[0].url, /\/invoices\/customers/);
  assert.equal(app.find(tree, 'Table').length, 0);
  const customer = { id: 8, name: 'Buyer' };
  app.requests[0].resolve({ rows: [customer] }); await flush();
  tree = app.render();
  app.find(tree, 'CustomerSelect')[0].props.onChange(null, customer);
  app.render(); app.tick();
  assert.match(app.requests[1].url, /buyerOrgId=8/);
  app.requests[1].resolve({ rows: [{ orderId: 'o', orderNumber: 'PO', totalQuantity: 10, buyerOrg: customer }], hasMore: false });
  await flush(); tree = app.render();
  const create = app.find(tree, 'Button').find(node => node.props.children.includes('청구 내역 작성'));
  create.props.onClick(); tree = app.render();
  const dialog = app.find(tree, 'DraftDialog')[0];
  assert.equal(dialog.props.orderId, 'o');
  assert.equal(dialog.props.buyerOrgId, 8);
  assert.equal(dialog.props.open, true);
});

test('changing or clearing customer discards old orders and ignores late responses', async () => {
  const app = harness();
  let tree = app.render();
  app.requests[0].resolve({ rows: [{ id: 8, name: 'A' }, { id: 9, name: 'B' }] }); await flush();
  tree = app.render();
  app.find(tree, 'CustomerSelect')[0].props.onChange(null, { id: 8, name: 'A' });
  app.render(); app.tick();
  tree = app.render();
  app.find(tree, 'CustomerSelect')[0].props.onChange(null, { id: 9, name: 'B' });
  app.render(); app.tick();
  app.requests[1].resolve({ rows: [{ orderId: 'wrong', orderNumber: 'Wrong customer' }], hasMore: false }); await flush();
  tree = app.render();
  assert.equal(app.find(tree, 'Button').some(node => node.props.children.includes('청구 내역 작성')), false);
  assert.match(app.requests[2].url, /buyerOrgId=9/);
  app.find(tree, 'CustomerSelect')[0].props.onChange(null, null);
  app.render(); app.tick();
  app.requests[2].resolve({ rows: [{ orderId: 'late' }], hasMore: false }); await flush();
  tree = app.render();
  assert.equal(app.find(tree, 'Table').length, 0);
  assert.equal(app.requests.length, 3);
  assert.equal(app.root().props.key, 7, 'organization change remounts all customer/order/draft state');
});
