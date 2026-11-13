import test from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {createRequire} from 'node:module';
import {changeApprovalFixture,seedChangeApproval} from './helpers/change-approval-fixture.mjs';
import {ledgerExpenseRows,changeLedgerExpenseItem} from '../frontend/src/utils/ledgerExpenseRows.mjs';
import {accountingSummary} from '../frontend/src/utils/accountingSummary.mjs';
import {ledgerAccountingSummary} from '../frontend/src/utils/ledgerAccountingSummary.mjs';
import {invoiceBankInfo} from '../frontend/src/utils/invoiceBankInfo.mjs';
const require=createRequire(import.meta.url);
const {saveEntityBankAccount}=require('../backend/dist/services/entityBankAccount');
const {invoicePrimaryAccountText}=require('../backend/dist/services/invoicePrimaryAccounts');
const {requestChangeApproval,decideChangeApproval}=require('../backend/dist/services/changeApprovals');
const {readLedgerEdit}=require('../backend/dist/services/bankLedgerEdit');
const {readLedgerAccounts}=require('../backend/dist/services/bankLedger');
const {postLedgerEntry,listLedgerActivity}=require('../backend/dist/services/bankLedger');
const {registerExpenseRequest}=require('../backend/dist/services/expenseRequest');

test('ledger representative is the largest actual allocation, keeps ties in source order and counts repeated codes',()=>{
 const allocation=(id,line,paid,code,description)=>({expenseItemId:id,amount:paid,expenseItem:{id,expenseRequestLine:line,description:'Saved source detail',amount:'999999999',transactionCode:code?{code,base:{nameKo:description,nameEn:description,nameVi:description}}:null}});
 const row={allocations:[allocation('first',1,'10','THCV','THC'),allocation('second',2,'30','DOCV','Documents'),allocation('third',3,'20','DOCV','Documents')]},before=structuredClone(row);
 assert.equal(ledgerAccountingSummary(row).code,'DOCV 외 2건');assert.equal(ledgerAccountingSummary(row).description,'Documents 외 2건');assert.equal(ledgerAccountingSummary(row).descriptionTitle,'Documents\nDocuments\nTHC');assert.deepEqual(row,before);
 const tie={allocations:[allocation('second',2,'30','DOCV','Documents'),allocation('first',1,'30','THCV','THC')]};assert.equal(ledgerAccountingSummary(tie).code,'THCV 외 1건');
 const precise={allocations:[allocation('first',1,'9007199254740993.0001','A','First'),allocation('second',2,'9007199254740993.0002','B','Second')]};assert.equal(ledgerAccountingSummary(precise).code,'B 외 1건');
 const legacy={allocations:[allocation('old',1,'40',null,'')]};assert.equal(ledgerAccountingSummary(legacy).description,'Saved source detail');assert.equal(ledgerAccountingSummary(legacy).code,'—');
 assert.equal(ledgerAccountingSummary({accountingCode:{code:'IBTE',base:{nameKo:'Internal transfer'}}}).code,'IBTE');
});

test('ledger activity returns every paid expense item even when codes repeat, so summary counts real lines',async()=>{
 const f=await changeApprovalFixture();try{
  const db=f.db,s=await seedChangeApproval(db),org=s.company.id;
  const expense=await db.$transaction(tx=>registerExpenseRequest(tx,org,s.people.admin.id,{partnerOrgId:s.vendor.id,automaticRequestDate:true,clientKey:randomUUID(),items:[1,2,3].map(n=>({transactionCodeId:s.code.id,currency:'USD',quantity:'1',unitPrice:'10',vatRate:'0',details:{reference:'MULTI-'+n,evidenceFile:'invoice.pdf'}}))}));
  const entry=await postLedgerEntry(db,org,'admin@example.test',s.account.id,{clientKey:randomUUID(),transactionDate:'2026-11-13',direction:'OUT',amount:'30',purpose:'Multiple expenses',accountingCodeId:s.code.id,evidenceType:'EXPENSE',expenseRequestId:expense.id,expenseVersion:expense.version,expenseItems:expense.items.map(item=>({itemId:item.id,amount:'10'})),counterparty:{kind:'PARTNER',id:s.vendor.id}});
  const result=await listLedgerActivity(db,org,{start:'2026-11-01',end:'2026-11-13'}),row=result.rows.find(row=>row.id===entry.id);
  assert.equal(row.allocations.length,3);assert.deepEqual(new Set(row.allocations.map(a=>a.expenseItem.id)),new Set(expense.items.map(item=>item.id)));
  const codes=row.allocations.sort((a,b)=>a.expenseItem.expenseRequestLine-b.expenseItem.expenseRequestLine).map(a=>a.expenseItem.transactionCode.code);
  assert.equal(accountingSummary(codes,'ko'),s.code.code+' 외 2건');assert.ok(row.allocations.every(a=>a.expenseItem.transactionCode.base.nameEn));
  assert.equal(result.rows.length,1);assert.equal(row.amount,'30.00');assert.equal(await db.bankLedgerEntry.count(),1);
 }finally{await f.close();}
});
test('expense allocations are full rows while cash and FK totals remain one real transfer',()=>{
 const row={entryKind:'BANK',evidenceType:'EXPENSE',amount:'30',expenseItems:[{itemId:'cost2',line:2,amount:'20',accountingCode:{code:'DOCV'}},{itemId:'cost1',line:1,amount:'10',accountingCode:{code:'THCV'}}]};
 const projected=ledgerExpenseRows([row]);assert.equal(projected.length,2);assert.equal(projected[0].item.itemId,'cost1');assert.equal(projected[1].row,row);
 const patch=changeLedgerExpenseItem(row,'cost1','12.25');assert.equal(patch.amount,'32.25');assert.equal(patch.expenseItems[1].itemId,'cost1');assert.equal(row.amount,'30');
 assert.equal(accountingSummary(['THCV','DOCV','DOCV'],'ko'),'THCV 외 2건');
 assert.equal(invoiceBankInfo([{isDefault:true,bankName:'A',accountNumber:'1',currency:{code:'USD'}},{isDefault:false,bankName:'B',accountNumber:'2',currency:{code:'VND'}},{isDefault:true,bankName:'C',accountNumber:'3',currency:{code:'KRW'}}]),'A / 1 / USD\nC / 3 / KRW');
});
test('primary accounts are optional and unique per currency; permission, rollback and all-currency invoice instructions',async()=>{
 const f=await changeApprovalFixture({registration:true});try{
  const db=f.db,s=await seedChangeApproval(db),org=s.company.id,actor=s.people.admin.id;
  const body={accountKind:'BANK',displayName:'Primary USD',bankName:'Bank',accountNumber:'NEW',accountHolder:'Company',currencyId:s.currency.id,isDefault:true};
  const first=await db.$transaction(tx=>saveEntityBankAccount(tx,org,actor,org,s.own.id,{...body,accountNumber:'001'}));assert.equal(first.isDefault,true);
  const second=await db.$transaction(tx=>saveEntityBankAccount(tx,org,actor,org,null,body));assert.equal((await db.organizationBankAccount.findUnique({where:{id:first.id}})).isDefault,false);
  await assert.rejects(db.$transaction(tx=>saveEntityBankAccount(tx,org,s.people.junior.id,org,null,body)),/BANK_ACCOUNT_ADMIN_REQUIRED/);
  await assert.rejects(db.organizationBankAccount.update({where:{id:first.id},data:{isDefault:true}}));
  await assert.rejects(db.$transaction(tx=>saveEntityBankAccount(tx,org,actor,org,null,{...body,accountHolder:''})));assert.equal((await db.organizationBankAccount.findUnique({where:{id:second.id}})).isDefault,true);
  const krw=await db.currency.upsert({where:{code:'KRW'},create:{code:'KRW',name:'Won'},update:{}});
  await db.$transaction(tx=>saveEntityBankAccount(tx,org,actor,org,null,{...body,currencyId:krw.id,accountNumber:'KRW'}));
  const text=await db.$transaction(tx=>invoicePrimaryAccountText(tx,org));assert.ok(text.includes('NEW / Company / USD'));assert.ok(text.includes('KRW / Company / KRW'));assert.ok(!text.includes('001 / Company / USD'));
  await db.organizationBankAccount.update({where:{id:s.payee.id},data:{isDefault:true}});
  await db.$transaction(tx=>saveEntityBankAccount(tx,org,s.people.junior.id,s.vendor.id,s.payee.id,{...body,accountNumber:'001'}));
  assert.equal((await db.organizationBankAccount.findUnique({where:{id:s.payee.id}})).isDefault,true,'Existing partner metadata is retained when editing its contact account');
 }finally{await f.close();}
});
test('editing one transaction can add a fee and independent bank row; approvals, receipt retries and original revision are atomic',async()=>{
 const f=await changeApprovalFixture({registration:true});try{
  const db=f.db,s=await seedChangeApproval(db),org=s.company.id;
  const row=(amount)=>({entryKind:'BANK',clientKey:randomUUID(),accountId:s.account.id,transactionDate:'2026-11-10',direction:'OUT',amount,remark:'Payment',accountingCodeId:s.code.id,evidenceType:'FILE',evidenceNumber:'Receipt',counterparty:{kind:'PARTNER',id:s.vendor.id},expenseItems:[]});
  const payload=rows=>({schemaVersion:2,accountingCodeVersion:1,clientKey:randomUUID(),rows});
  const approve=async request=>{await decideChangeApproval(db,org,s.people.junior.id,request.id,{decision:'APPROVED'});return decideChangeApproval(db,org,s.people.lead.id,request.id,{decision:'APPROVED'});};
  const create=payload([row('40')]);const request=await requestChangeApproval(db,org,s.people.admin.id,{menu:'BANK_LEDGER',operation:'CREATE',sourceKind:'batch',sourceId:create.clientKey,clientKey:randomUUID(),selection:{step1EmployeeId:s.people.junior.id,step2EmployeeId:s.people.lead.id},payload:create});
  const made=await approve(request),oldId=made.result.entryIds[0],source=await readLedgerEdit(db,org,oldId);
  await db.transactionCodeBase.update({where:{id:s.code.baseId},data:{code:'BNF'}});
  const update=payload([row('35'),{...row('2'),evidenceType:'BANK_FEE',counterparty:null,evidenceNumber:''},row('3')]);
  const input={menu:'BANK_LEDGER',operation:'UPDATE',reason:'Correct recorded details',sourceKind:'ledger',sourceId:oldId,revision:source.revision,clientKey:randomUUID(),selection:{seniorEmployeeId:s.people.senior.id,leadEmployeeId:s.people.lead.id},payload:update};
  const pending=await requestChangeApproval(db,org,s.people.junior.id,input);assert.equal((await db.bankLedgerEntry.findUnique({where:{id:oldId}})).voidedAt,null);
  let done;for(const stage of pending.policy.resolvedStages)done=await decideChangeApproval(db,org,stage.employeeId,pending.id,{decision:'APPROVED'});
  assert.equal(done.result.entryIds.length,3);assert.ok((await db.bankLedgerEntry.findUnique({where:{id:oldId}})).voidedAt);
  for(const id of done.result.entryIds)assert.equal((await readLedgerEdit(db,org,id)).drafter.id,s.people.junior.id,'every row in the approved edit retains its modifying requester');
  assert.equal(await db.bankLedgerEntry.count({where:{revisesEntryId:oldId}}),1);assert.equal(await db.bankLedgerEntry.count({where:{voidedAt:null}}),3);
  assert.equal((await readLedgerAccounts(db,org)).find(a=>a.id===s.account.id).currentBalance,'-40.00');
  await requestChangeApproval(db,org,s.people.junior.id,input);assert.equal(await db.bankLedgerEntry.count(),4);
  const activeId=done.result.entryIds[0],active=await readLedgerEdit(db,org,activeId),invalid=payload([row('35'),{...row('3'),evidenceNumber:''}]);
  const bad=await requestChangeApproval(db,org,s.people.junior.id,{...input,sourceId:activeId,revision:active.revision,clientKey:randomUUID(),payload:invalid});
  for(const stage of bad.policy.resolvedStages.slice(0,-1))await decideChangeApproval(db,org,stage.employeeId,bad.id,{decision:'APPROVED'});
  await assert.rejects(decideChangeApproval(db,org,bad.policy.resolvedStages.at(-1).employeeId,bad.id,{decision:'APPROVED'}));
  assert.equal((await db.bankLedgerEntry.findUnique({where:{id:activeId}})).voidedAt,null);assert.equal(await db.bankLedgerBatch.count({where:{clientKey:invalid.clientKey}}),0);
 }finally{await f.close();}
});
