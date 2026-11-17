import {randomUUID} from 'node:crypto';
import {getCurrentRequestActorEmployeeId} from '../requestActor';
import {companyIndustryMenuFeatures} from './industryMenuPolicy';
const {Client}=require('pg');
const {assertSafeApplicationDatabaseEnv}=require('../config/databaseTargetGuard');
const CHANNEL='baro_workspace_changes';
const referenceTopics=['partner-classifications','accounting-codes'];
const isReferenceUsagePath=(path:string)=>/^\/(partner-classifications|partner-editor|business-partners|customers|partners|organizations|organization-profile)(\/|$)/.test(path);
const isReferencePath=(path:string)=>/^\/system-setting-defaults\/(services|partner-roles|code-bases|codes)(\/|\?|$)/.test(path);
export const workspaceTopics=(path:string):string[]=>{
 const route=path.split('?')[0]||'';
 if(isReferencePath(route))return referenceTopics;
 if(/(?:\/|-)(preview|validate|search|recipients)(?:\/|$)/.test(route))return [];
 const groups:[RegExp,string[]][]=[
  [/^\/(shipping|freight|shipping-ports)/,['shipping','shipping-ports']],
  [/^\/(orders|work-orders|order-shipments)/,['orders','order-shipments','invoice-drafts','assignment-board']],
  [/^\/styles/,['styles','assignment-board']],
  [/^\/(assignment|work-logs|production)/,['assignment-board','payroll-sources','styles']],
  [/^\/(employees|org-memberships|attendance|leave|work-time)/,['employees','payroll-sources']],
  [/^\/(payroll|salary|production-allowance)/,['payroll-sources','salary-system-settings','employees']],
  [/^\/(expense|change-approval|bank-ledger|bank-accounts|management-targets)/,['expense-requests','expense-approvals','change-approvals','bank-ledger','payroll-sources']],
  [/^\/invoices/,['issued-invoices','invoice-drafts','bank-ledger','change-approvals']],
  [/^\/(partner-classifications|partner-editor|customers|partners|business-partners|organizations|organization-profile|sales-prices)/,['customers','business-partners','sales-prices']],
  [/^\/dashboard\/work-requests/,['work-requests']],
 ];
 return groups.find(([pattern])=>pattern.test(route))?.[1]||[];
};
export function createWorkspaceEvents(db:any,gates:any,clientFactory=()=>new Client({connectionString:process.env.DATABASE_URL,connectionTimeoutMillis:10000,application_name:'baro-workspace-events'})){
 let client:any=null,connecting:Promise<void>|null=null;
 const subscribers=new Set<any>();
 const drop=()=>{client=null;for(const subscriber of subscribers)subscriber.close();subscribers.clear();};
 const connect=async()=>{
  if(client)return;
  if(connecting)return connecting;
  connecting=(async()=>{
   assertSafeApplicationDatabaseEnv(process.env);
   const next=clientFactory();
   next.on('error',()=>{void next.end().catch(()=>{});drop();});
   next.on('end',()=>{if(client===next)drop();});
   next.on('notification',(message:any)=>{
    let event:any;try{event=JSON.parse(message.payload);}catch{return;}
    if(!Number.isSafeInteger(event.orgId)||!Array.isArray(event.topics)||event.topics.some((topic:any)=>typeof topic!=='string')||typeof event.id!=='string')return;
    for(const subscriber of subscribers)if(subscriber.orgId===event.orgId&&(!event.origin||subscriber.origin!==event.origin))void subscriber.send({id:event.id,orgId:event.orgId,topics:event.topics,source:'server-change'}).catch(()=>subscriber.close());
   });
   try{await next.connect();await next.query('LISTEN '+CHANNEL);client=next;}catch{await next.end().catch(()=>{});throw Error('WORKSPACE_EVENTS_UNAVAILABLE');}
  })().finally(()=>{connecting=null;});
  return connecting;
 };
 const origin=(req:any)=>/^[a-f0-9-]{36}$/i.test(req.get('x-workspace-client')||'')?req.get('x-workspace-client'):'';
 const middleware=(req:any,res:any,next:any)=>{
  const topics=workspaceTopics(req.path);
  if(topics.length&&['POST','PUT','PATCH','DELETE'].includes(req.method)){
   const json=res.json;
   res.json=function(body:any){
    const employeeId=getCurrentRequestActorEmployeeId(),successful=res.statusCode>=200&&res.statusCode<300&&body?.ok!==false&&!body?.error;
    if(successful&&isReferencePath(req.path)&&gates.requireSystemAdmin){
     const quietResponse={status(){return this;},json(){return this;}};
     void gates.requireSystemAdmin(req,quietResponse).then(async(actor:any)=>{
      if(!actor)return;
      await db.$queryRawUnsafe('SELECT pg_notify($1,$2)::text',CHANNEL,JSON.stringify({id:randomUUID(),orgId:0,topics:referenceTopics,origin:origin(req)}));
     }).catch(()=>{console.warn('Reference settings notification unavailable');});
    }else if(employeeId&&successful){
     // The authenticated employee is set by company access resolution, never by query orgId.
     void db.employee.findFirst({where:{id:employeeId,status:'ACTIVE'},select:{orgId:true}}).then(async(employee:any)=>{
      if(!employee)return;
      const event={id:randomUUID(),orgId:employee.orgId,topics,origin:origin(req)};
      await db.$queryRawUnsafe('SELECT pg_notify($1,$2)::text',CHANNEL,JSON.stringify(event));
      if(isReferenceUsagePath(req.path))await db.$queryRawUnsafe('SELECT pg_notify($1,$2)::text',CHANNEL,JSON.stringify({id:randomUUID(),orgId:0,topics:referenceTopics,origin:origin(req)}));
     }).catch(()=>{console.warn('Workspace change notification unavailable');});
    }
    return json.call(this,body);
   };
  }
  next();
 };
 const streamSystem=async(req:any,res:any)=>{
  const actor=await gates.requireSystemAdmin(req,res);if(!actor)return;
  await connect();
  res.set({'Content-Type':'text/event-stream','Cache-Control':'no-cache, no-transform','X-Accel-Buffering':'no'});res.flushHeaders();
  let closed=false;
  const close=()=>{if(closed)return;closed=true;clearInterval(heartbeat);clearTimeout(expiry);subscribers.delete(subscriber);res.end();};
  const subscriber={orgId:0,origin:origin(req),close,send:async(event:any)=>{
   if(closed)return;const topics=event.topics.filter((topic:string)=>referenceTopics.includes(topic));if(!topics.length)return;
   const current=await db.systemUser.findUnique({where:{email:actor.requesterEmail},select:{systemRole:true}}).catch(()=>null);
   if(current?.systemRole!=='SYSTEM_ADMIN')return close();
   if(!closed){if(!res.write('data: '+JSON.stringify({id:event.id,orgId:0,topics})+'\n\n'))close();else res.flush?.();}
  }};
  const heartbeat=setInterval(()=>{if(!closed){res.write(': keepalive\n\n');res.flush?.();}},25000);
  let expiresAt=Date.now()+3600000;try{const claims=JSON.parse(Buffer.from(String(req.get('authorization')).split('.')[1]||'','base64url').toString());if(Number.isFinite(claims.exp))expiresAt=Math.min(expiresAt,claims.exp*1000);}catch{}
  const expiry=setTimeout(close,Math.max(1000,expiresAt-Date.now()));
  subscribers.add(subscriber);res.on('close',close);res.write('event: ready\ndata: {}\n\n');res.flush?.();
 };
 const stream=async(req:any,res:any)=>{
  const scope=await gates.requireOrgRole(req,res,{allowedRoles:['ADMIN','ACCOUNTANT','OPERATOR','WORKER'],allowSystemAdmin:false});if(!scope)return;
  const employeeId=gates.actorId();
  const employee=employeeId&&await db.employee.findFirst({where:{id:employeeId,orgId:scope.organization.id,status:'ACTIVE'},select:{id:true,orgRole:true}});
  if(!employee)return res.status(403).json({error:'ACTIVE_EMPLOYEE_REQUIRED'});
  const topicFeatures:Record<string,string>={'shipping':'FREIGHT','shipping-ports':'FREIGHT','styles':'STYLE','orders':'ORDER','order-shipments':'ORDER','invoice-drafts':'INVOICE','issued-invoices':'INVOICE','assignment-board':'ASSIGNMENT','employees':'EMPLOYEE','sales-prices':'CUSTOMER','customers':'CUSTOMER','business-partners':'CUSTOMER','salary-system-settings':'SALARY_SYSTEM','production-allowance-settings':'SALARY_SYSTEM','payroll-sources':'PAYROLL','expense-requests':'OUTSOURCING_RECORD','expense-approvals':'OUTSOURCING_RECORD','change-approvals':'DASHBOARD','bank-ledger':'BANK_LEDGER','work-requests':'DASHBOARD'};
  const offered=await companyIndustryMenuFeatures(db,scope.organization.id,scope.organization.type),features=new Set<string>();
  for(const feature of new Set(Object.values(topicFeatures)))if(offered.includes(feature)&&await gates.canAccess({orgType:scope.organization.type,orgRole:employee.orgRole,feature}))features.add(feature);
  await connect();
  res.set({'Content-Type':'text/event-stream','Cache-Control':'no-cache, no-transform','X-Accel-Buffering':'no'});res.flushHeaders();
  let closed=false;
  const close=()=>{if(closed)return;closed=true;clearInterval(heartbeat);subscribers.delete(subscriber);res.end();};
  const subscriber={orgId:scope.organization.id,origin:origin(req),close,send:async(event:any)=>{
   if(closed)return;
   const topics=event.topics.filter((topic:string)=>features.has(topicFeatures[topic]||''));if(!topics.length)return;
   // A connection is no authorization lease: recheck membership on each delivery.
   const current=await db.employee.findFirst({where:{id:employeeId,orgId:scope.organization.id,status:'ACTIVE',orgRole:employee.orgRole},select:{id:true}}).catch(()=>null);
   if(!current)return close();
   if(!closed){if(!res.write('data: '+JSON.stringify({...event,topics})+'\n\n'))close();else res.flush?.();}
  }};
  const heartbeat=setInterval(()=>{if(!closed){res.write(': keepalive\n\n');res.flush?.();}},25000);
  subscribers.add(subscriber);res.on('close',close);
  res.write('event: ready\ndata: {}\n\n');res.flush?.();
  // The regular authentication middleware validated this token; never keep it past expiry.
  let expiresAt=Date.now()+3600000;try{const claims=JSON.parse(Buffer.from(String(req.get('authorization')).split('.')[1]||'','base64url').toString());if(Number.isFinite(claims.exp))expiresAt=Math.min(expiresAt,claims.exp*1000);}catch{}
  const expiry=setTimeout(close,Math.max(1000,expiresAt-Date.now()));res.on('close',()=>clearTimeout(expiry));
 };
 return {middleware,stream,streamSystem,close:async()=>{for(const subscriber of [...subscribers])subscriber.close();await client?.end();client=null;}};
}
