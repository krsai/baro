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
 const db={systemSetting:{findUnique:async({where})=>{assert.equal(where.key,'EXPENSE_APPROVAL_POLICY:7');return {value:config};}},employee:{findFirst:async({where})=>people.find(p=>Object.entries(where).every(([key,value])=>key==='grade'?p.grade.isActive&&p.grade.set.isActive:p[key]===value))},employeeGrade:{findFirst:async({where})=>[10,20].includes(where.id)&&where.orgId===7?{id:where.id}:null}};
 return {db,config,people};
}
const item=(unitPrice,currency='VND',vatRate='0')=>({unitPrice:String(unitPrice),currency,vatRate,quantity:'1'});
for(const [currency,senior,lead] of [['VND','20000000','100000000'],['KRW','1000000','5000000'],['USD','1000','5000']]){
 test(`${currency} uses inclusive limits and cumulative approvals`,async()=>{
   const {db}=fixture();
   for(const [amount,ids] of [[senior,[2]],[String(Number(senior)+1),[2,3]],[lead,[2,3]],[String(Number(lead)+1),[2,3,4]]])assert.deepEqual((await resolveExpenseApproval(db,7,1,[item(amount,currency)])).ids,ids);
 });
}
test('vacant or inactive lead escalates to administrator without skipping senior approval',async()=>{
 const {db,config,people}=fixture();config.leadEmployeeId=null;
 assert.deepEqual((await resolveExpenseApproval(db,7,1,[item('30000000')])).ids,[2,4]);
 config.leadEmployeeId=3;people[2].status='INACTIVE';assert.deepEqual((await resolveExpenseApproval(db,7,1,[item('30000000')])).ids,[2,4]);
 config.seniorEmployeeId=null;assert.deepEqual((await resolveExpenseApproval(db,7,1,[item('1000')])).ids,[4]);
 people[3].orgId=99;await assert.rejects(resolveExpenseApproval(db,7,1,[item('1000')]),/EXPENSE_APPROVER_REQUIRED/);
});
test('accountant drafting skips own and lower stages but higher limits still require higher approvals',async()=>{
 const {db}=fixture();
 assert.equal((await resolveExpenseApproval(db,7,2,[item('20000000')])).policy.exempt,true);
 assert.deepEqual((await resolveExpenseApproval(db,7,2,[item('100000000')])).ids,[3]);
 assert.deepEqual((await resolveExpenseApproval(db,7,2,[item('100000001')])).ids,[3,4]);
 assert.equal((await resolveExpenseApproval(db,7,3,[item('100000000')])).policy.exempt,true);
 assert.deepEqual((await resolveExpenseApproval(db,7,3,[item('100000001')])).ids,[4]);
 await assert.rejects(resolveExpenseApproval(db,7,4,[item('100000001')]),/SELF_APPROVAL/);
});
test('VAT and totals across all rows determine level; different currencies retain separate limits',async()=>{
 const {db,config}=fixture();
 assert.deepEqual((await resolveExpenseApproval(db,7,1,[item('20000000','VND','10')])).ids,[2,3]);
 assert.deepEqual((await resolveExpenseApproval(db,7,1,[item('15000000'),item('15000000')])).ids,[2,3]);
 const result=await resolveExpenseApproval(db,7,1,[item('1000','VND'),item('5001','USD')]);assert.deepEqual(result.ids,[2,3,4]);assert.equal(result.policy.totals.length,2);
 config.limits.USD={senior:'',lead:''};await assert.rejects(resolveExpenseApproval(db,7,1,[item('10','USD')]),/CURRENCY_LIMIT_REQUIRED/);
});
test('editable limits validate grade/employee FKs, currency digits and strictly increasing bounds',async()=>{
 const {db,config}=fixture();assert.deepEqual(await validateApprovalSettings(db,7,config),config);
 for(const change of [{seniorEmployeeId:4},{leadGradeId:10},{adminEmployeeId:99},{limits:{...config.limits,VND:{senior:'20000000',lead:'1000'}}},{limits:{...config.limits,KRW:{senior:'1.1',lead:'2'}}}])await assert.rejects(validateApprovalSettings(db,7,{...config,...change}),/INVALID/);
 config.limits.USD={senior:'2000.50',lead:'9000.99'};await validateApprovalSettings(db,7,config);
 assert.deepEqual((await resolveExpenseApproval(db,7,1,[item('1500','USD')])).ids,[2]);
});
test('zero-step historical requests require matching explicit current-version policy snapshot',async()=>{
 let policy=null;
 const db={expenseRequest:{findFirst:async()=>({version:2,createdByEmployeeId:1,approvalSteps:[]})},expenseApprovalDecision:{findMany:async()=>[]},expenseRequestAudit:{findFirst:async({where})=>{assert.equal(where.version,2);return {afterSnapshot:{approvalPolicy:policy}};}}};
 assert.equal((await approvalState(db,7,10)).approved,false);
 policy={exempt:true,drafterId:9};assert.equal((await approvalState(db,7,10)).approved,false);
 policy={exempt:true,drafterId:1};assert.equal((await approvalState(db,7,10)).approved,true);
});
test('company rule updates require an active administrator and ignore forged tenant/drafter fields',async()=>{
 const {db,config}=fixture(),handlers=new Map();let current=1,writes=0;
 db.$transaction=async run=>run(db);db.systemSetting.upsert=async({where,update})=>{writes++;assert.equal(where.key,'EXPENSE_APPROVAL_POLICY:7');assert.equal(update.updatedByEmployeeId,4);};
 registerExpenseEditorRoutes({get:(p,fn)=>handlers.set('GET '+p,fn),put:(p,fn)=>handlers.set('PUT '+p,fn),post:(p,fn)=>handlers.set('POST '+p,fn)},db,{actorId:()=>current,requireOrgRole:async(_req,_res,{allowedRoles})=>allowedRoles.includes(current===4?'ADMIN':'OPERATOR')?{organization:{id:7}}:null});
 const response={json:()=>{},status:()=>response};
 await handlers.get('PUT /expense-approval-settings')({body:config},response);assert.equal(writes,0);
 current=4;await handlers.get('PUT /expense-approval-settings')({body:{...config,orgId:99,drafterId:9}},response);assert.equal(writes,1);
});
