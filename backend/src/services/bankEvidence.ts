import {createHttpError} from '../utils/http';
import {legacyExpenseNumber} from './documentNumber';
import {retryEditTransaction} from '../utils/editRevision';
import {ledgerScale4,ledgerMoney,validateLedgerMoney} from './bankLedger';
const fail=(code:string,status=400):never=>{throw createHttpError(status,code);};
export async function approvalState(db:any,orgId:number,requestId:number,actorId?:number){
 const request=await db.expenseRequest.findFirst({where:{id:requestId,orgId},include:{approvalSteps:{orderBy:{position:'asc'},include:{employee:{select:{id:true,name:true}}}}}});
 if(!request)return fail('EXPENSE_SOURCE_NOT_FOUND',404);
 const decisions=await db.expenseApprovalDecision.findMany({where:{orgId,requestId,version:request.version},orderBy:{position:'asc'}});
 const steps=request.approvalSteps.map((step:any)=>{const decision=decisions.find((d:any)=>d.position===step.position&&d.employeeId===step.employeeId);return {...step,approved:!!decision,approvedAt:decision?.createdAt||null};});
 const next=steps.find((step:any)=>!step.approved);
 const audit=!steps.length ? await db.expenseRequestAudit.findFirst({where:{orgId,requestId,version:request.version},orderBy:{id:'desc'}}) : null;
 const policy=audit?.afterSnapshot?.approvalPolicy;
 const exempt=policy?.exempt===true && policy.drafterId===request.createdByEmployeeId;
 const actor=actorId ? await db.employee.findFirst({where:{id:actorId,orgId,status:'ACTIVE',orgRole:{in:['ADMIN','ACCOUNTANT']}}}) : null;
 return {version:request.version,managementNumber:request.managementNumber||legacyExpenseNumber(request.id),steps,exempt,approved:steps.length>0?!next:exempt,canApprove:!!actor&&!!next&&next.employeeId===actorId&&request.createdByEmployeeId!==actorId};
}
export async function listExpenseApprovalInbox(db:any,orgId:number,actorId:number){
 const actor=await db.employee.findFirst({where:{id:actorId,orgId,status:'ACTIVE',orgRole:{in:['ADMIN','ACCOUNTANT']}}});
 if(!actor)return fail('LEDGER_ACCESS_DENIED',403);
 const requests=await db.expenseRequest.findMany({where:{orgId,approvalSteps:{some:{employeeId:actorId}}},select:{id:true,managementNumber:true,version:true,requestDate:true,createdByEmployeeId:true,partner:{select:{name:true}},createdByEmployee:{select:{name:true}},approvalSteps:{orderBy:{position:'asc'},select:{position:true,employeeId:true}}},orderBy:[{requestDate:'asc'},{id:'asc'}]});
 if(!requests.length)return [];
 const decisions=await db.expenseApprovalDecision.findMany({where:{orgId,requestId:{in:requests.map((request:any)=>request.id)}},select:{requestId:true,version:true,position:true,employeeId:true}});
 return requests.filter((request:any)=>request.createdByEmployeeId!==actorId&&request.approvalSteps.find((step:any)=>!decisions.some((decision:any)=>decision.requestId===request.id&&decision.version===request.version&&decision.position===step.position&&decision.employeeId===step.employeeId))?.employeeId===actorId)
  .map((request:any)=>({id:request.id,version:request.version,managementNumber:request.managementNumber||legacyExpenseNumber(request.id),requestDate:request.requestDate,payee:request.partner?.name||'',drafter:request.createdByEmployee?.name||''}));
}
export async function approveExpense(db:any,orgId:number,actorId:number,requestId:number,version:number){
 return retryEditTransaction(db,async(tx:any)=>{
  await tx.$queryRawUnsafe('SELECT id FROM "ExpenseRequest" WHERE id=$1 AND "orgId"=$2 FOR UPDATE',requestId,orgId);
  const actor=await tx.employee.findFirst({where:{id:actorId,orgId,status:'ACTIVE',orgRole:{in:['ADMIN','ACCOUNTANT']}}});
  if(!actor)return fail('LEDGER_ACCESS_DENIED',403);
  const state=await approvalState(tx,orgId,requestId,actorId);
  if(state.version!==version)return fail('EXPENSE_REQUEST_CHANGED',409);
  // Repeating a successful approval never advances another person's step.
  if(state.steps.some((s:any)=>s.employeeId===actorId&&s.approved))return state;
  if(!state.canApprove)return fail('EXPENSE_APPROVAL_NOT_YOUR_TURN',403);
  const step=state.steps.find((s:any)=>!s.approved);
  await tx.expenseApprovalDecision.create({data:{orgId,requestId,version,position:step.position,employeeId:actorId}});
  return approvalState(tx,orgId,requestId,actorId);
 });
}
export async function resolveEvidence(tx:any,orgId:number,account:any,body:any){
 const type=body.evidenceType||'FILE',code=account.currencyCode;
 if(!['FILE','INVOICE','EXPENSE','ADJUSTMENT'].includes(type))return fail('LEDGER_INVALID_EVIDENCE');
 const fee=validateLedgerMoney(body.bankFee||'0',code,true);
 if(ledgerScale4(fee)<0n)return fail('LEDGER_INVALID_AMOUNT');
 const amount=ledgerScale4(body.amount),bankFee=ledgerScale4(fee);
 let reference=typeof body.evidenceNumber==='string'?body.evidenceNumber.trim():'';
 const allocations:any[]=[];
 if(type==='FILE'){
  if(!reference||reference.length>500||/[\r\n]/.test(reference))return fail('LEDGER_FILE_REQUIRED');
  if(bankFee)return fail('LEDGER_INVALID_EVIDENCE');
 }else if(type==='ADJUSTMENT'){
  if(bankFee)return fail('LEDGER_INVALID_EVIDENCE');reference='';
 }else if(type==='INVOICE'){
  if(body.direction!=='IN'||!reference||reference.length>200)return fail('LEDGER_INVALID_EVIDENCE');
  const invoice=await tx.invoice.findFirst({where:{sellerOrgId:orgId,invoiceNumber:reference,status:'ISSUED',currencyCode:code}});
  if(!invoice)return fail('LEDGER_INVOICE_NOT_FOUND');
  await tx.$queryRawUnsafe('SELECT id FROM "Invoice" WHERE id=$1 FOR UPDATE',invoice.id);
  const current=await tx.invoice.findFirst({where:{id:invoice.id,sellerOrgId:orgId,status:'ISSUED',currencyCode:code}});
  if(!current)return fail('LEDGER_INVOICE_NOT_FOUND');
  const used=await tx.bankLedgerEvidenceAllocation.findMany({where:{orgId,invoiceId:invoice.id,entry:{voidedAt:null}}});
  if(used.reduce((s:bigint,r:any)=>s+ledgerScale4(r.amount),0n)+amount+bankFee>ledgerScale4(current.total))return fail('LEDGER_EXCEEDS_DOCUMENT');
  allocations.push({invoiceId:invoice.id,amount:ledgerMoney(amount+bankFee,code)});
 }else{
  if(body.direction!=='OUT'||!Array.isArray(body.expenseItems)||!body.expenseItems.length||body.expenseItems.length>50)return fail('LEDGER_INVALID_EVIDENCE');
  const ids=body.expenseItems.map((r:any)=>r.itemId);
  if(ids.some((id:any)=>typeof id!=='string')||new Set(ids).size!==ids.length)return fail('LEDGER_INVALID_EVIDENCE');
  const costs=await tx.partnerTransactionCost.findMany({where:{orgId,id:{in:ids}}});
  if(costs.length!==ids.length||costs.some((c:any)=>!c.expenseRequestId||c.currency!==code))return fail('LEDGER_INVALID_EVIDENCE');
  const requestIds=[...new Set<number>(costs.map((c:any)=>c.expenseRequestId))].sort((a,b)=>a-b);
  for(const id of requestIds){await tx.$queryRawUnsafe('SELECT id FROM "ExpenseRequest" WHERE id=$1 AND "orgId"=$2 FOR UPDATE',id,orgId);if(!(await approvalState(tx,orgId,id)).approved)return fail('LEDGER_EXPENSE_NOT_APPROVED');}
  let allocated=0n;const refs:string[]=[];
  for(const row of [...body.expenseItems].sort((a,b)=>a.itemId.localeCompare(b.itemId))){
   const cost=await tx.partnerTransactionCost.findFirst({where:{id:row.itemId,orgId}});
   const before=costs.find((c:any)=>c.id===row.itemId);
   if(!cost||cost.expenseRequestId!==before.expenseRequestId||cost.currency!==code)return fail('LEDGER_INVALID_EVIDENCE');
   const state=await approvalState(tx,orgId,cost.expenseRequestId);
   const value=validateLedgerMoney(row.amount,code),minor=ledgerScale4(value);
   const used=await tx.bankLedgerEvidenceAllocation.findMany({where:{orgId,expenseItemId:row.itemId,entry:{voidedAt:null}}});
   if(used.reduce((s:bigint,r:any)=>s+ledgerScale4(r.amount),0n)+minor>ledgerScale4(cost.amount))return fail('LEDGER_EXCEEDS_DOCUMENT');
   allocated+=minor;refs.push(`${state.managementNumber} #${cost.expenseRequestLine}`);
   allocations.push({expenseItemId:row.itemId,requestVersion:state.version,amount:value});
  }
  if(allocated+bankFee!==amount)return fail('LEDGER_ALLOCATION_MISMATCH');reference=refs.join(', ');
 }
 return {evidenceType:type,evidenceNumber:reference,bankFee:fee,allocations};
}
