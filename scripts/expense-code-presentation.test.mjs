import test from 'node:test';
import assert from 'node:assert/strict';
import { expenseCodeDescription,expenseIndustryMismatch } from '../frontend/src/utils/expenseCodePresentation.mjs';
const code={id:7,serviceTypeId:104,serviceType:{systemDefaultId:4},nameKo:'단춧구멍',nameEn:'BUTTON HOLE',nameVi:'Thùa khuy',base:{serviceTypeId:4,entryMode:'PROCESS',expenseType:{nameKo:'제작 외주',nameEn:'Production outsourcing',nameVi:'Gia công sản xuất'}}};
test('description uses the selected system code category and name, independent of source work text',()=>{
  assert.equal(expenseCodeDescription(code,'ko'),'제작 외주 - 단춧구멍');
  assert.equal(expenseCodeDescription(code,'en'),'Production outsourcing - BUTTON HOLE');
  assert.equal(expenseCodeDescription(code,'vi'),'Gia công sản xuất - Thùa khuy');
  assert.equal(expenseCodeDescription({...code,base:{entryMode:'GENERAL',expenseType:{nameEn:'Other'}}},'en'),'Other - BUTTON HOLE');
});
test('industry warnings compare shared source FKs and do not treat unclassified legacy relations as proven mismatches',()=>{
  assert.equal(expenseIndustryMismatch(code,{serviceTypes:[{id:104}]}),false);
  assert.equal(expenseIndustryMismatch(code,{serviceTypes:[{id:44,systemDefaultId:4}]}),false);
  assert.equal(expenseIndustryMismatch(code,{serviceTypes:[{id:44}]}),false);
  assert.equal(expenseIndustryMismatch(code,{serviceTypes:[{id:44,systemDefaultId:8}]}),true);
  assert.equal(expenseIndustryMismatch(code,{serviceTypes:[]}),true);
  assert.equal(expenseIndustryMismatch(code,{type:'EMPLOYEE',serviceTypes:[]}),false);
  assert.equal(expenseIndustryMismatch(code,{}),false);
});
