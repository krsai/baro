import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { PGlite } from '@electric-sql/pglite';
const require=createRequire(import.meta.url);
const {renumber}=require('./helpers/production-invoice-numbers.cjs');
const targets=[{id:'legacy',sellerOrgId:1,previousNumber:'ORDER-OLD'}];
async function fixture(tamper=false){
 const pg=new PGlite();
 await pg.exec(`CREATE TABLE "Invoice"(id text primary key,"sellerOrgId" int,"invoiceNumber" text,"status" text,"revisionOfInvoiceId" text,snapshot jsonb,total numeric,UNIQUE("sellerOrgId","invoiceNumber"));
 CREATE TABLE "InvoiceLine"(id int primary key,"invoiceId" text references "Invoice"(id),amount numeric);
 CREATE TABLE "SystemSetting"(key text primary key,value jsonb,"updatedBy" text);
 INSERT INTO "Invoice" VALUES('legacy',1,'ORDER-OLD','ISSUED',NULL,'{"fields":{"number":"ORDER-OLD","date":"2026-10-27"},"lines":[{"amount":"500"}]}',500);
 INSERT INTO "InvoiceLine" VALUES(1,'legacy',500);`);
 const query=async(sql,...args)=>(await pg.query(sql,args)).rows;
 const tx={
  $queryRawUnsafe:async(sql,...args)=>sql.includes('pg_advisory_xact_lock')?[]:query(sql,...args),
  $executeRawUnsafe:async(sql,...args)=>pg.query(sql,args),
  invoice:{
   findUnique:async({where})=>(await query('SELECT * FROM "Invoice" WHERE id=$1',where.id))[0]||null,
   findFirst:async({where})=>(await query('SELECT id FROM "Invoice" WHERE "sellerOrgId"=$1 AND lower("invoiceNumber")=lower($2)',where.sellerOrgId,where.invoiceNumber.equals))[0]||null,
   update:async({where,data})=>{
    await query('UPDATE "Invoice" SET "invoiceNumber"=$1,snapshot=$2 WHERE id=$3',data.invoiceNumber,JSON.stringify(data.snapshot),where.id);
    if(tamper)await pg.exec('UPDATE "InvoiceLine" SET amount=1');
   },
  },
  systemSetting:{
   findUnique:async({where})=>(await query('SELECT * FROM "SystemSetting" WHERE key=$1',where.key))[0]||null,
   create:async({data})=>query('INSERT INTO "SystemSetting" VALUES($1,$2,$3)',data.key,JSON.stringify(data.value),data.updatedBy),
   upsert:async({where,create,update})=>query('INSERT INTO "SystemSetting"(key,value) VALUES($1,$2) ON CONFLICT(key) DO UPDATE SET value=$3',where.key,JSON.stringify(create.value),JSON.stringify(update.value)),
  },
 };
 const db={$transaction:async fn=>{
  await pg.exec('BEGIN ISOLATION LEVEL SERIALIZABLE');
  try{const result=await fn(tx);await pg.exec('COMMIT');return result;}catch(error){await pg.exec('ROLLBACK');throw error;}
 }};
 const state=async()=>({invoices:await query('SELECT * FROM "Invoice" ORDER BY id'),lines:await query('SELECT * FROM "InvoiceLine"'),settings:await query('SELECT * FROM "SystemSetting" ORDER BY key')});
 return {pg,db,query,state};
}
test('verification rolls back both document fields, counter and maintenance receipt; apply preserves all other data',async()=>{
 const f=await fixture();try{
  const before=await f.state();
  const dry=await renumber({db:f.db,targets,apply:false});
  assert.equal(dry.action,'invoice-numbers-rollback-verified');assert.equal(dry.changes[0].number,'INV-2026-000001');
  assert.deepEqual(await f.state(),before);
  const result=await renumber({db:f.db,targets,apply:true});const after=await f.state();
  assert.equal(result.action,'invoice-numbers-applied');assert.equal(after.invoices[0].invoiceNumber,'INV-2026-000001');
  assert.equal(after.invoices[0].snapshot.fields.number,'INV-2026-000001');assert.deepEqual(after.lines,before.lines);
  const receipt=after.settings.find(row=>row.key===result.receiptKey).value;
  assert.deepEqual(receipt.changes[0].original,before.invoices[0]);assert.deepEqual(receipt.before,receipt.after);
  assert.equal(after.settings.find(row=>row.key==='DOCUMENT_NUMBER:1:INV:2026').value.lastNumber,1);
  assert.equal((await renumber({db:f.db,targets,apply:true})).action,'invoice-numbers-already-applied');
  assert.deepEqual(await f.state(),after);
 }finally{await f.pg.close();}
});
test('changed targets or unexpected business writes abort and roll back',async()=>{
 for(const tamper of [false,true]){
  const f=await fixture(tamper);try{
   const before=await f.state();
   await assert.rejects(renumber({db:f.db,targets:tamper?targets:[{...targets[0],previousNumber:'wrong'}],apply:true}),tamper?/INVOICE_BUSINESS_DATA_CHANGED/:/INVOICE_TARGET_CHANGED/);
   assert.deepEqual(await f.state(),before);
  }finally{await f.pg.close();}
 }
});
test('existing automatic invoice numbers are skipped and counter advances without replacing them',async()=>{
 const f=await fixture();try{
  await f.query(`INSERT INTO "Invoice" VALUES('existing',1,'INV-2026-000001','CANCELLED',NULL,'{"fields":{"number":"INV-2026-000001","date":"2026-10-27"}}',20)`);
  const result=await renumber({db:f.db,targets,apply:true});assert.equal(result.changes[0].number,'INV-2026-000002');
  assert.equal((await f.query('SELECT "invoiceNumber" FROM "Invoice" WHERE id=$1','existing'))[0].invoiceNumber,'INV-2026-000001');
 }finally{await f.pg.close();}
});
