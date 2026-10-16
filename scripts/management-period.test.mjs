import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { PGlite } from '@electric-sql/pglite';
import policy from '../backend/dist/factories/factoryManagementStart.js';
const require=createRequire(import.meta.url),ts=require('../backend/node_modules/typescript');
const source=ts.createSourceFile('index.ts',readFileSync('backend/src/index.ts','utf8'),ts.ScriptTarget.Latest,true);
function route(path,deps) {
  const statement=source.statements.find(node=>ts.isExpressionStatement(node)&&ts.isCallExpression(node.expression)&&node.expression.expression.getText(source)==='app.get'&&node.expression.arguments[0]?.text===path);
  assert.ok(statement,path);
  const js=ts.transpileModule('const handler='+statement.expression.arguments[1].getText(source),{compilerOptions:{target:ts.ScriptTarget.ES2022}}).outputText;
  return new Function(...Object.keys(deps),js+';return handler;')(...Object.values(deps));
}
function condition(where,args) {
  return Object.entries(where||{}).map(([key,value])=>{
    if(key==='AND'||key==='OR')return '('+value.map(child=>condition(child,args)).join(key==='AND'?' AND ':' OR ')+')';
    const column='"'+key+'"';
    if(value===null)return column+' IS NULL';
    if(typeof value==='object')return '('+Object.entries(value).map(([op,input])=>{
      if(op==='not'&&input===null)return column+' IS NOT NULL';
      args.push(op==='startsWith'?input+'%':input);
      return column+({gte:' >= ',lte:' <= ',startsWith:' LIKE '}[op])+`$${args.length}`;
    }).join(' AND ')+')';
    args.push(value);return column+`=$${args.length}`;
  }).join(' AND ')||'true';
}
async function fixture() {
  const db=new PGlite();
  await db.exec(`CREATE TABLE "Factory"(id INT,"orgId" INT,"managementStartDate" TEXT);
    INSERT INTO "Factory" VALUES(10,1,'2026-06-15'),(11,1,'2026-08-01'),(12,1,NULL),(20,2,'2026-03-01');
    CREATE TABLE "WorkLog"(id INT,"orgId" INT,"factoryId" INT,"recordKind" TEXT,"displayDate" TEXT,"coverageStartDate" TEXT,"coverageEndDate" TEXT);
    INSERT INTO "WorkLog" VALUES(1,1,10,'EMPLOYEE','2026-06-14',NULL,NULL),(2,1,10,'EMPLOYEE','2026-06-15',NULL,NULL),(3,1,11,'EMPLOYEE','2026-07-31',NULL,NULL),(4,1,11,'EMPLOYEE','2026-08-01',NULL,NULL),(5,1,NULL,'EMPLOYEE','2026-06-14',NULL,NULL),(6,1,NULL,'EMPLOYEE','2026-06-16',NULL,NULL),(7,2,20,'EMPLOYEE','2026-03-01',NULL,NULL);
    CREATE TABLE "PayrollSnapshot"(id INT,"orgId" INT,"factoryId" INT,month TEXT,data JSONB);
    INSERT INTO "PayrollSnapshot" VALUES(1,1,10,'2026-05','[]'),(2,1,10,'2026-06','[]'),(3,1,11,'2026-07','[]'),(4,1,11,'2026-08','[]');
    CREATE TABLE "PartnerTransactionCost"(id INT,"orgId" INT,"transactionDate" TEXT);
    INSERT INTO "PartnerTransactionCost" VALUES(1,1,'2026-06-14'),(2,1,'2026-06-15'),(3,2,'2026-06-16');
    CREATE TABLE "AttendanceEntry"(id INT,"orgId" INT,"factoryId" INT,"workDate" TEXT,"managementExcluded" BOOLEAN DEFAULT false);
    INSERT INTO "AttendanceEntry"(id,"orgId","factoryId","workDate") VALUES(1,1,10,'2026-06-14'),(2,1,10,'2026-06-15'),(3,1,11,'2026-07-31'),(4,1,11,'2026-08-01');`);
  const model=table=>({findMany:async({where})=>{const args=[];return(await db.query(`SELECT * FROM "${table}" WHERE ${condition(where,args)} ORDER BY id`,args)).rows;},findFirst:async({where})=>{const args=[];return(await db.query(`SELECT * FROM "${table}" WHERE ${condition(where,args)}`,args)).rows[0];}});
  return {db,prisma:{factory:model('Factory'),workLog:model('WorkLog'),payrollSnapshot:model('PayrollSnapshot'),partnerTransactionCost:model('PartnerTransactionCost'),attendanceEntry:model('AttendanceEntry')}};
}
test('organization start uses only its earliest configured factory; unset factories inherit it',async()=>{
  const {db,prisma}=await fixture();try {
    const period=await policy.loadManagementPeriod(prisma,1);
    assert.equal(period.startDate,'2026-06-15');assert.equal(period.factories.find(row=>row.id===12).startDate,'2026-06-15');
    assert.equal((await policy.loadManagementPeriod(prisma,1,11)).startDate,'2026-08-01');
    await assert.rejects(policy.loadManagementPeriod(prisma,1,20),/FACTORY_NOT_FOUND/);
    assert.throws(()=>policy.assertManagedDate('2026-05',period.startDate,true),/BEFORE_MANAGEMENT_START/);
    assert.doesNotThrow(()=>policy.assertManagedDate('2026-06',period.startDate,true));
  }finally{await db.close();}
});
test('actual work-list route excludes pre-start records, respects per-factory starts and preserves history',async()=>{
  const {db,prisma}=await fixture();try {
    const deps={...policy,prisma,getOrganizationByQuery:async()=>({id:1}),normalizeWorkLogRecordKind:()=> 'EMPLOYEE',normalizeDateKey:policy.normalizeFactoryManagementStartDateKey,buildWorkLogSelectWithOptionalCoverage:()=>({}),buildWorkLogResponseList:async({workLogs})=>workLogs,isWorkLogCoverageMissingColumnError:()=>false};
    const handler=route('/work-logs',deps);let response;
    const res={json:value=>{response=value;},status:()=>res};
    await handler({query:{}},res);assert.deepEqual(response.map(row=>row.id),[2,4,6]);
    await handler({query:{dateFrom:'2026-06-01',dateTo:'2026-06-30'}},res);assert.deepEqual(response.map(row=>row.id),[2,6]);
    for(const query of [{dateFrom:'2026-05-01',dateTo:'2026-05-31'},{workDate:'2026-06-14'},{factoryId:11,dateFrom:'2026-07-01',dateTo:'2026-07-31'}])await assert.rejects(handler({query},res),/BEFORE_MANAGEMENT_START/);
    assert.equal((await db.query('SELECT count(*)::int n FROM "WorkLog"')).rows[0].n,7);
  }finally{await db.close();}
});
test('payroll list hides old snapshots without deleting or recalculating them',async()=>{
  const {db,prisma}=await fixture();try {
    const payroll=ts.createSourceFile('payroll.ts',readFileSync('backend/src/payroll/payroll.service.ts','utf8'),ts.ScriptTarget.Latest,true);
    const declaration=payroll.statements.flatMap(node=>ts.isVariableStatement(node)?[...node.declarationList.declarations]:[]).find(node=>node.name.getText(payroll)==='listPayrollSnapshots');
    const js=ts.transpileModule('const list='+declaration.initializer.getText(payroll),{compilerOptions:{target:ts.ScriptTarget.ES2022}}).outputText;
    const fn=new Function('prisma','loadManagementPeriod','ensureArray','normalizePayrollSnapshotEmployee',js+';return list;')(prisma,policy.loadManagementPeriod,value=>value,value=>value);
    assert.deepEqual((await fn(1)).map(row=>row.id),[2,4]);
    assert.equal((await db.query('SELECT count(*)::int n FROM "PayrollSnapshot"')).rows[0].n,4);
  }finally{await db.close();}
});

test('cost and attendance APIs enforce company and factory dates even without frontend filters',async()=>{
  const {db,prisma}=await fixture();try {
    const deps={...policy,prisma,requireOrgRole:async()=>({organization:{id:1}}),ORG_MANAGEMENT_ROLES:[],costInclude:{},normalizeDateKey:policy.normalizeFactoryManagementStartDateKey,normalizeMonthKey:value=>/^\d{4}-\d{2}$/.test(String(value))?value:null,toAttendanceEntryResponse:value=>value};
    let response;const res={json:value=>{response=value;},status:()=>res};
    const costs=route('/partner-transaction-costs',deps);
    await costs({query:{}},res);assert.deepEqual(response.map(row=>row.id),[2]);
    await assert.rejects(costs({query:{dateFrom:'2026-05-01',dateTo:'2026-05-31'}},res),/BEFORE_MANAGEMENT_START/);
    const attendance=route('/attendance-entries',deps);
    await attendance({query:{factoryId:10,month:'2026-06'}},res);assert.deepEqual(response.map(row=>row.id),[2]);
    await attendance({query:{factoryId:11,monthsOnly:'true'}},res);assert.deepEqual(response,['2026-08']);
    await assert.rejects(attendance({query:{factoryId:11,month:'2026-07'}},res),/BEFORE_MANAGEMENT_START/);
  }finally{await db.close();}
});
