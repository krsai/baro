import {loadPayrollLeaves} from '../employees/employeeLeave';
import {salaryMonthCalendar} from '../employees/salaryMonthCalendar';
import {normalizeEmployeePayTypePolicy} from '../employees/employeePayTypePolicy';
import {buildSalaryPreview} from '../employees/salaryPreview';
import {payrollManagementInclude,resolvePayrollManagement} from '../employees/payrollManagement';
import {resolveEmployeeEffectivePayType} from '../employees/employeeCompensation';
export function companySalaryPools(preview:any,employees:any[],month:string){
 const pools=new Map<string,any>(),counts:any={GENERAL:0,OUTPUT_FIXED:0,OUTPUT:0};let excludedCount=0,unresolvedCount=0,unassignedCount=0;
 for(const employee of employees){
  if(resolvePayrollManagement(employee,month).payrollExcluded){excludedCount++;continue;}
  const type=resolveEmployeeEffectivePayType(employee);counts[type]++;
  const group=preview.factories.find((factory:any)=>factory.employees.some((row:any)=>row.id===employee.id)),row=group?.employees.find((row:any)=>row.id===employee.id),currency=group?.currencyCode||'UNKNOWN';
  const pool=pools.get(currency)||{currencyCode:currency,officeFixedMonthly:0,productionFixedMonthly:0,variableBaseMonthly:0,variableAllowanceMonthly:0,variableProductionMonthly:0};
  const missing=!row||row.error==='MISSING_SALARY_VERSION';if(missing||row.salaryItems.some((item:any)=>item.amount===null))unresolvedCount++;if(!employee.factoryId)unassignedCount++;
  const definitions=new Map((group?.items||[]).map((item:any)=>[String(item.code||item.id),item]));
  const add=(key:string,items:any[])=>{if(missing||items.some(item=>item.amount===null))pool[key]=null;else if(pool[key]!==null)pool[key]+=items.reduce((sum,item)=>sum+item.amount,0);};
  const items=row?.salaryItems||[];
  if(type==='GENERAL')add('officeFixedMonthly',items);
  else if(type==='OUTPUT_FIXED')add('productionFixedMonthly',items);
  else {
   const isProduction=(item:any)=>(definitions.get(item.code) as any)?.formula?.includes('PRODUCTION_ALLOWANCE');
   add('variableBaseMonthly',items.filter((item:any)=>!isProduction(item)&&(definitions.get(item.code) as any)?.category==='BASE'));
   add('variableAllowanceMonthly',items.filter((item:any)=>!isProduction(item)&&(definitions.get(item.code) as any)?.category!=='BASE'));
   add('variableProductionMonthly',items.filter(isProduction));
  }
  pools.set(currency,pool);
 }
 return {employeeCount:counts.GENERAL+counts.OUTPUT_FIXED+counts.OUTPUT,activeCount:employees.length,excludedCount,unresolvedCount,unassignedCount,counts,pools:[...pools.values()]};
}
// Read confirmed payroll definitions, evaluate regular attendance using the same
// engine as payroll previews, then return factory aggregates only.
export async function revenueLaborBasis(db:any,orgId:number,month:string){
 const [employees,factories,policies,holidays]=await Promise.all([
  db.employee.findMany({where:{orgId,status:'ACTIVE'},include:{role:true,grade:true,payrollManagementVersions:payrollManagementInclude}}),
  db.factory.findMany({where:{orgId},include:{salaryCurrency:{select:{code:true}},organization:{select:{salaryCurrency:{select:{code:true}}}},salarySystemVersions:{where:{OR:[{effectiveMonth:null},{effectiveMonth:{lte:month}}]}},productionAllowanceRates:{where:{effectiveMonth:{lte:month}},orderBy:[{effectiveMonth:'desc'},{versionNumber:'desc'}],take:1},_count:{select:{productionAllowanceRates:true}}},orderBy:{id:'asc'}}),
  db.employeePayTypePolicy.findMany({where:{orgId}}),
  db.organizationHoliday.findMany({where:{orgId,holidayDate:{gte:`${month}-01`,lt:`${month}-32`}},select:{holidayDate:true,isPaid:true}}),
 ]);
 for(const factory of factories)factory.salarySystemVersions.sort((a:any,b:any)=>(b.effectiveMonth||'').localeCompare(a.effectiveMonth||'')||b.versionNumber-a.versionNumber);
 const leaves=await loadPayrollLeaves(db,orgId,month);
 const preview=buildSalaryPreview({month,employees,factories,policies,holidays,leaves});
 return {month,company:companySalaryPools(preview,employees,month),factories:factories.map((factory:any)=>{
  const group=preview.factories.find(row=>row.id===factory.id),rows=group?.employees.filter(row=>!row.payrollExcluded)||[];
  const output=rows.filter(row=>['OUTPUT','OUTPUT_FIXED'].includes(row.payType)),direct=output.length?output:rows,support=output.length?rows.filter(row=>row.payType==='GENERAL'):[];
  const codes=new Map((group?.items||[]).map((item:any)=>[String(item.code||item.id),item]));
  const hourly=(staff:any[],base:boolean)=>{
   let total=0;if(!staff.length)return 0;
   for(const employee of staff){
    if(employee.error==='MISSING_SALARY_VERSION'||!(employee.regularHours>0))return null;
    const items=employee.salaryItems.filter((item:any)=>{const definition:any=codes.get(item.code);return definition&&!definition.formula?.includes('PRODUCTION_ALLOWANCE')&&(base?definition.category==='BASE':definition.category!=='BASE');});
    if(base&&!items.length||items.some((item:any)=>item.amount===null))return null;
    total+=items.reduce((sum:number,item:any)=>sum+item.amount,0)/employee.regularHours;
   }return total;
  };
  const base=hourly(direct,true),allowance=hourly(direct,false),supportBase=hourly(support,true),supportAllowance=hourly(support,false);
  const calendarPolicy=normalizeEmployeePayTypePolicy(policies.find((row:any)=>row.payType===(output.length?'OUTPUT':'GENERAL')),output.length?'OUTPUT':'GENERAL'),calendar=salaryMonthCalendar(month,calendarPolicy,holidays);
  const productionVersion=factory.productionAllowanceRates[0],target=productionVersion?.targetMonthlyWage??(factory._count.productionAllowanceRates===0?factory.targetMonthlyWage:null),raw=target!=null?Math.round(Number(target)/calendar.scheduledHours/3600*100)/100:productionVersion?.wagePerSecond??(factory._count.productionAllowanceRates===0?factory.wagePerSecond:null),rate=raw==null?null:Number(raw),outputShare=direct.length?direct.filter(row=>row.payType==='OUTPUT').length/direct.length:0;
  return {id:factory.id,name:factory.name,calendar:{month,regularWorkdays:calendar.regularWorkdays,scheduledWorkdays:calendar.scheduledWorkdays,paidHolidayWorkdays:calendar.paidHolidayWorkdays,unpaidHolidayWorkdays:calendar.unpaidHolidayWorkdays,standardWorkMinutes:calendarPolicy.standardWorkMinutes},currencyCode:group?.currencyCode||factory.salaryCurrency?.code||factory.organization?.salaryCurrency?.code||'VND',versionNumber:group?.versionNumber||null,employeeCount:rows.length,directCount:direct.length,supportCount:support.length,
   baseHourly:direct.length&&base!==null?base/direct.length:null,allowanceHourly:direct.length&&allowance!==null?allowance/direct.length:null,
   supportHourly:supportBase!==null&&supportAllowance!==null?supportBase+supportAllowance:null,
   productionPerSecond:outputShare===0?0:rate!==null&&rate>0?rate*outputShare:null};
 })};
}
