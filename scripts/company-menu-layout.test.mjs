import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import vm from 'node:vm';
import { organizeCompanyMenu } from '../frontend/src/utils/companyMenuLayout.mjs';
import { organizeSystemMenu, findMenuGroupForPath } from '../frontend/src/utils/systemMenuLayout.mjs';

const require = createRequire(import.meta.url);
const ts = require('../backend/node_modules/typescript');
const layout = readFileSync('frontend/src/layouts/MainLayout.jsx', 'utf8');
const start = layout.indexOf('return applyPageMenuNames([');
const end = layout.indexOf('\n  }, [', start);
const body = layout.slice(start, end);
const code = ts.transpileModule(`function blueprint(){${body}}`, {
  compilerOptions: { jsx: ts.JsxEmit.React, target: ts.ScriptTarget.ES2022 },
}).outputText;
function source(system) {
  const context = {
    React: { createElement: () => null }, languageCode: 'ko',
    isSystemAdminProfile: system, isSystemProfile: system,activeProfile:{orgType:system?'SYSTEM':'MANUFACTURER'},pendingApprovalCount:1,
    pendingEmployeeCount: 1, missingSalesPriceCustomerCount: 1, pendingOnboardingCount: 1,
    getUiMessage: key => key, applyPageMenuNames: items => items,
    MENU_GROUP_KEYS: new Proxy({}, { get: (_, key) => key }),
  };
  for (const name of body.matchAll(/<([A-Z]\w*)/g)) context[name[1]] = name[1];
  for (const name of body.matchAll(/isOpen:\s*(\w+)/g)) context[name[1]] = false;
  return vm.runInNewContext(`${code}; blueprint()`, context);
}
const flatten = items => items.flatMap(item => item.isParent ? flatten(item.children || []) : [item]);
test('sewing brands expose only their three business menus without manufacturer or accounting entries',()=>{
 const menu=organizeCompanyMenu(source(false),key=>key,'BRAND');
 assert.deepEqual(flatten(menu).map(row=>row.path),['/style','/order','/customer-production-report']);
});
test('service transport starts in the sales group beside customer and partner management',()=>{
 const menu=organizeCompanyMenu(source(false),key=>key,'SERVICE');
 const group=menu.find(item=>item.menuGroupKey==='ORDER');
 assert.equal(group.label,'menu.transportWorkflow');
 assert.deepEqual(group.children.slice(0,2).map(row=>row.path),['/shipping','/business-partner']);
 assert.equal(group.children[0].label,'menu.transportList');
 assert.equal(group.children[1].label,'menu.customerPartners');
 assert.equal(flatten(menu).filter(row=>row.path==='/shipping').length,1);
 assert.equal(findMenuGroupForPath(menu,'/shipping'),'ORDER');
 assert.equal(group.children[1].accessChildren.length,4);
});
for (const system of [false, true]) {
  test(`actual canonical menus survive regrouping exactly once (SYSTEM=${system})`, () => {
    const original = source(system);
    const before = JSON.stringify(original);
    const menu = organizeCompanyMenu(original, key => key);
    const leaves = flatten(menu);
    assert.equal(leaves.length, flatten(original).length);
    assert.equal(new Set(leaves.map(node => node.path)).size, leaves.length);
    for (const node of flatten(original)) assert.equal(leaves.find(item => item.path === node.path), node);
    assert.equal(JSON.stringify(original), before);
    if (system) {
      const systemLeaves = flatten(organizeSystemMenu(menu));
      for (const leaf of leaves) assert.equal(systemLeaves.find(item => item.path === leaf.path), leaf);
    }
  });
}
test('company groups, direct entry, partner scopes and notifications follow the new workflow', () => {
  const menu = organizeCompanyMenu(source(false), key => key);
  assert.deepEqual(menu.filter(item => item.isParent).map(item => item.menuGroupKey),
    ['ORDER', 'RECORDS', 'INVENTORY', 'ADMIN', 'ACCOUNTING', 'OPERATIONS', 'SETTINGS', 'SYSTEM']);
  for (const [path, group] of [
    ['/account-overview', 'OPERATIONS'], ['/bank-ledger/new', 'ACCOUNTING'], ['/approval-settings', 'SETTINGS'],
    ['/attendance', 'ADMIN'], ['/payroll', 'ACCOUNTING'], ['/payroll/2026-11', 'ACCOUNTING'], ['/employee-system', 'SETTINGS'],
    ['/salary-system', 'SETTINGS'],
    ['/business', 'SETTINGS'], ['/inventory/stock', 'INVENTORY'],
    ['/business-partner', 'ORDER'], ['/customer/4', 'ORDER'],
    ['/outsourcing-partner/4', 'ORDER'], ['/system-setting/access-policy', 'SETTINGS'],
  ]) assert.equal(findMenuGroupForPath(menu, path), group);
  assert.deepEqual(menu.find(item => item.menuGroupKey === 'ACCOUNTING').children.map(item => item.path), ['/invoices', '/outsourcing-record', '/bank-ledger', '/payroll']);
  const partner = menu.find(item => item.menuGroupKey === 'ORDER').children[0];
  assert.equal(partner.path, '/business-partner');
  assert.equal(partner.notificationActive, true);
  assert.equal(partner.accessChildren.length, 4);
  assert.match(layout, /const currentMenuGroup = findMenuGroupForPath\(menuItems, currentPath/);
});
