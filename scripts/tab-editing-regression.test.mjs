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

test('opening another expense from the list confirms a hidden dirty detail and cancellation preserves it',async()=>{
  const source=fs.readFileSync('frontend/src/layouts/MainLayout.jsx','utf8');
  const start=source.indexOf('      if (!skipUnsavedChangesCheck) {',source.indexOf('const handleNavigation ='));
  const block=source.slice(start,source.indexOf('      const label = resolveTabLabel',start));
  const calls=[];
  const context=vm.createContext({skipUnsavedChangesCheck:false,closeTabId:null,isSamePathNavigation:false,currentPath:'/outsourcing-record',nextPathname:'/outsourcing-record/edit/request/2',openOptions:{replacePrefix:'/outsourcing-record/'},openTabs:[{id:'/outsourcing-record'},{id:'/outsourcing-record/edit/request/1'}],confirmDiscardUnsavedChanges:({path})=>{calls.push(path);return false;}});
  assert.equal(await vm.runInContext('(async function(){'+block+'return "proceed";})()',context),undefined);
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


function refreshHarness(initial={}) {
 const slots=[],effects=[],events=[],listeners=new Set();let index=0,options={orgId:1,topics:['styles'],isActive:true,isBlocked:false,onRefresh:async()=>events.push('loaded'),...initial};
 const actions={markTabChanged:path=>events.push('mark:'+path),clearTabChanged:path=>events.push('clear:'+path)};
 const useRef=value=>{const slot=index++;return slots[slot]??= {current:value};};
 const useEffect=(run,deps)=>{const slot=index++,old=slots[slot];if(!old||!deps||deps.some((v,i)=>!Object.is(v,old.deps[i]))){effects.push(()=>{old?.cleanup?.();slots[slot]={deps,cleanup:run()};});}};
 const useCallback=(run,deps)=>{const slot=index++,old=slots[slot];if(!old||deps.some((v,i)=>!Object.is(v,old.deps[i])))slots[slot]={deps,value:run};return slots[slot].value;};
 const source=fs.readFileSync('frontend/src/hooks/useWorkspaceRefreshOnEvent.js','utf8').replace(/^import .*;\r?\n/gm,'').replace('export default function','function');
 const hook=new Function('useRef','useEffect','useCallback','useLocation','useAppActions','subscribeWorkspaceDataChanged','document','window',source+';return useWorkspaceRefreshOnEvent;')(useRef,useEffect,useCallback,()=>({pathname:'/style'}),()=>actions,listener=>{listeners.add(listener);return()=>listeners.delete(listener);},{visibilityState:'visible',addEventListener(){},removeEventListener(){}},{addEventListener(){},removeEventListener(){}});
 const render=patch=>{options={...options,...patch};index=0;hook(options);while(effects.length)effects.shift()();};render();
 return {events,render,emit:()=>{for(const listener of listeners)listener({orgId:1,topics:['styles']});},flush:()=>new Promise(resolve=>setImmediate(resolve))};
}
test('background refresh stays queued; foreground refresh clears the notice',async()=>{
 const h=refreshHarness({isActive:false});h.emit();await h.flush();assert.deepEqual(h.events,['mark:/style']);
 h.render({isActive:true});await h.flush();assert.deepEqual(h.events,['mark:/style','loaded','clear:/style']);
});

test('tab states use compact separate indicators without recoloring the title', () => {
  const layout = fs.readFileSync(new URL('../frontend/src/layouts/MainLayout.jsx', import.meta.url), 'utf8');
  const indicators = fs.readFileSync(new URL('../frontend/src/components/TabStateIndicators.jsx', import.meta.url), 'utf8');
  assert.match(layout, /<TabStateIndicators editing=\{tab.isEditing\} refreshed=\{tab.hasExternalChanges\}/);
  assert.doesNotMatch(layout, /\.\.\.\(tab.hasExternalChanges/);
  assert.doesNotMatch(layout, /'수정 중'|'Editing'|'Đang sửa'/);
  assert.doesNotMatch(indicators, /●|↻/);
  assert.match(indicators, /borderRadius:'50%'/);
  assert.match(indicators, /RefreshOutlinedIcon/);
  assert.match(indicators, /CircularProgress/);
  assert.match(indicators, /저장하지 않은 변경\s?사항/);
  assert.match(indicators, /변경된 자료가 있습니다/);
});

test('one successful consumer cannot clear another consumer pending or failed refresh',()=>{
 const source=fs.readFileSync('frontend/src/context/AppContext.jsx','utf8');let tabs=[{id:'/style'}];
 const context=vm.createContext({useCallback:fn=>fn,externalChangeSourcesRef:{current:new Map()},setOpenTabs:fn=>{tabs=fn(tabs);}});
 vm.runInContext(source.slice(source.indexOf('  const markTabChanged ='),source.indexOf('  const closeTab ='))+';globalThis.mark=markTabChanged;globalThis.clear=clearTabChanged;',context);
 const first=Symbol('orders'),second=Symbol('holidays');context.mark('/style',first);context.mark('/style',second);
 context.clear('/style',first);assert.equal(tabs[0].hasExternalChanges,true);context.clear('/style',first);assert.equal(tabs[0].hasExternalChanges,true);
 context.clear('/style',second);assert.equal(tabs[0].hasExternalChanges,undefined);assert.equal(context.externalChangeSourcesRef.current.size,0);
});


test('failed refresh stays pending without a request loop and succeeds on the next refresh event',async()=>{
 for(const failure of ['throw','false']){
  let calls=0;const h=refreshHarness({onRefresh:async()=>{calls++;if(failure==='throw')throw Error('offline');return false;}});
  h.emit();await h.flush();assert.equal(calls,1);assert.deepEqual(h.events,['mark:/style','mark:/style']);await h.flush();assert.equal(calls,1);
  h.render({isBlocked:true});h.render({isBlocked:false});await h.flush();assert.equal(calls,1,'a loader releasing its own busy flag must not retry a failure');
  h.render({onRefresh:async()=>{calls++;}});h.emit();await h.flush();assert.equal(calls,2);assert.deepEqual(h.events,['mark:/style','mark:/style','mark:/style','clear:/style']);
 }
});

test('close all confirms every dirty tab before changing anything and closes the active tab after neutral navigation',async()=>{
 const source=fs.readFileSync('frontend/src/layouts/MainLayout.jsx','utf8');
 const callback=source.slice(source.indexOf('  const handleCloseAllTabs ='),source.indexOf('  const isCurrentPathKeepAlive ='));
 const calls=[],refs={skipAutoOpenPathRef:{current:null},pendingCloseTabRef:{current:null},pendingManualTabCloseRef:{current:null},pendingNavigationPathRef:{current:null},recentTabHistoryRef:{current:['/style','/work']},currentPathRef:{current:'/work'}};
 let allow=false;
 const context=vm.createContext({...refs,React:{useCallback:fn=>fn},EMPTY_WORKSPACE_PATH:'/workspace',openTabs:[{id:'/style'},{id:'/work'}],confirmDiscardUnsavedChanges:(options)=>{calls.push(['confirm',options]);return allow;},closeTab:id=>calls.push(['close',id]),navigate:(...args)=>calls.push(['navigate',...args]),schedulePendingNavigationCleanup:(...args)=>calls.push(['cleanup',...args])});
 vm.runInContext(callback+'globalThis.closeAll=handleCloseAllTabs;',context);await context.closeAll();assert.deepEqual(calls,[['confirm',undefined]]);assert.equal(refs.pendingCloseTabRef.current,null);assert.equal(refs.recentTabHistoryRef.current.length,2);
 allow=true;calls.length=0;await context.closeAll();assert.deepEqual(calls[0],['confirm',undefined]);assert.deepEqual(calls[1],['close','/style']);assert.equal(calls[2][0],'navigate');assert.equal(calls[2][1],'/workspace');assert.equal(calls[2][2].replace,true);assert.equal(refs.pendingCloseTabRef.current,'/work');assert.equal(refs.pendingManualTabCloseRef.current.targetPath,'/workspace');assert.equal(refs.recentTabHistoryRef.current.length,0);
});
