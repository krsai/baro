import test from 'node:test';
import assert from 'node:assert/strict';
import {periodMonthKeys} from '../frontend/src/utils/periodRange.mjs';
test('date periods enumerate intersecting months inclusively and reject invalid dates',()=>{
 assert.deepEqual(periodMonthKeys('2026-10-15','2026-10-16'),['2026-10']);
 assert.deepEqual(periodMonthKeys('2026-12-31','2027-02-01'),['2026-12','2027-01','2027-02']);
 for(const pair of [['2026-11-01','2026-10-01'],['2026-02-30','2026-03-31'],['2026-01-01','2026-13-01'],['','2026-10-01']])assert.deepEqual(periodMonthKeys(...pair),[]);
});