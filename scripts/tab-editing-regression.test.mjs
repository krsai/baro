import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

test('tab editing aggregates all guards and clears only after every form is saved', () => {
  const source = fs.readFileSync(new URL('../frontend/src/context/AppContext.jsx', import.meta.url), 'utf8');
  let tabs = [{ id: '/order/1' }, { id: '/style/2' }];
  const context = vm.createContext({ useCallback: fn => fn, unsavedGuardsRef: { current: new Map() }, setOpenTabs: fn => { tabs = fn(tabs); } });
  const section = source.slice(source.indexOf('  const syncEditingTabs'), source.indexOf('  const hasUnsavedChanges'));
  vm.runInContext(section + '\nglobalThis.register = setUnsavedChangesGuard; globalThis.clear = clearUnsavedChangesGuard;', context);
  context.register('order', { path: '/order/1', isDirty: true });
  context.register('style', { path: '/style/2', isDirty: true });
  context.register('style-dialog', { path: '/style/2', isDirty: true });
  assert.ok(tabs.every(tab => tab.isEditing));
  context.clear('style');
  assert.equal(tabs[1].isEditing, true);
  context.register('style-dialog', { path: '/style/2', isDirty: false });
  assert.equal(tabs[1].isEditing, false);
  assert.equal(tabs[0].isEditing, true);
  context.clear('order');
  assert.ok(tabs.every(tab => !tab.isEditing));
});
