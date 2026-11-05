import {createHttpError} from '../utils/http';
const key=(orgId:number,styleId:number)=>`STYLE_PACKAGING:${orgId}:${styleId}`;
export function validatePackedCbm(value:any){
 if(value===undefined)return undefined;
 if(value===null||value==='')return null;
 if(!['number','string'].includes(typeof value)||!Number.isFinite(Number(value))||Number(value)<=0||Number(value)>100)throw createHttpError(400,'INVALID_PACKED_CBM');
 return Number(value);
}
export async function readStylePackaging(db:any,orgId:number,styleId:number){
 const row=await db.systemSetting.findUnique({where:{key:key(orgId,styleId)}});
 if(row?.value?.packedCbmPerPiece)return {packedCbmPerPiece:row.value.packedCbmPerPiece,packagingVolumeSource:'STYLE'};
 const style=await db.style.findFirst({where:{id:styleId,orgId},select:{categoryId:true}});
 const categoryId=style?.categoryId??null;
 const defaults=categoryId?await db.systemSetting.findUnique({where:{key:`CATEGORY_PACKAGING:${orgId}`}}):null;
 const packedCbmPerPiece=defaults?.value?.values?.[String(categoryId)]??null;
 return {packedCbmPerPiece,packagingCategoryId:categoryId,packagingVolumeSource:packedCbmPerPiece?'CATEGORY':null};
}
export async function saveStylePackaging(db:any,orgId:number,styleId:number,input:any){
 const packedCbmPerPiece=validatePackedCbm(input);if(packedCbmPerPiece===undefined)return;
 if(!await db.style.findFirst({where:{id:styleId,orgId},select:{id:true}}))throw createHttpError(404,'style not found');
 const value={packedCbmPerPiece};await db.systemSetting.upsert({where:{key:key(orgId,styleId)},create:{key:key(orgId,styleId),value},update:{value}});
}
