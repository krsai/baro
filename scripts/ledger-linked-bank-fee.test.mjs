import test from 'node:test';import assert from 'node:assert/strict';import {createRequire} from 'node:module';import {randomUUID} from 'node:crypto';import {readFileSync} from 'node:fs';
import {changeApprovalFixture,seedChangeApproval} from './helpers/change-approval-fixture.mjs';
const require=createRequire(import.meta.url),{postLedgerSettlementBatch,readLedgerAccounts}=require('../backend/dist/services/bankLedger'),{readLedgerEdit,voidLedgerPairApproved}=require('../backend/dist/services/bankLedgerEdit');
const {requestChangeApproval,decideChangeApproval}=require('../backend/dist/services/changeApprovals');

test('BNFE fees retain scoped parent FKs, cash amounts, approvals, edit grouping and atomic deletion',async()=>{
 const f=await changeApprovalFixture({registration:true});try{
  const db=f.db,s=await seedChangeApproval(db),org=s.company.id;
  await db.transactionCodeBase.update({where:{id:s.code.baseId},data:{code:'BNF'}});
  const main={entryKind:'BANK',clientKey:randomUUID(),accountId:s.account.id,transactionDate:'2026-11-10',direction:'OUT',amount:'100',remark:'Original bank payment',accountingCodeId:s.code.id,evidenceType:'FILE',evidenceNumber:'proof.pdf',counterparty:{kind:'PARTNER',id:s.vendor.id},expenseItems:[]};
  const fee={entryKind:'BANK',clientKey:randomUUID(),feeForClientKey:main.clientKey,accountId:s.account.id,transactionDate:main.transactionDate,direction:'OUT',amount:'2',remark:'Original bank payment',evidenceType:'BANK_FEE',evidenceNumber:'',expenseItems:[]};
  const payload={schemaVersion:2,accountingCodeVersion:1,clientKey:randomUUID(),rows:[main,fee]};
  const request=await requestChangeApproval(db,org,s.people.admin.id,{menu:'BANK_LEDGER',operation:'CREATE',sourceKind:'batch',sourceId:payload.clientKey,clientKey:randomUUID(),selection:{step1EmployeeId:s.people.junior.id,step2EmployeeId:s.people.lead.id},payload});
  assert.equal(await db.bankLedgerEntry.count(),0);
  let approved;for(const stage of request.policy.resolvedStages)approved=await decideChangeApproval(db,org,stage.employeeId,request.id,{decision:'APPROVED'});
  const [parentId,feeId]=approved.result.entryIds;
  const savedFee=await db.bankLedgerEntry.findUnique({where:{id:feeId}});assert.equal(savedFee.accountingCodeId,s.code.id);assert.equal(String(savedFee.amount),'2');
  const link=await db.bankLedgerFeeLink.findUnique({where:{feeEntryId:feeId}});assert.equal(link.parentEntryId,parentId);assert.equal(link.orgId,org);
  const source=await readLedgerEdit(db,org,parentId),fromFee=await readLedgerEdit(db,org,feeId);assert.equal(fromFee.id,parentId);assert.equal(source.bankFees.length,1);assert.equal(source.bankFees[0].amount,'2');
  assert.equal((await readLedgerAccounts(db,org)).find(row=>row.id===s.account.id).currentBalance,'-102.00');
  const retry=await postLedgerSettlementBatch(db,org,s.people.admin.email,payload);assert.deepEqual(retry.entryIds,approved.result.entryIds);assert.equal(await db.bankLedgerEntry.count(),2);
  await assert.rejects(db.bankLedgerFeeLink.update({where:{feeEntryId:feeId},data:{parentEntryId:feeId}}),/immutable/);
  await assert.rejects(db.bankLedgerEntry.update({where:{id:parentId},data:{voidedAt:new Date(),voidedBy:'actor',voidReason:'Unpaired deletion'}}));
  const nextMain={...main,clientKey:randomUUID()},nextFee={...fee,clientKey:randomUUID(),amount:'3',feeForClientKey:nextMain.clientKey};
  const next={...payload,clientKey:randomUUID(),rows:[nextMain,nextFee]};
  const update=await requestChangeApproval(db,org,s.people.junior.id,{menu:'BANK_LEDGER',operation:'UPDATE',sourceKind:'ledger',sourceId:parentId,revision:source.revision,clientKey:randomUUID(),selection:{seniorEmployeeId:s.people.senior.id,leadEmployeeId:s.people.lead.id},payload:next});
  let changed;for(const stage of update.policy.resolvedStages)changed=await decideChangeApproval(db,org,stage.employeeId,update.id,{decision:'APPROVED'});
  assert.equal(await db.bankLedgerEntry.count({where:{voidedAt:null}}),2);assert.ok((await db.bankLedgerEntry.findUnique({where:{id:feeId}})).voidedAt);
  assert.equal((await readLedgerAccounts(db,org)).find(row=>row.id===s.account.id).currentBalance,'-103.00');
  const edited=await readLedgerEdit(db,org,changed.result.entryIds[0]);assert.equal(edited.bankFees[0].amount,'3');assert.equal(edited.drafter.id,s.people.junior.id);
  const deletion=await requestChangeApproval(db,org,s.people.junior.id,{menu:'BANK_LEDGER',operation:'DELETE',sourceKind:'ledger',sourceId:edited.id,revision:edited.revision,clientKey:randomUUID(),selection:{seniorEmployeeId:s.people.senior.id,leadEmployeeId:s.people.lead.id},reason:'Delete both original and fee',payload:{}});
  for(const stage of deletion.policy.resolvedStages)await decideChangeApproval(db,org,stage.employeeId,deletion.id,{decision:'APPROVED'});
  assert.equal(await db.bankLedgerEntry.count({where:{voidedAt:null}}),0);assert.equal(await db.bankLedgerEntry.count(),4);assert.equal(await db.bankLedgerFeeLink.count(),2);
  assert.equal((await readLedgerAccounts(db,org)).find(row=>row.id===s.account.id).currentBalance,'0.00');
  const wrong={...payload,clientKey:randomUUID(),rows:[{...main,clientKey:randomUUID()},{...fee,clientKey:randomUUID()}]};
  await assert.rejects(postLedgerSettlementBatch(db,org,s.people.admin.email,wrong),/LEDGER_INVALID_SETTLEMENT/);
  await f.pg.exec(readFileSync('backend/prisma/migrations/20261113030000_bank_fee_bnf_link/migration.sql','utf8'));assert.equal(await db.bankLedgerEntry.count(),4);
  const vnd=await db.currency.upsert({where:{code:'VND'},create:{code:'VND',name:'Vietnam dong'},update:{}});
  const target=await db.organizationBankAccount.create({data:{orgId:org,entityId:org,currencyId:vnd.id,bankName:'VND bank',accountNumber:'002',accountHolder:'Company',createdByEmployeeId:s.people.admin.id,updatedByEmployeeId:s.people.admin.id}});
  const fx={...main,clientKey:randomUUID(),counterparty:{kind:'ACCOUNT',id:target.id},transferAmount:'2500000',transferCurrencyCode:'VND',evidenceNumber:''},fxFee={...fee,clientKey:randomUUID(),feeForClientKey:fx.clientKey};
  const fxPayload={...payload,clientKey:randomUUID(),rows:[fx,fxFee]};
  const fxRequest=await requestChangeApproval(db,org,s.people.admin.id,{menu:'BANK_LEDGER',operation:'CREATE',sourceKind:'batch',sourceId:fxPayload.clientKey,clientKey:randomUUID(),selection:{step1EmployeeId:s.people.junior.id,step2EmployeeId:s.people.lead.id},payload:fxPayload});
  let fxResult;for(const stage of fxRequest.policy.resolvedStages)fxResult=await decideChangeApproval(db,org,stage.employeeId,fxRequest.id,{decision:'APPROVED'});
  const fxId=fxResult.result.entryIds[0],mirror=await db.bankLedgerEntry.findFirst({where:{internalTransferSourceId:fxId}}),fromMirror=await readLedgerEdit(db,org,mirror.id);assert.equal(fromMirror.id,fxId);assert.equal(fromMirror.bankFees.length,1);
  const fxDelete=await requestChangeApproval(db,org,s.people.junior.id,{menu:'BANK_LEDGER',operation:'DELETE',sourceKind:'ledger',sourceId:mirror.id,revision:fromMirror.revision,clientKey:randomUUID(),selection:{seniorEmployeeId:s.people.senior.id,leadEmployeeId:s.people.lead.id},reason:'Delete currency pair and bank fee',payload:{}});
  assert.equal(fxDelete.ledgerEntryId,fxId);for(const stage of fxDelete.policy.resolvedStages)await decideChangeApproval(db,org,stage.employeeId,fxDelete.id,{decision:'APPROVED'});
  assert.equal(await db.bankLedgerEntry.count({where:{voidedAt:null}}),0);assert.ok((await readLedgerAccounts(db,org)).every(row=>Number(row.currentBalance)===0));
 }finally{await f.close()}
});
