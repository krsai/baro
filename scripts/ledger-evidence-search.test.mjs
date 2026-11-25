import test from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
const require=createRequire(import.meta.url),{searchLedgerEvidence}=require('../backend/dist/services/bankLedger.js');
test('expense candidates scan beyond pending recent requests before applying the display limit',async()=>{
 const skips=[];
 const recent=Array.from({length:30},(_,index)=>({id:100+index,version:1,approvalSteps:[{position:1,employeeId:10}],items:[]}));
 const target={id:25,version:1,managementNumber:'EXP-2026-000025',partnerOrgId:11,partner:{name:'HKD NGUYEN TRAN DAT'},approvalSteps:[{position:1,employeeId:10}],items:[{id:'electricity',expenseRequestLine:1,amount:'6775950'},{id:'water',expenseRequestLine:2,amount:'275000'}]};
 const db={expenseRequest:{findMany:async({where,skip,take,orderBy})=>{assert.equal(where.orgId,7);assert.equal(where.items.some.currency,'VND');assert.equal(take,30);assert.deepEqual(orderBy,[{requestDate:'desc'},{id:'desc'}]);skips.push(skip);return skip===0?recent:[target];},findFirst:async()=>target},expenseApprovalDecision:{findMany:async()=>[{requestId:25,version:1,position:1,employeeId:10,decision:'APPROVED'}]},bankLedgerEvidenceAllocation:{findMany:async()=>[]},accountingOpeningItem:{findMany:async()=>[]},expensePaymentSchedule:{findMany:async()=>[]}};
 const result=await searchLedgerEvidence(db,7,{type:'EXPENSE',currencyCode:'VND',search:''});
 assert.deepEqual(skips,[0,30]);assert.equal(result.documents.length,1);assert.equal(result.documents[0].remaining,'7050950');assert.equal(result.documents[0].items.length,2);
});
test('invoice search scopes issuer, currency and issued status and subtracts only active document allocations',async()=>{
 const db={accountingOpeningItem:{findMany:async()=>[]},invoice:{findMany:async({where,take})=>{assert.equal(where.sellerOrgId,7);assert.equal(where.currencyCode,'USD');assert.equal(where.status,'ISSUED');assert.ok(['INV',''].includes(where.OR[0].invoiceNumber.contains));assert.equal(take,30);return [{id:'one',invoiceNumber:'INV-1',total:'1000',buyer:{name:'Buyer'}},{id:'paid',invoiceNumber:'INV-2',total:'100'}];}},bankLedgerEvidenceAllocation:{findMany:async({where})=>{assert.equal(where.orgId,7);assert.equal(where.entry.voidedAt,null);return [{invoiceId:'one',amount:'990'},{invoiceId:'paid',amount:'100'}];}}};
 const result=await searchLedgerEvidence(db,7,{type:'INVOICE',currencyCode:'USD',search:' INV '});assert.equal(result.documents.length,1);assert.equal(result.documents[0].remaining,'10.00');
 assert.equal((await searchLedgerEvidence(db,7,{type:'INVOICE',currencyCode:'USD',search:''})).documents.length,1);await assert.rejects(searchLedgerEvidence(db,7,{type:'FILE',currencyCode:'USD',search:'x'}),/INVALID_EVIDENCE/);
});
test('expense search only returns the approved current version and remaining same-currency item amounts',async()=>{
 const requests=[{id:1,version:1,createdByEmployeeId:99,managementNumber:'EXP-1',requestDate:'2026-10-30',partner:{name:'Vendor'},items:[{id:'c',expenseRequestLine:1,description:'Cost',amount:'100'}],approvalSteps:[{position:1,employeeId:10}]},{id:2,version:2,createdByEmployeeId:99,approvalSteps:[{position:1,employeeId:10}],items:[]}];
 const db={accountingOpeningItem:{findMany:async()=>[]},expensePaymentSchedule:{findMany:async()=>[]},expenseRequest:{findMany:async({where,include})=>{assert.equal(where.orgId,7);assert.equal(include.items.where.currency,'USD');return requests;},findFirst:async({where})=>requests.find(r=>r.id===where.id)},expenseApprovalDecision:{findMany:async()=>[{requestId:1,version:1,position:1,employeeId:10,decision:'APPROVED'}]},bankLedgerEvidenceAllocation:{findMany:async()=>[{expenseItemId:'c',amount:'25'}]}};
 const initial=await searchLedgerEvidence(db,7,{type:'EXPENSE',currencyCode:'USD',search:''});assert.equal(initial.documents.length,1);const result=await searchLedgerEvidence(db,7,{type:'EXPENSE',currencyCode:'USD',search:'Vendor'});assert.equal(result.documents.length,1);assert.equal(result.documents[0].version,1);assert.equal(result.documents[0].remaining,'75.00');assert.equal(result.documents[0].items[0].id,'c');
});
