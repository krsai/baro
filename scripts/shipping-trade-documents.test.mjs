import test from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {createHash,randomUUID} from 'node:crypto';
import {changeApprovalFixture,seedChangeApproval} from './helpers/change-approval-fixture.mjs';
import {shippingTradeHtml} from '../frontend/src/utils/shippingTradePrint.mjs';
import {tradeInvoiceAmounts} from '../frontend/src/utils/shippingTradeMath.mjs';
const require=createRequire(import.meta.url);
const {saveFreight}=require('../backend/dist/services/freightOperations');
const {saveShippingTradeDocument}=require('../backend/dist/services/shippingTradeDocuments');
const {jobDetail}=require('../backend/dist/services/freightJobs');
const party={name:'SAVED CUSTOMER',taxId:'TAX-1',address:'HANOI, VIETNAM',contactName:'CONTACT',phone:'00123',email:'contact@example.test'};
const ci=()=>({number:'CI-001',date:'2026-11-23',seller:party,buyer:{...party,name:'BUYER'},currencyCode:'USD',incoterms:'FOB',paymentTerms:'30 DAYS',remarks:'Saved remarks',lines:[{description:'JACKETS',quantity:'3',unit:'PCS',unitPrice:'0.3350',hsCode:'6201',origin:'VN'}]});

test('commercial invoice/packing form snapshots, original files, migration retry and company isolation',async()=>{
 const f=await changeApprovalFixture();try{
  const db=f.db,s=await seedChangeApproval(db),org=s.company.id,actor=s.people.admin.id;
  const job=await saveFreight(db,org,actor,'jobs',{clientKey:randomUUID(),customerId:s.vendor.id,mode:'SEA',data:{origin:'HANOI',destination:'SEOUL',shipper:'SENDER',consignee:'RECEIVER'}});
  const financialBefore={invoice:await db.invoice.count(),ledger:await db.bankLedgerEntry.count(),cost:await db.partnerTransactionCost.count()};
  const input={clientKey:randomUUID(),version:job.version,kind:'COMMERCIAL_INVOICE',sourceMode:'FORM',fields:ci()};
  const saved=await saveShippingTradeDocument(db,org,actor,job.id,input);assert.equal(saved.snapshot.tradeDocument.fields.total,'1.01');assert.equal(saved.snapshot.tradeDocument.fields.seller.name,party.name);
  assert.deepEqual(tradeInvoiceAmounts(input.fields.lines,'USD'),{amounts:['1.01'],total:'1.01'});assert.equal(tradeInvoiceAmounts([{quantity:'3',unitPrice:''}],'USD').total,null);
  assert.match(shippingTradeHtml(saved),/0\.3350/,'unit-price precision is printed without rounding it to two digits');
  await assert.rejects(saveShippingTradeDocument(db,org,actor,job.id,{...input,clientKey:randomUUID(),fields:{...ci(),lines:[{...ci().lines[0],unitPrice:''}]}}),/SHIPPING_TRADE_DOCUMENT_INVALID/);
  assert.equal((await saveShippingTradeDocument(db,org,actor,job.id,input)).id,saved.id);
  await assert.rejects(saveShippingTradeDocument(db,org,actor,job.id,{...input,fields:{...ci(),number:'CI-CHANGED'}}),/FREIGHT_KEY_CONFLICT/);
  await assert.rejects(saveShippingTradeDocument(db,org,actor,job.id,{...input,clientKey:randomUUID(),version:0}),/FREIGHT_CHANGED/);
  await assert.rejects(saveShippingTradeDocument(db,org,actor,job.id,{...input,clientKey:randomUUID(),fields:{...ci(),date:'2026-02-31'}}),/SHIPPING_TRADE_DOCUMENT_INVALID/);
  await assert.rejects(saveShippingTradeDocument(db,org,actor,job.id,{...input,clientKey:randomUUID(),fields:{...ci(),currencyCode:'BAD'}}),/SHIPPING_TRADE_DOCUMENT_INVALID/);
  const packing={...ci(),number:'PL-001',lines:[{description:'JACKETS',marks:'MARK-1',packages:'2',quantity:'3',unit:'PCS',netWeightKg:'1.1',grossWeightKg:'1.2',cbm:'0.23'}]};
  const pl=await saveShippingTradeDocument(db,org,actor,job.id,{...input,clientKey:randomUUID(),kind:'PACKING_LIST',fields:packing});assert.deepEqual(pl.snapshot.tradeDocument.fields.totals,{packages:'2',netWeightKg:'1.1000',grossWeightKg:'1.2000',cbm:'0.2300'});
  await assert.rejects(saveShippingTradeDocument(db,org,actor,job.id,{...input,clientKey:randomUUID(),kind:'PACKING_LIST',fields:{...packing,lines:[{...packing.lines[0],netWeightKg:'99'}]}}),/SHIPPING_TRADE_DOCUMENT_INVALID/);
  const bytes=Buffer.from('%PDF-1.4\nOriginal customer document\n%%EOF'),file={name:'customer-original.pdf',mimeType:'application/pdf',base64:bytes.toString('base64')};
  const upload={clientKey:randomUUID(),version:job.version,kind:'COMMERCIAL_INVOICE',sourceMode:'FILE',file};
  const original=await saveShippingTradeDocument(db,org,actor,job.id,upload);assert.deepEqual(Buffer.from(original.snapshot.tradeDocument.file.base64,'base64'),bytes);assert.equal(original.snapshot.tradeDocument.file.sha256,createHash('sha256').update(bytes).digest('hex'));assert.equal((await saveShippingTradeDocument(db,org,actor,job.id,upload)).id,original.id);
  await assert.rejects(saveShippingTradeDocument(db,org,actor,job.id,{...upload,clientKey:randomUUID(),file:{...file,name:'evil.html',mimeType:'text/html'}}),/SHIPPING_TRADE_DOCUMENT_INVALID/);
  await assert.rejects(saveShippingTradeDocument(db,org,actor,job.id,{...upload,clientKey:randomUUID(),file:{...file,base64:Buffer.from('not a PDF').toString('base64')}}),/SHIPPING_TRADE_DOCUMENT_INVALID/);
  await assert.rejects(saveShippingTradeDocument(db,org,actor,job.id,{...upload,clientKey:randomUUID(),file:{...file,base64:Buffer.alloc(2*1024*1024+1,1).toString('base64')}}),/SHIPPING_TRADE_DOCUMENT_INVALID/);
  const otherSet=await db.employeeGradeSet.create({data:{orgId:s.other.id,code:'OTHER',name:'Other grades'}});
  const otherGrade=await db.employeeGrade.create({data:{orgId:s.other.id,setId:otherSet.id,code:'ADMIN',name:'Admin',nameKo:'Admin',nameEn:'Admin',nameVi:'Admin',sortOrder:1}});
  const otherActor=await db.employee.create({data:{orgId:s.other.id,gradeId:otherGrade.id,name:'Other operator',orgRole:'ADMIN',status:'ACTIVE'}});
  await assert.rejects(saveShippingTradeDocument(db,s.other.id,otherActor.id,job.id,input),/FREIGHT_NOT_FOUND/);
  await assert.rejects(db.$executeRawUnsafe('UPDATE "FreightDocument" SET number=\'MUTATED\' WHERE id=$1',original.id),/FREIGHT_HISTORY_IMMUTABLE/);
  const detail=await jobDetail(db,org,actor,job.id);assert.equal(detail.documents.length,3);assert.equal(detail.documents.find(row=>row.id===original.id).sourceMode,'FILE');assert.ok(!JSON.stringify(detail.documents).includes(file.base64),'list never returns original bytes');assert.deepEqual(detail.data,job.data);
  assert.deepEqual({invoice:await db.invoice.count(),ledger:await db.bankLedgerEntry.count(),cost:await db.partnerTransactionCost.count()},financialBefore);
  const migration=require('../backend/scripts/migrate-entity-profiles').migrations().find(row=>row.version==='20261123010000_shipping_trade_documents');assert.ok(migration);await f.pg.exec(migration.sql);await f.pg.exec(migration.sql);assert.equal((await db.$queryRawUnsafe('SELECT baro_shipping_trade_documents_ready() AS ready'))[0].ready,true);assert.equal((await jobDetail(db,org,actor,job.id)).documents.length,3);
  assert.match(shippingTradeHtml(saved),/COMMERCIAL INVOICE/);assert.match(shippingTradeHtml(saved),/1\.01/);assert.match(shippingTradeHtml(pl),/PACKING LIST/);assert.doesNotMatch(shippingTradeHtml(pl),/Unit price/);assert.throws(()=>shippingTradeHtml(original),/CUSTOMER_ORIGINAL_DOWNLOAD_REQUIRED/);
 }finally{await f.close();}
});
