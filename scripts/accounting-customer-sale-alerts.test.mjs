import test from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {randomUUID} from 'node:crypto';
import {changeApprovalFixture,seedChangeApproval} from './helpers/change-approval-fixture.mjs';
const require=createRequire(import.meta.url);
const {accountingAlertKinds,accountingAlertCandidates}=require('../backend/dist/services/accountingAlerts');
const {saveInvoiceDraft}=require('../backend/dist/services/invoiceDraftStore');
const {issueInvoiceDraft}=require('../backend/dist/services/invoiceIssueStore');
const {postLedgerEntry}=require('../backend/dist/services/bankLedger');
const {saveClassification}=require('../backend/dist/services/partnerClassification');

test('customer sales use the transaction role, while expenses, uncoded receipts and payment differences remain checked',()=>{
 const code={base:{cashDirection:'OUT',industryLinks:[{systemIndustryId:1,industry:{handledItemSelection:true}}]}};
 const party={classification:{industryIds:[2]}};
 assert.deepEqual(accountingAlertKinds({code,customerSale:true,direction:'IN'},party),[]);
 assert.deepEqual(accountingAlertKinds({code,direction:'IN'},party),['DIRECTION','PARTNER_INDUSTRY']);
 assert.deepEqual(accountingAlertKinds({code,customerSale:true,direction:'OUT'},party),['PARTNER_INDUSTRY']);
 assert.deepEqual(accountingAlertKinds({code,customerSale:true,direction:'IN',paymentDifference:{differs:true}},party),['EXPENSE_PAYMENT_DIFFERENCE']);
 assert.deepEqual(accountingAlertKinds({sourceKind:'LEDGER',accountingCodeId:null,customerSale:true,direction:'IN'},party),['UNCODED_LEDGER']);
 const handledParty={classification:{industryIds:[1]}};
 assert.deepEqual(accountingAlertKinds({code,direction:'IN',handledPolicy:{selections:[{industryId:1,baseId:99,base:{isActive:true,industryLinks:[{systemIndustryId:1}]}}]}},handledParty),['DIRECTION','PARTNER_HANDLED_ITEM']);
 assert.deepEqual(accountingAlertKinds({code,customerSale:true,direction:'IN',handledPolicy:{selections:[{industryId:1,baseId:99}]}},handledParty),[]);
});

test('own issued invoice and its actual buyer/code/currency-linked receipt are normal; free receipts remain anomalies',async()=>{
 const f=await changeApprovalFixture();try{
  const db=f.db,s=await seedChangeApproval(db),org=s.company.id;
  const base=await db.transactionCodeBase.findUnique({where:{id:s.code.baseId}});
  await db.accountingCodeIndustry.upsert({where:{baseId_systemIndustryId:{baseId:base.id,systemIndustryId:base.serviceTypeId}},create:{baseId:base.id,systemIndustryId:base.serviceTypeId},update:{}});
  await db.transactionCodeBase.update({where:{id:base.id},data:{cashDirection:'OUT'}});
  const source=await db.settingServiceDefault.findUnique({where:{id:base.serviceTypeId}});
  const other=await db.settingServiceDefault.create({data:{code:'BUYER_INDUSTRY',nameEn:'Customer Industry',nameKo:'Customer',nameVi:'Customer',entryMode:'GENERAL',partnerRoleId:source.partnerRoleId}});
  await db.$transaction(tx=>saveClassification(tx,org,s.vendor.id,s.people.admin.id,{revision:0,roleIds:[source.partnerRoleId],industryIds:[other.id]}));
  const body={clientKey:randomUUID(),documentKind:'GENERAL',buyerOrgId:s.vendor.id,orders:[],basis:null,currency:'USD',fields:{number:'SALE-TEST',date:'2026-11-25',seller:{name:'Seller'},buyer:{name:'Buyer'}},lines:[{key:randomUUID(),transactionCodeId:s.code.id,currencyCode:'USD',quantity:'10',unitPrice:'2',vatRate:'0',unit:'Piece',description:'Purchased For Customer',remark:''}]};
  const draft=await saveInvoiceDraft(db,org,'actor',body),invoice=await issueInvoiceDraft(db,org,'actor',draft.id,draft.revision);
  const receipt=await postLedgerEntry(db,org,'admin@example.test',s.account.id,{clientKey:randomUUID(),transactionDate:'2026-11-25',direction:'IN',amount:'10',accountingCodeId:s.code.id,evidenceType:'INVOICE',evidenceNumber:invoice.invoiceNumber,counterparty:{kind:'PARTNER',id:s.vendor.id},remark:'Reimbursement'});
  const free=await postLedgerEntry(db,org,'admin@example.test',s.account.id,{clientKey:randomUUID(),transactionDate:'2026-11-25',direction:'IN',amount:'1',accountingCodeId:s.code.id,evidenceType:'FILE',evidenceNumber:invoice.invoiceNumber,counterparty:{kind:'PARTNER',id:s.vendor.id},remark:'Same Number Without Invoice FK'});
  const before=await db.invoice.findUnique({where:{id:invoice.id}}),cashBefore=await db.bankLedgerEntry.findUnique({where:{id:receipt.id}});
  const alerts=await accountingAlertCandidates(db,org,{ledger:true,expense:true,invoice:true});
  assert.equal(alerts.some(row=>row.sourceKind==='INVOICE'),false);
  assert.equal(alerts.some(row=>row.sourceId===receipt.id),false);
  assert.deepEqual(alerts.filter(row=>row.sourceId===free.id).map(row=>row.kind).sort(),['DIRECTION','PARTNER_INDUSTRY']);
  assert.deepEqual(await db.invoice.findUnique({where:{id:invoice.id}}),before);assert.deepEqual(await db.bankLedgerEntry.findUnique({where:{id:receipt.id}}),cashBefore);
 }finally{await f.close();}
});

test('receipt exclusions require actual company, buyer, code and currency; settlement fees and unsupported allocations remain checked',async()=>{
 const code={id:7,code:'PBGE',base:{cashDirection:'BOTH',industryLinks:[{systemIndustryId:1}]}};
 const ledger={id:'receipt',transactionDate:'2026-11-25',direction:'IN',counterpartyOrgId:2,accountingCodeId:7,accountingCode:code,account:{currencyCode:'USD'},amount:'10',allocations:[{invoiceId:'own',amount:'10'}],settlementLines:[]};
 const invoice={id:'own',buyerOrgId:2,currencyCode:'USD',generalLines:[{transactionCodeId:7,currencyCode:'USD'}]};
 const run=async(entry,found)=>{
  const db={$queryRawUnsafe:async()=>[],bankLedgerEntry:{findMany:async()=>[entry]},invoice:{findMany:async({where})=>{assert.equal(where.sellerOrgId,1);return found;}},invoiceGeneralLine:{findMany:async()=>[]},partnerTransactionCost:{findMany:async()=>[]},changeApprovalRequest:{findMany:async()=>[]},organization:{findMany:async()=>[{id:2,name:'Buyer'}]},companyPartnerLink:{findMany:async()=>[]},partnerClassification:{findMany:async()=>[]},systemSetting:{findUnique:async()=>null}};
  // Classification source needs additional models in the real integration above.
  return db;
 };
 // Verify role inference with a candidate DB that preserves a classified partner.
 const classifications=require('../backend/dist/services/partnerClassification');
 const original=classifications.attachPartnerClassifications;
 classifications.attachPartnerClassifications=async(_db,_org,rows)=>rows.map(row=>({...row,classification:{industryIds:[2]}}));
 try{
  for(const found of [[],[{...invoice,buyerOrgId:3}],[{...invoice,generalLines:[{transactionCodeId:8,currencyCode:'USD'}]}],[{...invoice,currencyCode:'KRW'}]]){
   const db=await run(ledger,found);const alerts=await accountingAlertCandidates(db,1,{ledger:true,invoice:true});assert.ok(alerts.some(a=>a.kind==='PARTNER_INDUSTRY'));
  }
  const db=await run({...ledger,settlementLines:[{id:'fee',kind:'FEE',amount:'1',accountingCodeId:7,accountingCode:code}]},[invoice]);const alerts=await accountingAlertCandidates(db,1,{ledger:true,invoice:true});assert.ok(alerts.some(a=>a.sourceId==='fee'&&a.kind==='PARTNER_INDUSTRY'));assert.equal(alerts.some(a=>a.sourceId==='receipt'),false);
 }finally{classifications.attachPartnerClassifications=original;}
});
