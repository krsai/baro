import {createHttpError} from '../utils/http';
import {defaultApprovalSettings,validateApprovalSettings} from './expenseApproval';
import {defaultLedgerRegistration,validateLedgerRegistration} from './ledgerRegistration';
export const approvalActions=(menu:string)=>['EXPENSE','BANK_LEDGER'].includes(menu)?['CREATE','UPDATE','DELETE']:[];
export function approvalActionKey(orgId:number,menu='EXPENSE',operation='CREATE'){
 if(!approvalActions(menu).includes(operation))throw createHttpError(400,'INVALID_APPROVAL_SUBJECT');
 return menu==='EXPENSE'&&operation==='CREATE'?`EXPENSE_APPROVAL_POLICY:${orgId}`:`APPROVAL_POLICY:${menu}:${operation}:${orgId}`;
}
export async function approvalActionSettings(db:any,orgId:number,menu:string,operation:string){
 const key=approvalActionKey(orgId,menu,operation),stored=await db.systemSetting.findUnique({where:{key}});
 if(menu==='BANK_LEDGER'&&operation==='CREATE')return {key,stored,value:stored?.value||await defaultLedgerRegistration(db,orgId),inherited:false};
 const fallback=!stored&&key!==`EXPENSE_APPROVAL_POLICY:${orgId}`?await db.systemSetting.findUnique({where:{key:`EXPENSE_APPROVAL_POLICY:${orgId}`}}):null;
 return {key,stored,value:stored?.value||(fallback?{...fallback.value,revision:0}:null),inherited:!stored&&key!==`EXPENSE_APPROVAL_POLICY:${orgId}`};
}
export function registerApprovalActionRoutes(app:any,db:any,gates:any){
 const access=async(req:any,res:any,edit=false)=>{
  const ctx=await gates.requireOrgRole(req,res,{allowedRoles:edit?['ADMIN']:['ADMIN','ACCOUNTANT','OPERATOR'],allowSystemAdmin:false});if(!ctx)return null;
  const actor=await db.employee.findFirst({where:{id:gates.actorId(),orgId:ctx.organization.id,status:'ACTIVE',orgRole:{in:edit?['ADMIN']:['ADMIN','ACCOUNTANT','OPERATOR']}}});
  if(!actor)throw createHttpError(403,'ACTIVE_EMPLOYEE_REQUIRED');return {orgId:ctx.organization.id,actor};
 };
 app.get('/approval-action-settings',async(req:any,res:any)=>{const scope=await access(req,res);if(!scope)return;const {orgId,actor}=scope,menu=String(req.query.menu||''),operation=String(req.query.operation||'');
  const selected=await approvalActionSettings(db,orgId,menu,operation),config=selected.value||defaultApprovalSettings();
  const grades=await db.employeeGrade.findMany({where:{orgId,isActive:true,set:{isActive:true}},select:{id:true,code:true,name:true,nameKo:true,nameEn:true,nameVi:true},orderBy:{sortOrder:'asc'}});
  res.json({menu,operation,drafter:actor,canEdit:actor.orgRole==='ADMIN',inherited:selected.inherited,grades,settings:{...config,kind:'EXPENSE',rules:config.rules||[],revision:selected.stored?.value?.revision||0,drafterScope:config.drafterScope||{role:'ALL',gradeId:null},fallbackGrades:{senior:config.seniorGradeId||grades.find((g:any)=>g.code==='CL2')?.id||null,lead:config.leadGradeId||grades.find((g:any)=>g.code==='CL3')?.id||null}}});
 });
 app.put('/approval-action-settings',async(req:any,res:any)=>{const scope=await access(req,res,true);if(!scope)return;const {orgId,actor}=scope,menu=String(req.query.menu||''),operation=String(req.query.operation||'');
  await db.$transaction(async(tx:any)=>{await tx.$queryRawUnsafe('SELECT id FROM "Organization" WHERE id=$1 FOR UPDATE',orgId);
   const selected=await approvalActionSettings(tx,orgId,menu,operation);if(req.body?.revision!==(selected.stored?.value?.revision||0))throw createHttpError(409,'APPROVAL_SETTINGS_CHANGED');
   const value:any=menu==='BANK_LEDGER'&&operation==='CREATE'?await validateLedgerRegistration(tx,orgId,req.body):await validateApprovalSettings(tx,orgId,req.body);value.revision=req.body.revision+1;
   for(const field of ['seniorGradeId','leadGradeId'])if(selected.value?.[field]!=null)value[field]=selected.value[field];
   const data={value,updatedByEmployeeId:actor.id};await tx.systemSetting.upsert({where:{key:selected.key},create:{key:selected.key,...data},update:data});
  },{isolationLevel:'Serializable'});res.json({ok:true});
 });
}
