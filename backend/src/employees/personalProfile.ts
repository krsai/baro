import {createHttpError} from '../utils/http';

// Context comes from verified request authentication and company membership.
export async function personalProfileEmployee(db:any,context:any){
 const employee=context?.employee,orgId=context?.organization?.id;
 if(!orgId||!employee?.id||employee.status!=='ACTIVE'||employee.orgId!==orgId)
  throw createHttpError(403,'ACTIVE_EMPLOYEE_REQUIRED');
 const row=await db.employee.findFirst({where:{id:employee.id,orgId,status:'ACTIVE'}});
 if(!row)throw createHttpError(403,'ACTIVE_EMPLOYEE_REQUIRED');
 return row;
}
