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
