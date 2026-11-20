import {createHttpError} from '../utils/http';
import {validateApprovalRules} from './approvalRules';

export const inventoryPolicyKey=(orgId:number,operation:string)=>`APPROVAL_POLICY:INVENTORY:${operation}:${orgId}`;
export async function inventoryApprovalPolicy(db:any,orgId:number,operation:string){
 if(!['CREATE','DELETE'].includes(operation))throw createHttpError(400,'INVALID_APPROVAL_SUBJECT');
 return (await db.systemSetting.findUnique({where:{key:inventoryPolicyKey(orgId,operation)}}))?.value??{revision:0,drafterRoles:['ADMIN','OPERATOR','ACCOUNTANT'],approverIds:[]};
}
export async function saveInventoryApprovalPolicy(tx:any,orgId:number,actorId:number,operation:string,input:any){
 const current=await inventoryApprovalPolicy(tx,orgId,operation);
 if(input?.revision!==current.revision)throw createHttpError(409,'APPROVAL_SETTINGS_CHANGED');
 if(current.version===2&&input.stages===undefined)throw createHttpError(409,'APPROVAL_SETTINGS_CHANGED');
 if(!Array.isArray(input.drafterRoles)||!input.drafterRoles.length||input.drafterRoles.some((role:any)=>!['ADMIN','OPERATOR','ACCOUNTANT'].includes(role))||new Set(input.drafterRoles).size!==input.drafterRoles.length)throw createHttpError(400,'INVENTORY_INVALID_POLICY');
 let line:any;
 if(input.stages!==undefined){
  const rules=await validateApprovalRules(tx,orgId,[{id:'inventory',name:'Inventory',drafterRole:'ALL',stages:input.stages}],{key:'INVENTORY',menuPath:'/inventory/movements',hasAmount:false,enabled:true});
  line={version:2,stages:rules[0]!.stages};
 }else{
  if(!Array.isArray(input.approverIds)||!input.approverIds.length||input.approverIds.length>10||new Set(input.approverIds).size!==input.approverIds.length||input.approverIds.some((id:any)=>!Number.isSafeInteger(id)||id<=0))throw createHttpError(400,'INVENTORY_INVALID_POLICY');
  const count=await tx.employee.count({where:{orgId,status:'ACTIVE',orgRole:{in:['ADMIN','OPERATOR','ACCOUNTANT']},id:{in:input.approverIds}}});
  if(count!==input.approverIds.length)throw createHttpError(400,'INVENTORY_INVALID_POLICY');
  line={approverIds:input.approverIds};
 }
 const value={revision:current.revision+1,drafterRoles:input.drafterRoles,...line};
 const key=inventoryPolicyKey(orgId,operation);
 await tx.systemSetting.create({data:{key:key+':REV:'+value.revision,value:{before:current,after:value,actorId},updatedByEmployeeId:actorId}});
 await tx.systemSetting.upsert({where:{key},create:{key,value,updatedByEmployeeId:actorId},update:{value,updatedByEmployeeId:actorId}});
 return value;
}
export async function resolveInventoryApproval(tx:any,orgId:number,actorId:number,operation:string,revision?:number,selection:any={},allowIncomplete=false){
 const policy=await inventoryApprovalPolicy(tx,orgId,operation);
 const drafter=await tx.employee.findFirst({where:{id:actorId,orgId,status:'ACTIVE'}});
 if(!drafter||!policy.drafterRoles.includes(drafter.orgRole))throw createHttpError(403,'INVENTORY_DRAFTER_NOT_ALLOWED');
 if(policy.version===2){
  if(!policy.stages?.length)throw createHttpError(400,'INVENTORY_APPROVAL_NOT_CONFIGURED');
  if(revision!==undefined&&revision!==policy.revision)throw createHttpError(409,'APPROVAL_SETTINGS_CHANGED');
  if(!selection||typeof selection!=='object'||Array.isArray(selection))throw createHttpError(400,'INVALID_EXPENSE_APPROVERS');
  const ids:number[]=[],stages:any[]=[];
  for(const [index,stage] of policy.stages.entries()){
   const people=await tx.$queryRaw`SELECT e.id,e.name,e."orgRole",e."gradeId",jsonb_build_object('name',g.name,'nameKo',g."nameKo",'nameEn',g."nameEn",'nameVi',g."nameVi") AS grade FROM "Employee" e LEFT JOIN "EmployeeGrade" g ON g.id=e."gradeId" AND g."orgId"=e."orgId" WHERE e."orgId"=${orgId} AND baro_inventory_stage_eligible(${orgId}::integer,e.id,${JSON.stringify(stage)}::jsonb) AND e.id<>${actorId} ORDER BY e.name,e.id`;
   const candidates=people.filter((p:any)=>!ids.includes(p.id)),key='step'+(index+1);
   const chosen=selection[key+'EmployeeId']??(candidates.length===1?candidates[0].id:null);
   const person=candidates.find((p:any)=>p.id===chosen);
   if(!person&&!allowIncomplete)throw createHttpError(400,people.length?'EXPENSE_APPROVER_REQUIRED':'INVENTORY_APPROVER_UNAVAILABLE');
   if(person)ids.push(person.id);
   const requiredGrade=stage.gradeId?await tx.employeeGrade.findFirst({where:{id:stage.gradeId,orgId,isActive:true,set:{isActive:true}},select:{id:true,name:true,nameKo:true,nameEn:true,nameVi:true}}):null;
   stages.push({...stage,gradeId:stage.gradeMatch==='MINIMUM'?null:stage.gradeId,minimumGradeId:stage.gradeMatch==='MINIMUM'?stage.gradeId:null,requiredGrade,key,employeeId:person?.id??null,name:person?.name,candidates,invalid:Boolean(chosen&&!person)});
  }
  return {policy,drafter:{id:drafter.id,name:drafter.name,orgRole:drafter.orgRole,gradeId:drafter.gradeId},stages,complete:stages.every(stage=>stage.employeeId)};
 }
 if(!policy.approverIds?.length)throw createHttpError(400,'INVENTORY_APPROVAL_NOT_CONFIGURED');
 if(revision!==undefined&&revision!==policy.revision)throw createHttpError(409,'APPROVAL_SETTINGS_CHANGED');
 if(policy.approverIds.includes(actorId))throw createHttpError(400,'INVENTORY_SELF_APPROVAL');
 const people=await tx.employee.findMany({where:{orgId,status:'ACTIVE',orgRole:{in:['ADMIN','OPERATOR','ACCOUNTANT']},id:{in:policy.approverIds}},select:{id:true,name:true,orgRole:true,gradeId:true}});
 if(people.length!==policy.approverIds.length)throw createHttpError(409,'INVENTORY_APPROVER_UNAVAILABLE');
 return {policy,drafter:{id:drafter.id,name:drafter.name,orgRole:drafter.orgRole,gradeId:drafter.gradeId},stages:policy.approverIds.map((id:number,index:number)=>({...people.find((p:any)=>p.id===id),employeeId:id,key:'step'+(index+1)}))};
}
