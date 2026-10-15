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

test('background refresh marks completion; foreground refresh clears the notice', async () => {
  const source = fs.readFileSync(new URL('../frontend/src/hooks/useWorkspaceRefreshOnEvent.js', import.meta.url), 'utf8');
  const section = source.slice(source.indexOf('    const runRefresh = async'), source.indexOf('    const unsubscribe'));
  for (const visible of [false, true]) {
    const events = [];
    const context = vm.createContext({
      cancelled: false,
      pendingRefreshRef: { current: true }, isActiveRef: { current: true },
      isBlockedRef: { current: false }, refreshInFlightRef: { current: false },
      blockedNoticeShownRef: { current: false }, isTabVisibleRef: { current: visible },
      tabPathRef: { current: '/order' }, onRefreshRef: { current: async () => events.push('loaded') },
      clearTabChanged: path => events.push(`clear:${path}`), markTabChanged: path => events.push(`mark:${path}`),
    });
    await vm.runInContext(section + '\nrunRefresh();', context);
    assert.deepEqual(events, ['loaded', `${visible ? 'clear' : 'mark'}:/order`]);
  }
});

test('tab states use compact separate indicators without recoloring the title', () => {
  const layout = fs.readFileSync(new URL('../frontend/src/layouts/MainLayout.jsx', import.meta.url), 'utf8');
  const indicators = fs.readFileSync(new URL('../frontend/src/components/TabStateIndicators.jsx', import.meta.url), 'utf8');
  assert.match(layout, /<TabStateIndicators editing=\{tab.isEditing\} refreshed=\{tab.hasExternalChanges\}/);
  assert.doesNotMatch(layout, /\.\.\.\(tab.hasExternalChanges/);
  assert.doesNotMatch(layout, /'수정 중'|'Editing'|'Đang sửa'/);
  assert.match(indicators, /●/); assert.match(indicators, /↻/);
  assert.match(indicators, /저장하지 않은 변경사항/);
  assert.match(indicators, /자료가 갱신되었습니다/);
});
