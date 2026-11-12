import {randomUUID} from 'node:crypto';
import {createHttpError} from '../utils/http';
import {retryEditTransaction} from '../utils/editRevision';
const fail=(code:string,status=400):never=>{throw createHttpError(status,code);};
async function actor(db:any,orgId:number,actorId:number){
 if(!Number.isSafeInteger(orgId)||orgId<=0||!Number.isSafeInteger(actorId)||actorId<=0)fail('WORK_REQUEST_ACCESS_DENIED',403);
 const person=await db.employee.findFirst({where:{id:actorId,orgId,status:'ACTIVE',organization:{isActive:true,ownerOrgId:null}},select:{id:true,orgRole:true}});
 if(!person)fail('WORK_REQUEST_ACCESS_DENIED',403);return person;
}
async function event(tx:any,orgId:number,actorId:number,row:any,action:string,snapshot:any=null){
 await tx.$executeRawUnsafe('INSERT INTO "DashboardWorkRequestEvent"(id,"orgId","requestId","actorId",action,version,snapshot) VALUES($1,$2,$3,$4,$5,$6,$7::jsonb)',randomUUID(),orgId,row.id,actorId,action,row.version,snapshot?JSON.stringify(snapshot):null);
}
export async function listWorkRequests(db:any,orgId:number,actorId:number,query:any={}){
 const person=await actor(db,orgId,actorId),page=Number(query.page||0),status=query.status||'ALL',direction=query.direction||'ALL';
 if(!Number.isSafeInteger(page)||page<0||page>100000||!['ALL','OPEN','DONE'].includes(status)||!['ALL','SENT','RECEIVED'].includes(direction))fail('WORK_REQUEST_INVALID');
 const rows=await db.$queryRawUnsafe(`SELECT r.*,s.name AS "senderName",p.name AS "recipientName",count(*) OVER()::integer AS total FROM "DashboardWorkRequest" r JOIN "Employee" s ON s.id=r."senderId" AND s."orgId"=r."orgId" JOIN "Employee" p ON p.id=r."recipientId" AND p."orgId"=r."orgId" WHERE r."orgId"=$1 AND ((r."senderId"=$2 AND r."senderHiddenAt" IS NULL AND $3<>'RECEIVED') OR (r."recipientId"=$2 AND r."recipientHiddenAt" IS NULL AND $3<>'SENT')) AND ($4='ALL' OR r.status=$4) ORDER BY r."createdAt" DESC,r.id DESC LIMIT 21 OFFSET $5`,orgId,actorId,direction,status,page*20);
 return {actorId,canCreate:person.orgRole==='ADMIN',rows:rows.slice(0,20).map(({total,...row}:any)=>row),hasMore:rows.length>20,page};
}
export async function createWorkRequest(db:any,orgId:number,actorId:number,input:any){
 if(typeof input?.clientKey!=='string'||!/^[a-zA-Z0-9_-]{8,80}$/.test(input.clientKey)||!Number.isSafeInteger(input.recipientId)||input.recipientId===actorId||typeof input.title!=='string'||!input.title.trim()||input.title.trim().length>200||typeof input.message!=='string'||input.message.length>4000)fail('WORK_REQUEST_INVALID');
 return retryEditTransaction(db,async(tx:any)=>{
  if((await actor(tx,orgId,actorId)).orgRole!=='ADMIN')fail('WORK_REQUEST_ADMIN_REQUIRED',403);
  if(!await tx.employee.findFirst({where:{id:input.recipientId,orgId,status:'ACTIVE'}}))fail('WORK_REQUEST_RECIPIENT_SCOPE',403);
  await tx.$queryRawUnsafe('SELECT pg_advisory_xact_lock(hashtext($1))::text',`work-request:${orgId}:${actorId}:${input.clientKey}`);
  const previous=(await tx.$queryRawUnsafe('SELECT * FROM "DashboardWorkRequest" WHERE "orgId"=$1 AND "senderId"=$2 AND "clientKey"=$3',orgId,actorId,input.clientKey))[0];
  if(previous){if(previous.recipientId!==input.recipientId||previous.title!==input.title.trim()||previous.message!==input.message)fail('WORK_REQUEST_CHANGED',409);return previous;}
  const row=(await tx.$queryRawUnsafe('INSERT INTO "DashboardWorkRequest"(id,"orgId","senderId","recipientId","clientKey",title,message) VALUES($1,$2,$3,$4,$5,$6,$7) RETURNING *',randomUUID(),orgId,actorId,input.recipientId,input.clientKey,input.title.trim(),input.message))[0];
  await event(tx,orgId,actorId,row,'CREATE');return row;
 });
}
export async function actWorkRequest(db:any,orgId:number,actorId:number,id:string,input:any){
 if(!['COMPLETE','HIDE','UPDATE'].includes(input?.action)||!Number.isSafeInteger(input.version)||input.version<1)fail('WORK_REQUEST_INVALID');
 return retryEditTransaction(db,async(tx:any)=>{
  const person=await actor(tx,orgId,actorId);
  const before=(await tx.$queryRawUnsafe('SELECT * FROM "DashboardWorkRequest" WHERE id=$1 AND "orgId"=$2 AND ("senderId"=$3 OR "recipientId"=$3) FOR UPDATE',id,orgId,actorId))[0];
  if(!before)fail('WORK_REQUEST_NOT_FOUND',404);
  if(input.action==='UPDATE'){
   if(before.senderId!==actorId||person.orgRole!=='ADMIN')fail('WORK_REQUEST_ADMIN_REQUIRED',403);
   if(typeof input.title!=='string'||!input.title.trim()||input.title.trim().length>200||typeof input.message!=='string'||input.message.length>4000)fail('WORK_REQUEST_INVALID');
   if(before.status!=='OPEN')fail('WORK_REQUEST_CHANGED',409);
   if(before.title===input.title.trim()&&before.message===input.message)return before;
   if(before.version!==input.version)fail('WORK_REQUEST_CHANGED',409);
   const row=(await tx.$queryRawUnsafe('UPDATE "DashboardWorkRequest" SET title=$1,message=$2,version=version+1 WHERE id=$3 AND "orgId"=$4 RETURNING *',input.title.trim(),input.message,id,orgId))[0];
   await event(tx,orgId,actorId,row,'UPDATE',{before:{title:before.title,message:before.message},after:{title:row.title,message:row.message}});return row;
  }
  const column=before.senderId===actorId?'senderHiddenAt':'recipientHiddenAt';
  if(input.action==='COMPLETE'&&before.recipientId!==actorId)fail('WORK_REQUEST_RECIPIENT_REQUIRED',403);
  if(input.action==='COMPLETE'&&before.status==='DONE'||input.action==='HIDE'&&before[column])return before;
  if(before.version!==input.version)fail('WORK_REQUEST_CHANGED',409);
  if(input.action==='HIDE'&&before.status!=='DONE')fail('WORK_REQUEST_NOT_COMPLETED',409);
  const row=(await tx.$queryRawUnsafe(`UPDATE "DashboardWorkRequest" SET ${input.action==='COMPLETE'?`status='DONE',"completedAt"=CURRENT_TIMESTAMP`:`"${column}"=CURRENT_TIMESTAMP`},version=version+1 WHERE id=$1 AND "orgId"=$2 RETURNING *`,id,orgId))[0];
  await event(tx,orgId,actorId,row,input.action);return row;
 });
}
export function registerDashboardWorkRequestRoutes(app:any,db:any,gates:any){
 const access=async(req:any,res:any)=>{
  const ctx=await gates.requireOrgRole(req,res,{allowedRoles:['ADMIN','ACCOUNTANT','OPERATOR','WORKER'],allowSystemAdmin:false});if(!ctx)return null;
  const orgId=ctx.organization.id,actorId=gates.actorId(),person=await actor(db,orgId,actorId);
  if(!await gates.canAccess({orgType:ctx.organization.type,orgRole:person.orgRole,feature:'DASHBOARD'}))fail('WORK_REQUEST_ACCESS_DENIED',403);
  res.setHeader('Cache-Control','no-store');return {orgId,actorId,person};
 };
 app.get('/dashboard/work-requests',async(req:any,res:any)=>{const scope=await access(req,res);if(scope)res.json(await listWorkRequests(db,scope.orgId,scope.actorId,req.query));});
 app.get('/dashboard/work-requests/recipients',async(req:any,res:any)=>{const scope=await access(req,res);if(!scope)return;if(scope.person.orgRole!=='ADMIN')fail('WORK_REQUEST_ADMIN_REQUIRED',403);res.json(await db.employee.findMany({where:{orgId:scope.orgId,status:'ACTIVE',id:{not:scope.actorId}},select:{id:true,name:true,employeeNo:true},orderBy:[{name:'asc'},{id:'asc'}]}));});
 app.post('/dashboard/work-requests',async(req:any,res:any)=>{const scope=await access(req,res);if(scope)res.json(await createWorkRequest(db,scope.orgId,scope.actorId,req.body));});
 app.post('/dashboard/work-requests/:id',async(req:any,res:any)=>{const scope=await access(req,res);if(scope)res.json(await actWorkRequest(db,scope.orgId,scope.actorId,req.params.id,req.body));});
}
