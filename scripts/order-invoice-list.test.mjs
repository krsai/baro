import test from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {createRequire} from 'node:module';
import {changeApprovalFixture,seedChangeApproval} from './helpers/change-approval-fixture.mjs';
const require=createRequire(import.meta.url);
const {orderInvoiceListScope,loadOrderInvoiceCounts}=require('../backend/dist/services/orderInvoiceList');
const {registerInvoiceDraftRoutes}=require('../backend/dist/routes/invoiceDraft.routes');
test('order invoice navigation counts and filters actual company/order FKs before pagination, across dates and duplicate order numbers',async()=>{
 const f=await changeApprovalFixture({registration:true});try{
  const db=f.db,s=await seedChangeApproval(db),org=s.company.id;
  const makeOrder=(seller,orderNumber='SAME-NUMBER')=>db.workOrder.create({data:{orgId:seller,sellerOrgId:seller,buyerOrgId:s.vendor.id,orderId:randomUUID(),orderNumber}});
  const a=await makeOrder(org),b=await makeOrder(org,'SECOND'),foreign=await makeOrder(s.other.id),empty=await makeOrder(org,'EMPTY');
  let sequence=0;
  const makeInvoice=async(order,status='ISSUED')=>{
   const invoice=await db.invoice.create({data:{sellerOrgId:order.sellerOrgId,buyerOrgId:s.vendor.id,invoiceNumber:'INV-NAV-'+(++sequence),clientKey:randomUUID(),sequenceNumber:sequence,pricingBasis:'MANUFACTURING_SERVICE_PRICE',currencyCode:'USD',subtotal:'100',total:'30',receivableAdded:'30',status,issuedAt:new Date('2020-01-02'),issuedBy:'actor',snapshot:{fields:{buyer:{name:'Frozen Buyer'}},orders:[],lines:[]}}});
   await db.invoiceOrder.create({data:{invoiceId:invoice.id,workOrderId:order.id,sourceOrderId:order.orderId,sourceOrderNumber:order.orderNumber,sourceUpdatedAt:order.updatedAt,billingPercentage:'30',basisAmount:'100',billedAmount:'30',installmentNumber:sequence,netAmount:'30',receivableAdded:'30'}});
   return invoice;
  };
  const first=await makeInvoice(a),cancelled=await makeInvoice(a,'CANCELLED');
  for(let n=0;n<31;n++)await makeInvoice(b);
  await makeInvoice(foreign);
  await db.invoiceDraft.create({data:{sellerOrgId:org,buyerOrgId:s.vendor.id,clientKey:randomUUID(),createdBy:'actor',updatedBy:'actor',content:{orders:[{orderId:empty.orderId}]}}});
  const counts=await loadOrderInvoiceCounts(db,org,[a,b,foreign,empty]);assert.equal(counts.get(a.id),2);assert.equal(counts.get(b.id),31);assert.equal(counts.get(foreign.id),undefined);assert.equal(counts.get(empty.id)||0,0);
  assert.equal((await orderInvoiceListScope(db,org,a.orderId)).id,a.id);
  await assert.rejects(orderInvoiceListScope(db,org,foreign.orderId),/INVOICE_ORDER_NOT_FOUND/);
  await assert.rejects(orderInvoiceListScope(db,org,a.orderNumber),/INVOICE_ORDER_NOT_FOUND/);
  const routes=new Map(),app={get:(path,fn)=>routes.set(path,fn),post(){},put(){},delete(){}};
  registerInvoiceDraftRoutes(app,{db,requireAccess:async()=>({organization:s.company,employee:s.people.admin}),actor:()=> 'actor'});
  const list=async query=>{let value;await routes.get('/invoices/issued')({query},{setHeader(){},json(result){value=result;return this;},status(){return this;}});return value;};
  const scoped=await list({orderId:a.orderId});assert.deepEqual(new Set(scoped.rows.map(row=>row.id)),new Set([first.id,cancelled.id]));assert.equal(scoped.hasMore,false);assert.equal(scoped.orderScope.orderId,a.orderId);assert.equal(scoped.orderScope.orderNumber,a.orderNumber);
  assert.equal((await list({orderId:b.orderId})).rows.length,30);assert.equal((await list({orderId:b.orderId,page:'1'})).rows.length,1);
  assert.equal((await list({orderId:a.orderId,start:'2026-01-01'})).rows.length,0);
  await assert.rejects(list({orderId:foreign.orderId}),/INVOICE_ORDER_NOT_FOUND/);
 }finally{await f.close();}
});
