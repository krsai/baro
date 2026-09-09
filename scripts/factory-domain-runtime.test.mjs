import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';
import vm from 'node:vm';
import { createRequire } from 'node:module';
const require = createRequire(new URL('../backend/package.json', import.meta.url));
const ts = require('typescript');
const { Prisma } = require('@prisma/client');
const backend = fs.readFileSync(new URL('../backend/src/index.ts', import.meta.url), 'utf8');
const payroll = fs.readFileSync(new URL('../backend/src/payroll/payroll.service.ts', import.meta.url), 'utf8');
const models = new Map(Prisma.dmmf.datamodel.models.map(model => [model.name[0].toLowerCase()+model.name.slice(1), model]));

function extract(source, name) {
  const sf=ts.createSourceFile('source.ts',source,ts.ScriptTarget.Latest,true);
  let result;
  function visit(node) {
    if(ts.isVariableDeclaration(node) && node.name.getText(sf)===name) result='const '+node.getText(sf)+';';
    ts.forEachChild(node,visit);
  }
  visit(sf);
  assert.ok(result,'missing function '+name);
  return result;
}
function load(source, name, dependencies) {
  const context=vm.createContext({ ...dependencies, console, process, Map, Set, Date });
  const js=ts.transpileModule(extract(source,name)+'\nglobalThis.subject='+name+';', {compilerOptions:{target:ts.ScriptTarget.ES2022}}).outputText;
  vm.runInContext(js,context);
  return context.subject;
}
const common = {
  toPositiveIntOrNull: value => Number.isSafeInteger(Number(value)) && Number(value)>0 ? Number(value) : null,
  ensureArray: value => Array.isArray(value)?value:[],
  resolveOptionalString: (value,fallback=null)=>typeof value==='string'&&value.trim()?value.trim():fallback,
  toNonNegativeInt: (value,fallback=0)=>Number.isFinite(Number(value))?Math.max(0,Math.trunc(Number(value))):fallback,
  createHttpError: (status,message)=>Object.assign(new Error(message),{status}),
};

test('Prisma literal selects on changed paths only reference fields in the new schema', () => {
  const problems=[];
  for(const [filename,source] of [['index.ts',backend],['payroll.service.ts',payroll]]) {
    const sf=ts.createSourceFile(filename,source,ts.ScriptTarget.Latest,true);
    function check(object,model) {
      while(object && (ts.isAsExpression(object) || ts.isParenthesizedExpression(object))) object=object.expression;
      if(!object || !ts.isObjectLiteralExpression(object))return;
      for(const prop of object.properties){
        if(!ts.isPropertyAssignment(prop))continue;
        if(ts.isComputedPropertyName(prop.name))continue;
        const key=prop.name.getText(sf).replaceAll('"','').replaceAll("'",'');
        if(key==='_count')continue;
        const field=model.fields.find(field=>field.name===key);
        if(!field){problems.push(filename+': '+model.name+'.'+key);continue;}
        const related=models.get(field.type[0].toLowerCase()+field.type.slice(1));
        if(related && ts.isObjectLiteralExpression(prop.initializer)) {
          for(const inner of prop.initializer.properties)
            if(ts.isPropertyAssignment(inner)&&['select','include'].includes(inner.name.getText(sf)))check(inner.initializer,related);
        }
      }
    }
    function visit(node) {
      if(ts.isCallExpression(node)&&ts.isPropertyAccessExpression(node.expression)&&ts.isPropertyAccessExpression(node.expression.expression)) {
        const model=models.get(node.expression.expression.name.text);
        const arg=node.arguments[0];
        if(model && arg && ts.isObjectLiteralExpression(arg))for(const prop of arg.properties)
          if(ts.isPropertyAssignment(prop)&&['select','include'].includes(prop.name.getText(sf)))check(prop.initializer,model);
      }
      ts.forEachChild(node,visit);
    }
    visit(sf);
  }
  assert.deepEqual(problems,[]);
});

test('new assignment payload accepts Factory.id and rejects missing or foreign factory scope', () => {
  const normalize = load(backend,'normalizeAssignmentPlanPayload',{
    ...common, toSignedInt:(v,d)=>v==null?d:Number(v),
    resolveNormalizedAssignmentCtSnapshot:v=>v.assignmentCtSnapshot,
    resolveAssignmentCtTotalSeconds:()=>10,resolveStateAssignmentStTotalSeconds:()=>20,
    resolveAssignmentQuantity:v=>v.quantity,toOptionalFloat:(v,d)=>v??d,
  });
  const scopes={byFactoryId:new Map([[71,{factoryId:71}]])};
  assert.equal(normalize([{id:'A',factoryId:71,quantity:100}],scopes)[0].factoryId,71);
  assert.throws(()=>normalize([{id:'A',lineId:900}],scopes),/factoryId/);
  assert.throws(()=>normalize([{id:'A',factoryId:900}],scopes),/factoryId/);
});

test('canonical work-record writes preserve production values without storing a retired scope field', () => {
  const build=load(backend,'buildCanonicalWorkRecordWriteData',common);
  const row=build({orgId:1,workLogId:21,record:{workerId:1,styleId:7,styleProcessId:8,assignmentPlanId:11,ctSeconds:123,quantity:100}});
  assert.deepEqual(Object.keys(row).filter(key=>/line|factory/i.test(key)),[]);
  assert.equal(row.workLogId,21);
  assert.equal(row.ctSeconds*row.quantity,12300);
});

test('work context uses direct factory employment and does not perform database writes', async () => {
  const employees=[{id:1,factoryId:71,name:'A',joinedAt:'2026-01-01',leftAt:null},{id:2,factoryId:71,name:'B',joinedAt:'2026-09-01',leftAt:null}];
  const calls=[];
  const context=load(backend,'buildWorkLogContextResponse',{
    ...common,
    prisma:{
      factory:{findFirst:async args=>{calls.push(args);return{id:71,name:'F'};}},
      employee:{findMany:async args=>{calls.push(args);return employees;}},
      assignmentPlan:{findMany:async args=>{calls.push(args);return[{id:11,factoryId:71}];}},
    },
    normalizeDateKey:v=>v||'',findPreviousWorkLogCoverageForFactoryScope:async()=>null,
    resolveWorkLogCoverageEndDate:()=>null,shiftDateKeyByDays:()=>null,
    ASSIGNMENT_PLAN_SELECT_WITH_CLOSE:{id:true,factoryId:true},ASSIGNMENT_PLAN_DISPLAY_JOIN_INCLUDE:{},
    attachLiveStyleProcessMirrorsToAssignmentPlans:async({plans})=>plans,
    evaluateWorkerEmploymentInDateRange:({joinedAt,endDateKey})=>({passed:joinedAt<=endDateKey}),
    toWorkLogContextWorkerResponse:({employee})=>employee,toWorkLogContextAssignmentResponse:p=>p,
  });
  const result=await context({orgId:1,factoryId:71,workDate:'2026-07-31'});
  assert.equal(result.workers.length,1);
  assert.equal(result.assignments[0].factoryId,71);
  assert.equal(calls[1].where.factoryId,71);
  assert.equal(calls[2].where.factoryId,71);
});

test('production allowance and ST totals are independent of former line membership', async () => {
  const worker={id:1,orgRole:'WORKER',name:'A',payType:'OUTPUT',factoryId:71};
  const records=[{workerId:1,ctSeconds:10,quantity:100,styleProcessId:8,assignmentPlan:{id:11}},{workerId:1,ctSeconds:10,quantity:40,styleProcessId:8,assignmentPlan:{id:12}}];
  const subject=load(payroll,'getPayrollByMonth',{
    ...common,assertPayrollMonth:()=>{},isPayrollMonthReady:()=>true,resolveFactoryManagementStartDateKey:()=> '2026-01-01',
    prisma:{
      workLog:{findMany:async({where})=>{assert.equal(where.factoryId,71);return[{factoryId:71,factory:{id:71,name:'F',wagePerSecond:2},displayDate:'2026-07-31',workRecords:records}];}},
      employee:{findMany:async()=>[worker]},
      assignmentPlan:{findMany:async()=>[11,12].map(id=>({id,assignmentStSnapshot:{processes:[{styleProcessId:8,stSeconds:20}]}}))},
    },
    WORK_RECORD_WITH_REFS_INCLUDE:{},getPayrollMonthRange:()=>({}),isPayrollEmployeeRelevantForMonth:()=>true,
    resolveEmployeeEffectivePayType:e=>e.payType,EMPLOYEE_PAY_TYPE:{OUTPUT:'OUTPUT'},
    resolvePayrollEmployeeName:e=>e?.name||'A',buildPayrollEmployeeKey:id=>String(id),resolvePayrollRoleName:()=> 'Worker',
    resolveFactoryProductionAllowanceRate:f=>f.wagePerSecond,
    resolveWorkRecordProcessName:()=> 'P',resolveWorkRecordProcessCode:()=> 'P',
    resolveWorkRecordStyleRefId:()=>7,resolveWorkRecordStyleName:()=> 'S',resolveWorkRecordStyleCode:()=> 'S',
    toPayrollAmount:(v,d)=>Number(v)||d,buildIntegratedPayrollEmployees:async(_org,_month,employees)=>employees,
  });
  const result=await subject(1,'2026-07',71,{ignoreSnapshot:true});
  assert.equal(result.employees[0].productionAllowance,2800);
  assert.equal(result.employees[0].productionStSeconds,2800);
  assert.equal(result.employees[0].processes.length,1);
  assert.equal(result.employees[0].processes[0].totalQuantity,140);
});
