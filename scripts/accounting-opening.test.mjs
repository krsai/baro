import test from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {createRequire} from 'node:module';
import {changeApprovalFixture,seedChangeApproval} from './helpers/change-approval-fixture.mjs';
const require=createRequire(import.meta.url);
const {reconcileLedgerBalances}=require('../backend/dist/services/ledgerBalance');
const {readAccountingOpening,voidAccountingOpening}=require('../backend/dist/services/accountingOpening');
const {readAccountingOpeningHistory}=require('../backend/dist/services/accountingOpeningHistory');
const {outstandingReport}=require('../backend/dist/services/accountOverview');
const {invoiceFamilyBalance}=require('../backend/dist/services/invoiceSettlement');
const {searchLedgerEvidence,postLedgerEntryInTransaction}=require('../backend/dist/services/bankLedger');
const {readLedgerEdit}=require('../backend/dist/services/bankLedgerEdit');
const {registerExpenseRequest}=require('../backend/dist/services/expenseRequest');
const {requestChangeApproval,decideChangeApproval}=require('../backend/dist/services/changeApprovals');

test('opening history combines signed account adjustments and AR/AP without changing balances or exposing another company',async()=>{
 const f=await changeApprovalFixture();try{
  const db=f.db,s=await seedChangeApproval(db),org=s.company.id,scope={orgId:org,actorId:s.people.admin.id,actor:s.people.admin.email};
  const base=await db.transactionCodeBase.findUnique({where:{id:s.code.baseId}});
  const adjustmentBase=await db.transactionCodeBase.create({data:{code:'FAD',nameKo:'Funds adjustment',nameEn:'Funds adjustment',nameVi:'Funds adjustment',entryMode:'GENERAL',serviceTypeId:base.serviceTypeId,expenseTypeId:base.expenseTypeId}});
  await db.settingTransactionCodeDefault.create({data:{code:'FADE',nameKo:'Funds adjustment',nameEn:'Funds adjustment',nameVi:'Funds adjustment',serviceTypeId:base.serviceTypeId,baseId:adjustmentBase.id,taxTreatmentId:s.code.taxTreatmentId}});
  await db.transactionCode.create({data:{ownerOrgId:org,serviceTypeId:s.code.serviceTypeId,baseId:adjustmentBase.id,taxTreatmentId:s.code.taxTreatmentId,code:'FADE',nameKo:'Funds adjustment',nameEn:'Funds adjustment',nameVi:'Funds adjustment'}});
  await reconcileLedgerBalances(db,scope,{clientKey:randomUUID(),balanceDate:'2026-11-01',reason:'Opening setup',accounts:[{accountId:s.account.id,currencyCode:'USD',expectedBalance:'0',targetBalance:'-10'}],openingRows:[{kind:'OPENING',side:'AP',currencyCode:'USD',amount:'25',accountingCodeId:s.code.id,counterparty:{kind:'PARTNER',id:s.vendor.id}}]});
  const before=await db.bankLedgerEntry.count();
  const history=await readAccountingOpeningHistory(db,org,scope.actorId,{page:0});assert.equal(history.rows.length,2);assert.equal(history.hasMore,false);
  const account=history.rows.find(row=>row.source==='ACCOUNT'),arap=history.rows.find(row=>row.source==='ARAP');
  assert.equal(account.amount,'-10.00');assert.equal(account.remaining,null);assert.equal(account.treatment,'ACCOUNT');assert.equal(account.reason,'Opening setup');assert.equal(account.changePending,false);
  assert.equal(arap.remaining,'25.00');assert.equal(arap.reference,'');assert.equal(arap.side,'AP');assert.equal(arap.party,s.vendor.name);assert.equal(arap.reason,'Opening setup');
  assert.deepEqual((await readAccountingOpeningHistory(db,org,scope.actorId,{page:1})).rows,[]);
  await assert.rejects(readAccountingOpeningHistory(db,org,scope.actorId,{page:-1}),/LEDGER_INVALID_RANGE/);
  await assert.rejects(readAccountingOpeningHistory(db,s.other.id,scope.actorId,{}),/LEDGER_ADJUSTMENT_ADMIN_REQUIRED/);
  assert.equal(await db.bankLedgerEntry.count(),before);assert.equal(await db.accountingOpeningItem.count(),1);
 }finally{await f.close();}
});

test('bill lookup and replacement manage one balance, preserve source and cash, and reverse the linked pair atomically',async()=>{
 const f=await changeApprovalFixture();try{
  const db=f.db,s=await seedChangeApproval(db),org=s.company.id,scope={orgId:org,actorId:s.people.admin.id,actor:s.people.admin.email};
  const invoice=await db.invoice.create({data:{pricingBasis:'MANUFACTURING_SERVICE_PRICE',sellerOrgId:org,buyerOrgId:s.vendor.id,invoiceNumber:'LOAD-150',clientKey:randomUUID(),sequenceNumber:1,currencyCode:'USD',subtotal:'150',total:'150',receivableAdded:'150',issuedBy:scope.actor,snapshot:{fields:{date:'2026-10-27'}},issuedAt:new Date('2026-10-27T00:00:00Z')}});
  const state=await readAccountingOpening(db,org,scope.actorId,{balanceDate:'2026-11-01',search:'LOAD-150'}),bill=state.documents[0];
  assert.deepEqual(bill.counterparty,{kind:'PARTNER',id:s.vendor.id});assert.equal(bill.remaining,'150.00');
  await assert.rejects(readAccountingOpening(db,org,s.people.junior.id,{balanceDate:'2026-11-01',search:'LOAD'}),/LEDGER_ADJUSTMENT_ADMIN_REQUIRED/);
  assert.equal((await readAccountingOpening(db,s.other.id,scope.actorId,{balanceDate:'2026-11-01',search:'LOAD'}).catch(()=>({documents:[]}))).documents.length,0);
  const row={kind:'OPENING',side:'AR',currencyCode:'USD',amount:'100',accountingCodeId:s.code.id,counterparty:bill.counterparty,source:{side:'AR',sourceId:bill.id,expectedRemaining:bill.remaining}};
  const body={clientKey:randomUUID(),balanceDate:'2026-11-01',reason:'Correct opening from bill',accounts:[],openingRows:[row]};
  await assert.rejects(reconcileLedgerBalances(db,scope,{...body,openingRows:[{...row,source:{...row.source,expectedRemaining:'140'}}]}),/OPENING_SOURCE_CHANGED/);
  assert.equal(await db.accountingOpeningItem.count(),0);
  await assert.rejects(reconcileLedgerBalances(db,scope,{...body,openingRows:[row,{...row,source:undefined,counterparty:{kind:'PARTNER',id:s.other.id}}]}),/LEDGER_COUNTERPARTY_INVALID/);
  assert.equal(await db.accountingOpeningItem.count(),0);assert.equal(await db.bankLedgerBatch.count(),0);
  await reconcileLedgerBalances(db,scope,body);await reconcileLedgerBalances(db,scope,body);
  const replacement=await db.accountingOpeningItem.findFirst({where:{kind:'OPENING'}}),excluded=await db.accountingOpeningItem.findUnique({where:{id:replacement.replacesItemId}});
  assert.equal(excluded.invoiceId,invoice.id);assert.equal(String(excluded.amount),'150');assert.equal(String(replacement.amount),'100');assert.equal(await db.accountingOpeningItem.count(),2);
  assert.equal(await db.bankLedgerEntry.count(),0);assert.equal(await db.invoicePayment.count(),0);assert.equal(String((await db.invoice.findUnique({where:{id:invoice.id}})).total),'150');
  const invoices=[{...invoice,buyer:s.vendor,payments:[],credits:[]}],openings=await db.accountingOpeningItem.findMany({include:{party:true,allocations:true}});
  assert.equal(outstandingReport(invoices,[],[],openings).outstandingTotals[0].receivable,'100.00');
  const after=await readAccountingOpening(db,org,scope.actorId,{balanceDate:'2026-11-01'});assert.equal(after.history.length,1);assert.equal(after.history[0].replacesItem.invoice.invoiceNumber,'LOAD-150');
  const history=await readAccountingOpeningHistory(db,org,scope.actorId,{});
  assert.equal(history.rows.length,1);assert.equal(history.rows[0].treatment,'REPLACED');assert.equal(history.rows[0].reference,'LOAD-150');assert.equal(history.rows[0].remaining,'100.00');assert.equal(history.rows[0].reason,'Correct opening from bill');
  await assert.rejects(readAccountingOpeningHistory(db,org,s.people.junior.id,{}),/LEDGER_ADJUSTMENT_ADMIN_REQUIRED/);
  await assert.rejects(readAccountingOpeningHistory(db,s.other.id,scope.actorId,{}),/LEDGER_ADJUSTMENT_ADMIN_REQUIRED/);
  assert.equal(after.documents.some(r=>r.id===invoice.id),false);
  await assert.rejects(db.accountingOpeningItem.update({where:{id:excluded.id},data:{voidedAt:new Date(),voidReason:'Only one half',voidedByEmployeeId:scope.actorId}}),/OPENING_REPLACEMENT_INVALID/);
  await assert.rejects(reconcileLedgerBalances(db,scope,{...body,clientKey:randomUUID(),openingRows:[row,row]}),/OPENING_SOURCE_CHANGED|OPENING_INVALID_INPUT/);
  await voidAccountingOpening(db,org,scope.actorId,replacement.id,'Reload opening');
  assert.equal(await db.accountingOpeningItem.count({where:{voidedAt:null}}),0);
  assert.equal((await readAccountingOpening(db,org,scope.actorId,{balanceDate:'2026-11-01',search:'LOAD'})).documents[0].remaining,'150.00');
  await reconcileLedgerBalances(db,scope,{...body,clientKey:randomUUID()});
  const next=await db.accountingOpeningItem.findFirst({where:{kind:'OPENING',voidedAt:null}});
  await db.$transaction(tx=>postLedgerEntryInTransaction(tx,org,scope.actor,s.account.id,{clientKey:randomUUID(),transactionDate:'2026-11-10',direction:'IN',amount:'10',purpose:'Collection',evidenceType:'OPENING',openingItemId:next.id,accountingCodeId:s.code.id,counterparty:bill.counterparty}));
  for(const id of [next.id,next.replacesItemId])await assert.rejects(voidAccountingOpening(db,org,scope.actorId,id,'Cannot reverse paid opening'),/OPENING_ALREADY_MATCHED/);
  assert.equal(await db.accountingOpeningItem.count({where:{voidedAt:null}}),2);
  // The migration is retryable and never rewrites source or balances.
  const {readFileSync}=await import('node:fs');await f.pg.exec(readFileSync('backend/prisma/migrations/20261112020000_opening_bill_replacement/migration.sql','utf8'));
  assert.equal(await db.accountingOpeningItem.count({where:{voidedAt:null}}),2);
 }finally{await f.close();}
});

test('expense bill lookup fills the actual item code, party and currency and rolls back the whole replacement on stale versions',async()=>{
 const f=await changeApprovalFixture();try{
  const db=f.db,s=await seedChangeApproval(db),org=s.company.id,scope={orgId:org,actorId:s.people.admin.id,actor:s.people.admin.email};
  const expense=await db.$transaction(tx=>registerExpenseRequest(tx,org,scope.actorId,{clientKey:randomUUID(),partnerOrgId:s.vendor.id,requestDate:'2026-10-20',paymentMethod:'CASH',plannedInstallments:1,dueDate:'2026-11-10',items:[{transactionCodeId:s.code.id,currency:'USD',quantity:'1',unitPrice:'150',vatRate:'0',details:{evidenceFile:'bill.pdf',reference:'BILL'}}]}));
  const bill=(await readAccountingOpening(db,org,scope.actorId,{balanceDate:'2026-11-01',search:expense.managementNumber})).documents[0];
  assert.equal(bill.accountingCodeId,s.code.id);assert.deepEqual(bill.counterparty,{kind:'PARTNER',id:s.vendor.id});assert.equal(bill.currencyCode,'USD');
  const row={kind:'OPENING',side:'AP',currencyCode:'USD',amount:'100',accountingCodeId:bill.accountingCodeId,counterparty:bill.counterparty,source:{side:bill.side,sourceId:bill.id,sourceVersion:bill.sourceVersion,expectedRemaining:bill.remaining}};
  const body={clientKey:randomUUID(),balanceDate:'2026-11-01',reason:'Opening payable',accounts:[],openingRows:[row]};
  await assert.rejects(reconcileLedgerBalances(db,scope,{...body,openingRows:[{...row,source:{...row.source,sourceVersion:bill.sourceVersion+1}}]}),/OPENING_SOURCE_CHANGED/);
  assert.equal(await db.accountingOpeningItem.count(),0);await reconcileLedgerBalances(db,scope,body);
  assert.equal(String((await db.partnerTransactionCost.findUnique({where:{id:bill.id}})).amount),'150');
  const openings=await db.accountingOpeningItem.findMany({include:{party:true,allocations:true}}),cost=await db.partnerTransactionCost.findUnique({where:{id:bill.id}});
  assert.equal(outstandingReport([],[{...expense,partner:s.vendor,items:[cost]}],[],openings).outstandingTotals[0].payable,'100.00');
  assert.equal(await db.bankLedgerEntry.count(),0);
 }finally{await f.close();}
});

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
  const paidHistory=await readAccountingOpeningHistory(db,org,scope.actorId,{}),paidRow=paidHistory.rows.find(row=>row.id===ar.id);
  assert.equal(paidRow.matched,true);assert.equal(paidRow.remaining,'65.00');
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
