import test from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {randomUUID} from 'node:crypto';
import {readFileSync} from 'node:fs';
import {changeApprovalFixture,seedChangeApproval} from './helpers/change-approval-fixture.mjs';
import {expensePaymentChecks} from '../frontend/src/utils/expensePaymentChecks.mjs';
import {seedExpenseVariant} from './helpers/expense-variant-fixture.mjs';
const require=createRequire(import.meta.url);
const {registerExpenseRequest}=require('../backend/dist/services/expenseRequest');
const {registerMaterialItemRoutes,systemMaterialOptions}=require('../backend/dist/services/materialItems');
const {registerInventoryVariantRoutes}=require('../backend/dist/services/inventoryVariants');
const {postLedgerEntry}=require('../backend/dist/services/bankLedger');
const {expensePaymentComparison}=require('../backend/dist/services/expensePaymentComparison');
const {listAccountingAlerts,acknowledgeAccountingAlert}=require('../backend/dist/services/accountingAlerts');

test('material expense selects a real registered variant; VAT payments require difference reasons and create scoped alerts',async()=>{
 const f=await changeApprovalFixture();try{
  const db=f.db,s=await seedChangeApproval(db),org=s.company.id,actor=s.people.admin.id;
  const migration=readFileSync('backend/prisma/migrations/20261121010000_expense_material_payment_checks/migration.sql','utf8');
  await f.pg.exec(migration);await f.pg.exec(migration);
  const base=await db.transactionCodeBase.findUnique({where:{id:s.code.baseId}});
  await db.accountingCodeIndustry.create({data:{baseId:base.id,systemIndustryId:base.serviceTypeId}});
  await db.settingServiceDefault.update({where:{id:base.serviceTypeId},data:{materialManagement:true}});
  const unit=await db.expenseUnit.create({data:{code:'BOX',nameEn:'Box',nameKo:'박스',nameVi:'Thùng'}});
  await db.transactionCodeBase.update({where:{id:base.id},data:{materialUnitId:unit.id,materialSettings:{enabled:true,stockFields:['unit'],unitInput:'REQUIRED',colorInput:'HIDDEN',masterInputs:{owner:'REQUIRED',type:'HIDDEN',color:'HIDDEN'}}}});
  const tax=await db.taxTreatment.create({data:{id:1,code:'VAT',suffix:'V',nameEn:'VAT',nameKo:'부가세',nameVi:'VAT'}});
  const template=await db.settingTransactionCodeDefault.create({data:{code:'TSTV',nameEn:'Cartons VAT',nameKo:'카톤 박스',nameVi:'Thùng carton',baseId:base.id,serviceTypeId:base.serviceTypeId,taxTreatmentId:tax.id}});
  const code=await db.transactionCode.create({data:{ownerOrgId:org,serviceTypeId:s.code.serviceTypeId,baseId:base.id,systemDefaultId:template.id,taxTreatmentId:tax.id,vatEnabled:true,code:'TSTV',nameEn:'Cartons VAT',nameKo:'카톤 박스',nameVi:'Thùng carton'}});
  const routes=new Map(),app=Object.fromEntries(['get','post','put','delete'].map(method=>[method,(path,h)=>routes.set(method+path,h)]));
  registerInventoryVariantRoutes(app,db,async()=>({orgId:org,actorId:actor}));
  const call=async(method,path,req)=>{let result;await routes.get(method+path)(req,{json(v){result=v;},status(){return this;}});return result;};
  const [master]=await systemMaterialOptions(db,org,base.id);
  const variant=await call('post','/material-items/variants',{body:{clientKey:randomUUID(),baseId:base.id,masterId:master.id,ownerId:org,typeId:null,colorId:null}});
  const [saved]=await db.$queryRaw`SELECT * FROM "InventoryVariant" WHERE id=${variant.id}`;
  const item={transactionCodeId:code.id,materialItemId:saved.masterId,materialVariantId:variant.id,materialVariantRevision:variant.revision,unitId:unit.id,currency:'USD',quantity:'10',unitPrice:'10',vatRate:'8',details:{evidenceFile:'cartons.pdf'}};
  const create=items=>db.$transaction(tx=>registerExpenseRequest(tx,org,actor,{clientKey:randomUUID(),partnerOrgId:s.vendor.id,requestDate:'2026-11-20',items}));
  await assert.rejects(create([{...item,materialVariantId:null}]),/MATERIAL_ITEM_REQUIRED/);
  await assert.rejects(create([{...item,materialVariantRevision:99}]),/ACCOUNTING_INDUSTRY_CHANGED/);
  const doc=await create([item]),cost=await db.partnerTransactionCost.findFirst({where:{expenseRequestId:doc.id}});
  assert.equal(cost.materialItemSnapshot.variantId,variant.id);
  assert.equal(cost.materialItemSnapshot.itemOwnerOrgId,org);
  assert.equal((await db.$queryRaw`SELECT "materialVariantId" FROM "PartnerTransactionCost" WHERE id=${cost.id}`)[0].materialVariantId,variant.id);
  await assert.rejects(call('delete','/material-items/variants/:id',{params:{id:variant.id},body:{revision:1}}),/VARIANT_IN_USE/);
  await assert.rejects(db.$executeRaw`DELETE FROM "InventoryVariant" WHERE id=${variant.id}`,/VARIANT_IN_USE/);
  const options=new Map();registerMaterialItemRoutes(Object.fromEntries(['get','post','put','delete'].map(method=>[method,(path,h)=>options.set(method+path,h)])),db,{requireOrgRole:async()=>({organization:s.company}),actorId:()=>actor,canAccessCodeItems:async()=>true});
  let selected;await options.get('get/material-items/options')({query:{baseId:base.id,variants:'1',orgId:s.other.id}},{json(v){selected=v;}});
  assert.equal(selected[0].variantId,variant.id);assert.equal(selected[0].id,cost.materialItemId);
  const payment=amount=>({clientKey:randomUUID(),transactionDate:'2026-11-20',direction:'OUT',amount,accountingCodeId:code.id,evidenceType:'EXPENSE',expenseRequestId:doc.id,expenseVersion:doc.version,expenseItems:[{itemId:cost.id,amount}],counterparty:{kind:'PARTNER',id:s.vendor.id}});
  await assert.rejects(postLedgerEntry(db,org,'admin@example.test',s.account.id,payment('100')),/LEDGER_EXPENSE_DIFFERENCE_REASON_REQUIRED/);
  await assert.rejects(postLedgerEntry(db,org,'admin@example.test',s.account.id,{...payment('108'),expenseItems:[{itemId:cost.id,amount:'108',subtotal:'108',vatRate:'0',vatAmount:'0'}]}),/LEDGER_EXPENSE_VAT_MISMATCH/);
  await assert.rejects(postLedgerEntry(db,org,'admin@example.test',s.account.id,{...payment('108'),accountingCodeId:s.code.id}),/LEDGER_EXPENSE_VAT_MISMATCH/);
  const partial=await postLedgerEntry(db,org,'admin@example.test',s.account.id,{...payment('54'),remark:'First half; remainder after delivery'});
  assert.equal(partial.expenseComparison.expected,'108');assert.equal(partial.expenseComparison.actual,'54');assert.equal(partial.expenseComparison.differs,true);
  const allocation=await db.bankLedgerEvidenceAllocation.findFirst({where:{entryId:partial.id}});
  assert.equal(String(allocation.vatRate),'8');assert.equal(String(allocation.subtotal),'50');assert.equal(String(allocation.vatAmount),'4');
  const permissions={ledger:true,expense:true,invoice:true},query={kinds:'EXPENSE_PAYMENT_DIFFERENCE'};
  const alerts=await listAccountingAlerts(db,org,actor,permissions,query);assert.equal(alerts.total,1);assert.equal(alerts.rows[0].comparison.reason,'First half; remainder after delivery');
  assert.equal((await listAccountingAlerts(db,org,actor,{...permissions,ledger:false},query)).total,0);
  await assert.rejects(listAccountingAlerts(db,s.other.id,actor,permissions,query),/ACCESS_DENIED/);
  await acknowledgeAccountingAlert(db,org,actor,permissions,alerts.rows[0].signature);
  assert.equal((await listAccountingAlerts(db,org,actor,permissions,query)).total,0);
  assert.equal((await listAccountingAlerts(db,org,s.people.senior.id,permissions,query)).total,1);
  const rest=await postLedgerEntry(db,org,'admin@example.test',s.account.id,payment('54'));
  assert.equal(rest.expenseComparison.differs,false);assert.equal(rest.expenseComparison.expected,'54');
  const correction=await expensePaymentComparison(db,org,{...payment('54'),remark:'Original partial payment'},'USD',partial.id);
  assert.equal(correction.expected,'108','an edit retains the original comparison even after subsequent payments');
  assert.equal(correction.differs,true);
  await assert.rejects(db.bankLedgerEntry.update({where:{id:partial.id},data:{expenseComparison:{...partial.expenseComparison,reason:'Forged'}}}),/immutable/i);
  assert.equal((await listAccountingAlerts(db,org,s.people.senior.id,permissions,query)).total,1,'later payments do not rewrite the original difference');
  await assert.rejects(postLedgerEntry(db,org,'admin@example.test',s.account.id,{...payment('1'),remark:'Excess'}),/LEDGER_EXCEEDS_DOCUMENT/);
  const scheduleIds=[randomUUID(),randomUUID()];
  const scheduled=await create([{...item,paymentSchedule:scheduleIds.map((id,index)=>({id,label:String(index+1),scheduledDate:'2026-11-20',currency:'USD',amount:'54'}))}]);
  const planned={...payment('54'),expenseRequestId:scheduled.id,expenseVersion:scheduled.version,paymentScheduleId:scheduleIds[0],expenseItems:[{itemId:scheduled.items[0].id,amount:'54'}]};
  const scheduledPayment=await postLedgerEntry(db,org,'admin@example.test',s.account.id,planned);
  assert.equal(scheduledPayment.expenseComparison.expected,'54');assert.equal(scheduledPayment.expenseComparison.differs,false);
 }finally{await f.close();}
});

test('input comparison uses selected instalment gross, preserves decimals and separates currencies',()=>{
 const row={entryKind:'BANK',evidenceType:'EXPENSE',paymentScheduleId:'s',expenseItems:[{itemId:'i',amount:'54',vatRate:'8'}],document:{items:[{id:'i',remaining:'108',vatRate:'8'}],paymentSchedule:[{id:'s',remaining:'54'}]}};
 assert.deepEqual(expensePaymentChecks([row]),{vat:true,difference:false});
 assert.equal(expensePaymentChecks([{...row,paymentScheduleId:''}]).difference,true);
 assert.equal(expensePaymentChecks([{...row,expenseItems:[{itemId:'i',amount:'53.99'}]}]).difference,true);
 const historical={...row,paymentScheduleId:'',expenseComparison:{version:1,paymentScheduleId:null,items:[{itemId:'i',expected:'108'}]},document:{items:[{id:'i',remaining:'54'}]}};
 assert.equal(expensePaymentChecks([historical]).difference,true);
 assert.deepEqual(expensePaymentChecks([{...row,evidenceType:'FILE'}]),{vat:false,difference:false});
});

test('direct file evidence links the real variant and protects items referenced only by a ledger entry',async()=>{
 const f=await changeApprovalFixture();try{
  const db=f.db,s=await seedChangeApproval(db),org=s.company.id,actor=s.people.admin.id;
  const base=await db.transactionCodeBase.findUnique({where:{id:s.code.baseId}}),unit=await db.expenseUnit.create({data:{code:'FILEBOX',nameEn:'Box',nameKo:'박스',nameVi:'Thùng'}});
  await db.accountingCodeIndustry.create({data:{baseId:base.id,systemIndustryId:base.serviceTypeId}});
  await db.settingServiceDefault.update({where:{id:base.serviceTypeId},data:{materialManagement:true}});
  await db.transactionCodeBase.update({where:{id:base.id},data:{materialUnitId:unit.id,materialSettings:{enabled:true,stockFields:['unit'],unitInput:'REQUIRED',colorInput:'HIDDEN',masterInputs:{owner:'REQUIRED',type:'HIDDEN',color:'HIDDEN'}}}});
  const [system]=await systemMaterialOptions(db,org,base.id),selection=await seedExpenseVariant(db,s,system.id);
  const body={clientKey:randomUUID(),transactionDate:'2026-11-20',direction:'OUT',amount:'10',accountingCodeId:s.code.id,evidenceType:'FILE',evidenceNumber:'carton.pdf',counterparty:{kind:'PARTNER',id:s.vendor.id},...selection};
  const entry=await postLedgerEntry(db,org,'admin@example.test',s.account.id,body);
  assert.equal(entry.materialItemSnapshot.variantId,selection.materialVariantId);assert.equal(await db.partnerTransactionCost.count(),0);
  assert.equal((await db.$queryRaw`SELECT "materialVariantId" FROM "BankLedgerEntry" WHERE id=${entry.id}`)[0].materialVariantId,selection.materialVariantId);
  const routes=new Map();registerInventoryVariantRoutes(Object.fromEntries(['get','post','put','delete'].map(method=>[method,(path,h)=>routes.set(method+path,h)])),db,async()=>({orgId:org,actorId:actor}));
  await assert.rejects(routes.get('delete/material-items/variants/:id')({params:{id:selection.materialVariantId},body:{revision:1}},{json(){}}),/VARIANT_IN_USE/);
  await assert.rejects(db.$executeRaw`DELETE FROM "InventoryVariant" WHERE id=${selection.materialVariantId}`,/VARIANT_IN_USE/);
  await assert.rejects(postLedgerEntry(db,org,'admin@example.test',s.account.id,{...body,materialVariantId:'forged'}),/LEDGER_RETRY_CONFLICT/);
 }finally{await f.close();}
});
