import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {loadSourceBindings} from './helpers/source-bindings.mjs';

test('creating a salary version ignores the retired effective-month input and leaves existing application unchanged',async()=>{
 const handlers=new Map(), versions=[{id:1,versionNumber:1,effectiveMonth:'1900-01',confirmedDate:new Date('2026-01-01'),snapshot:{}}];
 const router={get(){},put(){},post(path,handler){handlers.set(path,handler);}};
 const prisma={factory:{findFirst:async()=>({id:1,salaryCurrency:{code:'VND'}})},salaryItem:{findMany:async()=>[]},salaryItemRate:{findMany:async()=>[]},salarySystemVersion:{findMany:async()=>[...versions].reverse(),create:async({data})=>{const row={id:versions.length+1,...data,confirmedDate:new Date()};versions.push(row);return row;}}};
 const {createSalarySystemRouter}=loadSourceBindings('backend/src/employees/salarySystem.routes.ts',['createSalarySystemRouter'],{
  Router:()=>router,prisma,getOrganizationByQuery:async()=>({id:1}),getRequesterEmail:()=> 'tester',editTransaction:async(_db,fn)=>fn(prisma),assertEditRevision:()=>{},editRevision:()=> 'r1',normalizeCurrencyCode:x=>x,defaultVersionStartMonth:()=> '2026-10',toJsonSnapshot:x=>JSON.parse(JSON.stringify(x)),
 });
 createSalarySystemRouter({requireSalarySystemManager:async()=>true});
 let result;const res={status(code){this.code=code;return this;},json(value){result=value;}};
 await handlers.get('/salary-system/versions')({query:{factoryId:1},body:{expectedRevision:'r1',effectiveMonth:'2026-10'}},res);
 assert.equal(res.code,201);assert.equal(result.effectiveMonth,null);assert.equal(result.versionNumber,2);assert.equal(versions[0].effectiveMonth,'1900-01');
});

test('only boundary endpoints change application months; ordinary save paths create unapplied versions',()=>{
 const salary=readFileSync('backend/src/employees/salarySystem.routes.ts','utf8');
 const factory=readFileSync('backend/src/factories/factory.routes.ts','utf8');
 const salarySave=salary.slice(salary.indexOf('router.put("/salary-system",'),salary.indexOf('router.put("/salary-system/version-boundaries"'));
 assert.equal((salarySave.match(/effectiveMonth: null/g)||[]).length,2);
 assert.doesNotMatch(salarySave,/req.body\?\.effectiveMonth/);
 const factorySave=factory.slice(factory.indexOf('factoryRouter.post("/factories"'),factory.indexOf('production-allowance-version-boundaries'));
 assert.doesNotMatch(factorySave,/newVersionEffectiveMonth|productionAllowanceEffectiveMonthChanged|factoryProductionAllowanceRate.update\(/);
 assert.equal((factorySave.match(/effectiveMonth: null/g)||[]).length,2);
 for(const path of ['frontend/src/pages/App/SalarySystem.jsx','frontend/src/pages/App/organization/factoryDetail/FactoryDetail.jsx']) {
  assert.doesNotMatch(readFileSync(path,'utf8'),/VersionApplicationStart|newVersionEffectiveMonth|newVersionMonth/);
 }
});
