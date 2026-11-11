import test from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {createRequire} from 'node:module';
import {AsyncLocalStorage} from 'node:async_hooks';
import {loadSourceBindings} from './helpers/source-bindings.mjs';
import {changeApprovalFixture,seedChangeApproval} from './helpers/change-approval-fixture.mjs';
const require=createRequire(import.meta.url);
const {ensurePayrollPayables,voidPayrollPayables,importLockedPayrollPayables,searchPayrollEvidence}=require('../backend/dist/services/payrollPayables');
const {reconcileLedgerBalances}=require('../backend/dist/services/ledgerBalance');
const {readAccountingOpening,voidAccountingOpening}=require('../backend/dist/services/accountingOpening');
const {readLedgerEdit}=require('../backend/dist/services/bankLedgerEdit');
const {requestChangeApproval,decideChangeApproval}=require('../backend/dist/services/changeApprovals');
const {postLedgerEntryInTransaction}=require('../backend/dist/services/bankLedger');
const {outstandingReport}=require('../backend/dist/services/accountOverview');
function payrollServices(db,readiness={invalidPayrollAttendance:[],needsRecalculation:false}){
 return loadSourceBindings('backend/src/payroll/payroll.service.ts',['payrollTransaction','prisma','assertPayrollMonth','lockPayrollSnapshot','unlockPayrollSnapshot'],{applicationPrisma:db,AsyncLocalStorage,...require('../backend/dist/utils/editRevision'),...require('../backend/dist/utils/common'),...require('../backend/dist/utils/http'),...require('../backend/dist/services/payrollPayables'),getPayrollMonthReadiness:async()=>readiness});
}

test('payroll AP preserves frozen net pay, numbers and audit; exclusions and approved payments protect unlock',async()=>{
 const f=await changeApprovalFixture({registration:true});try{
  const db=f.db,s=await seedChangeApproval(db),org=s.company.id,actor=s.people.admin,scope={orgId:org,actorId:actor.id,actor:actor.email};
  await db.transactionCodeBase.update({where:{id:s.code.baseId},data:{code:'SAL'}});
  const factory=await db.factory.create({data:{orgId:org,name:'Payroll factory'}});
  const data=[{workerId:s.people.junior.id,currencyCode:'USD',grossSalary:120,deductions:20,netSalary:100},{workerId:s.people.senior.id,currencyCode:'USD',netSalary:60}];
  let snapshot=await db.payrollSnapshot.create({data:{orgId:org,factoryId:factory.id,month:'2026-10',data,isProvisional:true,lockedAt:new Date(),lockedBy:actor.email}});
  assert.equal(await db.payrollPayableDocument.count(),0,'calculation remains a draft');
  await assert.rejects(db.$transaction(tx=>ensurePayrollPayables(tx,snapshot,actor.id)),/PAYROLL_PAYABLE_NOT_LOCKED/);
  const services=payrollServices(db),unlock=()=>services.unlockPayrollSnapshot(org,'2026-10',factory.id,actor.id);
  const lock=async()=>{const result=await services.lockPayrollSnapshot({orgId:org,month:'2026-10',factoryId:factory.id,lockedBy:actor.email,actorId:actor.id});snapshot=await db.payrollSnapshot.findUnique({where:{id:snapshot.id}});return result;};
  const first=await lock(),number=first.managementNumber;
  assert.match(number,/^PAY-2026-\d{6}$/);
  assert.equal(await db.expenseRequest.count(),0,'salary evidence does not duplicate expenses');
  assert.equal(await db.bankLedgerEntry.count(),0,'locking does not invent cash');
  await db.$transaction(tx=>ensurePayrollPayables(tx,snapshot,actor.id));assert.equal(await db.payrollPayableItem.count(),2);
  let item=await db.payrollPayableItem.findFirst({where:{employeeId:s.people.junior.id,voidedAt:null}});assert.equal(String(item.amount),'100');
  const docs=await searchPayrollEvidence(db,org,{currencyCode:'USD',search:number});assert.equal(docs.documents.length,2);
  await assert.rejects(db.$transaction(tx=>tx.payrollSnapshot.update({where:{id:snapshot.id},data:{isProvisional:true,revision:{increment:1},updatedByEmployeeId:actor.id}})),/PAYROLL_PAYABLE_SOURCE_CHANGED/,'direct unlock cannot leave active AP');
  await assert.rejects(db.payrollSnapshot.update({where:{id:snapshot.id},data:{data:[]}}),/PAYROLL_HISTORY_IMMUTABLE/);
  const opening=(await readAccountingOpening(db,org,actor.id,{balanceDate:'2026-11-01'})).documents.find(row=>row.id===item.id);assert.equal(opening.sourceType,'PAYROLL');
  await reconcileLedgerBalances(db,scope,{clientKey:randomUUID(),balanceDate:'2026-11-01',reason:'Already paid before management',accounts:[],openingRows:[{kind:'EXCLUDED',side:'AP',sourceType:'PAYROLL',sourceId:item.id,sourceVersion:item.snapshotRevision,expectedRemaining:'100'}]});
  await assert.rejects(unlock(),/PAYROLL_MANAGEMENT_EXCLUDED/);
  const excluded=await db.accountingOpeningItem.findFirst({where:{payrollItemId:item.id}});
  assert.equal((await searchPayrollEvidence(db,org,{currencyCode:'USD',search:number})).documents.length,1);
  await voidAccountingOpening(db,org,actor.id,excluded.id,'Resume tracking');
  await unlock();
  assert.equal(await db.payrollPayableItem.count({where:{voidedAt:null}}),0);
  assert.equal((await lock()).managementNumber,number,'relock retains the management number');
  assert.equal(await db.payrollPayableItem.count(),4,'older employee AP lines remain audited');
  item=await db.payrollPayableItem.findFirst({where:{employeeId:s.people.junior.id,voidedAt:null}});
  const batchKey=randomUUID(),row={entryKind:'BANK',clientKey:randomUUID(),accountId:s.account.id,transactionDate:'2026-11-10',direction:'OUT',amount:'40',remark:'October salary',accountingCodeId:s.code.id,evidenceType:'PAYROLL',payrollItemId:item.id,counterparty:{kind:'EMPLOYEE',id:item.employeeId}};
  const payload={schemaVersion:2,accountingCodeVersion:1,clientKey:batchKey,rows:[row]};
  const pending=await requestChangeApproval(db,org,actor.id,{menu:'BANK_LEDGER',operation:'CREATE',sourceKind:'batch',sourceId:batchKey,clientKey:randomUUID(),selection:{step1EmployeeId:s.people.junior.id,step2EmployeeId:s.people.lead.id},payload});
  assert.equal(await db.bankLedgerEntry.count(),0);await decideChangeApproval(db,org,s.people.junior.id,pending.id,{decision:'APPROVED'});assert.equal(await db.bankLedgerEntry.count(),0);
  await decideChangeApproval(db,org,s.people.lead.id,pending.id,{decision:'APPROVED'});
  const cash=await db.bankLedgerEntry.findFirst();assert.equal(await db.payrollPayableAllocation.count(),1);
  assert.equal((await searchPayrollEvidence(db,org,{currencyCode:'USD',search:number})).documents.find(d=>d.id===item.id).remaining,'60.00');
  assert.equal((await readLedgerEdit(db,org,cash.id)).document.remaining,'100.00','edit restores its own allocation only');
  await assert.rejects(unlock(),/PAYROLL_PAYMENT_LINKED/);
  await assert.rejects(db.$transaction(tx=>postLedgerEntryInTransaction(tx,org,actor.email,s.account.id,{...row,clientKey:randomUUID(),amount:'61'})),/LEDGER_EXCEEDS_DOCUMENT/);
  await assert.rejects(db.$transaction(tx=>postLedgerEntryInTransaction(tx,org,actor.email,s.account.id,{...row,clientKey:randomUUID(),counterparty:{kind:'EMPLOYEE',id:s.people.senior.id}})),/PAYROLL_PAYABLE_SOURCE_CHANGED/);
  const items=await db.payrollPayableItem.findMany({where:{voidedAt:null},include:{document:true,employee:{select:{name:true}},allocations:{include:{entry:true}}}});
  const report=outstandingReport([],[],[],[],items);assert.equal(report.payables.find(p=>p.partyId===item.employeeId).balance,'60.00');
  assert.deepEqual((await db.payrollSnapshot.findUnique({where:{id:snapshot.id}})).data,data);
  await assert.rejects(db.payrollPayableItem.delete({where:{id:item.id}}),/PAYROLL_HISTORY_IMMUTABLE/);
  const migration=require('../backend/scripts/migrate-entity-profiles').migrations().find(m=>m.version==='20261111060000_payroll_payables');await f.pg.exec(migration.sql);await f.pg.exec(migration.sql);
  assert.equal(await db.payrollPayableItem.count(),4,'migration retry preserves active and void history');
  const cancellation=await requestChangeApproval(db,org,s.people.junior.id,{menu:'BANK_LEDGER',operation:'DELETE',sourceKind:'ledger',sourceId:cash.id,payload:{},reason:'Wrong salary payout',clientKey:randomUUID()});
  for(const step of cancellation.policy.resolvedStages){await decideChangeApproval(db,org,step.employeeId,cancellation.id,{decision:'APPROVED'});}
  assert.ok((await db.bankLedgerEntry.findUnique({where:{id:cash.id}})).voidedAt);
  await unlock();assert.equal(await db.payrollPayableItem.count({where:{voidedAt:null}}),0);assert.equal(await db.payrollPayableAllocation.count(),1,'voiding payment preserves its allocation audit');
 }finally{await f.close();}
});

test('historical import is explicit, idempotent and company scoped; invalid sources roll back the whole import',async()=>{
 const f=await changeApprovalFixture();try{
  const db=f.db,s=await seedChangeApproval(db),org=s.company.id,actor=s.people.admin;
  await db.transactionCodeBase.update({where:{id:s.code.baseId},data:{code:'SAL'}});
  const factory=await db.factory.create({data:{orgId:org,name:'History'}});
  const original=await db.payrollSnapshot.create({data:{orgId:org,factoryId:factory.id,month:'2026-09',data:[{workerId:s.people.junior.id,currencyCode:'USD',netSalary:70}],isProvisional:false,lockedAt:new Date('2026-10-01'),lockedBy:'original',revision:8}});
  await assert.rejects(importLockedPayrollPayables(db,org,s.people.junior.id,{balanceDate:'2026-11-01'}),/PAYROLL_PAYABLE_ACCESS_DENIED/);
  await assert.rejects(importLockedPayrollPayables(db,s.other.id,actor.id,{balanceDate:'2026-11-01'}),/PAYROLL_PAYABLE_ACCESS_DENIED/);
  assert.equal((await importLockedPayrollPayables(db,org,actor.id,{balanceDate:'2026-11-01'})).importedCount,1);
  assert.equal((await importLockedPayrollPayables(db,org,actor.id,{balanceDate:'2026-11-01'})).importedCount,0);
  assert.deepEqual(await db.payrollSnapshot.findUnique({where:{id:original.id}}),original);
  await db.payrollSnapshot.create({data:{orgId:org,factoryId:factory.id,month:'2026-08',data:[{workerId:s.people.senior.id,currencyCode:'USD',netSalary:80}],isProvisional:false,lockedAt:new Date(),lockedBy:'original'}});
  await db.payrollSnapshot.create({data:{orgId:org,factoryId:factory.id,month:'2026-10',data:[{workerId:999999,currencyCode:'USD',netSalary:70}],isProvisional:false,lockedAt:new Date(),lockedBy:'original'}});
  await assert.rejects(importLockedPayrollPayables(db,org,actor.id,{balanceDate:'2026-11-01'}),/PAYROLL_PAYABLE_INVALID_SOURCE/);
  assert.equal(await db.payrollPayableDocument.count(),1);assert.equal(await db.bankLedgerEntry.count(),0);
 }finally{await f.close();}
});

test('locking rolls back when salary code is missing, and respects active employee and stored payroll access',async()=>{
 const f=await changeApprovalFixture();try{
  const db=f.db,s=await seedChangeApproval(db),org=s.company.id,actor=s.people.admin,factory=await db.factory.create({data:{orgId:org,name:'Lock rollback'}});
  const snapshot=await db.payrollSnapshot.create({data:{orgId:org,factoryId:factory.id,month:'2026-10',data:[{workerId:s.people.junior.id,currencyCode:'USD',netSalary:30}],isProvisional:true,lockedAt:new Date(),lockedBy:actor.email}});
  const services=payrollServices(db),lock=()=>services.lockPayrollSnapshot({orgId:org,month:'2026-10',factoryId:factory.id,lockedBy:actor.email,actorId:actor.id});
  await assert.rejects(services.lockPayrollSnapshot({orgId:org,month:'2026-10',factoryId:factory.id,lockedBy:'system',actorId:undefined}),/PAYROLL_PAYABLE_ACCESS_DENIED/);
  await assert.rejects(lock(),/PAYROLL_ACCOUNTING_CODE_REQUIRED/);assert.equal((await db.payrollSnapshot.findUnique({where:{id:snapshot.id}})).isProvisional,true);assert.equal(await db.payrollPayableDocument.count(),0);assert.equal(await db.systemSetting.count({where:{key:{startsWith:'DOCUMENT_NUMBER:'}}}),0);
  await db.systemSetting.create({data:{key:'ROLE_ACCESS_POLICY',value:{SERVICE:{ADMIN:['BANK_LEDGER']}}}});await assert.rejects(lock(),/PAYROLL_PAYABLE_ACCESS_DENIED/);
  await db.systemSetting.delete({where:{key:'ROLE_ACCESS_POLICY'}});await db.employee.update({where:{id:actor.id},data:{status:'TERMINATED'}});await assert.rejects(lock(),/PAYROLL_PAYABLE_ACCESS_DENIED/);
 }finally{await f.close();}
});
