import {createHttpError} from '../utils/http';
import {retryEditTransaction} from '../utils/editRevision';
import {ledgerDate} from './bankLedger';
import {accountReportToday} from './accountOverview';
import {legacyExpenseNumber} from './documentNumber';
export async function listApprovalOverview(db:any,orgId:number,actorId:number,query:any){
 const today=accountReportToday(),start=ledgerDate(query.start||today.slice(0,7)+'-01'),end=ledgerDate(query.end||today),status=String(query.status||'UNAPPROVED'),page=Number(query.page||0),pageSize=Number(query.pageSize||20);
 if(start>end||end>today||!['UNAPPROVED','ALL','REQUESTED','IN_REVIEW','APPROVED','REJECTED','UNKNOWN'].includes(status)||!Number.isSafeInteger(page)||page<0||page>100000||![10,20,50].includes(pageSize))throw createHttpError(400,'INVALID_APPROVAL_VIEW');
 return retryEditTransaction(db,async(tx:any)=>{
  const actor=await tx.employee.findFirst({where:{id:actorId,orgId,status:'ACTIVE',orgRole:{in:['ADMIN','ACCOUNTANT','OPERATOR']}}});
  if(!actor)throw createHttpError(403,'LEDGER_ACCESS_DENIED');
  const assigned=actor.orgRole==='OPERATOR'?'FALSE':'EXISTS(SELECT 1 FROM "ExpenseRequestApprovalStep" own WHERE own."requestId"=r.id AND own."orgId"=r."orgId" AND own."employeeId"=$4)';
  const cte=`WITH scoped AS (SELECT r.id,r."requestDate",CASE
   WHEN EXISTS(SELECT 1 FROM "ExpenseApprovalDecision" d WHERE d."orgId"=r."orgId" AND d."requestId"=r.id AND d.version=r.version AND d.decision='REJECTED') THEN 'REJECTED'
   WHEN NOT EXISTS(SELECT 1 FROM "ExpenseRequestApprovalStep" s WHERE s."requestId"=r.id) THEN CASE WHEN baro_expense_approval_exempt(r.id,r."orgId",r.version) THEN 'APPROVED' ELSE 'UNKNOWN' END
   WHEN NOT EXISTS(SELECT 1 FROM "ExpenseRequestApprovalStep" s WHERE s."requestId"=r.id AND NOT EXISTS(SELECT 1 FROM "ExpenseApprovalDecision" d WHERE d."requestId"=r.id AND d.version=r.version AND d.position=s.position AND d."employeeId"=s."employeeId" AND d.decision='APPROVED')) THEN 'APPROVED'
   WHEN EXISTS(SELECT 1 FROM "ExpenseApprovalDecision" d JOIN "ExpenseRequestApprovalStep" s ON s."requestId"=d."requestId" AND s.position=d.position AND s."employeeId"=d."employeeId" WHERE d."requestId"=r.id AND d.version=r.version AND d.decision='APPROVED') THEN 'IN_REVIEW' ELSE 'REQUESTED' END AS status
   FROM "ExpenseRequest" r WHERE r."orgId"=$1 AND r."requestDate">=$2 AND r."requestDate"<=$3 AND (r."createdByEmployeeId"=$4 OR ${assigned}))
   SELECT * FROM scoped WHERE ($5='ALL' OR status=$5 OR $5='UNAPPROVED' AND status IN ('REQUESTED','IN_REVIEW','UNKNOWN'))`;
  const args=[orgId,start,end,actorId,status];
  const count=await tx.$queryRawUnsafe(`SELECT count(*)::integer AS total FROM (${cte}) filtered`,...args);
  const ids=await tx.$queryRawUnsafe(cte+' ORDER BY "requestDate" DESC,id DESC LIMIT $6 OFFSET $7',...args,pageSize,page*pageSize);
  const requests=ids.length?await tx.expenseRequest.findMany({where:{orgId,id:{in:ids.map((r:any)=>r.id)}},select:{id:true,managementNumber:true,requestDate:true,createdByEmployee:{select:{name:true}}}}):[];
  return {rows:ids.map((r:any)=>{const request=requests.find((item:any)=>item.id===r.id);if(!request)throw createHttpError(409,'EXPENSE_REQUEST_CHANGED');return {id:r.id,kind:'EXPENSE_REQUEST',managementNumber:request.managementNumber||legacyExpenseNumber(r.id),requestDate:request.requestDate,drafter:request.createdByEmployee?.name||'',status:r.status};}),total:count[0].total,page,pageSize,start,end,status};
 });
}
