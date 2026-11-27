import test from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {createRequire} from 'node:module';
import {changeApprovalFixture,seedChangeApproval} from './helpers/change-approval-fixture.mjs';
const require=createRequire(import.meta.url);
const {loadOrderListCandidates}=require('../backend/dist/services/orderListCandidates');
const {saveManagementTargets}=require('../backend/dist/services/managementTargets');
const access=orgId=>[{orgId},{sellerOrgId:orgId},{buyerOrgId:orgId}];

test('SQL omits seller policy closures before billing reads, preserving buyer scope, legacy NULL sellers and full history',async()=>{
 const f=await changeApprovalFixture();try{
  const db=f.db,s=await seedChangeApproval(db),org=s.company.id;
  await db.organization.update({where:{id:org},data:{type:'MANUFACTURER'}});
  const make=(seller=org)=>db.workOrder.create({data:{orgId:org,sellerOrgId:seller,buyerOrgId:s.other.id,orderId:randomUUID(),orderNumber:randomUUID()}});
  const open=await make(),legacy=await make(null),closed=await make();
  await db.workOrder.create({data:{orgId:s.vendor.id,sellerOrgId:s.vendor.id,orderId:randomUUID(),orderNumber:'UNRELATED'}});
  await saveManagementTargets(db,org,s.people.admin.id,'INVOICE',{rows:[{id:closed.id,excluded:true,revision:0,clientKey:randomUUID()}]});
  const requested=[];
  const tracked={workOrder:db.workOrder,invoiceOrder:{findMany:args=>{requested.push(args.where.workOrderId.in);return db.invoiceOrder.findMany(args);}}};
  const include={invoiceTargetPolicy:true,workOrderItems:true};
  const active=await loadOrderListCandidates(tracked,org,access(org),include,true);
  assert.deepEqual(new Set(active.orders.map(row=>row.id)),new Set([open.id,legacy.id]));
  assert.ok(requested.every(ids=>!ids.includes(closed.id)),'closed orders never enter billing/receipt work');
  const all=await loadOrderListCandidates(db,org,access(org),include,false);
  assert.equal(all.orders.length,3);
  const buyer=await loadOrderListCandidates(db,s.other.id,access(s.other.id),include,true);
  assert.ok(buyer.orders.some(row=>row.id===closed.id),'seller exclusion does not close the buyer view');
 }finally{await f.close();}
});

test('posted full settlement is removed before enrichment; partial payments, refunds and legacy status remain visible',async()=>{
 const orders=[1,2,3].map(id=>({id,orderId:'order-'+id,sellerOrgId:7,buyerOrgId:8,status:'COMPLETED',workOrderItems:[{id,styleId:1,totalQuantity:10,sizeQuantities:{S:10}}]}));
 const statements=orders.map(order=>({workOrderId:order.id,sourceOrderId:order.orderId,billingPercentage:100,lines:[{workOrderItemId:order.id,sourceItemId:order.id,styleId:1,size:'S',quantity:10}],invoice:{id:'invoice-'+order.id,status:'ISSUED',sellerOrgId:7,buyerOrgId:8,currencyCode:'USD',receivableAdded:'10',credits:[],orders:[{workOrderId:order.id,sourceOrderId:order.orderId}]}}));
 let paid='10';
 const db={workOrder:{findMany:async()=>orders},invoiceOrder:{findMany:async()=>statements},bankLedgerEvidenceAllocation:{findMany:async()=>[1,2].map(id=>({invoiceId:'invoice-'+id,orgId:7,amount:id===1?paid:'5',entry:{orgId:7,voidedAt:null,direction:'IN',account:{orgId:7,currencyCode:'USD'}}}))}};
 const load=exclude=>loadOrderListCandidates(db,7,access(7),{},exclude);
 assert.deepEqual((await load(true)).orders.map(row=>row.id),[2,3]);
 assert.equal((await load(false)).orders.length,3);
 paid='0';
 assert.deepEqual((await load(true)).orders.map(row=>row.id),[1,2,3],'refund reopens order on fresh read');
});
