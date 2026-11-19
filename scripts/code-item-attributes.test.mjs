import test from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {readFileSync} from 'node:fs';
import {changeApprovalFixture,seedChangeApproval} from './helpers/change-approval-fixture.mjs';
import {validExpenseLine} from '../frontend/src/utils/expenseRequest.mjs';
const require=createRequire(import.meta.url);
const {accountingInputs}=require('../backend/dist/services/accountingInputs');
const {saveCodeBase}=require('../backend/dist/services/codeBaseManagement');
const {registerExpenseRequest}=require('../backend/dist/services/expenseRequest');
const {saveExpenseCodeLinkPolicy}=require('../backend/dist/services/expenseCodeLinkPolicy');
const {registerCodeItemAttributeRoutes}=require('../backend/dist/services/codeItemAttributes');
const {loadExpenseEditorSource,expenseEditorForm}=require('../backend/dist/services/expenseRequestEditor');
const modes={customer:'REQUIRED',type:'REQUIRED'};

test('all 27 production input configurations save independently in system and company settings',async()=>{
 const f=await changeApprovalFixture();try{
  const db=f.db;
  for(const [id,code,suffix] of [[1,'VAT','V'],[2,'ZERO','Z'],[3,'EXEMPT','E']])await db.taxTreatment.create({data:{id,code,suffix,nameEn:code,nameKo:code,nameVi:code}});
  const s=await seedChangeApproval(db),base=await db.transactionCodeBase.findUnique({where:{id:s.code.baseId}});
  for(const orderInput of ['HIDDEN','OPTIONAL','REQUIRED'])for(const styleInput of ['HIDDEN','OPTIONAL','REQUIRED'])for(const processInput of ['HIDDEN','OPTIONAL','REQUIRED']){
   const inputs={orderInput,styleInput,processInput,requiredFields:[]};
   const normalized=accountingInputs(inputs);assert.equal(normalized.orderInput,orderInput);assert.equal(normalized.styleInput,styleInput);assert.equal(normalized.processInput,processInput);
   const current=await db.transactionCodeBase.findUnique({where:{id:base.id}});
   await db.$transaction(tx=>saveCodeBase(tx,{...current,...inputs,taxTreatmentIds:[s.code.taxTreatmentId],industryIds:[base.serviceTypeId]},base.id));
   const stored=await db.transactionCodeBase.findUnique({where:{id:base.id}});for(const key of ['orderInput','styleInput','processInput'])assert.equal(stored[key],inputs[key]);
   const policy=await db.$transaction(tx=>saveExpenseCodeLinkPolicy(tx,s.company.id,s.people.admin.id,base.id,'NONE',inputs));
   for(const key of ['orderInput','styleInput','processInput'])assert.equal(policy.inputSettings[key],inputs[key]);
   const [{valid}]=await db.$queryRawUnsafe('SELECT baro_accounting_inputs_valid($1::jsonb) AS valid',JSON.stringify(normalized));assert.equal(valid,true);
  }
  for(const settings of [{orderInput:'WRONG',styleInput:'HIDDEN',processInput:'HIDDEN',requiredFields:[]},{orderInput:'HIDDEN',styleInput:'REQUIRED',processInput:'HIDDEN',requiredFields:['INVALID']}]){
   const [{valid}]=await db.$queryRawUnsafe('SELECT baro_accounting_inputs_valid($1::jsonb) AS valid',JSON.stringify(settings));assert.equal(valid,false);
  }
  await f.pg.exec(`ALTER TABLE "TransactionCodeBase" ADD CONSTRAINT test_old_input_hierarchy CHECK("styleInput"='HIDDEN' OR "orderInput"<>'HIDDEN'); ALTER TABLE "TransactionCodeBase" ADD CONSTRAINT test_input_enum CHECK("orderInput" IN ('HIDDEN','OPTIONAL','REQUIRED'));`);
  const migration=readFileSync('backend/prisma/migrations/20261119230000_independent_accounting_inputs/migration.sql','utf8');await f.pg.exec(migration);await f.pg.exec(migration);
  await db.transactionCodeBase.update({where:{id:base.id},data:{orderInput:'HIDDEN',styleInput:'REQUIRED',processInput:'HIDDEN'}});
  await assert.rejects(db.$executeRawUnsafe('UPDATE "TransactionCodeBase" SET "orderInput"=$1 WHERE id=$2','INVALID',base.id));
 }finally{await f.close();}
});
test('shared customer/type modes validate independently and preserve old snapshots',()=>{
 assert.equal(accountingInputs({}).attributeInputs,undefined);
 assert.deepEqual(accountingInputs({attributeInputs:modes}).attributeInputs,modes);
 for(const attributeInputs of [{customer:'TEXT'},{brand:'REQUIRED'},[],null])assert.throws(()=>accountingInputs({attributeInputs}));
 const code={base:{entryMode:'GENERAL',orderInput:'HIDDEN',attributeInputs:modes}},line={quantity:'1',unitPrice:'2',vatRate:'0',details:{reference:'R',evidenceFile:'F'}};
 assert.equal(validExpenseLine(line,code,'USD'),false);
 assert.equal(validExpenseLine({...line,itemCustomerId:1,itemTypeId:2},code,'USD'),true);
 assert.equal(validExpenseLine({...line,itemId:'old',transactionCode:{id:7},transactionCodeId:7,inputSettings:{}},{id:7,...code},'USD'),true,'old empty attributes are not retroactively required');
});
test('attribute options and creation authorize before accessing any company data',async()=>{
 const routes=new Map(),app={get:(p,h)=>routes.set('GET '+p,h),post:(p,h)=>routes.set('POST '+p,h)};
 registerCodeItemAttributeRoutes(app,new Proxy({},{get(){throw Error('unauthorized database access');}}),{requireOrgRole:async()=>null});
 for(const handler of routes.values())await handler({},{});
});
test('code defaults, company overrides, local types, real customer FKs and expense edits round trip without rewriting history',async()=>{
 const f=await changeApprovalFixture();try{
 const db=f.db;
 for(const [id,code,suffix] of [[1,'VAT','V'],[2,'ZERO','Z'],[3,'EXEMPT','E']])await db.taxTreatment.create({data:{id,code,suffix,nameEn:code,nameKo:code,nameVi:code}});
 const s=await seedChangeApproval(db),org=s.company.id,actor=s.people.admin.id;
 const customer=await db.organization.create({data:{name:'THE SAN',code:'THES',type:'BRAND'}});
 await db.orgRelationship.create({data:{manufacturerOrgId:org,brandOrgId:customer.id}});
 const input=(attributes={})=>({partnerOrgId:s.vendor.id,requestDate:'2026-11-17',clientKey:crypto.randomUUID(),items:[{transactionCodeId:s.code.id,currency:'USD',quantity:'1',unitPrice:'10',vatRate:'0',details:{reference:'LABEL',evidenceFile:'proof.pdf'},...attributes}]});
 const register=body=>db.$transaction(tx=>registerExpenseRequest(tx,org,actor,body),{timeout:30000});
 const legacy=await register(input()),before=await db.partnerTransactionCost.findFirst({where:{expenseRequestId:legacy.id}});
 const base=await db.transactionCodeBase.findUnique({where:{id:s.code.baseId}});
 await db.$transaction(tx=>saveCodeBase(tx,{...base,attributeInputs:modes,industryIds:[base.serviceTypeId],industryRevision:base.industryRevision},base.id));
 const routes=new Map(),app={get:(p,h)=>routes.set('GET '+p,h),post:(p,h)=>routes.set('POST '+p,h)};
 registerCodeItemAttributeRoutes(app,db,{requireOrgRole:async()=>({organization:s.company}),actorId:()=>actor,canAccessCodeItems:async()=>true});
 const call=async(method,path,body={},query={})=>{let result;await routes.get(method+' '+path)({body,query},{json:value=>{result=value;}});return result;};
 const type=await call('POST','/code-item-types',{baseId:base.id,nameEn:'Main',nameKo:'메인',nameVi:'Chính'});
 for(const key of ['nameEn','nameKo','nameVi'])await assert.rejects(call('POST','/code-item-types',{baseId:base.id,nameEn:'Size',nameKo:'사이즈',nameVi:'Kích cỡ',[key]:''}),/INVALID_ITEM_TYPE/);
 assert.equal((await call('POST','/code-item-types',{baseId:base.id,nameEn:' MAIN ',nameKo:'메인',nameVi:'Chính'})).id,type.id);
 const options=await call('GET','/code-item-options',{}, {baseId:base.id,orgId:s.other.id});
 assert.deepEqual(options.customers.map(row=>row.id),[customer.id]);assert.deepEqual(options.types.map(row=>row.id),[type.id]);
 await assert.rejects(register(input()),/REQUIRED_ITEM_CUSTOMER/);
 await assert.rejects(register(input({itemCustomerId:customer.id})),/REQUIRED_ITEM_TYPE/);
 await assert.rejects(register(input({itemCustomerId:s.other.id,itemTypeId:type.id})),/INVALID_ITEM_CUSTOMER/);
 const otherSet=await db.employeeGradeSet.create({data:{orgId:s.other.id,code:'OTHER',name:'Other'}});const otherGrade=await db.employeeGrade.create({data:{orgId:s.other.id,setId:otherSet.id,sortOrder:0,code:'ADMIN',name:'Admin',nameKo:'Admin',nameEn:'Admin',nameVi:'Admin'}});
 const foreign=await db.codeItemType.create({data:{orgId:s.other.id,baseId:base.id,nameKey:'foreign',nameEn:'Foreign',nameKo:'Foreign',nameVi:'Foreign',createdByEmployeeId:(await db.employee.create({data:{orgId:s.other.id,name:'Other',status:'ACTIVE',orgRole:'ADMIN',gradeId:otherGrade.id}})).id}});
 await assert.rejects(register(input({itemCustomerId:customer.id,itemTypeId:foreign.id})),/INVALID_ITEM_TYPE/);
 const body=input({itemCustomerId:customer.id,itemTypeId:type.id}),doc=await register(body);
 assert.equal((await register(body)).id,doc.id,'retry returns original document');
 const cost=doc.items[0];assert.equal(cost.itemCustomerId,customer.id);assert.equal(cost.itemTypeId,type.id);assert.equal(cost.itemAttributeSnapshot.type.nameEn,'Main');
 const original=await db.partnerTransactionCost.findUnique({where:{id:cost.id}});
 await assert.rejects(db.partnerTransactionCost.create({data:{...original,id:undefined,clientKey:crypto.randomUUID(),expenseRequestId:null,expenseRequestLine:null,itemCustomerId:null,itemTypeId:null,itemAttributeSnapshot:undefined}}),/required item attribute/);
 const secondOptions=await call('GET','/code-item-options',{}, {baseId:base.id,orgId:s.other.id});assert.ok(secondOptions.types.every(row=>row.orgId===org));
 const form=expenseEditorForm(await loadExpenseEditorSource(db,org,'request',String(doc.id)));
 assert.equal(form.items[0].itemCustomerId,customer.id);assert.equal(form.items[0].itemTypeId,type.id);assert.equal(form.items[0].itemAttributeSnapshot.customer.name,'THE SAN');
 await assert.rejects(db.partnerTransactionCost.update({where:{id:cost.id},data:{itemTypeId:foreign.id}}));
 await assert.rejects(db.partnerTransactionCost.update({where:{id:cost.id},data:{itemAttributeSnapshot:{type:{nameEn:'Forged'}}}}),/immutable/);
 await assert.rejects(db.codeItemType.update({where:{id:type.id},data:{nameEn:'Changed'}}),/immutable/);
 await db.$transaction(tx=>saveExpenseCodeLinkPolicy(tx,org,actor,base.id,'NONE',{attributeInputs:{customer:'OPTIONAL',type:'HIDDEN'}}));
 await register(input());
 await db.$transaction(tx=>saveExpenseCodeLinkPolicy(tx,org,actor,base.id,'NONE',{requiredFields:[]}));
 const untyped=await register(input()); // A pre-existing company snapshot without attributes stays hidden.
 const untypedCost=await db.partnerTransactionCost.findUnique({where:{id:untyped.items[0].id}});
 await assert.rejects(db.partnerTransactionCost.create({data:{...untypedCost,id:undefined,expenseRequestId:null,expenseRequestLine:null,clientKey:crypto.randomUUID(),itemTypeId:type.id}}),/unexpected item attribute/);
 assert.deepEqual(await db.partnerTransactionCost.findUnique({where:{id:before.id}}),before);
 const migration=readFileSync('backend/prisma/migrations/20261117110000_code_item_attributes/migration.sql','utf8');await f.pg.exec(migration);await f.pg.exec(migration);
 assert.deepEqual(await db.partnerTransactionCost.findUnique({where:{id:before.id}}),before);
 const check=await db.$queryRawUnsafe('SELECT baro_accounting_inputs_valid($1::jsonb) AS valid',JSON.stringify({...accountingInputs({}),attributeInputs:{type:'BAD'}}));assert.equal(check[0].valid,false);
 }finally{await f.close();}
});
