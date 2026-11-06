import {createHash,randomUUID} from 'node:crypto';
import {createHttpError} from '../utils/http';
import {retryEditTransaction} from '../utils/editRevision';
const fail=(code:string,status=400):never=>{throw createHttpError(status,code);};
const hash=(value:any)=>createHash('sha256').update(JSON.stringify(value)).digest('hex');
const text=(value:any,max:number)=>typeof value==='string'&&value.length<=max?value.trim():fail('SHIPPING_INVALID_INPUT');
const key=(value:any)=>typeof value==='string'&&/^[\w-]{8,100}$/.test(value)?value:fail('SHIPPING_INVALID_INPUT');
export async function shippingActor(db:any,orgId:number,actorId:number){
 if(!Number.isSafeInteger(actorId)||actorId<=0||!Number.isSafeInteger(orgId)||orgId<=0)fail('SHIPPING_ACCESS_DENIED',403);
 const actor=await db.employee.findFirst({where:{id:actorId,orgId,status:'ACTIVE',orgRole:{in:['ADMIN','OPERATOR','ACCOUNTANT']},organization:{type:'MANUFACTURER',isActive:true,ownerOrgId:null}}});
 if(!actor)fail('SHIPPING_ACCESS_DENIED',403);return actor;
}
async function order(db:any,orgId:number,id:number,lock=false){
 if(!Number.isSafeInteger(id)||id<=0)fail('SHIPPING_NOT_FOUND',404);
 if(lock)await db.$queryRawUnsafe('SELECT id FROM "WorkOrder" WHERE id=$1 AND "orgId"=$2 FOR UPDATE',id,orgId);
 const row=await db.workOrder.findFirst({where:{id,orgId,OR:[{sellerOrgId:orgId},{sellerOrgId:null}]},include:{customerOrg:{select:{id:true,name:true,nameKo:true,nameVi:true}},workOrderItems:{include:{style:{select:{id:true,code:true,name:true}},color:true},orderBy:[{sortOrder:'asc'},{id:'asc'}]}}});
 if(!row)fail('SHIPPING_NOT_FOUND',404);return row;
}
async function policy(db:any,orgId:number,workOrderId:number){
 return (await db.$queryRawUnsafe('SELECT * FROM "OrderShippingPolicy" WHERE "orgId"=$1 AND "workOrderId"=$2',orgId,workOrderId))[0]||{excluded:false,version:0,reason:''};
}
export function shippingCells(items:any[],shipments:any[]){
 const used=new Map<string,number>();for(const shipment of shipments)if(!shipment.cancelledAt)for(const cell of shipment.lines){const id=cell.itemId+':'+cell.size;used.set(id,(used.get(id)||0)+cell.quantity);}
 return items.flatMap(item=>Object.entries(item.sizeQuantities||{}).filter(([,quantity])=>Number.isSafeInteger(quantity)&&Number(quantity)>0).map(([size,quantity])=>({itemId:item.id,size,ordered:Number(quantity),shipped:used.get(item.id+':'+size)||0,remaining:Number(quantity)-(used.get(item.id+':'+size)||0),style:item.style,color:item.color,gender:item.gender})));
}
export async function shippingDetail(db:any,orgId:number,actorId:number,id:number){
 await shippingActor(db,orgId,actorId);const row=await order(db,orgId,id);
 const [state,shipments,events]=await Promise.all([policy(db,orgId,id),db.$queryRawUnsafe('SELECT s.*,e.name AS "createdByName",c.name AS "cancelledByName" FROM "OrderShipment" s JOIN "Employee" e ON e.id=s."createdByEmployeeId" LEFT JOIN "Employee" c ON c.id=s."cancelledByEmployeeId" WHERE s."orgId"=$1 AND s."workOrderId"=$2 ORDER BY s."shipmentDate" DESC,s."createdAt" DESC',orgId,id),db.$queryRawUnsafe('SELECT a.*,e.name AS "actorName" FROM "OrderShippingPolicyEvent" a JOIN "Employee" e ON e.id=a."actorId" WHERE a."orgId"=$1 AND a."workOrderId"=$2 ORDER BY a."createdAt" DESC',orgId,id)]);
 const cells=shippingCells(row.workOrderItems,shipments);return {order:row,policy:state,shipments,events,cells,totals:{ordered:cells.reduce((n,c)=>n+c.ordered,0),shipped:cells.reduce((n,c)=>n+c.shipped,0),remaining:cells.reduce((n,c)=>n+c.remaining,0)}};
}
export async function listShippingOrders(db:any,orgId:number,actorId:number,query:any={}){
 await shippingActor(db,orgId,actorId);const q=text(query.q||'',120),mode=query.mode||'TRACKED',page=Number(query.page||0);
 if(!['TRACKED','EXCLUDED','ALL'].includes(mode)||!Number.isSafeInteger(page)||page<0||page>100000)fail('SHIPPING_INVALID_INPUT');
 const rows=await db.$queryRawUnsafe(`SELECT w.id,w."orderNumber",w."dueDate",COALESCE(c.name,'') AS customer,c."nameKo" AS "customerKo",c."nameVi" AS "customerVi",COALESCE(p.excluded,false) AS excluded,
 COALESCE((SELECT sum((v.value#>>'{}')::bigint) FROM "WorkOrderItem" i CROSS JOIN LATERAL jsonb_each(CASE WHEN jsonb_typeof(i."sizeQuantities")='object' THEN i."sizeQuantities" ELSE '{}'::jsonb END) v WHERE i."workOrderId"=w.id AND jsonb_typeof(v.value)='number'),0)::text AS ordered,
 COALESCE((SELECT sum((cell->>'quantity')::bigint) FROM "OrderShipment" s CROSS JOIN LATERAL jsonb_array_elements(s.lines) cell WHERE s."workOrderId"=w.id AND s."orgId"=w."orgId" AND s."cancelledAt" IS NULL),0)::text AS shipped,
 count(*) OVER()::integer AS "resultCount"
 FROM "WorkOrder" w LEFT JOIN "Organization" c ON c.id=w."customerId" LEFT JOIN "OrderShippingPolicy" p ON p."workOrderId"=w.id AND p."orgId"=w."orgId"
 WHERE w."orgId"=$1 AND COALESCE(w."sellerOrgId",w."orgId")=$1 AND ($2='' OR position(lower($2) IN lower(w."orderNumber"||' '||COALESCE(c.name,'')||' '||COALESCE(c."nameKo",'')))>0)
 AND ($3='ALL' OR COALESCE(p.excluded,false)=($3='EXCLUDED')) ORDER BY w."createdAt" DESC,w.id DESC LIMIT 20 OFFSET $4`,orgId,q,mode,page*20);
 return {rows:rows.map((r:any)=>({...r,ordered:Number(r.ordered),shipped:Number(r.shipped)})),total:rows[0]?.resultCount||0,page};
}
export async function saveShippingPolicy(db:any,orgId:number,actorId:number,id:number,input:any){
 await shippingActor(db,orgId,actorId);if(typeof input?.excluded!=='boolean'||!Number.isSafeInteger(input.version))fail('SHIPPING_INVALID_INPUT');
 const clientKey=key(input.clientKey),reason=text(input.reason||'',1000);if(input.excluded&&!reason)fail('SHIPPING_REASON_REQUIRED');
 const requestHash=hash({id,excluded:input.excluded,version:input.version,reason});
 return retryEditTransaction(db,async(tx:any)=>{
  await shippingActor(tx,orgId,actorId);await order(tx,orgId,id,true);
  const old=(await tx.$queryRawUnsafe('SELECT * FROM "OrderShippingPolicyEvent" WHERE "orgId"=$1 AND "clientKey"=$2',orgId,clientKey))[0];if(old){if(old.requestHash!==requestHash)fail('SHIPPING_CHANGED',409);return old.snapshot;}
  const before=await policy(tx,orgId,id);if(before.version!==input.version)fail('SHIPPING_CHANGED',409);
  const snapshot={excluded:input.excluded,reason,version:before.version+1};
  await tx.$executeRawUnsafe('INSERT INTO "OrderShippingPolicy"("orgId","workOrderId",excluded,reason,version,"updatedByEmployeeId") VALUES($1,$2,$3,$4,$5,$6) ON CONFLICT("workOrderId") DO UPDATE SET excluded=EXCLUDED.excluded,reason=EXCLUDED.reason,version=EXCLUDED.version,"updatedByEmployeeId"=EXCLUDED."updatedByEmployeeId","updatedAt"=CURRENT_TIMESTAMP',orgId,id,input.excluded,reason,snapshot.version,actorId);
  await tx.$executeRawUnsafe('INSERT INTO "OrderShippingPolicyEvent"(id,"orgId","workOrderId","clientKey","requestHash",snapshot,"actorId") VALUES($1,$2,$3,$4,$5,$6::jsonb,$7)',randomUUID(),orgId,id,clientKey,requestHash,JSON.stringify({before,...snapshot}),actorId);return snapshot;
 });
}
export async function createOrderShipment(db:any,orgId:number,actorId:number,id:number,input:any){
 await shippingActor(db,orgId,actorId);const clientKey=key(input?.clientKey),shipmentDate=text(input.shipmentDate,10),remark=text(input.remark||'',2000);
 if(!/^\d{4}-\d{2}-\d{2}$/.test(shipmentDate)||!Number.isFinite(Date.parse(shipmentDate+'T00:00:00Z'))||new Date(shipmentDate+'T00:00:00Z').toISOString().slice(0,10)!==shipmentDate||!Array.isArray(input.lines)||!input.lines.length||input.lines.length>2000)fail('SHIPPING_INVALID_INPUT');
 const lines=input.lines.map((c:any)=>{if(!Number.isSafeInteger(c?.itemId)||c.itemId<=0||!Number.isSafeInteger(c.quantity)||c.quantity<=0||c.quantity>2147483647||typeof c.size!=='string'||!c.size||c.size.length>80)fail('SHIPPING_INVALID_INPUT');return {itemId:c.itemId,size:c.size,quantity:c.quantity};}).sort((a:any,b:any)=>a.itemId-b.itemId||a.size.localeCompare(b.size));
 if(new Set(lines.map((c:any)=>c.itemId+':'+c.size)).size!==lines.length)fail('SHIPPING_INVALID_INPUT');const requestHash=hash({id,shipmentDate,remark,lines});
 return retryEditTransaction(db,async(tx:any)=>{
  await shippingActor(tx,orgId,actorId);const row=await order(tx,orgId,id,true);
  const old=(await tx.$queryRawUnsafe('SELECT * FROM "OrderShipment" WHERE "orgId"=$1 AND "clientKey"=$2',orgId,clientKey))[0];if(old){if(old.requestHash!==requestHash)fail('SHIPPING_CHANGED',409);return old;}
  if((await policy(tx,orgId,id)).excluded)fail('SHIPPING_EXCLUDED',409);
  const shipments=await tx.$queryRawUnsafe('SELECT lines,"cancelledAt" FROM "OrderShipment" WHERE "orgId"=$1 AND "workOrderId"=$2',orgId,id),cells=shippingCells(row.workOrderItems,shipments);
  const snapshots=lines.map((line:any)=>{const cell=cells.find((c:any)=>c.itemId===line.itemId&&c.size===line.size)!;if(!cell)fail('SHIPPING_INVALID_LINES');if(line.quantity>cell.remaining)fail('SHIPPING_EXCEEDS_ORDER',409);return {...line,style:cell.style,color:cell.color,gender:cell.gender};});
  return (await tx.$queryRawUnsafe('INSERT INTO "OrderShipment"(id,"orgId","workOrderId","clientKey","requestHash","shipmentDate",remark,lines,"createdByEmployeeId") VALUES($1,$2,$3,$4,$5,$6,$7,$8::jsonb,$9) RETURNING *',randomUUID(),orgId,id,clientKey,requestHash,shipmentDate,remark,JSON.stringify(snapshots),actorId))[0];
 });
}
export async function cancelOrderShipment(db:any,orgId:number,actorId:number,id:number,shipmentId:string,input:any){
 await shippingActor(db,orgId,actorId);const reason=text(input?.reason||'',1000);if(!reason)fail('SHIPPING_REASON_REQUIRED');
 return retryEditTransaction(db,async(tx:any)=>{
  await shippingActor(tx,orgId,actorId);await order(tx,orgId,id,true);
  const before=(await tx.$queryRawUnsafe('SELECT * FROM "OrderShipment" WHERE "orgId"=$1 AND "workOrderId"=$2 AND id=$3',orgId,id,shipmentId))[0];if(!before)fail('SHIPPING_NOT_FOUND',404);
  if(before.cancelledAt){if(before.cancellationReason===reason)return before;fail('SHIPPING_CHANGED',409);}
  if(before.version!==input.version)fail('SHIPPING_CHANGED',409);
  return (await tx.$queryRawUnsafe('UPDATE "OrderShipment" SET "cancelledAt"=CURRENT_TIMESTAMP,"cancelledByEmployeeId"=$1,"cancellationReason"=$2,version=version+1 WHERE id=$3 AND "orgId"=$4 RETURNING *',actorId,reason,shipmentId,orgId))[0];
 });
}
export function registerOrderShipmentRoutes(app:any,db:any,gates:any){
 const route=(method:string,path:string,action:any)=>app[method](path,async(req:any,res:any)=>{
  const access=await gates.requireOrgRole(req,res,{allowedRoles:['ADMIN','OPERATOR','ACCOUNTANT'],allowSystemAdmin:false});if(!access)return;
  const orgId=access.organization.id,actorId=gates.actorId();const actor=await shippingActor(db,orgId,actorId);
  if(!await gates.canAccess({orgType:access.organization.type,orgRole:actor.orgRole,feature:'ORDER'}))fail('SHIPPING_ACCESS_DENIED',403);
  res.json(await action(req,orgId,actorId));
 });
 route('get','/orders/shipments',(r:any,o:number,a:number)=>listShippingOrders(db,o,a,r.query));
 route('get','/orders/:orderId/shipments',(r:any,o:number,a:number)=>shippingDetail(db,o,a,Number(r.params.orderId)));
 route('post','/orders/:orderId/shipments',(r:any,o:number,a:number)=>createOrderShipment(db,o,a,Number(r.params.orderId),r.body));
 route('put','/orders/:orderId/shipping-policy',(r:any,o:number,a:number)=>saveShippingPolicy(db,o,a,Number(r.params.orderId),r.body));
 route('post','/orders/:orderId/shipments/:shipmentId/cancel',(r:any,o:number,a:number)=>cancelOrderShipment(db,o,a,Number(r.params.orderId),r.params.shipmentId,r.body));
}
