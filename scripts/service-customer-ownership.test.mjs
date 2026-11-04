import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createRequire} from 'node:module';
import {PGlite} from '@electric-sql/pglite';
const require=createRequire(import.meta.url);
const version='20261104140000_service_customer_relationship_owner';
const migration=readFileSync(`backend/prisma/migrations/${version}/migration.sql`,'utf8');

test('production ownership triggers reproduce the SERVICE failure; full linked customer transaction then commits without transferring ownership',async()=>{
 const db=new PGlite();try{
  await db.exec(`CREATE TABLE "Organization"(id INT PRIMARY KEY,name TEXT,"nameKo" TEXT,"nameVi" TEXT,code TEXT UNIQUE,type TEXT,"ownerOrgId" INT,"dataOwnerOrgId" INT,country TEXT,"businessNumber" TEXT,address TEXT,"partyKind" TEXT,"isActive" BOOL DEFAULT true);
   CREATE TABLE "OrgRelationship"(id INT PRIMARY KEY,"manufacturerOrgId" INT REFERENCES "Organization", "brandOrgId" INT REFERENCES "Organization","systemIndustryId" INT);
   CREATE TABLE "Employee"(id INT,"orgId" INT,status TEXT,"orgRole" TEXT,UNIQUE(id,"orgId"));
   CREATE TABLE "CompanyPartnerLink"("entityId" INT,"targetOrgId" INT);
   CREATE TABLE "SettingServiceDefault"(id INT PRIMARY KEY,code TEXT,"partnerRoleId" INT);
   INSERT INTO "Organization"(id,name,code,type,country,"businessNumber") VALUES(1,'BARO GARMENT','BARO','MANUFACTURER','VN','0109423500'),(1845,'DEX LOGIS','DEXL','SERVICE','VN','DEX1'),(3,'Other manufacturer','OTHR','MANUFACTURER','VN','OTHER');
   INSERT INTO "Employee" VALUES(125,1845,'ACTIVE','ADMIN');INSERT INTO "SettingServiceDefault" VALUES(10,'LOGISTICS_CUSTOMER',1);`);
  const legacy=readFileSync('backend/scripts/transfer-manufacturer-ownership.sql','utf8');
  await db.exec(legacy.slice(legacy.indexOf('CREATE OR REPLACE FUNCTION baro_manufacturer_data_owner()'),legacy.indexOf('CREATE OR REPLACE FUNCTION baro_style_manufacturer_owner()')));
  await db.exec(`UPDATE "Organization" SET "dataOwnerOrgId"=id WHERE type='MANUFACTURER'`);
  for(const v of ['20261102150000_linked_partner_identity','20261103190000_common_company_identity','20261031210000_partner_classification'])await db.exec(readFileSync(`backend/prisma/migrations/${v}/migration.sql`,'utf8'));
  const registration=`INSERT INTO "Organization"(id,name,type,country,"businessNumber","partyKind") VALUES(31,'BARO local','BRAND','VN','0109423500','CORPORATE');INSERT INTO "OrgRelationship" VALUES(99,1845,31,NULL);`;
  await assert.rejects(db.exec('BEGIN;'+registration),/data owner must be a manufacturer/);await db.exec('ROLLBACK');
  assert.equal((await db.query('SELECT id FROM "Organization" WHERE id=31')).rows.length,0);
  await db.exec(migration);await db.exec(migration);
  await db.exec(`BEGIN;${registration}
   INSERT INTO "PartnerClassification"("orgId","entityId","updatedByEmployeeId") VALUES(1845,31,125);
   INSERT INTO "PartnerClassificationIndustry" VALUES(1845,31,10);
   INSERT INTO "CompanyIdentity"("anchorEntityId",code,name,country,"businessNumber") VALUES(1,'BARO','BARO GARMENT','VN','0109423500');
   INSERT INTO "CompanyIdentityLink"("orgId","entityId","identityId","createdByEmployeeId") SELECT 1845,31,id,125 FROM "CompanyIdentity" WHERE code='BARO';
   SET CONSTRAINTS ALL IMMEDIATE;COMMIT;`);
  assert.deepEqual((await db.query('SELECT id,"dataOwnerOrgId" FROM "Organization" WHERE id IN(1,31,1845) ORDER BY id')).rows,[{id:1,dataOwnerOrgId:1},{id:31,dataOwnerOrgId:null},{id:1845,dataOwnerOrgId:null}]);
  assert.equal((await db.query('SELECT code FROM "Organization" WHERE id=31')).rows[0].code,null);
  await db.exec(`INSERT INTO "Organization"(id,name,code,type,"dataOwnerOrgId") VALUES(32,'Factory customer','CUS1','BRAND',NULL),(33,'Already owned','CUS2','BRAND',3);
   INSERT INTO "OrgRelationship" VALUES(100,1,32,NULL),(101,1,33,NULL),(102,1845,1,NULL);`);
  assert.deepEqual((await db.query('SELECT id,"dataOwnerOrgId" FROM "Organization" WHERE id IN(1,32,33) ORDER BY id')).rows,[{id:1,dataOwnerOrgId:1},{id:32,dataOwnerOrgId:1},{id:33,dataOwnerOrgId:3}]);
  await assert.rejects(db.exec(`UPDATE "Organization" SET "dataOwnerOrgId"=1845 WHERE id=31`),/data owner must be a manufacturer/);
  assert.equal((await db.query('SELECT count(*)::int n FROM "CompanyIdentityLink" WHERE "orgId"=1845')).rows[0].n,1);
  const vendor=`INSERT INTO "Organization"(id,name,type,"ownerOrgId",country,"businessNumber","partyKind") VALUES(41,'BARO local vendor','LOGISTICS_PROVIDER',1845,'VN','0109423500','CORPORATE');`;
  await assert.rejects(db.exec(vendor),/data owner must be a manufacturer/);
  const vendorMigration=readFileSync('backend/prisma/migrations/20261104150000_service_partner_data_owner/migration.sql','utf8');
  await db.exec(vendorMigration);await db.exec(vendorMigration);
  await db.exec(`BEGIN;${vendor}
   INSERT INTO "PartnerClassification"("orgId","entityId","updatedByEmployeeId") VALUES(1845,41,125);
   INSERT INTO "PartnerClassificationIndustry" VALUES(1845,41,10);
   INSERT INTO "CompanyIdentityLink"("orgId","entityId","identityId","createdByEmployeeId") SELECT 1845,41,id,125 FROM "CompanyIdentity" WHERE code='BARO';
   SET CONSTRAINTS ALL IMMEDIATE;COMMIT;`);
  assert.deepEqual((await db.query('SELECT "ownerOrgId","dataOwnerOrgId",code FROM "Organization" WHERE id=41')).rows,[{ownerOrgId:1845,dataOwnerOrgId:null,code:null}]);
  await db.exec(`INSERT INTO "Organization"(id,name,code,type,"ownerOrgId") VALUES(42,'Factory vendor','VEN1','MATERIAL_SUPPLIER',1)`);
  assert.equal((await db.query('SELECT "dataOwnerOrgId" FROM "Organization" WHERE id=42')).rows[0].dataOwnerOrgId,1);
  await assert.rejects(db.exec('UPDATE "Organization" SET "dataOwnerOrgId"=1845 WHERE id=41'),/data owner must be a manufacturer/);
 }finally{await db.close();}
});

test('ownership fix is versioned and checked by deploy preflight and read-only startup',()=>{
 assert.ok(require('../backend/scripts/migrate-entity-profiles').versions.includes(version));
 assert.ok(require('../backend/scripts/railway-schema-preflight').constraints.includes('baro_customer_relationship_data_owner'));
 assert.match(readFileSync('backend/src/index.ts','utf8'),/STARTUP_REQUIRED_RUNTIME_CONSTRAINTS = \[[^\n]*'baro_customer_relationship_data_owner'/);
 assert.ok(require('../backend/scripts/migrate-entity-profiles').versions.includes('20261104150000_service_partner_data_owner'));
 assert.ok(require('../backend/scripts/railway-schema-preflight').constraints.includes('baro_company_partner_data_owner'));
 assert.doesNotMatch(migration,/UPDATE "Organization"[\s\S]*WHERE[^;]*;[\s\S]*UPDATE "Organization"/);
});
