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
    isSystemAdminProfile: system, isSystemProfile: system,
    pendingEmployeeCount: 1, missingSalesPriceCustomerCount: 1, pendingOnboardingCount: 1,
    getUiMessage: key => key, applyPageMenuNames: items => items,
    MENU_GROUP_KEYS: new Proxy({}, { get: (_, key) => key }),
  };
  for (const name of body.matchAll(/<([A-Z]\w*)/g)) context[name[1]] = name[1];
  for (const name of body.matchAll(/isOpen:\s*(\w+)/g)) context[name[1]] = false;
  return vm.runInNewContext(`${code}; blueprint()`, context);
}
const flatten = items => items.flatMap(item => item.isParent ? flatten(item.children || []) : [item]);
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
    ['/bank-ledger/new', 'ACCOUNTING'], ['/approval-settings', 'SETTINGS'],
    ['/attendance', 'ADMIN'], ['/payroll', 'ADMIN'], ['/employee-system', 'SETTINGS'],
    ['/salary-system', 'SETTINGS'], ['/production-analysis', 'RECORDS'],
    ['/business', 'SETTINGS'], ['/inventory/stock', 'INVENTORY'],
    ['/business-partner', 'ORDER'], ['/customer/4', 'ORDER'],
    ['/outsourcing-partner/4', 'ORDER'], ['/system-setting/access-policy', 'SETTINGS'],
  ]) assert.equal(findMenuGroupForPath(menu, path), group);
  const partner = menu.find(item => item.menuGroupKey === 'ORDER').children[0];
  assert.equal(partner.path, '/business-partner');
  assert.equal(partner.notificationActive, true);
  assert.equal(partner.accessChildren.length, 4);
  assert.match(layout, /const currentMenuGroup = findMenuGroupForPath\(menuItems, currentPath/);
});
