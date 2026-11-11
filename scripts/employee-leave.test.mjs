import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createRequire} from 'node:module';
import {PGlite} from '@electric-sql/pglite';
const require=createRequire(import.meta.url),{grantEmployeeLeave:grant,recordEmployeeLeave:record,cancelEmployeeLeave:cancel,employeeLeaveBalance:balance,assertCompanyLeaveBalances,registerEmployeeLeaveRoutes}=require('../backend/dist/employees/employeeLeave');
async function fixture(){
 const pg=new PGlite();await pg.exec('CREATE TABLE "Organization"(id INTEGER PRIMARY KEY);CREATE TABLE "Employee"(id INTEGER PRIMARY KEY,"orgId" INTEGER,name TEXT,"employeeNo" TEXT,status TEXT,"orgRole" TEXT,"payType" TEXT,"joinedAt" TEXT,"leftAt" TEXT,UNIQUE(id,"orgId"));CREATE TABLE "OrganizationHoliday"("orgId" INTEGER,"holidayDate" TEXT,UNIQUE("orgId","holidayDate"));INSERT INTO "Organization" VALUES(1),(2);INSERT INTO "Employee" VALUES(1,1,\'Worker\',\'W1\',\'ACTIVE\',\'WORKER\',\'OUTPUT\',\'2020-01-01\',NULL),(10,1,\'Admin\',\'A1\',\'ACTIVE\',\'ADMIN\',\'GENERAL\',\'2020-01-01\',NULL),(11,1,\'Operator\',\'O1\',\'ACTIVE\',\'OPERATOR\',\'GENERAL\',\'2020-01-01\',NULL),(20,2,\'Other\',\'X1\',\'ACTIVE\',\'ADMIN\',\'GENERAL\',\'2020-01-01\',NULL);');
 await pg.exec(readFileSync('backend/prisma/migrations/20261106200000_paid_holiday_calendar/migration.sql','utf8'));await pg.exec(readFileSync('backend/prisma/migrations/20261106210000_employee_leave_calendar/migration.sql','utf8'));
 const query=async(sql,...values)=>(await pg.query(sql,values)).rows;
 const db={workTimeDay:{findMany:async()=>[]},$queryRawUnsafe:query,$executeRawUnsafe:async(sql,...values)=>{await pg.query(sql,values);return 1;},employee:{findFirst:async({where})=>{const rows=await query('SELECT * FROM "Employee" WHERE "orgId"=$1 AND id=$2',where.orgId,where.id),row=rows[0];if(!row)return null;if(typeof where.status==='string'&&row.status!==where.status)return null;if(where.orgRole&&(typeof where.orgRole==='string'?row.orgRole!==where.orgRole:!where.orgRole.in.includes(row.orgRole)))return null;return row;}},employeePayTypePolicy:{findMany:async()=>[]},organizationHoliday:{findMany:async({where})=>query('SELECT * FROM "OrganizationHoliday" WHERE "orgId"=$1',where.orgId)},attendanceEntry:{findFirst:async()=>null}};
 db.$transaction=async fn=>{await pg.exec('BEGIN');try{const result=await fn(db);await pg.exec('COMMIT');return result;}catch(error){await pg.exec('ROLLBACK');throw error;}};
 return {pg,db,query};
}
test('annual balance, leave types, duplicate requests, cancellation and immutable SQL history',async()=>{
 const {pg,db,query}=await fixture();try{
  await query('INSERT INTO "OrganizationHoliday"("orgId","holidayDate") VALUES(1,$1)', '2026-11-02');assert.equal((await query('SELECT "isPaid" FROM "OrganizationHoliday"'))[0].isPaid,true);
  const g={year:2026,days:2,reason:'Company grant',clientKey:'grant-key-0001'};await grant(db,1,1,10,g);await grant(db,1,1,10,g);assert.equal((await balance(db,1,1,2026)).granted,2);
  await assert.rejects(grant(db,1,1,11,{...g,clientKey:'grant-key-0002'}),/LEAVE_ACCESS_DENIED/);
  await assert.rejects(grant(db,1,20,10,{...g,clientKey:'grant-key-0003'}),/LEAVE_EMPLOYEE_NOT_FOUND/);
  const leave={startDate:'2026-11-01',endDate:'2026-11-04',kind:'ANNUAL',reason:'Annual leave',clientKey:'leave-key-0001'};
  let result=await record(db,1,1,11,leave);assert.equal(result.used,2);assert.equal(result.remaining,0);assert.equal(result.leaves.length,2);assert.equal(result.leaves.some(row=>row.leaveDate==='2026-11-02'),false);
  await record(db,1,1,11,leave);assert.equal((await balance(db,1,1,2026)).used,2);
  await assert.rejects(record(db,1,1,11,{...leave,startDate:'2026-11-05',endDate:'2026-11-05',clientKey:'leave-key-0002'}),/LEAVE_INSUFFICIENT_BALANCE/);
  await assert.rejects(record(db,1,1,11,{...leave,kind:'PAID',clientKey:'leave-key-0003'}),/LEAVE_DATE_OVERLAP/);
  result=await record(db,1,1,11,{...leave,startDate:'2026-11-05',endDate:'2026-11-07',kind:'UNPAID',clientKey:'leave-key-0004'});assert.equal(result.used,2);assert.equal(result.leaves.filter(row=>row.kind==='UNPAID').length,3);
  const original=result.leaves.find(row=>row.kind==='ANNUAL');result=await cancel(db,1,1,11,original.id,{reason:'Correction'});assert.equal(result.remaining,1);assert.ok(result.leaves.find(row=>row.id===original.id).cancelledAt);
  await assert.rejects(query('UPDATE "EmployeeLeaveDay" SET reason=$1 WHERE id=$2','Rewrite',original.id),/LEAVE_HISTORY_IMMUTABLE/);
  await assert.rejects(query('DELETE FROM "EmployeeLeaveGrant"'),/LEAVE_HISTORY_IMMUTABLE/);
  await assert.rejects(grant(db,1,1,10,{...g,days:-2,clientKey:'grant-key-0004'}),/LEAVE_INSUFFICIENT_BALANCE/);
  db.attendanceEntry.findFirst=async()=>({id:1});await assert.rejects(record(db,1,1,11,{...leave,startDate:'2026-11-10',endDate:'2026-11-10',kind:'PAID',clientKey:'leave-key-0005'}),/LEAVE_ATTENDANCE_CONFLICT/);
 }finally{await pg.close();}
});
test('company holiday overlap refunds annual days and a failed multi-day registration rolls back',async()=>{
 const {pg,db,query}=await fixture();try{
  await grant(db,1,1,10,{year:2026,days:2,reason:'Grant',clientKey:'grant-key-1001'});
  const input={startDate:'2026-11-03',endDate:'2026-11-04',kind:'ANNUAL',reason:'Vacation',clientKey:'leave-key-1001'};
  const execute=db.$executeRawUnsafe;db.$executeRawUnsafe=async(sql,...args)=>{if(args.includes('2026-11-04'))throw Error('Simulated second-day failure');return execute(sql,...args);};
  await assert.rejects(record(db,1,1,11,input),/Simulated/);assert.equal((await balance(db,1,1,2026)).used,0);db.$executeRawUnsafe=execute;
  await record(db,1,1,11,input);await query('INSERT INTO "OrganizationHoliday"("orgId","holidayDate") VALUES(1,$1)','2026-11-03');assert.equal((await balance(db,1,1,2026)).used,1);await assertCompanyLeaveBalances(db,1);
  await grant(db,1,1,10,{year:2026,days:-1,reason:'Adjustment',clientKey:'grant-key-1002'});await query('DELETE FROM "OrganizationHoliday"');await assert.rejects(assertCompanyLeaveBalances(db,1),/LEAVE_INSUFFICIENT_BALANCE/);
  assert.equal((await balance(db,2,20,2026)).leaves.length,0);
 }finally{await pg.close();}
});
test('leave API requires actual company access and the holiday feature before reading employee data',async()=>{
 const routes=new Map();let scope=null,permitted=false,feature=false,reads=0;
 const app={get:(path,handler)=>routes.set('get:'+path,handler),post:(path,handler)=>routes.set('post:'+path,handler)};
 const db={employee:{findMany:async({where})=>{reads++;scope=where.orgId;return [{id:1,name:'Own employee'}];}}};
 registerEmployeeLeaveRoutes(app,db,{requireOrgRole:async(_req,_res,options)=>{assert.equal(options.allowSystemAdmin,false);return permitted?{organization:{id:7,type:'MANUFACTURER'},employee:{orgRole:'OPERATOR'}}:null;},loadPolicy:async()=>({policy:{MANUFACTURER:{OPERATOR:feature?['HOLIDAY']:[]}}}),actorId:()=>11});
 const response=()=>({code:200,body:null,status(code){this.code=code;return this;},json(body){this.body=body;return this;}}),route=routes.get('get:/employee-leaves'),req={query:{year:'2026'},params:{}};
 await route(req,response());assert.equal(reads,0);permitted=true;let res=response();await route(req,res);assert.equal(res.code,403);assert.equal(reads,0);
 feature=true;res=response();await route(req,res);assert.equal(scope,7);assert.equal(res.body.employees[0].name,'Own employee');
 await assert.rejects(route({...req,query:{year:'2026',employeeId:'invalid'}},response()),/LEAVE_INVALID_INPUT/);
});
