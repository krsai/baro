// Existing approval slots remain immutable; a decision records its actual signer.
export async function approvalDelegate(db:any,orgId:number,drafterId:number,originalId:number,actorId:number){
 if(originalId===actorId||drafterId===actorId)return false;
 const result=await db.$queryRawUnsafe('SELECT baro_approval_delegate_allowed($1::integer,$2::integer,$3::integer,$4::integer) AS allowed',orgId,drafterId,originalId,actorId);
 return result[0]?.allowed===true;
}
export const delegationData=(originalId:number,actorId:number)=>originalId===actorId?{}:{actingEmployeeId:actorId,delegation:{reason:'APPROVER_VACANCY',originalEmployeeId:originalId,actingEmployeeId:actorId}};

export async function delegatedChangeIds(db:any,orgId:number,actorId:number){
 const rows=await db.$queryRawUnsafe(`SELECT c.id FROM "ChangeApprovalRequest" c WHERE c."orgId"=$1 AND ((c.status='PENDING' AND NOT(c.menu='EXPENSE' AND c.operation='DELETE') AND EXISTS(SELECT 1 FROM jsonb_array_elements(c.policy->'resolvedStages') s WHERE baro_approval_delegate_allowed(c."orgId",c."requestedByEmployeeId",(s->>'employeeId')::integer,$2::integer))) OR EXISTS(SELECT 1 FROM "ChangeApprovalDecision" d WHERE d."requestId"=c.id AND d."orgId"=c."orgId" AND d."actingEmployeeId"=$2))`,orgId,actorId);
 return rows.map((row:any)=>row.id);
}
export async function delegatedExpenseIds(db:any,orgId:number,actorId:number){
 const rows=await db.$queryRawUnsafe(`SELECT DISTINCT r.id FROM "ExpenseRequest" r JOIN "ExpenseRequestApprovalStep" s ON s."requestId"=r.id AND s."orgId"=r."orgId" WHERE r."orgId"=$1 AND r."deletedAt" IS NULL AND NOT EXISTS(SELECT 1 FROM "ExpenseApprovalDecision" d WHERE d."requestId"=r.id AND d.version=r.version AND (d.decision='REJECTED' OR d.position=s.position)) AND baro_approval_delegate_allowed(r."orgId",r."createdByEmployeeId",s."employeeId",$2::integer)`,orgId,actorId);
 return rows.map((row:any)=>row.id);
}
