import assert from 'node:assert/strict';
import test from 'node:test';
import {dashboardWidgetStorageKey,moveDashboardWidget,normalizeDashboardWidgets,resolveDashboardWidgetLayout} from '../frontend/src/utils/dashboardWidgets.mjs';
import {accountingAlertOptions,accountingAlertTitle} from '../frontend/src/constants/accountingAlerts.js';
const widgets=[{id:'excess',width:'full'},{id:'notifications'},{id:'todo'}];
test('handled-item settings inherit the old partner choice and then save independently',()=>{
 const available=[{id:'notifications',options:accountingAlertOptions('ko')}];
 const settings=normalizeDashboardWidgets([{id:'notifications',settings:{'accounting-partner':false}}],available)[0].settings;
 assert.equal(settings['accounting-handled'],false);
 const explicit=normalizeDashboardWidgets([{id:'notifications',settings:{...settings,'accounting-handled':true}}],available)[0].settings;
 assert.equal(explicit['accounting-partner'],false);assert.equal(explicit['accounting-handled'],true);
 for(const lang of ['ko','en','vi']){
  const options=accountingAlertOptions(lang);assert.ok(options.some(option=>option.id==='accounting-handled'));
  const titles=['EXPENSE','LEDGER','SETTLEMENT','INVOICE'].map(sourceKind=>accountingAlertTitle({sourceKind,kind:'PARTNER_HANDLED_ITEM'},lang));
  assert.equal(new Set(titles).size,4);assert.ok(titles.every(title=>title.includes(': ')&&!title.includes('undefined')));
 }
 assert.equal(accountingAlertTitle({sourceKind:'EXPENSE',kind:'PARTNER_HANDLED_ITEM'},'ko'),'비용 신청: 거래처 취급 품목 불일치');
 assert.equal(accountingAlertTitle({sourceKind:'LEDGER',kind:'PARTNER_HANDLED_ITEM'},'ko'),'입출금: 거래처 취급 품목 불일치');
 assert.equal(accountingAlertTitle({sourceKind:'EXPENSE',path:'/outsourcing-record/edit/cost/12',kind:'PARTNER_HANDLED_ITEM'},'ko'),'비용 입력: 거래처 취급 품목 불일치');
});
test('new service notifications appear once and an explicit later removal remains removed',()=>{
 const available=[{id:'tasks'},{id:'notifications',defaultTag:'finance-v1'}];
 assert.deepEqual(resolveDashboardWidgetLayout({version:2,items:[{id:'tasks'}]},available).map(item=>item.id),['tasks','notifications']);
 assert.deepEqual(resolveDashboardWidgetLayout({version:2,items:[{id:'tasks'}],defaultsApplied:['finance-v1']},available).map(item=>item.id),['tasks']);
 assert.deepEqual(resolveDashboardWidgetLayout({version:2,items:[]},available),[]);
});
test('split widgets migrate existing order once and preserve per-user item selection including explicit empty layouts',()=>{
 const available=[{id:'notifications',options:[{id:'unassigned'}]},{id:'suspected-errors',newDefault:true},{id:'work-requests',newDefault:true}];
 const migrated=resolveDashboardWidgetLayout({legacy:true,items:[{id:'production-excess',width:'full'},{id:'notifications'}]},available);
 assert.deepEqual(migrated.map(item=>item.id),['suspected-errors','notifications','work-requests']);assert.equal(migrated[0].width,'full');
 const stored=resolveDashboardWidgetLayout({version:2,items:[{id:'notifications',settings:{unassigned:false,forbidden:true}}]},available);
 assert.deepEqual(stored,[{id:'notifications',width:'half',settings:{unassigned:false}}]);
 assert.deepEqual(resolveDashboardWidgetLayout({legacy:true,items:[]},available),[]);
});
test('widget layout defaults, explicit empty selection, permission filtering and invalid storage',()=>{
 assert.deepEqual(normalizeDashboardWidgets(null,widgets),[{id:'excess',width:'full'},{id:'notifications',width:'half'},{id:'todo',width:'half'}]);
 assert.deepEqual(normalizeDashboardWidgets([],widgets),[]);
 assert.deepEqual(normalizeDashboardWidgets([null,{id:'denied'},{id:'todo',width:'invalid'},{id:'todo',width:'full'},{id:'excess',width:'full'}],widgets),[{id:'todo',width:'half'},{id:'excess',width:'full'}]);
 assert.deepEqual(normalizeDashboardWidgets([{id:'excess'}],widgets.filter(row=>row.id!=='excess')),[]);
});
test('drag reorder preserves widths and scopes distinguish company and user',()=>{
 const layout=normalizeDashboardWidgets(null,widgets),moved=moveDashboardWidget(layout,'todo','excess');
 assert.deepEqual(moved.map(row=>row.id),['todo','excess','notifications']);assert.equal(moved[1].width,'full');assert.equal(layout[0].id,'excess');
 assert.equal(moveDashboardWidget(layout,'missing','todo'),layout);
 assert.notEqual(dashboardWidgetStorageKey(1,'user-a'),dashboardWidgetStorageKey(2,'user-a'));
 assert.notEqual(dashboardWidgetStorageKey(1,'user-a'),dashboardWidgetStorageKey(1,'user-b'));
});
