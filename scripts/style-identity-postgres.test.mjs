import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';
import { PrismaClient, Prisma } from '../backend/node_modules/@prisma/client/default.js';
const require=createRequire(import.meta.url);
const ts=require('../backend/node_modules/typescript');
const source=readFileSync('backend/src/index.ts','utf8');
const load=(names,deps)=>{
  const ast=ts.createSourceFile('index.ts',source,ts.ScriptTarget.Latest,true),parts=[];
  const visit=node=>{if(ts.isVariableDeclaration(node)&&names.includes(node.name.getText(ast))) parts.push(`const ${node.getText(ast)};`);ts.forEachChild(node,visit);};visit(ast);
  assert.equal(parts.length,names.length);
  const js=ts.transpileModule(parts.join('\n'),{compilerOptions:{target:ts.ScriptTarget.ES2022}}).outputText;
  return new Function(...Object.keys(deps),`${js};return {${names.join(',')}};`)(...Object.values(deps));
};
const {resolveStyleCategory,syncCategoryCopies}=require('../backend/dist/services/styleIdentity.js');
const base=process.env.STYLE_IDENTITY_TEST_DATABASE_URL;
if(!base) throw Error('STYLE_IDENTITY_TEST_DATABASE_URL is required (dedicated local PostgreSQL)');
const url=new URL(base);
if(!['127.0.0.1','localhost','[::1]'].includes(url.hostname)) throw Error('Refusing non-local test database');
const name=`style_fk_test_${randomUUID().replaceAll('-','')}`;
const adminUrl=new URL(url);adminUrl.pathname='/postgres';adminUrl.search='';
url.pathname=`/${name}`;url.search='';
const admin=new PrismaClient({datasourceUrl:adminUrl.toString()});
const db=new PrismaClient({datasourceUrl:url.toString()});
const backend=path.resolve('backend');
const cli=path.join(backend,'node_modules/prisma/build/index.js');
const env={...process.env,DATABASE_URL:url.toString(),DIRECT_URL:url.toString()};
const sql=readFileSync('backend/scripts/style-identity-fk.sql','utf8');
const execute=sql=>execFileSync(process.execPath,[cli,'db','execute','--stdin','--schema','prisma/schema.prisma'],{cwd:backend,env,input:sql,stdio:'pipe'});
const migrate=(commit=true)=>execute(`BEGIN; ${sql} ${commit?'COMMIT':'ROLLBACK'};`);
let checks=0;
const check=async(label,fn)=>{await fn();console.log(`PASS ${++checks}: ${label}`);};
let seller,buyer,other,category,copy,style,styleProcess,master;
try {
  await admin.$executeRawUnsafe(`CREATE DATABASE "${name}"`);
  execFileSync(process.execPath,[cli,'db','push','--skip-generate','--schema','prisma/schema.prisma'],{cwd:backend,env,stdio:'pipe'});
  seller=await db.organization.create({data:{name:'Manufacturer',type:'MANUFACTURER'}});
  other=await db.organization.create({data:{name:'Other manufacturer',type:'MANUFACTURER'}});
  buyer=await db.organization.create({data:{name:'Customer',type:'BRAND'}});
  category=await db.attrCategory.create({data:{orgId:seller.id,code:'JACKET',name:'Same name'}});
  copy=await db.attrCategory.create({data:{orgId:other.id,code:'JACKET',name:'Same name'}});
  style=await db.style.create({data:{orgId:seller.id,customerOrgId:buyer.id,code:'S1',name:'Style',collection:category.name}});
  master=await db.processMasterOption.create({data:{type:'LOCATION',code:'FRONT',label:'Front'}});
  const target=await db.processMasterOption.create({data:{type:'TARGET',code:'HEM',label:'Hem'}});
  const action=await db.processMasterOption.create({data:{type:'ACTION',code:'SEW',label:'Sew'}});
  const spec=await db.processMasterOption.create({data:{type:'ACTION_SPEC',code:'ONE',label:'One'}});
  const original={locations:[{code:'FRONT',label:'Original front',isCustom:false}],targetPairs:[{target:{code:'HEM',label:'Hem',isCustom:false},targetSpec:null}],actionPairs:[{action:{code:'SEW',label:'Sew',isCustom:false},actionSpec:{code:'ONE',label:'One',isCustom:false}}]};
  styleProcess=await db.styleProcess.create({data:{orgId:seller.id,styleId:style.id,processCode:'P1',processName:'Original',processComposition:original,ptSeconds:31}});
  await check('dry-run rolls back category IDs, JSON and schema additions',async()=>{
    migrate(false);
    assert.equal((await db.style.findUnique({where:{id:style.id}})).categoryId,null);
    assert.deepEqual((await db.styleProcess.findUnique({where:{id:styleProcess.id}})).processComposition,original);
    assert.equal(await db.styleIdentityArchive.count(),0);
  });
  await check('manufacturer-scoped backfill and ordered typed component FKs preserve original JSON',async()=>{
    migrate();
    const s=await db.style.findUnique({where:{id:style.id}});assert.equal(s.categoryId,category.id);assert.equal(s.customerOrgId,buyer.id);
    const refs=await db.styleProcessComponent.findMany({where:{styleProcessId:styleProcess.id},orderBy:{path:'asc'}});
    assert.deepEqual(refs.map(r=>r.path),['actionPairs/0/action','actionPairs/0/actionSpec','locations/0','targetPairs/0/target']);
    assert.equal(refs.find(r=>r.type==='LOCATION').masterOptionId,master.id);
    const archive=await db.$queryRawUnsafe(`SELECT original FROM "StyleIdentityArchive" WHERE entity='StyleProcess' AND "entityId"=${styleProcess.id}`);
    assert.deepEqual(archive[0].original.processComposition,original);
    const p=await db.styleProcess.findUnique({where:{id:styleProcess.id}});assert.equal(p.ptSeconds,31);assert.equal(p.processName,'Original');
  });
  await check('repeated migration preserves IDs, archive, relations and labels',async()=>{
    const before=await db.styleProcess.findUnique({where:{id:styleProcess.id}});const count=await db.styleProcessComponent.count();migrate();
    assert.deepEqual(await db.styleProcess.findUnique({where:{id:styleProcess.id}}),before);assert.equal(await db.styleProcessComponent.count(),count);
  });
  await check('category ID is required internally; file names resolve only within manufacturer',async()=>{
    await assert.rejects(()=>resolveStyleCategory(db,seller.id,{collection:'Same name'}),/categoryId is required/);
    assert.equal((await resolveStyleCategory(db,seller.id,{collection:'Same name'},true)).categoryId,category.id);
    await assert.rejects(()=>resolveStyleCategory(db,seller.id,{categoryId:copy.id}),/manufacturer/);
    const second=await db.attrCategory.create({data:{orgId:seller.id,code:'DUPLICATE',name:'Same name'}});
    await assert.rejects(()=>resolveStyleCategory(db,seller.id,{collection:'Same name'},true),/one manufacturer-scoped match/);
    await db.attrCategory.delete({where:{id:second.id}});
  });
  await check('category rename and code changes retain local copy IDs and update current display',async()=>{
    await syncCategoryCopies(db,seller.id,[{id:category.id,code:'RENAMED',name:'New name'}]);
    assert.equal((await db.style.findUnique({where:{id:style.id}})).categoryId,category.id);
    assert.equal((await db.style.findUnique({where:{id:style.id}})).collection,'New name');
    assert.equal((await db.attrCategory.findUnique({where:{id:copy.id}})).code,'RENAMED');
  });
  await check('used category deletion rolls back global master edit and all copies',async()=>{
    await assert.rejects(()=>syncCategoryCopies(db,seller.id,[]));
    assert.equal((await db.attrCategory.findUnique({where:{id:category.id}})).name,'New name');
    assert.ok(await db.attrCategory.findUnique({where:{id:copy.id}}));
    await assert.rejects(()=>db.style.update({where:{id:style.id},data:{categoryId:copy.id}}));
  });
  await check('wrong type, orphan and missing component IDs reject the whole process write',async()=>{
    for(const entry of [{masterOptionId:target.id},{masterOptionId:2147483000},{}]) {
      await assert.rejects(()=>db.styleProcess.update({where:{id:styleProcess.id},data:{processComposition:{locations:[{code:'FRONT',label:'Bad',...entry}]}}}));
    }
    assert.equal(await db.styleProcessComponent.count(),4);
  });
  await check('master code/name changes retain FK identity; used delete and type change are blocked',async()=>{
    await db.processMasterOption.update({where:{id:master.id},data:{code:'RENAMED',label:'New front'}});
    assert.equal((await db.styleProcessComponent.findFirst({where:{styleProcessId:styleProcess.id,type:'LOCATION'}})).masterOptionId,master.id);
    await assert.rejects(()=>db.processMasterOption.delete({where:{id:master.id}}));
    await assert.rejects(()=>db.processMasterOption.update({where:{id:master.id},data:{type:'ACTION'}}));
  });
  await check('deletion and concurrent component save cannot leave an orphan',async()=>{
    const candidate=await db.processMasterOption.create({data:{type:'LOCATION',code:'RACE',label:'Race'}});
    const otherProcess=await db.styleProcess.create({data:{orgId:seller.id,styleId:style.id,processCode:'RACE',processName:'Race'}});
    const results=await Promise.allSettled([
      db.processMasterOption.delete({where:{id:candidate.id}}),
      db.styleProcess.update({where:{id:otherProcess.id},data:{processComposition:{locations:[{masterOptionId:candidate.id,code:'RACE',label:'Race'}]}}}),
    ]);
    assert.ok(results.some(r=>r.status==='rejected'));
    const orphans=await db.$queryRawUnsafe(`SELECT count(*)::INT n FROM "StyleProcessComponent" c LEFT JOIN "ProcessMasterOption" m ON m.id=c."masterOptionId" WHERE m.id IS NULL`);
    assert.equal(orphans[0].n,0);
  });
  await check('ambiguous and missing legacy categories abort migration atomically',async()=>{
    execute('DROP TRIGGER style_identity_category ON "Style";');
    const duplicate=await db.attrCategory.create({data:{orgId:seller.id,code:'DUP',name:'New name'}});
    const bad=await db.style.create({data:{orgId:seller.id,customerOrgId:buyer.id,code:'BAD',name:'Bad',collection:'New name'}});
    assert.throws(()=>migrate());assert.equal((await db.style.findUnique({where:{id:bad.id}})).categoryId,null);
    await db.attrCategory.delete({where:{id:duplicate.id}});
    await db.style.update({where:{id:bad.id},data:{collection:'Unknown'}});assert.throws(()=>migrate());
    await db.style.delete({where:{id:bad.id}});migrate();
  });
  await check('legacy PART/SPEC kinds and custom free spec migrate without rewriting original display/topology',async()=>{
    execute('DROP TRIGGER style_identity_components ON "StyleProcess";');
    const part=await db.processMasterOption.create({data:{type:'PART',code:'LEGACY_PART',label:'Old part'}});
    const spec=await db.processMasterOption.create({data:{type:'SPEC',code:'LEGACY_SPEC',label:'Old spec'}});
    const json={part:{code:part.code,label:'Preserved part'},parts:[{code:part.code,label:'Preserved part'}],specs:[{code:spec.code,label:'Preserved spec'}],actions:[{code:action.code,label:'Preserved action'}],targets:[]};
    const historical=await db.styleProcess.create({data:{orgId:seller.id,styleId:style.id,sourceOrgId:buyer.id,isActive:false,processCode:'LEGACY',processName:'Unchanged',processComposition:json}});
    const custom=await db.styleProcess.create({data:{orgId:seller.id,styleId:style.id,processCode:'CUSTOM',processName:'Custom',processComposition:{targetPairs:[{target:{code:target.code,label:target.label},targetSpec:{label:'Free size 123',isCustom:true}}]}}});
    migrate();
    const legacyRefs=await db.styleProcessComponent.findMany({where:{styleProcessId:historical.id}});
    assert.equal(legacyRefs.filter(r=>r.masterOptionId===part.id).length,2);
    assert.ok(legacyRefs.some(r=>r.type==='SPEC'&&r.masterOptionId===spec.id));
    const currentCopy=await db.processMasterOption.findUnique({where:{type_code:{type:'LOCATION',code:part.code}}});
    assert.ok(currentCopy);assert.notEqual(currentCopy.id,part.id);
    assert.equal((await db.processMasterOption.findUnique({where:{id:part.id}})).type,'PART');
    await db.processMasterOption.delete({where:{id:currentCopy.id}});
    migrate();
    assert.equal(await db.processMasterOption.findUnique({where:{id:currentCopy.id}}),null);
    const archive=await db.$queryRawUnsafe(`SELECT original FROM "StyleIdentityArchive" WHERE entity='StyleProcess' AND "entityId"=${historical.id}`);
    assert.deepEqual(archive[0].original.processComposition,json);
    const saved=await db.styleProcess.findUnique({where:{id:historical.id}});assert.equal(saved.processName,'Unchanged');assert.equal(saved.isActive,false);
    const free=await db.styleProcessComponent.findFirst({where:{styleProcessId:custom.id,type:'TARGET_SPEC'},include:{masterOption:true}});
    assert.equal(free.masterOption.label,'Free size 123');
  });
  await check('explicit migration tool rehearses rollback and preserves nonempty confirmed versions and ST',async()=>{
    const version=await db.styleProcessVersion.create({data:{orgId:seller.id,styleId:style.id,versionNumber:1,confirmedDate:'2026-10-01',processSnapshot:{original:true,processes:[{id:styleProcess.id,ct:31,st:29}]}}});
    const bucket=await db.quantityBucketSet.create({data:{orgId:seller.id,name:'ST'}});
    const bucketVersion=await db.quantityBucketSetVersion.create({data:{orgId:seller.id,quantityBucketSetId:bucket.id,versionNumber:1}});
    const entry=await db.quantityBucketEntry.create({data:{orgId:seller.id,quantityBucketSetVersionId:bucketVersion.id,bucketQuantity:1}});
    const st=await db.styleProcessStandard.create({data:{orgId:seller.id,styleProcessId:styleProcess.id,quantityBucketEntryId:entry.id,quantityBucketSetVersionId:bucketVersion.id,bucketStSeconds:29}});
    const run=args=>execFileSync(process.execPath,['scripts/migrate-style-identity.js',...args],{cwd:backend,env,stdio:'pipe'}).toString();
    assert.match(run([]),/"rolledBack":true/);assert.match(run(['--apply']),/"snapshotsPreserved":true/);
    assert.deepEqual(await db.styleProcessVersion.findUnique({where:{id:version.id}}),version);
    assert.deepEqual(await db.styleProcessStandard.findUnique({where:{id:st.id}}),st);
  });
  await check('unresolved noncustom legacy code aborts JSON backfill and its archive together',async()=>{
    execute('DROP TRIGGER style_identity_components ON "StyleProcess";');
    const original={locations:[{code:'DOES_NOT_EXIST',label:'Unknown',isCustom:false}]};
    const bad=await db.styleProcess.create({data:{orgId:seller.id,styleId:style.id,processCode:'MISSING',processName:'Missing',processComposition:original}});
    assert.throws(()=>migrate());
    assert.deepEqual((await db.styleProcess.findUnique({where:{id:bad.id}})).processComposition,original);
    assert.equal((await db.$queryRawUnsafe(`SELECT count(*)::INT n FROM "StyleIdentityArchive" WHERE entity='StyleProcess' AND "entityId"=${bad.id}`))[0].n,0);
    await db.styleProcess.delete({where:{id:bad.id}});migrate();
  });
  await check('actual direct-input resolver creates a master and stores its ID with the process in one transaction',async()=>{
    const names=['findMatchingProcessMasterOptionRow','findProcessMasterOptionByTypeAndCodeWithDb','insertProcessMasterOptionsWithDb','generateUniqueProcessMasterCode','appendProcessMasterResolverRow','resolveOrCreateProcessMasterOptionFromStyleEntry','toCanonicalStyleProcessCompositionEntry'];
    const functions=load(names,{Prisma,normalizeProcessMasterCode:v=>String(v||'').trim().toUpperCase().replace(/\s+/g,'_'),normalizeProcessMasterLabel:v=>String(v||'').trim(),normalizeProcessMasterType:v=>v,toPositiveIntOrNull:v=>Number.isInteger(Number(v))&&Number(v)>0?Number(v):null,
      createHttpError:(status,message)=>Object.assign(new Error(message),{status}),getCurrentRequestActor:()=> 'fk-test',PROCESS_MASTER_FALLBACK_CODE_BY_TYPE:{LOCATION:'LOCATION'}});
    const newState=()=>({rowsByType:new Map([['LOCATION',[]]]),usedCodesByType:new Map([['LOCATION',new Set()]]),nextSortOrderByType:new Map([['LOCATION',0]])});
    let componentId;
    const saved=await db.$transaction(async tx=>{
      const row=await functions.resolveOrCreateProcessMasterOptionFromStyleEntry({db:tx,state:newState(),type:'LOCATION',entry:{label:'Direct location',isCustom:true}});
      componentId=row.id;
      const entry=functions.toCanonicalStyleProcessCompositionEntry(row);
      assert.equal(entry.masterOptionId,row.id);
      return tx.styleProcess.create({data:{orgId:seller.id,styleId:style.id,processCode:'DIRECT',processName:'Direct',processComposition:{locations:[entry]}}});
    });
    assert.equal((await db.styleProcessComponent.findFirst({where:{styleProcessId:saved.id}})).masterOptionId,componentId);
    await assert.rejects(()=>db.$transaction(async tx=>{
      await functions.resolveOrCreateProcessMasterOptionFromStyleEntry({db:tx,state:newState(),type:'LOCATION',entry:{label:'Rollback direct location',isCustom:true}});
      await tx.styleProcess.create({data:{orgId:seller.id,styleId:style.id,processCode:'INVALID_DIRECT',processName:'Invalid',processComposition:{locations:[{masterOptionId:2147483000}]}}});
    }));
    assert.equal(await db.processMasterOption.count({where:{label:'Rollback direct location'}}),0);
  });
  await check('actual master save and relation validation roll back together on invalid references',async()=>{
    const keys=['LOCATION','TARGET','TARGET_SPEC','ACTION','ACTION_SPEC'];
    const names=['listProcessMasterOptionsWithDb','listProcessMasterOptions','findProcessMasterDeletionUsageConflicts','deleteProcessMasterOptionsByIds','insertProcessMasterOptions','updateProcessMasterOptionRow','syncProcessMasterOptions','listProcessMasterOptionRelations','deleteProcessMasterOptionRelationsByIds','insertProcessMasterOptionRelationsWithDb','syncProcessMasterRelations'];
    const functions=load(names,{Prisma,PROCESS_MASTER_TYPE_KEYS:keys,flattenProcessMasterPayloadItems:p=>p.items,
      normalizeProcessMasterType:v=>v,normalizeProcessMasterCode:v=>String(v||'').trim().toUpperCase(),normalizeProcessMasterRelationType:v=>v,
      getCurrentRequestActor:()=> 'fk-test',toPositiveIntOrNull:v=>Number.isInteger(Number(v))&&Number(v)>0?Number(v):null,
      createHttpError:(status,message)=>Object.assign(new Error(message),{status}),
      parseProcessMasterRelationPayload:()=>({hasProvidedKeys:true,providedTypes:['TARGET_TARGET_SPEC'],entriesByType:new Map([['TARGET_TARGET_SPEC',[{parentCode:'MISSING',childCode:'MISSING'}]]])}),
      PROCESS_MASTER_RELATION_META:{TARGET_TARGET_SPEC:{parentType:'TARGET',childType:'TARGET_SPEC'}}});
    const before=await db.processMasterOption.findMany({orderBy:{id:'asc'}});
    const items=before.filter(row=>keys.includes(row.type)).map(row=>({...row,label:row.id===master.id?'Atomic rename':row.label}));
    await assert.rejects(()=>db.$transaction(async tx=>{
      const rows=await functions.syncProcessMasterOptions({items},tx);
      await functions.syncProcessMasterRelations({payload:{},processMasterRows:rows,db:tx});
    }),/invalid process master relation/);
    assert.deepEqual(await db.processMasterOption.findMany({orderBy:{id:'asc'}}),before);
  });
  console.log(`${checks} actual PostgreSQL identity scenarios passed`);
} finally {
  await db.$disconnect();
  await admin.$executeRawUnsafe(`DROP DATABASE IF EXISTS "${name}" WITH (FORCE)`);await admin.$disconnect();
}
