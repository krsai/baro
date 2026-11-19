import test from 'node:test';
import assert from 'node:assert/strict';
import { expenseCodeDescription,expenseIndustryMismatch,expenseLineDescription } from '../frontend/src/utils/expenseCodePresentation.mjs';
const code={id:7,serviceTypeId:104,serviceType:{systemDefaultId:4},nameKo:'단춧구멍',nameEn:'BUTTON HOLE',nameVi:'Thùa khuy',base:{serviceTypeId:4,entryMode:'PROCESS',expenseType:{nameKo:'제작 외주',nameEn:'Production outsourcing',nameVi:'Gia công sản xuất'}}};
test('description uses the shared code name and selected immutable material specification',()=>{
  assert.equal(expenseCodeDescription(code,'ko'),'단춧구멍');
  assert.equal(expenseCodeDescription(code,'en'),'BUTTON HOLE');
  assert.equal(expenseCodeDescription(code,'vi'),'Thùa khuy');
  const materialItemSnapshot={nameEn:'Carton',details:{length:'100',width:'80',height:'60'}};
  assert.equal(expenseLineDescription({transactionCodeId:7,materialItemSnapshot,itemAttributeSnapshot:{type:{nameEn:'Duplicate old type'}}},'en',[code]),'BUTTON HOLE · Carton · 100 × 80 × 60 mm');
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
