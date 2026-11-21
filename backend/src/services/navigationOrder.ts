import {createHttpError} from '../utils/http';
import {retryEditTransaction} from '../utils/editRevision';

export const NAVIGATION_ORDER_KEY='NAVIGATION_ORDER:1';
export async function readNavigationOrder(db:any){
 const row=await db.systemSetting.findUnique({where:{key:NAVIGATION_ORDER_KEY}});
 return {revision:row?.value?.revision??0,order:row?.value?.order??{}};
}
// IDs rank existing nodes only. They never create routes, move parents or grant access.
export function validateNavigationOrder(input:any){
 if(!Number.isSafeInteger(input?.revision)||input.revision<0||!input.order||typeof input.order!=='object'||Array.isArray(input.order))throw createHttpError(400,'INVALID_NAVIGATION_ORDER');
 const entries=Object.entries(input.order);
 const validId=(value:any)=>typeof value==='string'&&value.length<=180&&(/^(group:[A-Z_]+|path:\/[a-z0-9_/-]+)$/.test(value));
 if(entries.length>80||entries.some(([parent,ids]:any)=>!(parent==='root'||/^group:[A-Z_]+$/.test(parent))||!Array.isArray(ids)||ids.length>150||ids.some((id:any)=>!validId(id))||new Set(ids).size!==ids.length))throw createHttpError(400,'INVALID_NAVIGATION_ORDER');
}
export async function saveNavigationOrder(db:any,input:any,email:string){
 validateNavigationOrder(input);
 return retryEditTransaction(db,async(tx:any)=>{
  await tx.systemSetting.upsert({where:{key:NAVIGATION_ORDER_KEY},create:{key:NAVIGATION_ORDER_KEY,value:{revision:0,order:{}}},update:{}});
  await tx.$queryRawUnsafe('SELECT key FROM "SystemSetting" WHERE key=$1 FOR UPDATE',NAVIGATION_ORDER_KEY);
  const current=await readNavigationOrder(tx);
  if(current.revision!==input.revision)throw createHttpError(409,'NAVIGATION_ORDER_CHANGED');
  const value={revision:current.revision+1,order:input.order};
  await tx.systemSetting.update({where:{key:NAVIGATION_ORDER_KEY},data:{value,updatedBy:email}});
  return value;
 });
}
export function registerNavigationOrderRoutes(app:any,db:any,gates:any){
 app.get('/system/navigation-order',async(req:any,res:any)=>{
  if(!await gates.requireSystemAdmin(req,res))return;
  res.json(await readNavigationOrder(db));
 });
 app.get('/navigation/menu-order',async(req:any,res:any)=>{
  const actor=await gates.requireOrgRole(req,res,{allowedRoles:['ADMIN','OPERATOR','ACCOUNTANT','WORKER'],allowSystemAdmin:false});
  if(!actor)return;
  res.json(await readNavigationOrder(db));
 });
 app.put('/system/navigation-order',async(req:any,res:any)=>{
  const actor=await gates.requireSystemAdmin(req,res);if(!actor)return;
  res.json(await saveNavigationOrder(db,req.body,actor.requesterEmail));
 });
}
