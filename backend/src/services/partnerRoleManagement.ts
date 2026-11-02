import {createHttpError} from '../utils/http';
import {normalizeLocalizedName,validLocalizedName} from '../utils/localizedName';
import {randomUUID} from 'node:crypto';

export function registerPartnerRoleManagement(app:any,db:any,gates:any){
 const path='/system-setting-defaults/partner-roles';
 const mutate=async(req:any,remove=false)=>db.$transaction(async(tx:any)=>{
  await tx.$queryRawUnsafe('LOCK TABLE "PartnerRole" IN SHARE ROW EXCLUSIVE MODE');
  const id=req.params.id===undefined?null:Number(req.params.id);
  if(id!==null&&(!Number.isSafeInteger(id)||id<=0))throw createHttpError(400,'INVALID_SETTING_REFERENCE');
  const previous=id===null?null:await tx.partnerRole.findUnique({where:{id}});
  if(id!==null&&!previous)throw createHttpError(404,'SETTING_NOT_FOUND');
  if(remove){
   if(await tx.settingServiceDefault.count({where:{partnerRoleId:id}}))throw createHttpError(409,'SETTING_IN_USE');
   await tx.partnerRole.delete({where:{id}});return {ok:true};
  }
  const body=req.body;
  if(!validLocalizedName(body,100))throw createHttpError(400,'INVALID_PARTNER_ROLE');
  const {nameEn,nameKo,nameVi}=normalizeLocalizedName(body);
  const data={nameEn,nameKo,nameVi};
  if(previous)return tx.partnerRole.update({where:{id},data});
  const last=await tx.partnerRole.aggregate({_max:{sortOrder:true}});
  // Legacy codes are still consumed by relationship lookups. They are internal
  // compatibility keys, never user input or derived from a category's name.
  return tx.partnerRole.create({data:{...data,code:'ROLE_'+randomUUID(),sortOrder:(last._max.sortOrder??-1)+1}});
 },{isolationLevel:'Serializable'});
 for(const method of ['post','put','delete'])app[method](path+(method==='post'?'':'/:id'),async(req:any,res:any)=>{
  if(!await gates.requireSystemAdmin(req,res))return;
  try{const result=await mutate(req,method==='delete');res.status(method==='post'?201:200).json(result);}
  catch(error:any){if(error.code==='P2003')throw createHttpError(409,'SETTING_IN_USE');throw error;}
 });
}
