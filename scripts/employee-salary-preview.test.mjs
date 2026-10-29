import test from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {readFileSync} from 'node:fs';
const require=createRequire(import.meta.url);
const {buildSalaryPreview}=require('../backend/dist/employees/salaryPreview.js');
const tenure=require('../backend/dist/employees/salaryTenure.js');
const comp=require('../backend/dist/employees/employeeCompensation.js');
const policy=require('../backend/dist/employees/employeePayTypePolicy.js');
const attendance=require('../backend/dist/employees/salaryAttendanceParameters.js');
const formula=require('../backend/dist/employees/salaryFormula.js');
const management=require('../backend/dist/employees/payrollManagement.js');
const service=require('../backend/dist/payroll/payroll.service.js');
const common=require('../backend/dist/utils/common.js');
const ts=require('../backend/node_modules/typescript');

const items=[
  {code:'base',nameEn:'Base',category:'BASE',payTypes:['GENERAL','OUTPUT_FIXED','OUTPUT'],formula:['GRADE_RATE','×','ACTUAL_WORKDAYS','÷','SCHEDULED_WORKDAYS'],payCycle:'MONTHLY'},
  {code:'lunch',nameEn:'Lunch',category:'ALLOWANCE',payTypes:['GENERAL','OUTPUT_FIXED','OUTPUT'],formula:['GRADE_RATE','×','ACTUAL_WORKDAYS'],payCycle:'MONTHLY'},
  {code:'night',nameEn:'Overtime',category:'ALLOWANCE',payTypes:['GENERAL','OUTPUT_FIXED','OUTPUT'],formula:['GRADE_RATE','×','OVERTIME_HOURS'],payCycle:'MONTHLY'},
  {code:'tenure',nameEn:'Tenure',category:'ALLOWANCE',payTypes:['GENERAL','OUTPUT_FIXED','OUTPUT'],formula:['GRADE_RATE','×','TENURE_YEARS'],payCycle:'SEMIANNUAL'},
  {code:'incentiveTotal',nameEn:'Production',category:'INCENTIVE',payTypes:['OUTPUT'],formula:['PRODUCTION_ALLOWANCE'],payCycle:'MONTHLY'},
];
const employee={id:1,orgId:1,factoryId:1,name:'Active',employeeNo:'E1',gradeId:7,grade:{id:7,nameEn:'Staff'},status:'ACTIVE',payType:'OUTPUT',joinedAt:'2024-01-01'};
const rates=['GENERAL','OUTPUT_FIXED','OUTPUT'].flatMap(payType=>[['base',1000000],['lunch',10000],['night',20000],['tenure',100000]].map(([salaryItemCode,amount])=>({payType,gradeId:7,salaryItemCode,amount})));
const factory={id:1,name:'Factory',wagePerSecond:2,productionAllowanceRates:[{wagePerSecond:2}],_count:{productionAllowanceRates:1},salarySystemVersions:[{id:1,versionNumber:3,snapshot:{currencyCode:'VND',items,rates}}]};
const fixture=(overrides={})=>({month:'2026-06',today:'2026-10-29',employees:[employee],factories:[factory],policies:[],holidays:['2026-06-01'],...overrides});

test('previous-year six calendar months includes July 1 through December 31, excludes July 2 and missing dates',()=>{
  assert.equal(tenure.hasPreviousYearSixMonthsService({joinedAt:'2025-07-01'},'2026-06'),true);
  assert.equal(tenure.hasPreviousYearSixMonthsService({joinedAt:'2025-07-02'},'2026-06'),false);
  assert.equal(tenure.hasPreviousYearSixMonthsService({joinedAt:'2025-01-01',leftAt:'2025-06-30'},'2026-06'),true);
  assert.equal(tenure.hasPreviousYearSixMonthsService({joinedAt:'2025-01-01',leftAt:'2025-06-29'},'2026-06'),false);
  assert.equal(tenure.hasPreviousYearSixMonthsService({joinedAt:'2024-01-01',leftAt:'2024-12-31'},'2026-06'),false);
  assert.equal(tenure.hasPreviousYearSixMonthsService({},'2026-06'),false);
  assert.equal(tenure.hasPreviousYearSixMonthsService({joinedAt:'2024-01-01'},'2025-12'),true);
});

test('full-attendance preview uses actual workdays, holidays and policy hours, zero overtime/tenure and 100% production',()=>{
  const result=buildSalaryPreview(fixture());const group=result.factories[0],row=group.employees[0];
  assert.equal(group.standards.find(row=>row.payType==='OUTPUT').scheduledWorkdays,25);
  assert.equal(row.regularHours,200);
  assert.equal(row.salaryItems.find(item=>item.code==='base').amount,1000000);
  assert.equal(row.salaryItems.find(item=>item.code==='lunch').amount,250000);
  assert.equal(row.salaryItems.find(item=>item.code==='night').amount,0);
  assert.equal(row.salaryItems.find(item=>item.code==='tenure').amount,0);
  assert.equal(row.salaryItems.find(item=>item.code==='incentiveTotal').amount,1440000);
  assert.equal(row.total,2690000);
  const custom=buildSalaryPreview(fixture({policies:[{payType:'OUTPUT',workWeekdays:[1,2,3,4,5],standardClockIn:'09:00',standardClockOut:'17:00',breakMinutes:60,workdayMinimumMinutes:240}]}));
  assert.equal(custom.factories[0].employees[0].scheduledWorkdays,21);
  assert.equal(custom.factories[0].employees[0].regularHours,147);
});

test('active default, all-employees filter, excluded payroll and unassigned employees remain distinct',()=>{
  const employees=[employee,{...employee,id:2,status:'TERMINATED',leftAt:'2026-09-01'},{...employee,id:3,status:'SUSPENDED'},{...employee,id:4,factoryId:null},{...employee,id:5,payrollExcluded:true},{...employee,id:6,status:'PENDING'},{...employee,id:7,joinedAt:'2027-01-01'}];
  const result=buildSalaryPreview(fixture({employees}));
  assert.deepEqual(result.factories[0].employees.map(row=>row.id),[1,5]);
  assert.equal(result.factories[0].employees[1].total,0);
  assert.equal(result.unassigned[0].id,4);
  assert.deepEqual(buildSalaryPreview(fixture({employees,includeInactive:true})).factories[0].employees.map(row=>row.id),[1,2,3,5,7]);
});

test('missing rate or effective version cannot turn into a complete zero estimate; future production rates are not borrowed',()=>{
  const missingRate={...factory,salarySystemVersions:[{...factory.salarySystemVersions[0],snapshot:{currencyCode:'VND',items,rates:rates.filter(row=>row.salaryItemCode!=='base')}}]};
  let row=buildSalaryPreview(fixture({factories:[missingRate]})).factories[0].employees[0];
  assert.equal(row.total,null);assert.equal(row.salaryItems[0].reason,'MISSING_RATE');
  row=buildSalaryPreview(fixture({factories:[{...factory,productionAllowanceRates:[]}]})).factories[0].employees[0];
  assert.equal(row.salaryItems.at(-1).reason,'MISSING_PRODUCTION_RATE');assert.equal(row.total,null);
  row=buildSalaryPreview(fixture({factories:[{...factory,productionAllowanceRates:[{wagePerSecond:0}]}]})).factories[0].employees[0];
  assert.equal(row.salaryItems.at(-1).reason,'MISSING_PRODUCTION_RATE');assert.equal(row.total,null);
  row=buildSalaryPreview(fixture({factories:[{...factory,salarySystemVersions:[]}]})).factories[0].employees[0];
  assert.equal(row.error,'MISSING_SALARY_VERSION');assert.equal(row.total,null);
});

test('real payroll applies previous-year tenure gate while preserving actual completed tenure for eligible employees',async()=>{
  const src=readFileSync('backend/src/payroll/payroll.service.ts','utf8');
  const section=src.slice(src.indexOf('const buildIntegratedPayrollEmployees ='),src.indexOf('export const listPayrollSnapshots'));
  const employees=[{...employee,payType:'GENERAL',joinedAt:'2025-07-02'},{...employee,id:2,payType:'GENERAL',joinedAt:'2024-01-01'}];
  const prisma={employee:{findMany:async()=>employees},attendanceEntry:{findMany:async()=>[]},organizationHoliday:{findMany:async()=>[]},factory:{findMany:async()=>[factory]}};
  const deps={...comp,...policy,...attendance,...formula,...tenure,...management,...common,...service,prisma,
    loadManagementPeriod:async()=>({startDate:'2020-01-01'}),loadEmployeePayTypePolicies:async()=>[],
    employeePayTypePolicyMap:()=>new Map(['GENERAL','OUTPUT_FIXED','OUTPUT'].map(type=>[type,policy.normalizeEmployeePayTypePolicy(null,type)])),
    getPayrollMonthRange:month=>({start:new Date(`${month}-01T00:00:00Z`),endExclusive:new Date(Date.UTC(Number(month.slice(0,4)),Number(month.slice(5)),1))}),
    isPayrollEmployeeRelevantForMonth:()=>true,toPayrollAmount:(value,fallback=0)=>Number(value??fallback),toPayrollAmountOrNull:value=>value==null?null:Number(value),
    buildPayrollEmployeeKey:id=>`w-${id}`,resolvePayrollEmployeeName:row=>row.name,resolvePayrollRoleName:()=>'',createHttpError:(status,message)=>Object.assign(new Error(message),{status})};
  const fn=new Function(...Object.keys(deps),ts.transpileModule(section,{compilerOptions:{target:ts.ScriptTarget.ES2022}}).outputText+';return buildIntegratedPayrollEmployees;')(...Object.values(deps));
  const result=await fn(1,'2026-12',[],1);
  assert.equal(result.find(row=>row.workerId===1).salaryItems.find(row=>row.code==='tenure').amount,0);
  assert.ok(result.find(row=>row.workerId===1).parameters.TENURE_YEARS>=1,'ineligible employee has a completed year but fails previous-year rule');
  const eligible=result.find(row=>row.workerId===2);
  assert.equal(eligible.salaryItems.find(row=>row.code==='tenure').amount,eligible.parameters.TENURE_YEARS*100000);
});

test('preview route enforces salary access and company scope, validates month, and never initializes or writes settings',async()=>{
  const src=readFileSync('backend/src/employees/salarySystem.routes.ts','utf8');
  const section=src.slice(src.indexOf("  router.get('/salary-system/employee-preview'"),src.indexOf('  const resolveFactory'));
  let handler,allowed=false,calls=0;
  const scoped=(value)=>async args=>{calls++;assert.equal(args.where.orgId,17);return value;};
  const deps={...management,router:{get:(_path,fn)=>{handler=fn;}},getOrganizationByQuery:async()=>({id:17}),requireSalarySystemManager:async(_req,res)=>{if(!allowed)res.status(403).json({error:'denied'});return allowed;},
    prisma:{employee:{findMany:scoped([{...employee,orgId:17}])},factory:{findMany:scoped([factory])},organizationHoliday:{findMany:scoped([])}},
    loadEmployeePayTypePolicies:async orgId=>{assert.equal(orgId,17);return [];},buildSalaryPreview};
  new Function(...Object.keys(deps),ts.transpileModule(section,{compilerOptions:{target:ts.ScriptTarget.ES2022}}).outputText)(...Object.values(deps));
  const response=()=>({statusCode:200,body:null,status(value){this.statusCode=value;return this;},json(value){this.body=value;return this;}});
  let res=response();await handler({query:{month:'2026-06'}},res);assert.equal(res.statusCode,403);assert.equal(calls,0);
  allowed=true;res=response();await handler({query:{month:'2026-13'}},res);assert.equal(res.statusCode,400);assert.equal(calls,0);
  res=response();await handler({query:{month:'2026-06'}},res);assert.equal(res.statusCode,200);assert.equal(calls,3);assert.equal(res.body.factories[0].employees[0].id,1);
});
