import test from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
const require=createRequire(import.meta.url);
const {entityProfile,partnerProfilePatch,normalizePartnerCode}=require('../backend/dist/services/entityProfile.js');
const {registerEntityBankRoutes,requirePayeeBankAccount}=require('../backend/dist/services/entityBankAccount.js');

test('optional partner codes normalize consistently and reject invalid values without altering organization login rules',()=>{
  for(const value of [null,undefined,'','   '])assert.equal(normalizePartnerCode(value),null);
  assert.equal(normalizePartnerCode(' vendor-001.a '),'VENDOR-001.A');
  assert.deepEqual(partnerProfilePatch({code:' p_01 '}),{code:'P_01'});
  assert.deepEqual(partnerProfilePatch({code:''}),{code:null});
  for(const value of [123,'a b','x'.repeat(41)])assert.throws(()=>normalizePartnerCode(value),error=>error.status===400);
});

test('common profiles preserve actual entity FK and omitted partner fields cannot clear existing information',()=>{
  assert.equal(entityProfile({id:44,name:'Customer'}).entityId,44);
  assert.deepEqual(partnerProfilePatch({name:'Updated'}),{});
  assert.deepEqual(partnerProfilePatch({nameKo:'  Name  ',email:null,country:'VN'}),{nameKo:'Name',email:null,country:'VN'});
  for(const input of [{country:'Vietnam'},{email:123},{address:'x'.repeat(2001)}])assert.throws(()=>partnerProfilePatch(input),error=>error.status===400);
});

test('bank account API uses authorized tenant and actual entity scope; unauthorized access cannot read accounts',async()=>{
  const routes=new Map();let allowed=false,seen;
  const app=Object.fromEntries(['get','post','put'].map(method=>[method,(path,fn)=>routes.set(`${method} ${path}`,fn)]));
  const db={organization:{findFirst:async query=>{seen=query.where;return query.where.id===44?{id:44}:null;}},organizationBankAccount:{findMany:async({where})=>{assert.deepEqual(where,{orgId:1,entityId:44});return [{id:'bank',ledgerAccounts:[]}];}},currency:{findMany:async()=>[]}};
  registerEntityBankRoutes(app,db,{requireOrgRole:async()=>allowed?{organization:{id:1}}:null,getActor:()=>21});
  const get=routes.get('get /entities/:entityId/bank-accounts');
  const res={json(value){this.body=value;}};
  await get({params:{entityId:'44'},query:{orgId:999}},res);assert.equal(res.body,undefined);assert.equal(seen,undefined);
  allowed=true;await get({params:{entityId:'44'},query:{orgId:999}},res);
  assert.equal(seen.id,44);assert.deepEqual(res.body.accounts,[{id:'bank',ledgerAccounts:[]}]);
  await assert.rejects(get({params:{entityId:'45'}},res),error=>error.status===404);
});

test('a bank in another tenant or a different payee cannot satisfy the payee save requirement',async()=>{
  const tx={$queryRawUnsafe:async()=>[],organizationBankAccount:{findFirst:async({where})=>{
    assert.deepEqual(where,{orgId:1,entityId:44});return null;
  }}};
  await assert.rejects(requirePayeeBankAccount(tx,1,44),error=>error.status===400&&error.message==='PAYEE_BANK_ACCOUNT_REQUIRED');
});

test('party identity requires manual corporate codes and tax numbers while individuals can clear codes',()=>{
 const {resolvePartnerIdentity:r}=require('../backend/dist/services/entityProfile.js');
 assert.deepEqual(r({partyKind:'INDIVIDUAL',code:''},'??',{id:44,code:'MRCUON'}),{partyKind:'INDIVIDUAL',code:null});
 assert.deepEqual(r({},'Person',{id:44,partyKind:'INDIVIDUAL',code:null}),{partyKind:'INDIVIDUAL',code:null});
 assert.deepEqual(r({partyKind:'CORPORATE',code:' dexl ',businessNumber:'VN-1'},'DEX'),{partyKind:'CORPORATE',code:'DEXL'});
 for(const code of ['',null,'DEX','DEXLOG','AB-C'])assert.throws(()=>r({partyKind:'CORPORATE',code,businessNumber:'VN-1'},'Company'),/CORPORATE_PARTNER_CODE_INVALID/);
 for(const businessNumber of ['',null,undefined])assert.throws(()=>r({partyKind:'CORPORATE',code:'DEXL',businessNumber},'DEX'),/PARTNER_BUSINESS_NUMBER_REQUIRED/);
 assert.throws(()=>r({code:'DEXL'},'DEX'),/PARTNER_PARTY_KIND_REQUIRED/);
 assert.deepEqual(r({},'Legacy',{id:44,code:'LEGACY'}),{partyKind:null,code:'LEGACY'});
});

test('party migration preserves legacy identities and FKs while enforcing corporate profiles',async()=>{
 const {PGlite}=await import('@electric-sql/pglite');const {readFileSync}=await import('node:fs');const db=new PGlite();
 try{
 await db.exec(`CREATE TABLE "Organization"(id INT PRIMARY KEY,code TEXT UNIQUE,"businessNumber" TEXT);INSERT INTO "Organization" VALUES(1,'LEGACY',NULL);CREATE TABLE "History"(id INT REFERENCES "Organization"(id));INSERT INTO "History" VALUES(1);`);
 const sql=readFileSync('backend/prisma/migrations/20261102130000_partner_party_kind/migration.sql','utf8');await db.exec(sql);await db.exec(sql);
 assert.deepEqual((await db.query('SELECT * FROM "Organization"')).rows,[{id:1,code:'LEGACY',businessNumber:null,partyKind:null}]);
 await db.exec(`INSERT INTO "Organization" VALUES(2,NULL,NULL,'INDIVIDUAL'),(3,NULL,NULL,'INDIVIDUAL'),(4,'DEXL','VN-1','CORPORATE')`);
 await assert.rejects(db.exec(`INSERT INTO "Organization" VALUES(5,'ABCDE','VN-1','CORPORATE')`));
 await assert.rejects(db.exec(`INSERT INTO "Organization" VALUES(5,'ABCD',NULL,'CORPORATE')`));
 await assert.rejects(db.exec(`INSERT INTO "Organization" VALUES(5,'DEXL','VN-2','CORPORATE')`));
 assert.deepEqual((await db.query('SELECT * FROM "History"')).rows,[{id:1}]);
 }finally{await db.close();}
});
