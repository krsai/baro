import {createHttpError} from '../utils/http';
import {retryEditTransaction} from '../utils/editRevision';
import {loadManagementPeriod,assertManagedDate} from '../factories/factoryManagementStart';
import {requirePayrollActor} from './payrollPayables';

const state=(snapshot:any)=>({snapshotId:snapshot.id,snapshotRevision:snapshot.revision,payableManagementExcluded:snapshot.payableManagementExcluded,evidenceManagementExcluded:snapshot.evidenceManagementExcluded??snapshot.payableManagementExcluded,managementRevision:snapshot.managementRevision});
export async function setPayrollManagement(db:any,orgId:number,actorId:number,month:string,factoryId:number,input:any){
 return retryEditTransaction(db,tx=>setPayrollManagementInTransaction(tx,orgId,actorId,month,factoryId,input));
}
export async function setPayrollManagementInTransaction(tx:any,orgId:number,actorId:number,month:string,factoryId:number,input:any){
 const payableExcluded=input?.payableExcluded??input?.excluded,evidenceExcluded=input?.evidenceExcluded??input?.excluded;
 const fail=(status:number,code:string):never=>{throw createHttpError(status,code);};
 if(!/^\d{4}-(0[1-9]|1[0-2])$/.test(month)||!Number.isSafeInteger(factoryId)||factoryId<=0||typeof payableExcluded!=='boolean'||typeof evidenceExcluded!=='boolean'||!Number.isSafeInteger(input.revision)||input.revision<0||!Number.isSafeInteger(input.snapshotRevision)||input.snapshotRevision<0||!/^[-\w]{8,100}$/.test(input.clientKey||''))return fail(400,'PAYROLL_MANAGEMENT_INVALID');

  await requirePayrollActor(tx,orgId,actorId);
  await tx.$queryRawUnsafe('SELECT id FROM "Organization" WHERE id=$1 FOR UPDATE',orgId);
  const period=await loadManagementPeriod(tx,orgId,factoryId);assertManagedDate(month,period.startDate,true);
  const found=await tx.$queryRawUnsafe('SELECT id FROM "PayrollSnapshot" WHERE "orgId"=$1 AND "factoryId"=$2 AND month=$3 FOR UPDATE',orgId,factoryId,month);
  if(!found.length)return fail(404,'PAYROLL_MANAGEMENT_NOT_SAVED');
  const snapshot=await tx.payrollSnapshot.findUnique({where:{id:found[0].id}});
  const receipt=await tx.payrollManagementEvent.findUnique({where:{orgId_clientKey:{orgId,clientKey:input.clientKey}}});
  if(receipt){
   if(receipt.actorId!==actorId||receipt.snapshotId!==snapshot.id||receipt.revision!==input.revision+1||receipt.snapshotRevision!==input.snapshotRevision||receipt.excluded!==payableExcluded||(receipt.evidenceExcluded??receipt.excluded)!==evidenceExcluded)return fail(409,'PAYROLL_MANAGEMENT_CHANGED');
   return state(snapshot);
  }
  if(snapshot.revision!==input.snapshotRevision||snapshot.managementRevision!==input.revision)return fail(409,'PAYROLL_MANAGEMENT_CHANGED');
  if(snapshot.payableManagementExcluded===payableExcluded&&(snapshot.evidenceManagementExcluded??snapshot.payableManagementExcluded)===evidenceExcluded)return state(snapshot);
  if((payableExcluded||evidenceExcluded)&&await tx.payrollPayableAllocation.findFirst({where:{orgId,item:{document:{snapshotId:snapshot.id}},entry:{voidedAt:null}},select:{id:true}}))return fail(409,'PAYROLL_MANAGEMENT_PAYMENT_LINKED');
  await tx.$queryRawUnsafe("SELECT set_config('baro.payroll_management_actor',$1,true)",String(actorId));
  const changed=await tx.payrollSnapshot.update({where:{id:snapshot.id,managementRevision:input.revision,revision:input.snapshotRevision},data:{payableManagementExcluded:payableExcluded,evidenceManagementExcluded:evidenceExcluded,managementRevision:{increment:1}}});
  await tx.payrollManagementEvent.create({data:{orgId,snapshotId:snapshot.id,revision:changed.managementRevision,snapshotRevision:snapshot.revision,excluded:payableExcluded,evidenceExcluded,actorId,clientKey:input.clientKey}});
  return state(changed);
}
