import test from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {readFileSync} from 'node:fs';
import {randomUUID} from 'node:crypto';
import {changeApprovalFixture,seedChangeApproval} from './helpers/change-approval-fixture.mjs';
const require=createRequire(import.meta.url),{searchShippingPorts,shippingPortFields}=require('../backend/dist/services/shippingPorts'),{shippingCargo}=require('../backend/dist/services/shippingCargo'),{saveFreight}=require('../backend/dist/services/freightOperations'),{transportSnapshot}=require('../backend/dist/services/transportExchange');
test('structured optional HS, DG class and UN number survive the public whitelist without private fields',()=>{
 const cargo={cargoSchemaVersion:1,cargo:'Garments',shipmentType:'FCL',containers:[{size:'40',type:'RH',count:'5'}],outOfGauge:false,hsCode:'6109.10',dangerousGoods:true,dgClass:'3',unNumber:'1993'};
 const snapshot=transportSnapshot({mode:'SEA',data:{...cargo,originPortCode:'VNHPH',destinationPortCode:'KRPUS',internalMargin:'private'}});
 assert.equal(snapshot.data.hsCode,'6109.10');assert.equal(snapshot.data.dgClass,'3');assert.equal(snapshot.data.unNumber,'1993');assert.equal(snapshot.data.originPortCode,'VNHPH');assert.equal(snapshot.data.internalMargin,undefined);
 assert.throws(()=>shippingCargo({...cargo,hsCode:'secret'},'SEA'),/SHIPPING_CARGO_INVALID/);
 assert.throws(()=>shippingCargo({...cargo,dgClass:'9.6'},'SEA'),/SHIPPING_CARGO_INVALID/);
 assert.throws(()=>shippingCargo({...cargo,unNumber:'199'},'SEA'),/SHIPPING_CARGO_INVALID/);
 assert.throws(()=>shippingCargo({...cargo,dgClass:''},'SEA'),/SHIPPING_CARGO_INVALID/);
 assert.throws(()=>shippingPortFields({...cargo,originPortCode:'KRPUS'},'ROAD'),/SHIPPING_INVALID/);
 assert.deepEqual(shippingPortFields({originPortCode:'KRPUS'},'SEA'),{});
 const legacy=transportSnapshot({mode:'SEA',data:{cargo:'Historical',hsCode:'PRIVATE LEGACY VALUE',originPortCode:'KRPUS'}});assert.equal(legacy.data.hsCode,undefined);assert.equal(legacy.data.originPortCode,undefined);
});
test('official worldwide port catalogue, literal search, real FK persistence, isolation and idempotent migration',async()=>{
 const f=await changeApprovalFixture();try{
  const db=f.db,s=await seedChangeApproval(db),source=JSON.parse(readFileSync('backend/data/shipping-ports-source.json','utf8'));
  const count=(await db.$queryRawUnsafe('SELECT count(*)::int AS count FROM "ShippingPort"'))[0].count;assert.equal(count,source.count);assert.ok(count>17000);
  assert.equal((await searchShippingPorts(db,'KR PUS')).rows[0].code,'KRPUS');assert.equal((await searchShippingPorts(db,'VNHPH')).rows[0].code,'VNHPH');
  assert.ok((await searchShippingPorts(db,'Rotterdam')).rows.some(row=>row.code==='NLRTM'));
  assert.ok((await searchShippingPorts(db,'')).hasMore);assert.deepEqual((await searchShippingPorts(db,'%')).rows,[]);
  await assert.rejects(searchShippingPorts(db,'a'.repeat(161)),/SHIPPING_INVALID/);
  const data={cargoSchemaVersion:1,cargo:'Garments',shipmentType:'FCL',containers:[{size:'40',type:'DC',count:'5'},{size:'20',type:'RF',count:'1'}],outOfGauge:false,hsCode:'610910',dangerousGoods:true,dgClass:'3',unNumber:'1993',origin:'Hai Phong (VNHPH)',destination:'Busan (KRPUS)',originPortCode:'VNHPH',destinationPortCode:'KRPUS',workScope:{start:'ORIGIN_TERMINAL',end:'DESTINATION_TERMINAL'}};
  const job=await saveFreight(db,s.company.id,s.people.admin.id,'jobs',{clientKey:randomUUID(),mode:'SEA',customerId:s.vendor.id,data});
  assert.equal(job.originPortCode,'VNHPH');assert.equal(job.destinationPortCode,'KRPUS');assert.equal(job.data.hsCode,'610910');assert.equal(job.data.containerCount,'6');assert.deepEqual(job.data.containers,data.containers);
  assert.equal(job.requestSnapshot.data.dgClass,'3');assert.equal(job.requestSnapshot.data.originPortCode,'VNHPH');
  await assert.rejects(saveFreight(db,s.company.id,s.people.admin.id,'jobs',{clientKey:randomUUID(),mode:'SEA',customerId:s.vendor.id,data:{...data,originPortCode:'ZZZZZ'}}),/SHIPPING_INVALID/);
  await assert.rejects(saveFreight(db,s.other.id,s.people.admin.id,'jobs',{clientKey:randomUUID(),mode:'SEA',customerId:s.vendor.id,data}),/ACTIVE_EMPLOYEE_REQUIRED/);
  await assert.rejects(db.$executeRawUnsafe('DELETE FROM "ShippingPort" WHERE code=$1','VNHPH'),/foreign key|FreightJob_origin_port_fkey/i);
  const migration=require('../backend/scripts/migrate-entity-profiles').migrations().find(row=>row.version==='20261113080000_shipping_port_catalog');
  await f.pg.exec(migration.sql);await f.pg.exec(migration.sql);
  assert.equal((await db.$queryRawUnsafe('SELECT count(*)::int AS count FROM "ShippingPort"'))[0].count,count);
  const persisted=(await db.$queryRawUnsafe('SELECT * FROM "FreightJob" WHERE id=$1',job.id))[0];assert.deepEqual(persisted.requestSnapshot,job.requestSnapshot);assert.equal(persisted.version,job.version);assert.equal(persisted.originPortCode,'VNHPH');
  const projection=(await db.$queryRawUnsafe("SELECT baro_shipping_projection('SEA','DRAFT',$1::jsonb) AS value",JSON.stringify({...data,internalMargin:'private'})))[0].value;assert.equal(projection.data.hsCode,'610910');assert.equal(projection.data.internalMargin,undefined);
 }finally{await f.close();}
});
