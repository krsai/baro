import test from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {createRequire} from 'node:module';
import {changeApprovalFixture,seedChangeApproval} from './helpers/change-approval-fixture.mjs';
const require=createRequire(import.meta.url);
const {reconcileLedgerBalances}=require('../backend/dist/services/ledgerBalance');
const {readAccountingOpening,voidAccountingOpening}=require('../backend/dist/services/accountingOpening');
const {outstandingReport}=require('../backend/dist/services/accountOverview');
const {invoiceFamilyBalance}=require('../backend/dist/services/invoiceSettlement');
const {searchLedgerEvidence,postLedgerEntryInTransaction}=require('../backend/dist/services/bankLedger');
const {readLedgerEdit}=require('../backend/dist/services/bankLedgerEdit');
const {registerExpenseRequest}=require('../backend/dist/services/expenseRequest');
const {requestChangeApproval,decideChangeApproval}=require('../backend/dist/services/changeApprovals');

test('opening AR/AP preserves cash, uses real party/code FKs, settles partly, reverses cash and protects history',async()=>{
 const f=await changeApprovalFixture();try{
  const db=f.db,s=await seedChangeApproval(db),org=s.company.id,scope={orgId:org,actorId:s.people.admin.id,actor:s.people.admin.email};
  const input={clientKey:randomUUID(),balanceDate:'2026-11-01',reason:'Prior balances',accounts:[],openingRows:[
   {kind:'OPENING',side:'AR',currencyCode:'USD',amount:'100',accountingCodeId:s.code.id,counterparty:{kind:'PARTNER',id:s.vendor.id}},
   {kind:'OPENING',side:'AP',currencyCode:'USD',amount:'60',accountingCodeId:s.code.id,counterparty:{kind:'EMPLOYEE',id:s.people.junior.id}},
  ]};
  await assert.rejects(reconcileLedgerBalances(db,{...scope,actorId:s.people.junior.id},input),/LEDGER_ADJUSTMENT_ADMIN_REQUIRED/);
  await reconcileLedgerBalances(db,scope,input);await reconcileLedgerBalances(db,scope,input);
  assert.equal(await db.accountingOpeningItem.count(),2);assert.equal(await db.bankLedgerEntry.count(),0);
  await assert.rejects(reconcileLedgerBalances(db,scope,{...input,reason:'Different'}),/LEDGER_RETRY_CONFLICT/);
  const [ar,ap]=await db.accountingOpeningItem.findMany({orderBy:{line:'asc'}});
  const doc=(await searchLedgerEvidence(db,org,{type:'OPENING',currencyCode:'USD',direction:'IN',search:'Prior'})).documents[0];assert.equal(doc.remaining,'100.00');
  const body={clientKey:randomUUID(),transactionDate:'2026-11-10',direction:'IN',amount:'35',purpose:'Collection',evidenceType:'OPENING',openingItemId:ar.id,accountingCodeId:s.code.id,counterparty:{kind:'PARTNER',id:s.vendor.id}};
  const cash=await db.$transaction(tx=>postLedgerEntryInTransaction(tx,org,scope.actor,s.account.id,body));
  assert.equal(await db.bankLedgerEntry.count(),1);assert.equal(await db.accountingOpeningAllocation.count(),1);
  const edit=await readLedgerEdit(db,org,cash.id);assert.equal(edit.document.id,ar.id);assert.equal(edit.document.remaining,'100.00');
  assert.equal((await searchLedgerEvidence(db,org,{type:'OPENING',currencyCode:'USD',direction:'IN',search:'Prior'})).documents[0].remaining,'65.00');
  await assert.rejects(voidAccountingOpening(db,org,scope.actorId,ar.id,'Correct opening'),/OPENING_ALREADY_MATCHED/);
  await assert.rejects(db.$transaction(tx=>postLedgerEntryInTransaction(tx,org,scope.actor,s.account.id,{...body,clientKey:randomUUID(),amount:'66'})),/LEDGER_EXCEEDS_DOCUMENT/);
  await assert.rejects(db.$transaction(tx=>postLedgerEntryInTransaction(tx,org,scope.actor,s.account.id,{...body,clientKey:randomUUID(),direction:'OUT'})),/OPENING_SOURCE_CHANGED/);
  const rows=await db.accountingOpeningItem.findMany({include:{party:true,employee:true,allocations:{where:{entry:{voidedAt:null}}}}});
  let report=outstandingReport([],[],[],rows);assert.equal(report.outstandingTotals[0].receivable,'65.00');assert.equal(report.outstandingTotals[0].payable,'60.00');
  await voidAccountingOpening(db,org,scope.actorId,ap.id,'Duplicate opening');assert.equal((await db.accountingOpeningItem.findUnique({where:{id:ap.id}})).voidedByEmployeeId,scope.actorId);
  await assert.rejects(db.accountingOpeningItem.update({where:{id:ar.id},data:{amount:'999'}}),/OPENING_HISTORY_IMMUTABLE/);
  await assert.rejects(reconcileLedgerBalances(db,scope,{...input,clientKey:randomUUID(),openingRows:[{...input.openingRows[0],counterparty:{kind:'PARTNER',id:s.other.id}}]}),/LEDGER_COUNTERPARTY_INVALID/);
  const state=await readAccountingOpening(db,org,scope.actorId,{balanceDate:'2026-11-01'});assert.equal(state.history.length,2);assert.equal(state.history.find(r=>r.id===ar.id).remaining,'65.00');
 }finally{await f.close();}
});

test('prior invoice settlement clears only remaining debt, preserves source, blocks duplicate cash and supports audited reversal',async()=>{
 const f=await changeApprovalFixture();try{
  const db=f.db,s=await seedChangeApproval(db),org=s.company.id,scope={orgId:org,actorId:s.people.admin.id,actor:s.people.admin.email};
  const invoice=await db.invoice.create({data:{pricingBasis:'MANUFACTURING_SERVICE_PRICE',sellerOrgId:org,buyerOrgId:s.vendor.id,invoiceNumber:'OLD-1',clientKey:randomUUID(),sequenceNumber:1,currencyCode:'USD',subtotal:'100',total:'100',receivableAdded:'100',issuedBy:scope.actor,snapshot:{fields:{date:'2026-10-27'}},issuedAt:new Date('2026-10-27T00:00:00Z')}});
  const body={clientKey:randomUUID(),balanceDate:'2026-11-01',reason:'Collected before management',accounts:[],openingRows:[{kind:'SETTLED',side:'AR',sourceId:invoice.id,expectedRemaining:'100'}]};
  await reconcileLedgerBalances(db,scope,body);const item=await db.accountingOpeningItem.findFirst({where:{invoiceId:invoice.id}});
  assert.equal(String((await db.invoice.findUnique({where:{id:invoice.id}})).total),'100');assert.equal(await db.bankLedgerEntry.count(),0);assert.equal(await db.invoicePayment.count(),0);
  const family=invoiceFamilyBalance([{...invoice,payments:[],credits:[],openingAdjustments:[item]}],invoice.id);assert.equal(family.balanceAmount,'0.0000');
  assert.equal(outstandingReport([{...invoice,buyer:s.vendor,payments:[],credits:[]}],[],[],[item]).receivables.length,0);
  assert.equal((await searchLedgerEvidence(db,org,{type:'INVOICE',currencyCode:'USD',search:'OLD'})).documents.length,0);
  await assert.rejects(reconcileLedgerBalances(db,scope,{...body,clientKey:randomUUID()}),/OPENING_SOURCE_CHANGED/);
  await assert.rejects(db.invoice.update({where:{id:invoice.id},data:{status:'CANCELLED'}}),/OPENING_SOURCE_LOCKED|CHANGE_APPROVAL/);
  await voidAccountingOpening(db,org,scope.actorId,item.id,'Reopen receivable');
  assert.equal((await searchLedgerEvidence(db,org,{type:'INVOICE',currencyCode:'USD',search:'OLD'})).documents[0].remaining,'100.00');
  await assert.rejects(reconcileLedgerBalances(db,scope,{...body,clientKey:randomUUID(),openingRows:[{...body.openingRows[0],expectedRemaining:'90'}]}),/OPENING_SOURCE_CHANGED/);
  assert.equal(await db.accountingOpeningItem.count(),1);
  const paid=await db.$transaction(tx=>postLedgerEntryInTransaction(tx,org,scope.actor,s.account.id,{clientKey:randomUUID(),transactionDate:'2026-11-10',direction:'IN',amount:'20',purpose:'Actual receipt',evidenceType:'INVOICE',evidenceNumber:invoice.invoiceNumber,accountingCodeId:s.code.id,counterparty:{kind:'PARTNER',id:s.vendor.id}}));
  await reconcileLedgerBalances(db,scope,{...body,clientKey:randomUUID(),openingRows:[{...body.openingRows[0],expectedRemaining:'80'}]});
  const partial=await db.accountingOpeningItem.findFirst({where:{invoiceId:invoice.id,voidedAt:null}});
  const partialBalance=invoiceFamilyBalance([{...invoice,payments:[],credits:[],ledgerReceivedAmount:'20',openingAdjustments:[partial]}],invoice.id);
  assert.equal(partialBalance.balanceAmount,'0.0000');assert.equal(partialBalance.receivedAmount,'20.0000');
  assert.equal(outstandingReport([{...invoice,buyer:s.vendor,payments:[],credits:[]}],[],[{invoiceId:invoice.id,amount:'20'}],[partial]).receivables.length,0);
  assert.equal((await searchLedgerEvidence(db,org,{type:'INVOICE',currencyCode:'USD',search:'OLD'})).documents.length,0);
  assert.equal((await readLedgerEdit(db,org,paid.id)).document.remaining,'20.00');
 }finally{await f.close();}
});

test('expense exclusions preserve cost evidence and opening payments wait for final approval',async()=>{
 const f=await changeApprovalFixture({registration:true});try{
  const db=f.db,s=await seedChangeApproval(db),org=s.company.id,scope={orgId:org,actorId:s.people.admin.id,actor:s.people.admin.email};
  const expense=await db.$transaction(tx=>registerExpenseRequest(tx,org,s.people.admin.id,{partnerOrgId:s.vendor.id,requestDate:'2026-10-30',clientKey:randomUUID(),items:[{transactionCodeId:s.code.id,currency:'USD',quantity:'1',unitPrice:'70',vatRate:'0',details:{evidenceFile:'prior.pdf',reference:'PRIOR'}}]}));
  const cost=expense.items[0];
  const input={clientKey:randomUUID(),balanceDate:'2026-11-01',reason:'Prior payment',accounts:[],openingRows:[{kind:'EXCLUDED',side:'AP',sourceId:cost.id,sourceVersion:expense.version,expectedRemaining:String(cost.amount)}]};
  await reconcileLedgerBalances(db,scope,input);assert.equal(String((await db.partnerTransactionCost.findUnique({where:{id:cost.id}})).amount),'70');
  const state=await readAccountingOpening(db,org,scope.actorId,{balanceDate:'2026-11-01'});assert.equal(state.documents.some(r=>r.id===cost.id),false);assert.equal(await db.bankLedgerEntry.count(),0);
  assert.equal((await searchLedgerEvidence(db,org,{type:'EXPENSE',currencyCode:'USD',search:expense.managementNumber})).documents.length,0);
  const opening={clientKey:randomUUID(),balanceDate:'2026-11-01',reason:'Unrecorded liability',accounts:[],openingRows:[{kind:'OPENING',side:'AP',currencyCode:'USD',amount:'20',accountingCodeId:s.code.id,counterparty:{kind:'PARTNER',id:s.vendor.id}}]};
  await reconcileLedgerBalances(db,scope,opening);const item=await db.accountingOpeningItem.findFirst({where:{kind:'OPENING'}}),batchKey=randomUUID();
  const payload={schemaVersion:2,accountingCodeVersion:1,clientKey:batchKey,rows:[{entryKind:'BANK',clientKey:randomUUID(),accountId:s.account.id,transactionDate:'2026-11-10',direction:'OUT',amount:'8',remark:'Prior liability payment',accountingCodeId:s.code.id,evidenceType:'OPENING',openingItemId:item.id,counterparty:{kind:'PARTNER',id:s.vendor.id}}]};
  const pending=await requestChangeApproval(db,org,scope.actorId,{menu:'BANK_LEDGER',operation:'CREATE',sourceKind:'batch',sourceId:batchKey,clientKey:randomUUID(),selection:{step1EmployeeId:s.people.junior.id,step2EmployeeId:s.people.lead.id},payload});
  assert.equal(await db.bankLedgerEntry.count(),0);await decideChangeApproval(db,org,s.people.junior.id,pending.id,{decision:'APPROVED'});assert.equal(await db.bankLedgerEntry.count(),0);
  await decideChangeApproval(db,org,s.people.lead.id,pending.id,{decision:'APPROVED'});assert.equal(await db.bankLedgerEntry.count(),1);
  assert.equal((await searchLedgerEvidence(db,org,{type:'OPENING',currencyCode:'USD',direction:'OUT',search:'Unrecorded'})).documents[0].remaining,'12.00');
 }finally{await f.close();}
});
