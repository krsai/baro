import test from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {readFileSync} from 'node:fs';
import {changeApprovalFixture,seedChangeApproval} from './helpers/change-approval-fixture.mjs';
const require=createRequire(import.meta.url);
const {setIndustryMaterialManagement,registerMaterialIndustryRoutes}=require('../backend/dist/services/materialIndustry');
const {saveCodeBase}=require('../backend/dist/services/codeBaseManagement');
test('material industry endpoint authorizes SYSTEM before data access',async()=>{
 let handler;registerMaterialIndustryRoutes({put:(_p,h)=>{handler=h;}},new Proxy({},{get(){throw Error('unexpected access');}}),{requireSystemAdmin:async()=>false});await handler({},{});
});
test('industry switch updates linked defaults, covers future links and N:M union, rejects stale writes and preserves company snapshots',async()=>{
 const f=await changeApprovalFixture();try{
  const {db}=f;
  for(const [id,code,suffix] of [[1,'VAT','V'],[2,'ZERO','Z'],[3,'EXEMPT','E']])await db.taxTreatment.create({data:{id,code,suffix,nameEn:code,nameKo:code,nameVi:code}});
  const s=await seedChangeApproval(db),base=await db.transactionCodeBase.findUnique({where:{id:s.code.baseId}}),first=await db.settingServiceDefault.findUnique({where:{id:base.serviceTypeId}});
  const second=await db.settingServiceDefault.create({data:{code:'MATERIAL_SECOND',nameKo:'자재 2',nameEn:'Material 2',nameVi:'Vật tư 2',entryMode:'GENERAL',partnerRoleId:first.partnerRoleId}});
  await db.accountingCodeIndustry.createMany({data:[{baseId:base.id,systemIndustryId:first.id},{baseId:base.id,systemIndustryId:second.id}]});
  const policyBefore=await db.expenseCodeLinkPolicy.findMany();
  const toggle=(id,enabled,revision)=>db.$transaction(tx=>setIndustryMaterialManagement(tx,id,enabled,revision));
  await toggle(first.id,true,0);
  let current=await db.transactionCodeBase.findUnique({where:{id:base.id}});assert.equal(current.materialSettings.enabled,true);assert.deepEqual(current.materialSettings.stockFields,['unit']);
  await assert.rejects(toggle(first.id,false,0),/ACCOUNTING_INDUSTRY_CHANGED/);
  await toggle(second.id,true,0);await toggle(first.id,false,1);
  assert.equal((await db.transactionCodeBase.findUnique({where:{id:base.id}})).materialSettings.enabled,true,'another material industry retains eligibility');
  await toggle(second.id,false,1);assert.equal((await db.transactionCodeBase.findUnique({where:{id:base.id}})).materialSettings.enabled,false);
  await toggle(first.id,true,2);
  const fresh=await db.$transaction(tx=>saveCodeBase(tx,{code:'NEW',nameEn:'New',nameKo:'신규',nameVi:'Mới',industryIds:[first.id],taxTreatmentIds:[1,2,3]}));
  assert.equal(fresh.materialSettings.enabled,true,'future code inherits industry material eligibility');
  current=await db.transactionCodeBase.findUnique({where:{id:base.id}});
  const moved=await db.$transaction(tx=>saveCodeBase(tx,{...current,industryIds:[second.id],industryRevision:current.industryRevision},current.id));
  assert.equal(moved.materialSettings.enabled,false,'removing the last enabled industry removes eligibility');
  assert.deepEqual(await db.expenseCodeLinkPolicy.findMany(),policyBefore);assert.equal(await db.partnerTransactionCost.count(),0);
  const migration=readFileSync('backend/prisma/migrations/20261117140000_material_industry_selection/migration.sql','utf8');await f.pg.exec(migration);await f.pg.exec(migration);
  assert.equal((await db.settingServiceDefault.findUnique({where:{id:first.id}})).materialManagement,true);
 }finally{await f.close();}
});
