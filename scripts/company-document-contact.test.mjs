import test from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {changeApprovalFixture,seedChangeApproval} from './helpers/change-approval-fixture.mjs';
const require=createRequire(import.meta.url);
const {companyDocumentContact,companyDocumentContactUpdate,companyInvoiceParty}=require('../backend/dist/services/companyDocumentContact');
const {buildInvoiceSource}=require('../backend/dist/services/invoiceSource');
const {generalInvoiceSource}=require('../backend/dist/services/generalInvoice');
const {freightOptions}=require('../backend/dist/services/freightOperations');
const {buildIssuedInvoicePrintHtml}=await import('../frontend/src/utils/issuedInvoicePrint.mjs');
const {freightDocumentHtml}=await import('../frontend/src/utils/freightPrint.js');

test('document contacts use the business master, validate explicit English edits, and preserve old text until edited',()=>{
 const current={representative:'기존 이름',address:'기존 주소',phone:'123',representativeEmployee:{name:'Employee',phone:'999'}};
 assert.equal(companyDocumentContact(current).representative,'기존 이름');assert.equal(companyDocumentContact(current).phone,'123');
 assert.deepEqual(companyDocumentContactUpdate({representative:'기존 이름',address:'기존 주소'},current),{representative:'기존 이름',address:'기존 주소'});
 assert.throws(()=>companyDocumentContactUpdate({representative:'다른 이름'},current),/COMPANY_DOCUMENT_CONTACT_ENGLISH_REQUIRED/);
 assert.throws(()=>companyDocumentContactUpdate({address:'새 주소'},current),/COMPANY_DOCUMENT_CONTACT_ENGLISH_REQUIRED/);
 assert.deepEqual(companyDocumentContactUpdate({representative:'John Smith',address:'12 Nguyen Van Linh, Hanoi',phone:'+84 123'},current),{representative:'John Smith',address:'12 NGUYEN VAN LINH, HANOI',phone:'+84 123'});
 const legacy={address:'12 Legacy Street'};assert.equal(companyDocumentContactUpdate({address:legacy.address},legacy).address,legacy.address);assert.equal(companyDocumentContactUpdate({address:'14 New Street'},legacy).address,'14 NEW STREET');
 assert.equal(companyInvoiceParty({name:'DEX LOGIS',representative:'John Smith'}).contactName,'John Smith');
});
test('shipping, order invoices and general invoices read the same independent company document contact',async()=>{
 const f=await changeApprovalFixture();try{
  const db=f.db,s=await seedChangeApproval(db),contact={representative:'John Smith',phone:'+84 123',email:'documents@example.test',address:'12 Main Street, Hanoi'};
  await db.organization.update({where:{id:s.company.id},data:{...contact,representativeEmployeeId:s.people.admin.id}});
  await db.organization.update({where:{id:s.vendor.id},data:{...contact}});
  await db.employee.update({where:{id:s.people.admin.id},data:{name:'Employee private name',phone:'PRIVATE PHONE'}});
  const own=await db.organization.findUnique({where:{id:s.company.id},include:{representativeEmployee:true}});
  assert.deepEqual(companyDocumentContact(own),contact);
  const invoice=await generalInvoiceSource(db,s.company.id,s.vendor.id),shipping=(await freightOptions(db,s.company.id,s.people.admin.id)).find(row=>row.id===s.vendor.id);
  const ordered=buildInvoiceSource({sellerOrg:own,buyerOrg:own,workOrderItems:[]},[],[],null);
  for(const row of [invoice.seller,invoice.buyer,ordered.seller,ordered.buyer,shipping]){assert.equal(row.contactName,contact.representative);assert.equal(row.address,contact.address);assert.equal(row.phone,contact.phone);assert.equal(row.email,contact.email);}
  assert.equal((await db.employee.findUnique({where:{id:s.people.admin.id}})).phone,'PRIVATE PHONE');
 }finally{await f.close();}
});
test('issued print renders only its saved contact snapshot and never mutates old documents',()=>{
 const document={invoiceNumber:'INV-1',status:'ISSUED',snapshot:{version:2,currencyCode:'USD',total:'0',fields:{number:'INV-1',date:'2026-11-15',seller:{name:'Frozen seller',contactName:'Frozen Contact'},buyer:{name:'Frozen buyer'}},lines:[],orders:[]}};
 const before=structuredClone(document),html=buildIssuedInvoicePrintHtml(document);assert.ok(html.includes('Frozen Contact'));assert.deepEqual(document,before);
 delete document.snapshot.fields.seller.contactName;assert.equal(buildIssuedInvoicePrintHtml(document).includes('Contact name'),false);
});
test('shipping print uses its frozen issuer contact and escapes the manually entered values',()=>{
 const document={number:'DOC-1',kind:'HBL',snapshot:{issuer:{name:'DEX LOGIS',address:'12 Main Street',representative:'John <Smith>',phone:'+84 123',email:'documents@example.test'},source:{number:'JOB-1',data:{}}}};
 const before=structuredClone(document),html=freightDocumentHtml(document,{HBL:'House Bill',draft:'Draft'});
 assert.ok(html.includes('John &lt;Smith&gt;'));assert.ok(html.includes('+84 123'));assert.ok(html.includes('documents@example.test'));assert.deepEqual(document,before);
});
