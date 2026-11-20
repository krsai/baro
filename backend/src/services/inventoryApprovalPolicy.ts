import {createHttpError} from '../utils/http';

export const inventoryPolicyKey=(orgId:number,operation:string)=>`APPROVAL_POLICY:INVENTORY:${operation}:${orgId}`;
export async function inventoryApprovalPolicy(db:any,orgId:number,operation:string){
 if(!['CREATE','DELETE'].includes(operation))throw createHttpError(400,'INVALID_APPROVAL_SUBJECT');
 return (await db.systemSetting.findUnique({where:{key:inventoryPolicyKey(orgId,operation)}}))?.value??{revision:0,drafterRoles:['ADMIN','OPERATOR','ACCOUNTANT'],approverIds:[]};
}
export async function saveInventoryApprovalPolicy(tx:any,orgId:number,actorId:number,operation:string,input:any){
 const current=await inventoryApprovalPolicy(tx,orgId,operation);
 if(input?.revision!==current.revision)throw createHttpError(409,'APPROVAL_SETTINGS_CHANGED');
 if(!Array.isArray(input.drafterRoles)||!input.drafterRoles.length||input.drafterRoles.some((role:any)=>!['ADMIN','OPERATOR','ACCOUNTANT'].includes(role))||new Set(input.drafterRoles).size!==input.drafterRoles.length||!Array.isArray(input.approverIds)||!input.approverIds.length||input.approverIds.length>10||new Set(input.approverIds).size!==input.approverIds.length||input.approverIds.some((id:any)=>!Number.isSafeInteger(id)||id<=0))throw createHttpError(400,'INVENTORY_INVALID_POLICY');
 const count=await tx.employee.count({where:{orgId,status:'ACTIVE',orgRole:{in:['ADMIN','OPERATOR','ACCOUNTANT']},id:{in:input.approverIds}}});
 if(count!==input.approverIds.length)throw createHttpError(400,'INVENTORY_INVALID_POLICY');
 const value={revision:current.revision+1,drafterRoles:input.drafterRoles,approverIds:input.approverIds};
 const key=inventoryPolicyKey(orgId,operation);
 await tx.systemSetting.create({data:{key:key+':REV:'+value.revision,value:{before:current,after:value,actorId},updatedByEmployeeId:actorId}});
 await tx.systemSetting.upsert({where:{key},create:{key,value,updatedByEmployeeId:actorId},update:{value,updatedByEmployeeId:actorId}});
 return value;
}
export async function resolveInventoryApproval(tx:any,orgId:number,actorId:number,operation:string,revision?:number){
 const policy=await inventoryApprovalPolicy(tx,orgId,operation);
 const drafter=await tx.employee.findFirst({where:{id:actorId,orgId,status:'ACTIVE'}});
 if(!drafter||!policy.drafterRoles.includes(drafter.orgRole))throw createHttpError(403,'INVENTORY_DRAFTER_NOT_ALLOWED');
 if(!policy.approverIds.length)throw createHttpError(400,'INVENTORY_APPROVAL_NOT_CONFIGURED');
 if(revision!==undefined&&revision!==policy.revision)throw createHttpError(409,'APPROVAL_SETTINGS_CHANGED');
 if(policy.approverIds.includes(actorId))throw createHttpError(400,'INVENTORY_SELF_APPROVAL');
 const people=await tx.employee.findMany({where:{orgId,status:'ACTIVE',orgRole:{in:['ADMIN','OPERATOR','ACCOUNTANT']},id:{in:policy.approverIds}},select:{id:true,name:true,orgRole:true,gradeId:true}});
 if(people.length!==policy.approverIds.length)throw createHttpError(409,'INVENTORY_APPROVER_UNAVAILABLE');
 return {policy,drafter:{id:drafter.id,name:drafter.name,orgRole:drafter.orgRole,gradeId:drafter.gradeId},stages:policy.approverIds.map((id:number,index:number)=>({...people.find((p:any)=>p.id===id),employeeId:id,key:'step'+(index+1)}))};
}
