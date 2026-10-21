import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

test('new and replacement detail tabs stay beside their list across navigation paths', () => {
  const source=fs.readFileSync('frontend/src/context/AppContext.jsx','utf8');
  let tabs=[{id:'/dashboard'},{id:'/outsourcing-record'},{id:'/invoices'},{id:'/invoices/new'}];
  const context=vm.createContext({useCallback:fn=>fn,unsavedGuardsRef:{current:new Map()},setOpenTabs:fn=>{tabs=fn(tabs);}});
  vm.runInContext(source.slice(source.indexOf('  const openTab ='),source.indexOf('  const markTabChanged ='))+'\nglobalThis.open=openTab;',context);
  const ids=()=>Array.from(tabs,tab=>tab.id);
  context.open({id:'/outsourcing-record/new'});
  assert.deepEqual(ids(),['/dashboard','/outsourcing-record','/outsourcing-record/new','/invoices','/invoices/new']);
  context.open({id:'/outsourcing-record/edit/request/6'},{insertAfterId:'/invoices/new'});
  assert.deepEqual(ids(),['/dashboard','/outsourcing-record','/outsourcing-record/edit/request/6','/invoices','/invoices/new']);
  context.open({id:'/invoices/new',label:'Create invoice'},{updateOnly:true});
  assert.deepEqual(ids(),['/dashboard','/outsourcing-record','/outsourcing-record/edit/request/6','/invoices','/invoices/new']);
  context.open({id:'/style/5'},{insertAfterId:'/dashboard'});
  assert.deepEqual(ids().slice(0,3),['/dashboard','/style/5','/outsourcing-record']);
  // A similar prefix is not a parent, and the closest open ancestor wins.
  tabs=[{id:'/order'},{id:'/orders'},{id:'/orders/8'},{id:'/dashboard'}];
  context.open({id:'/orders/8/history?view=all'});
  assert.deepEqual(ids(),['/order','/orders','/orders/8','/orders/8/history?view=all','/dashboard']);
});

test('expense forms share one slot even on automatic route opens and stale relabeling cannot resurrect a closed detail',()=>{
  const source=fs.readFileSync('frontend/src/context/AppContext.jsx','utf8');
  let tabs=[{id:'/outsourcing-record'},{id:'/outsourcing-record/edit/legacy/1'},{id:'/outsourcing-record/edit/request/2'},{id:'/style/4'}];
  const guards=new Map([['draft',{path:'/outsourcing-record/edit/request/3',isDirty:true}]]);
  const context=vm.createContext({useCallback:fn=>fn,unsavedGuardsRef:{current:guards},setOpenTabs:fn=>{tabs=fn(tabs);}});
  vm.runInContext(source.slice(source.indexOf('  const openTab ='),source.indexOf('  const markTabChanged ='))+'\nglobalThis.open=openTab;',context);
  context.open({id:'/outsourcing-record/edit/request/3',label:'Detail'});
  assert.deepEqual(Array.from(tabs,tab=>tab.id),['/outsourcing-record','/outsourcing-record/edit/request/3','/style/4']);
  context.open({id:'/outsourcing-record/edit/legacy/1',label:'Old relabel'},{updateOnly:true});
  assert.equal(tabs.length,3);assert.equal(tabs[1].id,'/outsourcing-record/edit/request/3');
  context.open({id:'/outsourcing-record/edit/request/3',label:'Updated label'},{replacePrefix:'/outsourcing-record/'});
  assert.equal(guards.has('draft'),true);assert.equal(tabs[1].isEditing,true);
  context.open({id:'/outsourcing-record/new'});
  assert.equal(tabs.filter(tab=>tab.id.startsWith('/outsourcing-record/')).length,1);
  assert.equal(tabs[1].id,'/outsourcing-record/new');assert.equal(guards.has('draft'),false);
});

test('opening another expense from the list confirms a hidden dirty detail and cancellation preserves it',()=>{
  const source=fs.readFileSync('frontend/src/layouts/MainLayout.jsx','utf8');
  const start=source.indexOf('      if (!skipUnsavedChangesCheck) {',source.indexOf('const handleNavigation ='));
  const block=source.slice(start,source.indexOf('      const label = resolveTabLabel',start));
  const calls=[];
  const context=vm.createContext({skipUnsavedChangesCheck:false,closeTabId:null,isSamePathNavigation:false,currentPath:'/outsourcing-record',nextPathname:'/outsourcing-record/edit/request/2',openOptions:{replacePrefix:'/outsourcing-record/'},openTabs:[{id:'/outsourcing-record'},{id:'/outsourcing-record/edit/request/1'}],confirmDiscardUnsavedChanges:({path})=>{calls.push(path);return false;}});
  assert.equal(vm.runInContext('(function(){'+block+'return "proceed";})()',context),undefined);
  assert.deepEqual(calls,['/outsourcing-record/edit/request/1']);
});

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
