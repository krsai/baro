import {normalizeEmployeePayTypePolicy} from './employeePayTypePolicy';
import {salaryMonthCalendar} from './salaryMonthCalendar';
export async function companySalaryCalendar(db:any,orgId:number,month:string){
 const [policies,holidays]=await Promise.all([db.employeePayTypePolicy.findMany({where:{orgId}}),db.organizationHoliday.findMany({where:{orgId,holidayDate:{gte:month+'-01',lt:month+'-32'}},select:{holidayDate:true,isPaid:true}})]);
 return ['GENERAL','OUTPUT_FIXED','OUTPUT'].map(payType=>{
  const policy=normalizeEmployeePayTypePolicy(policies.find((row:any)=>row.payType===payType),payType);
  return {payType,standardWorkMinutes:policy.standardWorkMinutes,...salaryMonthCalendar(month,policy,holidays)};
 });
}
