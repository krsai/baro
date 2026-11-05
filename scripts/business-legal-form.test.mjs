import test from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {changeApprovalFixture,seedChangeApproval} from './helpers/change-approval-fixture.mjs';
const require=createRequire(import.meta.url),{businessLegalForm}=require('../backend/dist/services/businessLegalForm');
test('business registration form preserves unknown values and is independent of individual payee identity',async()=>{
 assert.equal(businessLegalForm(undefined),undefined);assert.equal(businessLegalForm(''),null);
 for(const value of ['CORPORATION','SOLE_PROPRIETOR'])assert.equal(businessLegalForm(value),value);
 for(const value of ['INDIVIDUAL','SERVICE',42,{}])assert.throws(()=>businessLegalForm(value),/INVALID_BUSINESS_LEGAL_FORM/);
 const f=await changeApprovalFixture();try{
  const s=await seedChangeApproval(f.db),id=s.company.id;
  assert.equal((await f.db.organization.findUnique({where:{id}})).businessLegalForm,null);
  for(const value of ['CORPORATION','SOLE_PROPRIETOR']){await f.db.organization.update({where:{id},data:{businessLegalForm:value}});const saved=await f.db.organization.findUnique({where:{id}});assert.equal(saved.businessLegalForm,value);assert.equal(saved.partyKind,null);assert.equal(saved.code,s.company.code);}
  await assert.rejects(f.db.organization.update({where:{id},data:{businessLegalForm:'INDIVIDUAL'}}),/Organization_business_legal_form_check/);
 }finally{await f.close();}
});
