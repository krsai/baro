import test from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
const require=createRequire(import.meta.url);
const {Prisma}=require('../backend/node_modules/@prisma/client');
const {readLedgerEdit}=require('../backend/dist/services/bankLedgerEdit.js');

// Check read includes against the actual generated schema, rather than a permissive mock.
function validateInclude(modelName,include){
 const model=Prisma.dmmf.datamodel.models.find(row=>row.name===modelName);
 for(const [key,value] of Object.entries(include||{})){
  const field=model.fields.find(row=>row.name===key);
  assert.ok(field?.kind==='object',`${modelName}.${key} is not a Prisma relation`);
  if(value?.include)validateInclude(field.type,value.include);
 }
}
function fixture(type='FILE',allocations=[]){
 const reads=[];
 const entry={id:'entry',orgId:1,account:{currencyCode:'USD'},accountId:'account',evidenceType:type,amount:'90',bankFee:'0',writeOffAmount:'0',allocations,settlementLines:[],voidedAt:null};
 const db={bankLedgerEntry:{findFirst:async({where,include})=>{validateInclude('BankLedgerEntry',include);reads.push(where);return where.orgId===1?structuredClone(entry):null;}},
  invoice:{findMany:async query=>{reads.push(query.where);return [{id:'invoice',invoiceNumber:'INV-2026-000001',total:'100',buyer:{name:'Customer'}}];}},
  partnerTransactionCost:{findMany:async query=>{validateInclude('PartnerTransactionCost',query.include);reads.push(query.where);return []; }},
  bankLedgerEvidenceAllocation:{findMany:async query=>{reads.push(query.where);return [];}}};
 return {db,entry,reads};
}
test('file and adjustment edits load using only real Prisma relations and reject foreign or deleted entries',async()=>{
 for(const type of ['FILE','ADJUSTMENT']){
  const {db,entry,reads}=fixture(type);
  const result=await readLedgerEdit(db,1,'entry');
  assert.equal(result.amount,'90.00');assert.equal(result.document,null);assert.deepEqual(result.expenseItems,[]);assert.equal(reads.length,1);
  await assert.rejects(readLedgerEdit(db,2,'entry'),/ENTRY_NOT_FOUND/);
  entry.voidedAt=new Date();await assert.rejects(readLedgerEdit(db,1,'entry'),/ENTRY_CHANGED/);
 }
});
test('invoice edit resolves the same-company document and restores its own allocation to the available amount',async()=>{
 const {db,entry,reads}=fixture('INVOICE',[{invoiceId:'invoice',amount:'90'}]);
 entry.settlementLines=[{kind:'FEE',amount:'2.50'}];
 db.bankLedgerEvidenceAllocation.findMany=async({where})=>{assert.equal(where.orgId,1);assert.deepEqual(where.entryId,{not:'entry'});assert.deepEqual(where.entry,{voidedAt:null});return [{invoiceId:'invoice',amount:'10'}];};
 const result=await readLedgerEdit(db,1,'entry');assert.equal(result.document.remaining,'90.00');assert.equal(result.document.payee,'Customer');assert.equal(result.settlementLines[0].amount,'2.50');
 assert.deepEqual(reads[1],{sellerOrgId:1,id:{in:['invoice']}});
 db.invoice.findMany=async()=>[];await assert.rejects(readLedgerEdit(db,1,'entry'),/INVALID_EVIDENCE/);
});
test('expense edit resolves item IDs in the company and returns employee payee, version and partial allocations',async()=>{
 const {db,reads}=fixture('EXPENSE',[{expenseItemId:'cost',amount:'30'}]);
 db.partnerTransactionCost.findMany=async({where,include})=>{validateInclude('PartnerTransactionCost',include);reads.push(where);return [{id:'cost',expenseRequestLine:1,description:'Travel',amount:'100',expenseRequest:{id:9,version:2,managementNumber:'EXP-2026-000009',partner:null,payeeEmployee:{name:'Employee'}}}];};
 db.bankLedgerEvidenceAllocation.findMany=async()=>[{expenseItemId:'cost',amount:'20'}];
 const result=await readLedgerEdit(db,1,'entry');
 assert.equal(result.document.remaining,'80.00');assert.equal(result.document.reference,'EXP-2026-000009');assert.equal(result.document.version,2);assert.equal(result.document.payee,'Employee');
 assert.deepEqual(result.expenseItems,[{itemId:'cost',amount:'30.00',label:'Travel'}]);assert.deepEqual(reads[1],{orgId:1,id:{in:['cost']}});
 db.partnerTransactionCost.findMany=async()=>[];await assert.rejects(readLedgerEdit(db,1,'entry'),/INVALID_EVIDENCE/);
});
