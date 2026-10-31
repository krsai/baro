import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {PGlite} from '@electric-sql/pglite';
import {createRequire} from 'node:module';
import {loadSourceBindings} from './helpers/source-bindings.mjs';
const require=createRequire(import.meta.url);
const {validateCustomerIndustry,partnerIndustryOption}=require('../backend/dist/services/partnerIndustry.js');
const sql=fs.readFileSync('backend/prisma/migrations/20261022200000_partner_industry_canonical/migration.sql','utf8');
const ts=require('../backend/node_modules/typescript');
const {resolvePartnerCode}=require('../backend/dist/services/entityProfile.js');
function routeHandler(method,path,deps){
 const source=fs.readFileSync('backend/src/index.ts','utf8'),tree=ts.createSourceFile('index.ts',source,ts.ScriptTarget.Latest,true);
 const node=tree.statements.find(node=>ts.isExpressionStatement(node)&&ts.isCallExpression(node.expression)&&node.expression.expression.getText(tree)===`app.${method}`&&node.expression.arguments[0]?.text===path);
 assert.ok(node);let handler;
 const {normalizeLocalizedName}=require('../backend/dist/utils/localizedName.js');
 if(deps.prisma&&!deps.prisma.$transaction)deps.prisma.$transaction=run=>run(deps.prisma);
 const classification=async(_db,body)=>{assert.ok(body?.industryIds?.length,'classification required');};
 const bindings={app:{[method]:(_path,fn)=>handler=fn},normalizeLocalizedName,resolvePartnerCode,validateClassification:classification,requireClassificationActor:async()=>{},saveClassification:async(_db,_org,_entity,_actor,body)=>classification(null,body),getCurrentRequestActorEmployeeId:()=>8,attachPartnerClassifications:async(_db,_org,rows)=>rows,...deps};
 new Function(...Object.keys(bindings),ts.transpileModule(node.getText(tree),{compilerOptions:{target:ts.ScriptTarget.ES2022}}).outputText)(...Object.values(bindings));
 return handler;
}

test('customers can be created without codes and duplicate codes never identify or overwrite another entity',async()=>{
 const {normalizePartnerCode}=require('../backend/dist/services/entityProfile.js');
 let lookups=0,creates=0,conflict=false;
 const deps={ORG_MANAGEMENT_ROLES:['ADMIN'],requireOrgRole:async()=>({organization:{id:1}}),resolveCustomerPerspective:()=> 'MANUFACTURER',validateCustomerIndustry:async()=>null,
  buildSharedCustomerOrganizationData:body=>({...body,code:resolvePartnerCode(body.code,body.name)}),ORGANIZATION_TYPE_KEYS:{BRAND:'BRAND',MANUFACTURER:'MANUFACTURER'},toPositiveIntOrNull:()=>null,
  resolveOptionalString:(value,fallback)=>value??fallback,normalizeCustomerDefaultSizeSetCode:()=> 'LEGACY_APPAREL',toCustomerResponse:row=>row,
  prisma:{organization:{findFirst:async({where})=>{lookups++;assert.ok(where.code);return conflict?{id:99,type:'BRAND'}:null;},create:async({data})=>{creates++;assert.equal(data.code,'COMPAN');return{id:44,...data};},update:()=>{throw Error('Unexpected existing entity overwrite');}},orgRelationship:{upsert:async({create})=>({...create,id:7,salesBucketSetVersionId:1,timeBucketSetVersionId:2})}}};
 const handler=routeHandler('post','/customers',deps),res={status(code){this.code=code;return this;},json(body){this.body=body;return this;}};
 for(const code of ['',null,undefined]){await handler({body:{name:'Company',code,classification:{revision:0,roleIds:[1],industryIds:[1]}}},res);assert.equal(res.code,201);}
 assert.equal(lookups,3);assert.equal(creates,3);conflict=true;
 await handler({body:{name:'Another company',code:'CUS-001',classification:{revision:0,roleIds:[1],industryIds:[1]}}},res);assert.equal(res.code,409);assert.equal(creates,3);
});

test('customer code edits accept extended codes and generate from the name when cleared',async()=>{
 const {normalizePartnerCode}=require('../backend/dist/services/entityProfile.js');let organizationWrite,relationshipWrite;
 const existing={id:7,brandOrgId:44,manufacturerOrgId:1,brand:{id:44,name:'Company'}};
 const deps={ORG_MANAGEMENT_ROLES:['ADMIN'],requireOrgRole:async()=>({organization:{id:1}}),resolveCustomerPerspective:()=> 'MANUFACTURER',validateCustomerIndustry:async()=>undefined,
  buildSharedCustomerOrganizationData:body=>body,normalizePartnerCode,resolveOptionalString:(value,fallback)=>value??fallback,toCustomerResponse:row=>row,
  prisma:{orgRelationship:{findFirst:async()=>existing,update:async({data})=>{relationshipWrite=data;},findUnique:async()=>existing},organization:{findFirst:async({where})=>{assert.ok(where.code);return null;},update:async({data})=>{organizationWrite=data;}}}};
 const handler=routeHandler('put','/customers/:id',deps),res={status(code){this.code=code;return this;},json(body){this.body=body;return this;}};
 for(const [code,expected] of [['cus-001','CUS-001'],['','COMPAN']]){
  await handler({params:{id:'7'},body:{name:'Company',code,classification:{revision:0,roleIds:[1],industryIds:[1]}}},res);
  assert.equal(organizationWrite.code,expected);assert.equal(relationshipWrite.customerCode,expected);
 }
});
test('SaaS managers create their own outsourcing and supplier partners without SYSTEM privileges',async()=>{
 const {resolvePartnerServiceTypeIds}=loadSourceBindings('backend/src/index.ts',['resolvePartnerServiceTypeIds']);
 for(const type of ['PROCESS_OUTSOURCING','MATERIAL_SUPPLIER']){
  let writes=0;
  const tx={outsourcingServiceType:{findMany:async({where})=>{assert.equal(where.ownerOrgId,1);assert.deepEqual(where.systemDefaultId,{not:null});return[{id:412}];}},organization:{findUnique:async()=>null,findFirst:async()=>null,upsert:async({where,create})=>{assert.equal(where.ownerOrgId_type_name.ownerOrgId,1);assert.equal(create.ownerOrgId,1);writes++;return{id:11};},findUniqueOrThrow:async()=>({id:11,type})},organizationOutsourcingServiceType:{deleteMany:async()=>{},createMany:async({data})=>{assert.deepEqual(data,[{partnerOrgId:11,serviceTypeId:412,ownerOrgId:1}]);}}};
  const deps={BUSINESS_PARTNER_SERVICE_INCLUDE:{},ORG_MANAGEMENT_ROLES:['ADMIN','OPERATOR','ACCOUNTANT'],requireOrgRole:async()=>({organization:{id:1}}),requireSystemAdmin:()=>{throw Error('Unexpected SYSTEM gate');},resolveOptionalString:(value,fallback=null)=>value==null?fallback:String(value).trim(),toPositiveIntOrNull:value=>Number.isSafeInteger(value)&&value>0?value:null,getRequesterEmail:()=>null,partnerProfilePatch:()=>({}),resolvePartnerServiceTypeIds,toBusinessPartnerResponse:row=>row,prisma:{$transaction:run=>run(tx)}};
  const handler=routeHandler('post','/business-partners',deps),res={status(code){this.code=code;return this;},json(body){this.body=body;}};
  await handler({body:{name:'My vendor',type,ownerOrgId:999,serviceTypeIds:[412],classification:{revision:0,roleIds:[1],industryIds:[1]}}},res);assert.equal(res.code,201);assert.equal(writes,1);
  await routeHandler('post','/business-partners',{...deps,requireOrgRole:async()=>null})({body:{name:'Denied',type}},res);assert.equal(writes,1);
 }
});
test('partner industry writes reject unlinked and foreign-tenant IDs before saving assignments',async()=>{
 const {resolvePartnerServiceTypeIds}=loadSourceBindings('backend/src/index.ts',['resolvePartnerServiceTypeIds']);
 const tx={outsourcingServiceType:{findMany:async({where})=>{assert.equal(where.ownerOrgId,1);assert.deepEqual(where.systemDefaultId,{not:null});return[];}}};
 await assert.rejects(resolvePartnerServiceTypeIds(tx,1,[19],'PROCESS_OUTSOURCING'),/INVALID_OUTSOURCING_SERVICE_TYPE/);
 await assert.rejects(resolvePartnerServiceTypeIds(tx,1,['412'],'PROCESS_OUTSOURCING'),/INVALID_OUTSOURCING_SERVICE_TYPE/);
});
test('selectable industries require SYSTEM FKs and read current SYSTEM labels and roles',()=>{
 assert.equal(partnerIndustryOption({id:19,nameKo:'Duplicate'} ,'PROCESS_OUTSOURCING'),null);
 const source={id:1,code:'BUTTONHOLE',nameKo:'Current',isActive:true,partnerRole:{code:'PROCESS_OUTSOURCING'}};
 const row={id:412,ownerOrgId:1,systemDefaultId:1,nameKo:'Old copy',systemDefault:source};
 assert.equal(partnerIndustryOption(row,'PROCESS_OUTSOURCING').nameKo,'Current');
 assert.equal(partnerIndustryOption(row,'PROCESS_OUTSOURCING').id,412);
 assert.equal(partnerIndustryOption(row,'MATERIAL_SUPPLIER'),null);
 assert.equal(partnerIndustryOption({...row,systemDefault:{...source,isActive:false}},'PROCESS_OUTSOURCING'),null);
});
test('customer industry is optional, validated by source ID and customer role; retained inactive IDs survive',async()=>{
 const db={settingServiceDefault:{findFirst:async({where})=>where.id===3 && where.partnerRole.code==='CUSTOMER' && !where.isActive?{id:3}:null}};
 assert.equal(await validateCustomerIndustry(db,undefined),undefined);assert.equal(await validateCustomerIndustry(db,null),null);
 for(const value of ['Brand',0,-1,1.5,2])await assert.rejects(validateCustomerIndustry(db,value),/INVALID_CUSTOMER_INDUSTRY/);
 assert.equal(await validateCustomerIndustry(db,3,3),3);
});
async function fixture(ambiguous=false){
 const db=new PGlite();
 await db.exec(`CREATE TABLE "SettingServiceDefault"(id INT PRIMARY KEY,code TEXT,"nameKo" TEXT,"nameEn" TEXT,"nameVi" TEXT,"entryMode" TEXT,"requiredFields" TEXT[],"orderInput" TEXT,"styleInput" TEXT,"processInput" TEXT,"isActive" BOOL,"sortOrder" INT);
 INSERT INTO "SettingServiceDefault" VALUES(1,'BUTTONHOLE','Current','Current','Current','PROCESS','{}','REQUIRED','REQUIRED','REQUIRED',true,10),(2,'CUTTING','Cut','Cut','Cut','PROCESS','{}','REQUIRED','REQUIRED','REQUIRED',true,20);
 CREATE TABLE "OutsourcingServiceType"(id SERIAL PRIMARY KEY,"ownerOrgId" INT,code TEXT,"nameKo" TEXT,"nameEn" TEXT,"nameVi" TEXT,"entryMode" TEXT,"requiredFields" TEXT[],"orderInput" TEXT,"styleInput" TEXT,"processInput" TEXT,"isActive" BOOL,"sortOrder" INT,"systemDefaultId" INT REFERENCES "SettingServiceDefault"(id),"isOverridden" BOOL,"updatedAt" TIMESTAMP,UNIQUE("ownerOrgId","systemDefaultId"));
 INSERT INTO "OutsourcingServiceType"(id,"ownerOrgId",code,"systemDefaultId") VALUES(19,1,'Legacy',NULL),(20,2,'Other tenant',NULL),(412,1,'Bridge',1);
 CREATE TABLE "Organization"(id INT PRIMARY KEY);INSERT INTO "Organization" VALUES(11),(12);
 CREATE TABLE "OrgRelationship"(id INT PRIMARY KEY);INSERT INTO "OrgRelationship" VALUES(7);
 CREATE TABLE "OrganizationOutsourcingServiceType"("partnerOrgId" INT,"ownerOrgId" INT,"serviceTypeId" INT REFERENCES "OutsourcingServiceType"(id),"createdAt" TIMESTAMP DEFAULT CURRENT_TIMESTAMP,PRIMARY KEY("partnerOrgId","serviceTypeId"));
 INSERT INTO "OrganizationOutsourcingServiceType" VALUES(11,1,19,'2026-01-01'),(12,2,20,'2026-01-02');
 CREATE TABLE "TransactionCodeBase"(id INT PRIMARY KEY,"serviceTypeId" INT REFERENCES "SettingServiceDefault"(id));INSERT INTO "TransactionCodeBase" VALUES(5,1),(6,2);
 CREATE TABLE "SettingTransactionCodeDefault"(id INT PRIMARY KEY,"serviceTypeId" INT);
 CREATE TABLE "TransactionCode"(id INT PRIMARY KEY,"ownerOrgId" INT,"serviceTypeId" INT,"baseId" INT,"systemDefaultId" INT);INSERT INTO "TransactionCode" VALUES(3,1,19,5,NULL),(4,2,20,6,NULL);
 ${['PartnerTransactionCost','OutsourcedWorkRecord','WorkLog','WorkOrder','Invoice','AssignmentPlan'].map(table=>`CREATE TABLE "${table}"(id INT PRIMARY KEY,quantity INT);INSERT INTO "${table}" VALUES(1,170);`).join('\n')}`);
 if(ambiguous)await db.exec('INSERT INTO "TransactionCode" VALUES(9,1,19,6,NULL)');
 return db;
}
test('migration uses FK evidence, tenant-specific bridges and preserves business data; repeat is inert',async()=>{
 const db=await fixture();try{
 await db.exec('BEGIN');await db.exec(sql);await db.exec('COMMIT');
 const rows=(await db.query('SELECT * FROM "OrganizationOutsourcingServiceType" ORDER BY "partnerOrgId"')).rows;
 assert.equal(rows[0].serviceTypeId,412);assert.notEqual(rows[1].serviceTypeId,412);
 const target=(await db.query('SELECT "ownerOrgId","systemDefaultId" FROM "OutsourcingServiceType" WHERE id=$1',[rows[1].serviceTypeId])).rows[0];
 assert.deepEqual(target,{ownerOrgId:2,systemDefaultId:2});
 assert.equal((await db.query('SELECT "serviceTypeId" FROM "TransactionCode" WHERE id=3')).rows[0].serviceTypeId,19);
 assert.equal((await db.query('SELECT quantity FROM "PartnerTransactionCost"')).rows[0].quantity,170);
 await assert.rejects(db.exec('UPDATE "OrgRelationship" SET "systemIndustryId"=999 WHERE id=7'));
 await db.exec('BEGIN');await db.exec(sql);await db.exec('COMMIT');
 assert.equal((await db.query('SELECT * FROM "PartnerIndustryMigrationAudit"')).rows.length,1);
 assert.equal((await db.query('SELECT * FROM "OrganizationOutsourcingServiceType"')).rows.length,2);
 }finally{await db.close();}
});
test('ambiguous source FKs roll back all classification changes instead of matching names',async()=>{
 const db=await fixture(true);try{
 await db.exec('BEGIN');await assert.rejects(db.exec(sql),/PARTNER_INDUSTRY_MAPPING_REQUIRES_REVIEW/);await db.exec('ROLLBACK');
 assert.equal((await db.query('SELECT "serviceTypeId" FROM "OrganizationOutsourcingServiceType" WHERE "partnerOrgId"=11')).rows[0].serviceTypeId,19);
 }finally{await db.close();}
});
