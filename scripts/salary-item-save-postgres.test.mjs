// Uses real application constraints; all writes are rolled back. URL on stdin.
import {createRequire} from 'node:module';
import assert from 'node:assert/strict';
import {loadSourceBindings} from './helpers/source-bindings.mjs';
const require=createRequire(import.meta.url);
const {PrismaClient}=require('../backend/node_modules/@prisma/client');
const {assertSafeApplicationDatabaseEnv}=require('../backend/src/config/databaseTargetGuard');
const revision=require('../backend/dist/utils/editRevision.js');
const names=require('../backend/dist/utils/localizedName.js');
const {validateSalaryFormula}=require('../backend/dist/employees/salaryFormula.js');
const {normalizeCurrencyCode}=require('../backend/dist/currency.js');
const {defaultVersionStartMonth,compareVersionStarts}=require('../backend/dist/utils/versionApplication.js');
let input='';for await(const chunk of process.stdin)input+=chunk;
const {DATABASE_PUBLIC_URL:url}=JSON.parse(input);assertSafeApplicationDatabaseEnv({DATABASE_URL:url,DIRECT_URL:url});
const db=new PrismaClient({datasourceUrl:url});
try {
 const handlers=new Map();let rolledBack=false;
 const router=Object.fromEntries(['get','post','put'].map(method=>[method,(path,handler)=>handlers.set(method+path,handler)]));
 const bindings=loadSourceBindings('backend/src/employees/salarySystem.routes.ts',['createSalarySystemRouter','PAY_TYPES','PAYMENT_MONTHS_BY_CYCLE','toJsonSnapshot'],{
  Router:()=>router,prisma:db,getOrganizationByQuery:async()=>({id:1}),getRequesterEmail:()=> 'ROLLBACK:SALARY_SAVE_TEST',
  ...names,...revision,validateSalaryFormula,normalizeCurrencyCode,defaultVersionStartMonth,compareVersionStarts,
  editTransaction:async(_db,run)=>db.$transaction(async tx=>{
   const saved=await run(tx);
   assert.ok(saved.items.some(item=>item.code==='draft-ROLLBACK-TEST'));
   assert.equal(saved.versions[0].effectiveMonth,null);
   assert.ok(saved.versions[0].items.some(item=>item.code==='draft-ROLLBACK-TEST'));
   rolledBack=true;throw Error('EXPECTED_ROLLBACK');
  },{timeout:60000}),
 });
 bindings.createSalarySystemRouter({requireSalarySystemManager:async()=>true});
 let result;const res={status(code){this.code=code;return this;},json(value){result=value;}};
 const req={query:{orgId:1,factoryId:1},body:{}};
 await handlers.get('get/salary-system/revision')(req,res);
 const expectedRevision=result.editRevision;
 const items=await db.salaryItem.findMany({where:{orgId:1,factoryId:1,isActive:true},orderBy:[{sortOrder:'asc'},{id:'asc'}]});
 const rates=await db.salaryItemRate.findMany({where:{orgId:1,factoryId:1}});
 req.body={expectedRevision,createVersion:true,currencyCode:'VND',items:[...items,{code:'draft-ROLLBACK-TEST',nameEn:'Rollback test allowance',nameKo:'',nameVi:'',category:'ALLOWANCE',payTypes:['OUTPUT_FIXED','OUTPUT'],formula:['GRADE_RATE','×','OVERTIME_HOURS'],payCycle:'MONTHLY',paymentMonths:Array.from({length:12},(_,i)=>i+1),capValue:null}],rates:rates.map(r=>({...r,salaryItemCode:items.find(i=>i.id===r.salaryItemId).code}))};
 try{await handlers.get('put/salary-system')(req,res);}catch(error){if(error.message!=='EXPECTED_ROLLBACK')throw error;}
 if(!rolledBack)throw Error('VALIDATION_FAILED_'+res.code);
 assert.equal(await db.salaryItem.count({where:{orgId:1,factoryId:1,code:'draft-ROLLBACK-TEST'}}),0);
 console.log(JSON.stringify({rollbackVerified:true,newItemAndVersionSaved:true}));
}catch(error){console.error(JSON.stringify({code:error.code,message:error.message?.split('\n').at(-1),meta:error.meta}));process.exitCode=1;}finally{await db.$disconnect();}
