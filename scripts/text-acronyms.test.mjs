import test from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {randomUUID} from 'node:crypto';
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
 await routes.get('GET /text-acronyms')({},res);assert.deepEqual(res.value,{revision:1,entries:[]});assert.equal(reads,1);
 authorized=true;await routes.get('GET /system/text-acronyms')({},res);assert.equal(reads,2);
});
