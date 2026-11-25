import {validateVolumeFormula} from '../utils/validateVolumeFormula';
import {createHttpError} from '../utils/http';
import {retryEditTransaction} from '../utils/editRevision';
const key=(orgId:number)=>`CATEGORY_PACKAGING:${orgId}`;
export async function readCategoryPackaging(db:any,orgId:number){
 const [row,categories]=await Promise.all([db.systemSetting.findUnique({where:{key:key(orgId)}}),db.attrCategory.findMany({where:{orgId},orderBy:{id:'asc'}})]);
 return {revision:row?.value?.revision??0,values:row?.value?.values??{},formulas:row?.value?.formulas??{},categories};
}
export async function saveCategoryPackaging(db:any,orgId:number,actorId:number,input:any){
 if(!Number.isSafeInteger(input?.revision)||input.revision<0||!input.values||Array.isArray(input.values)||typeof input.values!=='object')throw createHttpError(400,'INVALID_CATEGORY_PACKAGING');
 return retryEditTransaction(db,async(tx:any)=>{
  if(!Number.isSafeInteger(actorId)||!await tx.employee.findFirst({where:{id:actorId,orgId,status:'ACTIVE',orgRole:'ADMIN'}}))throw createHttpError(403,'CATEGORY_PACKAGING_ADMIN_REQUIRED');
  await tx.$queryRawUnsafe('SELECT id FROM "Organization" WHERE id=$1 FOR UPDATE',orgId);
  const previous=await readCategoryPackaging(tx,orgId);
  if(previous.revision!==input.revision)throw createHttpError(409,'CATEGORY_PACKAGING_CHANGED');
  const values:any={};for(const [id,value] of Object.entries(input.values)){
   if(input.formulas?.[id])validateVolumeFormula(value,input.formulas[id],'INVALID_CATEGORY_PACKAGING');
   if(!previous.categories.some((row:any)=>String(row.id)===id)||value!==''&&value!==null&&(!['number','string'].includes(typeof value)||!Number.isFinite(Number(value))||Number(value)<=0||Number(value)>100))throw createHttpError(400,'INVALID_CATEGORY_PACKAGING');
   if(value!==''&&value!==null)values[id]=Number(value);
  }
  if(input.formulas!==undefined&&(!input.formulas||Array.isArray(input.formulas)||typeof input.formulas!=='object'||Object.keys(input.formulas).some(id=>!Object.hasOwn(input.values,id))))throw createHttpError(400,'INVALID_CATEGORY_PACKAGING');
  const formulas:any={};for(const id of Object.keys(values)){
   const raw=input.formulas?.[id]??(previous.values[id]===values[id]?previous.formulas[id]:'');
   const formula=validateVolumeFormula(values[id],raw,'INVALID_CATEGORY_PACKAGING');if(formula)formulas[id]=formula;
  }
  const value={revision:previous.revision+1,values,formulas};
  await tx.systemSetting.upsert({where:{key:key(orgId)},create:{key:key(orgId),value,updatedByEmployeeId:actorId},update:{value,updatedByEmployeeId:actorId}});
  return {...value,categories:previous.categories};
 });
}
export function registerCategoryPackagingRoutes(app:any,db:any,gates:any){
 for(const method of ['get','put'])app[method]('/category-packaging-settings',async(req:any,res:any)=>{
  const access=await gates.requireOrgRole(req,res,{allowedRoles:method==='put'?['ADMIN']:['ADMIN','ACCOUNTANT','OPERATOR'],allowSystemAdmin:false});if(!access)return;
  res.json(method==='put'?await saveCategoryPackaging(db,access.organization.id,gates.actorId(),req.body):await readCategoryPackaging(db,access.organization.id));
 });
}
