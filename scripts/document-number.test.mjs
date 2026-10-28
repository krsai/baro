import test from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {readFile} from 'node:fs/promises';
import {PGlite} from '@electric-sql/pglite';
const require=createRequire(import.meta.url);
const {allocateDocumentNumber,normalizeDocumentNumber}=require('../backend/dist/services/documentNumber.js');
const {issueInvoiceDraft}=require('../backend/dist/services/invoiceIssueStore.js');
const {registerBankLedgerRoutes}=require('../backend/dist/services/bankLedger.js');
async function fixture(){
 const pg=new PGlite();await pg.exec(`CREATE TABLE "SystemSetting"(key text primary key,value jsonb);CREATE TABLE "Invoice"(id text primary key,"sellerOrgId" int,"invoiceNumber" text,UNIQUE("sellerOrgId","invoiceNumber"));CREATE TABLE "ExpenseRequest"(id serial primary key,"orgId" int,remark text);INSERT INTO "ExpenseRequest"("orgId",remark) VALUES(1,'Legacy');`);
 await pg.exec(await readFile('backend/prisma/migrations/20261028140000_document_management_numbers/migration.sql','utf8'));
 const query=async(sql,values=[])=> (await pg.query(sql,values)).rows;
 const tx={
  $queryRawUnsafe:async(sql,...args)=>{assert.match(sql,/pg_advisory_xact_lock\(\$1::integer,\$2::integer\)::text/);assert.ok(args[0]>0);assert.ok([202610281,202610282].includes(args[1]));return [];},
  systemSetting:{findUnique:async({where})=>(await query('SELECT * FROM "SystemSetting" WHERE key=$1',[where.key]))[0]||null,upsert:async({where,create,update})=>query('INSERT INTO "SystemSetting" VALUES($1,$2) ON CONFLICT(key) DO UPDATE SET value=$2',[where.key,JSON.stringify(update.value)])},
  invoice:{findFirst:async({where})=>(await query('SELECT id FROM "Invoice" WHERE "sellerOrgId"=$1 AND lower("invoiceNumber")=lower($2)',[where.sellerOrgId,where.invoiceNumber.equals]))[0]||null},
  expenseRequest:{findFirst:async({where})=>(await query(where.managementNumber===null?'SELECT id FROM "ExpenseRequest" WHERE "orgId"=$1 AND id=$2 AND "managementNumber" IS NULL':'SELECT id FROM "ExpenseRequest" WHERE "orgId"=$1 AND lower("managementNumber")=lower($2)',[where.orgId,where.managementNumber===null?where.id:where.managementNumber.equals]))[0]||null}
 };
 let invoiceId=0;
 const save=async(kind,orgId,date,input,rollback=false)=>{await pg.exec('BEGIN');try{
   const number=await allocateDocumentNumber(tx,orgId,kind,date,input);
   await query(kind==='INV'?'INSERT INTO "Invoice" VALUES($1,$2,$3)':'INSERT INTO "ExpenseRequest"("orgId","managementNumber") VALUES($1,$2)',kind==='INV'?[String(++invoiceId),orgId,number]:[orgId,number]);
   await pg.exec(rollback?'ROLLBACK':'COMMIT');return number;
  }catch(error){await pg.exec('ROLLBACK');throw error;}};
 return {pg,save,tx,query};
}
test('company/year/type sequences, manual references, collisions and rollback share a management-number namespace',async()=>{
 const {pg,save,query}=await fixture();try{
  assert.equal(await save('INV',1,'2026-10-28',''),'INV-2026-000001');
  assert.equal(await save('INV',1,'2026-10-28',''),'INV-2026-000002');
  assert.equal(await save('INV',2,'2026-10-28',''),'INV-2026-000001');
  assert.equal(await save('INV',1,'2027-01-01',''),'INV-2027-000001');
  assert.equal(await save('EXP',1,'2026-10-28',''),'EXP-2026-000001');
  assert.equal(await save('EXP',1,'2026-10-28','  BARO-EXP-7  '),'BARO-EXP-7');
  await assert.rejects(save('EXP',1,'2026-10-28','baro-exp-7'),/ALREADY_EXISTS/);
  await assert.rejects(save('EXP',1,'2026-10-28','EXP-000001'),/ALREADY_EXISTS/);
  assert.equal(await save('EXP',2,'2026-10-28','EXP-000001'),'EXP-000001');
  assert.equal(await save('INV',1,'2026-10-28','INV-2026-000010'),'INV-2026-000010');
  assert.equal(await save('INV',1,'2026-10-28',''),'INV-2026-000011');
  assert.equal(await save('EXP',1,'2026-10-28','',true),'EXP-2026-000002');
  assert.equal(await save('EXP',1,'2026-10-28',''),'EXP-2026-000002');
  assert.deepEqual((await query('SELECT id,"orgId",remark,"managementNumber" FROM "ExpenseRequest" WHERE id=1'))[0],{id:1,orgId:1,remark:'Legacy',managementNumber:null});
  await assert.rejects(query('UPDATE "ExpenseRequest" SET "managementNumber"=$1 WHERE id=1',['NEW']),/DOCUMENT_NUMBER_LOCKED/);
  await assert.rejects(query('INSERT INTO "ExpenseRequest"("orgId","managementNumber") VALUES(1,$1)',['bad\nnumber']),/INVALID_DOCUMENT_NUMBER/);
  await assert.rejects(query('INSERT INTO "ExpenseRequest"("orgId","managementNumber") VALUES(1,$1)',['EXP-2026-000001']),/unique constraint/);
 }finally{await pg.close();}
});
test('manual number validation preserves exact user text and rejects control characters and overlong input',()=>{
 assert.equal(normalizeDocumentNumber('  VN/2026-AB  '),'VN/2026-AB');assert.equal(normalizeDocumentNumber(''),'');
 for(const value of ['a\nb','a\tb','x'.repeat(201),123])assert.throws(()=>normalizeDocumentNumber(value),/INVALID_DOCUMENT_NUMBER/);
});
test('issuing a blank invoice number freezes its generated reference in the print snapshot and retries return the same invoice',async()=>{
 const invoices=[],settings=new Map(),date=new Date('2026-10-28T00:00:00Z');
 const content={fields:{number:'',date:'2026-10-28'},basis:'MANUFACTURING_SERVICE_PRICE',currency:'USD',orders:[{orderId:'order-1',sourceUpdatedAt:date.toISOString()}],percentages:{'order-1':'100'},lines:[{key:JSON.stringify(['order-1','9:']),quantity:'1',unitPriceOverride:'100'}]};
 let draft={id:'draft-1',sellerOrgId:1,buyerOrgId:2,revision:1,content};
 const tx={invoiceDraft:{findFirst:async()=>draft},workOrder:{findMany:async()=>[{id:1,sellerOrgId:1,buyerOrgId:2,orderId:'order-1',orderNumber:'ORDER-NOT-INVOICE',updatedAt:date,workOrderItems:[{id:9,styleId:4,totalQuantity:1,style:{name:'Shirt',code:'S4'}}]}]},orgRelationship:{findFirst:async()=>null},invoiceOrder:{findMany:async()=>[],findFirst:async()=>null,create:async({data})=>({id:1,...data})},invoiceLine:{createMany:async()=>{}},
  invoice:{findFirst:async({where,orderBy})=>orderBy?invoices.at(-1):where.clientKey?invoices.find(row=>row.clientKey===where.clientKey):invoices.find(row=>row.sellerOrgId===where.sellerOrgId&&row.invoiceNumber.toLowerCase()===where.invoiceNumber.equals.toLowerCase()),create:async({data})=>{const row={id:'i'+(invoices.length+1),...data};invoices.push(row);return row;}},
  systemSetting:{findUnique:async({where})=>settings.get(where.key)||null,upsert:async({where,update})=>settings.set(where.key,update)},$queryRawUnsafe:async()=>[]};tx.$transaction=async run=>run(tx);
 const first=await issueInvoiceDraft(tx,1,'test',draft.id,1);assert.equal(first.invoiceNumber,'INV-2026-000001');assert.equal(first.snapshot.fields.number,first.invoiceNumber);assert.equal(content.fields.number,'');
 assert.equal((await issueInvoiceDraft(tx,1,'test',draft.id,1)).id,first.id);assert.equal(invoices.length,1);
 draft={...draft,id:'draft-2',content:{...content,fields:{...content.fields,number:'CUSTOM-2026-A'}}};
 const manual=await issueInvoiceDraft(tx,1,'test',draft.id,1);assert.equal(manual.invoiceNumber,'CUSTOM-2026-A');assert.equal(manual.snapshot.fields.number,manual.invoiceNumber);
 draft={...draft,id:'draft-3',content:{...content,fields:{...content.fields,number:'custom-2026-a'}}};await assert.rejects(issueInvoiceDraft(tx,1,'test',draft.id,1),/DOCUMENT_NUMBER_ALREADY_EXISTS/);
});
test('bank evidence resolves a custom expense management number through its company FK and approved version',async()=>{
 const handlers=new Map();let orgId=1;
 const document={id:7,orgId:1,managementNumber:'CUSTOM-EXP-A',version:1,createdByEmployeeId:10,approvalSteps:[{position:1,employeeId:10}]};
 const db={expenseRequest:{findFirst:async({where})=>where.orgId!==1?null:where.OR?where.OR.some(row=>row.managementNumber?.equals==='CUSTOM-EXP-A')?document:null:where.id===7?document:null},expenseApprovalDecision:{findMany:async()=>[{position:1,employeeId:10}]},partnerTransactionCost:{findMany:async({where})=>{assert.deepEqual(where,{orgId:1,expenseRequestId:7,currency:'USD'});return [{id:'item-7',expenseRequestLine:1,description:'Cost',amount:'100'}];}},bankLedgerEvidenceAllocation:{findMany:async()=>[]}};
 registerBankLedgerRoutes({get:(p,fn)=>handlers.set(p,fn),post:()=>{}},db,{requireOrgRole:async()=>({organization:{id:orgId,type:'SERVICE'},employee:{id:10,orgRole:'ACCOUNTANT'}}),loadPolicy:async()=>({policy:{SERVICE:{ACCOUNTANT:['BANK_LEDGER']}}})});
 let result;const res={json:value=>{result=value;}};
 await handlers.get('/bank-ledger/evidence/expenses')({query:{currencyCode:'USD',search:'CUSTOM-EXP-A'}},res);assert.equal(result.items[0].id,'item-7');assert.equal(result.items[0].remaining,'100.00');
 orgId=2;await handlers.get('/bank-ledger/evidence/expenses')({query:{currencyCode:'USD',search:'CUSTOM-EXP-A'}},res);assert.deepEqual(result,{items:[]});
});
