import test from 'node:test';
import assert from 'node:assert/strict';
import {EventEmitter} from 'node:events';
import {createRequire} from 'node:module';
import {randomUUID} from 'node:crypto';
import {readWorkspaceEvents} from '../frontend/src/utils/workspaceLiveEvents.mjs';
const require=createRequire(import.meta.url);
const {createWorkspaceEvents,workspaceTopics}=require('../backend/dist/services/workspaceEvents');
const {runWithRequestActor,setCurrentRequestActorEmployeeId}=require('../backend/dist/requestActor');
const settle=()=>new Promise(resolve=>setTimeout(resolve,10));
const response=()=>Object.assign(new EventEmitter(),{statusCode:200,frames:[],get headersSent(){return true;},set(){},flushHeaders(){},flush(){},write(frame){this.frames.push(frame);return true;},end(){this.ended=true;this.emit('close');},status(value){this.statusCode=value;return this;},json(value){this.body=value;return this;}});

test('metadata stream isolates companies, honors features, suppresses own client echo and ends on role revocation across server instances',async()=>{
 const previous={DATABASE_URL:process.env.DATABASE_URL,DIRECT_URL:process.env.DIRECT_URL};process.env.DATABASE_URL=process.env.DIRECT_URL='postgresql://test:local@127.0.0.1:5432/test';
 const clients=[],members=new Map([[1,{orgId:1,orgRole:'ADMIN'}],[2,{orgId:2,orgRole:'ADMIN'}]]);
 class Client extends EventEmitter{constructor(){super();clients.push(this);}async connect(){}async query(){}async end(){this.emit('end');}}
 const db={systemSetting:{findUnique:async()=>null},partnerClassification:{findUnique:async()=>null},employee:{findFirst:async({where})=>{const row=members.get(where.id);return row&&row.status!=='SUSPENDED'&&(!where.orgId||row.orgId===where.orgId)&&(!where.orgRole||row.orgRole===where.orgRole)?{...row,id:where.id}:null;}}};
 const gates=id=>({actorId:()=>id,canAccess:async({feature})=>feature==='BANK_LEDGER',requireOrgRole:async()=>({organization:{id:members.get(id).orgId,type:'MANUFACTURER'}})});
 const a=createWorkspaceEvents(db,gates(1),()=>new Client()),b=createWorkspaceEvents(db,gates(2),()=>new Client()),origin=randomUUID(),req={get:name=>name==='x-workspace-client'?origin:''},ra=response(),rb=response();
 try{
  await a.stream(req,ra);await b.stream(req,rb);
  const notify=event=>clients.forEach(client=>client.emit('notification',{payload:JSON.stringify(event)}));
  notify({id:randomUUID(),orgId:1,topics:['bank-ledger','payroll-sources'],origin:randomUUID(),secret:'never forwarded'});await settle();
  const data=ra.frames.find(frame=>frame.startsWith('data:'));assert.ok(data);assert.deepEqual(JSON.parse(data.slice(6)).topics,['bank-ledger']);assert.ok(!data.includes('secret'));assert.ok(!rb.frames.some(frame=>frame.startsWith('data:')));
  const count=ra.frames.length;notify({id:randomUUID(),orgId:1,topics:['bank-ledger'],origin});await settle();assert.equal(ra.frames.length,count);
  members.get(1).orgRole='OPERATOR';notify({id:randomUUID(),orgId:1,topics:['bank-ledger'],origin:randomUUID()});await settle();assert.equal(ra.frames.length,count);assert.equal(ra.ended,true);
  members.get(2).status='SUSPENDED';notify({id:randomUUID(),orgId:2,topics:['bank-ledger'],origin:randomUUID()});await settle();assert.equal(rb.ended,true);
 }finally{await a.close();await b.close();for(const [key,value] of Object.entries(previous))if(value===undefined)delete process.env[key];else process.env[key]=value;}
});

test('successful company writes publish metadata using resolved employee company, never request orgId; failed writes and previews publish nothing',async()=>{
 const writes=[],db={employee:{findFirst:async()=>({orgId:7})},$queryRawUnsafe:async(...args)=>writes.push(args)};
 const service=createWorkspaceEvents(db,{}),req={method:'PUT',path:'/bank-ledger/10',query:{orgId:999},get:()=>''},res=response();
 await runWithRequestActor('test@example.test',async()=>{setCurrentRequestActorEmployeeId(3);service.middleware(req,res,()=>{});res.json({ok:true});await settle();});
 assert.equal(writes.length,1);const event=JSON.parse(writes[0][2]);assert.equal(event.orgId,7);assert.deepEqual(Object.keys(event).sort(),['id','orgId','origin','topics']);
 const failed=response();failed.statusCode=409;await runWithRequestActor('test@example.test',async()=>{setCurrentRequestActorEmployeeId(3);service.middleware(req,failed,()=>{});failed.json({error:'CONFLICT'});await settle();});assert.equal(writes.length,1);
 assert.deepEqual(workspaceTopics('/expense/preview'),[]);assert.deepEqual(workspaceTopics('/system/users'),[]);
 await service.close();
});

test('stream decoder tolerates chunk boundaries and rejects HTTP auth failures',async()=>{
 const frames=['event: rea','dy\ndata: {}\n\n: keepalive\n\ndata: {"orgId":','1,"topics":["orders"]}\n\n'];let ready=0;const events=[];
 const response=new Response(new ReadableStream({start(controller){for(const frame of frames)controller.enqueue(new TextEncoder().encode(frame));controller.close();}}));
 await readWorkspaceEvents(response,{signal:new AbortController().signal,onReady:()=>ready++,onChange:event=>events.push(event)});assert.equal(ready,1);assert.equal(events[0].orgId,1);
 await assert.rejects(readWorkspaceEvents(new Response('',{status:403}),{signal:new AbortController().signal}),error=>error.status===403);
});


test('SYSTEM reference mutations publish metadata only after success and require current system authority',async()=>{
 const writes=[];let allowed=true;
 const db={$queryRawUnsafe:async(...args)=>writes.push(args)};
 const service=createWorkspaceEvents(db,{requireSystemAdmin:async()=>allowed?{requesterEmail:'admin@example.test'}:null});
 const req={method:'PUT',path:'/system-setting-defaults/code-bases/8',get:()=>''};
 service.middleware(req,response(),()=>{});const res=response();service.middleware(req,res,()=>{});res.json({ok:true});await settle();
 assert.equal(writes.length,1);assert.deepEqual(JSON.parse(writes[0][2]).topics,['partner-classifications','accounting-codes']);assert.equal(JSON.parse(writes[0][2]).orgId,0);
 const failed=response();failed.statusCode=409;service.middleware(req,failed,()=>{});failed.json({error:'CONFLICT'});await settle();assert.equal(writes.length,1);
 allowed=false;const denied=response();service.middleware(req,denied,()=>{});denied.json({ok:true});await settle();assert.equal(writes.length,1);
 for(const route of ['/system-setting-defaults/services/4','/system-setting-defaults/services/4/delete','/system-setting-defaults/partner-roles/order','/system-setting-defaults/code-bases/4'])assert.deepEqual(workspaceTopics(route),['partner-classifications','accounting-codes']);
 assert.deepEqual(workspaceTopics('/system-setting-defaults/expense-units'),[]);await service.close();
});

test('company partner changes invalidate SYSTEM usage counts without forwarding company data',async()=>{
 const writes=[],db={employee:{findFirst:async()=>({orgId:7})},$queryRawUnsafe:async(...args)=>writes.push(JSON.parse(args[2]))};
 const service=createWorkspaceEvents(db,{});
 const req={method:'PUT',path:'/partner-editor/entity/9/contacts',query:{orgId:999},get:()=>''},res=response();
 await runWithRequestActor('test@example.test',async()=>{setCurrentRequestActorEmployeeId(3);service.middleware(req,res,()=>{});res.json({ok:true,private:'not sent'});await settle();});
 assert.equal(writes.length,2);assert.equal(writes[0].orgId,7);assert.equal(writes[1].orgId,0);assert.deepEqual(writes[1].topics,['partner-classifications','accounting-codes']);
 assert.deepEqual(Object.keys(writes[1]).sort(),['id','orgId','origin','systemOnly','topics']);
 const failed=response();failed.statusCode=409;await runWithRequestActor('test@example.test',async()=>{setCurrentRequestActorEmployeeId(3);service.middleware(req,failed,()=>{});failed.json({error:'CONFLICT'});await settle();});assert.equal(writes.length,2);
 await service.close();
});

test('company dashboards receive only public reference invalidations from SYSTEM, never global company documents',async()=>{
 const previous={DATABASE_URL:process.env.DATABASE_URL,DIRECT_URL:process.env.DIRECT_URL};process.env.DATABASE_URL=process.env.DIRECT_URL='postgresql://test:local@127.0.0.1:5432/test';
 let client;class Client extends EventEmitter{constructor(){super();client=this;}async connect(){}async query(){}async end(){}}
 const db={systemSetting:{findUnique:async()=>null},partnerClassification:{findUnique:async()=>null},employee:{findFirst:async()=>({id:1,orgId:7,orgRole:'ADMIN'})}};
 const gates={actorId:()=>1,canAccess:async({feature})=>['DASHBOARD','BANK_LEDGER'].includes(feature),requireOrgRole:async()=>({organization:{id:7,type:'MANUFACTURER'}})};
 const service=createWorkspaceEvents(db,gates,()=>new Client()),res=response();
 try{
  await service.stream({get:()=>''},res);
  const notify=(topics,extra={})=>client.emit('notification',{payload:JSON.stringify({id:randomUUID(),orgId:0,topics,secret:'private',...extra})});
  notify(['bank-ledger']);notify(['accounting-codes'],{systemOnly:true});await settle();assert.equal(res.frames.filter(frame=>frame.startsWith('data:')).length,0);
  notify(['accounting-codes']);await settle();const data=res.frames.find(frame=>frame.startsWith('data:'));assert.ok(data);assert.deepEqual(JSON.parse(data.slice(6)).topics,['accounting-codes']);assert.ok(!data.includes('private'));
 }finally{await service.close();for(const [key,value]of Object.entries(previous))if(value===undefined)delete process.env[key];else process.env[key]=value;}
});

test('SYSTEM reference stream filters company documents and rechecks system role on delivery',async()=>{
 const previous={DATABASE_URL:process.env.DATABASE_URL,DIRECT_URL:process.env.DIRECT_URL};process.env.DATABASE_URL=process.env.DIRECT_URL='postgresql://test:local@127.0.0.1:5432/test';
 let client,role='SYSTEM_ADMIN';class Client extends EventEmitter{constructor(){super();client=this;}async connect(){}async query(){}async end(){}}
 const db={systemUser:{findUnique:async()=>({systemRole:role})}},service=createWorkspaceEvents(db,{requireSystemAdmin:async()=>({requesterEmail:'admin@example.test'})},()=>new Client()),res=response();
 try{
  await service.streamSystem({get:()=>''},res);
  const notify=event=>client.emit('notification',{payload:JSON.stringify({id:randomUUID(),...event})});
  notify({orgId:1,topics:['accounting-codes']});notify({orgId:0,topics:['bank-ledger']});await settle();assert.equal(res.frames.filter(frame=>frame.startsWith('data:')).length,0);
  notify({orgId:0,topics:['partner-classifications','bank-ledger'],private:'secret'});await settle();const data=res.frames.find(frame=>frame.startsWith('data:'));assert.deepEqual(JSON.parse(data.slice(6)).topics,['partner-classifications']);assert.ok(!data.includes('secret'));
  role='USER';notify({orgId:0,topics:['accounting-codes']});await settle();assert.equal(res.ended,true);
 }finally{await service.close();for(const [key,value]of Object.entries(previous))if(value===undefined)delete process.env[key];else process.env[key]=value;}
});


test('durable change revisions increment atomically and remain separated by company and public scope',async()=>{
 const {PGlite}=await import('@electric-sql/pglite');const sql=new PGlite();
 const {publishWorkspaceChange}=require('../backend/dist/services/workspaceEvents');
 try{await sql.exec('CREATE TABLE "SystemSetting" (key text PRIMARY KEY,value jsonb NOT NULL,"createdAt" timestamp NOT NULL,"updatedAt" timestamp NOT NULL)');
 const db={$queryRawUnsafe:(query,...args)=>sql.query(query,args)};
 await publishWorkspaceChange(db,{id:'one',orgId:1,topics:['orders','styles']});
 await publishWorkspaceChange(db,{id:'two',orgId:1,topics:['orders']});
 await publishWorkspaceChange(db,{id:'three',orgId:2,topics:['orders']});
 await publishWorkspaceChange(db,{id:'four',orgId:0,topics:['accounting-codes']});
 await publishWorkspaceChange(db,{id:'five',orgId:0,systemOnly:true,topics:['accounting-codes']});
 const rows=await sql.query('SELECT key,value FROM "SystemSetting" ORDER BY key');const versions=Object.fromEntries(rows.rows.map(row=>[row.key,row.value.revision]));
 assert.deepEqual(versions,{'WORKSPACE_CHANGE:ORG:1:orders':'2','WORKSPACE_CHANGE:ORG:1:styles':'1','WORKSPACE_CHANGE:ORG:2:orders':'1','WORKSPACE_CHANGE:SYSTEM:accounting-codes':'1','WORKSPACE_CHANGE:SYSTEM_USAGE:accounting-codes':'1'});
 }finally{await sql.close();}
});
