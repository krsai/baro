import {createHttpError} from '../utils/http';
import {retryEditTransaction} from '../utils/editRevision';
import {normalizeLocalizedName,validLocalizedName} from '../utils/localizedName';
import {createHash} from 'node:crypto';
import {resolvePartnerCode} from './entityProfile';
import {copyAdministrationTemplate} from './companyAdministrationTemplate';
import {normalizeFactoryManagementStartDateKey} from '../factories/factoryManagementStart';
import {generateNextEmployeeNo} from '../employees/employeeNumber';
const tenantTypes=['MANUFACTURER','BRAND','SERVICE'];
const fail=(code:string,status=400):never=>{throw createHttpError(status,code);};
const text=(value:any,max:number)=>typeof value==='string'&&value.trim()&&value.trim().length<=max?value.trim():fail('COMPANY_INVALID_INPUT');

export async function resolveCompanyWorkspace(db:any,email:string,orgId:number){
  if(!Number.isSafeInteger(orgId)||orgId<=0)return fail('COMPANY_INVALID_ID');
  const employee=await db.employee.findUnique({where:{orgId_email:{orgId,email}},include:{organization:true}});
  if(employee?.status!=='ACTIVE')return fail('COMPANY_ACCESS_DENIED',403);
  const organization=employee.organization;
  if(!organization||!organization.isActive||organization.ownerOrgId!=null||!tenantTypes.includes(organization.type))return fail('COMPANY_ACCESS_DENIED',403);
  return {organization,orgRole:employee.orgRole,employeeName:employee.name||email,factoryId:employee.factoryId||null};
}

export async function companyChoices(db:any,email:string){
  const [system,memberships]=await Promise.all([
    db.systemUser.findUnique({where:{email},select:{systemRole:true}}),
    db.employee.findMany({where:{email,status:'ACTIVE',organization:{isActive:true,ownerOrgId:null,type:{in:tenantTypes}}},include:{organization:true},orderBy:{id:'asc'}}),
  ]);
  const systemAdmin=system?.systemRole==='SYSTEM_ADMIN';
  const companies=memberships.map((row:any)=>row.organization);
  return {canCreateCompany:systemAdmin||memberships.some((row:any)=>row.orgRole==='ADMIN'&&row.organization.type!=='BRAND'),
    workspaces:[...(systemAdmin?[{key:'system',id:null,name:'SYSTEM',type:'SYSTEM',role:'SYSTEM_ADMIN'}]:[]),
      ...companies.map((org:any)=>({key:`org:${org.id}`,id:org.id,name:org.name,nameKo:org.nameKo,nameVi:org.nameVi,code:org.code,type:org.type,role:memberships.find((row:any)=>row.orgId===org.id)?.orgRole}))]};
}
async function gradeForCompany(tx:any,orgId:number){
  const existing=await tx.employeeGrade.findFirst({where:{orgId,isActive:true},orderBy:[{isDefault:'desc'},{sortOrder:'asc'},{id:'asc'}]});
  if(existing)return existing.id;
  const set=await tx.employeeGradeSet.upsert({where:{orgId_code:{orgId,code:'STAFF'}},create:{orgId,code:'STAFF',name:'Staff'},update:{}});
  return (await tx.employeeGrade.create({data:{orgId,setId:set.id,code:'STAFF',name:'Staff',nameEn:'Staff',nameKo:'직원',nameVi:'Nhân viên',sortOrder:0,isDefault:true}})).id;
}
export async function createServiceCompany(db:any,email:string,body:any){
  if(!(await companyChoices(db,email)).canCreateCompany)return fail('COMPANY_ADMIN_REQUIRED',403);
  if(!validLocalizedName(body,160))return fail('COMPANY_INVALID_INPUT');
  const {name,nameKo,nameVi}=normalizeLocalizedName(body,'name');
  const code=resolvePartnerCode(body.code,name),key=text(body.clientKey,60);
  if(!/^[-0-9a-f]{36}$/i.test(key))return fail('COMPANY_INVALID_INPUT');
  const setup=body.managementStartDate!==undefined;
  const managementStartDate=setup?normalizeFactoryManagementStartDateKey(body.managementStartDate):null;
  if(setup&&(!managementStartDate||!['VN','KR'].includes(body.country)||!['VND','USD','KRW'].includes(body.currencyCode)||typeof body.adminName!=='string'||!body.adminName.trim()))return fail('COMPANY_INVALID_INPUT');
  const adminName=body.adminName===undefined?email:text(body.adminName,160);
  for(const field of ['adminPayrollExcluded','adminAlwaysFullAttendance'])if(body[field]!==undefined&&typeof body[field]!=='boolean')return fail('COMPANY_INVALID_INPUT');
  const adminPayrollExcluded=body.adminPayrollExcluded??true;
  const adminAlwaysFullAttendance=body.adminAlwaysFullAttendance??false;
  const templateOrgId=body.templateOrgId==null||body.templateOrgId===''?null:Number(body.templateOrgId);
  if(templateOrgId!==null&&(!Number.isSafeInteger(templateOrgId)||templateOrgId<=0))return fail('INVALID_COMPANY_TEMPLATE');
  const setupData={...(setup?{managementStartDate,country:body.country,currencyCode:body.currencyCode}:{}),...(body.adminName!==undefined?{adminName}:{}),...(templateOrgId?{templateOrgId}:{})};
  const requestHash=createHash('sha256').update(JSON.stringify({name,nameKo,nameVi,code,...setupData,...(body.adminPayrollExcluded!==undefined?{adminPayrollExcluded}:{}),...(body.adminAlwaysFullAttendance!==undefined?{adminAlwaysFullAttendance}:{})})).digest('hex');
  return retryEditTransaction(db,async(tx:any)=>{
    if(!(await companyChoices(tx,email)).canCreateCompany)return fail('COMPANY_ADMIN_REQUIRED',403);
    const previous=await tx.companyWorkspaceRegistration.findUnique({where:{actorEmail_clientKey:{actorEmail:email,clientKey:key}},include:{organization:true}});
    if(previous){if(previous.requestHash!==requestHash)return fail('COMPANY_RETRY_CONFLICT',409);return previous.organization;}
    if(templateOrgId){
      const system=await tx.systemUser.findUnique({where:{email},select:{systemRole:true}});
      if(system?.systemRole!=='SYSTEM_ADMIN'){
        const member=await tx.employee.findUnique({where:{orgId_email:{orgId:templateOrgId,email}}});
        if(member?.status!=='ACTIVE'||member?.orgRole!=='ADMIN')return fail('COMPANY_TEMPLATE_ACCESS_DENIED',403);
      }
    }
    if(await tx.organization.findFirst({where:{code:{equals:code,mode:'insensitive'}}}))return fail('COMPANY_CODE_EXISTS',409);
    const currency=setup?await tx.currency.findUnique({where:{code:body.currencyCode}}):null;
    if(setup&&!currency)return fail('COMPANY_CURRENCY_NOT_FOUND');
    const organization=await tx.organization.create({data:{type:'SERVICE',name,nameKo,nameVi,code,industry:'LOGISTICS',createdBy:email,...(setup?{country:body.country,salaryCurrencyId:currency!.id}:{})}});
    const now=new Date();
    await tx.organizationSubscription.create({data:{orgId:organization.id,status:'TRIAL',membershipEmail:email,billingEmail:email,trialStartedAt:now,trialEndsAt:new Date(now.getTime()+30*86400000),createdBy:email}});
    let gradeId=templateOrgId?await copyAdministrationTemplate(tx,templateOrgId,organization.id,managementStartDate||undefined):await gradeForCompany(tx,organization.id);
    if(templateOrgId){
      const ownSource=await tx.employee.findUnique({where:{orgId_email:{orgId:templateOrgId,email}},include:{grade:true}});
      if(ownSource?.status==='ACTIVE'&&ownSource.grade?.isActive){
        const ownGrade=await tx.employeeGrade.findUnique({where:{orgId_code:{orgId:organization.id,code:ownSource.grade.code}}});
        if(ownGrade?.isActive)gradeId=ownGrade.id;
      }
    }
    const workplace=setup?await tx.factory.create({data:{orgId:organization.id,name,factoryCode:'HQ',managementStartDate,country:body.country,salaryCurrencyId:currency!.id,createdBy:email}}):null;
    const employeeNo=setup?await generateNextEmployeeNo(tx,organization.id):undefined;
    await tx.employee.create({data:{orgId:organization.id,email,name:adminName,orgRole:'ADMIN',status:'ACTIVE',gradeId,approvedAt:now,approvedBy:email,payrollExcluded:adminPayrollExcluded,alwaysFullAttendance:adminAlwaysFullAttendance,createdBy:email,...(setup?{factoryId:workplace!.id,employeeNo,joinedAt:new Date(managementStartDate!+'T00:00:00+07:00')}:{})}});
    await tx.companyWorkspaceRegistration.create({data:{actorEmail:email,clientKey:key,orgId:organization.id,requestHash}});
    return organization;
  });
}
export function registerCompanyWorkspaceRoutes(app:any,db:any,gates:any){
  const email=(req:any)=>{const value=gates.getEmail(req);if(!value||!value.includes('@'))return fail('AUTHENTICATION_REQUIRED',401);return value;};
  app.get('/auth/workspaces',async(req:any,res:any)=>res.json(await companyChoices(db,email(req))));
  app.get('/auth/workspace-templates',async(req:any,res:any)=>{
    const actor=email(req),system=await db.systemUser.findUnique({where:{email:actor},select:{systemRole:true}});
    const memberships=system?.systemRole==='SYSTEM_ADMIN'?null:await db.employee.findMany({where:{email:actor,status:'ACTIVE',orgRole:'ADMIN'},select:{orgId:true}});
    res.json(await db.organization.findMany({where:{ownerOrgId:null,isActive:true,type:{in:tenantTypes},...(memberships?{id:{in:memberships.map((row:any)=>row.orgId)}}:{})},select:{id:true,name:true,nameKo:true,nameVi:true},orderBy:{name:'asc'}}));
  });
  app.post('/auth/workspaces',async(req:any,res:any)=>res.status(201).json(await createServiceCompany(db,email(req),req.body)));
  app.get('/company-members',async(req:any,res:any)=>{
    const scope=await gates.requireOrgRole(req,res,{allowedRoles:['ADMIN']});if(!scope)return;
    res.json({members:await db.employee.findMany({where:{orgId:scope.organization.id,email:{not:null}},select:{id:true,email:true,name:true,orgRole:true,status:true},orderBy:{id:'asc'}})});
  });
  app.post('/company-members',async(req:any,res:any)=>{
    const scope=await gates.requireOrgRole(req,res,{allowedRoles:['ADMIN']});if(!scope)return;
    const target=text(req.body.email,254).toLowerCase(),role=req.body.role;
    if(!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(target)||!['ADMIN','ACCOUNTANT'].includes(role))return fail('COMPANY_INVALID_INPUT');
    const result=await retryEditTransaction(db,async(tx:any)=>{
      const orgId=scope.organization.id;
      if(await tx.employee.findUnique({where:{orgId_email:{orgId,email:target}}}))return fail('COMPANY_MEMBER_EXISTS',409);
      const gradeId=await gradeForCompany(tx,orgId);
      return tx.employee.create({data:{orgId,email:target,name:text(req.body.name,160),gradeId,orgRole:role,status:'ACTIVE',approvedAt:new Date(),approvedBy:scope.requesterEmail,payrollExcluded:true,createdBy:scope.requesterEmail},select:{id:true,email:true,name:true,orgRole:true,status:true}});
    });res.status(201).json(result);
  });
}
