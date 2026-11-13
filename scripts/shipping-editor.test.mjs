import test from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {randomUUID} from 'node:crypto';
import {changeApprovalFixture,seedChangeApproval} from './helpers/change-approval-fixture.mjs';
const require=createRequire(import.meta.url),{shippingCargo}=require('../backend/dist/services/shippingCargo'),{listShippingPresets,saveShippingPreset}=require('../backend/dist/services/shippingPresets'),{transportSnapshot}=require('../backend/dist/services/transportExchange'),{saveFreight}=require('../backend/dist/services/freightOperations');
test('mode-specific cargo, exact metres-to-CBM and explicit safe party snapshots',()=>{
 const data={cargoSchemaVersion:1,cargo:'Garments',shipmentType:'LCL',weightKg:'100',packages:[{quantity:'2',lengthM:'1.2',widthM:'0.5',heightM:'0.3'},{quantity:'3',lengthM:'1',widthM:'1',heightM:'1'}]};
 assert.equal(shippingCargo(data,'SEA').cbm,'3.360000');assert.equal(shippingCargo(data,'AIR').quantity,'5');
 assert.throws(()=>shippingCargo({...data,packages:[null]},'AIR'),/SHIPPING_CARGO_INVALID/);
 assert.throws(()=>shippingCargo({...data,weightKg:'0'},'AIR'),/SHIPPING_CARGO_INVALID/);
 assert.throws(()=>shippingCargo({...data,packages:[{...data.packages[0],heightM:''}]},'AIR'),/SHIPPING_CARGO_INVALID/);
 const fcl={...data,shipmentType:'FCL',containers:[{size:'20',type:'DC',count:'2'},{size:'40',type:'HQ',count:'1'}],outOfGauge:true,oogDetails:'Actual height 3m; top protrusion'};
 assert.equal(shippingCargo(fcl,'SEA').containerCount,'3');assert.throws(()=>shippingCargo({...fcl,oogDetails:''},'SEA'),/SHIPPING_CARGO_INVALID/);
 const many=transportSnapshot({mode:'SEA',data:{...fcl,containers:Array.from({length:50},()=>({size:'40',type:'HQ',count:'1'}))}});assert.equal(many.data.containerCount,'50');assert.ok(many.data.containerType.length>40);assert.equal(transportSnapshot(many).data.containerCount,'50');
 assert.throws(()=>shippingCargo({...fcl,containers:[{size:'30',type:'DC',count:'1'}]},'SEA'),/SHIPPING_CARGO_INVALID/);
 const snapshot=transportSnapshot({mode:'SEA',data:{...fcl,shipperParty:{id:999,orgId:44,name:'THE SAN',address:'Factory',privateMargin:999},customerRole:'shipper',notifySameAsConsignee:true,consignee:'Buyer',consigneeParty:{name:'Buyer',privateCost:999},internalCost:'secret'}});
 assert.deepEqual(snapshot.data.shipperParty,{name:'THE SAN',address:'Factory'});assert.deepEqual(snapshot.data.notifyParty,{name:'Buyer'});assert.equal(snapshot.data.internalCost,undefined);
 assert.deepEqual(shippingCargo({cargo:'Historical'},'SEA'),{});
});
test('real company/customer-scoped presets, FK guards, soft deletion, audit and cargo persistence',async()=>{
 const f=await changeApprovalFixture();try{
  const db=f.db,s=await seedChangeApproval(db),orgId=s.company.id,actorId=s.people.admin.id,scope={orgId,actorId,org:{type:'SERVICE'}};
  const oldProjection=(await db.$queryRawUnsafe("SELECT baro_shipping_projection('SEA','DRAFT',$1::jsonb) AS value",JSON.stringify({cargo:'Historical',shipperParty:{name:'PRIVATE LEGACY PARTY'}})))[0].value;assert.equal(oldProjection.data.shipperParty,undefined);
  const publicProjection=(await db.$queryRawUnsafe("SELECT baro_shipping_projection('SEA','DRAFT',$1::jsonb) AS value",JSON.stringify({cargoSchemaVersion:1,cargo:'Public request',shipperParty:{name:'THE SAN',internalMargin:999,id:123}})))[0].value;assert.deepEqual(publicProjection.data.shipperParty,{name:'THE SAN'});
  const id=randomUUID(),input={id,customerId:s.vendor.id,kind:'PARTY',label:'THE SAN consignee',partyId:s.vendor.id,data:{name:'THE SAN',address:'Factory',phone:'123',privateMargin:999}};
  const saved=await saveShippingPreset(db,scope,input);assert.equal(saved.version,1);assert.equal((await saveShippingPreset(db,scope,input)).id,id);
  const rows=await listShippingPresets(db,scope,s.vendor.id,'PARTY');assert.equal(rows.length,1);assert.equal(rows[0].partyId,s.vendor.id);assert.equal(rows[0].data.privateMargin,undefined);
  const other=await db.organization.create({data:{name:'Another customer',type:'MATERIAL_SUPPLIER',ownerOrgId:orgId}});
  assert.deepEqual(await listShippingPresets(db,scope,other.id,'PARTY'),[]);
  await assert.rejects(listShippingPresets(db,scope,s.other.id,'PARTY'),/FREIGHT_PARTY_SCOPE/);
  await assert.rejects(saveShippingPreset(db,scope,{...input,customerId:other.id,version:1}),/SHIPPING_NOT_FOUND/);
  await assert.rejects(db.$executeRawUnsafe('UPDATE "ShippingPreset" SET "customerId"=$1,version=version+1 WHERE id=$2',other.id,id),/SHIPPING_CHANGED/);
  const location={id:randomUUID(),customerId:s.vendor.id,kind:'LOCATION',label:'BARO warehouse',data:{address:'Hanoi warehouse'}};
  await saveShippingPreset(db,scope,location);assert.equal((await listShippingPresets(db,scope,s.vendor.id,'LOCATION'))[0].data.address,'Hanoi warehouse');
  const deleted=await saveShippingPreset(db,scope,{id,customerId:s.vendor.id,version:1},true);assert.equal(deleted.version,2);assert.deepEqual(await listShippingPresets(db,scope,s.vendor.id,'PARTY'),[]);
  assert.ok((await db.$queryRawUnsafe('SELECT "deletedAt" FROM "ShippingPreset" WHERE id=$1',id))[0].deletedAt);assert.equal(await db.freightAudit.count({where:{orgId,entity:'shipping-presets',sourceId:id}}),2);
  await assert.rejects(db.$executeRawUnsafe('DELETE FROM "ShippingPreset" WHERE id=$1',id),/SHIPPING_HISTORY_IMMUTABLE/);
  const cargo={cargoSchemaVersion:1,cargo:'Garments',shipmentType:'LCL',weightKg:'100',packages:[{quantity:'2',lengthM:'1.2',widthM:'0.5',heightM:'0.3'}]};
  const job=await saveFreight(db,orgId,actorId,'jobs',{clientKey:randomUUID(),mode:'SEA',customerId:s.vendor.id,data:{...cargo,shipperId:s.vendor.id,consigneeParty:{name:'Unlinked document consignee',address:'Address'}}});assert.equal(job.data.cbm,'0.360000');assert.equal(job.data.consigneeParty.name,'Unlinked document consignee');assert.equal(job.data.consigneeId,undefined);
  await db.organization.update({where:{id:orgId},data:{type:'BRAND'}});const own={...scope,org:{type:'BRAND'}};
  const ownPreset={id:randomUUID(),customerId:orgId,kind:'PARTY',label:'Brand buyer',data:{name:'Buyer'}};await saveShippingPreset(db,own,ownPreset);assert.equal((await listShippingPresets(db,own,orgId,'PARTY')).length,1);await assert.rejects(listShippingPresets(db,own,s.vendor.id,'PARTY'),/SHIPPING_ACCESS_DENIED/);
  const migration=require('../backend/scripts/migrate-entity-profiles').migrations().find(row=>row.version==='20261113070000_shipping_editor_presets');await f.pg.exec(migration.sql);await f.pg.exec(migration.sql);assert.equal((await listShippingPresets(db,own,orgId,'PARTY')).length,1);
 }finally{await f.close();}
});
