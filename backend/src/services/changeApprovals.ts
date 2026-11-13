import {cancelIssuedInvoice} from './invoiceIssueStore';
import {calculateRequestAmounts} from './transactionRequest';
import {approvalDelegate,delegationData,delegatedChangeIds} from './approvalDelegation';
import {normalizeExpensePaymentSchedule,validateExpensePaymentScheduleTotals} from './expensePaymentSchedule';
import {cashScheduleDate} from './cashSchedule';
import {isHighestCompanyApprover} from './expenseDeletion';
import {createHash} from 'node:crypto';
import {Prisma} from '@prisma/client';
import {createHttpError} from '../utils/http';
import {retryEditTransaction} from '../utils/editRevision';
import {approvalActionSettings,approvalActionKey} from './approvalActions';
import {resolveExpenseApproval,defaultApprovalSettings,canDraftExpense} from './expenseApproval';
import {loadExpenseEditorSource,expenseEditorRevision,saveExpenseEditor} from './expenseRequestEditor';
import {replaceLedgerEntryApproved,ledgerEntryRevision,voidLedgerPairApproved} from './bankLedgerEdit';
import {companyBusinessTimeZone} from './serviceCompany';
import {resolveLedgerCounterparty,entryCounterparty} from './ledgerCounterparty';
import {ledgerRegistrationSource,previewLedgerRegistration} from './ledgerRegistration';
import {postLedgerSettlementBatch,validateLedgerMoney,ledgerScale4} from './bankLedger';
const fail=(code:string,status=409):never=>{throw createHttpError(status,code);};
const json=(v:any)=>JSON.parse(JSON.stringify(v));
const digest=(v:any)=>createHash('sha256').update(JSON.stringify(json(v))).digest('hex');
const person={orgId:true,id:true,name:true,orgRole:true,gradeId:true,status:true,grade:{select:{sortOrder:true,setId:true,isActive:true,set:{select:{isActive:true}}}}};
async function source(db:any,orgId:number,input:any,lock=false):Promise<any>{
 const menu=String(input.menu),operation=String(input.operation),kind=String(input.sourceKind||'request'),id=String(input.sourceId||'');
 approvalActionKey(orgId,menu,operation);if(!/^[-\w]{1,100}$/.test(id))fail('CHANGE_INVALID_SOURCE',400);
 if(menu==='INVOICE'){
  if(operation!=='DELETE'||kind!=='invoice')fail('CHANGE_INVALID_SOURCE',400);
  if(lock){await db.$queryRawUnsafe('SELECT id FROM "Organization" WHERE id=$1 FOR UPDATE',orgId);await db.$queryRawUnsafe('SELECT id FROM "Invoice" WHERE id=$1 AND "sellerOrgId"=$2 FOR UPDATE',id,orgId);}
  const invoice=await db.invoice.findFirst({where:{id,sellerOrgId:orgId},include:{orders:true,generalLines:true,payments:{include:{allocations:true}},credits:true}});
  if(!invoice)fail('INVOICE_NOT_FOUND',404);if(await db.accountingOpeningItem.findFirst({where:{orgId,invoiceId:id,voidedAt:null},select:{id:true}}))fail('OPENING_SOURCE_LOCKED');if(invoice.status!=='ISSUED')fail('CHANGE_SOURCE_CHANGED');
  if(invoice.payments.some((p:any)=>!p.voidedAt)||await db.bankLedgerEvidenceAllocation.findFirst({where:{invoiceId:id,entry:{orgId,voidedAt:null}}}))fail('INVOICE_ACTIVE_PAYMENT');
  if(await db.workOrder.findFirst({where:{sellerOrgId:orgId,invoiceFinalLockInvoiceId:id}}))fail('INVOICE_FINAL_LOCK_UNLOCK_REQUIRED');
  if(await db.invoiceOrder.findFirst({where:{sourceOrderId:{in:invoice.orders.map((r:any)=>r.sourceOrderId)},invoice:{sellerOrgId:orgId,status:'ISSUED',sequenceNumber:{gt:invoice.sequenceNumber}}}}))fail('INVOICE_CANCEL_REVERSE_ORDER_REQUIRED');
  return {menu,operation,kind:'invoice',id,revision:digest(invoice),version:null,snapshot:{invoice:json(invoice)},items:[{currency:invoice.currencyCode,unitPrice:String(invoice.total),quantity:'1',vatRate:'0'}]};
 }
 if(menu==='BANK_LEDGER'&&operation==='CREATE')return ledgerRegistrationSource(db,orgId,{...input,allowIncomplete:!lock});
 if(operation==='CREATE')fail('CHANGE_INVALID_SOURCE',400);
 if(menu==='BANK_LEDGER'){
  if(lock){await db.$queryRawUnsafe('SELECT id FROM "Organization" WHERE id=$1 FOR UPDATE',orgId);await db.$queryRawUnsafe('SELECT id FROM "BankLedgerEntry" WHERE id=$1 AND "orgId"=$2 FOR UPDATE',id,orgId);}
  const entry=await db.bankLedgerEntry.findFirst({where:{id,orgId},include:{bankFeeLinks:{include:{fee:true}},account:{include:{entityAccount:true}},internalTransferMirror:{include:{account:true}},internalTransferSource:{include:{account:true}}}});if(!entry)fail('LEDGER_ENTRY_NOT_FOUND',404);if(entry.voidedAt)fail('LEDGER_ENTRY_CHANGED');
  const feeParent=await db.bankLedgerFeeLink.findFirst({where:{orgId,feeEntryId:id}});if(feeParent)return source(db,orgId,{...input,sourceId:feeParent.parentEntryId},lock);
  if(entry.internalTransferSourceId&&await db.bankLedgerFeeLink.findFirst({where:{orgId,parentEntryId:entry.internalTransferSourceId}}))return source(db,orgId,{...input,sourceId:entry.internalTransferSourceId},lock);
  const {account,internalTransferMirror,internalTransferSource,...row}=entry,peer=internalTransferMirror||internalTransferSource;
  const taxAllocations=await db.bankLedgerEvidenceAllocation.findMany({where:{orgId,entryId:id,expenseItemId:{not:null}},select:{expenseItemId:true,amount:true,subtotal:true,vatRate:true,vatAmount:true}});
  const taxCosts=taxAllocations.length?await db.partnerTransactionCost.findMany({where:{orgId,id:{in:taxAllocations.map((allocation:any)=>allocation.expenseItemId)}},select:{id:true,expenseRequestLine:true,description:true}}):[];
  const allocationSnapshot=taxAllocations.map((allocation:any)=>({...allocation,line:taxCosts.find((cost:any)=>cost.id===allocation.expenseItemId)?.expenseRequestLine,label:taxCosts.find((cost:any)=>cost.id===allocation.expenseItemId)?.description}));
  const proposed=operation==='UPDATE'&&input.payload?.rows?.some((r:any)=>r.evidenceType!=='ADJUSTMENT')?await ledgerRegistrationSource(db,orgId,{payload:input.payload,sourceId:input.payload.clientKey,allowIncomplete:!lock}):null;
  const items=[{currency:account.currencyCode,unitPrice:String(entry.amount),quantity:'1',vatRate:'0'},...entry.bankFeeLinks.map((link:any)=>({currency:account.currencyCode,unitPrice:String(link.fee.amount),quantity:'1',vatRate:'0'})),...(peer&&peer.account.currencyCode!==account.currencyCode?[{currency:peer.account.currencyCode,unitPrice:String(peer.amount),quantity:'1',vatRate:'0'}]:[])];
  return {menu,operation,kind:'ledger',id,transferPeerId:peer?.id,proposedItems:proposed?.items,revision:ledgerEntryRevision(row),version:null,snapshot:{...(proposed?{proposedAccounts:(proposed.snapshot.accounts||[]).map(({accountId,masterId,currency}:any)=>({accountId,masterId,currency})),proposedRows:proposed.snapshot.rows}:{}),taxAllocations:json(allocationSnapshot),entry:json(row),account:{name:account.entityAccount?.displayName||account.bankName,currencyCode:account.currencyCode},...(peer?{transfer:{amount:String(peer.amount),currencyCode:peer.account.currencyCode}}:{})},entry,items};
 }
 const loaded=await loadExpenseEditorSource(db,orgId,kind,id);
 if(loaded.document&&lock)await db.$queryRawUnsafe('SELECT id FROM "ExpenseRequest" WHERE id=$1 AND "orgId"=$2 FOR UPDATE',loaded.document.id,orgId);
 if(lock&&loaded.costs.length)for(const cost of loaded.costs)await db.$queryRawUnsafe('SELECT id FROM "PartnerTransactionCost" WHERE id=$1 AND "orgId"=$2 FOR UPDATE',cost.id,orgId);
 const current=lock?await loadExpenseEditorSource(db,orgId,kind,id):loaded;
 if(current.document?.bankReconciled)fail('EXPENSE_ALREADY_RECONCILED');
 if(await db.accountingOpeningItem.findFirst({where:{orgId,voidedAt:null,expenseItemId:{in:current.costs.map((c:any)=>c.id)}},select:{id:true}}))fail('OPENING_SOURCE_LOCKED');
 if(operation==='DELETE'&&!current.document)fail('CHANGE_INVALID_SOURCE',400);
 return {menu,operation,kind:current.kind,id:current.id,revision:expenseEditorRevision(current),version:current.document?.version??null,snapshot:json(current),expense:current,items:current.costs.map((c:any)=>({currency:c.currency,unitPrice:String(c.amount),quantity:'1',vatRate:'0'}))};
}
function assertParticipant(actor:any,s:any){
 if(s.menu==='INVOICE'){if(!['ADMIN','ACCOUNTANT','OPERATOR'].includes(actor.orgRole))fail('INVOICE_ACCESS_DENIED',403);return;}
 if(s.menu==='BANK_LEDGER'){if(!['ADMIN','ACCOUNTANT'].includes(actor.orgRole)||s.entry.evidenceType==='ADJUSTMENT'&&actor.orgRole!=='ADMIN')fail('LEDGER_ACCESS_DENIED',403);return;}
 const doc=s.expense.document;if(doc&&actor.orgRole!=='ADMIN'&&doc.createdByEmployeeId!==actor.id&&!doc.approvalSteps.some((step:any)=>step.employeeId===actor.id))fail('EXPENSE_DELETE_NOT_PARTICIPANT',403);
}
function amounts(s:any,payload:any){
 if(s.operation==='DELETE')return s.items;
 const next=s.proposedItems|| (s.menu==='EXPENSE'?payload?.items:payload?.rows?.filter((row:any)=>row.entryKind==='BANK').map((row:any)=>({currency:s.proposedCurrency||s.entry.account.currencyCode,unitPrice:row.amount,quantity:'1',vatRate:'0'})));
 if(!Array.isArray(next)||!next.length)fail('CHANGE_INVALID_PAYLOAD',400);

 if(s.proposedTransfer&&!s.proposedItems)next.push(s.proposedTransfer);
 const totals=(items:any[])=>{const result=new Map<string,Prisma.Decimal>();for(const item of items){const amount=new Prisma.Decimal(item.unitPrice).mul(item.quantity).mul(new Prisma.Decimal(1).add(new Prisma.Decimal(item.vatRate||0).div(100)));result.set(item.currency,(result.get(item.currency)||new Prisma.Decimal(0)).add(amount));}return result;};
 const old=totals(s.items),changed=totals(next);for(const [currency,value] of changed)old.set(currency,Prisma.Decimal.max(value,old.get(currency)||0));
 return [...old].map(([currency,value])=>({currency,unitPrice:value.toFixed(currency==='USD'?2:0),quantity:'1',vatRate:'0'}));
}
export async function previewChangeApproval(db:any,orgId:number,actorId:number,input:any,lock=false){
 const actor=await db.employee.findFirst({where:{id:actorId,orgId,status:'ACTIVE',orgRole:{in:['ADMIN','ACCOUNTANT','OPERATOR']}},select:person});if(!actor)fail('ACTIVE_EMPLOYEE_REQUIRED',403);
 const s=await source(db,orgId,input,lock);assertParticipant(actor,s);
 if(s.menu==='BANK_LEDGER'&&s.operation==='UPDATE'){
  const proposed=input.payload?.rows?.find((r:any)=>r.entryKind==='BANK');if(!proposed)fail('CHANGE_INVALID_PAYLOAD',400);
  const target=await db.bankLedgerAccount.findFirst({where:{id:proposed.accountId,orgId}});
  const master=!target&&String(proposed.accountId).startsWith('entity:')?await db.organizationBankAccount.findFirst({where:{id:proposed.accountId.slice(7),orgId,entityId:orgId},include:{currency:true}}):null;
  if(!target&&!master)fail('LEDGER_ACCOUNT_NOT_FOUND',404);s.proposedCurrency=target?.currencyCode||master.currency.code;s.snapshot.proposedAccount={name:target?.bankName||master?.displayName||master?.bankName,currencyCode:s.proposedCurrency};
  const allocations:any[]=[];
  if(proposed.evidenceType==='INVOICE'){const invoice=await db.invoice.findFirst({where:{sellerOrgId:orgId,invoiceNumber:proposed.evidenceNumber,status:'ISSUED'},select:{id:true}});if(!invoice)fail('LEDGER_INVOICE_NOT_FOUND',400);allocations.push({invoiceId:invoice.id});}
  if(proposed.evidenceType==='EXPENSE')for(const item of proposed.expenseItems||[])allocations.push({expenseItemId:item.itemId});
  s.snapshot.proposedCounterparty=entryCounterparty(await resolveLedgerCounterparty(db,orgId,target||{id:proposed.accountId,entityAccountId:master.id,currencyCode:master.currency.code},proposed,allocations));
  if(proposed.counterparty?.kind==='ACCOUNT'){
   const transferTarget=await db.organizationBankAccount.findFirst({where:{id:proposed.counterparty.id,orgId,entityId:orgId,isActive:true},include:{currency:true}}),currency=transferTarget.currency.code;
   if(proposed.transferCurrencyCode!==undefined&&proposed.transferCurrencyCode!==currency)fail('LEDGER_TRANSFER_CURRENCY_CHANGED',400);
   const value=validateLedgerMoney(proposed.transferAmount??(currency===s.proposedCurrency?proposed.amount:undefined),currency);
   if(currency===s.proposedCurrency&&ledgerScale4(value)!==ledgerScale4(proposed.amount))fail('LEDGER_TRANSFER_AMOUNT_MISMATCH',400);
   s.snapshot.proposedTransfer={amount:value,currencyCode:currency};
   if(currency!==s.proposedCurrency)s.proposedTransfer={currency,unitPrice:value,quantity:'1',vatRate:'0'};
  }
 }
 if(s.menu==='EXPENSE'&&s.operation==='UPDATE')s.snapshot.proposedPayee=input.payload?.payeeEmployeeId?await db.employee.findFirst({where:{id:input.payload.payeeEmployeeId,orgId},select:{name:true}}):await db.organization.findFirst({where:{id:input.payload?.partnerOrgId||0},select:{name:true}});
 if(input.revision&&input.revision!==s.revision||input.version!=null&&input.version!==s.version)fail('CHANGE_SOURCE_CHANGED');
 const selected=await approvalActionSettings(db,orgId,s.menu,s.operation),config=selected.value||defaultApprovalSettings();if(!canDraftExpense(actor,config))fail('EXPENSE_DRAFTER_NOT_ALLOWED',403);
 const excluded=[actorId,...(s.menu==='EXPENSE'&&s.operation==='UPDATE'&&s.expense.document?[s.expense.document.createdByEmployeeId]:[])];
 const resolver={authorityEmployee:db.employee,excludedApprovalIds:excluded,systemSetting:db.systemSetting,employeeGrade:db.employeeGrade,employee:{findFirst:db.employee.findFirst.bind(db.employee),findMany:(args:any)=>db.employee.findMany({...args,where:{...args.where,id:{notIn:[...new Set([...(args.where.id?.notIn||[]),...excluded])]}}})}};
 const preview=s.menu==='BANK_LEDGER'&&s.operation==='CREATE'?await previewLedgerRegistration(db,orgId,actor,s,config,input.selection):await resolveExpenseApproval(resolver,orgId,actorId,amounts(s,input.payload),input.selection||{},true,config);
 let highestSelfDeletion=false;
 // Legacy administrator exemption still requires verified highest-company authority.
 if(s.menu==='INVOICE'&&preview.policy.exempt&&preview.policy.exemptionReason==='ADMIN_DRAFTER'&&await isHighestCompanyApprover(db,orgId,actor)){
  const finalDrafterStage={role:'ADMIN',gradeId:actor.gradeId};
  Object.assign(preview.policy,{exemptionReason:'FINAL_DRAFTER',finalDrafterStage,config:{...preview.policy.config,registrationStages:[finalDrafterStage]}});
 }
 const automatic=preview.policy.exempt&&preview.policy.exemptionReason==='FINAL_DRAFTER';
 if(automatic){preview.stages=[{key:'final-self',role:actor.orgRole,gradeId:actor.gradeId,employeeId:actor.id,name:actor.name,candidates:[actor]}];preview.ids=[actor.id];preview.complete=true;}else if(preview.policy.exempt&&s.menu==='EXPENSE'&&s.operation==='DELETE'&&s.expense.document&&await isHighestCompanyApprover(db,orgId,actor)){
  highestSelfDeletion=true;preview.stages=[{key:'changeAdmin',role:'ADMIN',gradeId:actor.gradeId,employeeId:actor.id,candidates:[{id:actor.id,name:actor.name,gradeId:actor.gradeId}]}];preview.ids=[actor.id];preview.complete=true;
 }else if(preview.policy.exempt){
  const candidates=await db.employee.findMany({where:{orgId,status:'ACTIVE',orgRole:'ADMIN',id:{notIn:excluded}},select:{id:true,name:true,gradeId:true},orderBy:{id:'asc'}});
  const id=input.selection?.changeAdminEmployeeId??(candidates.length===1?candidates[0].id:null),chosen=candidates.find((p:any)=>p.id===id);
  preview.stages=[{key:'changeAdmin',role:'ADMIN',gradeId:null,employeeId:chosen?.id||null,candidates}];preview.ids=chosen?[chosen.id]:[];preview.complete=!!chosen;
 }
 const stages=preview.stages.filter((stage:any)=>!stage.vacant);
 const policy={...preview.policy,highestSelfDeletion,autoApproved:automatic,exempt:false,requestedByRole:actor.orgRole,requestedByGradeId:actor.gradeId??null,menu:s.menu,operation:s.operation,resolvedStages:stages.filter((stage:any)=>stage.employeeId).map((stage:any)=>({employeeId:stage.employeeId,role:stage.role,gradeId:(preview.policy as any).resolvedStages?.find((resolved:any)=>resolved.employeeId===stage.employeeId)?.gradeId??stage.gradeId??null}))};
 return {source:s,preview:{...preview,policy},policy};
}
export async function requestChangeApproval(db:any,orgId:number,actorId:number,input:any,gates:any={}){
 if(!/^[-\w]{8,64}$/.test(input.clientKey||''))fail('INVALID_TRANSACTION_KEY',400);
 const reason=typeof input.reason==='string'?input.reason.trim():'';if(input.operation==='DELETE'&&(!reason||reason.length>1000)||reason.length>1000)fail('CHANGE_REASON_REQUIRED',400);
 const requestHash=digest({...input,reason});
 return retryEditTransaction(db,async(tx:any)=>{
  const prior=await tx.changeApprovalRequest.findUnique({where:{orgId_clientKey:{orgId,clientKey:input.clientKey}}});if(prior){if(prior.requestHash!==requestHash||prior.requestedByEmployeeId!==actorId)fail('CHANGE_RETRY_CONFLICT');return prior;}
  const {source:s,preview,policy}=await previewChangeApproval(tx,orgId,actorId,input,true);if(!preview.complete||!policy.resolvedStages.length)fail('EXPENSE_APPROVER_REQUIRED',400);
  const pending=await tx.changeApprovalRequest.findFirst({where:{orgId,menu:s.menu,sourceKind:s.kind,sourceId:s.transferPeerId?{in:[s.id,s.transferPeerId]}:s.id,status:'PENDING'}});if(pending)fail('CHANGE_ALREADY_PENDING');
  const payload=input.operation!=='DELETE'?json(input.payload):{};
  if(s.menu==='EXPENSE'&&s.operation==='UPDATE'){cashScheduleDate(payload?.scheduledPaymentDate);for(const [index,item] of (payload?.items||[]).entries()){const rows=normalizeExpensePaymentSchedule(item?.paymentSchedule);if(rows.length){const expenseItemId=String(index);validateExpensePaymentScheduleTotals(rows.map(row=>({...row,expenseItemId})),[{id:expenseItemId,currency:item.currency,amount:calculateRequestAmounts(item.unitPrice,item.quantity,item.currency,item.vatRate).amount}]);}}}
  if(s.menu==='EXPENSE'&&input.operation==='UPDATE'&&(payload.revision!==s.revision||payload.version!==s.version))fail('CHANGE_SOURCE_CHANGED');
  const created=await tx.changeApprovalRequest.create({data:{orgId,clientKey:input.clientKey,requestHash,menu:s.menu,operation:s.operation,sourceKind:s.kind,sourceId:s.id,expenseRequestId:s.expense?.document?.id??null,ledgerEntryId:s.menu==='BANK_LEDGER'&&s.operation!=='CREATE'?s.id:null,invoiceId:s.menu==='INVOICE'?s.id:null,legacyCostId:s.kind==='cost'?s.id:null,legacyRecordId:s.kind==='legacy'?Number(s.id):null,sourceVersion:s.version,revision:s.revision,requestedByEmployeeId:actorId,reason,beforeSnapshot:s.snapshot,payload,policy}});
  return automaticResult(tx,db,orgId,actorId,created,gates);
 },60000);
}
async function applyChange(tx:any,db:any,orgId:number,actor:any,row:any,s:any,gates:any){
 await tx.$queryRawUnsafe("SELECT set_config('baro.change_request_id',$1,true),set_config('baro.change_approver',$2,true)",row.id,String(actor.id));
 if(row.menu==='INVOICE')return cancelIssuedInvoice(tx,orgId,actor.email||String(actor.id),s.id,row.reason,true);
 if(row.menu==='BANK_LEDGER'){
  if(row.operation==='CREATE'){const requester=await tx.employee.findFirst({where:{id:row.requestedByEmployeeId,orgId,status:'ACTIVE'}});return postLedgerSettlementBatch(db,orgId,requester.email||String(requester.id),row.payload,tx);}
  if(s.entry.evidenceType==='ADJUSTMENT'&&actor.orgRole!=='ADMIN')fail('LEDGER_ADJUSTMENT_ADMIN_REQUIRED',403);
  if(row.operation==='UPDATE'){
   const proposed=row.payload.rows.find((r:any)=>r.entryKind==='BANK');
   if(row.beforeSnapshot.proposedTransfer){
    await tx.$queryRawUnsafe('SELECT id FROM "OrganizationBankAccount" WHERE id=$1 AND "orgId"=$2 FOR SHARE',proposed.counterparty.id,orgId);
    const target=await tx.organizationBankAccount.findFirst({where:{id:proposed.counterparty.id,orgId,entityId:orgId,isActive:true},include:{currency:true}});
    if(!target||target.currency.code!==row.beforeSnapshot.proposedTransfer.currencyCode)fail('CHANGE_SOURCE_CHANGED');
   }
   return replaceLedgerEntryApproved(tx,db,orgId,actor.email||String(actor.id),row.sourceId,row.payload);
  }
  return voidLedgerPairApproved(tx,orgId,actor.email||String(actor.id),s.entry,row.reason);
 }
 if(row.operation==='UPDATE'){
  const decisions=await tx.changeApprovalDecision.findMany({where:{orgId,requestId:row.id},orderBy:{position:'asc'}});const actual=[] as any[];for(const [index,stage] of row.policy.resolvedStages.entries()){const id=decisions[index]?.actingEmployeeId||stage.employeeId;if(!actual.some((p:any)=>p.employeeId===id)){const person=await tx.employee.findFirst({where:{id,orgId,status:'ACTIVE'}});actual.push({...stage,employeeId:id,gradeId:person?.gradeId??stage.gradeId});}}
 const result=await saveExpenseEditor(tx,orgId,row.requestedByEmployeeId,row.sourceKind,row.sourceId,row.payload,gates.appendQuantityRemark,{ids:row.policy.autoApproved?[]:actual.map((p:any)=>p.employeeId),policy:{...row.policy,exempt:row.policy.autoApproved===true,originalResolvedStages:row.policy.resolvedStages,resolvedStages:actual,delegationDecisions:decisions.filter((d:any)=>d.actingEmployeeId),changeRequestId:row.id,drafterId:s.expense.document?.createdByEmployeeId||row.requestedByEmployeeId}});return result;
 }
 const original=s.expense,doc=original.document,key=`EXPENSE_REQUEST_EDIT:${orgId}:CHANGE_${row.id}`,company=await tx.organization.findUnique({where:{id:orgId},select:{type:true,country:true}});
 await tx.$queryRawUnsafe("SELECT set_config('baro.expense_editor_org',$1,true),set_config('baro.expense_editor_actor',$2,true),set_config('baro.expense_editor_key',$3,true),set_config('baro.expense_editor_timezone',$4,true)",String(orgId),String(actor.id),key,companyBusinessTimeZone(company));
 const audit=await tx.expenseRequestAudit.findFirst({where:{orgId,requestId:doc.id,version:doc.version},orderBy:{id:'desc'}});
 const document=await tx.expenseRequest.update({where:{id:doc.id},data:{deletedAt:new Date(),deletedByEmployeeId:actor.id,deletedChangeRequestId:row.id,version:{increment:1},updatedAt:new Date(),updatedByEmployeeId:actor.id}});
 await tx.expenseRequestAudit.create({data:{orgId,requestId:doc.id,version:document.version,actorId:actor.id,action:'UPDATE',clientKey:key,inputHash:row.requestHash,beforeSnapshot:json(original),afterSnapshot:json({...original,document:{...doc,...document},approvalPolicy:audit?.afterSnapshot?.approvalPolicy,deletion:{id:row.id,reason:row.reason,policy:row.policy}})}});
 return {requestId:doc.id};
}
export async function decideChangeApproval(db:any,orgId:number,actorId:number,id:string,body:any,gates:any={}){
 if(!['APPROVED','REJECTED'].includes(body?.decision))fail('INVALID_APPROVAL_DECISION',400);const reason=typeof body.reason==='string'?body.reason.trim():'';if(body.decision==='REJECTED'&&(!reason||reason.length>1000))fail('CHANGE_REASON_REQUIRED',400);
 return retryEditTransaction(db,tx=>decideChangeApprovalTx(tx,db,orgId,actorId,id,body,gates),60000);
}
async function automaticResult(tx:any,db:any,orgId:number,actorId:number,row:any,gates:any){return row.policy.autoApproved?decideChangeApprovalTx(tx,db,orgId,actorId,row.id,{decision:'APPROVED'},gates,true):row;}
async function decideChangeApprovalTx(tx:any,db:any,orgId:number,actorId:number,id:string,body:any,gates:any={},automatic=false){
 const reason=typeof body.reason==='string'?body.reason.trim():'';
  let row=await tx.changeApprovalRequest.findFirst({where:{id,orgId}});if(!row)fail('CHANGE_NOT_FOUND',404);
  await tx.$queryRawUnsafe('SELECT id FROM "ChangeApprovalRequest" WHERE id=$1 AND "orgId"=$2 FOR UPDATE',id,orgId);row=await tx.changeApprovalRequest.findFirst({where:{id,orgId}});
  const actor=await tx.employee.findFirst({where:{id:actorId,orgId,status:'ACTIVE'},include:{grade:{include:{set:true}}}});if(!actor||row.requestedByEmployeeId===actorId&&!(automatic&&row.policy.autoApproved&&row.policy.exemptionReason==='FINAL_DRAFTER')&&!(row.menu==='EXPENSE'&&row.operation==='DELETE'&&row.policy.highestSelfDeletion===true&&await isHighestCompanyApprover(tx,orgId,actor)))fail('CHANGE_APPROVER_REQUIRED',403);
  const decisions=await tx.changeApprovalDecision.findMany({where:{requestId:id,orgId},orderBy:{position:'asc'}});
  if(row.status!=='PENDING'){const old=[...decisions].reverse().find((d:any)=>(d.actingEmployeeId||d.employeeId)===actorId);if(old?.decision===body.decision&&(old.reason||'')===reason)return row;fail('CHANGE_ALREADY_DECIDED');}
  const next=row.policy.resolvedStages[decisions.length];const delegated=!!next&&!(row.menu==='EXPENSE'&&row.operation==='DELETE')&&await approvalDelegate(tx,orgId,row.requestedByEmployeeId,next.employeeId,actorId);if(!next||!delegated&&(next.employeeId!==actorId||next.role!==actor.orgRole||next.gradeId!=null&&(next.gradeId!==actor.gradeId||!actor.grade?.isActive||!actor.grade?.set?.isActive)))fail('CHANGE_APPROVER_REQUIRED',403);
  if(row.operation==='CREATE'&&!delegated&&!automatic){
   const rule=(row.policy.effectiveRegistrationStages||row.policy.config.registrationStages)[decisions.length];
   if(rule.gradeMatch!=='ANY'){const grade=await tx.employeeGrade.findFirst({where:{id:rule.gradeId,orgId,isActive:true,set:{isActive:true}}});if(!grade||!actor.grade?.isActive||actor.grade.setId!==grade.setId||(rule.gradeMatch==='MINIMUM'?actor.grade.sortOrder<grade.sortOrder:actor.gradeId!==grade.id))fail('CHANGE_APPROVER_REQUIRED',403);}
  }
  const s=body.decision==='APPROVED'?await source(tx,orgId,row,true):null;if(s&&s.revision!==row.revision)fail('CHANGE_SOURCE_CHANGED');if(s&&row.beforeSnapshot.proposedAccounts&&JSON.stringify(s.snapshot.proposedAccounts?.map((a:any)=>[a.accountId,a.masterId,a.currency]))!==JSON.stringify(row.beforeSnapshot.proposedAccounts.map((a:any)=>[a.accountId,a.masterId,a.currency])))fail('CHANGE_SOURCE_CHANGED');
  const requester=await tx.employee.findFirst({where:{id:row.requestedByEmployeeId,orgId,status:'ACTIVE'}});if(!requester||requester.orgRole!==row.policy.requestedByRole||(requester.gradeId??null)!==row.policy.requestedByGradeId)fail('CHANGE_SOURCE_CHANGED');
  await tx.changeApprovalDecision.create({data:{requestId:id,orgId,employeeId:next.employeeId,...delegationData(next.employeeId,actorId),position:decisions.length+1,decision:body.decision,reason:reason||null}});
  if(body.decision==='REJECTED')return tx.changeApprovalRequest.update({where:{id},data:{status:'REJECTED',decidedByEmployeeId:actorId,decisionReason:reason,decidedAt:new Date()}});
  if(decisions.length+1<row.policy.resolvedStages.length)return row;
  row=await tx.changeApprovalRequest.update({where:{id},data:{status:'APPROVED',decidedByEmployeeId:actorId,decidedAt:new Date(),appliedAt:new Date()}});
  const result=json(await applyChange(tx,db,orgId,actor,row,s,gates));
  await tx.changeApprovalRequest.update({where:{id},data:{result}});return {...row,result};
}
export async function listChangeApprovals(db:any,orgId:number,actorId:number){
 const delegatedIds=await delegatedChangeIds(db,orgId,actorId);
 const rows=await db.changeApprovalRequest.findMany({where:{orgId,status:'PENDING',OR:[{id:{in:delegatedIds}},{requestedByEmployeeId:actorId},{policy:{path:['resolvedStages'],array_contains:[{employeeId:actorId}]}}]},orderBy:{createdAt:'asc'},take:200});
 const highestSelf=rows.some((row:any)=>row.requestedByEmployeeId===actorId&&row.policy.highestSelfDeletion===true)?await isHighestCompanyApprover(db,orgId,await db.employee.findFirst({where:{id:actorId,orgId,status:'ACTIVE'},select:person})):false;
 const decisions=rows.length?await db.changeApprovalDecision.findMany({where:{orgId,requestId:{in:rows.map((r:any)=>r.id)}},orderBy:{position:'asc'}}):[];
 const people=await db.employee.findMany({where:{orgId,id:{in:[...new Set(rows.map((r:any)=>r.requestedByEmployeeId))]}},select:{id:true,name:true}});
 const delegateNext=new Set<string>();for(const r of rows){const next=r.policy.resolvedStages[decisions.filter((d:any)=>d.requestId===r.id).length];if(next&&delegatedIds.includes(r.id)&&await approvalDelegate(db,orgId,r.requestedByEmployeeId,next.employeeId,actorId))delegateNext.add(r.id);}
 return rows.filter((r:any)=>delegatedIds.includes(r.id)||r.requestedByEmployeeId===actorId||r.policy.resolvedStages.some((s:any)=>s.employeeId===actorId)).map((r:any)=>{const accepted=decisions.filter((d:any)=>d.requestId===r.id);return {...r,requesterName:people.find((p:any)=>p.id===r.requestedByEmployeeId)?.name||'',decisions:accepted,canDecide:(r.requestedByEmployeeId!==actorId||r.menu==='EXPENSE'&&r.operation==='DELETE'&&r.policy.highestSelfDeletion===true&&highestSelf)&&(r.policy.resolvedStages[accepted.length]?.employeeId===actorId||delegateNext.has(r.id))};});
}
export function registerChangeApprovalRoutes(app:any,db:any,gates:any){
 const access=async(req:any,res:any)=>{const ctx=await gates.requireOrgRole(req,res,{allowedRoles:['ADMIN','ACCOUNTANT','OPERATOR'],allowSystemAdmin:false});if(!ctx)return null;const actorId=gates.actorId();if(!actorId||!await db.employee.findFirst({where:{id:actorId,orgId:ctx.organization.id,status:'ACTIVE'}}))fail('ACTIVE_EMPLOYEE_REQUIRED',403);return {orgId:ctx.organization.id,actorId,ctx};};
 const submission=async(req:any,res:any)=>{const scope=await access(req,res);if(!scope)return null;if(req.body?.menu==='INVOICE'){if(!['ADMIN','ACCOUNTANT','OPERATOR'].includes(scope.ctx.employee?.orgRole)||!await gates.canAccess?.({orgType:scope.ctx.organization.type,orgRole:scope.ctx.employee.orgRole,feature:'INVOICE'}))fail('INVOICE_ACCESS_DENIED',403);}if(req.body?.menu==='BANK_LEDGER'){const policy=(await gates.loadPolicy()).policy;if(!['ADMIN','ACCOUNTANT'].includes(scope.ctx.employee?.orgRole)||!policy?.[scope.ctx.organization.type]?.[scope.ctx.employee.orgRole]?.includes('BANK_LEDGER'))fail('LEDGER_ACCESS_DENIED',403);}return scope;};
 app.post('/change-approval-preview',async(req:any,res:any)=>{const scope=await submission(req,res);if(scope)res.json((await previewChangeApproval(db,scope.orgId,scope.actorId,req.body)).preview);});
 app.post('/change-approval-requests',async(req:any,res:any)=>{const scope=await submission(req,res);if(scope)res.json(await requestChangeApproval(db,scope.orgId,scope.actorId,req.body,gates));});
 app.get('/change-approval-requests',async(req:any,res:any)=>{const scope=await access(req,res);if(scope){const rows=await listChangeApprovals(db,scope.orgId,scope.actorId),invoiceAccess=await gates.canAccess?.({orgType:scope.ctx.organization.type,orgRole:scope.ctx.employee?.orgRole,feature:'INVOICE'});res.json(rows.filter((row:any)=>row.menu!=='INVOICE'||invoiceAccess));}});
 app.post('/change-approval-requests/:id/decision',async(req:any,res:any)=>{const scope=await access(req,res);if(!scope)return;const target=await db.changeApprovalRequest.findFirst({where:{id:req.params.id,orgId:scope.orgId},select:{menu:true}});if(target?.menu==='INVOICE'&&!await gates.canAccess?.({orgType:scope.ctx.organization.type,orgRole:scope.ctx.employee?.orgRole,feature:'INVOICE'}))fail('INVOICE_ACCESS_DENIED',403);const result=await decideChangeApproval(db,scope.orgId,scope.actorId,req.params.id,req.body,gates);if(result.result?.assignmentPlanIds?.length)await gates.syncProduction?.(scope.orgId,result.result.assignmentPlanIds);res.json(result);});
}
