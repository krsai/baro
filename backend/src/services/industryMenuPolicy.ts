import {SERVICE_FEATURES} from './serviceCompany';
import {createHttpError} from '../utils/http';
import {retryEditTransaction} from '../utils/editRevision';

export const INDUSTRY_MENU_KEY='INDUSTRY_MENU_POLICY:1';
export const INDUSTRY_MENU_FEATURES=['INVENTORY_MATERIALS','INVENTORY_STOCK','INVENTORY_MOVEMENTS','INVENTORY_SETTINGS','PRODUCTION_STATUS','ORDER_SHIPMENTS','SHIPPING_REQUEST','APPROVAL_SETTINGS','WORK_TIME','FREIGHT','DASHBOARD','ORDER','INVOICE','BANK_LEDGER','ACCOUNT_OVERVIEW','STYLE','ST_REVIEW','SHIPMENT_REVIEW','ASSIGNMENT','PRODUCTION_PLAN','INVENTORY','ATTENDANCE','WORK_HISTORY','OUTSOURCING_RECORD','PAYROLL','REVENUE_FORECAST','REVENUE_ANALYSIS','BUSINESS','EMPLOYEE','EMPLOYEE_SYSTEM','SALARY_SYSTEM','CUSTOMER','OUTSOURCING_PARTNER','MATERIAL_SUPPLIER','LOGISTICS_PARTNER','PERMISSION','HOLIDAY'];
export const SUBSCRIBER_TYPES=['MANUFACTURER','SERVICE'];
export const INDUSTRY_SPECIFIC_FEATURES=['INVENTORY_MATERIALS','INVENTORY_STOCK','INVENTORY_MOVEMENTS','INVENTORY_SETTINGS','PRODUCTION_STATUS','ORDER_SHIPMENTS','SHIPPING_REQUEST','FREIGHT','ORDER','STYLE','ST_REVIEW','SHIPMENT_REVIEW','ASSIGNMENT','PRODUCTION_PLAN','INVENTORY','WORK_HISTORY','REVENUE_FORECAST','REVENUE_ANALYSIS'];
export const COMMON_MENU_FEATURES=INDUSTRY_MENU_FEATURES.filter(feature=>!INDUSTRY_SPECIFIC_FEATURES.includes(feature));
const MENU_SPLIT_SOURCES={INVENTORY_MATERIALS:'INVENTORY',INVENTORY_STOCK:'INVENTORY',INVENTORY_MOVEMENTS:'INVENTORY',INVENTORY_SETTINGS:'INVENTORY',PRODUCTION_STATUS:'ORDER',ORDER_SHIPMENTS:'ORDER',SHIPPING_REQUEST:'CUSTOMER',REVENUE_FORECAST:'REVENUE_ANALYSIS'};
const required=['DASHBOARD','BUSINESS'];
export async function readIndustryMenuPolicy(db:any){
 const row=await db.systemSetting.findUnique({where:{key:INDUSTRY_MENU_KEY}});
 const subscribers=row?.value?.subscribers?Object.fromEntries(Object.entries(row.value.subscribers).map(([type,features]:any)=>[type,[...new Set([...features,...(!row.value.approvalSettingsSplit&&features.includes('OUTSOURCING_RECORD')?['APPROVAL_SETTINGS']:[])])]])):undefined;
 if(subscribers&&!row?.value?.menuSplitVersion)for(const [type,features] of Object.entries(subscribers) as [string,string[]][])for(const [target,source] of Object.entries(MENU_SPLIT_SOURCES)){const original=target==='SHIPPING_REQUEST'?(type==='SERVICE'?'FREIGHT':type==='BRAND'?'ORDER':'CUSTOMER'):source;const allowed=features.includes(original)||!row.value.fullScopeTypes?.includes(type)&&COMMON_MENU_FEATURES.includes(original);const index=features.indexOf(target);if(index>=0)features.splice(index,1);if(allowed)features.push(target);}
 if(subscribers?.SERVICE&&!row?.value?.freightStatusSplit){const features=subscribers.SERVICE;if(features.includes('FREIGHT')&&!features.includes('PRODUCTION_STATUS'))features.push('PRODUCTION_STATUS');}
 return {...(row?.value?.freightStatusSplit?{freightStatusSplit:true}:{}),revision:row?.value?.revision??0,industries:row?.value?.industries??{},...(row?.value?.menuSplitVersion?{menuSplitVersion:row.value.menuSplitVersion}:{}),...(row?.value?.approvalSettingsSplit?{approvalSettingsSplit:true}:{}),...(row?.value?.fullScopeTypes?{fullScopeTypes:row.value.fullScopeTypes}:{}),...(row?.value?.subscribers?{subscribers}:{})};
}
export async function companyIndustryMenuFeatures(db:any,orgId:number,orgType:string){
 const policy=await readIndustryMenuPolicy(db);
 if(Object.hasOwn(policy.subscribers??{},orgType))return orgType==='BRAND'?policy.subscribers[orgType].filter((feature:string)=>['STYLE','ORDER','PRODUCTION_STATUS','SHIPPING_REQUEST'].includes(feature)):policy.fullScopeTypes?.includes(orgType)?policy.subscribers[orgType]:[...new Set([...COMMON_MENU_FEATURES,...policy.subscribers[orgType]])];
 const classification=await db.partnerClassification.findUnique({where:{orgId_entityId:{orgId,entityId:orgId}},include:{industries:true}});
 const defaults=INDUSTRY_MENU_FEATURES.filter(feature=>orgType==='SERVICE'||feature!=='FREIGHT');

 const ids=(classification?.industries??[]).map((row:any)=>row.systemIndustryId);
 const selected=ids.length?ids.flatMap((id:number)=>policy.industries[String(id)]??defaults):defaults;
 if(orgType==='BRAND')return ['STYLE','ORDER','PRODUCTION_STATUS','SHIPPING_REQUEST'].filter(feature=>selected.includes(feature)||['PRODUCTION_STATUS','SHIPPING_REQUEST'].includes(feature)&&selected.includes('ORDER'));
 const effective=[...new Set([...COMMON_MENU_FEATURES,...selected])];
 if(orgType==='SERVICE'&&effective.includes('FREIGHT')&&!policy.freightStatusSplit&&!effective.includes('PRODUCTION_STATUS'))effective.push('PRODUCTION_STATUS');
 for(const [target,source] of Object.entries(MENU_SPLIT_SOURCES))if(effective.includes(target==='SHIPPING_REQUEST'?(orgType==='SERVICE'?'FREIGHT':'CUSTOMER'):source)&&!effective.includes(target))effective.push(target);
 return effective;
}
export function industryMenuMiddleware(db:any,requireOrgRole:any,canAccess?:any){
 return async(req:any,res:any,next:any)=>{
  const settingsRequest=(req.path.startsWith('/approval-action-settings')||req.path==='/expense-approval-settings')&&(req.method==='PUT'||req.query?.accessSettings==='1');
  const feature=settingsRequest?'APPROVAL_SETTINGS':industryMenuApiFeature(req.path);if(!feature)return next();
  try{
   const context=await requireOrgRole(req,res,{allowedRoles:['ADMIN','OPERATOR','ACCOUNTANT','WORKER'],allowSystemAdmin:false});if(!context)return;
   if((settingsRequest||['ORDER','INVENTORY_MATERIALS','INVENTORY_STOCK','INVENTORY_MOVEMENTS','INVENTORY_SETTINGS','PRODUCTION_STATUS','ORDER_SHIPMENTS','SHIPPING_REQUEST','REVENUE_FORECAST'].includes(feature))&&canAccess&&!await canAccess({orgType:context.organization.type,orgRole:context.employee?.orgRole,feature}))return res.status(403).json({error:'FEATURE_ACCESS_DENIED'});
   const allowed=await companyIndustryMenuFeatures(db,context.organization.id,context.organization.type);
   if(!allowed.includes(feature))return res.status(403).json({error:'INDUSTRY_MENU_UNAVAILABLE'});
   return next();
  }catch(error){return next(error);}
 };
}
export async function saveIndustryMenuPolicy(db:any,input:any,email:string){
 if(!Number.isSafeInteger(input?.revision)||input.revision<0||!input.industries||typeof input.industries!=='object'||Array.isArray(input.industries))throw createHttpError(400,'INVALID_INDUSTRY_MENU_POLICY');
 const subscribers=input.subscribers;
 if(input.fullScopeTypes!==undefined&&(!Array.isArray(input.fullScopeTypes)||input.fullScopeTypes.some((type:string)=>!SUBSCRIBER_TYPES.includes(type))))throw createHttpError(400,'INVALID_INDUSTRY_MENU_POLICY');
 if(subscribers!==undefined&&(!subscribers||typeof subscribers!=='object'||Array.isArray(subscribers)||Object.entries(subscribers).some(([type,features]:any)=>!SUBSCRIBER_TYPES.includes(type)||!Array.isArray(features)||new Set(features).size!==features.length||features.some((feature:string)=>!INDUSTRY_MENU_FEATURES.includes(feature)||(type==='SERVICE'?!SERVICE_FEATURES.includes(feature):feature==='FREIGHT'))||(!input.fullScopeTypes?.includes(type)&&required.some(feature=>!features.includes(feature))))))throw createHttpError(400,'INVALID_INDUSTRY_MENU_POLICY');
 const entries=Object.entries(input.industries);
 if(entries.length>2000||entries.some(([id,features])=>!/^\d+$/.test(id)||String(Number(id))!==id||!Number.isSafeInteger(Number(id))||Number(id)<=0||!Array.isArray(features)||features.length>INDUSTRY_MENU_FEATURES.length||new Set(features).size!==features.length||features.some(feature=>!INDUSTRY_MENU_FEATURES.includes(feature))||required.some(feature=>!features.includes(feature))))throw createHttpError(400,'INVALID_INDUSTRY_MENU_POLICY');
 return retryEditTransaction(db,async(tx:any)=>{
  const known=await tx.settingServiceDefault.findMany({where:{id:{in:entries.map(([id])=>Number(id))},partnerRoleId:{gt:0},code:{not:'GENERAL'}},select:{id:true}});
  if(known.length!==entries.length)throw createHttpError(400,'INVALID_INDUSTRY_MENU_POLICY');
  // Upsert takes the row lock even on the first concurrent configuration save.
  await tx.systemSetting.upsert({where:{key:INDUSTRY_MENU_KEY},create:{key:INDUSTRY_MENU_KEY,value:{revision:0,industries:{}}},update:{}});
  await tx.$queryRawUnsafe('SELECT key FROM "SystemSetting" WHERE key=$1 FOR UPDATE',INDUSTRY_MENU_KEY);
  const current=await readIndustryMenuPolicy(tx);
  if(current.revision!==input.revision)throw createHttpError(409,'INDUSTRY_MENU_POLICY_CHANGED');
  const value={freightStatusSplit:true,...((input.fullScopeTypes??current.fullScopeTypes)?{fullScopeTypes:input.fullScopeTypes??current.fullScopeTypes}:{}),menuSplitVersion:19,approvalSettingsSplit:true,revision:current.revision+1,industries:Object.fromEntries(entries),...((subscribers??current.subscribers)?{subscribers:subscribers??current.subscribers}:{})};
  await tx.systemSetting.update({where:{key:INDUSTRY_MENU_KEY},data:{value,updatedBy:email}});
  return value;
 });
}

// Only business endpoints are gated. Shared catalogues and company identity
// lookups keep their existing permissions so permitted forms can still resolve FKs.
export function industryMenuApiFeature(path:string){
 const rules:[RegExp,string][]=[
  [/^\/logistics-status-reports(?:\/|$)/,'PRODUCTION_STATUS'],
  [/^\/customer-production-reports(?:\/|$)/,'PRODUCTION_STATUS'],
  [/^\/shipping-requests(?:\/|$)/,'SHIPPING_REQUEST'],
  [/^\/orders\/(?:shipments(?:\/|$)|\d+\/(?:shipments|shipping-policy)(?:\/|$))/,'ORDER'],
  [/^\/employees\/\d+\/tenure-recognition\/?$/,'EMPLOYEE'],
  [/^\/employees\/?$/,'EMPLOYEE'],[/^\/holidays(?:\/|$)/,'HOLIDAY'],
  [/^\/(?:work-time-requests|employee-leaves)(?:\/|$)/,'WORK_TIME'],
  [/^\/(?:employee-grades|employee-roles|employee-departments)(?:\/|$)/,'EMPLOYEE_SYSTEM'],
  [/^\/freight(?:\/|$)/,'FREIGHT'],[/^\/bank-ledger\/(?:overview|exchange-rates)(?:\/|$)/,'ACCOUNT_OVERVIEW'],
  [/^\/bank-ledger(?:\/|$)/,'BANK_LEDGER'],[/^\/invoices(?:\/|$)/,'INVOICE'],
  [/^\/(?:orders|order-items)(?:\/|$)/,'ORDER'],[/^\/(?:styles|style-processes|style-products)(?:\/|$)/,'STYLE'],
  [/^\/(?:assignment-board(?:-state|-view|-versions|-revision)?|assignment-plan-progress|assignment-plans|assignment-cards|factory-month-capacity)(?:\/|$)/,'ASSIGNMENT'],
  [/^\/inventory(?:\/|$)/,'INVENTORY'],[/^\/attendance-entries(?:\/|$)/,'ATTENDANCE'],
  [/^\/work-logs(?:\/|$)/,'WORK_HISTORY'],
  [/^\/(?:transaction-requests|expense-requests|outsourcing-records|expense-request-editor|partner-transaction-costs|expense-approval-settings|expense-approval-preview)(?:\/|$)/,'OUTSOURCING_RECORD'],
  [/^\/payroll(?:\/|$)/,'PAYROLL'],[/^\/revenue-analysis(?:\/|$)/,'REVENUE_ANALYSIS'],
  [/^\/revenue-forecast(?:\/|$)/,'REVENUE_FORECAST'],
 ];
 return rules.find(([pattern])=>pattern.test(path.toLowerCase()))?.[1]??null;
}
export function registerIndustryMenuRoutes(app:any,db:any,gates:any){
 app.get('/system/industry-menu-policy',async(req:any,res:any)=>{
  if(!await gates.requireSystemAdmin(req,res))return;
  const policy=await readIndustryMenuPolicy(db);
  res.json({...policy,features:INDUSTRY_MENU_FEATURES,required,subscriberTypes:SUBSCRIBER_TYPES});
 });
 app.put('/system/industry-menu-policy',async(req:any,res:any)=>{
  const actor=await gates.requireSystemAdmin(req,res);if(!actor)return;
  res.json(await saveIndustryMenuPolicy(db,req.body,actor.requesterEmail));
 });
}
