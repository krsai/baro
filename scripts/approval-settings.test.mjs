import test from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
const require=createRequire(import.meta.url);
const {resolveExpenseApproval,validateApprovalSettings,defaultApprovalSettings}=require('../backend/dist/services/expenseApproval.js');
const {approvalState}=require('../backend/dist/services/bankEvidence.js');
const {registerExpenseEditorRoutes}=require('../backend/dist/services/expenseRequestEditor.js');
function fixture(){
 const config={...defaultApprovalSettings(),seniorGradeId:10,leadGradeId:20,seniorEmployeeId:2,leadEmployeeId:3,adminEmployeeId:4};
 const people=[{id:1,orgId:7,status:'ACTIVE',orgRole:'OPERATOR',gradeId:1},{id:2,orgId:7,status:'ACTIVE',orgRole:'ACCOUNTANT',gradeId:10},{id:3,orgId:7,status:'ACTIVE',orgRole:'ACCOUNTANT',gradeId:20},{id:4,orgId:7,status:'ACTIVE',orgRole:'ADMIN',gradeId:30}];
 people.forEach(person=>person.grade={isActive:true,set:{isActive:true}});
 const matches=(person,where)=>Object.entries(where).every(([key,value])=>key==='grade'?person.grade.isActive&&person.grade.set.isActive:typeof value==='object'&&value?.notIn?!value.notIn.includes(person[key]):person[key]===value);
 const db={systemSetting:{findUnique:async({where})=>{assert.equal(where.key,'EXPENSE_APPROVAL_POLICY:7');return {value:config};}},employee:{findFirst:async({where})=>people.find(p=>matches(p,where)),findMany:async({where})=>people.filter(p=>matches(p,where))},employeeGrade:{findFirst:async({where})=>[10,20].includes(where.id)&&where.orgId===7?{id:where.id}:null}};
 return {db,config,people};
}
const item=(unitPrice,currency='VND',vatRate='0')=>({unitPrice:String(unitPrice),currency,vatRate,quantity:'1'});
test('changing company limits changes new resolutions but leaves saved approval steps and current-version decisions intact',async()=>{
 const {db,config}=fixture();
 const saved=await resolveExpenseApproval(db,7,1,[item('30000000')]);
 const request={id:18,version:2,createdByEmployeeId:1,approvalSteps:saved.ids.map((employeeId,index)=>({id:index+1,employeeId,position:index+1}))};
 const audit={afterSnapshot:{approvalPolicy:structuredClone(saved.policy)}};
 db.expenseRequest={findFirst:async()=>structuredClone(request)};
 db.expenseApprovalDecision={findMany:async()=>[{requestId:18,version:2,position:1,employeeId:2,decision:'APPROVED',createdAt:'2026-10-30'}]};
 db.expenseRequestAudit={findFirst:async()=>structuredClone(audit)};
 const before=await approvalState(db,7,18);
 config.limits.VND.senior='50000000';
 assert.deepEqual((await resolveExpenseApproval(db,7,1,[item('30000000')])).ids,[2]);
 assert.deepEqual(await approvalState(db,7,18),before);
 assert.deepEqual(request.approvalSteps.map(step=>step.employeeId),[2,3]);
 assert.equal(audit.afterSnapshot.approvalPolicy.config.limits.VND.senior,'20000000');
});
for(const [currency,senior,lead] of [['VND','20000000','100000000'],['KRW','1000000','5000000'],['USD','1000','5000']]){
 test(`${currency} uses inclusive limits and cumulative approvals`,async()=>{
   const {db}=fixture();
   for(const [amount,ids] of [[senior,[2]],[String(Number(senior)+1),[2,3]],[lead,[2,3]],[String(Number(lead)+1),[2,3,4]]])assert.deepEqual((await resolveExpenseApproval(db,7,1,[item(amount,currency)])).ids,ids);
 });
}
test('vacant or inactive lead escalates to administrator without skipping senior approval',async()=>{
 const {db,config,people}=fixture();people[2].status='INACTIVE';
 assert.deepEqual((await resolveExpenseApproval(db,7,1,[item('30000000')])).ids,[2,4]);
 config.leadEmployeeId=3;people[2].status='INACTIVE';assert.deepEqual((await resolveExpenseApproval(db,7,1,[item('30000000')])).ids,[2,4]);
 people[1].status='INACTIVE';assert.deepEqual((await resolveExpenseApproval(db,7,1,[item('1000')])).ids,[4]);
 people[3].orgId=99;await assert.rejects(resolveExpenseApproval(db,7,1,[item('1000')]),/EXPENSE_APPROVER_REQUIRED/);
});
test('accountant drafting skips own and lower stages but higher limits still require higher approvals',async()=>{
 const {db}=fixture();
 assert.equal((await resolveExpenseApproval(db,7,2,[item('20000000')])).policy.exempt,true);
 assert.deepEqual((await resolveExpenseApproval(db,7,2,[item('100000000')])).ids,[3]);
 assert.deepEqual((await resolveExpenseApproval(db,7,2,[item('100000001')])).ids,[3,4]);
 assert.equal((await resolveExpenseApproval(db,7,3,[item('100000000')])).policy.exempt,true);
 assert.deepEqual((await resolveExpenseApproval(db,7,3,[item('100000001')])).ids,[4]);
 const admin=await resolveExpenseApproval(db,7,4,[item('100000001')]);assert.deepEqual(admin.ids,[]);assert.equal(admin.policy.exempt,true);assert.equal(admin.policy.exemptionReason,'ADMIN_DRAFTER');
});

test('administrator requests use final authority for every threshold and retain an explicit policy without fake self approvals',async()=>{
 const {db,people}=fixture();
 for(const amount of ['100','20000001','100000001']){const result=await resolveExpenseApproval(db,7,4,[item(amount)],{});assert.equal(result.complete,true);assert.deepEqual(result.stages,[]);assert.equal(result.policy.exempt,true);assert.equal(result.policy.drafterId,4);}
 people[3].status='INACTIVE';await assert.rejects(resolveExpenseApproval(db,7,4,[item('100')],{}),/ACTIVE_EMPLOYEE_REQUIRED/);
});

test('only an active original company administrator can complete a legacy request with no approval line',async()=>{
 const author={id:4,orgId:7,status:'ACTIVE',orgRole:'ADMIN'},request={id:10,version:2,createdByEmployeeId:4,createdByEmployee:author,approvalSteps:[]};let decisions=[];
 const db={expenseRequest:{findFirst:async()=>request},expenseApprovalDecision:{findMany:async()=>decisions},expenseRequestAudit:{findFirst:async()=>null}};
 let state=await approvalState(db,7,10);assert.equal(state.status,'APPROVED');assert.equal(state.exemptionReason,'ADMIN_DRAFTER');assert.equal(state.canApprove,false);
 for(const change of [{status:'INACTIVE'},{orgId:8},{orgRole:'ACCOUNTANT'},{id:5}]){const old={...author};Object.assign(author,change);assert.equal((await approvalState(db,7,10)).approved,false);Object.assign(author,old);}
 request.approvalSteps=[{position:1,employeeId:11}];assert.equal((await approvalState(db,7,10)).approved,false);
 request.approvalSteps=[];decisions=[{requestId:10,version:2,position:1,employeeId:11,decision:'REJECTED'}];assert.equal((await approvalState(db,7,10)).approved,false);
});
test('VAT and totals across all rows determine level; different currencies retain separate limits',async()=>{
 const {db,config}=fixture();
 assert.deepEqual((await resolveExpenseApproval(db,7,1,[item('20000000','VND','10')])).ids,[2,3]);
 assert.deepEqual((await resolveExpenseApproval(db,7,1,[item('15000000'),item('15000000')])).ids,[2,3]);
 const result=await resolveExpenseApproval(db,7,1,[item('1000','VND'),item('5001','USD')]);assert.deepEqual(result.ids,[2,3,4]);assert.equal(result.policy.totals.length,2);
 config.limits.USD={senior:'',lead:''};await assert.rejects(resolveExpenseApproval(db,7,1,[item('10','USD')]),/CURRENCY_LIMIT_REQUIRED/);
});
test('settings store only limits, validate currency digits and strictly increasing bounds',async()=>{
 const {db,config}=fixture();assert.deepEqual(await validateApprovalSettings(db,7,config),{limits:config.limits});
 for(const change of [{limits:{...config.limits,VND:{senior:'20000000',lead:'1000'}}},{limits:{...config.limits,KRW:{senior:'1.1',lead:'2'}}}])await assert.rejects(validateApprovalSettings(db,7,{...config,...change}),/INVALID/);
 assert.deepEqual(await validateApprovalSettings({},7,{limits:config.limits}),{limits:config.limits});
 config.limits.USD={senior:'2000.50',lead:'9000.99'};await validateApprovalSettings(db,7,config);
 assert.deepEqual((await resolveExpenseApproval(db,7,1,[item('1500','USD')])).ids,[2]);
});
test('zero-step historical requests require matching explicit current-version policy snapshot',async()=>{
 let policy=null;
 const db={expenseRequest:{findFirst:async()=>({version:2,createdByEmployeeId:1,approvalSteps:[]})},expenseApprovalDecision:{findMany:async()=>[]},expenseRequestAudit:{findFirst:async({where})=>{assert.equal(where.version,2);return {afterSnapshot:{approvalPolicy:policy}};}}};
 assert.equal((await approvalState(db,7,10)).approved,false);
 assert.equal((await approvalState(db,7,10)).status,'UNKNOWN');
 policy={exempt:true,drafterId:9};assert.equal((await approvalState(db,7,10)).approved,false);
 policy={exempt:true,drafterId:1};assert.equal((await approvalState(db,7,10)).approved,true);
});
test('company rule updates require an active administrator and ignore forged tenant/drafter fields',async()=>{
 const {db,config}=fixture(),handlers=new Map();let current=1,writes=0;
 db.$transaction=async run=>run(db);db.systemSetting.upsert=async({where,update})=>{writes++;assert.equal(where.key,'EXPENSE_APPROVAL_POLICY:7');assert.equal(update.updatedByEmployeeId,4);assert.deepEqual(Object.keys(update.value),['limits']);};
 registerExpenseEditorRoutes({get:(p,fn)=>handlers.set('GET '+p,fn),put:(p,fn)=>handlers.set('PUT '+p,fn),post:(p,fn)=>handlers.set('POST '+p,fn)},db,{actorId:()=>current,requireOrgRole:async(_req,_res,{allowedRoles})=>allowedRoles.includes(current===4?'ADMIN':'OPERATOR')?{organization:{id:7}}:null});
 const response={json:()=>{},status:()=>response};
 await handlers.get('PUT /expense-approval-settings')({body:config},response);assert.equal(writes,0);
 current=4;await handlers.get('PUT /expense-approval-settings')({body:{...config,orgId:99,drafterId:9}},response);assert.equal(writes,1);
});
test('manual preview shows required vertical stages without global assignees and requires explicit selections',async()=>{
 const {db}=fixture();db.systemSetting.findUnique=async()=>null;
 const preview=await resolveExpenseApproval(db,7,1,[item('30000000')],{},true);
 assert.equal(preview.complete,false);assert.deepEqual(preview.stages.map(stage=>stage.key),['senior','lead']);assert.deepEqual(preview.ids,[]);
 await assert.rejects(resolveExpenseApproval(db,7,1,[item('30000000')],{}),/APPROVER_REQUIRED/);
 const chosen={seniorEmployeeId:2,leadEmployeeId:3};const result=await resolveExpenseApproval(db,7,1,[item('30000000')],chosen);
 assert.deepEqual(result.ids,[2,3]);assert.deepEqual(result.policy.selection,chosen);
 await assert.rejects(resolveExpenseApproval(db,7,1,[item('30000000')],{seniorVacant:true}),/APPROVER_REQUIRED/);
});
test('manual choices retain threshold, company, grade, duplicate and self-approval guards',async()=>{
 const {db}=fixture();
 for(const selection of [{seniorEmployeeId:4},{seniorEmployeeId:1},{seniorEmployeeId:99},{seniorEmployeeId:2,leadEmployeeId:2},{seniorEmployeeId:2,leadVacant:true}])await assert.rejects(resolveExpenseApproval(db,7,1,[item('30000000')],selection),/INVALID|SELF|REQUIRED/);
 await assert.rejects(resolveExpenseApproval(db,7,1,[item('100000001')],{seniorEmployeeId:2,leadEmployeeId:3}),/APPROVER_REQUIRED/);
 const recovery=await resolveExpenseApproval(db,7,1,[item('30000000')],{seniorEmployeeId:99},true);assert.equal(recovery.complete,false);assert.equal(recovery.stages[0].invalid,true);assert.ok(recovery.stages[0].candidates.length);
});
test('missing lead automatically routes to administrator without any vacancy setting',async()=>{
 const {db,people}=fixture();people[2].status='INACTIVE';
 const selection={seniorEmployeeId:2,adminEmployeeId:4};
 const result=await resolveExpenseApproval(db,7,1,[item('30000000')],selection);assert.deepEqual(result.ids,[2,4]);assert.deepEqual(result.policy.skipped,['lead']);
 assert.deepEqual((await resolveExpenseApproval(db,7,1,[item('30000000')],{...selection,leadEmployeeId:3})).ids,[2,4]);
 const preview=await resolveExpenseApproval(db,7,1,[item('30000000')],{seniorEmployeeId:2},true);assert.deepEqual(preview.stages.map(row=>row.key),['senior','lead','admin']);assert.equal(preview.complete,false);
});
test('legacy global person assignments do not determine expense approvers',async()=>{
 const {db,config}=fixture();config.seniorEmployeeId=99;config.leadEmployeeId=99;config.adminEmployeeId=99;
 assert.deepEqual((await resolveExpenseApproval(db,7,1,[item('100000001')])).ids,[2,3,4]);
});
