import {buildSalaryPreview} from '../employees/salaryPreview';
import {payrollManagementInclude} from '../employees/payrollManagement';
// Read confirmed payroll definitions, evaluate regular attendance using the same
// engine as payroll previews, then return factory aggregates only.
export async function revenueLaborBasis(db:any,orgId:number,month:string){
 const [employees,factories,policies,holidays]=await Promise.all([
  db.employee.findMany({where:{orgId,status:'ACTIVE'},include:{role:true,grade:true,payrollManagementVersions:payrollManagementInclude}}),
  db.factory.findMany({where:{orgId},include:{salaryCurrency:{select:{code:true}},organization:{select:{salaryCurrency:{select:{code:true}}}},salarySystemVersions:{where:{OR:[{effectiveMonth:null},{effectiveMonth:{lte:month}}]}},productionAllowanceRates:{where:{effectiveMonth:{lte:month}},orderBy:[{effectiveMonth:'desc'},{versionNumber:'desc'}],take:1},_count:{select:{productionAllowanceRates:true}}},orderBy:{id:'asc'}}),
  db.employeePayTypePolicy.findMany({where:{orgId}}),
  db.organizationHoliday.findMany({where:{orgId,holidayDate:{gte:`${month}-01`,lt:`${month}-32`}},select:{holidayDate:true}}),
 ]);
 for(const factory of factories)factory.salarySystemVersions.sort((a:any,b:any)=>(b.effectiveMonth||'').localeCompare(a.effectiveMonth||'')||b.versionNumber-a.versionNumber);
 const preview=buildSalaryPreview({month,employees,factories,policies,holidays:holidays.map((row:any)=>row.holidayDate)});
 return {month,factories:factories.map((factory:any)=>{
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
  const productionVersion=factory.productionAllowanceRates[0],raw=productionVersion?.wagePerSecond??(factory._count.productionAllowanceRates===0?factory.wagePerSecond:null),rate=raw==null?null:Number(raw),outputShare=direct.length?direct.filter(row=>row.payType==='OUTPUT').length/direct.length:0;
  return {id:factory.id,name:factory.name,currencyCode:group?.currencyCode||factory.salaryCurrency?.code||factory.organization?.salaryCurrency?.code||'VND',versionNumber:group?.versionNumber||null,employeeCount:rows.length,directCount:direct.length,supportCount:support.length,
   baseHourly:direct.length&&base!==null?base/direct.length:null,allowanceHourly:direct.length&&allowance!==null?allowance/direct.length:null,
   supportHourly:supportBase!==null&&supportAllowance!==null?supportBase+supportAllowance:null,
   productionPerSecond:outputShare===0?0:rate!==null&&rate>0?rate*outputShare:null};
 })};
}
