import {loadSourceBindings} from './helpers/source-bindings.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
const require=createRequire(import.meta.url),{salaryMonthCalendar}=require('../backend/dist/employees/salaryMonthCalendar'),{normalizeEmployeePayTypePolicy}=require('../backend/dist/employees/employeePayTypePolicy'),{resolveSalaryAttendanceParameters:attendance}=require('../backend/dist/employees/salaryAttendanceParameters'),{calendarSalaryFormula}=require('../backend/dist/employees/calendarSalaryFormula'),{evaluateSalaryFormula}=require('../backend/dist/employees/salaryFormula'),{buildSalaryPreview}=require('../backend/dist/employees/salaryPreview');
const policy=normalizeEmployeePayTypePolicy(null,'OUTPUT');
test('25 scheduled days, 2 paid national holidays, 1 annual day and 3 unpaid leave days pay 22/25',()=>{
 const holidays=[{holidayDate:'2026-11-02',isPaid:true},{holidayDate:'2026-11-03',isPaid:true}],leaves=[{leaveDate:'2026-11-04',kind:'ANNUAL'},...['05','06','07'].map(day=>({leaveDate:'2026-11-'+day,kind:'UNPAID'}))];
 const result=attendance({month:'2026-11',payType:'OUTPUT',holidayDateKeys:holidays,attendanceEntries:[],leaveEntries:leaves,alwaysFullAttendance:true});
 assert.equal(result.SCHEDULED_WORKDAYS,25);assert.equal(result.ACTUAL_WORKDAYS,19);assert.equal(result.PAID_HOLIDAY_WORKDAYS,2);assert.equal(result.ANNUAL_LEAVE_WORKDAYS,1);assert.equal(result.UNPAID_LEAVE_WORKDAYS,3);assert.equal(result.PAYABLE_WORKDAYS,22);
 const formula=calendarSalaryFormula(['GRADE_RATE'],'BASE');assert.equal(evaluateSalaryFormula(formula,{...result,GRADE_RATE:10000000}),8800000);
 const calendar=salaryMonthCalendar('2026-11',policy,holidays),entries=calendar.days.filter(day=>day.regular&&!leaves.some(leave=>leave.leaveDate===day.dateKey)).map(day=>({workDate:day.dateKey,workedSeconds:8*3600}));
 assert.deepEqual(attendance({month:'2026-11',payType:'OUTPUT',holidayDateKeys:holidays,attendanceEntries:entries,leaveEntries:leaves}),result);
 const preview=buildSalaryPreview({month:'2026-11',today:'2026-11-06',employees:[{id:1,factoryId:1,gradeId:1,status:'ACTIVE',payType:'OUTPUT',joinedAt:'2020-01-01'}],factories:[{id:1,salarySystemVersions:[{versionNumber:1,snapshot:{items:[{code:'baseSalary',category:'BASE',payTypes:['OUTPUT'],formula:['GRADE_RATE']}],rates:[{salaryItemCode:'baseSalary',payType:'OUTPUT',gradeId:1,amount:10000000}]}}]}],holidays,leaves:leaves.map(row=>({...row,employeeId:1})),policies:[]});
 assert.equal(preview.factories[0].employees[0].total,8800000);assert.equal(preview.factories[0].employees[0].actualWorkdays,19);
});
test('paid and unpaid company holidays use the confirmed 25/26 rule without fixed month lengths',()=>{
 const result=attendance({month:'2026-06',payType:'OUTPUT',holidayDateKeys:[{holidayDate:'2026-06-01',isPaid:true},{holidayDate:'2026-06-02',isPaid:false}],attendanceEntries:[],alwaysFullAttendance:true});
 assert.equal(result.SCHEDULED_WORKDAYS,26);assert.equal(result.ACTUAL_WORKDAYS,24);assert.equal(result.PAYABLE_WORKDAYS,25);assert.equal(result.UNPAID_HOLIDAY_WORKDAYS,1);
 assert.equal(evaluateSalaryFormula(calendarSalaryFormula(['GRADE_RATE'],'BASE'),{...result,GRADE_RATE:2600000}),2500000);
 for(const [month,general,output] of [['2026-02',20,24],['2026-11',21,25],['2026-12',23,27],['2028-02',21,25]]){assert.equal(salaryMonthCalendar(month,normalizeEmployeePayTypePolicy(null,'GENERAL'),[]).scheduledWorkdays,general);assert.equal(salaryMonthCalendar(month,policy,[]).scheduledWorkdays,output);}
});
test('overlapping company holidays, personal leave and attendance never multiply payable dates',()=>{
 const input={month:'2026-11',payType:'OUTPUT',holidayDateKeys:['2026-11-02'],leaveEntries:[{leaveDate:'2026-11-02',kind:'ANNUAL'},{leaveDate:'2026-11-03',kind:'PAID'}],attendanceEntries:[],alwaysFullAttendance:true};
 const result=attendance(input);assert.equal(result.PAYABLE_WORKDAYS,25);assert.equal(result.ANNUAL_LEAVE_WORKDAYS,0);assert.equal(result.PAID_LEAVE_WORKDAYS,1);
 const conflict=attendance({...input,attendanceEntries:[{workDate:'2026-11-03',workedSeconds:8*3600}]});assert.equal(conflict.LEAVE_CONFLICT_DAYS,1);assert.equal(conflict.PAYABLE_WORKDAYS,25);
 const sunday=attendance({...input,holidayDateKeys:['2026-11-01'],leaveEntries:[]});assert.equal(sunday.PAID_HOLIDAY_WORKDAYS,0);assert.equal(sunday.PAYABLE_WORKDAYS,25);
 const joined=attendance({...input,employmentStart:'2026-11-10',employmentEnd:'2026-11-12'});assert.equal(joined.PAYABLE_WORKDAYS,3);assert.equal(joined.SCHEDULED_WORKDAYS,25);
});
test('new calculations normalize historical date divisors while preserving unrelated constants and old tokens',()=>{
 const old=['BASE_SALARY','÷','CONST:26','÷','CONST:8','×','OVERTIME_HOURS','×','CONST:1.5'];
 assert.deepEqual(calendarSalaryFormula(old),['BASE_SALARY','÷','SCHEDULED_WORK_HOURS','×','OVERTIME_HOURS','×','CONST:1.5']);assert.equal(old[2],'CONST:26');
 assert.deepEqual(calendarSalaryFormula(['GRADE_RATE','×','ACTUAL_WORKDAYS','÷','CONST:30']),['GRADE_RATE','×','PAYABLE_WORKDAYS','÷','SCHEDULED_WORKDAYS']);
 assert.deepEqual(calendarSalaryFormula(['GRADE_RATE','×','TENURE_YEARS','÷','CONST:2']),['GRADE_RATE','×','TENURE_YEARS','÷','CONST:2']);
 assert.deepEqual(calendarSalaryFormula(['PRODUCTION_ALLOWANCE'],'INCENTIVE'),['PRODUCTION_ALLOWANCE']);
});

test('monthly wage conversion follows the calendar and unrelated factory edits do not create rate changes',()=>{const {resolveFactoryWageFields,resolveFactoryWageUpdateFields}=loadSourceBindings('backend/src/factories/factory.routes.ts',['roundToScale','resolveFactoryWageFields','resolveFactoryWageUpdateFields'],{toNumberOrNull:value=>value==null?null:Number(value)});assert.equal(resolveFactoryWageFields(2600000,null,26*8*3600).wagePerSecond,3.47);assert.equal(resolveFactoryWageFields(2600000,null,23*7*3600).wagePerSecond,4.49);assert.deepEqual(resolveFactoryWageUpdateFields({targetMonthlyWageInput:2600000,wagePerSecondInput:4.49,fallbackTargetMonthlyWage:2600000,fallbackWagePerSecond:3.47,monthSeconds:23*7*3600}),{targetMonthlyWage:2600000,wagePerSecond:3.47});});

test('July payroll earnings use the same monthly calendar rate as readiness, preserving stored version rates',async()=>{
 const factory={id:1,name:'Factory',_count:{productionAllowanceRates:1},productionAllowanceRates:[{targetMonthlyWage:2600000,wagePerSecond:3.47}]},worker={id:1,name:'Worker',payType:'OUTPUT',status:'ACTIVE',role:{name:'Worker'}};
 const record={workerId:1,worker,quantity:2,ctSeconds:60,styleProcessId:10,assignmentPlan:{id:1}};
 const calendar=salaryMonthCalendar('2026-07',policy,[]),before=JSON.stringify(factory);
 const deps={...require('../backend/dist/utils/common'),...require('../backend/dist/utils/http'),...require('../backend/dist/employees/employeeCompensation'),...require('../backend/dist/work-records/workRecord.shared'),...require('../backend/dist/employees/payrollManagement'),
  prisma:{workLog:{findMany:async()=>[{factoryId:1,factory,displayDate:'2026-07-01',workRecords:[record]}]},employee:{findMany:async()=>[worker]},assignmentPlan:{findMany:async()=>[{id:1,assignmentStSnapshot:{processes:[{styleProcessId:10,stSeconds:50}]}}]}},
  loadManagementPeriod:async()=>({startDate:'2026-04-01'}),assertManagedDate:()=>{},isPayrollMonthReady:()=>true,companySalaryCalendar:async()=>[{...calendar,payType:'OUTPUT'}],isPayrollEmployeeRelevantForMonth:()=>true,buildIntegratedPayrollEmployees:async(_org,_month,employees)=>employees};
 const {getPayrollByMonth}=loadSourceBindings('backend/src/payroll/payroll.service.ts',['toPayrollAmountOrNull','toPayrollAmount','buildPayrollEmployeeKey','assertPayrollMonth','getPayrollMonthRange','resolveFactoryProductionAllowanceRate','resolvePayrollEmployeeName','resolvePayrollRoleName','getPayrollByMonth'],deps);
 const result=await getPayrollByMonth(1,'2026-07',1,{ignoreSnapshot:true}),expectedRate=Math.round(2600000/calendar.scheduledHours/3600*100)/100;
 assert.notEqual(expectedRate,3.47);assert.ok(Math.abs(result.employees[0].processes[0].wagePerSecond-expectedRate)<1e-9);assert.ok(Math.abs(result.employees[0].productionEarnings-120*expectedRate)<1e-9);assert.equal(JSON.stringify(factory),before);
});
