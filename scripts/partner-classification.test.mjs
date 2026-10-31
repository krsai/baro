import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createRequire} from 'node:module';
import {PGlite} from '@electric-sql/pglite';
const require=createRequire(import.meta.url);
const {effectiveClassification,validateClassification,saveClassification,registerPartnerClassificationRoutes}=require('../backend/dist/services/partnerClassification.js');
const sources=[{id:10,code:'ZIPPER',partnerRoleId:2,isActive:true,partnerRole:{id:2,code:'MATERIAL_SUPPLIER'}},{id:11,code:'SHIPPING',partnerRoleId:3,isActive:true,partnerRole:{id:3,code:'LOGISTICS_PROVIDER'}},{id:12,code:'GENERAL',partnerRoleId:4,isActive:true},{id:13,code:'RETIRED',partnerRoleId:2,isActive:false}];
const body={revision:0,roleIds:[2,3],industryIds:[10,11]};
const ts=require('../backend/node_modules/typescript');
function sourceRoute(method,path,dependencies){
 const source=readFileSync('backend/src/index.ts','utf8'),tree=ts.createSourceFile('index.ts',source,ts.ScriptTarget.Latest,true);
 const node=tree.statements.find(node=>ts.isExpressionStatement(node)&&ts.isCallExpression(node.expression)&&node.expression.expression.getText(tree)===`app.${method}`&&node.expression.arguments[0]?.text===path);
 let handler;const bindings={app:{[method]:(_path,fn)=>handler=fn},ORG_MANAGEMENT_ROLES:['ADMIN'],requireOrgRole:async()=>({organization:{id:1}}),...dependencies};
 new Function(...Object.keys(bindings),ts.transpileModule(node.getText(tree),{compilerOptions:{target:ts.ScriptTarget.ES2022}}).outputText)(...Object.values(bindings));return handler;
}
const validator=(stored=null)=>({partnerClassification:{findUnique:async()=>stored},settingServiceDefault:{findMany:async({where})=>sources.filter(row=>where.id.in.includes(row.id))}});
test('legacy GENERAL stays an original reference and never becomes a selectable industry or inferred category',()=>{
 const value=effectiveClassification(null,[sources[0],sources[2]]);assert.deepEqual(value.roleIds,[2]);assert.deepEqual(value.industryIds,[10]);assert.deepEqual(value.legacyGeneral,[{id:12,code:'GENERAL'}]);assert.equal(value.revision,0);
 const explicit=effectiveClassification({revision:3,industries:[{industry:sources[1]}]},[sources[0],sources[2]]);assert.deepEqual(explicit.roleIds,[3]);assert.deepEqual(explicit.industryIds,[11]);assert.equal(explicit.revision,3);
});
test('all selected categories require real industries; cross-category selection is allowed without an organization type restriction',async()=>{
 assert.deepEqual(await validateClassification(validator(),body,1),body);
 for(const value of [undefined,{}, {...body,industryIds:[]},{...body,roleIds:[]},{...body,roleIds:[2]},{...body,roleIds:[2,3,4]},{...body,industryIds:[10,10]},{...body,industryIds:['10',11]},{...body,industryIds:[10,999]},{...body,industryIds:[10,12]},{...body,industryIds:[10,13]}])await assert.rejects(validateClassification(validator(),value,1),/PARTNER_CLASSIFICATION_REQUIRED/);
});
test('inactive stored industries retain their original FK; stale edits cannot overwrite a classification',async()=>{
 const stored={revision:2,industries:[{systemIndustryId:13,industry:sources[3]}]};
 assert.deepEqual(await validateClassification(validator(stored),{revision:2,roleIds:[2],industryIds:[13]},1,7),{revision:2,roleIds:[2],industryIds:[13]});
 await assert.rejects(validateClassification(validator(stored),body,1,7),/PARTNER_CLASSIFICATION_CHANGED/);
});
test('saving uses the authenticated company/active employee, serializes the entity and changes only classification tables',async()=>{
 let stored=null,selected=[],actor,locked=false;const writes=[];
 const db={...validator(),organization:{findFirst:async({where})=>where.ownerOrgId===1&&where.id===7?{id:7,outsourcingServiceAssignments:[]}:null},orgRelationship:{findFirst:async()=>null},employee:{findFirst:async({where})=>{actor=where;return where.id===8&&where.orgId===1?{id:8}:null;}},
  $queryRawUnsafe:async(_sql,id)=>{assert.equal(id,7);locked=true;},partnerClassification:{findUnique:async()=>stored,create:async({data})=>{assert.equal(locked,true);stored={...data,revision:1,industries:[]};writes.push('header');},updateMany:async()=>({count:0})},
  partnerClassificationIndustry:{deleteMany:async()=>{selected=[];writes.push('industries');},createMany:async({data})=>{selected=data;stored.industries=data.map(row=>({...row,industry:sources.find(s=>s.id===row.systemIndustryId)}));}}};
 const result=await saveClassification(db,1,7,8,body);assert.deepEqual(result.industryIds,[10,11]);assert.equal(result.revision,1);assert.deepEqual(writes,['header','industries']);assert.ok(selected.every(row=>row.orgId===1&&row.entityId===7));assert.equal(actor.status,'ACTIVE');assert.deepEqual(actor.orgRole.in,['ADMIN','OPERATOR','ACCOUNTANT']);
 await assert.rejects(saveClassification(db,2,7,8,body),/PARTNER_NOT_FOUND/);await assert.rejects(saveClassification(db,1,7,99,{...body,revision:1}),/ACTIVE_EMPLOYEE_REQUIRED/);
});
test('classification read routes enforce membership first and ignore a forged orgId in favor of authenticated context',async()=>{
 const handlers=new Map();let allowed=false,reads=0;
 const db={partnerRole:{findMany:async()=>{reads++;return[];}},settingServiceDefault:{findMany:async()=>[]}};
 registerPartnerClassificationRoutes({get:(path,fn)=>handlers.set(path,fn)},db,{requireOrgRole:async()=>allowed?{organization:{id:1}}:null});
 const res={json:()=>{}};await handlers.get('/partner-classifications/options')({query:{orgId:999}},res);assert.equal(reads,0);allowed=true;await handlers.get('/partner-classifications/options')({query:{orgId:999}},res);assert.equal(reads,1);
});
test('customer creation rejects missing classification before it creates or changes any shared organization',async()=>{
 let writes=0;const db={...validator(),organization:{create:async()=>{writes++;}}};db.$transaction=run=>run(db);
 const handler=sourceRoute('post','/customers',{resolveCustomerPerspective:()=> 'MANUFACTURER',validateClassification,prisma:db});
 await assert.rejects(handler({body:{name:'Customer'}},{}),/PARTNER_CLASSIFICATION_REQUIRED/);assert.equal(writes,0);
});
test('customer profile and relationship edits roll back together when classification save fails',async()=>{
 const initial={id:7,brandOrgId:44,manufacturerOrgId:1,brand:{id:44,name:'Original'},memo:'Original note'};let state=structuredClone(initial),calls=0;
 const db={organization:{findFirst:async()=>null,update:async({data})=>{state.brand.name=data.name;}},orgRelationship:{findFirst:async()=>structuredClone(initial),update:async({data})=>{state.memo=data.memo;},findUnique:async()=>state},$transaction:async run=>{const before=structuredClone(state);try{return await run(db);}catch(error){state=before;throw error;}}};
 const handler=sourceRoute('put','/customers/:id',{resolveCustomerPerspective:()=> 'MANUFACTURER',validateCustomerIndustry:async()=>undefined,normalizeLocalizedName:body=>({name:body.name}),buildSharedCustomerOrganizationData:body=>body,resolveOptionalString:(value,fallback)=>value??fallback,prisma:db,getCurrentRequestActorEmployeeId:()=>8,saveClassification:async()=>{calls++;throw Error('PARTNER_CLASSIFICATION_CHANGED');}});
 await assert.rejects(handler({params:{id:'7'},body:{name:'Changed',memo:'Changed note',classification:body}},{}),/PARTNER_CLASSIFICATION_CHANGED/);assert.deepEqual(state,initial);assert.equal(calls,1);
});
test('additive SQL enforces real company/entity/employee/source FKs and mandatory categories without touching legacy links',async()=>{
 const db=new PGlite();try{
  await db.exec(`CREATE TABLE "Organization"(id INT PRIMARY KEY,"ownerOrgId" INT,type TEXT);INSERT INTO "Organization" VALUES(1,NULL,'MANUFACTURER'),(2,NULL,'MANUFACTURER'),(7,1,'MATERIAL_SUPPLIER'),(9,2,'MATERIAL_SUPPLIER'),(10,NULL,'BRAND');
   CREATE TABLE "Employee"(id INT PRIMARY KEY,"orgId" INT,status TEXT,"orgRole" TEXT,UNIQUE(id,"orgId"));INSERT INTO "Employee" VALUES(8,1,'ACTIVE','ACCOUNTANT'),(9,2,'ACTIVE','ADMIN'),(11,1,'INACTIVE','ADMIN');
   CREATE TABLE "OrgRelationship"(id INT PRIMARY KEY,"manufacturerOrgId" INT,"brandOrgId" INT,"systemIndustryId" INT);INSERT INTO "OrgRelationship" VALUES(5,1,10,101);
   CREATE TABLE "SettingServiceDefault"(id INT PRIMARY KEY,code TEXT,"partnerRoleId" INT);INSERT INTO "SettingServiceDefault" VALUES(100,'ZIPPER',2),(101,'CUSTOMER_WOVEN',1),(102,'GENERAL',4),(103,'LOGISTICS',3);
   CREATE TABLE "OrganizationOutsourcingServiceType"("partnerOrgId" INT,"serviceTypeId" INT);INSERT INTO "OrganizationOutsourcingServiceType" VALUES(7,102);`);
  const sql=readFileSync('backend/prisma/migrations/20261031210000_partner_classification/migration.sql','utf8');await db.exec(sql);await db.exec(sql);
  await assert.rejects(db.exec('INSERT INTO "PartnerClassification"("orgId","entityId","updatedByEmployeeId") VALUES(1,7,8)'),/PARTNER_CLASSIFICATION_REQUIRED/);
  await db.exec('BEGIN;INSERT INTO "PartnerClassification"("orgId","entityId","updatedByEmployeeId") VALUES(1,7,8);INSERT INTO "PartnerClassificationIndustry" VALUES(1,7,100),(1,7,103);COMMIT;');
  for(const [company,entity,employee,error] of [[1,9,8,'SCOPE'],[2,7,9,'SCOPE'],[1,10,9,'ACTOR'],[1,10,11,'ACTOR']])await assert.rejects(db.exec(`INSERT INTO "PartnerClassification"("orgId","entityId","updatedByEmployeeId") VALUES(${company},${entity},${employee})`),new RegExp(error));
  await assert.rejects(db.exec('INSERT INTO "PartnerClassificationIndustry" VALUES(1,7,102)'),/PARTNER_CLASSIFICATION_INDUSTRY/);
  await assert.rejects(db.exec('DELETE FROM "PartnerClassificationIndustry" WHERE "orgId"=1'),/PARTNER_CLASSIFICATION_REQUIRED/);
  assert.equal((await db.query('SELECT COUNT(*)::int AS n FROM "PartnerClassificationIndustry"')).rows[0].n,2);
  await assert.rejects(db.exec('UPDATE "PartnerClassification" SET revision=9'),/PARTNER_CLASSIFICATION_REVISION/);
  await assert.rejects(db.exec('DELETE FROM "SettingServiceDefault" WHERE id=100'),/foreign key/);
  assert.deepEqual((await db.query('SELECT * FROM "OrganizationOutsourcingServiceType"')).rows,[{partnerOrgId:7,serviceTypeId:102}]);assert.equal((await db.query('SELECT "systemIndustryId" FROM "OrgRelationship" WHERE id=5')).rows[0].systemIndustryId,101);
 }finally{await db.close();}
});
test('deployment and read-only startup checks register the new schema and leave accounting code validation independent',()=>{
 for(const file of ['backend/scripts/migrate-entity-profiles.js','backend/scripts/railway-schema-preflight.js','backend/src/index.ts'])assert.match(readFileSync(file,'utf8'),/partner_classification|PartnerClassification/);
 const code=readFileSync('backend/src/services/expenseRequestEditor.ts','utf8');assert.doesNotMatch(code,/validateClassification|PARTNER_CLASSIFICATION_REQUIRED/);
});
