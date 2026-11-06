import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createRequire} from 'node:module';
import {PGlite} from '@electric-sql/pglite';
const require=createRequire(import.meta.url);
const api=require('../backend/dist/services/systemEntities.js');
const {saveClassification}=require('../backend/dist/services/partnerClassification.js');
const migration=readFileSync('backend/prisma/migrations/20261106230000_system_entity_management/migration.sql','utf8');
const admin='system@example.com';
async function fixture(){
 const pg=new PGlite();await pg.exec(`
 CREATE TABLE "Organization"(id INT PRIMARY KEY,name TEXT,"nameKo" TEXT,"nameVi" TEXT,code TEXT UNIQUE,"businessNumber" TEXT,"partyKind" TEXT,"businessLegalForm" TEXT,representative TEXT,"representativeEmployeeId" INT,phone TEXT,email TEXT,country TEXT,"countryCode" TEXT,address TEXT,"isActive" BOOL DEFAULT true,"ownerOrgId" INT REFERENCES "Organization" ON DELETE CASCADE,"dataOwnerOrgId" INT REFERENCES "Organization",type TEXT,"updatedAt" TIMESTAMP DEFAULT now(),"privatePayrollSecret" TEXT DEFAULT 'PRIVATE');
 INSERT INTO "Organization"(id,name,code,"businessNumber","partyKind",country,type) VALUES(1,'BARO','BARO','0001','CORPORATE','VN','MANUFACTURER'),(2,'DEX','DEXL','0002','CORPORATE','VN','SERVICE'),(4,'Unused company','TEST','0004','CORPORATE','VN','SERVICE');
 INSERT INTO "Organization"(id,name,"businessNumber","partyKind",country,type,"ownerOrgId") VALUES(11,'Old DEX name','0002','CORPORATE','VN','LOGISTICS_PROVIDER',1),(12,'Local vendor',NULL,'CORPORATE','VN','LOGISTICS_PROVIDER',1),(13,'Unused vendor','0013','CORPORATE','VN','LOGISTICS_PROVIDER',1);
 CREATE TABLE "Employee"(id INT PRIMARY KEY,"orgId" INT REFERENCES "Organization",status TEXT,"orgRole" TEXT,UNIQUE(id,"orgId"));INSERT INTO "Employee" VALUES(10,1,'ACTIVE','ADMIN'),(20,2,'ACTIVE','ADMIN');
 CREATE TABLE "SystemUser"(id INT PRIMARY KEY,email TEXT UNIQUE,"systemRole" TEXT);INSERT INTO "SystemUser" VALUES(100,'system@example.com','SYSTEM_ADMIN'),(101,'member@example.com','USER');
 CREATE TABLE "PartnerRole"(id INT PRIMARY KEY,code TEXT,"nameEn" TEXT,"nameKo" TEXT,"nameVi" TEXT,"sortOrder" INT DEFAULT 0);INSERT INTO "PartnerRole" VALUES(1,'APPAREL','Apparel','의류','May mặc',0),(2,'LOGISTICS_PROVIDER','Logistics','물류','Logistics',1);
 CREATE TABLE "SettingServiceDefault"(id INT PRIMARY KEY,code TEXT,"nameEn" TEXT,"nameKo" TEXT,"nameVi" TEXT,"partnerRoleId" INT REFERENCES "PartnerRole","isActive" BOOL DEFAULT true,"sortOrder" INT DEFAULT 0);INSERT INTO "SettingServiceDefault" VALUES(7,'GARMENT','Manufacturer','의류 제조업','Sản xuất',1,true,0),(8,'FWD','Forwarder','포워더','Giao nhận',2,true,1),(9,'TRUCK','Trucker','트러커','Vận tải',2,true,2);
 CREATE TABLE "OrgRelationship"(id INT PRIMARY KEY,"manufacturerOrgId" INT REFERENCES "Organization","brandOrgId" INT REFERENCES "Organization","systemIndustryId" INT REFERENCES "SettingServiceDefault");INSERT INTO "OrgRelationship" VALUES(1,1,2,NULL);
 CREATE TABLE "PartnerClassification"("orgId" INT REFERENCES "Organization","entityId" INT REFERENCES "Organization" ON DELETE CASCADE,revision INT DEFAULT 1,"updatedByEmployeeId" INT NOT NULL,"createdAt" TIMESTAMP DEFAULT now(),"updatedAt" TIMESTAMP DEFAULT now(),PRIMARY KEY("orgId","entityId"),FOREIGN KEY("updatedByEmployeeId","orgId") REFERENCES "Employee"(id,"orgId"));
 CREATE TABLE "PartnerClassificationIndustry"("orgId" INT,"entityId" INT,"systemIndustryId" INT REFERENCES "SettingServiceDefault",PRIMARY KEY("orgId","entityId","systemIndustryId"),FOREIGN KEY("orgId","entityId") REFERENCES "PartnerClassification" ON DELETE CASCADE);
 INSERT INTO "PartnerClassification"("orgId","entityId","updatedByEmployeeId") VALUES(1,1,10),(2,2,20),(1,12,10),(1,13,10);INSERT INTO "PartnerClassificationIndustry" VALUES(1,1,7),(2,2,8),(1,12,7),(1,13,7);
 CREATE TABLE "CompanyPartnerLink"("orgId" INT REFERENCES "Organization","entityId" INT REFERENCES "Organization","targetOrgId" INT REFERENCES "Organization");INSERT INTO "CompanyPartnerLink" VALUES(1,11,2);
 CREATE TABLE "CompanyIdentity"(id INT PRIMARY KEY,"anchorEntityId" INT UNIQUE REFERENCES "Organization",code TEXT UNIQUE);INSERT INTO "CompanyIdentity" VALUES(22,2,'DEXL');
 CREATE TABLE "CompanyIdentityLink"("orgId" INT REFERENCES "Organization","entityId" INT REFERENCES "Organization","identityId" INT REFERENCES "CompanyIdentity");INSERT INTO "CompanyIdentityLink" VALUES(1,11,22);
 CREATE TABLE "BankLedgerEntry"(id INT PRIMARY KEY,"orgId" INT REFERENCES "Organization",amount NUMERIC);INSERT INTO "BankLedgerEntry" VALUES(1,2,3553561);
 CREATE TABLE "FutureModule"(id INT,"entityId" INT REFERENCES "Organization" ON DELETE CASCADE);
 CREATE TABLE "SystemSetting"(key TEXT PRIMARY KEY,value JSONB,"updatedBy" TEXT,"createdAt" TIMESTAMP DEFAULT now(),"updatedAt" TIMESTAMP DEFAULT now());
 `);
 const classificationSql=readFileSync('backend/prisma/migrations/20261031210000_partner_classification/migration.sql','utf8');
 await pg.exec(classificationSql.slice(classificationSql.indexOf('CREATE OR REPLACE FUNCTION baro_partner_classification_required')));
 await pg.exec(migration);
 await pg.exec('CREATE TRIGGER "PartnerClassification_scope_guard" BEFORE INSERT OR UPDATE ON "PartnerClassification" FOR EACH ROW EXECUTE FUNCTION baro_partner_classification_guard()');
 const q=async(sql,args=[])=>(await pg.query(sql,args)).rows;
 const unbox=where=>where?.orgId_entityId||where||{};
 const match=(row,where)=>Object.entries(unbox(where)).every(([key,value])=>{
  if(key==='OR')return value.some(branch=>match(row,branch));if(key==='AND')return value.every(branch=>match(row,branch));
  if(value&&typeof value==='object'){
   if('in' in value)return value.in.includes(row[key]);if('not' in value)return row[key]!==value.not;
   if('contains' in value)return String(row[key]||'').toLowerCase().includes(value.contains.toLowerCase());
   if('some' in value)return (row[key]||[]).some(item=>match(item,value.some));return !!row[key]&&match(row[key],value);
  }return row[key]===value;
 });
 const project=(row,select)=>!row?null:!select?row:Object.fromEntries(Object.entries(select).filter(([,v])=>v).map(([key,value])=>[key,value===true?row[key]:Array.isArray(row[key])?row[key].map(v=>project(v,value.select)):project(row[key],value.select)]));
 async function hydrate(table,row){
  if(table==='Organization'){
   const all=await q('SELECT * FROM "Organization"');row.owner=all.find(v=>v.id===row.ownerOrgId)||null;row.dataOwner=all.find(v=>v.id===row.dataOwnerOrgId)||null;
   row.localCompanyLinks=(await q('SELECT * FROM "CompanyPartnerLink" WHERE "entityId"=$1',[row.id])).map(link=>({...link,target:all.find(v=>v.id===link.targetOrgId)}));
   row.identityLinks=await Promise.all((await q('SELECT * FROM "CompanyIdentityLink" WHERE "entityId"=$1',[row.id])).map(async link=>{const identity=(await q('SELECT * FROM "CompanyIdentity" WHERE id=$1',[link.identityId]))[0];return {...link,identity:{...identity,anchor:all.find(v=>v.id===identity.anchorEntityId)}};}));
  }
  if(table==='CompanyIdentityLink')row.identity=(await q('SELECT * FROM "CompanyIdentity" WHERE id=$1',[row.identityId]))[0];
  if(table==='SettingServiceDefault')row.partnerRole=(await q('SELECT * FROM "PartnerRole" WHERE id=$1',[row.partnerRoleId]))[0];
  if(table==='PartnerClassification')row.industries=await Promise.all((await q('SELECT * FROM "PartnerClassificationIndustry" WHERE "orgId"=$1 AND "entityId"=$2',[row.orgId,row.entityId])).map(async link=>({...link,industry:await hydrate('SettingServiceDefault',(await q('SELECT * FROM "SettingServiceDefault" WHERE id=$1',[link.systemIndustryId]))[0])})));
  return row;
 }
 const model=table=>{
  const findMany=async({where={},select,skip=0,take}={})=>{const values=await Promise.all((await q(`SELECT * FROM "${table}"`)).map(row=>hydrate(table,row)));return values.filter(row=>match(row,where)).sort((a,b)=>(a.id||a.orgId||0)-(b.id||b.orgId||0)).slice(skip,take?skip+take:undefined).map(row=>project(row,select));};
  const keys=where=>{const values=[];const build=input=>Object.entries(unbox(input)).map(([key,value])=>{if(key==='OR')return '('+value.map(build).join(' OR ')+')';values.push(value);return '"'+key+'"='+String.fromCharCode(36)+values.length;}).join(' AND ');return {sql:build(where),values};};
  const create=async({data})=>{const fields=Object.keys(data),args=fields.map(key=>key==='value'?JSON.stringify(data[key]):data[key]);const result=await q(`INSERT INTO "${table}"(${fields.map(key=>'"'+key+'"').join(',')}) VALUES(${fields.map((_,i)=>'$'+(i+1)).join(',')}) RETURNING *`,args);return result[0];};
  const update=async({where,data})=>{const w=keys(where),args=[],sets=Object.entries(data).map(([key,value])=>{if(value?.increment)return `"${key}"="${key}"+${value.increment}`;args.push(value);return `"${key}"=$${w.values.length+args.length}`;});const result=await q(`UPDATE "${table}" SET ${sets.join(',')} WHERE ${w.sql} RETURNING *`,[...w.values,...args]);return result[0];};
  return {findMany,findUnique:async args=>(await findMany({...args,where:unbox(args.where)}))[0]||null,findFirst:async args=>(await findMany(args))[0]||null,count:async args=>(await findMany(args)).length,create,createMany:async({data})=>{for(const row of data)await create({data:row});},update,updateMany:async args=>{const row=await update(args);return {count:row?1:0};},deleteMany:async({where})=>{const w=keys(where);await q(`DELETE FROM "${table}" WHERE ${w.sql}`,w.values);},delete:async args=>{const w=keys(args.where);await q(`DELETE FROM "${table}" WHERE ${w.sql}`,w.values);}};
 };
 const db={$queryRawUnsafe:(sql,...args)=>q(sql,args)};
 for(const table of ['Organization','SystemUser','Employee','PartnerRole','SettingServiceDefault','OrgRelationship','PartnerClassification','PartnerClassificationIndustry','CompanyIdentity','CompanyIdentityLink','CompanyPartnerLink','SystemSetting'])db[table[0].toLowerCase()+table.slice(1)]=model(table);
 db.$transaction=async fn=>{await pg.exec('BEGIN ISOLATION LEVEL SERIALIZABLE');try{const result=await fn(db);await pg.exec('COMMIT');return result;}catch(e){await pg.exec('ROLLBACK');throw e;}};
 return {pg,db,q};
}
const edit=(detail,profile={},classifications=[])=>({clientKey:crypto.randomUUID(),revision:detail.revision,profile,classifications});
test('SYSTEM list includes subscribers and local records, shares current subscriber names and industries, and hides unrelated data',async()=>{
 const {pg,db}=await fixture();try{
  const all=await api.listSystemEntities(db,admin,{});assert.equal(all.total,6);const local=all.rows.find(row=>row.id===11);assert.equal(local.name,'DEX');assert.equal(local.classifications[0].industryIds[0],8);assert.equal(local.canDelete,false);assert.equal('privatePayrollSecret' in local,false);
  const search=await api.listSystemEntities(db,admin,{q:'DEX'});assert.deepEqual(search.rows.map(row=>row.id),[2,11]);
  await assert.rejects(api.listSystemEntities(db,'member@example.com',{}),/SYSTEM_ADMIN_REQUIRED/);
 }finally{await pg.close();}
});
test('used connected company profiles and official industries can be edited by SYSTEM without borrowing an employee identity',async()=>{
 const {pg,db,q}=await fixture();try{
  const before=await api.readSystemEntity(db,admin,11);assert.equal(before.entity.id,2);assert.equal(before.canDelete,false);assert.deepEqual(before.classifications.map(scope=>scope.orgId),[2]);
  const scope=before.classifications[0],body=edit(before,{name:'DEX updated',address:'New address'},[{orgId:2,entityId:2,revision:scope.classification.revision,industryIds:[8,9]}]);
  const saved=await api.mutateSystemEntity(db,admin,11,body);assert.equal(saved.entity.name,'DEX updated');assert.deepEqual(saved.classifications[0].classification.industryIds,[8,9]);
  const actor=(await q('SELECT "updatedByEmployeeId","updatedBySystemUserId" FROM "PartnerClassification" WHERE "orgId"=2 AND "entityId"=2'))[0];assert.deepEqual(actor,{updatedByEmployeeId:null,updatedBySystemUserId:100});
  assert.equal((await q('SELECT amount::text FROM "BankLedgerEntry"'))[0].amount,'3553561');assert.equal((await q('SELECT name FROM "Organization" WHERE id=11'))[0].name,'Old DEX name');
  assert.equal((await q('SELECT value FROM "SystemSetting"'))[0].value.actor.email,admin);
  assert.deepEqual(await api.mutateSystemEntity(db,admin,11,body),JSON.parse(JSON.stringify(saved)));
  await assert.rejects(api.mutateSystemEntity(db,admin,11,{...body,profile:{name:'Changed retry'}}),/ENTITY_RETRY_CONFLICT/);
 }finally{await pg.close();}
});
test('stale revisions, wrong classification scopes and shared identity changes leave all records unchanged',async()=>{
 const {pg,db,q}=await fixture();try{
  const before=await api.readSystemEntity(db,admin,11);
  await assert.rejects(api.mutateSystemEntity(db,admin,11,edit(before,{country:'KR'})),/ENTITY_SHARED_IDENTITY_LOCKED/);
  await assert.rejects(api.mutateSystemEntity(db,admin,11,edit(before,{name:'Must roll back'},[{orgId:1,entityId:2,revision:0,industryIds:[7]}])),/PARTNER_CLASSIFICATION_REQUIRED/);
  assert.equal((await q('SELECT name FROM "Organization" WHERE id=2'))[0].name,'DEX');
  await api.mutateSystemEntity(db,admin,11,edit(before,{address:'First edit'}));await assert.rejects(api.mutateSystemEntity(db,admin,11,edit(before,{address:'Stale'})),/STALE_EDIT/);
 }finally{await pg.close();}
});
test('industry correction works for legacy vendors with missing business numbers and requires valid retained catalogue choices',async()=>{
 const {pg,db}=await fixture();try{
  const before=await api.readSystemEntity(db,admin,12),scope=before.classifications[0];
  const saved=await api.mutateSystemEntity(db,admin,12,edit(before,{},[{orgId:1,entityId:12,revision:scope.classification.revision,industryIds:[9]}]));assert.deepEqual(saved.classifications[0].classification.industryIds,[9]);
  await assert.rejects(api.mutateSystemEntity(db,admin,12,edit(saved,{},[{orgId:1,entityId:12,revision:2,industryIds:[999]}])),/PARTNER_CLASSIFICATION_REQUIRED/);
 }finally{await pg.close();}
});
test('unused companies and metadata can be deleted; employees, relationships and even future cascading FKs block deletion',async()=>{
 const {pg,db,q}=await fixture();try{
  const unused=await api.readSystemEntity(db,admin,13),body=edit(unused);assert.equal(unused.canDelete,true);assert.deepEqual(await api.mutateSystemEntity(db,admin,13,body,true),{deleted:true});assert.deepEqual(await api.mutateSystemEntity(db,admin,13,body,true),{deleted:true});
  const used=await api.readSystemEntity(db,admin,2);await assert.rejects(api.mutateSystemEntity(db,admin,2,edit(used),true),/ENTITY_IN_USE/);
  const current=await api.readSystemEntity(db,admin,4);assert.equal(current.canDelete,true);await pg.exec('INSERT INTO "FutureModule" VALUES(1,4)');
  await assert.rejects(api.mutateSystemEntity(db,admin,4,edit(current),true),/ENTITY_IN_USE/);assert.equal((await q('SELECT count(*)::int AS n FROM "Organization" WHERE id=4'))[0].n,1);
 }finally{await pg.close();}
});
test('SQL rejects fake SYSTEM actors and ordinary company administrators can still update a SYSTEM-edited classification',async()=>{
 const {pg,db,q}=await fixture();try{
  await assert.rejects(pg.exec('UPDATE "PartnerClassification" SET revision=revision+1,"updatedByEmployeeId"=NULL,"updatedBySystemUserId"=101 WHERE "orgId"=1 AND "entityId"=1'),/ADMIN_REQUIRED|ACTOR/);
  const before=await api.readSystemEntity(db,admin,1);await api.mutateSystemEntity(db,admin,1,edit(before,{},[{orgId:1,entityId:1,revision:1,industryIds:[8]}]));
  await db.$transaction(tx=>saveClassification(tx,1,1,10,{revision:2,roleIds:[1],industryIds:[7]}));
  assert.deepEqual((await q('SELECT "updatedByEmployeeId","updatedBySystemUserId" FROM "PartnerClassification" WHERE "orgId"=1 AND "entityId"=1'))[0],{updatedByEmployeeId:10,updatedBySystemUserId:null});
 }finally{await pg.close();}
});
test('every directory route authorizes before looking up any entity or catalogue data',async()=>{
 const handlers=new Map(),app=Object.fromEntries(['get','put','delete'].map(method=>[method,(path,fn)=>handlers.set(method+path,fn)]));let touches=0;
 api.registerSystemEntityRoutes(app,new Proxy({},{get(){touches++;throw Error('Must not read');}}),{requireSystemAdmin:async()=>null});
 for(const fn of handlers.values())await fn({params:{id:'1'},body:{},query:{}},{});assert.equal(touches,0);
});

