import test from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {randomUUID} from 'node:crypto';
import {changeApprovalFixture,seedChangeApproval} from './helpers/change-approval-fixture.mjs';
const require=createRequire(import.meta.url);
const {shippingGeneralCustomer,shippingGeneralCustomerId,attachShippingGeneralCustomer}=require('../backend/dist/services/shippingGeneralCustomer');
const {accountingAlertKinds,accountingAlertCandidates}=require('../backend/dist/services/accountingAlerts');
const {postLedgerEntry}=require('../backend/dist/services/bankLedger');
const {registerExpenseRequest}=require('../backend/dist/services/expenseRequest');
const {saveClassification}=require('../backend/dist/services/partnerClassification');
const {ledgerCounterpartyOptions}=require('../backend/dist/services/ledgerCounterparty');
const {registerExpensePayeeRoutes}=require('../backend/dist/services/expensePayee');

test('EXP variants exempt only a verified general-customer FK from industry alerts; direction and other codes remain checked',()=>{
 const party={id:7,name:'특송 일반 고객',code:'EXGC',isShippingGeneralCustomer:true,classification:{industryIds:[9]}};
 for(const suffix of ['E','V','Z']){
  const source={partyId:7,direction:'IN',code:{code:'EXP'+suffix,base:{code:'EXP',cashDirection:'OUT',industryLinks:[{systemIndustryId:2}]}}};
  assert.deepEqual(accountingAlertKinds(source,party,7),['DIRECTION']);
  assert.deepEqual(accountingAlertKinds(source,party),['DIRECTION','PARTNER_INDUSTRY'],'labels/flags do not grant a server exception');
  assert.deepEqual(accountingAlertKinds(source,party,8),['DIRECTION','PARTNER_INDUSTRY']);
  assert.deepEqual(accountingAlertKinds({...source,code:{...source.code,base:{...source.code.base,code:'TRK'}}},party,7),['DIRECTION','PARTNER_INDUSTRY']);
 }
});

test('real scoped general customer uses EXP in expenses and cash without false industry alerts, with read-only labels and preserved history',async()=>{
 const f=await changeApprovalFixture(),db=f.db;
 try{
  const s=await seedChangeApproval(db),org=s.company.id,actor=s.people.admin.id;
  const id=await db.$transaction(tx=>shippingGeneralCustomer(tx,org,actor,null,true));
  const before=await db.organization.findUnique({where:{id}});
  const projected=await attachShippingGeneralCustomer(db,org,[before,{id:s.vendor.id,name:'특송 일반 고객',code:'EXGC'}]);
  assert.equal(projected[0].isShippingGeneralCustomer,true);assert.equal(projected[0].nameKo,'특송 일반 고객');assert.equal(projected[0].code,'EXGC');
  assert.equal(projected[1].isShippingGeneralCustomer,undefined);
  const ledgerParty=(await ledgerCounterpartyOptions(db,org)).find(row=>row.id===id&&row.kind==='PARTNER');
  assert.equal(ledgerParty.code,'EXGC');assert.equal(ledgerParty.nameKo,'특송 일반 고객');assert.equal(ledgerParty.isShippingGeneralCustomer,true);
  const routes=new Map();registerExpensePayeeRoutes({get:(path,fn)=>routes.set(path,fn),post:()=>{}},db,{requireOrgRole:async()=>({organization:s.company}),actorId:()=>actor});
  let payees;await routes.get('/expense-payees')({}, {json:value=>payees=value});
  const expenseParty=payees.find(row=>row.id===id);assert.equal(expenseParty.code,'EXGC');assert.equal(expenseParty.isShippingGeneralCustomer,true);assert.equal(expenseParty.nameKo,'특송 일반 고객');
  assert.equal(await shippingGeneralCustomerId(db,s.other.id),null);
  assert.equal((await attachShippingGeneralCustomer(db,s.other.id,[before]))[0].isShippingGeneralCustomer,undefined);
  assert.deepEqual(await db.organization.findUnique({where:{id}}),before,'read projection never rewrites saved organizations');
  await db.transactionCodeBase.update({where:{id:s.code.baseId},data:{code:'EXP',cashDirection:'OUT'}});
  await db.transactionCode.update({where:{id:s.code.id},data:{code:'EXPE'}});
  const source=await db.transactionCodeBase.findUnique({where:{id:s.code.baseId},include:{serviceType:true}});
  const industry=await db.settingServiceDefault.create({data:{code:'GENERAL_CUSTOMER_TEST',nameKo:'Other',nameEn:'Other',nameVi:'Other',partnerRoleId:source.serviceType.partnerRoleId,entryMode:'GENERAL'}});
  for(const entityId of [id,s.vendor.id])await db.$transaction(tx=>saveClassification(tx,org,entityId,actor,{revision:0,roleIds:[industry.partnerRoleId],industryIds:[industry.id]}));
  await db.organizationBankAccount.create({data:{orgId:org,entityId:id,currencyId:s.currency.id,bankName:'Test',accountNumber:'GENERAL',accountHolder:'General',createdByEmployeeId:actor,updatedByEmployeeId:actor}});
  const expense=await db.$transaction(tx=>registerExpenseRequest(tx,org,actor,{partnerOrgId:id,requestDate:'2026-11-16',clientKey:randomUUID(),items:[{transactionCodeId:s.code.id,currency:'USD',quantity:'1',unitPrice:'10',vatRate:'0',details:{reference:'EXP',evidenceFile:'receipt.pdf'}}]}),{timeout:30000});
  assert.ok(expense.id);
  const body={clientKey:randomUUID(),transactionDate:'2026-11-16',direction:'IN',amount:'10',accountingCodeId:s.code.id,evidenceType:'FILE',evidenceNumber:'EXP-RECEIPT',counterparty:{kind:'PARTNER',id}};
  const paid=await postLedgerEntry(db,org,'admin@example.test',s.account.id,body);
  const ordinary=await postLedgerEntry(db,org,'admin@example.test',s.account.id,{...body,clientKey:randomUUID(),counterparty:{kind:'PARTNER',id:s.vendor.id}});
  const alerts=await accountingAlertCandidates(db,org,{ledger:true,expense:true,invoice:true});
  assert.ok(alerts.some(row=>row.sourceId===paid.id&&row.kind==='DIRECTION'));
  assert.ok(!alerts.some(row=>row.sourceId===paid.id&&row.kind==='PARTNER_INDUSTRY'));
  assert.ok(!alerts.some(row=>row.sourceKind==='EXPENSE'&&row.kind==='PARTNER_INDUSTRY'));
  assert.ok(alerts.some(row=>row.sourceId===ordinary.id&&row.kind==='PARTNER_INDUSTRY'));
  const cashBefore=await db.bankLedgerEntry.findUnique({where:{id:paid.id}});
  await accountingAlertCandidates(db,org,{ledger:true,expense:true,invoice:true});
  assert.deepEqual(await db.bankLedgerEntry.findUnique({where:{id:paid.id}}),cashBefore);
  await assert.rejects(postLedgerEntry(db,s.other.id,'admin@example.test',s.account.id,{...body,clientKey:randomUUID()}),/ACCOUNT_NOT_FOUND|INVALID/);
 }finally{await f.close();}
});
