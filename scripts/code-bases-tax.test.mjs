import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { PGlite } from '@electric-sql/pglite';
import service from '../backend/dist/services/codeBaseManagement.js';
import routes from '../backend/dist/services/transactionSettingRoutes.js';
import requests from '../backend/dist/services/transactionRequest.js';
import industries from '../backend/dist/services/partnerIndustry.js';
const inheritance = fs.readFileSync('backend/prisma/migrations/20261011120000_setting_inheritance/migration.sql','utf8');
const rollout = fs.readFileSync('backend/prisma/migrations/20261013090000_code_bases_tax/migration.sql','utf8');
const usageRollout = fs.readFileSync('backend/prisma/migrations/20261013120000_code_base_usage_fk/migration.sql','utf8');
const q = value => `"${value.replaceAll('"','""')}"`;
function adapter(db) {
  const result = { $executeRawUnsafe: async (sql,...args) => (await db.query(sql,args)).affectedRows, $queryRawUnsafe: async (sql,...args) => {
    const result=await db.query(sql,args);
    // Match Prisma's unsupported-type boundary rather than silently accepting void.
    assert.ok(!result.fields.some(field=>field.dataTypeID===2278),'Prisma cannot deserialize void columns');
    return result.rows;
  } };
  for (const [name,table] of Object.entries({ expenseType:'ExpenseType', transactionCodeBase:'TransactionCodeBase', settingServiceDefault:'SettingServiceDefault', settingTransactionCodeDefault:'SettingTransactionCodeDefault', taxTreatment:'TaxTreatment', transactionCode:'TransactionCode', outsourcingServiceType:'OutsourcingServiceType', partnerTransactionCost:'PartnerTransactionCost', organizationOutsourcingServiceType:'OrganizationOutsourcingServiceType' })) {
    const where = (input, args) => Object.entries(input || {}).map(([key,value]) => {
      if (value && typeof value === 'object') { if ('in' in value) { args.push(value.in); return `${q(key)}=ANY($${args.length}::int[])`; } if (value.not === null) return `${q(key)} IS NOT NULL`; throw Error('unsupported condition'); }
      args.push(value); return `${q(key)}=$${args.length}`;
    }).join(' AND ') || 'true';
    const find = async ({ where: input } = {}) => { const args=[]; return (await db.query(`SELECT * FROM ${q(table)} WHERE ${where(input,args)} ORDER BY id`,args)).rows; };
    const update = async ({ where: input,data }) => { const args=[];const sets=Object.entries(data).map(([key,value])=>{args.push(value);return `${q(key)}=$${args.length}`;}).join(',');return (await db.query(`UPDATE ${q(table)} SET ${sets} WHERE ${where(input,args)} RETURNING *`,args)).rows; };
    result[name] = {
      findMany: find, findUnique: async options => (await find(options))[0] || null, findFirst: async options => (await find(options))[0] || null,
      createMany: async ({data}) => { for(const row of data) { const entries=Object.entries(row);await db.query(`INSERT INTO ${q(table)} (${entries.map(([key])=>q(key)).join(',')}) VALUES(${entries.map((_,i)=>`$${i+1}`).join(',')}) ON CONFLICT DO NOTHING`,entries.map(([,value])=>value)); } },
      count: async options => (await find(options)).length,
      create: async ({data}) => { const entries=Object.entries(data); return (await db.query(`INSERT INTO ${q(table)} (${entries.map(([key])=>q(key)).join(',')}) VALUES(${entries.map((_,i)=>`$${i+1}`).join(',')}) RETURNING *`, entries.map(([,value])=>value))).rows[0]; },
      update: async options => (await update(options))[0], updateMany: update,
      delete: async ({where: input}) => {const args=[];return db.query(`DELETE FROM ${q(table)} WHERE ${where(input,args)}`,args);},
      deleteMany: async ({where: input}) => {const args=[];return db.query(`DELETE FROM ${q(table)} WHERE ${where(input,args)}`,args);},
    };
  }
  return result;
}
async function fixture(legacyCode = 'OLD_CODE') {
  const db = new PGlite();
  await db.exec(`CREATE TABLE "OutsourcingServiceType"(id SERIAL PRIMARY KEY,"ownerOrgId" INT NOT NULL,code TEXT NOT NULL,"nameKo" TEXT,"nameEn" TEXT,"nameVi" TEXT,"entryMode" TEXT,"requiredFields" TEXT[] DEFAULT '{}',"orderInput" TEXT DEFAULT 'OPTIONAL',"styleInput" TEXT DEFAULT 'HIDDEN',"processInput" TEXT DEFAULT 'HIDDEN',"isActive" BOOLEAN DEFAULT true,"sortOrder" INT DEFAULT 0,"updatedAt" TIMESTAMP DEFAULT now(),UNIQUE("ownerOrgId",code),UNIQUE(id,"ownerOrgId"));
    CREATE TABLE "TransactionCode"(id SERIAL PRIMARY KEY,"ownerOrgId" INT NOT NULL,"serviceTypeId" INT NOT NULL,code TEXT NOT NULL,"nameKo" TEXT,"nameEn" TEXT,"nameVi" TEXT,"vatEnabled" BOOLEAN DEFAULT false,"isActive" BOOLEAN DEFAULT true,UNIQUE("ownerOrgId",code),FOREIGN KEY("serviceTypeId","ownerOrgId") REFERENCES "OutsourcingServiceType"(id,"ownerOrgId"));
    CREATE TABLE "PartnerTransactionCost"(id SERIAL PRIMARY KEY,"transactionCodeId" INT REFERENCES "TransactionCode"(id),"serviceTypeId" INT REFERENCES "OutsourcingServiceType"(id),"vatRate" NUMERIC,amount NUMERIC);
    CREATE TABLE "OrganizationOutsourcingServiceType"(id SERIAL PRIMARY KEY,"serviceTypeId" INT REFERENCES "OutsourcingServiceType"(id));
    INSERT INTO "OutsourcingServiceType"(id,"ownerOrgId",code,"entryMode") VALUES(100,1,'LOGISTICS','LOGISTICS');
    INSERT INTO "TransactionCode"(id,"ownerOrgId","serviceTypeId",code) VALUES(100,1,100,'OLD_CODE');
    INSERT INTO "PartnerTransactionCost"("transactionCodeId","serviceTypeId","vatRate",amount) VALUES(100,100,0,1000);`);
  await db.query('UPDATE "TransactionCode" SET code=$1,"vatEnabled"=$2 WHERE id=100',[legacyCode,legacyCode==='TRKV']);
  await db.exec('CREATE TABLE "Organization"(id INT PRIMARY KEY,type TEXT,"ownerOrgId" INT,"isActive" BOOLEAN DEFAULT true)');
  await db.exec(inheritance); await db.exec(rollout); await db.exec(usageRollout);
  await db.exec(fs.readFileSync('backend/prisma/migrations/20261016090000_expense_code_separation/migration.sql','utf8'));
  await db.exec(fs.readFileSync('backend/prisma/migrations/20261029160000_code_base_rename/migration.sql','utf8'));
  await db.exec(fs.readFileSync('backend/prisma/migrations/20261029170000_partner_industry_code_rename/migration.sql','utf8'));
  return db;
}

test('expense catalogue provisions all system variants despite legacy industry-code collisions, preserving existing FKs',async()=>{
  const db=await fixture();try {
    await db.exec(`INSERT INTO "Organization"(id,type) VALUES(1,'MANUFACTURER');
      INSERT INTO "OutsourcingServiceType"(id,"ownerOrgId",code,"nameKo","entryMode") VALUES(101,1,'BUTTONHOLE','Legacy buttonhole','PROCESS');`);
    const legacy=(await db.query('SELECT * FROM "OutsourcingServiceType" WHERE id IN (100,101) ORDER BY id')).rows;
    const saved=(await db.query('SELECT * FROM "PartnerTransactionCost"')).rows;
    const tx=adapter(db);tx.$queryRaw=async()=>[];
    await routes.provisionSettingDefaults(tx,1,true);
    const source=(await db.query(`SELECT id FROM "SettingServiceDefault" WHERE code='BUTTONHOLE'`)).rows[0];
    const bridge=(await db.query('SELECT * FROM "OutsourcingServiceType" WHERE "ownerOrgId"=1 AND "systemDefaultId"=$1',[source.id])).rows[0];
    assert.ok(bridge);assert.notEqual(bridge.id,101);assert.match(bridge.code,/^SYSTEM_/);
    const expected=(await db.query(`SELECT id FROM "SettingTransactionCodeDefault" WHERE "baseId" IS NOT NULL AND "taxTreatmentId" IS NOT NULL AND "isActive" AND "isEnabled" ORDER BY id`)).rows.map(row=>row.id);
    const actual=(await db.query(`SELECT "systemDefaultId" FROM "TransactionCode" WHERE "ownerOrgId"=1 AND "baseId" IS NOT NULL AND "taxTreatmentId" IS NOT NULL ORDER BY "systemDefaultId"`)).rows.map(row=>row.systemDefaultId);
    assert.deepEqual(actual,expected);
    const before=(await db.query('SELECT * FROM "TransactionCode" ORDER BY id')).rows;
    await routes.provisionSettingDefaults(tx,1,true);
    assert.deepEqual((await db.query('SELECT * FROM "TransactionCode" ORDER BY id')).rows,before);
    assert.deepEqual((await db.query('SELECT * FROM "OutsourcingServiceType" WHERE id IN (100,101) ORDER BY id')).rows,legacy);
    assert.deepEqual((await db.query('SELECT * FROM "PartnerTransactionCost"')).rows,saved);
    await db.exec(`UPDATE "TransactionCodeBase" SET "nameEn"='Updated system name' WHERE code='BTH'`);
    // Newly created local IDs remain attached to the exact source variant and tax FKs.
    assert.equal((await db.query(`SELECT count(*)::int AS n FROM "TransactionCode" c JOIN "SettingTransactionCodeDefault" s ON s.id=c."systemDefaultId" WHERE c."serviceTypeId"=$1 AND c."baseId"=s."baseId" AND c."taxTreatmentId"=s."taxTreatmentId"`,[bridge.id])).rows[0].n,3);
  }finally{await db.close();}
});
test('expense input settings copy once by FK and stay independent of partner industry edits', async () => {
  const db=await fixture();try {
    const before=(await db.query(`SELECT * FROM "TransactionCodeBase" ORDER BY id`)).rows;
    await db.exec(`UPDATE "SettingServiceDefault" SET "requiredFields"=ARRAY['reference'];`);
    await db.exec(fs.readFileSync('backend/prisma/migrations/20261016090000_expense_code_separation/migration.sql','utf8'));
    assert.deepEqual((await db.query(`SELECT * FROM "TransactionCodeBase" ORDER BY id`)).rows,before);
    assert.equal((await db.query('SELECT count(*)::int n FROM "ExpenseType"')).rows[0].n,4);
    const [purchase]=(await db.query(`SELECT id FROM "ExpenseType" WHERE code='MATERIAL'`)).rows;
    const [industry]=(await db.query(`SELECT id FROM "SettingServiceDefault" WHERE code='GENERAL'`)).rows;
    const base=await db.transaction(tx=>service.saveCodeBase(adapter(tx),{code:'FAB',nameKo:'원단',nameEn:'Fabric',nameVi:'Vải',serviceTypeId:industry.id,expenseTypeId:purchase.id,requiredFields:[],taxTreatmentIds:[1,2,3]}));
    assert.equal(base.entryMode,'PURCHASE');assert.equal(base.expenseTypeId,purchase.id);
  }finally{await db.close();}
});

test('rollout creates three-letter bases and V/Z/E variants without guessing legacy tax or source FKs', async () => {
  const db=await fixture();try {
    assert.equal((await db.query('SELECT * FROM "TransactionCodeBase"')).rows.length,11);
    assert.equal((await db.query('SELECT * FROM "SettingTransactionCodeDefault" WHERE "taxTreatmentId" IS NOT NULL')).rows.length,33);
    assert.deepEqual((await db.query('SELECT code,"systemDefaultId","taxTreatmentId" FROM "TransactionCode" WHERE id=100')).rows[0],{code:'OLD_CODE',systemDefaultId:null,taxTreatmentId:null});
    assert.deepEqual((await db.query('SELECT "vatRate"::text,amount::text FROM "PartnerTransactionCost"')).rows[0],{vatRate:'0',amount:'1000'});
    await db.exec(inheritance);await db.exec(rollout);
    assert.equal((await db.query('SELECT * FROM "TransactionCodeBase"')).rows.length,11);
    const before=(await db.query(`SELECT id FROM "SettingTransactionCodeDefault" WHERE code='TRKV'`)).rows[0].id;
    await db.exec(rollout);assert.equal((await db.query(`SELECT id FROM "SettingTransactionCodeDefault" WHERE code='TRKV'`)).rows[0].id,before);
    await assert.rejects(db.exec(`UPDATE "SettingTransactionCodeDefault" SET "vatEnabled"=true WHERE code='TRKZ'`),/code tax mismatch/);
  }finally{await db.close();}
});
test('base creation/edit always generates all tax suffixes atomically and retains variant identities', async()=>{
  const db=await fixture();try {
    const serviceTypeId=(await db.query(`SELECT id FROM "SettingServiceDefault" WHERE code='LOGISTICS'`)).rows[0].id;
    const body={code:'AIR',nameKo:'항공',nameEn:'Air',nameVi:'Hàng không',serviceTypeId,taxTreatmentIds:[1,2,3]};
    const base=await db.transaction(tx=>service.saveCodeBase(adapter(tx),body));
    const variants=(await db.query('SELECT id,code FROM "SettingTransactionCodeDefault" WHERE "baseId"=$1 ORDER BY code',[base.id])).rows;
    assert.deepEqual(variants.map(row=>row.code),['AIRE','AIRV','AIRZ']);
    await db.transaction(tx=>service.saveCodeBase(adapter(tx),{...body,nameEn:'Air delivery',taxTreatmentIds:[1,3]},base.id));
    assert.deepEqual((await db.query('SELECT id,code FROM "SettingTransactionCodeDefault" WHERE "baseId"=$1 ORDER BY code',[base.id])).rows,variants);
    assert.equal((await db.query(`SELECT "isActive" FROM "SettingTransactionCodeDefault" WHERE code='AIRZ'`)).rows[0].isActive,true);
    for(const patch of [{code:'TOOLONG'},{code:'A1R'},{taxTreatmentIds:[]},{taxTreatmentIds:[4]},{taxTreatmentIds:[1,1]}])assert.throws(()=>service.validateCodeBase({...body,...patch}));
    await db.transaction(tx=>service.saveCodeBase(adapter(tx),{...body,code:'SEA'},base.id));
    assert.deepEqual((await db.query('SELECT id,code FROM "SettingTransactionCodeDefault" WHERE "baseId"=$1 ORDER BY code',[base.id])).rows,variants.map(row=>({...row,code:row.code.replace('AIR','SEA')})));
  }finally{await db.close();}
});

test('renaming a used family keeps multi-company source and cost FKs, overrides and historical snapshots',async()=>{
 const db=await fixture('PRINTING');try {
  const [base]=(await db.query(`SELECT * FROM "TransactionCodeBase" WHERE code='PRT'`)).rows;
  const sources=(await db.query('SELECT * FROM "SettingTransactionCodeDefault" WHERE "baseId"=$1 AND "taxTreatmentId" IS NOT NULL ORDER BY id',[base.id])).rows;
  await db.query(`INSERT INTO "OutsourcingServiceType"(id,"ownerOrgId",code,"systemDefaultId","isOverridden") VALUES(101,1,'PRINTING',$1,false)`,[base.serviceTypeId]);
  await db.query(`INSERT INTO "OutsourcingServiceType"(id,"ownerOrgId",code,"systemDefaultId","isOverridden") VALUES(200,2,'PRINTING',$1,false)`,[base.serviceTypeId]);
  for(const [index,source] of sources.entries()){
   await db.query(`INSERT INTO "TransactionCode"(id,"ownerOrgId","serviceTypeId",code,"systemDefaultId","isOverridden") VALUES($1,1,101,$2,$3,false)`,[110+index,source.code,source.id]);
   await db.query(`INSERT INTO "TransactionCode"(id,"ownerOrgId","serviceTypeId",code,"baseId","taxTreatmentId","vatEnabled","isOverridden","nameEn","isActive") VALUES($1,2,200,$2,$3,$4,$5,true,'Company custom name',false)`,[210+index,source.code,base.id,source.taxTreatmentId,source.vatEnabled]);
  }
  await db.exec(`INSERT INTO "PartnerTransactionCost"("transactionCodeId","serviceTypeId","vatRate",amount) VALUES(110,101,0,1234),(210,200,0,5678);
   CREATE TABLE "PreservedDocumentSnapshot"(id INT PRIMARY KEY,snapshot JSONB);
   INSERT INTO "PreservedDocumentSnapshot" VALUES(1,'{"code":"PRTV","approved":true}');`);
  const costs=(await db.query('SELECT * FROM "PartnerTransactionCost" ORDER BY id')).rows;
  const snapshots=(await db.query('SELECT * FROM "PreservedDocumentSnapshot"')).rows;
  const before=(await db.query('SELECT * FROM "TransactionCode" ORDER BY id')).rows;
  // Exclude Z from active selection; its stored identity must still move.
  await db.transaction(tx=>service.saveCodeBase(adapter(tx),{...base,code:'INK',taxTreatmentIds:[1,3]},base.id));
  const after=(await db.query('SELECT * FROM "TransactionCode" ORDER BY id')).rows;
  for(const row of before){
   const next=after.find(value=>value.id===row.id);
   if(row.taxTreatmentId){
    assert.equal(next.code,'INK'+row.code.slice(-1));
    for(const key of ['id','baseId','taxTreatmentId','systemDefaultId','ownerOrgId','serviceTypeId','isOverridden'])assert.equal(next[key],row[key],key);
    if(row.isOverridden){assert.equal(next.nameEn,row.nameEn);assert.equal(next.isActive,row.isActive);}
   }else assert.deepEqual(next,row,'legacy code without tax classification is not inferred or relinked');
  }
  const renamed=(await db.query('SELECT * FROM "SettingTransactionCodeDefault" WHERE "baseId"=$1 AND "taxTreatmentId" IS NOT NULL ORDER BY id',[base.id])).rows;
  assert.deepEqual(renamed.map(row=>row.id),sources.map(row=>row.id));
  assert.equal(renamed.find(row=>row.taxTreatmentId===2).code,'INKZ');
  assert.equal(renamed.find(row=>row.taxTreatmentId===2).isEnabled,true);
  assert.deepEqual((await db.query('SELECT * FROM "PartnerTransactionCost" ORDER BY id')).rows,costs);
  assert.deepEqual((await db.query('SELECT * FROM "PreservedDocumentSnapshot"')).rows,snapshots);
  await db.transaction(tx=>service.saveCodeBase(adapter(tx),{...base,code:'INK',taxTreatmentIds:[1,2,3]},base.id));
  assert.equal((await db.query(`SELECT id FROM "SettingTransactionCodeDefault" WHERE code='INKZ'`)).rows[0].id,sources.find(row=>row.taxTreatmentId===2).id);
  const migration=fs.readFileSync('backend/prisma/migrations/20261029160000_code_base_rename/migration.sql','utf8');
  await db.exec(migration);await db.exec(migration);
  assert.deepEqual((await db.query('SELECT * FROM "PartnerTransactionCost" ORDER BY id')).rows,costs);
 }finally{await db.close();}
});

test('code-family collisions roll back every code, flag and name including unused tenant codes',async()=>{
 const db=await fixture();try {
  const [base]=(await db.query(`SELECT * FROM "TransactionCodeBase" WHERE code='PRT'`)).rows;
  await db.exec(`INSERT INTO "TransactionCode"(id,"ownerOrgId","serviceTypeId",code,"baseId","taxTreatmentId","vatEnabled") VALUES(110,1,100,'PRTV',${base.id},1,true);
   INSERT INTO "TransactionCode"(id,"ownerOrgId","serviceTypeId",code,"isActive") VALUES(111,1,100,'INKV',false);`);
  const state=async()=>Object.fromEntries(await Promise.all(['TransactionCodeBase','SettingTransactionCodeDefault','TransactionCode','PartnerTransactionCost'].map(async table=>[table,(await db.query(`SELECT * FROM "${table}" ORDER BY id`)).rows])));
  const original=await state();
  for(const code of ['TRK','INK']){
   await assert.rejects(db.transaction(tx=>service.saveCodeBase(adapter(tx),{...base,code,nameEn:'Must roll back',taxTreatmentIds:[1]},base.id)),/CODE_RENAME_CONFLICT/);
   assert.deepEqual(await state(),original);
  }
 }finally{await db.close();}
});

test('industry rename keeps source, tenant, partner and cost identities and preserves tenant overrides',async()=>{
 const db=await fixture();try {
  const [source]=(await db.query(`SELECT * FROM "SettingServiceDefault" WHERE code='LOGISTICS'`)).rows;
  await db.query(`UPDATE "OutsourcingServiceType" SET "systemDefaultId"=$1,"isOverridden"=false WHERE id=100`,[source.id]);
  await db.query(`INSERT INTO "OutsourcingServiceType"(id,"ownerOrgId",code,"systemDefaultId","isOverridden","entryMode","nameEn","isActive") VALUES(200,2,'SYSTEM_LOGISTICS',$1,true,'LOGISTICS','Custom logistics',false)`,[source.id]);
  await db.exec(`INSERT INTO "OrganizationOutsourcingServiceType"("serviceTypeId") VALUES(100),(200);
   CREATE TABLE "OrgRelationship"(id INT PRIMARY KEY,"systemIndustryId" INT REFERENCES "SettingServiceDefault"(id));
   INSERT INTO "OrgRelationship" VALUES(1,${source.id});`);
  const preserved=['PartnerTransactionCost','TransactionCode','TransactionCodeBase','SettingTransactionCodeDefault','OrganizationOutsourcingServiceType','OrgRelationship'];
  const snapshot=async()=>Object.fromEntries(await Promise.all(preserved.map(async table=>[table,(await db.query(`SELECT * FROM "${table}" ORDER BY to_jsonb("${table}")::text`)).rows])));
  const before=await snapshot();
  await db.transaction(tx=>industries.saveSystemIndustry(adapter(tx),{...source,code:'FREIGHT'},source.id));
  const rows=(await db.query('SELECT * FROM "OutsourcingServiceType" ORDER BY id')).rows;
  assert.deepEqual(rows.map(row=>row.id),[100,200]);assert.ok(rows.every(row=>row.code==='FREIGHT'));
  assert.ok(rows.every(row=>row.systemDefaultId===source.id));
  assert.equal(rows[1].nameEn,'Custom logistics');assert.equal(rows[1].isActive,false);assert.equal(rows[1].isOverridden,true);
  assert.deepEqual(await snapshot(),before,'only industry code labels move; cost codes and business FKs do not');
  await db.exec(inheritance);await db.exec(rollout);await db.exec(usageRollout);
  await db.exec(fs.readFileSync('backend/prisma/migrations/20261029160000_code_base_rename/migration.sql','utf8'));
  await db.exec(fs.readFileSync('backend/prisma/migrations/20261029170000_partner_industry_code_rename/migration.sql','utf8'));
  await db.transaction(tx=>industries.saveSystemIndustry(adapter(tx),{...source,code:'FREIGHT_AGAIN'},source.id));
  assert.deepEqual(await snapshot(),before);
 }finally{await db.close();}
});

test('industry duplicate codes and changed entry modes roll back source and tenant state',async()=>{
 const db=await fixture();try {
  const [source]=(await db.query(`SELECT * FROM "SettingServiceDefault" WHERE code='LOGISTICS'`)).rows;
  await db.query(`UPDATE "OutsourcingServiceType" SET "systemDefaultId"=$1,"isOverridden"=false WHERE id=100`,[source.id]);
  await db.exec(`INSERT INTO "OutsourcingServiceType"(id,"ownerOrgId",code,"entryMode","isActive") VALUES(200,1,'TAKEN','GENERAL',false)`);
  const snapshot=async()=>[(await db.query('SELECT * FROM "SettingServiceDefault" ORDER BY id')).rows,(await db.query('SELECT * FROM "OutsourcingServiceType" ORDER BY id')).rows];
  const before=await snapshot();
  for(const code of ['PRINTING','TAKEN']){
   await assert.rejects(db.transaction(tx=>industries.saveSystemIndustry(adapter(tx),{...source,code,nameEn:'Must not persist'},source.id)),/INDUSTRY_CODE_CONFLICT/);
   assert.deepEqual(await snapshot(),before);
  }
  await assert.rejects(db.transaction(tx=>industries.saveSystemIndustry(adapter(tx),{...source,code:'FREIGHT',entryMode:'GENERAL'},source.id)),/SERVICE_ENTRY_MODE_IMMUTABLE/);
  assert.deepEqual(await snapshot(),before);
 }finally{await db.close();}
});
test('deleting a used base rolls back all variants; unused removal survives repeated startup SQL',async()=>{
  const db=await fixture();try {
    const source=(await db.query(`SELECT * FROM "SettingTransactionCodeDefault" WHERE code='TRKV'`)).rows[0];
    await db.query(`UPDATE "OutsourcingServiceType" SET "systemDefaultId"=$1,"isOverridden"=false WHERE id=100`,[source.serviceTypeId]);
    await db.query(`INSERT INTO "TransactionCode" (id,"ownerOrgId","serviceTypeId",code,"systemDefaultId","isOverridden") VALUES(101,1,100,'TRKV',$1,false)`,[source.id]);
    await db.exec(`INSERT INTO "PartnerTransactionCost"("transactionCodeId","serviceTypeId","vatRate",amount) VALUES(101,100,10,1000);`);
    await assert.rejects(db.transaction(tx=>service.deleteCodeBase(adapter(tx),source.baseId)),/SETTING_IN_USE/);
    assert.equal((await db.query('SELECT * FROM "SettingTransactionCodeDefault" WHERE "baseId"=$1',[source.baseId])).rows.length,3);
    const unused=(await db.query(`SELECT id FROM "TransactionCodeBase" WHERE code='LOG'`)).rows[0].id;
    await db.transaction(tx=>service.deleteCodeBase(adapter(tx),unused));
    await db.exec(inheritance);await db.exec(rollout);
    assert.equal((await db.query(`SELECT * FROM "TransactionCodeBase" WHERE code='LOG'`)).rows.length,0);
    assert.equal((await db.query(`SELECT * FROM "SettingTransactionCodeDefault" WHERE code='LOGISTICS'`)).rows.length,0);
    assert.equal((await db.query('SELECT * FROM "PartnerTransactionCost"')).rows.length,2);
    await assert.rejects(db.transaction(tx=>service.deleteSetting(adapter(tx),'codes',false,101,1)),/SETTING_INHERITED/);
  }finally{await db.close();}
});

test('legacy independent app code usage disables its base without adopting or rewriting tenant settings',async()=>{
  const db=await fixture('TRKV');try {
    const base=(await db.query(`SELECT id FROM "TransactionCodeBase" WHERE code='TRK'`)).rows[0];
    const code=(await db.query('SELECT "baseId","systemDefaultId","isOverridden" FROM "TransactionCode" WHERE id=100')).rows[0];
    assert.deepEqual(code,{baseId:base.id,systemDefaultId:null,isOverridden:true});
    assert.equal((await service.getCodeBaseUsage(adapter(db),[base.id])).has(base.id),true);
    const handlers=new Map(); const app={get:(path,handler)=>handlers.set(path,handler),post:()=>{},put:()=>{},delete:()=>{}};
    service.registerCodeBaseRoutes(app,adapter(db),{requireSystemAdmin:async()=>true});
    let listed;await handlers.get('/system-setting-defaults/code-bases')({query:{}},{json:rows=>{listed=rows;}});
    assert.equal(listed.find(row=>row.code==='TRK').hasUsageHistory,true);
    assert.equal(listed.find(row=>row.code==='BTH').hasUsageHistory,false);
    await db.exec('UPDATE "TransactionCode" SET "isActive"=false WHERE id=100; UPDATE "PartnerTransactionCost" SET amount=0;');
    assert.equal((await service.getCodeBaseUsage(adapter(db),[base.id])).has(base.id),true);
    await assert.rejects(db.transaction(tx=>service.deleteCodeBase(adapter(tx),base.id)),/SETTING_IN_USE/);
    await db.exec(usageRollout);
    assert.equal((await db.query('SELECT "systemDefaultId" FROM "TransactionCode" WHERE id=100')).rows[0].systemDefaultId,null);
    assert.equal((await db.query('SELECT "vatRate"::text FROM "PartnerTransactionCost"')).rows[0].vatRate,'0');
  }finally{await db.close();}
});

test('unused app override is not transaction usage and can be removed with its base',async()=>{
  const db=await fixture('TRKV');try {
    const base=(await db.query(`SELECT id FROM "TransactionCodeBase" WHERE code='TRK'`)).rows[0];
    await db.exec('DELETE FROM "PartnerTransactionCost";');
    assert.equal((await service.getCodeBaseUsage(adapter(db),[base.id])).has(base.id),false);
    await db.transaction(tx=>service.deleteCodeBase(adapter(tx),base.id));
    assert.equal((await db.query('SELECT id FROM "TransactionCode" WHERE id=100')).rows.length,0);
    await db.exec(inheritance);await db.exec(rollout);await db.exec(usageRollout);
    assert.equal((await db.query(`SELECT id FROM "TransactionCodeBase" WHERE code='TRK'`)).rows.length,0);
  }finally{await db.close();}
});
test('code-base and deletion routes require correct roles before accessing data',async()=>{
  const handlers=new Map(),app=Object.fromEntries(['get','post','put','delete'].map(method=>[method,(path,fn)=>handlers.set(`${method} ${path}`,fn)]));
  const calls=[];routes.registerTransactionSettingRoutes(app,{}, {requireSystemAdmin:async()=>{calls.push('system');return null;},requireOrgRole:async(_req,_res,options)=>{calls.push(options.allowedRoles);return null;}});
  for(const path of ['post /system-setting-defaults/code-bases','delete /system-setting-defaults/code-bases/:id','delete /system-setting-defaults/services/:id','delete /system-setting-defaults/codes/:id']){await handlers.get(path)({query:{}},{});assert.equal(calls.pop(),'system');}
  await handlers.get('delete /transaction-codes/:id')({query:{}},{});assert.deepEqual(calls.pop(),['ADMIN']);
});

test('new codes require four English letters and explicit zero versus exempt classification',()=>{
  const row={serviceTypeId:1,nameKo:'운송',nameEn:'Trucking',nameVi:'Vận chuyển',vatEnabled:false};
  assert.equal(requests.validateTransactionCode({...row,code:'TRKZ',taxTreatmentId:2}).taxTreatmentId,2);
  assert.equal(requests.validateTransactionCode({...row,code:'TRKE',taxTreatmentId:3}).taxTreatmentId,3);
  for(const patch of [{code:'LOGISTICS'},{code:'TRKZ'},{code:'TRKE',taxTreatmentId:2},{code:'TRKV',taxTreatmentId:1}])assert.throws(()=>requests.validateTransactionCode({...row,...patch}));
  assert.equal(requests.validateTransactionCode({...row,code:'LOGISTICS'},true).taxTreatmentId,null);
});

test('tax rollout completes every active family and preserves existing IDs and historical costs',async()=>{
 const db=await fixture();try{
  const base=(await db.query(`SELECT id FROM "TransactionCodeBase" WHERE code='GEN'`)).rows[0].id;
  await db.query('DELETE FROM "SettingTransactionCodeDefault" WHERE "baseId"=$1 AND "taxTreatmentId"=2',[base]);
  await db.query('UPDATE "SettingTransactionCodeDefault" SET "isEnabled"=false WHERE "baseId"=$1 AND "taxTreatmentId"=3',[base]);
  const before=(await db.query('SELECT id,code FROM "SettingTransactionCodeDefault" WHERE "baseId"=$1 AND "taxTreatmentId" IS NOT NULL ORDER BY code',[base])).rows;
  const costs=(await db.query('SELECT * FROM "PartnerTransactionCost" ORDER BY id')).rows;
  const migration=fs.readFileSync('backend/prisma/migrations/20261031010100_accounting_tax_variants/migration.sql','utf8');await db.exec(migration);await db.exec(migration);
  const after=(await db.query('SELECT id,code,"isEnabled","isActive" FROM "SettingTransactionCodeDefault" WHERE "baseId"=$1 AND "taxTreatmentId" IS NOT NULL ORDER BY code',[base])).rows;
  assert.equal(after.length,3);assert.ok(after.every(row=>row.isEnabled&&row.isActive));
  for(const row of before)assert.equal(after.find(next=>next.code===row.code).id,row.id);
  assert.deepEqual((await db.query('SELECT * FROM "PartnerTransactionCost" ORDER BY id')).rows,costs);
 }finally{await db.close();}
});

test('industry deletion refuses customer links and removes genuinely unused definitions',async()=>{
 let linked=1,deleted=false;
 const tx={$queryRawUnsafe:async()=>[{id:9}],settingServiceDefault:{delete:async()=>{deleted=true;}},settingTransactionCodeDefault:{count:async()=>0},transactionCodeBase:{count:async()=>0},orgRelationship:{count:async()=>linked},industryProductionPolicy:{count:async()=>0},outsourcingServiceType:{findMany:async()=>[]}};
 await assert.rejects(service.deleteSetting(tx,'services',true,9),/SETTING_IN_USE/);assert.equal(deleted,false);
 linked=0;await service.deleteSetting(tx,'services',true,9);assert.equal(deleted,true);
});

test('OTHER retirement preserves historical costs and IDs, disables all variants and cannot bootstrap or reactivate',async()=>{
 const db=await fixture();try{
  await db.exec(`INSERT INTO "ExpenseType"(code,"nameKo","nameEn","nameVi","entryMode","isActive") VALUES('OTHER','Other','Other','Other','GENERAL',true);
   UPDATE "TransactionCodeBase" SET "expenseTypeId"=(SELECT id FROM "ExpenseType" WHERE code='OTHER') WHERE code='GEN';`);
  await db.transaction(async sql=>{const tx=adapter(sql);tx.$queryRaw=async()=>[];await routes.provisionSettingDefaults(tx,1,true);});
  const before=(await db.query('SELECT * FROM "PartnerTransactionCost" ORDER BY id')).rows;
  const ids=(await db.query('SELECT id FROM "TransactionCode" ORDER BY id')).rows;
  const migration=fs.readFileSync('backend/prisma/migrations/20261030233000_retire_other_accounting_type/migration.sql','utf8');
  await db.exec(migration);await db.exec(migration);
  assert.deepEqual((await db.query('SELECT * FROM "PartnerTransactionCost" ORDER BY id')).rows,before);
  assert.deepEqual((await db.query('SELECT id FROM "TransactionCode" ORDER BY id')).rows,ids);
  assert.equal((await db.query(`SELECT count(*)::int n FROM "TransactionCode" c JOIN "TransactionCodeBase" b ON b.id=c."baseId" JOIN "ExpenseType" t ON t.id=b."expenseTypeId" WHERE t.code='OTHER' AND c."isActive"`)).rows[0].n,0);
  await assert.rejects(service.initializeOtherExpenseDefaults({},20),error=>error.status===410);
  await assert.rejects(db.exec(`UPDATE "ExpenseType" SET "isActive"=true WHERE code='OTHER'`),/ExpenseType_other_retired/);
 }finally{await db.close();}
});
