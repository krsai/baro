import test from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {changeApprovalFixture,seedChangeApproval} from './helpers/change-approval-fixture.mjs';
const require=createRequire(import.meta.url);
const {readCompanyIndustries,saveCompanyIndustries,companyBillableCode}=require('../backend/dist/services/companyIndustries');
const {saveClassification,registerPartnerClassificationRoutes,mergePartnerRelationships}=require('../backend/dist/services/partnerClassification');
const {attachLinkedCompanies}=require('../backend/dist/services/companyConnections');
test('self industries, explicit billing, local classifications and directional customer relationships stay independent',async()=>{
 const f=await changeApprovalFixture();try{
  const db=f.db,s=await seedChangeApproval(db),org=s.company.id,admin=s.people.admin.id;
  const local=await db.outsourcingServiceType.findUnique({where:{id:s.code.serviceTypeId}}),industry=await db.settingServiceDefault.findUnique({where:{id:local.systemDefaultId}});
  const category=await db.partnerRole.findUnique({where:{id:industry.partnerRoleId}});assert.equal(category.code,'MATERIAL_SUPPLIER');assert.equal(category.nameKo,'유통');assert.equal(category.nameEn,'Distribution');assert.equal(category.nameVi,'Phân phối');
  await db.accountingCodeIndustry.create({data:{baseId:s.code.baseId,systemIndustryId:industry.id}});
  const own={revision:0,roleIds:[industry.partnerRoleId],industryIds:[industry.id]};
  assert.equal((await readCompanyIndustries(db,org,admin)).classification.explicit,false);
  assert.equal(await db.partnerClassification.count(),0);
  const saved=await saveCompanyIndustries(db,org,admin,{classification:own,billingCodeIds:[s.code.id]});assert.equal(saved.classification.revision,1);assert.equal(saved.codes.find(c=>c.id===s.code.id).canBill,true);assert.equal((await companyBillableCode(db,org,s.code.id)).id,s.code.id);
  assert.equal(await db.orgRelationship.count(),0,'self industry is not a customer relationship');
  await assert.rejects(saveCompanyIndustries(db,org,s.people.junior.id,{classification:{...own,revision:1},billingCodeIds:[]}),/COMPANY_INDUSTRY_ADMIN_REQUIRED/);
  await assert.rejects(saveCompanyIndustries(db,org,admin,{classification:own,billingCodeIds:[]}),/PARTNER_CLASSIFICATION_CHANGED/);
  await assert.rejects(saveCompanyIndustries(db,s.other.id,admin,{classification:own,billingCodeIds:[]}),/COMPANY_INDUSTRY_ADMIN_REQUIRED/);
  await assert.rejects(db.partnerClassification.update({where:{orgId_entityId:{orgId:org,entityId:org}},data:{revision:2,updatedByEmployeeId:s.people.junior.id}}),/COMPANY_INDUSTRY_ADMIN_REQUIRED/);
  await db.transactionCodeBase.update({where:{id:s.code.baseId},data:{cashDirection:'OUT'}});
  await assert.rejects(companyBillableCode(db,org,s.code.id),/COMPANY_BILLING_CODE_INVALID/);
  await assert.rejects(saveCompanyIndustries(db,org,admin,{classification:{...own,revision:1},billingCodeIds:[s.code.id]}),/COMPANY_BILLING_CODE_INVALID/);
  assert.equal((await readCompanyIndustries(db,org,admin)).classification.revision,1,'failed billing validation rolls back profile revision');
  await saveCompanyIndustries(db,org,admin,{classification:{...own,revision:1},billingCodeIds:[]});
  await assert.rejects(db.transactionCode.update({where:{id:s.code.id},data:{canBill:true}}),/COMPANY_BILLING_CODE_INVALID/);
  assert.equal((await db.transactionCodeBase.findUnique({where:{id:s.code.baseId}})).cashDirection,'OUT','billing setup never changes accounting direction');
  const relationship=await db.orgRelationship.create({data:{manufacturerOrgId:org,brandOrgId:s.other.id}});
  await db.$transaction(tx=>saveClassification(tx,org,s.other.id,admin,own));
  const routes=new Map(),gates={requireOrgRole:async()=>({organization:s.company}),getBusinessPartnerUsage:async()=>new Set(),getCustomerUsage:async()=>new Set()};registerPartnerClassificationRoutes({get:(path,fn)=>routes.set(path,fn)},db,gates);
  let directory;await routes.get('/partner-directory')({},{json:value=>{directory=value;}});
  assert.deepEqual(directory.rows.find(r=>r.relationshipId===relationship.id).relationshipRoles,['CUSTOMER']);assert.deepEqual(directory.rows.find(r=>r.entity.id===s.vendor.id).relationshipRoles,['SUPPLIER']);
  assert.equal(directory.rows.find(r=>r.relationshipId===relationship.id).classification.roleIds[0],industry.partnerRoleId,'customer relation does not require CUSTOMER taxonomy');
  const set=await db.employeeGradeSet.create({data:{orgId:s.other.id,code:'OTHER',name:'Other'}}),grade=await db.employeeGrade.create({data:{orgId:s.other.id,setId:set.id,code:'ADMIN',name:'Admin',nameKo:'Admin',nameEn:'Admin',nameVi:'Admin',sortOrder:1}}),otherAdmin=await db.employee.create({data:{orgId:s.other.id,name:'Other admin',status:'ACTIVE',orgRole:'ADMIN',gradeId:grade.id}});
  await saveCompanyIndustries(db,s.other.id,otherAdmin.id,{classification:own,billingCodeIds:[]});
  await db.companyPartnerLink.create({data:{orgId:org,entityId:s.vendor.id,targetOrgId:s.other.id,createdByEmployeeId:admin,matchMethod:'SELECTED'}});
  const connected=await attachLinkedCompanies(db,org,[{entityId:s.vendor.id}]);assert.deepEqual(connected[0].officialClassification.industryIds,[industry.id]);assert.equal('codes' in connected[0].officialClassification,false);
  assert.equal(await db.orgRelationship.count(),1,'identity linking does not create a customer');
  gates.requireOrgRole=async()=>({organization:s.other});await routes.get('/partner-directory')({},{json:value=>{directory=value;}});assert.deepEqual(directory.rows.find(r=>r.relationshipId===relationship.id).relationshipRoles,['SUPPLIER']);
 }finally{await f.close();}
});
test('one company can be both customer and supplier without duplicate display or losing deletion protection',()=>{
 const rows=mergePartnerRelationships([{entity:{id:1,name:'Company'},relationshipId:11,relationshipRoles:['SUPPLIER'],hasUsageHistory:true},{entity:{id:1,name:'Company'},relationshipId:12,relationshipRoles:['CUSTOMER'],hasUsageHistory:false},{entity:{id:2,name:'Company'},relationshipId:13,relationshipRoles:['CUSTOMER'],hasUsageHistory:false}]);
 assert.equal(rows.length,2);assert.deepEqual(rows[0].relationshipRoles,['CUSTOMER','SUPPLIER']);assert.deepEqual(rows[0].relationshipIds,[11,12]);assert.equal(rows[0].relationshipId,12);assert.equal(rows[0].hasUsageHistory,true);
});
