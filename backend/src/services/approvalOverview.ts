import {createHttpError} from '../utils/http';
import {retryEditTransaction} from '../utils/editRevision';
import {ledgerDate} from './bankLedger';
import {accountReportToday} from './accountOverview';
import {legacyExpenseNumber} from './documentNumber';
import {companyBusinessTimeZone} from './serviceCompany';
export async function listApprovalOverview(db:any,orgId:number,actorId:number,query:any,options:{unpaged?:boolean,submissionDates?:boolean,allDates?:boolean}={}){
 const today=accountReportToday(),start=ledgerDate(options.allDates?'0001-01-01':query.start||today.slice(0,7)+'-01'),end=ledgerDate(options.allDates?'9999-12-31':query.end||today),status=String(query.status||'UNAPPROVED'),page=Number(query.page||0),pageSize=Number(query.pageSize||20);
 if(start>end||!options.allDates&&end>today||!['UNAPPROVED','ALL','REQUESTED','IN_REVIEW','APPROVED','REJECTED','UNKNOWN'].includes(status)||!Number.isSafeInteger(page)||page<0||page>100000||![10,20,50].includes(pageSize))throw createHttpError(400,'INVALID_APPROVAL_VIEW');
 return retryEditTransaction(db,async(tx:any)=>{
  const actor=await tx.employee.findFirst({where:{id:actorId,orgId,status:'ACTIVE',orgRole:{in:['ADMIN','ACCOUNTANT','OPERATOR']}}});
  if(!actor)throw createHttpError(403,'LEDGER_ACCESS_DENIED');
  const zone=options.submissionDates?companyBusinessTimeZone(await tx.organization.findUnique({where:{id:orgId},select:{type:true,country:true}})):null;
  const dateField=zone?`to_char(timezone($6,timezone('UTC',r."createdAt")),'YYYY-MM-DD')`:'r."requestDate"';
  const customOperator=actor.orgRole==='OPERATOR'?` AND EXISTS(SELECT 1 FROM "ExpenseRequestAudit" a WHERE a."requestId"=r.id AND a."orgId"=r."orgId" AND a.version=r.version AND a."afterSnapshot"->'approvalPolicy'->'config'->>'version'='2' AND a."afterSnapshot"->'approvalPolicy'->'config'->>'kind'='EXPENSE' AND a."afterSnapshot"->'approvalPolicy'->'resolvedStages' @> jsonb_build_array(jsonb_build_object('employeeId',$4::integer,'role','OPERATOR')))` : '';
  const assigned=`EXISTS(SELECT 1 FROM "ExpenseRequestApprovalStep" own WHERE own."requestId"=r.id AND own."orgId"=r."orgId" AND ((own."employeeId"=$4${customOperator}) OR (NOT EXISTS(SELECT 1 FROM "ExpenseApprovalDecision" d WHERE d."requestId"=r.id AND d.version=r.version AND (d.position=own.position OR d.decision='REJECTED')) AND baro_approval_delegate_allowed(r."orgId",r."createdByEmployeeId",own."employeeId",$4::integer))))`;
  const cte=`WITH scoped AS (SELECT r.id,${dateField} AS "requestDate",CASE
   WHEN EXISTS(SELECT 1 FROM "ExpenseApprovalDecision" d WHERE d."orgId"=r."orgId" AND d."requestId"=r.id AND d.version=r.version AND d.decision='REJECTED') THEN 'REJECTED'
   WHEN NOT EXISTS(SELECT 1 FROM "ExpenseRequestApprovalStep" s WHERE s."requestId"=r.id) THEN CASE WHEN baro_expense_approval_exempt(r.id,r."orgId",r.version) THEN 'APPROVED' ELSE 'UNKNOWN' END
   WHEN NOT EXISTS(SELECT 1 FROM "ExpenseRequestApprovalStep" s WHERE s."requestId"=r.id AND NOT EXISTS(SELECT 1 FROM "ExpenseApprovalDecision" d WHERE d."requestId"=r.id AND d.version=r.version AND d.position=s.position AND d."employeeId"=s."employeeId" AND d.decision='APPROVED')) THEN 'APPROVED'
   WHEN EXISTS(SELECT 1 FROM "ExpenseApprovalDecision" d JOIN "ExpenseRequestApprovalStep" s ON s."requestId"=d."requestId" AND s.position=d.position AND s."employeeId"=d."employeeId" WHERE d."requestId"=r.id AND d.version=r.version AND d.decision='APPROVED') THEN 'IN_REVIEW' ELSE 'REQUESTED' END AS status
   FROM "ExpenseRequest" r WHERE r."orgId"=$1 AND r."deletedAt" IS NULL AND ${dateField}>=$2 AND ${dateField}<=$3 AND (r."createdByEmployeeId"=$4 OR ${assigned} OR EXISTS(SELECT 1 FROM "ExpenseApprovalDecision" d WHERE d."requestId"=r.id AND d."orgId"=r."orgId" AND d.version=r.version AND d."actingEmployeeId"=$4)))
   SELECT * FROM scoped WHERE ($5='ALL' OR status=$5 OR $5='UNAPPROVED' AND status IN ('REQUESTED','IN_REVIEW','UNKNOWN'))`;
  const args:any[]=[orgId,start,end,actorId,status];if(zone)args.push(zone);
  const count=await tx.$queryRawUnsafe(`SELECT count(*)::integer AS total FROM (${cte}) filtered`,...args);
  const ids=await tx.$queryRawUnsafe(cte+' ORDER BY "requestDate" DESC,id DESC'+(options.unpaged?'':` LIMIT $${args.length+1} OFFSET $${args.length+2}`),...args,...(options.unpaged?[]:[pageSize,page*pageSize]));
  const requests=ids.length?await tx.expenseRequest.findMany({where:{orgId,id:{in:ids.map((r:any)=>r.id)}},select:{id:true,managementNumber:true,requestDate:true,createdByEmployee:{select:{name:true}}}}):[];
  return {rows:ids.map((r:any)=>{const request=requests.find((item:any)=>item.id===r.id);if(!request)throw createHttpError(409,'EXPENSE_REQUEST_CHANGED');return {id:r.id,kind:'EXPENSE_REQUEST',managementNumber:request.managementNumber||legacyExpenseNumber(r.id),requestDate:options.submissionDates?r.requestDate:request.requestDate,drafter:request.createdByEmployee?.name||'',status:r.status};}),total:count[0].total,page,pageSize,start,end,status};
 });
}
