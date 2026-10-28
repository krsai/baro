import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { applyOrderBillingPercentages } from '../frontend/src/utils/invoiceDraft.mjs';
const require=createRequire(import.meta.url);
const {invoiceBillingCoverage,billingCoversProduction,annotateAssignmentInvoiceWorkflow}=require('../backend/dist/services/invoiceWorkflow.js');
const {orderWorkflowStatus,loadOrderWorkflowStatuses}=require('../backend/dist/services/orderWorkflow.js');
const {issueInvoiceDraft}=require('../backend/dist/services/invoiceIssueStore.js');
const order={id:1,orderId:'order-one',sellerOrgId:1,buyerOrgId:2,workOrderItems:[{id:5,styleId:7,totalQuantity:100,sizeQuantities:{S:40,M:60}}],priorCompletions:[]};
const statement={workOrderId:1,sourceOrderId:'order-one',billingPercentage:'100',invoice:{sellerOrgId:1,buyerOrgId:2,status:'ISSUED'},lines:[{workOrderItemId:5,sourceItemId:5,styleId:7,size:'S',quantity:40},{workOrderItemId:5,sourceItemId:5,styleId:7,size:'M',quantity:60}]};
const plans=[{externalId:'a',workOrderId:1,styleId:7,assignmentQuantity:40,orgId:1,isCompleted:true},{externalId:'b',workOrderId:1,styleId:7,assignmentQuantity:60,orgId:1,isCompleted:true}];
const progress=plans.map(plan=>({id:plan.externalId,workOrderId:1,styleId:7,plannedQuantity:plan.assignmentQuantity,producedQuantity:plan.assignmentQuantity,isCompleted:true}));
function fixture(statements=[statement],rows=progress){return {invoiceOrder:{findMany:async()=>statements},workOrder:{findMany:async()=>[order]},assignmentPlan:{findMany:async()=>plans},progress:async(_org,ids)=>rows.filter(row=>ids.includes(row.id))};}
test('100% of all original item/size FKs moves production-complete orders to collection without requiring payment',async()=>{
 const db=fixture();const statuses=await loadOrderWorkflowStatuses(db,[order],db.progress);assert.equal(statuses.get(1),'COLLECTION');
 const result=await annotateAssignmentInvoiceWorkflow(db,1,progress,db.progress);assert.ok(result.every(row=>row.isManagementClosed));assert.equal(progress.some(row=>'isManagementClosed' in row),false);
});
test('cumulative partial statements, wrong organizations, cancelled revisions and missing sizes cannot complete billing',()=>{
 const variants=[
  [{...statement,billingPercentage:'30'},{...statement,billingPercentage:'70'}],
  [{...statement,invoice:{...statement.invoice,status:'CANCELLED'}}],
  [{...statement,invoice:{...statement.invoice,status:'SUPERSEDED'}}],
  [{...statement,invoice:{...statement.invoice,sellerOrgId:3}}],
  [{...statement,invoice:{...statement.invoice,buyerOrgId:3}}],
  [{...statement,workOrderId:2}],
  [{...statement,lines:[statement.lines[0]]}],
  [{...statement,lines:statement.lines.map(line=>({...line,workOrderItemId:999}))}],
  [{...statement,lines:[{...statement.lines[0],quantity:100}]}],
 ];for(const rows of variants)assert.equal(invoiceBillingCoverage(order,rows).complete,false);
});
test('partial progress queries inspect sibling assignments before hiding a style',async()=>{
 const db=fixture();const result=await annotateAssignmentInvoiceWorkflow(db,1,[progress[0]],db.progress);assert.equal(result[0].isManagementClosed,true);
 const unfinished=[progress[0],{...progress[1],isCompleted:false,producedQuantity:59}];const pending=fixture([statement],unfinished);
 assert.equal((await annotateAssignmentInvoiceWorkflow(pending,1,[progress[0]],pending.progress))[0].isManagementClosed,false);
 assert.equal((await loadOrderWorkflowStatuses(pending,[order],pending.progress)).get(1),'PRODUCTION');
});
test('cancelling the invoice returns orders to billing and brings completed assignments back',async()=>{
 const db=fixture([{...statement,invoice:{...statement.invoice,status:'CANCELLED'}}]);assert.equal((await loadOrderWorkflowStatuses(db,[order],db.progress)).get(1),'BILLING');
 assert.ok((await annotateAssignmentInvoiceWorkflow(db,1,progress,db.progress)).every(row=>!row.isManagementClosed));
});
test('a fully invoiced style can close while another style on the same order still needs billing',async()=>{
 const mixed={...order,workOrderItems:[...order.workOrderItems,{id:6,styleId:8,totalQuantity:20}]};
 const db=fixture();db.workOrder.findMany=async()=>[mixed];
 const otherPlan={externalId:'c',workOrderId:1,orgId:1,styleId:8,assignmentQuantity:20,isCompleted:true};const allPlans=[...plans,otherPlan];
 const allRows=[...progress,{id:'c',workOrderId:1,styleId:8,plannedQuantity:20,producedQuantity:20,isCompleted:true}];db.assignmentPlan.findMany=async()=>allPlans;db.progress=async()=>allRows;
 const result=await annotateAssignmentInvoiceWorkflow(db,1,allRows,db.progress);
 assert.ok(result.slice(0,2).every(row=>row.isManagementClosed));assert.equal(result[2].isManagementClosed,false);
 assert.equal((await loadOrderWorkflowStatuses(db,[mixed],db.progress)).get(1),'BILLING');
});
test('excess unbilled production and rounded 100% do not close work',()=>{
 const coverage=invoiceBillingCoverage(order,[statement]);assert.equal(billingCoversProduction(coverage,{styles:[{styleId:7,producedQuantity:101}]}),false);
 assert.equal(orderWorkflowStatus({...order,isFullyInvoiced:true},plans,{isCompleted:false,assignments:[{completed:false},{completed:false}]}),'PRODUCTION');
});

test('30% and 100% advances can be issued before production finishes without closing orders or hiding assignments',async()=>{
 for(const percentage of ['30','100']){
  const date=new Date('2026-10-28T00:00:00Z'),invoices=[],ledger=[],settings=new Map();let finished=false,started=false;
  const advanceOrder={id:1,orderId:'advance',sellerOrgId:1,buyerOrgId:2,orderNumber:'ADV',updatedAt:date,priorCompletions:[],workOrderItems:[{id:5,styleId:7,totalQuantity:100,sizeQuantities:{S:100},style:{name:'Shirt',code:'S7'}}]};
  const content={fields:{number:'',date:'2026-10-28'},basis:'MANUFACTURING_SERVICE_PRICE',currency:'USD',orders:[{orderId:'advance',sourceUpdatedAt:date.toISOString()}],percentages:{advance:percentage},lines:[{key:JSON.stringify(['advance','5:S']),quantity:'100',unitPriceOverride:'10'}]};
  const plan={externalId:'a',workOrderId:1,styleId:7,orgId:1,assignmentQuantity:100,_count:{workRecords:1}};
  const rows=()=>[{id:'a',workOrderId:1,styleId:7,plannedQuantity:100,producedQuantity:finished?100:started?50:0,isCompleted:finished}];
  const db={invoiceDraft:{findFirst:async()=>({id:'draft',revision:1,buyerOrgId:2,content})},workOrder:{findMany:async()=>[advanceOrder]},orgRelationship:{findFirst:async()=>null},
   assignmentPlan:{findMany:async()=>[{...plan,isCompleted:finished,_count:{workRecords:started?1:0}}]},
   invoiceOrder:{findMany:async()=>ledger,findFirst:async()=>null,create:async({data})=>{const row={id:10,...data,invoice:invoices[0],lines:[]};ledger.push(row);return row;}},
   invoiceLine:{createMany:async({data})=>{ledger[0].lines.push(...data);}},
   invoice:{findFirst:async({where,orderBy})=>orderBy?invoices.at(-1):where.clientKey?invoices.find(row=>row.clientKey===where.clientKey):invoices.find(row=>row.invoiceNumber.toLowerCase()===where.invoiceNumber.equals.toLowerCase()),create:async({data})=>{const row={id:'issued',status:'ISSUED',...data};invoices.push(row);return row;}},
   systemSetting:{findUnique:async({where})=>settings.get(where.key)||null,upsert:async({where,update})=>settings.set(where.key,update)},$queryRawUnsafe:async()=>[]};
  db.$transaction=async fn=>fn(db);
  const invoice=await issueInvoiceDraft(db,1,'test','draft',1);assert.equal(invoice.total,percentage==='30'?'300.00':'1000.00');assert.equal(finished,false);
  const preview=applyOrderBillingPercentages({orders:[{orderId:'advance'}]},{total:'1000.00',issues:['PRODUCTION'],lines:[{orderId:'advance',quantity:100,amount:'1000.00'}]},{advance:percentage},{},'USD');
  assert.deepEqual(preview.issues,[]);assert.deepEqual(preview.warnings,['PRODUCTION']);
  assert.equal((await loadOrderWorkflowStatuses(db,[advanceOrder],async()=>rows())).get(1),'RECEIVED');
  started=true;
  assert.equal((await loadOrderWorkflowStatuses(db,[advanceOrder],async()=>rows())).get(1),'PRODUCTION');
  assert.equal((await annotateAssignmentInvoiceWorkflow(db,1,rows(),async()=>rows()))[0].isManagementClosed,false);
  finished=true;
  assert.equal((await loadOrderWorkflowStatuses(db,[advanceOrder],async()=>rows())).get(1),percentage==='100'?'COLLECTION':'BILLING');
  assert.equal((await annotateAssignmentInvoiceWorkflow(db,1,rows(),async()=>rows()))[0].isManagementClosed,percentage==='100');
 }
});
