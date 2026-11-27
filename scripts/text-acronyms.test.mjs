import test from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {randomUUID,createHash} from 'node:crypto';
import {readFileSync} from 'node:fs';
import {changeApprovalFixture} from './helpers/change-approval-fixture.mjs';
const require=createRequire(import.meta.url);
const {readTextAcronyms,saveTextAcronyms,validateTextAcronyms,registerTextAcronymRoutes}=require('../backend/dist/services/textAcronyms');
const {createHumanTextCaseInput}=require('../backend/dist/middleware/humanTextCase');
const {defaultTextAcronyms}=require('../backend/dist/utils/textAcronyms');
const {setTextAcronyms,titleCaseWords}=require('../backend/dist/utils/humanTextCase');

test('dictionary revisions, exact mixed spelling, empty expansions, audit, retry and rollback use Railway-compatible transactions',async()=>{
 const f=await changeApprovalFixture(),db=f.db;
 try{
  const initial=await readTextAcronyms(db);assert.equal(initial.revision,0);assert.ok(initial.entries.find(row=>row.acronym==='CT'&&row.expansion==='Contract Time'));assert.equal(await db.systemSetting.count(),0);
  const input={revision:0,clientKey:randomUUID(),entries:[{acronym:'iOS',expansion:'',meaning:''},{acronym:'BOM',expansion:'Bill Of Materials',meaning:'자재 명세서'}]};
  const saved=await saveTextAcronyms(db,input,'system@test');assert.equal(saved.revision,1);assert.equal((await readTextAcronyms(db)).entries.find(row=>row.acronym==='iOS').expansion,'');
  const legacyHash=createHash('sha256').update(JSON.stringify(validateTextAcronyms(input).map(({acronym,expansion,meaning})=>({acronym,expansion,meaning})))).digest('hex');
  const oldReceipt=await db.systemSetting.findUnique({where:{key:'TEXT_ACRONYMS_AUDIT:'+input.clientKey}});
  await db.systemSetting.update({where:{key:oldReceipt.key},data:{value:{...oldReceipt.value,hash:legacyHash}}});
  assert.deepEqual(await saveTextAcronyms(db,input,'system@test'),saved);assert.equal(await db.systemSetting.count(),2);
  await assert.rejects(saveTextAcronyms(db,{...input,clientKey:randomUUID()},'system@test'),/TEXT_ACRONYMS_CHANGED/);
  await assert.rejects(saveTextAcronyms(db,{...input,entries:[]},'system@test'),/TEXT_ACRONYMS_RETRY_MISMATCH/);
  await assert.rejects(saveTextAcronyms(db,input,'other@test'),/TEXT_ACRONYMS_RETRY_MISMATCH/);
  for(const entries of [[{acronym:'Bom',expansion:'',meaning:''}],[{acronym:'BOM',expansion:'',meaning:''},{acronym:'BoM',expansion:'',meaning:''}],[{acronym:'<BOM>',expansion:'',meaning:''}],[{acronym:'BOM',expansion:'x'.repeat(501),meaning:''}]])assert.throws(()=>validateTextAcronyms({...input,entries}),/INVALID_TEXT_ACRONYMS/);
  const req={method:'POST',path:'/expense-requests',body:{remark:'iOS IOS ios BOM bom COTTON'},is:()=>true};let called=0;
  await createHumanTextCaseInput(db)(req,{},error=>{assert.equal(error,undefined);called++;});assert.equal(called,1);assert.equal(req.body.remark,'iOS iOS Ios BOM Bom Cotton');
  const receipt=await db.systemSetting.findUnique({where:{key:'TEXT_ACRONYMS_AUDIT:'+input.clientKey}});assert.equal(receipt.value.actor,'system@test');assert.equal(receipt.value.before.revision,0);assert.equal(receipt.value.after.revision,1);
  await f.pg.exec(`CREATE FUNCTION reject_acronym_audit() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN IF NEW.key LIKE 'TEXT_ACRONYMS_AUDIT:%' THEN RAISE EXCEPTION 'FORCED_AUDIT_FAILURE'; END IF; RETURN NEW; END $$; CREATE TRIGGER test_acronym_audit BEFORE INSERT ON "SystemSetting" FOR EACH ROW EXECUTE FUNCTION reject_acronym_audit();`);
  await assert.rejects(saveTextAcronyms(db,{revision:1,clientKey:randomUUID(),entries:[]},'system@test'),/FORCED_AUDIT_FAILURE/);assert.deepEqual(await readTextAcronyms(db),saved);assert.equal(await db.systemSetting.count(),2);
  assert.equal(titleCaseWords('BOM iOS'),'BOM iOS');
 }finally{setTextAcronyms(defaultTextAcronyms);await f.close();}
});

test('only SYSTEM_ADMIN may manage dictionary; public spelling response exposes no audit or actor data',async()=>{
 const routes=new Map(),app={get:(path,handler)=>routes.set('GET '+path,handler),put:(path,handler)=>routes.set('PUT '+path,handler)};
 let authorized=false,reads=0,saves=0;
 const db={systemSetting:{findUnique:async()=>{reads++;return {value:{revision:1,entries:[],actor:'private@test'}};}}};
 registerTextAcronymRoutes(app,db,{requireSystemAdmin:async()=>authorized?{requesterEmail:'system@test'}:null});
 const res={set(){return this;},json(value){saves++;this.value=value;}};
 await routes.get('PUT /system/text-acronyms')({body:{}},res);await routes.get('GET /system/text-acronyms')({},res);assert.equal(reads,0);assert.equal(saves,0);
 await routes.get('GET /text-acronyms')({},res);assert.deepEqual(res.value,{revision:1,meaningLanguagesVersion:1,entries:[]});assert.equal(reads,1);
 authorized=true;await routes.get('GET /system/text-acronyms')({},res);assert.equal(reads,2);
});

test('existing meanings gain three languages once while custom entries, originals and revisions remain protected',async()=>{
 const f=await changeApprovalFixture(),db=f.db;
 try{
  const original={revision:7,entries:[{acronym:'CI',expansion:'Commercial Invoice',meaning:'상업 송장'},{acronym:'API',expansion:'Application Programming Interface',meaning:''},{acronym:'PL',expansion:'Local Expansion',meaning:'직접 작성한 의미'},{acronym:'ZZ',expansion:'',meaning:'사용자 의미'}]};
  await db.systemSetting.create({data:{key:'TEXT_ACRONYMS:1',value:original}});
  const sql=readFileSync('backend/prisma/migrations/20261127030000_text_acronym_meanings/migration.sql','utf8');await f.pg.exec(sql);await f.pg.exec(sql);
  const read=await readTextAcronyms(db);assert.equal(read.revision,8);assert.equal(read.entries[0].meaningVi,'Hóa Đơn Thương Mại');assert.equal(read.entries[1].meaningKo,'응용 프로그램 인터페이스');
  assert.equal(read.entries[2].meaningKo,'직접 작성한 의미');assert.equal(read.entries[2].meaningEn,'');assert.equal(read.entries[2].expansion,'Local Expansion');assert.equal(read.entries[3].meaningKo,'사용자 의미');
  const receipt=await db.systemSetting.findUnique({where:{key:'TEXT_ACRONYMS_AUDIT:meanings-v1'}});assert.deepEqual(receipt.value.before,original);assert.equal(await db.systemSetting.count(),2);
  const input={revision:8,clientKey:randomUUID(),entries:read.entries.map(row=>({...row,meaningKo:row.meaningKo,meaningEn:row.acronym==='CI'?'Custom English':row.meaningEn,meaningVi:row.acronym==='CI'?'':row.meaningVi}))};
  const saved=await saveTextAcronyms(db,input,'system@test');assert.equal(saved.entries.find(row=>row.acronym==='CI').meaningEn,'Custom English');assert.equal(saved.entries.find(row=>row.acronym==='CI').meaningVi,'');
  const legacy={revision:saved.revision,clientKey:randomUUID(),entries:saved.entries.map(({acronym,expansion,meaning})=>({acronym,expansion,meaning}))};
  const oldClient=await saveTextAcronyms(db,legacy,'system@test');assert.equal(oldClient.entries.find(row=>row.acronym==='CI').meaningEn,'Custom English');assert.equal(oldClient.entries.find(row=>row.acronym==='CI').meaningVi,'');
  assert.throws(()=>validateTextAcronyms({...input,entries:[{acronym:'CI',expansion:'',meaningKo:'',meaningEn:'x'.repeat(501),meaningVi:''}]}),/INVALID_TEXT_ACRONYMS/);
 }finally{setTextAcronyms(defaultTextAcronyms);await f.close();}
});
