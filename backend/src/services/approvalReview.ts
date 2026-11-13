import {approvalDelegate,delegatedChangeIds} from './approvalDelegation';
import {calculateRequestAmounts} from './transactionRequest';
import {Prisma} from '@prisma/client';
import {createHttpError} from '../utils/http';
import {listApprovalOverview} from './approvalOverview';
import {approvalState} from './bankEvidence';
import {loadExpenseEditorSource} from './expenseRequestEditor';
import {canApproveExpenseDeletion,isHighestCompanyApprover} from './expenseDeletion';
import {companyBusinessTimeZone} from './serviceCompany';

const fail=(code:string,status=403):never=>{throw createHttpError(status,code);};
const personSelect={id:true,name:true,orgRole:true,gradeId:true,grade:{select:{name:true,nameKo:true,nameEn:true,nameVi:true}}};
const day=(value:any,zone:string)=>new Intl.DateTimeFormat('en-CA',{timeZone:zone,year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date(value));
async function actor(db:any,orgId:number,actorId:number){const value=await db.employee.findFirst({where:{id:actorId,orgId,status:'ACTIVE',orgRole:{in:['ADMIN','ACCOUNTANT','OPERATOR']}},include:{grade:{include:{set:true}}}});if(!value)fail('ACTIVE_EMPLOYEE_REQUIRED');return value;}
export async function listApprovalReviews(db:any,orgId:number,actorId:number,query:any){
 await actor(db,orgId,actorId);
 const base=await listApprovalOverview(db,orgId,actorId,query,{unpaged:true,submissionDates:true,allDates:query.start==null&&query.end==null});
 const zone=companyBusinessTimeZone(await db.organization.findUnique({where:{id:orgId},select:{type:true,country:true}}));
 // Return list metadata only. Source snapshots are loaded after opening a row.
 const changes=await db.$queryRawUnsafe(`SELECT c.id,'CHANGE_APPROVAL' AS kind,c.menu,c.operation,
 COALESCE(c."beforeSnapshot"->'invoice'->>'invoiceNumber',c."beforeSnapshot"->'document'->>'managementNumber',c."beforeSnapshot"->'entry'->>'managementNumber',c."beforeSnapshot"->'entry'->>'evidenceNumber',c."sourceId") AS "managementNumber",
 COALESCE(c."beforeSnapshot"->'entry'->>'transactionDate',c."beforeSnapshot"->'document'->>'requestDate') AS "transactionDate",
 COALESCE(c."beforeSnapshot"->'entry'->>'counterpartyName',c."beforeSnapshot"->'document'->'partner'->>'name',c."beforeSnapshot"->'document'->'payeeEmployee'->>'name') AS "targetName",
 c.reason AS "changeReason",
 CASE WHEN c.menu='BANK_LEDGER' AND c.operation='UPDATE' THEN
 ARRAY(SELECT field FROM (VALUES ('transactionDate'),('accountingCodeId'),('amount'),('subtotal'),('vatRate'),('vatAmount'),('purpose'),('remark'),('evidenceNumber'),('direction'),('accountId')) AS fields(field)
 WHERE (c."beforeSnapshot"->'entry'->>field) IS DISTINCT FROM
 ((SELECT proposed FROM jsonb_array_elements(COALESCE(c.payload->'rows','[]'::jsonb)) proposed WHERE proposed->>'entryKind'='BANK' LIMIT 1)->>field)) ELSE ARRAY[]::text[] END AS "changedFields",
 c."createdAt",p.name AS drafter,CASE WHEN c.status='PENDING' THEN CASE WHEN EXISTS(SELECT 1 FROM "ChangeApprovalDecision" d WHERE d."requestId"=c.id AND d.decision='APPROVED') THEN 'IN_REVIEW' ELSE 'REQUESTED' END ELSE c.status END AS status
 FROM "ChangeApprovalRequest" c JOIN "Employee" p ON p.id=c."requestedByEmployeeId" AND p."orgId"=c."orgId"
 WHERE c."orgId"=$1 AND (EXISTS(SELECT 1 FROM "ChangeApprovalDecision" d WHERE d."requestId"=c.id AND d."orgId"=c."orgId" AND d."actingEmployeeId"=$2) OR c."requestedByEmployeeId"=$2 OR c.policy->'resolvedStages' @> jsonb_build_array(jsonb_build_object('employeeId',$2::integer)) OR (c.status='PENDING' AND NOT(c.menu='EXPENSE' AND c.operation='DELETE') AND EXISTS(SELECT 1 FROM jsonb_array_elements(c.policy->'resolvedStages') s WHERE baro_approval_delegate_allowed(c."orgId",c."requestedByEmployeeId",(s->>'employeeId')::integer,$2::integer))))`,orgId,actorId);
 const legacy=await db.$queryRawUnsafe(`SELECT d.id,'EXPENSE_DELETION' AS kind,'EXPENSE' AS menu,'DELETE' AS operation,COALESCE(r."managementNumber",'EXP-'||r.id::text) AS "managementNumber",d."createdAt",p.name AS drafter,CASE WHEN d.status='PENDING' THEN 'REQUESTED' ELSE d.status END AS status
 FROM "ExpenseDeletionRequest" d JOIN "ExpenseRequest" r ON r.id=d."requestId" AND r."orgId"=d."orgId" JOIN "Employee" p ON p.id=d."requestedByEmployeeId" AND p."orgId"=d."orgId"
 JOIN "Employee" a ON a.id=$2 AND a."orgId"=d."orgId" LEFT JOIN "EmployeeGrade" g ON g.id=a."gradeId" AND g."orgId"=a."orgId" LEFT JOIN "EmployeeGradeSet" s ON s.id=g."setId"
 WHERE d."orgId"=$1 AND (d.status<>'PENDING' OR baro_expense_deletion_allowed(d."requestId",d."orgId",d.version)) AND (d."requestedByEmployeeId"=$2 OR (a."orgRole"='ADMIN' AND g."isActive" AND s."isActive" AND g."setId"=d."gradeSetId" AND ((a.id<>d."requestedByEmployeeId" AND g."sortOrder">d."finalGradeOrder") OR (g."sortOrder">=d."finalGradeOrder" AND baro_highest_company_approver(a.id,a."orgId",g."setId")))))`,orgId,actorId);
 const matches=(row:any)=>base.status==='ALL'||row.status===base.status||base.status==='UNAPPROVED'&&['REQUESTED','IN_REVIEW','UNKNOWN'].includes(row.status);
 const extras=[...changes,...legacy].map((row:any)=>({...row,requestDate:day(row.createdAt,zone)})).filter(row=>row.requestDate>=base.start&&row.requestDate<=base.end&&matches(row));
 const rows=[...base.rows.map((row:any)=>({...row,menu:'EXPENSE',operation:'CREATE'})),...extras].sort((a:any,b:any)=>b.requestDate.localeCompare(a.requestDate)||String(a.kind+':'+a.id).localeCompare(String(b.kind+':'+b.id)));
 return {...base,rows:rows.slice(base.page*base.pageSize,(base.page+1)*base.pageSize),total:rows.length};
}
async function people(db:any,orgId:number,ids:number[]){return db.employee.findMany({where:{orgId,id:{in:ids}},select:personSelect});}
function line(stages:any[],decisions:any[],names:any[],status:string){
 const stopped=status==='REJECTED';let waiting=false;
 return stages.map((s:any,index:number)=>{const decision=decisions.find((d:any)=>d.position===index+1&&d.employeeId===s.employeeId);const state=decision?.decision||(stopped?'STOPPED':waiting?'WAITING':'REQUESTED');if(!decision)waiting=true;return {...s,person:names.find(p=>p.id===(decision?.actingEmployeeId||s.employeeId)),originalPerson:names.find(p=>p.id===s.employeeId),delegation:decision?.delegation,state,reason:decision?.reason,decidedAt:decision?.createdAt};});
}
function expenseTotals(source:any){
 if(!source?.document)return source;
 const totals=new Map<string,any>();
 for(const item of source.costs||source.document.items||[]){const currency=item.currency||source.document.currency;if(!currency)continue;const total=totals.get(currency)||{currency,subtotal:new Prisma.Decimal(0),vatAmount:new Prisma.Decimal(0),amount:new Prisma.Decimal(0)};for(const field of ['subtotal','vatAmount','amount'])total[field]=total[field].add(item[field]||0);totals.set(currency,total);}
 return {...source,document:{...source.document,currencyTotals:[...totals.values()].map(total=>Object.fromEntries(Object.entries(total).map(([key,value]:any)=>[key,key==='currency'?value:value.toFixed(4)])))}};
}
export async function approvalReviewDetail(db:any,orgId:number,actorId:number,kind:string,id:string){
 const a=await actor(db,orgId,actorId);
 if(kind==='CHANGE_APPROVAL'){
  const delegatedIds=await delegatedChangeIds(db,orgId,actorId);
  const row=await db.changeApprovalRequest.findFirst({where:{id,orgId,OR:[{id:{in:delegatedIds}},{requestedByEmployeeId:actorId},{policy:{path:['resolvedStages'],array_contains:[{employeeId:actorId}]}}]}});if(!row)fail('CHANGE_NOT_FOUND',404);
  const stages=row.policy.resolvedStages||[],decisions=await db.changeApprovalDecision.findMany({where:{orgId,requestId:id},orderBy:{position:'asc'}}),names=await people(db,orgId,[row.requestedByEmployeeId,...stages.map((s:any)=>s.employeeId),...decisions.map((d:any)=>d.actingEmployeeId).filter(Boolean),actorId]);
  const next=stages[decisions.length],self=row.requestedByEmployeeId===actorId;
  const delegated=!!next&&delegatedIds.includes(row.id)&&await approvalDelegate(db,orgId,row.requestedByEmployeeId,next.employeeId,actorId);
  const canDecide=row.status==='PENDING'&&(delegated||next?.employeeId===actorId&&next.role===a.orgRole&&(next.gradeId==null||next.gradeId===a.gradeId&&a.grade?.isActive&&a.grade.set?.isActive))&&(!self||row.menu==='EXPENSE'&&row.operation==='DELETE'&&row.policy.highestSelfDeletion===true&&await isHighestCompanyApprover(db,orgId,a));
  let after:any=row.payload;
  let before:any=row.beforeSnapshot;
  if(row.menu==='BANK_LEDGER'){
   const ids=[...new Set<number>([before.entry?.accountingCodeId,...(after?.rows||[]).map((item:any)=>item.accountingCodeId)].filter((id:any)=>Number.isSafeInteger(id)&&id>0))];
   const codes=ids.length?await db.transactionCode.findMany({where:{ownerOrgId:orgId,id:{in:ids}},include:{base:true}}):[];
   if(before.entry)before={...before,entry:{...before.entry,accountingCode:before.entry.accountingCode||codes.find((code:any)=>code.id===before.entry.accountingCodeId)||null}};
   if(after.rows)after={...after,rows:after.rows.map((item:any)=>({...item,accountingCode:codes.find((code:any)=>code.id===item.accountingCodeId)||null}))};
  }
  if(row.menu==='EXPENSE'&&row.operation==='UPDATE'){
   const codes=await db.transactionCode.findMany({where:{ownerOrgId:orgId,id:{in:row.payload.items.map((i:any)=>i.transactionCodeId)}},include:{base:true}});
   after={document:{...row.beforeSnapshot.document,...row.payload,partner:row.payload.payeeEmployeeId?null:row.beforeSnapshot.proposedPayee,payeeEmployee:row.payload.payeeEmployeeId?row.beforeSnapshot.proposedPayee:null},costs:row.payload.items.map((item:any)=>{const {subtotal,vatAmount,amount}=calculateRequestAmounts(String(item.unitPrice),String(item.quantity),item.currency,item.vatRate||'0');return {...item,transactionCode:codes.find((c:any)=>c.id===item.transactionCodeId),subtotal:subtotal.toFixed(4),vatAmount:vatAmount.toFixed(4),amount:amount.toFixed(4)};})};
  }
  return {...row,before:row.menu==='EXPENSE'?expenseTotals(before):before,after:row.menu==='EXPENSE'?expenseTotals(after):after,canDecide,drafter:names.find((p:any)=>p.id===row.requestedByEmployeeId),approvalLine:line(stages,decisions,names,row.status).map((s:any,index:number)=>delegated&&index===decisions.length?{...s,originalPerson:s.person,person:names.find((p:any)=>p.id===actorId),delegation:{reason:'APPROVER_VACANCY'}}:s)};
 }
 if(kind==='EXPENSE_DELETION'){
  const row=await db.expenseDeletionRequest.findFirst({where:{id,orgId}});if(!row)fail('EXPENSE_SOURCE_NOT_FOUND',404);
  const highest=await db.employeeGrade.findFirst({where:{orgId,setId:row.gradeSetId,isActive:true,set:{isActive:true}},orderBy:{sortOrder:'desc'},select:{sortOrder:true}});
  const allowed=canApproveExpenseDeletion(a,row,highest?.sortOrder);if(row.requestedByEmployeeId!==actorId&&!allowed)fail('EXPENSE_DELETE_APPROVER_REQUIRED');
  const admins=await db.employee.findMany({where:{orgId,status:'ACTIVE',orgRole:'ADMIN'},include:{grade:{include:{set:true}}}}),eligible=admins.filter((p:any)=>canApproveExpenseDeletion(p,row,highest?.sortOrder));
  const live=(await db.$queryRawUnsafe('SELECT baro_expense_deletion_allowed($1::integer,$2::integer,$3::integer) AS allowed',row.requestId,orgId,row.version))[0]?.allowed;
  const names=await people(db,orgId,[row.requestedByEmployeeId,...eligible.map((p:any)=>p.id),...(row.decidedByEmployeeId?[row.decidedByEmployeeId]:[])]);
  return {id:row.id,menu:'EXPENSE',operation:'DELETE',reason:row.reason,status:row.status,version:row.version,before:expenseTotals(row.documentSnapshot),canDecide:row.status==='PENDING'&&allowed&&live,drafter:names.find((p:any)=>p.id===row.requestedByEmployeeId),approvalLine:[{state:row.status==='PENDING'?'REQUESTED':row.status,person:names.find((p:any)=>p.id===row.decidedByEmployeeId),candidates:names.filter((p:any)=>eligible.some((e:any)=>e.id===p.id)),reason:row.decisionReason,decidedAt:row.decidedAt}]};
 }
 if(kind!=='EXPENSE_REQUEST'||!/^\d+$/.test(id))fail('INVALID_APPROVAL_VIEW',400);
 const source=await loadExpenseEditorSource(db,orgId,'request',id),doc=source.document;
 const acted=await db.expenseApprovalDecision.findFirst({where:{orgId,requestId:doc.id,version:doc.version,actingEmployeeId:actorId}});
 if(doc.createdByEmployeeId!==actorId){
  if(!doc.approvalSteps.some((s:any)=>s.employeeId===actorId)&&!(await approvalState(db,orgId,doc.id,actorId)).canApprove&&!acted)fail('EXPENSE_DELETE_NOT_PARTICIPANT');
  if(a.orgRole==='OPERATOR'&&!acted&&!(await approvalState(db,orgId,doc.id,actorId)).delegated){const policy=(await db.expenseRequestAudit.findFirst({where:{orgId,requestId:doc.id,version:doc.version},orderBy:{id:'desc'}}))?.afterSnapshot?.approvalPolicy;if(policy?.config?.version!==2||!policy.resolvedStages?.some((s:any)=>s.employeeId===actorId&&s.role==='OPERATOR'&&s.gradeId===a.gradeId))fail('EXPENSE_DELETE_NOT_PARTICIPANT');}
 }
 const state=await approvalState(db,orgId,doc.id,actorId),names=await people(db,orgId,[doc.createdByEmployeeId,...doc.approvalSteps.map((s:any)=>s.employeeId),...state.steps.map((s:any)=>s.actingEmployeeId).filter(Boolean),actorId]);
 return {id:doc.id,menu:'EXPENSE',operation:'CREATE',status:state.status,version:doc.version,before:expenseTotals(source),reason:doc.remark||'',canDecide:state.canApprove,drafter:names.find((p:any)=>p.id===doc.createdByEmployeeId),exempt:state.exempt,approvalLine:state.steps.map((s:any)=>({...s,person:names.find((p:any)=>p.id===(s.actingEmployeeId||state.delegated&&state.steps.find((r:any)=>!r.approved)?.id===s.id&&actorId||s.employeeId)),originalPerson:names.find((p:any)=>p.id===s.employeeId),delegation:s.delegation||(state.delegated&&state.steps.find((r:any)=>!r.approved)?.id===s.id?{reason:'APPROVER_VACANCY'}:null),state:s.rejected?'REJECTED':s.approved?'APPROVED':s.blocked?'STOPPED':state.steps.find((r:any)=>!r.approved)?.id===s.id?'REQUESTED':'WAITING',reason:s.reason}))};
}
export function registerApprovalReviewRoutes(app:any,db:any,gates:any){
 const access=async(req:any,res:any)=>{const ctx=await gates.requireOrgRole(req,res,{allowedRoles:['ADMIN','ACCOUNTANT','OPERATOR'],allowSystemAdmin:false});if(!ctx)return null;const actorId=gates.actorId();if(!actorId)fail('ACTIVE_EMPLOYEE_REQUIRED');return {orgId:ctx.organization.id,actorId,ctx};};
 app.get('/approval-reviews',async(req:any,res:any)=>{const scope=await access(req,res);if(scope)res.json(await listApprovalReviews(db,scope.orgId,scope.actorId,req.query));});
 app.get('/approval-reviews/:kind/:id',async(req:any,res:any)=>{const scope=await access(req,res);if(scope){const result=await approvalReviewDetail(db,scope.orgId,scope.actorId,req.params.kind,req.params.id);if(result.menu==='INVOICE'&&!await gates.canAccess?.({orgType:scope.ctx.organization.type,orgRole:scope.ctx.employee?.orgRole,feature:'INVOICE'}))fail('INVOICE_ACCESS_DENIED');res.json(result);}});
}
