import test from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {readFileSync} from 'node:fs';
import {changeApprovalFixture,seedChangeApproval} from './helpers/change-approval-fixture.mjs';
const require=createRequire(import.meta.url);
const {readCompanyIndustries,saveCompanyIndustries,companyBillableCode}=require('../backend/dist/services/companyIndustries');
const {saveClassification,registerPartnerClassificationRoutes,mergePartnerRelationships}=require('../backend/dist/services/partnerClassification');
const {attachLinkedCompanies}=require('../backend/dist/services/companyConnections');
const {partnerRoleCatalogue}=require('../backend/dist/services/partnerRoleCatalogue');
test('self industries, unrestricted compatible billing and local partner classifications stay independent',async()=>{
 const f=await changeApprovalFixture();try{
  const db=f.db,s=await seedChangeApproval(db),org=s.company.id,admin=s.people.admin.id;
  const local=await db.outsourcingServiceType.findUnique({where:{id:s.code.serviceTypeId}}),industry=await db.settingServiceDefault.findUnique({where:{id:local.systemDefaultId}});
  const category=await db.partnerRole.findUnique({where:{id:industry.partnerRoleId}});assert.equal(category.code,'MATERIAL_SUPPLIER');assert.equal(category.nameKo,'유통');assert.equal(category.nameEn,'Distribution');assert.equal(category.nameVi,'Phân phối');
  await db.accountingCodeIndustry.create({data:{baseId:s.code.baseId,systemIndustryId:industry.id}});
  const own={revision:0,roleIds:[industry.partnerRoleId],industryIds:[industry.id]};
  assert.equal((await readCompanyIndustries(db,org,admin)).classification.explicit,false);
  assert.equal(await db.partnerClassification.count(),0);
  assert.equal((await companyBillableCode(db,org,s.code.id)).id,s.code.id,'billing needs neither an industry profile nor canBill flag');
  await assert.rejects(companyBillableCode(db,s.other.id,s.code.id),/COMPANY_BILLING_CODE_INVALID/);
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
  await saveCompanyIndustries(db,org,admin,{classification:{...own,revision:1}});
  assert.equal((await db.transactionCode.findUnique({where:{id:s.code.id}})).canBill,true,'industry-only save preserves old billing metadata even when code direction changed');
  await saveCompanyIndustries(db,org,admin,{classification:{...own,revision:2},billingCodeIds:[]});
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
  await db.organization.update({where:{id:s.other.id},data:{name:'Updated official company',address:'Updated official address',phone:'0900000000'}});
  const refreshed=(await attachLinkedCompanies(db,org,[{entityId:s.vendor.id,name:'Stale local name',code:'KEEP'}]))[0];
  assert.equal(refreshed.name,'Updated official company');assert.equal(refreshed.address,'Updated official address');assert.equal(refreshed.phone,'0900000000');assert.equal(refreshed.code,'KEEP');
  assert.equal((await db.organization.findUnique({where:{id:s.vendor.id}})).name,'Vendor','read synchronization preserves local identity and financial references');
  assert.equal(await db.orgRelationship.count(),1,'identity linking does not create a customer');
  gates.requireOrgRole=async()=>({organization:s.other});await routes.get('/partner-directory')({},{json:value=>{directory=value;}});assert.deepEqual(directory.rows.find(r=>r.relationshipId===relationship.id).relationshipRoles,['SUPPLIER']);
  await db.transactionCodeBase.update({where:{id:s.code.baseId},data:{cashDirection:'IN'}});
  assert.equal((await companyBillableCode(db,org,s.code.id)).id,s.code.id,'clearing a legacy whitelist must not prohibit a compatible code');
  const companyRoutes=new Map();require('../backend/dist/services/companyIndustries').registerCompanyIndustryRoutes({get:(path,fn)=>companyRoutes.set(path,fn),put:()=>{}},db,{requireOrgRole:async()=>({organization:s.company}),actorId:()=>admin});
  let billingCodes;await companyRoutes.get('/company-billing-codes')({},{json:value=>{billingCodes=value;}});assert.ok(billingCodes.some(c=>c.id===s.code.id&&!c.canBill));
  await db.transactionCode.update({where:{id:s.code.id},data:{isActive:false}});await assert.rejects(companyBillableCode(db,org,s.code.id),/COMPANY_BILLING_CODE_INVALID/);
 }finally{await f.close();}
});

test('empty retired customer groups are omitted; custom types keep their neutral fallback group',async()=>{
 const rows=[{id:1,code:'CUSTOMER',_count:{industries:0}},{id:2,code:'APPAREL',_count:{industries:0}}];
 const db={partnerRole:{findMany:async()=>rows}};assert.deepEqual((await partnerRoleCatalogue(db)).map(r=>r.id),[2]);
 rows[0]._count.industries=1;assert.deepEqual((await partnerRoleCatalogue(db)).map(r=>r.id),[1,2]);
});

test('customer taxonomy becomes industry groups without changing source IDs, company links or business records',async()=>{
 const f=await changeApprovalFixture();try{
  // Replay the historical taxonomy migration before the later retirement guard.
  await f.pg.exec('ALTER TABLE "SettingServiceDefault" DROP CONSTRAINT "SettingServiceDefault_legacy_logistics_retired"');
  const db=f.db,s=await seedChangeApproval(db),org=s.company.id,admin=s.people.admin.id;
  const customer=await db.partnerRole.findUnique({where:{code:'CUSTOMER'}});
  const apparel=await db.partnerRole.findUnique({where:{code:'APPAREL'}}),logistics=await db.partnerRole.findUnique({where:{code:'LOGISTICS_PROVIDER'}});
  const garment=await db.settingServiceDefault.create({data:{code:'GARMENT_CUSTOMER',nameKo:'의류 생산 고객',nameEn:'Garment customer',nameVi:'Khách hàng may mặc',partnerRoleId:customer.id,entryMode:'GENERAL'}});
  const transport=await db.settingServiceDefault.create({data:{code:'LOGISTICS_CUSTOMER',nameKo:'물류 서비스 고객',nameEn:'Logistics customer',nameVi:'Khách hàng logistics',partnerRoleId:customer.id,entryMode:'GENERAL'}});
  const custom=await db.settingServiceDefault.create({data:{code:'CUSTOM_UNKNOWN',nameKo:'미확정',nameEn:'Custom',nameVi:'Custom',partnerRoleId:customer.id,entryMode:'GENERAL'}});
  await saveCompanyIndustries(db,org,admin,{classification:{revision:0,roleIds:[customer.id],industryIds:[garment.id,transport.id]}});
  const beforeCode=await db.transactionCode.findUnique({where:{id:s.code.id}}),beforeOrg=await db.organization.findUnique({where:{id:org}});
  const sql=readFileSync(new URL('../backend/prisma/migrations/20261105060000_industry_groups_and_open_billing/migration.sql',import.meta.url),'utf8');
  await f.pg.exec(sql);
  const profile=await readCompanyIndustries(db,org,admin);
  assert.deepEqual(new Set(profile.classification.industryIds),new Set([garment.id,transport.id]));assert.deepEqual(new Set(profile.classification.roleIds),new Set([apparel.id,logistics.id]));assert.equal(profile.classification.revision,1);
  assert.equal((await db.settingServiceDefault.findUnique({where:{id:garment.id}})).nameKo,'의류');assert.equal((await db.settingServiceDefault.findUnique({where:{id:transport.id}})).nameKo,'물류 서비스');
  assert.equal((await db.settingServiceDefault.findUnique({where:{id:custom.id}})).partnerRoleId,customer.id,'unknown custom industry is not guessed');
  assert.equal((await db.partnerRole.findUnique({where:{id:customer.id}})).nameKo,'기타');
  assert.deepEqual(await db.transactionCode.findUnique({where:{id:s.code.id}}),beforeCode);assert.deepEqual(await db.organization.findUnique({where:{id:org}}),beforeOrg);
  await f.pg.exec(sql);assert.deepEqual((await readCompanyIndustries(db,org,admin)).classification,profile.classification,'migration is repeat safe');
 }finally{await f.close();}
});
test('one company can be both customer and supplier without duplicate display or losing deletion protection',()=>{
 const rows=mergePartnerRelationships([{entity:{id:1,name:'Company'},relationshipId:11,relationshipRoles:['SUPPLIER'],hasUsageHistory:true},{entity:{id:1,name:'Company'},relationshipId:12,relationshipRoles:['CUSTOMER'],hasUsageHistory:false},{entity:{id:2,name:'Company'},relationshipId:13,relationshipRoles:['CUSTOMER'],hasUsageHistory:false}]);
 assert.equal(rows.length,2);assert.deepEqual(rows[0].relationshipRoles,['CUSTOMER','SUPPLIER']);assert.deepEqual(rows[0].relationshipIds,[11,12]);assert.equal(rows[0].relationshipId,12);assert.equal(rows[0].hasUsageHistory,true);
});
