import {createHttpError} from '../utils/http';
import {legacyExpenseNumber} from './documentNumber';
import {retryEditTransaction} from '../utils/editRevision';
import {ledgerScale4,ledgerMoney,validateLedgerMoney} from './bankLedger';
const fail=(code:string,status=400):never=>{throw createHttpError(status,code);};
function approvalExemption(request:any,decisions:any[],policy:any,orgId:number){
 if((request.approvalSteps||[]).length)return {exempt:false,exemptionReason:null};
 const current=decisions.filter(row=>row.requestId===request.id&&row.version===request.version);
 if(current.some(row=>row.decision==='REJECTED'))return {exempt:false,exemptionReason:null};
 if(policy?.exempt===true&&policy.drafterId===request.createdByEmployeeId)return {exempt:true,exemptionReason:policy.exemptionReason||'SAVED_POLICY'};
 const author=request.createdByEmployee;
 const admin=current.length===0&&author?.id===request.createdByEmployeeId&&author?.orgId===orgId&&author?.status==='ACTIVE'&&author?.orgRole==='ADMIN';
 return {exempt:admin,exemptionReason:admin?'ADMIN_DRAFTER':null};
}
export function expenseApprovalSummary(request:any,decisions:any[],exempt=false){
 const current=decisions.filter(row=>row.requestId===request.id&&row.version===request.version);
 const steps=(request.approvalSteps||[]).map((step:any)=>{const record=current.find(row=>row.position===step.position&&row.employeeId===step.employeeId);const rejected=record?.decision==='REJECTED';return {...step,approved:!!record&&!rejected,rejected,approvedAt:record&&!rejected?record.createdAt:null,rejectedAt:rejected?record.createdAt:null,reason:rejected?record.reason:null};});
 const rejection=steps.find((step:any)=>step.rejected);
 if(rejection)for(const step of steps)if(step.position>rejection.position)step.blocked=true;
 const next=rejection?null:steps.find((step:any)=>!step.approved);
 const approved=!rejection&&(steps.length>0?!next:exempt);
 const status=rejection?'REJECTED':approved?'APPROVED':!steps.length?'UNKNOWN':steps.some((step:any)=>step.approved)?'IN_REVIEW':'REQUESTED';
 return {status,steps,exempt,approved,rejected:!!rejection,rejection:rejection?{employeeId:rejection.employeeId,name:rejection.employee?.name||'',reason:rejection.reason,createdAt:rejection.rejectedAt}:null};
}
export async function approvalState(db:any,orgId:number,requestId:number,actorId?:number){
 const request=await db.expenseRequest.findFirst({where:{id:requestId,orgId},include:{createdByEmployee:{select:{id:true,name:true,orgId:true,orgRole:true,status:true}},approvalSteps:{orderBy:{position:'asc'},include:{employee:{select:{id:true,name:true}}}}}});
 if(!request)return fail('EXPENSE_SOURCE_NOT_FOUND',404);
 const decisions=await db.expenseApprovalDecision.findMany({where:{orgId,requestId,version:request.version},orderBy:{position:'asc'}});
 const audit=!request.approvalSteps.length ? await db.expenseRequestAudit.findFirst({where:{orgId,requestId,version:request.version},orderBy:{id:'desc'}}) : null;
 const policy=audit?.afterSnapshot?.approvalPolicy;
 const exemption=approvalExemption(request,decisions,policy,orgId);
 const summary=expenseApprovalSummary(request,decisions,exemption.exempt);
 const next=summary.rejected?null:summary.steps.find((step:any)=>!step.approved);
 const actor=actorId ? await db.employee.findFirst({where:{id:actorId,orgId,status:'ACTIVE',orgRole:{in:['ADMIN','ACCOUNTANT']}}}) : null;
 const canApprove=!!actor&&!!next&&next.employeeId===actorId&&request.createdByEmployeeId!==actorId;
 return {version:request.version,managementNumber:request.managementNumber||legacyExpenseNumber(request.id),...summary,exemptionReason:exemption.exemptionReason,canApprove,canReject:canApprove};
}
export async function attachExpenseApprovalStates(db:any,orgId:number,requests:any[]){
 if(!requests.length)return requests;
 const ids=requests.map(row=>row.id);
 const auditIds=requests.filter(row=>!row.approvalSteps?.length).map(row=>row.id);
 const [decisions,audits]=await Promise.all([
  db.expenseApprovalDecision.findMany({where:{orgId,requestId:{in:ids}}}),
  auditIds.length?db.expenseRequestAudit.findMany({where:{orgId,requestId:{in:auditIds}},select:{requestId:true,version:true,afterSnapshot:true}}):Promise.resolve([]),
 ]);
 return requests.map(row=>{const policy=audits.find((audit:any)=>audit.requestId===row.id&&audit.version===row.version)?.afterSnapshot?.approvalPolicy,exemption=approvalExemption(row,decisions,policy,orgId);return {...row,approval:{...expenseApprovalSummary(row,decisions,exemption.exempt),exemptionReason:exemption.exemptionReason}};});
}
export async function listExpenseApprovalInbox(db:any,orgId:number,actorId:number,view='pending'){
 if(!['pending','inProgress','completed','requested'].includes(view))return fail('INVALID_APPROVAL_VIEW');
 const actor=await db.employee.findFirst({where:{id:actorId,orgId,status:'ACTIVE',orgRole:{in:['ADMIN','OPERATOR','ACCOUNTANT']}}});
 if(!actor)return fail('LEDGER_ACCESS_DENIED',403);
 if(actor.orgRole==='OPERATOR'&&view!=='requested')return [];
 const handled=view==='completed'?await db.expenseApprovalDecision.findMany({where:{orgId,employeeId:actorId},select:{requestId:true,version:true,decision:true,reason:true,createdAt:true}}):[];
 const requests=await db.expenseRequest.findMany({where:{orgId,...(view==='requested'?{createdByEmployeeId:actorId}:view==='completed'?{id:{in:[...new Set(handled.map((row:any)=>row.requestId))]}}:{approvalSteps:{some:{employeeId:actorId}}})},select:{id:true,managementNumber:true,version:true,requestDate:true,createdByEmployeeId:true,partner:{select:{name:true}},createdByEmployee:{select:{id:true,name:true,orgId:true,orgRole:true,status:true}},items:{select:{currency:true,amount:true}},approvalSteps:{orderBy:{position:'asc'},select:{position:true,employeeId:true}}},orderBy:[{requestDate:'asc'},{id:'asc'}]});
 if(!requests.length)return [];
 const decisions=await db.expenseApprovalDecision.findMany({where:{orgId,requestId:{in:requests.map((request:any)=>request.id)}},select:{requestId:true,version:true,position:true,employeeId:true,decision:true,reason:true,createdAt:true}});
 const auditIds=requests.filter((row:any)=>view==='completed'||!row.approvalSteps.length).map((row:any)=>row.id);
 const audits=auditIds.length?await db.expenseRequestAudit.findMany({where:{orgId,requestId:{in:auditIds}},select:{requestId:true,version:true,afterSnapshot:true}}):[];
 const toRow=(request:any,status:string)=>{
  const totals=new Map<string,bigint>();for(const item of request.items||[])totals.set(item.currency,(totals.get(item.currency)||0n)+ledgerScale4(item.amount));
  return {id:request.id,kind:'EXPENSE_REQUEST',version:request.version,status,managementNumber:request.managementNumber||legacyExpenseNumber(request.id),requestDate:request.requestDate,payee:request.partner?.name||'',drafter:request.createdByEmployee?.name||'',totals:[...totals].map(([currency,amount])=>({currency,amount:ledgerMoney(amount,currency)}))};
 };
 const rows=requests.flatMap((request:any)=>{
  const policy=audits.find((audit:any)=>audit.requestId===request.id&&audit.version===request.version)?.afterSnapshot?.approvalPolicy;
  const summary=expenseApprovalSummary(request,decisions,approvalExemption(request,decisions,policy,orgId).exempt),next=summary.rejected?null:summary.steps.find((step:any)=>!step.approved);
  const pending=request.createdByEmployeeId!==actorId&&next?.employeeId===actorId;
  if(view==='pending'&&!pending||view==='inProgress'&&(pending||summary.rejected||summary.approved))return [];
  if(view!=='completed')return [toRow(request,summary.status)];
  return handled.filter((item:any)=>item.requestId===request.id).map((item:any)=>{
   const snapshot=audits.find((audit:any)=>audit.requestId===request.id&&audit.version===item.version)?.afterSnapshot;
   // Never present current amounts as the contents of an older reviewed version.
   const source=item.version===request.version?request:snapshot?.document?{...snapshot.document,items:snapshot.costs||snapshot.document.items||[]}:{...request,requestDate:null,partner:null,items:[]};
   return {...toRow(source,item.decision||'APPROVED'),id:request.id,handledVersion:item.version,decision:item.decision||'APPROVED',reason:item.reason,handledAt:item.createdAt};
  });
 });
 return view==='completed'?rows.sort((a:any,b:any)=>new Date(b.handledAt).getTime()-new Date(a.handledAt).getTime()):rows;
}
export async function approveExpense(db:any,orgId:number,actorId:number,requestId:number,version:number,decision='APPROVED',reason?:unknown){
 if(!['APPROVED','REJECTED'].includes(decision))return fail('INVALID_APPROVAL_DECISION');
 const normalized=decision==='REJECTED'&&typeof reason==='string'?reason.trim():null;
 if(decision==='REJECTED'&&(!normalized||normalized.length>1000))return fail('EXPENSE_REJECTION_REASON_REQUIRED');
 return retryEditTransaction(db,async(tx:any)=>{
  await tx.$queryRawUnsafe('SELECT id FROM "ExpenseRequest" WHERE id=$1 AND "orgId"=$2 FOR UPDATE',requestId,orgId);
  const actor=await tx.employee.findFirst({where:{id:actorId,orgId,status:'ACTIVE',orgRole:{in:['ADMIN','ACCOUNTANT']}}});
  if(!actor)return fail('LEDGER_ACCESS_DENIED',403);
  const state=await approvalState(tx,orgId,requestId,actorId);
  if(state.version!==version)return fail('EXPENSE_REQUEST_CHANGED',409);
  const handled=state.steps.find((step:any)=>step.employeeId===actorId&&(step.approved||step.rejected));
  if(handled){if((handled.rejected?'REJECTED':'APPROVED')===decision&&(decision!=='REJECTED'||handled.reason===normalized))return state;return fail('EXPENSE_APPROVAL_ALREADY_DECIDED',409);}
  if(state.rejected)return fail('EXPENSE_REQUEST_REJECTED',409);
  if(!state.canApprove)return fail('EXPENSE_APPROVAL_NOT_YOUR_TURN',403);
  const step=state.steps.find((item:any)=>!item.approved);
  await tx.expenseApprovalDecision.create({data:{orgId,requestId,version,position:step.position,employeeId:actorId,decision,reason:normalized}});
  return approvalState(tx,orgId,requestId,actorId);
 });
}
export async function resolveEvidence(tx:any,orgId:number,account:any,body:any){
 const type=body.evidenceType||'FILE',code=account.currencyCode;
 if(!['FILE','INVOICE','EXPENSE','ADJUSTMENT'].includes(type))return fail('LEDGER_INVALID_EVIDENCE');
 const fee=validateLedgerMoney(body.bankFee||'0',code,true),writeOff=validateLedgerMoney(body.writeOffAmount||'0',code,true);
 if(ledgerScale4(fee)<0n||ledgerScale4(writeOff)<0n||type!=='INVOICE'&&ledgerScale4(writeOff)!==0n)return fail('LEDGER_INVALID_AMOUNT');
 const amount=ledgerScale4(body.amount),bankFee=ledgerScale4(fee),loss=ledgerScale4(writeOff);
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
  if(used.reduce((s:bigint,r:any)=>s+ledgerScale4(r.amount),0n)+amount+bankFee+loss>ledgerScale4(current.total))return fail('LEDGER_EXCEEDS_DOCUMENT');
  allocations.push({invoiceId:invoice.id,amount:ledgerMoney(amount+bankFee+loss,code)});
 }else{
  if(body.direction!=='OUT'||!Array.isArray(body.expenseItems)||!body.expenseItems.length||body.expenseItems.length>50)return fail('LEDGER_INVALID_EVIDENCE');
  const ids=body.expenseItems.map((r:any)=>r.itemId);
  if(ids.some((id:any)=>typeof id!=='string')||new Set(ids).size!==ids.length)return fail('LEDGER_INVALID_EVIDENCE');
  const costs=await tx.partnerTransactionCost.findMany({where:{orgId,id:{in:ids}}});
  if(costs.length!==ids.length||costs.some((c:any)=>!c.expenseRequestId||c.currency!==code))return fail('LEDGER_INVALID_EVIDENCE');
  if(body.expenseRequestId!==undefined&&costs.some((c:any)=>c.expenseRequestId!==body.expenseRequestId))return fail('LEDGER_INVALID_EVIDENCE');
  const requestIds=[...new Set<number>(costs.map((c:any)=>c.expenseRequestId))].sort((a,b)=>a-b);
  for(const id of requestIds){await tx.$queryRawUnsafe('SELECT id FROM "ExpenseRequest" WHERE id=$1 AND "orgId"=$2 FOR UPDATE',id,orgId);const state=await approvalState(tx,orgId,id);if(!state.approved)return fail('LEDGER_EXPENSE_NOT_APPROVED');if(body.expenseVersion!==undefined&&state.version!==body.expenseVersion)return fail('EXPENSE_REQUEST_CHANGED',409);}
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
 return {evidenceType:type,evidenceNumber:reference,bankFee:fee,writeOffAmount:writeOff,allocations};
}
