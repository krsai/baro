import { createHttpError } from '../utils/http';

export const EXPENSE_APPROVAL_ROLES = ['ADMIN','OPERATOR','ACCOUNTANT'];
export const EXPENSE_APPROVAL_INCLUDE = { orderBy: { position: 'asc' as const }, include: {employee: { select: { id:true, name:true, status:true } }} };

export async function validateExpenseApprovers(tx:any, orgId:number, value:unknown) {
  const ids = value ?? [];
  if(!Array.isArray(ids) || ids.length>20 || new Set(ids).size!==ids.length || ids.some(id=>!Number.isSafeInteger(id)||id<=0))
    throw createHttpError(400,'INVALID_EXPENSE_APPROVERS');
  if(ids.length) {
    const employees=await tx.employee.findMany({where:{id:{in:ids},orgId,status:'ACTIVE',orgRole:{in:EXPENSE_APPROVAL_ROLES}},select:{id:true}});
    if(employees.length!==ids.length)throw createHttpError(400,'INVALID_EXPENSE_APPROVERS');
  }
  return ids as number[];
}

export async function replaceExpenseApprovers(tx:any,orgId:number,requestId:number,ids:number[],previous:any[]=[]) {
  if(JSON.stringify(ids)===JSON.stringify(previous.map(step=>step.employeeId)))return;
  await tx.expenseRequestApprovalStep.deleteMany({where:{orgId,requestId}});
  for(const [index,employeeId] of ids.entries())await tx.expenseRequestApprovalStep.create({data:{orgId,requestId,employeeId,position:index+1}});
}
