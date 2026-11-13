import test from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {createRequire} from 'node:module';
import {changeApprovalFixture,seedChangeApproval} from './helpers/change-approval-fixture.mjs';
import {ledgerFlowEndpoints,selectLedgerEndpoint,ledgerTransferRate,ledgerTransferCurrency} from '../frontend/src/utils/ledgerFlow.mjs';
import {ledgerEntryTotals} from '../frontend/src/utils/ledgerEntryTotals.mjs';
const require=createRequire(import.meta.url);
const {requestChangeApproval,decideChangeApproval}=require('../backend/dist/services/changeApprovals');
const {readLedgerAccounts,postLedgerEntry,postLedgerSettlementBatch,listLedgerActivity}=require('../backend/dist/services/bankLedger');
const {readLedgerEdit}=require('../backend/dist/services/bankLedgerEdit');
const {ledgerCounterpartyOptions}=require('../backend/dist/services/ledgerCounterparty');
const {saveClassification}=require('../backend/dist/services/partnerClassification');
async function ownAccount(db,s,extra={}){
 return db.organizationBankAccount.create({data:{orgId:s.company.id,entityId:s.company.id,currencyId:s.currency.id,bankName:'Bank B',accountNumber:randomUUID(),accountHolder:'Company',displayName:'Account B',createdByEmployeeId:s.people.admin.id,updatedByEmployeeId:s.people.admin.id,...extra}});
}
function transfer(s,target,extra={}){return {entryKind:'BANK',clientKey:randomUUID(),accountId:s.account.id,transactionDate:'2026-11-10',direction:'OUT',amount:'40.25',remark:'Internal funds',accountingCodeId:s.code.id,evidenceType:'FILE',evidenceNumber:'',counterparty:{kind:'ACCOUNT',id:target.id},...extra};}
function input(rows,extra={}){const clientKey=randomUUID();return {menu:'BANK_LEDGER',operation:'CREATE',sourceKind:'batch',sourceId:clientKey,clientKey:randomUUID(),selection:{},payload:{schemaVersion:2,accountingCodeVersion:1,clientKey,rows},...extra};}
async function approvedCreate(db,s,rows){
 const value=input(rows,{selection:{step1EmployeeId:s.people.junior.id,step2EmployeeId:s.people.lead.id}});
 const request=await requestChangeApproval(db,s.company.id,s.people.admin.id,value);
 await decideChangeApproval(db,s.company.id,s.people.junior.id,request.id,{decision:'APPROVED'});
 const done=await decideChangeApproval(db,s.company.id,s.people.lead.id,request.id,{decision:'APPROVED'});
 return {request,done,value};
}

test('FX and a separate VND fee share approval and post three cash legs exactly once',async()=>{
 const f=await changeApprovalFixture({registration:true});try{
  const db=f.db,s=await seedChangeApproval(db),org=s.company.id;
  const vnd=await db.currency.upsert({where:{code:'VND'},create:{code:'VND',name:'Dong'},update:{}}),b=await ownAccount(db,s,{currencyId:vnd.id});
  const fx=transfer(s,b,{amount:'40',transferAmount:'1000000'});
  const fee=transfer(s,b,{accountId:'entity:'+b.id,amount:'1000',counterparty:{kind:'PARTNER',id:s.vendor.id},evidenceNumber:'Bank fee receipt'});
  const {request,done,value}=await approvedCreate(db,s,[fx,fee]);
  assert.deepEqual(Object.fromEntries(request.policy.totals.map(t=>[t.currency,t.amount])),{USD:'40',VND:'1001000'});
  assert.equal(done.result.entryIds.length,2);assert.equal(await db.bankLedgerEntry.count(),3);assert.equal(await db.bankLedgerSettlementLine.count(),0);
  const balances=await readLedgerAccounts(db,org);assert.equal(balances.find(a=>a.id===s.account.id).currentBalance,'-40.00');assert.equal(balances.find(a=>a.entityAccountId===b.id).currentBalance,'999000');
  await requestChangeApproval(db,org,s.people.admin.id,value);assert.equal(await db.bankLedgerEntry.count(),3);
  const bad=input([fx,{...fee,accountId:'missing'}]);await assert.rejects(requestChangeApproval(db,org,s.people.admin.id,bad),/LEDGER_ACCOUNT_NOT_FOUND/);assert.equal(await db.bankLedgerEntry.count(),3);
 }finally{await f.close();}
});
test('From/To identifies an external party or our account and derives direction without external bank details',()=>{
 const account={id:'a',entityAccountId:'own-a',displayName:'A',currencyCode:'USD'},customer={kind:'PARTNER',id:14,name:'Customer'};
 const row={direction:'IN',evidenceType:'FILE',counterparty:customer};
 assert.equal(ledgerFlowEndpoints(row,account).from,customer);assert.equal(ledgerFlowEndpoints(row,account).to.id,'own-a');
 const out=selectLedgerEndpoint(row,account,'to',customer);assert.equal(out.direction,'OUT');assert.equal(out.counterparty,customer);
 assert.equal(selectLedgerEndpoint(row,account,'from',{kind:'ACCOUNT',id:'own-a'}).direction,'OUT');
 const historical={...row,counterparty:{kind:'ACCOUNT',id:'other',currencyCode:'VND'},transferCurrencyCode:'VND',transferAmount:'1000000'};
 assert.equal(ledgerTransferCurrency(historical,[account],[{kind:'ACCOUNT',id:'other',currencyCode:'USD'}]),'VND');
 assert.equal(selectLedgerEndpoint(historical,account,'to',{kind:'ACCOUNT',id:'other',currencyCode:'USD'}).transferAmount,'');
 assert.deepEqual(ledgerFlowEndpoints({...row,evidenceType:'ADJUSTMENT'},account),{from:null,to:null});
 assert.deepEqual(ledgerEntryTotals([{entryKind:'BANK',accountId:'a',direction:'OUT',amount:'40.25',counterparty:{kind:'ACCOUNT',id:'b'}}],[account]),[{currency:'USD',incoming:'40.25',outgoing:'40.25',net:'0.00'}]);
});
test('one approved line atomically posts both accounts, retries once, edits either side and cancels both',async()=>{
 const f=await changeApprovalFixture({registration:true});try{
  const db=f.db,s=await seedChangeApproval(db),org=s.company.id,b=await ownAccount(db,s),row=transfer(s,b);
  const base=await db.transactionCodeBase.findUnique({where:{id:s.code.baseId},include:{serviceType:true}});
  await db.$transaction(tx=>saveClassification(tx,org,s.vendor.id,s.people.admin.id,{revision:0,roleIds:[base.serviceType.partnerRoleId],industryIds:[base.serviceTypeId]}));
  const partyOptions=await ledgerCounterpartyOptions(db,org);
  assert.ok(partyOptions.some(p=>p.kind==='ACCOUNT'&&p.id===b.id));
  const partner=partyOptions.find(p=>p.kind==='PARTNER'&&p.id===s.vendor.id);assert.deepEqual(partner.classification.industryIds,[base.serviceTypeId]);assert.equal(partner.classification.industries[0].partnerRole.id,base.serviceType.partnerRoleId);
  await assert.rejects(postLedgerEntry(db,org,s.people.admin.email,s.account.id,row),/CHANGE_APPROVAL_REQUIRED/);
  const value=input([row],{selection:{step1EmployeeId:s.people.junior.id,step2EmployeeId:s.people.lead.id}});
  const request=await requestChangeApproval(db,org,s.people.admin.id,value);assert.equal(await db.bankLedgerEntry.count(),0);
  await decideChangeApproval(db,org,s.people.junior.id,request.id,{decision:'APPROVED'});assert.equal(await db.bankLedgerEntry.count(),0);
  const done=await decideChangeApproval(db,org,s.people.lead.id,request.id,{decision:'APPROVED'});
  assert.equal(done.result.entryIds.length,1,'batch receipt describes the single submitted line, not both generated legs');
  const root=await db.bankLedgerEntry.findUnique({where:{id:done.result.entryIds[0]}}),mirror=await db.bankLedgerEntry.findFirst({where:{internalTransferSourceId:root.id}});
  assert.equal(root.direction,'OUT');assert.equal(mirror.direction,'IN');assert.equal(root.amount.toString(),mirror.amount.toString());assert.equal(mirror.counterpartyAccountId,s.own.id);
  const balances=await readLedgerAccounts(db,org);assert.equal(balances.find(a=>a.id===s.account.id).currentBalance,'-40.25');assert.equal(balances.find(a=>a.entityAccountId===b.id).currentBalance,'40.25');
  await requestChangeApproval(db,org,s.people.admin.id,value);await decideChangeApproval(db,org,s.people.lead.id,request.id,{decision:'APPROVED'});assert.equal(await db.bankLedgerEntry.count(),2);
  const editSource=await readLedgerEdit(db,org,mirror.id);assert.equal(editSource.counterparty.id,s.own.id);
  const correction=input([transfer(s,s.own,{accountId:mirror.accountId,direction:'IN',amount:'55.10',remark:'Corrected'})],{operation:'UPDATE',sourceKind:'ledger',sourceId:mirror.id,revision:editSource.revision});
  const edit=await requestChangeApproval(db,org,s.people.junior.id,correction);
  await assert.rejects(requestChangeApproval(db,org,s.people.junior.id,input([],{operation:'DELETE',sourceKind:'ledger',sourceId:root.id,reason:'Opposite side pending'})),/CHANGE_ALREADY_PENDING/);
  const activity=await listLedgerActivity(db,org,{start:'2026-11-10',end:'2026-11-10'});assert.ok(activity.rows.filter(r=>[root.id,mirror.id].includes(r.id)).every(r=>r.changePending));
  const edited=await decideChangeApproval(db,org,s.people.senior.id,edit.id,{decision:'APPROVED'});
  const changed=await db.bankLedgerEntry.findUnique({where:{id:edited.result.entryIds[0]}}),changedMirror=await db.bankLedgerEntry.findFirst({where:{internalTransferSourceId:changed.id}});
  assert.equal(changed.amount.toString(),'55.1');assert.equal(changed.revisesEntryId,mirror.id);assert.equal(changedMirror.revisesEntryId,root.id);assert.equal(await db.bankLedgerEntry.count({where:{voidedAt:null}}),2);
  const old=await db.bankLedgerEntry.findMany({where:{id:{in:[root.id,mirror.id]}}});assert.equal(old[0].voidedAt.getTime(),old[1].voidedAt.getTime());
  await assert.rejects(requestChangeApproval(db,org,s.people.junior.id,input([],{operation:'DELETE',sourceKind:'ledger',sourceId:root.id,reason:'Stale'})),/LEDGER_ENTRY_CHANGED/);
  const deletion=await requestChangeApproval(db,org,s.people.junior.id,input([],{operation:'DELETE',sourceKind:'ledger',sourceId:changedMirror.id,reason:'Transfer cancelled'}));
  await decideChangeApproval(db,org,s.people.senior.id,deletion.id,{decision:'APPROVED'});assert.equal(await db.bankLedgerEntry.count({where:{voidedAt:null}}),0);
  assert.ok((await readLedgerAccounts(db,org)).every(a=>a.currentBalance==='0.00'));
 }finally{await f.close();}
});
test('self, foreign, inactive accounts and incomplete or mismatched transfer amounts are rejected',async()=>{
 const f=await changeApprovalFixture({registration:true});try{
  const db=f.db,s=await seedChangeApproval(db),org=s.company.id,b=await ownAccount(db,s);
  const vnd=await db.currency.upsert({where:{code:'VND'},create:{code:'VND',name:'Dong'},update:{}}),v=await ownAccount(db,s,{currencyId:vnd.id});
  const bad=[s.own,s.payee,await ownAccount(db,s,{isActive:false})];
  for(const target of bad)await assert.rejects(requestChangeApproval(db,org,s.people.admin.id,input([transfer(s,target)])),/LEDGER_COUNTERPARTY_INVALID/);
  await assert.rejects(requestChangeApproval(db,org,s.people.admin.id,input([transfer(s,v)])),/LEDGER_INVALID_AMOUNT/);
  await assert.rejects(requestChangeApproval(db,org,s.people.admin.id,input([transfer(s,b,{transferAmount:'40'})])),/LEDGER_TRANSFER_AMOUNT_MISMATCH/);
  assert.equal(await db.bankLedgerEntry.count(),0);
  const ordinary=transfer(s,b,{counterparty:{kind:'PARTNER',id:s.vendor.id},direction:'IN',evidenceNumber:'Receipt'});
  await approvedCreate(db,s,[ordinary]);assert.equal(await db.bankLedgerEntry.count(),1,'external receipt remains a single entry');
  // Deactivate the receiving account after approval begins: final approval must roll back the source leg too.
  const value=input([transfer(s,b)],{selection:{step1EmployeeId:s.people.junior.id,step2EmployeeId:s.people.lead.id}}),pending=await requestChangeApproval(db,org,s.people.admin.id,value);
  await decideChangeApproval(db,org,s.people.junior.id,pending.id,{decision:'APPROVED'});
  await db.organizationBankAccount.update({where:{id:b.id},data:{isActive:false}});
  await assert.rejects(decideChangeApproval(db,org,s.people.lead.id,pending.id,{decision:'APPROVED'}),/LEDGER_COUNTERPARTY_INVALID/);
  assert.equal(await db.bankLedgerEntry.count(),1);assert.equal((await db.changeApprovalRequest.findUnique({where:{id:pending.id}})).status,'PENDING');
 }finally{await f.close();}
});
test('FXC records two actual currencies, preserves effective rate and approvals, and never invents an exchange gain',async()=>{
 const f=await changeApprovalFixture({registration:true});try{
  const db=f.db,s=await seedChangeApproval(db),org=s.company.id,vnd=await db.currency.upsert({where:{code:'VND'},create:{code:'VND',name:'Dong'},update:{}}),b=await ownAccount(db,s,{currencyId:vnd.id});
  // The selected accounting code classifies the exchange; account FKs determine its cash movements.
  const codeBase=await db.transactionCode.findUnique({where:{id:s.code.id}});await db.transactionCodeBase.update({where:{id:codeBase.baseId},data:{code:'FXC',nameEn:'Currency exchange'}});
  const row=transfer(s,b,{amount:'40',transferAmount:'1000000',remark:'Currency exchange'}),{done,request}=await approvedCreate(db,s,[row]);
  assert.deepEqual(new Set(request.policy.totals.map(t=>t.currency)),new Set(['USD','VND']));
  const root=await db.bankLedgerEntry.findUnique({where:{id:done.result.entryIds[0]}}),mirror=await db.bankLedgerEntry.findFirst({where:{internalTransferSourceId:root.id},include:{account:true}});
  assert.equal(root.amount.toString(),'40');assert.equal(root.internalTransferAmount.toString(),'1000000');assert.equal(mirror.amount.toString(),'1000000');assert.equal(mirror.account.currencyCode,'VND');assert.equal(mirror.internalTransferAmount.toString(),'40');assert.equal(await db.bankLedgerEntry.count(),2);assert.equal(await db.bankLedgerSettlementLine.count(),0);
  const edit=await readLedgerEdit(db,org,mirror.id);assert.equal(edit.transferAmount,'40.00');assert.equal(edit.transferCurrencyCode,'USD');
  assert.equal(ledgerTransferRate(row,'USD','VND'),'1 USD ≈ 25000 VND');
  assert.deepEqual(ledgerEntryTotals([{...row,counterparty:{...row.counterparty,currencyCode:'VND'}}],[s.account]),[{currency:'USD',incoming:'0.00',outgoing:'40.00',net:'-40.00'},{currency:'VND',incoming:'1000000.00',outgoing:'0.00',net:'1000000.00'}]);
  const update=await requestChangeApproval(db,org,s.people.junior.id,input([transfer(s,s.own,{accountId:mirror.accountId,direction:'IN',amount:'1100000',transferAmount:'44'})],{operation:'UPDATE',sourceKind:'ledger',sourceId:mirror.id,revision:edit.revision}));
  let updated;for(const stage of update.policy.resolvedStages)updated=await decideChangeApproval(db,org,stage.employeeId,update.id,{decision:'APPROVED'});
  const active=await db.bankLedgerEntry.findMany({where:{voidedAt:null}});assert.equal(active.length,2);assert.deepEqual(new Set(active.map(e=>e.amount.toString())),new Set(['1100000','44']));
  const deletion=await requestChangeApproval(db,org,s.people.junior.id,input([],{operation:'DELETE',sourceKind:'ledger',sourceId:updated.result.entryIds[0],reason:'Cancel exchange'}));for(const stage of deletion.policy.resolvedStages)await decideChangeApproval(db,org,stage.employeeId,deletion.id,{decision:'APPROVED'});
  assert.equal(await db.bankLedgerEntry.count({where:{voidedAt:null}}),0);assert.ok((await readLedgerAccounts(db,org)).every(a=>Number(a.currentBalance)===0));
  const fresh=await ownAccount(db,s,{currencyId:vnd.id});
  const pending=await requestChangeApproval(db,org,s.people.admin.id,input([transfer(s,fresh,{amount:'40',transferAmount:'40'})],{selection:{step1EmployeeId:s.people.junior.id,step2EmployeeId:s.people.lead.id}}));
  await db.organizationBankAccount.update({where:{id:fresh.id},data:{currencyId:s.currency.id}});
  await assert.rejects(decideChangeApproval(db,org,s.people.junior.id,pending.id,{decision:'APPROVED'}),/CHANGE_SOURCE_CHANGED/);
  await assert.rejects(requestChangeApproval(db,org,s.people.admin.id,input([transfer(s,b,{amount:'40',transferAmount:'1.5'})])),/LEDGER_INVALID_AMOUNT/);
  await assert.rejects(requestChangeApproval(db,org,s.people.admin.id,input([transfer(s,b,{amount:'40',transferAmount:'1000000',transferCurrencyCode:'USD'})])),/LEDGER_TRANSFER_CURRENCY_CHANGED/);
 }finally{await f.close();}
});
test('migration preserves historical unpaired entries and SQL rejects new orphan transfers or relinking history',async()=>{
 let seeded,legacy;
 const f=await changeApprovalFixture({beforeMigration:async(f,migration)=>{
  if(migration.version!=='20261110030000_internal_ledger_transfers')return;
  const db=f.db,s=seeded=await seedChangeApproval(db),b=await ownAccount(db,s);seeded.b=b;
  legacy=await db.bankLedgerEntry.create({data:{orgId:s.company.id,accountId:s.account.id,clientKey:randomUUID(),transactionDate:'2026-11-09',direction:'OUT',amount:'12.34',purpose:'Historical record',accountingCodeId:s.code.id,evidenceType:'FILE',evidenceNumber:'Legacy transfer',counterpartyAccountId:b.id,counterpartyName:'Account B',createdBy:s.people.admin.email}});
 }});try{
  const db=f.db,s=seeded,org=s.company.id;
  assert.equal(await db.bankLedgerEntry.count(),1);assert.equal((await db.bankLedgerEntry.findUnique({where:{id:legacy.id}})).amount.toString(),'12.34');assert.equal(await db.bankLedgerEntry.count({where:{internalTransferSourceId:legacy.id}}),0);
  const orphan={orgId:org,accountId:s.account.id,clientKey:randomUUID(),transactionDate:'2026-11-10',direction:'OUT',amount:'10',purpose:'Orphan',accountingCodeId:s.code.id,evidenceType:'FILE',evidenceNumber:'Orphan',counterpartyAccountId:s.b.id,counterpartyName:'B',createdBy:s.people.admin.email};
  await assert.rejects(db.$transaction(tx=>tx.bankLedgerEntry.create({data:orphan})),/LEDGER_TRANSFER_PAIR_INVALID/);assert.equal(await db.bankLedgerEntry.count(),1);
  const batch={clientKey:randomUUID(),schemaVersion:2,accountingCodeVersion:1,rows:[transfer(s,s.b)]};
  const saved=await postLedgerSettlementBatch(db,org,s.people.admin.email,batch),root=await db.bankLedgerEntry.findUnique({where:{id:saved.entryIds[0]}}),mirror=await db.bankLedgerEntry.findFirst({where:{internalTransferSourceId:root.id}});
  assert.equal(await db.bankLedgerEntry.count(),3);
  assert.deepEqual(await postLedgerSettlementBatch(db,org,s.people.admin.email,batch),saved);assert.equal(await db.bankLedgerEntry.count(),3);
  await assert.rejects(postLedgerSettlementBatch(db,org,s.people.admin.email,{...batch,rows:[{...batch.rows[0],counterparty:{kind:'ACCOUNT',id:s.own.id}}]}),/LEDGER_RETRY_CONFLICT/);
  await assert.rejects(db.bankLedgerEntry.update({where:{id:mirror.id},data:{internalTransferSourceId:legacy.id}}),/LEDGER_(TRANSFER|ENTRY)_IMMUTABLE/);
  await assert.rejects(db.bankLedgerEntry.delete({where:{id:mirror.id}}));
  await assert.rejects(db.bankLedgerEntry.update({where:{id:mirror.id},data:{amount:'11'}}));
 }finally{await f.close();}
});
