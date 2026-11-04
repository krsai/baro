import test from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
const require=createRequire(import.meta.url);
const dbModule=require.resolve('../backend/dist/db.js');require.cache[dbModule]={id:dbModule,filename:dbModule,loaded:true,exports:{prisma:{}}};
const {profitSources,profitCatalog,profitOrderReport,registerRevenueAnalysisRoutes,validateProfitInputs}=require('../backend/dist/services/revenueAnalysis.js');
function harness(){
 let stored=null,writes=0;const handlers=new Map(),queries=[];
 const db={employee:{findFirst:async()=>({id:9,orgId:1,orgRole:'ADMIN'})},systemSetting:{findUnique:async()=>stored,upsert:async({create,update})=>{writes++;stored={value:stored?update.value:create.value};return stored;}},style:{findFirst:async({where})=>where.orgId===1&&where.id===3?{id:3}:null},workOrderItem:{findFirst:async({where})=>where.workOrderId===2&&where.styleId===3?{id:1}:null},$queryRawUnsafe:async(...args)=>{queries.push(args);},$transaction:async fn=>fn(db)};
 let allowed=true,active=true;
 db.employee.findFirst=async()=>active?{id:9,orgId:1,orgRole:'ADMIN'}:null;
 const gates={requireOrgRole:async(_req,_res,options)=>{assert.equal(options.allowSystemAdmin,false);return {organization:{id:1,type:'MANUFACTURER'}};},actorId:()=>9,loadPolicy:async()=>({policy:{MANUFACTURER:{ADMIN:allowed?['REVENUE_ANALYSIS']:[]}}})};
 registerRevenueAnalysisRoutes({post:(p,f)=>handlers.set('POST '+p,f),get:(p,f)=>handlers.set('GET '+p,f),put:(p,f)=>handlers.set('PUT '+p,f)},db,gates);
 const call=async(method,path,body)=>{const res={json(value){this.value=value;}};await handlers.get(method+' '+path)({query:{},body},res);return res.value;};
 return {db,call,queries,writes:()=>writes,deny:()=>{allowed=false;},inactive:()=>{active=false;}};
}
test('company settings are explicit writes with revision locking; read does not seed defaults',async()=>{
 const h=harness();assert.deepEqual(await h.call('GET','/revenue-analysis/scenarios'),{revision:0,defaults:{},stylePackaging:{},scenarios:[]});assert.equal(h.writes(),0);
 const body={revision:0,defaults:{currency:'VND',polyUsage:1,boxCapacity:50},stylePackaging:{3:{polyUsage:2,currency:'VND'}},scenarios:[{id:'scenario-001',name:'Order style',orderId:2,styleId:3,inputs:{basis:'PT',quantity:100,ptSeconds:''}}]};
 const saved=await h.call('PUT','/revenue-analysis/scenarios',body);assert.equal(saved.revision,1);assert.equal(saved.scenarios[0].inputs.ptSeconds,'');assert.ok(h.queries[0][0].includes('FOR UPDATE'));
 await assert.rejects(h.call('PUT','/revenue-analysis/scenarios',body),/PROFIT_SETTINGS_CHANGED/);assert.equal(h.writes(),1);
 await assert.rejects(h.call('PUT','/revenue-analysis/scenarios',{...body,revision:1,stylePackaging:{88:{polyUsage:2}}}),/PROFIT_TARGET_NOT_FOUND/);
 await assert.rejects(h.call('PUT','/revenue-analysis/scenarios',{...body,revision:1,scenarios:[{...body.scenarios[0],orderId:99}]}),/PROFIT_TARGET_NOT_FOUND/);
});
test('API rejects absent explicit feature access, inactive members and invalid numeric payloads',async()=>{
 const denied=harness();denied.deny();await assert.rejects(denied.call('GET','/revenue-analysis/scenarios'),/PROFIT_ACCESS_DENIED/);
 const inactive=harness();inactive.inactive();await assert.rejects(inactive.call('GET','/revenue-analysis/scenarios'),/PROFIT_ACCESS_DENIED/);
 for(const inputs of [{quantity:-1},{quantity:'NaN'},{currency:'EUR'},{basis:'AT'},{unexpected:1},{quantity:true}])assert.throws(()=>validateProfitInputs(inputs),/INVALID_PROFIT_SCENARIO/);
});
test('only approved single-target rows feed weighted unit prices; currencies, units, vendors and processes stay separate',async()=>{
 const base={id:'a',orgId:1,workOrderId:2,styleId:3,referenceLinks:[],partner:{name:'Vendor'},partnerOrgId:7,unit:{id:1,nameEn:'Piece'},currency:'VND',quantity:'100',subtotal:'50000',amount:'55000',transactionCode:{code:'OUT'},processLinks:[],styleProcessId:4,expenseRequestId:10,expenseRequest:{managementNumber:'EXP-10'},transactionDate:'2026-11-01'};
 const costs=[base,{...base,id:'b',quantity:'900',subtotal:'270000'}, {...base,id:'shared',referenceLinks:[{workOrderId:2,styleId:3},{workOrderId:2,styleId:8}]},{...base,id:'pending',expenseRequestId:11}, {...base,id:'USD',currency:'USD'},{...base,id:'unit',unit:{id:2}},{...base,id:'vendor',partnerOrgId:9},{...base,id:'process',styleProcessId:5}];
 const queries=[];
 const db={workOrder:{findFirst:async({where})=>{assert.deepEqual(where,{id:2,orgId:1});return {workOrderItems:[{styleId:3,totalQuantity:1000}]};}},styleProcessVersion:{findFirst:async()=>({versionNumber:2,processSnapshot:[]})},partnerTransactionCost:{findMany:async query=>{queries.push(query);return costs;}},expenseRequest:{findFirst:async({where})=>({id:where.id,orgId:1,version:1,createdByEmployeeId:9,createdByEmployee:{id:9,orgId:1,status:'ACTIVE',orgRole:'ADMIN'},approvalSteps:where.id===11?[{employeeId:8,position:1}]:[]})},expenseApprovalDecision:{findMany:async()=>[]},expenseRequestAudit:{findFirst:async()=>({afterSnapshot:{approvalPolicy:{exempt:true,drafterId:9}}})}};
 const result=await profitSources(db,1,2,3,{resolveTimes:()=>({ST:600,PT:null})});
 assert.equal(result.times.PT,null);assert.equal(result.averages.length,5);const average=result.averages.find(row=>row.count===2);assert.equal(average.unitPrice,320);assert.equal(average.quantity,1000);
 assert.equal(result.costs.find(row=>row.id==='pending').approved,false);assert.equal(result.costs.find(row=>row.id==='shared').exact,false);assert.equal(result.costs.find(row=>row.id==='shared').withinOrder,true);
 assert.deepEqual(queries[0].where.AND,[{OR:[{expenseRequestId:null},{expenseRequest:{deletedAt:null}}]}]);
 await assert.rejects(profitSources(db,1,2,99,{}),/PROFIT_TARGET_NOT_FOUND/);
});
test('catalog groups order styles using relational items and never imports another company style',async()=>{
 const db={workOrder:{findMany:async({where})=>{assert.deepEqual(where,{orgId:1});return [{id:2,workOrderItems:[{styleId:3,totalQuantity:100,style:{id:3,code:'S',name:'Style',orgId:1}},{styleId:3,totalQuantity:50,style:{id:3,code:'S',name:'Style',orgId:1}},{styleId:99,totalQuantity:500,style:{id:99,orgId:8}}]}];}},invoiceOrder:{findMany:async()=>[]}};
 const result=await profitCatalog(db,1,{});assert.equal(result.rows.length,1);assert.equal(result.rows[0].quantity,150);assert.equal(result.rows[0].salePrice,null);
});

test('catalog uses the existing order sales resolver for current prices as well as frozen invoices',async()=>{
 const order={id:2,orderNumber:'SAVED-2',workOrderItems:[{styleId:3,totalQuantity:150,style:{id:3,code:'S',name:'Style',orgId:1}}]},db={workOrder:{findMany:async()=>[order]}};
 for(const source of ['CURRENT_PRICE','ISSUED_INVOICE']){
  const result=await profitCatalog(db,1,{loadSalesValues:async(orders,client)=>{assert.equal(client,db);assert.equal(orders[0].id,2);return new Map([[2,{source,status:'AVAILABLE',amount:'750',currencyCode:'USD',lines:[{styleId:3,quantity:150,unitPrice:'5',amount:'750',status:'AVAILABLE'}]}]]);}});
  assert.equal(result.orders[0].salesAmount,'750');assert.equal(result.rows[0].salesAmount,750);assert.equal(result.rows[0].salePrice,5);assert.equal(result.rows[0].priceSource,source);
 }
});

test('real Prisma queries load scoped order styles and read-only sources; scenario revisions persist without financial writes',async()=>{
 const {changeApprovalFixture,seedChangeApproval}=await import('./helpers/change-approval-fixture.mjs');
 const f=await changeApprovalFixture();try{
  const s=await seedChangeApproval(f.db),orgId=s.company.id;
  const style=await f.db.style.create({data:{orgId,customerOrgId:s.vendor.id,code:'PROFIT_STYLE',name:'Profit style'}});
  const order=await f.db.workOrder.create({data:{orgId,orderId:'profit-order',orderNumber:'PROFIT-1',buyerOrgId:s.vendor.id,sellerOrgId:orgId,workOrderItems:{create:[{styleId:style.id,totalQuantity:100},{styleId:style.id,totalQuantity:50}]}}});
  const catalog=await profitCatalog(f.db,orgId,{});assert.equal(catalog.rows[0].quantity,150);
  const sources=await profitSources(f.db,orgId,order.id,style.id,{});assert.deepEqual(sources.times,{ST:null,PT:null});assert.deepEqual(sources.costs,[]);
  const report=await profitOrderReport(f.db,orgId,order.id,{});assert.equal(report.order.id,order.id);assert.equal(report.styles[0].quantity,150);
  await assert.rejects(profitSources(f.db,s.other.id,order.id,style.id,{}),/PROFIT_TARGET_NOT_FOUND/);
  const routes=new Map();registerRevenueAnalysisRoutes({post:(p,fn)=>routes.set('POST '+p,fn),get:(p,fn)=>routes.set('GET '+p,fn),put:(p,fn)=>routes.set('PUT '+p,fn)},f.db,{requireOrgRole:async()=>({organization:s.company}),actorId:()=>s.people.admin.id,loadPolicy:async()=>({policy:{SERVICE:{ADMIN:['REVENUE_ANALYSIS']}}})});
  const reportResponse={json(value){this.value=value;}};await routes.get('GET /revenue-analysis/orders/:id')({params:{id:String(order.id)}},reportResponse);assert.equal(reportResponse.value.styles[0].quantity,150);
  const laborResponse={json(value){this.value=value;}};await routes.get('GET /revenue-analysis/labor-basis')({query:{month:'2026-11'}},laborResponse);assert.deepEqual(laborResponse.value.factories,[]);
  const singleResponse={json(value){this.value=value;}};await routes.get('POST /revenue-analysis/style-analysis')({body:{styleId:style.id,quantity:200}},singleResponse);assert.equal(singleResponse.value.styles[0].quantity,200);assert.equal(singleResponse.value.styles[0].analysisMode,'STYLE');assert.equal(await f.db.workOrder.count(),1);
  await routes.get('GET /revenue-analysis/styles')({query:{search:'Vendor'}},singleResponse);assert.equal(singleResponse.value.styles[0].id,style.id);
  await assert.rejects(routes.get('POST /revenue-analysis/style-analysis')({body:{styleId:style.id,quantity:0}},singleResponse),/INVALID_PROFIT_SCENARIO/);
  const styleSaved={revision:0,defaults:{currency:'VND'},stylePackaging:{},scenarios:[{id:'style-analysis-001',name:'Style only',orderId:null,styleId:style.id,inputs:{quantity:200,basis:'ST'}}]};
  await routes.get('PUT /revenue-analysis/scenarios')({body:styleSaved},singleResponse);assert.equal(singleResponse.value.scenarios[0].orderId,null);
  const body={revision:1,defaults:{currency:'VND',workers:10},stylePackaging:{[style.id]:{currency:'VND',polyUsage:1,boxCapacity:50}},scenarios:[{id:'profit-scenario-001',name:'First estimate',orderId:order.id,styleId:style.id,inputs:{quantity:150,stSeconds:'',basis:'ST'}}]};
  const res={json(value){this.value=value;}};
  await routes.get('PUT /revenue-analysis/scenarios')({body},res);assert.equal(res.value.revision,2);
  await assert.rejects(routes.get('PUT /revenue-analysis/scenarios')({body},res),/PROFIT_SETTINGS_CHANGED/);
  assert.equal(await f.db.expenseRequest.count(),0);assert.equal(await f.db.bankLedgerEntry.count(),0);assert.equal(await f.db.assignmentPlan.count(),0);
 }finally{await f.close();}
});
