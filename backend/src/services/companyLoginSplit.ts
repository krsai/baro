import {createHttpError} from '../utils/http';
import {editRevision} from '../utils/editRevision';
import {generateNextEmployeeNo} from '../employees/employeeNumber';

export async function previewCompanyLoginSplit(tx:any,input:any){
 const {orgId,personId}=input;
 const personalEmail=String(input.personalEmail||'').trim().toLowerCase(),sharedEmail=String(input.sharedEmail||'').trim().toLowerCase();
 if(!Number.isSafeInteger(orgId)||orgId<=0||!Number.isSafeInteger(personId)||personId<=0||personalEmail===sharedEmail||![personalEmail,sharedEmail].every(value=>/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)))throw createHttpError(400,'INVALID_COMPANY_LOGIN_SPLIT');
 const [organization,person,personal,shared]=await Promise.all([
  tx.organization.findUnique({where:{id:orgId}}),tx.employee.findFirst({where:{id:personId,orgId}}),
  tx.employee.findUnique({where:{orgId_email:{orgId,email:personalEmail}}}),tx.employee.findUnique({where:{orgId_email:{orgId,email:sharedEmail}}}),
 ]);
 if(!organization||organization.ownerOrgId!=null||organization.type!=='MANUFACTURER'||organization.isActive===false||!person||person.status!=='ACTIVE'||person.orgRole!=='ADMIN'||![sharedEmail,personalEmail].includes(person.email))throw createHttpError(409,'COMPANY_LOGIN_PERSON_REVIEW_REQUIRED');
 if(personal&&personal.id!==person.id||shared&&shared.id!==person.id&&(!shared.payrollExcluded||shared.orgRole!=='ADMIN'))throw createHttpError(409,'COMPANY_LOGIN_ALREADY_LINKED_REVIEW_REQUIRED');
 const before={organizationId:organization.id,organizationName:organization.name,organizationUpdatedAt:organization.updatedAt,personId:person.id,personEmail:person.email,personName:person.name,personUpdatedAt:person.updatedAt,sharedId:shared?.id??null,sharedUpdatedAt:shared?.updatedAt??null};
 return {revision:editRevision(before),orgId,personId,personalEmail,sharedEmail,personalName:'정동원',sharedName:`${organization.name} · 공용`,sharedId:shared?.id===person.id?null:shared?.id??null,preservedEmployeeId:person.id,preservedGradeId:person.gradeId,preservedFactoryId:person.factoryId};
}

// Caller must run this in a Serializable transaction with a reviewed revision.
export async function applyCompanyLoginSplit(tx:any,input:any,actorEmail:string){
 const plan=await previewCompanyLoginSplit(tx,input);
 const key=`COMPANY_LOGIN_SPLIT:${plan.orgId}:${plan.personId}`;
 const receipt=await tx.systemSetting.findUnique({where:{key}});
 if(receipt?.value?.requestRevision===input.revision&&receipt.value.personalEmail===plan.personalEmail&&receipt.value.sharedEmail===plan.sharedEmail&&receipt.value.sharedId===plan.sharedId)return {personId:plan.personId,sharedId:plan.sharedId};
 if(input.revision!==plan.revision)throw createHttpError(409,'COMPANY_LOGIN_SPLIT_CHANGED');
 const person=await tx.employee.findFirst({where:{id:plan.personId,orgId:plan.orgId}});
 if(person.email!==plan.personalEmail||person.name!==plan.personalName)await tx.employee.update({where:{id:person.id},data:{email:plan.personalEmail,name:plan.personalName}});
 let sharedId=plan.sharedId;
 if(!sharedId){
  const employeeNo=await generateNextEmployeeNo(tx,plan.orgId);
  const shared=await tx.employee.create({data:{orgId:plan.orgId,email:plan.sharedEmail,name:plan.sharedName,orgRole:'ADMIN',status:'ACTIVE',gradeId:person.gradeId,factoryId:person.factoryId,employeeNo,payrollExcluded:true,alwaysFullAttendance:false,approvedAt:new Date(),approvedBy:actorEmail,createdBy:actorEmail}});
  sharedId=shared.id;
 }
 if(!receipt)await tx.systemSetting.create({data:{key,value:{requestRevision:input.revision,personId:plan.personId,sharedId,personalEmail:plan.personalEmail,sharedEmail:plan.sharedEmail,actorEmail,createdAt:new Date().toISOString()}}});
 return {personId:plan.personId,sharedId};
}
