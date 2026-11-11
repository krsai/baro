import {EMPLOYEE_PAY_TYPE,normalizePayType} from './employeeCompensation';
import {normalizeEmployeePayTypePolicy,type EmployeePayTypePolicyValue} from './employeePayTypePolicy';
import {salaryMonthCalendar,type SalaryHoliday} from './salaryMonthCalendar';
export type SalaryAttendanceParameters={
 PAID_LEAVE_WORKDAYS:number;UNPAID_LEAVE_WORKDAYS:number;ANNUAL_LEAVE_WORKDAYS:number;LEAVE_CONFLICT_DAYS:number;REGULAR_WORKDAYS:number;ACTUAL_WORKDAYS:number;SCHEDULED_WORKDAYS:number;HOLIDAY_WORKDAYS:number;FULL_ATTENDANCE_FACTOR:0|1;
 PAYABLE_WORKDAYS:number;PAID_HOLIDAY_WORKDAYS:number;UNPAID_HOLIDAY_WORKDAYS:number;REQUIRED_WORKDAYS:number;SCHEDULED_WORK_HOURS:number;CALENDAR_PAYROLL_VERSION:number;
};
export const resolveSalaryAttendanceParameters=({month,payType:payTypeInput,holidayDateKeys,attendanceEntries,policy:policyInput,alwaysFullAttendance=false,employmentStart=null,employmentEnd=null,leaveEntries=[],approvedWork=[]}:{month:string;payType:unknown;holidayDateKeys:Iterable<SalaryHoliday>;attendanceEntries:{workDate?:unknown;workedSeconds?:unknown}[];policy?:EmployeePayTypePolicyValue;alwaysFullAttendance?:boolean;employmentStart?:string|null;employmentEnd?:string|null;leaveEntries?:{leaveDate:string;kind:string;portion?:number}[];approvedWork?:{workDate:string;kind:string;approvedMinutes:number}[]}):SalaryAttendanceParameters=>{
 const payType=normalizePayType(payTypeInput,EMPLOYEE_PAY_TYPE.GENERAL)??EMPLOYEE_PAY_TYPE.GENERAL,policy=normalizeEmployeePayTypePolicy(policyInput,payType),calendar=salaryMonthCalendar(month,policy,holidayDateKeys);
 const worked=new Map<string,number>();
 attendanceEntries.forEach(entry=>{const date=String(entry.workDate||''),seconds=Number(entry.workedSeconds);if(date.startsWith(month+'-')&&Number.isFinite(seconds)&&seconds>0)worked.set(date,(worked.get(date)||0)+seconds);});
 const leaves=new Map<string,typeof leaveEntries>();
 for(const row of leaveEntries)leaves.set(row.leaveDate,[...(leaves.get(row.leaveDate)||[]),row]);
 let personalPaid=0,personalUnpaid=0,annual=0,conflicts=0;
 let actual=0,holidayWorked=0,paid=0,unpaid=0,required=0;
 for(const day of calendar.days){
  if(employmentStart&&day.dateKey<employmentStart||employmentEnd&&day.dateKey>employmentEnd)continue;
  // A valid attendance day is one normal day. Punch duration never creates extra pay.
  const present=(worked.get(day.dateKey)||0)>0;
  if(day.regular){
   required++;
   const entries=leaves.get(day.dateKey)||[];
   const portion=(row:typeof leaveEntries[number])=>row.portion??(row.kind==='ANNUAL_AM'||row.kind==='ANNUAL_PM'?0.5:1);
   const off=Math.min(1,entries.reduce((sum,row)=>sum+portion(row),0));
   if(entries.some(row=>portion(row)===1)&&present)conflicts++;
   personalUnpaid+=entries.filter(row=>row.kind==='UNPAID').reduce((sum,row)=>sum+portion(row),0);
   personalPaid+=entries.filter(row=>row.kind!=='UNPAID').reduce((sum,row)=>sum+portion(row),0);
   annual+=entries.filter(row=>row.kind.startsWith('ANNUAL')).reduce((sum,row)=>sum+portion(row),0);
   if(alwaysFullAttendance||present)actual+=1-off;
  }else if(approvedWork.some(row=>row.workDate===day.dateKey&&row.kind==='SPECIAL'&&row.approvedMinutes>0))holidayWorked++;
  if(day.scheduled&&day.holiday){if(day.paid)paid++;else unpaid++;}
 }
 return {PAID_LEAVE_WORKDAYS:personalPaid,UNPAID_LEAVE_WORKDAYS:personalUnpaid,ANNUAL_LEAVE_WORKDAYS:annual,LEAVE_CONFLICT_DAYS:conflicts,REGULAR_WORKDAYS:calendar.regularWorkdays,ACTUAL_WORKDAYS:actual,SCHEDULED_WORKDAYS:calendar.scheduledWorkdays,HOLIDAY_WORKDAYS:holidayWorked,FULL_ATTENDANCE_FACTOR:required+paid>0&&actual+personalPaid>=required?1:0,PAYABLE_WORKDAYS:actual+paid+personalPaid,PAID_HOLIDAY_WORKDAYS:paid,UNPAID_HOLIDAY_WORKDAYS:unpaid,REQUIRED_WORKDAYS:required,SCHEDULED_WORK_HOURS:calendar.scheduledHours,CALENDAR_PAYROLL_VERSION:2};
};
