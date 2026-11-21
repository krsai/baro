import {randomUUID,createHash} from 'node:crypto';
import {createHttpError} from '../utils/http';
import {validateApprovalRules} from './approvalRules';
import {materialOwnerScope,MATERIAL_OWNER_SELECT} from './materialOwner';
import {systemMaterialOptions} from './materialItems';
import {writeInventoryVariant} from './inventoryVariants';
const fail=(code:string,status=409):never=>{throw createHttpError(status,code);};
const key=(orgId:number)=>`APPROVAL_POLICY:MATERIAL:CREATE:${orgId}`;
const normalize=(v:any)=>String(v||'').normalize('NFKC').trim().toLocaleLowerCase();
export async function materialRegistrationPolicy(db:any,orgId:number){
 return (await db.systemSetting.findUnique({where:{key:key(orgId)}}))?.value||{version:2,revision:0,drafterRoles:['ADMIN','OPERATOR','ACCOUNTANT'],stages:[{role:'ADMIN',gradeMatch:'ANY',gradeId:null}]};
}
export async function saveMaterialRegistrationPolicy(tx:any,orgId:number,actorId:number,input:any){
 const current=await materialRegistrationPolicy(tx,orgId);
 if(input?.revision!==current.revision)fail('APPROVAL_SETTINGS_CHANGED');
 if(!Array.isArray(input.drafterRoles)||!input.drafterRoles.length||input.drafterRoles.some((r:any)=>!['ADMIN','OPERATOR','ACCOUNTANT'].includes(r)))fail('INVALID_APPROVAL_RULE',400);
 if(!Array.isArray(input.stages)||!input.stages.length||input.stages.at(-1)?.role!=='ADMIN')fail('MATERIAL_ADMIN_APPROVAL_REQUIRED',400);
 const rules=await validateApprovalRules(tx,orgId,[{id:'material',name:'Material',drafterRole:'ALL',stages:input.stages}],{key:'MATERIAL',menuPath:'/inventory/materials',hasAmount:false,enabled:true});
 const value={version:2,revision:current.revision+1,drafterRoles:input.drafterRoles,stages:rules[0]!.stages};
 await tx.systemSetting.create({data:{key:key(orgId)+':REV:'+value.revision,value:{before:current,after:value,actorId},updatedByEmployeeId:actorId}});
 await tx.systemSetting.upsert({where:{key:key(orgId)},create:{key:key(orgId),value,updatedByEmployeeId:actorId},update:{value,updatedByEmployeeId:actorId}});
 return value;
}
async function preview(tx:any,scope:any,selection:any={}){
 const policy=await materialRegistrationPolicy(tx,scope.orgId),drafter=await tx.employee.findFirst({where:{id:scope.actorId,orgId:scope.orgId,status:'ACTIVE'}});
 if(!drafter||!policy.drafterRoles.includes(drafter.orgRole))fail('INVENTORY_DRAFTER_NOT_ALLOWED',403);
 const used:number[]=[],stages=[];
 for(const [index,stage] of policy.stages.entries()){
  const candidates:any[]=await tx.$queryRaw`SELECT e.id,e.name,e."orgRole",e."gradeId" FROM "Employee" e WHERE e."orgId"=${scope.orgId} AND baro_inventory_stage_eligible(${scope.orgId}::integer,e.id,${JSON.stringify(stage)}::jsonb) ORDER BY e.name,e.id`;
  const people=candidates.filter(p=>!used.includes(p.id));
  const name='step'+(index+1),id=selection[name+'EmployeeId']??(people.length===1?people[0].id:null),person=people.find(p=>p.id===id);
  if(person)used.push(person.id);
  stages.push({...stage,key:name,candidates:people,employeeId:person?.id||null,name:person?.name});
 }
 if(!stages.length||stages.at(-1)?.role!=='ADMIN')fail('MATERIAL_ADMIN_APPROVAL_REQUIRED');
 return {policy,drafter,stages,complete:stages.every(s=>s.employeeId)};
}
async function candidate(tx:any,scope:any,input:any){
 const baseId=Number(input.baseId),ownerId=Number(input.ownerId),typeText=String(input.typeText||'').normalize('NFKC').trim();
 if(!Number.isSafeInteger(baseId)||!Number.isSafeInteger(ownerId)||typeText.length>100||input.colorId!=null&&(!Number.isSafeInteger(input.colorId)||input.colorId<=0))fail('VARIANT_INVALID',400);
 const [master]=await systemMaterialOptions(tx,scope.orgId,baseId);if(!master)fail('INVALID_MATERIAL_CODE',400);
 const base=await tx.transactionCodeBase.findUnique({where:{id:baseId}}),settings=base.materialSettings||{},fields=settings.masterInputs||{type:base.attributeInputs?.type||'HIDDEN',color:settings.colorInput||'HIDDEN'};
 const owner=await tx.organization.findFirst({where:{AND:[materialOwnerScope(scope.orgId),{id:ownerId}]},select:MATERIAL_OWNER_SELECT});
 const color=input.colorId==null?null:await tx.attrColor.findUnique({where:{id:input.colorId}});
 if(!owner||input.colorId!=null&&!color||fields.type==='REQUIRED'&&!typeText||fields.color==='REQUIRED'&&!color||fields.type==='HIDDEN'&&typeText||fields.color==='HIDDEN'&&color)fail('VARIANT_INVALID',400);
 return {baseId,masterId:master.id,ownerId,typeText,colorId:color?.id??null,snapshot:{base:master.data,owner,color,unit:master.data?.unit,typeText}};
}
export async function approveMaterialCandidate(tx:any,scope:any,payload:any,id:string,typeText?:string){
 const data=await candidate(tx,scope,{...payload,...(typeText===undefined?{}:{typeText})});
 let typeId=null;
 if(data.typeText){
  const nameKey=normalize(data.typeText);
  let type=await tx.codeItemType.findUnique({where:{orgId_baseId_nameKey:{orgId:scope.orgId,baseId:data.baseId,nameKey}}});
  if(!type)type=await tx.codeItemType.create({data:{orgId:scope.orgId,baseId:data.baseId,nameKey,nameEn:data.typeText,nameKo:data.typeText,nameVi:data.typeText,createdByEmployeeId:scope.actorId}});
  typeId=type.id;
 }
 const duplicate=await tx.$queryRaw`SELECT id FROM "InventoryVariant" WHERE "orgId"=${scope.orgId} AND "baseId"=${data.baseId} AND "ownerId"=${data.ownerId} AND "typeId" IS NOT DISTINCT FROM ${typeId}::integer AND "colorId" IS NOT DISTINCT FROM ${data.colorId}::integer AND coalesce(attributes->'dimensions','{}'::jsonb)='{}'::jsonb LIMIT 1`;
 if(duplicate.length)fail('VARIANT_DUPLICATE');
 return writeInventoryVariant(tx,scope,{...data,clientKey:id,typeId},'post',id);
}
export function registerMaterialRegistrationRoutes(app:any,db:any,access:any){
 app.get('/material-items/registration-preview',async(req:any,res:any)=>{
  const scope=await access(req,res,'INVENTORY_MATERIALS');if(!scope)return;
  let selection={};try{selection=JSON.parse(String(req.query.selection||'{}'));}catch{fail('INVALID_EXPENSE_APPROVERS',400);}
  res.json(await preview(db,scope,selection));
 });
 app.post('/material-items/variants',async(req:any,res:any)=>{
  const scope=await access(req,res,'INVENTORY_MATERIALS');if(!scope)return;
  const body=req.body||{},id=body.clientKey;if(typeof id!=='string'||!/^[\w-]{8,100}$/.test(id))fail('VARIANT_INVALID',400);
  const hash=createHash('sha256').update(JSON.stringify(body)).digest('hex');
  const result=await db.$transaction(async(tx:any)=>{
   await tx.$queryRaw`SELECT id FROM "Organization" WHERE id=${scope.orgId} FOR UPDATE`;
   const [old]=await tx.$queryRaw`SELECT * FROM "MaterialRegistrationRequest" WHERE id=${id} AND "orgId"=${scope.orgId}`;
   if(old){if(old.requestHash!==hash||old.drafterId!==scope.actorId)fail('VARIANT_CHANGED');return {id,pending:old.status==='PENDING',status:old.status,variantId:old.resultVariantId};}
   const resolved=await preview(tx,scope,body.approvalSelection);
   if(body.approvalRevision!==resolved.policy.revision)fail('APPROVAL_SETTINGS_CHANGED');
   if(!resolved.complete)fail('EXPENSE_APPROVER_REQUIRED',400);
   const data=await candidate(tx,scope,body);
   await tx.$executeRaw`INSERT INTO "MaterialRegistrationRequest" (id,"orgId","baseId","drafterId","requestHash",payload,policy) VALUES (${id},${scope.orgId},${data.baseId},${scope.actorId},${hash},${JSON.stringify(data)}::jsonb,${JSON.stringify(resolved.policy)}::jsonb)`;
   for(const [position,stage] of resolved.stages.entries())await tx.$executeRaw`INSERT INTO "MaterialRegistrationStep" ("requestId","orgId",position,"employeeId",stage) VALUES (${id},${scope.orgId},${position},${stage.employeeId},${JSON.stringify(stage)}::jsonb)`;
   return {id,pending:true,status:'PENDING'};
  },{isolationLevel:'Serializable'});res.json(result);
 });
 app.get('/material-items/registration-requests',async(req:any,res:any)=>{
  const scope=await access(req,res,'INVENTORY_MATERIALS');if(!scope)return;
  res.json(await db.$queryRaw`SELECT r.*,e.name AS "drafterName",(SELECT jsonb_agg(to_jsonb(s) ORDER BY s.position) FROM "MaterialRegistrationStep" s WHERE s."requestId"=r.id) AS steps,
   ((SELECT s."employeeId" FROM "MaterialRegistrationStep" s WHERE s."requestId"=r.id AND s.decision IS NULL ORDER BY s.position LIMIT 1)=${scope.actorId} AND r.status='PENDING') AS "canDecide"
   FROM "MaterialRegistrationRequest" r JOIN "Employee" e ON e.id=r."drafterId" AND e."orgId"=r."orgId" WHERE r."orgId"=${scope.orgId} ORDER BY r."createdAt" DESC,r.id`);
 });
 app.post('/material-items/registration-requests/:id/decision',async(req:any,res:any)=>{
  const scope=await access(req,res,'INVENTORY_MATERIALS');if(!scope)return;
  const body=req.body||{};if(!['APPROVE','REJECT','EXISTING'].includes(body.action)||!Number.isSafeInteger(body.revision))fail('VARIANT_INVALID',400);
  const result=await db.$transaction(async(tx:any)=>{
   await tx.$queryRaw`SELECT id FROM "Organization" WHERE id=${scope.orgId} FOR UPDATE`;
   const [r]=await tx.$queryRaw`SELECT * FROM "MaterialRegistrationRequest" WHERE id=${String(req.params.id)} AND "orgId"=${scope.orgId} FOR UPDATE`;
   if(!r)fail('VARIANT_CHANGED');
   if(r.status!=='PENDING'||r.revision!==body.revision){
    const [prior]=await tx.$queryRaw`SELECT decision FROM "MaterialRegistrationStep" WHERE "requestId"=${r.id} AND position=${body.revision-1} AND "employeeId"=${scope.actorId}`;
    if(prior?.decision?.action===body.action&&prior.decision.reason===String(body.reason||'').trim()&&prior.decision.typeText===(body.typeText??null)&&(body.action!=='EXISTING'||prior.decision.variantId===body.variantId))return {id:r.id,status:r.status,variantId:r.resultVariantId};
    fail('VARIANT_CHANGED');
   }
   const [step]=await tx.$queryRaw`SELECT * FROM "MaterialRegistrationStep" WHERE "requestId"=${r.id} AND decision IS NULL ORDER BY position LIMIT 1`;
   const [eligible]=step?await tx.$queryRaw`SELECT baro_inventory_stage_eligible(${scope.orgId}::integer,${scope.actorId}::integer,${JSON.stringify(step.stage)}::jsonb) AS ok`:[];
   if(!step||step.employeeId!==scope.actorId||!eligible?.ok)fail('ACTIVE_EMPLOYEE_REQUIRED',403);
   const [next]=await tx.$queryRaw`SELECT position FROM "MaterialRegistrationStep" WHERE "requestId"=${r.id} AND position>${step.position} LIMIT 1`;
   if(next&&body.action==='EXISTING')fail('MATERIAL_ADMIN_APPROVAL_REQUIRED');
   if(body.action==='REJECT'&&!String(body.reason||'').trim())fail('CHANGE_REASON_REQUIRED',400);
   let resultId:string|null=null;
   if(body.action!=='REJECT'&&!next){
    if(!await tx.employee.findFirst({where:{id:scope.actorId,orgId:scope.orgId,status:'ACTIVE',orgRole:'ADMIN'}}))fail('MATERIAL_ADMIN_APPROVAL_REQUIRED',403);
    if(body.action==='EXISTING'){
     await candidate(tx,scope,r.payload);
     const [variant]=await tx.$queryRaw`SELECT id,revision FROM "InventoryVariant" WHERE id=${String(body.variantId||'')} AND "orgId"=${scope.orgId} AND "baseId"=${r.baseId} AND managed`;
     if(!variant||variant.revision!==body.variantRevision)fail('VARIANT_CHANGED');resultId=variant.id;
    }else resultId=String((await approveMaterialCandidate(tx,scope,r.payload,r.id,body.typeText)).id);
   }
   const [confirmed]=resultId?await tx.$queryRaw`SELECT attributes FROM "InventoryVariant" WHERE id=${resultId} AND "orgId"=${scope.orgId}`:[];
   const decision={action:body.action,reason:String(body.reason||'').trim(),typeText:body.typeText??null,variantId:resultId,variantSnapshot:confirmed?.attributes??null};
   await tx.$executeRaw`UPDATE "MaterialRegistrationStep" SET decision=${JSON.stringify(decision)}::jsonb,"decidedAt"=now() WHERE "requestId"=${r.id} AND position=${step.position}`;
   const status=body.action==='REJECT'?'REJECTED':next?'PENDING':'APPROVED';
   await tx.$executeRaw`UPDATE "MaterialRegistrationRequest" SET status=${status},"resultVariantId"=${resultId},revision=revision+1 WHERE id=${r.id}`;
   return {id:r.id,status,variantId:resultId};
  },{isolationLevel:'Serializable'});res.json(result);
 });
}
