import {randomUUID,createHash} from 'node:crypto';
import {createHttpError} from '../utils/http';
import {resolveInventoryApproval} from './inventoryApprovalPolicy';
import {validateInventoryPurchase} from './inventoryPurchase';
import {noApprovalPolicy} from './approvalDefaults';
const approvalHash=(operation:string,movementId:string,body:any)=>createHash('sha256').update(JSON.stringify(operation==='DELETE'?[movementId,body]:body)).digest('hex');

export async function createInventoryApproval(tx:any,scope:any,movement:any,operation:string,body:any){
 const {orgId,actorId}=scope;
 const resolved=await resolveInventoryApproval(tx,orgId,actorId,operation,body.approvalRevision,body.approvalSelection??{});
 if(!Number.isSafeInteger(body.approvalRevision))throw createHttpError(409,'APPROVAL_SETTINGS_CHANGED');
 const id=operation==='CREATE'?movement.id:randomUUID(),hash=approvalHash(operation,movement.id,body);
 const policy=!resolved.stages.length?{...resolved.policy,...noApprovalPolicy(resolved.policy,actorId),approverIds:[]}:resolved.policy.version===2?{...resolved.policy,config:resolved.policy,approverIds:resolved.stages.map((stage:any)=>stage.employeeId),resolvedStages:resolved.stages.map((stage:any)=>{const person=stage.candidates.find((p:any)=>p.id===stage.employeeId);return {employeeId:person.id,role:person.orgRole,gradeId:person.gradeId,grade:person.grade};})}:resolved.policy;
 await tx.$executeRaw`INSERT INTO "InventoryApprovalRequest" (id,"orgId","movementId",operation,"targetRevision","drafterId","clientKey","requestHash",policy)
 VALUES (${id},${orgId},${movement.id},${operation},${movement.revision},${actorId},${body.clientKey},${hash},${JSON.stringify(policy)}::jsonb)`;
 for(const [position,stage] of resolved.stages.entries())await tx.$executeRaw`INSERT INTO "InventoryApprovalStep" ("requestId","orgId",position,"employeeId","employeeName") VALUES (${id},${orgId},${position},${stage.employeeId},${stage.name})`;
 if(!resolved.stages.length){
  if(operation==='CREATE')await validateInventoryPurchase(tx,orgId,movement.id);
  await tx.$executeRaw`UPDATE "InventoryApprovalRequest" SET status='APPROVED',revision=revision+1 WHERE id=${id}`;
  if(operation==='CREATE')await tx.$executeRaw`UPDATE "InventoryMovement" SET status='APPROVED',revision=revision+1 WHERE id=${movement.id}`;
  else{
   const [row]=await tx.$queryRaw`SELECT "variantId" FROM "InventoryMovement" WHERE id=${movement.id} AND "orgId"=${orgId}`;
   await tx.$executeRaw`UPDATE "InventoryApprovalRequest" SET status='CANCELLED',revision=revision+1 WHERE "movementId"=${movement.id} AND operation='CREATE' AND status='PENDING'`;
   await tx.$executeRaw`DELETE FROM "InventoryMovement" WHERE id=${movement.id} AND "orgId"=${orgId}`;
   await tx.$executeRaw`DELETE FROM "InventoryVariant" v WHERE v.id=${row.variantId} AND v."orgId"=${orgId} AND NOT EXISTS(SELECT 1 FROM "InventoryMovement" m WHERE m."variantId"=v.id)`;
  }
 }
 return id;
}

export function registerInventoryApprovalRoutes(app:any,db:any,access:any){
 app.get('/inventory-entry/approval-preview',async(req:any,res:any)=>{
  const scope=await access(req,res,'INVENTORY_MOVEMENTS');if(!scope)return;
  let selection:any={};try{selection=req.query.selection?JSON.parse(String(req.query.selection)):{};}catch{throw createHttpError(400,'INVALID_EXPENSE_APPROVERS');}
  res.json(await resolveInventoryApproval(db,scope.orgId,scope.actorId,String(req.query.operation||'CREATE'),undefined,selection,true));
 });
 app.get('/inventory-entry/approvals',async(req:any,res:any)=>{
  const scope=await access(req,res,'INVENTORY_MOVEMENTS');if(!scope)return;
  res.json(await db.$queryRaw`SELECT r.id,r.operation,r.revision,r."movementId",m."movementDate"::text AS date,m.quantity::text,m.remark,m."purchaseSnapshot",i.data AS master,v.attributes,
    jsonb_build_object('id',e.id,'name',e.name,'orgRole',e."orgRole",'gradeId',e."gradeId") AS drafter,
    (SELECT jsonb_agg(jsonb_build_object('employeeId',s."employeeId",'name',s."employeeName",'decision',s.decision) ORDER BY s.position) FROM "InventoryApprovalStep" s WHERE s."requestId"=r.id) AS stages,
    ((SELECT s."employeeId" FROM "InventoryApprovalStep" s WHERE s."requestId"=r.id AND s.decision IS NULL ORDER BY s.position LIMIT 1)=${scope.actorId}
      AND NOT (r.operation='CREATE' AND EXISTS(SELECT 1 FROM "InventoryApprovalRequest" deletion WHERE deletion."movementId"=r."movementId" AND deletion.operation='DELETE' AND deletion.status='PENDING'))) AS "canDecide"
   FROM "InventoryApprovalRequest" r JOIN "InventoryMovement" m ON m.id=r."movementId" AND m."orgId"=r."orgId"
   JOIN "InventoryVariant" v ON v.id=m."variantId" JOIN "MaterialItem" i ON i.id=v."masterId" JOIN "Employee" e ON e.id=r."drafterId" AND e."orgId"=r."orgId"
   WHERE r."orgId"=${scope.orgId} AND r.status='PENDING' ORDER BY r."createdAt",r.id`);
 });
 app.post('/inventory-entry/:id/delete-request',async(req:any,res:any)=>{
  const scope=await access(req,res,'INVENTORY_MOVEMENTS');if(!scope)return;
  const body=req.body??{},hash=approvalHash('DELETE',req.params.id,body);
  if(typeof body.clientKey!=='string'||!/^[\w-]{8,100}$/.test(body.clientKey)||!Number.isSafeInteger(body.revision))throw createHttpError(400,'INVALID_INVENTORY_MOVEMENT');
  const result=await db.$transaction(async(tx:any)=>{
   await tx.$queryRaw`SELECT id FROM "Organization" WHERE id=${scope.orgId} FOR UPDATE`;
   await tx.$queryRaw`SELECT set_config('baro.inventory_actor',${String(scope.actorId)},true)`;
   const [prior]=await tx.$queryRaw`SELECT id,operation,"requestHash","drafterId" FROM "InventoryApprovalRequest" WHERE "orgId"=${scope.orgId} AND "clientKey"=${body.clientKey}`;
   if(prior){if(prior.operation!=='DELETE'||prior.requestHash!==hash||prior.drafterId!==scope.actorId)throw createHttpError(409,'INVENTORY_RETRY_MISMATCH');return {id:prior.id};}
   const [movement]=await tx.$queryRaw`SELECT id,revision,status FROM "InventoryMovement" WHERE id=${req.params.id} AND "orgId"=${scope.orgId} FOR UPDATE`;
   if(!movement||movement.revision!==body.revision)throw createHttpError(409,'INVENTORY_MOVEMENT_CHANGED');
   if((await tx.$queryRaw`SELECT id FROM "InventoryApprovalRequest" WHERE "movementId"=${movement.id} AND operation='DELETE' AND status='PENDING'`).length)throw createHttpError(409,'INVENTORY_DELETE_PENDING');
   return {id:await createInventoryApproval(tx,scope,movement,'DELETE',body)};
  });res.status(201).json(result);
 });
 app.post('/inventory-entry/approvals/:id/decision',async(req:any,res:any)=>{
  const scope=await access(req,res,'INVENTORY_MOVEMENTS');if(!scope)return;
  const body=req.body??{};
  if(!['APPROVED','REJECTED'].includes(body.decision)||!Number.isSafeInteger(body.revision))throw createHttpError(400,'INVALID_INVENTORY_DECISION');
  const result=await db.$transaction(async(tx:any)=>{
   await tx.$queryRaw`SELECT id FROM "Organization" WHERE id=${scope.orgId} FOR UPDATE`;
   await tx.$queryRaw`SELECT set_config('baro.inventory_actor',${String(scope.actorId)},true)`;
   const [request]=await tx.$queryRaw`SELECT * FROM "InventoryApprovalRequest" WHERE id=${req.params.id} AND "orgId"=${scope.orgId} FOR UPDATE`;
   if(!request)throw createHttpError(404,'INVENTORY_APPROVAL_NOT_FOUND');
   const steps=await tx.$queryRaw`SELECT * FROM "InventoryApprovalStep" WHERE "requestId"=${request.id} ORDER BY position`;
   const own=steps.find((s:any)=>s.employeeId===scope.actorId);
   if(own?.decision===body.decision&&request.revision===body.revision+1)return {status:request.status};
   if(request.status!=='PENDING'||request.revision!==body.revision)throw createHttpError(409,'INVENTORY_MOVEMENT_CHANGED');
   if(request.operation==='CREATE'&&(await tx.$queryRaw`SELECT id FROM "InventoryApprovalRequest" WHERE "movementId"=${request.movementId} AND operation='DELETE' AND status='PENDING'`).length)throw createHttpError(409,'INVENTORY_DELETE_PENDING');
   const next=steps.find((s:any)=>!s.decision);
   if(!next||next.employeeId!==scope.actorId||request.drafterId===scope.actorId)throw createHttpError(403,'INVENTORY_APPROVAL_FORBIDDEN');
   if(request.policy?.config?.version===2){const [eligible]=await tx.$queryRaw`SELECT baro_inventory_stage_eligible(${scope.orgId}::integer,${scope.actorId}::integer,${JSON.stringify(request.policy.config.stages[next.position])}::jsonb) AS valid`;if(!eligible?.valid)throw createHttpError(409,'INVENTORY_APPROVER_UNAVAILABLE');}
   const [movement]=await tx.$queryRaw`SELECT id,revision,"variantId" FROM "InventoryMovement" WHERE id=${request.movementId} AND "orgId"=${scope.orgId} FOR UPDATE`;
   if(!movement||movement.revision!==request.targetRevision)throw createHttpError(409,'INVENTORY_MOVEMENT_CHANGED');
   if(request.operation==='CREATE'&&body.decision==='APPROVED'&&next.position===steps.length-1)await validateInventoryPurchase(tx,scope.orgId,movement.id);
   await tx.$executeRaw`UPDATE "InventoryApprovalStep" SET decision=${body.decision},"decidedAt"=now() WHERE "requestId"=${request.id} AND position=${next.position}`;
   const status=body.decision==='REJECTED'?'REJECTED':next.position===steps.length-1?'APPROVED':'PENDING';
   if(status==='PENDING'){
    // A new revision invalidates another reviewer's stale decision without changing the policy snapshot.
    // The request guard permits this through its explicit pending revision transition.
    await tx.$executeRaw`UPDATE "InventoryApprovalRequest" SET revision=revision+1 WHERE id=${request.id}`;
   }else{
    await tx.$executeRaw`UPDATE "InventoryApprovalRequest" SET status=${status},revision=revision+1 WHERE id=${request.id}`;
    if(request.operation==='CREATE')await tx.$executeRaw`UPDATE "InventoryMovement" SET status=${status},revision=revision+1 WHERE id=${movement.id}`;
    else if(status==='APPROVED'){
     await tx.$executeRaw`UPDATE "InventoryApprovalRequest" SET status='CANCELLED',revision=revision+1 WHERE "movementId"=${movement.id} AND operation='CREATE' AND status='PENDING'`;
     await tx.$executeRaw`DELETE FROM "InventoryMovement" WHERE id=${movement.id} AND "orgId"=${scope.orgId}`;
     await tx.$executeRaw`DELETE FROM "InventoryVariant" v WHERE v.id=${movement.variantId} AND v."orgId"=${scope.orgId} AND NOT EXISTS(SELECT 1 FROM "InventoryMovement" m WHERE m."variantId"=v.id)`;
    }
   }
   return {status};
  });res.json(result);
 });
}
