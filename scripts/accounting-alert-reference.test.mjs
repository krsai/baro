import test from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
const {accountingLedgerReferences}=createRequire(import.meta.url)('../backend/dist/services/accountingAlerts');
test('alert references use company-scoped document FKs, deduplicate numbers and never expose file paths',async()=>{
 const db={partnerTransactionCost:{findMany:async({where})=>{assert.equal(where.orgId,12);return [{id:'cost',expenseRequestId:9,expenseRequest:{managementNumber:'EXP-2026-000003'}},{id:'old',expenseRequestId:8,expenseRequest:{managementNumber:null}}];}},invoice:{findMany:async({where})=>{assert.equal(where.sellerOrgId,12);return [{id:'invoice',invoiceNumber:'INV-2026-000004'}];}}};
 const refs=await accountingLedgerReferences(db,12,[{id:'linked',allocations:[{expenseItemId:'cost'},{expenseItemId:'cost'},{invoiceId:'invoice'}]},{id:'legacy',allocations:[{expenseItemId:'old'}]},{id:'own-id',evidenceNumber:'Z:/private/file.pdf',allocations:[]},{id:'foreign',allocations:[{invoiceId:'unavailable'}]}]);
 assert.equal(refs.get('linked'),'EXP-2026-000003 / INV-2026-000004');
 assert.equal(refs.get('legacy'),'EXP-000008');assert.equal(refs.get('own-id'),'own-id');assert.equal(refs.get('foreign'),'foreign');
});
