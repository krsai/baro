import test from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {createRequire} from 'node:module';
import {readFileSync} from 'node:fs';
import {changeApprovalFixture,seedChangeApproval} from './helpers/change-approval-fixture.mjs';
const require=createRequire(import.meta.url);
const {requestChangeApproval,decideChangeApproval}=require('../backend/dist/services/changeApprovals');
const {readLedgerEdit}=require('../backend/dist/services/bankLedgerEdit');
const {registerExpenseRequest}=require('../backend/dist/services/expenseRequest');
const {normalizeDocumentEvidence,storedDocumentEvidence}=require('../backend/dist/services/documentEvidence');

test('document evidence retains legacy originals and validates newly added full paths',()=>{
 const legacy=[{details:{evidenceFile:'old.pdf',reference:'INV-1'}},{details:{evidenceFile:'old.pdf',reference:'INV-1'}}];
 const saved=storedDocumentEvidence({},legacy);assert.equal(saved.length,1);
 assert.deepEqual(normalizeDocumentEvidence(saved,saved),saved);
 assert.throws(()=>normalizeDocumentEvidence([{path:'X',reference:''}]),/LEDGER_FILE_REQUIRED/);
 assert.throws(()=>normalizeDocumentEvidence([saved[0],saved[0]],saved),/LEDGER_FILE_REQUIRED/);
 assert.deepEqual(storedDocumentEvidence({evidenceFiles:[]},legacy),[]);
});
test('one approved ledger document owns multiple actual transactions and evidence files',async()=>{
 const f=await changeApprovalFixture({registration:true});try{
 const db=f.db,s=await seedChangeApproval(db),org=s.company.id;
 const bank=(extra={})=>({entryKind:'BANK',accountId:s.account.id,transactionDate:'2026-11-05',direction:'IN',amount:'10',remark:'Received',purpose:'Received',evidenceType:'FILE',evidenceNumber:'',accountingCodeId:s.code.id,counterparty:{kind:'PARTNER',id:s.vendor.id},clientKey:randomUUID(),...extra});
 const evidenceFiles=[{path:'/evidence/receipt.pdf',reference:'INV-1'},{path:'C:/Evidence/receipt2.pdf',reference:'INV-2'}];
 const payload={documentVersion:1,evidenceFiles,schemaVersion:2,accountingCodeVersion:1,clientKey:randomUUID(),rows:[bank(),bank({amount:'20'})]};
 const input={menu:'BANK_LEDGER',operation:'CREATE',sourceKind:'batch',sourceId:payload.clientKey,payload,clientKey:randomUUID(),selection:{step1EmployeeId:s.people.junior.id,step2EmployeeId:s.people.lead.id}};
 const request=await requestChangeApproval(db,org,s.people.admin.id,input);
 assert.equal(await db.bankLedgerDocument.count(),0);
 await decideChangeApproval(db,org,s.people.junior.id,request.id,{decision:'APPROVED'});
 const done=await decideChangeApproval(db,org,s.people.lead.id,request.id,{decision:'APPROVED'});
 assert.equal(await db.bankLedgerDocument.count(),1);
 const entries=await db.bankLedgerEntry.findMany({where:{orgId:org},orderBy:{documentPosition:'asc'}});
 assert.equal(entries.length,2);assert.ok(entries[0].documentId);assert.equal(entries[0].documentId,entries[1].documentId);
 assert.equal(await db.bankLedgerManagementNumber.count(),0);
 const document=await db.bankLedgerDocument.findFirst({where:{orgId:org}});assert.deepEqual(document.evidenceFiles,evidenceFiles);assert.match(document.managementNumber,/^BNK-2026-/);
 const editor=await readLedgerEdit(db,org,entries[1].id);assert.equal(editor.id,entries[0].id);assert.equal(editor.documentRows.length,2);assert.equal(editor.managementNumber,document.managementNumber);assert.deepEqual(editor.evidenceFiles,evidenceFiles);
 await assert.rejects(readLedgerEdit(db,s.other.id,entries[0].id),/LEDGER_ENTRY_NOT_FOUND/);
 await assert.rejects(db.bankLedgerEntry.update({where:{id:entries[0].id},data:{documentId:null}}),/IMMUTABLE/);
 await decideChangeApproval(db,org,s.people.lead.id,request.id,{decision:'APPROVED'});assert.equal(await db.bankLedgerDocument.count(),1);
 const correction={...payload,clientKey:randomUUID(),rows:[bank({amount:'15'}),bank({amount:'25'})],evidenceFiles:[...evidenceFiles,{path:'/evidence/correction.pdf',reference:''}]};
 const edit=await requestChangeApproval(db,org,s.people.junior.id,{menu:'BANK_LEDGER',operation:'UPDATE',reason:'Correction',sourceKind:'ledger',sourceId:entries[0].id,revision:editor.revision,payload:correction,clientKey:randomUUID()});
 await decideChangeApproval(db,org,s.people.senior.id,edit.id,{decision:'APPROVED'});
 assert.equal(await db.bankLedgerEntry.count({where:{orgId:org,voidedAt:null}}),2);
 assert.equal(await db.bankLedgerEntry.count({where:{orgId:org,documentId:document.id,voidedAt:{not:null}}}),2);
 assert.deepEqual((await db.bankLedgerDocument.findUnique({where:{id:document.id}})).evidenceFiles,evidenceFiles);
 const expense=await db.$transaction(tx=>registerExpenseRequest(tx,org,s.people.junior.id,{partnerOrgId:s.vendor.id,remark:'Expense',automaticRequestDate:true,clientKey:randomUUID(),evidenceFiles,items:[1,2].map(()=>({transactionCodeId:s.code.id,currency:'USD',quantity:'1',unitPrice:'10',vatRate:'0',details:{}}))}));
 assert.deepEqual(expense.evidenceFiles,evidenceFiles);assert.equal(expense.items.length,2);assert.ok(expense.items.every(item=>!item.details.evidenceFile));
 const current=await readLedgerEdit(db,org,(await db.changeApprovalRequest.findUnique({where:{id:edit.id}})).result.entryIds[0]);
 const deletion=await requestChangeApproval(db,org,s.people.junior.id,{menu:'BANK_LEDGER',operation:'DELETE',reason:'Cancel whole document',sourceKind:'ledger',sourceId:current.id,revision:current.revision,clientKey:randomUUID()});
 for(const stage of deletion.policy.resolvedStages)await decideChangeApproval(db,org,stage.employeeId,deletion.id,{decision:'APPROVED'});
 assert.equal(await db.bankLedgerEntry.count({where:{orgId:org,voidedAt:null}}),0);
 assert.equal(await db.bankLedgerDocument.count(),2);
 const migration=readFileSync('backend/prisma/migrations/20261126020000_document_evidence/migration.sql','utf8');
 await f.pg.exec(migration);await f.pg.exec(migration);
 assert.equal((await db.bankLedgerDocument.findUnique({where:{id:document.id}})).managementNumber,document.managementNumber);
 }finally{await f.close();}
});

test('internal transfer mirrors share the document identity without becoming extra input rows',async()=>{
 const f=await changeApprovalFixture({registration:true});try{
 const db=f.db,s=await seedChangeApproval(db),org=s.company.id;
 const target=await db.organizationBankAccount.create({data:{orgId:org,entityId:org,currencyId:s.currency.id,bankName:'Second Bank',accountNumber:'002',accountHolder:'Company',createdByEmployeeId:s.people.admin.id,updatedByEmployeeId:s.people.admin.id}});
 const payload={documentVersion:1,evidenceFiles:[],schemaVersion:2,accountingCodeVersion:1,clientKey:randomUUID(),rows:[{entryKind:'BANK',accountId:s.account.id,transactionDate:'2026-11-05',direction:'OUT',amount:'10',remark:'Transfer',purpose:'Transfer',evidenceType:'FILE',evidenceNumber:'',accountingCodeId:s.code.id,counterparty:{kind:'ACCOUNT',id:target.id},clientKey:randomUUID()}]};
 const request=await requestChangeApproval(db,org,s.people.admin.id,{menu:'BANK_LEDGER',operation:'CREATE',sourceKind:'batch',sourceId:payload.clientKey,payload,clientKey:randomUUID(),selection:{step1EmployeeId:s.people.junior.id,step2EmployeeId:s.people.lead.id}});
 for(const stage of request.policy.resolvedStages)await decideChangeApproval(db,org,stage.employeeId,request.id,{decision:'APPROVED'});
 const rows=await db.bankLedgerEntry.findMany({where:{orgId:org}});assert.equal(rows.length,2);assert.equal(rows[0].documentId,rows[1].documentId);assert.equal(await db.bankLedgerDocument.count(),1);assert.equal(await db.bankLedgerManagementNumber.count(),0);
 const mirror=rows.find(row=>row.internalTransferSourceId);assert.ok(mirror);
 const editor=await readLedgerEdit(db,org,mirror.id);assert.equal(editor.documentRows.length,1);assert.equal(editor.id,mirror.internalTransferSourceId);assert.equal(editor.transferAmount,'10.00');
 }finally{await f.close();}
});
