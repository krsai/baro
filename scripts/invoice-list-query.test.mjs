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
 assert.ok(query.where.OR.some(item=>item.invoiceNumber?.contains==='PO-1'));assert.ok(query.where.OR.some(item=>item.orders?.some.sourceOrderNumber.contains==='PO-1'));
 assert.ok(query.where.OR.some(item=>item.snapshot?.path.join('.')==='fields.buyer.name'));
});
test('invalid status or oversized search never queries invoices',async()=>{
 for(const query of [{status:'DRAFT'},{search:'x'.repeat(201)},{page:'-1'}]){const app=harness();assert.equal((await app.run(query)).status,400);assert.equal(app.calls.length,0);}
});
