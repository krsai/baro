import test from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {randomUUID} from 'node:crypto';
import {readFile} from 'node:fs/promises';
import {PGlite} from '@electric-sql/pglite';
import {canAccessPath} from '../frontend/src/utils/accessControl.js';
import {getDefaultRoleAccessPolicy,ROLE_ACCESS_POLICY_SCHEMA_VERSION} from '../frontend/src/utils/roleAccessPolicyCore.mjs';
import {formatLedgerMoney} from '../frontend/src/utils/bankLedgerMoney.mjs';
import {loadSourceBindings} from './helpers/source-bindings.mjs';
const require=createRequire(import.meta.url);
const {ledgerScale4,ledgerMoney,validateLedgerMoney,ledgerDate,saveLedgerAccount,postLedgerEntry,listLedgerAccounts,listLedgerEntries,registerBankLedgerRoutes}=require('../backend/dist/services/bankLedger.js');
const {companyChoices,createServiceCompany,registerCompanyWorkspaceRoutes,resolveCompanyWorkspace}=require('../backend/dist/services/companyWorkspaces.js');
const decimal=value=>{const negative=value<0n,s=(negative?-value:value).toString().padStart(5,'0');return `${negative?'-':''}${s.slice(0,-4)}.${s.slice(-4)}`;};
const comparable=value=>value instanceof Date?value.getTime():value;
function matches(row,where={}){
 return Object.entries(where).every(([key,value])=>{
  if(key==='OR')return value.some(branch=>matches(row,branch));
  if(value&&typeof value==='object'&&!(value instanceof Date))return Object.entries(value).every(([op,expected])=>op==='lt'?comparable(row[key])<comparable(expected):op==='lte'?comparable(row[key])<=comparable(expected):op==='gt'?comparable(row[key])>comparable(expected):op==='gte'?comparable(row[key])>=comparable(expected):op==='not'?row[key]!==expected:op==='in'?expected.includes(row[key]):false);
  return comparable(row[key])===comparable(value);
 });
}
function memoryLedger(){
 const accounts=[],entries=[];let clock=0;
 const model=rows=>({
  findFirst:async({where})=>rows.find(row=>matches(row,where))||null,
  findUnique:async({where})=>rows.find(row=>matches(row,Object.values(where)[0]))||null,
  findMany:async({where,orderBy=[],skip=0,take})=>rows.filter(row=>matches(row,where)).sort((a,b)=>{for(const order of orderBy){const [key,direction]=Object.entries(order)[0],left=comparable(a[key]),right=comparable(b[key]);if(left!==right)return (left<right?-1:1)*(direction==='desc'?-1:1);}return 0;}).slice(skip,take?skip+take:undefined),
  create:async({data})=>{const row={id:randomUUID(),createdAt:new Date(1760000000000+clock++),voidedAt:null,...data};rows.push(row);return row;},
  update:async({where,data})=>{const row=rows.find(row=>row.id===where.id);Object.assign(row,data);return row;},
  groupBy:async({by,where})=>{const groups=new Map();for(const row of rows.filter(row=>matches(row,where))){const key=JSON.stringify(by.map(field=>row[field]));const group=groups.get(key)||{...Object.fromEntries(by.map(field=>[field,row[field]])),minor:0n};group.minor+=ledgerScale4(row.amount);groups.set(key,group);}return [...groups.values()].map(({minor,...row})=>({...row,_sum:{amount:decimal(minor)}}));},
 });
 const db={organizationBankAccount:{findMany:async()=>[]},bankLedgerAccount:model(accounts),bankLedgerEntry:model(entries),$transaction:async run=>run(db)};
 return {db,accounts,entries};
}
const accountBody=(extra={})=>({clientKey:randomUUID(),bankName:'Bank',accountNumber:'001',accountHolder:'Company',currencyCode:'USD',openingDate:'2026-10-01',openingBalance:'100.00',...extra});
const entryBody=(extra={})=>({clientKey:randomUUID(),transactionDate:'2026-10-03',direction:'IN',amount:'0.10',purpose:'Customer payment',evidenceNumber:'BANK-001',...extra});

test('accounting codes derive the description, validate company scope and retain the original retry after catalogue changes',async()=>{
 const {db,entries}=memoryLedger(),account=await saveLedgerAccount(db,1,'actor',accountBody());
 let active=true;
 db.transactionCode={findFirst:async({where})=>where.ownerOrgId===1&&where.id===7&&active?{id:7,isActive:true,taxTreatmentId:1,taxTreatment:{code:'VAT',suffix:'V'},base:{code:'GEN',isActive:true,nameEn:'Administration',expenseType:{isActive:true,nameEn:'Management'},variants:[{id:4,taxTreatmentId:1,isActive:true,isEnabled:true}]}}:null};
 const body=entryBody({accountingCodeId:7,purpose:'Forged description'});
 const saved=await postLedgerEntry(db,1,'actor',account.id,body);
 assert.equal(saved.accountingCodeId,7);assert.equal(saved.purpose,'Management - Administration');
 active=false;
 assert.equal((await postLedgerEntry(db,1,'actor',account.id,body)).id,saved.id);assert.equal(entries.length,1);
 await assert.rejects(postLedgerEntry(db,1,'actor',account.id,{...body,clientKey:randomUUID()}),/ACCOUNTING_CODE_INVALID/);
 await assert.rejects(postLedgerEntry(db,1,'actor',account.id,{...body,accountingCodeId:8}),/RETRY_CONFLICT/);
 await assert.rejects(postLedgerEntry(db,1,'actor',account.id,{...body,accountingCodeId:'7'}),/ACCOUNTING_CODE_INVALID/);
});
test('zero-start account is balanced by an explicit adjustment and normal transactions still require evidence',async()=>{
 const {db}=memoryLedger(),account=await saveLedgerAccount(db,1,'actor',accountBody({openingBalance:'0'}));
 await postLedgerEntry(db,1,'actor',account.id,entryBody({evidenceType:'ADJUSTMENT',evidenceNumber:'',purpose:'Reconcile bank statement',amount:'100'}));
 await postLedgerEntry(db,1,'actor',account.id,entryBody({direction:'OUT',amount:'20',evidenceNumber:'receipt.pdf'}));
 assert.equal((await listLedgerEntries(db,1,account.id,{start:'2026-10-01',end:'2026-10-31'})).currentBalance,'80.00');
 await assert.rejects(postLedgerEntry(db,1,'actor',account.id,entryBody({evidenceNumber:''})),/FILE_REQUIRED/);
});
test('money remains exact above Number precision and respects currency digits, signed opening balance and real dates',()=>{
 assert.equal(formatLedgerMoney('-10000000000000000.01','USD'),'USD -10,000,000,000,000,000.01');
 assert.equal(validateLedgerMoney('99999999999999999999.99','USD'),'99999999999999999999.99');
 assert.equal(ledgerMoney(ledgerScale4('9999999999999999.99')+ledgerScale4('0.01'),'USD'),'10000000000000000.00');
 assert.equal(validateLedgerMoney('-100','VND',true),'-100');
 for(const [value,code] of [['1.01','VND'],['1.1','KRW'],['1.001','USD'],['0','USD'],['-1','USD'],['NaN','USD'],['1e2','USD']])assert.throws(()=>validateLedgerMoney(value,code),/INVALID_AMOUNT/);
 assert.throws(()=>validateLedgerMoney(0.1,'USD'),/INVALID_AMOUNT/);
 assert.throws(()=>ledgerDate('2026-02-30'),/INVALID_DATE/);assert.equal(ledgerDate('2024-02-29'),'2024-02-29');
});
test('account and entry saves are idempotent, scoped and ignore forged actors/balances',async()=>{
 const {db,accounts,entries}=memoryLedger(),body=accountBody();
 const account=await saveLedgerAccount(db,1,'owner@example.com',body);
 assert.equal((await saveLedgerAccount(db,1,'owner@example.com',body)).id,account.id);assert.equal(accounts.length,1);
 await assert.rejects(saveLedgerAccount(db,1,'owner@example.com',{...body,openingBalance:'99'}),/RETRY_CONFLICT/);
 await assert.rejects(saveLedgerAccount(db,1,'owner@example.com',{...body,clientKey:randomUUID()}),/ACCOUNT_EXISTS/);
 const input=entryBody({orgId:9,createdBy:'forged',balance:'999999'});
 const entry=await postLedgerEntry(db,1,'accountant@example.com',account.id,input);
 assert.equal((await postLedgerEntry(db,1,'accountant@example.com',account.id,input)).id,entry.id);assert.equal(entries.length,1);
 assert.equal(entry.orgId,1);assert.equal(entry.createdBy,'accountant@example.com');assert.equal(entry.balance,undefined);
 await assert.rejects(postLedgerEntry(db,2,'outsider@example.com',account.id,entryBody()),/ACCOUNT_NOT_FOUND/);
 await assert.rejects(postLedgerEntry(db,1,'accountant@example.com',account.id,{...input,amount:'1'}),/RETRY_CONFLICT/);
 await assert.rejects(postLedgerEntry(db,1,'accountant@example.com',account.id,entryBody({transactionDate:'2026-09-30'})),/BEFORE_OPENING/);
  await assert.rejects(postLedgerEntry(db,1,'accountant@example.com',account.id,entryBody({transactionDate:'9999-01-01'})),/FUTURE_DATE/);
 await assert.rejects(postLedgerEntry(db,1,'accountant@example.com',account.id,entryBody({evidenceNumber:''})),/FILE_REQUIRED/);
});
test('backdated entries, date filtering and voids produce the correct running and current balances without mixing companies',async()=>{
 const {db,entries}=memoryLedger(),a=await saveLedgerAccount(db,1,'owner',accountBody()),foreign=await saveLedgerAccount(db,2,'owner',accountBody());
 await postLedgerEntry(db,1,'staff',a.id,entryBody({transactionDate:'2026-10-05',amount:'0.20'}));
 await postLedgerEntry(db,1,'staff',a.id,entryBody({transactionDate:'2026-10-03',amount:'0.10'}));
 await postLedgerEntry(db,1,'staff',a.id,entryBody({transactionDate:'2026-10-05',direction:'OUT',amount:'10.00'}));
 await postLedgerEntry(db,2,'staff',foreign.id,entryBody({amount:'999.00'}));
 let result=await listLedgerEntries(db,1,a.id,{start:'2026-10-05',end:'2026-10-31'});
 assert.deepEqual(result.rows.map(row=>row.balance),['100.30','90.30']);assert.equal(result.currentBalance,'90.30');assert.equal(result.totalIn,'0.20');assert.equal(result.totalOut,'10.00');
 entries.find(row=>row.direction==='OUT').voidedAt=new Date();
 result=await listLedgerEntries(db,1,a.id,{start:'2026-10-01',end:'2026-10-31'});
 assert.equal(result.currentBalance,'100.30');assert.equal(result.rows.at(-1).balance,'100.30');assert.equal(result.totalOut,'0.00');
 const accounts=await listLedgerAccounts(db,1);assert.equal(accounts.length,1);assert.equal(accounts[0].currentBalance,'100.30');
});
test('running balance carries over page boundaries and repeated void requests retain original audit information',async()=>{
 const {db,entries}=memoryLedger(),a=await saveLedgerAccount(db,1,'owner',accountBody());
 for(let i=0;i<101;i++)await postLedgerEntry(db,1,'staff',a.id,entryBody());
 const first=await listLedgerEntries(db,1,a.id,{start:'2026-10-01',end:'2026-10-31'}),second=await listLedgerEntries(db,1,a.id,{start:'2026-10-01',end:'2026-10-31',page:1});
 assert.equal(first.rows.length,100);assert.equal(first.hasMore,true);assert.equal(second.rows[0].balance,'110.10');assert.equal(second.hasMore,false);
 const routes=new Map(),app={get:(p,f)=>routes.set('GET '+p,f),post:(p,f)=>routes.set('POST '+p,f)};
 registerBankLedgerRoutes(app,db,{requireOrgRole:async()=>({organization:{id:1,type:'SERVICE'},employee:{orgRole:'ACCOUNTANT'},requesterEmail:'staff@example.com'}),loadPolicy:async()=>({policy:getDefaultRoleAccessPolicy()})});
 const handler=routes.get('POST /bank-ledger/accounts/:accountId/entries/:entryId/void'),req={params:{accountId:a.id,entryId:entries[0].id},body:{reason:'Wrong bank reference'}},res={json:()=>{}};
 await handler(req,res);await handler({...req,body:{reason:'A changed reason'}},res);
 assert.equal(entries[0].voidReason,'Wrong bank reference');assert.equal(entries[0].voidedBy,'staff@example.com');
});
test('service accountants can use banking without gaining manufacturing menus; current explicit denials are retained',()=>{
 const state={isAuthenticated:true,accessProfile:{entryType:'ORG',orgType:'SERVICE',orgRole:'ACCOUNTANT',accessPolicy:getDefaultRoleAccessPolicy()}};
 assert.equal(canAccessPath('/bank-ledger',state),true);for(const path of ['/order','/style','/assignment','/payroll'])assert.equal(canAccessPath(path,state),false);
 state.accessProfile.accessPolicy={__schemaVersion:ROLE_ACCESS_POLICY_SCHEMA_VERSION,SERVICE:{ACCOUNTANT:[]}};
 assert.equal(canAccessPath('/bank-ledger',state),false);
});
test('bank query bounds use the account opening date without inheriting factory management dates or factory errors',async()=>{
 const dayjs=createRequire(new URL('../frontend/package.json',import.meta.url))('dayjs');
 const code=(await readFile('frontend/src/hooks/useQueryDateBounds.js','utf8')).replace(/^import .*;\r?\n/gm,'').replace('export default ','');
 const useQueryDateBounds=new Function('dayjs','useEffect','useState','useManagementPeriod',`${code};return useQueryDateBounds;`)(dayjs,()=>{},fn=>[fn(),()=>{}],()=>({startDate:'2026-10-01',loading:true,error:true}));
 const bank=useQueryDateBounds({min:'2026-01-01',independentDateBounds:true});
 assert.equal(bank.minimum,'2026-01-01');assert.equal(bank.loading,false);
 const production=useQueryDateBounds({min:'2026-01-01'});assert.equal(production.minimum,'2026-10-01');assert.equal(production.loading,true);
});
test('frontend and backend access-policy defaults and upgrades stay aligned for both production and service tenants',()=>{
 const names=['ORGANIZATION_TYPE_KEYS','ORG_ACCESS_ROLES','ROLE_ACCESS_POLICY_SCHEMA_VERSION','ROLE_ACCESS_POLICY_SCHEMA_VERSION_KEY','ROLE_ACCESS_POLICY_FEATURES','ROLE_ACCESS_POLICY_FEATURE_SET','DEFAULT_ROLE_ACCESS_POLICY','cloneRoleAccessPolicy','sanitizeRoleAccessPolicyFeatureList','getRoleAccessPolicySchemaVersion','applyLegacyDashboardDefault','applyLegacyProductionAnalysisDefault','applyLegacyOutsourcingRecordDefault','applyLegacyBusinessPartnerSplitDefault','applyLegacyRevenueAnalysisDefault','applyLegacyRevenueForecastSplitDefault','applyLegacyEmployeeFactoryScopeAccessDefault','applyLegacyEmployeeSystemDefault','applyLegacySalarySystemDefault','sanitizeRoleAccessPolicy'];
 const backend=loadSourceBindings('backend/src/index.ts',names,{ensureArray:value=>Array.isArray(value)?value:[]});
 const canonical=policy=>Object.fromEntries(Object.entries(policy).map(([type,roles])=>[type,Object.fromEntries(Object.entries(roles).map(([role,features])=>[role,[...features].sort()]))]));
 assert.equal(backend.ROLE_ACCESS_POLICY_SCHEMA_VERSION,ROLE_ACCESS_POLICY_SCHEMA_VERSION);
 assert.deepEqual(canonical(backend.DEFAULT_ROLE_ACCESS_POLICY),canonical(getDefaultRoleAccessPolicy()));
 for(const version of [0,12,13]){
  const value={__schemaVersion:version,MANUFACTURER:{ACCOUNTANT:['INVOICE']},BRAND:{ADMIN:['STYLE']}};
  const result=backend.sanitizeRoleAccessPolicy(value);
  assert.deepEqual(result.SERVICE,{ADMIN:['BANK_LEDGER'],ACCOUNTANT:['BANK_LEDGER'],OPERATOR:[],WORKER:[]});
  assert.equal(result.MANUFACTURER.ACCOUNTANT.includes('BANK_LEDGER'),version<13);
 }
});
test('anonymous workspace lookup is denied and only active memberships appear for ordinary users',async()=>{
 const db={systemUser:{findUnique:async()=>null},employee:{findMany:async args=>{assert.equal(args.where.email,'staff@example.com');assert.equal(args.where.status,'ACTIVE');assert.deepEqual(args.where.organization.type.in,['MANUFACTURER','BRAND','SERVICE']);return [{orgId:2,orgRole:'ACCOUNTANT',organization:{id:2,name:'DEXS',type:'SERVICE'}}];}}};
 const choices=await companyChoices(db,'staff@example.com');assert.deepEqual(choices.workspaces.map(row=>row.id),[2]);assert.equal(choices.canCreateCompany,false);
 await assert.rejects(createServiceCompany(db,'staff@example.com',{name:'forged'}),/ADMIN_REQUIRED/);
 const routes=new Map();registerCompanyWorkspaceRoutes({get:(p,f)=>routes.set(p,f),post:()=>{}},db,{getEmail:()=>'',requireOrgRole:()=>null});
 await assert.rejects(routes.get('/auth/workspaces')({},{}),/AUTHENTICATION_REQUIRED/);
});
test('explicit company login never falls back to a different company or accepts a vendor tenant',async()=>{
 const organization={id:2,name:'DEXS',type:'SERVICE',isActive:true,ownerOrgId:null};
 let status='ACTIVE';
 const db={employee:{findUnique:async({where})=>where.orgId_email.orgId===2&&where.orgId_email.email==='staff@example.com'?{orgRole:'ACCOUNTANT',status,organization}:null},organization:{findUnique:async()=>organization}};
 assert.equal((await resolveCompanyWorkspace(db,'staff@example.com',2)).orgRole,'ACCOUNTANT');
 await assert.rejects(resolveCompanyWorkspace(db,'staff@example.com',1),/ACCESS_DENIED/);
 status='SUSPENDED';await assert.rejects(resolveCompanyWorkspace(db,'staff@example.com',2),/ACCESS_DENIED/);
 status='ACTIVE';organization.type='LOGISTICS_PROVIDER';await assert.rejects(resolveCompanyWorkspace(db,'staff@example.com',2),/ACCESS_DENIED/);
 organization.type='SERVICE';organization.ownerOrgId=1;await assert.rejects(resolveCompanyWorkspace(db,'staff@example.com',2),/ACCESS_DENIED/);
 organization.ownerOrgId=null;await assert.rejects(resolveCompanyWorkspace(db,'system@example.com',2),/ACCESS_DENIED/);
});
test('a logistics SaaS registration creates one independent tenant and owner membership, and retries do not clone records',async()=>{
 const companies=[],employees=[],subscriptions=[],registrations=[];
 const db={
  systemUser:{findUnique:async()=>({systemRole:'SYSTEM_ADMIN'})},
  organization:{findMany:async()=>companies,findUnique:async({where})=>companies.find(row=>Object.entries(where).every(([key,value])=>row[key]===value))||null,create:async({data})=>{const row={...data,id:2};companies.push(row);return row;}},
  employee:{findMany:async()=>[],create:async({data})=>{employees.push(data);return data;}},
  employeeGrade:{findFirst:async()=>null,create:async()=>({id:10})},employeeGradeSet:{upsert:async()=>({id:5})},
  organizationSubscription:{create:async({data})=>{subscriptions.push(data);return data;}},
  companyWorkspaceRegistration:{findUnique:async({where})=>{const row=registrations.find(row=>row.actorEmail===where.actorEmail_clientKey.actorEmail&&row.clientKey===where.actorEmail_clientKey.clientKey);return row?{...row,organization:companies.find(org=>org.id===row.orgId)}:null;},create:async({data})=>{registrations.push(data);return data;}},
  $transaction:async fn=>fn(db),
 };
 const body={name:'DEXS LOGIS',nameKo:'덱스로지스',nameVi:'',code:'DEXS',clientKey:randomUUID(),orgId:1,orgRole:'SYSTEM_ADMIN',ownerEmail:'forged@example.com'};
 const result=await createServiceCompany(db,'owner@example.com',body);
 assert.equal(result.type,'SERVICE');assert.equal(result.ownerOrgId,undefined);assert.equal(registrations[0].clientKey,body.clientKey);assert.equal(registrations[0].actorEmail,'owner@example.com');
 assert.equal(employees[0].orgId,2);assert.equal(employees[0].email,'owner@example.com');assert.equal(employees[0].orgRole,'ADMIN');assert.equal(employees[0].payrollExcluded,true);
 assert.equal(subscriptions[0].status,'TRIAL');assert.equal(subscriptions[0].orgId,2);
 assert.equal((await createServiceCompany(db,'owner@example.com',body)).id,2);
 assert.equal(companies.length,1);assert.equal(employees.length,1);assert.equal(subscriptions.length,1);
 await assert.rejects(createServiceCompany(db,'owner@example.com',{...body,name:'changed'}),/RETRY_CONFLICT/);
 await assert.rejects(createServiceCompany(db,'owner@example.com',{...body,clientKey:randomUUID()}),/CODE_EXISTS/);
});
test('bank access honors current policy denials and never reaches the ledger for a forbidden role',async()=>{
 const routes=new Map();let reads=0;
 registerBankLedgerRoutes({get:(p,f)=>routes.set(p,f),post:()=>{}},{bankLedgerAccount:{findMany:async()=>{reads++;}}},{requireOrgRole:async()=>({organization:{id:2,type:'SERVICE'},employee:{orgRole:'ACCOUNTANT'},requesterEmail:'staff@example.com'}),loadPolicy:async()=>({policy:{SERVICE:{ACCOUNTANT:[]}}})});
 let status;const res={status:code=>{status=code;return res;},json:()=>{}};
 await routes.get('/bank-ledger/accounts')({query:{orgId:1}},res);assert.equal(status,403);assert.equal(reads,0);
});
test('company user registration uses the authorized company, not a forged company ID or system role',async()=>{
 const routes=new Map(),created=[];
 const db={employee:{findUnique:async()=>null,create:async({data})=>{created.push(data);return data;}},employeeGrade:{findFirst:async()=>({id:10})},$transaction:async run=>run(db)};
 registerCompanyWorkspaceRoutes({get:()=>{},post:(path,handler)=>routes.set(path,handler)},db,{getEmail:()=>'',requireOrgRole:async(_req,_res,options)=>{assert.deepEqual(options.allowedRoles,['ADMIN']);return {organization:{id:2},requesterEmail:'owner@example.com'};}});
 const res={status:()=>res,json:()=>{}},handler=routes.get('/company-members');
 await handler({body:{orgId:1,email:'Accountant@example.com',name:'Accountant',role:'ACCOUNTANT'}},res);
 assert.equal(created[0].orgId,2);assert.equal(created[0].email,'accountant@example.com');assert.equal(created[0].createdBy,'owner@example.com');assert.equal(created[0].status,'ACTIVE');
 await assert.rejects(handler({body:{email:'x@example.com',name:'x',role:'SYSTEM_ADMIN'}},res),/INVALID_INPUT/);
 assert.equal(created.length,1);
});
test('SQL migration enforces tenant/account FKs, positive amounts and unique request keys without rewriting old organization data',async()=>{
 const pg=new PGlite();
 try{
  await pg.exec('CREATE TYPE "OrganizationType" AS ENUM (\'MANUFACTURER\',\'BRAND\'); CREATE TABLE "Organization"(id INTEGER PRIMARY KEY,name TEXT,type "OrganizationType" DEFAULT \'MANUFACTURER\'); INSERT INTO "Organization"(id,name) VALUES(1,\'BARO\');');
  await pg.exec(await readFile('backend/prisma/migrations/20261027160000_service_tenant_enum/migration.sql','utf8'));
  await pg.exec('INSERT INTO "Organization" VALUES(2,\'DEXS\',\'SERVICE\');');
  await pg.exec(await readFile('backend/prisma/migrations/20261027160100_bank_ledger/migration.sql','utf8'));
  await pg.query('INSERT INTO "BankLedgerAccount"(id,"orgId","clientKey","bankName","accountNumber","accountHolder","currencyCode","openingDate","openingBalance","createdBy") VALUES($1,1,$2,\'Bank\',\'001\',\'BARO\',\'USD\',\'2026-10-01\',100,\'owner\')',['a','request-a']);
  const sql='INSERT INTO "BankLedgerEntry"(id,"orgId","accountId","clientKey","transactionDate",direction,amount,purpose,"evidenceNumber","createdBy") VALUES($1,$2,\'a\',$3,\'2026-10-03\',\'IN\',$4,\'purpose\',\'evidence\',\'staff\')';
  await assert.rejects(pg.query(sql,['foreign',2,'k1','1']),/foreign key/i);
  await assert.rejects(pg.query(sql,['zero',1,'k2','0']),/check constraint/i);
  await pg.query(sql,['valid',1,'k3','0.10']);await assert.rejects(pg.query(sql,['duplicate',1,'k3','0.10']),/unique constraint/i);
  await pg.exec('ALTER TABLE "BankLedgerEntry" DROP CONSTRAINT "BankLedgerEntry_amount_check"; ALTER TABLE "BankLedgerAccount" DROP CONSTRAINT "BankLedgerAccount_currency_check";');
  await pg.exec(await readFile('backend/prisma/migrations/20261027160100_bank_ledger/migration.sql','utf8'));
  await assert.rejects(pg.query(sql,['invalid-after-push',1,'k4','0']),/check constraint/i);
  assert.equal((await pg.query('SELECT COUNT(*)::int AS count FROM "BankLedgerEntry"')).rows[0].count,1);
  assert.deepEqual((await pg.query('SELECT name FROM "Organization" ORDER BY id')).rows,[{name:'BARO'},{name:'DEXS'}]);
 }finally{await pg.close();}
});
