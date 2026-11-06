import test from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {readFileSync} from 'node:fs';
import {PGlite} from '@electric-sql/pglite';
const require=createRequire(import.meta.url);
const {supersededPartnerClassifications:find,effectiveIndustryUsage:effective}=require('../backend/dist/services/supersededPartnerClassification.js');
const {deleteSetting}=require('../backend/dist/services/codeBaseManagement.js');
async function fixture(){
 const pg=new PGlite();await pg.exec(`
 CREATE TABLE "Organization"(id INT PRIMARY KEY,"ownerOrgId" INT,"dataOwnerOrgId" INT,"isActive" BOOL DEFAULT true,type TEXT DEFAULT 'MANUFACTURER');
 INSERT INTO "Organization"(id,"ownerOrgId") VALUES(1,NULL),(2,NULL),(3,NULL),(11,1),(12,1);
 CREATE TABLE "Employee"("orgId" INT,status TEXT);INSERT INTO "Employee" VALUES(1,'ACTIVE'),(2,'ACTIVE'),(3,'ACTIVE');
 CREATE TABLE "SettingServiceDefault"(id INT PRIMARY KEY);INSERT INTO "SettingServiceDefault" VALUES(7),(8),(9);
 CREATE TABLE "PartnerClassification"("orgId" INT,"entityId" INT,revision INT DEFAULT 1,PRIMARY KEY("orgId","entityId"));
 CREATE TABLE "PartnerClassificationIndustry"("orgId" INT,"entityId" INT,"systemIndustryId" INT REFERENCES "SettingServiceDefault" ON DELETE RESTRICT,PRIMARY KEY("orgId","entityId","systemIndustryId"),FOREIGN KEY("orgId","entityId") REFERENCES "PartnerClassification" ON DELETE CASCADE);
 INSERT INTO "PartnerClassification"("orgId","entityId") VALUES(1,1),(2,2),(3,3),(1,11),(1,3);
 INSERT INTO "PartnerClassificationIndustry" VALUES(1,1,8),(2,2,8),(3,3,8),(1,11,7),(1,3,7);
 CREATE TABLE "CompanyPartnerLink"("orgId" INT,"entityId" INT,"targetOrgId" INT);INSERT INTO "CompanyPartnerLink" VALUES(1,11,2);
 CREATE TABLE "CompanyIdentity"(id INT,"anchorEntityId" INT);INSERT INTO "CompanyIdentity" VALUES(1,2);
 CREATE TABLE "CompanyIdentityLink"("orgId" INT,"entityId" INT,"identityId" INT);INSERT INTO "CompanyIdentityLink" VALUES(1,11,1);
 CREATE TABLE "OrgRelationship"("manufacturerOrgId" INT,"brandOrgId" INT,"systemIndustryId" INT);INSERT INTO "OrgRelationship" VALUES(1,3,NULL);
 CREATE TABLE "SystemSetting"(key TEXT PRIMARY KEY,value JSONB,"updatedBy" TEXT);
 CREATE TABLE financial_sentinel(id INT PRIMARY KEY,amount NUMERIC);INSERT INTO financial_sentinel VALUES(1,3553561);
 `);
 const original=readFileSync('backend/prisma/migrations/20261031210000_partner_classification/migration.sql','utf8');
 await pg.exec(original.slice(original.indexOf('CREATE OR REPLACE FUNCTION baro_partner_classification_required')));
 const raw=async(sql,...args)=>(await pg.query(sql,args)).rows;
 const where=(value)=>{const args=Object.values(value);return {args,sql:Object.keys(value).map((key,index)=>`"${key}"=$${index+1}`).join(' AND ')};};
 const model=table=>({count:async({where:input})=>{const w=where(input);return Number((await raw(`SELECT count(*) AS n FROM "${table}" WHERE ${w.sql}`,...w.args))[0].n);},deleteMany:async({where:input})=>{const w=where(input);return pg.query(`DELETE FROM "${table}" WHERE ${w.sql}`,w.args);}});
 const tx={$queryRawUnsafe:raw,partnerClassificationIndustry:model('PartnerClassificationIndustry'),partnerClassification:{...model('PartnerClassification'),updateMany:async({where:input})=>{const w=where(input);await raw(`UPDATE "PartnerClassification" SET revision=revision+1 WHERE ${w.sql}`,...w.args);}},systemSetting:{create:async({data})=>raw('INSERT INTO "SystemSetting" VALUES($1,$2::jsonb,$3)',data.key,JSON.stringify(data.value),data.updatedBy)},
 settingServiceDefault:{delete:async({where:{id}})=>raw('DELETE FROM "SettingServiceDefault" WHERE id=$1',id)},settingTransactionCodeDefault:{count:async()=>0},transactionCodeBase:{count:async()=>0},orgRelationship:model('OrgRelationship'),industryProductionPolicy:{count:async()=>0},accountingCodeIndustry:{count:async()=>0},outsourcingServiceType:{findMany:async()=>[]}};
 const run=async(fn)=>{await pg.exec('BEGIN');try{const result=await fn();await pg.exec('COMMIT');return result;}catch(e){await pg.exec('ROLLBACK');throw e;}};
 return {pg,tx,raw,run};
}
test('connected SaaS overrides stale local classifications without mutating reads or weakening current self-profile usage',async()=>{
 const {pg,tx,raw}=await fixture();try{
  const stale=await find(tx,[7]);assert.deepEqual(stale.map(row=>row.entityId).sort((a,b)=>a-b),[3,11]);
  const result=effective([{id:7,_count:{partnerClassifications:2,codes:1},partnerClassifications:stale,services:[]}],stale)[0];assert.equal(result._count.partnerClassifications,0);assert.equal(result._count.codes,1);assert.deepEqual(result.partnerClassifications,[]);
  assert.equal((await raw('SELECT count(*)::int AS n FROM "PartnerClassificationIndustry" WHERE "systemIndustryId"=7'))[0].n,2);
  assert.deepEqual(await find(tx,[8]),[],'the official self profiles and matching local industries are protected');
 }finally{await pg.close();}
});
test('explicit deletion removes only superseded metadata, records a receipt and preserves relationships and money',async()=>{
 const {pg,tx,raw,run}=await fixture();try{
  await run(()=>deleteSetting(tx,'services',true,7));
  assert.deepEqual(await raw('SELECT * FROM "SettingServiceDefault" WHERE id=7'),[]);
  assert.equal((await raw('SELECT count(*)::int AS n FROM "CompanyPartnerLink"'))[0].n,1);assert.equal((await raw('SELECT count(*)::int AS n FROM "OrgRelationship"'))[0].n,1);
  assert.equal((await raw('SELECT count(*)::int AS n FROM "PartnerClassificationIndustry" WHERE "systemIndustryId"=8'))[0].n,3);
  assert.equal((await raw('SELECT amount::text FROM financial_sentinel'))[0].amount,'3553561');
  assert.equal((await raw('SELECT value FROM "SystemSetting"'))[0].value.removed.length,2);
 }finally{await pg.close();}
});
test('real business usage rolls back metadata cleanup and its receipt together',async()=>{
 const {pg,tx,raw,run}=await fixture();try{
  tx.industryProductionPolicy.count=async()=>1;
  await assert.rejects(run(()=>deleteSetting(tx,'services',true,7)),/SETTING_IN_USE/);
  assert.equal((await raw('SELECT count(*)::int AS n FROM "PartnerClassificationIndustry" WHERE "systemIndustryId"=7'))[0].n,2);assert.deepEqual(await raw('SELECT * FROM "SystemSetting"'),[]);
 }finally{await pg.close();}
});
test('unconnected and non-SaaS companies retain their local classifications and prevent deletion',async()=>{
 const {pg,tx,raw,run}=await fixture();try{
  await pg.exec('BEGIN;INSERT INTO "PartnerClassification"("orgId","entityId") VALUES(1,12);INSERT INTO "PartnerClassificationIndustry" VALUES(1,12,7);COMMIT;');
  assert.equal((await find(tx,[7])).length,2);
  await assert.rejects(run(()=>deleteSetting(tx,'services',true,7)),/SETTING_IN_USE/);assert.equal((await raw('SELECT count(*)::int AS n FROM "PartnerClassificationIndustry" WHERE "systemIndustryId"=7'))[0].n,3);
 }finally{await pg.close();}
});
test('deletion rechecks official industries after taking company locks',async()=>{
 const {pg,tx,raw,run}=await fixture();try{
  tx.$queryRawUnsafe=async(sql,...args)=>{if(sql.startsWith('SELECT id FROM "Organization"'))await raw('INSERT INTO "PartnerClassificationIndustry" VALUES(2,2,7)');return raw(sql,...args);};
  await assert.rejects(run(()=>deleteSetting(tx,'services',true,7)),/SETTING_IN_USE/);
  assert.equal((await raw('SELECT count(*)::int AS n FROM "PartnerClassificationIndustry" WHERE "systemIndustryId"=7'))[0].n,2);
 }finally{await pg.close();}
});


test('a current SaaS self industry remains undeletable and other local selections are retained',async()=>{
 const {pg,tx,raw,run}=await fixture();try{
  await assert.rejects(run(()=>deleteSetting(tx,'services',true,8)),/SETTING_IN_USE/);
  await pg.exec('INSERT INTO "PartnerClassificationIndustry" VALUES(1,11,9)');
  await run(()=>deleteSetting(tx,'services',true,7));
  assert.equal((await raw('SELECT revision FROM "PartnerClassification" WHERE "orgId"=1 AND "entityId"=11'))[0].revision,2);
  assert.equal((await raw('SELECT "systemIndustryId" AS id FROM "PartnerClassificationIndustry" WHERE "orgId"=1 AND "entityId"=11'))[0].id,9);
 }finally{await pg.close();}
});

test('missing or inactive subscriber status never makes local classifications obsolete',async()=>{
 const {pg,tx}=await fixture();try{
  await pg.exec(`UPDATE "Employee" SET status='INACTIVE' WHERE "orgId"=2;UPDATE "Organization" SET "isActive"=false WHERE id=3`);
  assert.deepEqual(await find(tx,[7]),[]);
 }finally{await pg.close();}
});
