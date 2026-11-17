import {createHttpError} from '../utils/http';
import {Prisma} from '@prisma/client';
import {expensePartnerScope} from './expensePayee';
export const MATERIAL_OWNER_SELECT={id:true,code:true,name:true,nameKo:true,nameVi:true};
export const materialOwnerScope=(orgId:number)=>({OR:[{id:orgId},expensePartnerScope(orgId)]});
export async function prepareMaterialOwner(tx:any,orgId:number,body:any,code:any,previous?:any){
 const ownerId=body.itemOwnerOrgId===undefined?previous?.itemOwnerOrgId??null:body.itemOwnerOrgId||null;
 if(ownerId!==null&&(!Number.isSafeInteger(ownerId)||ownerId<=0))throw createHttpError(400,'INVALID_ITEM_OWNER');
 if(previous?.transactionCodeId===code.id&&(previous.itemOwnerOrgId??null)===ownerId)return {itemOwnerOrgId:ownerId,itemOwnerSnapshot:previous.itemOwnerSnapshot??undefined};
 const mode=code.base?.attributeInputs?.owner??'HIDDEN';
 if(mode==='REQUIRED'&&!ownerId)throw createHttpError(400,'REQUIRED_ITEM_OWNER');
 if(mode==='HIDDEN'&&ownerId&&previous?.itemOwnerOrgId!==ownerId)throw createHttpError(400,'UNEXPECTED_ITEM_OWNER');
 if(!ownerId)return {itemOwnerOrgId:null,...(previous?.itemOwnerSnapshot?{itemOwnerSnapshot:Prisma.DbNull}:{})};
 const owner=await tx.organization.findFirst({where:{AND:[{id:ownerId},materialOwnerScope(orgId)]},select:MATERIAL_OWNER_SELECT});
 if(!owner)throw createHttpError(400,'INVALID_ITEM_OWNER');
 return {itemOwnerOrgId:ownerId,itemOwnerSnapshot:owner};
}
