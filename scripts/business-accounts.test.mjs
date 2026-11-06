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
 const accounts=[],ledgers=[],staff=[{id:7,orgId:1,status:'ACTIVE',orgRole:'ADMIN'},{id:8,orgId:1,status:'ACTIVE',orgRole:'ACCOUNTANT'}],currencies=[{id:1,code:'VND'},{id:2,code:'USD'},{id:3,code:'KRW'}];
 const include=row=>row?{...row,currency:currencies.find(c=>c.id===row.currencyId),ledgerAccounts:ledgers.filter(a=>a.entityAccountId===row.id).map(a=>({...a,_count:{entries:a.entryCount||0}}))}:null;
 const match=(row,where)=>Object.entries(where).every(([key,value])=>(value?.in?value.in.includes(row[key]):row[key]===value));
 const db={organization:{findFirst:async({where})=>where.id===1?{id:1}:null},employee:{findUnique:async()=>({email:'actor@example.com'}),findFirst:async({where})=>staff.find(row=>match(row,where))||null},currency:{findUnique:async({where})=>currencies.find(c=>c.id===where.id),findMany:async()=>currencies},$queryRawUnsafe:async()=>[],bankLedgerEntry:{groupBy:async()=>[]},bankLedgerAccount:{findFirst:async({where})=>ledgers.find(r=>match(r,where))||null,findMany:async()=>ledgers.map(row=>({...row,entityAccount:accounts.find(a=>a.id===row.entityAccountId)})),create:async({data})=>{const row={id:'ledger-'+ledgers.length,...data};ledgers.push(row);return row;}},organizationBankAccount:{
  findFirst:async({where})=>include(accounts.find(r=>match(r,where))),count:async()=>accounts.length,
  findMany:async({where})=>accounts.filter(r=>match(r,where)).sort((a,b)=>a.sortOrder-b.sortOrder||a.id.localeCompare(b.id)).map(include),
  create:async({data})=>{const row={id:'a'+accounts.length,createdAt:new Date('2026-01-01'),...data};accounts.push(row);return include(row);},
  update:async({where,data})=>{const row=accounts.find(r=>r.id===where.id),oldCode=currencies.find(c=>c.id===row.currencyId).code,newCode=currencies.find(c=>c.id===(data.currencyId??row.currencyId)).code;const own=ledgers.filter(a=>a.entityAccountId===row.id);if(oldCode!==newCode&&!own.some(a=>a.currencyCode===newCode))for(const ledger of own)if(ledger.currencyCode===oldCode&&!ledger.entryCount&&Number(ledger.openingBalance)===0)ledger.currencyCode=newCode;if(data.currencyId!==undefined)for(const ledger of own)Object.assign(ledger,{bankName:data.bankName,accountNumber:data.accountNumber,accountHolder:data.accountHolder});Object.assign(row,data);return include(row);},
 }};db.$transaction=async run=>run(db);return {db,accounts,ledgers,staff};
}
test('business registration supports VND twice, USD and KRW cash accounts without bank numbers or default/active settings',async()=>{
 const {db,accounts,ledgers}=memory();
 for(const [index,currencyId] of [1,1,2,3].entries())await saveEntityBankAccount(db,1,7,1,null,{accountKind:'CASH',displayName:'Cash '+index,currencyId,isDefault:true,isActive:false});
 assert.equal(accounts.length,4);assert.equal(ledgers.length,4);assert.ok(ledgers.every(row=>row.openingBalance==='0'));
 for(const row of accounts){assert.equal(row.bankName,'');assert.equal(row.accountNumber,'');assert.equal('isDefault' in row,false);assert.equal('isActive' in row,false);}
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

test('administrators edit all bank metadata; used currency ledgers and opening balances are preserved',async()=>{
 const {db,accounts,ledgers,staff}=memory();
 const created=await saveEntityBankAccount(db,1,7,1,null,{accountKind:'CASH',displayName:'VCB',currencyId:1}),ledgerId=ledgers[0].id;
 const bank={accountKind:'BANK',displayName:'VCB',currencyId:2,bankName:'VCB',accountNumber:'001234',accountHolder:'DEX LOGIS'};
 await saveEntityBankAccount(db,1,7,1,created.id,bank);assert.equal(accounts.length,1);assert.equal(ledgers.length,1);assert.equal(ledgers[0].id,ledgerId);assert.equal(accounts[0].accountKind,'BANK');assert.equal(accounts[0].accountHolder,'DEX LOGIS');
 await assert.rejects(saveEntityBankAccount(db,1,7,1,created.id,{...bank,accountHolder:''}),/INVALID_BANK_ACCOUNT/);
 ledgers[0].entryCount=1;ledgers[0].openingBalance='100';
 await saveEntityBankAccount(db,1,7,1,created.id,{...bank,currencyId:1,accountNumber:'changed'});assert.equal(accounts[0].currencyId,1);assert.equal(ledgers.length,2);assert.equal(ledgers[0].currencyCode,'USD');assert.equal(ledgers[0].openingBalance,'100');assert.equal(ledgers[0].id,ledgerId);assert.equal(ledgers[1].currencyCode,'VND');assert.equal(ledgers[1].openingBalance,'0');
 await saveEntityBankAccount(db,1,7,1,created.id,bank);assert.equal(ledgers.length,2,'returning to a prior currency reuses its ledger');
 await assert.rejects(saveEntityBankAccount(db,2,7,1,created.id,bank),/ACCESS_DENIED/);
 await assert.rejects(saveEntityBankAccount(db,1,8,1,created.id,bank),/ADMIN_REQUIRED/);
 await assert.rejects(saveEntityBankAccount(db,1,999,1,created.id,bank),/ADMIN_REQUIRED/);
 staff[0].status='INACTIVE';await assert.rejects(saveEntityBankAccount(db,1,7,1,created.id,bank),/ADMIN_REQUIRED/);
});

test('accountants and operators can read accounts but cannot forge administrator account writes or ordering',async()=>{
 const {db}=memory();
 for(const role of ['ACCOUNTANT','OPERATOR']){
  const routes=new Map();registerEntityBankRoutes(Object.fromEntries(['get','post','put'].map(method=>[method,(p,f)=>routes.set(method+p,f)])),db,{requireOrgRole:async()=>({organization:{id:1,type:'SERVICE'},employee:{id:8,orgRole:role},systemUser:{systemRole:'SYSTEM_ADMIN'}}),getActor:()=>8,loadPolicy:async()=>({policy:{SERVICE:{ACCOUNTANT:['BANK_LEDGER']}}})});
  let status,body;const res={status(value){status=value;return this;},json(value){body=value;}};
  for(const key of ['post/entities/:entityId/bank-accounts','put/entities/:entityId/bank-accounts/:id','put/entities/:entityId/bank-accounts/order']){
   await routes.get(key)({params:{entityId:'1',id:'a'},body:{role:'ADMIN',actorId:7}},res);assert.equal(status,403);assert.equal(body.error,'BANK_ACCOUNT_ADMIN_REQUIRED');
  }
  await routes.get('get/entities/:entityId/bank-accounts')({params:{entityId:'1'}},res);assert.deepEqual(body.accounts,[]);
 }
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
  await db.exec(`ALTER TABLE "BankLedgerAccount" ADD COLUMN "accountHolder" TEXT NOT NULL DEFAULT ''; ALTER TABLE "BankLedgerEntry" ADD COLUMN "accountId" TEXT,ADD COLUMN "voidedAt" TIMESTAMP; INSERT INTO "Currency" VALUES(2,'USD');`);
  const correction=readFileSync('backend/prisma/migrations/20261102110000_editable_account_identity/migration.sql','utf8');await db.exec(correction);await db.exec(correction);
  await db.exec(`UPDATE "OrganizationBankAccount" SET "accountKind"='BANK',"currencyId"=2,"bankName"='VCB',"accountNumber"='001234',"accountHolder"='DEX LOGIS' WHERE id='a'`);
  assert.deepEqual((await db.query(`SELECT id,"entityAccountId","currencyCode","bankName","accountNumber","accountHolder","openingBalance"::text FROM "BankLedgerAccount" WHERE id='a'`)).rows,[{id:'a',entityAccountId:'a',currencyCode:'USD',bankName:'VCB',accountNumber:'001234',accountHolder:'DEX LOGIS',openingBalance:'0'}]);
  await db.exec(`INSERT INTO "BankLedgerEntry"(id,amount,"accountId","voidedAt") VALUES('voided',5,'b',now())`);
  await db.exec(`UPDATE "OrganizationBankAccount" SET "accountKind"='BANK',"bankName"='B',"accountNumber"='2',"accountHolder"='Holder' WHERE id='b'`);
  await db.exec(`UPDATE "OrganizationBankAccount" SET "currencyId"=2 WHERE id='b'`);assert.equal((await db.query(`SELECT "currencyCode" FROM "BankLedgerAccount" WHERE id='b'`)).rows[0].currencyCode,'VND');await assert.rejects(db.exec(`UPDATE "BankLedgerAccount" SET "currencyCode"='USD' WHERE id='b'`),/IDENTITY_LOCKED/);
  await db.exec(`INSERT INTO "BankLedgerAccount"(id,"orgId","bankName","accountNumber","accountHolder","currencyCode","openingDate","openingBalance","entityAccountId") VALUES('b-usd',1,'B','2','Holder','USD','2026-01-01',0,'b')`);
  assert.equal((await db.query(`SELECT count(*)::int AS n FROM "BankLedgerAccount" WHERE "entityAccountId"='b'`)).rows[0].n,2);
  await db.exec(`UPDATE "OrganizationBankAccount" SET "currencyId"=1 WHERE id='b'`);assert.equal((await db.query(`SELECT count(*)::int AS n FROM "BankLedgerAccount" WHERE "entityAccountId"='b'`)).rows[0].n,2);
  assert.deepEqual((await db.query(`SELECT id,amount::text FROM "BankLedgerEntry" WHERE "accountId"='b'`)).rows,[{id:'voided',amount:'5'}]);
  await db.exec(`INSERT INTO "OrganizationBankAccount"(id,"orgId","entityId","currencyId","bankName","accountNumber","accountHolder","accountKind","displayName") VALUES('c',1,1,1,'','','','CASH','c'); INSERT INTO "BankLedgerAccount"(id,"orgId","bankName","accountNumber","currencyCode","openingDate","openingBalance","entityAccountId") VALUES('c',1,'','','VND','2026-01-01',1,'c');`);
  await db.exec(`UPDATE "OrganizationBankAccount" SET "accountKind"='BANK',"bankName"='B',"accountNumber"='3',"accountHolder"='Holder',"currencyId"=2 WHERE id='c'`);assert.equal((await db.query(`SELECT "currencyCode","openingBalance"::text AS balance FROM "BankLedgerAccount" WHERE id='c'`)).rows[0].balance,'1');
  await assert.rejects(db.exec(`UPDATE "BankLedgerAccount" SET "openingBalance"=99 WHERE id='a'`),/OPENING_LOCKED/);
  assert.equal((await db.query(`SELECT amount::text FROM "BankLedgerEntry" WHERE id='old'`)).rows[0].amount,'123');
 }finally{await db.close();}
});


test('partner accounts allow active accountants and operators to create, edit and reorder within entity access',async()=>{
 for(const role of ['ACCOUNTANT','OPERATOR']){
  const {db,accounts,staff}=memory();staff[1].orgRole=role;
  db.organization.findFirst=async({where})=>where.ownerOrgId===null?null:[1,2].includes(where.id)?{id:where.id}:null;
  const routes=new Map();
  registerEntityBankRoutes(Object.fromEntries(['get','post','put'].map(method=>[method,(p,f)=>routes.set(method+p,f)])),db,{requireOrgRole:async(req,res,options)=>{assert.equal(options.allowSystemAdmin,false);return {organization:{id:1,type:'SERVICE'},employee:staff[1]};},getActor:()=>8,loadPolicy:async()=>({policy:{SERVICE:{}}})});
  let response,status;const res={status(value){status=value;return this;},json(value){response=value;}};
  const body={accountKind:'BANK',displayName:'Partner',currencyId:1,bankName:'Bank',accountNumber:'123',accountHolder:'Holder'};
  await routes.get('post/entities/:entityId/bank-accounts')({params:{entityId:'2'},body},res);assert.equal(status,201);const id=response.id;
  await routes.get('put/entities/:entityId/bank-accounts/:id')({params:{entityId:'2',id},body:{...body,accountNumber:'456'}},res);assert.equal(response.accountNumber,'456');assert.equal(accounts[0].updatedByEmployeeId,8);
  await routes.get('put/entities/:entityId/bank-accounts/order')({params:{entityId:'2'},body:{ids:[id],revision:editRevision(await db.organizationBankAccount.findMany({where:{orgId:1,entityId:2}}))}},res);assert.deepEqual(response,{ok:true});
  await assert.rejects(saveEntityBankAccount(db,1,8,3,null,body),/ENTITY_NOT_FOUND/);
  staff[1].status='INACTIVE';await assert.rejects(saveEntityBankAccount(db,1,8,2,id,body),/ACCESS_DENIED/);
  await assert.rejects(saveEntityBankAccount(db,2,8,1,id,body),/ACCESS_DENIED/);
 }
});
