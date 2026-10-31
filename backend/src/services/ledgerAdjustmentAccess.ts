import {createHttpError} from '../utils/http';

export async function requireLedgerAdjustmentAccess(db:any,scope:{orgId:number,role?:string},body:any,entryId?:string){
 if(scope.role==='ADMIN')return;
 const rows=Array.isArray(body?.rows)?body.rows:[body];
 if(rows.some((row:any)=>row?.evidenceType==='ADJUSTMENT'))throw createHttpError(403,'LEDGER_ADJUSTMENT_ADMIN_REQUIRED');
 if(entryId){
  const entry=await db.bankLedgerEntry.findFirst({where:{id:entryId,orgId:scope.orgId},select:{evidenceType:true}});
  if(entry?.evidenceType==='ADJUSTMENT')throw createHttpError(403,'LEDGER_ADJUSTMENT_ADMIN_REQUIRED');
 }
}
