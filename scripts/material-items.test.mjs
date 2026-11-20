import {seedExpenseVariant} from './helpers/expense-variant-fixture.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {randomUUID} from 'node:crypto';
import {readFileSync} from 'node:fs';
import {changeApprovalFixture,seedChangeApproval} from './helpers/change-approval-fixture.mjs';
import {seedInventoryPurchase} from './helpers/inventory-purchase-fixture.mjs';
const require=createRequire(import.meta.url),{registerMaterialItem,prepareMaterialSelection,registerMaterialItemRoutes}=require('../backend/dist/services/materialItems');
const {registerInventoryMovementRoutes}=require('../backend/dist/services/inventoryMovements');
const {registerExpenseRequest}=require('../backend/dist/services/expenseRequest');
const {postLedgerEntry}=require('../backend/dist/services/bankLedger');
const {loadExpenseEditorSource,expenseEditorForm}=require('../backend/dist/services/expenseRequestEditor');
const {readLedgerEdit}=require('../backend/dist/services/bankLedgerEdit');
const {requestChangeApproval,decideChangeApproval}=require('../backend/dist/services/changeApprovals');
const {saveCodeBase}=require('../backend/dist/services/codeBaseManagement');
test('system units resolve during variant registration; new expenses require a real registered item',async()=>{
 const f=await changeApprovalFixture();try{
  const db=f.db,s=await seedChangeApproval(db),org=s.company.id,actor=s.people.admin.id;
  const {systemMaterialOptions,resolveSystemMaterialMaster}=require('../backend/dist/services/materialItems');
  const base=await db.transactionCodeBase.findUnique({where:{id:s.code.baseId}});
  await db.accountingCodeIndustry.create({data:{baseId:base.id,systemIndustryId:base.serviceTypeId}});
  await db.settingServiceDefault.update({where:{id:base.serviceTypeId},data:{materialManagement:true,materialManagementRevision:{increment:1}}});
  const unit=await db.expenseUnit.create({data:{code:'SYSUNIT',nameKo:'개',nameEn:'Each',nameVi:'Cái'}});
  await db.transactionCodeBase.update({where:{id:base.id},data:{materialUnitId:unit.id,materialSettings:{enabled:true,stockFields:['unit'],unitInput:'REQUIRED',colorInput:'HIDDEN',masterInputs:{owner:'REQUIRED',type:'HIDDEN',color:'HIDDEN'}},materialRevision:{increment:1}}});
  const [option]=await systemMaterialOptions(db,org);assert.ok(option.id.startsWith('system:'));assert.equal(await db.materialItem.count(),0);
  const selection=await seedExpenseVariant(db,s,option.id);
  const doc=await db.$transaction(tx=>registerExpenseRequest(tx,org,actor,{partnerOrgId:s.vendor.id,requestDate:'2026-11-20',clientKey:randomUUID(),items:[{transactionCodeId:s.code.id,...selection,unitId:unit.id,currency:'USD',quantity:'10',unitPrice:'1',vatRate:'0',details:{evidenceFile:'purchase.pdf'}}]}));
  const cost=await db.partnerTransactionCost.findFirst({where:{expenseRequestId:doc.id}});
  assert.ok(cost.materialItemId&&!cost.materialItemId.startsWith('system:'));assert.equal(cost.unitId,unit.id);assert.equal(await db.materialItem.count(),1);
  await db.transactionCodeBase.update({where:{id:base.id},data:{materialRevision:{increment:1}}});
  await assert.rejects(db.$transaction(tx=>resolveSystemMaterialMaster(tx,org,option.id,true,actor)),/ACCOUNTING_INDUSTRY_CHANGED/);
  assert.equal(await db.materialItem.count(),1,'stale system selection creates no extra company rows');
 }finally{await f.close();}
});
const {registerCodeItemAttributeRoutes}=require('../backend/dist/services/codeItemAttributes');
test('material routes reject missing company access before reading any data',async()=>{
 const routes=[];registerMaterialItemRoutes(Object.fromEntries(['get','post','put','delete'].map(method=>[method,(_p,h)=>routes.push(h)])),new Proxy({},{get(){throw Error('unauthorized database access');}}),{requireOrgRole:async()=>null});
 for(const route of routes)await route({},{});
});

test('legacy exemption only applies while retaining the original code',async()=>{
 const code={id:2,base:{materialSettings:{enabled:true}}};
 assert.deepEqual(await prepareMaterialSelection({},1,code,{}, {transactionCodeId:2,materialItemId:null}),{});
 await assert.rejects(prepareMaterialSelection({},1,code,{}, {transactionCodeId:1,materialItemId:null}),/MATERIAL_ITEM_REQUIRED/);
});
test('registered material identity and snapshots flow to expenses and direct bank entries; no stock is written',async()=>{
 const f=await changeApprovalFixture();try{
  const db=f.db;for(const [id,code,suffix] of [[1,'VAT','V'],[2,'ZERO','Z'],[3,'EXEMPT','E']])await db.taxTreatment.upsert({where:{id},create:{id,code,suffix,nameKo:code,nameEn:code,nameVi:code},update:{}});
  const s=await seedChangeApproval(db),org=s.company.id,actor=s.people.admin.id;
  const legacy=await db.$transaction(tx=>registerExpenseRequest(tx,org,actor,{partnerOrgId:s.vendor.id,requestDate:'2026-11-18',clientKey:randomUUID(),items:[{transactionCodeId:s.code.id,currency:'USD',quantity:'1',unitPrice:'1',vatRate:'0',details:{evidenceFile:'legacy.pdf'}}]}));
  const legacyBankBody={clientKey:randomUUID(),transactionDate:'2026-11-18',direction:'OUT',amount:'1',purpose:'Legacy',accountingCodeId:s.code.id,evidenceType:'FILE',evidenceNumber:'legacy.pdf',counterparty:{kind:'PARTNER',id:s.vendor.id}};
  const legacyBank=await postLedgerEntry(db,org,'admin@example.test',s.account.id,legacyBankBody);
  const base=await db.transactionCodeBase.findUnique({where:{id:s.code.baseId}});
  await db.accountingCodeIndustry.upsert({where:{baseId_systemIndustryId:{baseId:base.id,systemIndustryId:base.serviceTypeId}},create:{baseId:base.id,systemIndustryId:base.serviceTypeId},update:{}});
  const industry=await db.settingServiceDefault.update({where:{id:base.serviceTypeId},data:{materialManagement:true,materialManagementRevision:{increment:1}}});
  const configured=await db.transactionCodeBase.update({where:{id:base.id},data:{attributeInputs:{},requiredFields:[],materialSettings:{enabled:true,stockFields:['unit'],colorInput:'HIDDEN',unitInput:'REQUIRED',masterInputs:{owner:'REQUIRED',dimensions:'REQUIRED',type:'HIDDEN',color:'HIDDEN',customer:'REQUIRED'}},materialRevision:{increment:1}}});
  const oldForm=expenseEditorForm(await loadExpenseEditorSource(db,org,'request',String(legacy.id)));
  const oldChange=await requestChangeApproval(db,org,actor,{menu:'EXPENSE',operation:'UPDATE',reason:'Update old evidence without inventing material',sourceKind:'request',sourceId:String(legacy.id),revision:oldForm.revision,payload:{...oldForm,clientKey:randomUUID(),remark:'Kept legacy material fields'},selection:{},clientKey:randomUUID()});
  if(oldChange.status!=='APPROVED')await decideChangeApproval(db,org,actor,oldChange.id,{decision:'APPROVED'});
  assert.equal((await db.partnerTransactionCost.findFirst({where:{expenseRequestId:legacy.id}})).materialItemId,null);
  const reviewer=await db.employee.create({data:{orgId:org,name:'Material reviewer',orgRole:'ADMIN',gradeId:s.people.admin.gradeId,status:'ACTIVE'}});
  const oldLedger=await readLedgerEdit(db,org,legacyBank.id);
  const ledgerChange=await requestChangeApproval(db,org,actor,{menu:'BANK_LEDGER',operation:'UPDATE',reason:'Preserve old bank material identity',sourceKind:'ledger',sourceId:legacyBank.id,revision:oldLedger.revision,selection:{changeAdminEmployeeId:reviewer.id,step1EmployeeId:s.people.junior.id,step2EmployeeId:s.people.lead.id},clientKey:randomUUID(),payload:{schemaVersion:2,accountingCodeVersion:1,clientKey:randomUUID(),rows:[{...legacyBankBody,clientKey:randomUUID(),entryKind:'BANK',accountId:s.account.id,purpose:'Legacy updated'}]}});
  if(ledgerChange.status!=='APPROVED')for(const stage of ledgerChange.policy.resolvedStages)await decideChangeApproval(db,org,stage.employeeId,ledgerChange.id,{decision:'APPROVED'});
  assert.equal(await db.bankLedgerEntry.count({where:{orgId:org,revisesEntryId:legacyBank.id,materialItemId:null}}),1);
  const unit=await db.expenseUnit.create({data:{code:'TEST_UNIT',nameKo:'개',nameEn:'Each',nameVi:'Cái'}});
  const body={clientKey:randomUUID(),policyAuditId:null,baseId:base.id,nameKo:'테스트 박스',nameEn:'TEST BOX',nameVi:'Hộp thử',unitId:unit.id,details:{length:'100',width:'200',height:'300'},materialRevision:configured.materialRevision,industryRevision:industry.materialManagementRevision};
  const stockMigration=readFileSync('backend/prisma/migrations/20261120030000_inventory_movements/migration.sql','utf8');
  await f.pg.exec(stockMigration);
  const rollback=new Error('rollback test master');
  await assert.rejects(db.$transaction(async tx=>{
   const shared=await registerMaterialItem(tx,org,actor,{...body,sharedMaster:true,details:{}});
   assert.equal(shared.data.sharedMaster,true);
   assert.deepEqual(shared.data.details,{});
   assert.deepEqual(shared.data.inputSettings.requiredFields,[]);
   await assert.rejects(registerMaterialItem(tx,org,actor,{...body,clientKey:randomUUID(),sharedMaster:true,details:{}}),/MATERIAL_ITEM_DUPLICATE/);
   throw rollback;
  }),error=>error===rollback);
  const create=body=>db.$transaction(tx=>registerMaterialItem(tx,org,actor,body));
  await assert.rejects(create({...body,clientKey:randomUUID(),itemOwnerOrgId:org}),/INVALID_MATERIAL_ITEM/);
  await assert.rejects(create({...body,clientKey:randomUUID(),details:{length:'100',width:'200'}}),/INVALID_MATERIAL_DIMENSIONS/);
  const item=await create(body);assert.equal((await create(body)).id,item.id);
  assert.equal(item.customerId,null);assert.equal(item.data.inputSettings.attributeInputs.customer,'HIDDEN','legacy customer requirements do not apply to new material registrations');
  assert.deepEqual(configured.requiredFields,[]);assert.deepEqual(configured.attributeInputs,{});
  assert.deepEqual(item.data.inputSettings.requiredFields,['length','width']);
  const routes=new Map(),app=Object.fromEntries(['get','post','put','delete'].map(method=>[method,(path,handler)=>routes.set(method.toUpperCase()+' '+path,handler)])),features=[];
  const gates={requireOrgRole:async()=>({organization:s.company}),actorId:()=>actor,canAccessCodeItems:async scope=>{features.push(scope.feature);return true;}};
  registerMaterialItemRoutes(app,db,gates);registerCodeItemAttributeRoutes(app,db,gates);
  let own;await routes.get('GET /material-items/options')({query:{orgId:s.other.id,baseId:base.id,context:'LEDGER'}},{json:rows=>{own=rows;}});assert.equal(own.length,1);assert.equal(own[0].orgId,org);
  assert.equal(item.ownerOrgId,null);assert.equal(item.typeId,null);
  await routes.get('GET /code-item-options')({query:{orgId:s.other.id,baseId:base.id,context:'MATERIAL'}},{json:()=>{}});assert.ok(features.includes('BANK_LEDGER'));assert.ok(features.includes('INVENTORY_MATERIALS'));
  let detail;await routes.get('POST /code-item-types')({query:{context:'MATERIAL'},body:{baseId:base.id,nameEn:'MAIN',nameKo:'메인',nameVi:'Nhãn chính'}},{json:row=>{detail=row;}});assert.equal(detail.orgId,org);assert.equal(detail.baseId,base.id);assert.equal(detail.nameKo,'메인');
  await assert.rejects(create({...body,clientKey:randomUUID(),details:{length:'100.00',width:'200',height:'300'}}),error=>error.code==='P2002');
  await assert.rejects(create({...body,clientKey:randomUUID(),materialRevision:0}),/ACCOUNTING_INDUSTRY_CHANGED/);
  const expenseSelection=await seedExpenseVariant(db,s,item.id);
  const input=()=>({partnerOrgId:s.vendor.id,requestDate:'2026-11-19',clientKey:randomUUID(),items:[{transactionCodeId:s.code.id,...expenseSelection,currency:'USD',quantity:'1',unitPrice:'10',vatRate:'0',details:{evidenceFile:'receipt.pdf'}}]});
  await assert.rejects(db.$transaction(tx=>registerExpenseRequest(tx,org,actor,{...input(),items:[{...input().items[0],materialItemId:null,materialVariantId:null}]})),/MATERIAL_ITEM_REQUIRED/);
  const doc=await db.$transaction(tx=>registerExpenseRequest(tx,org,actor,input()));
  const cost=await db.partnerTransactionCost.findFirst({where:{expenseRequestId:doc.id}});
  assert.equal(cost.materialItemId,item.id);assert.equal(cost.unitId,unit.id);assert.equal(cost.itemOwnerOrgId,org);assert.equal(cost.details.height,undefined);assert.equal(cost.materialItemSnapshot.nameEn,base.nameEn);
  const form=expenseEditorForm(await loadExpenseEditorSource(db,org,'request',String(doc.id)));assert.equal(form.items[0].materialItemId,item.id);assert.deepEqual(form.items[0].materialItemSnapshot,cost.materialItemSnapshot);
  const bank={clientKey:randomUUID(),transactionDate:'2026-11-19',direction:'OUT',amount:'10',purpose:'Material purchase',accountingCodeId:s.code.id,evidenceType:'FILE',evidenceNumber:'receipt.pdf',counterparty:{kind:'PARTNER',id:s.vendor.id},materialItemId:item.id};
  const entry=await postLedgerEntry(db,org,'admin@example.test',s.account.id,bank);assert.equal(entry.materialItemId,item.id);assert.equal(entry.materialItemSnapshot.variantId,undefined);assert.equal(cost.materialItemSnapshot.variantId,expenseSelection.materialVariantId);
  assert.equal((await postLedgerEntry(db,org,'admin@example.test',s.account.id,bank)).id,entry.id);
  await assert.rejects(db.$transaction(tx=>prepareMaterialSelection(tx,s.other.id,{...s.code,base:{materialSettings:{enabled:true}}},{materialItemId:item.id})),/INVALID_MATERIAL_ITEM/);
  await assert.rejects(db.materialItem.update({where:{id:item.id},data:{data:{nameEn:'FORGED'}}}),/immutable/);
  await assert.rejects(db.partnerTransactionCost.update({where:{id:cost.id},data:{materialItemSnapshot:{nameEn:'FORGED'}}}),/snapshot/);
  await assert.rejects(db.settingServiceDefault.update({where:{id:industry.id},data:{materialManagement:false}}),/registered material/);
  await assert.rejects(db.transactionCodeBase.update({where:{id:base.id},data:{materialSettings:{enabled:false,stockFields:[],colorInput:'HIDDEN',unitInput:'REQUIRED'}}}),/registered material/);
  const original=await db.partnerTransactionCost.findUnique({where:{id:cost.id}});
  const codeUpdate={...configured,nameEn:'Renamed material category',industryIds:[industry.id],industryRevision:configured.industryRevision};
  await assert.rejects(db.$transaction(tx=>saveCodeBase(tx,codeUpdate,base.id)),/MATERIAL_CODE_UNIT_REQUIRED/);
  const updatedCode=await db.$transaction(tx=>saveCodeBase(tx,{...codeUpdate,materialUnitId:unit.id},base.id));
  assert.equal(updatedCode.materialUnitId,unit.id);
  assert.deepEqual((await db.materialItem.findUnique({where:{id:item.id}})).data,item.data,'renaming the code preserves the registered master and its original industry FK');
  const current=await db.transactionCodeBase.findUnique({where:{id:base.id}});
  const generated=await create({...body,clientKey:randomUUID(),nameEn:'',nameKo:'',nameVi:'',materialRevision:current.materialRevision});
  assert.equal(generated.data.nameEn,'Renamed material category');assert.equal(generated.ownerOrgId,null);assert.equal(generated.data.details.height,'300');
  const purchasePolicy=await db.$transaction(tx=>require('../backend/dist/services/expenseCodeLinkPolicy').saveExpenseCodeLinkPolicy(tx,org,actor,base.id,'NONE'));
  body.policyAuditId=purchasePolicy.auditId;
  const purchase=await seedInventoryPurchase(db,s,generated.id);
  const separationMigration=readFileSync('backend/prisma/migrations/20261119150000_material_master_inputs/migration.sql','utf8');await f.pg.exec(separationMigration);await f.pg.exec(separationMigration);
  const noCustomerMigration=readFileSync('backend/prisma/migrations/20261119190000_material_master_no_customer/migration.sql','utf8');await f.pg.exec(noCustomerMigration);await f.pg.exec(noCustomerMigration);
  const definitionMigration=readFileSync('backend/prisma/migrations/20261120010000_material_master_without_movement_attributes/migration.sql','utf8');await f.pg.exec(definitionMigration);await f.pg.exec(definitionMigration);
  const colorMigration=readFileSync('backend/prisma/migrations/20261120020000_material_master_without_color/migration.sql','utf8');await f.pg.exec(colorMigration);await f.pg.exec(colorMigration);
  const settings=await db.transactionCodeBase.update({where:{id:base.id},data:{
   materialSettings:{...current.materialSettings,masterInputs:{...current.materialSettings.masterInputs,color:'REQUIRED'}},
   materialRevision:{increment:1},
  }});
  const colorless={...body,clientKey:randomUUID(),materialRevision:settings.materialRevision,details:{...body.details,height:'301'}};
  assert.equal((await create(colorless)).colorId,null);
  await assert.rejects(create({...colorless,clientKey:randomUUID(),colorId:1}),/INVALID_MATERIAL_COLOR/);
  const migration=readFileSync('backend/prisma/migrations/20261119120000_material_item_master/migration.sql','utf8');await f.pg.exec(migration);await f.pg.exec(migration);
  await f.pg.exec(stockMigration);await f.pg.exec(stockMigration);
  await db.transactionCodeBase.update({where:{id:base.id},data:{
   materialSettings:{...settings.materialSettings,masterInputs:{...settings.materialSettings.masterInputs,color:'HIDDEN'}},
   materialRevision:{increment:1},
  }});
  const movementRoutes={};
  await db.systemSetting.create({data:{key:`APPROVAL_POLICY:INVENTORY:CREATE:${org}`,value:{revision:1,drafterRoles:['ADMIN'],approverIds:[reviewer.id]}}});
  registerInventoryMovementRoutes({get:(path,fn)=>{movementRoutes[path]=fn;},post:(path,fn)=>{movementRoutes[path]=fn;}},db,async req=>({orgId:req.orgId||org,actorId:req.actorId||actor}));
  const call=async(path,req)=>{let data;await movementRoutes[path]({query:{},...req},{status(){return this;},json(body){data=body;}});return data;};
  const approve=async id=>call('/inventory-entry/approvals/:id/decision',{actorId:reviewer.id,params:{id},body:{revision:1,decision:'APPROVED'}});
  const receipt={clientKey:randomUUID(),masterId:generated.id,ownerId:org,dimensions:{},date:'2026-11-20',quantity:'10',remark:'',approvalRevision:1,...purchase};
  const first=await call('/inventory-entry',{body:receipt});
  assert.deepEqual(await call('/inventory-entry',{body:receipt}),first);
  await assert.rejects(call('/inventory-entry',{body:{...receipt,quantity:'11'}}),/INVENTORY_RETRY_MISMATCH/);
  await approve(first.id);
  const second=await call('/inventory-entry',{body:{...receipt,clientKey:randomUUID(),ownerId:s.vendor.id,quantity:'25',expenseItemId:null,expenseRequestVersion:null}});await approve(second.id);
  const options=await call('/inventory-entry/options',{query:{masterId:generated.id}});
  assert.equal(options.variants.length,2);
  const ownVariant=options.variants.find(row=>row.attributes.owner.id===org);
  const issue=await call('/inventory-entry',{body:{...receipt,clientKey:randomUUID(),variantId:ownVariant.id,quantity:'-3',expenseItemId:null,expenseRequestVersion:null}});await approve(issue.id);
  const stock=await call('/inventory-entry/stock',{});
  assert.deepEqual(stock.map(row=>Number(row.quantity)).sort((a,b)=>a-b),[7,25]);
  let variants;
  await routes.get('GET /material-items/variants')({query:{orgId:s.other.id}},{json:value=>{variants=value;}});
  variants=variants.filter(row=>row.masterId===generated.id);assert.equal(variants.length,2);
  assert.ok(variants.every(row=>row.baseId===base.id&&row.masterId===generated.id));
  assert.deepEqual(variants.map(row=>row.ownerId).sort((a,b)=>a-b),[org,s.vendor.id].sort((a,b)=>a-b));
  assert.ok(variants.every(row=>!('quantity' in row)&&!('purchaseSnapshot' in row)&&!('orgId' in row)), 'master browsing returns item definitions without movement or financial data');
  assert.equal((await call('/inventory-entry/history',{})).length,3);
  assert.deepEqual(await call('/inventory-entry/stock',{orgId:s.vendor.id}),[]);
  assert.deepEqual(await db.partnerTransactionCost.findUnique({where:{id:cost.id}}),original);
 }finally{await f.close();}
});
