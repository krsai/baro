import {randomUUID} from 'node:crypto';
import {getCurrentRequestActorEmployeeId} from '../requestActor';
import {companyIndustryMenuFeatures} from './industryMenuPolicy';
const {Client}=require('pg');
const {assertSafeApplicationDatabaseEnv}=require('../config/databaseTargetGuard');
const CHANNEL='baro_workspace_changes';
const referenceTopics=['partner-classifications','accounting-codes','text-acronyms'];
const filterVersions=(versions:any,topics:string[])=>Object.fromEntries(Object.entries(versions||{}).filter(([key])=>topics.includes(key.split(':').pop()||'')));
const revisionKey=(scope:string,topic:string)=>`WORKSPACE_CHANGE:${scope}:${topic}`;
// Durable invalidation counters allow reconnect catch-up without pretending
// every successful connection means that every business record changed.
export async function publishWorkspaceChange(db:any,event:any){
 const scope=event.orgId===0?(event.systemOnly?'SYSTEM_USAGE':'SYSTEM'):`ORG:${event.orgId}`;
 return db.$queryRawUnsafe(`WITH bumped AS (
 INSERT INTO "SystemSetting"(key,value,"createdAt","updatedAt")
 SELECT $3 || ':' || topic,jsonb_build_object('revision','1'),CURRENT_TIMESTAMP,CURRENT_TIMESTAMP FROM unnest($4::text[]) topic
 ON CONFLICT(key) DO UPDATE SET value=jsonb_build_object('revision',(("SystemSetting".value->>'revision')::bigint+1)::text),"updatedAt"=CURRENT_TIMESTAMP
 RETURNING key,value
 ) SELECT pg_notify($1,($2::jsonb || jsonb_build_object('versions',(SELECT jsonb_object_agg(key,value->>'revision') FROM bumped)))::text)::text`,CHANNEL,JSON.stringify(event),'WORKSPACE_CHANGE:'+scope,event.topics);
}
async function revisionSnapshot(db:any,orgId:number,topics:string[]){
 const scopes=orgId===0?['SYSTEM','SYSTEM_USAGE']:[`ORG:${orgId}`,'SYSTEM'];
 const keys=scopes.flatMap(scope=>topics.filter(topic=>scope.startsWith('ORG:')||referenceTopics.includes(topic)).map(topic=>revisionKey(scope,topic)));
 const versions:any=Object.fromEntries(keys.map(key=>[key,'0']));
 const rows=db.systemSetting?.findMany?await db.systemSetting.findMany({where:{key:{in:keys}},select:{key:true,value:true}}):[];
 for(const row of rows)if(/^\d+$/.test(row.value?.revision||''))versions[row.key]=row.value.revision;
 return versions;
}
const isReferenceUsagePath=(path:string)=>/^\/(partner-classifications|partner-editor|business-partners|customers|partners|organizations|organization-profile)(\/|$)/.test(path);
const isReferencePath=(path:string)=>/^\/system-setting-defaults\/(services|partner-roles|code-bases|codes)(\/|\?|$)/.test(path)||path==='/system/text-acronyms';
export const workspaceTopics=(path:string):string[]=>{
 if(path.split('?')[0]==='/system/text-acronyms')return ['text-acronyms'];
 const route=path.split('?')[0]||'';
 if(/\/(?:acknowledge|read-receipt)(?:\/|$)/.test(route))return [];
  if(route==='/dashboard/alert-recipients'||route==='/dashboard/widget-policy')return ['accounting-alerts'];
 if(isReferencePath(route))return ['partner-classifications','accounting-codes'];
 if(/^\/management-targets\/INVOICE\/?$/i.test(route))return ['orders','invoice-drafts'];
 if(/(?:\/|-)(preview|validate|search|recipients)(?:\/|$)/.test(route))return [];
 const groups:[RegExp,string[]][]=[
  [/^\/material-items(?:\/variants(?:\/[^/]+)?)?\/?$/,['inventory-movements']],
  [/^\/inventory-entry(?:\/|$)/,['inventory-movements','inventory-stock']],
  [/^\/(shipping|freight|shipping-ports)/,['shipping','shipping-ports']],
  [/^\/orders(?:\/[^/]+)?\/?$/,['orders','order-records','order-shipments','invoice-drafts','assignment-board']],
  [/^\/(orders|work-orders|order-shipments)/,['orders','order-shipments','invoice-drafts','assignment-board']],
  [/^\/work-time\/policy$/,['work-time-policy','work-time','payroll-sources']],
  [/^\/work-time\//,['work-time','payroll-sources']],
  [/^\/(approval-action-settings|expense-approval-settings)(?:\/|$)/,['approval-settings','expense-approval-settings']],
  [/^\/attendance(?:-entries)?(?:\/|$)/,['attendance','payroll-sources','assignment-board']],
  [/^\/(employee-leaves?|leave)(?:[/-]|$)/,['employee-leaves','employees','payroll-sources']],
  [/^\/company-industries(?:\/|$)/,['company-industries','business-partners']],
  [/^\/organizations\/[^/]+\/profile(?:\/|$)/,['organization-profile','business-partners','customers']],
  [/^\/entities\/[^/]+\/bank-accounts(?:\/|$)/,['bank-ledger','business-partners']],
  [/^\/organization-profile(?:\/|$)/,['organization-profile','business-partners','customers']],
  [/^\/accounting-opening(?:\/|$)/,['bank-ledger','issued-invoices','expense-requests','payroll-sources']],
  [/^\/styles/,['styles','assignment-board']],
  [/^\/(assignment|work-logs|production)/,['assignment-board','payroll-sources','styles']],
  [/^\/holidays/,['holidays','payroll-sources']],
  [/^\/(employees|org-memberships|attendance|leave|work-time)/,['employees','payroll-sources']],
  [/^\/(payroll|salary|production-allowance)/,['payroll-sources','salary-system-settings','production-allowance-settings','employees']],
  [/^\/(expense|change-approval|bank-ledger|bank-accounts|management-targets)/,['expense-requests','expense-approvals','change-approvals','bank-ledger','payroll-sources']],
  [/^\/invoices/,['issued-invoices','invoice-drafts','bank-ledger','change-approvals']],
  [/^\/(partner-classifications|partner-editor|customers|partners|business-partners|organizations|organization-profile|sales-prices)/,['customers','business-partners','sales-prices']],
  [/^\/dashboard\/work-requests/,['work-requests']],
 ];
 const topics=groups.find(([pattern])=>pattern.test(route))?.[1]||[];
 return topics.some(topic=>['bank-ledger','expense-requests','issued-invoices'].includes(topic))?[...topics,'account-overview']:topics;
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
    for(const subscriber of subscribers)if((subscriber.orgId===event.orgId||event.orgId===0&&event.systemOnly!==true&&subscriber.orgId!==0&&event.topics.every((topic:string)=>referenceTopics.includes(topic)))&&(!event.origin||subscriber.origin!==event.origin))void subscriber.send({id:event.id,orgId:event.orgId,topics:event.topics,versions:event.versions,source:'server-change',orderId:event.orderId}).catch(()=>subscriber.close());
   });
   try{await next.connect();await next.query('LISTEN '+CHANNEL);client=next;}catch{await next.end().catch(()=>{});throw Error('WORKSPACE_EVENTS_UNAVAILABLE');}
  })().finally(()=>{connecting=null;});
  return connecting;
 };
 const origin=(req:any)=>/^[a-f0-9-]{36}$/i.test(req.get('x-workspace-client')||'')?req.get('x-workspace-client'):'';
 const middleware=(req:any,res:any,next:any)=>{
  const topics=workspaceTopics(req.path);
  if(topics.length&&['POST','PUT','PATCH','DELETE'].includes(req.method)){
   let notified=false;
   const notify=(body:any)=>{
    const employeeId=getCurrentRequestActorEmployeeId(),successful=res.statusCode>=200&&res.statusCode<300&&body?.ok!==false&&!body?.error;
    if(notified||!successful)return;
    notified=true;
    if(successful&&isReferencePath(req.path)&&gates.requireSystemAdmin){
     const quietResponse={status(){return this;},json(){return this;}};
     void gates.requireSystemAdmin(req,quietResponse).then(async(actor:any)=>{
      if(!actor)return;
      await publishWorkspaceChange(db,{id:randomUUID(),orgId:0,topics:workspaceTopics(req.path),origin:origin(req)});
     }).catch(()=>{console.warn('Reference settings notification unavailable');});
    }else if(employeeId&&successful){
     // The authenticated employee is set by company access resolution, never by query orgId.
     const order=res.locals?.workspaceOrder;
     const changedTopics=topics.includes('approval-settings')&&body?.saved?.some((row:any)=>row.menu==='WORK_TIME')
      ?[...topics,'work-time-policy','work-time','payroll-sources']:topics;
     void db.employee.findFirst({where:{id:employeeId,status:'ACTIVE'},select:{orgId:true}}).then(async(employee:any)=>{
      if(!employee)return;
      const orgIds=new Set<number>([employee.orgId,...(order?.orgIds||[])]);
      await Promise.all([...orgIds].filter(id=>Number.isSafeInteger(id)&&id>0).map(orgId=>publishWorkspaceChange(db,{
       id:randomUUID(),orgId,topics:changedTopics,origin:origin(req),...(order?.id?{orderId:order.id}:{}),
      })));
      if(isReferenceUsagePath(req.path))await publishWorkspaceChange(db,{id:randomUUID(),orgId:0,topics:['partner-classifications','accounting-codes'],origin:origin(req),systemOnly:true});
     }).catch(()=>{console.warn('Workspace change notification unavailable');});
    }
   };
   const json=res.json;
   res.json=function(body:any){notify(body);return json.call(this,body);};
   const send=res.send;
   if(send)res.send=function(body:any){if(res.statusCode===204)notify(body);return send.call(this,body);};
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
   if(!closed){if(!res.write('data: '+JSON.stringify({id:event.id,orgId:0,topics,versions:filterVersions(event.versions,topics)})+'\n\n'))close();else res.flush?.();}
  }};
  const heartbeat=setInterval(()=>{if(!closed){res.write(': keepalive\n\n');res.flush?.();}},25000);
  let expiresAt=Date.now()+3600000;try{const claims=JSON.parse(Buffer.from(String(req.get('authorization')).split('.')[1]||'','base64url').toString());if(Number.isFinite(claims.exp))expiresAt=Math.min(expiresAt,claims.exp*1000);}catch{}
  const expiry=setTimeout(close,Math.max(1000,expiresAt-Date.now()));
  subscribers.add(subscriber);res.on('close',close);res.write('event: ready\ndata: '+JSON.stringify({orgId:0,versions:await revisionSnapshot(db,0,referenceTopics)})+'\n\n');res.flush?.();
 };
 const stream=async(req:any,res:any)=>{
  const scope=await gates.requireOrgRole(req,res,{allowedRoles:['ADMIN','ACCOUNTANT','OPERATOR','WORKER'],allowSystemAdmin:false});if(!scope)return;
  const employeeId=gates.actorId();
  const employee=employeeId&&await db.employee.findFirst({where:{id:employeeId,orgId:scope.organization.id,status:'ACTIVE'},select:{id:true,orgRole:true}});
  if(!employee)return res.status(403).json({error:'ACTIVE_EMPLOYEE_REQUIRED'});
  const topicFeatures:Record<string,string>={'accounting-alerts':'DASHBOARD','accounting-codes':'DASHBOARD','partner-classifications':'DASHBOARD','shipping':'SHIPPING_REQUEST','shipping-ports':'FREIGHT','styles':'STYLE','orders':'ORDER','order-shipments':'ORDER_SHIPMENTS','invoice-drafts':'INVOICE','issued-invoices':'INVOICE','assignment-board':'ASSIGNMENT','holidays':'HOLIDAY','employees':'EMPLOYEE','sales-prices':'CUSTOMER','customers':'CUSTOMER','business-partners':'CUSTOMER','salary-system-settings':'SALARY_SYSTEM','production-allowance-settings':'SALARY_SYSTEM','payroll-sources':'PAYROLL','expense-requests':'OUTSOURCING_RECORD','expense-approvals':'OUTSOURCING_RECORD','change-approvals':'DASHBOARD','bank-ledger':'BANK_LEDGER','work-requests':'DASHBOARD'};
  Object.assign(topicFeatures,{'inventory-movements':'INVENTORY_MOVEMENTS','inventory-stock':'INVENTORY_STOCK','account-overview':'ACCOUNT_OVERVIEW','approval-settings':'APPROVAL_SETTINGS','expense-approval-settings':'OUTSOURCING_RECORD','order-records':'ORDER','work-time':'WORK_TIME','work-time-policy':'APPROVAL_SETTINGS','attendance':'ATTENDANCE','employee-leaves':'EMPLOYEE','organization-profile':'BUSINESS','company-industries':'BUSINESS'});
  const offered=await companyIndustryMenuFeatures(db,scope.organization.id,scope.organization.type),features=new Set<string>();
  for(const feature of new Set(Object.values(topicFeatures)))if(offered.includes(feature)&&await gates.canAccess({orgType:scope.organization.type,orgRole:employee.orgRole,feature}))features.add(feature);
  await connect();
  res.set({'Content-Type':'text/event-stream','Cache-Control':'no-cache, no-transform','X-Accel-Buffering':'no'});res.flushHeaders();
  let closed=false;
  const close=()=>{if(closed)return;closed=true;clearInterval(heartbeat);subscribers.delete(subscriber);res.end();};
  const subscriber={orgId:scope.organization.id,origin:origin(req),close,send:async(event:any)=>{
   if(closed)return;
   const topics=event.topics.filter((topic:string)=>topic==='text-acronyms'||features.has(topicFeatures[topic]||''));if(!topics.length)return;
   // A connection is no authorization lease: recheck membership on each delivery.
   const current=await db.employee.findFirst({where:{id:employeeId,orgId:scope.organization.id,status:'ACTIVE',orgRole:employee.orgRole},select:{id:true}}).catch(()=>null);
   if(!current)return close();
   const {orderId,...metadata}=event;
   if(!closed){if(!res.write('data: '+JSON.stringify({...metadata,topics,versions:filterVersions(event.versions,topics),orderId:topics.includes('order-records')?orderId:undefined})+'\n\n'))close();else res.flush?.();}
  }};
  const heartbeat=setInterval(()=>{if(!closed){res.write(': keepalive\n\n');res.flush?.();}},25000);
  subscribers.add(subscriber);res.on('close',close);
  res.write('event: ready\ndata: '+JSON.stringify({orgId:scope.organization.id,versions:await revisionSnapshot(db,scope.organization.id,[...Object.keys(topicFeatures).filter(topic=>features.has(topicFeatures[topic]!)),'text-acronyms'])})+'\n\n');res.flush?.();
  // The regular authentication middleware validated this token; never keep it past expiry.
  let expiresAt=Date.now()+3600000;try{const claims=JSON.parse(Buffer.from(String(req.get('authorization')).split('.')[1]||'','base64url').toString());if(Number.isFinite(claims.exp))expiresAt=Math.min(expiresAt,claims.exp*1000);}catch{}
  const expiry=setTimeout(close,Math.max(1000,expiresAt-Date.now()));res.on('close',()=>clearTimeout(expiry));
 };
 return {middleware,stream,streamSystem,close:async()=>{for(const subscriber of [...subscribers])subscriber.close();await client?.end();client=null;}};
}
