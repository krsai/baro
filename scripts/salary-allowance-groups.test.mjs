import test from 'node:test';
import assert from 'node:assert/strict';
import {salaryDisplayGroup,isMonthlyBaseSalaryItem} from '../frontend/src/pages/App/salaryAllowanceGroups.mjs';

const allowance={category:'ALLOWANCE',payCycle:'MONTHLY',formula:['GRADE_RATE']};
test('overtime, holiday and tenure conditions form additional allowances and never enter monthly base totals',()=>{
  for(const token of ['OVERTIME_HOURS','HOLIDAY_HOURS','HOLIDAY_WORKDAYS','TENURE_YEARS']){
    const item={...allowance,id:'opaque',formula:['GRADE_RATE','×',token]};
    assert.equal(salaryDisplayGroup(item),'ADDITIONAL_ALLOWANCE');assert.equal(isMonthlyBaseSalaryItem(item),false);
  }
  for(const nameKo of ['특근 수당','야근 수당','근속 수당']){
    const item={...allowance,id:'draft-123',nameKo};
    assert.equal(salaryDisplayGroup(item),'ADDITIONAL_ALLOWANCE');assert.equal(isMonthlyBaseSalaryItem(item),false);
  }
});
test('ordinary allowances including full attendance stay regular; non-monthly and all incentives are excluded',()=>{
  for(const token of ['GRADE_RATE','ACTUAL_WORKDAYS','FULL_ATTENDANCE_FACTOR']){
    const item={...allowance,id:'lunch',formula:['GRADE_RATE','×',token]};
    assert.equal(salaryDisplayGroup(item),'ALLOWANCE');assert.equal(isMonthlyBaseSalaryItem(item),true);
  }
  for(const payCycle of ['QUARTERLY','SEMIANNUAL','ANNUAL'])assert.equal(isMonthlyBaseSalaryItem({...allowance,payCycle}),false);
  assert.equal(isMonthlyBaseSalaryItem({...allowance,category:'BASE'}),true);
  assert.equal(isMonthlyBaseSalaryItem({...allowance,id:'extra-incentive',category:'INCENTIVE'}),false);
});
