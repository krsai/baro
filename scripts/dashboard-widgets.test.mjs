import assert from 'node:assert/strict';
import test from 'node:test';
import {dashboardWidgetStorageKey,moveDashboardWidget,normalizeDashboardWidgets} from '../frontend/src/utils/dashboardWidgets.mjs';
const widgets=[{id:'excess',width:'full'},{id:'notifications'},{id:'todo'}];
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
