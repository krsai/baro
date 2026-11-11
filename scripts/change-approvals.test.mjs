import test from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {createRequire} from 'node:module';
import {changeApprovalFixture,seedChangeApproval} from './helpers/change-approval-fixture.mjs';
const require=createRequire(import.meta.url);
const {postLedgerEntry,postLedgerSettlementBatch}=require('../backend/dist/services/bankLedger');
const {readLedgerEdit}=require('../backend/dist/services/bankLedgerEdit');
const {requestChangeApproval,decideChangeApproval,listChangeApprovals}=require('../backend/dist/services/changeApprovals');
const {approvalActionSettings,registerApprovalActionRoutes}=require('../backend/dist/services/approvalActions');
const {registerExpenseRequest}=require('../backend/dist/services/expenseRequest');
const {loadExpenseEditorSource,expenseEditorRevision}=require('../backend/dist/services/expenseRequestEditor');
const {approvalState}=require('../backend/dist/services/bankEvidence');

test('real Prisma and PostgreSQL guards: required parties, inherited policies, staged changes and approval-time payment protection',async t=>{
 const f=await changeApprovalFixture(),db=f.db;try{
  const s=await seedChangeApproval(db),org=s.company.id,actor=s.people.junior.id,approver=s.people.senior.id;
  const body=(extra={})=>({clientKey:randomUUID(),transactionDate:'2026-04-02',direction:'IN',amount:'100',purpose:'Receipt',evidenceType:'FILE',evidenceNumber:'R1',accountingCodeId:s.code.id,counterparty:{kind:'PARTNER',id:s.vendor.id},...extra});
  const post=extra=>postLedgerEntry(db,org,'junior@example.test',s.account.id,body(extra));
  let row;
  await t.test('party is mandatory, company-scoped and absent on balance adjustments',async()=>{
   await assert.rejects(post({counterparty:null}),/LEDGER_COUNTERPARTY_REQUIRED/);
   await assert.rejects(post({counterparty:{kind:'PARTNER',id:s.other.id}}),/LEDGER_COUNTERPARTY_INVALID/);
   await assert.rejects(post({counterparty:{kind:'ACCOUNT',id:s.own.id}}),/LEDGER_COUNTERPARTY_INVALID/);
   await assert.rejects(post({evidenceType:'ADJUSTMENT',evidenceNumber:''}),/LEDGER_COUNTERPARTY_INVALID/);
   const adjustment=await post({evidenceType:'ADJUSTMENT',evidenceNumber:'',counterparty:null});assert.equal(adjustment.counterpartyOrgId,null);
   row=await post({});assert.equal(row.counterpartyOrgId,s.vendor.id);assert.equal(row.counterpartyName,s.vendor.name);
   await assert.rejects(db.bankLedgerEntry.update({where:{id:row.id},data:{voidedAt:new Date(),voidedBy:'actor',voidReason:'Direct'}}),/CHANGE_APPROVAL_REQUIRED/);
  });
  await t.test('menus/actions inherit registration independently and reads do not create settings',async()=>{
   const count=await db.systemSetting.count();
   for(const menu of ['EXPENSE','BANK_LEDGER'])for(const operation of ['UPDATE','DELETE']){const value=await approvalActionSettings(db,org,menu,operation);assert.equal(value.inherited,true);assert.deepEqual(value.value.limits,s.config.limits);}
   assert.equal(await db.systemSetting.count(),count);
   const routes=new Map();registerApprovalActionRoutes({get:(p,fn)=>routes.set('GET '+p,fn),put:(p,fn)=>routes.set('PUT '+p,fn)},db,{requireOrgRole:async()=>({organization:s.company}),actorId:()=>s.people.admin.id});
   const request={query:{menu:'BANK_LEDGER',operation:'UPDATE'},body:{...s.config,kind:'EXPENSE',revision:0,rules:[],drafterScope:{role:'ALL',gradeId:null}}};
   await routes.get('PUT /approval-action-settings')(request,{json:()=>{}});
   assert.equal((await approvalActionSettings(db,org,'BANK_LEDGER','UPDATE')).value.revision,1);
   assert.equal((await approvalActionSettings(db,org,'BANK_LEDGER','DELETE')).inherited,true);
   await assert.rejects(routes.get('PUT /approval-action-settings')(request,{json:()=>{}}),/APPROVAL_SETTINGS_CHANGED/);
  });
  await t.test('deletion only applies on the designated approval; retries retain one request and source',async()=>{
   const input={menu:'BANK_LEDGER',operation:'DELETE',sourceKind:'ledger',sourceId:row.id,payload:{},reason:'Duplicate receipt',clientKey:randomUUID()};
   const request=await requestChangeApproval(db,org,actor,input);assert.equal((await requestChangeApproval(db,org,actor,input)).id,request.id);
   assert.equal((await listChangeApprovals(db,org,actor)).some(item=>item.id===request.id),true);assert.equal((await listChangeApprovals(db,org,approver)).some(item=>item.id===request.id),true);assert.deepEqual(await listChangeApprovals(db,org,s.people.admin.id),[]);
   assert.equal((await db.bankLedgerEntry.findUnique({where:{id:row.id}})).voidedAt,null);
   await assert.rejects(requestChangeApproval(db,org,actor,{...input,clientKey:randomUUID()}),/CHANGE_ALREADY_PENDING/);
   await assert.rejects(decideChangeApproval(db,org,actor,request.id,{decision:'APPROVED'}),/CHANGE_APPROVER_REQUIRED/);
   await assert.rejects(decideChangeApproval(db,org,s.people.admin.id,request.id,{decision:'APPROVED'}),/CHANGE_APPROVER_REQUIRED/);
   const done=await decideChangeApproval(db,org,approver,request.id,{decision:'APPROVED'});assert.equal(done.status,'APPROVED');
   assert.equal((await decideChangeApproval(db,org,approver,request.id,{decision:'APPROVED'})).id,request.id);
   assert.equal((await db.bankLedgerEntry.findUnique({where:{id:row.id}})).voidReason,'Duplicate receipt');
  });
  await t.test('editing keeps the original live until approval, then replaces it atomically',async()=>{
   const entry=await post({}),loaded=await readLedgerEdit(db,org,entry.id),newBody=body({amount:'150',remark:'Corrected receipt'});
   const payload={schemaVersion:2,accountingCodeVersion:1,clientKey:randomUUID(),rows:[{...newBody,entryKind:'BANK',accountId:s.account.id}]};
   const request=await requestChangeApproval(db,org,actor,{menu:'BANK_LEDGER',operation:'UPDATE',sourceKind:'ledger',sourceId:entry.id,revision:loaded.revision,payload,clientKey:randomUUID()});
   assert.equal((await db.bankLedgerEntry.findUnique({where:{id:entry.id}})).voidedAt,null);
   const done=await decideChangeApproval(db,org,approver,request.id,{decision:'APPROVED'}),replacement=await db.bankLedgerEntry.findUnique({where:{id:done.result.entryIds[0]}});
   assert.equal(replacement.revisesEntryId,entry.id);assert.equal(replacement.amount.toString(),'150');assert.equal(replacement.counterpartyOrgId,s.vendor.id);
  });
  await t.test('rejection preserves the original and approval rechecks active company membership',async()=>{
   const entry=await post({}),input={menu:'BANK_LEDGER',operation:'DELETE',sourceKind:'ledger',sourceId:entry.id,payload:{},reason:'Wrong receipt',clientKey:randomUUID()};
   const request=await requestChangeApproval(db,org,actor,input);
   await assert.rejects(decideChangeApproval(db,s.other.id,approver,request.id,{decision:'APPROVED'}),/CHANGE_NOT_FOUND/);
   await db.employee.update({where:{id:approver},data:{status:'SUSPENDED'}});
   await assert.rejects(decideChangeApproval(db,org,approver,request.id,{decision:'APPROVED'}),/CHANGE_APPROVER_REQUIRED/);
   await db.employee.update({where:{id:approver},data:{status:'ACTIVE'}});
   await assert.rejects(decideChangeApproval(db,org,approver,request.id,{decision:'REJECTED',reason:''}),/CHANGE_REASON_REQUIRED/);
   await decideChangeApproval(db,org,approver,request.id,{decision:'REJECTED',reason:'Keep original'});
   assert.equal((await db.bankLedgerEntry.findUnique({where:{id:entry.id}})).voidedAt,null);
   await assert.rejects(db.changeApprovalRequest.update({where:{id:request.id},data:{reason:'Rewritten history'}}),/CHANGE_HISTORY_IMMUTABLE/);
  });
  await t.test('expense edit approval applies a new audited version; linked payments block deletion at final approval',async()=>{
   const item={transactionCodeId:s.code.id,currency:'USD',quantity:'1',unitPrice:'100',vatRate:'0',details:{evidenceFile:'fixture-evidence.pdf',reference:'EXP-1'}};
   const document=await db.$transaction(tx=>registerExpenseRequest(tx,org,actor,{partnerOrgId:s.vendor.id,requestDate:'2026-04-02',clientKey:randomUUID(),items:[item]}),{timeout:30000});
   const source=await loadExpenseEditorSource(db,org,'request',String(document.id));
   const payload={partnerOrgId:s.vendor.id,requestDate:document.requestDate,revision:expenseEditorRevision(source),version:document.version,clientKey:randomUUID(),items:[{...item,itemId:document.items[0].id,unitPrice:'120'}]};
   const editor=(await db.employee.create({data:{orgId:org,name:'Another editor',orgRole:'ADMIN',gradeId:s.people.admin.gradeId,status:'ACTIVE'}})).id,editApprover=s.people.admin.id;
   const change=await requestChangeApproval(db,org,editor,{menu:'EXPENSE',operation:'UPDATE',sourceKind:'request',sourceId:String(document.id),payload,selection:{changeAdminEmployeeId:editApprover},clientKey:randomUUID()});
   assert.equal((await db.expenseRequest.findUnique({where:{id:document.id}})).version,document.version);
   await decideChangeApproval(db,org,editApprover,change.id,{decision:'APPROVED'});
   const edited=await db.expenseRequest.findUnique({where:{id:document.id},include:{items:true}});assert.equal(edited.version,document.version+1);assert.equal(edited.items[0].id,document.items[0].id);assert.equal(edited.items[0].amount.toString(),'120');assert.equal((await approvalState(db,org,edited.id)).approved,true);
   assert.equal(edited.createdByEmployeeId,actor);assert.equal(edited.updatedByEmployeeId,editor);
   const audit=await db.expenseRequestAudit.findFirst({where:{orgId:org,requestId:document.id,version:edited.version}});
   assert.equal(audit.actorId,editor);assert.equal(audit.beforeSnapshot.document.createdByEmployeeId,actor);assert.equal(audit.afterSnapshot.document.createdByEmployeeId,actor);
   assert.equal(audit.afterSnapshot.approvalPolicy.drafterId,actor);assert.equal(audit.afterSnapshot.approvalPolicy.changeRequestId,change.id);
   assert.equal(audit.beforeSnapshot.costs[0].amount,'100');assert.equal(audit.afterSnapshot.costs[0].amount,'120');
   const removal=await requestChangeApproval(db,org,actor,{menu:'EXPENSE',operation:'DELETE',sourceKind:'request',sourceId:String(document.id),version:edited.version,payload:{},reason:'Wrong expense',clientKey:randomUUID()});
   const wrongPayee=await db.organization.create({data:{name:'Other payee',type:'LOGISTICS_PROVIDER',ownerOrgId:org}});
   const expenseBody=body({direction:'OUT',amount:'120',counterparty:{kind:'PARTNER',id:wrongPayee.id},evidenceType:'EXPENSE',evidenceNumber:'',expenseRequestId:edited.id,expenseVersion:edited.version,expenseItems:[{itemId:edited.items[0].id,amount:'120'}]});
   const count=await db.bankLedgerEntry.count(),allocations=await db.bankLedgerEvidenceAllocation.count();
   for(const counterparty of [{kind:'PARTNER',id:wrongPayee.id},{kind:'EMPLOYEE',id:actor},{kind:'ACCOUNT',id:s.payee.id}])await assert.rejects(postLedgerEntry(db,org,'junior@example.test',s.account.id,{...expenseBody,clientKey:randomUUID(),counterparty}),/LEDGER_COUNTERPARTY_MISMATCH/);
   await assert.rejects(postLedgerSettlementBatch(db,org,'junior@example.test',{accountingCodeVersion:1,clientKey:randomUUID(),rows:[{...body(),entryKind:'BANK',accountId:s.account.id},{...expenseBody,entryKind:'BANK',accountId:s.account.id}]}),/LEDGER_ROW:2:LEDGER_COUNTERPARTY_MISMATCH/);
   assert.equal(await db.bankLedgerEntry.count(),count,'failed mixed batch rolls back its valid first row');assert.equal(await db.bankLedgerEvidenceAllocation.count(),allocations);
   const payment=await postLedgerEntry(db,org,'junior@example.test',s.account.id,body({direction:'OUT',amount:'120',counterparty:null,evidenceType:'EXPENSE',evidenceNumber:'',expenseRequestId:edited.id,expenseVersion:edited.version,expenseItems:[{itemId:edited.items[0].id,amount:'120'}]}));assert.equal(payment.counterpartyOrgId,s.vendor.id);
   await assert.rejects(postLedgerEntry(db,org,'junior@example.test',s.account.id,{...expenseBody,clientKey:payment.clientKey}),/LEDGER_COUNTERPARTY_MISMATCH/);
   await assert.rejects(decideChangeApproval(db,org,approver,removal.id,{decision:'APPROVED'}),/EXPENSE_ALREADY_RECONCILED/);
   assert.equal(await db.changeApprovalDecision.count({where:{requestId:removal.id}}),0);
   const voidPayment=await requestChangeApproval(db,org,actor,{menu:'BANK_LEDGER',operation:'DELETE',sourceKind:'ledger',sourceId:payment.id,payload:{},reason:'Wrong payment',clientKey:randomUUID()});await decideChangeApproval(db,org,approver,voidPayment.id,{decision:'APPROVED'});
   await decideChangeApproval(db,org,approver,removal.id,{decision:'APPROVED'});
   const deleted=await db.expenseRequest.findUnique({where:{id:document.id}});assert.ok(deleted.deletedAt);assert.equal(deleted.deletedChangeRequestId,removal.id);assert.equal(await db.partnerTransactionCost.count({where:{expenseRequestId:document.id}}),1);
  });
 }finally{await f.close();}
});
