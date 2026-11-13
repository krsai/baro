import test from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {randomUUID} from 'node:crypto';
import {changeApprovalFixture,seedChangeApproval} from './helpers/change-approval-fixture.mjs';
const require=createRequire(import.meta.url),{listSystemShippingPorts,changeSystemShippingPort,registerSystemShippingPortRoutes}=require('../backend/dist/services/systemShippingPorts'),{searchShippingPorts}=require('../backend/dist/services/shippingPorts'),{saveFreight}=require('../backend/dist/services/freightOperations');
test('explicit catalogue pruning is scoped, audited, reference-safe and idempotent',async()=>{
 const {pruneShippingPorts,scopeHash}=require('../backend/scripts/prune-shipping-ports');
 const manifest=require('../backend/data/shipping-ports-container-scope.json');
 assert.equal(new Set(manifest.ports.map(p=>p.code)).size,manifest.ports.length);
 const f=await changeApprovalFixture();try{
  const db=f.db,s=await seedChangeApproval(db),admin=await db.systemUser.create({data:{email:'prune@example.test',systemRole:'SYSTEM_ADMIN'}});
  const job=await saveFreight(db,s.company.id,s.people.admin.id,'jobs',{clientKey:randomUUID(),mode:'SEA',customerId:s.vendor.id,data:{cargoSchemaVersion:1,cargo:'Preserve me',shipmentType:'FCL',containers:[{size:'40',type:'DC',count:'1'}],outOfGauge:false,origin:'Rotterdam',destination:'Busan',originPortCode:'NLRTM',destinationPortCode:'KRPUS'}});
  const original=await db.$queryRawUnsafe('SELECT * FROM "FreightJob" WHERE id=$1',job.id);
  await assert.rejects(pruneShippingPorts(db,{actorId:admin.id,apply:true}),/PORT_SCOPE_HASH_REQUIRED/);
  await assert.rejects(pruneShippingPorts(db,{actorId:-1}),/SYSTEM_ADMIN_REQUIRED/);
  const preview=await pruneShippingPorts(db,{actorId:admin.id});assert.equal(preview.keep,manifest.ports.length);assert.deepEqual(preview.protectedCodes,['NLRTM']);
  assert.equal((await db.$queryRawUnsafe('SELECT count(*)::int AS count FROM "ShippingPortChange"'))[0].count,0);
  const result=await pruneShippingPorts(db,{actorId:admin.id,apply:true,expectedHash:scopeHash});assert.equal(result.delete,17520-manifest.ports.length-1);
  assert.equal((await searchShippingPorts(db,'KRPUS')).rows[0].code,'KRPUS');assert.equal((await searchShippingPorts(db,'AEABU')).rows.length,0);
  assert.deepEqual(await db.$queryRawUnsafe('SELECT * FROM "FreightJob" WHERE id=$1',job.id),original);
  const receipt=(await db.$queryRawUnsafe('SELECT * FROM "ShippingPortChange" WHERE code=$1','AEABU'))[0];assert.equal(receipt.before.name,receipt.after.name);assert.equal(receipt.before.deletedAt,null);assert.ok(receipt.after.deletedAt);assert.equal(receipt.actorId,admin.id);
  assert.equal((await pruneShippingPorts(db,{actorId:admin.id,apply:true,expectedHash:scopeHash})).delete,0);
  await changeSystemShippingPort(db,admin.email,'AEABU',{action:'RESTORE',version:2,clientKey:randomUUID()});assert.equal((await searchShippingPorts(db,'AEABU')).rows[0].code,'AEABU');
 }finally{await f.close();}
});
test('all SYSTEM port routes require the authenticated administrator before touching the catalogue',async()=>{
 const routes=new Map(),app={get:(path,work)=>routes.set('get:'+path,work),put:(path,work)=>routes.set('put:'+path,work)};
 registerSystemShippingPortRoutes(app,new Proxy({},{get:()=>{throw Error('No unauthorized DB access');}}),{requireSystemAdmin:async()=>null});
 for(const route of routes.values())await route({body:{email:'fake-admin@example.test'}},{json:()=>{throw Error('No unauthorized response');}});
 assert.equal(routes.size,2);
});
test('SYSTEM-only state management: filtered search, revision/retry, referenced-port protection, audit and source preservation',async()=>{
 const f=await changeApprovalFixture();try{
  const db=f.db,s=await seedChangeApproval(db),admin=await db.systemUser.create({data:{email:'ports-admin@example.test',systemRole:'SYSTEM_ADMIN'}}),ordinary=await db.systemUser.create({data:{email:'ports-user@example.test',systemRole:'USER'}});
  const call=(code,action,version,key=randomUUID())=>changeSystemShippingPort(db,admin.email,code,{action,version,clientKey:key});
  await assert.rejects(listSystemShippingPorts(db,ordinary.email,{}),/SYSTEM_ADMIN_REQUIRED/);
  await assert.rejects(changeSystemShippingPort(db,s.people.admin.email,'KRPUS',{action:'DEACTIVATE',version:1,clientKey:randomUUID()}),/SYSTEM_ADMIN_REQUIRED/);
  const initial=(await listSystemShippingPorts(db,admin.email,{q:'KRPUS'})).rows[0];assert.equal(initial.version,1);assert.equal(initial.isActive,true);assert.equal(initial.inUse,false);
  const key=randomUUID(),disabled=await call('KRPUS','DEACTIVATE',1,key);assert.equal(disabled.version,2);assert.equal(disabled.isActive,false);
  assert.equal((await call('KRPUS','DEACTIVATE',1,key)).version,2);assert.equal((await searchShippingPorts(db,'KRPUS')).rows.length,0);
  assert.equal((await listSystemShippingPorts(db,admin.email,{q:'KRPUS',state:'INACTIVE'})).total,1);
  assert.equal((await db.$queryRawUnsafe('SELECT count(*)::int AS count FROM "ShippingPortChange"'))[0].count,1);
  await assert.rejects(call('KRPUS','ACTIVATE',1,key),/SHIPPING_PORT_CHANGED/);await assert.rejects(call('KRPUS','ACTIVATE',1),/SHIPPING_PORT_CHANGED/);
  await call('KRPUS','ACTIVATE',2);
  const data={cargoSchemaVersion:1,cargo:'Garments',shipmentType:'FCL',containers:[{size:'40',type:'DC',count:'5'}],outOfGauge:false,origin:'Busan (KRPUS)',destination:'Haiphong (VNHPH)',originPortCode:'KRPUS',destinationPortCode:'VNHPH'};
  const job=await saveFreight(db,s.company.id,s.people.admin.id,'jobs',{clientKey:randomUUID(),mode:'SEA',customerId:s.vendor.id,data});
  await call('KRPUS','DEACTIVATE',3);
  const unchanged=(await db.$queryRawUnsafe('SELECT * FROM "FreightJob" WHERE id=$1',job.id))[0];assert.deepEqual(unchanged.data,job.data);assert.deepEqual(unchanged.requestSnapshot,job.requestSnapshot);assert.equal(unchanged.version,job.version);
  const used=(await listSystemShippingPorts(db,admin.email,{q:'KRPUS'})).rows[0];assert.equal(used.inUse,true);assert.equal(used.orgId,undefined);assert.equal(used.customerId,undefined);
  await assert.rejects(call('KRPUS','DELETE',4),/SHIPPING_PORT_IN_USE/);
  await assert.rejects(saveFreight(db,s.company.id,s.people.admin.id,'jobs',{clientKey:randomUUID(),mode:'SEA',customerId:s.vendor.id,data}),/SHIPPING_PORT_UNAVAILABLE/);
  const updated=await saveFreight(db,s.company.id,s.people.admin.id,'jobs',{...job,clientKey:randomUUID(),data:{...job.data,remark:'Unrelated edit'}},job.id);assert.equal(updated.originPortCode,'KRPUS');
  const removed=await call('NLRTM','DELETE',1);assert.ok(removed.deletedAt);assert.equal(removed.isActive,false);assert.equal((await listSystemShippingPorts(db,admin.email,{q:'NLRTM',state:'DELETED'})).total,1);
  assert.equal((await searchShippingPorts(db,'NLRTM')).rows.length,0);assert.equal((await db.$queryRawUnsafe('SELECT code FROM "ShippingPort" WHERE code=$1','NLRTM')).length,1);
  const restored=await call('NLRTM','RESTORE',2);assert.equal(restored.deletedAt,null);assert.equal(restored.isActive,true);await call('NLRTM','ACTIVATE',3);assert.equal((await searchShippingPorts(db,'NLRTM')).rows[0].code,'NLRTM');
  await assert.rejects(db.$executeRawUnsafe('DELETE FROM "ShippingPort" WHERE code=$1','NLRTM'),/SHIPPING_PORT_HISTORY_IMMUTABLE/);
  await assert.rejects(db.$executeRawUnsafe('DELETE FROM "ShippingPortChange" WHERE code=$1','NLRTM'),/SHIPPING_PORT_HISTORY_IMMUTABLE/);
  await assert.rejects(db.$executeRawUnsafe('UPDATE "ShippingPort" SET name=$2,version=version+1,"updatedBySystemUserId"=$3 WHERE code=$1','NLRTM','Changed source',admin.id),/SHIPPING_PORT_CHANGED/);
  await assert.rejects(db.$transaction(tx=>tx.$executeRawUnsafe('UPDATE "ShippingPort" SET "isActive"=false,version=version+1,"updatedBySystemUserId"=$2 WHERE code=$1','NLRTM',ordinary.id)),/SYSTEM_ADMIN_REQUIRED/);
  await assert.rejects(db.$transaction(tx=>tx.$executeRawUnsafe('UPDATE "ShippingPort" SET "isActive"=false,version=version+1,"updatedBySystemUserId"=$2 WHERE code=$1','NLRTM',admin.id)),/SHIPPING_PORT_AUDIT_REQUIRED/);
  const migration=require('../backend/scripts/migrate-entity-profiles').migrations().find(row=>row.version==='20261114010000_shipping_port_management');await f.pg.exec(migration.sql);const restoreMigration=require('../backend/scripts/migrate-entity-profiles').migrations().find(row=>row.version==='20261114020000_shipping_port_restore');await f.pg.exec(restoreMigration.sql);await f.pg.exec(restoreMigration.sql);
  assert.equal((await listSystemShippingPorts(db,admin.email,{q:'KRPUS'})).rows[0].isActive,false);assert.equal((await listSystemShippingPorts(db,admin.email,{q:'NLRTM'})).rows[0].version,4);
 }finally{await f.close();}
});
