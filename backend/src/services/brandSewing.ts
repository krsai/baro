import {createHttpError} from '../utils/http';
import {createStyleProduct,updateStyleProduct,STYLE_PRODUCT_FIELDS} from './styleProducts';
import {invoiceOrderProgress} from './invoiceOrderProgress';
import {companyIndustryMenuFeatures} from './industryMenuPolicy';

export const BRAND_SEWING_FEATURES=['STYLE','ORDER'];
const activeWorkspace=(ctx:any)=>ctx.organization?.type==='BRAND'&&ctx.organization.isActive!==false&&ctx.organization.ownerOrgId===null&&['ACTIVE','TRIAL','GRACE'].includes(ctx.organization.subscription?.status)&&ctx.employee?.orgId===ctx.organization.id&&ctx.employee.status==='ACTIVE';
export function brandSewingApiFeature(path:string){
 if(/^\/brand-sewing\/styles(?:\/\d+)?\/?$/.test(path))return 'STYLE';
 if(/^\/brand-sewing\/(?:orders|progress)\/?$/.test(path))return 'ORDER';
 return null;
}

export function brandSewingMiddleware(db:any,gates:any){
 return async(req:any,res:any,next:any)=>{
  if(req.method==='OPTIONS'||/^\/(?:auth|system|health|public|app-version)(?:\/|$)/.test(req.path)||!gates.getEmail(req))return next();
  try{
   if(!req.query.orgId&&(await db.systemUser.findUnique({where:{email:gates.getEmail(req)},select:{systemRole:true}}))?.systemRole==='SYSTEM_ADMIN')return next();
   const organization=await gates.getOrganization(req);
   if(organization?.type!=='BRAND')return next();
   const ctx=await gates.requireOrgRole(req,res,{allowedRoles:['ADMIN','OPERATOR','ACCOUNTANT','WORKER'],allowSystemAdmin:false});if(!ctx)return;
   if(!activeWorkspace(ctx))return res.status(403).json({error:'BRAND_SEWING_ACCESS_DENIED'});
   if(/^\/(?:my-profile|profile)(?:\/|$)/.test(req.path))return next();
   const feature=brandSewingApiFeature(req.path),policy=(await gates.loadPolicy()).policy;
   if(!feature||!policy?.BRAND?.[ctx.employee.orgRole]?.includes(feature)||!(await companyIndustryMenuFeatures(db,organization.id,'BRAND')).includes(feature))return res.status(403).json({error:'BRAND_SEWING_FEATURE_UNAVAILABLE'});
   return next();
  }catch(error){return next(error);}
 };
}

export async function readBrandSewingOrders(db:any,orgId:number,loadProgress:any){
 const orders=await db.workOrder.findMany({where:{buyerOrgId:orgId},orderBy:[{createdAt:'desc'},{id:'desc'}],select:{
  id:true,orderId:true,orderNumber:true,sellerOrgId:true,dueDate:true,totalQuantity:true,createdAt:true,
  sellerOrg:{select:{id:true,name:true,nameKo:true,nameVi:true}},
  workOrderItems:{select:{styleId:true,totalQuantity:true,style:{select:{id:true,code:true,name:true,customerOrgId:true,productStyle:{select:{id:true,ownerOrgId:true}}}},color:{select:{name:true}},sizeQuantities:true}},
  priorCompletions:{select:{styleId:true,quantity:true,completedPeriod:true,canceledAt:true}},
 }});
 if(!orders.length)return [];
 const plans=await db.assignmentPlan.findMany({where:{OR:orders.map((order:any)=>({orgId:order.sellerOrgId,OR:[{workOrderId:order.id},{workOrderId:null,assignmentCard:{is:{workOrderId:order.id}}}]}))},select:{orgId:true,externalId:true,workOrderId:true,styleId:true,assignmentCard:{select:{workOrderId:true}}}});
 const progressByOrg=new Map<number,any[]>(await Promise.all([...new Set<number>(plans.map((plan:any)=>plan.orgId))].map(async org=>[org,await loadProgress(org,plans.filter((p:any)=>p.orgId===org).map((p:any)=>p.externalId))] as [number,any[]])));
 return orders.map((order:any)=>{
  const orderPlans=plans.filter((p:any)=>p.orgId===order.sellerOrgId&&(p.workOrderId??p.assignmentCard?.workOrderId)===order.id),progress=progressByOrg.get(order.sellerOrgId)||[];
  const production=invoiceOrderProgress(order,orderPlans,progress);
  const unverified=order.workOrderItems.some((item:any)=>item.style?.customerOrgId!==orgId||item.style?.productStyle?.ownerOrgId!==orgId);
  return {id:order.orderId,orderNumber:order.orderNumber,manufacturer:order.sellerOrg,dueDate:order.dueDate,totalQuantity:order.totalQuantity,isAssigned:orderPlans.length>0,
   producedQuantity:unverified?null:production.producedQuantity,progressPercent:unverified?null:production.progressPercent,isCompleted:!unverified&&production.isCompleted,
   items:order.workOrderItems.map((item:any)=>{const verified=item.style?.customerOrgId===orgId&&item.style?.productStyle?.ownerOrgId===orgId;return {styleId:verified?item.styleId:null,productId:verified?item.style.productStyle.id:null,linkVerified:verified,code:verified?item.style.code:'',name:verified?item.style.name:'',color:item.color?.name||'',sizeQuantities:item.sizeQuantities,totalQuantity:item.totalQuantity};}),
   styles:production.styles.map((style:any)=>{const verified=order.workOrderItems.some((item:any)=>item.styleId===style.styleId&&item.style?.customerOrgId===orgId&&item.style?.productStyle?.ownerOrgId===orgId);const ids=orderPlans.filter((plan:any)=>plan.styleId===style.styleId&&(plan.workOrderId??plan.assignmentCard?.workOrderId)===order.id).map((p:any)=>p.externalId);const days=new Map<string,number>();if(verified)for(const row of progress.filter((p:any)=>ids.includes(p.id)))for(const day of row.dailyProducedQuantities||[])if(day.date&&Number(day.quantity)>0)days.set(day.date,(days.get(day.date)||0)+Number(day.quantity));return {styleId:verified?style.styleId:null,orderedQuantity:style.orderedQuantity,producedQuantity:verified?style.producedQuantity:null,progressPercent:verified?style.progressPercent:null,isCompleted:verified&&style.isCompleted,isProgressUnknown:!verified||style.isProgressUnknown,dailyProducedQuantities:[...days].sort(([a],[b])=>a.localeCompare(b)).map(([date,quantity])=>({date,quantity}))};}),
  };
 });
}

export function registerBrandSewingRoutes(app:any,db:any,gates:any){
 const access=async(req:any,res:any,feature:string)=>{
  const ctx=await gates.requireOrgRole(req,res,{allowedRoles:['ADMIN','OPERATOR','ACCOUNTANT'],allowSystemAdmin:false});if(!ctx)return null;
  if(!activeWorkspace(ctx)||!(await gates.loadPolicy()).policy?.BRAND?.[ctx.employee.orgRole]?.includes(feature)||!(await companyIndustryMenuFeatures(db,ctx.organization.id,'BRAND')).includes(feature))throw createHttpError(403,'BRAND_SEWING_FEATURE_UNAVAILABLE');
  return ctx;
 };
 app.get('/brand-sewing/styles',async(req:any,res:any)=>{const ctx=await access(req,res,'STYLE');if(!ctx)return;const rows=await db.styleProduct.findMany({where:{ownerOrgId:ctx.organization.id},select:{id:true,revision:true,fields:true},orderBy:{id:'desc'}});res.json(rows.map((row:any)=>({id:row.id,revision:row.revision,fields:Object.fromEntries(STYLE_PRODUCT_FIELDS.map(key=>[key,row.fields[key]??null]))})));});
 app.post('/brand-sewing/styles',async(req:any,res:any)=>{const ctx=await access(req,res,'STYLE');if(!ctx)return;if(Object.keys(req.body||{}).some(key=>key!=='fields'))throw createHttpError(400,'STYLE_PRODUCT_FIELDS_INVALID');res.status(201).json(await createStyleProduct(db,ctx.organization.id,ctx.employee.id,{fields:req.body.fields}));});
 app.put('/brand-sewing/styles/:id',async(req:any,res:any)=>{const ctx=await access(req,res,'STYLE');if(!ctx)return;const id=Number(req.params.id);if(!Number.isSafeInteger(id)||id<1)throw createHttpError(400,'STYLE_PRODUCT_FIELDS_INVALID');
  if(Object.keys(req.body||{}).some(key=>!['fields','revision'].includes(key)))throw createHttpError(400,'STYLE_PRODUCT_FIELDS_INVALID');
  if(!await db.styleProduct.findFirst({where:{id,ownerOrgId:ctx.organization.id},select:{id:true}}))throw createHttpError(404,'STYLE_PRODUCT_NOT_FOUND');
  res.json(await updateStyleProduct(db,ctx.organization.id,ctx.employee.id,id,{fields:req.body.fields,revision:req.body.revision}));});
 for(const path of ['orders','progress'])app.get('/brand-sewing/'+path,async(req:any,res:any)=>{const ctx=await access(req,res,'ORDER');if(!ctx)return;res.json(await readBrandSewingOrders(db,ctx.organization.id,gates.loadProgress));});
}
