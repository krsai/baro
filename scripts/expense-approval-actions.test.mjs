import test from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
const require=createRequire(import.meta.url);
const {approvalState,approveExpense,listExpenseApprovalInbox,attachExpenseApprovalStates}=require('../backend/dist/services/bankEvidence.js');

test('own administrator requests show the same completed status in detail, document lists and dashboard',async()=>{
 const request={id:1,version:1,orgId:7,createdByEmployeeId:11,createdByEmployee:{id:11,name:'Owner',orgId:7,orgRole:'ADMIN',status:'ACTIVE'},approvalSteps:[],items:[]};
 const db={employee:{findFirst:async()=>({id:11,orgRole:'ADMIN'})},expenseRequest:{findFirst:async()=>request,findMany:async({where})=>{assert.equal(where.orgId,7);assert.equal(where.createdByEmployeeId,11);return [request];}},expenseApprovalDecision:{findMany:async()=>[]},expenseRequestAudit:{findFirst:async()=>null,findMany:async()=>[]}};
 assert.equal((await approvalState(db,7,1,11)).status,'APPROVED');
 assert.equal((await attachExpenseApprovalStates(db,7,[request]))[0].approval.status,'APPROVED');
 assert.equal((await listExpenseApprovalInbox(db,7,11,'requested'))[0].status,'APPROVED');
});

test('approval inbox includes only the current version and the actual next designated employee',async()=>{
 const step=(position,employeeId)=>({position,employeeId});
 const requests=[
  {id:1,version:2,createdByEmployeeId:99,approvalSteps:[step(1,11),step(2,12)]},
  {id:2,version:1,createdByEmployeeId:99,approvalSteps:[step(1,12),step(2,11)]},
  {id:3,version:1,createdByEmployeeId:99,approvalSteps:[step(1,12),step(2,11)]},
  {id:4,version:1,createdByEmployeeId:11,approvalSteps:[step(1,11)]},
  {id:5,version:1,createdByEmployeeId:99,approvalSteps:[step(1,11)]},
 ];
 const decisions=[{requestId:1,version:1,position:1,employeeId:11},{requestId:3,version:1,position:1,employeeId:12},{requestId:5,version:1,position:1,employeeId:11}];
 let queried=false;
 const db={employee:{findFirst:async({where})=>where.orgId===7&&where.id===11?{id:11}:null},expenseRequest:{findMany:async({where})=>{queried=true;assert.equal(where.orgId,7);assert.equal(where.approvalSteps.some.employeeId,11);return requests;}},expenseApprovalDecision:{findMany:async({where})=>{assert.equal(where.orgId,7);return decisions;}}};
 assert.deepEqual((await listExpenseApprovalInbox(db,7,11)).map(row=>row.id),[1,3]);
 queried=false;await assert.rejects(listExpenseApprovalInbox(db,8,11),/ACCESS_DENIED/);assert.equal(queried,false);
});

test('approval exposes original decision timestamps, refuses self/stale approvals and preserves idempotent sequence',async()=>{
 const time=new Date('2026-10-29T01:00:00Z'),decisions=[];
 const request={id:1,orgId:7,createdByEmployeeId:99,version:2,approvalSteps:[{id:'s1',position:1,employeeId:11,employee:{name:'First'}},{id:'s2',position:2,employeeId:12,employee:{name:'Second'}}]};
 const db={$queryRawUnsafe:async()=>[],employee:{findFirst:async({where})=>where.orgId===7&&[11,12].includes(where.id)?{id:where.id}:null},expenseRequest:{findFirst:async({where})=>where.orgId===7?request:null},expenseApprovalDecision:{findMany:async({where})=>decisions.filter(row=>row.version===where.version),create:async({data})=>{const row={...data,createdAt:time};decisions.push(row);return row;}}};db.$transaction=async fn=>fn(db);
 await assert.rejects(approveExpense(db,7,11,1,1),/REQUEST_CHANGED/);
 await assert.rejects(approveExpense(db,7,12,1,2),/NOT_YOUR_TURN/);
 let state=await approveExpense(db,7,11,1,2);assert.equal(state.steps[0].approvedAt,time);assert.equal(state.approved,false);
 await approveExpense(db,7,11,1,2);assert.equal(decisions.length,1);
 state=await approveExpense(db,7,12,1,2);assert.equal(state.approved,true);
 request.version=3;assert.equal((await approvalState(db,7,1,11)).approved,false);
 request.createdByEmployeeId=11;assert.equal((await approvalState(db,7,1,11)).canApprove,false);
 await assert.rejects(approveExpense(db,7,11,1,3),/NOT_YOUR_TURN/);
});

test('rejection requires a reason, ends the reviewed version, preserves retry identity and resets only on resubmission',async()=>{
 const decisions=[],request={id:1,orgId:7,createdByEmployeeId:99,version:1,approvalSteps:[{position:1,employeeId:11},{position:2,employeeId:12}]};
 const db={$queryRawUnsafe:async()=>[],employee:{findFirst:async({where})=>where.orgId===7&&[11,12].includes(where.id)?{id:where.id}:null},expenseRequest:{findFirst:async({where})=>where.orgId===7?request:null},expenseApprovalDecision:{findMany:async({where})=>decisions.filter(row=>row.version===where.version),create:async({data})=>{decisions.push({...data,createdAt:new Date()});}}};db.$transaction=async fn=>fn(db);
 for(const reason of [undefined,'  ','x'.repeat(1001)])await assert.rejects(approveExpense(db,7,11,1,1,'REJECTED',reason),/REJECTION_REASON_REQUIRED/);
 await assert.rejects(approveExpense(db,7,12,1,1,'REJECTED','Incorrect'),/NOT_YOUR_TURN/);
 let state=await approveExpense(db,7,11,1,1,'REJECTED','  Incorrect invoice\nPlease revise.  ');
 assert.equal(state.status,'REJECTED');assert.equal(state.approved,false);assert.equal(state.canReject,false);assert.equal(state.steps[1].blocked,true);assert.equal(state.rejection.reason,'Incorrect invoice\nPlease revise.');
 await approveExpense(db,7,11,1,1,'REJECTED','Incorrect invoice\nPlease revise.');assert.equal(decisions.length,1);
 await assert.rejects(approveExpense(db,7,11,1,1,'REJECTED','Different'),/ALREADY_DECIDED/);
 await assert.rejects(approveExpense(db,7,11,1,1),/ALREADY_DECIDED/);
 await assert.rejects(approveExpense(db,7,12,1,1),/REQUEST_REJECTED/);
 request.version=2;state=await approvalState(db,7,1,11);assert.equal(state.status,'REQUESTED');assert.equal(state.canReject,true);
 await assert.rejects(approveExpense(db,7,11,1,1),/REQUEST_CHANGED/);
 state=await approveExpense(db,7,11,1,2);assert.equal(state.status,'IN_REVIEW');
 state=await approveExpense(db,7,12,1,2);assert.equal(state.status,'APPROVED');assert.equal(decisions[0].reason,'Incorrect invoice\nPlease revise.');
});

test('inbox excludes rejected requests from pending and shows immutable reviewed amounts in handled history',async()=>{
 const requests=[{id:1,version:2,createdByEmployeeId:99,requestDate:'2026-10-30',partner:{name:'New payee'},items:[{currency:'USD',amount:'900'}],approvalSteps:[{position:1,employeeId:11},{position:2,employeeId:12}]}];
 const decisions=[{requestId:1,version:1,position:1,employeeId:11,decision:'REJECTED',reason:'Revise',createdAt:'2026-10-29'},{requestId:1,version:2,position:1,employeeId:11,decision:'REJECTED',reason:'Still wrong',createdAt:'2026-10-30'}];
 const db={employee:{findFirst:async()=>({orgRole:'ACCOUNTANT'})},expenseRequest:{findMany:async()=>requests},expenseApprovalDecision:{findMany:async()=>decisions},expenseRequestAudit:{findMany:async()=>[{requestId:1,version:1,afterSnapshot:{document:{...requests[0],version:1,requestDate:'2026-10-29',partner:{name:'Original payee'}},costs:[{currency:'USD',amount:'100.25'}]}}]}};
 assert.deepEqual(await listExpenseApprovalInbox(db,7,11),[]);assert.deepEqual(await listExpenseApprovalInbox(db,7,11,'inProgress'),[]);
 const rows=await listExpenseApprovalInbox(db,7,11,'completed');assert.equal(rows[0].handledVersion,2);assert.equal(rows[1].payee,'Original payee');assert.deepEqual(rows[1].totals,[{currency:'USD',amount:'100.25'}]);
 assert.equal((await listExpenseApprovalInbox(db,7,11,'requested'))[0].status,'REJECTED');
 db.employee.findFirst=async()=>({orgRole:'OPERATOR'});assert.deepEqual(await listExpenseApprovalInbox(db,7,11),[]);
 await assert.rejects(listExpenseApprovalInbox(db,7,11,'all'),/INVALID_APPROVAL_VIEW/);
});
