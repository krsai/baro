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
    react: { ...react, default: react },
    '@mui/material': Object.fromEntries(['Alert', 'Box', 'Button', 'Checkbox', 'CircularProgress', 'Paper', 'Stack', 'Table', 'TableBody', 'TableCell', 'TableHead', 'TableRow', 'TextField', 'Typography'].map(name => [name, name])),
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
    'react-router-dom': {useLocation:()=>({search:''})},
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
  const create = [tree.props.titleActions,...app.find(tree, 'Button')].find(node => node.props.children?.includes?.('청구서 작성'));
  create.props.onClick();
  assert.equal(app.navigations.at(-1), '/invoices/new');
  tree = app.menu('editor');
  assert.equal(typeof tree.type, 'function');
  tree.props.onBack();
  assert.equal(app.navigations.at(-1), '/invoices');
  assert.equal(app.find(app.menu(), 'Table').length, 0);
});

test('one page always contains the editor and customer/order selectors without a continue step',async()=>{
 const app=harness();let tree=app.render();assert.equal(tree.type,'InvoiceEditor');assert.deepEqual([...tree.props.orderIds],[]);
 app.requests[0].resolve({rows:[{id:8,name:'A'}]});await flush();tree=app.render();
 const controls=app.controls(tree),selects=app.find(controls,'CustomerSelect');assert.equal(selects.length,2);assert.equal(selects[1].props.multiple,true);assert.equal(selects[1].props.disabled,true);
 selects[0].props.onChange(null,{id:8,name:'A'});app.render();app.tick();assert.match(app.requests[1].url,/buyerOrgId=8/);
 app.requests[1].resolve({rows:[{orderId:'first',orderNumber:'PO1'}],hasMore:false});await flush();tree=app.render();
 app.find(app.controls(tree),'CustomerSelect')[1].props.onChange(null,[{orderId:'first',orderNumber:'PO1'}]);tree=app.render();
 assert.equal(tree.type,'InvoiceEditor');assert.deepEqual([...tree.props.orderIds],['first']);assert.equal(tree.props.buyerOrgId,8);
});
test('customer changes clear selections and ignore stale order responses',async()=>{
 const app=harness();let tree=app.render();app.requests[0].resolve({rows:[]});await flush();tree=app.render();
 app.find(app.controls(tree),'CustomerSelect')[0].props.onChange(null,{id:8,name:'A'});app.render();app.tick();
 tree=app.render();app.find(app.controls(tree),'CustomerSelect')[0].props.onChange(null,{id:9,name:'B'});app.render();app.tick();
 app.requests[1].resolve({rows:[{orderId:'wrong'}],hasMore:false});await flush();tree=app.render();
 assert.deepEqual([...app.find(app.controls(tree),'CustomerSelect')[1].props.options],[]);assert.match(app.requests[2].url,/buyerOrgId=9/);
 app.requests[2].resolve({rows:[{orderId:'correct',orderNumber:'PO-B'}],hasMore:false});await flush();tree=app.render();
 assert.equal(app.find(app.controls(tree),'CustomerSelect')[1].props.options[0].orderId,'correct');
 app.find(app.controls(tree),'CustomerSelect')[0].props.onChange(null,null);tree=app.render();assert.deepEqual([...tree.props.orderIds],[]);assert.equal(app.find(app.controls(tree),'CustomerSelect')[1].props.disabled,true);
});
test('searching more orders keeps already selected order FKs on the same form',async()=>{
 const app=harness();let tree=app.render();app.requests[0].resolve({rows:[]});await flush();tree=app.render();
 app.find(app.controls(tree),'CustomerSelect')[0].props.onChange(null,{id:8,name:'A'});app.render();app.tick();
 const first={orderId:'first',orderNumber:'PO1'};app.requests[1].resolve({rows:[first],hasMore:true});await flush();tree=app.render();
 app.find(app.controls(tree),'CustomerSelect')[1].props.onChange(null,[first]);tree=app.render();
 app.find(app.controls(tree),'CustomerSelect')[1].props.onInputChange(null,'PO2','input');app.render();app.tick();
 assert.match(app.requests[2].url,/search=PO2/);app.requests[2].resolve({rows:[{orderId:'second',orderNumber:'PO2'}],hasMore:false});await flush();tree=app.render();
 assert.deepEqual([...tree.props.orderIds],['first']);const orderSelect=app.find(app.controls(tree),'CustomerSelect')[1];
 assert.equal(orderSelect.props.value[0].orderId,'first');assert.equal(orderSelect.props.options.length,2);
});
