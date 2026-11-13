import test from 'node:test';import assert from 'node:assert/strict';import {createRequire} from 'node:module';import {randomUUID} from 'node:crypto';
import {changeApprovalFixture,seedChangeApproval} from './helpers/change-approval-fixture.mjs';
const require=createRequire(import.meta.url),{attachExpensePaymentCompletion,expensePaymentCompletionByItem}=require('../backend/dist/services/expensePaymentCompletion'),{attachExpenseDeletionAvailability}=require('../backend/dist/services/expenseDeletion');

test('completion uses exact item payments without combining currencies or mistaking a partial link for completion',()=>{
 const items=[{id:'usd',amount:'0.30',currency:'USD'},{id:'vnd',amount:'100',currency:'VND'}];
 const result=expensePaymentCompletionByItem(items,[{expenseItemId:'usd',amount:'0.10'},{expenseItemId:'usd',amount:'0.20'},{expenseItemId:'vnd',amount:'99'}]);
 assert.equal(result.get('usd'),true);assert.equal(result.get('vnd'),false);assert.equal(expensePaymentCompletionByItem(items,[]).get('usd'),false);
});

test('live scoped ledger payments complete all items; partial and voided payments leave the request visible',async()=>{
 const f=await changeApprovalFixture();try{
  const db=f.db,s=await seedChangeApproval(db),org=s.company.id;
  const {registerExpenseRequest}=require('../backend/dist/services/expenseRequest'),{postLedgerEntry}=require('../backend/dist/services/bankLedger'),{requestChangeApproval,decideChangeApproval}=require('../backend/dist/services/changeApprovals');
  const document=await db.$transaction(tx=>registerExpenseRequest(tx,org,s.people.admin.id,{partnerOrgId:s.vendor.id,requestDate:'2026-11-05',clientKey:randomUUID(),items:['10.25','0.75'].map(unitPrice=>({transactionCodeId:s.code.id,currency:'USD',quantity:'1',unitPrice,vatRate:'0',details:{reference:'PAYMENT',evidenceFile:'proof.pdf'}}))}));
  const read=async()=>{
   const items=await attachExpensePaymentCompletion(db,org,document.items);
   const [request]=await attachExpenseDeletionAvailability(db,org,[document],s.people.admin);
   assert.deepEqual(items.map(row=>row.bankPaymentComplete),request.items.map(row=>row.bankPaymentComplete));return request;
  };
  const payment=(itemId,amount)=>postLedgerEntry(db,org,s.people.admin.email,s.account.id,{clientKey:randomUUID(),transactionDate:'2026-11-05',direction:'OUT',amount,accountingCodeId:s.code.id,evidenceType:'EXPENSE',evidenceNumber:'',expenseItems:[{itemId,amount}]});
  assert.equal((await read()).bankPaymentComplete,false);
  await payment(document.items[0].id,'5.00');const partial=await read();assert.equal(partial.bankReconciled,true);assert.equal(partial.bankPaymentComplete,false);
  const second=await payment(document.items[1].id,'0.75');assert.equal((await read()).bankPaymentComplete,false);
  await payment(document.items[0].id,'5.25');assert.equal((await read()).bankPaymentComplete,true);
  assert.ok((await attachExpensePaymentCompletion(db,s.other.id,document.items)).every(row=>row.bankPaymentComplete===false));
  const deletion=await requestChangeApproval(db,org,s.people.junior.id,{menu:'BANK_LEDGER',operation:'DELETE',sourceKind:'ledger',sourceId:second.id,clientKey:randomUUID(),reason:'Void incorrect payment',selection:{seniorEmployeeId:s.people.senior.id,leadEmployeeId:s.people.lead.id},payload:{}});
  for(const stage of deletion.policy.resolvedStages)await decideChangeApproval(db,org,stage.employeeId,deletion.id,{decision:'APPROVED'});
  const reopened=await read();assert.equal(reopened.bankPaymentComplete,false);assert.deepEqual(reopened.items.map(row=>row.bankPaymentComplete),[true,false]);
  assert.equal(await db.bankLedgerEvidenceAllocation.count(),3,'voiding retains original allocation history');assert.equal(await db.partnerTransactionCost.count({where:{expenseRequestId:document.id}}),2);
 }finally{await f.close()}
});
