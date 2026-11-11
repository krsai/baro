import test from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {randomUUID} from 'node:crypto';
import {readFileSync} from 'node:fs';
import {changeApprovalFixture,seedChangeApproval} from './helpers/change-approval-fixture.mjs';
const require=createRequire(import.meta.url),{createWorkRequest,listWorkRequests,actWorkRequest,registerDashboardWorkRequestRoutes}=require('../backend/dist/services/dashboardWorkRequests');
test('dashboard work requests: real company parties, admin instructions, recipient completion, independent hiding and immutable history',async()=>{
 const f=await changeApprovalFixture();try{
  const db=f.db,s=await seedChangeApproval(db),org=s.company.id,a=s.people.admin.id,b=s.people.junior.id,c=s.people.lead.id;
  const body={clientKey:randomUUID(),recipientId:b,title:'Check order allocation',message:'Please review the linked order.',senderId:c};
  const row=await createWorkRequest(db,org,a,body);assert.equal(row.senderId,a);assert.equal(row.status,'OPEN');
  assert.equal((await createWorkRequest(db,org,a,body)).id,row.id);
  await assert.rejects(createWorkRequest(db,org,a,{...body,title:'Changed'}),/WORK_REQUEST_CHANGED/);
  await assert.rejects(createWorkRequest(db,org,b,{...body,clientKey:randomUUID(),recipientId:c}),/ADMIN_REQUIRED/);
  await assert.rejects(createWorkRequest(db,org,a,{...body,clientKey:randomUUID(),recipientId:a}),/INVALID/);
  await assert.rejects(createWorkRequest(db,s.other.id,a,body),/ACCESS_DENIED/);
  const outsideSet=await db.employeeGradeSet.create({data:{orgId:s.other.id,code:'OTHER',name:'Other grades'}});
  const outsideGrade=await db.employeeGrade.create({data:{orgId:s.other.id,setId:outsideSet.id,code:'WORKER',name:'Worker',nameKo:'Worker',nameEn:'Worker',nameVi:'Worker',sortOrder:1}});
  const outsider=await db.employee.create({data:{orgId:s.other.id,gradeId:outsideGrade.id,name:'Outside employee',orgRole:'WORKER',status:'ACTIVE'}});
  await assert.rejects(createWorkRequest(db,org,a,{...body,clientKey:randomUUID(),recipientId:outsider.id}),/RECIPIENT_SCOPE/);
  await assert.rejects(db.$executeRawUnsafe('INSERT INTO "DashboardWorkRequest"(id,"orgId","senderId","recipientId","clientKey",title,message) VALUES($1,$2,$3,$4,$5,$6,$7)',randomUUID(),org,a,outsider.id,randomUUID(),'Foreign',''),/foreign key/);
  await assert.rejects(listWorkRequests(db,org,undefined),/ACCESS_DENIED/);
  assert.equal((await listWorkRequests(db,org,c)).rows.length,0,'a company colleague cannot read private instructions');
  const sent=await listWorkRequests(db,org,a),received=await listWorkRequests(db,org,b);assert.equal(sent.rows[0].id,row.id);assert.equal(received.rows[0].id,row.id);assert.equal(received.canCreate,false);
  await assert.rejects(actWorkRequest(db,org,a,row.id,{action:'COMPLETE',version:1}),/RECIPIENT_REQUIRED/);
  await assert.rejects(actWorkRequest(db,org,c,row.id,{action:'COMPLETE',version:1}),/NOT_FOUND/);
  await assert.rejects(actWorkRequest(db,org,b,row.id,{action:'HIDE',version:1}),/NOT_COMPLETED/);
  await assert.rejects(actWorkRequest(db,org,b,row.id,{action:'COMPLETE',version:9}),/CHANGED/);
  const done=await actWorkRequest(db,org,b,row.id,{action:'COMPLETE',version:1});assert.equal(done.status,'DONE');assert.ok(done.completedAt);
  assert.equal((await actWorkRequest(db,org,b,row.id,{action:'COMPLETE',version:1})).version,2,'lost response retry returns original completion');
  assert.equal((await listWorkRequests(db,org,a)).rows[0].status,'DONE');assert.equal((await listWorkRequests(db,org,b)).rows[0].status,'DONE');
  const hidden=await actWorkRequest(db,org,a,row.id,{action:'HIDE',version:2});assert.equal((await listWorkRequests(db,org,a)).rows.length,0);assert.equal((await listWorkRequests(db,org,b)).rows.length,1);
  await actWorkRequest(db,org,b,row.id,{action:'HIDE',version:hidden.version});assert.equal((await listWorkRequests(db,org,b)).rows.length,0);
  assert.equal((await f.pg.query('SELECT count(*)::integer AS count FROM "DashboardWorkRequest"')).rows[0].count,1);
  assert.deepEqual((await f.pg.query('SELECT action FROM "DashboardWorkRequestEvent" ORDER BY version')).rows.map(row=>row.action),['CREATE','COMPLETE','HIDE','HIDE']);
  await assert.rejects(db.$executeRawUnsafe('DELETE FROM "DashboardWorkRequest" WHERE id=$1',row.id),/HISTORY_PROTECTED/);
  await assert.rejects(db.$executeRawUnsafe('DELETE FROM "DashboardWorkRequestEvent" WHERE "requestId"=$1',row.id),/HISTORY_PROTECTED/);
  await assert.rejects(db.$executeRawUnsafe('UPDATE "DashboardWorkRequest" SET title=$1,version=version+1 WHERE id=$2','Changed',row.id),/HISTORY_PROTECTED/);
  await db.employee.update({where:{id:b},data:{status:'SUSPENDED'}});
  await assert.rejects(createWorkRequest(db,org,a,{...body,clientKey:randomUUID()}),/RECIPIENT_SCOPE/);
  await assert.rejects(listWorkRequests(db,org,b),/ACCESS_DENIED/);
  const failing={...db,$transaction:work=>db.$transaction(tx=>work(new Proxy(tx,{get:(target,key)=>key==='$executeRawUnsafe'?async(sql,...args)=>{if(sql.includes('DashboardWorkRequestEvent'))throw Error('audit unavailable');return target.$executeRawUnsafe(sql,...args);}:Reflect.get(target,key)})))};
  await assert.rejects(createWorkRequest(failing,org,a,{...body,recipientId:c,clientKey:randomUUID()}),/audit unavailable/);
  assert.equal((await f.pg.query('SELECT count(*)::integer AS count FROM "DashboardWorkRequest"')).rows[0].count,1,'event failure rolls back the instruction');
 }finally{await f.close();}
});
test('work request routes require company membership and the saved dashboard feature; migration is registered for deployment and read-only startup',async()=>{
 const routes=new Map(),app={get:(p,f)=>routes.set('GET '+p,f),post:(p,f)=>routes.set('POST '+p,f)};
 let checked=false;registerDashboardWorkRequestRoutes(app,{employee:{findFirst:async()=>({id:3,orgRole:'ADMIN'})}},{requireOrgRole:async(_req,_res,options)=>{assert.equal(options.allowSystemAdmin,false);checked=true;return {organization:{id:1,type:'SERVICE'}};},actorId:()=>3,canAccess:async()=>false});
 await assert.rejects(routes.get('GET /dashboard/work-requests')({query:{orgId:99}},{setHeader(){}}),/ACCESS_DENIED/);assert.equal(checked,true);
 const migration=require('../backend/scripts/migrate-entity-profiles').migrations().find(m=>m.version==='20261111010000_dashboard_work_requests');assert.ok(migration);
 assert.match(migration.sql,/FOREIGN KEY \("recipientId","orgId"\)/);
 assert.match(readFileSync('backend/scripts/railway-schema-preflight.js','utf8'),/DashboardWorkRequest_values_check/);
 assert.match(readFileSync('backend/src/index.ts','utf8'),/DashboardWorkRequest:\['id','orgId'/);
});

