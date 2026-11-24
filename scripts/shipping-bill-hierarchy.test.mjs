import test from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {randomUUID} from 'node:crypto';
import {readFileSync} from 'node:fs';
import {changeApprovalFixture,seedChangeApproval} from './helpers/change-approval-fixture.mjs';
import {billHierarchy,initialBillData,requiresBillHierarchy} from '../frontend/src/utils/shippingBillData.mjs';
import {shippingChargeAmount,shippingChargeTotals} from '../frontend/src/utils/shippingChargeTotals.mjs';
const require=createRequire(import.meta.url);
const {saveFreight}=require('../backend/dist/services/freightOperations');
const {saveJobBill,jobDetail,saveDocumentSetup,registerJobRoutes}=require('../backend/dist/services/freightJobs');
const {shippingCharges,saveShippingCharge}=require('../backend/dist/services/shippingRequests');
const {createJobDocument}=require('../backend/dist/services/freightJobWorkflow');
const {transportSnapshot}=require('../backend/dist/services/transportExchange');
const {freightDocumentHtml}=await import('../frontend/src/utils/freightPrint.js');

test('job routes no longer expose document composition setup',()=>{
 const routes=[],app=Object.fromEntries(['get','post','put','delete'].map(method=>[method,(path)=>routes.push(method+' '+path)]));
 registerJobRoutes(app,{},()=>{});
 assert.ok(routes.includes('post /freight/transport-jobs/:id/bills'));
 assert.ok(routes.includes('delete /freight/transport-jobs/:id/bills/:billId'));
 assert.ok(!routes.some(route=>route.includes('document-setup')));
});

test('optional document migration retries preserve original rows and protect saved document references',async()=>{
 const f=await changeApprovalFixture();try{
  const db=f.db,s=await seedChangeApproval(db),org=s.company.id,actor=s.people.admin.id;
  const job=await saveFreight(db,org,actor,'jobs',{clientKey:randomUUID(),customerId:s.vendor.id,mode:'SEA',data:{origin:'HANOI',destination:'BUSAN',shipper:'SENDER',consignee:'BUYER'}});
  const legacy=await saveDocumentSetup(db,org,actor,job.id,{version:job.version,composition:'MASTER_ONLY',documentType:'BILL_OF_LADING'});
  const master=await saveJobBill(db,org,actor,job.id,{id:randomUUID(),kind:'MASTER',number:'MBL'});
  const house=await saveJobBill(db,org,actor,job.id,{id:randomUUID(),kind:'HOUSE',number:'HBL'});
  assert.equal(house.masterId,null);
  const linked=await saveJobBill(db,org,actor,job.id,{...house,masterId:master.id},house.id);
  const detached=await saveJobBill(db,org,actor,job.id,{...linked,masterId:null},house.id);
  assert.equal(detached.masterId,null);
  await assert.rejects(saveJobBill(db,org,actor,job.id,{version:house.version},house.id,true),/FREIGHT_CHANGED/);
  await saveJobBill(db,org,actor,job.id,{version:detached.version},house.id,true);
  const houseOnly=await saveJobBill(db,org,actor,job.id,{id:randomUUID(),kind:'HOUSE',number:'HBL-ONLY'});
  const houseCopy=await createJobDocument(db,org,actor,job.id,{clientKey:randomUUID(),version:legacy.version,kind:'HOUSE_DRAFT',billId:houseOnly.id});
  assert.equal(houseCopy.snapshot.source.master,null);
  await assert.rejects(saveJobBill(db,org,actor,job.id,{version:houseOnly.version},houseOnly.id,true),/FREIGHT_BILL_HAS_DOCUMENTS/);
  const copy=await createJobDocument(db,org,actor,job.id,{clientKey:randomUUID(),version:legacy.version,kind:'MASTER_DRAFT',billId:master.id});
  await assert.rejects(saveJobBill(db,org,actor,job.id,{version:master.version},master.id,true),/FREIGHT_BILL_HAS_DOCUMENTS/);
  await assert.rejects(db.$executeRawUnsafe('UPDATE "FreightBill" SET "deletedAt"=CURRENT_TIMESTAMP,version=version+1 WHERE id=$1',master.id),/FREIGHT_BILL_HAS_DOCUMENTS/);
  const sql=readFileSync(new URL('../backend/prisma/migrations/20261124010000_shipping_optional_documents/migration.sql',import.meta.url),'utf8');
  await f.pg.exec(sql);await f.pg.exec(sql);
  assert.deepEqual((await jobDetail(db,org,actor,job.id)).data,legacy.data);
  assert.deepEqual((await db.$queryRawUnsafe('SELECT snapshot FROM "FreightDocument" WHERE id=$1',copy.id))[0].snapshot,copy.snapshot);
  await assert.rejects(saveJobBill(db,s.other.id,actor,job.id,{id:randomUUID(),kind:'MASTER',number:'FOREIGN'}),/ACTIVE_EMPLOYEE_REQUIRED/);
 }finally{await f.close();}
});

test('Optional attachments allow shipment, MBL and HBL charges without legacy composition restrictions',async()=>{
 const f=await changeApprovalFixture();try{
  const db=f.db,s=await seedChangeApproval(db),org=s.company.id,actor=s.people.admin.id;
  const job=await saveFreight(db,org,actor,'jobs',{clientKey:randomUUID(),customerId:s.vendor.id,mode:'SEA',data:{origin:'HANOI',destination:'BUSAN',shipper:'SENDER',consignee:'BUYER'}});
  const one=await saveDocumentSetup(db,org,actor,job.id,{version:job.version,composition:'MASTER_ONLY',documentType:'BILL_OF_LADING'});
  const master=await saveJobBill(db,org,actor,job.id,{id:randomUUID(),kind:'MASTER',number:'M-ONE',data:{shipper:'MASTER SENDER',consignee:'MASTER BUYER',cargo:'MASTER CARGO'}});
  const dc={id:randomUUID(),billId:master.id,direction:'SALES',description:'Freight',currencyCode:'USD',amount:'100'};
  const saved=await saveShippingCharge(db,org,actor,job.id,dc);
  await saveShippingCharge(db,org,actor,job.id,{...dc,id:randomUUID(),billId:null});
  const printed=await createJobDocument(db,org,actor,job.id,{clientKey:randomUUID(),version:one.version,kind:'MASTER_DRAFT',billId:master.id});
  assert.equal(printed.snapshot.source.bill.kind,'MASTER');assert.equal(printed.snapshot.source.data.cargo,'MASTER CARGO');
  assert.match(freightDocumentHtml(printed,{}),/MASTER BILL OF LADING/);
  await assert.rejects(createJobDocument(db,org,actor,job.id,{clientKey:randomUUID(),version:one.version,kind:'HOUSE_DRAFT',billId:master.id}),/FREIGHT_DOCUMENT_REQUIRED/);
  const combined=await saveDocumentSetup(db,org,actor,job.id,{version:one.version,composition:'MASTER_HOUSE',documentType:'BILL_OF_LADING'});
  const house=await saveJobBill(db,org,actor,job.id,{id:randomUUID(),kind:'HOUSE',number:'H-ONE',masterId:master.id});
  await saveShippingCharge(db,org,actor,job.id,{...dc,id:randomUUID()});
  const revised=await saveShippingCharge(db,org,actor,job.id,{...dc,version:saved.version,amount:'101'});
  assert.equal((await saveShippingCharge(db,org,actor,job.id,{...dc,amount:'101',version:revised.version})).version,revised.version);
  await saveShippingCharge(db,org,actor,job.id,{...dc,id:randomUUID(),billId:house.id});
  await assert.rejects(createJobDocument(db,org,actor,job.id,{clientKey:randomUUID(),version:combined.version,kind:'MASTER_DRAFT',billId:house.id}),/FREIGHT_DOCUMENT_REQUIRED/);
  assert.equal((await shippingCharges(db,org,actor,job.id)).rows.find(row=>row.id===dc.id).amount,'101.0000');
  assert.deepEqual((await db.$queryRawUnsafe('SELECT snapshot FROM "FreightDocument" WHERE id=$1',printed.id))[0].snapshot,printed.snapshot);
 }finally{await f.close();}
});

test('SR, bill hierarchy, separate bill snapshots and scoped AR/AP preserve original records',async()=>{
 const f=await changeApprovalFixture();try{
  const db=f.db,s=await seedChangeApproval(db),org=s.company.id,actor=s.people.admin.id;
  const job=await saveFreight(db,org,actor,'jobs',{clientKey:randomUUID(),customerId:s.vendor.id,mode:'SEA',data:{origin:'HANOI',destination:'BUSAN',shipper:'SR SENDER',consignee:'SR BUYER',cargo:'SR CARGO',quantity:2,weightKg:'12'}});
  const original=structuredClone(job.data);
  const single=await saveFreight(db,org,actor,'jobs',{clientKey:randomUUID(),customerId:s.vendor.id,mode:'SEA',data:{origin:'HANOI',destination:'BUSAN',shipper:'SENDER',consignee:'BUYER'}});
  const singleSetup=await saveDocumentSetup(db,org,actor,single.id,{version:single.version,composition:'MASTER_ONLY',documentType:'BILL_OF_LADING'});
  const oneMaster=await saveJobBill(db,org,actor,single.id,{id:randomUUID(),kind:'MASTER',number:'SINGLE'});
  await saveJobBill(db,org,actor,single.id,{id:randomUUID(),kind:'MASTER',number:'EXTRA'});
  await saveJobBill(db,org,actor,single.id,{id:randomUUID(),kind:'HOUSE',masterId:oneMaster.id,number:'OPTIONAL HBL'});

  await saveJobBill(db,org,actor,single.id,{id:randomUUID(),kind:'HOUSE',masterId:oneMaster.id,number:'NOW ALLOWED'});
  const master=await saveJobBill(db,org,actor,job.id,{id:randomUUID(),kind:'MASTER',number:'MASTER-1',data:{shipper:'FORWARDER',consignee:'AGENT',vessel:'VESSEL A',cargo:'MASTER CARGO'}});
  const master2=await saveJobBill(db,org,actor,job.id,{id:randomUUID(),kind:'MASTER',number:'MASTER-2'});
  const standalone=await saveJobBill(db,org,actor,job.id,{id:randomUUID(),kind:'HOUSE',number:'STANDALONE'});assert.equal(standalone.masterId,null);await saveJobBill(db,org,actor,job.id,{version:standalone.version},standalone.id,true);
  const request={id:randomUUID(),kind:'HOUSE',masterId:master.id,number:'HOUSE-1',data:{shipper:'CUSTOMER',consignee:'IMPORTER',cargo:'HOUSE CARGO',quantity:'29',weightKg:'425.0000',cbm:'2.1800'}};
  const house=await saveJobBill(db,org,actor,job.id,request);
  assert.equal((await saveJobBill(db,org,actor,job.id,request)).id,house.id);
  assert.equal((await jobDetail(db,org,actor,job.id)).bills.find(row=>row.id===house.id).masterId,master.id);

  await assert.rejects(saveJobBill(db,org,actor,job.id,{...house,data:{operations:{tasks:[]}}},house.id),/FREIGHT_INVALID_INPUT/);
  const changed=await saveJobBill(db,org,actor,job.id,{...house,data:{...house.data,cargo:'UPDATED HOUSE CARGO'}},house.id);
  assert.equal((await saveJobBill(db,org,actor,job.id,{...house,data:{...house.data,cargo:'UPDATED HOUSE CARGO'}},house.id)).version,changed.version);
  const charge={id:randomUUID(),billId:house.id,direction:'SALES',description:'Freight',currencyCode:'USD',quantity:'29',unitPrice:'10.125',amount:'293.6250',sourceKind:'MANUAL'};
  const ar=await saveShippingCharge(db,org,actor,job.id,charge);
  assert.equal((await saveShippingCharge(db,org,actor,job.id,charge)).version,ar.version);
  await saveShippingCharge(db,org,actor,job.id,{...charge,id:randomUUID(),billId:master.id,direction:'PURCHASE',quantity:'1',unitPrice:'200',amount:'200',sourceKind:'MANUAL'});
  await saveShippingCharge(db,org,actor,job.id,{...charge,id:randomUUID(),description:'Additional handling',quantity:'2',unitPrice:'12.50',amount:'25',sourceKind:'ADDITIONAL'});
  await assert.rejects(saveShippingCharge(db,org,actor,job.id,{...charge,id:randomUUID(),amount:'1'}),/SHIPPING_INVALID/);
  await assert.rejects(saveJobBill(db,org,actor,job.id,{version:changed.version},house.id,true),/FREIGHT_BILL_HAS_CHARGES/);
  await assert.rejects(saveJobBill(db,org,actor,job.id,{version:master.version},master.id,true),/FREIGHT_MASTER_HAS_HOUSES/);
  const otherJob=await saveFreight(db,org,actor,'jobs',{clientKey:randomUUID(),customerId:s.vendor.id,mode:'SEA',data:{origin:'HANOI',destination:'BUSAN',shipper:'OTHER',consignee:'OTHER',cargo:'OTHER'}});
  await assert.rejects(saveJobBill(db,org,actor,otherJob.id,{...request,id:randomUUID()}),/FREIGHT_MASTER_SCOPE/);
  await assert.rejects(saveShippingCharge(db,org,actor,otherJob.id,{...charge,id:randomUUID()}),/SHIPPING_BILL_SCOPE/);
  await assert.rejects(shippingCharges(db,s.other.id,actor,job.id),/ACTIVE_EMPLOYEE_REQUIRED/);
  await assert.rejects(saveShippingCharge(db,org,999999,job.id,charge),/ACTIVE_EMPLOYEE_REQUIRED/);
  const charges=await shippingCharges(db,org,actor,job.id);assert.equal(charges.rows.length,3);assert.equal(charges.rows.filter(row=>row.billId===house.id).length,2);
  const draft=await createJobDocument(db,org,actor,job.id,{clientKey:randomUUID(),version:job.version,kind:'HOUSE_DRAFT',billId:house.id});
  assert.equal(draft.snapshot.source.data.shipper,'CUSTOMER');assert.equal(draft.snapshot.source.data.cargo,'UPDATED HOUSE CARGO');assert.equal(draft.snapshot.source.master.id,master.id);assert.equal(draft.snapshot.source.bill.version,changed.version);
  assert.deepEqual((await jobDetail(db,org,actor,job.id)).data,original);
  assert.equal(transportSnapshot({...job,bills:[master,house],charges:charges.rows}).bills,undefined);
  assert.equal((await db.$queryRawUnsafe('SELECT count(*)::int AS count FROM "FreightAudit" WHERE entity=\'charge-drafts\''))[0].count,3);
  await assert.rejects(db.$executeRawUnsafe('UPDATE "FreightBill" SET "deletedAt"=CURRENT_TIMESTAMP,version=version+1 WHERE id=$1',house.id),/FREIGHT_BILL_HAS_CHARGES/);
  await assert.rejects(db.$executeRawUnsafe('UPDATE "ShippingChargeDraft" SET "billId"=$1,version=version+1 WHERE id=$2',master2.id+'missing',ar.id),/SHIPPING_BILL_SCOPE/);
  assert.equal((await db.$queryRawUnsafe('SELECT count(*)::int AS count FROM "BankLedgerEntry"'))[0].count,0);
 }finally{await f.close();}
});
test('bill navigation groups actual master IDs and charge arithmetic is exact',()=>{
 assert.equal(requiresBillHierarchy({mode:'SEA',service:'GENERAL'}),true);
 assert.equal(requiresBillHierarchy({mode:'AIR',service:'GENERAL'}),true);
 assert.equal(requiresBillHierarchy({mode:'ROAD',service:'GENERAL'}),false);
 assert.equal(requiresBillHierarchy({mode:'AIR',service:'EXPRESS'}),false);
 const rows=[{id:'h2',kind:'HOUSE',masterId:'m2'},{id:'m1',kind:'MASTER'},{id:'h1',kind:'HOUSE',masterId:'m1'},{id:'m2',kind:'MASTER'},{id:'old',kind:'HOUSE',masterId:null}];
 assert.deepEqual(billHierarchy(rows).map(row=>row.id),['m1','h1','m2','h2','old']);
 const data=initialBillData({data:{shipper:'SR SENDER',vessel:'SR VESSEL'}},{data:{cargo:'HOUSE CARGO'}},{data:{shipper:'MASTER SENDER',vessel:'MASTER VESSEL'}});
 assert.equal(data.shipper,'SR SENDER');assert.equal(data.vessel,'MASTER VESSEL');
 assert.equal(shippingChargeAmount('0.0001','0.5000'),'0.0001');assert.equal(shippingChargeAmount('29','10.125'),'293.6250');
 assert.equal(shippingChargeAmount('9999999999999999','1'),'9999999999999999.0000');
 assert.equal(shippingChargeTotals([{direction:'SALES',currencyCode:'USD',amount:'293.6250'},{direction:'PURCHASE',currencyCode:'USD',amount:'200'}])[0].difference,'93.6250');
});
test('road and express accept shipment charges without B/L; optional road bills keep their own charges',async()=>{
 const f=await changeApprovalFixture();try{
  const db=f.db,s=await seedChangeApproval(db),org=s.company.id,actor=s.people.admin.id;
  for(const [mode,service]of [['ROAD','GENERAL'],['AIR','EXPRESS']]){
   const job=await saveFreight(db,org,actor,'jobs',{clientKey:randomUUID(),customerId:s.vendor.id,mode,service,data:{origin:'HANOI',destination:'BUSAN',shipper:'SENDER',consignee:'BUYER'}});
   const original=structuredClone(job.data);
   await saveShippingCharge(db,org,actor,job.id,{id:randomUUID(),direction:'SALES',description:'Delivery',currencyCode:'USD',amount:'100'});
   await saveShippingCharge(db,org,actor,job.id,{id:randomUUID(),direction:'PURCHASE',description:'Transport',currencyCode:'USD',amount:'60'});
   assert.equal((await jobDetail(db,org,actor,job.id)).bills.length,0);
   assert.deepEqual((await jobDetail(db,org,actor,job.id)).data,original);
   assert.equal(shippingChargeTotals((await shippingCharges(db,org,actor,job.id)).rows)[0].difference,'40.0000');
   if(mode==='ROAD'){
    await saveDocumentSetup(db,org,actor,job.id,{version:job.version,composition:'MASTER_ONLY',documentType:'WAYBILL'});
    const master=await saveJobBill(db,org,actor,job.id,{id:randomUUID(),kind:'MASTER',number:'TRUCK-MASTER'});
    await saveShippingCharge(db,org,actor,job.id,{id:randomUUID(),billId:master.id,direction:'PURCHASE',description:'Additional',currencyCode:'USD',amount:'5'});
    const rows=(await shippingCharges(db,org,actor,job.id)).rows;
    assert.equal(rows.filter(row=>!row.billId).length,2);assert.equal(rows.filter(row=>row.billId===master.id).length,1);
    assert.equal(shippingChargeTotals(rows)[0].difference,'35.0000');
   }
  }
 }finally{await f.close();}
});
