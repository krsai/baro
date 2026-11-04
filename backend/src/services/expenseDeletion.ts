import {createHttpError} from '../utils/http';
import {retryEditTransaction} from '../utils/editRevision';
import {loadExpenseEditorSource} from './expenseRequestEditor';
import {companyBusinessTimeZone} from './serviceCompany';

const fail=(status:number,code:string):never=>{throw createHttpError(status,code);};
const personInclude={grade:{include:{set:true}}};
export const canApproveExpenseDeletion=(actor:any,row:any,highestOrder?:number)=>actor?.orgRole==='ADMIN'&&actor.status==='ACTIVE'&&actor.grade?.isActive&&actor.grade.set?.isActive&&actor.grade.setId===row.gradeSetId&&((actor.id!==row.requestedByEmployeeId&&actor.grade.sortOrder>row.finalGradeOrder)||(highestOrder!==undefined&&actor.grade.sortOrder===highestOrder&&actor.grade.sortOrder>=row.finalGradeOrder));
const highestDeletionGrade=async(db:any,orgId:number,setId:number)=>(await db.employeeGrade.findFirst({where:{orgId,setId,isActive:true,set:{isActive:true}},orderBy:{sortOrder:'desc'},select:{sortOrder:true}}))?.sortOrder;

export const isHighestCompanyApprover=async(db:any,orgId:number,actor:any)=>actor?.orgId===orgId&&actor.orgRole==='ADMIN'&&actor.status==='ACTIVE'&&actor.grade?.isActive&&actor.grade.set?.isActive&&actor.grade.sortOrder===await highestDeletionGrade(db,orgId,actor.grade.setId);
async function deletionSource(tx:any,orgId:number,requestId:number,version:number){
 await tx.$queryRawUnsafe('SELECT id FROM "ExpenseRequest" WHERE id=$1 AND "orgId"=$2 FOR UPDATE',requestId,orgId);
 const source=await loadExpenseEditorSource(tx,orgId,'request',String(requestId));
 if(source.document.deletedAt)fail(409,'EXPENSE_REQUEST_DELETED');
 if(source.document.version!==version)fail(409,'EXPENSE_REQUEST_CHANGED');
 if(source.document.bankReconciled)fail(409,'EXPENSE_ALREADY_RECONCILED');
 return source;
}
export async function requestExpenseDeletion(db:any,orgId:number,actorId:number,requestId:number,body:any){
 const reason=typeof body?.reason==='string'?body.reason.trim():'';
 if(!reason||reason.length>1000)fail(400,'EXPENSE_DELETE_REASON_REQUIRED');
 if(!Number.isSafeInteger(body?.version)||!/^[-\w]{8,64}$/.test(body?.clientKey||''))fail(400,'INVALID_TRANSACTION_KEY');
 return retryEditTransaction(db,async(tx:any)=>{
  const actor=await tx.employee.findFirst({where:{id:actorId,orgId,status:'ACTIVE',orgRole:{in:['ADMIN','ACCOUNTANT','OPERATOR']}}});
  if(!actor)fail(403,'ACTIVE_EMPLOYEE_REQUIRED');
  const prior=await tx.expenseDeletionRequest.findUnique({where:{orgId_clientKey:{orgId,clientKey:body.clientKey}}});
  if(prior){if(prior.requestId!==requestId||prior.version!==body.version||prior.reason!==reason||prior.requestedByEmployeeId!==actorId)fail(409,'EXPENSE_REQUEST_RETRY_MISMATCH');return prior;}
  const source=await deletionSource(tx,orgId,requestId,body.version),steps=source.document.approvalSteps;
  if(actor.orgRole!=='ADMIN'&&source.document.createdByEmployeeId!==actorId&&!steps.some((s:any)=>s.employeeId===actorId))fail(403,'EXPENSE_DELETE_NOT_PARTICIPANT');
  const pending=await tx.expenseDeletionRequest.findFirst({where:{orgId,requestId,version:body.version,status:'PENDING'}});
  if(pending)fail(409,'EXPENSE_DELETE_PENDING');
  const finalId=steps.at(-1)?.employeeId||source.document.createdByEmployeeId;
  const final=await tx.employee.findFirst({where:{id:finalId,orgId},include:personInclude});
  if(!final?.grade?.isActive||!final.grade.set?.isActive)fail(409,'EXPENSE_DELETE_FINAL_GRADE_REQUIRED');
  return tx.expenseDeletionRequest.create({data:{orgId,requestId,version:body.version,clientKey:body.clientKey,requestedByEmployeeId:actorId,reason,
   finalEmployeeId:final.id,finalGradeId:final.gradeId,gradeSetId:final.grade.setId,finalGradeOrder:final.grade.sortOrder,documentSnapshot:JSON.parse(JSON.stringify(source))}});
 });
}
export async function decideExpenseDeletion(db:any,orgId:number,actorId:number,id:string,body:any){
 if(!['APPROVED','REJECTED'].includes(body?.decision))fail(400,'INVALID_APPROVAL_DECISION');
 const reason=typeof body.reason==='string'?body.reason.trim():'';
 if(body.decision==='REJECTED'&&(!reason||reason.length>1000))fail(400,'EXPENSE_DELETE_REASON_REQUIRED');
 return retryEditTransaction(db,async(tx:any)=>{
  const row=await tx.expenseDeletionRequest.findFirst({where:{id,orgId}});if(!row)fail(404,'EXPENSE_SOURCE_NOT_FOUND');
  const actor=await tx.employee.findFirst({where:{id:actorId,orgId,status:'ACTIVE'},include:personInclude});
  const highestOrder=await highestDeletionGrade(tx,orgId,row.gradeSetId);
  if(!canApproveExpenseDeletion(actor,row,highestOrder))fail(403,'EXPENSE_DELETE_APPROVER_REQUIRED');
  if(row.status!=='PENDING'){if(row.status===body.decision&&row.decidedByEmployeeId===actorId&&row.decisionReason===(reason||null))return row;fail(409,'EXPENSE_APPROVAL_ALREADY_DECIDED');}
  const source=await deletionSource(tx,orgId,row.requestId,row.version);
  const final=await tx.employee.findFirst({where:{id:row.finalEmployeeId,orgId},include:personInclude});
  if(final?.gradeId!==row.finalGradeId||final.grade?.setId!==row.gradeSetId||!canApproveExpenseDeletion(actor,{...row,finalGradeOrder:Math.max(row.finalGradeOrder,final.grade.sortOrder)},highestOrder))fail(409,'EXPENSE_REQUEST_CHANGED');
  const result=await tx.expenseDeletionRequest.update({where:{id},data:{status:body.decision,decidedByEmployeeId:actorId,decisionReason:reason||null,decidedAt:new Date()}});
  if(body.decision==='APPROVED'){
   const before=JSON.parse(JSON.stringify(source));
   const key=`EXPENSE_REQUEST_EDIT:${orgId}:DELETE_${id}`,company=await tx.organization.findUnique({where:{id:orgId},select:{type:true,country:true}});
   await tx.$queryRaw`SELECT set_config('baro.expense_editor_org',${String(orgId)},true),set_config('baro.expense_editor_actor',${String(actorId)},true),set_config('baro.expense_editor_key',${key},true),set_config('baro.expense_editor_timezone',${companyBusinessTimeZone(company)},true)`;
   const audit=await tx.expenseRequestAudit.findFirst({where:{orgId,requestId:row.requestId,version:row.version}});
   const document=await tx.expenseRequest.update({where:{id:row.requestId},data:{deletedAt:new Date(),deletedByEmployeeId:actorId,deletionRequestId:id,version:{increment:1},updatedAt:new Date(),updatedByEmployeeId:actorId}});
   await tx.expenseRequestAudit.create({data:{orgId,requestId:row.requestId,version:document.version,actorId,action:'UPDATE',clientKey:key,inputHash:id,beforeSnapshot:before,afterSnapshot:JSON.parse(JSON.stringify({...source,document:{...source.document,...document},approvalPolicy:audit?.afterSnapshot?.approvalPolicy,deletion:{id,reason:row.reason,requestedByEmployeeId:row.requestedByEmployeeId,approvedByEmployeeId:actorId,highestAuthority:actor.grade.sortOrder===highestOrder}}))}});
  }
  return result;
 });
}
export async function listExpenseDeletions(db:any,orgId:number,actorId:number){
 const actor=await db.employee.findFirst({where:{id:actorId,orgId,status:'ACTIVE'},include:personInclude});
 if(!actor)fail(403,'ACTIVE_EMPLOYEE_REQUIRED');
 const live=await db.$queryRawUnsafe(`SELECT d.id FROM "ExpenseDeletionRequest" d WHERE d."orgId"=$1 AND d.status='PENDING' AND baro_expense_deletion_allowed(d."requestId",d."orgId",d.version)`,orgId);
 const admins=await db.employee.findMany({where:{orgId,status:'ACTIVE',orgRole:'ADMIN'},include:personInclude});
 const rows=await db.expenseDeletionRequest.findMany({where:{id:{in:live.map((r:any)=>r.id)},orgId,status:'PENDING',request:{deletedAt:null}},include:{request:{select:{version:true,managementNumber:true}},requestedBy:{select:{name:true}}},orderBy:{createdAt:'asc'}});
 const highestBySet=new Map(await Promise.all([...new Set(rows.map((row:any)=>row.gradeSetId))].map(async(setId:any)=>[setId,await highestDeletionGrade(db,orgId,setId)] as const)));
 return rows.filter((row:any)=>row.version===row.request.version&&(row.requestedByEmployeeId===actorId||canApproveExpenseDeletion(actor,row,highestBySet.get(row.gradeSetId)))).map((row:any)=>({id:row.id,requestId:row.requestId,kind:'EXPENSE_DELETION',managementNumber:row.request.managementNumber||`EXP-${row.requestId}`,requestDate:row.createdAt.toISOString().slice(0,10),drafter:row.requestedBy.name,status:'REQUESTED',reason:row.reason,canDecide:!!canApproveExpenseDeletion(actor,row,highestBySet.get(row.gradeSetId)),blockedReason:actor.id===row.requestedByEmployeeId?'SELF_REQUEST':'HIGHER_ADMIN_REQUIRED',eligibleApprovers:admins.filter((person:any)=>canApproveExpenseDeletion(person,row,highestBySet.get(row.gradeSetId))).map((person:any)=>({id:person.id,name:person.name}))}));
}
export async function attachExpenseDeletionAvailability(db:any,orgId:number,requests:any[],actor:any){
 const itemIds=requests.flatMap(row=>row.items.map((item:any)=>item.id));
 const allocations=itemIds.length?await db.bankLedgerEvidenceAllocation.findMany({where:{orgId,expenseItemId:{in:itemIds},entry:{voidedAt:null}},select:{expenseItemId:true}}):[];
 const linked=new Set(allocations.map((row:any)=>row.expenseItemId));
 const pending=requests.length?await db.changeApprovalRequest.findMany({where:{orgId,menu:'EXPENSE',status:'PENDING',expenseRequestId:{in:requests.map(row=>row.id)}},select:{expenseRequestId:true,operation:true}}):[];
 return requests.map(row=>{
  const bankReconciled=row.items.some((item:any)=>linked.has(item.id));
  const participant=actor&&(actor.orgRole==='ADMIN'||row.createdByEmployeeId===actor.id||row.approvalSteps.some((step:any)=>step.employeeId===actor.id));
  const changePending=pending.find((request:any)=>request.expenseRequestId===row.id);
  return {...row,bankReconciled,changePending:!!changePending,deletionPending:changePending?.operation==='DELETE'||!bankReconciled&&row.deletionRequests.some((d:any)=>d.version===row.version),canRequestDeletion:!row.deletedAt&&!bankReconciled&&!changePending&&!!participant};
 });
}
export function registerExpenseDeletionRoutes(app:any,db:any,gates:any){
 const access=async(req:any,res:any)=>{const ctx=await gates.requireOrgRole(req,res,{allowedRoles:['ADMIN','ACCOUNTANT','OPERATOR'],allowSystemAdmin:false});if(!ctx)return null;const actorId=gates.actorId();if(!actorId)fail(403,'ACTIVE_EMPLOYEE_REQUIRED');return {orgId:ctx.organization.id,actorId};};
 app.post('/expense-requests/:requestId/deletion-requests',async(req:any,res:any)=>{const ctx=await access(req,res);if(ctx)res.status(409).json({error:'CHANGE_APPROVAL_REQUIRED'});});
 app.get('/expense-deletion-requests',async(req:any,res:any)=>{const scope=await access(req,res);if(scope)res.json(await listExpenseDeletions(db,scope.orgId,scope.actorId));});
 app.post('/expense-deletion-requests/:id/decision',async(req:any,res:any)=>{const scope=await access(req,res);if(scope)res.json(await decideExpenseDeletion(db,scope.orgId,scope.actorId,req.params.id,req.body));});
}
