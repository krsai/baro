import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createRequire} from 'node:module';
import {PGlite} from '@electric-sql/pglite';
const require=createRequire(import.meta.url);
const version='20261106220000_retire_legacy_logistics_customer';
const sql=readFileSync(`backend/prisma/migrations/${version}/migration.sql`,'utf8');
async function fixture(){
 const pg=new PGlite();await pg.exec(`
 CREATE TABLE "SettingServiceDefault"(id INT PRIMARY KEY,code TEXT,"nameKo" TEXT,"nameEn" TEXT);
 INSERT INTO "SettingServiceDefault" VALUES(7,'LOGISTICS_CUSTOMER','물류 서비스','Logistics services'),(8,'FWD','포워더','Forwarder'),(9,'GARMENT','의류 제조업','Garment manufacturer'),(10,'SYS_OLD','물류 서비스 고객','Old customer'),(11,'TRUCK','트러커','Trucker');
 CREATE TABLE "OutsourcingServiceType"(id INT PRIMARY KEY,"ownerOrgId" INT,"systemDefaultId" INT REFERENCES "SettingServiceDefault");INSERT INTO "OutsourcingServiceType" VALUES(70,1,7),(71,2,10),(80,1,8);
 CREATE TABLE "PartnerClassification"("orgId" INT,"entityId" INT,revision INT DEFAULT 1,"updatedAt" TIMESTAMP DEFAULT now(),PRIMARY KEY("orgId","entityId"));
 CREATE TABLE "PartnerClassificationIndustry"("orgId" INT,"entityId" INT,"systemIndustryId" INT REFERENCES "SettingServiceDefault",PRIMARY KEY("orgId","entityId","systemIndustryId"),FOREIGN KEY("orgId","entityId") REFERENCES "PartnerClassification" ON DELETE CASCADE);
 INSERT INTO "PartnerClassification"("orgId","entityId") VALUES(1,1),(2,2),(1,2),(2,1),(1,3);
 INSERT INTO "PartnerClassificationIndustry" VALUES(1,1,8),(1,1,7),(2,2,9),(1,2,7),(2,1,10),(1,3,7),(1,3,9);
 CREATE TABLE "OrgRelationship"(id INT PRIMARY KEY,"manufacturerOrgId" INT,"brandOrgId" INT,"systemIndustryId" INT REFERENCES "SettingServiceDefault",note TEXT);INSERT INTO "OrgRelationship" VALUES(55,1,2,7,'Keep relationship'),(56,2,1,NULL,'Keep reverse');
 CREATE TABLE "CompanyPartnerLink"("orgId" INT,"entityId" INT,"targetOrgId" INT);INSERT INTO "CompanyPartnerLink" VALUES(1,2,2);
 CREATE TABLE "SystemSetting"(key TEXT PRIMARY KEY,value JSONB,"updatedBy" TEXT,"createdAt" TIMESTAMP,"updatedAt" TIMESTAMP);
 CREATE TABLE "SettingTransactionCodeDefault"(id INT,"serviceTypeId" INT REFERENCES "SettingServiceDefault");
 CREATE TABLE "TransactionCodeBase"(id INT,"serviceTypeId" INT REFERENCES "SettingServiceDefault");
 CREATE TABLE "AccountingCodeIndustry"("baseId" INT,"systemIndustryId" INT REFERENCES "SettingServiceDefault");
 CREATE TABLE "IndustryProductionPolicy"("orgId" INT,"systemIndustryId" INT REFERENCES "SettingServiceDefault");
 CREATE TABLE "PartnerTransactionCost"(id INT,"serviceTypeId" INT REFERENCES "OutsourcingServiceType",amount NUMERIC,details JSONB);INSERT INTO "PartnerTransactionCost" VALUES(500,80,3553561,'{"reference":"MJ-001"}');
 CREATE TABLE "TransactionCode"(id INT,"serviceTypeId" INT REFERENCES "OutsourcingServiceType");INSERT INTO "TransactionCode" VALUES(500,80);
 CREATE TABLE "OrganizationOutsourcingServiceType"(id INT,"serviceTypeId" INT REFERENCES "OutsourcingServiceType");
 CREATE TABLE "BankLedgerEntry"(id INT,amount NUMERIC);INSERT INTO "BankLedgerEntry" VALUES(500,3553561);
 `);
 const original=readFileSync('backend/prisma/migrations/20261031210000_partner_classification/migration.sql','utf8');
 await pg.exec(original.slice(original.indexOf('CREATE OR REPLACE FUNCTION baro_partner_classification_required')));
 return pg;
}
async function apply(pg){await pg.exec('BEGIN');try{await pg.exec(sql);await pg.exec('COMMIT');}catch(e){await pg.exec('ROLLBACK');throw e;}}
const rows=async(pg,query)=>(await pg.query(query)).rows;
test('obsolete service/customer classifications are physically deleted while current industries, relationships and money remain',async()=>{
 const pg=await fixture();try{
  const before=await rows(pg,'SELECT * FROM "PartnerTransactionCost"');await apply(pg);
  assert.deepEqual(await rows(pg,'SELECT id FROM "SettingServiceDefault" ORDER BY id'),[{id:8},{id:9},{id:11}]);
  assert.deepEqual(await rows(pg,'SELECT id FROM "OutsourcingServiceType"'),[{id:80}]);
  assert.deepEqual(await rows(pg,'SELECT "systemIndustryId" AS id FROM "PartnerClassificationIndustry" ORDER BY "orgId","entityId"'),[{id:8},{id:9},{id:9}]);
  assert.equal((await rows(pg,'SELECT count(*)::int AS n FROM "OrgRelationship"'))[0].n,2);assert.equal((await rows(pg,'SELECT count(*)::int AS n FROM "CompanyPartnerLink"'))[0].n,1);
  assert.equal((await rows(pg,'SELECT "systemIndustryId" AS id FROM "OrgRelationship" WHERE id=55'))[0].id,null);
  assert.deepEqual(await rows(pg,'SELECT * FROM "PartnerTransactionCost"'),before);assert.equal((await rows(pg,'SELECT amount::text FROM "BankLedgerEntry"'))[0].amount,'3553561');
  const audit=(await rows(pg,'SELECT value FROM "SystemSetting"'))[0].value;assert.equal(audit.definitions.length,2);assert.equal(audit.links.length,4);
  await apply(pg);assert.deepEqual((await rows(pg,'SELECT value FROM "SystemSetting"'))[0].value,audit);
 }finally{await pg.close();}
});
test('retired definitions cannot be recreated by old code or localized names',async()=>{
 const pg=await fixture();try{
  await apply(pg);
  for(const values of ["(20,'CUSTOMER_LOGISTICS','Old','Old')","(20,'CUSTOM','물류 서비스','Old')","(20,'CUSTOM','Other','Logistics services')"])
   await assert.rejects(pg.exec('INSERT INTO "SettingServiceDefault" VALUES'+values),/legacy_logistics_retired/);
  await pg.exec("INSERT INTO \"SettingServiceDefault\" VALUES(20,'FORWARDER_NEW','포워더 신규','New forwarder')");
 }finally{await pg.close();}
});
test('unexpected business links stop retirement atomically rather than deleting or reclassifying transactions',async()=>{
 for(const setup of ['INSERT INTO "PartnerTransactionCost" VALUES(501,70,123,\'{}\')','INSERT INTO "AccountingCodeIndustry" VALUES(500,7)']){
  const pg=await fixture();try{
   await pg.exec(setup);await assert.rejects(apply(pg),/LEGACY_LOGISTICS_CUSTOMER_HAS_BUSINESS_USAGE/);
   assert.equal((await rows(pg,'SELECT count(*)::int AS n FROM "SettingServiceDefault" WHERE id IN (7,10)'))[0].n,2);assert.deepEqual(await rows(pg,'SELECT * FROM "SystemSetting"'),[]);
  }finally{await pg.close();}
 }
});
test('the new immutable step and startup verification are registered',()=>{
 const migrations=require('../backend/scripts/migrate-entity-profiles.js').migrations();assert.equal(migrations.filter(step=>step.version===version).length,1);
 assert.ok(require('../backend/scripts/railway-schema-preflight.js').constraints.includes('SettingServiceDefault_legacy_logistics_retired'));
 assert.ok(readFileSync('backend/src/index.ts','utf8').includes('SettingServiceDefault_legacy_logistics_retired'));
});
