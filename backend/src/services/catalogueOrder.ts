import {createHttpError} from '../utils/http';

export async function saveCatalogueOrder(tx:any,kind:'roles',body:any){
 if(kind!=='roles')throw createHttpError(410,'ACCOUNTING_TYPES_RETIRED');
 await tx.$queryRawUnsafe('LOCK TABLE "PartnerRole" IN SHARE ROW EXCLUSIVE MODE');
 const rows=await tx.partnerRole.findMany({orderBy:[{sortOrder:'asc'},{id:'asc'}]});
 const ids=body?.ids;
 if(!Array.isArray(ids)||ids.length!==rows.length||new Set(ids).size!==ids.length||ids.some((id:any)=>!Number.isSafeInteger(id)||!rows.some((row:any)=>row.id===id)))throw createHttpError(400,'INVALID_CATALOGUE_ORDER');
 if(JSON.stringify(body.previousIds)!==JSON.stringify(rows.map((row:any)=>row.id)))throw createHttpError(409,'CATALOGUE_ORDER_CHANGED');
 for(const [sortOrder,id] of ids.entries())await tx.partnerRole.update({where:{id},data:{sortOrder}});
 return {ok:true};
}
