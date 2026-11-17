import test from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {readFileSync} from 'node:fs';
import {changeApprovalFixture,seedChangeApproval} from './helpers/change-approval-fixture.mjs';
const require=createRequire(import.meta.url);
const {accountingInputs}=require('../backend/dist/services/accountingInputs');
const {saveCodeBase}=require('../backend/dist/services/codeBaseManagement');
const {effectiveExpenseCode,saveExpenseCodeLinkPolicy}=require('../backend/dist/services/expenseCodeLinkPolicy');
const enabled={enabled:true,colorInput:'OPTIONAL',unitInput:'REQUIRED',stockFields:['customer','type','color','unit']};
const attributes={customer:'REQUIRED',type:'REQUIRED'};
test('material eligibility is explicit, validated and never inherited into old company snapshots',()=>{
 assert.equal(accountingInputs({}).materialSettings,undefined);
 assert.deepEqual(accountingInputs({attributeInputs:attributes,materialSettings:enabled}).materialSettings,enabled);
 for(const materialSettings of [null,[],{enabled:'true'}, {...enabled,stockFields:['unit','unit']},{...enabled,stockFields:['name','unit']},{...enabled,unitInput:'OPTIONAL'},{...enabled,colorInput:'HIDDEN'}])assert.throws(()=>accountingInputs({attributeInputs:attributes,materialSettings}));
 assert.throws(()=>accountingInputs({materialSettings:enabled}),'hidden attributes cannot separate stock');
 const base={attributeInputs:attributes,materialSettings:enabled};
 assert.equal(effectiveExpenseCode({base},{inputSettings:accountingInputs({}),target:'NONE'}).base.materialSettings.enabled,false);
 assert.equal(effectiveExpenseCode({base}).base.materialSettings.enabled,true);
});
test('material defaults and company overrides persist with revision, DB guards and idempotent migration',async()=>{
 const f=await changeApprovalFixture();try{
  const {db}=f;
  for(const [id,code,suffix] of [[1,'VAT','V'],[2,'ZERO','Z'],[3,'EXEMPT','E']])await db.taxTreatment.create({data:{id,code,suffix,nameEn:code,nameKo:code,nameVi:code}});
  const s=await seedChangeApproval(db);
  const base=await db.transactionCodeBase.findUnique({where:{id:s.code.baseId}});
  assert.equal(base.materialSettings.enabled,false);
  const body={...base,industryIds:[base.serviceTypeId],industryRevision:base.industryRevision,attributeInputs:attributes,materialSettings:enabled};
  const saved=await db.$transaction(tx=>saveCodeBase(tx,body,base.id));
  assert.deepEqual(saved.materialSettings,enabled);assert.equal(saved.materialRevision,2);
  const repeated=await db.$transaction(tx=>saveCodeBase(tx,{...saved,industryIds:[base.serviceTypeId]},base.id));
  assert.equal(repeated.materialRevision,2,'unchanged JSONB settings do not create a new revision');
  await assert.rejects(db.$transaction(tx=>saveCodeBase(tx,{...body,materialSettings:{...enabled,enabled:false}},base.id)),/ACCOUNTING_INDUSTRY_CHANGED/);
  const policy=await db.$transaction(tx=>saveExpenseCodeLinkPolicy(tx,s.company.id,s.people.admin.id,base.id,'NONE',{attributeInputs:attributes,materialSettings:{...enabled,enabled:false}}));
  assert.equal(policy.inputSettings.materialSettings.enabled,false);
  await assert.rejects(db.$transaction(tx=>saveExpenseCodeLinkPolicy(tx,s.company.id,s.people.admin.id,base.id,'NONE',{attributeInputs:attributes,materialSettings:enabled},null)),/ACCOUNTING_INDUSTRY_CHANGED/);
  assert.equal(effectiveExpenseCode({base:saved},policy).base.materialSettings.enabled,false);
  await assert.rejects(db.$executeRawUnsafe('UPDATE "TransactionCodeBase" SET "materialSettings"=$1::jsonb WHERE id=$2',JSON.stringify({...enabled,stockFields:['unknown']}),base.id));
  const migration=readFileSync('backend/prisma/migrations/20261117130000_material_code_settings/migration.sql','utf8');
  await f.pg.exec(migration);await f.pg.exec(migration);
  assert.deepEqual((await db.transactionCodeBase.findUnique({where:{id:base.id}})).materialSettings,enabled);
  assert.equal(await db.partnerTransactionCost.count(),0,'configuration creates no transaction or stock');
 }finally{await f.close();}
});
