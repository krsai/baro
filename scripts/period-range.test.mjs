import test from 'node:test';
import assert from 'node:assert/strict';
import {periodMonthKeys} from '../frontend/src/utils/periodRange.mjs';
import {aggregateMonthlyWorkerRows} from '../frontend/src/pages/App/work/workMonthlyUtils.js';
test('date periods enumerate intersecting months inclusively and reject invalid dates',()=>{
 assert.deepEqual(periodMonthKeys('2026-10-15','2026-10-16'),['2026-10']);
 assert.deepEqual(periodMonthKeys('2026-12-31','2027-02-01'),['2026-12','2027-01','2027-02']);
 for(const pair of [['2026-11-01','2026-10-01'],['2026-02-30','2026-03-31'],['2026-01-01','2026-13-01'],['','2026-10-01']])assert.deepEqual(periodMonthKeys(...pair),[]);
});
test('production summaries use the selected day range while keeping the monthly detail identity',()=>{
 const [row]=aggregateMonthlyWorkerRows({employees:[{id:10,name:'Worker',roleCode:'WORKER_SEWING',joinedAt:'2026-01-01'}],logs:[{workDate:'2026-10-15',records:[{workerId:10,quantity:20,ctSeconds:30}]}],monthKey:'2026-10',dateFrom:'2026-10-15',dateTo:'2026-10-16'});
 assert.equal(row.workMonth,'2026-10');assert.equal(row.totalCtSeconds,600);assert.equal(row.attendanceTargetDays,2);
});
