import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createRequire} from 'node:module';
import {randomUUID} from 'node:crypto';
import {parseVolumeInput} from '../frontend/src/utils/volumeFormula.mjs';
import {changeApprovalFixture,seedChangeApproval} from './helpers/change-approval-fixture.mjs';
const require=createRequire(import.meta.url);
const server=require('../backend/dist/utils/volumeFormula');
const {shippingCargo}=require('../backend/dist/services/shippingCargo');
const {saveFreight}=require('../backend/dist/services/freightOperations');
const {saveJobOperationDetails}=require('../backend/dist/services/freightJobWorkflow');
const {transportSnapshot}=require('../backend/dist/services/transportExchange');
test('exact arithmetic preserves the entered formula without quantity inference or executable expressions',()=>{
 assert.equal(readFileSync('backend/src/utils/volumeFormula.js','utf8'),readFileSync('frontend/src/utils/volumeFormula.mjs','utf8'));
 for(const [input,expected] of [['=0.5*0.5*0.3','0.075'],['=0.5*0.5*0.3*2','0.15'],['0.15','0.15'],['=0.1+0.2','0.3'],['=(1+2)/7','0.428571'],['=1-1','0'],['=10*10','100'],['=1/3','0.333333']]){
  const parsed=parseVolumeInput(input);assert.equal(parsed.cbm,expected);assert.deepEqual(server.parseVolumeInput(input),parsed);
 }
 for(const input of ['=1/0','=1-2','=alert(1)','=1e3','=2**3','=2;3','=2(3)','=1+','='.repeat(201),'='.concat('('.repeat(30),'1',')'.repeat(30)),'=10000000000'])assert.equal(parseVolumeInput(input),null,input);
 const cargo={cargoSchemaVersion:1,cargo:'Goods',shipmentType:'AIR',quantity:'2',unit:'PKG',weightKg:'3',cbm:'0.075',cbmFormula:'=0.5*0.5*0.3'};
 assert.equal(shippingCargo(cargo,'AIR').cbm,'0.075');assert.equal(shippingCargo(cargo,'AIR').cbmFormula,cargo.cbmFormula);
 assert.throws(()=>shippingCargo({...cargo,cbm:'0.15'},'AIR'),/SHIPPING_CARGO_INVALID/);
 assert.equal(transportSnapshot({mode:'AIR',data:cargo}).data.cbmFormula,undefined);
});
test('SR formula persistence and work-only edits preserve revisions, originals and company boundaries',async()=>{
 const f=await changeApprovalFixture();try{
  const db=f.db,s=await seedChangeApproval(db),orgId=s.company.id,actorId=s.people.admin.id;
  const input={clientKey:randomUUID(),mode:'AIR',customerId:s.vendor.id,data:{cargoSchemaVersion:1,cargo:'Goods',shipmentType:'AIR',quantity:'2',unit:'PKG',weightKg:'3',cbm:'0.075',cbmFormula:'=0.5*0.5*0.3',customerRole:'shipper',shipperId:s.vendor.id,consigneeParty:{name:'Buyer'}}};
  const job=await saveFreight(db,orgId,actorId,'jobs',input);assert.equal(job.data.cbm,'0.075');assert.equal(job.data.cbmFormula,input.data.cbmFormula);
  const original=job.requestSnapshot;
  const update={version:job.version,requestId:randomUUID(),fields:{cbm:'0.15',cbmFormula:'=0.5*0.5*0.3*2'}};
  const edited=await saveJobOperationDetails(db,orgId,actorId,job.id,update);
  assert.equal(edited.data.workDetails.cbm,'0.15');assert.equal(edited.data.workDetails.cbmFormula,update.fields.cbmFormula);assert.equal(edited.data.cbm,'0.075');assert.deepEqual(edited.requestSnapshot,original);
  assert.equal((await saveJobOperationDetails(db,orgId,actorId,job.id,update)).version,edited.version);
  await assert.rejects(saveJobOperationDetails(db,orgId,actorId,job.id,{version:edited.version,requestId:randomUUID(),fields:{cbm:'99',cbmFormula:'=0.5*0.5*0.3'}}),/FREIGHT_INVALID_INPUT/);
  await assert.rejects(saveJobOperationDetails(db,s.other.id,actorId,job.id,{...update,requestId:randomUUID()}),/ACTIVE_EMPLOYEE_REQUIRED/);
  const direct=await saveJobOperationDetails(db,orgId,actorId,job.id,{version:edited.version,requestId:randomUUID(),fields:{cbm:'0.2'}});
  assert.equal(direct.data.workDetails.cbmFormula,'');assert.deepEqual(direct.requestSnapshot,original);
 }finally{await f.close();}
});
