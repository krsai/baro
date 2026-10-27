import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createRequire} from 'node:module';
import {PGlite} from '@electric-sql/pglite';
const require=createRequire(import.meta.url);
const {saveEntityBankAccount,registerEntityBankRoutes}=require('../backend/dist/services/entityBankAccount.js');
const {listLedgerAccounts}=require('../backend/dist/services/bankLedger.js');
const {editRevision}=require('../backend/dist/utils/editRevision.js');
function memory(){
 const accounts=[],ledgers=[],currencies=[{id:1,code:'VND'},{id:2,code:'USD'},{id:3,code:'KRW'}];
 const include=row=>row?{...row,currency:currencies.find(c=>c.id===row.currencyId),ledgerAccounts:ledgers.filter(a=>a.entityAccountId===row.id)}:null;
 const match=(row,where)=>Object.entries(where).every(([key,value])=>row[key]===value);
 const db={organization:{findFirst:async({where})=>where.id===1?{id:1}:null},employee:{findUnique:async()=>({email:'actor@example.com'})},currency:{findUnique:async({where})=>currencies.find(c=>c.id===where.id),findMany:async()=>currencies},$queryRawUnsafe:async()=>[],bankLedgerEntry:{groupBy:async()=>[]},bankLedgerAccount:{findFirst:async({where})=>ledgers.find(r=>match(r,where))||null,findMany:async()=>ledgers.map(row=>({...row,entityAccount:accounts.find(a=>a.id===row.entityAccountId)})),create:async({data})=>{const row={id:'ledger-'+ledgers.length,...data};ledgers.push(row);return row;}},organizationBankAccount:{
  findFirst:async({where})=>include(accounts.find(r=>match(r,where))),count:async()=>accounts.length,
  findMany:async({where})=>accounts.filter(r=>match(r,where)).sort((a,b)=>a.sortOrder-b.sortOrder||a.id.localeCompare(b.id)).map(include),
  create:async({data})=>{const row={id:'a'+accounts.length,createdAt:new Date('2026-01-01'),...data};accounts.push(row);return include(row);},
  update:async({where,data})=>{const row=accounts.find(r=>r.id===where.id);Object.assign(row,data);return include(row);},
 }};db.$transaction=async run=>run(db);return {db,accounts,ledgers};
}
test('business registration supports VND twice, USD and KRW cash accounts without bank numbers or default/active settings',async()=>{
 const {db,accounts,ledgers}=memory();
 for(const [index,currencyId] of [1,1,2,3].entries())await saveEntityBankAccount(db,1,7,1,null,{accountKind:'CASH',displayName:'Cash '+index,currencyId,isDefault:true,isActive:false});
 assert.equal(accounts.length,4);assert.equal(ledgers.length,4);assert.ok(ledgers.every(row=>row.openingBalance==='0'));
 for(const row of accounts){assert.equal(row.bankName,'');assert.equal(row.accountNumber,'');assert.equal('isDefault' in row,false);assert.equal('isActive' in row,false);}
 await assert.rejects(saveEntityBankAccount(db,1,7,1,accounts[0].id,{...accounts[0],currencyId:2}),/IDENTITY_LOCKED/);
 await assert.rejects(saveEntityBankAccount(db,1,7,1,accounts[0].id,{...accounts[0],openingDate:'2026-01-01',openingBalance:'5'}),/OPENING_LOCKED/);
 const routes=new Map();registerEntityBankRoutes(Object.fromEntries(['get','post','put'].map(method=>[method,(p,f)=>routes.set(method+p,f)])),db,{requireOrgRole:async()=>({organization:{id:1,type:'MANUFACTURER'},employee:{orgRole:'ADMIN'}}),getActor:()=>7,loadPolicy:async()=>({policy:{MANUFACTURER:{ADMIN:['BANK_LEDGER']}}})});
 const revision=editRevision(await db.organizationBankAccount.findMany({where:{orgId:1,entityId:1}}));let response;const res={json:r=>response=r};
 const request={params:{entityId:'1'},body:{revision,ids:accounts.map(a=>a.id).reverse()}};
 await routes.get('put/entities/:entityId/bank-accounts/order')(request,res);assert.deepEqual(response,{ok:true});
 assert.deepEqual((await listLedgerAccounts(db,1)).map(a=>a.displayName),['Cash 3','Cash 2','Cash 1','Cash 0']);
 await assert.rejects(routes.get('put/entities/:entityId/bank-accounts/order')(request,res),/STALE_EDIT/);
 request.body.revision=editRevision(await db.organizationBankAccount.findMany({where:{orgId:1,entityId:1}}));request.body.ids=['foreign','a1','a2','a3'];
 await assert.rejects(routes.get('put/entities/:entityId/bank-accounts/order')(request,res),/INVALID_ACCOUNT_ORDER/);
});
test('account schema preserves old ledgers, permits two cash accounts, and enforces real account ownership and opening history',async()=>{
 const db=new PGlite(),sql=readFileSync('backend/prisma/migrations/20261027190000_business_accounts_order/migration.sql','utf8');
 try{
  await db.exec(`CREATE TABLE "Organization"(id INT PRIMARY KEY);INSERT INTO "Organization" VALUES(1),(2);
  CREATE TABLE "Currency"(id INT PRIMARY KEY,code TEXT);INSERT INTO "Currency" VALUES(1,'VND');
  CREATE TABLE "OrganizationBankAccount"(id TEXT PRIMARY KEY,"orgId" INT,"entityId" INT,"currencyId" INT,"bankName" TEXT,"accountNumber" TEXT,"accountHolder" TEXT,UNIQUE(id,"orgId"));
  CREATE TABLE "BankLedgerAccount"(id TEXT PRIMARY KEY,"orgId" INT,"bankName" TEXT,"accountNumber" TEXT,"currencyCode" TEXT,"openingDate" TEXT,"openingBalance" NUMERIC);
  CREATE TABLE "BankLedgerEntry"(id TEXT PRIMARY KEY,amount NUMERIC);INSERT INTO "BankLedgerEntry" VALUES('old',123);
  INSERT INTO "BankLedgerAccount" VALUES('old',1,'Bank','001','VND','2026-01-01',100);`);
  await db.exec(sql);
  assert.equal((await db.query(`SELECT amount::text FROM "BankLedgerEntry" WHERE id='old'`)).rows[0].amount,'123');
  for(const id of ['a','b'])await db.query(`INSERT INTO "OrganizationBankAccount"(id,"orgId","entityId","currencyId","bankName","accountNumber","accountHolder","accountKind","displayName") VALUES($1,1,1,1,'','','','CASH',$1)`,[id]);
  for(const id of ['a','b'])await db.query(`INSERT INTO "BankLedgerAccount" VALUES($1,1,'','','VND','2026-01-01',0,$1)`,[id]);
  await assert.rejects(db.exec(`INSERT INTO "BankLedgerAccount" VALUES('foreign',2,'','','VND','2026-01-01',0,'a')`),/foreign key|MASTER_SCOPE/);
  await assert.rejects(db.exec(`UPDATE "BankLedgerAccount" SET "openingBalance"=99 WHERE id='a'`),/OPENING_LOCKED/);
  await assert.rejects(db.exec(`UPDATE "OrganizationBankAccount" SET "currencyId"=2 WHERE id='a'`),/IDENTITY_LOCKED/);
  await db.exec(`UPDATE "OrganizationBankAccount" SET "sortOrder"=3 WHERE id='a'`);
 }finally{await db.close();}
});
