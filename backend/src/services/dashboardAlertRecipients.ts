import {createHttpError} from '../utils/http';
import {retryEditTransaction} from '../utils/editRevision';
import {companyIndustryMenuFeatures} from './industryMenuPolicy';

export const dashboardRecipientRoles=['ADMIN','ACCOUNTANT','OPERATOR'] as const;
const key=(orgId:number)=>`DASHBOARD_ALERT_RECIPIENTS:${orgId}`;
const fail=(status:number,message:string):never=>{throw createHttpError(status,message);};
const normalize=(roles:any):string[]=>{
 if(!Array.isArray(roles)||!roles.includes('ADMIN')||roles.some(role=>!dashboardRecipientRoles.includes(role))||new Set(roles).size!==roles.length)fail(400,'DASHBOARD_RECIPIENTS_INVALID');
 return dashboardRecipientRoles.filter(role=>roles.includes(role));
};
export const handledRecipientKind=(kind:string)=>['PARTNER_HANDLED_ITEM','PARTNER_HANDLED_SETTINGS'].includes(kind);
export async function readDashboardRecipients(db:any,orgId:number){
 const row=await db.systemSetting.findUnique({where:{key:key(orgId)}});
 if(!row)return {revision:0,handledRoles:['ADMIN','ACCOUNTANT']};
 const value=row.value as any;
 if(value?.orgId!==orgId||value.version!==1||!Number.isSafeInteger(value.revision)||value.revision<1)fail(500,'DASHBOARD_RECIPIENTS_CORRUPT');
 let handledRoles:string[];
 try{handledRoles=normalize(value.handledRoles);}catch{fail(500,'DASHBOARD_RECIPIENTS_CORRUPT');}
 return {revision:value.revision,handledRoles:handledRoles!};
}
export function receivesAccountingAlert(kind:string,role:string,policy:{handledRoles:string[]}){
 return handledRecipientKind(kind)?policy.handledRoles.includes(role):['ADMIN','ACCOUNTANT'].includes(role);
}
async function admin(db:any,orgId:number,actorId:number){
 if(!Number.isSafeInteger(orgId)||orgId<=0||!Number.isSafeInteger(actorId)||actorId<=0)fail(403,'DASHBOARD_RECIPIENTS_ADMIN_REQUIRED');
 if(!await db.employee.findFirst({where:{id:actorId,orgId,status:'ACTIVE',orgRole:'ADMIN'},select:{id:true}}))fail(403,'DASHBOARD_RECIPIENTS_ADMIN_REQUIRED');
}
export async function getDashboardRecipients(db:any,orgId:number,actorId:number){
 await admin(db,orgId,actorId);return readDashboardRecipients(db,orgId);
}
export async function saveDashboardRecipients(db:any,orgId:number,actorId:number,input:any){
 if(!input||Object.keys(input).some(field=>!['revision','handledRoles'].includes(field))||!Number.isSafeInteger(input.revision)||input.revision<0)fail(400,'DASHBOARD_RECIPIENTS_INVALID');
 const handledRoles=normalize(input.handledRoles);
 return retryEditTransaction(db,async tx=>{
  await admin(tx,orgId,actorId);
  const before=await readDashboardRecipients(tx,orgId),same=JSON.stringify(before.handledRoles)===JSON.stringify(handledRoles);
  if(before.revision!==input.revision){if(same&&before.revision===input.revision+1)return before;fail(409,'DASHBOARD_RECIPIENTS_CHANGED');}
  if(same)return before;
  const after={revision:before.revision+1,handledRoles},value={version:1,orgId,...after};
  await tx.systemSetting.upsert({where:{key:key(orgId)},create:{key:key(orgId),value,updatedByEmployeeId:actorId},update:{value,updatedByEmployeeId:actorId}});
  await tx.systemSetting.create({data:{key:`DASHBOARD_ALERT_RECIPIENTS_AUDIT:${orgId}:${after.revision}`,value:{orgId,actorId,before,after,at:new Date().toISOString()},updatedByEmployeeId:actorId}});
  return after;
 });
}
export function registerDashboardRecipientRoutes(app:any,db:any,gates:any){
 const access=async(req:any,res:any)=>{
  const ctx=await gates.requireOrgRole(req,res,{allowedRoles:['ADMIN'],allowSystemAdmin:false});if(!ctx)return;
  const orgId=ctx.organization.id,actorId=gates.actorId();await admin(db,orgId,actorId);
  const features=await companyIndustryMenuFeatures(db,orgId,ctx.organization.type);
  if(!features.includes('DASHBOARD')||!await gates.canAccess({orgType:ctx.organization.type,orgRole:'ADMIN',feature:'DASHBOARD'}))fail(403,'DASHBOARD_RECIPIENTS_ADMIN_REQUIRED');
  res.setHeader('Cache-Control','no-store');return {orgId,actorId};
 };
 app.get('/dashboard/alert-recipients',async(req:any,res:any)=>{const ctx=await access(req,res);if(ctx)res.json(await getDashboardRecipients(db,ctx.orgId,ctx.actorId));});
 app.put('/dashboard/alert-recipients',async(req:any,res:any)=>{const ctx=await access(req,res);if(ctx)res.json(await saveDashboardRecipients(db,ctx.orgId,ctx.actorId,req.body));});
}
