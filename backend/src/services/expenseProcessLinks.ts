import {createHttpError} from '../utils/http';
export function normalizeExpenseProcessIds(value: unknown): number[] {
  if(value===undefined)return [];
  if(!Array.isArray(value)||value.length>100||value.some(id=>!Number.isSafeInteger(id)||id<=0)||new Set(value).size!==value.length)throw createHttpError(400,'INVALID_REQUEST_PROCESSES');
  return [...value].sort((a,b)=>a-b);
}
export const storedExpenseProcessIds=(cost:any)=>normalizeExpenseProcessIds((cost?.processLinks||[]).map((link:any)=>link.styleProcessId));
export async function validateExpenseProcessLinks(tx:any,orgId:number,body:any,code:any,edit:any,ids:number[]){
  if(code.linkTarget==='STYLE'&&body.styleProcessId)throw createHttpError(400,'INVALID_REQUEST_PROCESSES');
  if(!ids.length)return;
  if(code.base.entryMode==='PROCESS'||edit?.record)throw createHttpError(400,'PRODUCTION_PROCESS_REFERENCE_SINGLE');
  if(!['STYLE','PROCESS'].includes(code.linkTarget)||!body.workOrderId||!body.styleId)throw createHttpError(400,'INVALID_REQUEST_PROCESSES');
  if(code.linkTarget==='PROCESS'&&!ids.includes(body.styleProcessId))throw createHttpError(400,'INVALID_REQUEST_PROCESSES');
  const preserved=edit?.cost?.styleId===body.styleId&&edit.cost.workOrderId===body.workOrderId?storedExpenseProcessIds(edit.cost):[];
  const processes=await tx.styleProcess.findMany({where:{id:{in:ids},styleId:body.styleId,orgId,OR:[{isActive:true},{id:{in:preserved}}]},select:{id:true}});
  if(processes.length!==ids.length)throw createHttpError(400,'INVALID_REQUEST_PROCESSES');
}
