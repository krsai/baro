import test from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {randomUUID} from 'node:crypto';
import {readFileSync} from 'node:fs';
import {changeApprovalFixture,seedChangeApproval} from './helpers/change-approval-fixture.mjs';
import {ledgerVatAmounts,updateLedgerVat,syncLedgerBankFees,splitLedgerGross,validLedgerTax,ledgerTaxPayload} from '../frontend/src/utils/ledgerVat.mjs';
import {ledgerEntryTotals} from '../frontend/src/utils/ledgerEntryTotals.mjs';
import {syncSingleExpenseAllocations} from '../frontend/src/utils/ledgerExpenseAllocation.mjs';
const require=createRequire(import.meta.url);
const {postLedgerEntry}=require('../backend/dist/services/bankLedger');
const {readLedgerEdit,ledgerEntryRevision}=require('../backend/dist/services/bankLedgerEdit');
const {requestChangeApproval,decideChangeApproval}=require('../backend/dist/services/changeApprovals');
const {registerExpenseRequest}=require('../backend/dist/services/expenseRequest');
test('linking expense items preserves the new cash amount and validates VAT only on allocations',()=>{
 const account={id:'v',currencyCode:'VND'},code={id:1,code:'ELEE'};
 for(const previous of [{amount:''},{amount:'100',subtotal:'100',vatRate:'8',vatAmount:'8'}]){
  const row=updateLedgerVat({entryKind:'BANK',clientKey:'parent',accountId:'v',direction:'OUT',accountingCodeId:'',evidenceType:'EXPENSE',...previous},{document:{id:22},accountingCodeId:1,taxInclusiveAmount:true,amount:'7050950',expenseItems:[{itemId:'electricity',...splitLedgerGross('6775950','0','VND'),accountingCode:code},{itemId:'water',...splitLedgerGross('275000','0','VND'),accountingCode:{id:2,code:'WTRE'}}]},code,'VND','8');
  assert.equal(row.amount,'7050950');assert.deepEqual(ledgerTaxPayload(row),{});assert.equal(validLedgerTax(row,code,'VND'),true);
  assert.ok(row.expenseItems.every(item=>validLedgerTax(item,item.accountingCode,'VND')));
  assert.deepEqual(ledgerEntryTotals([row],[account]),[{currency:'VND',incoming:'0.00',outgoing:'7050950.00',net:'-7050950.00'}]);
 }
 const vatCode={id:3,code:'TESTV'},item={itemId:'taxed',...splitLedgerGross('1080','8','VND'),accountingCode:vatCode};
 const taxed=updateLedgerVat({entryKind:'BANK',clientKey:'parent',accountId:'v',evidenceType:'EXPENSE',amount:'',accountingCodeId:''},{accountingCodeId:3,amount:'1080',expenseItems:[item]},vatCode,'VND','10');
 assert.equal(taxed.amount,'1080');assert.deepEqual(ledgerTaxPayload(taxed),{});assert.equal(taxed.expenseItems[0].vatAmount,'80');
 assert.equal(syncSingleExpenseAllocations([taxed],[account])[0].expenseItems[0].amount,'1080.00');
 assert.equal(validLedgerTax({...item,vatRate:'10'},vatCode,'VND'),false,'Mismatched allocation VAT is still rejected');
});
test('exact VAT split, code restrictions, inherited fee accounts and preserved historical amounts',()=>{
 assert.deepEqual(ledgerVatAmounts('1000','10','VND'),{subtotal:'1000',vatRate:'10',vatAmount:'100',amount:'1100'});
 assert.equal(ledgerVatAmounts('1000','8','VND').amount,'1080');assert.equal(splitLedgerGross('54','8','USD').subtotal,'50.00');assert.equal(splitLedgerGross('0.01','100','USD'),null);
 assert.equal(updateLedgerVat({amount:'1080',document:{id:1}},{accountingCodeId:1},{code:'TSTV'},'VND','8').amount,'1080');assert.equal(updateLedgerVat({amount:''},{subtotal:'1.'},{code:'TSTV'},'USD','8').subtotal,'1.');
 assert.equal(ledgerVatAmounts('0.05','10','USD').vatAmount,'0.01');
 assert.equal(ledgerVatAmounts('999999999999999999','8','VND').amount,'1079999999999999999');
 assert.equal(ledgerVatAmounts('1.5','8','VND'),null);assert.equal(ledgerVatAmounts('1','101','USD'),null);
 assert.equal(updateLedgerVat({entryKind:'FEE',amount:'10'},{accountingCodeId:1},{code:'FEEE'},'USD','8').subtotal,undefined);
 const saved=updateLedgerVat({amount:'1100',accountingCodeId:1,taxInclusiveAmount:true},{vatRate:'10'},{code:'TSTV'},'VND','8');assert.equal(saved.amount,'1100');assert.equal(saved.subtotal,'1000');assert.equal(saved.vatAmount,'100');
 const old={amount:'1100',accountingCodeId:1};assert.equal(updateLedgerVat(old,{purpose:'Memo'},{code:'TSTV'},'VND','8').amount,'1100');
 assert.equal(updateLedgerVat(old,{accountingCodeId:2},{code:'TSTV'},'VND','8').vatRate,'8');
 for(const suffix of ['E','Z'])assert.equal(updateLedgerVat(old,{subtotal:'1000',vatRate:'8'},{code:'TST'+suffix},'VND','8').amount,'1000');
 const fees=syncLedgerBankFees([{clientKey:'a',accountId:'new',transactionDate:'2026-11-02'},{clientKey:'fee',feeForClientKey:'a',accountId:'old',amount:'10'}],[{id:'old',currencyCode:'USD'},{id:'new',currencyCode:'VND'}]);assert.equal(fees[1].accountId,'new');assert.equal(fees[1].transactionDate,'2026-11-02');assert.equal(fees[1].amount,'');
});
test('real ledger VAT snapshots: cash totals, approved replacement, allocation FK, immutable history and migration retry',async()=>{
 const f=await changeApprovalFixture();try{
  const db=f.db,s=await seedChangeApproval(db),org=s.company.id,names={nameKo:'VAT test',nameEn:'VAT test',nameVi:'VAT test'};
  const tax=await db.taxTreatment.findFirst({where:{suffix:'V'}})||await db.taxTreatment.create({data:{id:98,code:'VAT',suffix:'V',...names}});
  const originalVariant=await db.settingTransactionCodeDefault.findUnique({where:{id:s.code.systemDefaultId}});
  const variant=await db.settingTransactionCodeDefault.create({data:{...names,code:'TSTV',serviceTypeId:originalVariant.serviceTypeId,baseId:s.code.baseId,taxTreatmentId:tax.id}});
  const v=await db.transactionCode.create({data:{...names,code:'TSTV',vatEnabled:true,ownerOrgId:org,serviceTypeId:s.code.serviceTypeId,baseId:s.code.baseId,taxTreatmentId:tax.id,systemDefaultId:variant.id}});
  const body=(extra={})=>({clientKey:randomUUID(),transactionDate:'2026-11-05',direction:'OUT',amount:'1080',subtotal:'1000',vatRate:'8',vatAmount:'80',purpose:'VAT test',evidenceType:'FILE',evidenceNumber:'Receipt',accountingCodeId:v.id,counterparty:{kind:'PARTNER',id:s.vendor.id},...extra});
  const entry=await postLedgerEntry(db,org,'junior@example.test',s.account.id,body());assert.equal(String(entry.amount),'1080');assert.equal(String(entry.subtotal),'1000');assert.equal(String(entry.vatAmount),'80');
  assert.equal((await postLedgerEntry(db,org,'junior@example.test',s.account.id,body({clientKey:entry.clientKey}))).id,entry.id);
  await assert.rejects(postLedgerEntry(db,org,'junior@example.test',s.account.id,body({clientKey:entry.clientKey,amount:'1100',vatRate:'10',vatAmount:'100'})),/RETRY_CONFLICT/);
  for(const extra of [{amount:'1081'},{vatAmount:'81'},{vatRate:'101'},{accountingCodeId:s.code.id}])await assert.rejects(postLedgerEntry(db,org,'junior@example.test',s.account.id,body(extra)),/INVALID_VAT/);
  await assert.rejects(db.bankLedgerEntry.update({where:{id:entry.id},data:{vatAmount:'81'}}));
  const raw=body();delete raw.counterparty;
  await assert.rejects(db.bankLedgerEntry.create({data:{...raw,orgId:org,accountId:s.account.id,createdBy:'junior@example.test',counterpartyOrgId:s.vendor.id,counterpartyName:s.vendor.name,amount:'1081'}}));
  await assert.rejects(db.bankLedgerEntry.create({data:{...raw,orgId:org,accountId:s.account.id,createdBy:'junior@example.test',counterpartyOrgId:s.vendor.id,counterpartyName:s.vendor.name,accountingCodeId:s.code.id}}));
  const legacy=await postLedgerEntry(db,org,'junior@example.test',s.account.id,body({subtotal:undefined,vatRate:undefined,vatAmount:undefined}));assert.equal(legacy.subtotal,null);
  const revision=ledgerEntryRevision(legacy),without={...legacy};delete without.subtotal;delete without.vatRate;delete without.vatAmount;assert.equal(ledgerEntryRevision(without),revision,'new nullable columns do not invalidate old pending revisions');
  const source=await readLedgerEdit(db,org,entry.id),row={...body({amount:'1100',vatRate:'10',vatAmount:'100'}),entryKind:'BANK',accountId:s.account.id};
  const payload={schemaVersion:2,accountingCodeVersion:1,clientKey:randomUUID(),rows:[row]};
  const request=await requestChangeApproval(db,org,s.people.junior.id,{menu:'BANK_LEDGER',operation:'UPDATE',reason:'Correct recorded details',sourceKind:'ledger',sourceId:entry.id,revision:source.revision,payload,clientKey:randomUUID()});
  assert.equal((await db.bankLedgerEntry.findUnique({where:{id:entry.id}})).voidedAt,null);
  let done;for(const stage of request.policy.resolvedStages)done=await decideChangeApproval(db,org,stage.employeeId,request.id,{decision:'APPROVED'});
  assert.equal((await readLedgerEdit(db,org,done.result.entryIds[0])).vatAmount.toString(),'100');assert.equal((await db.bankLedgerEntry.findUnique({where:{id:entry.id}})).vatAmount.toString(),'80');
  const expense=await db.$transaction(tx=>registerExpenseRequest(tx,org,s.people.admin.id,{partnerOrgId:s.vendor.id,remark:'Taxed expense for VAT verification',requestDate:'2026-11-05',clientKey:randomUUID(),items:[{transactionCodeId:v.id,currency:'USD',quantity:'1',unitPrice:'1000',vatRate:'8',details:{evidenceFile:'receipt.pdf',reference:'VAT'}}]}),{timeout:30000});
  const paid=await postLedgerEntry(db,org,'admin@example.test',s.account.id,body({subtotal:undefined,vatRate:undefined,vatAmount:undefined,evidenceType:'EXPENSE',evidenceNumber:'',expenseItems:[{itemId:expense.items[0].id,amount:'1080',subtotal:'1000',vatRate:'8',vatAmount:'80'}]}));
  const edit=await readLedgerEdit(db,org,paid.id);assert.equal(edit.expenseItems[0].vatAmount,'80');
  const allocation=await db.bankLedgerEvidenceAllocation.findFirst({where:{entryId:paid.id}});assert.equal(allocation.subtotal.toString(),'1000');assert.equal(allocation.expenseItemId,expense.items[0].id);
  await f.pg.exec(readFileSync('backend/prisma/migrations/20261113010000_ledger_vat_breakdown/migration.sql','utf8'));
  assert.equal((await db.bankLedgerEntry.findUnique({where:{id:paid.id}})).amount.toString(),'1080');assert.equal((await db.bankLedgerEntry.findUnique({where:{id:legacy.id}})).subtotal,null);
 }finally{await f.close();}
});
