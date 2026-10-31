import {createHttpError} from '../utils/http';

export const EMPLOYEE_PAYEE_SELECT={id:true,name:true,employeeNo:true,orgId:true,status:true,phone:true,email:true,bankName:true,bankAccountNumber:true};
export const employeePayee=(employee:any)=>employee&&({id:`EMP:${employee.id}`,employeeId:employee.id,name:employee.name||employee.employeeNo||String(employee.id),code:employee.employeeNo,type:'EMPLOYEE',isActive:employee.status==='ACTIVE',contactPhone:employee.phone,email:employee.email,bankName:employee.bankName,bankAccountNumber:employee.bankAccountNumber,serviceTypes:[]});
export const expenseApplicationDate=()=>new Date().toLocaleDateString('sv-SE',{timeZone:'Asia/Ho_Chi_Minh'});
export function expensePayeeIds(body:any){
 const partner=body?.partnerOrgId==null||body.partnerOrgId===''?null:body.partnerOrgId;
 const employee=body?.payeeEmployeeId==null||body.payeeEmployeeId===''?null:body.payeeEmployeeId;
 if((partner===null)===(employee===null)||[partner,employee].some(id=>id!==null&&(!Number.isSafeInteger(id)||id<=0)))throw createHttpError(400,'INVALID_EXPENSE_REQUEST_HEADER');
 return {partnerOrgId:partner,...(employee===null?{}:{payeeEmployeeId:employee})};
}
export async function requireEmployeePayee(tx:any,orgId:number,employeeId:number){
 if(!Number.isSafeInteger(employeeId)||employeeId<=0)throw createHttpError(400,'INVALID_EXPENSE_EMPLOYEE');
 const employee=await tx.employee.findFirst({where:{id:employeeId,orgId,status:'ACTIVE'},select:EMPLOYEE_PAYEE_SELECT});
 if(!employee)throw createHttpError(400,'INVALID_EXPENSE_EMPLOYEE');
 return employee;
}
export function registerExpensePayeeRoutes(app:any,db:any,gates:any){
 const access=async(req:any,res:any,write=false)=>gates.requireOrgRole(req,res,{allowedRoles:write?['ADMIN','ACCOUNTANT']:['ADMIN','ACCOUNTANT','OPERATOR']});
 app.get('/expense-payees',async(req:any,res:any)=>{
  const ctx=await access(req,res);if(!ctx)return;const orgId=ctx.organization.id;
  const [partners,employees]=await Promise.all([
   db.organization.findMany({where:{ownerOrgId:orgId,isActive:true,type:{in:['PROCESS_OUTSOURCING','MATERIAL_SUPPLIER','LOGISTICS_PROVIDER']}},include:{outsourcingServiceAssignments:{include:{serviceType:true}}},orderBy:[{name:'asc'},{id:'asc'}]}),
   db.employee.findMany({where:{orgId,status:'ACTIVE'},select:EMPLOYEE_PAYEE_SELECT,orderBy:[{name:'asc'},{id:'asc'}]}),
  ]);
  res.json([...partners.map((p:any)=>({id:p.id,name:p.name,nameKo:p.nameKo,nameVi:p.nameVi,code:p.code,type:p.type,isActive:p.isActive,contactName:p.representative,contactPhone:p.phone,email:p.email,businessNumber:p.businessNumber,address:p.address,country:p.country,serviceTypes:p.outsourcingServiceAssignments.map((link:any)=>link.serviceType)})),...employees.map(employeePayee)]);
 });
 app.get('/expense-payees/employees/:id/bank-accounts',async(req:any,res:any)=>{
  const ctx=await access(req,res);if(!ctx)return;const orgId=ctx.organization.id,employeeId=Number(req.params.id);
  await requireEmployeePayee(db,orgId,employeeId);
  res.json({accounts:await db.employeeExpenseBankAccount.findMany({where:{orgId,employeeId},orderBy:{createdAt:'asc'}})});
 });
 app.post('/expense-payees/employees/:id/bank-accounts',async(req:any,res:any)=>{
  const ctx=await access(req,res,true);if(!ctx)return;const orgId=ctx.organization.id,employeeId=Number(req.params.id),actorId=gates.actorId();
  const currencyCode=req.body?.currencyCode;
  if(!['VND','KRW','USD'].includes(currencyCode)||['bankName','accountNumber','accountHolder'].some(key=>typeof req.body?.[key]!=='string'||!req.body[key].trim()||req.body[key].length>200||/[\r\n\x00-\x1f]/.test(req.body[key])))throw createHttpError(400,'INVALID_EMPLOYEE_BANK_ACCOUNT');
  const data={orgId,employeeId,currencyCode,...Object.fromEntries(['bankName','accountNumber','accountHolder'].map(key=>[key,req.body[key].trim()]))};
  const saved=await db.$transaction(async(tx:any)=>{
   await requireEmployeePayee(tx,orgId,employeeId);
   if(!actorId||!await tx.employee.findFirst({where:{id:actorId,orgId,status:'ACTIVE',orgRole:{in:['ADMIN','ACCOUNTANT']}}}))throw createHttpError(403,'ACTIVE_EMPLOYEE_REQUIRED');
   await tx.$queryRawUnsafe('SELECT id FROM "Employee" WHERE id=$1 AND "orgId"=$2 FOR UPDATE',employeeId,orgId);
   return await tx.employeeExpenseBankAccount.findFirst({where:data})||tx.employeeExpenseBankAccount.create({data:{...data,createdByEmployeeId:actorId}});
  },{isolationLevel:'Serializable'});
  res.json(saved);
 });
}
