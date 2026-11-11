import {createHttpError} from '../utils/http';
import {editRevision} from '../utils/editRevision';
import {generateNextEmployeeNo} from '../employees/employeeNumber';

export const BRAND_TEST_EMAIL='krsailer82@gmail.com';
const RECEIPT='BRAND_SEWING_TEST_ACCESS:1';
const targets=[{id:2,code:'THES'},{id:3,code:'URDK'}];
const fail=(code:string):never=>{throw createHttpError(409,code);};
export async function previewBrandTestAccess(tx:any,actorEmail:string){
 if((await tx.systemUser.findUnique({where:{email:actorEmail},select:{systemRole:true}}))?.systemRole!=='SYSTEM_ADMIN')fail('BRAND_TEST_SYSTEM_REQUIRED');
 const rows=[];
 for(const target of targets){
  const org=await tx.organization.findUnique({where:{id:target.id},include:{subscription:true}});
  if(!org||org.code!==target.code||org.type!=='BRAND'||org.ownerOrgId!==null||!org.isActive||!['ACTIVE','TRIAL','GRACE'].includes(org.subscription?.status))fail('BRAND_TEST_TARGET_CHANGED');
  const member=await tx.employee.findUnique({where:{orgId_email:{orgId:target.id,email:BRAND_TEST_EMAIL}}});
  if(member&&(member.status!=='ACTIVE'||member.orgRole!=='ADMIN'))fail('BRAND_TEST_MEMBER_REVIEW_REQUIRED');
  const productOwners=await tx.styleProduct.groupBy({by:['ownerOrgId'],where:{ownerOrgId:target.id},_count:{_all:true}});
  const orders=await tx.workOrder.groupBy({by:['orgId','buyerOrgId','sellerOrgId'],where:{buyerOrgId:target.id},_count:{_all:true}});
  rows.push({orgId:org.id,code:org.code,name:org.name,ownerOrgId:org.ownerOrgId,dataOwnerOrgId:org.dataOwnerOrgId,subscriptionStatus:org.subscription.status,memberId:member?.id??null,memberUpdatedAt:member?.updatedAt??null,productOwners,orders});
 }
 return {email:BRAND_TEST_EMAIL,revision:editRevision(rows),companies:rows};
}
// No company, owner, order, style, subscription or production row is rewritten.
// Caller uses the reviewed revision in a Serializable transaction.
export async function applyBrandTestAccess(tx:any,actorEmail:string,revision:string){
 const plan=await previewBrandTestAccess(tx,actorEmail),previous=await tx.systemSetting.findUnique({where:{key:RECEIPT}});
 if(previous){if(previous.value.email!==BRAND_TEST_EMAIL||plan.companies.some(row=>!previous.value.members.some((member:any)=>member.orgId===row.orgId&&member.employeeId===row.memberId)))fail('BRAND_TEST_RECEIPT_CHANGED');return previous.value;}
 if(revision!==plan.revision)fail('BRAND_TEST_REVISION_CHANGED');
 const members=[];
 for(const company of plan.companies){
  if(company.memberId){members.push({orgId:company.orgId,employeeId:company.memberId,created:false});continue;}
  let grade=await tx.employeeGrade.findFirst({where:{orgId:company.orgId,isActive:true},orderBy:[{isDefault:'desc'},{sortOrder:'asc'},{id:'asc'}]});
  if(!grade){const set=await tx.employeeGradeSet.upsert({where:{orgId_code:{orgId:company.orgId,code:'STAFF'}},create:{orgId:company.orgId,code:'STAFF',name:'Staff'},update:{}});grade=await tx.employeeGrade.create({data:{orgId:company.orgId,setId:set.id,code:'STAFF',name:'Staff',nameKo:'직원',nameEn:'Staff',nameVi:'Nhân viên',isDefault:true,sortOrder:0}});}
  const member=await tx.employee.create({data:{orgId:company.orgId,email:BRAND_TEST_EMAIL,name:'정동원 · 테스트',employeeNo:await generateNextEmployeeNo(tx,company.orgId),orgRole:'ADMIN',status:'ACTIVE',gradeId:grade.id,payrollExcluded:true,alwaysFullAttendance:true,approvedAt:new Date(),approvedBy:actorEmail,createdBy:actorEmail}});
  members.push({orgId:company.orgId,employeeId:member.id,created:true});
 }
 const value={email:BRAND_TEST_EMAIL,actorEmail,revision,members,before:plan.companies,createdAt:new Date().toISOString()};
 await tx.systemSetting.create({data:{key:RECEIPT,value}});return value;
}
