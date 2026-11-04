import test from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {readFileSync} from 'node:fs';
import {PGlite} from '@electric-sql/pglite';
const require=createRequire(import.meta.url);
const {identityCandidates,resolveIdentityChoice,saveIdentityChoice,publicIdentityRevision}=require('../backend/dist/services/companyIdentity');
function memory(){
 const source={id:11,name:'Customer B',nameKo:'B',nameVi:null,code:'BBBB',country:'VN',businessNumber:'123-456',address:'Public address'},identities=[],links=[];
 const db={$queryRawUnsafe:async(sql,...args)=>sql.includes('FROM "Organization" o')&&args[1]==='123456'&&args[2]==='VN'&&!identities.length?[source]:[],organization:{findFirst:async({where})=>where.id===11?source:null},companyIdentity:{findMany:async({where})=>identities.filter(r=>r.country===where.country&&r.businessNumber===where.businessNumber),findUnique:async({where})=>identities.find(r=>where.id?r.id===where.id:r.anchorEntityId===where.anchorEntityId)||null,create:async({data})=>{assert.equal('sourceEntityId' in data,false);const r={id:1,...data};identities.push(r);return r;}},companyIdentityLink:{findUnique:async({where})=>{const q=where.orgId_entityId,r=links.find(r=>r.orgId===q.orgId&&r.entityId===q.entityId);return r?{...r,identity:identities.find(i=>i.id===r.identityId)}:null;},create:async({data})=>{links.push(data);return data;}}};
 return {db,source,identities,links};
}
test('two companies connect their own B rows to one common identity without SaaS membership or row merging',async()=>{
 const {db,source,identities,links}=memory(),profile={country:'VN',businessNumber:'123456'};
 const [candidate]=await identityCandidates(db,3,profile);assert.equal(candidate.sourceEntityId,11);assert.equal(candidate.address,'Public address');assert.equal('ownerOrgId' in candidate,false);
 await assert.rejects(resolveIdentityChoice(db,3,31,null,profile),/CONFIRMATION_REQUIRED/);
 const choice=await resolveIdentityChoice(db,3,31,{sourceEntityId:11,revision:candidate.revision},profile);await saveIdentityChoice(db,3,31,303,choice);assert.equal(identities.length,1);assert.equal(links[0].entityId,31);
 const [common]=await identityCandidates(db,4,profile);assert.equal(common.identityId,1);assert.equal(common.code,'BBBB');
 await saveIdentityChoice(db,4,41,404,await resolveIdentityChoice(db,4,41,{identityId:1,revision:common.revision},profile));assert.deepEqual(links.map(l=>l.identityId),[1,1]);assert.deepEqual(links.map(l=>l.orgId),[3,4]);assert.equal(source.code,'BBBB');
 assert.equal((await resolveIdentityChoice(db,3,31,null,profile)).code,'BBBB');
 await assert.rejects(resolveIdentityChoice(db,3,31,{separate:true,...profile},profile),/ALREADY_LINKED/);
});
test('separate registration is explicit and bound to the current identity input; stale and foreign matches are refused',async()=>{
 const {db,source,links}=memory(),profile={country:'VN',businessNumber:'123456'};
 assert.equal(await resolveIdentityChoice(db,3,31,{separate:true,...profile},profile),null);assert.equal(links.length,0);
 await assert.rejects(resolveIdentityChoice(db,3,31,{separate:true,country:'KR',businessNumber:'123456'},profile),/CHANGED/);
 await assert.rejects(resolveIdentityChoice(db,3,31,{sourceEntityId:11,revision:'stale'},profile),/CHANGED/);
 await assert.rejects(resolveIdentityChoice(db,3,31,{sourceEntityId:11,revision:publicIdentityRevision(source)},{country:'KR',businessNumber:'123456'}),/MISMATCH/);
 await assert.rejects(identityCandidates(db,3,{businessNumber:'123456'}),/COUNTRY_NUMBER_REQUIRED/);
});

test('linked profiles read current public names and address without rewriting local identity, relationships or history',async()=>{
 const {db,source,identities}=memory(),profile={country:'VN',businessNumber:'123456'};
 const [candidate]=await identityCandidates(db,3,profile);
 await saveIdentityChoice(db,3,31,303,await resolveIdentityChoice(db,3,31,{sourceEntityId:11,revision:candidate.revision},profile));
 const [before]=await identityCandidates(db,4,profile);
 source.name='Updated official name';source.nameKo='Updated localized name';source.address='Updated public address';
 const [after]=await identityCandidates(db,4,profile);
 assert.equal(after.name,source.name);assert.equal(after.address,source.address);assert.notEqual(after.revision,before.revision);
 await assert.rejects(resolveIdentityChoice(db,4,41,{identityId:1,revision:before.revision},profile),/CHANGED/);
 assert.equal((await resolveIdentityChoice(db,3,31,null,profile)).name,source.name);
 const {attachLinkedCompanies}=require('../backend/dist/services/companyConnections');
 db.companyPartnerLink={findMany:async()=>[]};
 db.companyIdentityLink.findMany=async()=>[{entityId:31,identity:identities[0]}];
 const [row]=await attachLinkedCompanies(db,3,[{id:99,entityId:31,name:'Local historical name',code:'LOCAL',amount:123}]);
 assert.equal(row.name,source.name);assert.equal(row.address,source.address);assert.equal(row.id,99);assert.equal(row.entityId,31);assert.equal(row.code,'LOCAL');assert.equal(row.amount,123);
 assert.equal(identities[0].name,'Customer B');assert.equal(row.linkedCompany.code,'BBBB');assert.equal('employees' in row.linkedCompany,false);
});
test('new SQL keeps original rows and FKs, enforces same identity/active actor and prevents reassigning links',async()=>{
 const db=new PGlite();try{
 await db.exec(`CREATE TABLE "Organization"(id INT PRIMARY KEY,"ownerOrgId" INT,"dataOwnerOrgId" INT,type TEXT,"isActive" BOOLEAN DEFAULT true,code TEXT UNIQUE,name TEXT,"nameKo" TEXT,"nameVi" TEXT,country TEXT,"businessNumber" TEXT,address TEXT,"partyKind" TEXT);CREATE TABLE "Employee"(id INT,"orgId" INT,status TEXT,"orgRole" TEXT,UNIQUE(id,"orgId"));CREATE TABLE "OrgRelationship"("manufacturerOrgId" INT,"brandOrgId" INT);CREATE TABLE "CompanyPartnerLink"("entityId" INT,"targetOrgId" INT);INSERT INTO "Organization"(id,type,code,name,country,"businessNumber","partyKind","ownerOrgId") VALUES(1,'MANUFACTURER','AAAA','A','VN','A1','CORPORATE',NULL),(3,'MANUFACTURER','CCCC','C','VN','C1','CORPORATE',NULL),(11,'BRAND','BBBB','B','VN','123-456','CORPORATE',1),(31,'BRAND',NULL,'B local','VN','123456','CORPORATE',3),(32,'BRAND',NULL,'Other','KR','123456','CORPORATE',3);INSERT INTO "Employee" VALUES(303,3,'ACTIVE','OPERATOR');`);
 await db.exec(readFileSync('backend/prisma/migrations/20261102150000_linked_partner_identity/migration.sql','utf8'));
 const migration=readFileSync('backend/prisma/migrations/20261103190000_common_company_identity/migration.sql','utf8');await db.exec(migration);await db.exec(migration);
 await db.exec(`INSERT INTO "CompanyIdentity"("anchorEntityId",code,name,country,"businessNumber") VALUES(11,'BBBB','B','VN','123456')`);
 await assert.rejects(db.exec(`INSERT INTO "CompanyIdentityLink" VALUES(3,32,1,303,now())`),/MISMATCH/);
 await assert.rejects(db.exec(`INSERT INTO "CompanyIdentityLink" VALUES(1,11,1,303,now())`),/foreign key|ACTOR/);
 await db.exec(`INSERT INTO "CompanyIdentityLink" VALUES(3,31,1,303,now())`);
 await assert.rejects(db.exec(`UPDATE "CompanyIdentityLink" SET "identityId"=1`),/IMMUTABLE/);
 await assert.rejects(db.exec(`UPDATE "Organization" SET country='KR' WHERE id=31`),/MISMATCH/);
 assert.equal((await db.query(`SELECT count(*)::int n FROM "Organization"`)).rows[0].n,5);
 await db.exec(`INSERT INTO "Organization"(id,type,code,name,country,"businessNumber","ownerOrgId") VALUES(12,'BRAND','DEX','Local DEX','VN','010-799-5238',1),(13,'SERVICE','DEXL','DEX LOGIS','VN',NULL,NULL);INSERT INTO "CompanyPartnerLink" VALUES(12,13);`);
 await db.exec(migration);await db.exec(migration);
 const seeded=(await db.query(`SELECT code,"businessNumber",name FROM "CompanyIdentity" WHERE "anchorEntityId"=12`)).rows;
 assert.deepEqual(seeded,[{code:'DEXL',businessNumber:'0107995238',name:'DEX LOGIS'}]);
 assert.equal((await db.query(`SELECT code FROM "Organization" WHERE id=12`)).rows[0].code,'DEX');
 await assert.rejects(db.exec(`INSERT INTO "Organization"(id,type,code,name,country,"businessNumber","partyKind","ownerOrgId") VALUES(33,'BRAND',NULL,'B third','VN','123456','CORPORATE',3)`),/CORPORATE_PARTNER_CODE_INVALID/);
 await db.exec(`BEGIN;INSERT INTO "Organization"(id,type,code,name,country,"businessNumber","partyKind","ownerOrgId") VALUES(33,'BRAND',NULL,'B third','VN','123456','CORPORATE',3);INSERT INTO "CompanyIdentityLink" VALUES(3,33,1,303,now());COMMIT;`);
 }finally{await db.close();}
});
