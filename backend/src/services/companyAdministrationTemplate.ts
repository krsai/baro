import {createHttpError} from '../utils/http';
import {approvalSettingKey} from './expenseApproval';
// Copy definitions, never people, salary amounts, decisions or business documents.
export async function copyAdministrationTemplate(tx:any,sourceOrgId:number,targetOrgId:number,startDate?:string){
 const source=await tx.organization.findUnique({where:{id:sourceOrgId}});
 if(!source||source.ownerOrgId!=null||!['MANUFACTURER','BRAND','SERVICE'].includes(source.type)||sourceOrgId===targetOrgId)throw createHttpError(400,'INVALID_COMPANY_TEMPLATE');
 const sets=await tx.employeeGradeSet.findMany({where:{orgId:sourceOrgId},include:{grades:true},orderBy:{id:'asc'}});
 if(!sets.some((set:any)=>set.isActive&&set.grades.some((grade:any)=>grade.isActive&&grade.isDefault)))throw createHttpError(409,'COMPANY_TEMPLATE_DEFAULT_GRADE_REQUIRED');
 if(await tx.employeeGradeSet.count({where:{orgId:targetOrgId}}))throw createHttpError(409,'COMPANY_TEMPLATE_ALREADY_INITIALIZED');
 let defaultGradeId:number|null=null;
 for(const set of sets){
  const created=await tx.employeeGradeSet.create({data:{orgId:targetOrgId,code:set.code,name:set.name,isActive:set.isActive}});
  for(const grade of set.grades){
   const copy=await tx.employeeGrade.create({data:{orgId:targetOrgId,setId:created.id,...Object.fromEntries(['code','name','nameKo','nameEn','nameVi','sortOrder','isDefault','isActive'].map(key=>[key,grade[key]]))}});
   if(set.isActive&&grade.isActive&&grade.isDefault)defaultGradeId=copy.id;
  }
 }
 for(const policy of await tx.employeePayTypePolicy.findMany({where:{orgId:sourceOrgId}})){
  await tx.employeePayTypePolicy.create({data:{orgId:targetOrgId,...Object.fromEntries(['payType','workWeekdays','standardClockIn','standardClockOut','breakMinutes','workdayMinimumMinutes'].map(key=>[key,policy[key]]))}});
 }
 if(startDate){
  const holidays=await tx.organizationHoliday.findMany({where:{orgId:sourceOrgId,holidayDate:{gte:startDate}},select:{holidayDate:true,isPaid:true}});
  if(holidays.length)await tx.organizationHoliday.createMany({data:holidays.map((row:any)=>({orgId:targetOrgId,holidayDate:row.holidayDate,isPaid:row.isPaid})),skipDuplicates:true});
 }
 const settingKeys:[string,string][]=[[`APP_SETTINGS:${sourceOrgId}`,`APP_SETTINGS:${targetOrgId}`],[approvalSettingKey(sourceOrgId),approvalSettingKey(targetOrgId)]];
 for(const [sourceKey,targetKey] of settingKeys){
  const setting=await tx.systemSetting.findUnique({where:{key:sourceKey}});
  if(setting)await tx.systemSetting.create({data:{key:targetKey,value:sourceKey.startsWith('APP_SETTINGS:')?{defaultVatRate:setting.value.defaultVatRate}:{limits:setting.value.limits}}});
 }
 return defaultGradeId!;
}
