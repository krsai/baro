import test from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {changeApprovalFixture,seedChangeApproval} from './helpers/change-approval-fixture.mjs';
const require=createRequire(import.meta.url);
const {resolveRecognizedTenure,recognizedTenureParameters,readTenureRecognition,saveTenureRecognition,registerTenureRecognitionRoutes}=require('../backend/dist/employees/tenureRecognition.js');
const {buildSalaryPreview}=require('../backend/dist/employees/salaryPreview.js');

test('actual service is independent of credits; application month and latest same-month revision govern recognition',()=>{
 const employee={joinedAt:'2023-11-20',tenureRecognitions:[{id:1,effectiveMonth:'2026-11',additionalYears:2},{id:2,effectiveMonth:'2027-01',additionalYears:4},{id:3,effectiveMonth:'2026-11',additionalYears:3}]};
 assert.deepEqual(resolveRecognizedTenure(employee,'2026-10'),{actualYears:2,additionalYears:0,recognizedYears:2,recognitionId:null});
 assert.deepEqual(resolveRecognizedTenure(employee,'2026-11'),{actualYears:3,additionalYears:3,recognizedYears:6,recognitionId:3});
 assert.equal(resolveRecognizedTenure(employee,'2027-11').recognizedYears,8);
 const params=recognizedTenureParameters(employee,'2026-11');assert.equal(params.TENURE_YEARS,6);assert.equal(params.ACTUAL_TENURE_YEARS,3);assert.equal(params.ADDITIONAL_TENURE_YEARS,3);
 assert.equal(employee.joinedAt,'2023-11-20');
 assert.equal(resolveRecognizedTenure({...employee,leftAt:'2026-11-19'},'2026-12').actualYears,2,'actual service stops before a post-termination anniversary');
 assert.equal(resolveRecognizedTenure({...employee,leftAt:'2026-11-20'},'2028-12').actualYears,3,'terminated employees do not accumulate additional actual years');
});
test('salary estimate uses recognized years but preserves actual prior-year eligibility',()=>{
 const employees=[{id:1,name:'Eligible',status:'ACTIVE',factoryId:1,gradeId:7,payType:'GENERAL',joinedAt:'2023-01-01',tenureRecognitions:[{id:9,effectiveMonth:'2026-06',additionalYears:2}]},{id:2,name:'New hire',status:'ACTIVE',factoryId:1,gradeId:7,payType:'GENERAL',joinedAt:'2026-01-01',tenureRecognitions:[{id:10,effectiveMonth:'2026-06',additionalYears:2}]}];
 const factories=[{id:1,name:'Factory',salarySystemVersions:[{id:1,versionNumber:1,snapshot:{currencyCode:'VND',items:[{code:'seniority',category:'ALLOWANCE',payTypes:['GENERAL'],formula:['GRADE_RATE','×','TENURE_YEARS'],payCycle:'MONTHLY',paymentMonths:[6]}],rates:[{salaryItemCode:'seniority',payType:'GENERAL',gradeId:7,amount:100000}]}}]}];
 const result=buildSalaryPreview({month:'2026-06',today:'2026-06-30',employees,factories,policies:[],holidays:[]}).factories[0].employees;
 assert.equal(result[0].actualTenureYears,3);assert.equal(result[0].tenureYears,5);assert.equal(result[0].salaryItems[0].amount,500000);
 assert.equal(result[1].tenureYears,2);assert.equal(result[1].tenureEligible,false);assert.equal(result[1].salaryItems[0].amount,0);
});
test('route enforces real company membership, ADMIN writes and the existing employee feature permission',async()=>{
 const routes=new Map(),options=[],response={statusCode:200,status(code){this.statusCode=code;return this;},json(value){return value;}};
 const db=new Proxy({},{get(){throw Error('Unauthorized database access');}});
 let member=false;
 registerTenureRecognitionRoutes({get:(path,fn)=>routes.set('GET',fn),put:(path,fn)=>routes.set('PUT',fn)},db,{
  requireOrgRole:async(req,res,input)=>{options.push(input);return member?{organization:{id:1,type:'SERVICE'},employee:{id:2,orgRole:'ADMIN'}}:null;},actorId:()=>2,
  loadPolicy:async()=>({policy:{SERVICE:{ADMIN:[]}}}),
 });
 for(const handler of routes.values())await handler({params:{id:'7'}},response);
 assert.equal(options.every(option=>option.allowSystemAdmin===false),true);assert.deepEqual(options[1].allowedRoles,['ADMIN']);
 member=true;await routes.get('PUT')({params:{id:'7'},body:{}},response);assert.equal(response.statusCode,403);
});
test('real PostgreSQL: ADMIN writes immutable, effective, scoped and idempotent recognition history',async()=>{
 const fixture=await changeApprovalFixture(),{db}=fixture;
 try{
  const seed=await seedChangeApproval(db),orgId=seed.company.id,employeeId=seed.people.junior.id,actorId=seed.people.admin.id;
  const oldEmployee=await db.employee.findUnique({where:{id:employeeId}});
  const input={revision:0,additionalYears:2,effectiveMonth:'2026-11',reason:'Performance recognition',clientKey:'tenure-request-0001'};
  let result=await saveTenureRecognition(db,orgId,employeeId,actorId,input,'2026-11');assert.equal(result.additionalYears,2);assert.equal(result.history.length,1);
  result=await saveTenureRecognition(db,orgId,employeeId,actorId,input,'2026-12');assert.equal(result.history.length,1,'retry across a month boundary is idempotent');
  await assert.rejects(saveTenureRecognition(db,orgId,employeeId,actorId,{...input,additionalYears:3},'2026-11'),/TENURE_RETRY_CONFLICT/);
  await assert.rejects(saveTenureRecognition(db,orgId,employeeId,seed.people.senior.id,{...input,clientKey:'tenure-request-0002'},'2026-11'),/TENURE_ADMIN_REQUIRED/);
  await assert.rejects(readTenureRecognition(db,seed.other.id,employeeId,actorId,'2026-11'),/TENURE_ADMIN_REQUIRED/);
  await assert.rejects(saveTenureRecognition(db,orgId,employeeId,actorId,{...input,clientKey:'tenure-request-0002'},'2026-11'),/TENURE_CHANGED/);
  for(const patch of [{additionalYears:-1},{additionalYears:1.5},{additionalYears:101},{reason:' '},{effectiveMonth:'2026-10'}])await assert.rejects(saveTenureRecognition(db,orgId,employeeId,actorId,{...input,revision:result.revision,clientKey:'tenure-request-0003',...patch},'2026-11'),/TENURE_INVALID_INPUT/);
  await assert.rejects(db.employeeTenureRecognition.update({where:{id:result.revision},data:{additionalYears:10}}),/TENURE_RECOGNITION_APPEND_ONLY/);
  await assert.rejects(db.employeeTenureRecognition.delete({where:{id:result.revision}}),/TENURE_RECOGNITION_APPEND_ONLY/);
  await assert.rejects(db.employeeTenureRecognition.create({data:{orgId,employeeId,effectiveMonth:'2026-11',additionalYears:2,reason:'Invalid actor',clientKey:'tenure-request-db01',createdByEmployeeId:seed.people.senior.id}}),/TENURE_RECOGNITION_ADMIN_REQUIRED/);
  const reset=await saveTenureRecognition(db,orgId,employeeId,actorId,{...input,revision:result.revision,additionalYears:0,reason:'Recognition withdrawn',effectiveMonth:'2026-12',clientKey:'tenure-request-0004'},'2026-11');
  assert.equal(reset.additionalYears,2,'future withdrawal does not change the current month');assert.equal(reset.history.length,2);
  const history={joinedAt:'2020-01-01',tenureRecognitions:reset.history};assert.equal(resolveRecognizedTenure(history,'2026-12').additionalYears,0);
  assert.deepEqual(await db.employee.findUnique({where:{id:employeeId}}),oldEmployee,'hire date and employee data are never rewritten');
  const readonly=await readTenureRecognition(db,orgId,employeeId,seed.people.senior.id,'2026-11');assert.equal(readonly.canEdit,false);
  const factory=await db.factory.create({data:{orgId,name:'Payroll factory'}});
  await db.employee.update({where:{id:employeeId},data:{factoryId:factory.id}});
  const snapshot=await db.payrollSnapshot.create({data:{orgId,factoryId:factory.id,month:'2026-10',data:{amount:123,tenureYears:3},lockedAt:new Date(),lockedBy:'admin@example.test'}});
  await assert.rejects(db.employeeTenureRecognition.create({data:{orgId,employeeId,effectiveMonth:'2026-10',additionalYears:9,reason:'Cannot rewrite paid payroll',clientKey:'tenure-request-db02',createdByEmployeeId:actorId}}),/TENURE_RECOGNITION_PAYROLL_SAVED/);
  assert.deepEqual(await db.payrollSnapshot.findUnique({where:{id:snapshot.id}}),snapshot);
 }finally{await fixture.close();}
});
