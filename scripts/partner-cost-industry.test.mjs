import test from 'node:test';
import assert from 'node:assert/strict';
import {partnerCostIndustryLabel} from '../frontend/src/utils/partnerIndustry.mjs';

test('cost history uses code industry links instead of the historical office supplies FK',()=>{
 const cost={serviceType:{nameKo:'사무·비품'},transactionCode:{base:{industryLinks:[{industry:{nameKo:'급여·인건비',nameEn:'Payroll',nameVi:'Tiền lương'}},{industry:{nameKo:'보험',nameEn:'Insurance',nameVi:'Bảo hiểm'}}]}}};
 const before=structuredClone(cost);
 assert.equal(partnerCostIndustryLabel(cost,'ko'),'급여·인건비 · 보험');
 assert.equal(partnerCostIndustryLabel(cost,'en'),'Payroll · Insurance');
 assert.equal(partnerCostIndustryLabel(cost,'vi'),'Tiền lương · Bảo hiểm');
 assert.deepEqual(cost,before);
});

test('missing code or industry links never fall back to historical storage or partner classification',()=>{
 for(const transactionCode of [null,{base:null},{base:{industryLinks:[]}}]){
  assert.equal(partnerCostIndustryLabel({serviceType:{nameKo:'사무·비품'},transactionCode}),'—');
 }
});
