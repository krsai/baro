// Interpret historical monthly day/hour divisors for new calculations only.
// Stored salary versions and issued payroll snapshots remain unchanged.
export function calendarSalaryFormula(value:unknown,category?:string,payCycle?:string):string[]{
 const tokens=Array.isArray(value)?value.map(String):[];
 const dayRatio=tokens.includes('ACTUAL_WORKDAYS')||tokens.includes('PAYABLE_WORKDAYS');
 const hourRatio=tokens.includes('WORK_HOURS')||tokens.includes('OVERTIME_HOURS')||tokens.includes('HOLIDAY_HOURS');
 const result=tokens.map((token,index)=>{
  if(tokens[index-1]==='÷'&&/^CONST:(2[0-9]|3[01])$/.test(token)&&(dayRatio||hourRatio))return 'SCHEDULED_WORKDAYS';
  if(tokens[index-1]==='÷'&&/^CONST:(160|168|176|184|192|200|208|216|224|232|240|248)$/.test(token)&&hourRatio)return 'SCHEDULED_WORK_HOURS';
  return token;
 });
 if(hourRatio)for(let i=0;i<result.length-2;i++)if(result[i]==='SCHEDULED_WORKDAYS'&&result[i+1]==='÷'&&result[i+2]==='CONST:8')result.splice(i,3,'SCHEDULED_WORK_HOURS');
 if(result.includes('SCHEDULED_WORKDAYS'))for(let i=0;i<result.length;i++)if(result[i]==='ACTUAL_WORKDAYS')result[i]='PAYABLE_WORKDAYS';
 if(result.includes('SCHEDULED_WORK_HOURS'))for(let i=0;i<result.length;i++)if(result[i]==='WORK_HOURS')result[i]='PAYABLE_WORK_HOURS';
 if(category==='BASE'&&(!payCycle||payCycle==='MONTHLY')&&result.length===1&&result[0]==='GRADE_RATE')return ['GRADE_RATE','×','PAYABLE_WORKDAYS','÷','SCHEDULED_WORKDAYS'];
 return result;
}
