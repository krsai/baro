import test from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {randomUUID} from 'node:crypto';
import {changeApprovalFixture,seedChangeApproval} from './helpers/change-approval-fixture.mjs';
const require=createRequire(import.meta.url);
const {saveClassification}=require('../backend/dist/services/partnerClassification');
const {saveCodeBase,deleteSetting}=require('../backend/dist/services/codeBaseManagement');
const {SYSTEM_INDUSTRY_USAGE_INCLUDE,systemIndustryInUse,systemIndustryUsageView}=require('../backend/dist/services/systemIndustryUsage');
const {registerExpenseRequest}=require('../backend/dist/services/expenseRequest');
const {postLedgerEntry}=require('../backend/dist/services/bankLedger');
const {accountingAlertCandidates}=require('../backend/dist/services/accountingAlerts');


test('moving a used product code and vendor makes its old industry deletable without changing expense or ledger FKs',async()=>{
 const f=await changeApprovalFixture();try{
  const db=f.db;
  for(const [id,code,suffix] of [[1,'EXEMPT','E'],[2,'VAT','V'],[3,'NON_VAT','N']])await db.taxTreatment.create({data:{id,code,suffix,nameEn:code,nameKo:code,nameVi:code}});
  const s=await seedChangeApproval(db),org=s.company.id,actor=s.people.admin.id;
  const local=await db.outsourcingServiceType.findUnique({where:{id:s.code.serviceTypeId},include:{systemDefault:true}}),old=local.systemDefault;
  const target=await db.settingServiceDefault.create({data:{code:'APPAREL_ACCESSORIES',nameEn:'Apparel accessories',nameKo:'의류 부자재',nameVi:'Phụ liệu may mặc',entryMode:'GENERAL',partnerRoleId:old.partnerRoleId}});
  const system=await db.systemUser.create({data:{email:'retirement@example.test',systemRole:'SYSTEM_ADMIN'}});
  await db.accountingCodeIndustry.create({data:{baseId:s.code.baseId,systemIndustryId:old.id}});
  const selection=id=>({roleIds:[old.partnerRoleId],industryIds:[id]});
  await db.$transaction(tx=>saveClassification(tx,org,s.vendor.id,actor,{revision:0,...selection(old.id)}));
  const expense=()=>db.$transaction(tx=>registerExpenseRequest(tx,org,actor,{partnerOrgId:s.vendor.id,requestDate:'2026-11-17',clientKey:randomUUID(),items:[{transactionCodeId:s.code.id,currency:'USD',quantity:'1',unitPrice:'12',vatRate:'0',details:{reference:'POLYBAG',evidenceFile:'original.pdf'}}]}),{timeout:30000});
  await expense();
  await postLedgerEntry(db,org,'admin@example.test',s.account.id,{clientKey:randomUUID(),transactionDate:'2026-11-17',direction:'OUT',amount:'12',remark:'Original polybag payment',accountingCodeId:s.code.id,evidenceType:'FILE',evidenceNumber:'POLYBAG',counterparty:{kind:'PARTNER',id:s.vendor.id}});
  const costs=await db.partnerTransactionCost.findMany({where:{orgId:org}}),ledger=await db.bankLedgerEntry.findMany({where:{orgId:org}}),request=await db.expenseRequest.findMany({where:{orgId:org}});
  const usage=()=>db.settingServiceDefault.findUnique({where:{id:old.id},include:SYSTEM_INDUSTRY_USAGE_INCLUDE});
  assert.equal(systemIndustryInUse(await usage()),true);
  const mismatches=async()=>(await accountingAlertCandidates(db,org,{ledger:true,expense:true,invoice:false})).filter(row=>row.kind==='PARTNER_INDUSTRY');
  assert.equal((await mismatches()).length,0);
  await assert.rejects(db.$transaction(tx=>deleteSetting(tx,'services',true,old.id,undefined,false,system.email)),/SETTING_IN_USE/);
  await db.$transaction(tx=>saveClassification(tx,org,s.vendor.id,actor,{revision:1,...selection(target.id)}));
  const changed=await mismatches();assert.deepEqual([...new Set(changed.map(row=>row.sourceKind))].sort(),['EXPENSE','LEDGER'],'both existing documents read the latest vendor industry without rewriting their FKs');
  const base=await db.transactionCodeBase.findUnique({where:{id:s.code.baseId}});
  await db.$transaction(tx=>saveCodeBase(tx,{...base,industryIds:[target.id],industryRevision:base.industryRevision},base.id));
  assert.equal((await mismatches()).length,0,'moving the code also updates the existing financial documents classification immediately');
  const row=await usage();assert.ok(row._count.codeBases>0,'compatibility anchor is still a real historical FK');assert.equal(systemIndustryInUse(row),false);
  const view=systemIndustryUsageView(row);assert.equal(view._count.codeBases,0);assert.equal(view.usageCount,0);assert.ok(view.services.every(item=>!('transactionCosts' in item)),'catalogue does not expose transaction records');
  await assert.rejects(db.$transaction(tx=>deleteSetting(tx,'services',true,old.id)),/SYSTEM_ADMIN_REQUIRED/);
  await assert.rejects(db.$transaction(async tx=>{await deleteSetting(tx,'services',true,old.id,undefined,false,system.email);throw new Error('rollback retirement');}),/rollback retirement/);
  assert.equal(await db.industryRetirement.count(),0);
  assert.equal((await db.settingServiceDefault.findUnique({where:{id:old.id}})).isActive,true);
  await db.$transaction(async tx=>{await deleteSetting(tx,'services',true,old.id,undefined,false,system.email);});
  assert.equal((await db.settingServiceDefault.findMany({where:{id:old.id,retirement:null}})).length,0);
  assert.equal((await db.industryRetirement.findUnique({where:{systemIndustryId:old.id}})).actorId,system.id);
  await assert.rejects(db.industryRetirement.delete({where:{systemIndustryId:old.id}}),/immutable/);
  await assert.rejects(db.industryRetirement.update({where:{systemIndustryId:old.id},data:{referenceSummary:{}}}),/immutable/);
  assert.deepEqual(await db.partnerTransactionCost.findMany({where:{orgId:org}}),costs);assert.deepEqual(await db.bankLedgerEntry.findMany({where:{orgId:org}}),ledger);assert.deepEqual(await db.expenseRequest.findMany({where:{orgId:org}}),request);
  assert.ok(await db.transactionCode.findUnique({where:{id:s.code.id}}));assert.ok(await db.outsourcingServiceType.findUnique({where:{id:local.id}}));
  await expense();assert.equal(await db.expenseRequest.count({where:{orgId:org}}),2,'same code remains usable after its old industry is removed');
  await db.$transaction(tx=>deleteSetting(tx,'services',true,old.id,undefined,false,system.email));assert.equal(await db.industryRetirement.count({where:{systemIndustryId:old.id}}),1,'retry is idempotent');
  const migration=require('../backend/scripts/migrate-entity-profiles').migrations().find(item=>item.version==='20261117100000_industry_retirement');await f.pg.exec(migration.sql);await f.pg.exec(migration.sql);assert.equal(await db.industryRetirement.count(),1);
 }finally{await f.close();}
});
