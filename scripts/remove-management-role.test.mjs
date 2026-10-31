import test from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {readFileSync} from 'node:fs';
import {PGlite} from '@electric-sql/pglite';
const require=createRequire(import.meta.url);
const {partnerRoleCatalogue}=require('../backend/dist/services/partnerRoleCatalogue.js');
const {saveCatalogueOrder}=require('../backend/dist/services/catalogueOrder.js');
test('GENERAL-only management is absent from every shared catalogue while a real industry prevents retirement',async()=>{
 let count=0;const rows=[{id:1,code:'CUSTOMER',_count:{industries:1}},{id:5,code:'MANAGEMENT',_count:{industries:0}}];
 const db={partnerRole:{findMany:async query=>{assert.deepEqual(query.include._count.select.industries.where,{code:{not:'GENERAL'}});return rows.map(row=>row.code==='MANAGEMENT'?{...row,_count:{industries:count}}:row);}}};
 assert.deepEqual(await partnerRoleCatalogue(db),[{id:1,code:'CUSTOMER'}]);count=1;assert.deepEqual((await partnerRoleCatalogue(db)).map(row=>row.code),['CUSTOMER','MANAGEMENT']);
});
test('reorder validates the visible complete ID set without changing the archived management row',async()=>{
 const updates=[];const db={$queryRawUnsafe:async()=>[],partnerRole:{findMany:async()=>[{id:1,code:'CUSTOMER',_count:{industries:1}},{id:2,code:'MATERIAL_SUPPLIER',_count:{industries:1}},{id:5,code:'MANAGEMENT',_count:{industries:0}}],update:async({where})=>updates.push(where.id)}};
 await saveCatalogueOrder(db,'roles',{previousIds:[1,2],ids:[2,1]});assert.deepEqual(updates,[2,1]);await assert.rejects(saveCatalogueOrder(db,'roles',{previousIds:[1,2],ids:[1,2,5]}),/INVALID_CATALOGUE_ORDER/);
});
test('physical deletion requires zero FK references; GENERAL and real industries remain untouched',async()=>{
 const db=new PGlite();try{
  await db.exec(`CREATE TABLE "PartnerRole"(id INT PRIMARY KEY,code TEXT);CREATE TABLE "SettingServiceDefault"(id INT PRIMARY KEY,code TEXT,"partnerRoleId" INT NOT NULL REFERENCES "PartnerRole"(id));INSERT INTO "PartnerRole" VALUES(1,'CUSTOMER'),(5,'MANAGEMENT');`);
  const sql=readFileSync('backend/prisma/migrations/20261031230000_remove_empty_management_role/migration.sql','utf8');
  await db.exec('BEGIN');await db.exec(sql);await db.exec('COMMIT');assert.equal((await db.query(`SELECT count(*)::int n FROM "PartnerRole" WHERE code='MANAGEMENT'`)).rows[0].n,0);
  await db.exec(`INSERT INTO "PartnerRole" VALUES(5,'MANAGEMENT');INSERT INTO "SettingServiceDefault" VALUES(9,'GENERAL',5);`);await db.exec('BEGIN');await db.exec(sql);await db.exec('COMMIT');
  assert.deepEqual((await db.query('SELECT * FROM "SettingServiceDefault"')).rows,[{id:9,code:'GENERAL',partnerRoleId:5}]);assert.equal((await db.query(`SELECT count(*)::int n FROM "PartnerRole" WHERE code='MANAGEMENT'`)).rows[0].n,1);
  await db.exec(`INSERT INTO "SettingServiceDefault" VALUES(10,'REAL_INDUSTRY',5)`);await db.exec('BEGIN');await db.exec(sql);await db.exec('COMMIT');assert.equal((await db.query('SELECT count(*)::int n FROM "SettingServiceDefault"')).rows[0].n,2);
 }finally{await db.close();}
});
