import {isPolicyWorkday,type EmployeePayTypePolicyValue} from './employeePayTypePolicy';
export type SalaryHoliday = string | {holidayDate:string;isPaid?:boolean};
export function salaryMonthCalendar(month:string,policy:EmployeePayTypePolicyValue,holidays:Iterable<SalaryHoliday>){
 if(!/^\d{4}-(0[1-9]|1[0-2])$/.test(month))throw new Error('month must be YYYY-MM');
 const holidayMap=new Map(Array.from(holidays,row=>typeof row==='string'?[row,true] as const:[row.holidayDate,row.isPaid!==false] as const));
 const [year,number]=month.split('-').map(Number),end=new Date(Date.UTC(year!,number!,1));
 const days=[];
 for(const date=new Date(Date.UTC(year!,number!-1,1));date<end;date.setUTCDate(date.getUTCDate()+1)){
  const dateKey=date.toISOString().slice(0,10),scheduled=isPolicyWorkday(dateKey,policy),holiday=holidayMap.has(dateKey);
  days.push({dateKey,scheduled,holiday,paid:holidayMap.get(dateKey)===true,regular:scheduled&&!holiday});
 }
 const scheduledWorkdays=days.filter(day=>day.scheduled).length,regularWorkdays=days.filter(day=>day.regular).length;
 return {days,scheduledWorkdays,regularWorkdays,paidHolidayWorkdays:days.filter(day=>day.scheduled&&day.holiday&&day.paid).length,unpaidHolidayWorkdays:days.filter(day=>day.scheduled&&day.holiday&&!day.paid).length,scheduledHours:scheduledWorkdays*policy.standardWorkMinutes/60,regularHours:regularWorkdays*policy.standardWorkMinutes/60};
}
