import {randomUUID} from 'node:crypto';
import {Prisma} from '@prisma/client';
import {createHttpError} from '../utils/http';
import {prepareMaterialSelection} from './materialItems';
const fail=(code='PAID_EXPENSE_CORRECTION_ONLY'):never=>{throw createHttpError(409,code);};
const scalar=(value:any)=>value==null||value===''?null:value;
const same=(a:any,b:any)=>JSON.stringify(a)===JSON.stringify(b);
export async function assertPaidExpenseCorrection(source:any,body:any,db:any){
 const doc=source.document;if(!doc||!Array.isArray(body?.items)||body.items.length!==source.costs.length)fail();
 for(const key of ['partnerOrgId','payeeEmployeeId'])if(scalar(body[key])!==scalar(doc[key]))fail();
 for(const key of ['remark','requestDate','scheduledPaymentDate'])if(body[key]!==undefined&&scalar(body[key])!==scalar(doc[key]))fail();
 const seen=new Set();
 for(const [index,item] of body.items.entries()){
  if(!item||typeof item!=='object'||Array.isArray(item))fail();
  const cost=source.costs.find((c:any)=>c.id===item.itemId);if(!cost||seen.has(cost.id)||source.costs[index]?.id!==cost.id)fail();seen.add(cost.id);
  for(const key of ['quantity','unitPrice','vatRate']){try{if(!new Prisma.Decimal(String(item[key]??cost[key])).eq(cost[key]))fail();}catch{fail();}}
  if(item.currency!==cost.currency)fail();
  const materialChanged=['materialItemId','itemCustomerId','itemTypeId','itemOwnerOrgId','unitId'].some(key=>item[key]!==undefined&&scalar(item[key])!==scalar(cost[key]))||item.materialVariantId!==undefined&&scalar(item.materialVariantId)!==scalar(cost.materialItemSnapshot?.variantId);
  const codeChanged=item.transactionCodeId!==cost.transactionCodeId;
  const code=materialChanged||codeChanged?await db.transactionCode.findFirst({where:{id:item.transactionCodeId,ownerOrgId:doc.orgId,isActive:true,base:{isActive:true}},include:{base:true}}):null;
  const selectMaterial=materialChanged||codeChanged&&code?.base?.materialSettings?.enabled;
  if(selectMaterial){
   if(!code?.base?.materialSettings?.enabled||!item.materialVariantId)fail('MATERIAL_ITEM_REQUIRED');
   const selection=await prepareMaterialSelection(db,doc.orgId,code,{...item,materialVariantRequired:true},cost);
   const data=selection.materialItemSnapshot;
   if(!data?.variantId)fail('MATERIAL_ITEM_REQUIRED');
   if(cost.unitId!=null&&data.unitId!==cost.unitId)fail('PAID_MATERIAL_UNIT_MISMATCH');
   for(const key of ['itemCustomerId','itemTypeId','itemOwnerOrgId','unitId'])if(scalar(item[key])!==scalar(data[key]))fail();
   for(const key of ['length','width','height'])if(scalar(item.details?.[key])!==scalar(data.details?.[key]))fail();
   if((await db.$queryRaw`SELECT id FROM "InventoryMovement" WHERE "orgId"=${doc.orgId} AND "expenseItemId"=${cost.id} AND "variantId"<>${data.variantId} LIMIT 1`).length)fail('VARIANT_IN_USE');
  }else if(scalar(item.unitId)!==scalar(cost.unitId))fail();
  for(const key of ['workOrderId','styleId','styleProcessId'])if(scalar(item[key])!==scalar(cost[key]))fail();
  if(cost.outsourcedWorkRecordId||cost.referenceLinks?.length||cost.processLinks?.length)fail('PAID_EXPENSE_CORRECTION_COMPLEX');
  if(item.linkedOrderIds?.length||item.linkedStyles?.length||item.styleProcessIds?.length||scalar(item.assignmentPlanId)||scalar(item.sourceRecordId))fail();
  const details=(value:any)=>Object.fromEntries(Object.entries(value||{}).filter(([key])=>!['reference','evidenceFile',...(selectMaterial?['length','width','height']:[])].includes(key)).sort(([a],[b])=>a.localeCompare(b)));
  if(!same(details(item.details),details(cost.details)))fail();
  const schedule=(value:any[])=>{try{return value.map((r,index)=>({id:r.id,position:r.position??index+1,label:r.label,scheduledDate:r.scheduledDate,currency:r.currency,amount:new Prisma.Decimal(r.amount).toString()}));}catch{return fail();}};
  const old=(doc.paymentSchedule||[]).filter((r:any)=>r.expenseItemId===cost.id);
  if(item.paymentSchedule!==undefined&&(!Array.isArray(item.paymentSchedule)||!same(schedule(item.paymentSchedule),schedule(old))))fail();
 }
 return true;
}
export async function paidExpenseEntries(tx:any,orgId:number,source:any){
 const allocations=await tx.bankLedgerEvidenceAllocation.findMany({where:{orgId,expenseItemId:{in:source.costs.map((c:any)=>c.id)},entry:{voidedAt:null}}});
 const entries=allocations.length?await tx.bankLedgerEntry.findMany({where:{orgId,id:{in:[...new Set(allocations.map((a:any)=>a.entryId))]}},include:{allocations:true,settlementLines:true,bankFeeLinks:true}}):[];
 for(const entry of entries){
  if(entry.evidenceType!=='EXPENSE'||entry.direction!=='OUT'||entry.internalTransferSourceId||entry.bankFeeLinks.length||entry.settlementLines.length||!new Prisma.Decimal(entry.bankFee).isZero()||!new Prisma.Decimal(entry.writeOffAmount).isZero())fail('PAID_EXPENSE_CORRECTION_COMPLEX');
  if(await tx.changeApprovalRequest.findFirst({where:{orgId,menu:'BANK_LEDGER',status:'PENDING',ledgerEntryId:entry.id}}))fail('CHANGE_UPDATE_PENDING');
 }
 return entries;
}
// Final approval owns the transaction. Archive + cost version + replacement
// payments + immutable FK receipts either all commit or all roll back.
export async function correctPaidExpense(tx:any,orgId:number,actor:any,change:any,source:any,save:()=>Promise<any>){
 await assertPaidExpenseCorrection(source,change.payload,tx);
 const requester=await tx.employee.findFirst({where:{id:change.requestedByEmployeeId,orgId,status:'ACTIVE'},select:{id:true,email:true}});if(!requester)fail('ACTIVE_EMPLOYEE_REQUIRED');
 const entries=await paidExpenseEntries(tx,orgId,source),plans=entries.map((entry:any)=>({entry,replacementId:randomUUID()}));
 for(const plan of plans){
  await tx.$executeRawUnsafe('INSERT INTO "PaidExpenseCorrection" ("changeRequestId","orgId","originalEntryId","replacementEntryId") VALUES($1,$2,$3,$4)',change.id,orgId,plan.entry.id,plan.replacementId);
  await tx.bankLedgerEntry.update({where:{id:plan.entry.id},data:{voidedAt:new Date(),voidedBy:actor.email||String(actor.id),voidReason:'Approved expense code/evidence correction '+change.id}});
 }
 const result=await save();
 for(const {entry,replacementId} of plans){
  const costs=await tx.partnerTransactionCost.findMany({where:{orgId,id:{in:entry.allocations.map((a:any)=>a.expenseItemId)}},select:{id:true,transactionCodeId:true,expenseRequest:{select:{version:true}}}});
  // Follow the allocated item FKs even when the old payment code is missing or
  // inconsistent. Never arbitrarily pick the first of several new codes.
  const representatives=source.costs.filter((c:any)=>c.transactionCodeId===entry.accountingCodeId&&entry.allocations.some((a:any)=>a.expenseItemId===c.id));
  const mapped=representatives.length?costs.filter((c:any)=>representatives.some((old:any)=>old.id===c.id)):costs;
  const codes=[...new Set(mapped.map((c:any)=>c.transactionCodeId))];
  const codeId=codes.length===1?codes[0]:!representatives.length&&costs.some((c:any)=>c.transactionCodeId===entry.accountingCodeId)?entry.accountingCodeId:fail('PAID_EXPENSE_CORRECTION_COMPLEX');
  const {id,createdAt,voidedAt,voidedBy,voidReason,allocations,settlementLines,bankFeeLinks,...data}=entry;
  await tx.bankLedgerEntry.create({data:{...data,id:replacementId,clientKey:randomUUID(),revisesEntryId:id,accountingCodeId:codeId,createdBy:requester.email||String(requester.id)}});
  for(const allocation of allocations){const {id:allocationId,...copy}=allocation;await tx.bankLedgerEvidenceAllocation.create({data:{...copy,entryId:replacementId,requestVersion:costs.find((c:any)=>c.id===allocation.expenseItemId)?.expenseRequest?.version}});}
 }
 return {...result,entryIds:plans.map((p:any)=>p.replacementId),entryReplacements:plans.map((p:any)=>({originalEntryId:p.entry.id,replacementEntryId:p.replacementId}))};
}
