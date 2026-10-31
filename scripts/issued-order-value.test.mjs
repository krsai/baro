import test from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import fs from 'node:fs';
const require=createRequire(import.meta.url),ts=require('../backend/node_modules/typescript');
const {loadIssuedOrderSalesValues}=require('../backend/dist/services/issuedOrderSalesValue.js');
const {calculateOrderSalesValue}=require('../backend/dist/utils/orderSalesValue.js');
const order={id:10,orderId:'order-a',sellerOrgId:1,buyerOrgId:2,workOrderItems:[{styleId:7,totalQuantity:100}]};
const line=(extra={})=>({id:1,styleId:7,styleCode:'S',styleName:'Style',quantity:100,bucketQuantity:100,unitPrice:'2.1234',amount:'212.34',...extra});
const issued=(extra={})=>({workOrderId:10,sourceOrderId:'order-a',basisAmount:'212.34',lines:[line()],invoice:{id:'i2',sellerOrgId:1,buyerOrgId:2,status:'ISSUED',sequenceNumber:2,invoiceNumber:'INV-2',currencyCode:'USD',pricingBasis:'MANUFACTURING_SERVICE_PRICE'},...extra});
const source=fs.readFileSync('backend/src/index.ts','utf8'),ast=ts.createSourceFile('index.ts',source,ts.ScriptTarget.Latest,true);let loaderSource;
function visit(node){if(ts.isVariableDeclaration(node)&&node.name.getText(ast)==='loadCurrentOrderValueByOrderDbId')loaderSource='const '+node.getText(ast)+';';ts.forEachChild(node,visit);}visit(ast);
const load=(db,orders)=>new Function('prisma','ensureArray','toPositiveIntOrNull','calculateOrderSalesValue','loadIssuedOrderSalesValues',ts.transpileModule(loaderSource,{compilerOptions:{target:ts.ScriptTarget.ES2022}}).outputText+';return loadCurrentOrderValueByOrderDbId;')(db,v=>Array.isArray(v)?v:[],v=>Number(v)>0?Number(v):null,calculateOrderSalesValue,loadIssuedOrderSalesValues)(orders,db);
function fixture(rows=[]){let price='2';const db={invoiceOrder:{findMany:async args=>{assert.deepEqual(args.where.OR[0],{workOrderId:10,invoice:{sellerOrgId:1,buyerOrgId:2,status:'ISSUED'}});return rows;}},orgRelationship:{findMany:async()=>[{manufacturerOrgId:1,brandOrgId:2,salesBucketSetVersion:{id:1,entries:[{bucketQuantity:100}]},salesBucketOverrides:[],salesPriceLists:[{styleId:7,quantityBucketSetVersionId:1,pricingBasis:'MANUFACTURING_SERVICE_PRICE',currency:{code:'USD'},prices:[{unitPrice:price,quantityBucketEntry:{bucketQuantity:100}}]}]}]}};return {db,change:value=>{price=value;}};}
test('current prices update unissued orders, but issued, collection and closed values retain exact invoice prices',async()=>{
 const active=fixture();assert.equal((await load(active.db,[order])).get(10).amount,200);active.change('9');assert.equal((await load(active.db,[order])).get(10).amount,900);
 const fixed=fixture([issued()]);const before=(await load(fixed.db,[order])).get(10);fixed.change('9');assert.deepEqual((await load(fixed.db,[order])).get(10),before);assert.equal(before.amount,'212.34');assert.equal(before.lines[0].unitPrice,'2.1234');assert.equal(before.source,'ISSUED_INVOICE');
 const closed={...order,invoiceFinalLockedAt:new Date(),invoiceFinalLockInvoiceId:'i2'};assert.equal((await load(fixed.db,[closed])).get(10).amount,'212.34');
});
test('partial and multi-order invoices use one order basis, never invoice totals or summed installments',async()=>{
 const latest=issued({basisAmount:'1000.00',billedAmount:'500',billingPercentage:'50'}),previous=issued({basisAmount:'1000.00',billedAmount:'300',billingPercentage:'30',invoice:{...issued().invoice,id:'i1',sequenceNumber:1}});
 const other=issued({workOrderId:11,sourceOrderId:'other',basisAmount:'99999'});
 const result=(await loadIssuedOrderSalesValues({invoiceOrder:{findMany:async()=>[latest,previous,other]}},[order])).get(10);assert.equal(result.amount,'1000.00');assert.equal(result.invoiceId,'i2');
});
test('revisions use active issued rows, final locks retain their evidence, and missing locked history never falls back to live pricing',async()=>{
 const old=issued({invoice:{...issued().invoice,id:'old',status:'SUPERSEDED',sequenceNumber:1}}),cancelled=issued({basisAmount:'999',invoice:{...issued().invoice,status:'CANCELLED',sequenceNumber:3}}),revision=issued({basisAmount:'300'});
 const f=fixture([cancelled,revision,old]);assert.equal((await load(f.db,[order])).get(10).amount,'300');
 const missing={...order,invoiceFinalLockedAt:new Date(),invoiceFinalLockInvoiceId:'missing'};const result=(await load(f.db,[missing])).get(10);assert.equal(result.status,'MISSING_PRICE');assert.equal(result.amount,null);assert.equal(result.source,'ISSUED_INVOICE');
 const activeOlder=issued({basisAmount:'150',invoice:{...issued().invoice,id:'locked',sequenceNumber:1}});const values=await loadIssuedOrderSalesValues({invoiceOrder:{findMany:async()=>[revision,activeOlder]}},[{...order,invoiceFinalLockedAt:new Date(),invoiceFinalLockInvoiceId:'locked'}]);assert.equal(values.get(10).amount,'150');
});
test('snapshot line grouping preserves separate manual prices and exact decimal amounts',async()=>{
 const row=issued({lines:[line({quantity:1,amount:'0.1000'}),line({id:2,quantity:2,amount:'0.2000'}),line({id:3,quantity:1,unitPrice:'3.0000',amount:'3.0000'})]});
 const value=(await loadIssuedOrderSalesValues({invoiceOrder:{findMany:async()=>[row]}},[order])).get(10);assert.equal(value.lines.length,2);assert.equal(value.lines[0].quantity,3);assert.equal(value.lines[0].amount,'0.3');assert.notEqual(value.lines[0].key,value.lines[1].key);
});
test('matching requires the original order FK and exact seller, buyer and source identity',async()=>{
 const invalid=[issued({workOrderId:99}),issued({sourceOrderId:'wrong'}),issued({invoice:{...issued().invoice,sellerOrgId:9}}),issued({invoice:{...issued().invoice,buyerOrgId:9}})];
 assert.equal((await loadIssuedOrderSalesValues({invoiceOrder:{findMany:async()=>invalid}},[order])).size,0);
});
