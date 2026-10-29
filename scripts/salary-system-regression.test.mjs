import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { evaluateSalaryFormula, validateSalaryFormula } from '../backend/dist/employees/salaryFormula.js';
import {createRequire} from 'node:module';
import {loadSourceBindings} from './helpers/source-bindings.mjs';
const require=createRequire(import.meta.url);
const localized=require('../backend/dist/utils/localizedName.js');

test('fixed production allowance can be renamed through PUT and GET without changing calculation or old snapshots',async()=>{
 const months=Array.from({length:12},(_,index)=>index+1);
 let fixed={id:9,orgId:1,factoryId:1,code:'incentiveTotal',name:'Custom output',nameEn:'Custom output',nameKo:'실적 수당',nameVi:'Phụ cấp riêng',category:'INCENTIVE',payTypes:['OUTPUT'],formula:['PRODUCTION_ALLOWANCE'],payCycle:'MONTHLY',paymentMonths:months,capValue:null,required:true,isActive:true,sortOrder:0};
 const versions=[{id:1,versionNumber:1,confirmedDate:new Date('2026-01-01'),snapshot:{currencyCode:'VND',items:[structuredClone(fixed)],rates:[]}}];const originalSnapshot=JSON.stringify(versions[0]);
 let repairs=0;
 const db={factory:{findFirst:async({where})=>where.orgId===1?{id:1,salaryCurrency:{code:'VND'}}:null,update:async()=>{}},salaryItem:{findFirst:async()=>fixed,findMany:async()=>[fixed],update:async({data})=>{repairs++;fixed={...fixed,...data};},upsert:async({update})=>fixed={...fixed,...update},updateMany:async()=>{}},salaryItemRate:{findMany:async()=>[],deleteMany:async()=>{}},salarySystemVersion:{findFirst:async()=>versions[0],findMany:async()=>versions,create:async({data})=>versions.unshift({id:versions.length+1,confirmedDate:new Date('2026-10-29'),...data})},employeeGrade:{findMany:async()=>[]},currency:{findUnique:async()=>({id:1})}};
 const routes=new Map(),router={};for(const method of ['get','put','post'])router[method]=(path,handler)=>routes.set(`${method}:${path}`,handler);
 const {createSalarySystemRouter}=loadSourceBindings('backend/src/employees/salarySystem.routes.ts',['createSalarySystemRouter','PAY_TYPES','PAYMENT_MONTHS_BY_CYCLE','toJsonSnapshot'],{...localized,Router:()=>router,prisma:db,getOrganizationByQuery:async()=>({id:1}),getRequesterEmail:()=> 'actor',defaultVersionStartMonth:()=> '2026-10',normalizeCurrencyCode:value=>value,editRevision:()=> 'r1',assertEditRevision:(expected)=>assert.equal(expected,'r1'),editTransaction:async(_db,fn)=>fn(db),validateSalaryFormula});
 createSalarySystemRouter({requireSalarySystemManager:async()=>true});
 const response=()=>({code:200,body:null,status(value){this.code=value;return this;},json(value){this.body=value;return this;}});
 let res=response();await routes.get('get:/salary-system')({query:{factoryId:'1'}},res);assert.equal(res.body.items[0].nameEn,'Custom output');assert.equal(repairs,0);
 for(const names of [{nameKo:'새 생산수당'},{nameEn:'Renamed output'},{nameVi:'Phụ cấp mới'}]){
  const primary=Object.values(names)[0];res=response();
  await routes.get('put:/salary-system')({query:{factoryId:'1'},body:{expectedRevision:'r1',currencyCode:'VND',items:[{...fixed,nameEn:'',nameKo:'',nameVi:'',...names}],rates:[],createVersion:true}},res);
  assert.equal(res.code,200);assert.equal(fixed.nameEn,primary);assert.deepEqual(fixed.formula,['PRODUCTION_ALLOWANCE']);assert.equal(fixed.required,true);assert.equal(fixed.capValue,null);
  res=response();await routes.get('get:/salary-system')({query:{factoryId:'1'}},res);assert.equal(res.body.items[0].nameEn,primary);assert.equal(repairs,0);
 }
 assert.equal(JSON.stringify(versions.at(-1)),originalSnapshot,'prior version snapshots are immutable');
 fixed={...fixed,formula:['GRADE_RATE']};res=response();await routes.get('get:/salary-system')({query:{factoryId:'1'}},res);
 assert.deepEqual(fixed.formula,['PRODUCTION_ALLOWANCE']);assert.equal(fixed.nameEn,'Phụ cấp mới','repairing the fixed calculation preserves its user label');
});

test('validates and evaluates the restricted salary formula language', () => {
  const formula = ['GRADE_RATE', '×', 'ACTUAL_WORKDAYS', '÷', 'SCHEDULED_WORKDAYS'];
  assert.equal(validateSalaryFormula(formula, 'BASE'), true);
  assert.equal(evaluateSalaryFormula(formula, { GRADE_RATE: 2_600_000, ACTUAL_WORKDAYS: 13, SCHEDULED_WORKDAYS: 26 }), 1_300_000);
  assert.equal(validateSalaryFormula(['ACTUAL_WORKDAYS'], 'ALLOWANCE'), false);
  assert.equal(validateSalaryFormula(['PRODUCTION_ALLOWANCE'], 'INCENTIVE'), true);
  assert.throws(() => evaluateSalaryFormula(['CONST:1', '÷', 'CONST:0'], {}), /division by zero/);
});

test('startup drift detection repairs the nullable salary version boundary column', async () => {
  const [server, migration] = await Promise.all([
    readFile(new URL('../backend/src/index.ts', import.meta.url), 'utf8'),
    readFile(new URL('../backend/migration_fix.sql', import.meta.url), 'utf8'),
  ]);
  assert.match(server, /STARTUP_REQUIRED_NULLABLE_RUNTIME_COLUMNS[\s\S]*SalarySystemVersion[\s\S]*effectiveMonth/);
  assert.match(server, /information_schema\.columns[\s\S]*is_nullable/);
  assert.match(server, /findNonNullableRuntimeSchemaColumns\(\)/);
  assert.match(migration, /ALTER TABLE "SalarySystemVersion" ALTER COLUMN "effectiveMonth" DROP NOT NULL/);
});
