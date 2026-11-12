import test from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {createRequire} from 'node:module';
import {changeApprovalFixture,seedChangeApproval} from './helpers/change-approval-fixture.mjs';
const require=createRequire(import.meta.url);
const {saveWorkTimePolicy:policy,submitWorkTimeRequest:submit,decideWorkTimeRequest:decide,readWorkTimeRequest:read,approvedWorkTime,workTimeAnnualBalance,registerWorkTimeRoutes}=require('../backend/dist/services/workTimeRequests');
const {resolveSalaryAttendanceParameters:attendance}=require('../backend/dist/employees/salaryAttendanceParameters');
const {loadPayrollLeaves,grantEmployeeLeave}=require('../backend/dist/employees/employeeLeave');
const {saveApprovalActionBatch}=require('../backend/dist/services/approvalActions');

test('central approval settings use the existing work-time policy and roll back mixed changes atomically',async()=>{
 const f=await fixture();try{
  const {db,p,org}=f,original=await db.systemSetting.findUnique({where:{key:`WORK_TIME_POLICY:${org}`}});
  const settings={...original.value,approverIds:[p.lead.id]},work={menu:'WORK_TIME',operation:'CREATE',settings};
  await assert.rejects(saveApprovalActionBatch(db,org,p.admin.id,[work,{menu:'BANK_LEDGER',operation:'CREATE',settings:{revision:999}}]),/APPROVAL_SETTINGS_CHANGED/);
  assert.deepEqual(await db.systemSetting.findUnique({where:{key:`WORK_TIME_POLICY:${org}`}}),original);
  assert.equal(await db.systemSetting.findUnique({where:{key:`WORK_TIME_POLICY:${org}:REV:2`}}),null,'history write rolls back with invalid financial policy');
  await assert.rejects(saveApprovalActionBatch(db,org,p.junior.id,[work]),/ACTIVE_EMPLOYEE_REQUIRED/);
  const existing=await submit(db,org,f.worker.id,f.request());
  const [saved]=await saveApprovalActionBatch(db,org,p.admin.id,[work]);assert.equal(saved.settings.revision,2);
  assert.deepEqual((await read(db,org,p.admin.id,existing.id)).policy.approverIds,original.value.approverIds,'existing request retains its original chain');
  const newer=await submit(db,org,f.worker.id,f.request({policyRevision:2,startDate:'2026-10-06',endDate:'2026-10-06'}));
  assert.deepEqual(newer.steps.map(step=>step.employeeId),[p.lead.id]);
 }finally{await f.close();}
});
test('a short normal workday preserves historical thresholds without using them as a payroll cutoff',()=>{
 const {validateEmployeePayTypePolicy,normalizeEmployeePayTypePolicy}=require('../backend/dist/employees/employeePayTypePolicy');
 const policy={payType:'GENERAL',workWeekdays:[1,2,3,4,5],standardClockIn:'08:00',standardClockOut:'11:00',breakMinutes:0,workdayMinimumMinutes:240};
 assert.equal(validateEmployeePayTypePolicy(policy),true);
 assert.equal(validateEmployeePayTypePolicy({...policy,breakMinutes:180}),false);
 const paid=attendance({month:'2026-10',payType:'GENERAL',policy:normalizeEmployeePayTypePolicy(policy),holidayDateKeys:[],attendanceEntries:[{workDate:'2026-10-05',workedSeconds:2*3600}]});
 assert.equal(paid.ACTUAL_WORKDAYS,1);
});
async function fixture(){
 const f=await changeApprovalFixture({registration:true});const db=f.db,s=await seedChangeApproval(db),org=s.company.id,p=s.people;
 const worker=await db.employee.create({data:{orgId:org,name:'Worker',employeeNo:'W1',gradeId:p.junior.gradeId,orgRole:'WORKER',status:'ACTIVE',payType:'GENERAL',joinedAt:new Date('2020-01-01')}});
 const alien=p.admin;
 const otherOrg=s.other.id;
 await db.systemSetting.upsert({where:{key:'ROLE_ACCESS_POLICY'},create:{key:'ROLE_ACCESS_POLICY',value:{SERVICE:Object.fromEntries(['ADMIN','ACCOUNTANT','WORKER','OPERATOR'].map(r=>[r,['WORK_TIME','HOLIDAY','PAYROLL']]))}},update:{}});
 await policy(db,org,p.admin.id,{revision:0,drafterRoles:['ADMIN','ACCOUNTANT','WORKER','OPERATOR'],proxyRoles:['ADMIN','ACCOUNTANT','OPERATOR'],approverIds:[p.senior.id,p.lead.id]});
 const request=(overrides={})=>({policyRevision:1,employeeId:worker.id,kind:'OVERTIME',startDate:'2026-10-05',endDate:'2026-10-05',startTime:'17:00',endTime:'19:00',reason:'Actual approved work',clientKey:randomUUID(),...overrides});
 return {...f,db,s,p,org,worker,alien,otherOrg,request};
}
test('ordered approval gates payroll time, supports retrospective requests, immutable decisions and approved cancellation',async()=>{
 const f=await fixture();try{
  const {db,p,org,worker,request}=f;
  const initialCount=await db.workTimeRequest.count();
  await assert.rejects(db.$transaction(async tx=>{
   await tx.$queryRawUnsafe("SELECT set_config('baro.work_time_actor',$1,true)",String(worker.id));
   await tx.workTimeRequest.create({data:{orgId:org,employeeId:worker.id,drafterId:worker.id,kind:'ANNUAL',startDate:'2026-10-05',endDate:'2026-10-05',reason:'Incomplete source',policy:{},clientKey:randomUUID(),requestHash:'test'}});
  }),/WORK_TIME_INCOMPLETE_APPROVAL/);
  assert.equal(await db.workTimeRequest.count(),initialCount,'deferred validation rolls back the entire request');
  const input=request();let row=await submit(db,org,worker.id,input);assert.equal((await submit(db,org,worker.id,input)).id,row.id);
  assert.equal((await approvedWorkTime(db,org,'2026-10')).length,0);
  await assert.rejects(decide(db,org,p.lead.id,row.id,{revision:0,decision:'APPROVED',approvedMinutes:120}),/WORK_TIME_ACCESS_DENIED/);
  row=await decide(db,org,p.senior.id,row.id,{revision:0,decision:'APPROVED'});assert.equal(row.status,'PENDING');assert.equal(row.decisions.length,1);
  await decide(db,org,p.senior.id,row.id,{revision:0,decision:'APPROVED'});assert.equal(await db.workTimeDecision.count({where:{requestId:row.id}}),1);
  assert.equal((await approvedWorkTime(db,org,'2026-10')).length,0,'partial approval does not create payroll hours');
  await assert.rejects(decide(db,org,p.lead.id,row.id,{revision:1,decision:'APPROVED',approvedMinutes:121}),/WORK_TIME_INVALID_MINUTES/);
  row=await decide(db,org,p.lead.id,row.id,{revision:1,decision:'APPROVED',approvedMinutes:90});assert.equal(row.status,'APPROVED');
  assert.equal((await approvedWorkTime(db,org,'2026-10'))[0].approvedMinutes,90);
  await decide(db,org,p.lead.id,row.id,{revision:1,decision:'APPROVED',approvedMinutes:90});
  await assert.rejects(decide(db,org,p.lead.id,row.id,{revision:1,decision:'APPROVED',approvedMinutes:80}),/WORK_TIME_SOURCE_CHANGED/);
  await assert.rejects(db.workTimeRequest.update({where:{id:row.id},data:{reason:'rewrite'}}),/WORK_TIME_(HISTORY_IMMUTABLE|ACCESS_DENIED)/);
  await assert.rejects(db.workTimeDecision.deleteMany({where:{requestId:row.id}}),/WORK_TIME_HISTORY_IMMUTABLE/);
  const cancel=await submit(db,org,worker.id,request({cancelsRequestId:row.id,reason:'Wrong actual work'}));
  assert.equal((await approvedWorkTime(db,org,'2026-10')).length,1,'cancellation requires final approval');
  await decide(db,org,p.senior.id,cancel.id,{revision:0,decision:'APPROVED'});
  await decide(db,org,p.lead.id,cancel.id,{revision:1,decision:'APPROVED'});
  assert.equal((await read(db,org,worker.id,row.id)).status,'CANCELLED');assert.equal((await approvedWorkTime(db,org,'2026-10')).length,0);
  assert.equal(await db.workTimeDay.count({where:{requestId:row.id}}),1,'original approved evidence is retained');
 }finally{await f.close();}
});
test('half-day annual leave, pending reservations, balance at final approval and day based normal pay',async()=>{
 const f=await fixture();try{
  const {db,p,org,worker,request}=f;
  await grantEmployeeLeave(db,org,worker.id,p.admin.id,{year:2026,days:1,reason:'Annual allowance',clientKey:randomUUID()});
  const leave=kind=>request({kind,startTime:null,endTime:null});
  let am=await submit(db,org,worker.id,leave('ANNUAL_AM'));
  await assert.rejects(submit(db,org,worker.id,leave('ANNUAL_AM')),/WORK_TIME_OVERLAP/);
  assert.equal(await workTimeAnnualBalance(db,org,worker.id,'2026'),1);
  await decide(db,org,p.senior.id,am.id,{revision:0,decision:'APPROVED'});
  await decide(db,org,p.lead.id,am.id,{revision:1,decision:'APPROVED'});
  assert.equal(await workTimeAnnualBalance(db,org,worker.id,'2026'),0.5);
  const leaves=await loadPayrollLeaves(db,org,'2026-10');assert.equal(leaves[0].portion,0.5);
  const one=attendance({month:'2026-10',payType:'GENERAL',holidayDateKeys:[],attendanceEntries:[{workDate:'2026-10-05',workedSeconds:3*3600}],leaveEntries:leaves});
  assert.equal(one.ACTUAL_WORKDAYS,0.5);assert.equal(one.ANNUAL_LEAVE_WORKDAYS,0.5);assert.equal(one.PAYABLE_WORKDAYS,1);assert.equal(one.LEAVE_CONFLICT_DAYS,0);
  const pm=await submit(db,org,worker.id,leave('ANNUAL_PM'));await decide(db,org,p.senior.id,pm.id,{revision:0,decision:'APPROVED'});await decide(db,org,p.lead.id,pm.id,{revision:1,decision:'APPROVED'});
  assert.equal(await workTimeAnnualBalance(db,org,worker.id,'2026'),0);
  const next=await submit(db,org,worker.id,request({kind:'ANNUAL',startDate:'2026-10-06',endDate:'2026-10-06'}));await decide(db,org,p.senior.id,next.id,{revision:0,decision:'APPROVED'});
  await assert.rejects(decide(db,org,p.lead.id,next.id,{revision:1,decision:'APPROVED'}),/WORK_TIME_LEAVE_BALANCE/);assert.equal((await read(db,org,worker.id,next.id)).decisions.length,1);
  for(const seconds of [5*60,7.5*3600,9.5*3600])assert.equal(attendance({month:'2026-10',payType:'GENERAL',holidayDateKeys:[],attendanceEntries:[{workDate:'2026-10-05',workedSeconds:seconds}]}).ACTUAL_WORKDAYS,1);
  const holiday={month:'2026-10',payType:'GENERAL',holidayDateKeys:[],attendanceEntries:[{workDate:'2026-10-04',workedSeconds:12*3600}]};assert.equal(attendance(holiday).HOLIDAY_WORKDAYS,0);assert.equal(attendance({...holiday,approvedWork:[{workDate:'2026-10-04',kind:'SPECIAL',approvedMinutes:60}]}).HOLIDAY_WORKDAYS,1);
 }finally{await f.close();}
});
test('company feature, subject privacy, self approval, calendar checks, rejection and frozen payroll',async()=>{
 const f=await fixture();try{
  const {db,s,p,org,worker,alien,request}=f;
  await assert.rejects(submit(db,f.otherOrg,alien.id,request()),/WORK_TIME_ACCESS_DENIED/);
  await assert.rejects(submit(db,org,p.senior.id,request({employeeId:p.senior.id})),/WORK_TIME_SELF_APPROVAL/);
  await assert.rejects(submit(db,org,worker.id,request({employeeId:p.junior.id})),/WORK_TIME_ACCESS_DENIED/);
  await assert.rejects(submit(db,org,worker.id,request({startTime:'22:00',endTime:'02:00'})),/WORK_TIME_SPLIT_DAY/);
  await assert.rejects(submit(db,org,worker.id,request({startTime:'16:00'})),/WORK_TIME_OVERLAPS_SHIFT/);
  await assert.rejects(submit(db,org,worker.id,request({startDate:'2026-10-04',endDate:'2026-10-04'})),/WORK_TIME_WRONG_DAY/);
  await assert.rejects(policy(db,org,p.admin.id,{revision:0,drafterRoles:['WORKER'],proxyRoles:[],approverIds:[p.lead.id]}),/WORK_TIME_POLICY_CHANGED/);
  assert.equal(await db.systemSetting.count({where:{key:{startsWith:'WORK_TIME_POLICY:'+org+':REV:'}}}),1);
  await assert.rejects(db.systemSetting.update({where:{key:'WORK_TIME_POLICY:'+org+':REV:1'},data:{value:{}}}),/WORK_TIME_HISTORY_IMMUTABLE/);
  const factory=await db.factory.create({data:{orgId:org,name:'Payroll factory'}}),data=[{workerId:worker.id,netSalary:100,currencyCode:'USD'}];
  const snapshot=await db.payrollSnapshot.create({data:{orgId:org,factoryId:factory.id,month:'2026-10',data,isProvisional:true,lockedAt:new Date(),lockedBy:'test'}});
  // Lock as an old frozen salary to verify approval never rewrites its contents.
  await db.transactionCodeBase.update({where:{id:s.code.baseId},data:{code:'SAL'}});
  await db.$transaction(async tx=>{const locked=await tx.payrollSnapshot.update({where:{id:snapshot.id},data:{isProvisional:false,updatedByEmployeeId:p.admin.id,revision:{increment:1}}});await require('../backend/dist/services/payrollPayables').ensurePayrollPayables(tx,locked,p.admin.id);});
  const row=await submit(db,org,worker.id,request());assert.equal(row.payrollLocked,true);
  await assert.rejects(read(db,org,p.junior.id,row.id),/WORK_TIME_NOT_FOUND/);
  await decide(db,org,p.senior.id,row.id,{revision:0,decision:'REJECTED',reason:'Not worked'});
  assert.deepEqual((await db.payrollSnapshot.findUnique({where:{id:snapshot.id}})).data,data);
  assert.equal((await approvedWorkTime(db,org,'2026-10')).length,0);
  const withdrawn=await submit(db,org,worker.id,request());await decide(db,org,worker.id,withdrawn.id,{revision:0,decision:'WITHDRAWN'});
  assert.equal((await read(db,org,worker.id,withdrawn.id)).status,'WITHDRAWN');
  await db.employee.update({where:{id:worker.id},data:{status:'SUSPENDED'}});
  await assert.rejects(read(db,org,worker.id,row.id),/WORK_TIME_ACCESS_DENIED/);
 }finally{await f.close();}
});
