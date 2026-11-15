import test from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {changeApprovalFixture,seedChangeApproval} from './helpers/change-approval-fixture.mjs';
const require=createRequire(import.meta.url);
const {readCompanyIndustries,saveCompanyIndustries}=require('../backend/dist/services/companyIndustries');
const {saveClassification}=require('../backend/dist/services/partnerClassification');
const {publicCompanyDetails}=require('../backend/dist/services/companyIdentity');
const {companyClassificationSource}=require('../backend/dist/services/companyClassificationSource');

test('fallback ignores unmanaged links and never selects arbitrarily between multiple managed registrations',async()=>{
 const profile={industries:[{industry:{id:11,partnerRoleId:2}}]};
 let links=[{orgId:1,entityId:10,entity:{ownerOrgId:3,dataOwnerOrgId:1}}];
 const db={organization:{findFirst:async()=>({})},companyPartnerLink:{findMany:async()=>links},partnerClassification:{findUnique:async({where})=>where.orgId_entityId.orgId===9?null:profile}};
 assert.equal(await companyClassificationSource(db,9),null);
 links=[{orgId:1,entityId:10,entity:{ownerOrgId:1}},{orgId:2,entityId:20,entity:{dataOwnerOrgId:2}}];
 assert.equal(await companyClassificationSource(db,9),null);
 links.pop();assert.equal((await companyClassificationSource(db,9)).source,'SHARED');
});

test('tenant and public lookup read the classification of the confirmed original managed partner without copying it',async()=>{
 const f=await changeApprovalFixture();try{
  const db=f.db,s=await seedChangeApproval(db),org=s.company.id,target=s.other.id,actor=s.people.admin.id;
  const service=await db.outsourcingServiceType.findUnique({where:{id:s.code.serviceTypeId}}),industry=await db.settingServiceDefault.findUnique({where:{id:service.systemDefaultId}});
  const set=await db.employeeGradeSet.create({data:{orgId:target,code:'TEST',name:'Grades'}}),grade=await db.employeeGrade.create({data:{orgId:target,setId:set.id,code:'ADMIN',name:'Admin',nameKo:'Admin',nameEn:'Admin',nameVi:'Admin',sortOrder:0}});
  const admin=await db.employee.create({data:{orgId:target,name:'Target admin',orgRole:'ADMIN',status:'ACTIVE',gradeId:grade.id}});
  const input={revision:0,roleIds:[industry.partnerRoleId],industryIds:[industry.id]};
  await db.$transaction(tx=>saveClassification(tx,org,s.vendor.id,actor,input));
  assert.deepEqual((await readCompanyIndustries(db,target,admin.id)).classification.industryIds,[],'names and unlinked registrations do not match');
  await db.companyPartnerLink.create({data:{orgId:org,entityId:s.vendor.id,targetOrgId:target,createdByEmployeeId:actor,matchMethod:'SELECTED'}});
  const before=await db.partnerClassification.findMany({include:{industries:true}});
  const read=await readCompanyIndustries(db,target,admin.id);
  assert.deepEqual(read.classification.industryIds,[industry.id]);assert.equal(read.classification.source,'SHARED');assert.equal(read.classification.revision,0,'self writes use own revision, not source revision');
  const publicRead=await publicCompanyDetails(db,{id:target});assert.deepEqual(publicRead.officialClassification.industryIds,[industry.id]);
  assert.deepEqual(await db.partnerClassification.findMany({include:{industries:true}}),before,'reads never copy or rewrite registrations');
  await saveCompanyIndustries(db,target,admin.id,{classification:read.classification});
  assert.equal((await publicCompanyDetails(db,{id:target})).officialClassification.source,'COMPANY','explicit company save takes precedence');
  assert.equal((await db.partnerClassification.findUnique({where:{orgId_entityId:{orgId:org,entityId:s.vendor.id}}})).revision,1,'original registration stays unchanged');
 }finally{await f.close();}
});
