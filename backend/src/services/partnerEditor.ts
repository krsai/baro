import {savePartnerContacts} from './partnerContacts';
import {saveClassification} from './partnerClassification';
import {retryEditTransaction} from '../utils/editRevision';
import {createHttpError} from '../utils/http';
import {classificationTarget,readClassification,requireClassificationActor} from './partnerClassification';
import {attachLinkedCompanies} from './companyConnections';
import {entityProfile} from './entityProfile';

export async function loadPartnerEditor(db:any,orgId:number,actorId:number,entityId?:number,relationshipId?:number){
 await requireClassificationActor(db,orgId,actorId);
 let target:any,relationship:any=null;
 if(relationshipId!==undefined){
  if(!Number.isSafeInteger(relationshipId)||relationshipId<=0)throw createHttpError(400,'INVALID_PARTNER_ID');
  relationship=await db.orgRelationship.findFirst({where:{id:relationshipId,OR:[{manufacturerOrgId:orgId},{brandOrgId:orgId}]},include:{brand:true,manufacturer:true}});
  if(!relationship)throw createHttpError(404,'PARTNER_NOT_FOUND');
  target={kind:'CUSTOMER',relationshipId,entity:relationship.manufacturerOrgId===orgId?relationship.brand:relationship.manufacturer};
 }else{
  if(!Number.isSafeInteger(entityId)||entityId! <= 0||entityId===orgId)throw createHttpError(400,'INVALID_PARTNER_ID');
  target=await classificationTarget(db,orgId,entityId!);
  if(target.kind==='CUSTOMER')relationship=await db.orgRelationship.findFirst({where:{id:target.relationshipId,OR:[{manufacturerOrgId:orgId},{brandOrgId:orgId}]}});
 }
 const entity=target.entity,classification=await readClassification(db,orgId,entity.id);
 const canEditProfile=entity.ownerOrgId===orgId||entity.dataOwnerOrgId===orgId||entity.ownerOrgId==null&&entity.dataOwnerOrgId==null&&!await db.employee.findFirst({where:{orgId:entity.id},select:{id:true}});
 const [profile]=await attachLinkedCompanies(db,orgId,[{...entityProfile(entity),contactConnectedAt:relationship?.createdAt||entity.createdAt,id:entity.id,type:entity.type,isActive:entity.isActive,sourceKind:target.kind,relationshipId:target.relationshipId??null,classification,localClassification:classification,contactName:entity.representative??relationship?.managerName??null,contactPhone:entity.phone??relationship?.managerPhone??null,email:entity.email??relationship?.managerEmail??null,...(relationship?{defaultSizeSetCode:relationship.defaultSizeSetCode}:{}),canEditProfile}]);
 return {...profile,canEditProfile:profile.contactSourceProtected&&profile.defaultSourceEntityId===entity.id&&entity.ownerOrgId==null?false:canEditProfile};
}
export function registerPartnerEditorRoutes(app:any,db:any,gates:any){
 const read=(relationship:boolean)=>async(req:any,res:any)=>{
  const access=await gates.requireOrgRole(req,res,{allowedRoles:['ADMIN','ACCOUNTANT','OPERATOR'],allowSystemAdmin:false});if(!access)return;
  const actorId=gates.actorId();if(!actorId)throw createHttpError(403,'ACTIVE_EMPLOYEE_REQUIRED');
  res.json(await loadPartnerEditor(db,access.organization.id,actorId,relationship?undefined:Number(req.params.id),relationship?Number(req.params.id):undefined));
 };
 app.put('/partner-editor/entity/:id/contacts',async(req:any,res:any)=>{
  const access=await gates.requireOrgRole(req,res,{allowedRoles:['ADMIN','ACCOUNTANT','OPERATOR'],allowSystemAdmin:false});if(!access)return;
  const orgId=access.organization.id,actorId=gates.actorId(),entityId=Number(req.params.id);
  if(!actorId)throw createHttpError(403,'ACTIVE_EMPLOYEE_REQUIRED');
  const value=await retryEditTransaction(db,async(tx:any)=>{
   const relationshipId=req.body?.relationshipId===undefined?undefined:Number(req.body.relationshipId);
   const profile=await loadPartnerEditor(tx,orgId,actorId,relationshipId===undefined?entityId:undefined,relationshipId);
   if(profile.id!==entityId)throw createHttpError(400,'INVALID_PARTNER_ID');
   await savePartnerContacts(tx,orgId,entityId,actorId,req.body?.contacts,profile);
   if(req.body?.classification!==undefined){if(!profile.canEditProfile)throw createHttpError(403,'COMPANY_PROFILE_IS_PRIVATE');await saveClassification(tx,orgId,entityId,actorId,req.body.classification);}
   if(req.body?.defaultSizeSetCode!==undefined){
    if(!profile.canEditProfile||profile.sourceKind!=='CUSTOMER'||!profile.relationshipId)throw createHttpError(403,'COMPANY_PROFILE_IS_PRIVATE');
    await tx.orgRelationship.update({where:{id:profile.relationshipId},data:{defaultSizeSetCode:req.body.defaultSizeSetCode==='URD_NUMERIC'?'URD_NUMERIC':'LEGACY_APPAREL'}});
   }
   return loadPartnerEditor(tx,orgId,actorId,relationshipId===undefined?entityId:undefined,relationshipId);
  });
  res.json(value);
 });
 app.get('/partner-editor/entity/:id',read(false));
 app.get('/partner-editor/relationship/:id',read(true));
}
