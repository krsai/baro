import test from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {readFileSync} from 'node:fs';
import {PGlite} from '@electric-sql/pglite';
const require=createRequire(import.meta.url);
const {companyConnectionCandidates,connectPartnerCompany,registerCompanyConnectionRoutes,companyIdentityRevision,assertPartnerProfileEditable}=require('../backend/dist/services/companyConnections');
test('a customer relationship cannot authorize rewriting another SaaS subscriber or another company-owned profile',async()=>{
 const db={employee:{findFirst:async()=>({id:125})}};
 await assert.rejects(assertPartnerProfileEditable(db,1,{id:2,ownerOrgId:null,dataOwnerOrgId:null}),/PROFILE_IS_PRIVATE/);
 await assert.rejects(assertPartnerProfileEditable(db,1,{id:12,ownerOrgId:3,dataOwnerOrgId:null}),/PROFILE_IS_PRIVATE/);
 await assertPartnerProfileEditable(db,1,{id:11,ownerOrgId:1,dataOwnerOrgId:null});
 await assertPartnerProfileEditable(db,1,{id:21,ownerOrgId:null,dataOwnerOrgId:1});
});
test('candidate identity revision is stable across SQL and Prisma field order',()=>{
 const a={id:2,name:'DEX',nameKo:null,nameVi:null,code:'DEXLOG',country:'VN',businessNumber:'123'};
 assert.equal(companyIdentityRevision(a),companyIdentityRevision(Object.fromEntries(Object.entries(a).reverse())));
});
function memory(){
 const target={id:2,name:'DEX LOGIS',nameKo:'덱스로지스',nameVi:null,code:'DEXLOG',country:'VN',businessNumber:'123-456'},links=[];
 const local={id:11,name:'DEX LOGIS',nameKo:null,nameVi:null,code:'DEX',country:'VN',businessNumber:'123456'};
 const db={organization:{findUnique:async()=>local,findFirst:async({where})=>where.id===11?{...local,outsourcingServiceAssignments:[]}:where.id===2?target:null,findMany:async()=>[target]},orgRelationship:{findFirst:async()=>null},employee:{findFirst:async({where})=>where.orgId===1&&where.id===101?{id:101}:null},companyPartnerLink:{findUnique:async()=>links[0]||null,create:async({data})=>{links.push(data);return data;},findMany:async()=>links.map(row=>({...row,source:{id:1,name:'BARO',code:'BARO'},target,createdAt:new Date()}))},$queryRawUnsafe:async(sql)=>sql.startsWith('SELECT id,name')?[target]:[]};
 db.$transaction=async fn=>fn(db);return {db,target,local,links};
}
test('business-number match uses only public identity and connects local vendor to separate SaaS tenant',async()=>{
 const {db,links}=memory();const candidates=await companyConnectionCandidates(db,1,{businessNumber:'123 456',country:'VN'});
 assert.equal(candidates[0].id,2);assert.ok(candidates[0].revision);assert.equal('email' in candidates[0],false);
 await connectPartnerCompany(db,1,11,101);assert.deepEqual(links,[{orgId:1,entityId:11,targetOrgId:2,createdByEmployeeId:101,matchMethod:'BUSINESS_NUMBER'}]);
 await connectPartnerCompany(db,1,11,101);assert.equal(links.length,1);
});
test('name-only match requires explicit selected identity and rejects stale/mismatched identity and forged employee',async()=>{
 const {db,local,links}=memory();local.businessNumber=null;
 assert.equal(await connectPartnerCompany(db,1,11,101),null);
 const [candidate]=await companyConnectionCandidates(db,1,{name:'DEX LOGIS'});
 await assert.rejects(connectPartnerCompany(db,1,11,999,{targetOrgId:2,revision:candidate.revision}),/ACTIVE_EMPLOYEE/);
 await assert.rejects(connectPartnerCompany(db,1,11,101,{targetOrgId:2,revision:'stale'}),/CHANGED/);
 local.businessNumber='other';await assert.rejects(connectPartnerCompany(db,1,11,101,{targetOrgId:2,revision:candidate.revision}),/IDENTITY_MISMATCH/);
 local.businessNumber=null;await connectPartnerCompany(db,1,11,101,{targetOrgId:2,revision:candidate.revision});assert.equal(links[0].matchMethod,'SELECTED');
});
test('ambiguous business numbers do not create a guessed relationship',async()=>{
 const {db,target}=memory();db.$queryRawUnsafe=async sql=>sql.startsWith('SELECT id,name')?[target,{...target,id:3}]:[];
 assert.equal(await connectPartnerCompany(db,1,11,101),null);
});
test('DEX can register BARO in the reverse direction using its own local partner and employee',async()=>{
 const {db,links}=memory(),target={id:1,name:'BARO GARMENT',nameKo:null,nameVi:null,code:'BARO',country:'VN',businessNumber:'998877'};
 db.organization.findUnique=async()=>({...target,id:21,code:'BAROPARTNER'});
 db.organization.findFirst=async()=>({...target,id:21,outsourcingServiceAssignments:[]});
 db.employee.findFirst=async({where})=>where.orgId===2&&where.id===125?{id:125}:null;
 db.$queryRawUnsafe=async sql=>sql.startsWith('SELECT id,name')?[target]:[];
 await connectPartnerCompany(db,2,21,125);
 assert.deepEqual(links[0],{orgId:2,entityId:21,targetOrgId:1,createdByEmployeeId:125,matchMethod:'BUSINESS_NUMBER'});
});
test('incoming connection exposes counterpart public identity without its local vendor ID or employees',async()=>{
 const {db}=memory();db.employee.findFirst=async()=>({id:102});db.companyPartnerLink.findMany=async({where})=>{assert.deepEqual(where,{OR:[{orgId:2},{targetOrgId:2}]});return [{orgId:1,entityId:11,targetOrgId:2,source:{id:1,name:'BARO',code:'BARO'},target:{id:2,name:'DEX'},createdAt:new Date()}];};
 const routes=new Map();registerCompanyConnectionRoutes(Object.fromEntries(['get','post'].map(method=>[method,(path,fn)=>routes.set(method+path,fn)])),db,{requireOrgRole:async(req,res,opts)=>{assert.equal(opts.allowSystemAdmin,false);return {organization:{id:2}};},getActor:()=>102});
 let result;await routes.get('get/company-connections')({query:{orgId:1}},{json:value=>result=value});
 assert.equal(result[0].direction,'INCOMING');assert.equal(result[0].entityId,null);assert.equal(result[0].company.id,1);assert.equal('createdByEmployeeId' in result[0],false);
});
test('SQL enforces real companies, own vendor and active company actor; connection cannot be repointed or deleted',async()=>{
 const db=new PGlite();try{
 await db.exec(`CREATE TABLE "Organization"(id INT PRIMARY KEY,"ownerOrgId" INT,"dataOwnerOrgId" INT,type TEXT,"isActive" BOOLEAN DEFAULT true,"businessNumber" TEXT,name TEXT,"nameKo" TEXT,"nameVi" TEXT,code TEXT,country TEXT DEFAULT 'VN');CREATE TABLE "Employee"(id INT,"orgId" INT,status TEXT,"orgRole" TEXT,UNIQUE(id,"orgId"));CREATE TABLE "OrgRelationship"("manufacturerOrgId" INT,"brandOrgId" INT);
 INSERT INTO "Organization"(id,"ownerOrgId",type) VALUES(1,NULL,'MANUFACTURER'),(2,NULL,'SERVICE'),(3,NULL,'MANUFACTURER'),(11,1,'LOGISTICS_PROVIDER'),(12,3,'LOGISTICS_PROVIDER');INSERT INTO "Employee" VALUES(101,1,'ACTIVE','ADMIN'),(102,2,'ACTIVE','ADMIN');`);
 await db.exec(readFileSync('backend/prisma/migrations/20261101230000_company_partner_links/migration.sql','utf8'));
 await db.exec(`UPDATE "Organization" SET name='DEX LOGIS' WHERE id=2;UPDATE "Organization" SET name='DEX%' WHERE id=3;INSERT INTO "Employee" VALUES(103,3,'ACTIVE','ADMIN');INSERT INTO "Organization"(id,type,"dataOwnerOrgId",name) VALUES(22,'BRAND',1,'DEX LOGIS');INSERT INTO "Employee" VALUES(122,22,'ACTIVE','ADMIN');`);
 const queryDb={$queryRawUnsafe:async(sql,...params)=>(await db.query(sql,params)).rows};
 assert.deepEqual((await companyConnectionCandidates(queryDb,1,{name:'dex logis',country:'VN'})).map(row=>row.id),[2]);
 assert.deepEqual((await companyConnectionCandidates(queryDb,1,{name:'DEX%',country:'VN'})).map(row=>row.id),[3]);
 for(const values of ['1,11,1,101','1,12,2,101','1,11,2,102','1,11,12,101'])await assert.rejects(db.exec(`INSERT INTO "CompanyPartnerLink"("orgId","entityId","targetOrgId","createdByEmployeeId","matchMethod") VALUES(${values},'SELECTED')`));
 await db.exec(`INSERT INTO "CompanyPartnerLink"("orgId","entityId","targetOrgId","createdByEmployeeId","matchMethod") VALUES(1,11,2,101,'SELECTED')`);
 await assert.rejects(db.exec('UPDATE "CompanyPartnerLink" SET "targetOrgId"=3'),/IMMUTABLE/);await assert.rejects(db.exec('DELETE FROM "CompanyPartnerLink"'),/IMMUTABLE/);
 assert.equal((await db.query('SELECT * FROM "CompanyPartnerLink"')).rows.length,1);
 }finally{await db.close();}
});
