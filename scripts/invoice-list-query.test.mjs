import test from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
const require=createRequire(import.meta.url);
const {registerInvoiceDraftRoutes}=require('../backend/dist/routes/invoiceDraft.routes.js');
function harness(){
 const handlers=new Map(),calls=[];const app={};for(const method of ['get','post','put','delete'])app[method]=(path,handler)=>handlers.set(`${method}:${path}`,handler);
 registerInvoiceDraftRoutes(app,{db:{invoice:{findMany:async input=>{calls.push(input);return [];}}},requireAccess:async()=>({organization:{id:7}}),actor:()=> 'actor'});
 return {calls,run:async query=>{let status=200,body;const res={setHeader(){},status(value){status=value;return this;},json(value){body=value;return this;}};await handlers.get('get:/invoices/issued')({query},res);return {status,body};}};
}
test('invoice list searches before pagination and preserves seller scope and original-order lookup',async()=>{
 const app=harness();const result=await app.run({page:'2',search:'PO-1',status:'ISSUED'});
 assert.equal(result.status,200);const query=app.calls[0];assert.equal(query.where.sellerOrgId,7);assert.equal(query.where.status,'ISSUED');assert.equal(query.skip,60);assert.equal(query.take,31);
 assert.deepEqual(query.orderBy,[{issuedAt:'desc'},{id:'desc'}]);
 assert.ok(query.where.OR.some(item=>item.invoiceNumber?.contains==='PO-1'));assert.ok(query.where.OR.some(item=>item.orders?.some.sourceOrderNumber.contains==='PO-1'));
 assert.ok(query.where.OR.some(item=>item.snapshot?.path.join('.')==='fields.buyer.name'));
 const buyer=query.where.OR.find(item=>item.buyer).buyer;
 assert.ok(buyer.OR.some(item=>item.code?.contains==='PO-1'));
 assert.equal(buyer.OR.find(item=>item.localCompanyLinks).localCompanyLinks.some.orgId,7);
 assert.equal(buyer.OR.find(item=>item.identityLinks).identityLinks.some.orgId,7);
 assert.ok(query.where.OR.some(item=>item.snapshot?.path.join('.')==='fields.buyer.code'));
});
test('invalid status or oversized search never queries invoices',async()=>{
 for(const query of [{status:'DRAFT'},{search:'x'.repeat(201)},{page:'-1'},{start:'invalid'},{start:'2026-11-10',end:'2026-11-01'}]){const app=harness();assert.equal((await app.run(query)).status,400);assert.equal(app.calls.length,0);}
});
test('invoice date range filters before paging and includes the whole local end day',async()=>{
 const app=harness();await app.run({start:'2026-11-01',end:'2026-11-10',page:1});const query=app.calls[0];assert.equal(query.skip,30);assert.equal(query.where.issuedAt.gte.toISOString(),'2026-10-31T17:00:00.000Z');assert.equal(query.where.issuedAt.lt.toISOString(),'2026-11-10T17:00:00.000Z');
});
