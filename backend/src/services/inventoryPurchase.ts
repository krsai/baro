import {createHttpError} from '../utils/http';

export async function prepareInventoryPurchase(tx:any,orgId:number,masterId:string,variantId:string,quantity:string,body:any){
 const [variant]=await tx.$queryRaw`SELECT "ownerId" FROM "InventoryVariant" WHERE id=${variantId} AND "orgId"=${orgId} AND "masterId"=${masterId}`;
 if(!variant)throw createHttpError(400,'INVALID_INVENTORY_MOVEMENT');
 const required=variant.ownerId===orgId&&Number(quantity)>0;
 if(!required){
  if(body.expenseItemId!=null||body.expenseRequestVersion!=null)throw createHttpError(400,'INVALID_INVENTORY_PURCHASE');
  return {required:false,source:null};
 }
 if(typeof body.expenseItemId!=='string'||!body.expenseItemId||body.expenseItemId.length>100||!Number.isSafeInteger(body.expenseRequestVersion))throw createHttpError(400,'INVENTORY_PURCHASE_REQUIRED');
 const cost=await tx.partnerTransactionCost.findFirst({where:{id:body.expenseItemId,orgId},select:{materialItemSnapshot:true}});
 if(cost?.materialItemSnapshot?.variantId&&cost.materialItemSnapshot.variantId!==variantId)throw createHttpError(400,'INVALID_INVENTORY_PURCHASE');
 await tx.$queryRaw`SELECT r.id FROM "ExpenseRequest" r JOIN "PartnerTransactionCost" c ON c."expenseRequestId"=r.id AND c."orgId"=r."orgId" WHERE c.id=${body.expenseItemId} AND c."orgId"=${orgId} FOR SHARE OF r,c`;
 const [row]=await tx.$queryRaw`SELECT baro_inventory_purchase_source(${orgId}::integer,${masterId}::text,${body.expenseItemId}::text,${body.expenseRequestVersion}::integer) AS source`;
 if(!row?.source)throw createHttpError(409,'INVENTORY_PURCHASE_CHANGED');
 return {required:true,source:row.source};
}

export async function validateInventoryPurchase(tx:any,orgId:number,movementId:string){
 const [movement]=await tx.$queryRaw`SELECT m.*,v."masterId" FROM "InventoryMovement" m JOIN "InventoryVariant" v ON v.id=m."variantId" WHERE m.id=${movementId} AND m."orgId"=${orgId}`;
 if(!movement?.purchaseRequired)return;
 const {source}=await prepareInventoryPurchase(tx,orgId,movement.masterId,movement.variantId,String(movement.quantity),{expenseItemId:movement.expenseItemId,expenseRequestVersion:movement.expenseRequestVersion});
 if(JSON.stringify(source)!==JSON.stringify(movement.purchaseSnapshot))throw createHttpError(409,'INVENTORY_PURCHASE_CHANGED');
}
