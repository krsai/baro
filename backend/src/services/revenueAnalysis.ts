import {createHttpError} from '../utils/http';
import {approvalState} from './bankEvidence';
import {loadIssuedOrderSalesValues} from './issuedOrderSalesValue';
import {loadReferenceExchangeRates} from './referenceExchangeRates';
import {revenueLaborBasis} from './revenueLaborBasis';
import {revenueStyles,revenueStyleReport} from './revenueStyleAnalysis';
const fail=(code:string,status=400):never=>{throw createHttpError(status,code);};
const key=(orgId:number)=>`REVENUE_ANALYSIS_SCENARIOS:${orgId}`;
const inputKeys=['officeFixedMonthly','productionFixedMonthly','variableBaseMonthly','variableAllowanceMonthly','variableProductionMonthly','currency','quantity','salePrice','basis','stSeconds','ptSeconds','productivity','workers','targetDays','hoursDay','workdays','factoryWorkers','baseMonthly','allowanceMonthly','supportMonthly','rentMonthly','productionPay','otherUnitCost','packaging','polyUsage','boxCapacity','packWaste','polyPrice','boxPrice','costMode','usdVnd','usdKrw','laborSource','factoryId'];
export function validateProfitInputs(value:any){
 if(!value||typeof value!=='object'||Array.isArray(value)||Object.keys(value).some(k=>!inputKeys.includes(k)))fail('INVALID_PROFIT_SCENARIO');
 const result:any={};
 for(const [k,v] of Object.entries(value)){
  if(k==='currency'){if(!['USD','KRW','VND'].includes(String(v)))fail('INVALID_PROFIT_SCENARIO');}
  else if(k==='basis'){if(!['ST','PT'].includes(String(v)))fail('INVALID_PROFIT_SCENARIO');}
  else if(k==='costMode'){if(!['estimate','linked'].includes(String(v)))fail('INVALID_PROFIT_SCENARIO');}
  else if(k==='laborSource'){if(!['AUTO','MANUAL'].includes(String(v)))fail('INVALID_PROFIT_SCENARIO');}
  else if(k==='packaging'){if(typeof v!=='boolean')fail('INVALID_PROFIT_SCENARIO');}
  else if(v!==''&&(typeof v!=='number'&&typeof v!=='string'||!Number.isFinite(Number(v))||Number(v)<0||Number(v)>1e12))fail('INVALID_PROFIT_SCENARIO');
  result[k]=v;
 }
 return result;
}
export async function profitCatalog(db:any,orgId:number,gates:any,orderId?:number){
 const orders=await db.workOrder.findMany({where:{orgId,...(orderId?{id:orderId}:{})},orderBy:{updatedAt:'desc'},take:501,include:{buyerOrg:{select:{name:true}},assignmentPlans:{where:{orgId},select:{factoryId:true}},workOrderItems:{include:{style:{select:{id:true,code:true,name:true,orgId:true}}},orderBy:{sortOrder:'asc'}}}});
 // Use the same current-price / frozen-invoice resolver as the saved orders page.
 const sales=await (gates.loadSalesValues?gates.loadSalesValues(orders.slice(0,500),db):loadIssuedOrderSalesValues(db,orders.slice(0,500)));
 const rows:any[]=[];
 for(const order of orders.slice(0,500)){
  const groups=new Map<number,any[]>();
  for(const item of order.workOrderItems){if(item.style?.orgId!==orgId)continue;const group=groups.get(item.styleId)||[];group.push(item);groups.set(item.styleId,group);}
  for(const [styleId,items] of groups){
   const quantity=items.reduce((n:number,item:any)=>n+item.totalQuantity,0),issued=sales.get(order.id),lines=issued?.lines?.filter((line:any)=>line.styleId===styleId)||[];
   const priceQuantity=lines.reduce((n:number,line:any)=>n+line.quantity,0),available=lines.length>0&&lines.every((line:any)=>line.amount!==null&&line.unitPrice!==null&&line.status==='AVAILABLE'),amount=available?lines.reduce((n:number,line:any)=>n+Number(line.amount),0):null;
   rows.push({key:`${order.id}:${styleId}`,orderId:order.id,orderNumber:order.orderNumber,styleId,styleCode:items[0].style.code,styleName:items[0].style.name,customer:order.buyerOrg?.name||'',quantity,
    salePrice:available&&priceQuantity===quantity&&quantity>0?amount/quantity:null,salesAmount:available&&priceQuantity===quantity?amount:null,currency:issued?.currencyCode||null,priceSource:issued?.source||null,invoiceNumber:issued?.invoiceNumber||null});
  }
 }
 return {rows,orders:orders.slice(0,500).map((order:any)=>{const value=sales.get(order.id);return {id:order.id,factoryIds:[...new Set((order.assignmentPlans||[]).map((plan:any)=>plan.factoryId))],orderNumber:order.orderNumber,customer:order.buyerOrg?.name||'',quantity:order.workOrderItems.reduce((sum:number,item:any)=>sum+item.totalQuantity,0),styleCount:new Set(order.workOrderItems.map((item:any)=>item.styleId).filter(Boolean)).size,salesAmount:value?.amount??null,currency:value?.currencyCode??null,priceStatus:value?.status||'MISSING_PRICE',priceSource:value?.source||null,invoiceNumber:value?.invoiceNumber||null,missingStyle:order.workOrderItems.some((item:any)=>item.totalQuantity>0&&item.style?.orgId!==orgId)};}),truncated:orders.length>500};
}
export async function profitSources(db:any,orgId:number,orderId:number,styleId:number,gates:any,cache:any={}){
 const order=cache.order||await db.workOrder.findFirst({where:{id:orderId,orgId},include:{workOrderItems:true}});cache.order=order;
 const items=order?.workOrderItems.filter((item:any)=>item.styleId===styleId)||[];
 if(!order||!items.length)fail('PROFIT_TARGET_NOT_FOUND',404);
 const version=await db.styleProcessVersion.findFirst({where:{orgId,styleId},orderBy:{versionNumber:'desc'}});
 const processSnapshot=version?.processSnapshot??(gates.loadCurrentProcesses?await gates.loadCurrentProcesses(db,orgId,styleId):null);
 const times=processSnapshot&&gates.resolveTimes?gates.resolveTimes(processSnapshot,items):{ST:null,PT:null};
 const costs=cache.costs||await db.partnerTransactionCost.findMany({where:{orgId,OR:[{workOrderId:orderId},{referenceLinks:{some:{orgId,workOrderId:orderId}}}],AND:[{OR:[{expenseRequestId:null},{expenseRequest:{deletedAt:null}}]}]},include:{referenceLinks:true,partner:{select:{name:true}},unit:true,transactionCode:{select:{code:true,nameKo:true,nameEn:true,nameVi:true}},processLinks:true,expenseRequest:{select:{id:true,managementNumber:true}}},orderBy:{transactionDate:'desc'}});cache.costs=costs;
 const states:Map<number,boolean>=cache.states||new Map();cache.states=states;
 for(const cost of costs)if(cost.expenseRequestId&&!states.has(cost.expenseRequestId))states.set(cost.expenseRequestId,(await approvalState(db,orgId,cost.expenseRequestId)).approved);
 const rows=costs.map((cost:any)=>{
  const refs=cost.referenceLinks.length?cost.referenceLinks.map((r:any)=>[r.workOrderId,r.styleId]):[[cost.workOrderId,cost.styleId]];
  const exact=refs.length===1&&refs[0][0]===orderId&&refs[0][1]===styleId;
  return {id:cost.id,date:cost.transactionDate,description:cost.description,code:cost.transactionCode,partnerId:cost.partnerOrgId,partner:cost.partner?.name||'',unit:cost.unit,currency:cost.currency,quantity:cost.quantity===null?null:String(cost.quantity),subtotal:cost.subtotal===null?null:String(cost.subtotal),amount:String(cost.amount),styleId:cost.styleId,processIds:[...new Set([cost.styleProcessId,...cost.processLinks.map((p:any)=>p.styleProcessId)].filter(Boolean))],reference:cost.expenseRequest?.managementNumber||'',requestId:cost.expenseRequestId,withinOrder:refs.every((ref:any[])=>ref[0]===orderId),exact,approved:cost.expenseRequestId?states.get(cost.expenseRequestId):false};
 });
 // Groups are exact accounting code/vendor/unit/currency/style/process scopes.
 // Averages use pretax amount / quantity, never averages of row prices.
 const groups=new Map<string,any>();
 for(const row of rows){
  if(!row.approved||!row.exact||!row.code||!row.unit||!(Number(row.quantity)>0)||row.subtotal===null)continue;
  const scope=JSON.stringify([row.code.code,row.partnerId,row.unit.id,row.currency,styleId,row.processIds.sort((a:number,b:number)=>a-b)]),group=groups.get(scope)||{key:scope,code:row.code,partner:row.partner,unit:row.unit,currency:row.currency,quantity:0,subtotal:0,count:0,processIds:row.processIds};
  group.quantity+=Number(row.quantity);group.subtotal+=Number(row.subtotal);group.count++;groups.set(scope,group);
 }
 return {times,version:version?.versionNumber||null,costs:rows,averages:[...groups.values()].map(row=>({...row,unitPrice:row.subtotal/row.quantity}))};
}
export async function profitOrderReport(db:any,orgId:number,orderId:number,gates:any){
 const catalog=await profitCatalog(db,orgId,gates,orderId),order=catalog.orders[0];if(!order)fail('PROFIT_TARGET_NOT_FOUND',404);
 const cache:any={},styles:any[]=[];
 for(const row of catalog.rows)styles.push({...row,sources:await profitSources(db,orgId,orderId,row.styleId,gates,cache)});
 return {order,styles};
}
export function registerRevenueAnalysisRoutes(app:any,db:any,gates:any){
 const access=async(req:any,res:any)=>{
  const ctx=await gates.requireOrgRole(req,res,{allowedRoles:['ADMIN','ACCOUNTANT','OPERATOR'],allowSystemAdmin:false});if(!ctx)return null;
  const actorId=gates.actorId(),actor=actorId&&await db.employee.findFirst({where:{id:actorId,orgId:ctx.organization.id,status:'ACTIVE',orgRole:{in:['ADMIN','ACCOUNTANT','OPERATOR']}}});
  const policy=(await gates.loadPolicy()).policy;
  if(!actor||!policy?.[ctx.organization.type]?.[actor.orgRole]?.includes('REVENUE_ANALYSIS'))fail('PROFIT_ACCESS_DENIED',403);
  return {orgId:ctx.organization.id,actorId};
 };
 app.get('/revenue-analysis/catalog',async(req:any,res:any)=>{const scope=await access(req,res);if(scope)res.json(await profitCatalog(db,scope.orgId,gates));});
 app.get('/revenue-analysis/styles',async(req:any,res:any)=>{const scope=await access(req,res);if(!scope)return;const search=String(req.query.search||'').trim();if(search.length>100)fail('INVALID_PROFIT_SCENARIO');res.json(await revenueStyles(db,scope.orgId,search));});
 app.post('/revenue-analysis/style-analysis',async(req:any,res:any)=>{const scope=await access(req,res);if(!scope)return;const styleId=Number(req.body?.styleId),quantity=Number(req.body?.quantity),gender=req.body?.gender??null;if(!Number.isSafeInteger(styleId)||styleId<=0||!Number.isSafeInteger(quantity)||quantity<=0||quantity>1000000000||gender!==null&&!['M','W','U'].includes(gender))fail('INVALID_PROFIT_SCENARIO');res.json(await db.$transaction((tx:any)=>revenueStyleReport(tx,scope.orgId,styleId,quantity,gender,gates),{isolationLevel:'RepeatableRead',timeout:60000}));});
 app.get('/revenue-analysis/labor-basis',async(req:any,res:any)=>{const scope=await access(req,res);if(!scope)return;const month=String(req.query.month||'');if(!/^[1-9]\d{3}-(0[1-9]|1[0-2])$/.test(month))fail('INVALID_PROFIT_SCENARIO');res.json(await revenueLaborBasis(db,scope.orgId,month));});
 app.get('/revenue-analysis/orders/:id',async(req:any,res:any)=>{const scope=await access(req,res);if(!scope)return;const orderId=Number(req.params.id);if(!Number.isSafeInteger(orderId)||orderId<=0)fail('INVALID_PROFIT_SCENARIO');res.json(await db.$transaction((tx:any)=>profitOrderReport(tx,scope.orgId,orderId,gates),{isolationLevel:'RepeatableRead',timeout:60000}));});
 app.get('/revenue-analysis/exchange-rates',async(req:any,res:any)=>{const scope=await access(req,res);if(scope){try{res.json(await loadReferenceExchangeRates());}catch{res.status(503).json({error:'EXCHANGE_RATES_UNAVAILABLE'});}}});
 app.get('/revenue-analysis/sources',async(req:any,res:any)=>{const scope=await access(req,res);if(!scope)return;const orderId=Number(req.query.orderId),styleId=Number(req.query.styleId);if(!Number.isSafeInteger(orderId)||orderId<=0||!Number.isSafeInteger(styleId)||styleId<=0)fail('INVALID_PROFIT_SCENARIO');res.json(await profitSources(db,scope.orgId,orderId,styleId,gates));});
 app.get('/revenue-analysis/scenarios',async(req:any,res:any)=>{const scope=await access(req,res);if(scope){const stored=await db.systemSetting.findUnique({where:{key:key(scope.orgId)}});res.json(stored?.value||{revision:0,defaults:{},stylePackaging:{},scenarios:[]});}});
 app.put('/revenue-analysis/scenarios',async(req:any,res:any)=>{
  const scope=await access(req,res);if(!scope)return;
  const body=req.body;if(!Number.isSafeInteger(body?.revision)||body.revision<0||!Array.isArray(body.scenarios)||body.scenarios.length>100||!body.stylePackaging||typeof body.stylePackaging!=='object'||Array.isArray(body.stylePackaging)||Object.keys(body.stylePackaging).length>500)fail('INVALID_PROFIT_SCENARIO');
  const defaults=validateProfitInputs(body.defaults),stylePackaging:any={};
  for(const [id,value] of Object.entries(body.stylePackaging)){if(!/^\d+$/.test(id)||!await db.style.findFirst({where:{id:Number(id),orgId:scope.orgId}}))fail('PROFIT_TARGET_NOT_FOUND',404);stylePackaging[id]=validateProfitInputs(value);}
  const ids=new Set();const scenarios:any[]=[];
  for(const row of body.scenarios){
   if(typeof row.id!=='string'||!/^[-\w]{8,64}$/.test(row.id)||ids.has(row.id)||typeof row.name!=='string'||!row.name.trim()||row.name.length>120)fail('INVALID_PROFIT_SCENARIO');ids.add(row.id);
   const orderId=row.orderId??null,styleId=row.styleId??null;
   if(orderId===null&&styleId!==null){if(!Number.isSafeInteger(styleId)||!await db.style.findFirst({where:{id:styleId,orgId:scope.orgId}}))fail('PROFIT_TARGET_NOT_FOUND',404);}
   else if(orderId!==null||styleId!==null){if(!Number.isSafeInteger(orderId)||!Number.isSafeInteger(styleId)||!await db.workOrderItem.findFirst({where:{workOrderId:orderId,styleId,workOrder:{orgId:scope.orgId},style:{orgId:scope.orgId}}}))fail('PROFIT_TARGET_NOT_FOUND',404);}
   scenarios.push({id:row.id,name:row.name.trim(),orderId,styleId,inputs:validateProfitInputs(row.inputs)});
  }
  const value=await db.$transaction(async(tx:any)=>{
   await tx.$queryRawUnsafe('SELECT id FROM "Organization" WHERE id=$1 FOR UPDATE',scope.orgId);
   const stored=await tx.systemSetting.findUnique({where:{key:key(scope.orgId)}});
   if((stored?.value?.revision||0)!==body.revision)fail('PROFIT_SETTINGS_CHANGED',409);
   const value={revision:body.revision+1,defaults,stylePackaging,scenarios};
   await tx.systemSetting.upsert({where:{key:key(scope.orgId)},create:{key:key(scope.orgId),value,updatedByEmployeeId:scope.actorId},update:{value,updatedByEmployeeId:scope.actorId}});return value;
  });res.json(value);
 });
}
