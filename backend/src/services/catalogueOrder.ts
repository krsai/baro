import {createHttpError} from '../utils/http';

const key='CATALOGUE_ORDER:EXPENSE_TYPES';
export async function orderedExpenseTypes(db:any,rows:any[]){
 const setting=await db.systemSetting.findUnique({where:{key}});
 const ids=Array.isArray(setting?.value?.ids)?setting.value.ids:[];
 const rank=new Map(ids.map((id:number,index:number)=>[id,index]));
 return [...rows].sort((a,b)=>Number(rank.get(a.id)??ids.length)-Number(rank.get(b.id)??ids.length)||a.id-b.id);
}
export async function saveCatalogueOrder(tx:any,kind:'roles'|'expenses',body:any){
 const table=kind==='roles'?'PartnerRole':'ExpenseType';
 await tx.$queryRawUnsafe(`LOCK TABLE "${table}" IN SHARE ROW EXCLUSIVE MODE`);
 const model=kind==='roles'?tx.partnerRole:tx.expenseType;
 const rows=await model.findMany(kind==='roles'?{orderBy:[{sortOrder:'asc'},{id:'asc'}]}:{where:{code:{not:'OTHER'}},orderBy:{id:'asc'}});
 const current=kind==='roles'?rows:await orderedExpenseTypes(tx,rows);
 const ids=body?.ids,previous=body?.previousIds;
 if(!Array.isArray(ids)||ids.length!==current.length||new Set(ids).size!==ids.length||ids.some((id:any)=>!Number.isSafeInteger(id)||!current.some((row:any)=>row.id===id)))throw createHttpError(400,'INVALID_CATALOGUE_ORDER');
 if(JSON.stringify(previous)!==JSON.stringify(current.map((row:any)=>row.id)))throw createHttpError(409,'CATALOGUE_ORDER_CHANGED');
 if(kind==='roles'){
  for(const [sortOrder,id] of ids.entries())await model.update({where:{id},data:{sortOrder}});
 }else await tx.systemSetting.upsert({where:{key},create:{key,value:{ids}},update:{value:{ids}}});
 return {ok:true};
}
