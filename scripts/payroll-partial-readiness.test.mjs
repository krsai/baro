import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { readFileSync } from 'node:fs';
const require=createRequire(import.meta.url),ts=require('../backend/node_modules/typescript');
const source=readFileSync('backend/src/payroll/payroll.service.ts','utf8');
const start=source.indexOf('export const getPayrollMonthReadiness =');
const code=ts.transpileModule(source.slice(start,source.indexOf('const buildIntegratedPayrollEmployees',start)).replace('export const','const'),{compilerOptions:{target:ts.ScriptTarget.ES2022}}).outputText;
async function readiness({attendance=true,work=true,invalidBasis=false,invalidFactory=false,snapshot=false,attendanceAfter=false,workAfter=false,currentMonth=false}={}){
  const employee={id:1,factoryId:1,payType:'OUTPUT'},factory={id:1,employees:[employee]};
  const before=new Date('2026-08-10T00:00:00Z'),after=new Date('2026-09-02T00:00:00Z');
  const attendanceRows=attendance?[{workerId:1,factoryId:invalidFactory?2:1,workDate:'2026-08-03',createdAt:before,updatedAt:attendanceAfter?after:before}]:[];
  const logs=work?[{factoryId:1,factory:{wagePerSecond:1},displayDate:'2026-08-03',createdAt:before,updatedAt:workAfter?after:before,workRecords:[{workerId:1,worker:employee,quantity:1,ctSeconds:invalidBasis?0:60,createdAt:before,updatedAt:before}]}]:[];
  const saved=snapshot?{isProvisional:true,lockedAt:new Date('2026-09-01T00:00:00Z'),data:[]}:null;
  const original=JSON.stringify({attendanceRows,logs,saved});
  const numeric=value=>Number(value)||0;
  const deps={
    prisma:{factory:{findMany:async()=>[factory]},employee:{findMany:async()=>[employee]},organizationHoliday:{findMany:async()=>[]},attendanceEntry:{findMany:async()=>attendanceRows},workLog:{findMany:async()=>logs},payrollSnapshot:{findUnique:async()=>saved}},
    assertPayrollMonth:()=>{},toPositiveIntOrNull:Number,resolveCurrentPayrollMonthKey:()=>currentMonth?'2026-08':'2026-10',
    loadEmployeePayTypePolicies:async()=>[],employeePayTypePolicyMap:()=>new Map([['GENERAL',{}],['OUTPUT',{}]]),EMPLOYEE_PAY_TYPE:{GENERAL:'GENERAL',OUTPUT:'OUTPUT'},
    enumerateMonthDateKeys:()=>['2026-08-03','2026-08-04'],isExpectedSalaryWorkDate:()=>true,getPayrollMonthRange:()=>({}),isPayrollEmployeeRelevantForMonth:()=>true,
    resolvePayrollEmployeeName:()=> 'Worker',resolveEmployeeEffectivePayType:employee=>employee.payType,resolveFactoryManagementStartDateKey:()=> '2026-04-01',employeeExpectedOnDate:()=>true,
    resolveFactoryProductionAllowanceRate:()=>1,toPayrollAmount:numeric,toPayrollRateValue:numeric,ensureArray:value=>Array.isArray(value)?value:[],normalizePayrollSnapshotEmployee:value=>value,
    getPayrollByMonth:async()=>({employees:[]}),isProductionPayrollSnapshotEmployee:()=>true,
  };
  const fn=new Function(...Object.keys(deps),code+';return getPayrollMonthReadiness;')(...Object.values(deps));
  const result=await fn(1,'2026-08',1);
  assert.equal(JSON.stringify({attendanceRows,logs,saved}),original,'readiness must not modify source or snapshot data');
  return result;
}
test('partial attendance and production dates permit calculation without inventing attendance',async()=>{
  const result=await readiness();assert.equal(result.ready,true);assert.equal(result.hasAttendanceData,true);assert.equal(result.hasWorkData,true);assert.equal(result.hasCoverageGaps,true);
  assert.equal(result.attendanceRecordedCount,1);assert.equal(result.attendanceRequiredCount,2);assert.equal(result.missingPayrollAttendance.length,1);assert.deepEqual(result.groups[0].missingWorkDates,['2026-08-04']);
});
test('a month entirely without either required source remains blocked',async()=>{
  for(const options of [{attendance:false},{work:false},{attendance:false,work:false}]){const result=await readiness(options);assert.equal(result.ready,false);}
});
test('invalid calculation basis, cross-factory attendance and current month remain blocked',async()=>{
  for(const options of [{invalidBasis:true},{invalidFactory:true},{currentMonth:true}])assert.equal((await readiness(options)).ready,false);
});
test('later attendance or production updates flag a calculated partial month for recalculation',async()=>{
  assert.equal((await readiness({snapshot:true})).needsRecalculation,false);
  assert.equal((await readiness({snapshot:true,attendanceAfter:true})).needsRecalculation,true);
  assert.equal((await readiness({snapshot:true,workAfter:true})).needsRecalculation,true);
});
