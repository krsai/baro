import {createHttpError} from '../utils/http';
import {materialCodeSettings} from './materialCodeSettings';
export function industryMaterialSettings(settings:any,enabled:boolean,inputs:any){
 const current=materialCodeSettings(settings??{enabled:false,stockFields:[]});
 const stockFields=enabled?[...new Set([...current.stockFields.filter(key=>key==='unit'||key==='color'&&current.colorInput!=='HIDDEN'||key==='dimensions'&&inputs.requiredFields?.includes('length')||['customer','type'].includes(key)&&(inputs.attributeInputs?.[key]??'HIDDEN')!=='HIDDEN'),'unit'])]:current.stockFields;
 return materialCodeSettings({...current,enabled,stockFields},inputs);
}
export async function setIndustryMaterialManagement(tx:any,id:number,enabled:boolean,revision:number){
 // Match the catalogue writer lock order; no business or company snapshot rows change.
 await tx.$queryRawUnsafe('LOCK TABLE "TransactionCodeBase", "SettingTransactionCodeDefault", "TransactionCode" IN SHARE ROW EXCLUSIVE MODE');
 await tx.$queryRawUnsafe('SELECT id FROM "SettingServiceDefault" WHERE id=$1 FOR UPDATE',id);
 const industry=await tx.settingServiceDefault.findFirst({where:{id,retirement:null,isActive:true,code:{not:'GENERAL'}}});
 if(!industry)throw createHttpError(404,'SETTING_NOT_FOUND');
 if(industry.materialManagementRevision!==revision)throw createHttpError(409,'ACCOUNTING_INDUSTRY_CHANGED');
 if(industry.materialManagement===enabled)return industry;
 if(!enabled&&tx.materialItem&&await tx.materialItem.count({where:{industryId:id}}))throw createHttpError(409,'MATERIAL_ITEMS_IN_USE');
 const saved=await tx.settingServiceDefault.update({where:{id},data:{materialManagement:enabled,materialManagementRevision:{increment:1}}});
 const bases=await tx.transactionCodeBase.findMany({where:{industryLinks:{some:{systemIndustryId:id}}},include:{industryLinks:{include:{industry:{include:{retirement:true}}}}}});
 for(const base of bases){
  const eligible=base.industryLinks.some((link:any)=>link.industry.isActive&&!link.industry.retirement&&link.industry.materialManagement);
  const materialSettings=industryMaterialSettings(base.materialSettings,eligible,base);
  await tx.transactionCodeBase.update({where:{id:base.id},data:{materialSettings,materialRevision:{increment:1}}});
 }
 return saved;
}
export function registerMaterialIndustryRoutes(app:any,db:any,gates:any){
 app.put('/system-setting-defaults/services/:id/material-management',async(req:any,res:any)=>{
  if(!await gates.requireSystemAdmin(req,res))return;
  const id=Number(req.params.id),{enabled,revision}=req.body??{};
  if(!Number.isSafeInteger(id)||id<=0||typeof enabled!=='boolean'||!Number.isSafeInteger(revision)||revision<0)throw createHttpError(400,'INVALID_INPUT_OPTION');
  res.json(await db.$transaction((tx:any)=>setIndustryMaterialManagement(tx,id,enabled,revision),{isolationLevel:'Serializable'}));
 });
}
