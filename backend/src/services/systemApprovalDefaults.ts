import {randomUUID} from 'node:crypto';
import {createHttpError} from '../utils/http';
import {approvalMenus,approvalOperations,approvalDefaultKey,approvalModeKey,approvalLocalKey} from './approvalDefaults';
import {validateApprovalSettings} from './expenseApproval';
import {validateLedgerRegistration} from './ledgerRegistration';
import {validateApprovalRules} from './approvalRules';

const valid=(menu:string,operation:string)=>approvalMenus.includes(menu)&&approvalOperations(menu).includes(operation);
export function registerSystemApprovalDefaults(app:any,db:any,gates:any){
 const system=async(req:any,res:any)=>{const access=await gates.requireSystemAdmin?.(req,res);if(!access)return null;const user=await db.systemUser.findUnique({where:{email:access.requesterEmail}});if(user?.systemRole!=='SYSTEM_ADMIN')throw createHttpError(403,'SYSTEM_ADMIN_REQUIRED');return user;};
 app.get('/system-approval-action-settings',async(req:any,res:any)=>{
  if(!await system(req,res))return;const menu=String(req.query.menu),operation=String(req.query.operation);if(!valid(menu,operation))throw createHttpError(400,'INVALID_APPROVAL_SUBJECT');
  const row=await db.systemSetting.findUnique({where:{key:approvalDefaultKey(menu,operation)}});if(!row)throw createHttpError(409,'APPROVAL_DEFAULT_UNAVAILABLE');
  const company=row.value.sourceOrgId;
  const [resolved]=await db.$queryRaw`SELECT baro_approval_effective(${company}::integer,${menu}::text,${operation}::text,true) AS value`;
  const grades=await db.employeeGrade.findMany({where:{orgId:company,isActive:true,set:{isActive:true}},select:{id:true,code:true,name:true,nameKo:true,nameEn:true,nameVi:true},orderBy:{sortOrder:'asc'}});
  res.json({menu,operation,canEdit:true,grades,settings:{...resolved.value,...(menu==='BANK_LEDGER'&&operation==='CREATE'?{kind:'BANK_LEDGER'}:menu==='WORK_TIME'||menu==='INVENTORY'?{}:{kind:'EXPENSE'}),rules:resolved.value.rules||[]}});
 });
 app.put('/system-approval-action-settings/batch',async(req:any,res:any)=>{
  const user=await system(req,res);if(!user)return;const changes=req.body?.changes;
  if(!Array.isArray(changes)||!changes.length||changes.length>10||changes.some((c:any)=>!valid(c.menu,c.operation))||new Set(changes.map((c:any)=>c.menu+':'+c.operation)).size!==changes.length)throw createHttpError(400,'INVALID_APPROVAL_SUBJECT');
  const saved=await db.$transaction(async(tx:any)=>{
   await tx.$queryRawUnsafe('SELECT pg_advisory_xact_lock(2026112008)::text');
   const result=[];
   for(const change of changes){
    const key=approvalDefaultKey(change.menu,change.operation),row=await tx.systemSetting.findUnique({where:{key}});if(!row||row.value.revision!==change.settings?.revision)throw createHttpError(409,'APPROVAL_SETTINGS_CHANGED');
    const orgId=row.value.sourceOrgId,input=change.settings;let value:any;
    if(['INVENTORY','WORK_TIME'].includes(change.menu)){
     const roles=change.menu==='WORK_TIME'?['ADMIN','OPERATOR','ACCOUNTANT','WORKER']:['ADMIN','OPERATOR','ACCOUNTANT'];
     if(!Array.isArray(input.drafterRoles)||!input.drafterRoles.length||input.drafterRoles.some((r:any)=>!roles.includes(r))||change.menu==='WORK_TIME'&&(!Array.isArray(input.proxyRoles)||input.proxyRoles.some((r:any)=>!['ADMIN','OPERATOR','ACCOUNTANT'].includes(r))))throw createHttpError(400,'INVALID_APPROVAL_RULE');
     const rules=await validateApprovalRules(tx,orgId,[{id:'default',name:'Default',drafterRole:'ALL',stages:input.stages}],{key:change.menu,menuPath:null,hasAmount:false,enabled:true});
     value={version:2,drafterRoles:input.drafterRoles,...(change.menu==='WORK_TIME'?{proxyRoles:input.proxyRoles}:{}),stages:rules[0]!.stages};
    }else value=change.menu==='BANK_LEDGER'&&change.operation==='CREATE'?await validateLedgerRegistration(tx,orgId,input):await validateApprovalSettings(tx,orgId,input);
    const [previous]=await tx.$queryRaw`SELECT baro_approval_effective(${orgId}::integer,${change.menu}::text,${change.operation}::text,true) AS value`;
    for(const field of ['seniorGradeId','leadGradeId'])if(previous?.value?.[field]!=null)value[field]=previous.value[field];
    const [portable]=await tx.$queryRaw`SELECT baro_approval_portable(${JSON.stringify(value)}::jsonb,${orgId}::integer) AS policy`;
    const next={revision:row.value.revision+1,sourceOrgId:orgId,policy:portable.policy};
    await tx.systemSetting.create({data:{key:key+':REV:'+next.revision,updatedBy:user.email,value:{actorId:user.id,before:row.value,after:next}}});
    await tx.systemSetting.update({where:{key},data:{value:next,updatedBy:user.email}});
    result.push({menu:change.menu,operation:change.operation,settings:{...value,revision:next.revision}});
   }return result;
  },{isolationLevel:'Serializable'});res.json({saved});
 });
 app.put('/approval-action-settings/source',async(req:any,res:any)=>{
  const scope=await gates.requireOrgRole(req,res,{allowedRoles:['ADMIN'],allowSystemAdmin:false});if(!scope)return;
  const orgId=scope.organization.id,actorId=gates.actorId(),{menu,operation,revision,mode}=req.body||{};
  if(!valid(menu,operation)||!['DEFAULT','LOCAL'].includes(mode))throw createHttpError(400,'INVALID_APPROVAL_SUBJECT');
  await db.$transaction(async(tx:any)=>{
   await tx.$queryRaw`SELECT id FROM "Organization" WHERE id=${orgId} FOR UPDATE`;
   if(!await tx.employee.findFirst({where:{id:actorId,orgId,status:'ACTIVE',orgRole:'ADMIN'}}))throw createHttpError(403,'ACTIVE_EMPLOYEE_REQUIRED');
   const [current]=await tx.$queryRaw`SELECT baro_approval_effective(${orgId}::integer,${menu}::text,${operation}::text) AS value`;
   if((current?.value?.revision||0)!==revision)throw createHttpError(409,'APPROVAL_SETTINGS_CHANGED');
   if(!await tx.systemSetting.findUnique({where:{key:approvalDefaultKey(menu,operation)}}))throw createHttpError(409,'APPROVAL_DEFAULT_UNAVAILABLE');
   const key=approvalModeKey(orgId,menu,operation),before=await tx.systemSetting.findUnique({where:{key}}),value={mode,revision:(before?.value?.revision||0)+1};
   if(mode==='LOCAL'&&!await tx.systemSetting.findUnique({where:{key:approvalLocalKey(orgId,menu,operation)}})){
    const data={...current.value,revision:revision+1};delete data.source;delete data.defaultRevision;
    await tx.systemSetting.create({data:{key:approvalLocalKey(orgId,menu,operation),value:data,updatedByEmployeeId:actorId}});
   }
   await tx.systemSetting.create({data:{key:key+':EVENT:'+randomUUID(),value:{before:before?.value||null,after:value,actorId},updatedByEmployeeId:actorId}});
   await tx.systemSetting.upsert({where:{key},create:{key,value,updatedByEmployeeId:actorId},update:{value,updatedByEmployeeId:actorId}});
  },{isolationLevel:'Serializable'});res.json({saved:true});
 });
}
