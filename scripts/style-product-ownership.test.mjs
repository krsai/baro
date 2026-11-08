import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createRequire} from 'node:module';
import {PGlite} from '@electric-sql/pglite';
import {loadSourceBindings} from './helpers/source-bindings.mjs';
const require=createRequire(import.meta.url);
const {validateProductFields,readStyleProduct,updateStyleProduct,createStyleProduct,listStyleProducts,takeStyleProduct}=require('../backend/dist/services/styleProducts.js');
const sql=readFileSync('backend/prisma/migrations/20261108010000_style_product_ownership/migration.sql','utf8');
const editSql=readFileSync('backend/prisma/migrations/20261108020000_connected_style_product_edit/migration.sql','utf8');
const fixture=`
CREATE TABLE "Organization"(id INT PRIMARY KEY,type TEXT,"ownerOrgId" INT,"dataOwnerOrgId" INT,"isActive" BOOL DEFAULT true,name TEXT DEFAULT 'Company');
CREATE TABLE "Employee"(id INT PRIMARY KEY,"orgId" INT,status TEXT,"orgRole" TEXT);
CREATE TABLE "OrgRelationship"("manufacturerOrgId" INT,"brandOrgId" INT,"timeBucketSetVersionId" INT);
CREATE TABLE "CompanyPartnerLink"("orgId" INT,"entityId" INT,"targetOrgId" INT);
CREATE TABLE "CompanyIdentity"(id INT,"anchorEntityId" INT);
CREATE TABLE "CompanyIdentityLink"("orgId" INT,"entityId" INT,"identityId" INT);
INSERT INTO "Organization"(id,type,"ownerOrgId","dataOwnerOrgId","isActive") VALUES(1,'MANUFACTURER',NULL,1,true),(2,'BRAND',1,1,true),(3,'MANUFACTURER',NULL,3,true),(4,'BRAND',3,3,true);
INSERT INTO "Employee" VALUES(10,1,'ACTIVE','ADMIN'),(30,3,'ACTIVE','ADMIN');
INSERT INTO "OrgRelationship" VALUES(1,2,100),(3,4,200);
CREATE TABLE "Style"(id SERIAL PRIMARY KEY,"orgId" INT,"customerOrgId" INT,code TEXT,name TEXT,"registrationDate" TEXT,designer TEXT,season TEXT,"imageUrls" JSONB,bom JSONB,"bomNotes" TEXT,"revenueMemo" TEXT,processes JSONB,"timeBucketSetVersionId" INT,"createdByEmployeeId" INT,"createdAt" TIMESTAMP DEFAULT now(),"updatedAt" TIMESTAMP DEFAULT now(),UNIQUE("customerOrgId",code),UNIQUE("customerOrgId",name));
INSERT INTO "Style"("orgId","customerOrgId",code,name,"registrationDate",designer,season,"imageUrls",bom,"bomNotes","revenueMemo",processes)
VALUES(1,2,'SAN102','한글 Áo','2026-11-01','Designer','2027','["https://example.test/photo"]','[{"cost":123}]','Factory BOM','Private profit','[{"pt":15}]');
CREATE TABLE "StyleProcess"(id INT PRIMARY KEY,"styleId" INT,"orgId" INT,"ptSeconds" FLOAT);
INSERT INTO "StyleProcess" VALUES(7,1,1,12.5);
CREATE TABLE "StyleProcessStandard"(id INT PRIMARY KEY,"styleProcessId" INT,"orgId" INT,"bucketStSeconds" FLOAT);
INSERT INTO "StyleProcessStandard" VALUES(9,7,1,2500);
CREATE TABLE "WorkOrder"(id INT PRIMARY KEY,"orgId" INT,snapshot JSONB);INSERT INTO "WorkOrder" VALUES(8,1,'{"amount":111,"version":3}');
`;
// Prisma sends JS numeric raw-query parameters as PostgreSQL int8, unlike
// PGlite's inferred parameter types. Keep that transport behavior in regressions.
const prismaQuery=(db,s,args=[])=>db.query(s.replace(/\$(\d+)\b/g,(token,index)=>typeof args[Number(index)-1]==='number'?`${token}::bigint`:token),args);
const q=async(db,s,args=[]) => (await prismaQuery(db,s,args)).rows;
async function setup(){const db=new PGlite();await db.exec(fixture);return db;}
async function migrate(db){await db.exec('BEGIN;'+sql+editSql+'COMMIT;');}
async function product(db){return (await q(db,'SELECT * FROM "StyleProduct" ORDER BY id'))[0];}
test('Prisma int8 function arguments require explicit int4 casts; real service calls remain compatible',async()=>{
 const db=await setup();try{await migrate(db);
  await assert.rejects(q(db,'SELECT baro_style_product_trade_connected($1,$2)',[1,2]),/function.*does not exist/);
  assert.equal((await listStyleProducts(adapter(db),1,10)).length,1);
 }finally{await db.close();}
});
const originalFields=async db=>(await product(db)).fields;
function adapter(db){
 const tx={
  $queryRawUnsafe:(s,...args)=>q(db,s,args),
  $executeRawUnsafe:async(s,...args)=>(await prismaQuery(db,s,args)).affectedRows,
  employee:{findFirst:async({where})=>(await q(db,`SELECT e.* FROM "Employee" e JOIN "Organization" o ON o.id=e."orgId" WHERE e.id=$1 AND e."orgId"=$2 AND e.status='ACTIVE' AND e."orgRole" IN ('ADMIN','OPERATOR','ACCOUNTANT') AND o."isActive"`,[where.id,where.orgId]))[0]},
  organization:{findFirst:async({where})=>(await q(db,`SELECT * FROM "Organization" WHERE id=$1 AND type=$2 AND "isActive" AND ($2<>'BRAND' OR "ownerOrgId" IS NULL AND ("dataOwnerOrgId" IS NULL OR "dataOwnerOrgId"=id))`,[where.id,where.type]))[0]},
  orgRelationship:{findUnique:async({where})=>(await q(db,`SELECT * FROM "OrgRelationship" WHERE "manufacturerOrgId"=$1 AND "brandOrgId"=$2`,[where.manufacturerOrgId_brandOrgId.manufacturerOrgId,where.manufacturerOrgId_brandOrgId.brandOrgId]))[0]},
  style:{findFirst:async({where})=>(await q(db,`SELECT id,"productStyleId","appliedProductRevision" FROM "Style" WHERE "orgId"=$1 AND "productStyleId"=$2`,[where.orgId,where.productStyleId]))[0]},
  styleProduct:{
   findFirst:async({where})=>(await q(db,`SELECT p.id,p."ownerOrgId",p.revision,p.fields FROM "StyleProduct" p WHERE p.id=$1 AND (p."ownerOrgId"=$2 OR EXISTS(SELECT 1 FROM "Style" s WHERE s."productStyleId"=p.id AND s."orgId"=$2))`,[where.id,where.OR[0].ownerOrgId]))[0],
   findUniqueOrThrow:async({where})=>(await q(db,'SELECT id,"ownerOrgId",revision,fields FROM "StyleProduct" WHERE id=$1',[where.id]))[0],
  },
 };
 return {...tx,$transaction:async run=>{await db.exec('BEGIN');try{const result=await run(tx);await db.exec('COMMIT');return result;}catch(error){await db.exec('ROLLBACK');throw error;}}};
}

test('split preserves every existing style, process, time and order value and creates a brand-owned original',async()=>{
 const db=await setup();try{
  const tables=['Style','StyleProcess','StyleProcessStandard','WorkOrder'];const before={};
  for(const table of tables)before[table]=await q(db,`SELECT to_jsonb(t) row FROM "${table}" t ORDER BY id`);
  await migrate(db);
  for(const table of tables)assert.deepEqual(await q(db,`SELECT ${table==='Style'?"to_jsonb(t)-ARRAY['productStyleId','productOwnerOrgId','appliedProductRevision']":"to_jsonb(t)"} row FROM "${table}" t ORDER BY id`),before[table],table);
  const p=await product(db);assert.equal(p.ownerOrgId,2);assert.equal(p.custodianOrgId,1);assert.equal(p.revision,1);
  assert.equal(p.fields.name,'한글 Áo');assert.deepEqual(Object.keys(p.fields).sort(),['code','designer','imageUrls','name','registrationDate','season'].sort());
  assert.equal((await q(db,'SELECT * FROM "StyleProductRevision"')).length,1);
 }finally{await db.close();}
});

test('new legacy style inserts create product ownership atomically; failed rows leave no product orphan',async()=>{
 const db=await setup();try{await migrate(db);
  await db.exec(`INSERT INTO "Style"("orgId","customerOrgId",code,name) VALUES(3,4,'NEW','New')`);
  assert.deepEqual(await q(db,'SELECT "ownerOrgId","custodianOrgId" FROM "StyleProduct" ORDER BY id'),[{ownerOrgId:2,custodianOrgId:1},{ownerOrgId:4,custodianOrgId:3}]);
  await assert.rejects(db.exec(`INSERT INTO "Style"("orgId","customerOrgId",code,name) VALUES(4,4,'BAD','Bad')`),/MANUFACTURER_REQUIRED|TRADING_RELATIONSHIP_REQUIRED/);
  assert.equal((await q(db,'SELECT * FROM "StyleProduct"')).length,2);
  assert.equal((await q(db,'SELECT * FROM "StyleProductRevision"')).length,2);
 }finally{await db.close();}
});

test('producer custody edits retain brand ownership, add history once and leave time edits private',async()=>{
 const db=await setup();try{await migrate(db);
  await db.exec(`UPDATE "Style" SET name='Revised' WHERE id=1`);
  assert.equal((await product(db)).ownerOrgId,2);assert.equal((await product(db)).revision,2);
  await db.exec(`UPDATE "Style" SET name='Revised',"revenueMemo"='Private',bom='[{"cost":456}]' WHERE id=1`);
  await db.exec(`UPDATE "StyleProcess" SET "ptSeconds"=99 WHERE id=7`);
  assert.equal((await product(db)).revision,2);assert.equal((await q(db,'SELECT * FROM "StyleProductRevision"')).length,2);
  await assert.rejects(db.exec(`UPDATE "StyleProduct" SET "ownerOrgId"=3 WHERE id=1`),/OWNER_IMMUTABLE/);
  await assert.rejects(db.exec(`UPDATE "Style" SET "orgId"=3 WHERE id=1`),/LINK_IMMUTABLE/);
 }finally{await db.close();}
});

test('subscribed brand permits connected producer edits while keeping brand ownership and private production separate',async()=>{
 const db=await setup();try{await migrate(db);
  await db.exec(`UPDATE "Organization" SET "ownerOrgId"=NULL,"dataOwnerOrgId"=NULL WHERE id=2;INSERT INTO "Employee" VALUES(20,2,'ACTIVE','ADMIN');`);
  await db.exec(`UPDATE "Style" SET name='Producer edit for brand' WHERE id=1`);
  assert.equal((await product(db)).revision,2);assert.equal((await product(db)).ownerOrgId,2);
  await db.exec(`UPDATE "Style" SET "revenueMemo"='Internal' WHERE id=1;UPDATE "StyleProcess" SET "ptSeconds"=22 WHERE id=7;`);
  assert.equal((await product(db)).revision,2);
  await assert.rejects(db.exec(`DELETE FROM "StyleProduct" WHERE id=1`),/DELETE_REQUIRES_SEPARATE_WORKFLOW/);
  await assert.rejects(db.exec(`UPDATE "StyleProductRevision" SET fields='{}'`),/APPEND_ONLY/);
  await assert.rejects(db.exec(`DELETE FROM "StyleProductRevision"`),/APPEND_ONLY/);
 }finally{await db.close();}
});

test('product APIs scope owner and connected producer edits and preserve idempotent retries',async()=>{
 const db=await setup();try{await migrate(db);
  await db.exec(`UPDATE "Organization" SET "ownerOrgId"=NULL,"dataOwnerOrgId"=NULL WHERE id=2;INSERT INTO "Employee" VALUES(20,2,'ACTIVE','ADMIN');`);
  const client=adapter(db),p=await product(db),fields={...p.fields,name:'Brand revision'};
  assert.equal((await readStyleProduct(client,1,10,p.id)).ownerOrgId,2);
  assert.deepEqual(Object.keys(await readStyleProduct(client,2,20,p.id)).sort(),['id','ownerOrgId','revision','fields'].sort());
  await assert.rejects(readStyleProduct(client,3,30,p.id),/NOT_FOUND/);
  await assert.rejects(updateStyleProduct(client,3,30,p.id,{revision:1,fields}),/NOT_FOUND/);
  const result=await updateStyleProduct(client,2,20,p.id,{revision:1,fields});assert.equal(result.revision,2);
  assert.equal((await updateStyleProduct(client,2,20,p.id,{revision:1,fields})).revision,2);
  await assert.rejects(updateStyleProduct(client,2,20,p.id,{revision:1,fields:{...fields,name:'Conflicting'}}),/REVISION_CONFLICT/);
  assert.equal((await q(db,'SELECT name FROM "Style" WHERE id=1'))[0].name,'한글 Áo');
  assert.equal((await q(db,'SELECT "ptSeconds" FROM "StyleProcess"'))[0].ptSeconds,12.5);
  assert.equal((await q(db,'SELECT * FROM "StyleProductRevision"')).length,2);
  await db.exec(`UPDATE "Employee" SET status='INACTIVE' WHERE id=20`);
  await assert.rejects(updateStyleProduct(client,2,20,p.id,{revision:2,fields}),/ACCESS_DENIED/);
 }finally{await db.close();}
});

test('invalid fields and IDs cannot smuggle production times or ownership into product originals',()=>{
 const fields={code:'S',name:'Name'};
 for(const extra of [{processes:[]},{bom:[]},{ownerOrgId:3},{ptSeconds:123},{revenueMemo:'private'}])assert.throws(()=>validateProductFields({...fields,...extra}),/FIELDS_INVALID/);
 assert.throws(()=>validateProductFields({code:'',name:'X'}),/FIELDS_INVALID/);
 assert.throws(()=>validateProductFields({...fields,imageUrls:{bad:true}}),/FIELDS_INVALID/);
});

test('brand legacy detail and compact responses exclude producer process, time, BOM, classifications and internal memo',()=>{
 const {toStyleResponse}=loadSourceBindings('backend/src/index.ts',['toStyleResponse'],{
  styleOwnershipDto:require('../backend/dist/services/styleProducts.js').styleOwnershipDto,
  resolveOptionalString:(value,fallback)=>value??fallback,ensureArray:value=>Array.isArray(value)?value:[],
  styleDeletionState:()=>({workRecordCount:99,hasWorkRecords:true,canDelete:true}),
 });
 const style={id:1,orgId:1,customerOrgId:2,productOwnerOrgId:2,productStyleId:7,
  customerOrganization:{name:'THE SAN'},organization:{name:'BARO'},categoryId:55,collection:'Private category',
  bom:[{cost:100}],bomNotes:'Private BOM',revenueMemo:'Private profit',timeBucketSource:'PRIVATE',timeBucketSetVersionId:9,
  timeBucketSetVersion:{entries:[{bucketQuantity:12345}]} };
 const result=toStyleResponse(style,{includeProcesses:false,processMirrorMap:new Map([[1,[{pt:80,st:90,atParams:{secret:1}}]]])});
 assert.deepEqual(result.processes,[]);assert.deepEqual(result.bom,[]);assert.equal(result.bomNotes,'');assert.equal(result.revenueMemo,'');
 assert.equal(result.categoryId,null);assert.equal(result.collection,'');assert.equal(result.timeBucketSetVersionId,null);assert.deepEqual(result.timeBucketQuantities,[]);
 assert.equal(result.workRecordCount,0);assert.equal(result.canDelete,false);
 const compact=require('../backend/dist/services/styleListResponse.js').toStyleListResponse(result);assert.deepEqual(compact.processes,[]);
});

test('deleting an unused producer style never deletes the brand original or its history',async()=>{
 const db=await setup();try{await migrate(db);await db.exec('DELETE FROM "Style" WHERE id=1');assert.equal((await q(db,'SELECT * FROM "StyleProduct"')).length,1);assert.equal((await q(db,'SELECT * FROM "StyleProductRevision"')).length,1);}finally{await db.close();}
});

test('trading relationship permits catalogue lookup and explicit take with independent processes and no factory-private fields',async()=>{
 const db=await setup();try{await migrate(db);const client=adapter(db),p=await product(db);
  assert.equal((await listStyleProducts(client,3,30)).length,0);
  // Identity connection on its own is insufficient.
  await db.exec('INSERT INTO "CompanyPartnerLink" VALUES(3,2,2)');
  await assert.rejects(readStyleProduct(client,3,30,p.id),/NOT_FOUND/);
  await db.exec('INSERT INTO "CompanyPartnerLink" VALUES(3,4,2)');
  const catalogue=await listStyleProducts(client,3,30);assert.equal(catalogue.length,1);
  assert.equal(catalogue[0].fields.code,'SAN102');assert.ok(!('processes' in catalogue[0].fields));assert.ok(!('bom' in catalogue[0].fields));
  const taken=await takeStyleProduct(client,3,30,p.id,{customerOrgId:4,revision:1});
  assert.equal((await takeStyleProduct(client,3,30,p.id,{customerOrgId:4,revision:1})).id,taken.id);
  const style=(await q(db,'SELECT * FROM "Style" WHERE id=$1',[taken.id]))[0];
  assert.equal(style.orgId,3);assert.equal(style.productOwnerOrgId,2);assert.equal(style.productStyleId,p.id);
  assert.equal(style.bom,null);assert.equal(style.processes,null);assert.equal(style.revenueMemo,null);assert.equal(style.timeBucketSetVersionId,200);
  await db.exec(`INSERT INTO "StyleProcess" VALUES(11,${taken.id},3,80)`);
  assert.deepEqual(await q(db,'SELECT "orgId","ptSeconds" FROM "StyleProcess" ORDER BY id'),[{orgId:1,ptSeconds:12.5},{orgId:3,ptSeconds:80}]);
  await db.exec(`UPDATE "Style" SET name='Factory edits for brand' WHERE id=${taken.id}`);
  assert.equal((await product(db)).ownerOrgId,2);
  assert.deepEqual((await q(db,'SELECT "actorOrgId" FROM "StyleProductRevision" WHERE revision=2')),[{actorOrgId:3}]);
  await db.exec('DELETE FROM "OrgRelationship" WHERE "manufacturerOrgId"=3 AND "brandOrgId"=4');
  await assert.rejects(readStyleProduct(client,3,30,p.id),/NOT_FOUND/);
  assert.equal((await q(db,'SELECT * FROM "Style" WHERE id=$1',[taken.id])).length,1);
 }finally{await db.close();}
});

test('explicit company identity resolves a local customer without replacing local customer IDs',async()=>{
 const db=await setup();try{await migrate(db);const client=adapter(db),p=await product(db);
  await db.exec('INSERT INTO "CompanyPartnerLink" VALUES(3,4,2)');
  assert.equal((await readStyleProduct(client,3,30,p.id)).ownerOrgId,2);
  const taken=await takeStyleProduct(client,3,30,p.id,{customerOrgId:4,revision:1});
  assert.deepEqual(await q(db,'SELECT "orgId","customerOrgId","productOwnerOrgId" FROM "Style" WHERE id=$1',[taken.id]),[{orgId:3,customerOrgId:4,productOwnerOrgId:2}]);
 }finally{await db.close();}
});

test('brand creates its own product without a producer and a connected producer takes it without inheriting another factory data',async()=>{
 const db=await setup();try{await migrate(db);const client=adapter(db);
  await db.exec(`UPDATE "Organization" SET "ownerOrgId"=NULL,"dataOwnerOrgId"=NULL WHERE id=2;INSERT INTO "Employee" VALUES(20,2,'ACTIVE','ADMIN');`);
  const input={fields:{code:'AM01160',name:'Brand original'}};
  const saved=await createStyleProduct(client,2,20,input);assert.equal(saved.ownerOrgId,2);
  assert.equal((await createStyleProduct(client,2,20,input)).id,saved.id);
  await assert.rejects(createStyleProduct(client,2,20,{fields:{...input.fields,name:'Different'}}),/REVISION_CONFLICT/);
  await assert.rejects(createStyleProduct(client,1,10,input),/OWNER_REQUIRED/);
  assert.equal((await q(db,'SELECT count(*)::int count FROM "Style"'))[0].count,1);
  const taken=await takeStyleProduct(client,1,10,saved.id,{customerOrgId:2,revision:1});
  const local=(await q(db,'SELECT * FROM "Style" WHERE id=$1',[taken.id]))[0];
  assert.equal(local.orgId,1);assert.equal(local.productOwnerOrgId,2);assert.equal(local.bom,null);
  assert.equal((await q(db,'SELECT count(*)::int count FROM "StyleProcess" WHERE "styleId"=$1',[taken.id]))[0].count,0);
 }finally{await db.close();}
});

test('connected manufacturer registers and edits for a subscribed brand without changing owner; disconnect revokes product writes',async()=>{
 const db=await setup();try{await migrate(db);const client=adapter(db);
  await db.exec(`UPDATE "Organization" SET "ownerOrgId"=NULL,"dataOwnerOrgId"=NULL WHERE id=2;INSERT INTO "Employee" VALUES(20,2,'ACTIVE','ADMIN');`);
  const saved=await createStyleProduct(client,1,10,{customerOrgId:2,fields:{code:'DELEGATED',name:'Registered by producer'}});
  assert.equal(saved.ownerOrgId,2);
  const edited=await updateStyleProduct(client,1,10,saved.id,{revision:1,fields:{...saved.fields,name:'Edited by producer'}});
  assert.equal(edited.ownerOrgId,2);assert.equal(edited.revision,2);
  assert.deepEqual(await q(db,'SELECT "actorOrgId","ownerOrgId" FROM "StyleProductRevision" WHERE "productId"=$1 ORDER BY revision',[saved.id]),[{actorOrgId:1,ownerOrgId:2},{actorOrgId:1,ownerOrgId:2}]);
  await db.exec(`INSERT INTO "Style"("orgId","customerOrgId",code,name) VALUES(1,2,'LEGACY-NEW','Registered through existing form')`);
  const created=(await q(db,`SELECT "productOwnerOrgId" FROM "Style" WHERE code='LEGACY-NEW'`))[0];assert.equal(created.productOwnerOrgId,2);
  await db.exec('DELETE FROM "OrgRelationship" WHERE "manufacturerOrgId"=1 AND "brandOrgId"=2');
  await assert.rejects(updateStyleProduct(client,1,10,saved.id,{revision:2,fields:{...edited.fields,name:'Disconnected'}}),/NOT_FOUND/);
  await assert.rejects(createStyleProduct(client,1,10,{customerOrgId:2,fields:{code:'DENIED',name:'Denied'}}),/TRADING_RELATIONSHIP_REQUIRED/);
  await assert.rejects(db.exec(`UPDATE "Style" SET name='Disconnected change' WHERE id=1`),/OWNER_REQUIRED/);
  await db.exec('UPDATE "StyleProcess" SET "ptSeconds"=90 WHERE id=7');
  assert.equal((await product(db)).ownerOrgId,2);
 }finally{await db.close();}
});

test('linked customer registration resolves brand owner and stale producer edits cannot overwrite another company revision',async()=>{
 const db=await setup();try{await migrate(db);const client=adapter(db);
  await db.exec('INSERT INTO "CompanyPartnerLink" VALUES(3,4,2)');
  const created=await createStyleProduct(client,3,30,{customerOrgId:4,fields:{code:'LINKED',name:'Same brand'}});assert.equal(created.ownerOrgId,2);
  await db.exec(`INSERT INTO "Style"("orgId","customerOrgId",code,name) VALUES(3,4,'LINKED-LEGACY','Linked legacy')`);
  assert.equal((await q(db,`SELECT "productOwnerOrgId" FROM "Style" WHERE code='LINKED-LEGACY'`))[0].productOwnerOrgId,2);
  const p=await product(db);
  await updateStyleProduct(client,3,30,p.id,{revision:1,fields:{...p.fields,name:'New revision'}});
  await assert.rejects(db.exec(`UPDATE "Style" SET name='Stale overwrite' WHERE id=1`),/REVISION_CONFLICT/);
  assert.equal((await product(db)).fields.name,'New revision');
 }finally{await db.close();}
});
