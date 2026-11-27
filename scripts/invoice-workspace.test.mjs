import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import vm from 'node:vm';
const require = createRequire(import.meta.url);
const ts = require('../backend/node_modules/typescript');
const flush = () => new Promise(resolve => setImmediate(resolve));

function harness(search = '', params = {}) {
  let index = 0;
  let effects = [];
  const slots = [];
  const timers = new Set();
  const requests = [];
  const navigations = [];
  const react = {
    useMemo: run=>run(), useRef: initial=>({current:initial}),
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
    '../../../components/AppDialog': {default:'Dialog'},
    '../../../components/AppNotice': {default:'Alert'},
    '../../../components/SearchPanel': {default:'SearchPanel'},
    '../../../components/SearchInput': {default:'SearchInput'},
    '../../../utils/invoiceStyleRows.mjs': {invoiceNumber: String},
    '../../../components/ManagementTargetSettingsButton': {default:'ManagementTargetSettingsButton'},
    '../../../components/InvoicePartyPicker': {default:'CustomerSelect'},
    './GeneralInvoiceEditor': {default:'GeneralInvoiceEditor'},
    '../../../constants/generalInvoice': {generalInvoiceText:{en:{},ko:{}}},
    react: { ...react, default: react },
    '@mui/material': Object.fromEntries(['Alert', 'Box', 'Button', 'Checkbox', 'CircularProgress', 'Paper', 'Stack', 'Table', 'TableBody', 'TableCell', 'TableHead', 'TableRow', 'TextField', 'Typography','DialogTitle','DialogContent','DialogActions','MenuItem'].map(name => [name, name])),
    '../../../components/AppPageContainer': { default: 'Container' },
    '../../../components/SearchableSelect': { default: 'CustomerSelect' },
    '../../../context/AuthContext': { useAuth: () => ({ activeOrgId: 7 }) },
    '../../../context/AppContext': { useAppActions: () => ({ navigateToPath: path => navigations.push(path) }) },
    '../../../context/LanguageContext': { useLanguage: () => ({ languageCode: 'ko' }) },
    '../../../utils/apiClient': {
      buildQueryString: value => `?${new URLSearchParams(value)}`,
      requestJSON: url => new Promise((resolve, reject) => requests.push({ url, resolve, reject })),
    },
    '../../../constants/invoiceMessages': messageExports,
    './InvoiceEditor': { default: 'InvoiceEditor' },
    'react-router-dom': {useLocation:()=>({search}),useParams:()=>params},
    '../../../constants/invoiceUi':{invoiceUi:{en:{},ko:{continue:'continue'}}},
    '../../../components/PageContentStack':{default:'PageContentStack'},
    './InvoiceList': { default: 'InvoiceList' },
    '../../../hooks/useWorkspaceRefreshOnEvent': { default: () => {} },
  };
  vm.runInNewContext(ts.transpileModule(`${component}\nexport { InvoiceCustomerWorkspace, InvoiceMenuWorkspace };`, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.React, target: ts.ScriptTarget.ES2022 },
  }).outputText, { exports, require: name => { assert.ok(dependencies[name], name); return dependencies[name]; },
    URLSearchParams, setTimeout: run => { timers.add(run); return run; }, clearTimeout: run => timers.delete(run) });
  const all = node => !node || typeof node !== 'object' ? [] : Array.isArray(node) ? node.flatMap(all) : [node, ...all(node.props?.children)];
  return {
    requests,
    navigations,
    render() { index = 0; effects = []; const tree = exports.InvoiceCustomerWorkspace({ activeOrgId: 7 }); effects.forEach(run => run()); return tree; },
    controls: tree=>tree.props.renderSelection({requestChange:run=>run(),disabled:false}),
    find: (tree, type) => all(tree).filter(node => node.type === type),
    tick() { for (const run of [...timers]) { timers.delete(run); run(); } },
    root: () => exports.default(),
    menu: (view = 'list') => { index = 0; return exports.InvoiceMenuWorkspace({ activeOrgId: 7, view }); },
  };
}

test('invoice menu opens on issued history and enters a separate creation screen only on request', () => {
  const app = harness();
  let tree = app.menu();
  assert.equal(app.find(tree, 'CustomerSelect').length, 0);
  assert.equal(app.requests.length, 0);
  assert.equal(app.find(tree, 'InvoiceList').length, 1);
  const create = app.find(tree.props.titleActions, 'Button')[0];
  create.props.onClick();
  assert.equal(app.navigations.at(-1), '/invoices/new');
  tree = app.menu('editor');
  assert.equal(typeof tree.type, 'function');
  tree.props.onBack();
  assert.equal(app.navigations.at(-1), '/invoices');
  assert.equal(app.find(app.menu(), 'Table').length, 0);
});


const customer = (app, tree, value) => app.find(app.controls(tree),'CustomerSelect')[0].props.onChange(value);
test('new invoice menu creates a general invoice without order selection',async()=>{
 const app=harness();let tree=app.render();assert.equal(tree.type,'GeneralInvoiceEditor');
 assert.match(app.requests[0].url,/documentKind=GENERAL/);
 app.requests[0].resolve({rows:[{id:8,name:'A'}]});await flush();tree=app.render();
 customer(app,tree,{id:8,name:'A'});tree=app.render();assert.equal(tree.props.buyerOrgId,8);
 assert.equal(app.requests.length,1);assert.equal(app.find(app.controls(tree),'Dialog').length,0);
});
test('order route binds a single actual order and bypasses customer and order lists',()=>{
 const app=harness('',{sourceOrderId:'actual-order/1'});const tree=app.menu('editor');
 assert.equal(tree.type,'InvoiceEditor');assert.equal(tree.props.orderId,'actual-order/1');
 assert.equal(tree.props.orgId,7);assert.equal(tree.props.renderSelection,undefined);assert.equal(app.requests.length,0);
 tree.props.onIssued();assert.equal(app.navigations.at(-1),'/invoices');
});
test('historical order revision restores through its draft, preserving multiple-order support',async()=>{
 const app=harness('?revision=old-draft');let tree=app.render();assert.equal(tree.type,'Container');
 assert.match(app.requests[0].url,/drafts\/old-draft/);assert.equal(app.requests.length,1);
 app.requests[0].resolve({content:{documentKind:'ORDER'}});await flush();tree=app.render();
 assert.equal(tree.type,'InvoiceEditor');assert.equal(tree.props.draftId,'old-draft');assert.equal(tree.props.renderSelection,null);
});
