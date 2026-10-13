import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { PGlite } from '@electric-sql/pglite';
import service from '../backend/dist/services/codeBaseManagement.js';
import routes from '../backend/dist/services/transactionSettingRoutes.js';
import requests from '../backend/dist/services/transactionRequest.js';
const inheritance = fs.readFileSync('backend/prisma/migrations/20261011120000_setting_inheritance/migration.sql','utf8');
const rollout = fs.readFileSync('backend/prisma/migrations/20261013090000_code_bases_tax/migration.sql','utf8');
const q = value => `"${value.replaceAll('"','""')}"`;
function adapter(db) {
  const result = { $queryRawUnsafe: async (sql,...args) => (await db.query(sql,args)).rows };
  for (const [name,table] of Object.entries({ transactionCodeBase:'TransactionCodeBase', settingServiceDefault:'SettingServiceDefault', settingTransactionCodeDefault:'SettingTransactionCodeDefault', taxTreatment:'TaxTreatment', transactionCode:'TransactionCode', outsourcingServiceType:'OutsourcingServiceType', partnerTransactionCost:'PartnerTransactionCost', organizationOutsourcingServiceType:'OrganizationOutsourcingServiceType' })) {
    const where = (input, args) => Object.entries(input || {}).map(([key,value]) => {
      if (value && typeof value === 'object') { if ('in' in value) { args.push(value.in); return `${q(key)}=ANY($${args.length}::int[])`; } if (value.not === null) return `${q(key)} IS NOT NULL`; throw Error('unsupported condition'); }
      args.push(value); return `${q(key)}=$${args.length}`;
    }).join(' AND ') || 'true';
    const find = async ({ where: input } = {}) => { const args=[]; return (await db.query(`SELECT * FROM ${q(table)} WHERE ${where(input,args)} ORDER BY id`,args)).rows; };
    const update = async ({ where: input,data }) => { const args=[];const sets=Object.entries(data).map(([key,value])=>{args.push(value);return `${q(key)}=$${args.length}`;}).join(',');return (await db.query(`UPDATE ${q(table)} SET ${sets} WHERE ${where(input,args)} RETURNING *`,args)).rows; };
    result[name] = {
      findMany: find, findUnique: async options => (await find(options))[0] || null,
      count: async options => (await find(options)).length,
      create: async ({data}) => { const entries=Object.entries(data); return (await db.query(`INSERT INTO ${q(table)} (${entries.map(([key])=>q(key)).join(',')}) VALUES(${entries.map((_,i)=>`$${i+1}`).join(',')}) RETURNING *`, entries.map(([,value])=>value))).rows[0]; },
      update: async options => (await update(options))[0], updateMany: update,
      delete: async ({where: input}) => {const args=[];return db.query(`DELETE FROM ${q(table)} WHERE ${where(input,args)}`,args);},
    };
  }
  return result;
}
async function fixture() {
  const db = new PGlite();
  await db.exec(`CREATE TABLE "OutsourcingServiceType"(id SERIAL PRIMARY KEY,"ownerOrgId" INT NOT NULL,code TEXT NOT NULL,"nameKo" TEXT,"nameEn" TEXT,"nameVi" TEXT,"entryMode" TEXT,"requiredFields" TEXT[] DEFAULT '{}',"orderInput" TEXT DEFAULT 'OPTIONAL',"styleInput" TEXT DEFAULT 'HIDDEN',"processInput" TEXT DEFAULT 'HIDDEN',"isActive" BOOLEAN DEFAULT true,"sortOrder" INT DEFAULT 0,"updatedAt" TIMESTAMP DEFAULT now(),UNIQUE("ownerOrgId",code),UNIQUE(id,"ownerOrgId"));
    CREATE TABLE "TransactionCode"(id SERIAL PRIMARY KEY,"ownerOrgId" INT NOT NULL,"serviceTypeId" INT NOT NULL,code TEXT NOT NULL,"nameKo" TEXT,"nameEn" TEXT,"nameVi" TEXT,"vatEnabled" BOOLEAN DEFAULT false,"isActive" BOOLEAN DEFAULT true,UNIQUE("ownerOrgId",code),FOREIGN KEY("serviceTypeId","ownerOrgId") REFERENCES "OutsourcingServiceType"(id,"ownerOrgId"));
    CREATE TABLE "PartnerTransactionCost"(id SERIAL PRIMARY KEY,"transactionCodeId" INT REFERENCES "TransactionCode"(id),"serviceTypeId" INT REFERENCES "OutsourcingServiceType"(id),"vatRate" NUMERIC,amount NUMERIC);
    CREATE TABLE "OrganizationOutsourcingServiceType"(id SERIAL PRIMARY KEY,"serviceTypeId" INT REFERENCES "OutsourcingServiceType"(id));
    INSERT INTO "OutsourcingServiceType"(id,"ownerOrgId",code,"entryMode") VALUES(100,1,'LOGISTICS','LOGISTICS');
    INSERT INTO "TransactionCode"(id,"ownerOrgId","serviceTypeId",code) VALUES(100,1,100,'OLD_CODE');
    INSERT INTO "PartnerTransactionCost"("transactionCodeId","serviceTypeId","vatRate",amount) VALUES(100,100,0,1000);`);
  await db.exec(inheritance); await db.exec(rollout);
  return db;
}
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
test('base creation/edit generates selected suffixes atomically and retains variant identities', async()=>{
  const db=await fixture();try {
    const serviceTypeId=(await db.query(`SELECT id FROM "SettingServiceDefault" WHERE code='LOGISTICS'`)).rows[0].id;
    const body={code:'AIR',nameKo:'항공',nameEn:'Air',nameVi:'Hàng không',serviceTypeId,taxTreatmentIds:[1,2,3]};
    const base=await db.transaction(tx=>service.saveCodeBase(adapter(tx),body));
    const variants=(await db.query('SELECT id,code FROM "SettingTransactionCodeDefault" WHERE "baseId"=$1 ORDER BY code',[base.id])).rows;
    assert.deepEqual(variants.map(row=>row.code),['AIRE','AIRV','AIRZ']);
    await db.transaction(tx=>service.saveCodeBase(adapter(tx),{...body,nameEn:'Air delivery',taxTreatmentIds:[1,3]},base.id));
    assert.deepEqual((await db.query('SELECT id,code FROM "SettingTransactionCodeDefault" WHERE "baseId"=$1 ORDER BY code',[base.id])).rows,variants);
    assert.equal((await db.query(`SELECT "isActive" FROM "SettingTransactionCodeDefault" WHERE code='AIRZ'`)).rows[0].isActive,false);
    for(const patch of [{code:'TOOLONG'},{code:'A1R'},{taxTreatmentIds:[]},{taxTreatmentIds:[4]},{taxTreatmentIds:[1,1]}])assert.throws(()=>service.validateCodeBase({...body,...patch}));
    await assert.rejects(db.transaction(tx=>service.saveCodeBase(adapter(tx),{...body,code:'SEA'},base.id)),/CODE_BASE_IDENTITY_IMMUTABLE/);
  }finally{await db.close();}
});
test('deleting a used base rolls back all variants; unused removal survives repeated startup SQL',async()=>{
  const db=await fixture();try {
    const source=(await db.query(`SELECT * FROM "SettingTransactionCodeDefault" WHERE code='TRKV'`)).rows[0];
    await db.query(`UPDATE "OutsourcingServiceType" SET "systemDefaultId"=$1,"isOverridden"=false WHERE id=100`,[source.serviceTypeId]);
    await db.query(`UPDATE "TransactionCode" SET "systemDefaultId"=$1,"isOverridden"=false WHERE id=100`,[source.id]);
    await assert.rejects(db.transaction(tx=>service.deleteCodeBase(adapter(tx),source.baseId)),/SETTING_IN_USE/);
    assert.equal((await db.query('SELECT * FROM "SettingTransactionCodeDefault" WHERE "baseId"=$1',[source.baseId])).rows.length,3);
    const unused=(await db.query(`SELECT id FROM "TransactionCodeBase" WHERE code='LOG'`)).rows[0].id;
    await db.transaction(tx=>service.deleteCodeBase(adapter(tx),unused));
    await db.exec(inheritance);await db.exec(rollout);
    assert.equal((await db.query(`SELECT * FROM "TransactionCodeBase" WHERE code='LOG'`)).rows.length,0);
    assert.equal((await db.query(`SELECT * FROM "SettingTransactionCodeDefault" WHERE code='LOGISTICS'`)).rows.length,0);
    assert.equal((await db.query('SELECT * FROM "PartnerTransactionCost"')).rows.length,1);
    await assert.rejects(db.transaction(tx=>service.deleteSetting(adapter(tx),'codes',false,100,1)),/SETTING_INHERITED/);
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
