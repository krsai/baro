import test from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {randomUUID} from 'node:crypto';
import {changeApprovalFixture,seedChangeApproval} from './helpers/change-approval-fixture.mjs';
import {paymentAccountsFields} from '../frontend/src/utils/invoicePaymentAccount.mjs';
const require=createRequire(import.meta.url);
const {saveInvoiceDraft}=require('../backend/dist/services/invoiceDraftStore');
const {issueInvoiceDraft,createInvoiceRevisionDraft}=require('../backend/dist/services/invoiceIssueStore');

test('three account IDs and immutable snapshots survive draft, issuance and revision; stale selection rolls back',async()=>{
 const f=await changeApprovalFixture();try{
  const db=f.db,s=await seedChangeApproval(db),org=s.company.id;
  const accounts=[s.own];
  for(const n of [2,3])accounts.push(await db.organizationBankAccount.create({data:{orgId:org,entityId:org,currencyId:s.currency.id,bankName:'Bank '+n,accountNumber:'00'+n,accountHolder:'Seller',createdByEmployeeId:s.people.admin.id,updatedByEmployeeId:s.people.admin.id}}));
  const selected=accounts.map(row=>({...row,currencyCode:'USD'}));
  const body={clientKey:randomUUID(),documentKind:'GENERAL',buyerOrgId:s.vendor.id,orders:[],basis:null,currency:'USD',fields:{...paymentAccountsFields(selected),date:'2026-11-25',seller:{name:'Seller'},buyer:{name:'Buyer'}},lines:[{key:randomUUID(),transactionCodeId:s.code.id,currencyCode:'USD',quantity:'1',unitPrice:'10',vatRate:'0',unit:'Pcs',description:'Material',remark:''}]};
  const draft=await saveInvoiceDraft(db,org,'actor',body);
  const check=row=>{assert.deepEqual([row.bankAccountId,row.bankAccountId2,row.bankAccountId3],accounts.map(a=>a.id));assert.deepEqual((row.content||row.snapshot).fields.bankAccounts.map(a=>a.snapshot.accountNumber),['001','002','003']);};
  check(draft);check(await db.invoiceDraft.findUnique({where:{id:draft.id}}));
  const invoice=await issueInvoiceDraft(db,org,'actor',draft.id,draft.revision);check(invoice);assert.equal((await issueInvoiceDraft(db,org,'actor',draft.id,draft.revision)).id,invoice.id);
  const revision=await createInvoiceRevisionDraft(db,org,'actor',invoice.id,{clientKey:randomUUID(),reason:'Review'});check(revision);
  await db.organizationBankAccount.update({where:{id:accounts[1].id},data:{accountNumber:'CHANGED'}});
  check(await db.invoice.findUnique({where:{id:invoice.id}}));
  await assert.rejects(saveInvoiceDraft(db,org,'actor',{...revision.content,buyerOrgId:s.vendor.id,clientKey:revision.clientKey,revision:revision.revision},revision.id),/INVOICE_BANK_ACCOUNT_CHANGED/);
  assert.equal((await db.invoiceDraft.findUnique({where:{id:revision.id}})).revision,revision.revision);
  await assert.rejects(db.organizationBankAccount.delete({where:{id:accounts[2].id}}));
  const clear=await saveInvoiceDraft(db,org,'actor',{...revision.content,buyerOrgId:s.vendor.id,fields:{...revision.content.fields,...paymentAccountsFields([])},clientKey:revision.clientKey,revision:revision.revision},revision.id);
  assert.deepEqual([clear.bankAccountId,clear.bankAccountId2,clear.bankAccountId3],[null,null,null]);assert.deepEqual(clear.content.fields.bankAccounts,[]);
 }finally{await f.close();}
});
