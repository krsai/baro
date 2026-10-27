import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { orderWorkflowOptions } from '../frontend/src/constants/orderWorkflow.mjs';
const require=createRequire(import.meta.url);
const {orderWorkflowStatus,loadOrderWorkflowStatuses}=require('../backend/dist/services/orderWorkflow.js');
const order={id:1,status:'SETTLED',workOrderItems:[{styleId:7,totalQuantity:100}],priorCompletions:[]};
const plan=(overrides={})=>({workOrderId:1,styleId:7,assignmentQuantity:100,isCompleted:false,_count:{workRecords:0,outsourcedWorkRecords:0},...overrides});

test('new orders and assignments without production history stay received regardless of legacy status',()=>{
  assert.equal(orderWorkflowStatus(order,[]),'RECEIVED');
  assert.equal(orderWorkflowStatus(order,[plan()]),'RECEIVED');
});
test('any employee or outsourced record starts production, including a zero-quantity history',()=>{
  for(const key of ['workRecords','outsourcedWorkRecords']) assert.equal(orderWorkflowStatus(order,[plan({_count:{[key]:1}})]),'PRODUCTION');
});
test('100 percent does not imply approved completion',()=>{
  assert.equal(orderWorkflowStatus(order,[plan({progressPercent:100,_count:{workRecords:1}})]),'PRODUCTION');
});
test('all allocations must be complete and cover every ordered style before billing',()=>{
  assert.equal(orderWorkflowStatus(order,[plan({isCompleted:true})]),'BILLING');
  assert.equal(orderWorkflowStatus(order,[plan({isCompleted:true,assignmentQuantity:50})]),'PRODUCTION');
  assert.equal(orderWorkflowStatus(order,[plan({isCompleted:true,assignmentQuantity:50}),plan({assignmentQuantity:50})]),'PRODUCTION');
  const mixed={...order,workOrderItems:[...order.workOrderItems,{styleId:8,totalQuantity:10}]};
  assert.equal(orderWorkflowStatus(mixed,[plan({isCompleted:true,assignmentQuantity:110})]),'PRODUCTION');
  assert.equal(orderWorkflowStatus(mixed,[plan({isCompleted:true}),plan({styleId:8,assignmentQuantity:10,isCompleted:true})]),'BILLING');
});
test('quantity increases or reopened allocations return billing orders to production',()=>{
  assert.equal(orderWorkflowStatus({...order,workOrderItems:[{styleId:7,totalQuantity:105}]},[plan({isCompleted:true})]),'PRODUCTION');
  assert.equal(orderWorkflowStatus(order,[plan({isCompleted:false,_count:{workRecords:1}})]),'PRODUCTION');
});
test('historical completion counts as production history but cannot replace the required completed assignments',()=>{
  const prior=quantity=>({...order,priorCompletions:[{styleId:7,quantity}]});
  assert.equal(orderWorkflowStatus(prior(100),[]),'PRODUCTION');
  assert.equal(orderWorkflowStatus(prior(50),[plan({assignmentQuantity:50,isCompleted:true})]),'PRODUCTION');
  assert.equal(orderWorkflowStatus({...order,priorCompletions:[{styleId:7,quantity:100,canceledAt:'2026-10-15'}]},[]),'RECEIVED');
});
test('batch projection reads actual FK history once and never writes statuses or returns completed',async()=>{
  let reads=0;
  const db={assignmentPlan:{findMany:async({where})=>{reads++;assert.deepEqual(where.OR[0].workOrderId.in,[1,2]);return[plan({workOrderId:null,assignmentCard:{workOrderId:1},_count:{workRecords:1}})];}}};
  const statuses=await loadOrderWorkflowStatuses(db,[order,{...order,id:2}]);
  assert.equal(reads,1);assert.equal(statuses.get(1),'PRODUCTION');assert.equal(statuses.get(2),'RECEIVED');
  assert.deepEqual(orderWorkflowOptions('ko').map(option=>option.label),['접수','생산','청구','완료']);
});

test('order state follows canonical assignment completion rather than the stored manual flag',()=>{
  const {invoiceOrderProgress}=require('../backend/dist/services/invoiceOrderProgress.js');
  const plans=[plan({externalId:'L16-1-A',_count:{workRecords:1}})];
  const rows=[{id:'L16-1-A',isCompleted:true,plannedQuantity:100,producedQuantity:100,completionTargetQuantity:100,operationalProgressRatio:1}];
  const production=invoiceOrderProgress(order,plans,rows);
  assert.equal(production.isCompleted,true);
  assert.equal(orderWorkflowStatus(order,plans,production),'BILLING','exact-process or dated completion matches board even if manual flag is false');
  const unfinished=invoiceOrderProgress(order,plans,[{...rows[0],isCompleted:false,operationalProgressRatio:.9999}]);
  assert.equal(orderWorkflowStatus(order,plans,unfinished),'PRODUCTION','rounded percentages cannot approve completion');
  assert.equal(orderWorkflowStatus(order,[{...plans[0],isCompleted:true}],{isCompleted:false}),'PRODUCTION','canonical noncompletion overrides the raw flag');
  assert.equal(orderWorkflowStatus({...order,workOrderItems:[{styleId:7,totalQuantity:110}]},plans,invoiceOrderProgress({...order,workOrderItems:[{styleId:7,totalQuantity:110}]},plans,rows)),'PRODUCTION','increased quantity is not covered');
});

test('L16-like mixed historical and current styles use the same completion summary',()=>{
  const {invoiceOrderProgress}=require('../backend/dist/services/invoiceOrderProgress.js');
  const mixed={...order,workOrderItems:[{styleId:7,totalQuantity:100},{styleId:8,totalQuantity:50}],priorCompletions:[{styleId:8,quantity:50}]};
  const plans=[plan({externalId:'current',_count:{workRecords:1}}),plan({externalId:'historical',styleId:8,assignmentQuantity:50})];
  const rows=[{id:'current',isCompleted:true,plannedQuantity:100,producedQuantity:100},{id:'historical',isCompleted:true,plannedQuantity:50,producedQuantity:0,completionTargetQuantity:0}];
  const production=invoiceOrderProgress(mixed,plans,rows);
  assert.equal(production.isCompleted,true);assert.equal(production.producedQuantity,150);
  assert.equal(orderWorkflowStatus(mixed,plans,production),'BILLING');
  assert.equal(orderWorkflowStatus({...order,priorCompletions:[{styleId:7,quantity:100}]},[],{isCompleted:true}),'PRODUCTION','historical quantities alone do not invent an assignment');
});

test('create/update projections resolve canonical progress by organization without writes',async()=>{
  const plans=[plan({orgId:1,externalId:'same',_count:{workRecords:1}}),plan({workOrderId:2,orgId:2,externalId:'same',_count:{workRecords:1}})];
  const db={assignmentPlan:{findMany:async()=>plans}};
  const calls=[];
  const statuses=await loadOrderWorkflowStatuses(db,[order,{...order,id:2}],async(orgId,ids)=>{
    calls.push([orgId,ids]);return [{id:'same',isCompleted:orgId===1,plannedQuantity:100,producedQuantity:orgId===1?100:50}];
  });
  assert.equal(statuses.get(1),'BILLING');assert.equal(statuses.get(2),'PRODUCTION');assert.equal(calls.length,2);
});

test('historical credits cannot hide a reopened or missing allocation in canonical workflow',()=>{
  const {invoiceOrderProgress}=require('../backend/dist/services/invoiceOrderProgress.js');
  const prior={...order,priorCompletions:[{styleId:7,quantity:100}]};
  const plans=[plan({externalId:'reopened',_count:{workRecords:1}})];
  assert.equal(orderWorkflowStatus(prior,plans,invoiceOrderProgress(prior,plans,[{id:'reopened',plannedQuantity:100,producedQuantity:0,isCompleted:false}])),'PRODUCTION');
  const partial=[plan({externalId:'partial',assignmentQuantity:50})];
  assert.equal(orderWorkflowStatus(prior,partial,invoiceOrderProgress(prior,partial,[{id:'partial',plannedQuantity:50,isCompleted:true}])),'PRODUCTION');
});
