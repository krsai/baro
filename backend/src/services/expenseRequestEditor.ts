import { requirePayeeBankAccount } from './entityBankAccount';
import {expensePayeeIds,employeePayee,expenseApplicationDate} from './expensePayee';
import {allocateDocumentNumber,normalizeDocumentNumber,legacyExpenseNumber} from './documentNumber';
import { EXPENSE_APPROVAL_INCLUDE, EXPENSE_APPROVAL_ROLES, validateApprovalSettings, defaultApprovalSettings, replaceExpenseApprovers, resolveExpenseApproval, approvalSettingKey } from './expenseApproval';
import { createHash } from 'node:crypto';
import { env } from 'node:process';
import { createHttpError } from '../utils/http';
import { loadManagementPeriod, assertManagedDate } from '../factories/factoryManagementStart';
import { validateCostDate } from './partnerTransactionCost';
import { registerTransactionRequest, REQUEST_INCLUDE } from './transactionRequest';

const recordInclude = {
  workLog: true, style: { select: { id: true, name: true, code: true } }, styleProcess: true,
  outsourcingPartner: { select: { id: true, name: true } },
  createdByEmployee: { select: { id: true, name: true } },
  assignmentPlan: { select: { id: true, orgId: true, styleId: true, workOrderId: true, factoryId: true, isCompleted: true,
    ctReviewRequired: true, completedAt: true, productionCompletedAt: true, closedAt: true,
    workOrder: { select: { id: true, orderNumber: true, invoiceFinalLockedAt: true } } } },
};
const costInclude = { ...REQUEST_INCLUDE, workOrder: { select: { id: true, orderNumber: true, invoiceFinalLockedAt: true } }, outsourcedWorkRecord: { include: recordInclude } };
const documentInclude = { payeeEmployee:{select:{id:true,name:true,employeeNo:true,status:true}}, approvalSteps: EXPENSE_APPROVAL_INCLUDE, updatedByEmployee: { select: { id: true, name: true } }, partner: { select: { id: true, name: true } }, createdByEmployee: { select: { id: true, name: true } },
  items: { include: costInclude, orderBy: { expenseRequestLine: 'asc' } } };
const fail = (status: number, code: string): never => { throw createHttpError(status, code); };
const numericId = (id: string) => /^\d+$/.test(id) && Number.isSafeInteger(Number(id)) && Number(id)>0 ? Number(id) : fail(400,'INVALID_EXPENSE_SOURCE');
const snapshot = (value: any) => JSON.parse(JSON.stringify(value));
const hash = (value: any) => createHash('sha256').update(JSON.stringify(value)).digest('hex');

export async function loadExpenseEditorSource(db: any, orgId: number, kind: string, id: string): Promise<any> {
  if (kind === 'request') {
    const document = await db.expenseRequest.findFirst({ where: { id: numericId(id), orgId }, include: documentInclude });
    if (!document) return fail(404,'EXPENSE_SOURCE_NOT_FOUND');
    const reconciled=db.bankLedgerEvidenceAllocation&&await db.bankLedgerEvidenceAllocation.findFirst({where:{orgId,expenseItemId:{in:document.items.map((item:any)=>item.id)},entry:{voidedAt:null}}});
    document.bankReconciled=!!reconciled;
    return { kind, id: String(document.id), document, costs: document.items, record: null };
  }
  if (kind === 'cost') {
    if (!/^[\w-]{1,100}$/.test(id)) return fail(400,'INVALID_EXPENSE_SOURCE');
    const cost = await db.partnerTransactionCost.findFirst({ where: { id, orgId }, include: costInclude });
    if (!cost) return fail(404,'EXPENSE_SOURCE_NOT_FOUND');
    if (cost.expenseRequestId) return loadExpenseEditorSource(db,orgId,'request',String(cost.expenseRequestId));
    return { kind, id: cost.id, document: null, costs: [cost], record: null };
  }
  if (kind !== 'legacy') return fail(400,'INVALID_EXPENSE_SOURCE');
  const record = await db.outsourcedWorkRecord.findFirst({ where: { id: numericId(id), orgId }, include: recordInclude });
  if (!record) return fail(404,'EXPENSE_SOURCE_NOT_FOUND');
  const cost = await db.partnerTransactionCost.findFirst({ where: { orgId, outsourcedWorkRecordId: record.id } });
  if (cost) return loadExpenseEditorSource(db,orgId,'cost',cost.id);
  return { kind, id: String(record.id), document: null, costs: [], record };
}

export function expenseEditorRevision(source: any) {
  return hash(snapshot({ kind: source.kind, id: source.id, document: source.document && {
    id: source.document.id, version: source.document.version, remark: source.document.remark, requestDate: source.document.requestDate, partnerOrgId: source.document.partnerOrgId,payeeEmployeeId:source.document.payeeEmployeeId,
  }, costs: source.costs.map((cost: any) => ({...cost,partner:undefined,serviceType:undefined,transactionCode:undefined,workOrder:undefined,style:undefined,styleProcess:undefined,createdByEmployee:undefined})), record: source.record }));
}

function editorLine(cost: any, record: any) {
  const costProcesses=[...new Map([...(cost?.styleProcess?[cost.styleProcess]:[]),...(cost?.processLinks||[]).map((link:any)=>link.styleProcess)].filter(Boolean).map((process:any)=>[process.id,process])).values()];
  const refs = record && { order: record.assignmentPlan.workOrder,
    style: { ...record.style, styleProcesses: [record.styleProcess] },
    plan: { id: record.assignmentPlanId, styleId: record.styleId, processIds: [record.styleProcessId] } };
  return { inputSettings:cost?.linkPolicyAudit?.inputSettings??null,linkTarget:cost?.linkTarget ?? (record?'PROCESS':'NONE'),linkPolicyAuditId:cost?.linkPolicyAuditId ?? null,itemId: cost?.id || null, sourceRecordId: record?.id || null,
    transactionCodeId: cost?.transactionCodeId || '', currency: cost?.currency || 'VND',
    transactionCode:cost?.transactionCode || null, description: cost?.description || [record?.style?.name,record?.styleProcess?.processName].filter(Boolean).join(' · '),
    unitId:cost?.unitId??'',unit:cost?.unit??null,
    linkedOrderIds:cost?.referenceLinks?.length?[...new Set(cost.referenceLinks.map((row:any)=>row.workOrderId))]:(cost?.workOrderId?[cost.workOrderId]:record?.assignmentPlan?.workOrderId?[record.assignmentPlan.workOrderId]:[]),
    linkedStyles:cost?.referenceLinks?.length?cost.referenceLinks.filter((row:any)=>row.styleId).map((row:any)=>({workOrderId:row.workOrderId,styleId:row.styleId})):(cost?.styleId?[{workOrderId:cost.workOrderId,styleId:cost.styleId}]:record?[{workOrderId:record.assignmentPlan.workOrderId,styleId:record.styleId}]:[]),
    referenceLinks:cost?.referenceLinks||[],
    quantity: String(cost?.quantity ?? record?.quantity ?? 1), unitPrice: String(cost?.unitPrice ?? record?.outsourceUnitPrice ?? cost?.amount ?? ''),
    vatRate: String(cost?.vatRate ?? 0), details: cost?.details || {},
    workOrderId: cost?.workOrderId || record?.assignmentPlan?.workOrderId || '', styleId: cost?.styleId || record?.styleId || '',
    styleProcessIds: (cost?.processLinks || []).map((link:any)=>link.styleProcessId),
    styleProcessId: cost?.styleProcessId || record?.styleProcessId || '', assignmentPlanId: record?.assignmentPlanId || '',
    productionLinked: Boolean(record), productionLocked: Boolean(record?.assignmentPlan?.isCompleted), preservedReferences: refs || (cost ? {order:cost.workOrder,style:cost.style && {...cost.style,styleProcesses:costProcesses}} : null),
    enabled: { order: Boolean(cost?.workOrderId || record), style: Boolean(cost?.styleId || record), process: Boolean(cost?.styleProcessId || cost?.processLinks?.length || record) } };
}

export function expenseEditorForm(source: any) {
  const first = source.costs[0], record = source.record || first?.outsourcedWorkRecord;
  return { managementNumber:source.document?(source.document.managementNumber||legacyExpenseNumber(source.document.id)):'', approverEmployeeIds:(source.document?.approvalSteps || []).map((step:any)=>step.employeeId), approvalSteps:source.document?.approvalSteps || [], version: source.document?.version ?? null, updatedAt: source.document?.updatedAt ?? null, updatedByEmployee: source.document?.updatedByEmployee ?? null, remark: source.document?.remark || '',
    requestDate: source.document?.requestDate || first?.transactionDate || record?.workLog.displayDate,
    partnerOrgId: source.document?.partnerOrgId || first?.partnerOrgId || record?.outsourcingPartnerId || null,
    payeeEmployeeId:source.document?.payeeEmployeeId||first?.payeeEmployeeId||null,
    partner: employeePayee(source.document?.payeeEmployee||first?.payeeEmployee)||source.document?.partner || first?.partner || record?.outsourcingPartner,
    createdByEmployee: source.document?.createdByEmployee || first?.createdByEmployee || record?.createdByEmployee || null, revision: expenseEditorRevision(source),
    bankReconciled:!!source.document?.bankReconciled,
    readOnly: Boolean(source.document?.bankReconciled || record?.assignmentPlan?.workOrder?.invoiceFinalLockedAt || source.costs.some((cost: any)=>cost.workOrder?.invoiceFinalLockedAt || cost.outsourcedWorkRecord?.assignmentPlan?.workOrder?.invoiceFinalLockedAt)),
    items: source.record ? [editorLine(null,source.record)] : source.costs.map((cost: any)=>editorLine(cost,cost.outsourcedWorkRecord)),
    canonicalSource: { kind: source.kind, id: source.id } };
}

export async function saveExpenseEditor(tx: any, orgId: number, actorId: number, kind: string, id: string, body: any, appendQuantityRemark?: any) {
  if (!/^[\w-]{8,64}$/.test(body?.clientKey || '') || typeof body?.revision !== 'string') return fail(400,'INVALID_TRANSACTION_KEY');
  const key = `EXPENSE_REQUEST_EDIT:${orgId}:${body.clientKey}`;
  const inputHash = hash({kind,id,body});
  const previous = await tx.expenseRequestAudit.findUnique({ where: { orgId_clientKey: { orgId, clientKey:key } } });
  if (previous) {
    if (previous.actorId !== actorId || previous.inputHash !== inputHash) return fail(409,'EXPENSE_REQUEST_RETRY_MISMATCH');
    return { requestId: previous.requestId, assignmentPlanIds: [] };
  }
  let source = await loadExpenseEditorSource(tx,orgId,kind,id);
  const orders = [...new Set([...source.costs.flatMap((cost: any)=>[cost.workOrderId,cost.outsourcedWorkRecord?.assignmentPlan?.workOrderId,...(cost.referenceLinks||[]).map((link:any)=>link.workOrderId)]),source.record?.assignmentPlan?.workOrderId,
    ...(Array.isArray(body.items)?body.items.flatMap((item: any)=>[item?.workOrderId,...(Array.isArray(item?.linkedOrderIds)?item.linkedOrderIds:[])]):[])].filter((value: any)=>Number.isSafeInteger(value)&&value>0))].sort((a: any,b: any)=>a-b);
  for (const orderId of orders) await tx.$queryRawUnsafe('SELECT id FROM "WorkOrder" WHERE id=$1 AND "orgId"=$2 FOR UPDATE',orderId,orgId);
  if (orders.length && await tx.workOrder.findFirst({ where: { id: { in: orders }, orgId, invoiceFinalLockedAt: { not: null } }, select: { id: true } })) return fail(409,'ORDER_FINALLY_LOCKED');
  if (source.document) await tx.$queryRawUnsafe('SELECT id FROM "ExpenseRequest" WHERE id=$1 AND "orgId"=$2 FOR UPDATE',source.document.id,orgId);
  for (const cost of [...source.costs].sort((a,b)=>a.id.localeCompare(b.id))) await tx.$queryRawUnsafe('SELECT id FROM "PartnerTransactionCost" WHERE id=$1 AND "orgId"=$2 FOR UPDATE',cost.id,orgId);
  const records = [source.record,...source.costs.map((cost: any)=>cost.outsourcedWorkRecord)].filter(Boolean).sort((a,b)=>a.id-b.id);
  for (const record of records) await tx.$queryRawUnsafe('SELECT id FROM "OutsourcedWorkRecord" WHERE id=$1 AND "orgId"=$2 FOR UPDATE',record.id,orgId);
  source = await loadExpenseEditorSource(tx,orgId,kind,id);
  if(source.document?.bankReconciled)return fail(409,'EXPENSE_ALREADY_RECONCILED');
  if ((source.document && source.document.version !== body.version) || expenseEditorRevision(source) !== body.revision) return fail(409,'EXPENSE_REQUEST_CHANGED');
  // Transaction-local capability, verified by database guards and a deferred
  // check that the matching audit event was saved before commit.
  await tx.$queryRaw`SELECT set_config('baro.expense_editor_org',${String(orgId)},true),set_config('baro.expense_editor_actor',${String(actorId)},true),set_config('baro.expense_editor_key',${key},true),set_config('baro.expense_editor_timezone',${env.BUSINESS_TIME_ZONE || 'Asia/Seoul'},true)`;
  const before = snapshot(source);
  if(source.document&&body.requestDate!==undefined&&body.requestDate!==source.document.requestDate)return fail(409,'EXPENSE_REQUEST_DATE_LOCKED');
  const requestDate = validateCostDate(source.document?.requestDate||source.costs[0]?.transactionDate||(body.automaticRequestDate?expenseApplicationDate():body.requestDate??expenseApplicationDate())), remark = typeof body.remark==='string' ? body.remark.trim() : '';
  if(remark.length>500)return fail(400,'INVALID_EXPENSE_REMARK');
  assertManagedDate(requestDate,(await loadManagementPeriod(tx,orgId)).startDate);
  const payeeIds=expensePayeeIds(body);
  if (!Array.isArray(body.items) || !body.items.length || body.items.length>50 || body.items.some((item: any)=>!item || typeof item!=='object' || Array.isArray(item))) return fail(400,'INVALID_EXPENSE_REQUEST_HEADER');
  const byId = new Map(source.costs.map((cost: any)=>[cost.id,cost]));
  const itemIds = body.items.map((item: any)=>item?.itemId).filter(Boolean);
  if (new Set(itemIds).size!==itemIds.length || itemIds.some((itemId: string)=>!byId.has(itemId))) return fail(400,'INVALID_EXPENSE_REQUEST_ITEM');
  if (source.record && body.items.filter((item: any)=>item.sourceRecordId===source.record.id).length!==1) return fail(400,'LEGACY_SOURCE_REQUIRED');
  for (const item of body.items) {
    const expected = item.itemId ? (byId.get(item.itemId) as any)?.outsourcedWorkRecord?.id : source.record?.id;
    if (item.sourceRecordId != null && item.sourceRecordId!==expected) return fail(400,'INVALID_REQUEST_REFERENCE');
  }
  // Release only the document/payee composite FK inside this transaction; IDs and source FKs remain intact.
  if (source.document) await tx.partnerTransactionCost.updateMany({ where: { expenseRequestId: source.document.id, orgId }, data: { expenseRequestId: null, expenseRequestLine: null } });
  await requirePayeeBankAccount(tx,orgId,payeeIds.partnerOrgId,payeeIds.payeeEmployeeId);
  const approval = await resolveExpenseApproval(tx,orgId,source.document?.createdByEmployeeId || actorId,body.items,body.approvalSelection);
  const approvers = approval.ids;
  if(source.document&&body.managementNumber!==undefined&&normalizeDocumentNumber(body.managementNumber)!==(source.document.managementNumber||legacyExpenseNumber(source.document.id)))return fail(409,'DOCUMENT_NUMBER_LOCKED');
  if(!source.document&&normalizeDocumentNumber(body.managementNumber))return fail(400,'DOCUMENT_NUMBER_AUTOMATIC');
  const managementNumber=source.document?.managementNumber||(!source.document?await allocateDocumentNumber(tx,orgId,'EXP',requestDate,body.managementNumber):null);
  const header = { remark, requestDate, ...payeeIds,payeeEmployeeId:payeeIds.payeeEmployeeId??null, updatedAt: new Date(), updatedByEmployeeId: actorId,
    currency: body.items.every((item: any)=>item.currency===body.items[0].currency) ? body.items[0].currency : null };
  const document = source.document ? await tx.expenseRequest.update({ where: { id: source.document.id }, data: { ...header, version: { increment: 1 } } }) :
    await tx.expenseRequest.create({ data: { ...header, orgId, managementNumber, createdByEmployeeId: actorId, clientKey: body.clientKey, submissionHash: inputHash } });
  await replaceExpenseApprovers(tx,orgId,document.id,approvers,source.document?.approvalSteps || []);
  const assignmentPlanIds: number[] = [];
  for (const [index,item] of body.items.entries()) {
    const cost: any = item.itemId ? byId.get(item.itemId) : null;
    const record = cost?.outsourcedWorkRecord || (source.record && item.sourceRecordId===source.record.id ? source.record : null);
    const input = { ...item, transactionDate: requestDate, ...payeeIds, clientKey: `${body.clientKey}-${index+1}` };
    let saved;
    try { saved = await registerTransactionRequest(tx,orgId,actorId,input,appendQuantityRemark,true,{cost,record,request:{id:document.id,line:index+1}}); }
    catch(error: any){error.expenseLine=index+1;error.message=`EXPENSE_LINE:${index+1}:${error.message}`;throw error;}
    if (saved.outsourcedWorkRecord) assignmentPlanIds.push(saved.outsourcedWorkRecord.assignmentPlanId);
  }
  const removed = source.costs.filter((cost: any)=>!itemIds.includes(cost.id));
  // Removing an expense line never removes its original production record or shared work-log group.
  for (const cost of removed) await tx.partnerTransactionCost.delete({ where: { id: cost.id } });
  const after = await loadExpenseEditorSource(tx,orgId,'request',String(document.id));
  await tx.expenseRequestAudit.create({ data: { orgId, requestId: document.id, actorId, version: document.version,
    action: source.document ? 'UPDATE' : 'CREATE', clientKey:key, inputHash, beforeSnapshot: before, afterSnapshot:snapshot({...after,approvalPolicy:approval.policy}) } });
  return { requestId: document.id, assignmentPlanIds: [...new Set(assignmentPlanIds)] };
}

export function registerExpenseEditorRoutes(app: any, db: any, gates: any) {
  const path = '/expense-request-editor/:kind/:id';
  app.get('/expense-approval-settings',async(req:any,res:any)=>{
    const access=await gates.requireOrgRole(req,res,{allowedRoles:['ADMIN','OPERATOR','ACCOUNTANT']});if(!access)return;
    const actorId=gates.actorId();if(!actorId)return res.status(403).json({error:'ACTIVE_EMPLOYEE_REQUIRED'});
    const orgId=access.organization.id;
    const drafter=await db.employee.findFirst({where:{id:actorId,orgId,status:'ACTIVE'},select:{id:true,name:true,orgRole:true,gradeId:true}});
    if(!drafter)return res.status(403).json({error:'ACTIVE_EMPLOYEE_REQUIRED'});
    const setting=await db.systemSetting.findUnique({where:{key:approvalSettingKey(orgId)}});
    const candidates=await db.employee.findMany({where:{orgId,status:'ACTIVE',orgRole:{in:EXPENSE_APPROVAL_ROLES}},select:{id:true,name:true,orgRole:true,gradeId:true},orderBy:[{name:'asc'},{id:'asc'}]});
    res.json({drafter,candidates,settings:{limits:setting?.value?.limits||defaultApprovalSettings().limits},configured:!!setting,canEdit:drafter.orgRole==='ADMIN'});
  });
  app.put('/expense-approval-settings',async(req:any,res:any)=>{
    const access=await gates.requireOrgRole(req,res,{allowedRoles:['ADMIN']});if(!access)return;
    const actorId=gates.actorId();if(!actorId)return res.status(403).json({error:'ACTIVE_EMPLOYEE_REQUIRED'});
    await db.$transaction(async(tx:any)=>{
      const orgId=access.organization.id;
      const actor=await tx.employee.findFirst({where:{id:actorId,orgId,status:'ACTIVE',orgRole:'ADMIN'}});
      if(!actor)throw createHttpError(403,'ACTIVE_EMPLOYEE_REQUIRED');
      const value=await validateApprovalSettings(tx,orgId,req.body);
      const data={value,updatedByEmployeeId:actorId};
      await tx.systemSetting.upsert({where:{key:approvalSettingKey(orgId)},create:{key:approvalSettingKey(orgId),...data},update:data});
    },{isolationLevel:'Serializable'});
    res.json({ok:true});
  });
  app.post('/expense-approval-preview',async(req:any,res:any)=>{
    const access=await gates.requireOrgRole(req,res,{allowedRoles:['ADMIN','OPERATOR','ACCOUNTANT']});if(!access)return;
    const actorId=gates.actorId();if(!actorId)return res.status(403).json({error:'ACTIVE_EMPLOYEE_REQUIRED'});
    let drafterId=actorId;
    if(req.body?.sourceKind&&req.body?.sourceId){const source=await loadExpenseEditorSource(db,access.organization.id,req.body.sourceKind,String(req.body.sourceId));drafterId=source.document?.createdByEmployeeId||actorId;}
    const approval=await resolveExpenseApproval(db,access.organization.id,drafterId,req.body?.items,req.body?.selection,true);
    res.json(approval);
  });
  app.get(`${path}/history`,async(req: any,res: any)=>{
    const access = await gates.requireOrgRole(req,res,{allowedRoles:['ADMIN','OPERATOR','ACCOUNTANT']}); if(!access)return;
    const source = await loadExpenseEditorSource(db,access.organization.id,req.params.kind,req.params.id);
    if(!source.document)return res.json([]);
    const beforeVersion = req.query.beforeVersion == null ? undefined : numericId(String(req.query.beforeVersion));
    res.json(await db.expenseRequestAudit.findMany({where:{orgId:access.organization.id,requestId:source.document.id,
      ...(beforeVersion ? {version:{lt:beforeVersion}} : {})},orderBy:{version:'desc'},take:50,
      select:{id:true,version:true,action:true,createdAt:true,actor:{select:{id:true,name:true}},beforeSnapshot:true,afterSnapshot:true}}));
  });
  app.get(path,async(req: any,res: any)=>{
    const access = await gates.requireOrgRole(req,res,{allowedRoles:['ADMIN','OPERATOR','ACCOUNTANT']}); if(!access)return;
    const source = await loadExpenseEditorSource(db,access.organization.id,req.params.kind,req.params.id);
    assertManagedDate(expenseEditorForm(source).requestDate,(await loadManagementPeriod(db,access.organization.id)).startDate);
    const result:any=expenseEditorForm(source);
    if(source.document){
      const audit=await db.expenseRequestAudit.findFirst({where:{orgId:access.organization.id,requestId:source.document.id,version:source.document.version},orderBy:{id:'desc'}});
      const policy=audit?.afterSnapshot?.approvalPolicy;
      result.approvalSelection=policy?.selection|| (policy?.config?{seniorEmployeeId:policy.config.seniorEmployeeId||null,leadEmployeeId:policy.config.leadEmployeeId||null,adminEmployeeId:policy.config.adminEmployeeId||null,...Object.fromEntries((policy.skipped||[]).flatMap((key:string)=>[[`${key}Vacant`,true],[`${key}EmployeeId`,null]]))}:null);
    }
    res.json(result);
  });
  app.put(path,async(req: any,res: any)=>{
    const access = await gates.requireOrgRole(req,res,{allowedRoles:['ADMIN','OPERATOR','ACCOUNTANT']}); if(!access)return;
    const actorId = gates.actorId(); if(!actorId)return res.status(403).json({error:'ACTIVE_EMPLOYEE_REQUIRED'});
    let result;
    try {
      result = await db.$transaction((tx: any)=>saveExpenseEditor(tx,access.organization.id,actorId,req.params.kind,req.params.id,req.body,gates.appendQuantityRemark),{isolationLevel:'Serializable',timeout:60000});
    } catch(error) {
      const conflict = (error as any)?.code==='P2034' || ['40001','40P01'].includes((error as any)?.meta?.code);
      if(conflict)return res.status(409).json({error:'EXPENSE_REQUEST_CHANGED'});
      throw error;
    }
    if(result.assignmentPlanIds.length) await gates.syncProduction?.(access.organization.id,result.assignmentPlanIds);
    res.json(result);
  });
}
