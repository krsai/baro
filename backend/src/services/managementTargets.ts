import {createHttpError} from '../utils/http';
import {retryEditTransaction} from '../utils/editRevision';
import {requirePayrollActor} from './payrollPayables';
import {setPayrollManagementInTransaction} from './payrollManagement';
import {shippingActor,saveShippingPolicyInTransaction} from './orderShipments';
const fail=(code:string,status=400):never=>{throw createHttpError(status,code);};
const payrollKind=(kind:string)=>['PAYABLE','EVIDENCE'].includes(kind);
export async function targetActor(db:any,orgId:number,actorId:number,kind:string){
 if(!['PAYABLE','EVIDENCE','INVOICE','SHIPPING'].includes(kind))fail('TARGET_INVALID');
 if(payrollKind(kind))return requirePayrollActor(db,orgId,actorId);
 const actor=await shippingActor(db,orgId,actorId);
 const policy=await db.systemSetting.findUnique({where:{key:'ROLE_ACCESS_POLICY'}});
 const configured=policy?.value?.MANUFACTURER?.[actor.orgRole];
 if(Array.isArray(configured)&&!configured.includes('ORDER'))fail('TARGET_ACCESS_DENIED',403);
 return actor;
}
export async function listManagementTargets(db:any,orgId:number,actorId:number,kind:string,query:any){
 await targetActor(db,orgId,actorId,kind);
 const q=String(query.q||'').trim(),page=Number(query.page||0),excluded=query.excluded==='true';
 if(q.length>120||!Number.isSafeInteger(page)||page<0||page>100000||!['true','false'].includes(query.excluded))fail('TARGET_INVALID');
 if(payrollKind(kind)){
  const condition=kind==='PAYABLE'?{payableManagementExcluded:excluded}:{OR:[{evidenceManagementExcluded:excluded},{evidenceManagementExcluded:null,payableManagementExcluded:excluded}]};
  const rows=await db.payrollSnapshot.findMany({where:{orgId,...condition,AND:q?[{OR:[{month:{contains:q}},{factory:{name:{contains:q,mode:'insensitive'}}},{factory:{nameKo:{contains:q,mode:'insensitive'}}},{factory:{nameVi:{contains:q,mode:'insensitive'}}},{payableDocument:{managementNumber:{contains:q,mode:'insensitive'}}}]}]:[]},select:{id:true,month:true,factoryId:true,revision:true,managementRevision:true,payableManagementExcluded:true,evidenceManagementExcluded:true,factory:{select:{name:true,nameKo:true,nameVi:true}},payableDocument:{select:{managementNumber:true}}},orderBy:[{month:'desc'},{factoryId:'asc'}],skip:page*50,take:51});
  return {rows:rows.slice(0,50).map((s:any)=>({id:s.id,title:s.month,subtitle:s.factory.name,nameKo:s.factory.nameKo,nameVi:s.factory.nameVi,reference:s.payableDocument?.managementNumber||'',month:s.month,factoryId:s.factoryId,revision:s.managementRevision,snapshotRevision:s.revision,payableExcluded:s.payableManagementExcluded,evidenceExcluded:s.evidenceManagementExcluded??s.payableManagementExcluded,excluded})),hasMore:rows.length>50};
 }
 if(kind==='INVOICE'){
  const rows=await db.workOrder.findMany({where:{sellerOrgId:orgId,...(excluded?{invoiceTargetPolicy:{is:{excluded:true}}}:{OR:[{invoiceTargetPolicy:{is:null}},{invoiceTargetPolicy:{is:{excluded:false}}}]}),AND:q?[{OR:[{orderNumber:{contains:q,mode:'insensitive'}},{buyerOrg:{name:{contains:q,mode:'insensitive'}}},{buyerOrg:{nameKo:{contains:q,mode:'insensitive'}}},{buyerOrg:{nameVi:{contains:q,mode:'insensitive'}}}]}]:[]},select:{id:true,orderNumber:true,invoiceTargetPolicy:true,buyerOrg:{select:{name:true,nameKo:true,nameVi:true}}},orderBy:[{createdAt:'desc'},{id:'desc'}],skip:page*50,take:51});
  return {rows:rows.slice(0,50).map((r:any)=>({id:r.id,title:r.orderNumber,subtitle:r.buyerOrg?.name||'',nameKo:r.buyerOrg?.nameKo,nameVi:r.buyerOrg?.nameVi,revision:r.invoiceTargetPolicy?.revision||0,excluded})),hasMore:rows.length>50};
 }
 const rows=await db.$queryRawUnsafe(`SELECT w.id,w."orderNumber" AS title,COALESCE(c.name,'') AS subtitle,c."nameKo",c."nameVi",COALESCE(p.version,0) AS revision,COALESCE(p.excluded,false) AS excluded FROM "WorkOrder" w LEFT JOIN "Organization" c ON c.id=w."customerId" LEFT JOIN "OrderShippingPolicy" p ON p."workOrderId"=w.id AND p."orgId"=w."orgId" WHERE w."orgId"=$1 AND COALESCE(w."sellerOrgId",w."orgId")=$1 AND COALESCE(p.excluded,false)=$2 AND ($3='' OR position(lower($3) IN lower(w."orderNumber"||' '||COALESCE(c.name,'')||' '||COALESCE(c."nameKo",'')||' '||COALESCE(c."nameVi",'')))>0) ORDER BY w."createdAt" DESC,w.id DESC LIMIT 51 OFFSET $4`,orgId,excluded,q,page*50);
 return {rows:rows.slice(0,50),hasMore:rows.length>50};
}
export async function saveManagementTargets(db:any,orgId:number,actorId:number,kind:string,input:any){
 if(!Array.isArray(input?.rows)||!input.rows.length||input.rows.length>200||new Set(input.rows.map((r:any)=>r?.id)).size!==input.rows.length)fail('TARGET_INVALID');
 if(!payrollKind(kind)&&(typeof input.reason!=='string'||!input.reason.trim()||input.reason.length>1000))fail('TARGET_REASON_REQUIRED');
 return retryEditTransaction(db,async(tx:any)=>{
  await targetActor(tx,orgId,actorId,kind);
  await tx.$queryRawUnsafe('SELECT id FROM "Organization" WHERE id=$1 FOR UPDATE',orgId);
  for(const row of [...input.rows].sort((a:any,b:any)=>a.id-b.id)){
   if(!Number.isSafeInteger(row?.id)||row.id<=0||typeof row.excluded!=='boolean'||!Number.isSafeInteger(row.revision)||row.revision<0||!/^[-\w]{8,100}$/.test(row.clientKey||''))fail('TARGET_INVALID');
   if(payrollKind(kind)){
    const source=await tx.payrollSnapshot.findFirst({where:{id:row.id,orgId}});if(!source)fail('TARGET_NOT_FOUND',404);
    if(!Number.isSafeInteger(row.snapshotRevision))fail('TARGET_INVALID');
    const receipt=await tx.payrollManagementEvent.findUnique({where:{orgId_clientKey:{orgId,clientKey:row.clientKey}}});
    if(receipt){
     if(receipt.actorId!==actorId||receipt.snapshotId!==source.id||receipt.revision!==row.revision+1||receipt.snapshotRevision!==row.snapshotRevision||(kind==='PAYABLE'?receipt.excluded:receipt.evidenceExcluded??receipt.excluded)!==row.excluded)fail('TARGET_CHANGED',409);
     continue;
    }
    const payableExcluded=kind==='PAYABLE'?row.excluded:source.payableManagementExcluded;
    const evidenceExcluded=kind==='EVIDENCE'?row.excluded:(source.evidenceManagementExcluded??source.payableManagementExcluded);
    await setPayrollManagementInTransaction(tx,orgId,actorId,source.month,source.factoryId,{payableExcluded,evidenceExcluded,revision:row.revision,snapshotRevision:row.snapshotRevision,clientKey:row.clientKey});
   }else if(kind==='SHIPPING'){
    await saveShippingPolicyInTransaction(tx,orgId,actorId,row.id,{excluded:row.excluded,version:row.revision,clientKey:row.clientKey,reason:input.reason.trim()});
   }else{
    const locked=await tx.$queryRawUnsafe('SELECT id FROM "WorkOrder" WHERE id=$1 AND "sellerOrgId"=$2 FOR UPDATE',row.id,orgId);if(!locked.length)fail('TARGET_NOT_FOUND',404);
    const old=await tx.orderInvoicePolicyEvent.findUnique({where:{orgId_clientKey:{orgId,clientKey:row.clientKey}}});
    if(old){if(old.actorId!==actorId||old.workOrderId!==row.id||old.excluded!==row.excluded||old.revision!==row.revision+1||old.reason!==input.reason.trim())fail('TARGET_CHANGED',409);continue;}
    const before=await tx.orderInvoicePolicy.findUnique({where:{workOrderId:row.id}});if((before?.revision||0)!==row.revision)fail('TARGET_CHANGED',409);
    if((before?.excluded||false)===row.excluded)continue;
    await tx.orderInvoicePolicy.upsert({where:{workOrderId:row.id},create:{workOrderId:row.id,orgId,excluded:row.excluded,updatedByEmployeeId:actorId},update:{excluded:row.excluded,revision:{increment:1},updatedByEmployeeId:actorId}});
    await tx.orderInvoicePolicyEvent.create({data:{orgId,workOrderId:row.id,revision:row.revision+1,excluded:row.excluded,actorId,clientKey:row.clientKey,reason:input.reason.trim()}});
   }
  }
  return {ok:true};
 },60000);
}
export function registerManagementTargetRoutes(app:any,db:any,gates:any){
 for(const method of ['get','put'])app[method]('/management-targets/:kind',async(req:any,res:any)=>{
  const access=await gates.requireOrgRole(req,res,{allowedRoles:['ADMIN','OPERATOR','ACCOUNTANT'],allowSystemAdmin:false});if(!access)return;
  res.setHeader('Cache-Control','no-store');const args=[db,access.organization.id,access.employee?.id||gates.actorId(),String(req.params.kind)] as const;
  res.json(method==='get'?await listManagementTargets(...args,req.query):await saveManagementTargets(...args,req.body));
 });
}
