import test from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
const require=createRequire(import.meta.url);
const {revenueStyleReport,revenueStyles}=require('../backend/dist/services/revenueStyleAnalysis.js');
test('standalone styles use the entered quantity bucket and historical approved costs per garment, without creating an order',async()=>{
 const buckets=[1,100,1000],entries=buckets.map(bucketQuantity=>({bucketQuantity}));
 const relationship={salesBucketSetVersion:{id:7,entries},salesPriceLists:[{styleId:3,pricingBasis:'MANUFACTURING_SERVICE_PRICE',currency:{code:'USD'},quantityBucketSetVersionId:7,prices:buckets.map((bucketQuantity,index)=>({quantityBucketEntry:{bucketQuantity},unitPrice:[12,10,8][index]}))}]};
 const base={id:'a',workOrderId:4,styleId:3,expenseRequestId:10,referenceLinks:[],subtotal:'50000',amount:'50000',currency:'VND',transactionDate:'2026-11-01',expenseRequest:{managementNumber:'EXP-10'}};
 const db={style:{findFirst:async({where})=>where.orgId===1&&where.id===3?{id:3,code:'STYLE',name:'Style',customerOrgId:2,customerOrganization:{name:'Customer'}}:null,findMany:async({where})=>{assert.equal(where.orgId,1);return [{id:3,code:'STYLE',name:'Style',customerOrganization:{name:'Customer'}}];}},orgRelationship:{findFirst:async({where})=>{assert.deepEqual(where,{manufacturerOrgId:1,brandOrgId:2});return relationship;}},styleProcessVersion:{findFirst:async()=>null},partnerTransactionCost:{findMany:async({where})=>{assert.equal(where.orgId,1);return [base,{...base,id:'b',workOrderId:5,subtotal:'270000'},{...base,id:'shared',referenceLinks:[{workOrderId:4,styleId:3},{workOrderId:5,styleId:3}]},{...base,id:'pending',expenseRequestId:11,subtotal:'9999999'}];}},workOrderItem:{findMany:async({where})=>{assert.deepEqual(where,{styleId:3,workOrder:{orgId:1}});return [{workOrderId:4,totalQuantity:100},{workOrderId:5,totalQuantity:900}];}},expenseRequest:{findFirst:async({where})=>({id:where.id,orgId:1,version:1,createdByEmployeeId:9,createdByEmployee:{id:9,orgId:1,status:'ACTIVE',orgRole:'ADMIN'},approvalSteps:where.id===11?[{employeeId:8,position:1}]:[]})},expenseApprovalDecision:{findMany:async()=>[]},expenseRequestAudit:{findFirst:async()=>({afterSnapshot:{approvalPolicy:{exempt:true,drafterId:9}}})}};
 const gates={loadCurrentProcesses:async()=>[{}],resolveTimes:(_processes,items)=>{assert.equal(items[0].styleId,3);return {ST:600,PT:500};}};
 const result=await revenueStyleReport(db,1,3,500,null,gates);
 assert.equal(result.order.id,null);assert.equal(result.styles[0].quantity,500);assert.equal(result.styles[0].salePrice,10);assert.equal(result.styles[0].salesAmount,5000);assert.equal(result.styles[0].sources.estimatedPurchases[0].unitCost,320);assert.equal(result.styles[0].sources.estimatedPurchases[0].quantityBasis,1000);assert.equal(result.styles[0].sources.estimatedPurchases[0].orderCount,2);
 const larger=await revenueStyleReport(db,1,3,1000,'M',gates);assert.equal(larger.styles[0].salePrice,8);assert.equal(larger.styles[0].salesAmount,8000);
 assert.equal((await revenueStyles(db,1,'STYLE')).styles[0].customer,'Customer');
 await assert.rejects(revenueStyleReport(db,2,3,100,null,gates),/PROFIT_TARGET_NOT_FOUND/);
});
