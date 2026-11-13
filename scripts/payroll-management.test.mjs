import test from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {createRequire} from 'node:module';
import {AsyncLocalStorage} from 'node:async_hooks';
import {loadSourceBindings} from './helpers/source-bindings.mjs';
import {changeApprovalFixture,seedChangeApproval} from './helpers/change-approval-fixture.mjs';
const require=createRequire(import.meta.url);
const {setPayrollManagement}=require('../backend/dist/services/payrollManagement');
const {searchPayrollEvidence,validatePayrollEvidence}=require('../backend/dist/services/payrollPayables');
const {readAccountingOpening}=require('../backend/dist/services/accountingOpening');
const {loadAccountOverview}=require('../backend/dist/services/accountOverview');
const {requestChangeApproval,decideChangeApproval}=require('../backend/dist/services/changeApprovals');
function payrollServices(db){
 return loadSourceBindings('backend/src/payroll/payroll.service.ts',['payrollTransaction','prisma','assertPayrollMonth','lockPayrollSnapshot','unlockPayrollSnapshot'],{applicationPrisma:db,AsyncLocalStorage,...require('../backend/dist/utils/editRevision'),...require('../backend/dist/utils/common'),...require('../backend/dist/utils/http'),...require('../backend/dist/services/payrollPayables'),getPayrollMonthReadiness:async()=>({invalidPayrollAttendance:[],needsRecalculation:false})});
}
test('monthly exclusion preserves wages, scope and audit; restores AP and evidence; blocks stale and paid sources',async()=>{
 const f=await changeApprovalFixture({registration:true});try{
  const db=f.db,s=await seedChangeApproval(db),org=s.company.id,actor=s.people.admin;
  await db.transactionCodeBase.update({where:{id:s.code.baseId},data:{code:'SAL'}});
  const factory=await db.factory.create({data:{orgId:org,name:'Payroll factory'}}),services=payrollServices(db);
  const data=[{workerId:s.people.junior.id,currencyCode:'USD',netSalary:100},{workerId:s.people.senior.id,currencyCode:'USD',netSalary:60}];
  const snapshots=[];
  for(const month of ['2026-09','2026-10']){
   const snapshot=await db.payrollSnapshot.create({data:{orgId:org,factoryId:factory.id,month,data,isProvisional:true,lockedAt:new Date(),lockedBy:actor.email}});
   await services.lockPayrollSnapshot({orgId:org,month,factoryId:factory.id,actorId:actor.id,lockedBy:actor.email});
   snapshots.push(await db.payrollSnapshot.findUnique({where:{id:snapshot.id}}));
  }
  const before=snapshots[1],input={excluded:true,revision:0,snapshotRevision:before.revision,clientKey:randomUUID()};
  const toggle=body=>setPayrollManagement(db,org,actor.id,before.month,factory.id,body);
  const evidence=()=>searchPayrollEvidence(db,org,{currencyCode:'USD',search:before.month});
  const overview=()=>loadAccountOverview(db,org,{});
  const payableTotal=report=>report.payables.reduce((n,p)=>n+Number(p.balance),0);
  assert.equal(payableTotal(await overview()),320);
  const item=await db.payrollPayableItem.findFirst({where:{document:{snapshotId:before.id},employeeId:s.people.junior.id}});
  const row={entryKind:'BANK',clientKey:randomUUID(),accountId:s.account.id,transactionDate:'2026-11-10',direction:'OUT',amount:'40',remark:'October salary',accountingCodeId:s.code.id,evidenceType:'PAYROLL',payrollItemId:item.id,counterparty:{kind:'EMPLOYEE',id:item.employeeId}};
  const batchKey=randomUUID(),pending=await requestChangeApproval(db,org,actor.id,{menu:'BANK_LEDGER',operation:'CREATE',sourceKind:'batch',sourceId:batchKey,clientKey:randomUUID(),selection:{step1EmployeeId:s.people.junior.id,step2EmployeeId:s.people.lead.id},payload:{schemaVersion:2,accountingCodeVersion:1,clientKey:batchKey,rows:[row]}});
  await assert.rejects(toggle({...input,snapshotRevision:before.revision+1}),/PAYROLL_MANAGEMENT_CHANGED/);
  await assert.rejects(setPayrollManagement(db,s.other.id,actor.id,before.month,factory.id,input),/PAYROLL_PAYABLE_ACCESS_DENIED/);
  assert.equal((await evidence()).documents.length,2);
  await decideChangeApproval(db,org,s.people.junior.id,pending.id,{decision:'APPROVED'});
  const excluded=await toggle(input);assert.equal(excluded.payableManagementExcluded,true);assert.equal(excluded.managementRevision,1);
  assert.deepEqual(await toggle(input),excluded,'same request is idempotent');
  assert.equal(await db.payrollManagementEvent.count(),1);
  assert.equal((await evidence()).documents.length,0);
  await assert.rejects(db.payrollPayableAllocation.create({data:{orgId:org,payrollItemId:item.id,entryId:randomUUID(),amount:'1'}}),/PAYROLL_MONTH_MANAGEMENT_EXCLUDED/,'database also rejects bypassed allocations');
  assert.equal((await searchPayrollEvidence(db,org,{currencyCode:'USD',search:'2026-09'})).documents.length,2,'other month stays eligible');
  assert.equal(payableTotal(await overview()),160);
  assert.ok(!(await readAccountingOpening(db,org,actor.id,{balanceDate:'2026-11-01'})).documents.some(d=>d.id===item.id));
  await assert.rejects(db.$transaction(tx=>validatePayrollEvidence(tx,org,{currencyCode:'USD'},row)),/PAYROLL_MONTH_MANAGEMENT_EXCLUDED/);
  await assert.rejects(decideChangeApproval(db,org,s.people.lead.id,pending.id,{decision:'APPROVED'}),/PAYROLL_MONTH_MANAGEMENT_EXCLUDED/);
  assert.equal(await db.bankLedgerEntry.count(),0,'stale pending payment rolls back');
  const after=await db.payrollSnapshot.findUnique({where:{id:before.id}});
  assert.deepEqual({...after,payableManagementExcluded:false,evidenceManagementExcluded:null,managementRevision:0},before,'all frozen fields unchanged');
  assert.equal(await db.payrollPayableItem.count(),4,'all original AP items retained');
  await assert.rejects(db.payrollSnapshot.update({where:{id:before.id},data:{payableManagementExcluded:false,managementRevision:2}}),/PAYROLL_PAYABLE_ACCESS_DENIED/);
  await assert.rejects(db.$transaction(async tx=>{await tx.$queryRawUnsafe("SELECT set_config('baro.payroll_management_actor',$1,true)",String(actor.id));await tx.payrollSnapshot.update({where:{id:before.id},data:{payableManagementExcluded:false,managementRevision:2}});}),/PAYROLL_MANAGEMENT_AUDIT_REQUIRED/);
  const event=await db.payrollManagementEvent.findFirst();await assert.rejects(db.payrollManagementEvent.delete({where:{id:event.id}}),/PAYROLL_HISTORY_IMMUTABLE/);
  const restored=await toggle({...input,excluded:false,revision:1,clientKey:randomUUID()});assert.equal(restored.managementRevision,2);
  assert.equal(payableTotal(await overview()),320);assert.equal((await evidence()).documents.length,2);
  await decideChangeApproval(db,org,s.people.lead.id,pending.id,{decision:'APPROVED'});
  assert.equal(await db.payrollPayableAllocation.count(),1);
  await assert.rejects(toggle({...input,revision:2,clientKey:randomUUID()}),/PAYROLL_MANAGEMENT_PAYMENT_LINKED/);
  assert.equal((await db.payrollSnapshot.findUnique({where:{id:before.id}})).payableManagementExcluded,false);
  assert.equal(await db.payrollManagementEvent.count(),2);
  const migration=require('../backend/scripts/migrate-entity-profiles').migrations().find(m=>m.version==='20261113040000_payroll_payable_management');
  await f.pg.exec(migration.sql);await f.pg.exec(migration.sql);assert.equal(await db.payrollManagementEvent.count(),2);
  await db.systemSetting.create({data:{key:'ROLE_ACCESS_POLICY',value:{SERVICE:{ADMIN:['BANK_LEDGER']}}}});
  await assert.rejects(toggle({...input,revision:2,clientKey:randomUUID()}),/PAYROLL_PAYABLE_ACCESS_DENIED/);
 }finally{await f.close();}
});

test('exclusion survives unlock and relock without changing wages; factory and actor boundaries apply',async()=>{
 const f=await changeApprovalFixture();try{
  const db=f.db,s=await seedChangeApproval(db),org=s.company.id,actor=s.people.admin;
  await db.transactionCodeBase.update({where:{id:s.code.baseId},data:{code:'SAL'}});
  const factory=await db.factory.create({data:{orgId:org,name:'Monthly exclusion'}}),otherFactory=await db.factory.create({data:{orgId:s.other.id,name:'Other factory'}});
  const data=[{workerId:s.people.junior.id,currencyCode:'USD',netSalary:100}],month='2026-10';
  let snapshot=await db.payrollSnapshot.create({data:{orgId:org,factoryId:factory.id,month,data,isProvisional:true,lockedAt:new Date(),lockedBy:actor.email}});
  const services=payrollServices(db),toggle=body=>setPayrollManagement(db,org,actor.id,month,factory.id,body);
  const input={excluded:true,revision:0,snapshotRevision:0,clientKey:randomUUID()};
  await assert.rejects(setPayrollManagement(db,org,actor.id,month,otherFactory.id,input),/FACTORY_NOT_FOUND/);
  await assert.rejects(setPayrollManagement(db,org,actor.id,'2026-09',factory.id,input),/PAYROLL_MANAGEMENT_NOT_SAVED/);
  await toggle(input);
  const lock=()=>services.lockPayrollSnapshot({orgId:org,month,factoryId:factory.id,actorId:actor.id,lockedBy:actor.email});
  await lock();assert.equal((await searchPayrollEvidence(db,org,{currencyCode:'USD',search:month})).documents.length,0);
  await services.unlockPayrollSnapshot(org,month,factory.id,actor.id);await lock();
  snapshot=await db.payrollSnapshot.findUnique({where:{id:snapshot.id}});
  assert.equal(snapshot.payableManagementExcluded,true);assert.equal(snapshot.managementRevision,1);assert.deepEqual(snapshot.data,data);
  assert.equal(await db.payrollPayableItem.count(),2,'revisions preserve original AP items');
  await assert.rejects(toggle({...input,excluded:false,revision:1,clientKey:randomUUID()}),/PAYROLL_MANAGEMENT_CHANGED/,'stale financial revision cannot restore');
  await toggle({...input,excluded:false,revision:1,snapshotRevision:snapshot.revision,clientKey:randomUUID()});
  assert.equal((await searchPayrollEvidence(db,org,{currencyCode:'USD',search:month})).documents.length,1);
  const worker=await db.employee.create({data:{orgId:org,name:'Worker',gradeId:s.people.junior.gradeId,orgRole:'WORKER',status:'ACTIVE'}});
  await assert.rejects(setPayrollManagement(db,org,worker.id,month,factory.id,{...input,revision:2,snapshotRevision:snapshot.revision}),/PAYROLL_PAYABLE_ACCESS_DENIED/);
 }finally{await f.close();}
});
