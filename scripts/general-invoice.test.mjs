import test from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {randomUUID} from 'node:crypto';
import {changeApprovalFixture,seedChangeApproval} from './helpers/change-approval-fixture.mjs';
import {calculateGeneralInvoiceDraft} from '../frontend/src/utils/generalInvoice.mjs';
import {buildIssuedInvoicePrintHtml} from '../frontend/src/utils/issuedInvoicePrint.mjs';
import {loadSourceBindings} from './helpers/source-bindings.mjs';
import {canAccessPath} from '../frontend/src/utils/accessControl.js';
import {ROLE_ACCESS_POLICY_SCHEMA_VERSION} from '../frontend/src/utils/roleAccessPolicyCore.mjs';
const require=createRequire(import.meta.url);
const {calculateGeneralInvoice,generalInvoiceBuyerScope}=require('../backend/dist/services/generalInvoice');
const {saveInvoiceDraft}=require('../backend/dist/services/invoiceDraftStore');
const {issueInvoiceDraft,createInvoiceRevisionDraft,recordInvoicePayment,cancelIssuedInvoice}=require('../backend/dist/services/invoiceIssueStore');
const {invoiceFamilyBalance}=require('../backend/dist/services/invoiceSettlement');
const {resolveEvidence}=require('../backend/dist/services/bankEvidence');
const line=(patch={})=>({key:randomUUID(),transactionCodeId:1,description:'Polybag purchase',unit:'pcs',quantity:'1000',unitPrice:'1250.1234',vatRate:'10',remark:'',...patch});
const fields=()=>({number:'',date:'2026-11-10',seller:{name:'Seller'},buyer:{name:'Buyer'},shipTo:'',shipmentDate:'',dueDate:'2026-11-30',expectedCollectionDate:'',incoterm:'',paymentTerms:'',bank:'',notes:'Agency purchase without an order'});

test('general billing retains saved invoice permission and requires a real company role instead of SYSTEM alone',async()=>{
 for(const orgType of ['MANUFACTURER','SERVICE'])for(const role of ['ADMIN','ACCOUNTANT','OPERATOR','WORKER'])for(const grant of [true,false]){
  const context={isAuthenticated:true,accessProfile:{entryType:'ORG',orgType,orgRole:role,accessPolicy:{__schemaVersion:ROLE_ACCESS_POLICY_SCHEMA_VERSION,[orgType]:{[role]:grant?['INVOICE']:[]}}}};
  assert.equal(canAccessPath('/invoices/new',context),role!=='WORKER'&&grant);
 }
 let permitted=false,checks=0;
 const ctx={organization:{id:7,type:'SERVICE'},orgMembership:{role:'ACCOUNTANT'},systemUser:{systemRole:'SYSTEM_ADMIN'}};
 const {requireInvoiceAccess}=loadSourceBindings('backend/src/index.ts',['requireInvoiceAccess'],{ORG_MANAGEMENT_ROLES:['ADMIN','ACCOUNTANT','OPERATOR'],requireOrgRole:async(_req,_res,options)=>{assert.equal(options.allowSystemAdmin,false);return ctx;},hasRoleAccessPolicyFeature:async query=>{checks++;assert.deepEqual(query,{orgType:'SERVICE',orgRole:'ACCOUNTANT',feature:'INVOICE'});return permitted;}});
 const res={status(code){this.code=code;return this;},json(){return this;}};
 assert.equal(await requireInvoiceAccess({},res),null);assert.equal(res.code,403);assert.equal(checks,1);
 permitted=true;assert.equal(await requireInvoiceAccess({},res),ctx);
});

test('general invoices compute precise line tax and totals without order or production quantities',()=>{
 const codes=new Map([[1,{id:1,code:'GENV',cashDirection:'IN',vatEnabled:true,nameEn:'General sales'}]]);
 for(const currency of ['VND','KRW','USD']){
  const content={currency,fields:fields(),lines:[line(),line({quantity:'0.5',unitPrice:'3.1250',vatRate:'8'})]};
  const server=calculateGeneralInvoice(content,codes),client=calculateGeneralInvoiceDraft(content.lines,currency);
  assert.equal(server.total,client.amount);assert.equal(server.subtotal,client.subtotal);assert.equal(server.vatAmount,client.vatAmount);
  assert.deepEqual(server.orders,[]);assert.equal(server.pricingBasis,null);assert.equal(server.receivableAdded,server.total);
  for(const language of ['ko','en','vi']){const html=buildIssuedInvoicePrintHtml({status:'ISSUED',snapshot:server.snapshot},language);assert.match(html,/Polybag purchase/);assert.match(html,/1,250.1234/);assert.doesNotMatch(html,/MANUFACTURING SERVICE INVOICE|invoice-billing/);}
 }
 assert.throws(()=>calculateGeneralInvoice({currency:'VND',fields:fields(),lines:[line({quantity:'0'})]},codes));
 assert.throws(()=>calculateGeneralInvoice({currency:'VND',fields:fields(),lines:[line({description:''})]},codes));
 assert.throws(()=>calculateGeneralInvoice({currency:'VND',fields:fields(),lines:[line()]},new Map([[1,{id:1,cashDirection:'OUT',vatEnabled:true}]])));
 assert.deepEqual(generalInvoiceBuyerScope(7).OR,[{ownerOrgId:7},{buyerWorkOrders:{some:{sellerOrgId:7}}}]);
});

test('Prisma/PostgreSQL: own-customer drafts, exact retries, issue, immutable snapshot, correction and receipt evidence without fake orders',async t=>{
 const f=await changeApprovalFixture(),db=f.db;
 try{
  const s=await seedChangeApproval(db),org=s.company.id,buyer=s.vendor.id,code=s.code.id;
  const body={clientKey:randomUUID(),documentKind:'GENERAL',buyerOrgId:buyer,orders:[],basis:null,currency:'USD',total:'1',fields:fields(),percentages:{},settlements:{},lines:[line({transactionCodeId:code,quantity:'1000',unitPrice:'1.25',vatRate:'0',amount:'1'})]};
  let draft,invoice;
  await t.test('general source scope and code are checked before any draft is saved',async()=>{
   await assert.rejects(saveInvoiceDraft(db,org,'actor',{...body,buyerOrgId:s.other.id}),/BUYER_INVALID/);
   await assert.rejects(saveInvoiceDraft(db,org,'actor',{...body,lines:[{...body.lines[0],transactionCodeId:999999}]}),/BILLING_CODE_INVALID/);
   assert.equal(await db.invoiceDraft.count(),0);
  });
  await t.test('save/reload and lost-response retries keep one draft and never create a source order',async()=>{
   draft=await saveInvoiceDraft(db,org,'actor',body);
   assert.equal((await saveInvoiceDraft(db,org,'actor',body)).id,draft.id);
   const edited={...body,revision:draft.revision,fields:{...body.fields,notes:'Updated purchase'}};
   draft=await saveInvoiceDraft(db,org,'actor',edited,draft.id);
   assert.equal((await saveInvoiceDraft(db,org,'actor',edited,draft.id)).revision,draft.revision);
   await assert.rejects(saveInvoiceDraft(db,org,'actor',{...edited,lines:[{...body.lines[0],quantity:'999'}]},draft.id),/STALE/);
   assert.equal(await db.workOrder.count(),0);assert.equal(await db.invoiceDraftOrder.count(),0);assert.equal(await db.invoiceDraftLine.count(),0);
  });
  await t.test('issue is atomic and idempotent with scoped code FKs and a frozen issued snapshot',async()=>{
   invoice=await issueInvoiceDraft(db,org,'actor',draft.id,draft.revision);
   assert.equal(invoice.documentKind,'GENERAL');assert.equal(invoice.pricingBasis,null);assert.equal(String(invoice.total),'1250');
   assert.equal((await issueInvoiceDraft(db,org,'actor',draft.id,draft.revision)).id,invoice.id);
   assert.equal(await db.invoiceOrder.count(),0);assert.equal(await db.invoiceLine.count(),0);assert.equal(await db.invoiceGeneralLine.count(),1);
   await assert.rejects(db.invoice.update({where:{id:invoice.id},data:{total:'1'}}),/IMMUTABLE/);
   const issuedLine=await db.invoiceGeneralLine.findFirst({where:{invoiceId:invoice.id}});
   await assert.rejects(db.invoiceGeneralLine.update({where:{id:issuedLine.id},data:{description:'Changed'}}),/IMMUTABLE/);
   await assert.rejects(db.invoiceGeneralLine.delete({where:{id:issuedLine.id}}),/IMMUTABLE/);
   const before=await db.invoice.count();
   await assert.rejects(db.invoice.create({data:{...invoice,id:randomUUID(),clientKey:randomUUID(),invoiceNumber:'INVALID-COPY',sequenceNumber:invoice.sequenceNumber+1,total:'1',receivableAdded:'1',snapshot:{...invoice.snapshot,total:'1'}}}),/TOTALS_INVALID/);
   assert.equal(await db.invoice.count(),before,'a header without its exact lines rolls back');
  });
  await t.test('list and receipt search find local, linked and common customer codes without changing invoice snapshots or company scope',async()=>{
   const {companyNameCodeSearch}=require('../backend/dist/services/companySearch');
   const {registerInvoiceDraftRoutes}=require('../backend/dist/routes/invoiceDraft.routes');
   const {searchLedgerEvidence}=require('../backend/dist/services/bankLedger');
   const before=await db.invoice.findUnique({where:{id:invoice.id}});
   await db.organization.update({where:{id:buyer},data:{code:'BARO',country:'VN',businessNumber:'123456789'}});
   const set=await db.employeeGradeSet.create({data:{orgId:s.other.id,code:'SEARCH',name:'Search grades'}});
   const grade=await db.employeeGrade.create({data:{orgId:s.other.id,setId:set.id,code:'ADMIN',name:'Admin',nameKo:'Admin',nameEn:'Admin',nameVi:'Admin',sortOrder:0}});
   await db.employee.create({data:{orgId:s.other.id,name:'Other company member',orgRole:'ADMIN',status:'ACTIVE',gradeId:grade.id}});
   await db.companyPartnerLink.create({data:{orgId:org,entityId:buyer,targetOrgId:s.other.id,createdByEmployeeId:s.people.admin.id,matchMethod:'CONFIRMED'}});
   const anchor=await db.organization.create({data:{name:'Different public name',code:'IDEN',type:'SERVICE',country:'VN',businessNumber:'123456789'}});
   const identity=await db.companyIdentity.create({data:{anchorEntityId:anchor.id,name:anchor.name,code:anchor.code,country:'VN',businessNumber:'123456789'}});
   await db.companyIdentityLink.create({data:{orgId:org,entityId:buyer,identityId:identity.id,createdByEmployeeId:s.people.admin.id}});
   const handlers=new Map(),app=Object.fromEntries(['get','post','put','delete'].map(method=>[method,(path,fn)=>handlers.set(method+path,fn)]));
   registerInvoiceDraftRoutes(app,{db,requireAccess:async()=>({organization:{id:org}}),actor:()=> 'actor'});
   for(const search of ['baro',s.other.code.toLowerCase(),'iden']){
    let response;await handlers.get('get/invoices/issued')({query:{search}},{setHeader(){},json(body){response=body;}});
    assert.deepEqual(response.rows.map(row=>row.id),[invoice.id]);assert.equal(response.rows[0].documentKind,'GENERAL');
    assert.deepEqual((await searchLedgerEvidence(db,org,{type:'INVOICE',currencyCode:'USD',search})).documents.map(row=>row.id),[invoice.id]);
    assert.deepEqual(await db.invoice.findMany({where:{sellerOrgId:s.other.id,buyer:companyNameCodeSearch(s.other.id,search)}}),[]);
   }
   assert.deepEqual(await db.organization.findMany({where:{id:buyer,...companyNameCodeSearch(s.other.id,'IDEN')}}),[],'another company cannot search through our identity links');
   assert.deepEqual((await db.invoice.findUnique({where:{id:invoice.id}})).snapshot,before.snapshot);
  });
  await t.test('general invoices support existing partial receipt evidence and preserve receipt history through revisions',async()=>{
   const evidence=await db.$transaction(tx=>resolveEvidence(tx,org,{currencyCode:'USD'},{evidenceType:'INVOICE',direction:'IN',evidenceNumber:invoice.invoiceNumber,amount:'400.00',bankFee:'0'}));
   assert.equal(evidence.allocations[0].invoiceId,invoice.id);assert.equal(evidence.allocations[0].amount,'400.00');
   const payment=await recordInvoicePayment(db,org,'actor',invoice.id,{clientKey:randomUUID(),amount:'400',receivedAt:'2026-11-10',reference:'Receipt',note:''});
   const revision=await createInvoiceRevisionDraft(db,org,'actor',invoice.id,{clientKey:randomUUID(),reason:'Correct the purchase price'});
   const revised=await saveInvoiceDraft(db,org,'actor',{...revision.content,buyerOrgId:buyer,clientKey:revision.clientKey,revision:revision.revision,lines:revision.content.lines.map(row=>({...row,unitPrice:'1.50'}))},revision.id);
   const issued=await issueInvoiceDraft(db,org,'actor',revised.id,revised.revision);
   const original=await db.invoice.findUnique({where:{id:invoice.id}});
   assert.equal(original.status,'SUPERSEDED');assert.equal(original.snapshot.total,'1250');assert.equal(String(issued.total),'1500');
   assert.equal((await db.invoicePayment.findUnique({where:{id:payment.id}})).invoiceId,invoice.id);
   const family=await db.invoice.findMany({where:{sellerOrgId:org},include:{payments:true,credits:true}}),balance=invoiceFamilyBalance(family,invoice.id);
   assert.equal(balance.receivedAmount,'400.0000');assert.equal(balance.debtAmount,'1500.0000');
   assert.equal(await db.workOrder.count(),0);
   await cancelIssuedInvoice(db,org,'actor',issued.id,'Cancelled purchase');
   assert.equal((await db.invoice.findUnique({where:{id:issued.id}})).status,'CANCELLED');
  });
 }finally{await f.close();}
});
