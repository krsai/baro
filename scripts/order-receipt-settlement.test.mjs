import test from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
const require=createRequire(import.meta.url);
const {loadOrderReceiptSettlement}=require('../backend/dist/services/orderReceiptSettlement');
const {orderWorkflowStatus}=require('../backend/dist/services/orderWorkflow');
const order={id:1,orderId:'order-1',sellerOrgId:7,buyerOrgId:8};
const bill=(id='invoice-1',amount='100',orders=[order])=>({id,status:'ISSUED',sellerOrgId:7,buyerOrgId:8,currencyCode:'USD',receivableAdded:amount,credits:[],orders:orders.map(order=>({workOrderId:order.id,sourceOrderId:order.orderId}))});
const row=invoice=>({workOrderId:1,sourceOrderId:'order-1',invoice});
const cash=(amount,invoiceId='invoice-1',changes={})=>({invoiceId,orgId:7,amount,entry:{orgId:7,direction:'IN',voidedAt:null,account:{orgId:7,currencyCode:'USD'}},...changes});
async function settled({orders=[order],invoices=[bill()],allocations=[],ancestors=[],complete=true,viewer=7}={}){
 let reads=0;
 const db={invoiceOrder:{findMany:async()=>invoices.flatMap(invoice=>orders.filter(order=>invoice.orders.some(row=>row.workOrderId===order.id)).map(order=>({workOrderId:order.id,sourceOrderId:order.orderId,invoice})))},invoice:{findMany:async()=>ancestors},bankLedgerEvidenceAllocation:{findMany:async()=>{reads++;return allocations;}}};
 const result=await loadOrderReceiptSettlement(db,orders,new Map(orders.map(order=>[order.id,{complete}])),viewer);
 return {result,reads};
}
test('only fully billed orders with linked posted evidence settle; partials, unlinked legacy receipts and wrong currencies do not',async()=>{
 for(const allocations of [[],[cash('99.99')],[cash('100','unrelated')],[cash('100','invoice-1',{orgId:99})],[cash('100','invoice-1',{entry:{orgId:7,direction:'IN',voidedAt:'2026-11-27',account:{orgId:7,currencyCode:'USD'}}})],[cash('100','invoice-1',{entry:{orgId:7,direction:'IN',voidedAt:null,account:{orgId:7,currencyCode:'VND'}}})]])assert.equal((await settled({allocations})).result.get(1),false);
 assert.equal((await settled({allocations:[cash('25'),cash('75')]})).result.get(1),true);
 assert.equal((await settled({allocations:[cash('100')],complete:false})).reads,0);
 assert.equal((await settled({allocations:[cash('100')],viewer:8})).reads,0);
 assert.equal((await settled({invoices:[{...bill(),buyerOrgId:99}],allocations:[cash('100')]})).reads,0);
});
test('refunds reopen settlement; cumulative statements settle only their actual order in each currency',async()=>{
 assert.equal((await settled({allocations:[cash('100'),cash('1','invoice-1',{entry:{orgId:7,direction:'OUT',voidedAt:null,account:{orgId:7,currencyCode:'USD'}}})]})).result.get(1),false);
 assert.equal((await settled({invoices:[bill('first','50'),bill('last','50')],allocations:[cash('30','first'),cash('70','last')]})).result.get(1),true);
 assert.equal((await settled({invoices:[bill('first','30'),bill('last','70')],allocations:[cash('30','first'),cash('70','last')]})).result.get(1),true);
 assert.equal((await settled({invoices:[bill('zero','0')]})).result.get(1),false);
});
test('partial receipts on a multi-order invoice are never divided across orders without an allocation FK',async()=>{
 const orders=[order,{...order,id:2,orderId:'order-2'}],invoice=bill('multi','150',orders);
 const partial=await settled({orders,invoices:[invoice],allocations:[cash('100','multi')]});assert.deepEqual([...partial.result.values()],[false,false]);
 const full=await settled({orders,invoices:[invoice],allocations:[cash('150','multi')]});assert.deepEqual([...full.result.values()],[true,true]);
});
test('historical revision evidence counts once only within its actual company, currency and order set',async()=>{
 const original=bill('original'),current={...bill('revision'),rootInvoiceId:'original'};
 assert.equal((await settled({invoices:[current],ancestors:[original],allocations:[cash('100','original')]})).result.get(1),true);
 for(const other of [{...original,sellerOrgId:99},{...original,currencyCode:'VND'},{...original,orders:[{workOrderId:99,sourceOrderId:'different'}]}])assert.equal((await settled({invoices:[current],ancestors:[other],allocations:[cash('100','original')]})).result.get(1),false);
});
test('closed is a financial or seller exclusion projection and never fabricates production completion',()=>{
 assert.equal(orderWorkflowStatus({...order,isBillingComplete:true,isReceiptSettled:true},[],undefined,7),'COMPLETED');
 assert.equal(orderWorkflowStatus({...order,isBillingComplete:false,isReceiptSettled:true},[],undefined,7),'RECEIVED');
 assert.equal(orderWorkflowStatus({...order,invoiceTargetPolicy:{orgId:7,excluded:true}},[],undefined,7),'COMPLETED');
 assert.equal(orderWorkflowStatus({...order,invoiceTargetPolicy:{orgId:7,excluded:true}},[],undefined,8),'RECEIVED');
 assert.equal(orderWorkflowStatus({...order,invoiceTargetPolicy:{orgId:7,excluded:false}},[],undefined,7),'RECEIVED');
 assert.equal(order.status,undefined);
});
