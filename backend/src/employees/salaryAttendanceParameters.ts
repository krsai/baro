import {EMPLOYEE_PAY_TYPE,normalizePayType} from './employeeCompensation';
import {normalizeEmployeePayTypePolicy,type EmployeePayTypePolicyValue} from './employeePayTypePolicy';
import {salaryMonthCalendar,type SalaryHoliday} from './salaryMonthCalendar';
export type SalaryAttendanceParameters={
 PAID_LEAVE_WORKDAYS:number;UNPAID_LEAVE_WORKDAYS:number;ANNUAL_LEAVE_WORKDAYS:number;LEAVE_CONFLICT_DAYS:number;REGULAR_WORKDAYS:number;ACTUAL_WORKDAYS:number;SCHEDULED_WORKDAYS:number;HOLIDAY_WORKDAYS:number;FULL_ATTENDANCE_FACTOR:0|1;
 PAYABLE_WORKDAYS:number;PAID_HOLIDAY_WORKDAYS:number;UNPAID_HOLIDAY_WORKDAYS:number;REQUIRED_WORKDAYS:number;SCHEDULED_WORK_HOURS:number;CALENDAR_PAYROLL_VERSION:number;
};
export const resolveSalaryAttendanceParameters=({month,payType:payTypeInput,holidayDateKeys,attendanceEntries,policy:policyInput,alwaysFullAttendance=false,employmentStart=null,employmentEnd=null,leaveEntries=[]}:{month:string;payType:unknown;holidayDateKeys:Iterable<SalaryHoliday>;attendanceEntries:{workDate?:unknown;workedSeconds?:unknown}[];policy?:EmployeePayTypePolicyValue;alwaysFullAttendance?:boolean;employmentStart?:string|null;employmentEnd?:string|null;leaveEntries?:{leaveDate:string;kind:string}[]}):SalaryAttendanceParameters=>{
 const payType=normalizePayType(payTypeInput,EMPLOYEE_PAY_TYPE.GENERAL)??EMPLOYEE_PAY_TYPE.GENERAL,policy=normalizeEmployeePayTypePolicy(policyInput,payType),calendar=salaryMonthCalendar(month,policy,holidayDateKeys);
 const worked=new Map<string,number>();
 attendanceEntries.forEach(entry=>{const date=String(entry.workDate||''),seconds=Number(entry.workedSeconds);if(date.startsWith(month+'-')&&Number.isFinite(seconds)&&seconds>0)worked.set(date,(worked.get(date)||0)+seconds);});
 const leaves=new Map(leaveEntries.map(row=>[row.leaveDate,row.kind]));
 let personalPaid=0,personalUnpaid=0,annual=0,conflicts=0;
 let actual=0,holidayWorked=0,paid=0,unpaid=0,required=0;
 for(const day of calendar.days){
  if(employmentStart&&day.dateKey<employmentStart||employmentEnd&&day.dateKey>employmentEnd)continue;
  const present=(worked.get(day.dateKey)||0)>=policy.workdayMinimumMinutes*60;
  if(day.regular){required++;const leave=leaves.get(day.dateKey);if(leave){if((worked.get(day.dateKey)||0)>0)conflicts++;if(leave==='UNPAID')personalUnpaid++;else if(!present){personalPaid++;if(leave==='ANNUAL')annual++;}if(present)actual++;}else if(alwaysFullAttendance||present)actual++;}
  else if(present)holidayWorked++;
  if(day.scheduled&&day.holiday){if(day.paid)paid++;else unpaid++;}
 }
 return {PAID_LEAVE_WORKDAYS:personalPaid,UNPAID_LEAVE_WORKDAYS:personalUnpaid,ANNUAL_LEAVE_WORKDAYS:annual,LEAVE_CONFLICT_DAYS:conflicts,REGULAR_WORKDAYS:calendar.regularWorkdays,ACTUAL_WORKDAYS:actual,SCHEDULED_WORKDAYS:calendar.scheduledWorkdays,HOLIDAY_WORKDAYS:holidayWorked,FULL_ATTENDANCE_FACTOR:required+paid>0&&actual+personalPaid>=required?1:0,PAYABLE_WORKDAYS:actual+paid+personalPaid,PAID_HOLIDAY_WORKDAYS:paid,UNPAID_HOLIDAY_WORKDAYS:unpaid,REQUIRED_WORKDAYS:required,SCHEDULED_WORK_HOURS:calendar.scheduledHours,CALENDAR_PAYROLL_VERSION:1};
};
