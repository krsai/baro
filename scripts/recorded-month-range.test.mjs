import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {createRequire} from 'node:module';
const require=createRequire(import.meta.url),ts=require('../backend/node_modules/typescript');

test('work month catalogue respects tenant, factory, kind and management exclusions without the selected date range',async()=>{
 const source=fs.readFileSync('backend/src/index.ts','utf8'),tree=ts.createSourceFile('index.ts',source,ts.ScriptTarget.Latest,true);
 const route=tree.statements.find(node=>ts.isExpressionStatement(node)&&ts.isCallExpression(node.expression)&&node.expression.expression.getText(tree)==='app.get'&&node.expression.arguments[0]?.text==='/work-logs');
 let handler;
 const deps={app:{get:(_path,fn)=>handler=fn},getOrganizationByQuery:async()=>({id:1}),normalizeWorkLogRecordKind:value=>value||'EMPLOYEE',normalizeDateKey:()=>null,
  loadManagementPeriod:async()=>({startDate:'2026-06-01'}),assertManagedDate:()=>{},managedDateRange:()=>({gte:'2026-06-01',lte:'2026-10-31'}),managedWorkLogWhere:()=>({managementExcluded:false}),
  prisma:{factory:{findFirst:async({where})=>{assert.deepEqual(where,{id:5,orgId:1});return{id:5};}},workLog:{findMany:async({where,select})=>{
   assert.deepEqual(where,{orgId:1,recordKind:'EMPLOYEE',factoryId:5,AND:[{managementExcluded:false}]});
   assert.deepEqual(select,{displayDate:true});return[{displayDate:'2026-08-03'},{displayDate:'2026-08-10'},{displayDate:'2026-07-31'}];
  }}}};
 new Function(...Object.keys(deps),ts.transpileModule(route.getText(tree),{compilerOptions:{target:ts.ScriptTarget.ES2022}}).outputText)(...Object.values(deps));
 let result;
 await handler({query:{factoryId:'5',monthsOnly:'1'}},{json:value=>result=value});
 assert.deepEqual(result,['2026-08','2026-07']);
});
