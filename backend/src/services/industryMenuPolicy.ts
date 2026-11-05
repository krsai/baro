import {createHttpError} from '../utils/http';
import {retryEditTransaction} from '../utils/editRevision';

export const INDUSTRY_MENU_KEY='INDUSTRY_MENU_POLICY:1';
export const INDUSTRY_MENU_FEATURES=['FREIGHT','DASHBOARD','ORDER','INVOICE','BANK_LEDGER','ACCOUNT_OVERVIEW','STYLE','ST_REVIEW','SHIPMENT_REVIEW','ASSIGNMENT','PRODUCTION_PLAN','INVENTORY','ATTENDANCE','PRODUCTION_ANALYSIS','WORK_HISTORY','OUTSOURCING_RECORD','PAYROLL','REVENUE_FORECAST','REVENUE_ANALYSIS','BUSINESS','EMPLOYEE','EMPLOYEE_SYSTEM','SALARY_SYSTEM','CUSTOMER','OUTSOURCING_PARTNER','MATERIAL_SUPPLIER','LOGISTICS_PARTNER','PERMISSION','HOLIDAY'];
const required=['DASHBOARD','BUSINESS'];
export async function readIndustryMenuPolicy(db:any){
 const row=await db.systemSetting.findUnique({where:{key:INDUSTRY_MENU_KEY}});
 return {revision:row?.value?.revision??0,industries:row?.value?.industries??{}};
}
export async function companyIndustryMenuFeatures(db:any,orgId:number,orgType:string){
 const [policy,classification]=await Promise.all([readIndustryMenuPolicy(db),db.partnerClassification.findUnique({where:{orgId_entityId:{orgId,entityId:orgId}},include:{industries:true}})]);
 const defaults=INDUSTRY_MENU_FEATURES.filter(feature=>orgType==='SERVICE'||feature!=='FREIGHT');
 const ids=(classification?.industries??[]).map((row:any)=>row.systemIndustryId);
 const selected=ids.length?ids.flatMap((id:number)=>policy.industries[String(id)]??defaults):defaults;
 return [...new Set([...required,...selected])];
}
export function industryMenuMiddleware(db:any,requireOrgRole:any){
 return async(req:any,res:any,next:any)=>{
  const feature=industryMenuApiFeature(req.path);if(!feature)return next();
  try{
   const context=await requireOrgRole(req,res,{allowedRoles:['ADMIN','OPERATOR','ACCOUNTANT','WORKER'],allowSystemAdmin:false});if(!context)return;
   const allowed=await companyIndustryMenuFeatures(db,context.organization.id,context.organization.type);
   if(!allowed.includes(feature))return res.status(403).json({error:'INDUSTRY_MENU_UNAVAILABLE'});
   return next();
  }catch(error){return next(error);}
 };
}
export async function saveIndustryMenuPolicy(db:any,input:any,email:string){
 if(!Number.isSafeInteger(input?.revision)||input.revision<0||!input.industries||typeof input.industries!=='object'||Array.isArray(input.industries))throw createHttpError(400,'INVALID_INDUSTRY_MENU_POLICY');
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
  const value={revision:current.revision+1,industries:Object.fromEntries(entries)};
  await tx.systemSetting.update({where:{key:INDUSTRY_MENU_KEY},data:{value,updatedBy:email}});
  return value;
 });
}

// Only business endpoints are gated. Shared catalogues and company identity
// lookups keep their existing permissions so permitted forms can still resolve FKs.
export function industryMenuApiFeature(path:string){
 const rules:[RegExp,string][]=[
  [/^\/freight(?:\/|$)/,'FREIGHT'],[/^\/bank-ledger\/(?:overview|exchange-rates)(?:\/|$)/,'ACCOUNT_OVERVIEW'],
  [/^\/bank-ledger(?:\/|$)/,'BANK_LEDGER'],[/^\/invoices(?:\/|$)/,'INVOICE'],
  [/^\/(?:orders|order-items)(?:\/|$)/,'ORDER'],[/^\/(?:styles|style-processes)(?:\/|$)/,'STYLE'],
  [/^\/(?:assignment-board(?:-state|-view|-versions|-revision)?|assignment-plan-progress|assignment-plans|assignment-cards|factory-month-capacity)(?:\/|$)/,'ASSIGNMENT'],
  [/^\/inventory(?:\/|$)/,'INVENTORY'],[/^\/attendance-entries(?:\/|$)/,'ATTENDANCE'],
  [/^\/production-analysis(?:\/|$)/,'PRODUCTION_ANALYSIS'],[/^\/work-logs(?:\/|$)/,'WORK_HISTORY'],
  [/^\/(?:transaction-requests|expense-requests|outsourcing-records|expense-request-editor|partner-transaction-costs|expense-approval-settings|expense-approval-preview)(?:\/|$)/,'OUTSOURCING_RECORD'],
  [/^\/payroll(?:\/|$)/,'PAYROLL'],[/^\/revenue-analysis(?:\/|$)/,'REVENUE_ANALYSIS'],
  [/^\/revenue-forecast(?:\/|$)/,'REVENUE_FORECAST'],
 ];
 return rules.find(([pattern])=>pattern.test(path.toLowerCase()))?.[1]??null;
}
export function registerIndustryMenuRoutes(app:any,db:any,gates:any){
 app.get('/system/industry-menu-policy',async(req:any,res:any)=>{
  if(!await gates.requireSystemAdmin(req,res))return;
  const [policy,industries]=await Promise.all([readIndustryMenuPolicy(db),db.settingServiceDefault.findMany({where:{partnerRoleId:{gt:0},code:{not:'GENERAL'}},include:{partnerRole:true},orderBy:{id:'asc'}})]);
  res.json({...policy,catalogue:industries,features:INDUSTRY_MENU_FEATURES,required});
 });
 app.put('/system/industry-menu-policy',async(req:any,res:any)=>{
  const actor=await gates.requireSystemAdmin(req,res);if(!actor)return;
  res.json(await saveIndustryMenuPolicy(db,req.body,actor.requesterEmail));
 });
}
