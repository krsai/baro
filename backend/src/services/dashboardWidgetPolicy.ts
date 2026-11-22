import {createHttpError} from '../utils/http';
import {retryEditTransaction} from '../utils/editRevision';
import {companyIndustryMenuFeatures} from './industryMenuPolicy';

export const widgetIds=['notifications','suspected-errors','work-requests','approvals'] as const;
export const widgetRoles=['ADMIN','ACCOUNTANT','OPERATOR','WORKER'] as const;
const key=(orgId:number)=>`DASHBOARD_WIDGET_POLICY:${orgId}`;
const fail=(status:number,message:string):never=>{throw createHttpError(status,message);};
function normalize(value:any){
 if(!value||typeof value!=='object'||Array.isArray(value)||Object.keys(value).length!==widgetIds.length||Object.keys(value).some(id=>!widgetIds.includes(id as any)))return fail(400,'DASHBOARD_WIDGET_POLICY_INVALID');
 return Object.fromEntries(widgetIds.map(id=>{
  const roles=value[id];
  if(!Array.isArray(roles)||roles.some(role=>!widgetRoles.includes(role))||new Set(roles).size!==roles.length)fail(400,'DASHBOARD_WIDGET_POLICY_INVALID');
  return [id,widgetRoles.filter(role=>roles.includes(role))];
 }));
}
export async function readDashboardWidgetPolicy(db:any,orgId:number):Promise<{revision:number,roles:Record<string,string[]>}>{
 const row=await db.systemSetting.findUnique({where:{key:key(orgId)}});
 if(!row)return {revision:0,roles:Object.fromEntries(widgetIds.map(id=>[id,[...widgetRoles]]))};
 const value=row.value;
 if(value?.orgId!==orgId||value.version!==1||!Number.isSafeInteger(value.revision)||value.revision<1)fail(500,'DASHBOARD_WIDGET_POLICY_CORRUPT');
 try{return {revision:value.revision,roles:normalize(value.roles)};}catch{return fail(500,'DASHBOARD_WIDGET_POLICY_CORRUPT');}
}
async function actor(db:any,orgId:number,actorId:number,admin=false){
 if(!Number.isSafeInteger(orgId)||orgId<=0||!Number.isSafeInteger(actorId)||actorId<=0)fail(403,'DASHBOARD_WIDGET_POLICY_DENIED');
 const person=await db.employee.findFirst({where:{id:actorId,orgId,status:'ACTIVE',...(admin?{orgRole:'ADMIN'}:{})},select:{id:true,orgRole:true}});
 if(!person||!widgetRoles.includes(person.orgRole))fail(403,'DASHBOARD_WIDGET_POLICY_DENIED');
 return person;
}
export async function getDashboardWidgetPolicy(db:any,orgId:number,actorId:number){
 const person=await actor(db,orgId,actorId),policy=await readDashboardWidgetPolicy(db,orgId);
 return {revision:policy.revision,allowed:widgetIds.filter(id=>policy.roles[id]?.includes(person.orgRole)),...(person.orgRole==='ADMIN'?{roles:policy.roles}:{})};
}
export async function saveDashboardWidgetPolicy(db:any,orgId:number,actorId:number,input:any){
 if(!input||Object.keys(input).some(k=>!['revision','roles'].includes(k))||!Number.isSafeInteger(input.revision)||input.revision<0)fail(400,'DASHBOARD_WIDGET_POLICY_INVALID');
 const roles=normalize(input.roles);
 return retryEditTransaction(db,async tx=>{
  await actor(tx,orgId,actorId,true);
  const before=await readDashboardWidgetPolicy(tx,orgId),same=JSON.stringify(before.roles)===JSON.stringify(roles);
  if(before.revision!==input.revision){if(same&&before.revision===input.revision+1)return before;fail(409,'DASHBOARD_WIDGET_POLICY_CHANGED');}
  if(same)return before;
  const after={revision:before.revision+1,roles},value={version:1,orgId,...after};
  await tx.systemSetting.upsert({where:{key:key(orgId)},create:{key:key(orgId),value,updatedByEmployeeId:actorId},update:{value,updatedByEmployeeId:actorId}});
  await tx.systemSetting.create({data:{key:`DASHBOARD_WIDGET_POLICY_AUDIT:${orgId}:${after.revision}`,value:{orgId,actorId,before,after,at:new Date().toISOString()},updatedByEmployeeId:actorId}});
  return after;
 });
}
export function registerDashboardWidgetPolicyRoutes(app:any,db:any,gates:any){
 const access=async(req:any,res:any,admin=false)=>{
  const ctx=await gates.requireOrgRole(req,res,{allowedRoles:admin?['ADMIN']:[...widgetRoles],allowSystemAdmin:false});if(!ctx)return;
  const orgId=ctx.organization.id,actorId=gates.actorId(),person=await actor(db,orgId,actorId,admin);
  const features=await companyIndustryMenuFeatures(db,orgId,ctx.organization.type);
  if(!features.includes('DASHBOARD')||!await gates.canAccess({orgType:ctx.organization.type,orgRole:person.orgRole,feature:'DASHBOARD'}))fail(403,'DASHBOARD_WIDGET_POLICY_DENIED');
  res.setHeader('Cache-Control','no-store');return {orgId,actorId};
 };
 app.get('/dashboard/widget-policy',async(req:any,res:any)=>{const ctx=await access(req,res);if(ctx)res.json(await getDashboardWidgetPolicy(db,ctx.orgId,ctx.actorId));});
 app.put('/dashboard/widget-policy',async(req:any,res:any)=>{const ctx=await access(req,res,true);if(ctx)res.json(await saveDashboardWidgetPolicy(db,ctx.orgId,ctx.actorId,req.body));});
}
