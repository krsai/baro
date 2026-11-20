import {createHttpError} from '../utils/http';
export const approvalMenus=['EXPENSE','BANK_LEDGER','INVOICE','WORK_TIME','INVENTORY'];
export const approvalOperations=(menu:string)=>menu==='WORK_TIME'?['CREATE']:menu==='INVOICE'?['DELETE']:menu==='INVENTORY'?['CREATE','DELETE']:['CREATE','UPDATE','DELETE'];
export const approvalLocalKey=(orgId:number,menu:string,operation:string)=>menu==='WORK_TIME'?`WORK_TIME_POLICY:${orgId}`:menu==='EXPENSE'&&operation==='CREATE'?`EXPENSE_APPROVAL_POLICY:${orgId}`:`APPROVAL_POLICY:${menu}:${operation}:${orgId}`;
export const approvalDefaultKey=(menu:string,operation:string)=>`APPROVAL_DEFAULT:${menu}:${operation}`;
export const approvalModeKey=(orgId:number,menu:string,operation:string)=>`APPROVAL_MODE:${menu}:${operation}:${orgId}`;
export async function effectiveApprovalDefault(db:any,orgId:number,menu:string,operation:string){
 if(typeof db.$queryRaw!=='function')return null;
 const mode=await db.systemSetting.findUnique({where:{key:approvalModeKey(orgId,menu,operation)}});
 const local=await db.systemSetting.findUnique({where:{key:approvalLocalKey(orgId,menu,operation)}});
 if(mode?.value?.mode==='LOCAL'||!mode&&local)return null;
 const defaults=await db.systemSetting.findUnique({where:{key:approvalDefaultKey(menu,operation)}});
 if(!defaults){if(mode?.value?.mode==='DEFAULT')throw createHttpError(409,'APPROVAL_DEFAULT_UNAVAILABLE');return null;}
 const [row]=await db.$queryRaw`SELECT baro_approval_effective(${orgId}::integer,${menu}::text,${operation}::text) AS value`;
 if(!row?.value)throw createHttpError(409,'APPROVAL_DEFAULT_UNAVAILABLE');
 return row.value;
}
export async function localApprovalMode(tx:any,orgId:number,menu:string,operation:string,actorId:number){
 const key=approvalModeKey(orgId,menu,operation),value={mode:'LOCAL'};
 await tx.systemSetting.upsert({where:{key},create:{key,value,updatedByEmployeeId:actorId},update:{value,updatedByEmployeeId:actorId}});
}
export const noApprovalPolicy=(config:any,drafterId:number)=>({exempt:true,exemptionReason:'NO_APPROVAL_REQUIRED',noApprovalRequired:true,drafterId,config,resolvedStages:[],ruleIds:[]});
