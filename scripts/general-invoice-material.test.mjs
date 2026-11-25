import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {createRequire} from 'node:module';
import {PGlite} from '@electric-sql/pglite';
const require=createRequire(import.meta.url);
const {validateGeneralInvoiceCodes,calculateGeneralInvoice}=require('../backend/dist/services/generalInvoice');
const migration=await readFile(new URL('../backend/prisma/migrations/20261125020000_general_invoice_material_selection/migration.sql',import.meta.url),'utf8');

test('invoice material migration retries preserve historical lines and protect company, code, variant and unit FKs',async()=>{
 const db=new PGlite();
 try{
  await db.exec(`CREATE TABLE "ExpenseUnit"(id int PRIMARY KEY);INSERT INTO "ExpenseUnit" VALUES(9);
   CREATE TABLE "MaterialItem"(id text,"orgId" int,"baseId" int,"unitId" int,UNIQUE(id,"orgId","baseId"));
   INSERT INTO "MaterialItem" VALUES('master',1,20,9),('foreign',2,20,9);
   CREATE TABLE "InventoryVariant"(id text,"orgId" int,"masterId" text,UNIQUE(id,"orgId","masterId"));INSERT INTO "InventoryVariant" VALUES('variant',1,'master'),('foreign-variant',2,'foreign');
   CREATE TABLE "TransactionCode"(id int PRIMARY KEY,"ownerOrgId" int,"baseId" int);INSERT INTO "TransactionCode" VALUES(1,1,20),(2,1,21);
   CREATE TABLE "InvoiceGeneralLine"(id text PRIMARY KEY,"sellerOrgId" int,"transactionCodeId" int,description text);INSERT INTO "InvoiceGeneralLine" VALUES('old',1,1,'Original snapshot');`);
  await db.exec(migration);await db.exec(migration);
  assert.deepEqual((await db.query(`SELECT description,"materialItemId" FROM "InvoiceGeneralLine" WHERE id='old'`)).rows,[{description:'Original snapshot',materialItemId:null}]);
  const insert=(id,code=1,master='master',variant='variant',company=1,unit=9)=>db.query(`INSERT INTO "InvoiceGeneralLine"(id,"sellerOrgId","transactionCodeId","unitId","materialItemId","materialItemSnapshot") VALUES($1,$2,$3,$4,$5,$6)`,[id,company,code,unit,master,{id:master,baseId:20,unitId:unit,variantId:variant}]);
  await insert('valid');
  await assert.rejects(insert('bad-code',2),/INVALID_MATERIAL_ITEM/);
  await assert.rejects(insert('foreign',1,'foreign','foreign-variant'),/INVALID_MATERIAL_ITEM|foreign key/);
  await assert.rejects(insert('bad-variant',1,'master','foreign-variant'),/foreign key/);
  await assert.rejects(insert('bad-unit',1,'master','variant',1,10),/INVALID_MATERIAL_ITEM|foreign key/);
  await assert.rejects(db.exec(`DELETE FROM "InventoryVariant" WHERE id='variant'`),/foreign key/);
  await assert.rejects(db.exec(`DELETE FROM "MaterialItem" WHERE id='master'`),/foreign key/);
 }finally{await db.close();}
});

test('server resolves material from actual company and code, checks revision, and snapshots the registered unit',async()=>{
 const code={id:1,ownerOrgId:1,baseId:20,isActive:true,taxTreatmentId:2,taxTreatment:{code:'EXEMPT',suffix:'E'},base:{id:20,code:'PBG',isActive:true,nameEn:'Poly Bag',materialSettings:{enabled:true},variants:[{id:7,taxTreatmentId:2,isActive:true,isEnabled:true}]}};
 const db={transactionCode:{findFirst:async({where})=>{assert.equal(where.ownerOrgId,1);return code;}},materialItem:{findFirst:async({where})=>where.orgId===1&&where.baseId===20&&where.id==='master'?{id:'master',baseId:20,orgId:1,unitId:9,data:{unit:{id:9,nameEn:'Pcs'}}}:null},$queryRaw:async()=>[{id:'variant',revision:2,attributes:{owner:{id:1,name:'BARO'}}}],expenseUnit:{findFirst:async({where})=>where.id===9?{id:9,isActive:true,nameEn:'Pcs'}:null}};
 const line={key:'line-00001',transactionCodeId:1,description:'Poly Bag',unit:'Fake',unitId:9,quantity:'2',unitPrice:'5',vatRate:'0',materialItemId:'master',materialVariantId:'variant',materialVariantRevision:2};
 const codes=await validateGeneralInvoiceCodes(db,1,[line]);
 assert.equal(line.unit,'Pcs');assert.equal(line.materialItemSnapshot.variantId,'variant');
 const issued=calculateGeneralInvoice({currency:'USD',fields:{date:'2026-11-25'},lines:[line]},codes);
 assert.equal(issued.lines[0].materialItemId,'master');assert.equal(issued.snapshot.lines[0].materialItemSnapshot.variantRevision,2);assert.equal(issued.lines[0].unitId,9);
 await assert.rejects(validateGeneralInvoiceCodes(db,1,[{...line,materialItemId:'foreign'}]),/INVALID_MATERIAL_ITEM/);
 await assert.rejects(validateGeneralInvoiceCodes(db,1,[{...line,materialVariantRevision:1}]),/ACCOUNTING_INDUSTRY_CHANGED/);
 await assert.rejects(validateGeneralInvoiceCodes(db,1,[{...line,unitId:10}]),/INVALID_MATERIAL_ITEM/);
});
