import test from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
const require=createRequire(import.meta.url);
const {approvalState,approveExpense,listExpenseApprovalInbox}=require('../backend/dist/services/bankEvidence.js');

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
