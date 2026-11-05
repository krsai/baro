import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {changeApprovalFixture,seedChangeApproval} from './helpers/change-approval-fixture.mjs';
const require=createRequire(import.meta.url);
const {saveCompanyProfileAndClassification}=require('../backend/dist/services/companyIndustries');
test('company profile and industry classification save together with revision, membership and rollback protection',async()=>{
 const fixture=await changeApprovalFixture();try{
  const db=fixture.db,seed=await seedChangeApproval(db),orgId=seed.company.id,actorId=seed.people.admin.id;
  const service=await db.outsourcingServiceType.findUnique({where:{id:seed.code.serviceTypeId}}),industry=await db.settingServiceDefault.findUnique({where:{id:service.systemDefaultId}});
  const classification={revision:0,roleIds:[industry.partnerRoleId],industryIds:[industry.id]},original=await db.organization.findUnique({where:{id:orgId}}),beforeCode=await db.transactionCode.findUnique({where:{id:seed.code.id}});
  await assert.rejects(saveCompanyProfileAndClassification(db,orgId,actorId,{name:'Must roll back'},{...classification,roleIds:[]}),/PARTNER_CLASSIFICATION_REQUIRED/);
  assert.deepEqual(await db.organization.findUnique({where:{id:orgId}}),original);assert.equal(await db.partnerClassification.count(),0);
  await assert.rejects(saveCompanyProfileAndClassification(db,orgId,seed.people.junior.id,{name:'Forbidden'},classification),/COMPANY_INDUSTRY_ADMIN_REQUIRED/);
  await assert.rejects(saveCompanyProfileAndClassification(db,seed.other.id,actorId,{name:'Foreign'},classification),/COMPANY_INDUSTRY_ADMIN_REQUIRED/);
  const saved=await saveCompanyProfileAndClassification(db,orgId,actorId,{name:'Updated company',address:'One line address'},classification);
  assert.equal(saved.organization.name,'Updated company');assert.equal(saved.classification.revision,1);assert.deepEqual(saved.classification.industryIds,[industry.id]);
  const current=await db.organization.findUnique({where:{id:orgId}});
  await assert.rejects(saveCompanyProfileAndClassification(db,orgId,actorId,{name:'Stale update'},classification),/PARTNER_CLASSIFICATION_CHANGED/);
  assert.deepEqual(await db.organization.findUnique({where:{id:orgId}}),current);
  assert.deepEqual(await db.transactionCode.findUnique({where:{id:seed.code.id}}),beforeCode);assert.equal(await db.orgRelationship.count(),0);
 }finally{await fixture.close();}
});
