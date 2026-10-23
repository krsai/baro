import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {createRequire} from 'node:module';
import {PGlite} from '@electric-sql/pglite';
const require=createRequire(import.meta.url);
const {registerTransactionSettingRoutes}=require('../backend/dist/services/transactionSettingRoutes.js');

test('partner role catalogue is independent of expense types and preserves business identifiers',async()=>{
 const db=new PGlite();try{
  await db.exec(`CREATE TABLE "SettingServiceDefault"(id INT PRIMARY KEY,code TEXT,"expenseTypeId" INT);INSERT INTO "SettingServiceDefault" VALUES(4,'BUTTONHOLE',99),(8,'LOGISTICS',55),(9,'GENERAL',66);`);
  const sql=fs.readFileSync('backend/prisma/migrations/20261021230000_partner_industry_roles/migration.sql','utf8');await db.exec(sql);
  const rows=(await db.query('SELECT s.id,s."expenseTypeId",r.code FROM "SettingServiceDefault" s LEFT JOIN "PartnerRole" r ON r.id=s."partnerRoleId" ORDER BY s.id')).rows;
  assert.deepEqual(rows,[{id:4,expenseTypeId:99,code:'PROCESS_OUTSOURCING'},{id:8,expenseTypeId:55,code:'PROCESS_OUTSOURCING'},{id:9,expenseTypeId:66,code:null}]);
  await assert.rejects(db.exec('UPDATE "SettingServiceDefault" SET "partnerRoleId"=999 WHERE id=4'),/foreign key/);
  await db.exec(`UPDATE "SettingServiceDefault" SET "partnerRoleId"=(SELECT id FROM "PartnerRole" WHERE code='MATERIAL_SUPPLIER') WHERE id=4`);await db.exec(sql);
  assert.equal((await db.query('SELECT r.code FROM "SettingServiceDefault" s JOIN "PartnerRole" r ON r.id=s."partnerRoleId" WHERE s.id=4')).rows[0].code,'MATERIAL_SUPPLIER');
 }finally{await db.close();}
});

test('industry parent backfill uses existing code FKs, preserves ambiguity and never overwrites an explicit choice',async()=>{
 const db=new PGlite();try{
  await db.exec(`CREATE TABLE "ExpenseType"(id INT PRIMARY KEY);CREATE TABLE "SettingServiceDefault"(id INT PRIMARY KEY);CREATE TABLE "TransactionCodeBase"(id INT PRIMARY KEY,"serviceTypeId" INT,"expenseTypeId" INT);
   INSERT INTO "ExpenseType" VALUES(1),(2),(4),(9);INSERT INTO "SettingServiceDefault" VALUES(10),(20),(30);
   INSERT INTO "TransactionCodeBase" VALUES(1,10,1),(2,10,1),(3,20,4),(4,20,9);`);
  const sql=fs.readFileSync('backend/prisma/migrations/20261020210000_industry_expense_type/migration.sql','utf8');
  await db.exec(sql);assert.deepEqual((await db.query('SELECT "expenseTypeId" FROM "SettingServiceDefault" ORDER BY id')).rows,[{expenseTypeId:1},{expenseTypeId:null},{expenseTypeId:null}]);
  await db.exec('UPDATE "SettingServiceDefault" SET "expenseTypeId"=2 WHERE id=10');await db.exec(sql);
  assert.equal((await db.query('SELECT "expenseTypeId" FROM "SettingServiceDefault" WHERE id=10')).rows[0].expenseTypeId,2);
  await assert.rejects(db.exec('UPDATE "SettingServiceDefault" SET "expenseTypeId"=999 WHERE id=30'),/SettingServiceDefault_expenseTypeId_fkey/);
  assert.equal((await db.query('SELECT count(*)::int count FROM "TransactionCodeBase"')).rows[0].count,4);
 }finally{await db.close();}
});

test('SYSTEM industry writes require an explicit valid category FK and keep cost input settings independent',async()=>{
 const handlers=new Map();let saved;
 const app=Object.fromEntries(['get','post','put','delete'].map(method=>[method,(path,fn)=>handlers.set(`${method} ${path}`,fn)]));
 const tx={settingServiceDefault:{create:async({data})=>{saved=data;return data;}}};
 const db={partnerRole:{findUnique:async({where})=>where.id===2?{id:2,code:'PROCESS_OUTSOURCING'}:null},$transaction:async fn=>fn(tx)};
 registerTransactionSettingRoutes(app,db,{requireSystemAdmin:async()=>true,requireOrgRole:async()=>null});
 const fn=handlers.get('post /system-setting-defaults/services');
 const body={code:'CUSTOM',nameKo:'Custom',nameEn:'Custom',nameVi:'Custom',entryMode:'PROCESS',requiredFields:[]};
 const response={status(){return this;},json(){}};
 for(const partnerRoleId of [undefined,null,'2',999])await assert.rejects(fn({params:{},body:{...body,partnerRoleId}},response),error=>error.status===400&&error.message==='PARTNER_ROLE_REQUIRED');
 await fn({params:{},body:{...body,partnerRoleId:2}},response);assert.equal(saved.partnerRoleId,2);assert.equal(saved.entryMode,'PROCESS');
});

test('logistics is a separate partner role, with stable industry IDs and expense classification',async()=>{
 const db=new PGlite();try{
  await db.exec(`CREATE TYPE "OrganizationType" AS ENUM ('MANUFACTURER','BRAND','PROCESS_OUTSOURCING','MATERIAL_SUPPLIER');
   CREATE TABLE "SettingServiceDefault"(id INT PRIMARY KEY,code TEXT,"expenseTypeId" INT);
   INSERT INTO "SettingServiceDefault" VALUES(1,'LOGISTICS',12),(2,'BUTTONHOLE',13),(3,'CUSTOM',14);`);
  await db.exec(fs.readFileSync('backend/prisma/migrations/20261021230000_partner_industry_roles/migration.sql','utf8'));
  const enumSql=fs.readFileSync('backend/prisma/migrations/20261023100000_logistics_vendor_enum/migration.sql','utf8');
  const roleSql=fs.readFileSync('backend/prisma/migrations/20261023100100_logistics_partner_role/migration.sql','utf8');
  await db.exec(`BEGIN;${enumSql}COMMIT;`);
  await db.exec(`CREATE TABLE "Vendor"(id INT PRIMARY KEY,type "OrganizationType");INSERT INTO "Vendor" VALUES(7,'LOGISTICS_PROVIDER');`);
  await db.exec(roleSql);await db.exec(roleSql);await db.exec(enumSql);
  assert.deepEqual((await db.query(`SELECT s.id,s."expenseTypeId",r.code FROM "SettingServiceDefault" s LEFT JOIN "PartnerRole" r ON r.id=s."partnerRoleId" ORDER BY s.id`)).rows,[{id:1,expenseTypeId:12,code:'LOGISTICS_PROVIDER'},{id:2,expenseTypeId:13,code:'PROCESS_OUTSOURCING'},{id:3,expenseTypeId:14,code:null}]);
  await db.exec(`UPDATE "SettingServiceDefault" SET "partnerRoleId"=(SELECT id FROM "PartnerRole" WHERE code='MATERIAL_SUPPLIER') WHERE id=1`);
  await db.exec(roleSql);
  assert.equal((await db.query(`SELECT r.code FROM "SettingServiceDefault" s JOIN "PartnerRole" r ON r.id=s."partnerRoleId" WHERE s.id=1`)).rows[0].code,'MATERIAL_SUPPLIER');
 }finally{await db.close();}
});

test('customer catalogue adds woven, knit and combined without changing other partner roles or explicit edits',async()=>{
 const db=new PGlite();try{
  await db.exec(`CREATE TABLE "PartnerRole"(id INT PRIMARY KEY,code TEXT);INSERT INTO "PartnerRole" VALUES(1,'CUSTOMER'),(2,'PROCESS_OUTSOURCING');
   CREATE TABLE "SettingServiceDefault"(id SERIAL PRIMARY KEY,code TEXT UNIQUE,"nameKo" TEXT,"nameEn" TEXT,"nameVi" TEXT,"entryMode" TEXT,"requiredFields" TEXT[],"orderInput" TEXT,"styleInput" TEXT,"processInput" TEXT,"isActive" BOOL,"sortOrder" INT,"partnerRoleId" INT REFERENCES "PartnerRole"(id));
   INSERT INTO "SettingServiceDefault"(code,"partnerRoleId") VALUES('BUTTONHOLE',2);`);
  const sql=fs.readFileSync('backend/prisma/migrations/20261023110000_customer_industry_categories/migration.sql','utf8');await db.exec(sql);
  const rows=(await db.query(`SELECT code,"partnerRoleId" FROM "SettingServiceDefault" ORDER BY id`)).rows;
  assert.deepEqual(rows,[{code:'BUTTONHOLE',partnerRoleId:2},{code:'CUSTOMER_WOVEN',partnerRoleId:1},{code:'CUSTOMER_KNIT',partnerRoleId:1},{code:'CUSTOMER_MIXED',partnerRoleId:1}]);
  await db.exec(`UPDATE "SettingServiceDefault" SET "nameKo"='Custom name' WHERE code='CUSTOMER_WOVEN'`);await db.exec(sql);
  assert.equal((await db.query(`SELECT "nameKo" FROM "SettingServiceDefault" WHERE code='CUSTOMER_WOVEN'`)).rows[0].nameKo,'Custom name');
 }finally{await db.close();}
});

test('customer industry options are tenant-authorized and expose only active customer categories',async()=>{
 const handlers=new Map();let query,allow=false;
 const app=Object.fromEntries(['get','post','put','delete'].map(method=>[method,(path,fn)=>handlers.set(`${method} ${path}`,fn)]));
 const db={settingServiceDefault:{findMany:async options=>{query=options;return [{id:94,code:'CUSTOMER_WOVEN'}]}}};
 registerTransactionSettingRoutes(app,db,{requireOrgRole:async()=>allow?{organization:{id:1}}:null});
 const fn=handlers.get('get /customer-industries');let result;const res={json:rows=>{result=rows}};
 await fn({query:{orgId:99}},res);assert.equal(query,undefined);
 allow=true;await fn({query:{orgId:1}},res);assert.deepEqual(query.where,{isActive:true,partnerRole:{code:'CUSTOMER'}});assert.equal(result[0].id,94);
});
