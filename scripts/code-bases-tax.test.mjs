import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { PGlite } from '@electric-sql/pglite';
import service from '../backend/dist/services/codeBaseManagement.js';
import routes from '../backend/dist/services/transactionSettingRoutes.js';
import requests from '../backend/dist/services/transactionRequest.js';
const inheritance = fs.readFileSync('backend/prisma/migrations/20261011120000_setting_inheritance/migration.sql','utf8');
const rollout = fs.readFileSync('backend/prisma/migrations/20261013090000_code_bases_tax/migration.sql','utf8');
const usageRollout = fs.readFileSync('backend/prisma/migrations/20261013120000_code_base_usage_fk/migration.sql','utf8');
const q = value => `"${value.replaceAll('"','""')}"`;
function adapter(db) {
  const result = { $queryRawUnsafe: async (sql,...args) => {
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
      findMany: find, findUnique: async options => (await find(options))[0] || null,
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
  return db;
}
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

test('OTHER and OTH defaults are linked by FK, initialized once and never recreate deleted codes',async()=>{
  const db=await fixture();try{
    await assert.rejects(db.transaction(sql=>adapter(sql).$queryRawUnsafe('SELECT pg_advisory_xact_lock(2026101903)')),/cannot deserialize void/);
    await db.exec('CREATE TABLE IF NOT EXISTS "SystemSetting" (key TEXT PRIMARY KEY,value JSONB NOT NULL,"updatedByEmployeeId" INT)');
    const bootstrap=()=>db.transaction(async sql=>{
      const tx=adapter(sql);
      tx.systemSetting={findUnique:async({where})=>(await sql.query('SELECT * FROM "SystemSetting" WHERE key=$1',[where.key])).rows[0],create:async({data})=>sql.query('INSERT INTO "SystemSetting" (key,value,"updatedByEmployeeId") VALUES($1,$2::jsonb,$3)',[data.key,JSON.stringify(data.value),data.updatedByEmployeeId])};
      return service.initializeOtherExpenseDefaults(tx,20);
    });
    const first=await bootstrap();await bootstrap();
    const type=(await db.query('SELECT * FROM "ExpenseType" WHERE code=$1',['OTHER'])).rows[0];
    const base=(await db.query('SELECT * FROM "TransactionCodeBase" WHERE code=$1',['OTH'])).rows[0];
    assert.equal(base.expenseTypeId,type.id);assert.equal(type.entryMode,'GENERAL');
    assert.deepEqual((await db.query('SELECT code FROM "SettingTransactionCodeDefault" WHERE "baseId"=$1 ORDER BY code',[base.id])).rows.map(row=>row.code),['OTHE','OTHV','OTHZ']);
    await db.query('UPDATE "TransactionCodeBase" SET "nameEn"=$1 WHERE id=$2',['Custom other',base.id]);await bootstrap();
    assert.equal((await db.query('SELECT "nameEn" FROM "TransactionCodeBase" WHERE id=$1',[base.id])).rows[0].nameEn,'Custom other');
    await db.transaction(sql=>service.deleteCodeBase(adapter(sql),base.id));await bootstrap();
    assert.equal((await db.query('SELECT * FROM "TransactionCodeBase" WHERE id=$1',[first.baseId])).rows.length,0);
  }finally{await db.close();}
});
