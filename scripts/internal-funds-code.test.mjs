import test from 'node:test';
import assert from 'node:assert/strict';
import {expenseIndustryMismatch} from '../frontend/src/utils/expenseCodePresentation.mjs';
import {isInternalFundsCode} from '../frontend/src/utils/accountingCode.mjs';
test('internal funds codes are exempt from partner industry warnings through source classifications',()=>{
 for(const code of [{serviceType:{code:'FUNDS'}},{serviceType:{systemDefault:{code:'FUNDS'}}},{base:{expenseType:{code:'FUNDS'}}},{base:{industryLinks:[{industry:{code:'FUNDS'}}]}},{industries:[{code:'FUNDS'}]}]){
  assert.equal(isInternalFundsCode(code),true);assert.equal(expenseIndustryMismatch({...code,serviceTypeId:1,base:{serviceTypeId:1,...code.base}},{serviceTypes:[{id:2,systemDefaultId:2}]}),false);
 }
 assert.equal(isInternalFundsCode({code:'FUNDS',nameEn:'Funds'}),false,'names and accounting code text do not grant an exemption');
 assert.equal(expenseIndustryMismatch({serviceTypeId:1,base:{serviceTypeId:1}},{serviceTypes:[{id:2,systemDefaultId:2}]}),true);
});
