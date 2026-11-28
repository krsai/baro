import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import feedback from '../backend/dist/services/employeeFeedback.js';
import {feedbackDeliveryFixture} from './helpers/feedback-delivery-fixture.mjs';
import {resolvePageNaming} from '../frontend/src/utils/pageNaming.mjs';
const {feedbackRuleInput,previewEmployeeFeedback,saveEmployeeFeedback,listEmployeeFeedback,registerEmployeeFeedbackRoutes}=feedback;
const definition={name:'Daily Work Logs',kind:'WARNING',task:'WORK_LOG_ENTRY',timeZone:'Asia/Ho_Chi_Minh',effectiveFrom:'2026-11-01',dueAfterDays:1,deadlineTime:'09:00',threshold:2,weekdays:[0,1,2,3,4,5,6],message:'Please Review The Entry Deadline.',automaticDelivery:false};
const sample={workDate:'2026-11-26',submittedAt:null,evidenceState:'VERIFIED',matchingCount:2};
const now=new Date('2026-11-28T00:00:00Z');
const rule=(overrides={})=>({version:0,employeeId:2,factoryId:1,definition,...overrides});
const draft=(overrides={})=>({version:0,employeeId:2,ruleId:null,state:'DRAFT',content:{kind:'WARNING',subject:'Review Entry Timing',message:'Please Check The Entry.',basis:'Reviewed By Administrator; No Delivery.'},...overrides});

test('menu, workspace tab and page heading share the dedicated feedback identity',()=>{
 for(const language of ['ko','en','vi']){
  const name=resolvePageNaming('/employee-system/feedback',language,key=>key);
  assert.equal(name.key,'employeeFeedback');assert.equal(name.mode,'page');assert.equal(name.title,'menu.employeeFeedback');
 }
});

test('verified warning and praise use explicit deadlines, time zones and occurrence thresholds',()=>{
 assert.equal(previewEmployeeFeedback(definition,sample,now).result,'CANDIDATE');
 assert.equal(previewEmployeeFeedback(definition,{...sample,matchingCount:1},now).result,'NO_MATCH');
 const timely={...sample,submittedAt:'2026-11-27T01:00:00Z'};
 assert.equal(previewEmployeeFeedback({...definition,kind:'PRAISE'},timely,now).result,'CANDIDATE');
 assert.equal(previewEmployeeFeedback(definition,timely,now).result,'NO_MATCH');
 assert.equal(previewEmployeeFeedback({...definition,timeZone:'Asia/Seoul'},timely,now).result,'CANDIDATE');
 assert.equal(previewEmployeeFeedback(definition,sample,new Date('2026-11-27T01:00:00Z')).result,'WAITING');
 assert.equal(previewEmployeeFeedback(definition,sample,now).delivery,false);
});
test('unknown evidence and outages are held; excluded days and historical periods are never judged',()=>{
 for(const evidenceState of ['UNKNOWN','SYSTEM_ERROR'])assert.equal(previewEmployeeFeedback(definition,{...sample,evidenceState},now).result,'HOLD');
 assert.equal(previewEmployeeFeedback(definition,{...sample,excludedDay:true},now).result,'NOT_APPLICABLE');
 assert.equal(previewEmployeeFeedback({...definition,effectiveFrom:'2026-11-27'},sample,now).result,'NOT_APPLICABLE');
 assert.equal(previewEmployeeFeedback({...definition,weekdays:[1]},sample,now).result,'NOT_APPLICABLE');
 assert.equal(feedbackRuleInput({...definition,automaticDelivery:true}).automaticDelivery,true);
 assert.throws(()=>feedbackRuleInput({...definition,task:'OTHER',automaticDelivery:true}),/UNSUPPORTED/);
 assert.throws(()=>feedbackRuleInput({...definition,effectiveFrom:'2026-02-30'}),/INVALID/);
 assert.throws(()=>previewEmployeeFeedback(definition,{...sample,submittedAt:'2026-12-01T00:00:00Z'},now),/INVALID/);
});

const fixture=feedbackDeliveryFixture;
test('stored rules and draft reviews are company scoped, versioned, idempotent and audited without delivery',async()=>{
 const f=await fixture();try{
 const saved=await saveEmployeeFeedback(f.db,1,1,'rules','rule-test-001',rule());
 assert.equal(saved.version,1);
 assert.equal((await saveEmployeeFeedback(f.db,1,1,'rules',saved.id,rule())).version,1);
 await assert.rejects(saveEmployeeFeedback(f.db,1,1,'rules',saved.id,rule({definition:{...definition,name:'Changed'}})),/CHANGED/);
 const updated=await saveEmployeeFeedback(f.db,1,1,'rules',saved.id,rule({version:1,definition:{...definition,name:'Changed'}}));assert.equal(updated.version,2);
 await assert.rejects(saveEmployeeFeedback(f.db,1,2,'rules','rule-worker-1',rule()),/ACCESS_DENIED/);
 await assert.rejects(saveEmployeeFeedback(f.db,1,4,'rules','rule-former-1',rule()),/ACCESS_DENIED/);
 await assert.rejects(saveEmployeeFeedback(f.db,1,1,'rules','rule-cross-1',rule({employeeId:3})),/EMPLOYEE_REQUIRED/);
 await assert.rejects(saveEmployeeFeedback(f.db,1,1,'rules','rule-cross-2',rule({factoryId:2})),/FACTORY_REQUIRED/);
 await assert.rejects(saveEmployeeFeedback(f.db,2,3,'rules',saved.id,rule({employeeId:3,factoryId:2})),/CHANGED/);
 const document=await saveEmployeeFeedback(f.db,1,1,'drafts','draft-test-001',draft({ruleId:saved.id}));
 await assert.rejects(saveEmployeeFeedback(f.db,1,1,'drafts',document.id,draft({version:1,ruleId:saved.id,state:'REVIEWED',content:{...document.content,message:'Changed In Review'}})),/SAVE_BEFORE_REVIEW/);
 const reviewed=await saveEmployeeFeedback(f.db,1,1,'drafts',document.id,draft({version:1,ruleId:saved.id,state:'REVIEWED'}));assert.equal(reviewed.state,'REVIEWED');
 await assert.rejects(saveEmployeeFeedback(f.db,1,1,'drafts',document.id,draft({version:2,ruleId:saved.id})),/FINAL_DOCUMENT/);
 await assert.rejects(saveEmployeeFeedback(f.db,1,1,'drafts','draft-send-001',draft({send:true})),/PREPARATION_ONLY/);
 const company=await listEmployeeFeedback(f.db,1,1),other=await listEmployeeFeedback(f.db,2,3);assert.equal(company.mode,'CONFIGURED_AUTOMATION');assert.equal(company.drafts.length,1);assert.equal(other.drafts.length,0);
 const count=(await f.pg.query('SELECT count(*)::int n FROM "EmployeeFeedbackEvent"')).rows[0].n;assert.equal(count,4);
 await assert.rejects(f.pg.exec('DELETE FROM "EmployeeFeedbackEvent"'),/HISTORY_IMMUTABLE/);
 await assert.rejects(f.pg.exec(`UPDATE "EmployeeFeedbackRule" SET definition='{"automaticDelivery":true}'`),/armed_check/);
 await assert.rejects(f.pg.exec(`UPDATE "EmployeeFeedbackRule" SET definition=definition-'automaticDelivery'`),/delivery_mode_check/);
 await assert.rejects(f.pg.exec(`UPDATE "EmployeeFeedbackDraft" SET content='{}' WHERE id='draft-test-001'`),/FINAL_DOCUMENT/);
 await f.pg.exec(readFileSync('backend/prisma/migrations/20261128030000_employee_feedback_preparation/migration.sql','utf8'));
 assert.equal((await listEmployeeFeedback(f.db,1,1)).drafts[0].content.message,document.content.message);
 }finally{await f.close();}
});
test('rule editing routes enforce active administrator role plus stored feature and industry gates',async()=>{
 const f=await fixture();try{
 const routes=[];const app={get:(path,fn)=>routes.push({method:'GET',path,fn}),put:(path,fn)=>routes.push({method:'PUT',path,fn}),post:(path,fn)=>routes.push({method:'POST',path,fn})};
 let allowed=true,industry=true,actorId=1;
 registerEmployeeFeedbackRoutes(app,f.db,{requireOrgRole:async(_req,_res,options)=>{assert.deepEqual(options.allowedRoles,['ADMIN']);assert.equal(options.allowSystemAdmin,false);return {organization:{id:1,type:'MANUFACTURER'}};},actorId:()=>actorId,canAccess:async()=>allowed,industryFeatures:async()=>industry?['EMPLOYEE_SYSTEM']:[]});
 assert.ok(routes.every(row=>!/send|deliver|enable/i.test(row.path)));
 const read=routes.find(row=>row.method==='GET').fn,res={setHeader:()=>{},json:()=>{}};
 allowed=false;await assert.rejects(read({},res),/ACCESS_DENIED/);allowed=true;industry=false;await assert.rejects(read({},res),/ACCESS_DENIED/);industry=true;actorId=4;await assert.rejects(read({},res),/ACCESS_DENIED/);
 }finally{await f.close();}
});
